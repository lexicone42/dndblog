#!/usr/bin/env npx tsx

import * as cdk from 'aws-cdk-lib';
import { StaticSiteStack } from '../lib/static-site-stack.js';
import { GithubOidcStack } from '../lib/github-oidc-stack.js';
import { DmNotesStack } from '../lib/dm-notes-stack.js';
import { AuthStack } from '../lib/auth-stack.js';

const app = new cdk.App();

// Get configuration from CDK context
const domainName = app.node.tryGetContext('domainName');
const hostedZoneDomain = app.node.tryGetContext('hostedZoneDomain');
const githubRepo = app.node.tryGetContext('githubRepo');

// Environment configuration
// CloudFront certificates must be in us-east-1
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'us-east-1', // Required for CloudFront ACM certificates
};

/**
 * GitHub OIDC Stack
 *
 * Deploy this first to set up secure GitHub Actions authentication:
 *
 *   cdk deploy GithubOidcStack --context githubRepo=owner/repo
 *
 * After deployment, add the output role ARN to GitHub secrets as AWS_DEPLOY_ROLE_ARN
 */
if (githubRepo) {
  new GithubOidcStack(app, 'GithubOidcStack', {
    env,
    githubRepo,
    description: 'GitHub OIDC authentication for GitHub Actions CI/CD',
    // Optional: Add these after StaticSiteStack is deployed to grant specific permissions
    // siteBucketArn: '<bucket-arn-from-static-site-stack>',
    // distributionId: '<distribution-id-from-static-site-stack>',
  });
}

/**
 * Static Site Stack
 *
 * Deploy the main site infrastructure:
 *
 *   cdk deploy StaticSiteStack \
 *     --context domainName=blog.example.com \
 *     --context hostedZoneDomain=example.com
 *
 * Prerequisites:
 * - AWS account must be CDK bootstrapped: cdk bootstrap
 * - Hosted zone must exist in Route53 for the domain
 * - AWS credentials must have permissions to create resources
 */
if (domainName && hostedZoneDomain) {
  new StaticSiteStack(app, 'StaticSiteStack', {
    env,
    domainName,
    hostedZoneDomain,
    description: 'Static blog infrastructure: S3 + CloudFront + Route53 + ACM',
  });

  // DM Notes API Stack - for secure markdown note submission
  new DmNotesStack(app, 'DmNotesStack', {
    env,
    allowedOrigin: `https://${domainName}`,
    description: 'DM Notes API: Lambda + API Gateway + S3 for session note uploads',
  });

  // Auth Stack - Cognito User Pool for player authentication
  new AuthStack(app, 'AuthStack', {
    env,
    siteDomain: domainName,
    cognitoDomainPrefix: 'chronicles-mawframe',
    description: 'Authentication: Cognito User Pool for player login',
    initialUsers: [
      // Test user: Rudiger's player
      {
        email: 'bryan.egan@gmail.com',
        group: 'player',
        characterSlug: 'rudiger',
      },
    ],
  });
} else if (!githubRepo) {
  // Provide helpful error message if no context is provided
  console.log(`
Usage: cdk deploy <StackName> [options]

Available stacks:

  StaticSiteStack - Main site infrastructure
    Required context:
      --context domainName=blog.example.com
      --context hostedZoneDomain=example.com

  GithubOidcStack - GitHub Actions authentication (deploy first)
    Required context:
      --context githubRepo=owner/repo

Examples:

  # Bootstrap CDK (first time only)
  cdk bootstrap

  # Deploy GitHub OIDC (first time only)
  cdk deploy GithubOidcStack --context githubRepo=myorg/myblog

  # Deploy static site
  cdk deploy StaticSiteStack \\
    --context domainName=blog.example.com \\
    --context hostedZoneDomain=example.com

  # Show changes before deploying
  cdk diff StaticSiteStack \\
    --context domainName=blog.example.com \\
    --context hostedZoneDomain=example.com
`);
}

app.synth();
