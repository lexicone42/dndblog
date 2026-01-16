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
  it('should build campaign landing page', () => {
    const pagePath = path.join(DIST_DIR, 'campaign', 'index.html');
    expect(fs.existsSync(pagePath)).toBe(true);
    
    const content = fs.readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Player Hub');
    expect(content).toContain('Sign in with Account');
  });

  it('should build auth callback page', () => {
    const pagePath = path.join(DIST_DIR, 'auth', 'callback', 'index.html');
    expect(fs.existsSync(pagePath)).toBe(true);
    
    const content = fs.readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Signing in');
    expect(content).toContain('Completing authentication');
  });

  it('should build DM party tracker page', () => {
    const pagePath = path.join(DIST_DIR, 'dm', 'party-tracker', 'index.html');
    expect(fs.existsSync(pagePath)).toBe(true);
    
    const content = fs.readFileSync(pagePath, 'utf-8');
    expect(content).toContain('Party Tracker');
    expect(content).toContain('DM Dashboard');
  });

  it('should build party session tracker pages', () => {
    // Check at least one session tracker page exists
    const rudigerPath = path.join(DIST_DIR, 'party', 'session', 'rudiger', 'index.html');
    expect(fs.existsSync(rudigerPath)).toBe(true);
    
    const content = fs.readFileSync(rudigerPath, 'utf-8');
    expect(content).toContain('Character Dashboard');
  });
});
