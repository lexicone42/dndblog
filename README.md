# Rudiger's Evocation of Events

[![CI](https://github.com/lexicone42/dndblog/actions/workflows/ci.yml/badge.svg)](https://github.com/lexicone42/dndblog/actions/workflows/ci.yml)
[![Deploy](https://github.com/lexicone42/dndblog/actions/workflows/deploy.yml/badge.svg)](https://github.com/lexicone42/dndblog/actions/workflows/deploy.yml)
[![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-6B5CE7?logo=anthropic)](https://claude.ai/code)

A modular static blog platform built with Astro and deployed to AWS, designed for future extension into a private RPG campaign note-tracking system.

## Overview

**Current Features:**
- Public static blog with markdown content
- D&D 5e 2024 character sheets with interactive components
- Player Hub with Session Tracker and Party Synergies guide
- DM session notes editor with S3 storage and AI review
- CloudWatch monitoring with alarms and dashboards
- PWA support for offline reading

**Coming Soon:** Enhanced content pipeline, private campaign feeds, AI summarization.

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
# Full build pipeline (7 steps)
./scripts/build.sh

# Individual builds
cd packages/site && pnpm build        # Static site
cd packages/infra && pnpm build       # CDK infrastructure
cd packages/content-pipeline && pnpm build  # Content tools
```

The `build.sh` script performs:
1. Install dependencies
2. Build content-pipeline
3. Build site package
4. Build infrastructure
5. Run security audit
6. Run all tests
7. Synthesize CDK templates

### Testing

```bash
# Run all tests
pnpm test

# Run tests with watch mode
pnpm test:watch

# Package-specific tests
pnpm --filter site test              # Site components (74 tests)
pnpm --filter content-pipeline test  # Content processing (61 tests)
pnpm --filter infra test             # CDK constructs (26 tests)

# E2E and smoke tests
pnpm test:e2e                        # Full E2E with Playwright
pnpm test:smoke                      # Quick deployment verification
```

**Test Coverage:**
- **Site:** Character sheet components, utility functions, content validation
- **Content-pipeline:** Markdown parsing, image processing, schema validation
- **Infra:** CDK construct behavior, CloudFormation output verification

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

- [Architecture](docs/ARCHITECTURE.md) - System design and technical decisions
- [Deployment](docs/DEPLOYMENT.md) - AWS deployment and CI/CD guide
- [DM Notes API](docs/DM-NOTES-API.md) - Session notes API reference
- [Character Sheet](docs/CHARACTER-SHEET.md) - Character sheet component system
- [Phase 2 Design](docs/PHASE2-DESIGN.md) - Future features roadmap

## License

Apache-2.0 - See [LICENSE](LICENSE) for details.
