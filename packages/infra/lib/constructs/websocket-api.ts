import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

// ==========================================================================
// WebSocket API for Real-Time Session Updates
// ==========================================================================
//
// This construct creates a WebSocket API that enables real-time updates
// between player session trackers and the DM dashboard.
//
// Architecture:
// 1. DM opens party-tracker.astro → WebSocket connection established
// 2. Player saves draft → PlayerDraftFunction saves to S3 and broadcasts
// 3. DM receives WebSocket message → UI updates immediately (<100ms)
//
// Security:
// - Only DMs can connect (validated via X-DM-Token in query string)
// - Connections stored in DynamoDB with TTL for auto-cleanup
// - API Gateway Management API used for server-to-client push
//
// ==========================================================================

export interface WebSocketApiProps {
  /**
   * SSM parameter name for the DM auth token
   */
  dmTokenParameterName: string;

  /**
   * Allowed origin for CORS (not directly used by WebSocket but logged)
   */
  allowedOrigin: string;
}

export class WebSocketApiConstruct extends Construct {
  /**
   * The WebSocket API Gateway
   */
  public readonly api: apigatewayv2.WebSocketApi;

  /**
   * The WebSocket API stage
   */
  public readonly stage: apigatewayv2.WebSocketStage;

  /**
   * DynamoDB table storing active WebSocket connections
   */
  public readonly connectionsTable: dynamodb.Table;

  /**
   * The WebSocket endpoint URL (wss://)
   */
  public readonly wsUrl: string;

  /**
   * The callback URL for API Gateway Management API (https://)
   * Used by Lambdas to push messages to connected clients
   */
  public readonly callbackUrl: string;

  constructor(scope: Construct, id: string, props: WebSocketApiProps) {
    super(scope, id);

    // ========================================================================
    // DynamoDB Table for Connection Management
    // ========================================================================
    //
    // Each WebSocket connection is stored with:
    // - connectionId (PK): The API Gateway-assigned connection ID
    // - connectedAt: ISO timestamp of connection
    // - role: 'dm' for now, could expand to 'player' for bidirectional
    // - ttl: Unix timestamp for automatic cleanup (24 hours)
    //
    // ========================================================================

    this.connectionsTable = new dynamodb.Table(this, 'ConnectionsTable', {
      tableName: 'DmLiveConnections',
      partitionKey: {
        name: 'connectionId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // OK to lose connection data
      timeToLiveAttribute: 'ttl',
    });

    // ========================================================================
    // Lambda: $connect Handler
    // ========================================================================
    //
    // Validates the DM token from the query string and stores the connection
    // in DynamoDB. Returns 401 if token is invalid.
    //
    // ========================================================================

    const connectHandler = new lambda.Function(this, 'ConnectHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        CONNECTIONS_TABLE: this.connectionsTable.tableName,
        DM_TOKEN_PARAMETER_NAME: props.dmTokenParameterName,
      },
      code: lambda.Code.fromInline(`
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');

const ssmClient = new SSMClient({});
const ddbClient = new DynamoDBClient({});

let cachedToken = null;
let tokenExpiry = 0;

async function getDmToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }
  const result = await ssmClient.send(new GetParameterCommand({
    Name: process.env.DM_TOKEN_PARAMETER_NAME,
    WithDecryption: true,
  }));
  cachedToken = result.Parameter.Value;
  tokenExpiry = now + 5 * 60 * 1000;
  return cachedToken;
}

exports.handler = async (event) => {
  console.log('WebSocket $connect:', JSON.stringify(event));
  
  const connectionId = event.requestContext.connectionId;
  const queryParams = event.queryStringParameters || {};
  const providedToken = queryParams.token;

  // Validate DM token
  if (!providedToken) {
    console.log('No token provided');
    return { statusCode: 401, body: 'Missing authentication token' };
  }

  const validToken = await getDmToken();
  if (providedToken !== validToken) {
    console.log('Invalid token');
    return { statusCode: 403, body: 'Invalid token' };
  }

  // Store connection in DynamoDB with 24-hour TTL
  const ttl = Math.floor(Date.now() / 1000) + 86400;
  
  await ddbClient.send(new PutItemCommand({
    TableName: process.env.CONNECTIONS_TABLE,
    Item: {
      connectionId: { S: connectionId },
      connectedAt: { S: new Date().toISOString() },
      role: { S: 'dm' },
      ttl: { N: ttl.toString() },
    },
  }));

  console.log('Connection stored:', connectionId);
  return { statusCode: 200, body: 'Connected' };
};
      `),
    });

    // ========================================================================
    // Lambda: $disconnect Handler
    // ========================================================================
    //
    // Removes the connection from DynamoDB when the client disconnects.
    //
    // ========================================================================

    const disconnectHandler = new lambda.Function(this, 'DisconnectHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        CONNECTIONS_TABLE: this.connectionsTable.tableName,
      },
      code: lambda.Code.fromInline(`
const { DynamoDBClient, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');

const ddbClient = new DynamoDBClient({});

exports.handler = async (event) => {
  console.log('WebSocket $disconnect:', JSON.stringify(event));
  
  const connectionId = event.requestContext.connectionId;

  await ddbClient.send(new DeleteItemCommand({
    TableName: process.env.CONNECTIONS_TABLE,
    Key: {
      connectionId: { S: connectionId },
    },
  }));

  console.log('Connection removed:', connectionId);
  return { statusCode: 200, body: 'Disconnected' };
};
      `),
    });

    // ========================================================================
    // Lambda: $default Handler
    // ========================================================================
    //
    // Handles any messages sent by clients. Currently just echoes back
    // for debugging/ping-pong. Could be extended for client-to-server
    // communication in the future.
    //
    // ========================================================================

    const defaultHandler = new lambda.Function(this, 'DefaultHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        CONNECTIONS_TABLE: this.connectionsTable.tableName,
      },
      code: lambda.Code.fromInline(`
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');

exports.handler = async (event) => {
  console.log('WebSocket $default:', JSON.stringify(event));
  
  const connectionId = event.requestContext.connectionId;
  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const body = event.body || '';

  // Parse incoming message
  let message;
  try {
    message = JSON.parse(body);
  } catch (e) {
    message = { raw: body };
  }

  // Handle ping messages
  if (message.action === 'ping') {
    const client = new ApiGatewayManagementApiClient({
      endpoint: 'https://' + domain + '/' + stage,
    });

    await client.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: JSON.stringify({ action: 'pong', timestamp: Date.now() }),
    }));

    return { statusCode: 200, body: 'Pong sent' };
  }

  // Echo unknown messages for debugging
  console.log('Unknown message action:', message.action);
  return { statusCode: 200, body: 'Message received' };
};
      `),
    });

    // Grant DynamoDB permissions
    this.connectionsTable.grantReadWriteData(connectHandler);
    this.connectionsTable.grantReadWriteData(disconnectHandler);
    this.connectionsTable.grantReadData(defaultHandler);

    // Grant SSM read permission to connect handler
    connectHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [`arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:parameter${props.dmTokenParameterName}`],
    }));

    // ========================================================================
    // WebSocket API
    // ========================================================================

    this.api = new apigatewayv2.WebSocketApi(this, 'DmLiveApi', {
      apiName: 'DmLiveWebSocket',
      description: 'Real-time WebSocket API for DM dashboard updates',
      connectRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'ConnectIntegration',
          connectHandler
        ),
      },
      disconnectRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'DisconnectIntegration',
          disconnectHandler
        ),
      },
      defaultRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'DefaultIntegration',
          defaultHandler
        ),
      },
    });

    // Create production stage
    this.stage = new apigatewayv2.WebSocketStage(this, 'ProdStage', {
      webSocketApi: this.api,
      stageName: 'prod',
      autoDeploy: true,
    });

    // Grant default handler permission to post to connections
    defaultHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [
        `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${this.api.apiId}/${this.stage.stageName}/POST/@connections/*`,
      ],
    }));

    // Set up URLs
    this.wsUrl = this.stage.url;
    this.callbackUrl = this.stage.callbackUrl;

    // ========================================================================
    // Outputs
    // ========================================================================

    new cdk.CfnOutput(this, 'WebSocketUrl', {
      value: this.wsUrl,
      description: 'WebSocket URL for DM dashboard (wss://)',
      exportName: 'DmLiveWebSocketUrl',
    });

    new cdk.CfnOutput(this, 'WebSocketCallbackUrl', {
      value: this.callbackUrl,
      description: 'Callback URL for pushing messages to clients',
      exportName: 'DmLiveCallbackUrl',
    });

    new cdk.CfnOutput(this, 'ConnectionsTableName', {
      value: this.connectionsTable.tableName,
      description: 'DynamoDB table for WebSocket connections',
      exportName: 'DmLiveConnectionsTable',
    });
  }

  /**
   * Grants a Lambda function permission to read the connections table
   * and post messages to connected clients.
   */
  public grantBroadcast(lambdaFunction: lambda.IFunction): void {
    // Read connections from DynamoDB
    this.connectionsTable.grantReadWriteData(lambdaFunction);

    // Post messages to WebSocket connections
    lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [
        `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${this.api.apiId}/${this.stage.stageName}/POST/@connections/*`,
      ],
    }));
  }
}
