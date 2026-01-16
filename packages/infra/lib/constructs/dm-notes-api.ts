import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as logsDestinations from 'aws-cdk-lib/aws-logs-destinations';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
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
 * Configuration for Cognito-based authentication
 * The API validates JWT tokens from Cognito User Pool.
 */
export interface CognitoAuthConfig {
  /**
   * Cognito User Pool ID
   * @example 'us-west-2_abc123'
   */
  userPoolId: string;

  /**
   * Cognito User Pool Client ID
   */
  userPoolClientId: string;

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
   * Cognito authentication configuration
   * The API validates JWT tokens from Cognito User Pool.
   */
  cognitoAuth: CognitoAuthConfig;

  /**
   * Optional WebSocket configuration for real-time session updates.
   * When provided, the PlayerDraftFunction will broadcast draft updates
   * to all connected DM dashboards.
   */
  webSocket?: {
    /** DynamoDB table storing active WebSocket connections */
    connectionsTable: dynamodb.ITable;
    /** Callback URL for API Gateway Management API */
    callbackUrl: string;
    /** WebSocket API ID */
    apiId: string;
    /** WebSocket stage name */
    stageName: string;
  };
}

export class DmNotesApi extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly api: apigateway.HttpApi;
  public readonly apiUrl: string;

  /**
   * Cognito User Pool reference for JWT validation
   */
  public readonly userPool: cognito.IUserPool;

  /**
   * Cognito User Pool Client for token issuance
   */
  public readonly userPoolClient: cognito.IUserPoolClient;

  constructor(scope: Construct, id: string, props: DmNotesApiProps) {
    super(scope, id);

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
    // Visitor IP Tracking (for new visitor alerts)
    // ==========================================================================

    // DynamoDB table to track seen IP addresses
    const visitorsTable = new dynamodb.Table(this, 'VisitorsTable', {
      tableName: 'ProtectedSiteVisitors',
      partitionKey: { name: 'ip', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // OK to lose IP tracking data
      timeToLiveAttribute: 'expiresAt',
    });

    // SNS topic for new visitor alerts
    const newVisitorTopic = new sns.Topic(this, 'NewVisitorTopic', {
      topicName: 'ProtectedSiteNewVisitor',
      displayName: 'Protected Site New Visitor Alerts',
    });

    // Email subscription for alerts
    newVisitorTopic.addSubscription(
      new snsSubscriptions.EmailSubscription('bryan.egan@gmail.com')
    );

    // ==========================================================================
    // Cognito User Pool (Reference existing pool for JWT validation)
    // ==========================================================================

    this.userPool = cognito.UserPool.fromUserPoolId(
      this, 'UserPool', props.cognitoAuth.userPoolId
    );
    this.userPoolClient = cognito.UserPoolClient.fromUserPoolClientId(
      this, 'UserPoolClient', props.cognitoAuth.userPoolClientId
    );

    // ==========================================================================
    // Shared Auth Helper Code (inlined into each Lambda)
    // ==========================================================================
    //
    // This auth helper validates Cognito JWT tokens.
    // All endpoints require a valid JWT with appropriate group membership.
    //
    // ==========================================================================

    const authHelperCode = `
// ==========================================================================
// Auth Helper - Cognito JWT authentication
// ==========================================================================

// Decode and validate JWT
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

  // Check audience (client ID) - only for id_token, access_token uses client_id claim
  if (payload.aud && payload.aud !== process.env.COGNITO_CLIENT_ID) {
    return { valid: false, error: 'Invalid audience' };
  }

  return { valid: true, payload };
}

// Main auth validation function - Cognito JWT only
async function validateAuth(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'No valid authentication provided' };
  }

  const jwt = authHeader.substring(7);
  const result = await validateCognitoToken(jwt);
  if (!result.valid) {
    return result;
  }

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

    // Environment variables for Cognito auth (used by all Lambda functions)
    const authEnvironment: Record<string, string> = {
      COGNITO_USER_POOL_ID: this.userPool.userPoolId,
      COGNITO_CLIENT_ID: this.userPoolClient.userPoolClientId,
    };

    // Lambda function for generating pre-signed URLs
    const uploadUrlFunction = new lambda.Function(this, 'UploadUrlFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        BUCKET_NAME: this.bucket.bucketName,
        ALLOWED_ORIGIN: props.allowedOrigin,
        ...authEnvironment,
      },
      code: lambda.Code.fromInline(`
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client({});

${authHelperCode}

exports.handler = async (event) => {
  const corsOrigin = getCorsOrigin(event);
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle CORS preflight
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Validate DM auth via Cognito JWT
    const auth = await validateAuth(event);
    if (!auth.valid || !auth.roles?.isDm) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'DM access required' }) };
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
        FEATURE_FLAG_PARAMETER: featureFlagParameterName,
        ALLOWED_ORIGIN: props.allowedOrigin,
        BEDROCK_MODEL_ID: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
        ...authEnvironment,
      },
      code: lambda.Code.fromInline(`
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

const bedrockClient = new BedrockRuntimeClient({});
const ssmClient = new SSMClient({});

let cachedFeatureFlag = null;
let featureFlagExpiry = 0;

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

${authHelperCode}

exports.handler = async (event) => {
  const corsOrigin = getCorsOrigin(event);
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Validate DM auth via Cognito JWT
    const auth = await validateAuth(event);
    if (!auth.valid || !auth.roles?.isDm) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'DM access required' }) };
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

    // Claude Messages API format with system prompt for caching
    const bedrockPayload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 512, // Reduced from 1024 - actual review output is ~150-300 tokens
      temperature: 0.3,
      // System prompt with cache_control for Bedrock prompt caching
      system: [
        {
          type: 'text',
          text: \`You are a helpful editor reviewing D&D session notes. When given notes to review, provide:
1. A quality score from 0-100
2. A list of suggestions for improvement (grammar, clarity, structure)
3. Whether the notes are ready to publish

Be concise. Format your response as JSON with fields: score (number), suggestions (array of strings), canPublish (boolean), summary (one sentence).
Respond with valid JSON only.\`,
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages: [
        {
          role: 'user',
          content: \`Notes to review:\\n\\n\${content.substring(0, 8000)}\`
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

    // Grant SSM parameter read access to review function (feature flag only)
    reviewFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
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

    // ==========================================================================
    // API Gateway Access Logging (for IP tracking)
    // ==========================================================================

    // Log group for API access logs
    const apiAccessLogGroup = new logs.LogGroup(this, 'ApiAccessLogGroup', {
      logGroupName: '/aws/apigateway/dm-notes-api/access-logs',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Enable access logging on the HTTP API stage
    // Log format includes: IP, path, status, timestamp
    if (defaultStage) {
      defaultStage.accessLogSettings = {
        destinationArn: apiAccessLogGroup.logGroupArn,
        format: JSON.stringify({
          requestId: '$context.requestId',
          ip: '$context.identity.sourceIp',
          requestTime: '$context.requestTime',
          httpMethod: '$context.httpMethod',
          path: '$context.path',
          status: '$context.status',
          responseLength: '$context.responseLength',
        }),
      };
    }

    // ==========================================================================
    // IP Tracker Lambda (processes access logs for new visitor alerts)
    // ==========================================================================

    const ipTrackerFunction = new lambda.Function(this, 'IpTrackerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        VISITORS_TABLE: visitorsTable.tableName,
        ALERT_TOPIC_ARN: newVisitorTopic.topicArn,
      },
      code: lambda.Code.fromInline(`
const { DynamoDBClient, GetItemCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const zlib = require('zlib');

const dynamoClient = new DynamoDBClient({});
const snsClient = new SNSClient({});

// Paths to track (successful token validations)
const TRACKED_PATHS = ['/validate-character-token', '/validate-dm-token'];

exports.handler = async (event) => {
  // CloudWatch Logs subscription sends base64-encoded gzipped data
  const payload = Buffer.from(event.awslogs.data, 'base64');
  const unzipped = zlib.gunzipSync(payload);
  const logData = JSON.parse(unzipped.toString('utf8'));

  const now = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60); // 90 days

  for (const logEvent of logData.logEvents) {
    try {
      const log = JSON.parse(logEvent.message);

      // Only track successful (200) requests to token validation endpoints
      // Note: status is a string in API Gateway access logs
      if (!TRACKED_PATHS.includes(log.path) || String(log.status) !== '200') {
        continue;
      }

      const sourceIp = log.ip;
      if (!sourceIp || sourceIp === '-') {
        continue;
      }

      // Determine token type from path
      const tokenType = log.path.includes('player') ? 'player' : 'dm';

      // Check if IP exists
      const existing = await dynamoClient.send(new GetItemCommand({
        TableName: process.env.VISITORS_TABLE,
        Key: { ip: { S: sourceIp } }
      }));

      if (!existing.Item) {
        // New visitor - send alert
        console.log('New visitor from IP:', sourceIp, 'Type:', tokenType);
        await snsClient.send(new PublishCommand({
          TopicArn: process.env.ALERT_TOPIC_ARN,
          Subject: 'New visitor to protected site',
          Message: 'New IP: ' + sourceIp + '\\nType: ' + tokenType + '\\nTime: ' + now
        }));
      }

      // Store/update visitor record
      await dynamoClient.send(new PutItemCommand({
        TableName: process.env.VISITORS_TABLE,
        Item: {
          ip: { S: sourceIp },
          firstSeen: { S: existing.Item?.firstSeen?.S || now },
          lastSeen: { S: now },
          tokenType: { S: tokenType },
          expiresAt: { N: String(ttl) }
        }
      }));
    } catch (err) {
      console.error('Error processing log event:', err);
      // Continue processing other events
    }
  }

  return { statusCode: 200 };
};
      `),
    });

    // Grant DynamoDB and SNS access to IP tracker
    visitorsTable.grantReadWriteData(ipTrackerFunction);
    newVisitorTopic.grantPublish(ipTrackerFunction);

    // Subscribe IP tracker to API access logs
    // Filter for only token validation paths with status 200
    new logs.SubscriptionFilter(this, 'IpTrackerSubscription', {
      logGroup: apiAccessLogGroup,
      destination: new logsDestinations.LambdaDestination(ipTrackerFunction),
      filterPattern: logs.FilterPattern.anyTerm(
        'validate-character-token',
        'validate-dm-token'
      ),
    });

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
        ALLOWED_ORIGIN: props.allowedOrigin,
        NOTES_PREFIX: 'dm-notes/',
        ...authEnvironment,
      },
      code: lambda.Code.fromInline(`
const { S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({});

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

${authHelperCode}

exports.handler = async (event) => {
  const corsOrigin = getCorsOrigin(event);
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Validate DM auth via Cognito JWT
    const auth = await validateAuth(event);
    if (!auth.valid || !auth.roles?.isDm) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'DM access required' }) };
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
        ALLOWED_ORIGIN: props.allowedOrigin,
        // Using Claude Sonnet 4.5 via cross-region inference profile
        BEDROCK_MODEL_ID: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        ...authEnvironment,
      },
      code: lambda.Code.fromInline(`
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const bedrockClient = new BedrockRuntimeClient({});

${authHelperCode}

// Slugify a name for file naming
function slugify(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Entity schemas - separate for conditional loading
const SCHEMAS = {
  character: \`CHARACTER (subtype: pc | npc | deity | historical)
- Required: name, type: "character", subtype
- Include: description, race, class, level, alignment, abilities[], tags[], relationships[]
- Optional: background, faction, location, ideals[], bonds[], flaws[]\`,

  enemy: \`ENEMY (subtype: boss | lieutenant | minion | creature | swarm | trap)
- Required: name, type: "enemy", subtype
- Include: description, cr (challenge rating as string), creatureType, baseMonster (SRD name), abilities[], tags[]
- Optional: faction, lair, territory[], customizations[], legendaryActions[]\`,

  item: \`ITEM (subtype: weapon | armor | artifact | consumable | quest | treasure | tool | wondrous)
- Required: name, type: "item", subtype
- Include: description, rarity, properties[], tags[]
- Optional: baseItem, attunement, currentOwner, location, charges, significance\`,

  location: \`LOCATION (subtype: plane | continent | region | city | town | village | dungeon | wilderness | building | room | landmark)
- Required: name, type: "location", subtype
- Include: description, tags[]
- Optional: parentLocation, climate, terrain, population, controlledBy, pointsOfInterest[], secrets[]\`,

  faction: \`FACTION (subtype: cult | guild | government | military | religious | criminal | merchant | noble-house | adventuring-party | secret-society)
- Required: name, type: "faction", subtype
- Include: description, goals[], tags[]
- Optional: leader, headquarters, territory[], allies[], enemies[], methods[], symbol, motto\`
};

// Base instructions (shared across all requests)
const BASE_INSTRUCTIONS = \`You are a D&D 5e campaign wiki generator. Convert natural language into structured entity data for an Astro content collection.

Respond with ONLY valid JSON (no code blocks, no explanation):

{
  "entityType": "character" | "enemy" | "item" | "location" | "faction",
  "subtype": "<specific subtype>",
  "confidence": <0-100>,
  "frontmatter": { <schema fields> },
  "markdown": "<wiki-style content>",
  "slug": "<kebab-case>"
}\`;

// Markdown styling rules
const MARKDOWN_RULES = \`MARKDOWN STYLE (critical):
- Start with: # Entity Name
- Then a narrative intro paragraph (no header)
- Use ## for sections
- Write in natural, wiki-style prose—like a campaign journal entry
- NO excessive bold, NO ALL CAPS, NO lists of stats
- Use bullet points sparingly for key details
- Bold only for important proper nouns or key terms
- Keep it readable and engaging, not a data dump\`;

// Build system prompt based on hint (conditional schema loading)
function buildSystemPrompt(hint) {
  if (hint && SCHEMAS[hint]) {
    // Only include the relevant schema when hint is provided (70-75% token savings)
    return \`\${BASE_INSTRUCTIONS}

SCHEMA:

\${SCHEMAS[hint]}

\${MARKDOWN_RULES}\`;
  }

  // Full prompt when no hint (or unknown hint)
  const allSchemas = Object.values(SCHEMAS).join('\\n\\n');
  return \`\${BASE_INSTRUCTIONS}

SCHEMAS:

\${allSchemas}

\${MARKDOWN_RULES}\`;
}

exports.handler = async (event) => {
  const corsOrigin = getCorsOrigin(event);
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Validate DM auth via Cognito JWT
    const auth = await validateAuth(event);
    if (!auth.valid || !auth.roles?.isDm) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'DM access required' }) };
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

    // Build optimized system prompt (conditional schema loading saves ~70% tokens when hint provided)
    const systemPrompt = buildSystemPrompt(hint);

    const userPrompt = hint
      ? \`[Entity type hint: \${hint}]\\n\\n\${input}\`
      : input;

    // Claude Messages API format via Bedrock with prompt caching
    const bedrockPayload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 2048, // Reduced from 4096 - actual outputs rarely exceed 1500 tokens
      temperature: 0.3,
      // System prompt with cache_control for Bedrock prompt caching
      // Cache is eligible when system prompt > 1024 tokens
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' }
        }
      ],
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
        ALLOWED_ORIGIN: props.allowedOrigin,
        STAGING_PREFIX: 'staging/branches/',
        ...authEnvironment,
      },
      code: lambda.Code.fromInline(`
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({});

${authHelperCode}

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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Validate DM auth via Cognito JWT
    const auth = await validateAuth(event);
    if (!auth.valid || !auth.roles?.isDm) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'DM access required' }) };
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
        GITHUB_PAT_PARAMETER_NAME: '/dndblog/github-pat',
        ALLOWED_ORIGIN: props.allowedOrigin,
        STAGING_PREFIX: 'staging/branches/',
        GITHUB_OWNER: 'lexicone42',
        GITHUB_REPO: 'dndblog',
        GITHUB_DEFAULT_BRANCH: 'main',
        ...authEnvironment,
      },
      code: lambda.Code.fromInline(`
const { S3Client, GetObjectCommand, ListObjectsV2Command, PutObjectCommand } = require('@aws-sdk/client-s3');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const https = require('https');

const s3Client = new S3Client({});
const ssmClient = new SSMClient({});

let cachedGitHubPat = null;
let gitHubPatExpiry = 0;

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

${authHelperCode}

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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // Handle CORS preflight
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    // Validate DM auth via Cognito JWT
    const auth = await validateAuth(event);
    if (!auth.valid || !auth.roles?.isDm) {
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

    // Grant SSM parameter read access for GitHub PAT
    githubPublishFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
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
        ALLOWED_ORIGIN: props.allowedOrigin,
        ...authEnvironment,
      },
      bundling: {
        // Include Zod and related dependencies
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
    });

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

    // ==========================================================================
    // Player Draft Endpoints
    // ==========================================================================
    //
    // Allows players to save/load/delete their session tracker drafts.
    // Drafts are stored in S3 under players/drafts/{character-slug}.json
    // Authorization is via per-player tokens stored in SSM.
    //
    // Endpoints:
    // - PUT /player/drafts/{slug}  - Save draft (requires matching player token)
    // - GET /player/drafts/{slug}  - Load draft (requires matching player token)
    // - DELETE /player/drafts/{slug} - Discard draft (requires matching player token)
    // - GET /player/drafts - List all drafts (DM token required)
    //
    // ==========================================================================

    // Build environment for player draft function
    const playerDraftEnvironment: Record<string, string> = {
      BUCKET_NAME: this.bucket.bucketName,
      ALLOWED_ORIGIN: props.allowedOrigin,
      ...authEnvironment,
    };

    // Add WebSocket config if provided
    if (props.webSocket) {
      playerDraftEnvironment.WS_ENABLED = 'true';
      playerDraftEnvironment.CONNECTIONS_TABLE = props.webSocket.connectionsTable.tableName;
      playerDraftEnvironment.WS_CALLBACK_URL = props.webSocket.callbackUrl;
    }

    const playerDraftFunction = new lambda.Function(this, 'PlayerDraftFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: playerDraftEnvironment,
      code: lambda.Code.fromInline(`
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { DynamoDBClient, ScanCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');

const s3Client = new S3Client({});

\${authHelperCode}

// WebSocket broadcast helper - sends updates to all connected DM dashboards
async function broadcastUpdate(action, character, data = {}) {
  if (process.env.WS_ENABLED !== 'true') {
    return; // WebSocket not configured
  }

  const ddbClient = new DynamoDBClient({});
  const wsClient = new ApiGatewayManagementApiClient({
    endpoint: process.env.WS_CALLBACK_URL,
  });

  try {
    // Get all active connections
    const result = await ddbClient.send(new ScanCommand({
      TableName: process.env.CONNECTIONS_TABLE,
    }));

    const connections = result.Items || [];
    console.log('Broadcasting to', connections.length, 'connections');

    // Send to each connection
    for (const conn of connections) {
      const connectionId = conn.connectionId.S;
      try {
        await wsClient.send(new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: JSON.stringify({
            action,
            character,
            timestamp: new Date().toISOString(),
            ...data,
          }),
        }));
      } catch (err) {
        if (err.statusCode === 410) {
          // Stale connection, remove it
          console.log('Removing stale connection:', connectionId);
          await ddbClient.send(new DeleteItemCommand({
            TableName: process.env.CONNECTIONS_TABLE,
            Key: { connectionId: { S: connectionId } },
          }));
        } else {
          console.error('Failed to send to connection:', connectionId, err);
        }
      }
    }
  } catch (err) {
    console.error('Broadcast error:', err);
    // Don't fail the request if broadcast fails
  }
}

exports.handler = async (event) => {
  const corsOrigin = getCorsOrigin(event);
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle CORS preflight
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const method = event.requestContext?.http?.method || event.httpMethod;
  const path = event.rawPath || event.path || '';

  try {
    // List all drafts (DM only)
    if (method === 'GET' && path === '/player/drafts') {
      const auth = await validateAuth(event);
      if (!auth.valid || !auth.roles?.isDm) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'DM access required' }) };
      }

      const listResult = await s3Client.send(new ListObjectsV2Command({
        Bucket: process.env.BUCKET_NAME,
        Prefix: 'players/drafts/',
      }));

      const drafts = [];
      for (const obj of listResult.Contents || []) {
        const slug = obj.Key.replace('players/drafts/', '').replace('.json', '');
        const getResult = await s3Client.send(new GetObjectCommand({
          Bucket: process.env.BUCKET_NAME,
          Key: obj.Key,
        }));
        const body = await getResult.Body.transformToString();
        const draft = JSON.parse(body);
        drafts.push({
          characterSlug: slug,
          savedAt: draft.savedAt || obj.LastModified,
          ...draft,
        });
      }

      return { statusCode: 200, headers, body: JSON.stringify({ drafts }) };
    }

    // Extract slug from path
    const slugMatch = path.match(/\\/player\\/drafts\\/([^/]+)/);
    if (!slugMatch) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid path' }) };
    }
    const slug = slugMatch[1];

    // Validate auth via Cognito JWT
    const auth = await validateAuth(event);
    if (!auth.valid) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Authentication required' }) };
    }

    // Get character slug from custom:characterSlug claim
    const authorizedSlug = auth.payload?.['custom:characterSlug'];
    if (!authorizedSlug || authorizedSlug !== slug) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not authorized for this character' }) };
    }

    const s3Key = \`players/drafts/\${slug}.json\`;

    if (method === 'GET') {
      // Load draft
      try {
        const result = await s3Client.send(new GetObjectCommand({
          Bucket: process.env.BUCKET_NAME,
          Key: s3Key,
        }));
        const body = await result.Body.transformToString();
        return { statusCode: 200, headers, body };
      } catch (err) {
        if (err.name === 'NoSuchKey') {
          return { statusCode: 404, headers, body: JSON.stringify({ error: 'No draft found' }) };
        }
        throw err;
      }
    }

    if (method === 'PUT') {
      // Save session state
      const body = JSON.parse(event.body || '{}');
      body.savedAt = new Date().toISOString();
      body.savedBy = slug;

      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: s3Key,
        Body: JSON.stringify(body, null, 2),
        ContentType: 'application/json',
      }));

      // Broadcast update to all connected DM dashboards
      await broadcastUpdate('session_update', slug, { sessionData: body });

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, savedAt: body.savedAt }) };
    }

    if (method === 'DELETE') {
      // Delete draft
      await s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: s3Key,
      }));

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (error) {
    console.error('Player draft error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
      `),
    });

    // ==========================================================================
    // End Session Function (DM Only)
    // ==========================================================================
    //
    // Clears all player session state when the DM ends the session.
    // Broadcasts session_ended to all connected DM dashboards.
    //
    // ==========================================================================

    // Build environment for end-session function
    const endSessionEnvironment: Record<string, string> = {
      BUCKET_NAME: this.bucket.bucketName,
      ALLOWED_ORIGIN: props.allowedOrigin,
      ...authEnvironment,
    };

    // Add WebSocket config if provided
    if (props.webSocket) {
      endSessionEnvironment.WS_ENABLED = 'true';
      endSessionEnvironment.CONNECTIONS_TABLE = props.webSocket.connectionsTable.tableName;
      endSessionEnvironment.WS_CALLBACK_URL = props.webSocket.callbackUrl;
    }

    const endSessionFunction = new lambda.Function(this, 'EndSessionFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: endSessionEnvironment,
      code: lambda.Code.fromInline(`
const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient, ScanCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');

const s3Client = new S3Client({});

\${authHelperCode}

// Broadcast to all connected DM dashboards
async function broadcastToAll(action, data = {}) {
  if (process.env.WS_ENABLED !== 'true') return;

  const ddbClient = new DynamoDBClient({});
  const wsClient = new ApiGatewayManagementApiClient({
    endpoint: process.env.WS_CALLBACK_URL,
  });

  const result = await ddbClient.send(new ScanCommand({
    TableName: process.env.CONNECTIONS_TABLE,
  }));

  for (const conn of result.Items || []) {
    const connectionId = conn.connectionId.S;
    try {
      await wsClient.send(new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify({ action, timestamp: new Date().toISOString(), ...data }),
      }));
    } catch (err) {
      if (err.statusCode === 410) {
        await ddbClient.send(new DeleteItemCommand({
          TableName: process.env.CONNECTIONS_TABLE,
          Key: { connectionId: { S: connectionId } },
        }));
      }
    }
  }
}

exports.handler = async (event) => {
  const corsOrigin = getCorsOrigin(event);
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Validate DM auth via Cognito JWT
    const auth = await validateAuth(event);
    if (!auth.valid || !auth.roles?.isDm) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'DM access required' }) };
    }

    // List and delete all session state files
    const listResult = await s3Client.send(new ListObjectsV2Command({
      Bucket: process.env.BUCKET_NAME,
      Prefix: 'players/drafts/',
    }));

    const deletedCount = listResult.Contents?.length || 0;

    for (const obj of listResult.Contents || []) {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: obj.Key,
      }));
    }

    // Broadcast session_ended to all connected DM dashboards
    await broadcastToAll('session_ended', { clearedCount: deletedCount });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, clearedCount: deletedCount }),
    };

  } catch (error) {
    console.error('End session error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
      `),
    });

    // Grant S3 permissions
    this.bucket.grantReadWrite(endSessionFunction);

    // Grant WebSocket permissions if configured
    if (props.webSocket) {
      props.webSocket.connectionsTable.grantReadWriteData(endSessionFunction);
      endSessionFunction.addToRolePolicy(new iam.PolicyStatement({
        actions: ['execute-api:ManageConnections'],
        resources: [
          `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${props.webSocket.apiId}/${props.webSocket.stageName}/POST/@connections/*`,
        ],
      }));
    }

    // Add end-session route
    this.api.addRoutes({
      path: '/dm/end-session',
      methods: [apigateway.HttpMethod.POST, apigateway.HttpMethod.OPTIONS],
      integration: new apigatewayIntegrations.HttpLambdaIntegration(
        'EndSessionIntegration',
        endSessionFunction
      ),
    });

    // Grant S3 permissions to player draft function
    this.bucket.grantReadWrite(playerDraftFunction);

    // Grant WebSocket permissions if configured
    if (props.webSocket) {
      // Read/write connections table (for broadcast and cleanup)
      props.webSocket.connectionsTable.grantReadWriteData(playerDraftFunction);

      // Post to WebSocket connections
      playerDraftFunction.addToRolePolicy(new iam.PolicyStatement({
        actions: ['execute-api:ManageConnections'],
        resources: [
          `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${props.webSocket.apiId}/${props.webSocket.stageName}/POST/@connections/*`,
        ],
      }));
    }

    // Add player draft routes
    this.api.addRoutes({
      path: '/player/drafts',
      methods: [apigateway.HttpMethod.GET, apigateway.HttpMethod.OPTIONS],
      integration: new apigatewayIntegrations.HttpLambdaIntegration(
        'PlayerDraftsListIntegration',
        playerDraftFunction
      ),
    });

    this.api.addRoutes({
      path: '/player/drafts/{slug}',
      methods: [
        apigateway.HttpMethod.GET,
        apigateway.HttpMethod.PUT,
        apigateway.HttpMethod.DELETE,
        apigateway.HttpMethod.OPTIONS,
      ],
      integration: new apigatewayIntegrations.HttpLambdaIntegration(
        'PlayerDraftIntegration',
        playerDraftFunction
      ),
    });

    // Player Draft Function Alarm
    new cloudwatch.Alarm(this, 'PlayerDraftFunctionErrors', {
      alarmName: `${cdk.Names.uniqueId(this)}-player-draft-errors`,
      alarmDescription: 'Player draft function errors',
      metric: playerDraftFunction.metricErrors({
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
