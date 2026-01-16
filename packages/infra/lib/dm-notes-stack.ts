import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DmNotesApi } from './constructs/dm-notes-api.js';
import { WebSocketApiConstruct } from './constructs/websocket-api.js';

export interface DmNotesStackProps extends cdk.StackProps {
  /**
   * The domain name for CORS (e.g., https://chronicles.mawframe.ninja)
   */
  allowedOrigin: string;

  /**
   * SSM parameter name for the auth token
   * @default '/dndblog/dm-notes-token'
   */
  tokenParameterName?: string;
}

export class DmNotesStack extends cdk.Stack {
  public readonly apiUrl: string;
  public readonly bucketName: string;
  public readonly wsUrl: string;

  constructor(scope: Construct, id: string, props: DmNotesStackProps) {
    super(scope, id, props);

    // WebSocket API for real-time session updates
    const webSocketApi = new WebSocketApiConstruct(this, 'WebSocketApi', {
      dmTokenParameterName: props.tokenParameterName ?? '/dndblog/dm-notes-token',
      allowedOrigin: props.allowedOrigin,
    });

    const dmNotesApi = new DmNotesApi(this, 'DmNotesApi', {
      allowedOrigin: props.allowedOrigin,
      tokenParameterName: props.tokenParameterName,
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
