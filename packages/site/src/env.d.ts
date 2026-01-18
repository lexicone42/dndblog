/// <reference types="astro/client" />

/**
 * Environment variables for the static memorial site.
 * No auth or API variables needed - this is a fully static site.
 */
interface ImportMetaEnv {
  // Add any future environment variables here
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
