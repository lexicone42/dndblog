#!/usr/bin/env bash

# Deploy script for the DnD Blog platform
# Runs build, deploys CDK stack, syncs to S3, and invalidates CloudFront

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Force us-east-1 region for CloudFront/ACM compatibility
export AWS_REGION="${AWS_REGION:-us-east-1}"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Parse command line arguments
DOMAIN_NAME="${DOMAIN_NAME:-}"
HOSTED_ZONE_DOMAIN="${HOSTED_ZONE_DOMAIN:-}"
SKIP_BUILD="${SKIP_BUILD:-false}"
REQUIRE_APPROVAL="${REQUIRE_APPROVAL:-never}"

usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --domain <domain>         Domain name (e.g., blog.example.com)"
    echo "  --zone <zone>             Hosted zone domain (e.g., example.com)"
    echo "  --skip-build              Skip the build step"
    echo "  --require-approval        Require manual approval for CDK changes (default: never)"
    echo "  --help                    Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  DOMAIN_NAME               Domain name (alternative to --domain)"
    echo "  HOSTED_ZONE_DOMAIN        Hosted zone domain (alternative to --zone)"
    echo "  AWS_PROFILE               AWS profile to use"
    echo "  AWS_REGION                AWS region (default: us-east-1)"
    echo ""
    echo "Example:"
    echo "  $0 --domain blog.example.com --zone example.com"
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --domain)
            DOMAIN_NAME="$2"
            shift 2
            ;;
        --zone)
            HOSTED_ZONE_DOMAIN="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD="true"
            shift
            ;;
        --require-approval)
            REQUIRE_APPROVAL="$2"
            shift 2
            ;;
        --help)
            usage
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            exit 1
            ;;
    esac
done

# Validate required arguments
if [ -z "$DOMAIN_NAME" ] || [ -z "$HOSTED_ZONE_DOMAIN" ]; then
    echo -e "${RED}Error: Domain name and hosted zone domain are required${NC}"
    echo ""
    usage
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &>/dev/null; then
    echo -e "${RED}Error: AWS credentials not configured${NC}"
    echo "Please configure your AWS credentials:"
    echo "  - Set AWS_PROFILE environment variable"
    echo "  - Or run 'aws configure'"
    exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}DnD Blog - Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Domain:      ${GREEN}$DOMAIN_NAME${NC}"
echo -e "Hosted Zone: ${GREEN}$HOSTED_ZONE_DOMAIN${NC}"
echo -e "AWS Account: ${GREEN}$(aws sts get-caller-identity --query Account --output text)${NC}"
echo -e "AWS Region:  ${GREEN}${AWS_REGION:-us-east-1}${NC}"
echo ""

cd "$PROJECT_ROOT"

# Step 1: Run build (unless skipped)
if [ "$SKIP_BUILD" = "true" ]; then
    echo -e "${YELLOW}Skipping build step (--skip-build)${NC}"
else
    echo -e "${YELLOW}Step 1: Running build...${NC}"
    SITE_URL="https://$DOMAIN_NAME" ./scripts/build.sh
    echo ""
fi

# Step 2: Deploy CDK stacks
echo -e "${YELLOW}Step 2: Deploying CDK infrastructure...${NC}"
cd packages/infra

# Deploy StaticSiteStack first
npx cdk deploy StaticSiteStack \
    --require-approval "$REQUIRE_APPROVAL" \
    --context domainName="$DOMAIN_NAME" \
    --context hostedZoneDomain="$HOSTED_ZONE_DOMAIN" \
    --outputs-file cdk-outputs.json

# Deploy DmNotesStack (for DM notes API with CORS configured for the domain)
echo -e "${YELLOW}Step 2b: Deploying DM Notes API...${NC}"
npx cdk deploy DmNotesStack \
    --require-approval "$REQUIRE_APPROVAL" \
    --context domainName="$DOMAIN_NAME" \
    --context hostedZoneDomain="$HOSTED_ZONE_DOMAIN" \
    --outputs-file cdk-outputs-dm.json 2>/dev/null || echo -e "${YELLOW}⚠ DmNotesStack deployment skipped or already up to date${NC}"

# Extract outputs
BUCKET_NAME=$(jq -r '.StaticSiteStack.SiteBucketNameOutput' cdk-outputs.json 2>/dev/null || echo "")
DISTRIBUTION_ID=$(jq -r '.StaticSiteStack.DistributionIdOutput' cdk-outputs.json 2>/dev/null || echo "")

cd "$PROJECT_ROOT"
echo -e "${GREEN}✓ CDK deployment complete${NC}"
echo ""

# Step 3: Sync site to S3
if [ -n "$BUCKET_NAME" ]; then
    echo -e "${YELLOW}Step 3: Syncing site to S3...${NC}"

    # Sync non-HTML files with long cache
    aws s3 sync packages/site/dist/ "s3://$BUCKET_NAME" \
        --delete \
        --cache-control "public, max-age=31536000, immutable" \
        --exclude "*.html"

    # Sync HTML files with no cache
    aws s3 sync packages/site/dist/ "s3://$BUCKET_NAME" \
        --cache-control "public, max-age=0, must-revalidate" \
        --include "*.html"

    echo -e "${GREEN}✓ S3 sync complete${NC}"
else
    echo -e "${YELLOW}⚠ Skipping S3 sync (bucket name not found in outputs)${NC}"
fi
echo ""

# Step 4: Invalidate CloudFront cache
if [ -n "$DISTRIBUTION_ID" ]; then
    echo -e "${YELLOW}Step 4: Invalidating CloudFront cache...${NC}"

    INVALIDATION_ID=$(aws cloudfront create-invalidation \
        --distribution-id "$DISTRIBUTION_ID" \
        --paths "/*" \
        --query 'Invalidation.Id' \
        --output text)

    echo -e "Invalidation ID: ${BLUE}$INVALIDATION_ID${NC}"
    echo -e "${GREEN}✓ Cache invalidation initiated${NC}"
else
    echo -e "${YELLOW}⚠ Skipping CloudFront invalidation (distribution ID not found)${NC}"
fi
echo ""

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Deployment completed successfully!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Site URL: ${BLUE}https://$DOMAIN_NAME${NC}"
echo ""
echo -e "${YELLOW}Note: DNS propagation and CloudFront distribution may take a few minutes.${NC}"
