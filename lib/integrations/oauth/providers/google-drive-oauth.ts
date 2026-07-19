/**
 * lib/integrations/oauth/providers/google-drive-oauth.ts
 *
 * MARKETING-STUDIO-DRIVE-IMPORT-01 — Google Drive OAuth Config
 *
 * OAuth 2.0 configuration for Google Drive (read-only import).
 * Scopes: drive.readonly — list and download files only.
 * No write access. No sync. Import-only.
 *
 * SECURITY:
 * - GOOGLE_CLIENT_SECRET never exposed to client layers.
 * - PKCE S256 used on every flow.
 * - access_token and refresh_token stored encrypted in IntegrationSecret.
 * - TOKEN_EXPIRY_BUFFER prevents using near-expired tokens.
 * - SERVER ONLY — never import from client components.
 */

export const GOOGLE_DRIVE_OAUTH_CONFIG = {
  authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl:         "https://oauth2.googleapis.com/token",
  revokeUrl:        "https://oauth2.googleapis.com/revoke",
  /** Read-only access to Drive files + basic identity for display */
  scopes: [
    "https://www.googleapis.com/auth/drive.readonly",
    "openid",
    "email",
  ] as const,
  /** Seconds before expiry to proactively refresh */
  TOKEN_EXPIRY_BUFFER_SECONDS: 300,
} as const;

/** Max files listed per folder (Drive API page size limit: 1000) */
export const DRIVE_MAX_FILES_PER_FOLDER = 500;
/** Max total files across all folders in a single import */
export const DRIVE_MAX_TOTAL_FILES = 2000;

// ── Env var reader ─────────────────────────────────────────────────────────────

export function getGoogleCredentials(): {
  clientId:     string;
  clientSecret: string;
  redirectUri:  string;
} {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl       = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const redirectUri  =
    process.env.GOOGLE_REDIRECT_URI ??
    `${appUrl}/api/integrations/google-drive/callback`;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing Google OAuth env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

// ── Auth URL builder ──────────────────────────────────────────────────────────

/**
 * Builds the Google OAuth authorization URL.
 * Requires PKCE (S256) code challenge + CSRF state from OAuthSession.
 */
export function buildGoogleDriveAuthUrl(params: {
  state:         string;
  codeChallenge: string;
  redirectUri:   string;
  clientId:      string;
}): string {
  const url = new URL(GOOGLE_DRIVE_OAUTH_CONFIG.authorizationUrl);
  url.searchParams.set("client_id",             params.clientId);
  url.searchParams.set("redirect_uri",          params.redirectUri);
  url.searchParams.set("response_type",         "code");
  url.searchParams.set("scope",                 GOOGLE_DRIVE_OAUTH_CONFIG.scopes.join(" "));
  url.searchParams.set("state",                 params.state);
  url.searchParams.set("code_challenge",        params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type",           "offline");  // ensure refresh_token
  url.searchParams.set("prompt",                "consent");  // always return refresh_token
  return url.toString();
}

// ── Token types ───────────────────────────────────────────────────────────────

export interface GoogleTokenResponse {
  access_token:   string;
  refresh_token?: string;
  expires_in:     number;   // seconds
  token_type:     string;
  scope:          string;
  id_token?:      string;
}

// ── Code exchange ─────────────────────────────────────────────────────────────

/**
 * Exchanges an authorization code for access + refresh tokens.
 * SERVER ONLY — never log the result.
 */
export async function exchangeGoogleCode(params: {
  code:         string;
  codeVerifier: string;
  redirectUri:  string;
  clientId:     string;
  clientSecret: string;  // ⚠ server-only
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code:          params.code,
    client_id:     params.clientId,
    client_secret: params.clientSecret,
    redirect_uri:  params.redirectUri,
    grant_type:    "authorization_code",
    code_verifier: params.codeVerifier,
  });

  const res = await fetch(GOOGLE_DRIVE_OAUTH_CONFIG.tokenUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    throw new Error(`Google code exchange failed (${res.status}): ${errText}`);
  }

  return res.json() as Promise<GoogleTokenResponse>;
}

// ── Token refresh ─────────────────────────────────────────────────────────────

/**
 * Refreshes an access token using the stored refresh token.
 * SERVER ONLY — refresh token is never returned to client layers.
 */
export async function refreshGoogleAccessToken(params: {
  refreshToken: string;  // ⚠ server-only
  clientId:     string;
  clientSecret: string;  // ⚠ server-only
}): Promise<{ access_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    refresh_token: params.refreshToken,
    client_id:     params.clientId,
    client_secret: params.clientSecret,
    grant_type:    "refresh_token",
  });

  const res = await fetch(GOOGLE_DRIVE_OAUTH_CONFIG.tokenUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });

  if (!res.ok) {
    const status = res.status;
    if (status === 400 || status === 401) {
      throw new Error("DRIVE_TOKEN_EXPIRED: refresh token invalid or revoked — user must reconnect");
    }
    throw new Error(`Google token refresh failed: ${status}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  return data;
}
