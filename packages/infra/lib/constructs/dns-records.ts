import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';

/**
 * Properties for creating DNS records pointing to CloudFront.
 * Creates both A and AAAA records as aliases to the distribution.
 */
export interface DnsRecordsProps {
  /** The hosted zone to create records in */
  hostedZone: route53.IHostedZone;
  /** The CloudFront distribution to point to */
  distribution: cloudfront.IDistribution;
  /** The domain name for the records (e.g., blog.example.com) */
  domainName: string;
}

export class DnsRecords extends Construct {
  public readonly aRecord: route53.ARecord;
  public readonly aaaaRecord: route53.AaaaRecord;

  constructor(scope: Construct, id: string, props: DnsRecordsProps) {
    super(scope, id);

    const { hostedZone, distribution, domainName } = props;

    // Calculate record name (subdomain portion only)
    // e.g., for "blog.example.com" in zone "example.com", recordName is "blog"
    const recordName = domainName.replace(`.${hostedZone.zoneName}`, '');

    // Create A record (IPv4) pointing to CloudFront
    this.aRecord = new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution)
      ),
      comment: `Alias to CloudFront distribution for ${domainName}`,
    });

    // Create AAAA record (IPv6) pointing to CloudFront
    this.aaaaRecord = new route53.AaaaRecord(this, 'AliasRecordIpv6', {
      zone: hostedZone,
      recordName,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution)
      ),
      comment: `IPv6 alias to CloudFront distribution for ${domainName}`,
    });
  }
}
