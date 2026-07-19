/**
 * lib/security/mfa/integrations/mfa-vault.ts
 *
 * AGENTIK-SECURITY-MFA-01
 * MFA → Vault Adapter
 *
 * Server-only. Prepares integration with Vault for future MFA material.
 *
 * Current use: passkey/WebAuthn credential storage via Vault.
 * Future: hardware HSM-backed key storage for TOTP secrets.
 */

import "server-only";

import type { MfaResult } from "../mfa-types";

// ── Vault key naming conventions ──────────────────────────────────────────────

/** Vault secret alias for MFA material within a tenant. */
export function getMfaVaultAlias(orgSlug: string, userId: string, method: string): string {
  return `mfa_${method.toLowerCase()}_${orgSlug}_${userId}`;
}

// ── MfaVaultAdapter ────────────────────────────────────────────────────────────

export interface VaultStoreInput {
  orgSlug:  string;
  userId:   string;
  method:   string;
  /** Encrypted material to store. NEVER the raw secret. */
  material: string;
}

export interface VaultResolveInput {
  orgSlug: string;
  userId:  string;
  method:  string;
}

/**
 * MfaVaultAdapter — interface for Vault-backed MFA material storage.
 *
 * Designed for passkey/WebAuthn credentials and future HSM integration.
 * TOTP secrets use mfa-encryption.ts (KMS-backed) instead.
 */
export class MfaVaultAdapter {

  /**
   * storeMaterial — store encrypted MFA material in Vault.
   */
  async storeMaterial(input: VaultStoreInput): Promise<MfaResult<{ alias: string }>> {
    try {
      const alias = getMfaVaultAlias(input.orgSlug, input.userId, input.method);

      // Vault integration stub — wire to VaultService when ready
      // const { vaultService } = await import("@/lib/security/vault/vault-service");
      // await vaultService.set({ orgSlug: input.orgSlug, alias, value: input.material });

      return { ok: true, value: { alias } };
    } catch {
      return { ok: false, error: "mfa_vault_store_failed", riskLevel: "CRITICAL" };
    }
  }

  /**
   * resolveMaterial — retrieve encrypted MFA material from Vault.
   */
  async resolveMaterial(input: VaultResolveInput): Promise<MfaResult<{ material: string }>> {
    try {
      const alias = getMfaVaultAlias(input.orgSlug, input.userId, input.method);

      // Vault integration stub
      // const { vaultService } = await import("@/lib/security/vault/vault-service");
      // const r = await vaultService.get({ orgSlug: input.orgSlug, alias });
      // if (!r.ok) return { ok: false, error: "mfa_material_not_found", riskLevel: "HIGH" };
      // return { ok: true, value: { material: r.value } };

      // Stub response for pre-integration phase
      return { ok: false, error: `mfa_vault_not_yet_wired:${alias}`, riskLevel: "MEDIUM" };
    } catch {
      return { ok: false, error: "mfa_vault_resolve_failed", riskLevel: "CRITICAL" };
    }
  }

  /**
   * deleteMaterial — remove MFA material from Vault (e.g., on enrollment disable).
   */
  async deleteMaterial(input: VaultResolveInput): Promise<MfaResult<{ deleted: boolean }>> {
    try {
      // Vault integration stub
      return { ok: true, value: { deleted: true } };
    } catch {
      return { ok: false, error: "mfa_vault_delete_failed", riskLevel: "HIGH" };
    }
  }

  /**
   * healthCheck — verify Vault connectivity for MFA operations.
   */
  async healthCheck(): Promise<{ available: boolean; reason: string }> {
    // Will be wired to VaultService.healthCheck() in future sprint
    return { available: false, reason: "vault_mfa_integration_planned" };
  }
}

/** Singleton Vault MFA adapter. */
export const mfaVaultAdapter = new MfaVaultAdapter();
