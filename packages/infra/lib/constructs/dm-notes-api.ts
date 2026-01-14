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

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN,
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

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN,
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
    this.api = new apigateway.HttpApi(this, 'Api', {
      apiName: 'DmNotesApi',
      corsPreflight: {
        allowOrigins: [props.allowedOrigin],
        allowMethods: [
          apigateway.CorsHttpMethod.GET,
          apigateway.CorsHttpMethod.POST,
          apigateway.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'X-DM-Token'],
        maxAge: cdk.Duration.hours(1),
      },
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

    // Add upload-url route
    this.api.addRoutes({
      path: '/upload-url',
      methods: [apigateway.HttpMethod.GET],
      integration: new apigatewayIntegrations.HttpLambdaIntegration(
        'UploadUrlIntegration',
        uploadUrlFunction
      ),
    });

    // Add review route
    this.api.addRoutes({
      path: '/review',
      methods: [apigateway.HttpMethod.POST],
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
  }
}
