/**
 * Auth Service - Cognito authentication for D&D Blog
 *
 * Handles Cognito JWT auth with automatic token refresh.
 * Passkey users get 30-day sessions, password users get 1-day sessions.
 */

// ==========================================================================
// Types
// ==========================================================================

export interface AuthState {
  method: 'cognito';
  roles: {
    isDm: boolean;
    isPlayer: boolean;
  };
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  /** When the access token expires (for refresh timing) */
  expiresAt?: number;
  /** When the session expires (passkey: 30 days, password: 1 day) - no refresh after this */
  sessionExpiresAt?: number;
  /** Whether user authenticated with a passkey (enables long sessions) */
  hasPasskey?: boolean;
  userId?: string;
  email?: string;
  /** Character slug assigned to this user (from custom:characterSlug claim) */
  characterSlug?: string;
}

export interface AuthConfig {
  region?: string;
  userPoolId?: string;
  clientId?: string;
  domain?: string;
}

// ==========================================================================
// Constants
// ==========================================================================

const AUTH_STORAGE_KEY = 'dndblog-cognito-auth';

// Session durations
const PASSKEY_SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days
const PASSWORD_SESSION_DURATION = 24 * 60 * 60 * 1000; // 1 day
const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000; // Refresh 5 minutes before expiry

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
 * Check if a token needs refresh (within buffer period)
 */
function needsRefresh(expiresAt?: number): boolean {
  if (!expiresAt) return false;
  return expiresAt - Date.now() < TOKEN_REFRESH_BUFFER;
}

/**
 * Check if session has completely expired (no more refreshes allowed)
 */
function isSessionExpired(sessionExpiresAt?: number): boolean {
  if (!sessionExpiresAt) return false;
  return Date.now() > sessionExpiresAt;
}

/**
 * Refresh tokens using the refresh token
 * Returns updated auth state or null if refresh failed
 */
async function refreshTokens(auth: AuthState): Promise<AuthState | null> {
  const config = getAuthConfig();

  if (!auth.refreshToken || !config.domain || !config.clientId) {
    return null;
  }

  // Check if session has expired (no more refreshes allowed)
  if (isSessionExpired(auth.sessionExpiresAt)) {
    return null;
  }

  try {
    const tokenUrl = `https://${config.domain}/oauth2/token`;
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        refresh_token: auth.refreshToken,
      }),
    });

    if (!response.ok) {
      console.warn('Token refresh failed:', response.status);
      return null;
    }

    const tokens = await response.json();

    // Parse new ID token for any updated claims
    const idPayload = parseJwt(tokens.id_token);
    const groups = idPayload ? (idPayload['cognito:groups'] as string[]) || [] : [];

    const updatedAuth: AuthState = {
      ...auth,
      accessToken: tokens.access_token,
      idToken: tokens.id_token,
      // Keep existing refresh token if not returned (Cognito behavior)
      refreshToken: tokens.refresh_token || auth.refreshToken,
      expiresAt: Date.now() + (tokens.expires_in * 1000),
      // Preserve session expiry and passkey status
      sessionExpiresAt: auth.sessionExpiresAt,
      hasPasskey: auth.hasPasskey,
      roles: {
        isDm: groups.includes('dm'),
        isPlayer: groups.includes('player') || groups.includes('dm'),
      },
    };

    // Save refreshed auth
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedAuth));
    window.dispatchEvent(new Event('auth-change'));

    return updatedAuth;
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

// ==========================================================================
// Auth Configuration
// ==========================================================================

/**
 * Get auth configuration from environment variables
 */
export function getAuthConfig(): AuthConfig {
  return {
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
 * Get current authentication state (synchronous)
 * Note: Call ensureValidAuth() for async refresh before API calls
 */
export function getAuthState(): AuthState | null {
  if (typeof window === 'undefined') return null;

  const cognitoAuth = localStorage.getItem(AUTH_STORAGE_KEY);
  if (cognitoAuth) {
    try {
      const auth = JSON.parse(cognitoAuth) as AuthState;

      // Check if session has completely expired (no more refreshes)
      if (isSessionExpired(auth.sessionExpiresAt)) {
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
 * Ensure auth is valid, refreshing tokens if needed
 * Call this before making API requests
 * Returns null if session expired or refresh failed
 */
export async function ensureValidAuth(): Promise<AuthState | null> {
  const auth = getAuthState();
  if (!auth) return null;

  // Check if session expired
  if (isSessionExpired(auth.sessionExpiresAt)) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    window.dispatchEvent(new Event('auth-change'));
    return null;
  }

  // Check if access token needs refresh
  if (needsRefresh(auth.expiresAt)) {
    const refreshed = await refreshTokens(auth);
    if (!refreshed) {
      // Refresh failed, clear auth
      localStorage.removeItem(AUTH_STORAGE_KEY);
      window.dispatchEvent(new Event('auth-change'));
      return null;
    }
    return refreshed;
  }

  return auth;
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
  localStorage.removeItem(AUTH_STORAGE_KEY);
  window.dispatchEvent(new Event('auth-change'));
}

// ==========================================================================
// API Headers
// ==========================================================================

/**
 * Get authorization headers for API calls
 */
export function getAuthHeaders(): Record<string, string> {
  const auth = getAuthState();
  if (!auth) return {};
  return { 'Authorization': `Bearer ${auth.accessToken}` };
}

// ==========================================================================
// Cognito OAuth URLs
// ==========================================================================

/**
 * Get Cognito hosted UI login URL
 */
export function getLoginUrl(returnUrl?: string): string {
  const config = getAuthConfig();

  if (!config.domain || !config.clientId) {
    return '#';
  }

  const callbackUrl = encodeURIComponent(
    `${window.location.origin}/auth/callback`
  );
  const state = returnUrl ? encodeURIComponent(returnUrl) : '';

  return `https://${config.domain}/login?` +
    `client_id=${config.clientId}` +
    `&response_type=code` +
    `&scope=openid+email+profile` +
    `&redirect_uri=${callbackUrl}` +
    (state ? `&state=${state}` : '');
}

/**
 * Get Cognito hosted UI logout URL
 * @param returnPath - Optional path to redirect to after logout (e.g., '/campaign')
 */
export function getLogoutUrl(returnPath?: string): string {
  const config = getAuthConfig();

  // Clear local auth state first
  clearAuth();

  if (!config.domain || !config.clientId) {
    return returnPath || '/';
  }

  const logoutUri = encodeURIComponent(
    window.location.origin + (returnPath || '')
  );

  return `https://${config.domain}/logout?` +
    `client_id=${config.clientId}` +
    `&logout_uri=${logoutUri}`;
}

/**
 * Check if Cognito SSO is available
 */
export function isSsoAvailable(): boolean {
  const config = getAuthConfig();
  return !!config.domain && !!config.clientId;
}

/**
 * Get Cognito passkey registration URL
 * Users must be signed in first, then visit this URL to register a passkey
 */
export function getPasskeyRegistrationUrl(): string {
  const config = getAuthConfig();

  if (!config.domain || !config.clientId) {
    return '#';
  }

  const callbackUrl = encodeURIComponent(
    `${window.location.origin}/auth/callback`
  );

  return `https://${config.domain}/passkeys/add?` +
    `client_id=${config.clientId}` +
    `&response_type=code` +
    `&scope=openid+email+profile` +
    `&redirect_uri=${callbackUrl}`;
}

// ==========================================================================
// Token Exchange (for OAuth callback)
// ==========================================================================

/**
 * Detect if passkey was used based on amr claim
 * Cognito includes authentication method references in the ID token
 */
function detectPasskeyAuth(idPayload: Record<string, unknown>): boolean {
  const amr = idPayload['amr'] as string[] | undefined;
  if (!amr) return false;

  // Check for WebAuthn/passkey indicators
  // Cognito uses different values, check for common ones
  return amr.some(method =>
    method === 'mfa' ||
    method === 'hwk' ||
    method === 'swk' ||
    method.includes('webauthn') ||
    method.includes('passkey')
  );
}

/**
 * Exchange authorization code for tokens (used by callback page)
 * Automatically detects passkey usage and sets appropriate session duration
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
  const characterSlug = idPayload['custom:characterSlug'] as string | undefined;

  // Detect if passkey was used
  const hasPasskey = detectPasskeyAuth(idPayload);

  // Set session duration based on auth method
  const sessionDuration = hasPasskey ? PASSKEY_SESSION_DURATION : PASSWORD_SESSION_DURATION;

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
    sessionExpiresAt: Date.now() + sessionDuration,
    hasPasskey,
    userId: idPayload.sub as string,
    email: idPayload.email as string,
    characterSlug,
  };

  setAuthState(authState);
  return authState;
}

/**
 * Mark current user as having passkey (call after successful passkey registration)
 * This upgrades their session to 30 days
 */
export function upgradeToPasskeySession(): void {
  const auth = getAuthState();
  if (!auth) return;

  const updatedAuth: AuthState = {
    ...auth,
    hasPasskey: true,
    sessionExpiresAt: Date.now() + PASSKEY_SESSION_DURATION,
  };

  setAuthState(updatedAuth);
}
