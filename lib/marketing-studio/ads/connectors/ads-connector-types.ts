/**
 * lib/marketing-studio/ads/connectors/ads-connector-types.ts
 *
 * MARKETING-ADS-CONNECTORS-01 — Shared types for Ads platform connectors.
 *
 * All types are JSON-safe — safe for RSC → client boundary.
 * Tokens and secrets are NEVER included in any type here.
 */

// ── Platform identity ──────────────────────────────────────────────────────────

export type AdsPlatform = "meta" | "tiktok" | "google";

// ── Credential source ──────────────────────────────────────────────────────────

/**
 * Where the credentials for a platform were resolved from.
 * Safe to return to the client — never includes the actual value.
 *
 * VAULT           — resolved from the encrypted multi-tenant Vault.
 * ENV_DEV_FALLBACK — resolved from process.env (dev only; never in production).
 * NOT_CONFIGURED  — no credentials found in any source.
 */
export type AdsCredentialSource = "VAULT" | "ENV_DEV_FALLBACK" | "NOT_CONFIGURED";

// ── Connection status ─────────────────────────────────────────────────────────

/**
 * Lifecycle status returned by each connector diagnostic.
 *
 * not_configured       — required env vars (or Vault keys) are absent.
 * missing_credentials  — some vars exist but are incomplete.
 * invalid_credentials  — credentials present but API rejected them.
 * insufficient_permissions — authenticated but scopes are missing.
 * connected            — healthy, authenticated, accounts accessible.
 * api_error            — credentials present but API call failed unexpectedly.
 */
export type AdsConnectionStatus =
  | "connected"
  | "not_configured"
  | "missing_credentials"
  | "invalid_credentials"
  | "insufficient_permissions"
  | "api_error";

// ── Sub-types ─────────────────────────────────────────────────────────────────

/** Serializable summary of a single ad account. No secrets. */
export interface AdsAccountSummary {
  id:       string;
  name:     string;
  currency?: string;
  status?:  string;
}

/** Serializable record of a single permission/scope. */
export interface AdsPermissionSummary {
  scope:   string;
  granted: boolean;
}

// ── Diagnostic ────────────────────────────────────────────────────────────────

/**
 * Full diagnostic snapshot for one platform.
 * RSC → client safe. No accessToken, no clientSecret, no raw headers.
 */
export interface AdsConnectorDiagnostic {
  platform:    AdsPlatform;
  status:      AdsConnectionStatus;
  /** Ad accounts readable by the current token. */
  accounts:    AdsAccountSummary[];
  /** Permission/scope breakdown. */
  permissions: AdsPermissionSummary[];
  /** Non-critical notices (e.g. optional scope missing). */
  warnings:    string[];
  /** User-readable error messages. No tokens embedded. */
  errors:      string[];
  /** ISO timestamp of this check. */
  checkedAt:   string;
  /**
   * Where credentials were resolved from.
   * VAULT = encrypted multi-tenant store.
   * ENV_DEV_FALLBACK = process.env (dev only).
   * NOT_CONFIGURED = no credentials found.
   */
  credentialSource?: AdsCredentialSource;
}

/** Union result type returned by each connector. */
export type AdsConnectorResult =
  | { ok: true;  diagnostic: AdsConnectorDiagnostic }
  | { ok: false; diagnostic: AdsConnectorDiagnostic };
