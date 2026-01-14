import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { GithubOidc, GithubOidcProvider } from './constructs/github-oidc.js';

/**
 * Properties for the GitHub OIDC stack.
 * Requires the GitHub repository name via CDK context.
 */
export interface GithubOidcStackProps extends cdk.StackProps {
  /** GitHub repository in format "owner/repo" */
  githubRepo: string;
  /** Optional: S3 bucket ARN for site deployment */
  siteBucketArn?: string;
  /** Optional: CloudFront distribution ID for invalidation */
  distributionId?: string;
}

/**
 * Stack that provisions GitHub OIDC authentication for GitHub Actions.
 *
 * This stack should be deployed FIRST (before the static site stack),
 * and typically only needs to be deployed once per repository.
 *
 * After deployment:
 * 1. Copy the output role ARN
 * 2. Add it to GitHub repository secrets as AWS_DEPLOY_ROLE_ARN
 * 3. Configure GitHub Actions to use OIDC authentication
 *
 * Security features:
 * - Uses federated identity (no long-lived credentials)
 * - Restricted to specific repository
 * - Deploy actions limited to main branch
 * - Least-privilege permissions
 */
export class GithubOidcStack extends cdk.Stack {
  public readonly deployRoleArn: string;

  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);

    const { githubRepo, siteBucketArn, distributionId } = props;

    // Create the OIDC provider (idempotent - safe to create if already exists)
    new GithubOidcProvider(this, 'OidcProvider');

    // Create the deploy role for GitHub Actions
    const githubOidc = new GithubOidc(this, 'GithubOidc', {
      githubRepo,
      allowedBranches: ['main'],
      siteBucketArn,
      distributionId,
    });

    this.deployRoleArn = githubOidc.deployRole.roleArn;

    // Output the role ARN for GitHub Actions configuration
    new cdk.CfnOutput(this, 'DeployRoleArnOutput', {
      value: this.deployRoleArn,
      description: 'IAM role ARN for GitHub Actions. Add this to GitHub secrets as AWS_DEPLOY_ROLE_ARN',
      exportName: `${id}-DeployRoleArn`,
    });

    new cdk.CfnOutput(this, 'GithubRepoOutput', {
      value: githubRepo,
      description: 'GitHub repository this role is configured for',
      exportName: `${id}-GithubRepo`,
    });
  }
}
