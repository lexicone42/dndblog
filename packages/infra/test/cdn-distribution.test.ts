/**
 * CDK Infrastructure Tests for CdnDistribution
 *
 * These tests validate that the CloudFront distribution is configured
 * with the correct security headers, caching policies, and CSP.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { CdnDistribution } from '../lib/constructs/cdn-distribution.js';
import { buildCSPString, CSP_DIRECTIVES } from '../lib/shared/csp-config.js';

describe('CdnDistribution', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });

    const bucket = new s3.Bucket(stack, 'TestBucket');
    const cert = acm.Certificate.fromCertificateArn(
      stack,
      'TestCert',
      'arn:aws:acm:us-east-1:123456789012:certificate/test-cert-id'
    );

    new CdnDistribution(stack, 'TestDistribution', {
      originBucket: bucket,
      certificate: cert,
      domainNames: ['test.example.com'],
    });

    template = Template.fromStack(stack);
  });

  describe('Security Configuration', () => {
    test('uses TLS 1.2 minimum protocol version', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          ViewerCertificate: {
            MinimumProtocolVersion: 'TLSv1.2_2021',
          },
        },
      });
    });

    test('redirects HTTP to HTTPS', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          DefaultCacheBehavior: {
            ViewerProtocolPolicy: 'redirect-to-https',
          },
        },
      });
    });

    test('enables HTTP/2 and HTTP/3', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          HttpVersion: 'http2and3',
        },
      });
    });
  });

  describe('Response Headers Policy', () => {
    test('includes CSP with wasm-unsafe-eval for Pagefind', () => {
      template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
        ResponseHeadersPolicyConfig: {
          SecurityHeadersConfig: {
            ContentSecurityPolicy: {
              ContentSecurityPolicy: Match.stringLikeRegexp("wasm-unsafe-eval"),
              Override: true,
            },
          },
        },
      });
    });

    test('includes HSTS with 1-year max-age', () => {
      template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
        ResponseHeadersPolicyConfig: {
          SecurityHeadersConfig: {
            StrictTransportSecurity: {
              AccessControlMaxAgeSec: 31536000, // 365 days
              IncludeSubdomains: true,
              Preload: true,
              Override: true,
            },
          },
        },
      });
    });

    test('includes X-Content-Type-Options nosniff', () => {
      template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
        ResponseHeadersPolicyConfig: {
          SecurityHeadersConfig: {
            ContentTypeOptions: {
              Override: true,
            },
          },
        },
      });
    });

    test('includes X-Frame-Options DENY', () => {
      template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
        ResponseHeadersPolicyConfig: {
          SecurityHeadersConfig: {
            FrameOptions: {
              FrameOption: 'DENY',
              Override: true,
            },
          },
        },
      });
    });

    test('includes Referrer-Policy strict-origin-when-cross-origin', () => {
      template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
        ResponseHeadersPolicyConfig: {
          SecurityHeadersConfig: {
            ReferrerPolicy: {
              ReferrerPolicy: 'strict-origin-when-cross-origin',
              Override: true,
            },
          },
        },
      });
    });

    test('includes XSS protection', () => {
      template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
        ResponseHeadersPolicyConfig: {
          SecurityHeadersConfig: {
            XSSProtection: {
              Protection: true,
              ModeBlock: true,
              Override: true,
            },
          },
        },
      });
    });

    test('includes Permissions-Policy header', () => {
      template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
        ResponseHeadersPolicyConfig: {
          CustomHeadersConfig: {
            Items: Match.arrayWith([
              Match.objectLike({
                Header: 'Permissions-Policy',
                Value: 'geolocation=(), microphone=(), camera=()',
              }),
            ]),
          },
        },
      });
    });
  });

  describe('Cache Policy', () => {
    test('enables Gzip compression', () => {
      template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
        CachePolicyConfig: {
          ParametersInCacheKeyAndForwardedToOrigin: {
            EnableAcceptEncodingGzip: true,
          },
        },
      });
    });

    test('enables Brotli compression', () => {
      template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
        CachePolicyConfig: {
          ParametersInCacheKeyAndForwardedToOrigin: {
            EnableAcceptEncodingBrotli: true,
          },
        },
      });
    });

    test('includes query strings in cache key for cache busting', () => {
      template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
        CachePolicyConfig: {
          ParametersInCacheKeyAndForwardedToOrigin: {
            QueryStringsConfig: {
              QueryStringBehavior: 'all',
            },
          },
        },
      });
    });
  });

  describe('URL Rewrite Function', () => {
    test('creates CloudFront Function for URL rewriting', () => {
      template.hasResourceProperties('AWS::CloudFront::Function', {
        FunctionConfig: {
          Runtime: 'cloudfront-js-2.0',
        },
      });
    });
  });

  describe('Error Responses', () => {
    test('configures 404 error page', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          CustomErrorResponses: Match.arrayWith([
            Match.objectLike({
              ErrorCode: 404,
              ResponseCode: 404,
              ResponsePagePath: '/404.html',
            }),
          ]),
        },
      });
    });

    test('configures 403 to return 404', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          CustomErrorResponses: Match.arrayWith([
            Match.objectLike({
              ErrorCode: 403,
              ResponseCode: 404,
              ResponsePagePath: '/404.html',
            }),
          ]),
        },
      });
    });
  });
});

describe('CSP Configuration', () => {
  test('buildCSPString includes all required directives', () => {
    const csp = buildCSPString();

    // Verify critical directives are present
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).toContain('upgrade-insecure-requests');
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test('CSP_DIRECTIVES has all required directive types', () => {
    const requiredDirectives = [
      'default-src',
      'script-src',
      'style-src',
      'img-src',
      'font-src',
      'connect-src',
      'frame-ancestors',
      'base-uri',
      'form-action',
    ];

    for (const directive of requiredDirectives) {
      expect(CSP_DIRECTIVES).toHaveProperty(directive);
    }
  });

  test('script-src includes wasm-unsafe-eval for Pagefind', () => {
    expect(CSP_DIRECTIVES['script-src']).toContain("'wasm-unsafe-eval'");
  });

  test('connect-src includes API Gateway pattern', () => {
    const connectSrc = CSP_DIRECTIVES['connect-src'];
    expect(connectSrc.some((s) => s.includes('execute-api'))).toBe(true);
  });
});
