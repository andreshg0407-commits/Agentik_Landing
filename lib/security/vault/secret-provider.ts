/**
 * lib/security/vault/secret-provider.ts
 *
 * AGENTIK-SECURITY-VAULT-MIGRATION-01
 * Vault Migration Layer — Secret Provider Interface
 *
 * SecretProvider is the unified contract for secret retrieval.
 * Every integration (AI, WhatsApp, Shopify, DIAN, ERP) uses this
 * interface — never direct process.env lookups.
 *
 * Resolution hierarchy (Vault First):
 *   1. VAULT       → VaultService (new, org-scoped, encrypted)
 *   2. LEGACY      → Integration.secretsJson or legacy env var names
 *   3. ENVIRONMENT → process.env fallback (deprecated path)
 *   4. NOT_FOUND   → structured error, never throws
 *
 * All results are fully serializable (no Date objects).
 * No server-only. No Prisma. Pure interface contract.
 */

// ── Secret source ─────────────────────────────────────────────────────────────

/** Where the secret was resolved from. */
export type SecretSource = "VAULT" | "LEGACY" | "ENVIRONMENT" | "NOT_FOUND";

// ── Shadow divergence ─────────────────────────────────────────────────────────

export interface ShadowDivergence {
  primarySource: SecretSource;
  shadowSource:  SecretSource;
  valuesMatch:   boolean;
  primaryFound:  boolean;
  shadowFound:   boolean;
}

// ── Resolution result ─────────────────────────────────────────────────────────

export interface SecretResolutionResult {
  /** Whether a usable secret was found. */
  found:             boolean;
  /** The secret value — only present when found=true. NEVER log this. */
  secret?:           string;
  /** Where the secret came from. */
  source:            SecretSource;
  /** The canonical key used for lookup. */
  secretKey:         string;
  /** Org slug that owns the secret. */
  orgSlug:           string;
  /** ISO 8601 timestamp of resolution. */
  resolvedAt:        string;
  /** Duration of the resolution in milliseconds. */
  durationMs:        number;
  /** Human-readable reason (never includes secret value). */
  reason:            string;
  /** Whether this result was produced in Shadow Mode. */
  isShadow?:         boolean;
  /** Shadow comparison divergence (only present in SHADOW_MODE). */
  shadowDivergence?: ShadowDivergence;
}

// ── Secret provider interface ─────────────────────────────────────────────────

export interface SecretProvider {
  /**
   * Resolve a secret by its canonical key for a given org.
   * Never throws — returns structured result with found=false on failure.
   */
  getSecret(orgSlug: string, secretKey: string): Promise<SecretResolutionResult>;

  /**
   * Check if a secret exists for a given org without decrypting the value.
   * Lighter than getSecret — no decryption needed.
   */
  hasSecret(orgSlug: string, secretKey: string): Promise<boolean>;

  /**
   * List all known secret keys for an org (canonical names only, no values).
   */
  listSecrets(orgSlug: string): Promise<string[]>;

  /** Provider identifier for audit logging. */
  readonly providerId: string;
}

// ── Canonical secret keys ─────────────────────────────────────────────────────

/** Canonical secret key identifiers used across all providers. */
export const SECRET_KEYS = {
  // AI providers
  OPENAI_API_KEY:        "OPENAI_API_KEY",
  ANTHROPIC_API_KEY:     "ANTHROPIC_API_KEY",
  // Social / Meta
  META_ACCESS_TOKEN:     "META_ACCESS_TOKEN",
  META_APP_SECRET:       "META_APP_SECRET",
  // Meta Ads (MARKETING-ADS-VAULT-01)
  META_AD_ACCOUNT_ID:    "META_AD_ACCOUNT_ID",
  META_BUSINESS_ID:      "META_BUSINESS_ID",
  META_PAGE_ID:          "META_PAGE_ID",
  // WhatsApp
  WHATSAPP_TOKEN:        "WHATSAPP_TOKEN",
  // TikTok
  TIKTOK_TOKEN:          "TIKTOK_TOKEN",
  // TikTok Ads (MARKETING-ADS-VAULT-01)
  TIKTOK_ADVERTISER_ID:  "TIKTOK_ADVERTISER_ID",
  TIKTOK_BUSINESS_ID:    "TIKTOK_BUSINESS_ID",
  // Shopify
  SHOPIFY_TOKEN:         "SHOPIFY_TOKEN",
  SHOPIFY_WEBHOOK_SECRET: "SHOPIFY_WEBHOOK_SECRET",
  // DIAN
  DIAN_CERTIFICATE:      "DIAN_CERTIFICATE",
  DIAN_PASSWORD:         "DIAN_PASSWORD",
  // ERP / SAG
  ERP_PASSWORD:          "ERP_PASSWORD",
  ERP_API_KEY:           "ERP_API_KEY",
  ERP_WEBHOOK_SECRET:    "ERP_WEBHOOK_SECRET",
} as const;

export type SecretKey = typeof SECRET_KEYS[keyof typeof SECRET_KEYS];

// ── Result factories ──────────────────────────────────────────────────────────

/** Build a "not found" result. Never throws. */
export function notFoundResult(
  orgSlug:    string,
  secretKey:  string,
  durationMs: number,
): SecretResolutionResult {
  return {
    found:      false,
    source:     "NOT_FOUND",
    secretKey,
    orgSlug,
    resolvedAt: new Date().toISOString(),
    durationMs,
    reason:     `Secret "${secretKey}" not found in Vault, legacy, or environment`,
  };
}

/** Build a successful resolution result. */
export function foundResult(
  orgSlug:    string,
  secretKey:  string,
  secret:     string,
  source:     Exclude<SecretSource, "NOT_FOUND">,
  durationMs: number,
): SecretResolutionResult {
  return {
    found:      true,
    secret,
    source,
    secretKey,
    orgSlug,
    resolvedAt: new Date().toISOString(),
    durationMs,
    reason:     `Secret "${secretKey}" resolved from ${source}`,
  };
}
