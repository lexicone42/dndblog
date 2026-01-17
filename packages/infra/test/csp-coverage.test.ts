/**
 * CSP Coverage Tests
 *
 * These tests scan source files for external URLs (CDN scripts, stylesheets, etc.)
 * and verify they are covered by the Content Security Policy configuration.
 *
 * This prevents CSP violations that only manifest at runtime in production.
 */

import { describe, test, expect } from 'vitest';
import { CSP_DIRECTIVES } from '../lib/shared/csp-config.js';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

// Map of CSP directives to the HTML/JS patterns that require them
const URL_PATTERNS: Record<string, { directive: string; regex: RegExp }[]> = {
  // Script tags require script-src
  scripts: [
    { directive: 'script-src', regex: /<script[^>]+src=["']([^"']+)["']/gi },
    { directive: 'script-src', regex: /src:\s*["']([^"']+\.js)["']/gi },
  ],
  // Link stylesheets require style-src
  stylesheets: [
    { directive: 'style-src', regex: /<link[^>]+href=["']([^"']+\.css)["']/gi },
    { directive: 'style-src', regex: /href=["'](https?:\/\/[^"']+\.css)["']/gi },
  ],
  // Font URLs in CSS require font-src
  fonts: [
    { directive: 'font-src', regex: /url\(["']?(https?:\/\/[^"')]+\.(woff2?|ttf|eot|otf))["']?\)/gi },
  ],
  // Fetch/XHR calls require connect-src
  connections: [
    { directive: 'connect-src', regex: /fetch\(["'`]([^"'`]+)["'`]/gi },
    { directive: 'connect-src', regex: /\.s3\.[^"'`]+\.amazonaws\.com/gi },
  ],
  // Images require img-src
  images: [
    { directive: 'img-src', regex: /<img[^>]+src=["'](https?:\/\/[^"']+)["']/gi },
  ],
};

/**
 * Extract the hostname pattern from a URL for CSP matching
 */
function getHostPattern(url: string): string | null {
  try {
    // Handle relative URLs
    if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
      return null; // Relative URLs are covered by 'self'
    }
    // Handle protocol-relative URLs
    if (url.startsWith('//')) {
      url = 'https:' + url;
    }
    const parsed = new URL(url);
    return `https://${parsed.hostname}`;
  } catch {
    return null;
  }
}

/**
 * Check if a URL is allowed by a CSP directive's source list
 */
function isUrlAllowedByDirective(url: string, sources: string[]): boolean {
  const hostPattern = getHostPattern(url);

  // Relative URLs are covered by 'self'
  if (hostPattern === null) {
    return sources.includes("'self'");
  }

  // Check each source pattern
  for (const source of sources) {
    // Exact match
    if (source === hostPattern) {
      return true;
    }

    // Wildcard subdomain match (e.g., https://*.example.com)
    if (source.includes('*')) {
      const pattern = source.replace(/\./g, '\\.').replace(/\*/g, '[^/]+');
      const regex = new RegExp(`^${pattern}`);
      if (regex.test(hostPattern)) {
        return true;
      }
    }

    // Check if hostPattern starts with source (e.g., source is https://cdn.example.com)
    if (hostPattern.startsWith(source.replace(/\/$/, ''))) {
      return true;
    }
  }

  return false;
}

/**
 * Scan source files and extract external URLs grouped by directive type
 */
function scanSourceFiles(filePatterns: string[]): Map<string, Set<string>> {
  const urlsByDirective = new Map<string, Set<string>>();

  // Initialize sets for each directive
  for (const directive of Object.keys(CSP_DIRECTIVES)) {
    urlsByDirective.set(directive, new Set());
  }

  // Find all matching files
  const files: string[] = [];
  for (const pattern of filePatterns) {
    const matches = glob.sync(pattern, { nodir: true });
    files.push(...matches);
  }

  // Scan each file
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');

    // Apply each pattern type
    for (const patterns of Object.values(URL_PATTERNS)) {
      for (const { directive, regex } of patterns) {
        // Reset regex state
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(content)) !== null) {
          const url = match[1] || match[0];
          // Only track external URLs (https://)
          if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
            urlsByDirective.get(directive)?.add(url);
          }
        }
      }
    }
  }

  return urlsByDirective;
}

describe('CSP Coverage Analysis', () => {
  // Get the project root (packages/infra is 2 levels deep)
  const projectRoot = path.resolve(__dirname, '../../../');
  const siteDir = path.join(projectRoot, 'packages/site');

  test('all external script URLs are covered by script-src', () => {
    const urlsByDirective = scanSourceFiles([
      path.join(siteDir, 'src/**/*.astro'),
      path.join(siteDir, 'src/**/*.ts'),
      path.join(siteDir, 'src/**/*.js'),
    ]);

    const scriptUrls = urlsByDirective.get('script-src') || new Set();
    const scriptSrc = CSP_DIRECTIVES['script-src'];
    const uncoveredUrls: string[] = [];

    for (const url of scriptUrls) {
      if (!isUrlAllowedByDirective(url, scriptSrc)) {
        uncoveredUrls.push(url);
      }
    }

    if (uncoveredUrls.length > 0) {
      const hosts = [...new Set(uncoveredUrls.map((u) => getHostPattern(u)))].filter(Boolean);
      throw new Error(
        `CSP script-src is missing coverage for:\n` +
          `  URLs: ${uncoveredUrls.join(', ')}\n` +
          `  Add these hosts to script-src: ${hosts.join(', ')}\n` +
          `  Current script-src: ${scriptSrc.join(' ')}`
      );
    }

    expect(uncoveredUrls).toHaveLength(0);
  });

  test('all external stylesheet URLs are covered by style-src', () => {
    const urlsByDirective = scanSourceFiles([
      path.join(siteDir, 'src/**/*.astro'),
      path.join(siteDir, 'src/**/*.css'),
    ]);

    const styleUrls = urlsByDirective.get('style-src') || new Set();
    const styleSrc = CSP_DIRECTIVES['style-src'];
    const uncoveredUrls: string[] = [];

    for (const url of styleUrls) {
      if (!isUrlAllowedByDirective(url, styleSrc)) {
        uncoveredUrls.push(url);
      }
    }

    if (uncoveredUrls.length > 0) {
      const hosts = [...new Set(uncoveredUrls.map((u) => getHostPattern(u)))].filter(Boolean);
      throw new Error(
        `CSP style-src is missing coverage for:\n` +
          `  URLs: ${uncoveredUrls.join(', ')}\n` +
          `  Add these hosts to style-src: ${hosts.join(', ')}\n` +
          `  Current style-src: ${styleSrc.join(' ')}`
      );
    }

    expect(uncoveredUrls).toHaveLength(0);
  });

  test('connect-src covers S3 for presigned URL uploads', () => {
    const connectSrc = CSP_DIRECTIVES['connect-src'];

    // The DM notes feature uploads directly to S3 via presigned URLs
    const s3Pattern = 'https://*.s3.us-east-1.amazonaws.com';
    const hasS3Coverage = connectSrc.some(
      (src) => src.includes('.s3.') || src.includes('*.s3.')
    );

    if (!hasS3Coverage) {
      throw new Error(
        `CSP connect-src must include S3 for presigned URL uploads.\n` +
          `  Add: ${s3Pattern}\n` +
          `  Current connect-src: ${connectSrc.join(' ')}`
      );
    }

    expect(hasS3Coverage).toBe(true);
  });

  test('connect-src covers API Gateway', () => {
    const connectSrc = CSP_DIRECTIVES['connect-src'];

    const hasApiGateway = connectSrc.some((src) => src.includes('execute-api'));

    if (!hasApiGateway) {
      throw new Error(
        `CSP connect-src must include API Gateway.\n` +
          `  Add: https://*.execute-api.us-east-1.amazonaws.com\n` +
          `  Current connect-src: ${connectSrc.join(' ')}`
      );
    }

    expect(hasApiGateway).toBe(true);
  });
});

describe('CSP Directive Completeness', () => {
  test('script-src includes all known CDN hosts used in the project', () => {
    // Known CDNs used in the project (from /dm/notes.astro):
    // - unpkg.com: EasyMDE, Turndown
    // - cdnjs.cloudflare.com: marked, highlight.js, DOMPurify
    const requiredHosts = [
      'https://unpkg.com',
      'https://cdnjs.cloudflare.com',
    ];

    const scriptSrc = CSP_DIRECTIVES['script-src'];
    const missing = requiredHosts.filter(
      (host) => !scriptSrc.some((src) => host.startsWith(src.replace(/\/$/, '')))
    );

    if (missing.length > 0) {
      throw new Error(
        `CSP script-src is missing known CDN hosts:\n` +
          `  Missing: ${missing.join(', ')}\n` +
          `  Current script-src: ${scriptSrc.join(' ')}`
      );
    }

    expect(missing).toHaveLength(0);
  });

  test('style-src includes all known CDN hosts used in the project', () => {
    // Known CDNs used in the project (from /dm/notes.astro):
    // - unpkg.com: EasyMDE styles
    // - cdnjs.cloudflare.com: highlight.js themes
    const requiredHosts = [
      'https://unpkg.com',
      'https://cdnjs.cloudflare.com',
    ];

    const styleSrc = CSP_DIRECTIVES['style-src'];
    const missing = requiredHosts.filter(
      (host) => !styleSrc.some((src) => host.startsWith(src.replace(/\/$/, '')))
    );

    if (missing.length > 0) {
      throw new Error(
        `CSP style-src is missing known CDN hosts:\n` +
          `  Missing: ${missing.join(', ')}\n` +
          `  Current style-src: ${styleSrc.join(' ')}`
      );
    }

    expect(missing).toHaveLength(0);
  });
});
