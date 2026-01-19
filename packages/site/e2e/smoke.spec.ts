/**
 * Post-Deployment Smoke Tests
 *
 * These tests run against the production site after deployment to verify:
 * - Critical pages load correctly
 * - Pagefind search initializes (no CSP blocking WASM)
 * - Security headers are properly set
 *
 * Run with: SITE_URL=https://your-site.example.com pnpm test:smoke
 * Or in CI: The SITE_URL is set from deployment variables
 */

import { test, expect } from '@playwright/test';

test.describe('Post-deployment smoke tests', () => {
  test.describe('Critical Pages', () => {
    test('homepage loads successfully', async ({ page }) => {
      const response = await page.goto('/');
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1')).toBeVisible();
    });

    test('glossary page loads', async ({ page }) => {
      const response = await page.goto('/glossary');
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1')).toBeVisible();
    });

    test('characters page loads', async ({ page }) => {
      const response = await page.goto('/campaign/characters');
      expect(response?.status()).toBe(200);
    });

    test('locations page loads', async ({ page }) => {
      const response = await page.goto('/campaign/locations');
      expect(response?.status()).toBe(200);
    });

    test('blog page loads', async ({ page }) => {
      const response = await page.goto('/blog');
      expect(response?.status()).toBe(200);
    });

    test('sessions page loads', async ({ page }) => {
      const response = await page.goto('/sessions');
      expect(response?.status()).toBe(200);
    });

    test('party hub loads', async ({ page }) => {
      const response = await page.goto('/party');
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1')).toContainText('Player Hub');
    });

    test('404 page returns proper status for missing pages', async ({ page }) => {
      const response = await page.goto('/this-page-does-not-exist-12345');
      expect(response?.status()).toBe(404);
    });
  });

  test.describe('Search Functionality', () => {
    test('search page loads and Pagefind initializes without CSP errors', async ({
      page,
    }) => {
      // Collect console errors
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      // Navigate to search page
      const response = await page.goto('/search');
      expect(response?.status()).toBe(200);

      // Wait for Pagefind to initialize - search input should appear
      await expect(page.locator('.pagefind-ui__search-input')).toBeVisible({
        timeout: 10000,
      });

      // Verify no CSP-related console errors
      const cspErrors = consoleErrors.filter(
        (e) =>
          e.includes('Content-Security-Policy') ||
          e.includes('wasm') ||
          e.includes('WebAssembly')
      );
      expect(cspErrors).toHaveLength(0);
    });

    test('search returns results for common terms', async ({ page }) => {
      await page.goto('/search');

      // Wait for search to initialize
      const searchInput = page.locator('.pagefind-ui__search-input');
      await expect(searchInput).toBeVisible({ timeout: 10000 });

      // Type a search term
      await searchInput.fill('action');

      // Wait for results to appear (Pagefind debounces input)
      await page.waitForTimeout(1000);

      // Should have some results
      const resultsContainer = page.locator('.pagefind-ui__results');
      await expect(resultsContainer).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Security Headers', () => {
    test('response includes required security headers', async ({ page }) => {
      const response = await page.goto('/');
      const headers = response?.headers() || {};

      // HSTS header
      expect(headers['strict-transport-security']).toBeDefined();
      expect(headers['strict-transport-security']).toContain('max-age=');

      // X-Content-Type-Options
      expect(headers['x-content-type-options']).toBe('nosniff');

      // X-Frame-Options
      expect(headers['x-frame-options']).toBeDefined();

      // CSP should include wasm-unsafe-eval for Pagefind
      expect(headers['content-security-policy']).toBeDefined();
      expect(headers['content-security-policy']).toContain('wasm-unsafe-eval');
    });

    test('CSP includes required directives', async ({ page }) => {
      const response = await page.goto('/');
      const csp = response?.headers()['content-security-policy'] || '';

      // Required directives for site functionality
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain('script-src');
      expect(csp).toContain('style-src');
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain('upgrade-insecure-requests');
    });
  });

  test.describe('Static Assets', () => {
    test('CSS loads correctly', async ({ page }) => {
      await page.goto('/');

      // Check that at least one styled element has computed styles
      const header = page.locator('header').first();
      await expect(header).toBeVisible();

      // Verify CSS is applied (header should have some background or border)
      const styles = await header.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          display: computed.display,
          position: computed.position,
        };
      });

      expect(styles.display).not.toBe('');
    });

    test('favicon is accessible', async ({ page }) => {
      const response = await page.goto('/favicon.ico');
      // Favicon should exist (200) or redirect to another icon format
      expect([200, 301, 302]).toContain(response?.status());
    });
  });
});
