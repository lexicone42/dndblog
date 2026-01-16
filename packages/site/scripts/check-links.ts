#!/usr/bin/env npx tsx
/**
 * Link Validation Script
 *
 * Scans built HTML files for internal links and verifies they point to
 * existing pages. Run this after `astro build` to catch broken links.
 *
 * Usage:
 *   pnpm check-links
 *   npx tsx scripts/check-links.ts
 *
 * Exit codes:
 *   0 - All links valid
 *   1 - Broken links found
 */

import * as fs from 'fs';
import * as path from 'path';

const DIST_DIR = path.join(import.meta.dirname, '..', 'dist');

// Files/patterns to ignore (not actual pages)
const IGNORED_EXTENSIONS = ['.xml', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.webmanifest', '.css', '.js', '.woff', '.woff2'];
const IGNORED_PATHS = [
  '/pagefind/', // Pagefind assets are generated dynamically
  '/_astro/',   // Astro assets
];

interface LinkInfo {
  href: string;
  sourceFile: string;
  lineNumber?: number;
}

interface ValidationResult {
  totalLinks: number;
  checkedLinks: number;
  brokenLinks: LinkInfo[];
  skippedLinks: number;
}

/**
 * Recursively find all HTML files in a directory
 */
function findHtmlFiles(dir: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findHtmlFiles(fullPath));
    } else if (entry.name.endsWith('.html')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Extract internal links from HTML content
 */
function extractLinks(htmlContent: string, sourceFile: string): LinkInfo[] {
  const links: LinkInfo[] = [];
  // Match href attributes with internal links (starting with /)
  const hrefRegex = /href="(\/[^"#]*)"/g;
  let match;

  while ((match = hrefRegex.exec(htmlContent)) !== null) {
    const href = match[1];
    // Calculate approximate line number
    const lineNumber = htmlContent.substring(0, match.index).split('\n').length;
    links.push({ href, sourceFile, lineNumber });
  }

  return links;
}

/**
 * Check if a link should be skipped
 */
function shouldSkipLink(href: string): boolean {
  // Skip links with query parameters (client-side handled)
  if (href.includes('?')) {
    return true;
  }

  // Skip ignored paths
  for (const ignoredPath of IGNORED_PATHS) {
    if (href.startsWith(ignoredPath)) {
      return true;
    }
  }

  // Skip files with ignored extensions
  for (const ext of IGNORED_EXTENSIONS) {
    if (href.endsWith(ext)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a link target exists
 */
function linkExists(href: string, distDir: string): boolean {
  // Normalize the path
  let targetPath: string;

  if (href.endsWith('/')) {
    // /foo/ -> dist/foo/index.html
    targetPath = path.join(distDir, href, 'index.html');
  } else {
    // /foo -> dist/foo/index.html (Astro's default)
    targetPath = path.join(distDir, href, 'index.html');
  }

  return fs.existsSync(targetPath);
}

/**
 * Main validation function
 */
function validateLinks(): ValidationResult {
  const result: ValidationResult = {
    totalLinks: 0,
    checkedLinks: 0,
    brokenLinks: [],
    skippedLinks: 0,
  };

  // Find all HTML files
  const htmlFiles = findHtmlFiles(DIST_DIR);

  if (htmlFiles.length === 0) {
    console.error('No HTML files found in dist/. Have you run astro build?');
    process.exit(1);
  }

  console.log(`Scanning ${htmlFiles.length} HTML files...\n`);

  // Collect all unique links
  const allLinks = new Map<string, LinkInfo[]>();

  for (const htmlFile of htmlFiles) {
    const content = fs.readFileSync(htmlFile, 'utf-8');
    const links = extractLinks(content, htmlFile);

    for (const link of links) {
      result.totalLinks++;

      if (shouldSkipLink(link.href)) {
        result.skippedLinks++;
        continue;
      }

      // Group by href for deduplication in output
      if (!allLinks.has(link.href)) {
        allLinks.set(link.href, []);
      }
      allLinks.get(link.href)!.push(link);
    }
  }

  // Check each unique link
  for (const [href, sources] of allLinks) {
    result.checkedLinks++;

    if (!linkExists(href, DIST_DIR)) {
      // Record all sources for this broken link
      result.brokenLinks.push(...sources);
    }
  }

  return result;
}

/**
 * Format source file path for display
 */
function formatSourcePath(fullPath: string): string {
  return fullPath.replace(DIST_DIR, 'dist');
}

/**
 * Main entry point
 */
function main() {
  console.log('Link Validation\n');
  console.log('='.repeat(60) + '\n');

  const result = validateLinks();

  // Group broken links by href for cleaner output
  const brokenByHref = new Map<string, LinkInfo[]>();
  for (const link of result.brokenLinks) {
    if (!brokenByHref.has(link.href)) {
      brokenByHref.set(link.href, []);
    }
    brokenByHref.get(link.href)!.push(link);
  }

  if (brokenByHref.size > 0) {
    console.log('BROKEN LINKS FOUND:\n');

    for (const [href, sources] of brokenByHref) {
      console.log(`  [BROKEN] ${href}`);
      // Show up to 3 source files
      const displaySources = sources.slice(0, 3);
      for (const source of displaySources) {
        console.log(`     -> ${formatSourcePath(source.sourceFile)}:${source.lineNumber || '?'}`);
      }
      if (sources.length > 3) {
        console.log(`     -> ... and ${sources.length - 3} more files`);
      }
      console.log();
    }
  }

  // Summary
  console.log('='.repeat(60));
  console.log('\nSummary:');
  console.log(`   Total links found:    ${result.totalLinks}`);
  console.log(`   Links checked:        ${result.checkedLinks}`);
  console.log(`   Links skipped:        ${result.skippedLinks}`);
  console.log(`   Broken links:         ${brokenByHref.size}`);

  if (brokenByHref.size > 0) {
    console.log('\n[FAILED] Link validation failed\n');
    process.exit(1);
  } else {
    console.log('\n[PASSED] All links are valid!\n');
    process.exit(0);
  }
}

main();
