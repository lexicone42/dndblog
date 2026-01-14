import { defineConfig, devices } from '@playwright/test';

// When SITE_URL is set, we're testing against an external site (production)
// and don't need to start a local server
const isExternalSite = !!process.env.SITE_URL;

/**
 * Playwright configuration for E2E and smoke testing.
 *
 * Projects:
 * - smoke: Post-deployment verification against production
 * - chromium: Full E2E tests in Chromium (local development)
 *
 * Usage:
 * - Smoke tests: SITE_URL=https://example.com pnpm test:smoke
 * - E2E tests: pnpm test:e2e (runs against local dev server)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 30000,

  use: {
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'smoke',
      testMatch: /smoke\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        // Base URL from environment or default to production
        baseURL: process.env.SITE_URL || 'https://chronicles.mawframe.ninja',
      },
    },
    {
      name: 'chromium',
      testIgnore: /smoke\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:4321',
      },
    },
  ],

  // Local dev server for E2E tests only (not needed for smoke tests against external sites)
  webServer: isExternalSite
    ? undefined
    : {
        command: 'pnpm preview',
        url: 'http://localhost:4321',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
});
