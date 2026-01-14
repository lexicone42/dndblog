import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import { buildCSPString } from '../shared/csp-config.js';

/**
 * Properties for creating a secure CloudFront distribution.
 * Configured with modern security practices:
 * - Origin Access Control (OAC) instead of legacy OAI
 * - TLS 1.2 minimum
 * - Comprehensive security headers (HSTS, CSP, etc.)
 * - Optimized caching for static assets
 */
export interface CdnDistributionProps {
  /** The S3 bucket serving as the origin */
  originBucket: s3.IBucket;
  /** ACM certificate for HTTPS (must be in us-east-1) */
  certificate: acm.ICertificate;
  /** Domain names for the distribution */
  domainNames: string[];
  /** Optional custom error responses */
  errorResponses?: cloudfront.ErrorResponse[];
}

export class CdnDistribution extends Construct {
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: CdnDistributionProps) {
    super(scope, id);

    const { originBucket, certificate, domainNames, errorResponses } = props;

    // Create a security headers policy with OWASP recommended headers
    const securityHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      'SecurityHeadersPolicy',
      {
        responseHeadersPolicyName: `${cdk.Names.uniqueId(this)}-security-headers`,
        comment: 'Security headers for static blog (OWASP best practices)',

        securityHeadersBehavior: {
          // HSTS: Force HTTPS for 1 year, include subdomains
          strictTransportSecurity: {
            accessControlMaxAge: cdk.Duration.days(365),
            includeSubdomains: true,
            preload: true,
            override: true,
          },

          // Prevent MIME type sniffing
          contentTypeOptions: {
            override: true,
          },

          // Prevent clickjacking
          frameOptions: {
            frameOption: cloudfront.HeadersFrameOption.DENY,
            override: true,
          },

          // Control referrer information
          referrerPolicy: {
            referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },

          // XSS Protection (legacy but still useful for older browsers)
          xssProtection: {
            protection: true,
            modeBlock: true,
            override: true,
          },

          // Content Security Policy
          // Centralized in /lib/shared/csp-config.ts - see that file for documentation
          contentSecurityPolicy: {
            contentSecurityPolicy: buildCSPString(),
            override: true,
          },
        },

        // Additional custom headers
        customHeadersBehavior: {
          customHeaders: [
            {
              header: 'Permissions-Policy',
              value: 'geolocation=(), microphone=(), camera=()',
              override: true,
            },
          ],
        },
      }
    );

    // Cache policy optimized for static assets
    const staticCachePolicy = new cloudfront.CachePolicy(this, 'StaticCachePolicy', {
      cachePolicyName: `${cdk.Names.uniqueId(this)}-static-cache`,
      comment: 'Cache policy for static blog assets',
      defaultTtl: cdk.Duration.days(1),
      minTtl: cdk.Duration.seconds(0),
      maxTtl: cdk.Duration.days(365),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
      // Include query strings in cache key (for cache busting)
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
    });

    // Create S3 origin with OAC (Origin Access Control)
    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(originBucket);

    // CloudFront Function to handle directory index files
    // This rewrites /path/ to /path/index.html for subdirectories
    const urlRewriteFunction = new cloudfront.Function(this, 'UrlRewriteFunction', {
      functionName: `${cdk.Names.uniqueId(this)}-url-rewrite`.substring(0, 64),
      comment: 'Rewrite directory URLs to serve index.html',
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // If URI ends with / or has no extension, append index.html
  if (uri.endsWith('/')) {
    request.uri += 'index.html';
  } else if (!uri.includes('.')) {
    request.uri += '/index.html';
  }

  return request;
}
      `),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    // Default error responses for SPA behavior
    const defaultErrorResponses: cloudfront.ErrorResponse[] = [
      {
        httpStatus: 404,
        responseHttpStatus: 404,
        responsePagePath: '/404.html',
        ttl: cdk.Duration.minutes(5),
      },
      {
        httpStatus: 403,
        responseHttpStatus: 404,
        responsePagePath: '/404.html',
        ttl: cdk.Duration.minutes(5),
      },
    ];

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      // Custom domain configuration
      domainNames,
      certificate,

      // Origin configuration
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: staticCachePolicy,
        responseHeadersPolicy: securityHeadersPolicy,
        compress: true,
        functionAssociations: [
          {
            function: urlRewriteFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },

      // Error handling
      errorResponses: errorResponses ?? defaultErrorResponses,

      // Security: Use TLS 1.2 minimum
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,

      // HTTP/2 and HTTP/3 for performance
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,

      // Price class: NA and EU only for cost optimization
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,

      // Enable IPv6
      enableIpv6: true,

      // Logging disabled by default (enable for debugging)
      enableLogging: false,
    });

    // Grant CloudFront read access to the bucket via OAC
    // Note: S3BucketOrigin.withOriginAccessControl handles this automatically
  }
}
