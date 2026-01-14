import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

import { SecureBucket } from './constructs/secure-bucket.js';
import { CdnDistribution } from './constructs/cdn-distribution.js';
import { DnsRecords } from './constructs/dns-records.js';

/**
 * Properties for the static site stack.
 * Requires domain configuration via CDK context.
 */
export interface StaticSiteStackProps extends cdk.StackProps {
  /** The domain name for the site (e.g., blog.example.com) */
  domainName: string;
  /** The hosted zone domain for DNS (e.g., example.com) */
  hostedZoneDomain: string;
}

/**
 * Stack that provisions all infrastructure for the static blog:
 * - S3 bucket for static content (with all public access blocked)
 * - ACM certificate for HTTPS
 * - CloudFront distribution with OAC and security headers
 * - Route53 DNS records (A and AAAA)
 *
 * Security features:
 * - All traffic forced to HTTPS
 * - TLS 1.2 minimum
 * - Comprehensive security headers (HSTS, CSP, X-Frame-Options, etc.)
 * - S3 bucket only accessible via CloudFront OAC
 */
export class StaticSiteStack extends cdk.Stack {
  public readonly bucket: SecureBucket;
  public readonly distribution: CdnDistribution;
  public readonly siteBucketName: string;
  public readonly distributionId: string;
  public readonly distributionDomain: string;

  constructor(scope: Construct, id: string, props: StaticSiteStackProps) {
    super(scope, id, props);

    const { domainName, hostedZoneDomain } = props;

    // Look up the existing hosted zone
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: hostedZoneDomain,
    });

    // Create the secure S3 bucket
    this.bucket = new SecureBucket(this, 'SiteBucket', {
      // Let CDK generate a unique bucket name
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      noncurrentVersionExpirationDays: 30,
    });

    // Create ACM certificate for HTTPS
    // Must be in us-east-1 for CloudFront
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // Create CloudFront distribution with security headers
    this.distribution = new CdnDistribution(this, 'Distribution', {
      originBucket: this.bucket.bucket,
      certificate,
      domainNames: [domainName],
    });

    // Create DNS records pointing to CloudFront
    new DnsRecords(this, 'DnsRecords', {
      hostedZone,
      distribution: this.distribution.distribution,
      domainName,
    });

    // Store commonly needed values
    this.siteBucketName = this.bucket.bucket.bucketName;
    this.distributionId = this.distribution.distribution.distributionId;
    this.distributionDomain = this.distribution.distribution.distributionDomainName;

    // Output useful values
    new cdk.CfnOutput(this, 'SiteBucketNameOutput', {
      value: this.siteBucketName,
      description: 'S3 bucket name for static site content',
      exportName: `${id}-SiteBucketName`,
    });

    new cdk.CfnOutput(this, 'DistributionIdOutput', {
      value: this.distributionId,
      description: 'CloudFront distribution ID for cache invalidation',
      exportName: `${id}-DistributionId`,
    });

    new cdk.CfnOutput(this, 'DistributionDomainOutput', {
      value: this.distributionDomain,
      description: 'CloudFront distribution domain name',
      exportName: `${id}-DistributionDomain`,
    });

    new cdk.CfnOutput(this, 'SiteUrlOutput', {
      value: `https://${domainName}`,
      description: 'Full URL of the deployed site',
      exportName: `${id}-SiteUrl`,
    });
  }
}
