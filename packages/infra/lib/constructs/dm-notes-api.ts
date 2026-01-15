import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================================================
// Auth Configuration Types
// ==========================================================================

/**
 * Configuration for Cognito-based authentication (future migration path)
 * When enabled, the API will validate JWT tokens from Cognito User Pool
 * instead of simple SSM-stored tokens.
 */
export interface CognitoAuthConfig {
  /**
   * Whether to enable Cognito authentication
   * When false, uses simple token-based auth from SSM
   */
  enabled: boolean;

  /**
   * Cognito User Pool ID (required if enabled)
   * @example 'us-west-2_abc123'
   */
  userPoolId?: string;

  /**
   * Cognito User Pool Client ID (required if enabled)
   */
  userPoolClientId?: string;

  /**
   * Optional: Custom domain for the Cognito hosted UI
   * @example 'auth.yourdomain.com'
   */
  customDomain?: string;
}

export interface DmNotesApiProps {
  /**
   * The domain name for CORS configuration
   */
  allowedOrigin: string;

  /**
   * SSM parameter name storing the DM auth token
   * Used when Cognito auth is disabled (default behavior)
   * @default '/dndblog/dm-notes-token'
   */
  tokenParameterName?: string;

  /**
   * Optional Cognito authentication configuration
   * When provided and enabled, the API will use JWT validation instead of
   * simple token-based auth. This is the recommended production configuration.
   *
   * Migration path:
   * 1. Deploy with cognitoAuth: { enabled: false } (current behavior)
   * 2. Set up Cognito User Pool and obtain userPoolId/userPoolClientId
   * 3. Deploy with cognitoAuth: { enabled: true, userPoolId, userPoolClientId }
   * 4. Update frontend to use Cognito login flow
   *
   * @default undefined (uses simple token auth)
   */
  cognitoAuth?: CognitoAuthConfig;
}

export class DmNotesApi extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly api: apigateway.HttpApi;
  public readonly apiUrl: string;

  /**
   * Optional Cognito User Pool (only created if cognitoAuth.enabled is true)
   * Use this to integrate with other services or configure additional settings
   */
  public readonly userPool?: cognito.IUserPool;

  /**
   * Optional Cognito User Pool Client (only created if cognitoAuth.enabled is true)
   */
  public readonly userPoolClient?: cognito.IUserPoolClient;

  constructor(scope: Construct, id: string, props: DmNotesApiProps) {
    super(scope, id);

    const tokenParameterName = props.tokenParameterName ?? '/dndblog/dm-notes-token';

    // S3 bucket for DM notes (private, encrypted)
    // CORS allows direct browser uploads via presigned URLs
    this.bucket = new s3.Bucket(this, 'NotesBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          noncurrentVersionExpiration: cdk.Duration.days(30),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedOrigins: [props.allowedOrigin, 'http://localhost:*'],
          allowedHeaders: ['*'],
          maxAge: 3600,
        },
      ],
    });

    // ==========================================================================
    // Cognito User Pool (Optional - scaffold for future migration)
    // ==========================================================================
    //
    // Migration from token-based auth to Cognito:
    // 1. Set cognitoAuth.enabled = true in props
    // 2. The User Pool will be created automatically
    // 3. Add users via AWS Console or Cognito APIs
    // 4. Update frontend to use Amplify Auth or aws-amplify
    // 5. JWT tokens will be validated instead of SSM tokens
    //
    // Benefits of Cognito:
    // - User management (sign-up, password reset, MFA)
    // - OAuth2/OIDC compliance
    // - Integration with social providers
    // - Fine-grained access control with groups/roles
    //
    // ==========================================================================

    const cognitoEnabled = props.cognitoAuth?.enabled === true;

    if (cognitoEnabled) {
      // Create or reference existing User Pool
      if (props.cognitoAuth?.userPoolId) {
        // Use existing User Pool (e.g., shared across environments)
        this.userPool = cognito.UserPool.fromUserPoolId(
          this, 'UserPool', props.cognitoAuth.userPoolId
        );
      } else {
        // Create new User Pool for DM Notes
        const newUserPool = new cognito.UserPool(this, 'UserPool', {
          userPoolName: 'DmNotesUserPool',
          selfSignUpEnabled: false, // Admin-only for DM access
          signInAliases: { email: true },
          autoVerify: { email: true },
          passwordPolicy: {
            minLength: 12,
            requireLowercase: true,
            requireUppercase: true,
            requireDigits: true,
            requireSymbols: false,
          },
          accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
          removalPolicy: cdk.RemovalPolicy.RETAIN,
          // MFA configuration (recommended for production)
          mfa: cognito.Mfa.OPTIONAL,
          mfaSecondFactor: {
            sms: false,
            otp: true, // TOTP apps like Google Authenticator
          },
        });
        this.userPool = newUserPool;

        // Create User Pool Groups for role-based access
        new cognito.CfnUserPoolGroup(this, 'DmGroup', {
          userPoolId: newUserPool.userPoolId,
          groupName: 'dm',
          description: 'Dungeon Masters with full access to DM tools',
          precedence: 0, // Lower = higher priority
        });

        new cognito.CfnUserPoolGroup(this, 'PlayerGroup', {
          userPoolId: newUserPool.userPoolId,
          groupName: 'player',
          description: 'Players with access to player tools',
          precedence: 1,
        });
      }

      // Create or reference existing User Pool Client
      if (props.cognitoAuth?.userPoolClientId && this.userPool instanceof cognito.UserPool) {
        this.userPoolClient = cognito.UserPoolClient.fromUserPoolClientId(
          this, 'UserPoolClient', props.cognitoAuth.userPoolClientId
        );
      } else if (this.userPool instanceof cognito.UserPool) {
        this.userPoolClient = this.userPool.addClient('WebClient', {
          userPoolClientName: 'DmNotesWebClient',
          authFlows: {
            userPassword: true,
            userSrp: true,
          },
          oAuth: {
            flows: { authorizationCodeGrant: true },
            scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
            callbackUrls: [props.allowedOrigin + '/auth/callback', 'http://localhost:4321/auth/callback'],
            logoutUrls: [props.allowedOrigin, 'http://localhost:4321'],
          },
          accessTokenValidity: cdk.Duration.hours(1),
          idTokenValidity: cdk.Duration.hours(1),
          refreshTokenValidity: cdk.Duration.days(30),
        });
      }

      // Output User Pool details for frontend configuration
      new cdk.CfnOutput(this, 'UserPoolId', {
        value: this.userPool.userPoolId,
        description: 'Cognito User Pool ID for frontend configuration',
      });
      if (this.userPoolClient) {
        new cdk.CfnOutput(this, 'UserPoolClientId', {
          value: this.userPoolClient.userPoolClientId,
          description: 'Cognito User Pool Client ID for frontend configuration',
        });
      }
    }

    // ==========================================================================
    // Shared Auth Helper Code (inlined into each Lambda)
    // ==========================================================================
    //
    // This auth helper supports both token-based and JWT-based authentication.
    // The AUTH_MODE environment variable controls which mode is used:
    // - 'token': Validates against SSM-stored token (default, current behavior)
    // - 'cognito': Validates JWT tokens from Cognito User Pool
    //
    // The helper is designed to be drop-in replaceable, so migrating to Cognito
    // requires only changing the AUTH_MODE environment variable.
    //
    // ==========================================================================

    const authHelperCode = `
// ==========================================================================
// Auth Helper - Supports both token and Cognito JWT authentication
// ==========================================================================

const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const ssmClient = new SSMClient({});

let cachedToken = null;
let tokenExpiry = 0;

// Get SSM token (for token-based auth)
async function getToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }
  const result = await ssmClient.send(new GetParameterCommand({
    Name: process.env.TOKEN_PARAMETER_NAME,
    WithDecryption: true,
  }));
  cachedToken = result.Parameter.Value;
  tokenExpiry = now + 5 * 60 * 1000;
  return cachedToken;
}

// Decode and validate JWT (for Cognito auth)
// Note: In production, you should verify the signature using the JWKS endpoint
// This is a simplified version for scaffolding purposes
function decodeJwt(token) {
  try {
    const [headerB64, payloadB64] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    return payload;
  } catch (e) {
    return null;
  }
}

// Validate JWT from Cognito
async function validateCognitoToken(token) {
  const payload = decodeJwt(token);
  if (!payload) return { valid: false, error: 'Invalid token format' };

  // Check expiration
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    return { valid: false, error: 'Token expired' };
  }

  // Check issuer matches our User Pool
  const expectedIssuer = 'https://cognito-idp.' + process.env.AWS_REGION + '.amazonaws.com/' + process.env.COGNITO_USER_POOL_ID;
  if (payload.iss !== expectedIssuer) {
    return { valid: false, error: 'Invalid issuer' };
  }

  // Check audience (client ID)
  if (payload.aud && payload.aud !== process.env.COGNITO_CLIENT_ID) {
    return { valid: false, error: 'Invalid audience' };
  }

  return { valid: true, payload };
}

// Main auth validation function - supports dual-mode auth (token AND Cognito)
// AUTH_MODE can be: 'token' (only token), 'cognito' (only JWT), 'dual' (both)
async function validateAuth(event) {
  const authMode = process.env.AUTH_MODE || 'token';

  // Try token auth first (always available in 'token' or 'dual' mode)
  if (authMode === 'token' || authMode === 'dual') {
    const providedToken = event.headers?.['x-dm-token'] || event.headers?.['X-DM-Token'];
    if (providedToken) {
      const validToken = await getToken();
      if (providedToken === validToken) {
        return {
          valid: true,
          authMethod: 'token',
          roles: { isDm: true, isPlayer: true } // Token auth grants full access
        };
      }
    }
  }

  // Try Cognito JWT (available in 'cognito' or 'dual' mode)
  if (authMode === 'cognito' || authMode === 'dual') {
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const jwt = authHeader.substring(7);
      const result = await validateCognitoToken(jwt);
      if (result.valid) {
        // Extract roles from Cognito groups
        const groups = result.payload['cognito:groups'] || [];
        const isDm = groups.includes('dm');
        const isPlayer = groups.includes('player') || isDm; // DMs are also players
        return {
          ...result,
          authMethod: 'cognito',
          roles: { isDm, isPlayer },
          userId: result.payload.sub,
          email: result.payload.email
        };
      }
    }
  }

  // No valid auth found
  return { valid: false, error: 'No valid authentication provided' };
}

// Helper to get CORS origin (allows localhost for dev)
function getCorsOrigin(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const allowed = process.env.ALLOWED_ORIGIN;
  if (origin.startsWith('http://localhost:')) {
    return origin;
  }
  return allowed;
}
`;

    // Environment variables for auth (varies based on mode)
    // When Cognito is enabled, use 'dual' mode so both token AND JWT auth work
    const authEnvironment: Record<string, string> = {
      AUTH_MODE: cognitoEnabled ? 'dual' : 'token',
      TOKEN_PARAMETER_NAME: tokenParameterName,
    };

    if (cognitoEnabled && this.userPool) {
      authEnvironment.COGNITO_USER_POOL_ID = this.userPool.userPoolId;
      if (this.userPoolClient) {
        authEnvironment.COGNITO_CLIENT_ID = this.userPoolClient.userPoolClientId;
      }
    }

    // Lambda function for generating pre-signed URLs
    const uploadUrlFunction = new lambda.Function(this, 'UploadUrlFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        BUCKET_NAME: this.bucket.bucketName,
        TOKEN_PARAMETER_NAME: tokenParameterName,
        ALLOWED_ORIGIN: props.allowedOrigin,
      },
      code: lambda.Code.fromInline(`
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

const s3Client = new S3Client({});
const ssmClient = new SSMClient({});

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  const result = await ssmClient.send(new GetParameterCommand({
    Name: process.env.TOKEN_PARAMETER_NAME,
    WithDecryption: true,
  }));

  cachedToken = result.Parameter.Value;
  tokenExpiry = now + 5 * 60 * 1000; // Cache for 5 minutes
  return cachedToken;
}

// Helper to get CORS origin (allows localhost for dev)
function getCorsOrigin(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const allowed = process.env.ALLOWED_ORIGIN;
  // Allow localhost for development
  if (origin.startsWith('http://localhost:')) {
    return origin;
  }
  return allowed;
}

exports.handler = async (event) => {
  const corsOrigin = getCorsOrigin(event);
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, X-DM-Token',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle CORS preflight
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Get token from header
    const providedToken = event.headers?.['x-dm-token'] || event.headers?.['X-DM-Token'];

    if (!providedToken) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Missing authentication token' }),
      };
    }

    // Validate token
    const validToken = await getToken();
    if (providedToken !== validToken) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Invalid token' }),
      };
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = event.queryStringParameters?.filename || \`session-\${timestamp}.md\`;
    const key = \`dm-notes/\${filename}\`;

    // Generate pre-signed URL (5 minute expiry)
    const command = new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: key,
      ContentType: 'text/markdown',
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        uploadUrl,
        key,
        expiresIn: 300,
      }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
      `),
    });

    // Grant Lambda permissions
    this.bucket.grantPut(uploadUrlFunction);

    // Grant SSM parameter read access
    uploadUrlFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        cdk.Stack.of(this).formatArn({
          service: 'ssm',
          resource: 'parameter',
          resourceName: tokenParameterName.replace(/^\//, ''),
        }),
      ],
    }));

    // SSM parameter for feature flag
    const featureFlagParameterName = '/dndblog/ai-review-enabled';

    // Lambda function for AI review via Bedrock (Claude Sonnet 4)
    // Reserved concurrency limits parallel invocations to prevent cost runaway
    const reviewFunction = new lambda.Function(this, 'ReviewFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      reservedConcurrentExecutions: 2, // Limit parallel invocations to control costs
      environment: {
        TOKEN_PARAMETER_NAME: tokenParameterName,
        FEATURE_FLAG_PARAMETER: featureFlagParameterName,
        ALLOWED_ORIGIN: props.allowedOrigin,
        BEDROCK_MODEL_ID: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
      },
      code: lambda.Code.fromInline(`
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

const bedrockClient = new BedrockRuntimeClient({});
const ssmClient = new SSMClient({});

let cachedToken = null;
let tokenExpiry = 0;
let cachedFeatureFlag = null;
let featureFlagExpiry = 0;

async function getToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }
  const result = await ssmClient.send(new GetParameterCommand({
    Name: process.env.TOKEN_PARAMETER_NAME,
    WithDecryption: true,
  }));
  cachedToken = result.Parameter.Value;
  tokenExpiry = now + 5 * 60 * 1000;
  return cachedToken;
}

async function isFeatureEnabled() {
  const now = Date.now();
  if (cachedFeatureFlag !== null && now < featureFlagExpiry) {
    return cachedFeatureFlag;
  }
  try {
    const result = await ssmClient.send(new GetParameterCommand({
      Name: process.env.FEATURE_FLAG_PARAMETER,
    }));
    cachedFeatureFlag = result.Parameter.Value === 'true';
  } catch (err) {
    // If parameter doesn't exist, default to DISABLED for safety
    cachedFeatureFlag = false;
  }
  featureFlagExpiry = now + 60 * 1000; // Cache for 1 minute
  return cachedFeatureFlag;
}

// Helper to get CORS origin (allows localhost for dev)
function getCorsOrigin(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const allowed = process.env.ALLOWED_ORIGIN;
  if (origin.startsWith('http://localhost:')) {
    return origin;
  }
  return allowed;
}

exports.handler = async (event) => {
  const corsOrigin = getCorsOrigin(event);
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, X-DM-Token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const providedToken = event.headers?.['x-dm-token'] || event.headers?.['X-DM-Token'];
    if (!providedToken) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Missing authentication token' }) };
    }

    const validToken = await getToken();
    if (providedToken !== validToken) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    // Check feature flag
    const enabled = await isFeatureEnabled();
    if (!enabled) {
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({ error: 'AI review is temporarily disabled', disabled: true }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const content = body.content || '';

    if (!content.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No content provided' }) };
    }

    // Claude Messages API format
    const bedrockPayload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1024,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: \`You are a helpful editor reviewing D&D session notes. Review the following notes and provide:
1. A quality score from 0-100
2. A list of suggestions for improvement (grammar, clarity, structure)
3. Whether the notes are ready to publish

Be concise. Format your response as JSON with fields: score (number), suggestions (array of strings), canPublish (boolean), summary (one sentence).

Notes to review:
\${content.substring(0, 8000)}

Respond with valid JSON only:\`
        }
      ]
    };

    const command = new InvokeModelCommand({
      modelId: process.env.BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(bedrockPayload),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Claude returns content as an array of content blocks
    const outputText = responseBody.content?.[0]?.text || '';

    // Try to parse the AI response as JSON
    let reviewResult;
    try {
      // Find JSON in the response
      const jsonMatch = outputText.match(/\\{[\\s\\S]*\\}/);
      if (jsonMatch) {
        reviewResult = JSON.parse(jsonMatch[0]);
      } else {
        reviewResult = { score: 70, suggestions: ['Unable to parse AI response'], canPublish: true, summary: outputText.substring(0, 200) };
      }
    } catch {
      reviewResult = { score: 70, suggestions: ['AI review completed but response was not structured'], canPublish: true, summary: outputText.substring(0, 200) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(reviewResult),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Review failed: ' + error.message }),
    };
  }
};
      `),
    });

    // Grant Bedrock permissions to review function (Claude Sonnet 4)
    reviewFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [
        'arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-20250514-v1:0',
        'arn:aws:bedrock:*:*:inference-profile/us.anthropic.claude-sonnet-4-20250514-v1:0',
      ],
    }));

    // Grant SSM parameter read access to review function
    reviewFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        cdk.Stack.of(this).formatArn({
          service: 'ssm',
          resource: 'parameter',
          resourceName: tokenParameterName.replace(/^\//, ''),
        }),
        cdk.Stack.of(this).formatArn({
          service: 'ssm',
          resource: 'parameter',
          resourceName: featureFlagParameterName.replace(/^\//, ''),
        }),
      ],
    }));

    // HTTP API Gateway with throttling to prevent abuse
    // CORS is handled by Lambda functions to allow dynamic origins (localhost for dev)
    this.api = new apigateway.HttpApi(this, 'Api', {
      apiName: 'DmNotesApi',
      // Note: corsPreflight intentionally omitted - Lambda functions handle CORS
      // This allows dynamic origin support (localhost:* for development)
    });

    // Add throttling to the default stage to prevent abuse
    // 10 requests per second burst, 5 sustained rate per second
    const defaultStage = this.api.defaultStage?.node.defaultChild as apigateway.CfnStage;
    if (defaultStage) {
      defaultStage.defaultRouteSettings = {
        throttlingBurstLimit: 10,
        throttlingRateLimit: 5,
      };
    }

    // Add upload-url route (OPTIONS for CORS preflight)
    this.api.addRoutes({
      path: '/upload-url',
      methods: [apigateway.HttpMethod.GET, apigateway.HttpMethod.OPTIONS],
      integration: new apigatewayIntegrations.HttpLambdaIntegration(
        'UploadUrlIntegration',
        uploadUrlFunction
      ),
    });

    // Add review route (OPTIONS for CORS preflight)
    this.api.addRoutes({
      path: '/review',
      methods: [apigateway.HttpMethod.POST, apigateway.HttpMethod.OPTIONS],
      integration: new apigatewayIntegrations.HttpLambdaIntegration(
        'ReviewIntegration',
        reviewFunction
      ),
    });

    this.apiUrl = this.api.apiEndpoint;

    // ==========================================================================
    // CloudWatch Alarms for Lambda Monitoring
    // ==========================================================================

    // Upload URL Function Alarms
    new cloudwatch.Alarm(this, 'UploadFunctionErrors', {
      alarmName: `${cdk.Names.uniqueId(this)}-upload-function-errors`,
      alarmDescription: 'DM Notes upload-url function errors',
      metric: uploadUrlFunction.metricErrors({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Review Function Alarms (more sensitive - uses Bedrock which can be slow/expensive)
    new cloudwatch.Alarm(this, 'ReviewFunctionErrors', {
      alarmName: `${cdk.Names.uniqueId(this)}-review-function-errors`,
      alarmDescription: 'DM Notes AI review function errors',
      metric: reviewFunction.metricErrors({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Review Function Duration Alarm (approaching timeout)
    // Function timeout is 60s, alarm at 45s to catch slow responses
    new cloudwatch.Alarm(this, 'ReviewFunctionDuration', {
      alarmName: `${cdk.Names.uniqueId(this)}-review-function-duration`,
      alarmDescription: 'DM Notes review function taking too long (approaching timeout)',
      metric: reviewFunction.metricDuration({
        statistic: 'Maximum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 45000, // 45 seconds (75% of 60s timeout)
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Review Function Throttles Alarm (hitting reserved concurrency limit)
    new cloudwatch.Alarm(this, 'ReviewFunctionThrottles', {
      alarmName: `${cdk.Names.uniqueId(this)}-review-function-throttles`,
      alarmDescription: 'DM Notes review function being throttled (high demand)',
      metric: reviewFunction.metricThrottles({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 3,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // ==========================================================================
    // Notes Browser Function - List, View, Delete notes
    // ==========================================================================

    const notesBrowserFunction = new lambda.Function(this, 'NotesBrowserFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        BUCKET_NAME: this.bucket.bucketName,
        TOKEN_PARAMETER_NAME: tokenParameterName,
        ALLOWED_ORIGIN: props.allowedOrigin,
        NOTES_PREFIX: 'dm-notes/',
      },
      code: lambda.Code.fromInline(`
const { S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

const s3Client = new S3Client({});
const ssmClient = new SSMClient({});

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }
  const result = await ssmClient.send(new GetParameterCommand({
    Name: process.env.TOKEN_PARAMETER_NAME,
    WithDecryption: true,
  }));
  cachedToken = result.Parameter.Value;
  tokenExpiry = now + 5 * 60 * 1000;
  return cachedToken;
}

function parseYamlFrontmatter(content) {
  const match = content.match(/^---\\n([\\s\\S]*?)\\n---/);
  if (!match) return {};
  const yaml = match[1];
  const result = {};
  yaml.split('\\n').forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();
      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Parse booleans
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      result[key] = value;
    }
  });
  return result;
}

// Helper to get CORS origin (allows localhost for dev)
function getCorsOrigin(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const allowed = process.env.ALLOWED_ORIGIN;
  if (origin.startsWith('http://localhost:')) {
    return origin;
  }
  return allowed;
}

exports.handler = async (event) => {
  const corsOrigin = getCorsOrigin(event);
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, X-DM-Token',
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const providedToken = event.headers?.['x-dm-token'] || event.headers?.['X-DM-Token'];
    if (!providedToken) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Missing authentication token' }) };
    }

    const validToken = await getToken();
    if (providedToken !== validToken) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    const method = event.requestContext?.http?.method;
    const path = event.rawPath || '';
    const keyParam = event.pathParameters?.key;

    // GET /notes - List all notes
    if (method === 'GET' && path === '/notes') {
      const listCommand = new ListObjectsV2Command({
        Bucket: process.env.BUCKET_NAME,
        Prefix: process.env.NOTES_PREFIX,
      });
      const listResult = await s3Client.send(listCommand);
      const objects = listResult.Contents || [];

      // Fetch metadata for each note (parse YAML frontmatter)
      const notes = await Promise.all(objects.map(async (obj) => {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: obj.Key,
          });
          const getResult = await s3Client.send(getCommand);
          const content = await getResult.Body.transformToString();
          const frontmatter = parseYamlFrontmatter(content);

          return {
            key: obj.Key,
            title: frontmatter.title || obj.Key.split('/').pop().replace('.md', ''),
            date: frontmatter.date || obj.LastModified?.toISOString().split('T')[0],
            draft: frontmatter.draft !== false,
            size: obj.Size,
            lastModified: obj.LastModified?.toISOString(),
          };
        } catch (err) {
          return {
            key: obj.Key,
            title: obj.Key.split('/').pop().replace('.md', ''),
            date: obj.LastModified?.toISOString().split('T')[0],
            draft: true,
            size: obj.Size,
            lastModified: obj.LastModified?.toISOString(),
            error: 'Failed to parse metadata',
          };
        }
      }));

      // Sort by date descending (newest first)
      notes.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ notes, count: notes.length }),
      };
    }

    // GET /notes/{key} - Get specific note content
    if (method === 'GET' && keyParam) {
      const key = decodeURIComponent(keyParam);
      // Security: validate key starts with notes prefix
      if (!key.startsWith(process.env.NOTES_PREFIX)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid key' }) };
      }

      const getCommand = new GetObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: key,
      });
      const result = await s3Client.send(getCommand);
      const content = await result.Body.transformToString();
      const frontmatter = parseYamlFrontmatter(content);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          key,
          content,
          metadata: {
            title: frontmatter.title,
            date: frontmatter.date,
            draft: frontmatter.draft,
          },
          size: result.ContentLength,
          lastModified: result.LastModified?.toISOString(),
        }),
      };
    }

    // DELETE /notes/{key} - Delete a note
    if (method === 'DELETE' && keyParam) {
      const key = decodeURIComponent(keyParam);
      // Security: validate key starts with notes prefix
      if (!key.startsWith(process.env.NOTES_PREFIX)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid key' }) };
      }

      const deleteCommand = new DeleteObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: key,
      });
      await s3Client.send(deleteCommand);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, key, message: 'Note deleted successfully' }),
      };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error: ' + error.message }),
    };
  }
};
      `),
    });

    // Grant permissions to notes browser function
    this.bucket.grantRead(notesBrowserFunction);
    this.bucket.grantDelete(notesBrowserFunction);

    // Grant SSM parameter read access
    notesBrowserFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        cdk.Stack.of(this).formatArn({
          service: 'ssm',
          resource: 'parameter',
          resourceName: tokenParameterName.replace(/^\//, ''),
        }),
      ],
    }));

    // Add notes browser routes (OPTIONS for CORS preflight)
    this.api.addRoutes({
      path: '/notes',
      methods: [apigateway.HttpMethod.GET, apigateway.HttpMethod.OPTIONS],
      integration: new apigatewayIntegrations.HttpLambdaIntegration(
        'NotesListIntegration',
        notesBrowserFunction
      ),
    });

    this.api.addRoutes({
      path: '/notes/{key+}',
      methods: [apigateway.HttpMethod.GET, apigateway.HttpMethod.DELETE, apigateway.HttpMethod.OPTIONS],
      integration: new apigatewayIntegrations.HttpLambdaIntegration(
        'NotesBrowserIntegration',
        notesBrowserFunction
      ),
    });

    // Notes Browser Function Alarm
    new cloudwatch.Alarm(this, 'NotesBrowserFunctionErrors', {
      alarmName: `${cdk.Names.uniqueId(this)}-notes-browser-errors`,
      alarmDescription: 'DM Notes browser function errors',
      metric: notesBrowserFunction.metricErrors({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // ==========================================================================
    // Entity Generator Function - AI-powered entity creation from natural language
    // ==========================================================================

    const generateEntityFunction = new lambda.Function(this, 'GenerateEntityFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(90), // Longer timeout for complex generation
      memorySize: 1024, // More memory = more CPU = faster SDK operations
      reservedConcurrentExecutions: 2, // Limit parallel invocations to control costs
      environment: {
        TOKEN_PARAMETER_NAME: tokenParameterName,
        ALLOWED_ORIGIN: props.allowedOrigin,
        // Using Claude Sonnet 4.5 via cross-region inference profile
        BEDROCK_MODEL_ID: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      },
      code: lambda.Code.fromInline(`
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

const bedrockClient = new BedrockRuntimeClient({});
const ssmClient = new SSMClient({});

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }
  const result = await ssmClient.send(new GetParameterCommand({
    Name: process.env.TOKEN_PARAMETER_NAME,
    WithDecryption: true,
  }));
  cachedToken = result.Parameter.Value;
  tokenExpiry = now + 5 * 60 * 1000;
  return cachedToken;
}

function getCorsOrigin(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const allowed = process.env.ALLOWED_ORIGIN;
  if (origin.startsWith('http://localhost:')) {
    return origin;
  }
  return allowed;
}

// Slugify a name for file naming
function slugify(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Entity generation prompt optimized for Claude Sonnet 4.5
const SYSTEM_PROMPT = \`You are a D&D 5e campaign wiki generator. Convert natural language into structured entity data for an Astro content collection.

Respond with ONLY valid JSON (no code blocks, no explanation):

{
  "entityType": "character" | "enemy" | "item" | "location" | "faction",
  "subtype": "<specific subtype>",
  "confidence": <0-100>,
  "frontmatter": { <schema fields> },
  "markdown": "<wiki-style content>",
  "slug": "<kebab-case>"
}

SCHEMAS:

CHARACTER (subtype: pc | npc | deity | historical)
- Required: name, type: "character", subtype
- Include: description, race, class, level, alignment, abilities[], tags[], relationships[]
- Optional: background, faction, location, ideals[], bonds[], flaws[]

ENEMY (subtype: boss | lieutenant | minion | creature | swarm | trap)
- Required: name, type: "enemy", subtype
- Include: description, cr (challenge rating as string), creatureType, baseMonster (SRD name), abilities[], tags[]
- Optional: faction, lair, territory[], customizations[], legendaryActions[]

ITEM (subtype: weapon | armor | artifact | consumable | quest | treasure | tool | wondrous)
- Required: name, type: "item", subtype
- Include: description, rarity, properties[], tags[]
- Optional: baseItem, attunement, currentOwner, location, charges, significance

LOCATION (subtype: plane | continent | region | city | town | village | dungeon | wilderness | building | room | landmark)
- Required: name, type: "location", subtype
- Include: description, tags[]
- Optional: parentLocation, climate, terrain, population, controlledBy, pointsOfInterest[], secrets[]

FACTION (subtype: cult | guild | government | military | religious | criminal | merchant | noble-house | adventuring-party | secret-society)
- Required: name, type: "faction", subtype
- Include: description, goals[], tags[]
- Optional: leader, headquarters, territory[], allies[], enemies[], methods[], symbol, motto

MARKDOWN STYLE (critical):
- Start with: # Entity Name
- Then a narrative intro paragraph (no header)
- Use ## for sections
- Write in natural, wiki-style prose—like a campaign journal entry
- NO excessive bold, NO ALL CAPS, NO lists of stats
- Use bullet points sparingly for key details
- Bold only for important proper nouns or key terms
- Keep it readable and engaging, not a data dump

EXAMPLE INPUT: "Grimjaw - orc warchief CR 5, leads the Bloodtusk clan, wields a greataxe called Bonecleaver"

EXAMPLE OUTPUT:
{
  "entityType": "enemy",
  "subtype": "boss",
  "confidence": 95,
  "frontmatter": {
    "name": "Grimjaw",
    "type": "enemy",
    "subtype": "boss",
    "status": "active",
    "description": "Orc warchief of the Bloodtusk clan",
    "baseMonster": "orc-war-chief",
    "cr": "5",
    "creatureType": "humanoid",
    "abilities": ["Greataxe mastery", "Battle cry", "Orcish fury"],
    "tags": ["orc", "boss", "warchief", "bloodtusk"]
  },
  "markdown": "# Grimjaw\\n\\nThe fearsome warchief of the Bloodtusk clan, Grimjaw has united the scattered orc tribes through sheer brutality and cunning. His massive frame is covered in ritual scars, each marking a chieftain he defeated in single combat.\\n\\n## Bonecleaver\\n\\nGrimjaw's greataxe, Bonecleaver, is a brutal weapon forged from the bones of a slain giant. The orcs believe it carries the giant's strength.\\n\\n## Tactics\\n\\nGrimjaw leads from the front, using his Battle Cry to inspire his warriors before charging into melee. He targets the strongest-looking enemy first to demoralize opponents.\\n\\n## The Bloodtusk Clan\\n\\nUnder Grimjaw's leadership, the Bloodtusks have grown from a minor tribe to a serious threat, raiding caravans and frontier settlements.",
  "slug": "grimjaw"
}\`;

exports.handler = async (event) => {
  const corsOrigin = getCorsOrigin(event);
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, X-DM-Token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const providedToken = event.headers?.['x-dm-token'] || event.headers?.['X-DM-Token'];
    if (!providedToken) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Missing authentication token' }) };
    }

    const validToken = await getToken();
    if (providedToken !== validToken) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const input = (body.input || '').trim();
    const hint = body.hint || null;

    if (!input) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No input provided' }) };
    }

    if (input.length > 2000) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Input too long (max 2000 characters)' }) };
    }

    const userPrompt = hint
      ? \`[Entity type hint: \${hint}]\\n\\n\${input}\`
      : input;

    // Claude Messages API format via Bedrock
    const bedrockPayload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4096,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    };

    const command = new InvokeModelCommand({
      modelId: process.env.BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(bedrockPayload),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Claude returns content[0].text directly
    const outputText = responseBody.content?.[0]?.text || '';

    if (!outputText) {
      console.error('Empty response from Claude:', JSON.stringify(responseBody, null, 2).substring(0, 500));
      return {
        statusCode: 422,
        headers,
        body: JSON.stringify({
          error: 'Empty response from model',
          debug: {
            hasContent: !!responseBody.content,
            contentLength: responseBody.content?.length,
            stopReason: responseBody.stop_reason,
            responseKeys: Object.keys(responseBody),
          },
        }),
      };
    }

    // Parse the AI response as JSON
    // Claude follows instructions well, so minimal sanitization needed
    let result;
    try {
      let jsonText = outputText.trim();

      // Remove markdown code blocks if present (shouldn't happen with good prompt)
      const codeBlockMatch = jsonText.match(/\`\`\`(?:json)?\\s*([\\s\\S]*?)\`\`\`/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
      }

      // Find JSON object if there's any surrounding text
      const jsonMatch = jsonText.match(/\\{[\\s\\S]*\\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in response');
      }

      result = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr.message);
      console.error('Raw output:', outputText.substring(0, 1000));
      return {
        statusCode: 422,
        headers,
        body: JSON.stringify({
          error: 'Failed to parse AI response: ' + parseErr.message,
          raw: outputText.substring(0, 1500),
        }),
      };
    }

    // Generate the full markdown content with frontmatter
    const yamlLines = ['---'];
    function addYamlField(obj, indent = '') {
      for (const [key, value] of Object.entries(obj)) {
        if (value === null || value === undefined) continue;
        if (Array.isArray(value)) {
          if (value.length === 0) {
            yamlLines.push(\`\${indent}\${key}: []\`);
          } else if (typeof value[0] === 'object') {
            yamlLines.push(\`\${indent}\${key}:\`);
            value.forEach(item => {
              const entries = Object.entries(item);
              if (entries.length > 0) {
                yamlLines.push(\`\${indent}  - \${entries[0][0]}: \${JSON.stringify(entries[0][1])}\`);
                entries.slice(1).forEach(([k, v]) => {
                  yamlLines.push(\`\${indent}    \${k}: \${JSON.stringify(v)}\`);
                });
              }
            });
          } else {
            yamlLines.push(\`\${indent}\${key}:\`);
            value.forEach(item => yamlLines.push(\`\${indent}  - \${JSON.stringify(item)}\`));
          }
        } else if (typeof value === 'object') {
          yamlLines.push(\`\${indent}\${key}:\`);
          addYamlField(value, indent + '  ');
        } else if (typeof value === 'string' && (value.includes(':') || value.includes('#') || value.includes("'") || value.includes('"'))) {
          yamlLines.push(\`\${indent}\${key}: "\${value.replace(/"/g, '\\\\"')}"\`);
        } else if (typeof value === 'string') {
          yamlLines.push(\`\${indent}\${key}: "\${value}"\`);
        } else {
          yamlLines.push(\`\${indent}\${key}: \${value}\`);
        }
      }
    }
    addYamlField(result.frontmatter || {});
    yamlLines.push('---');

    const fullContent = yamlLines.join('\\n') + '\\n\\n' + (result.markdown || '');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        entityType: result.entityType,
        subtype: result.subtype,
        confidence: result.confidence || 80,
        frontmatter: result.frontmatter,
        markdown: result.markdown,
        fullContent,
        slug: result.slug || slugify(result.frontmatter?.name || 'entity'),
        suggestions: result.suggestions || [],
      }),
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Generation failed: ' + error.message }),
    };
  }
};
      `),
    });

    // Grant Bedrock permissions to generate entity function (Claude Sonnet 4.5)
    generateEntityFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [
        // Claude Sonnet 4.5 foundation model
        'arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0',
        // Cross-region inference profile
        'arn:aws:bedrock:*:*:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      ],
    }));

    // Grant SSM parameter read access to generate entity function
    generateEntityFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        cdk.Stack.of(this).formatArn({
          service: 'ssm',
          resource: 'parameter',
          resourceName: tokenParameterName.replace(/^\//, ''),
        }),
      ],
    }));

    // Add generate-entity route
    this.api.addRoutes({
      path: '/generate-entity',
      methods: [apigateway.HttpMethod.POST, apigateway.HttpMethod.OPTIONS],
      integration: new apigatewayIntegrations.HttpLambdaIntegration(
        'GenerateEntityIntegration',
        generateEntityFunction
      ),
    });

    // Generate Entity Function Alarms
    new cloudwatch.Alarm(this, 'GenerateEntityFunctionErrors', {
      alarmName: `${cdk.Names.uniqueId(this)}-generate-entity-errors`,
      alarmDescription: 'DM Notes entity generator function errors',
      metric: generateEntityFunction.metricErrors({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'GenerateEntityFunctionDuration', {
      alarmName: `${cdk.Names.uniqueId(this)}-generate-entity-duration`,
      alarmDescription: 'DM Notes entity generator taking too long (approaching timeout)',
      metric: generateEntityFunction.metricDuration({
        statistic: 'Maximum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 70000, // 70 seconds (78% of 90s timeout)
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // ==========================================================================
    // Entity Staging Function - Branch and entity CRUD for staging workflow
    // ==========================================================================

    const stagingFunction = new lambda.Function(this, 'StagingFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        BUCKET_NAME: this.bucket.bucketName,
        TOKEN_PARAMETER_NAME: tokenParameterName,
        ALLOWED_ORIGIN: props.allowedOrigin,
        STAGING_PREFIX: 'staging/branches/',
      },
      code: lambda.Code.fromInline(`
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

const s3Client = new S3Client({});
const ssmClient = new SSMClient({});

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }
  const result = await ssmClient.send(new GetParameterCommand({
    Name: process.env.TOKEN_PARAMETER_NAME,
    WithDecryption: true,
  }));
  cachedToken = result.Parameter.Value;
  tokenExpiry = now + 5 * 60 * 1000;
  return cachedToken;
}

function getCorsOrigin(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const allowed = process.env.ALLOWED_ORIGIN;
  if (origin.startsWith('http://localhost:')) {
    return origin;
  }
  return allowed;
}

// Sanitize branch name to prevent path traversal
function sanitizeBranchName(name) {
  return name.replace(/[^a-z0-9-_]/gi, '-').toLowerCase().substring(0, 50);
}

// Get all branches
async function listBranches() {
  const prefix = process.env.STAGING_PREFIX;
  const result = await s3Client.send(new ListObjectsV2Command({
    Bucket: process.env.BUCKET_NAME,
    Prefix: prefix,
    Delimiter: '/',
  }));

  const branches = [];
  for (const cp of (result.CommonPrefixes || [])) {
    const branchName = cp.Prefix.replace(prefix, '').replace(/\\/$/, '');
    try {
      const metadata = await getBranchMetadata(branchName);
      branches.push(metadata);
    } catch (e) {
      // Branch exists but no metadata - create default
      branches.push({ name: branchName, displayName: branchName, entityCount: 0, status: 'draft' });
    }
  }
  return branches;
}

// Get branch metadata
async function getBranchMetadata(branchName) {
  const key = process.env.STAGING_PREFIX + branchName + '/_metadata.json';
  const result = await s3Client.send(new GetObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: key,
  }));
  const body = await result.Body.transformToString();
  return JSON.parse(body);
}

// Save branch metadata
async function saveBranchMetadata(branchName, metadata) {
  const key = process.env.STAGING_PREFIX + branchName + '/_metadata.json';
  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: key,
    Body: JSON.stringify(metadata, null, 2),
    ContentType: 'application/json',
  }));
}

// List entities in a branch
async function listEntities(branchName) {
  const prefix = process.env.STAGING_PREFIX + branchName + '/entities/';
  const result = await s3Client.send(new ListObjectsV2Command({
    Bucket: process.env.BUCKET_NAME,
    Prefix: prefix,
  }));

  const entities = [];
  for (const obj of (result.Contents || [])) {
    if (obj.Key.endsWith('.json')) {
      try {
        const entityResult = await s3Client.send(new GetObjectCommand({
          Bucket: process.env.BUCKET_NAME,
          Key: obj.Key,
        }));
        const body = await entityResult.Body.transformToString();
        entities.push(JSON.parse(body));
      } catch (e) {
        console.error('Error loading entity:', obj.Key, e);
      }
    }
  }
  return entities;
}

// Save entity to branch
async function saveEntity(branchName, entity) {
  const entityType = entity.entityType || 'unknown';
  const id = entity.id || crypto.randomUUID();
  entity.id = id;
  entity.updatedAt = new Date().toISOString();
  if (!entity.createdAt) entity.createdAt = entity.updatedAt;

  const key = process.env.STAGING_PREFIX + branchName + '/entities/' + entityType + '/' + entity.slug + '.json';
  entity.targetPath = 'packages/site/src/content/campaign/' + entityType + 's/' + entity.slug + '.md';

  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: key,
    Body: JSON.stringify(entity, null, 2),
    ContentType: 'application/json',
  }));

  // Update branch entity count
  try {
    const metadata = await getBranchMetadata(branchName);
    const entities = await listEntities(branchName);
    metadata.entityCount = entities.length;
    metadata.updatedAt = new Date().toISOString();
    await saveBranchMetadata(branchName, metadata);
  } catch (e) {
    console.error('Error updating branch metadata:', e);
  }

  return entity;
}

// Delete entity from branch
async function deleteEntity(branchName, entityType, slug) {
  const key = process.env.STAGING_PREFIX + branchName + '/entities/' + entityType + '/' + slug + '.json';
  await s3Client.send(new DeleteObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: key,
  }));

  // Update branch entity count
  try {
    const metadata = await getBranchMetadata(branchName);
    const entities = await listEntities(branchName);
    metadata.entityCount = entities.length;
    metadata.updatedAt = new Date().toISOString();
    await saveBranchMetadata(branchName, metadata);
  } catch (e) {
    console.error('Error updating branch metadata:', e);
  }
}

// Delete entire branch
async function deleteBranch(branchName) {
  const prefix = process.env.STAGING_PREFIX + branchName + '/';
  const result = await s3Client.send(new ListObjectsV2Command({
    Bucket: process.env.BUCKET_NAME,
    Prefix: prefix,
  }));

  for (const obj of (result.Contents || [])) {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: obj.Key,
    }));
  }
}

exports.handler = async (event) => {
  const corsOrigin = getCorsOrigin(event);
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, X-DM-Token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Validate token
    const providedToken = event.headers?.['x-dm-token'] || event.headers?.['X-DM-Token'];
    if (!providedToken) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Missing authentication token' }) };
    }
    const validToken = await getToken();
    if (providedToken !== validToken) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    const method = event.requestContext?.http?.method;
    const path = event.rawPath || '';

    // Route: GET /staging/branches
    if (path === '/staging/branches' && method === 'GET') {
      const branches = await listBranches();
      return { statusCode: 200, headers, body: JSON.stringify({ branches }) };
    }

    // Route: POST /staging/branches - Create new branch
    if (path === '/staging/branches' && method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const name = sanitizeBranchName(body.name || '');
      if (!name) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Branch name is required' }) };
      }

      const metadata = {
        name,
        displayName: body.displayName || name,
        description: body.description || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        entityCount: 0,
        status: 'draft',
        githubBranch: null,
        githubPrUrl: null,
      };

      await saveBranchMetadata(name, metadata);
      return { statusCode: 201, headers, body: JSON.stringify(metadata) };
    }

    // Route: GET /staging/branches/{name}
    const branchMatch = path.match(/^\\/staging\\/branches\\/([^/]+)$/);
    if (branchMatch && method === 'GET') {
      const branchName = sanitizeBranchName(branchMatch[1]);
      try {
        const metadata = await getBranchMetadata(branchName);
        const entities = await listEntities(branchName);
        return { statusCode: 200, headers, body: JSON.stringify({ ...metadata, entities }) };
      } catch (e) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Branch not found' }) };
      }
    }

    // Route: PUT /staging/branches/{name} - Update branch metadata
    if (branchMatch && method === 'PUT') {
      const branchName = sanitizeBranchName(branchMatch[1]);
      const body = JSON.parse(event.body || '{}');
      try {
        const metadata = await getBranchMetadata(branchName);
        Object.assign(metadata, {
          displayName: body.displayName || metadata.displayName,
          description: body.description !== undefined ? body.description : metadata.description,
          updatedAt: new Date().toISOString(),
        });
        await saveBranchMetadata(branchName, metadata);
        return { statusCode: 200, headers, body: JSON.stringify(metadata) };
      } catch (e) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Branch not found' }) };
      }
    }

    // Route: DELETE /staging/branches/{name}
    if (branchMatch && method === 'DELETE') {
      const branchName = sanitizeBranchName(branchMatch[1]);
      await deleteBranch(branchName);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // Route: POST /staging/branches/{name}/entities - Add entity
    const entityAddMatch = path.match(/^\\/staging\\/branches\\/([^/]+)\\/entities$/);
    if (entityAddMatch && method === 'POST') {
      const branchName = sanitizeBranchName(entityAddMatch[1]);
      const body = JSON.parse(event.body || '{}');

      if (!body.entityType || !body.slug) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'entityType and slug are required' }) };
      }

      const entity = await saveEntity(branchName, body);
      return { statusCode: 201, headers, body: JSON.stringify(entity) };
    }

    // Route: PUT /staging/branches/{name}/entities/{type}/{slug} - Update entity
    const entityUpdateMatch = path.match(/^\\/staging\\/branches\\/([^/]+)\\/entities\\/([^/]+)\\/([^/]+)$/);
    if (entityUpdateMatch && method === 'PUT') {
      const branchName = sanitizeBranchName(entityUpdateMatch[1]);
      const entityType = entityUpdateMatch[2];
      const slug = entityUpdateMatch[3];
      const body = JSON.parse(event.body || '{}');

      body.entityType = entityType;
      body.slug = slug;
      const entity = await saveEntity(branchName, body);
      return { statusCode: 200, headers, body: JSON.stringify(entity) };
    }

    // Route: DELETE /staging/branches/{name}/entities/{type}/{slug} - Delete entity
    if (entityUpdateMatch && method === 'DELETE') {
      const branchName = sanitizeBranchName(entityUpdateMatch[1]);
      const entityType = entityUpdateMatch[2];
      const slug = entityUpdateMatch[3];
      await deleteEntity(branchName, entityType, slug);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };

  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
      `),
    });

    // Grant S3 permissions to staging function
    this.bucket.grantReadWrite(stagingFunction);
    this.bucket.grantDelete(stagingFunction);

    // Grant SSM parameter read access
    stagingFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        cdk.Stack.of(this).formatArn({
          service: 'ssm',
          resource: 'parameter',
          resourceName: tokenParameterName.replace(/^\//, ''),
        }),
      ],
    }));

    // Add staging routes
    this.api.addRoutes({
      path: '/staging/branches',
      methods: [apigateway.HttpMethod.GET, apigateway.HttpMethod.POST, apigateway.HttpMethod.OPTIONS],
      integration: new apigatewayIntegrations.HttpLambdaIntegration(
        'StagingBranchesIntegration',
        stagingFunction
      ),
    });

    this.api.addRoutes({
      path: '/staging/branches/{name}',
      methods: [apigateway.HttpMethod.GET, apigateway.HttpMethod.PUT, apigateway.HttpMethod.DELETE, apigateway.HttpMethod.OPTIONS],
      integration: new apigatewayIntegrations.HttpLambdaIntegration(
        'StagingBranchIntegration',
        stagingFunction
      ),
    });

    this.api.addRoutes({
      path: '/staging/branches/{name}/entities',
      methods: [apigateway.HttpMethod.POST, apigateway.HttpMethod.OPTIONS],
      integration: new apigatewayIntegrations.HttpLambdaIntegration(
        'StagingEntitiesIntegration',
        stagingFunction
      ),
    });

    this.api.addRoutes({
      path: '/staging/branches/{name}/entities/{type}/{slug}',
      methods: [apigateway.HttpMethod.PUT, apigateway.HttpMethod.DELETE, apigateway.HttpMethod.OPTIONS],
      integration: new apigatewayIntegrations.HttpLambdaIntegration(
        'StagingEntityIntegration',
        stagingFunction
      ),
    });

    // Staging Function Alarm
    new cloudwatch.Alarm(this, 'StagingFunctionErrors', {
      alarmName: `${cdk.Names.uniqueId(this)}-staging-errors`,
      alarmDescription: 'Entity staging function errors',
      metric: stagingFunction.metricErrors({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // ==========================================================================
    // GitHub Publish Function - Publish staging branch to GitHub as a PR
    // ==========================================================================

    const githubPublishFunction = new lambda.Function(this, 'GitHubPublishFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: {
        BUCKET_NAME: this.bucket.bucketName,
        TOKEN_PARAMETER_NAME: tokenParameterName,
        GITHUB_PAT_PARAMETER_NAME: '/dndblog/github-pat',
        ALLOWED_ORIGIN: props.allowedOrigin,
        STAGING_PREFIX: 'staging/branches/',
        GITHUB_OWNER: 'lexicone42',
        GITHUB_REPO: 'dndblog',
        GITHUB_DEFAULT_BRANCH: 'main',
      },
      code: lambda.Code.fromInline(`
const { S3Client, GetObjectCommand, ListObjectsV2Command, PutObjectCommand } = require('@aws-sdk/client-s3');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const https = require('https');

const s3Client = new S3Client({});
const ssmClient = new SSMClient({});

let cachedToken = null;
let tokenExpiry = 0;
let cachedGitHubPat = null;
let gitHubPatExpiry = 0;

async function getToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) return cachedToken;
  const result = await ssmClient.send(new GetParameterCommand({
    Name: process.env.TOKEN_PARAMETER_NAME,
    WithDecryption: true,
  }));
  cachedToken = result.Parameter.Value;
  tokenExpiry = now + 5 * 60 * 1000;
  return cachedToken;
}

async function getGitHubPat() {
  const now = Date.now();
  if (cachedGitHubPat && now < gitHubPatExpiry) return cachedGitHubPat;
  const result = await ssmClient.send(new GetParameterCommand({
    Name: process.env.GITHUB_PAT_PARAMETER_NAME,
    WithDecryption: true,
  }));
  cachedGitHubPat = result.Parameter.Value;
  gitHubPatExpiry = now + 5 * 60 * 1000;
  return cachedGitHubPat;
}

function getCorsOrigin(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  if (origin.startsWith('http://localhost:')) return origin;
  return process.env.ALLOWED_ORIGIN;
}

// GitHub API helper
async function githubApi(method, path, body = null) {
  const pat = await getGitHubPat();
  const options = {
    hostname: 'api.github.com',
    port: 443,
    path: path,
    method: method,
    headers: {
      'Authorization': 'Bearer ' + pat,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'dndblog-staging-publisher',
      'Content-Type': 'application/json',
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          if (res.statusCode >= 400) {
            reject(new Error(json.message || 'GitHub API error: ' + res.statusCode));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error('Failed to parse GitHub response: ' + data.substring(0, 200)));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Get entities from S3 staging branch
async function getEntitiesFromStaging(branchName) {
  const prefix = process.env.STAGING_PREFIX + branchName + '/entities/';
  const result = await s3Client.send(new ListObjectsV2Command({
    Bucket: process.env.BUCKET_NAME,
    Prefix: prefix,
  }));

  const entities = [];
  for (const obj of (result.Contents || [])) {
    if (!obj.Key.endsWith('.json')) continue;
    const data = await s3Client.send(new GetObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: obj.Key,
    }));
    const body = await data.Body.transformToString();
    entities.push(JSON.parse(body));
  }
  return entities;
}

// Update staging branch metadata with GitHub info
async function updateBranchMetadata(branchName, githubBranch, prUrl) {
  const metaKey = process.env.STAGING_PREFIX + branchName + '/_metadata.json';
  let metadata;
  try {
    const data = await s3Client.send(new GetObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: metaKey,
    }));
    metadata = JSON.parse(await data.Body.transformToString());
  } catch (e) {
    metadata = { name: branchName, displayName: branchName };
  }

  metadata.status = 'published';
  metadata.githubBranch = githubBranch;
  metadata.githubPrUrl = prUrl;
  metadata.publishedAt = new Date().toISOString();

  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: metaKey,
    Body: JSON.stringify(metadata, null, 2),
    ContentType: 'application/json',
  }));
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': getCorsOrigin(event),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-DM-Token, Authorization',
  };

  // Handle CORS preflight
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    // Validate auth
    const token = await getToken();
    const providedToken = event.headers?.['x-dm-token'] || event.headers?.['X-DM-Token'];
    if (providedToken !== token) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    // Parse branch name from path: POST /staging/branches/{name}/publish
    const path = event.rawPath || event.requestContext?.http?.path || '';
    const match = path.match(/^\\/staging\\/branches\\/([^/]+)\\/publish$/);
    if (!match) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Invalid path' }) };
    }

    const stagingBranchName = match[1].replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
    const githubBranchName = 'staging/' + stagingBranchName;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const defaultBranch = process.env.GITHUB_DEFAULT_BRANCH;

    // Get entities from staging
    const entities = await getEntitiesFromStaging(stagingBranchName);
    if (entities.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No entities to publish' }) };
    }

    console.log('Publishing ' + entities.length + ' entities to GitHub branch: ' + githubBranchName);

    // 1. Get the SHA of the default branch
    const refData = await githubApi('GET', '/repos/' + owner + '/' + repo + '/git/ref/heads/' + defaultBranch);
    const baseSha = refData.object.sha;

    // 2. Create the new branch (or update if exists)
    try {
      await githubApi('POST', '/repos/' + owner + '/' + repo + '/git/refs', {
        ref: 'refs/heads/' + githubBranchName,
        sha: baseSha,
      });
    } catch (e) {
      if (e.message.includes('Reference already exists')) {
        // Update existing branch to latest main
        await githubApi('PATCH', '/repos/' + owner + '/' + repo + '/git/refs/heads/' + githubBranchName, {
          sha: baseSha,
          force: true,
        });
      } else {
        throw e;
      }
    }

    // 3. Create blobs and tree for all entity files
    const treeItems = [];
    for (const entity of entities) {
      const entityType = entity.entityType || entity.type || 'character';
      const slug = entity.slug || entity.id;
      const filePath = 'packages/site/src/content/entities/' + entityType + '/' + slug + '.md';

      // Create blob for the markdown content
      const content = entity.fullContent || '---\\nyaml: content\\n---\\n';
      const blobData = await githubApi('POST', '/repos/' + owner + '/' + repo + '/git/blobs', {
        content: Buffer.from(content).toString('base64'),
        encoding: 'base64',
      });

      treeItems.push({
        path: filePath,
        mode: '100644',
        type: 'blob',
        sha: blobData.sha,
      });
    }

    // 4. Get the base tree and create new tree
    const baseCommit = await githubApi('GET', '/repos/' + owner + '/' + repo + '/git/commits/' + baseSha);
    const newTree = await githubApi('POST', '/repos/' + owner + '/' + repo + '/git/trees', {
      base_tree: baseCommit.tree.sha,
      tree: treeItems,
    });

    // 5. Create commit
    const entityNames = entities.map(e => e.name || e.slug).join(', ');
    const commitMessage = 'Add staged entities: ' + entityNames + '\\n\\nPublished from staging branch: ' + stagingBranchName;
    const newCommit = await githubApi('POST', '/repos/' + owner + '/' + repo + '/git/commits', {
      message: commitMessage,
      tree: newTree.sha,
      parents: [baseSha],
    });

    // 6. Update branch ref to point to new commit
    await githubApi('PATCH', '/repos/' + owner + '/' + repo + '/git/refs/heads/' + githubBranchName, {
      sha: newCommit.sha,
    });

    // 7. Create or update pull request
    let prUrl;
    try {
      // Check for existing PR
      const existingPrs = await githubApi('GET', '/repos/' + owner + '/' + repo + '/pulls?head=' + owner + ':' + githubBranchName + '&state=open');
      if (existingPrs.length > 0) {
        prUrl = existingPrs[0].html_url;
        console.log('Using existing PR: ' + prUrl);
      } else {
        // Create new PR
        const prBody = '## Staged Entities\\n\\n' + entities.map(e => '- **' + (e.name || e.slug) + '** (' + (e.entityType || e.type) + ')').join('\\n') + '\\n\\n---\\nPublished from staging branch: ' + stagingBranchName;
        const pr = await githubApi('POST', '/repos/' + owner + '/' + repo + '/pulls', {
          title: 'Add entities from staging: ' + stagingBranchName,
          body: prBody,
          head: githubBranchName,
          base: defaultBranch,
        });
        prUrl = pr.html_url;
        console.log('Created PR: ' + prUrl);
      }
    } catch (e) {
      console.error('PR creation failed:', e.message);
      // Branch was created, just no PR
      prUrl = 'https://github.com/' + owner + '/' + repo + '/tree/' + githubBranchName;
    }

    // 8. Update staging branch metadata
    await updateBranchMetadata(stagingBranchName, githubBranchName, prUrl);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        githubBranch: githubBranchName,
        prUrl: prUrl,
        entitiesPublished: entities.length,
      }),
    };

  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
      `),
    });

    // Grant S3 permissions to GitHub publish function
    this.bucket.grantReadWrite(githubPublishFunction);

    // Grant SSM parameter read access for both tokens
    githubPublishFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        cdk.Stack.of(this).formatArn({
          service: 'ssm',
          resource: 'parameter',
          resourceName: tokenParameterName.replace(/^\//, ''),
        }),
        cdk.Stack.of(this).formatArn({
          service: 'ssm',
          resource: 'parameter',
          resourceName: 'dndblog/github-pat',
        }),
      ],
    }));

    // Add publish route
    this.api.addRoutes({
      path: '/staging/branches/{name}/publish',
      methods: [apigateway.HttpMethod.POST, apigateway.HttpMethod.OPTIONS],
      integration: new apigatewayIntegrations.HttpLambdaIntegration(
        'GitHubPublishIntegration',
        githubPublishFunction
      ),
    });

    // GitHub Publish Function Alarm
    new cloudwatch.Alarm(this, 'GitHubPublishFunctionErrors', {
      alarmName: `${cdk.Names.uniqueId(this)}-github-publish-errors`,
      alarmDescription: 'GitHub publish function errors',
      metric: githubPublishFunction.metricErrors({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // ==========================================================================
    // Entity Validation Function - Zod schema validation for staged entities
    // ==========================================================================
    //
    // Uses NodejsFunction to bundle Zod schemas from content-pipeline.
    // This enables the staging editor to validate entities before saving.
    //
    // ==========================================================================

    const validationFunction = new lambdaNodejs.NodejsFunction(this, 'ValidationFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../lambdas/validation/index.ts'),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        TOKEN_PARAMETER_NAME: tokenParameterName,
        ALLOWED_ORIGIN: props.allowedOrigin,
      },
      bundling: {
        // Include Zod and related dependencies
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
    });

    // Grant SSM parameter read access to validation function
    validationFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        cdk.Stack.of(this).formatArn({
          service: 'ssm',
          resource: 'parameter',
          resourceName: tokenParameterName.replace(/^\//, ''),
        }),
      ],
    }));

    // Add validation route
    this.api.addRoutes({
      path: '/staging/validate',
      methods: [apigateway.HttpMethod.POST, apigateway.HttpMethod.OPTIONS],
      integration: new apigatewayIntegrations.HttpLambdaIntegration(
        'ValidationIntegration',
        validationFunction
      ),
    });

    // Validation Function Alarm
    new cloudwatch.Alarm(this, 'ValidationFunctionErrors', {
      alarmName: `${cdk.Names.uniqueId(this)}-validation-errors`,
      alarmDescription: 'Entity validation function errors',
      metric: validationFunction.metricErrors({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }
}
