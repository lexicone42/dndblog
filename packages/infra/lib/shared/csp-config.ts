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
 */
export const CSP_DIRECTIVES: Record<string, string[]> = {
  // Default fallback for unspecified directives
  'default-src': ["'self'"],

  // JavaScript sources
  // - 'unsafe-inline': Required for Astro's scoped styles and inline scripts
  // - 'wasm-unsafe-eval': Required for Pagefind search (WebAssembly)
  // - CDN sources: For EasyMDE, marked, highlight.js, dompurify and other libraries
  'script-src': [
    "'self'",
    "'unsafe-inline'",
    "'wasm-unsafe-eval'",
    'https://unpkg.com',
    'https://cdn.jsdelivr.net',
    'https://cdnjs.cloudflare.com',
  ],

  // Stylesheet sources
  // - 'unsafe-inline': Required for Astro's scoped styles
  // - CDN sources: For external fonts and libraries
  'style-src': [
    "'self'",
    "'unsafe-inline'",
    'https://unpkg.com',
    'https://cdn.jsdelivr.net',
    'https://fonts.googleapis.com',
    'https://maxcdn.bootstrapcdn.com',
    'https://cdnjs.cloudflare.com',
  ],

  // Image sources - allow self, data URIs, and any HTTPS
  'img-src': ["'self'", 'data:', 'https:'],

  // Font sources - multiple CDNs for Font Awesome and Google Fonts
  'font-src': [
    "'self'",
    'data:',
    'https://fonts.gstatic.com',
    'https://maxcdn.bootstrapcdn.com',
    'https://cdnjs.cloudflare.com',
    'https://cdn.jsdelivr.net',
    'https://use.fontawesome.com',
  ],

  // API connections - self, AWS API Gateway, S3 for uploads, Cognito for auth, WebSocket for real-time
  'connect-src': [
    "'self'",
    'https://*.execute-api.us-east-1.amazonaws.com',
    'wss://*.execute-api.us-east-1.amazonaws.com',
    'https://*.s3.us-east-1.amazonaws.com',
    'https://*.auth.us-east-1.amazoncognito.com',
  ],

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

/**
 * Build a minimal CSP string for specific pages that need fewer permissions.
 * Useful for pages that don't use external CDNs.
 *
 * @returns Minimal CSP header value for static pages
 */
export function buildMinimalCSPString(): string {
  const minimalDirectives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
  };

  const directiveParts = Object.entries(minimalDirectives).map(
    ([directive, values]) => `${directive} ${values.join(' ')}`
  );

  return directiveParts.join('; ');
}
