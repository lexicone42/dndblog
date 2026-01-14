import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Static site generation (SSG)
  output: 'static',

  // Site URL - set via environment variable for different environments
  site: process.env.SITE_URL || 'http://localhost:4321',

  // Build configuration
  build: {
    // Generate clean URLs (e.g., /blog/post instead of /blog/post.html)
    format: 'directory',
    // Asset file names with content hash for cache busting
    assets: '_assets',
  },

  // Markdown configuration
  markdown: {
    // Enable GitHub Flavored Markdown
    gfm: true,
    // Syntax highlighting with Shiki
    shikiConfig: {
      theme: 'github-dark',
      // Add custom languages if needed
      langs: [],
      // Enable line wrapping for long code blocks
      wrap: true,
    },
  },

  // Image optimization
  image: {
    // Use Astro's built-in image optimization
    service: {
      entrypoint: 'astro/assets/services/sharp',
      config: {
        limitInputPixels: false, // Allow large images
      },
    },
  },

  // Development server
  server: {
    port: 4321,
    host: true, // Allow external connections
  },

  // Vite configuration
  vite: {
    build: {
      // Increase chunk size warning limit
      chunkSizeWarningLimit: 1000,
    },
    // Optimize dependencies
    optimizeDeps: {
      exclude: ['@astrojs/check'],
    },
  },

});
