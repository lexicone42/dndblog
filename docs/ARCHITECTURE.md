# Architecture

This document describes the system architecture of the Rudiger's Evocation of Events platform.

## Overview

The platform is designed as a modular system that can evolve from a simple static blog (Phase 1) to a full-featured campaign management system with authentication and AI capabilities (Phase 2).

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Users                                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           CloudFront CDN                                 │
│  • Global edge locations                                                 │
│  • HTTPS termination                                                     │
│  • Security headers                                                      │
│  • Caching                                                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             S3 Bucket                                    │
│  • Static site content                                                   │
│  • No public access (OAC only)                                          │
│  • Versioning enabled                                                    │
│  • Encryption at rest                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

## AWS Infrastructure

### Core Components

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **S3** | Static file storage | Block public access, versioning, encryption |
| **CloudFront** | CDN and HTTPS | OAC, TLS 1.2+, security headers |
| **Route53** | DNS management | A/AAAA records aliased to CloudFront |
| **ACM** | SSL certificates | DNS-validated, auto-renewal |
| **IAM** | GitHub Actions auth | OIDC federation, least privilege |

### DM Notes API Components

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **API Gateway** | HTTP API | CORS, rate limiting (5 req/s) |
| **Lambda** | API handlers | Node.js 20, 3 functions |
| **S3** | Notes storage | dm-notes/ prefix, token auth |
| **SSM** | Token storage | SecureString parameter |
| **Bedrock** | AI review | Claude model for notes review |
| **CloudWatch** | Monitoring | Alarms + dashboard |

### Security Architecture

```
                    Internet
                        │
                        ▼
                ┌───────────────┐
                │  CloudFront   │◀─── TLS 1.2+ only
                │   (HTTPS)     │     Security headers
                └───────────────┘
                        │
                        │ OAC (Origin Access Control)
                        ▼
                ┌───────────────┐
                │   S3 Bucket   │◀─── Block all public access
                │               │     Server-side encryption
                └───────────────┘
```

**Security Headers Applied:**
- `Strict-Transport-Security`: Force HTTPS for 1 year
- `X-Content-Type-Options`: Prevent MIME sniffing
- `X-Frame-Options`: Prevent clickjacking
- `Content-Security-Policy`: Restrict resource loading
- `Referrer-Policy`: Control referrer information
- `Permissions-Policy`: Disable unnecessary features

### CI/CD Architecture

```
┌──────────────┐     OIDC Token      ┌──────────────┐
│   GitHub     │◀───────────────────▶│     AWS      │
│   Actions    │                     │    IAM       │
└──────────────┘                     └──────────────┘
       │                                    │
       │ Assume Role                        │
       ▼                                    ▼
┌──────────────┐                    ┌──────────────┐
│    Build     │───────────────────▶│   Deploy     │
│    Site      │                    │   to S3      │
└──────────────┘                    └──────────────┘
```

**No long-lived credentials** - GitHub Actions uses OIDC to assume an IAM role with minimal permissions.

## Application Architecture

### Monorepo Structure

```
dndblog/
├── packages/
│   ├── site/              # Astro SSG application
│   ├── infra/             # AWS CDK infrastructure
│   └── content-pipeline/  # Content processing tools
├── scripts/               # Build/deploy scripts
└── docs/                  # Documentation
```

### Build Pipeline

```
Source Content     Content Pipeline     Astro Build        S3 Sync
    │                    │                   │                │
    ▼                    ▼                   ▼                ▼
┌────────┐         ┌──────────┐         ┌────────┐      ┌────────┐
│  .md   │────────▶│ Validate │────────▶│  SSG   │─────▶│ Deploy │
│ files  │         │ Process  │         │  HTML  │      │        │
└────────┘         └──────────┘         └────────┘      └────────┘
```

### Content Model

```typescript
interface BlogPost {
  // Required
  title: string;
  description: string;
  pubDate: Date;

  // Optional
  updatedDate?: Date;
  heroImage?: string;
  draft?: boolean;
  tags?: string[];
  author?: string;

  // Phase 2 (implemented but not used)
  visibility?: 'public' | 'private' | 'campaign';
  campaignId?: string;
  contributors?: string[];
}
```

## Design Decisions

### Why Astro?

- **Native markdown support** - First-class content collections
- **Partial hydration** - Minimal JavaScript by default
- **Performance** - Excellent Lighthouse scores
- **TypeScript** - Full type safety
- **Active ecosystem** - Modern tooling and plugins

### Why AWS CDK?

- **Infrastructure as code** - Version-controlled infrastructure
- **TypeScript** - Same language as application code
- **L2 constructs** - High-level abstractions with sensible defaults
- **Reusable patterns** - Custom constructs for common patterns

### Why pnpm Workspaces?

- **Disk efficiency** - Shared dependencies via symlinks
- **Strict dependency management** - Prevents phantom dependencies
- **Fast installs** - Content-addressable storage
- **Monorepo support** - First-class workspace features

### Why CloudFront OAC (not OAI)?

- **Recommended approach** - AWS best practice for new deployments
- **Better security** - More granular access control
- **Future-proof** - OAI is legacy

### Why OIDC (not IAM keys)?

- **No secret rotation** - Tokens are short-lived
- **Audit trail** - Actions are traced to specific workflows
- **Least privilege** - Role assumption per-run
- **Security** - No credentials stored in GitHub

## Future Phase 2 Architecture

See [PHASE2-DESIGN.md](PHASE2-DESIGN.md) for the planned evolution including:

- **Cognito** - User authentication with invite-only registration
- **API Gateway + Lambda** - RESTful API for notes
- **DynamoDB** - Single-table design for campaign data
- **KMS** - Encryption for private content
- **Claude API** - AI-powered summarization

## Performance Considerations

### Caching Strategy

| Content Type | Cache-Control | Rationale |
|--------------|---------------|-----------|
| HTML files | `max-age=0, must-revalidate` | Always fresh |
| JS/CSS/images | `max-age=31536000, immutable` | Content-hashed URLs |
| Assets | `max-age=86400` | Daily revalidation |

### Edge Optimization

- **Price Class 100** - North America and Europe only (cost optimization)
- **HTTP/2 and HTTP/3** - Modern protocols
- **Brotli compression** - Smaller payloads
- **IPv6 enabled** - Future-proof connectivity

## Monitoring and Observability

### CloudWatch Alarms

The platform includes proactive monitoring via CloudWatch alarms:

| Alarm | Threshold | Purpose |
|-------|-----------|---------|
| CloudFront 5xx Errors | > 1% for 15 min | Origin/server problems |
| CloudFront 4xx Errors | > 5% for 15 min | Broken links or attacks |
| Lambda Errors (per function) | > 1 in 5 min | Function failures |

### CloudWatch Dashboard

A unified dashboard (`MonitoringDashboard` construct) displays:

**CloudFront Metrics:**
- Request count
- Error rates (4xx, 5xx)
- Bytes transferred

**Lambda Metrics (per function):**
- Invocations
- Errors
- Duration (average and max)
- Throttles and concurrent executions

### Other Observability

- CloudFront access logs (optional, disabled by default)
- GitHub Actions workflow history
- Smoke tests post-deployment verification

### Planned Enhancements

- X-Ray tracing for API calls
- Cost monitoring alerts
- Anomaly detection
