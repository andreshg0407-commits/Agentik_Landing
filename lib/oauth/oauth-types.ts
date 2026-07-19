/**
 * lib/oauth/oauth-types.ts
 *
 * MARKETING-OAUTH-CONNECT-01 — Tipos normalizados del flujo OAuth
 *
 * Abstracción unificada sobre los providers existentes.
 * Sin secretos. Sin tokens en keys expuestos a cliente.
 * Safe para RSC → client boundary en la capa de estado derivado.
 */

// ── Providers soportados ───────────────────────────────────────────────────────

export type OAuthProvider =
  | "meta"
  | "tiktok"
  | "google"
  | "youtube"
  | "shopify"
  | "whatsapp";

export const OAUTH_PROVIDER_LABEL: Record<OAuthProvider, string> = {
  meta:     "Meta",
  tiktok:   "TikTok",
  google:   "Google Ads",
  youtube:  "YouTube",
  shopify:  "Shopify",
  whatsapp: "WhatsApp Business",
};

// ── Configuración del provider ─────────────────────────────────────────────────

export interface OAuthProviderConfig {
  /** Provider identifier */
  id:               OAuthProvider;
  /** Display label */
  label:            string;
  /** Short description */
  description:      string;
  /** Brand color */
  color:            string;
  /** Default scopes requested */
  defaultScopes:    string[];
  /** Whether PKCE (S256) is required — TikTok yes, Meta no */
  requiresPkce:     boolean;
  /** Platform group in IntegrationConnection.providerGroup */
  providerGroup:    string;
  /** Internal provider key used in OAuth session and integration-repository */
  internalProvider: string;
  /** GET route that initiates the OAuth flow — tenant-scoped */
  connectRoute:     (orgSlug: string) => string;
  /** Is this provider available for OAuth in this environment? */
  isConfigured:     () => boolean;
}

// ── Normalized token response ──────────────────────────────────────────────────
// SECURITY: never expose actual token values — only metadata for audit/display

export interface OAuthTokenMeta {
  /** Provider this token belongs to */
  provider:  OAuthProvider;
  /** Scopes granted by the provider */
  scopes:    string[];
  /** ISO expiry timestamp — null if long-lived */
  expiresAt: string | null;
  /** Whether a refresh token was also received */
  hasRefreshToken: boolean;
}

// ── OAuth session state (safe — no secrets) ────────────────────────────────────

export interface OAuthSessionState {
  sessionId:      string;
  provider:       OAuthProvider;
  organizationId: string;
  orgSlug:        string;
  status:         "pending" | "consumed" | "failed" | "expired";
  createdAt:      string;
  expiresAt:      string;
}

// ── Callback result ────────────────────────────────────────────────────────────

export interface OAuthCallbackResult {
  success:        boolean;
  provider:       OAuthProvider;
  organizationId: string;
  /** Connections created or updated */
  connectionsAffected: number;
  /** Safe resources discovered */
  discoveredResources: OAuthDiscoveredResource[];
  /** Redirect URL after completion */
  redirectTo:     string;
  error?:         string;
}

export interface OAuthDiscoveredResource {
  tipo:   string;   // "Página", "Cuenta publicitaria", "Instagram Business", etc.
  nombre: string | null;
  id:     string;
}

// ── Dry-run result ─────────────────────────────────────────────────────────────

export interface OAuthDryRunCheck {
  label:   string;
  passed:  boolean;
  detail?: string;
}

export interface OAuthDryRunResult {
  provider:   OAuthProvider;
  allPassed:  boolean;
  checks:     OAuthDryRunCheck[];
  checkedAt:  string;
}

// ── Connect URL options ────────────────────────────────────────────────────────

export interface OAuthConnectOptions {
  mode?:     "new_connection" | "reconnect" | "add_account";
  returnTo?: string;
}

// ── Connections summary (safe for client) ─────────────────────────────────────

export interface OAuthConnectionStatus {
  provider:        OAuthProvider;
  isConnected:     boolean;
  hasValidToken:   boolean;
  scopesGranted:   string[];
  lastConnectedAt: string | null;
  errorMessage:    string | null;
}
