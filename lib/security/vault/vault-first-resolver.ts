/**
 * lib/security/vault/vault-first-resolver.ts
 *
 * AGENTIK-SECURITY-VAULT-MIGRATION-01
 * Vault Migration Layer — Vault-First Resolution Strategy
 *
 * Resolution hierarchy:
 *   1. Vault       → VaultService (new, encrypted, org-scoped)
 *   2. Legacy      → Integration.secretsJson or legacy configs
 *   3. Environment → process.env fallback (deprecated)
 *   4. NOT_FOUND   → structured error, never throws
 *
 * Shadow Mode (VAULT_SHADOW_MODE=true):
 *   - Primary result is used for the actual operation (no blocking)
 *   - Secondary source is also resolved (fire-and-forget)
 *   - Divergence logged to audit for migration tracking
 *   - Production behavior is NEVER changed by shadow mode
 *
 * Principles:
 *   - Fail safe: never throws on missing secret
 *   - Fail closed: always audit, always return structured result
 *   - Tenant isolation: orgSlug always required
 *
 * IMPORTANT: server-side only — depends on VaultServiceAuditLog.
 */

import type { SecretProvider, SecretResolutionResult, SecretSource, ShadowDivergence } from "./secret-provider";
import { notFoundResult } from "./secret-provider";
import { globalVaultServiceAuditLog } from "./vault-service-audit";

// ── Config ────────────────────────────────────────────────────────────────────

export interface VaultFirstResolverConfig {
  /** Vault provider (VaultService-backed, new architecture). */
  vaultProvider:       SecretProvider;
  /** Legacy provider (Integration.secretsJson or legacy env adapter). */
  legacyProvider:      SecretProvider;
  /** Environment provider (process.env fallback — deprecated path). */
  environmentProvider: SecretProvider;
  /**
   * Enable Shadow Mode — resolve from both Vault + legacy, log divergence.
   * Defaults to process.env.VAULT_SHADOW_MODE === "true".
   */
  shadowMode?:         boolean;
}

// ── Resolver ──────────────────────────────────────────────────────────────────

export class VaultFirstResolver {
  private readonly vault:       SecretProvider;
  private readonly legacy:      SecretProvider;
  private readonly environment: SecretProvider;
  private readonly shadowMode:  boolean;

  constructor(config: VaultFirstResolverConfig) {
    this.vault       = config.vaultProvider;
    this.legacy      = config.legacyProvider;
    this.environment = config.environmentProvider;
    this.shadowMode  = config.shadowMode ?? process.env["VAULT_SHADOW_MODE"] === "true";
  }

  // ── Primary resolution ─────────────────────────────────────────────────────

  /**
   * Resolve a secret using Vault-First strategy.
   * Never throws — always returns a structured result.
   */
  async resolve(orgSlug: string, secretKey: string): Promise<SecretResolutionResult> {
    const start = Date.now();

    try {
      // 1. Try Vault (new architecture)
      const vaultResult = await this.tryProvider(this.vault, orgSlug, secretKey);
      if (vaultResult.found) {
        this.auditResolution(orgSlug, secretKey, "VAULT", true);
        if (this.shadowMode) void this.runShadow(vaultResult, orgSlug, secretKey);
        return vaultResult;
      }

      // 2. Try Legacy (Integration.secretsJson, etc.)
      const legacyResult = await this.tryProvider(this.legacy, orgSlug, secretKey);
      if (legacyResult.found) {
        this.auditResolution(orgSlug, secretKey, "LEGACY", true);
        this.emitMigrationWarning(orgSlug, secretKey,
          `LEGACY_FALLBACK: "${secretKey}" resolved from legacy — migrate to Vault`);
        if (this.shadowMode) void this.runShadow(legacyResult, orgSlug, secretKey);
        return legacyResult;
      }

      // 3. Try Environment (process.env — deprecated)
      const envResult = await this.tryProvider(this.environment, orgSlug, secretKey);
      if (envResult.found) {
        this.auditResolution(orgSlug, secretKey, "ENVIRONMENT", true);
        this.emitMigrationWarning(orgSlug, secretKey,
          `ENV_FALLBACK: "${secretKey}" resolved from environment — migrate to Vault immediately`);
        return envResult;
      }

      // 4. Not found in any source
      this.auditResolution(orgSlug, secretKey, "NOT_FOUND", false);
      return notFoundResult(orgSlug, secretKey, Date.now() - start);
    } catch {
      // Fail safe — never propagate exception from secret resolution
      return notFoundResult(orgSlug, secretKey, Date.now() - start);
    }
  }

  /**
   * Check if a secret exists (any source), without reading the value.
   * Never throws.
   */
  async has(orgSlug: string, secretKey: string): Promise<boolean> {
    try {
      const result = await this.resolve(orgSlug, secretKey);
      return result.found;
    } catch {
      return false;
    }
  }

  // ── Shadow Mode ────────────────────────────────────────────────────────────

  /**
   * Run shadow comparison in background — fire-and-forget.
   * Resolves from the non-primary source and logs divergence.
   * Never blocks the caller. Never throws.
   */
  private async runShadow(
    primary:   SecretResolutionResult,
    orgSlug:   string,
    secretKey: string,
  ): Promise<void> {
    try {
      // If primary came from VAULT, shadow from LEGACY. If LEGACY, shadow from VAULT.
      const shadowProvider =
        primary.source === "VAULT"  ? this.legacy  :
        primary.source === "LEGACY" ? this.vault   :
        this.legacy;

      const shadowResult = await this.tryProvider(shadowProvider, orgSlug, secretKey);

      const divergence: ShadowDivergence = {
        primarySource: primary.source as Exclude<SecretSource, "NOT_FOUND">,
        shadowSource:  shadowResult.source,
        valuesMatch:   primary.found && shadowResult.found &&
                       primary.secret === shadowResult.secret,
        primaryFound:  primary.found,
        shadowFound:   shadowResult.found,
      };

      const msg = divergence.valuesMatch
        ? `SHADOW_MATCH: "${secretKey}" values match — ${divergence.primarySource} ↔ ${divergence.shadowSource}`
        : `SHADOW_DIVERGE: "${secretKey}" — primary=${divergence.primarySource}:${divergence.primaryFound} shadow=${divergence.shadowSource}:${divergence.shadowFound}`;

      this.emitMigrationWarning(orgSlug, secretKey, msg);
    } catch {
      // Shadow errors must NEVER propagate or affect production behavior
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async tryProvider(
    provider:  SecretProvider,
    orgSlug:   string,
    secretKey: string,
  ): Promise<SecretResolutionResult> {
    try {
      return await provider.getSecret(orgSlug, secretKey);
    } catch {
      return notFoundResult(orgSlug, secretKey, 0);
    }
  }

  private auditResolution(
    orgSlug:   string,
    secretKey: string,
    source:    SecretSource,
    success:   boolean,
  ): void {
    try {
      const eventType =
        source === "VAULT"       ? "SECRET_RESOLVED_FROM_VAULT"  :
        source === "LEGACY"      ? "SECRET_RESOLVED_FROM_LEGACY" :
        source === "ENVIRONMENT" ? "SECRET_RESOLVED_FROM_ENV"    :
                                   "ACCESS_DENIED";

      globalVaultServiceAuditLog.record({
        orgSlug,
        eventType,
        actorId:    "vault-first-resolver",
        actorType:  "SYSTEM",
        success,
        durationMs: 0,
        failureReason: success ? undefined : `Secret "${secretKey}" not found in any source`,
      });
    } catch {
      // Audit errors must not propagate
    }
  }

  private emitMigrationWarning(orgSlug: string, secretKey: string, msg: string): void {
    try {
      globalVaultServiceAuditLog.record({
        orgSlug,
        eventType:     "SECRET_MIGRATION_WARNING",
        actorId:       "vault-first-resolver",
        actorType:     "SYSTEM",
        success:       true,
        durationMs:    0,
        failureReason: msg,
      });
    } catch {
      // Never propagate audit errors
    }
  }
}
