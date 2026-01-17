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
// - Only DMs can connect (validated via Cognito JWT in query string)
// - Connections stored in DynamoDB with TTL for auto-cleanup
// - API Gateway Management API used for server-to-client push
//
// ==========================================================================

/**
 * Configuration for Cognito-based authentication
 */
export interface CognitoAuthConfig {
  /**
   * Cognito User Pool ID
   */
  userPoolId: string;

  /**
   * Cognito User Pool Client ID
   */
  userPoolClientId: string;
}

export interface WebSocketApiProps {
  /**
   * Cognito authentication configuration
   */
  cognitoAuth: CognitoAuthConfig;

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
   * DynamoDB table storing short-lived WebSocket tickets
   * Tickets are single-use and expire after 60 seconds
   */
  public readonly ticketsTable: dynamodb.Table;

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
    // DynamoDB Table for WebSocket Tickets
    // ========================================================================
    //
    // Short-lived, single-use tickets that clients exchange for WebSocket
    // connections. This prevents exposing long-lived JWTs in query strings.
    //
    // Each ticket is stored with:
    // - ticketId (PK): Random 32-byte hex string
    // - userId: The authenticated user's Cognito sub
    // - role: 'dm' or 'player'
    // - createdAt: ISO timestamp
    // - ttl: Unix timestamp (60 seconds from creation)
    //
    // ========================================================================

    this.ticketsTable = new dynamodb.Table(this, 'TicketsTable', {
      tableName: 'DmLiveTickets',
      partitionKey: {
        name: 'ticketId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    // ========================================================================
    // Lambda: $connect Handler
    // ========================================================================
    //
    // Validates WebSocket connection attempts using ticket-based auth.
    // Tickets are short-lived (60s), single-use tokens obtained via REST API.
    //
    // Flow:
    // 1. Client calls POST /ws-ticket with Cognito JWT
    // 2. Server validates JWT and returns a 60-second ticket
    // 3. Client connects to WebSocket with ?ticket=xxx
    // 4. This handler validates and consumes the ticket
    //
    // ========================================================================

    const connectHandler = new lambda.Function(this, 'ConnectHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        CONNECTIONS_TABLE: this.connectionsTable.tableName,
        TICKETS_TABLE: this.ticketsTable.tableName,
        COGNITO_USER_POOL_ID: props.cognitoAuth.userPoolId,
        COGNITO_CLIENT_ID: props.cognitoAuth.userPoolClientId,
      },
      code: lambda.Code.fromInline(`
const { DynamoDBClient, PutItemCommand, GetItemCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');

const ddbClient = new DynamoDBClient({});

// Validate a ticket (preferred method - single-use, short-lived)
async function validateTicket(ticketId) {
  if (!ticketId || ticketId.length < 32) {
    return { valid: false, error: 'Invalid ticket format' };
  }

  // Get ticket from DynamoDB
  const result = await ddbClient.send(new GetItemCommand({
    TableName: process.env.TICKETS_TABLE,
    Key: { ticketId: { S: ticketId } },
  }));

  if (!result.Item) {
    return { valid: false, error: 'Ticket not found or expired' };
  }

  // Check if ticket is expired (TTL is advisory, item might still exist briefly)
  const ttl = parseInt(result.Item.ttl?.N || '0', 10);
  if (ttl < Math.floor(Date.now() / 1000)) {
    return { valid: false, error: 'Ticket expired' };
  }

  // Extract ticket data
  const userId = result.Item.userId?.S || 'unknown';
  const role = result.Item.role?.S || '';
  const isDm = role === 'dm';

  // Delete ticket immediately (single-use)
  await ddbClient.send(new DeleteItemCommand({
    TableName: process.env.TICKETS_TABLE,
    Key: { ticketId: { S: ticketId } },
  }));

  console.log('Ticket consumed:', ticketId.substring(0, 8) + '...');
  return { valid: true, userId, isDm };
}

exports.handler = async (event) => {
  console.log('WebSocket $connect:', JSON.stringify(event));

  const connectionId = event.requestContext.connectionId;
  const queryParams = event.queryStringParameters || {};
  const ticket = queryParams.ticket;

  // Require ticket for authentication
  if (!ticket) {
    console.log('No ticket provided');
    return { statusCode: 401, body: 'Missing authentication ticket. Use POST /ws-ticket to obtain one.' };
  }

  // Validate and consume the ticket
  const result = await validateTicket(ticket);
  if (!result.valid) {
    console.log('Invalid ticket:', result.error);
    return { statusCode: 403, body: result.error };
  }

  if (!result.isDm) {
    console.log('Not a DM');
    return { statusCode: 403, body: 'DM access required' };
  }

  // Store connection in DynamoDB with 24-hour TTL
  const ttl = Math.floor(Date.now() / 1000) + 86400;

  await ddbClient.send(new PutItemCommand({
    TableName: process.env.CONNECTIONS_TABLE,
    Item: {
      connectionId: { S: connectionId },
      connectedAt: { S: new Date().toISOString() },
      role: { S: 'dm' },
      userId: { S: result.userId },
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
    // Tickets table: connect handler needs read+delete for ticket validation
    this.ticketsTable.grantReadWriteData(connectHandler);

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

    new cdk.CfnOutput(this, 'TicketsTableName', {
      value: this.ticketsTable.tableName,
      description: 'DynamoDB table for WebSocket tickets (short-lived auth)',
      exportName: 'DmLiveTicketsTable',
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
