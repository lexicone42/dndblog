/**
 * Centralized Content Security Policy Configuration
 *
 * This is the single source of truth for CSP across the application.
 * CloudFront ResponseHeadersPolicy uses this configuration in production.
 *
 * When updating CSP directives:
 * 1. Update this file
 * 2. Run CDK tests to validate: pnpm --filter infra test
 * 3. Deploy to apply changes: CDK will update CloudFront
 *
 * Note: The _headers file in packages/site/public/ should be kept in sync
 * for non-CloudFront deployments (Netlify, Cloudflare Pages).
 */

/**
 * CSP directive values organized by directive type.
 * Each directive maps to an array of allowed sources.
 *
 * This is a static memorial site with no external API connections.
 */
export const CSP_DIRECTIVES: Record<string, string[]> = {
  // Default fallback for unspecified directives
  'default-src': ["'self'"],

  // JavaScript sources
  // - 'unsafe-inline': Required for Astro's inline scripts
  // - 'wasm-unsafe-eval': Required for Pagefind search (WebAssembly)
  'script-src': ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"],

  // Stylesheet sources
  // - 'unsafe-inline': Required for Astro's scoped styles
  'style-src': ["'self'", "'unsafe-inline'"],

  // Image sources - allow self, data URIs, and any HTTPS
  'img-src': ["'self'", 'data:', 'https:'],

  // Font sources - self-hosted fonts only
  'font-src': ["'self'", 'data:'],

  // Connections - static site only needs self
  'connect-src': ["'self'"],

  // Prevent embedding in frames (clickjacking protection)
  'frame-ancestors': ["'none'"],

  // Restrict base URI to prevent base tag injection
  'base-uri': ["'self'"],

  // Restrict form submissions
  'form-action': ["'self'"],
};

/**
 * Additional CSP directives that don't take source values
 */
export const CSP_FLAGS = ['upgrade-insecure-requests'];

/**
 * Build the complete CSP string from directives and flags.
 * This is used by CloudFront ResponseHeadersPolicy.
 *
 * @returns Complete CSP header value
 */
export function buildCSPString(): string {
  const directiveParts = Object.entries(CSP_DIRECTIVES).map(
    ([directive, values]) => `${directive} ${values.join(' ')}`
  );

  return [...directiveParts, ...CSP_FLAGS].join('; ');
}

