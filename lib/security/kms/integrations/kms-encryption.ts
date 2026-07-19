/**
 * lib/security/kms/integrations/kms-encryption.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS → Encryption Layer Adapter
 *
 * Server-only. Bridges the KMS engine to the Encryption Layer
 * (AGENTIK-SECURITY-ENCRYPTION-01).
 *
 * The Encryption Layer uses AES-256-GCM keys managed by the KMS.
 * This adapter provides the interface contract so the Encryption
 * Layer can request KMS operations without coupling to the engine.
 *
 * Integration contract (for AGENTIK-SECURITY-ENCRYPTION-02):
 *   - resolveEncryptionKey(orgSlug, keyAlias) → key metadata
 *   - encryptWithKms(data, orgSlug, keyAlias) → encrypted envelope
 *   - decryptWithKms(envelope, orgSlug) → plaintext
 */

import "server-only";

import type { KmsEncryptedEnvelope, KmsKeyMetadata } from "../kms-key";
import type { KmsResult, KmsAccessContext } from "../kms-types";
import { kmsEngine } from "../kms-engine";

// ── KMS Encryption Request ────────────────────────────────────────────────────

export interface KmsEncryptionRequest {
  /** The plaintext data to encrypt (string or Buffer). */
  plaintext:   string;
  /** Target key alias. */
  keyAlias:    string;
  /** Tenant scope. */
  orgSlug:     string;
  /** Additional context for the encrypted envelope. */
  aad?:        string;  // mapped to KmsEncryptParams.context
  /** Access context for RBAC + Zero Trust gates. */
  context:     KmsAccessContext;
}

// ── KMS Decryption Request ────────────────────────────────────────────────────

export interface KmsDecryptionRequest {
  /** The encrypted envelope produced by encryptWithKms. */
  envelope:    KmsEncryptedEnvelope;
  /** Tenant scope. */
  orgSlug:     string;
  /** Access context for RBAC + Zero Trust gates. */
  context:     KmsAccessContext;
}

// ── KmsEncryptionAdapter ──────────────────────────────────────────────────────

/**
 * KmsEncryptionAdapter — high-level interface for the Encryption Layer.
 *
 * Wraps kmsEngine with encryption-specific semantics.
 * Used by AGENTIK-SECURITY-ENCRYPTION-02 when it integrates with KMS.
 */
export class KmsEncryptionAdapter {

  // ── resolveKey ──────────────────────────────────────────────────────────────

  /**
   * resolveKey — retrieve key metadata for an alias within a tenant.
   * Used by the Encryption Layer to verify key status before encrypting.
   */
  async resolveKey(
    orgSlug:  string,
    keyAlias: string,
    context:  KmsAccessContext,
  ): Promise<KmsResult<KmsKeyMetadata>> {
    return kmsEngine.getKeyMetadata(keyAlias, orgSlug, context);
  }

  // ── encrypt ─────────────────────────────────────────────────────────────────

  /**
   * encrypt — wrap a plaintext value using the KMS.
   * Returns an opaque encrypted envelope — no key material exposed.
   */
  async encrypt(req: KmsEncryptionRequest): Promise<KmsResult<KmsEncryptedEnvelope>> {
    return kmsEngine.encrypt(
      {
        plaintext: req.plaintext,
        keyAlias:  req.keyAlias,
        orgSlug:   req.orgSlug,
        context:   req.aad,
      },
      req.context,
    );
  }

  // ── decrypt ─────────────────────────────────────────────────────────────────

  /**
   * decrypt — unwrap an encrypted envelope using the KMS.
   * Returns plaintext string — never exposes key material.
   */
  async decrypt(
    req: KmsDecryptionRequest,
  ): Promise<KmsResult<{ plaintext: string; keyAlias: string; keyVersion: number }>> {
    return kmsEngine.decrypt(
      { envelope: req.envelope, orgSlug: req.orgSlug },
      req.context,
    );
  }
}

/** Singleton adapter for the Encryption Layer. */
export const kmsEncryptionAdapter = new KmsEncryptionAdapter();

// ── buildEncryptionContext ────────────────────────────────────────────────────

/**
 * buildEncryptionContext — construct a KmsAccessContext for Encryption Layer calls.
 */
export function buildEncryptionContext(
  orgSlug:  string,
  keyAlias: string,
  operation: KmsAccessContext["operation"],
): KmsAccessContext {
  return {
    subjectId:   "encryption_layer",
    subjectType: "SYSTEM",
    orgSlug,
    operation,
    keyAlias,
  };
}
