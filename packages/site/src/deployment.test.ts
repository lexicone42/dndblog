/**
 * Deployment Configuration Tests
 *
 * These tests verify that deployment-related configurations are correct,
 * including security headers and CSP settings required for features like
 * Pagefind search (which uses WebAssembly).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DIST_DIR = path.join(__dirname, '..', 'dist');

// Check if dist exists (only available after build)
const distExists = fs.existsSync(DIST_DIR);

describe('Security Headers', () => {
  it('should have _headers file for deployment platforms', () => {
    const headersPath = path.join(PUBLIC_DIR, '_headers');
    expect(fs.existsSync(headersPath)).toBe(true);
  });

  it('should allow WebAssembly in CSP for Pagefind search', () => {
    const headersPath = path.join(PUBLIC_DIR, '_headers');
    const content = fs.readFileSync(headersPath, 'utf-8');

    // Pagefind uses WebAssembly which requires 'wasm-unsafe-eval'
    expect(content).toContain('wasm-unsafe-eval');
  });

  it('should have reasonable CSP directives', () => {
    const headersPath = path.join(PUBLIC_DIR, '_headers');
    const content = fs.readFileSync(headersPath, 'utf-8');

    // Basic security directives should be present
    expect(content).toContain('Content-Security-Policy');
    expect(content).toContain("default-src 'self'");
    expect(content).toContain("script-src");
    expect(content).toContain("style-src");
  });

  it('should include other security headers', () => {
    const headersPath = path.join(PUBLIC_DIR, '_headers');
    const content = fs.readFileSync(headersPath, 'utf-8');

    expect(content).toContain('X-Frame-Options');
    expect(content).toContain('X-Content-Type-Options');
  });
});

// Page Build Verification - only runs after build (when dist/ exists)
describe.skipIf(!distExists)('Page Build Verification', () => {
  it('should build homepage', () => {
    const pagePath = path.join(DIST_DIR, 'index.html');
    expect(fs.existsSync(pagePath)).toBe(true);

    const content = fs.readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Chronicles of the Mawframe');
  });

  it('should build sessions page', () => {
    const pagePath = path.join(DIST_DIR, 'sessions', 'index.html');
    expect(fs.existsSync(pagePath)).toBe(true);
  });

  it('should build party hub page', () => {
    const pagePath = path.join(DIST_DIR, 'party', 'index.html');
    expect(fs.existsSync(pagePath)).toBe(true);

    const content = fs.readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Player Hub');
  });

  it('should build reference pages', () => {
    const referencePath = path.join(DIST_DIR, 'reference', 'index.html');
    expect(fs.existsSync(referencePath)).toBe(true);
  });

  it('should build campaign entity pages', () => {
    const charactersPath = path.join(DIST_DIR, 'campaign', 'characters', 'index.html');
    expect(fs.existsSync(charactersPath)).toBe(true);

    const locationsPath = path.join(DIST_DIR, 'campaign', 'locations', 'index.html');
    expect(fs.existsSync(locationsPath)).toBe(true);
  });

  it('should build search page with Pagefind', () => {
    const searchPath = path.join(DIST_DIR, 'search', 'index.html');
    expect(fs.existsSync(searchPath)).toBe(true);

    // Pagefind output should exist
    const pagefindPath = path.join(DIST_DIR, 'pagefind');
    expect(fs.existsSync(pagefindPath)).toBe(true);
  });
});
