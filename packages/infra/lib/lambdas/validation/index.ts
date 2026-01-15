/**
 * Entity Validation Lambda
 *
 * Validates entity data against Zod schemas from content-pipeline.
 * Used by the staging editor to validate entities before saving.
 */

import { z } from 'zod';
import {
  characterSchema,
  enemySchema,
  locationSchema,
  factionSchema,
  itemSchema,
} from '@dndblog/content-pipeline/src/schemas/campaign.js';

// AWS SDK types - available at runtime via Lambda
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

const ssmClient = new SSMClient({});

// Map entity types to their Zod schemas
const schemas: Record<string, z.ZodSchema> = {
  character: characterSchema,
  enemy: enemySchema,
  location: locationSchema,
  faction: factionSchema,
  item: itemSchema,
};

// Token caching
let cachedToken = '';
let tokenExpiry = 0;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }
  const result = await ssmClient.send(
    new GetParameterCommand({
      Name: process.env.TOKEN_PARAMETER_NAME,
      WithDecryption: true,
    })
  );
  cachedToken = result.Parameter?.Value || '';
  tokenExpiry = now + 5 * 60 * 1000; // Cache for 5 minutes
  return cachedToken;
}

// Get CORS origin (allows localhost for dev)
function getCorsOrigin(event: { headers?: Record<string, string> }): string {
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
    'Access-Control-Allow-Headers': 'Content-Type, X-DM-Token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle CORS preflight
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    // Validate authentication
    const providedToken =
      event.headers?.['x-dm-token'] || event.headers?.['X-DM-Token'];
    if (!providedToken) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Missing authentication token' }),
      };
    }

    const validToken = await getToken();
    if (providedToken !== validToken) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Invalid token' }),
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
