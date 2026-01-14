#!/usr/bin/env bash

# Development script for the DnD Blog platform
# Starts Astro dev server with hot reload

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}DnD Blog - Development Server${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

cd "$PROJECT_ROOT"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    pnpm install
    echo ""
fi

# Process content if source exists and is newer than output
CONTENT_SOURCE="${CONTENT_SOURCE:-./sample-content}"
CONTENT_OUTPUT="packages/site/src/content/blog"

if [ -d "$CONTENT_SOURCE" ]; then
    echo -e "${YELLOW}Processing content from $CONTENT_SOURCE...${NC}"
    cd packages/content-pipeline
    pnpm run publish "$PROJECT_ROOT/$CONTENT_SOURCE" 2>/dev/null || true
    cd "$PROJECT_ROOT"
    echo ""
fi

# Start dev server
echo -e "${GREEN}Starting Astro development server...${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

cd packages/site
exec pnpm run dev
