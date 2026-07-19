/**
 * lib/integrations/oauth/providers/google-oauth.ts
 *
 * MARKETING-INTEGRATIONS-GOOGLE-01 — Google OAuth Config
 *
 * Covers Google Ads and YouTube via Google's standard OAuth 2.0 + PKCE.
 * Uses the same Google app credentials — differentiated by scope set.
 *
 * IMPORTANT: Never log client secrets. Never return secrets to client layers.
 */

export const GOOGLE_OAUTH_CONFIG = {
  authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl:         "https://oauth2.googleapis.com/token",
  revokeUrl:        "https://oauth2.googleapis.com/revoke",
  userInfoUrl:      "https://www.googleapis.com/oauth2/v3/userinfo",

  /** Google Ads scopes */
  adsScopes: [
    "openid",
    "profile",
    "email",
    "https://www.googleapis.com/auth/adwords",
  ] as const,

  /** YouTube scopes */
  youtubeScopes: [
    "openid",
    "profile",
    "email",
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
  ] as const,
} as const;

export type GoogleOAuthPurpose = "google_ads" | "youtube";

/**
 * Reads Google app credentials from environment.
 * Throws if any required var is missing.
 */
export function getGoogleCredentials(): {
  clientId:     string;
  clientSecret: string;
  redirectUri:  string;
} {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri  = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing Google OAuth env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

function scopesForPurpose(purpose: GoogleOAuthPurpose): string[] {
  switch (purpose) {
    case "google_ads": return [...GOOGLE_OAUTH_CONFIG.adsScopes];
    case "youtube":    return [...GOOGLE_OAUTH_CONFIG.youtubeScopes];
  }
}

/**
 * Builds the Google authorization URL with PKCE.
 * state and codeChallenge must come from oauth-session-service.
 */
export function buildGoogleAuthUrl(params: {
  state:         string;
  codeChallenge: string;
  purpose:       GoogleOAuthPurpose;
  scopes?:       string[];
}): string {
  const { clientId, redirectUri } = getGoogleCredentials();
  const scopes = params.scopes ?? scopesForPurpose(params.purpose);

  const url = new URL(GOOGLE_OAUTH_CONFIG.authorizationUrl);
  url.searchParams.set("client_id",             clientId);
  url.searchParams.set("redirect_uri",          redirectUri);
  url.searchParams.set("response_type",         "code");
  url.searchParams.set("scope",                 scopes.join(" "));
  url.searchParams.set("state",                 params.state);
  url.searchParams.set("code_challenge",        params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type",           "offline");   // request refresh_token
  url.searchParams.set("prompt",                "consent");   // always show consent for refresh token
  return url.toString();
}

// ── Token exchange helpers ────────────────────────────────────────────────────

export interface GoogleTokenResponse {
  access_token?:  string;
  refresh_token?: string;
  expires_in?:    number;
  token_type?:    string;
  scope?:         string;
  id_token?:      string;
  error?:         string;
  error_description?: string;
}

export interface GoogleUserInfo {
  sub:            string;
  name?:          string;
  email?:         string;
  picture?:       string;
  given_name?:    string;
  family_name?:   string;
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeGoogleCode(
  code:          string,
  codeVerifier:  string,
): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getGoogleCredentials();

  const body = new URLSearchParams({
    client_id:     clientId,
    client_secret: clientSecret,
    redirect_uri:  redirectUri,
    grant_type:    "authorization_code",
    code,
    code_verifier: codeVerifier,
  });

  const res = await fetch(GOOGLE_OAUTH_CONFIG.tokenUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });

  return res.json() as Promise<GoogleTokenResponse>;
}

/**
 * Fetch Google user info using access token.
 */
export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo | null> {
  try {
    const res = await fetch(GOOGLE_OAUTH_CONFIG.userInfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return res.json() as Promise<GoogleUserInfo>;
  } catch {
    return null;
  }
}

// ── Google Ads resource discovery helpers ─────────────────────────────────────

export interface GoogleAdsCustomer {
  customerId:       string;
  descriptiveName:  string;
  currencyCode?:    string;
  timeZone?:        string;
  managerAccount?:  boolean;
}

/**
 * Lists accessible Google Ads customers using the Google Ads API.
 * Requires the access token to have ads_management scope.
 */
export async function fetchGoogleAdsCustomers(
  accessToken:    string,
  developerToken: string,
): Promise<GoogleAdsCustomer[]> {
  try {
    const res = await fetch(
      "https://googleads.googleapis.com/v17/customers:listAccessibleCustomers",
      {
        headers: {
          Authorization:    `Bearer ${accessToken}`,
          "developer-token": developerToken,
        },
      },
    );
    if (!res.ok) return [];
    const data = await res.json() as { resourceNames?: string[] };
    // resourceNames format: "customers/123456789"
    return (data.resourceNames ?? []).map(rn => {
      const customerId = rn.split("/").pop() ?? rn;
      return { customerId, descriptiveName: `Cuenta ${customerId}` };
    });
  } catch {
    return [];
  }
}

// ── YouTube resource discovery helpers ────────────────────────────────────────

export interface YouTubeChannel {
  id:          string;
  title:       string;
  description?: string;
  thumbnail?:  string;
  subscriberCount?: string;
}

/**
 * Fetches the authenticated user's YouTube channels.
 */
export async function fetchYouTubeChannels(accessToken: string): Promise<YouTubeChannel[]> {
  try {
    const res = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return [];
    const data = await res.json() as {
      items?: Array<{
        id: string;
        snippet: { title: string; description?: string; thumbnails?: { default?: { url?: string } } };
        statistics?: { subscriberCount?: string };
      }>;
    };
    return (data.items ?? []).map(item => ({
      id:              item.id,
      title:           item.snippet.title,
      description:     item.snippet.description,
      thumbnail:       item.snippet.thumbnails?.default?.url,
      subscriberCount: item.statistics?.subscriberCount,
    }));
  } catch {
    return [];
  }
}
