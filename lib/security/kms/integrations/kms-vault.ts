/**
 * lib/security/kms/integrations/kms-vault.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS → Vault Adapter
 *
 * Server-only. Bridges the KMS engine to the Vault
 * (AGENTIK-SECURITY-VAULT-01).
 *
 * The Vault stores encrypted secret values. Integrating with KMS means:
 *   - Secret values are encrypted using a KMS-managed tenant key
 *   - The Vault stores the encrypted envelope + key reference
 *   - Decryption requires KMS access (RBAC + Zero Trust gated)
 *
 * This is an integration contract for AGENTIK-SECURITY-VAULT-02.
 * Currently provides the adapter interface and factory helpers.
 */

import "server-only";

import type { KmsEncryptedEnvelope, KmsKeyMetadata } from "../kms-key";
import type { KmsResult, KmsAccessContext } from "../kms-types";
import { kmsEngine } from "../kms-engine";

// ── Vault KMS Request ─────────────────────────────────────────────────────────

export interface VaultKmsEncryptRequest {
  /** The secret value to protect (plaintext). Never log this. */
  secretValue: string;
  /** Key alias for this tenant's vault key. */
  keyAlias:    string;
  /** Tenant scope. */
  orgSlug:     string;
  /** Additional context for authenticated encryption (e.g. secretId). */
  secretId?:   string;
  /** Caller context for RBAC + Zero Trust. */
  context:     KmsAccessContext;
}

export interface VaultKmsDecryptRequest {
  /** The encrypted envelope stored in the Vault. */
  envelope: KmsEncryptedEnvelope;
  /** Tenant scope. */
  orgSlug:  string;
  /** Caller context for RBAC + Zero Trust. */
  context:  KmsAccessContext;
}

// ── VaultKmsAdapter ───────────────────────────────────────────────────────────

/**
 * VaultKmsAdapter — high-level KMS interface for the Vault.
 *
 * Used by AGENTIK-SECURITY-VAULT-02 to protect secret values with KMS.
 */
export class VaultKmsAdapter {

  /**
   * encryptSecret — encrypt a secret value for vault storage.
   * Returns an opaque envelope with no key material.
   */
  async encryptSecret(req: VaultKmsEncryptRequest): Promise<KmsResult<KmsEncryptedEnvelope>> {
    return kmsEngine.encrypt(
      {
        plaintext: req.secretValue,
        keyAlias:  req.keyAlias,
        orgSlug:   req.orgSlug,
        context:   req.secretId ? `vault_secret:${req.secretId}` : undefined,
      },
      req.context,
    );
  }

  /**
   * decryptSecret — decrypt a vault secret envelope.
   * Returns the plaintext secret value.
   */
  async decryptSecret(
    req: VaultKmsDecryptRequest,
  ): Promise<KmsResult<{ plaintext: string; keyAlias: string; keyVersion: number }>> {
    return kmsEngine.decrypt(
      { envelope: req.envelope, orgSlug: req.orgSlug },
      req.context,
    );
  }

  /**
   * getVaultKey — retrieve the KMS key used for a tenant's vault.
   */
  async getVaultKey(
    orgSlug:  string,
    keyAlias: string,
    context:  KmsAccessContext,
  ): Promise<KmsResult<KmsKeyMetadata>> {
    return kmsEngine.getKeyMetadata(keyAlias, orgSlug, context);
  }
}

/** Singleton adapter for the Vault. */
export const vaultKmsAdapter = new VaultKmsAdapter();

// ── buildVaultKmsContext ──────────────────────────────────────────────────────

/**
 * buildVaultKmsContext — construct a KmsAccessContext for Vault-initiated operations.
 */
export function buildVaultKmsContext(
  orgSlug:   string,
  keyAlias:  string,
  operation: KmsAccessContext["operation"],
): KmsAccessContext {
  return {
    subjectId:   "vault_service",
    subjectType: "SYSTEM",
    orgSlug,
    operation,
    keyAlias,
  };
}

// ── VAULT_KMS_KEY_ALIAS ───────────────────────────────────────────────────────

/**
 * Standard key alias convention for tenant vault keys.
 * Format: vault_key_{orgSlug}
 */
export function getVaultKeyAlias(orgSlug: string): string {
  return `vault_key_${orgSlug}`;
}
