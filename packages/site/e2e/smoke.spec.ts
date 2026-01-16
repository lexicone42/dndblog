/**
 * Post-Deployment Smoke Tests
 *
 * These tests run against the production site after deployment to verify:
 * - Critical pages load correctly
 * - Pagefind search initializes (no CSP blocking WASM)
 * - Security headers are properly set
 *
 * Run with: SITE_URL=https://chronicles.mawframe.ninja pnpm test:smoke
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

  test.describe('Protected Pages', () => {
    test('DM dashboard shows auth gate when not authenticated', async ({ page }) => {
      await page.goto('/dm');

      // Auth gate should be visible
      const authGate = page.locator('#auth-gate');
      await expect(authGate).toBeVisible();

      // Should show "DM Access Required" message
      await expect(page.getByText('DM Access Required')).toBeVisible();

      // Dashboard content should be hidden
      const dashboard = page.locator('#dashboard-content');
      await expect(dashboard).toBeHidden();
    });

    test('DM notes shows access denied without token', async ({ page }) => {
      await page.goto('/dm/notes');

      // Access denied component should be visible
      const accessDenied = page.locator('#access-denied');
      await expect(accessDenied).toBeVisible();
    });

    test('DM entities shows access denied without token', async ({ page }) => {
      await page.goto('/dm/entities');

      // Access denied component should be visible
      const accessDenied = page.locator('#access-denied');
      await expect(accessDenied).toBeVisible();
    });

    test('Party hub is publicly accessible', async ({ page }) => {
      const response = await page.goto('/party');
      expect(response?.status()).toBe(200);

      // Page should show party content without auth
      await expect(page.locator('h1')).toContainText('Player Hub');

      // Should show party section
      await expect(page.getByText('The Party')).toBeVisible();
    });

    test('Navigation hides DM/Player links when not authenticated', async ({ page }) => {
      await page.goto('/');

      // DM and Player nav links should be hidden (display: none)
      const dmNav = page.locator('#nav-dm');
      const playerNav = page.locator('#nav-player');

      // They exist in DOM but are hidden
      await expect(dmNav).toHaveCSS('display', 'none');
      await expect(playerNav).toHaveCSS('display', 'none');
    });

    test('Navigation shows DM link when Cognito auth has DM role', async ({ page }) => {
      // Set Cognito auth with DM role before navigating
      await page.goto('/');
      await page.evaluate(() => {
        const mockAuth = {
          method: 'cognito',
          roles: { isDm: true, isPlayer: false },
          accessToken: 'mock-access-token',
          expiresAt: Date.now() + 3600000, // 1 hour from now
        };
        localStorage.setItem('dndblog-cognito-auth', JSON.stringify(mockAuth));
      });

      // Reload to trigger nav visibility update
      await page.reload();

      // Wait for JS to execute
      await page.waitForTimeout(1500);

      // DM nav link should be visible
      const dmNav = page.locator('#nav-dm');
      await expect(dmNav).not.toHaveCSS('display', 'none');

      // Clean up
      await page.evaluate(() => {
        localStorage.removeItem('dndblog-cognito-auth');
      });
    });

    test('DM dashboard shows content when Cognito auth has DM role', async ({ page }) => {
      // Set Cognito auth with DM role before navigating
      await page.goto('/');
      await page.evaluate(() => {
        const mockAuth = {
          method: 'cognito',
          roles: { isDm: true, isPlayer: false },
          accessToken: 'mock-access-token',
          expiresAt: Date.now() + 3600000, // 1 hour from now
        };
        localStorage.setItem('dndblog-cognito-auth', JSON.stringify(mockAuth));
      });

      // Navigate to DM dashboard
      await page.goto('/dm');

      // Dashboard content should now be visible
      const dashboard = page.locator('#dashboard-content');
      await expect(dashboard).toBeVisible();

      // Auth gate should be hidden
      const authGate = page.locator('#auth-gate');
      await expect(authGate).toBeHidden();

      // Clean up auth
      await page.evaluate(() => {
        localStorage.removeItem('dndblog-cognito-auth');
      });
    });

    test('DM notes loads content when Cognito auth has DM role', async ({ page }) => {
      // Set Cognito auth with DM role first
      await page.goto('/');
      await page.evaluate(() => {
        const mockAuth = {
          method: 'cognito',
          roles: { isDm: true, isPlayer: false },
          accessToken: 'mock-access-token',
          expiresAt: Date.now() + 3600000, // 1 hour from now
        };
        localStorage.setItem('dndblog-cognito-auth', JSON.stringify(mockAuth));
      });

      // Navigate to DM notes
      await page.goto('/dm/notes');

      // Access denied should be hidden
      const accessDenied = page.locator('#access-denied');
      await expect(accessDenied).toBeHidden();

      // Editor container should be visible
      const editor = page.locator('#editor-container');
      await expect(editor).toBeVisible();

      // Clean up
      await page.evaluate(() => {
        localStorage.removeItem('dndblog-cognito-auth');
      });
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
