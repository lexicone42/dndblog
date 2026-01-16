import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DmNotesApi } from './constructs/dm-notes-api.js';
import { WebSocketApiConstruct } from './constructs/websocket-api.js';

/**
 * Configuration for Cognito-based authentication
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
}

export interface DmNotesStackProps extends cdk.StackProps {
  /**
   * The domain name for CORS (e.g., https://chronicles.mawframe.ninja)
   */
  allowedOrigin: string;

  /**
   * Cognito authentication configuration
   * All endpoints require valid JWT tokens from this User Pool.
   */
  cognitoAuth: CognitoAuthConfig;
}

export class DmNotesStack extends cdk.Stack {
  public readonly apiUrl: string;
  public readonly bucketName: string;
  public readonly wsUrl: string;

  constructor(scope: Construct, id: string, props: DmNotesStackProps) {
    super(scope, id, props);

    // WebSocket API for real-time session updates
    const webSocketApi = new WebSocketApiConstruct(this, 'WebSocketApi', {
      cognitoAuth: props.cognitoAuth,
      allowedOrigin: props.allowedOrigin,
    });

    const dmNotesApi = new DmNotesApi(this, 'DmNotesApi', {
      allowedOrigin: props.allowedOrigin,
      cognitoAuth: props.cognitoAuth,
      // WebSocket configuration for real-time updates
      webSocket: {
        connectionsTable: webSocketApi.connectionsTable,
        callbackUrl: webSocketApi.callbackUrl,
        apiId: webSocketApi.api.apiId,
        stageName: webSocketApi.stage.stageName,
      },
    });

    this.apiUrl = dmNotesApi.apiUrl;
    this.bucketName = dmNotesApi.bucket.bucketName;
    this.wsUrl = webSocketApi.wsUrl;

    // Stack outputs
    new cdk.CfnOutput(this, 'ApiUrlOutput', {
      value: dmNotesApi.apiUrl,
      description: 'DM Notes API URL',
      exportName: 'DmNotesApiUrl',
    });

    new cdk.CfnOutput(this, 'NotesBucketOutput', {
      value: dmNotesApi.bucket.bucketName,
      description: 'S3 bucket for DM notes',
      exportName: 'DmNotesBucket',
    });

    new cdk.CfnOutput(this, 'WebSocketUrlOutput', {
      value: webSocketApi.wsUrl,
      description: 'WebSocket URL for real-time updates',
      exportName: 'DmNotesWebSocketUrl',
    });
  }
}
