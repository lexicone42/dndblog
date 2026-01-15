/**
 * Auth Service - Unified authentication for D&D Blog
 *
 * Supports both legacy token auth and Cognito JWT auth (dual-mode).
 * Token auth stays working for simple use cases.
 * Cognito adds individual accounts + future OAuth scaffolding.
 */

// ==========================================================================
// Types
// ==========================================================================

export interface AuthState {
  method: 'token' | 'cognito';
  roles: {
    isDm: boolean;
    isPlayer: boolean;
  };
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  userId?: string;
  email?: string;
}

export interface AuthConfig {
  mode: 'token' | 'dual' | 'cognito';
  region?: string;
  userPoolId?: string;
  clientId?: string;
  domain?: string;
}

// ==========================================================================
// Constants
// ==========================================================================

const AUTH_STORAGE_KEY = 'dndblog-cognito-auth';
const LEGACY_DM_TOKEN_KEY = 'dm-token';
const LEGACY_PLAYER_TOKEN_KEY = 'player-token';

// ==========================================================================
// Helper Functions
// ==========================================================================

/**
 * Parse JWT payload without verification (client-side info extraction only)
 */
function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split('.');
    // Handle both standard base64 and base64url encoding
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

/**
 * Check if a token is expired
 */
function isTokenExpired(expiresAt?: number): boolean {
  if (!expiresAt) return false;
  // Add 5 minute buffer for refresh
  return expiresAt - Date.now() < 5 * 60 * 1000;
}

// ==========================================================================
// Auth Configuration
// ==========================================================================

/**
 * Get auth configuration from environment variables
 */
export function getAuthConfig(): AuthConfig {
  return {
    mode: (import.meta.env.PUBLIC_AUTH_MODE as AuthConfig['mode']) || 'token',
    region: import.meta.env.PUBLIC_AWS_REGION || 'us-west-2',
    userPoolId: import.meta.env.PUBLIC_COGNITO_USER_POOL_ID,
    clientId: import.meta.env.PUBLIC_COGNITO_CLIENT_ID,
    domain: import.meta.env.PUBLIC_COGNITO_DOMAIN,
  };
}

// ==========================================================================
// Auth State Management
// ==========================================================================

/**
 * Get current authentication state
 * Checks both token auth (localStorage) and Cognito auth
 */
export function getAuthState(): AuthState | null {
  if (typeof window === 'undefined') return null;

  // Check legacy token auth first (DM token)
  const dmToken = localStorage.getItem(LEGACY_DM_TOKEN_KEY);
  if (dmToken) {
    return {
      method: 'token',
      roles: { isDm: true, isPlayer: true },
      accessToken: dmToken,
    };
  }

  // Check legacy token auth (Player token)
  const playerToken = localStorage.getItem(LEGACY_PLAYER_TOKEN_KEY);
  if (playerToken) {
    return {
      method: 'token',
      roles: { isDm: false, isPlayer: true },
      accessToken: playerToken,
    };
  }

  // Check Cognito auth
  const cognitoAuth = localStorage.getItem(AUTH_STORAGE_KEY);
  if (cognitoAuth) {
    try {
      const auth = JSON.parse(cognitoAuth) as AuthState;

      // Check if token is expired
      if (auth.expiresAt && isTokenExpired(auth.expiresAt)) {
        // Token expired and no refresh capability in static site
        // User will need to re-login
        localStorage.removeItem(AUTH_STORAGE_KEY);
        return null;
      }

      return auth;
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
  }

  return null;
}

/**
 * Save Cognito auth state to localStorage
 */
export function setAuthState(auth: AuthState): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  // Dispatch event for other components to react
  window.dispatchEvent(new Event('auth-change'));
}

/**
 * Clear all auth state (logout)
 */
export function clearAuth(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LEGACY_DM_TOKEN_KEY);
  localStorage.removeItem(LEGACY_PLAYER_TOKEN_KEY);
  localStorage.removeItem(AUTH_STORAGE_KEY);
  window.dispatchEvent(new Event('auth-change'));
}

/**
 * Set legacy token auth (for simple token login)
 */
export function setTokenAuth(token: string, role: 'dm' | 'player'): void {
  if (typeof window === 'undefined') return;
  const key = role === 'dm' ? LEGACY_DM_TOKEN_KEY : LEGACY_PLAYER_TOKEN_KEY;
  localStorage.setItem(key, token);
  window.dispatchEvent(new Event('auth-change'));
}

// ==========================================================================
// Role Checking
// ==========================================================================

/**
 * Check if user has a specific role
 */
export function hasRole(role: 'dm' | 'player'): boolean {
  const auth = getAuthState();
  if (!auth) return false;

  if (role === 'dm') return auth.roles.isDm;
  if (role === 'player') return auth.roles.isPlayer;
  return false;
}

/**
 * Check if user is authenticated at all
 */
export function isAuthenticated(): boolean {
  return getAuthState() !== null;
}

// ==========================================================================
// API Headers
// ==========================================================================

/**
 * Get authorization headers for API calls
 * Works with both token and Cognito auth
 */
export function getAuthHeaders(): Record<string, string> {
  const auth = getAuthState();
  if (!auth) return {};

  if (auth.method === 'token') {
    return { 'X-DM-Token': auth.accessToken };
  } else {
    return { 'Authorization': `Bearer ${auth.accessToken}` };
  }
}

// ==========================================================================
// Cognito OAuth URLs
// ==========================================================================

/**
 * Get Cognito hosted UI login URL
 */
export function getLoginUrl(returnUrl?: string): string {
  const config = getAuthConfig();

  if (config.mode === 'token' || !config.domain || !config.clientId) {
    // Fallback to current page (no Cognito SSO available)
    return '#';
  }

  const callbackUrl = encodeURIComponent(
    `${window.location.origin}/auth/callback`
  );
  const state = returnUrl ? encodeURIComponent(returnUrl) : '';

  return `https://${config.domain}/login?` +
    `client_id=${config.clientId}` +
    `&response_type=code` +
    `&scope=openid+email` +
    `&redirect_uri=${callbackUrl}` +
    (state ? `&state=${state}` : '');
}

/**
 * Get Cognito hosted UI logout URL
 */
export function getLogoutUrl(): string {
  const config = getAuthConfig();

  // Clear local auth state first
  clearAuth();

  if (config.mode === 'token' || !config.domain || !config.clientId) {
    return '/';
  }

  const logoutUri = encodeURIComponent(window.location.origin);

  return `https://${config.domain}/logout?` +
    `client_id=${config.clientId}` +
    `&logout_uri=${logoutUri}`;
}

/**
 * Check if Cognito SSO is available
 */
export function isSsoAvailable(): boolean {
  const config = getAuthConfig();
  return config.mode !== 'token' && !!config.domain && !!config.clientId;
}

// ==========================================================================
// Token Exchange (for OAuth callback)
// ==========================================================================

/**
 * Exchange authorization code for tokens (used by callback page)
 */
export async function exchangeCodeForTokens(code: string): Promise<AuthState> {
  const config = getAuthConfig();

  if (!config.domain || !config.clientId) {
    throw new Error('Cognito not configured');
  }

  const tokenUrl = `https://${config.domain}/oauth2/token`;
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code: code,
      redirect_uri: `${window.location.origin}/auth/callback`,
    }),
  });

  if (!response.ok) {
    throw new Error('Token exchange failed');
  }

  const tokens = await response.json();

  // Parse ID token to get user info and groups
  const idPayload = parseJwt(tokens.id_token);
  if (!idPayload) {
    throw new Error('Invalid ID token');
  }

  const groups = (idPayload['cognito:groups'] as string[]) || [];

  const authState: AuthState = {
    method: 'cognito',
    roles: {
      isDm: groups.includes('dm'),
      isPlayer: groups.includes('player') || groups.includes('dm'),
    },
    accessToken: tokens.access_token,
    idToken: tokens.id_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in * 1000),
    userId: idPayload.sub as string,
    email: idPayload.email as string,
  };

  setAuthState(authState);
  return authState;
}
