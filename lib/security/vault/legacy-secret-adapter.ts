/**
 * lib/security/vault/legacy-secret-adapter.ts
 *
 * AGENTIK-SECURITY-VAULT-MIGRATION-01
 * Vault Migration Layer — Legacy Secret Adapter
 *
 * READ-ONLY adapter for legacy secret stores.
 * Maps old environment variable names to canonical SecretKey format.
 *
 * Never writes. Never migrates. Only reads — for backward compatibility.
 * As secrets are migrated to Vault, legacy env vars become unreachable
 * (VaultFirstResolver hits Vault first and stops).
 *
 * No server-only. No Prisma. Pure mapping logic.
 */

import type { SecretProvider, SecretResolutionResult } from "./secret-provider";
import { foundResult, notFoundResult } from "./secret-provider";

// ── Legacy name mappings ──────────────────────────────────────────────────────

/**
 * Maps canonical SecretKey to known legacy environment variable names.
 * Order matters — first match wins.
 */
export const LEGACY_ENV_MAP: Readonly<Record<string, string[]>> = {
  OPENAI_API_KEY:         ["OPENAI_API_KEY", "OPENAI_KEY", "OPENAI_TOKEN"],
  ANTHROPIC_API_KEY:      ["ANTHROPIC_API_KEY", "ANTHROPIC_KEY", "CLAUDE_API_KEY"],
  META_ACCESS_TOKEN:      ["META_ACCESS_TOKEN", "META_TOKEN", "FACEBOOK_ACCESS_TOKEN", "FB_ACCESS_TOKEN"],
  META_APP_SECRET:        ["META_APP_SECRET", "FACEBOOK_APP_SECRET", "FB_APP_SECRET"],
  // Meta Ads (MARKETING-ADS-VAULT-01)
  META_AD_ACCOUNT_ID:     ["META_AD_ACCOUNT_ID", "META_ADS_ACCOUNT_ID"],
  META_BUSINESS_ID:       ["META_BUSINESS_ID", "META_BUSINESS_MANAGER_ID"],
  META_PAGE_ID:           ["META_PAGE_ID", "META_FB_PAGE_ID"],
  WHATSAPP_TOKEN:         ["WHATSAPP_TOKEN", "WHATSAPP_ACCESS_TOKEN", "WA_TOKEN"],
  TIKTOK_TOKEN:           ["TIKTOK_TOKEN", "TIKTOK_ACCESS_TOKEN", "TIKTOK_API_TOKEN"],
  // TikTok Ads (MARKETING-ADS-VAULT-01)
  TIKTOK_ADVERTISER_ID:   ["TIKTOK_ADVERTISER_ID", "TIKTOK_ADS_ADVERTISER_ID"],
  TIKTOK_BUSINESS_ID:     ["TIKTOK_BUSINESS_ID", "TIKTOK_BUSINESS_CENTER_ID"],
  SHOPIFY_TOKEN:          ["SHOPIFY_ACCESS_TOKEN", "SHOPIFY_TOKEN", "SHOPIFY_ADMIN_TOKEN"],
  SHOPIFY_WEBHOOK_SECRET: ["SHOPIFY_WEBHOOK_SECRET", "SHOPIFY_WEBHOOK_TOKEN"],
  DIAN_CERTIFICATE:       ["DIAN_CERTIFICATE_PATH", "DIAN_CERT_PATH", "DIAN_P12_PATH"],
  DIAN_PASSWORD:          ["DIAN_CERTIFICATE_PASSWORD", "DIAN_CERT_PASSWORD", "DIAN_P12_PASSWORD"],
  ERP_PASSWORD:           ["ERP_PASSWORD", "ERP_API_PASSWORD", "SAG_PASSWORD"],
  ERP_API_KEY:            ["ERP_API_KEY", "SAG_API_KEY", "ERP_KEY"],
  ERP_WEBHOOK_SECRET:     ["ERP_WEBHOOK_SECRET", "ERP_WEBHOOK_TOKEN"],
};

// ── Environment provider ──────────────────────────────────────────────────────

/**
 * EnvironmentSecretProvider — reads from process.env using legacy name mapping.
 * This is the final fallback — indicates the secret has not been migrated to Vault.
 */
export class EnvironmentSecretProvider implements SecretProvider {
  readonly providerId = "environment";

  async getSecret(orgSlug: string, secretKey: string): Promise<SecretResolutionResult> {
    const start    = Date.now();
    const envNames = LEGACY_ENV_MAP[secretKey] ?? [secretKey];

    for (const envName of envNames) {
      const value = process.env[envName];
      if (value && value.trim().length > 0) {
        return foundResult(orgSlug, secretKey, value.trim(), "ENVIRONMENT", Date.now() - start);
      }
    }

    return notFoundResult(orgSlug, secretKey, Date.now() - start);
  }

  async hasSecret(_orgSlug: string, secretKey: string): Promise<boolean> {
    const envNames = LEGACY_ENV_MAP[secretKey] ?? [secretKey];
    return envNames.some(name => {
      const v = process.env[name];
      return !!v && v.trim().length > 0;
    });
  }

  async listSecrets(_orgSlug: string): Promise<string[]> {
    return Object.keys(LEGACY_ENV_MAP).filter(key => {
      const envNames = LEGACY_ENV_MAP[key] ?? [];
      return envNames.some(name => {
        const v = process.env[name];
        return !!v && v.trim().length > 0;
      });
    });
  }
}

// ── Legacy Vault provider (stub) ──────────────────────────────────────────────

/**
 * LegacyVaultSecretProvider — reads from Integration.secretsJson (old vault).
 * Stub implementation — returns not-found to signal "no legacy vault data".
 * Concrete implementation in AGENTIK-SECURITY-MIGRATION-02 when dual-write begins.
 */
export class LegacyVaultSecretProvider implements SecretProvider {
  readonly providerId = "legacy-vault";

  async getSecret(orgSlug: string, secretKey: string): Promise<SecretResolutionResult> {
    // Legacy vault (Integration.secretsJson) reads are not yet wired.
    // This provider returns not-found, which causes VaultFirstResolver
    // to fall through to the environment provider.
    // Replace with Prisma lookup in AGENTIK-SECURITY-MIGRATION-02.
    return notFoundResult(orgSlug, secretKey, 0);
  }

  async hasSecret(_orgSlug: string, _secretKey: string): Promise<boolean> {
    return false;
  }

  async listSecrets(_orgSlug: string): Promise<string[]> {
    return [];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Get all known legacy environment variable names for a canonical key. */
export function getLegacyEnvNames(secretKey: string): string[] {
  return LEGACY_ENV_MAP[secretKey] ?? [secretKey];
}

/** Find which legacy environment variable is currently set for a canonical key. */
export function findActiveLegacyEnv(secretKey: string): string | undefined {
  const envNames = getLegacyEnvNames(secretKey);
  return envNames.find(name => {
    const v = process.env[name];
    return !!v && v.trim().length > 0;
  });
}

/**
 * Check if a secret has been fully migrated (no legacy env vars present).
 * true = safe to remove the legacy environment variable.
 */
export function isLegacyEnvPresent(secretKey: string): boolean {
  return !!findActiveLegacyEnv(secretKey);
}

/** All canonical secret keys known to the legacy adapter. */
export const ALL_LEGACY_SECRET_KEYS: string[] = Object.keys(LEGACY_ENV_MAP);
