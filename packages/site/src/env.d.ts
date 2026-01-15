/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_DM_NOTES_API_URL: string;
  // Auth configuration
  readonly PUBLIC_AUTH_MODE?: 'token' | 'dual' | 'cognito';
  readonly PUBLIC_AWS_REGION?: string;
  readonly PUBLIC_COGNITO_USER_POOL_ID?: string;
  readonly PUBLIC_COGNITO_CLIENT_ID?: string;
  readonly PUBLIC_COGNITO_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Extend Window for global functions and events
declare global {
  interface WindowEventMap {
    'auth-change': Event;
  }

  interface Window {
    showDashboard?: () => void;
    showAccessDenied?: () => void;
  }
}

export {};
