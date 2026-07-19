/**
 * lib/security/encryption/encryption-metadata.ts
 *
 * AGENTIK-SECURITY-ENCRYPTION-01
 * Encryption Foundation — Encryption Metadata
 *
 * Defines the metadata shape that accompanies every encrypted asset.
 * Metadata is always stored separately from the encrypted payload itself
 * so that access decisions can be made without decrypting the content.
 *
 * Separation principle:
 *   - EncryptedPayload  → the ciphertext + cryptographic material
 *   - EncryptionMetadata → who encrypted it, when, for which tenant, at what class
 *
 * No Prisma. No server-only. Pure domain data.
 */

import type {
  EncryptionAlgorithm,
  EncryptionClassification,
  EncryptedPayload,
} from "./encryption-types";

// ── Metadata ──────────────────────────────────────────────────────────────────

/**
 * EncryptionMetadata — contextual information about an encrypted asset.
 *
 * NEVER includes:
 *   - The plaintext
 *   - Key material
 *   - The ciphertext (use EncryptedPayload for that)
 */
export interface EncryptionMetadata {
  /** Opaque reference to the key version used. */
  keyVersion:      string;
  /** Tenant that owns this encrypted asset. */
  tenantId:        string;
  /** Sensitivity classification that required encryption. */
  classification:  EncryptionClassification;
  /** Algorithm used to encrypt this asset. */
  algorithm:       EncryptionAlgorithm;
  /** ISO 8601 timestamp when encryption occurred. */
  encryptedAt:     string;
  /** The asset type being encrypted (e.g., "COPILOT_MEMORY", "PLAYBOOK"). */
  assetType?:      string;
  /**
   * Optional schema version for the plaintext structure.
   * Helps detect schema drift on decryption.
   */
  schemaVersion?:  string;
}

// ── Envelope ──────────────────────────────────────────────────────────────────

/**
 * EncryptedEnvelope — combines payload + metadata in a single serializable unit.
 * This is the preferred format for storing encrypted data in the database.
 *
 * Usage:
 *   - Store as JSON in a single text/jsonb column
 *   - Never split payload and metadata into separate columns
 *   - Always validate metadata before decrypting
 */
export interface EncryptedEnvelope {
  /** The encrypted content. */
  payload:  EncryptedPayload;
  /** Metadata about the encryption. */
  meta:     EncryptionMetadata;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create encryption metadata from a payload.
 * Derives algorithm and encryptedAt from the payload for consistency.
 */
export function createEncryptionMetadata(params: {
  payload:        EncryptedPayload;
  tenantId:       string;
  classification: EncryptionClassification;
  assetType?:     string;
  schemaVersion?: string;
}): EncryptionMetadata {
  return {
    keyVersion:     params.payload.keyVersion,
    tenantId:       params.tenantId,
    classification: params.classification,
    algorithm:      params.payload.algorithm,
    encryptedAt:    params.payload.encryptedAt,
    assetType:      params.assetType,
    schemaVersion:  params.schemaVersion,
  };
}

/**
 * Wrap payload + metadata into a single EncryptedEnvelope.
 */
export function createEnvelope(
  payload:        EncryptedPayload,
  tenantId:       string,
  classification: EncryptionClassification,
  assetType?:     string,
): EncryptedEnvelope {
  return {
    payload,
    meta: createEncryptionMetadata({ payload, tenantId, classification, assetType }),
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate that envelope metadata is internally consistent.
 * Returns true if metadata is valid for the given tenant.
 */
export function validateEnvelopeMetadata(
  envelope: EncryptedEnvelope,
  expectedTenantId: string,
): { valid: boolean; reason?: string } {
  if (envelope.meta.tenantId !== expectedTenantId) {
    return { valid: false, reason: "tenant_id_mismatch" };
  }
  if (envelope.meta.keyVersion !== envelope.payload.keyVersion) {
    return { valid: false, reason: "key_version_mismatch" };
  }
  if (envelope.meta.algorithm !== envelope.payload.algorithm) {
    return { valid: false, reason: "algorithm_mismatch" };
  }
  if (envelope.meta.encryptedAt !== envelope.payload.encryptedAt) {
    return { valid: false, reason: "encrypted_at_mismatch" };
  }
  return { valid: true };
}

/**
 * Extract safe metadata summary for logging/display.
 * NEVER includes payload or decrypted content.
 */
export function safeMetadataSummary(meta: EncryptionMetadata): Record<string, string> {
  return {
    keyVersion:     meta.keyVersion,
    tenantId:       meta.tenantId,
    classification: meta.classification,
    algorithm:      meta.algorithm,
    encryptedAt:    meta.encryptedAt,
    assetType:      meta.assetType ?? "(unset)",
    schemaVersion:  meta.schemaVersion ?? "(unset)",
  };
}

// ── Serialization ─────────────────────────────────────────────────────────────

/**
 * Serialize an EncryptedEnvelope to a JSON string.
 * Returns null if serialization fails.
 */
export function serializeEnvelope(envelope: EncryptedEnvelope): string | null {
  try {
    return JSON.stringify(envelope);
  } catch {
    return null;
  }
}

/**
 * Deserialize a JSON string or object into an EncryptedEnvelope.
 * Returns null if the structure is invalid.
 */
export function deserializeEnvelope(raw: unknown): EncryptedEnvelope | null {
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (
      typeof obj === "object" &&
      obj !== null &&
      "payload" in obj &&
      "meta" in obj &&
      typeof (obj as any).meta?.tenantId === "string" &&
      typeof (obj as any).meta?.keyVersion === "string"
    ) {
      return obj as EncryptedEnvelope;
    }
    return null;
  } catch {
    return null;
  }
}
