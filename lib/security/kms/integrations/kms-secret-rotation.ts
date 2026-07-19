/**
 * lib/security/kms/integrations/kms-secret-rotation.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS → Secret Rotation Adapter
 *
 * Server-only. Bridges the KMS engine to the Secret Rotation Layer
 * (AGENTIK-SECURITY-SECRET-ROTATION-01).
 *
 * When a secret is rotated:
 *   1. A new KMS key version is generated (or a new key for the secret)
 *   2. The new secret value is encrypted under the new key version
 *   3. The old version enters a grace period (read-only)
 *   4. After grace period, the old KMS key version is disabled
 *
 * This adapter provides the contract for AGENTIK-SECURITY-SECRET-ROTATION-02
 * to integrate KMS key versioning with secret rotation lifecycle.
 */

import "server-only";

import type { KmsKeyMetadata, KmsEncryptedEnvelope } from "../kms-key";
import type { KmsResult, KmsAccessContext } from "../kms-types";
import { kmsEngine } from "../kms-engine";

// ── Rotation KMS Request ──────────────────────────────────────────────────────

export interface RotationKmsRequest {
  /** Key alias for this rotation operation. */
  keyAlias:   string;
  /** Tenant scope. */
  orgSlug:    string;
  /** Reason for rotation (for audit). */
  reason:     string;
  /** Caller context for RBAC + Zero Trust. */
  context:    KmsAccessContext;
}

export interface RotationEncryptRequest {
  /** The new secret value (plaintext). Never log. */
  newSecretValue: string;
  /** Key alias (post-rotation version). */
  keyAlias:       string;
  /** Tenant scope. */
  orgSlug:        string;
  /** Rotation ID for AAD binding. */
  rotationId:     string;
  /** Caller context. */
  context:        KmsAccessContext;
}

export interface RotationDecryptRequest {
  /** The old encrypted envelope (grace-period decryption). */
  envelope:   KmsEncryptedEnvelope;
  /** Tenant scope. */
  orgSlug:    string;
  /** Caller context. */
  context:    KmsAccessContext;
}

// ── KmsSecretRotationAdapter ──────────────────────────────────────────────────

/**
 * KmsSecretRotationAdapter — KMS interface for Secret Rotation operations.
 *
 * Provides the key lifecycle operations needed by the rotation workflow.
 */
export class KmsSecretRotationAdapter {

  /**
   * rotateKey — trigger a KMS key rotation for a secret.
   * Returns previous and new version numbers.
   */
  async rotateKey(req: RotationKmsRequest): Promise<KmsResult<{
    previousVersion: number;
    newVersion:      number;
    metadata:        KmsKeyMetadata;
  }>> {
    return kmsEngine.rotateKey(
      { keyAlias: req.keyAlias, orgSlug: req.orgSlug, reason: req.reason },
      req.context,
    );
  }

  /**
   * encryptNewSecretVersion — encrypt a new secret value post-rotation.
   * Binds to the rotation ID via AAD.
   */
  async encryptNewSecretVersion(
    req: RotationEncryptRequest,
  ): Promise<KmsResult<KmsEncryptedEnvelope>> {
    return kmsEngine.encrypt(
      {
        plaintext: req.newSecretValue,
        keyAlias:  req.keyAlias,
        orgSlug:   req.orgSlug,
        context:   `rotation:${req.rotationId}`,
      },
      req.context,
    );
  }

  /**
   * decryptOldSecretVersion — decrypt a grace-period secret value.
   * Used when the old version is still needed after rotation starts.
   */
  async decryptOldSecretVersion(
    req: RotationDecryptRequest,
  ): Promise<KmsResult<{ plaintext: string; keyAlias: string; keyVersion: number }>> {
    return kmsEngine.decrypt(
      { envelope: req.envelope, orgSlug: req.orgSlug },
      req.context,
    );
  }

  /**
   * disableOldKeyVersion — disable the old key version after grace period.
   * Called at grace period expiry.
   */
  async disableOldKeyVersion(
    keyAlias: string,
    orgSlug:  string,
    context:  KmsAccessContext,
  ): Promise<KmsResult<KmsKeyMetadata>> {
    return kmsEngine.disableKey({ keyAlias, orgSlug }, context);
  }

  /**
   * getKeyMetadata — retrieve current key metadata for rotation planning.
   */
  async getKeyMetadata(
    orgSlug:  string,
    keyAlias: string,
    context:  KmsAccessContext,
  ): Promise<KmsResult<KmsKeyMetadata>> {
    return kmsEngine.getKeyMetadata(keyAlias, orgSlug, context);
  }
}

/** Singleton adapter for Secret Rotation. */
export const kmsSecretRotationAdapter = new KmsSecretRotationAdapter();

// ── buildRotationContext ──────────────────────────────────────────────────────

/**
 * buildRotationContext — construct a KmsAccessContext for rotation-initiated calls.
 */
export function buildRotationContext(
  orgSlug:   string,
  keyAlias:  string,
  operation: KmsAccessContext["operation"],
): KmsAccessContext {
  return {
    subjectId:   "secret_rotation_service",
    subjectType: "SYSTEM",
    orgSlug,
    operation,
    keyAlias,
  };
}

/**
 * Standard key alias for a secret's KMS key.
 * Format: secret_key_{secretId}
 */
export function getSecretKeyAlias(secretId: string): string {
  return `secret_key_${secretId}`;
}
