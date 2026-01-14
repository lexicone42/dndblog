import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DmNotesApi } from './constructs/dm-notes-api.js';

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

  constructor(scope: Construct, id: string, props: DmNotesStackProps) {
    super(scope, id, props);

    const dmNotesApi = new DmNotesApi(this, 'DmNotesApi', {
      allowedOrigin: props.allowedOrigin,
      tokenParameterName: props.tokenParameterName,
    });

    this.apiUrl = dmNotesApi.apiUrl;
    this.bucketName = dmNotesApi.bucket.bucketName;

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
  }
}
