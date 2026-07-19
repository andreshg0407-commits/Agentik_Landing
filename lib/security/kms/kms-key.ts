/**
 * lib/security/kms/kms-key.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS Key Domain — Key Metadata Model
 *
 * No server-only. No Prisma. Pure domain types.
 *
 * CRITICAL CONSTRAINT:
 *   Never store or reference actual key material.
 *   This module deals exclusively with metadata about keys,
 *   not with the cryptographic bytes themselves.
 */

import type { KmsProviderType, KmsKeyStatus, KmsRiskLevel } from "./kms-types";

// ── Key Metadata ───────────────────────────────────────────────────────────────

/**
 * KmsKeyMetadata — safe representation of a KMS key.
 * Contains only metadata — never cryptographic material.
 */
export interface KmsKeyMetadata {
  /** Unique key identifier (opaque, stable). */
  keyId:      string;
  /** Human-readable alias (e.g. "tenant-data-key", "vault-master-key"). */
  keyAlias:   string;
  /** Provider managing this key. */
  provider:   KmsProviderType;
  /** Lifecycle status. */
  status:     KmsKeyStatus;
  /** Current version number (increments on each rotation). */
  version:    number;
  /** Tenant scope — key is scoped to this org. */
  orgSlug:    string;
  /** Encryption algorithm used by this key (e.g. "AES-256-GCM"). */
  algorithm:  string;
  /** When this key was first created. ISO 8601. */
  createdAt:  string;
  /** When this key was last rotated. ISO 8601 or undefined. */
  rotatedAt?: string;
  /** When this key expires (undefined = never). ISO 8601 or undefined. */
  expiresAt?: string;
  /** Optional description of the key's purpose. */
  description?: string;
  /** Tags for classification and filtering. */
  tags?:      Record<string, string>;
}

// ── Key Version Reference ─────────────────────────────────────────────────────

/**
 * KmsKeyVersionRef — a reference to a specific version of a key.
 * Used in encrypted envelopes and audit logs.
 * Never contains key material.
 */
export interface KmsKeyVersionRef {
  keyId:    string;
  keyAlias: string;
  version:  number;
  orgSlug:  string;
}

// ── Key Creation Input ────────────────────────────────────────────────────────

/**
 * KmsKeyCreateInput — parameters for generating a new key.
 */
export interface KmsKeyCreateInput {
  /** Desired human-readable alias. Must be unique within the org. */
  keyAlias:     string;
  /** Provider to use. Falls back to LOCAL if unspecified. */
  provider?:    KmsProviderType;
  /** Tenant scope. */
  orgSlug:      string;
  /** Optional expiry for key rotation policy. ISO 8601. */
  expiresAt?:   string;
  /** Optional description. */
  description?: string;
  /** Optional tags. */
  tags?:        Record<string, string>;
}

// ── Encrypted Envelope ────────────────────────────────────────────────────────

/**
 * KmsEncryptedEnvelope — the result of a KMS encryption operation.
 * Contains the ciphertext and enough metadata to decrypt later.
 * Never contains key material.
 */
export interface KmsEncryptedEnvelope {
  /** Opaque base64-encoded ciphertext. */
  ciphertext:   string;
  /** Key reference used to encrypt. */
  keyRef:       KmsKeyVersionRef;
  /** Encryption algorithm used. */
  algorithm:    string;
  /** When this envelope was created. ISO 8601. */
  encryptedAt:  string;
  /** Context label for this envelope (e.g. "vault-secret", "db-field"). */
  context?:     string;
}

// ── Key Risk Level ────────────────────────────────────────────────────────────

/**
 * getKeyRiskLevel — derive risk level based on key alias and provider.
 */
export function getKeyRiskLevel(key: Pick<KmsKeyMetadata, "provider" | "keyAlias">): KmsRiskLevel {
  if (key.provider === "AWS_KMS" || key.provider === "AZURE_KEY_VAULT" || key.provider === "GCP_KMS") {
    return "HIGH";
  }
  if (key.keyAlias.includes("master") || key.keyAlias.includes("vault") || key.keyAlias.includes("root")) {
    return "CRITICAL";
  }
  if (key.keyAlias.includes("financial") || key.keyAlias.includes("payment") || key.keyAlias.includes("dian")) {
    return "HIGH";
  }
  return "MEDIUM";
}

/**
 * isKeyActive — returns true if the key is in an ACTIVE state.
 */
export function isKeyActive(key: Pick<KmsKeyMetadata, "status">): boolean {
  return key.status === "ACTIVE";
}

/**
 * isKeyExpired — returns true if the key has passed its expiry date.
 */
export function isKeyExpired(key: Pick<KmsKeyMetadata, "expiresAt">): boolean {
  if (!key.expiresAt) return false;
  return new Date(key.expiresAt).getTime() < Date.now();
}

/**
 * isKeyOperational — returns true if the key can be used for operations.
 * Keys in ROTATING state can still DECRYPT (read) but not ENCRYPT (write).
 */
export function isKeyOperational(key: Pick<KmsKeyMetadata, "status" | "expiresAt">): boolean {
  if (key.status === "DISABLED" || key.status === "REVOKED") return false;
  if (isKeyExpired(key)) return false;
  return true;
}

/**
 * buildKeyVersionRef — build a KmsKeyVersionRef from key metadata.
 */
export function buildKeyVersionRef(key: KmsKeyMetadata): KmsKeyVersionRef {
  return {
    keyId:    key.keyId,
    keyAlias: key.keyAlias,
    version:  key.version,
    orgSlug:  key.orgSlug,
  };
}
