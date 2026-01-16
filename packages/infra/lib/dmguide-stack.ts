import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DmGuideApi } from './constructs/dmguide-api.js';
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

export interface DmGuideStackProps extends cdk.StackProps {
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

export class DmGuideStack extends cdk.Stack {
  public readonly apiUrl: string;
  public readonly bucketName: string;
  public readonly wsUrl: string;

  constructor(scope: Construct, id: string, props: DmGuideStackProps) {
    super(scope, id, props);

    // WebSocket API for real-time session updates
    const webSocketApi = new WebSocketApiConstruct(this, 'WebSocketApi', {
      cognitoAuth: props.cognitoAuth,
      allowedOrigin: props.allowedOrigin,
    });

    const dmGuideApi = new DmGuideApi(this, 'DmNotesApi', {
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

    this.apiUrl = dmGuideApi.apiUrl;
    this.bucketName = dmGuideApi.bucket.bucketName;
    this.wsUrl = webSocketApi.wsUrl;

    // Stack outputs
    new cdk.CfnOutput(this, 'ApiUrlOutput', {
      value: dmGuideApi.apiUrl,
      description: 'DM Guide API URL',
      exportName: 'DmNotesApiUrl',  // Keep export name for compatibility
    });

    new cdk.CfnOutput(this, 'NotesBucketOutput', {
      value: dmGuideApi.bucket.bucketName,
      description: 'S3 bucket for DM content',
      exportName: 'DmNotesBucket',  // Keep export name for compatibility
    });

    new cdk.CfnOutput(this, 'WebSocketUrlOutput', {
      value: webSocketApi.wsUrl,
      description: 'WebSocket URL for real-time updates',
      exportName: 'DmNotesWebSocketUrl',  // Keep export name for compatibility
    });
  }
}
