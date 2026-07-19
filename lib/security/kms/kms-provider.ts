/**
 * lib/security/kms/kms-provider.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS Provider Contract — Universal Interface
 *
 * No server-only. No Prisma. Pure interface contract.
 *
 * All KMS providers (Local, AWS, Azure, GCP, Custom) MUST implement this
 * interface. The KmsEngine operates exclusively through this contract,
 * ensuring the rest of the platform remains provider-agnostic.
 *
 * CRITICAL CONSTRAINTS:
 *   - encrypt() never returns key material
 *   - decrypt() returns plaintext only to the authorized caller
 *   - getKeyMetadata() never returns key material
 *   - generateKey() returns only metadata, never the raw key bytes
 *   - All operations are tenant-scoped via orgSlug
 */

import type { KmsProviderType, KmsResult, KmsHealthStatus } from "./kms-types";
import type {
  KmsKeyMetadata,
  KmsKeyCreateInput,
  KmsEncryptedEnvelope,
} from "./kms-key";

// ── Encryption / Decryption Params ────────────────────────────────────────────

export interface KmsEncryptParams {
  /** The plaintext data to encrypt. */
  plaintext: string;
  /** Alias of the key to use for encryption. */
  keyAlias:  string;
  /** Tenant scope. */
  orgSlug:   string;
  /** Optional context label for the envelope. */
  context?:  string;
}

export interface KmsDecryptParams {
  /** The encrypted envelope produced by encrypt(). */
  envelope: KmsEncryptedEnvelope;
  /** Tenant scope — must match envelope.keyRef.orgSlug. */
  orgSlug:  string;
}

export interface KmsDecryptResult {
  /** Decrypted plaintext. */
  plaintext: string;
  /** Key alias that was used. */
  keyAlias:  string;
  /** Key version that was used. */
  keyVersion: number;
}

// ── Rotation Params ───────────────────────────────────────────────────────────

export interface KmsRotateParams {
  /** Alias of the key to rotate. */
  keyAlias: string;
  /** Tenant scope. */
  orgSlug:  string;
  /** Reason for rotation (for audit). Optional. */
  reason?:  string;
}

export interface KmsRotateResult {
  /** Previous key version number. */
  previousVersion: number;
  /** New key version number. */
  newVersion:      number;
  /** Updated key metadata (no key material). */
  metadata:        KmsKeyMetadata;
}

// ── Enable / Disable / Delete Params ─────────────────────────────────────────

export interface KmsKeyLifecycleParams {
  keyAlias: string;
  orgSlug:  string;
  reason?:  string;
}

// ── Health Check ──────────────────────────────────────────────────────────────

export interface KmsProviderHealthResult {
  status:    KmsHealthStatus;
  provider:  KmsProviderType;
  latencyMs: number;
  details:   string;
  checkedAt: string;
}

// ── Provider Interface ────────────────────────────────────────────────────────

/**
 * KmsProvider — the universal contract all KMS implementations must satisfy.
 *
 * The KmsEngine calls this interface exclusively.
 * Never depends on a concrete provider implementation.
 */
export interface KmsProvider {
  /** The provider type identifier. */
  readonly providerType: KmsProviderType;

  /**
   * generateKey — create a new managed key.
   * Returns metadata only — never the raw key bytes.
   */
  generateKey(input: KmsKeyCreateInput): Promise<KmsResult<KmsKeyMetadata>>;

  /**
   * encrypt — encrypt plaintext using a named key.
   * Returns a KmsEncryptedEnvelope — never key material.
   */
  encrypt(params: KmsEncryptParams): Promise<KmsResult<KmsEncryptedEnvelope>>;

  /**
   * decrypt — decrypt an envelope.
   * Returns the original plaintext.
   */
  decrypt(params: KmsDecryptParams): Promise<KmsResult<KmsDecryptResult>>;

  /**
   * rotateKey — create a new key version, retiring the previous one.
   * Returns rotation metadata — never key material.
   */
  rotateKey(params: KmsRotateParams): Promise<KmsResult<KmsRotateResult>>;

  /**
   * disableKey — suspend a key from all operations.
   */
  disableKey(params: KmsKeyLifecycleParams): Promise<KmsResult<KmsKeyMetadata>>;

  /**
   * enableKey — re-activate a disabled key.
   */
  enableKey(params: KmsKeyLifecycleParams): Promise<KmsResult<KmsKeyMetadata>>;

  /**
   * deleteKey — permanently delete a key.
   * CRITICAL: irreversible. All data encrypted with this key becomes inaccessible.
   */
  deleteKey(params: KmsKeyLifecycleParams): Promise<KmsResult<{ deleted: boolean; keyAlias: string }>>;

  /**
   * healthCheck — verify the provider is reachable and operational.
   */
  healthCheck(): Promise<KmsProviderHealthResult>;

  /**
   * getKeyMetadata — retrieve metadata for a key by alias.
   * Returns metadata only — never key material.
   */
  getKeyMetadata(keyAlias: string, orgSlug: string): Promise<KmsResult<KmsKeyMetadata>>;
}
