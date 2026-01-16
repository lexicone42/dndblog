# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly:

1. **Do NOT open a public issue** for security vulnerabilities
2. Email the maintainer directly or use GitHub's private vulnerability reporting feature
3. Include as much detail as possible:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a more detailed response within 7 days.

## Security Measures

This project implements the following security measures:

### GitHub Actions
- Workflows use minimal required permissions
- Fork PRs require maintainer approval before running workflows
- Secrets are never exposed in logs
- Dependencies are automatically scanned via Dependabot

### Infrastructure (AWS)
- GitHub OIDC authentication (no long-lived AWS credentials)
- IAM roles follow least-privilege principle
- S3 buckets are not publicly accessible
- CloudFront distributions use HTTPS only

### API Security
- Token-based authentication via SSM SecureString parameters
- Rate limiting (5 req/s, burst 10) on API Gateway
- CORS restrictions (production origin + localhost for dev)
- Pre-signed S3 URLs expire after 5 minutes
- Path validation (notes must use `dm-notes/` prefix)

### Content Security
- Content Security Policy (CSP) headers via CloudFront
- XSS protection via DOMPurify for markdown rendering
- Security headers: HSTS, X-Frame-Options, X-Content-Type-Options
- TLS 1.2+ only

### Code
- No secrets or credentials committed to repository
- Dependencies regularly audited for vulnerabilities
- TypeScript for type safety
- Pre-commit hooks prevent committing sensitive files
