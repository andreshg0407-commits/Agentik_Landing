/**
 * lib/marketing-studio/ads/ads-vault-smoke.ts
 *
 * MARKETING-ADS-VAULT-01 — Deterministic Vault Smoke Checks
 *
 * Pure functions — no Prisma, no network, no side effects.
 * Safe to call in tests, health checks, or admin validation endpoints.
 *
 * Each check is named, produces a boolean pass/fail, and a reason string.
 * Reasons never include secret values.
 */

import type { AdsCredentialSource } from "./connectors/ads-connector-types";
import type { AdsVaultMetadataEntry } from "./ads-vault";

// ── Check types ────────────────────────────────────────────────────────────────

export interface VaultSmokeCheck {
  name:   string;
  pass:   boolean;
  reason: string;
}

export interface VaultSmokeResult {
  ok:     boolean;
  checks: VaultSmokeCheck[];
}

// ── Individual checks ──────────────────────────────────────────────────────────

function checkTenantId(orgSlug: string | undefined | null): VaultSmokeCheck {
  const pass = typeof orgSlug === "string" && orgSlug.trim().length > 0;
  return {
    name:   "tenantId_required",
    pass,
    reason: pass
      ? `orgSlug="${orgSlug}" is present`
      : "orgSlug is empty or missing — no tenant-less credential lookups allowed",
  };
}

function checkNoSecretsInPayload(payload: Record<string, unknown>): VaultSmokeCheck {
  const forbidden = ["accessToken", "secret", "password", "encryptedValue", "token", "apiKey"];
  const found = forbidden.filter(key => key in payload && payload[key] !== null && payload[key] !== undefined);
  const pass  = found.length === 0;
  return {
    name:   "no_secrets_in_payload",
    pass,
    reason: pass
      ? "Payload contains no sensitive field names"
      : `Payload contains forbidden fields: ${found.join(", ")}`,
  };
}

function checkProductionEnvBehavior(
  credentialSource: AdsCredentialSource,
  isProduction:     boolean,
): VaultSmokeCheck {
  // In production, ENV_DEV_FALLBACK must never be used.
  const pass = !(isProduction && credentialSource === "ENV_DEV_FALLBACK");
  return {
    name:   "production_no_env_fallback",
    pass,
    reason: pass
      ? isProduction
        ? "Production: credentials from VAULT or NOT_CONFIGURED — no env fallback"
        : "Dev/test: env fallback is permitted"
      : "VIOLATION: production environment is using ENV_DEV_FALLBACK — migrate credentials to Vault",
  };
}

function checkDevEnvFallbackPermitted(
  credentialSource: AdsCredentialSource,
  isProduction:     boolean,
): VaultSmokeCheck {
  const pass = !isProduction || credentialSource !== "ENV_DEV_FALLBACK";
  return {
    name:   "dev_env_fallback_only_in_dev",
    pass,
    reason: pass
      ? "ENV_DEV_FALLBACK usage is environment-appropriate"
      : "ENV_DEV_FALLBACK detected in production — blocked",
  };
}

function checkMetadataSafe(entry: AdsVaultMetadataEntry): VaultSmokeCheck {
  const forbidden = ["accessToken", "encryptedValue", "secret", "password"];
  const keys = Object.keys(entry);
  const found = forbidden.filter(k => keys.includes(k));
  const pass  = found.length === 0;
  return {
    name:   "metadata_safe",
    pass,
    reason: pass
      ? `AdsVaultMetadataEntry for "${entry.platform}" contains no secret fields`
      : `AdsVaultMetadataEntry exposes forbidden fields: ${found.join(", ")}`,
  };
}

function checkConnectorReceivesTenant(orgSlug: string | undefined | null): VaultSmokeCheck {
  const pass = typeof orgSlug === "string" && orgSlug.trim().length > 0;
  return {
    name:   "connector_receives_tenant",
    pass,
    reason: pass
      ? `Connector received orgSlug="${orgSlug}"`
      : "Connector called without orgSlug — tenant isolation violated",
  };
}

// ── Main runner ───────────────────────────────────────────────────────────────

export interface AdsVaultSmokeInput {
  orgSlug:           string | undefined | null;
  isProduction:      boolean;
  credentialSource:  AdsCredentialSource;
  /** Safe metadata payload — must not contain any secret values. */
  metadataPayload:   Record<string, unknown>;
  /** AdsVaultMetadataEntry objects returned by getAdsVaultMetadata(). */
  vaultMetadata:     AdsVaultMetadataEntry[];
}

/**
 * Run all deterministic smoke checks for the Ads Vault layer.
 *
 * @returns VaultSmokeResult — ok=true only if ALL checks pass.
 */
export function runAdsVaultSmokeChecks(input: AdsVaultSmokeInput): VaultSmokeResult {
  const checks: VaultSmokeCheck[] = [
    checkTenantId(input.orgSlug),
    checkNoSecretsInPayload(input.metadataPayload),
    checkProductionEnvBehavior(input.credentialSource, input.isProduction),
    checkDevEnvFallbackPermitted(input.credentialSource, input.isProduction),
    checkConnectorReceivesTenant(input.orgSlug),
    ...input.vaultMetadata.map(entry => checkMetadataSafe(entry)),
  ];

  return {
    ok:     checks.every(c => c.pass),
    checks,
  };
}
