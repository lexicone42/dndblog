#!/usr/bin/env bash

# Build script for the DnD Blog platform
# Runs the full build pipeline: clean, content processing, site build, CDK synth

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}DnD Blog - Build Pipeline${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

cd "$PROJECT_ROOT"

# Step 1: Install dependencies
echo -e "${YELLOW}Step 1: Installing dependencies...${NC}"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 2: Clean previous builds
echo -e "${YELLOW}Step 2: Cleaning previous builds...${NC}"
pnpm -r clean 2>/dev/null || true
echo -e "${GREEN}✓ Clean complete${NC}"
echo ""

# Step 3: Run content pipeline (if source content exists)
CONTENT_SOURCE="${CONTENT_SOURCE:-./sample-content}"
if [ -d "$CONTENT_SOURCE" ]; then
    echo -e "${YELLOW}Step 3: Running content pipeline...${NC}"
    cd packages/content-pipeline
    pnpm run publish "$PROJECT_ROOT/$CONTENT_SOURCE" || echo -e "${YELLOW}⚠ No content to process${NC}"
    cd "$PROJECT_ROOT"
    echo -e "${GREEN}✓ Content pipeline complete${NC}"
else
    echo -e "${YELLOW}Step 3: Skipping content pipeline (no source content at $CONTENT_SOURCE)${NC}"
fi
echo ""

# Step 4: Run tests
echo -e "${YELLOW}Step 4: Running tests...${NC}"
cd packages/site
if pnpm test; then
    echo -e "${GREEN}✓ All tests passed${NC}"
else
    echo -e "${RED}✗ Tests failed${NC}"
    exit 1
fi
cd "$PROJECT_ROOT"
echo ""

# Step 5: Build Astro site
echo -e "${YELLOW}Step 5: Building Astro site...${NC}"
cd packages/site
SITE_URL="${SITE_URL:-http://localhost:4321}" pnpm run build
cd "$PROJECT_ROOT"
echo -e "${GREEN}✓ Site build complete${NC}"
echo ""

# Step 6: Synthesize CDK (validate CloudFormation)
echo -e "${YELLOW}Step 6: Validating CDK infrastructure...${NC}"
cd packages/infra
if [ -n "${DOMAIN_NAME:-}" ] && [ -n "${HOSTED_ZONE_DOMAIN:-}" ]; then
    npx cdk synth --quiet \
        --context domainName="$DOMAIN_NAME" \
        --context hostedZoneDomain="$HOSTED_ZONE_DOMAIN"
    echo -e "${GREEN}✓ CDK synthesis complete${NC}"
else
    echo -e "${YELLOW}⚠ Skipping CDK synth (DOMAIN_NAME and HOSTED_ZONE_DOMAIN not set)${NC}"
    echo -e "${YELLOW}  Set these environment variables to validate infrastructure:${NC}"
    echo -e "${YELLOW}    export DOMAIN_NAME=blog.example.com${NC}"
    echo -e "${YELLOW}    export HOSTED_ZONE_DOMAIN=example.com${NC}"
fi
cd "$PROJECT_ROOT"
echo ""

# Step 7: Security audit
echo -e "${YELLOW}Step 7: Running security audit...${NC}"
if pnpm audit --audit-level=high; then
    echo -e "${GREEN}✓ No high or critical vulnerabilities found${NC}"
else
    echo -e "${RED}⚠ Security vulnerabilities detected!${NC}"
    echo -e "${YELLOW}  Run 'pnpm audit' for details${NC}"
fi
echo ""

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Build completed successfully!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Site output: ${BLUE}packages/site/dist/${NC}"
echo -e "Preview locally: ${BLUE}cd packages/site && pnpm preview${NC}"
