/**
 * Entity Validation Lambda
 *
 * Validates entity data against Zod schemas from content-pipeline.
 * Used by the staging editor to validate entities before saving.
 *
 * Authentication: Requires valid Cognito JWT with 'dm' group membership.
 */

import { z } from 'zod';
import {
  characterSchema,
  enemySchema,
  locationSchema,
  factionSchema,
  itemSchema,
} from '@dndblog/content-pipeline/src/schemas/campaign.js';

// Map entity types to their Zod schemas
const schemas: Record<string, z.ZodSchema> = {
  character: characterSchema,
  enemy: enemySchema,
  location: locationSchema,
  faction: factionSchema,
  item: itemSchema,
};

// ==========================================================================
// JWT Validation (Cognito)
// ==========================================================================

interface JwtPayload {
  sub?: string;
  iss?: string;
  aud?: string;
  exp?: number;
  'cognito:groups'?: string[];
}

interface AuthResult {
  valid: boolean;
  error?: string;
  roles?: {
    isDm: boolean;
    isPlayer: boolean;
  };
  userId?: string;
}

function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return payload;
  } catch {
    return null;
  }
}

function validateAuth(event: LambdaEvent): AuthResult {
  // Get Authorization header
  const authHeader =
    event.headers?.authorization || event.headers?.Authorization;

  if (!authHeader) {
    return { valid: false, error: 'Missing Authorization header' };
  }

  // Extract Bearer token
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { valid: false, error: 'Invalid Authorization header format' };
  }

  const token = match[1];
  const payload = decodeJwt(token);

  if (!payload) {
    return { valid: false, error: 'Invalid token format' };
  }

  // Check expiration
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    return { valid: false, error: 'Token expired' };
  }

  // Check issuer matches our User Pool
  const region = process.env.AWS_REGION || 'us-east-1';
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const expectedIssuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;

  if (payload.iss !== expectedIssuer) {
    return { valid: false, error: 'Invalid token issuer' };
  }

  // Check audience (client ID) for id_token
  const clientId = process.env.COGNITO_CLIENT_ID;
  if (payload.aud && payload.aud !== clientId) {
    return { valid: false, error: 'Invalid token audience' };
  }

  // Extract roles from groups
  const groups = payload['cognito:groups'] || [];
  const isDm = groups.includes('dm');
  const isPlayer = groups.includes('player');

  return {
    valid: true,
    roles: { isDm, isPlayer },
    userId: payload.sub,
  };
}

// Get CORS origin (allows localhost for dev)
function getCorsOrigin(event: LambdaEvent): string {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const allowed = process.env.ALLOWED_ORIGIN || '';
  if (origin.startsWith('http://localhost:')) {
    return origin;
  }
  return allowed;
}

interface ValidationRequest {
  entityType: string;
  data: Record<string, unknown>;
}

interface ValidationError {
  path: string;
  message: string;
  code?: string;
}

interface ValidationResponse {
  valid: boolean;
  errors?: ValidationError[];
}

interface LambdaEvent {
  requestContext?: {
    http?: {
      method: string;
    };
  };
  headers?: Record<string, string>;
  body?: string;
}

export const handler = async (event: LambdaEvent) => {
  const corsOrigin = getCorsOrigin(event);
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle CORS preflight
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    // Validate authentication - requires DM role
    const auth = validateAuth(event);
    if (!auth.valid) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: auth.error || 'Authentication failed' }),
      };
    }

    if (!auth.roles?.isDm) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'DM access required' }),
      };
    }

    // Parse request body
    const body: ValidationRequest = JSON.parse(event.body || '{}');
    const { entityType, data } = body;

    if (!entityType) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'entityType is required' }),
      };
    }

    if (!data || typeof data !== 'object') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'data object is required' }),
      };
    }

    // Get the appropriate schema
    const schema = schemas[entityType];
    if (!schema) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: `Unknown entity type: ${entityType}. Valid types: ${Object.keys(schemas).join(', ')}`,
        }),
      };
    }

    // Validate data against schema
    const result = schema.safeParse(data);

    if (result.success) {
      const response: ValidationResponse = { valid: true };
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(response),
      };
    }

    // Format validation errors with clear paths
    // Zod 4 uses .issues instead of .errors
    const errors: ValidationError[] = result.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
      message: issue.message,
      code: issue.code,
    }));

    const response: ValidationResponse = {
      valid: false,
      errors,
    };

    return {
      statusCode: 200, // Return 200 even for validation errors (not a server error)
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Validation error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
    };
  }
};
