import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';

/**
 * Properties for creating GitHub OIDC authentication infrastructure.
 * This enables GitHub Actions to assume an IAM role without long-lived credentials.
 */
export interface GithubOidcProps {
  /** GitHub repository in format "owner/repo" */
  githubRepo: string;
  /** Optional: Restrict to specific branch. Default allows main branch only for deploy. */
  allowedBranches?: string[];
  /** Optional: S3 bucket ARN for deployment permissions */
  siteBucketArn?: string;
  /** Optional: CloudFront distribution ID for invalidation permissions */
  distributionId?: string;
}

export class GithubOidc extends Construct {
  public readonly provider: iam.IOpenIdConnectProvider;
  public readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props: GithubOidcProps) {
    super(scope, id);

    const { githubRepo, allowedBranches = ['main'], siteBucketArn, distributionId } = props;

    // Create or look up the GitHub OIDC provider
    // Using singleton pattern since only one provider per account is needed
    const providerArn = `arn:aws:iam::${cdk.Stack.of(this).account}:oidc-provider/token.actions.githubusercontent.com`;

    // Try to import existing provider, or create new one
    // CDK will handle deduplication if already exists
    this.provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'GithubProvider',
      providerArn
    );

    // Build condition for restricting access
    // Format: repo:owner/repo:ref:refs/heads/branch
    const branchConditions = allowedBranches.map(
      (branch) => `repo:${githubRepo}:ref:refs/heads/${branch}`
    );

    // Build subject claims for all supported GitHub Actions contexts
    const subjectClaims = [
      ...branchConditions,
      `repo:${githubRepo}:pull_request`, // Allow PR workflows for CI
      `repo:${githubRepo}:environment:production`, // Allow production environment deploys
    ];

    // Create the deploy role that GitHub Actions will assume
    this.deployRole = new iam.Role(this, 'DeployRole', {
      roleName: `github-actions-${githubRepo.replace('/', '-')}-deploy`,
      description: `Allows GitHub Actions in ${githubRepo} to deploy to AWS`,
      assumedBy: new iam.FederatedPrincipal(
        providerArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': subjectClaims,
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // Add CDK bootstrap permissions (required for CDK deploy)
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CDKBootstrapAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          // CDK bootstrap bucket access
          's3:GetObject',
          's3:ListBucket',
        ],
        resources: [
          `arn:aws:s3:::cdk-*-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
          `arn:aws:s3:::cdk-*-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}/*`,
        ],
      })
    );

    // CloudFormation permissions for CDK deploy
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudFormationAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'cloudformation:DescribeStacks',
          'cloudformation:DescribeStackEvents',
          'cloudformation:DescribeStackResource',
          'cloudformation:DescribeStackResources',
          'cloudformation:GetTemplate',
          'cloudformation:CreateStack',
          'cloudformation:UpdateStack',
          'cloudformation:DeleteStack',
          'cloudformation:CreateChangeSet',
          'cloudformation:DescribeChangeSet',
          'cloudformation:ExecuteChangeSet',
          'cloudformation:DeleteChangeSet',
          'cloudformation:GetTemplateSummary',
        ],
        resources: ['*'], // CDK creates stacks with generated names
      })
    );

    // SSM Parameter Store access (for CDK bootstrap version checking)
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SSMAccess',
        effect: iam.Effect.ALLOW,
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:parameter/cdk-bootstrap/*`,
        ],
      })
    );

    // IAM PassRole for CDK-created roles
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'IAMPassRole',
        effect: iam.Effect.ALLOW,
        actions: ['iam:PassRole'],
        resources: [`arn:aws:iam::${cdk.Stack.of(this).account}:role/cdk-*`],
      })
    );

    // AssumeRole for CDK bootstrap roles (deploy, lookup, cfn-exec, publishing)
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CDKBootstrapRoleAssume',
        effect: iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${cdk.Stack.of(this).account}:role/cdk-*`],
      })
    );

    // CDK asset publishing permissions
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CDKAssetPublishing',
        effect: iam.Effect.ALLOW,
        actions: [
          's3:PutObject',
          's3:GetObject',
          's3:ListBucket',
          's3:GetBucketLocation',
        ],
        resources: [
          `arn:aws:s3:::cdk-*-assets-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
          `arn:aws:s3:::cdk-*-assets-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}/*`,
        ],
      })
    );

    // Add site bucket permissions if provided
    if (siteBucketArn) {
      this.deployRole.addToPolicy(
        new iam.PolicyStatement({
          sid: 'SiteBucketAccess',
          effect: iam.Effect.ALLOW,
          actions: [
            's3:PutObject',
            's3:DeleteObject',
            's3:GetObject',
            's3:ListBucket',
            's3:GetBucketLocation',
          ],
          resources: [siteBucketArn, `${siteBucketArn}/*`],
        })
      );
    }

    // Add CloudFront invalidation permissions if provided
    if (distributionId) {
      this.deployRole.addToPolicy(
        new iam.PolicyStatement({
          sid: 'CloudFrontInvalidation',
          effect: iam.Effect.ALLOW,
          actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
          resources: [
            `arn:aws:cloudfront::${cdk.Stack.of(this).account}:distribution/${distributionId}`,
          ],
        })
      );
    }

    // Read-only permissions for verification/diff operations
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ReadOnlyVerification',
        effect: iam.Effect.ALLOW,
        actions: [
          's3:GetBucketPolicy',
          's3:GetBucketTagging',
          's3:GetBucketVersioning',
          's3:GetEncryptionConfiguration',
          's3:GetBucketPublicAccessBlock',
          's3:GetBucketAcl',
          's3:GetBucketCORS',
          's3:GetBucketWebsite',
          's3:GetLifecycleConfiguration',
          's3:GetBucketLogging',
          's3:GetBucketNotification',
          's3:GetBucketOwnershipControls',
          's3:GetReplicationConfiguration',
          'cloudfront:GetDistribution',
          'cloudfront:GetDistributionConfig',
          'cloudfront:ListDistributions',
          'cloudfront:GetOriginAccessControl',
          'cloudfront:GetResponseHeadersPolicy',
          'cloudfront:GetCachePolicy',
          'route53:GetHostedZone',
          'route53:ListResourceRecordSets',
          'route53:GetChange',
          'acm:DescribeCertificate',
          'acm:ListCertificates',
        ],
        resources: ['*'],
      })
    );

    // Permissions needed to create/manage the infrastructure
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'InfrastructureManagement',
        effect: iam.Effect.ALLOW,
        actions: [
          // S3 bucket management
          's3:CreateBucket',
          's3:DeleteBucket',
          's3:PutBucketPolicy',
          's3:DeleteBucketPolicy',
          's3:PutBucketVersioning',
          's3:PutBucketPublicAccessBlock',
          's3:PutEncryptionConfiguration',
          's3:PutLifecycleConfiguration',
          's3:PutBucketOwnershipControls',
          // CloudFront management
          'cloudfront:CreateDistribution',
          'cloudfront:UpdateDistribution',
          'cloudfront:DeleteDistribution',
          'cloudfront:CreateOriginAccessControl',
          'cloudfront:UpdateOriginAccessControl',
          'cloudfront:DeleteOriginAccessControl',
          'cloudfront:CreateResponseHeadersPolicy',
          'cloudfront:UpdateResponseHeadersPolicy',
          'cloudfront:DeleteResponseHeadersPolicy',
          'cloudfront:CreateCachePolicy',
          'cloudfront:UpdateCachePolicy',
          'cloudfront:DeleteCachePolicy',
          'cloudfront:TagResource',
          'cloudfront:UntagResource',
          // Route53 management
          'route53:ChangeResourceRecordSets',
          // ACM for SSL certificates
          'acm:RequestCertificate',
          'acm:DeleteCertificate',
          'acm:AddTagsToCertificate',
        ],
        resources: ['*'],
      })
    );
  }

  /**
   * Add permissions to access a specific S3 bucket for site deployment.
   */
  public addBucketPermissions(bucket: s3.IBucket): void {
    bucket.grantReadWrite(this.deployRole);
    bucket.grantDelete(this.deployRole);
  }

  /**
   * Add permissions to invalidate a specific CloudFront distribution.
   */
  public addDistributionPermissions(distribution: cloudfront.IDistribution): void {
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudFrontDistributionAccess',
        effect: iam.Effect.ALLOW,
        actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
        resources: [
          `arn:aws:cloudfront::${cdk.Stack.of(this).account}:distribution/${distribution.distributionId}`,
        ],
      })
    );
  }
}

/**
 * Create the GitHub OIDC Provider if it doesn't exist.
 * This should be deployed once per AWS account.
 */
export class GithubOidcProvider extends Construct {
  public readonly provider: iam.OpenIdConnectProvider;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.provider = new iam.OpenIdConnectProvider(this, 'Provider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      // GitHub's OIDC thumbprints
      thumbprints: [
        '6938fd4d98bab03faadb97b34396831e3780aea1',
        '1c58a3a8518e8759bf075b76b750d4f2df264fcd',
      ],
    });
  }
}
