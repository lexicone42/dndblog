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

### Code
- No secrets or credentials committed to repository
- Dependencies regularly audited for vulnerabilities
- TypeScript for type safety
