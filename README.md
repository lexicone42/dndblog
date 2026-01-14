# Rudiger's Evocation of Events

[![CI](https://github.com/bryanegan/dndblog/actions/workflows/ci.yml/badge.svg)](https://github.com/bryanegan/dndblog/actions/workflows/ci.yml)
[![Deploy](https://github.com/bryanegan/dndblog/actions/workflows/deploy.yml/badge.svg)](https://github.com/bryanegan/dndblog/actions/workflows/deploy.yml)

A modular static blog platform built with Astro and deployed to AWS, designed for future extension into a private RPG campaign note-tracking system.

## Overview

**Phase 1 (Current):** Public static blog with markdown content, deployed to AWS with secure infrastructure.

**Phase 2 (Future):** Authentication, private notes API, AI-powered summarization, private campaign feeds.

## Tech Stack

- **Static Site Generator:** [Astro](https://astro.build) - Native markdown support, excellent performance
- **Infrastructure as Code:** AWS CDK (TypeScript) generating CloudFormation
- **Hosting:** S3 + CloudFront + Route53 + ACM (SSL)
- **Build System:** Node.js with pnpm workspace
- **CI/CD:** GitHub Actions with OIDC authentication (no long-lived credentials)

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- AWS CLI configured (for deployment)

### Local Development

```bash
# Install dependencies
pnpm install

# Start development server
./scripts/dev.sh

# Or manually:
cd packages/site && pnpm dev
```

The site will be available at http://localhost:4321

### Build

```bash
# Full build pipeline
./scripts/build.sh

# Build site only
cd packages/site && pnpm build
```

### Deploy

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment instructions.

```bash
# Deploy to AWS (requires credentials)
./scripts/deploy.sh --domain chronicles.mawframe.ninja --zone mawframe.ninja
```

## Project Structure

```
/
├── packages/
│   ├── site/              # Astro static site
│   │   ├── src/
│   │   │   ├── layouts/   # Page layouts
│   │   │   ├── pages/     # Routes
│   │   │   ├── components/# Reusable components
│   │   │   ├── styles/    # Global CSS
│   │   │   └── content/   # Markdown blog posts
│   │   └── public/        # Static assets
│   │
│   ├── infra/             # AWS CDK infrastructure
│   │   ├── bin/           # CDK app entry
│   │   └── lib/           # Stacks and constructs
│   │
│   └── content-pipeline/  # Content processing CLI
│       └── src/           # Pipeline tools
│
├── scripts/               # Build and deploy scripts
├── docs/                  # Documentation
└── .github/               # GitHub Actions workflows
```

## Content Management

Blog posts are written in Markdown with YAML frontmatter:

```markdown
---
title: "My Blog Post"
description: "A description of my post"
pubDate: 2024-01-15
tags: ["campaign", "adventure"]
author: "Dungeon Master"
---

Your content here...
```

### Frontmatter Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Post title |
| `description` | string | Yes | Short description for SEO |
| `pubDate` | date | Yes | Publication date |
| `updatedDate` | date | No | Last update date |
| `heroImage` | string | No | Path to hero image |
| `draft` | boolean | No | If true, excluded from production |
| `tags` | string[] | No | Post categories |
| `author` | string | No | Author name |

### Content Pipeline

Process content from external sources:

```bash
# Ingest and validate markdown files
pnpm --filter content-pipeline ingest ./my-content

# Process images for web
pnpm --filter content-pipeline screenshots ./my-images

# Full publish pipeline
pnpm --filter content-pipeline publish ./my-content
```

## Security

This project implements security best practices:

- **No public S3 access** - CloudFront Origin Access Control (OAC)
- **HTTPS everywhere** - HTTP redirects to HTTPS
- **TLS 1.2+** - Modern TLS only
- **Security headers** - HSTS, CSP, X-Frame-Options, etc.
- **No secrets in code** - All configuration via environment variables
- **OIDC authentication** - No long-lived AWS credentials in CI/CD
- **Dependency auditing** - Automated security scanning

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - System design and decisions
- [Deployment](docs/DEPLOYMENT.md) - AWS deployment guide
- [Phase 2 Design](docs/PHASE2-DESIGN.md) - Future features roadmap

## License

MIT
