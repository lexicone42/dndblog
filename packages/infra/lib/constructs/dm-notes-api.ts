import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface DmNotesApiProps {
  /**
   * The domain name for CORS configuration
   */
  allowedOrigin: string;

  /**
   * SSM parameter name storing the DM auth token
   * @default '/dndblog/dm-notes-token'
   */
  tokenParameterName?: string;
}

export class DmNotesApi extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly api: apigateway.HttpApi;
  public readonly apiUrl: string;

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
      memorySize: 512,
      reservedConcurrentExecutions: 2, // Limit parallel invocations to control costs
      environment: {
        TOKEN_PARAMETER_NAME: tokenParameterName,
        ALLOWED_ORIGIN: props.allowedOrigin,
        // Using Amazon Nova Premier - Amazon's own model, no approval required
        BEDROCK_MODEL_ID: 'us.amazon.nova-premier-v1:0',
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

// Entity schema definitions for the AI prompt
const ENTITY_SCHEMAS = \`
## ENTITY TYPES AND SCHEMAS

### CHARACTER (subtype: pc | npc | deity | historical)
Required: name, type: "character", subtype
Common fields: race, class, level (1-20), background, alignment
Equipment: { equipped: [{ slot, item, attuned }], currency: { pp, gp, ep, sp, cp } }
Optional: faction, location, description, tags, relationships

### ENEMY (subtype: boss | lieutenant | minion | creature | swarm | trap)
Required: name, type: "enemy", subtype
Common fields: baseMonster, cr (e.g. "1/4", "5", "mythic"), creatureType
Optional: faction, lair, territory, customizations, tags, description

### ITEM (subtype: weapon | armor | artifact | consumable | quest | treasure | tool | wondrous | vehicle | property)
Required: name, type: "item", subtype
Common fields: rarity (common|uncommon|rare|very-rare|legendary|artifact|unique)
Optional: baseItem, attunement (boolean), properties [], currentOwner, description

### LOCATION (subtype: plane | continent | region | city | town | village | dungeon | wilderness | building | room | landmark)
Required: name, type: "location", subtype
Common fields: parentLocation, climate, terrain, population
Optional: controlledBy, pointsOfInterest [], secrets [], description

### FACTION (subtype: cult | guild | government | military | religious | criminal | merchant | noble-house | adventuring-party | secret-society)
Required: name, type: "faction", subtype
Common fields: leader, headquarters, goals [], methods []
Optional: allies [], enemies [], territory [], symbol, motto, description
\`;

const PARSING_RULES = \`
## PARSING RULES

1. CURRENCY PARSING:
   - "2 gold" or "2gp" → { gp: 2 }
   - "50 silver" or "50sp" → { sp: 50 }
   - "10 platinum" → { pp: 10 }
   - Multiple: "2gp 50sp" → { gp: 2, sp: 50 }

2. EQUIPMENT PARSING:
   - "scimitar" → { slot: "main-hand", item: "scimitar" }
   - "leather armor" → { slot: "armor", item: "leather-armor" }
   - "+1 longsword" → { slot: "main-hand", item: "longsword", properties: ["+1"] }

3. NAME HANDLING:
   - Capitalize properly: "gorok" → "Gorok"
   - Handle titles: "chief gorok" → "Chief Gorok"

4. ALIGNMENT INFERENCE:
   - Negative descriptions → evil alignment (CE, NE, LE)
   - "piece of shit", "vile", "cruel" → Chaotic Evil or Neutral Evil
   - "noble", "kind", "heroic" → Good alignments

5. STATUS:
   - Default to "active" unless stated otherwise
   - "dead", "deceased" → "dead"
   - "missing", "lost" → "missing"

6. ENTITY TYPE DETECTION:
   - Creatures with CR/stats → enemy
   - Named NPCs interacted with → character (npc)
   - Places → location
   - Organizations → faction
   - Objects/gear → item
\`;

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

    // Build the AI prompt
    const systemPrompt = \`You are a D&D campaign assistant that converts natural language entity descriptions into structured YAML frontmatter for a campaign wiki.

\${ENTITY_SCHEMAS}

\${PARSING_RULES}

Your task is to:
1. Detect the entity type from the input (or use the provided hint)
2. Extract all mentioned attributes into schema-compliant fields
3. Infer reasonable defaults for unspecified fields
4. Generate a brief markdown description

Output valid JSON with this structure:
{
  "entityType": "character|enemy|item|location|faction",
  "subtype": "the specific subtype",
  "confidence": 0-100,
  "frontmatter": { ... all YAML fields as a JSON object ... },
  "markdown": "Brief markdown content for the entity page",
  "slug": "kebab-case-name",
  "suggestions": ["optional improvement suggestions"]
}

IMPORTANT RULES:
- frontmatter must include "type" and "subtype" fields
- All field names use camelCase
- Do not include null or undefined values
- Tags should be lowercase kebab-case
- Status defaults to "active"
- Visibility defaults to "public"
- Output ONLY valid JSON, no explanations or markdown code blocks
- Start your response with { and end with }
- Do not include any text before or after the JSON object\`;

    const userPrompt = hint
      ? \`Entity type hint: \${hint}\\n\\nDescription: \${input}\`
      : \`Description: \${input}\`;

    // Amazon Nova Premier uses Messages API format
    const bedrockPayload = {
      messages: [
        {
          role: 'user',
          content: [{ text: userPrompt }]
        }
      ],
      system: [{ text: systemPrompt }],
      inferenceConfig: {
        maxTokens: 2048,
        temperature: 0.3,
      },
    };

    const command = new InvokeModelCommand({
      modelId: process.env.BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(bedrockPayload),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    // Nova returns output.message.content[0].text
    const outputText = responseBody.output?.message?.content?.[0]?.text || '';

    // Parse the AI response as JSON
    let result;
    try {
      const jsonMatch = outputText.match(/\\{[\\s\\S]*\\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseErr) {
      return {
        statusCode: 422,
        headers,
        body: JSON.stringify({
          error: 'Failed to parse AI response',
          raw: outputText.substring(0, 500),
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

    // Grant Bedrock permissions to generate entity function (Amazon Nova Premier)
    generateEntityFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [
        'arn:aws:bedrock:*::foundation-model/amazon.nova-premier-v1:0',
        'arn:aws:bedrock:*:*:inference-profile/us.amazon.nova-premier-v1:0',
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
  }
}
