# Deployment Guide

This guide covers deploying the Rudiger's Evocation of Events to AWS.

## Prerequisites

1. **AWS Account** with admin access (or sufficient IAM permissions)
2. **AWS CLI** installed and configured
3. **Node.js 20+** and **pnpm 9+**
4. **Route53 Hosted Zone** for your domain

## Initial Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Bootstrap CDK

If you haven't used CDK in this AWS account/region before:

```bash
cd packages/infra
npx cdk bootstrap aws://ACCOUNT-ID/us-east-1
```

### 3. Deploy GitHub OIDC (First Time Only)

This creates the OIDC provider and IAM role for GitHub Actions:

```bash
cd packages/infra
cdk deploy GithubOidcStack --context githubRepo=YOUR-ORG/YOUR-REPO
```

**Important:** Note the output `DeployRoleArnOutput` - you'll need this for GitHub.

### 4. Configure GitHub Repository

#### Secrets (Settings → Secrets → Actions)

| Secret | Value |
|--------|-------|
| `AWS_DEPLOY_ROLE_ARN` | IAM role ARN from step 3 |

#### Variables (Settings → Variables → Actions)

| Variable | Example | Description |
|----------|---------|-------------|
| `DOMAIN_NAME` | `chronicles.mawframe.ninja` | Your blog domain |
| `HOSTED_ZONE_DOMAIN` | `mawframe.ninja` | Route53 hosted zone |

#### Environment (Optional)

Create a `production` environment with:
- Require approval before deployment (recommended)
- Restrict to `main` branch only

## Manual Deployment

### Full Deploy

```bash
./scripts/deploy.sh \
  --domain chronicles.mawframe.ninja \
  --zone mawframe.ninja
```

### Options

```bash
./scripts/deploy.sh --help

Options:
  --domain <domain>         Domain name (e.g., chronicles.mawframe.ninja)
  --zone <zone>             Hosted zone domain (e.g., mawframe.ninja)
  --skip-build              Skip the build step
  --require-approval        Require manual approval for CDK changes
```

### Individual Steps

```bash
# Build only
./scripts/build.sh

# Deploy static site infrastructure
cd packages/infra
cdk deploy StaticSiteStack \
  --context domainName=chronicles.mawframe.ninja \
  --context hostedZoneDomain=mawframe.ninja

# Deploy DM Notes API (separate stack)
cdk deploy DmNotesStack \
  --context allowedOrigin=https://chronicles.mawframe.ninja

# Sync to S3 only (after CDK deploy)
aws s3 sync packages/site/dist/ s3://BUCKET-NAME --delete

# Invalidate CloudFront
aws cloudfront create-invalidation \
  --distribution-id DISTRIBUTION-ID \
  --paths "/*"
```

### User Management (Cognito)

After deploying `AuthStack` and `DmNotesStack`, add users via the AWS Console or CLI:

```bash
# Create a DM user
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_XXXXXX \
  --username dm@example.com \
  --user-attributes Name=email,Value=dm@example.com Name=email_verified,Value=true

# Add to DM group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id us-east-1_XXXXXX \
  --username dm@example.com \
  --group-name dm

# Create a player user with character assignment
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_XXXXXX \
  --username player@example.com \
  --user-attributes \
    Name=email,Value=player@example.com \
    Name=email_verified,Value=true \
    Name=custom:characterSlug,Value=rudiger

# Add to player group
aws cognito-idp admin-add-user-to-group \
  --user-pool-id us-east-1_XXXXXX \
  --username player@example.com \
  --group-name player
```

**Groups:**
- `dm` - Full access to DM dashboard, entity staging, draft approval
- `player` - Access to session tracker, character drafts

### AI Review Setup (Optional)

```bash
# Optionally enable/disable AI review
aws ssm put-parameter \
  --name "/dndblog/ai-review-enabled" \
  --value "true" \
  --type String \
  --overwrite
```

### GitHub PAT Setup (Draft Approval Flow)

To enable the DM to approve player drafts and create GitHub PRs:

```bash
# Create a GitHub Personal Access Token with 'repo' scope
# Then store it in SSM:
aws ssm put-parameter \
  --name "/dndblog/github-pat" \
  --value "ghp_your_token_here" \
  --type SecureString \
  --overwrite
```

Without this token, the approve endpoint will error (reject still works).

Set the API URL as an environment variable for site builds:
```bash
export PUBLIC_DM_NOTES_API_URL=https://xxx.execute-api.us-west-2.amazonaws.com
```

Or add to `.env.production` in `packages/site/`:
```
PUBLIC_DM_NOTES_API_URL=https://xxx.execute-api.us-west-2.amazonaws.com
```

## Automated Deployment (GitHub Actions)

Once configured, deployments happen automatically:

1. **Push to main** → Triggers deploy workflow
2. **Pull requests** → Runs CI checks (build, type check, CDK synth)

### Workflow Files

#### CI Workflow (`.github/workflows/ci.yml`)

Runs on pull requests:
1. Install dependencies
2. Build all packages
3. Run tests (site, content-pipeline, infra)
4. TypeScript type checking
5. CDK synth (validates templates compile)

**CDK Synth OIDC:** The CI workflow uses a read-only role for CDK synth. This requires the `AWS_CI_ROLE_ARN` secret for synthesizing templates without deployment permissions.

#### Deploy Workflow (`.github/workflows/deploy.yml`)

Runs on push to main:
1. Build site and infrastructure
2. Deploy `StaticSiteStack` via CDK
3. Deploy `DmNotesStack` via CDK (if changed)
4. Sync site files to S3
5. Invalidate CloudFront cache
6. Run smoke tests for verification

### Smoke Tests

Post-deployment verification checks:
- Homepage returns 200 OK
- Key pages are accessible
- Character sheets render correctly
- Security headers are present

```bash
# Run locally against production
PUBLIC_SITE_URL=https://chronicles.mawframe.ninja pnpm test:smoke
```

## Troubleshooting

### "Certificate validation timed out"

ACM certificates require DNS validation. Ensure your Route53 hosted zone is correctly configured and the domain's nameservers match.

```bash
# Check nameservers
aws route53 get-hosted-zone --id ZONE-ID

# Compare with domain registrar
dig NS mawframe.ninja
```

### "Access Denied" when syncing to S3

Ensure your IAM role/user has permissions:
- `s3:PutObject`
- `s3:DeleteObject`
- `s3:ListBucket`

### "CloudFront distribution not found"

Wait for the CDK deploy to complete. The distribution ID is output at the end.

### GitHub Actions failing with "Unable to assume role"

1. Verify `AWS_DEPLOY_ROLE_ARN` secret is set
2. Check the trust policy allows your repository
3. Ensure the branch condition matches

```bash
# Check role trust policy
aws iam get-role --role-name github-actions-YOUR-REPO-deploy
```

## Cost Estimation

| Service | Free Tier | Estimated Cost |
|---------|-----------|----------------|
| S3 | 5GB storage, 20k requests | ~$0.50/month |
| CloudFront | 1TB transfer, 10M requests | ~$0-5/month |
| Route53 | - | $0.50/zone + $0.40/1M queries |
| ACM | Free | $0 |

Total: **~$2-10/month** for a small blog

## Rollback

### Quick Rollback

1. Go to CloudFront console
2. Find your distribution
3. Use "Invalidate" to clear cache
4. S3 versioning allows object restoration

### Full Infrastructure Rollback

```bash
cd packages/infra
cdk diff StaticSiteStack  # Review changes
cdk deploy StaticSiteStack --rollback  # Rollback
```

## Destroying Resources

To completely remove all AWS resources:

```bash
cd packages/infra

# Preview what will be destroyed
cdk diff StaticSiteStack

# Destroy (you'll be prompted for confirmation)
cdk destroy StaticSiteStack
```

**Warning:** This will:
- Delete the S3 bucket (but retain contents due to RETAIN policy)
- Remove CloudFront distribution
- Remove DNS records
- Remove ACM certificate

The S3 bucket contents are preserved by default. To fully clean up, manually empty and delete the bucket.
