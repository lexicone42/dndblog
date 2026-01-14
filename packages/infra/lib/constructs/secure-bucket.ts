import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * Properties for creating a secure S3 bucket for static site hosting.
 * The bucket is configured with security best practices:
 * - Block all public access (CloudFront OAC will be used)
 * - Server-side encryption with S3-managed keys
 * - Versioning enabled for rollback capability
 * - Lifecycle rules to clean up old versions
 */
export interface SecureBucketProps {
  /** Optional bucket name. If not provided, CDK will generate one. */
  bucketName?: string;
  /** Number of days to retain noncurrent versions before deletion. Default: 30 */
  noncurrentVersionExpirationDays?: number;
  /** Whether to enable access logging. Default: false */
  enableAccessLogging?: boolean;
  /** Removal policy for the bucket. Default: RETAIN for production safety */
  removalPolicy?: cdk.RemovalPolicy;
}

export class SecureBucket extends Construct {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: SecureBucketProps = {}) {
    super(scope, id);

    const {
      bucketName,
      noncurrentVersionExpirationDays = 30,
      removalPolicy = cdk.RemovalPolicy.RETAIN,
    } = props;

    this.bucket = new s3.Bucket(this, 'Bucket', {
      bucketName,

      // Security: Block ALL public access - CloudFront OAC will provide access
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,

      // Security: Enable server-side encryption with S3-managed keys
      encryption: s3.BucketEncryption.S3_MANAGED,

      // Security: Enforce SSL/TLS for all requests
      enforceSSL: true,

      // Enable versioning for rollback capability and safety
      versioned: true,

      // Lifecycle rules to manage storage costs
      lifecycleRules: [
        {
          id: 'CleanupOldVersions',
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(noncurrentVersionExpirationDays),
          // Clean up incomplete multipart uploads
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],

      // Object ownership: Bucket owner has full control
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,

      // Removal policy - RETAIN by default for production safety
      removalPolicy,

      // Only auto-delete contents if explicitly destroying (non-production)
      autoDeleteObjects: removalPolicy === cdk.RemovalPolicy.DESTROY,
    });
  }
}
