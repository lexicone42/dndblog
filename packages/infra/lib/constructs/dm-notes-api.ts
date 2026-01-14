import * as cdk from 'aws-cdk-lib';
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

    // HTTP API Gateway
    this.api = new apigateway.HttpApi(this, 'Api', {
      apiName: 'DmNotesApi',
      corsPreflight: {
        allowOrigins: [props.allowedOrigin],
        allowMethods: [apigateway.CorsHttpMethod.GET, apigateway.CorsHttpMethod.OPTIONS],
        allowHeaders: ['Content-Type', 'X-DM-Token'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    // Add route
    this.api.addRoutes({
      path: '/upload-url',
      methods: [apigateway.HttpMethod.GET],
      integration: new apigatewayIntegrations.HttpLambdaIntegration(
        'UploadUrlIntegration',
        uploadUrlFunction
      ),
    });

    this.apiUrl = this.api.apiEndpoint;
  }
}
