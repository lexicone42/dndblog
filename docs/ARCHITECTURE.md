# Architecture

This document describes the system architecture of Rudiger's Evocation of Events - a static site template for TTRPG campaign archives.

## Overview

The platform is a static site generator that produces a fully self-contained campaign archive. Content is written in Markdown/YAML, validated at build time, and deployed to AWS for global distribution.

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
Source Content     Entity Validation    Astro Build        S3 Sync
    │                    │                   │                │
    ▼                    ▼                   ▼                ▼
┌────────┐         ┌──────────┐         ┌────────┐      ┌────────┐
│  .md   │────────▶│ Validate │────────▶│  SSG   │─────▶│ Deploy │
│ files  │         │ Entities │         │  HTML  │      │        │
└────────┘         └──────────┘         └────────┘      └────────┘
```

**Entity Validation** (`packages/site/scripts/validate-entities.ts`):
- Validates required frontmatter fields per entity type
- Checks cross-references between entities (e.g., relationship targets exist)
- Verifies symmetric relationships (if A→B, then B→A)
- Detects orphaned entities with no references
- Runs automatically before `astro check` in the build pipeline

### Content Model

Campaign content is stored in YAML files with typed frontmatter:

```typescript
// Example: Character entity
interface Character {
  name: string;
  status: 'active' | 'deceased' | 'missing';
  subtype?: 'pc' | 'npc' | 'ally' | 'enemy';
  description?: string;
  tags?: string[];
  // ... additional D&D-specific fields
}
```

Entity types include: `character`, `enemy`, `location`, `faction`, `item`, `spell`.

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

### PWA and Offline Support

The site includes Progressive Web App capabilities:
- **Service Worker** - Caches static assets and content pages
- **Offline Page** - Themed fallback UI with cached page links
- **Manifest** - Installable on mobile devices
- **Cache Strategy** - Stale-while-revalidate for content, cache-first for assets

### Accessibility Features

- **prefers-reduced-motion** - Respects user motion preferences
- **ARIA live regions** - Screen reader announcements for dynamic content
- **WCAG AA color contrast** - All text and UI elements meet 4.5:1 ratio
- **Keyboard navigation** - Full keyboard accessibility throughout

## Monitoring

### CloudWatch Alarms

The platform includes proactive monitoring via CloudWatch alarms:

| Alarm | Threshold | Purpose |
|-------|-----------|---------|
| CloudFront 5xx Errors | > 1% for 15 min | Origin/server problems |
| CloudFront 4xx Errors | > 5% for 15 min | Broken links or attacks |

### Other Observability

- CloudFront access logs (optional, disabled by default)
- GitHub Actions workflow history
- Smoke tests post-deployment verification
