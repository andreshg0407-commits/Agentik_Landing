/**
 * lib/security/vault/vault-repository.ts
 *
 * AGENTIK-SECURITY-VAULT-01
 * Standalone Org-Scoped Secret Vault — Repository Interface
 *
 * Pure interface contract for VaultSecret persistence.
 * Decoupled from Prisma — the concrete implementation lives in
 * prisma-vault-repository.ts.
 *
 * All methods are scoped to orgSlug (tenant isolation enforced at repo level).
 * Access policy enforcement belongs to VaultService, not VaultRepository.
 *
 * No server-only, no Prisma, no React in this file.
 */

import type {
  VaultCreateInput,
  VaultSecretMetadata,
  VaultUpdateInput,
} from "./vault-secret-record";

// ── Repository interface ──────────────────────────────────────────────────────

export interface VaultRepository {
  /**
   * Persist a new VaultSecret.
   * The encryptedValue is already encrypted by VaultService.
   * Returns the stored metadata (no ciphertext).
   */
  create(
    orgSlug:        string,
    input:          VaultCreateInput,
    encryptedValue: string,
    keyVersion:     number,
  ): Promise<VaultSecretMetadata>;

  /**
   * Retrieve the full record including encrypted value.
   * Returns null if not found or if orgSlug does not match.
   */
  findById(
    id:      string,
    orgSlug: string,
  ): Promise<{ metadata: VaultSecretMetadata; encryptedValue: string } | null>;

  /**
   * List all secrets for an org (metadata only, no ciphertext).
   * Ordered by createdAt descending.
   */
  listByOrg(orgSlug: string): Promise<VaultSecretMetadata[]>;

  /**
   * Update mutable metadata fields (name, tags, expiresAt, notes).
   * Does NOT update the encrypted value — use rotateEncryptedValue for that.
   * Returns null if not found.
   */
  update(
    id:      string,
    orgSlug: string,
    input:   VaultUpdateInput,
  ): Promise<VaultSecretMetadata | null>;

  /**
   * Update the encrypted value + keyVersion (called during key rotation).
   * Returns null if not found.
   */
  rotateEncryptedValue(
    id:             string,
    orgSlug:        string,
    encryptedValue: string,
    keyVersion:     number,
  ): Promise<VaultSecretMetadata | null>;

  /**
   * Record a successful secret access (updates lastAccessedAt).
   * Never throws — must not interrupt the caller's operation.
   */
  touchAccessedAt(id: string, orgSlug: string): Promise<void>;

  /**
   * Set status to DISABLED (reversible).
   * Returns null if not found.
   */
  disable(id: string, orgSlug: string): Promise<VaultSecretMetadata | null>;

  /**
   * Set status to REVOKED + revokedAt (irreversible).
   * Returns null if not found.
   */
  revoke(id: string, orgSlug: string): Promise<VaultSecretMetadata | null>;

  /**
   * Hard delete — permanent. Only call after explicit confirmation.
   * Returns true if deleted, false if not found.
   */
  delete(id: string, orgSlug: string): Promise<boolean>;
}
