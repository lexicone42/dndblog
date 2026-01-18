#!/usr/bin/env npx tsx

import * as cdk from 'aws-cdk-lib';
import { StaticSiteStack } from '../lib/static-site-stack.js';
import { GithubOidcStack } from '../lib/github-oidc-stack.js';

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
  });
}

/**
 * Static Site Stack
 *
 * Deploy the main site infrastructure:
 *
 *   cdk deploy StaticSiteStack \
 *     --context domainName=chronicles.mawframe.ninja \
 *     --context hostedZoneDomain=mawframe.ninja
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
    description: 'Static campaign archive: S3 + CloudFront + Route53 + ACM',
  });
} else if (!githubRepo) {
  // Provide helpful error message if no context is provided
  console.log(`
Usage: cdk deploy <StackName> [options]

Available stacks:

  StaticSiteStack - Static site infrastructure (S3 + CloudFront)
    Required context:
      --context domainName=chronicles.example.com
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
    --context domainName=chronicles.example.com \\
    --context hostedZoneDomain=example.com

  # Show changes before deploying
  cdk diff StaticSiteStack \\
    --context domainName=chronicles.example.com \\
    --context hostedZoneDomain=example.com
`);
}

app.synth();
