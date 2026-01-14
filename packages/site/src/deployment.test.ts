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
