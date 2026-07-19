/**
 * lib/security/encryption/encryption-service.ts
 *
 * AGENTIK-SECURITY-ENCRYPTION-01
 * Encryption Foundation — Encryption Service
 *
 * Central orchestrator for all encryption operations in Agentik.
 * No module should call the engine directly — all calls go through this service.
 *
 * Responsibilities:
 *   - Classification enforcement (refuses to encrypt PUBLIC/INTERNAL without override)
 *   - Tenant isolation (enforces orgSlug on all operations)
 *   - Audit (fires EncryptionAuditEvent for every operation)
 *   - Metadata (creates EncryptionMetadata alongside every payload)
 *   - Envelope wrapping (combines payload + metadata)
 *   - Payload validation before decryption
 *
 * Fail-safe:
 *   - encrypt() returns null on failure (never throws)
 *   - decrypt() returns null on failure (fail-closed — no partial plaintext)
 *   - validate() returns invalid result on any error
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import "server-only";

import { encryptData, decryptData, validatePayloadStructure } from "./encryption-engine";
import {
  createEncryptionAuditEvent,
  persistentEncryptionAuditAdapter,
} from "./encryption-audit";
import {
  createEnvelope,
  validateEnvelopeMetadata,
} from "./encryption-metadata";
import {
  requiresEncryption,
  toEncryptionClassification,
  getAssetClassification,
} from "./encryption-classification-policy";
import type {
  EncryptedPayload,
  EncryptionResult,
  DecryptionResult,
  PayloadValidationResult,
} from "./encryption-types";
import type { EncryptedEnvelope } from "./encryption-metadata";
import type { EncryptionClassification } from "./encryption-types";

// ── Service Input Types ───────────────────────────────────────────────────────

export interface ServiceEncryptInput {
  /** The plaintext data to encrypt. Never stored. */
  plaintext:       string;
  /** Tenant identifier. Required. */
  orgSlug:         string;
  /** The asset type being encrypted (from ENCRYPTION_REGISTRY ids). */
  assetType:       string;
  /** Override classification (optional — defaults to ASSET_CLASSIFICATION_MAP). */
  classification?: EncryptionClassification;
  /** Optional associated data for GCM authentication. */
  associatedData?: string;
  /** Optional schema version for the plaintext structure. */
  schemaVersion?:  string;
}

export interface ServiceDecryptInput {
  /** The envelope to decrypt. */
  envelope:        EncryptedEnvelope;
  /** Tenant identifier. Must match envelope.meta.tenantId. */
  orgSlug:         string;
  /** Optional associated data (must match what was used during encryption). */
  associatedData?: string;
}

export interface ServiceEncryptResult {
  /** The encrypted envelope (payload + metadata). */
  envelope:    EncryptedEnvelope;
  /** Key version used. */
  keyVersion:  string;
  /** Duration in milliseconds. */
  durationMs:  number;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class EncryptionService {
  /**
   * Encrypt plaintext data and wrap it in an EncryptedEnvelope.
   *
   * Returns null if:
   *   - orgSlug is empty
   *   - plaintext is empty
   *   - classification does not require encryption and no override is provided
   *   - engine fails (key not available, etc.)
   *
   * Never throws.
   */
  encrypt(input: ServiceEncryptInput): ServiceEncryptResult | null {
    const start = Date.now();
    try {
      if (!input.orgSlug || !input.plaintext) {
        return null;
      }

      // Resolve classification
      const rawClass  = getAssetClassification(input.assetType);
      const encClass  = input.classification ?? toEncryptionClassification(rawClass);

      if (!encClass || !requiresEncryption(rawClass)) {
        // Asset does not require encryption and no override was provided
        process.stderr.write(
          `[encryption-service] Asset type ${input.assetType} does not require encryption\n`,
        );
        return null;
      }

      const result = encryptData({
        plaintext:      input.plaintext,
        orgSlug:        input.orgSlug,
        associatedData: input.associatedData,
      });

      const durationMs = Date.now() - start;

      if (!result) {
        persistentEncryptionAuditAdapter.push(
          createEncryptionAuditEvent({
            type:       "DATA_ENCRYPTED",
            orgSlug:    input.orgSlug,
            assetType:  input.assetType,
            keyVersion: "unknown",
            success:    false,
            reason:     "engine_failed",
            durationMs,
          }),
        );
        return null;
      }

      const envelope = createEnvelope(
        result.payload,
        input.orgSlug,
        encClass,
        input.assetType,
      );

      persistentEncryptionAuditAdapter.push(
        createEncryptionAuditEvent({
          type:       "DATA_ENCRYPTED",
          orgSlug:    input.orgSlug,
          assetType:  input.assetType,
          keyVersion: result.keyVersion,
          success:    true,
          durationMs,
        }),
      );

      return { envelope, keyVersion: result.keyVersion, durationMs };
    } catch (e: any) {
      process.stderr.write(`[encryption-service] encrypt error: ${e?.message ?? "unknown"}\n`);
      return null;
    }
  }

  /**
   * Decrypt an EncryptedEnvelope.
   *
   * Returns null if:
   *   - tenant mismatch (fail-closed)
   *   - payload invalid
   *   - GCM auth tag fails (tampered data)
   *   - engine fails
   *
   * Never throws. Never logs the returned plaintext.
   */
  decrypt(input: ServiceDecryptInput): DecryptionResult | null {
    const start = Date.now();
    try {
      if (!input.orgSlug) {
        return null;
      }

      // Validate envelope metadata
      const metaCheck = validateEnvelopeMetadata(input.envelope, input.orgSlug);
      if (!metaCheck.valid) {
        const durationMs = Date.now() - start;
        persistentEncryptionAuditAdapter.push(
          createEncryptionAuditEvent({
            type:       metaCheck.reason === "tenant_id_mismatch" ? "DECRYPTION_DENIED" : "INVALID_PAYLOAD",
            orgSlug:    input.orgSlug,
            assetType:  input.envelope.meta.assetType ?? "unknown",
            keyVersion: input.envelope.meta.keyVersion,
            success:    false,
            reason:     metaCheck.reason,
            durationMs,
          }),
        );
        return null;
      }

      // Validate payload structure
      const payloadCheck = validatePayloadStructure(input.envelope.payload);
      if (!payloadCheck.valid) {
        const durationMs = Date.now() - start;
        persistentEncryptionAuditAdapter.push(
          createEncryptionAuditEvent({
            type:       "INVALID_PAYLOAD",
            orgSlug:    input.orgSlug,
            assetType:  input.envelope.meta.assetType ?? "unknown",
            keyVersion: input.envelope.meta.keyVersion,
            success:    false,
            reason:     payloadCheck.reason,
            durationMs,
          }),
        );
        return null;
      }

      const result = decryptData({
        payload:        input.envelope.payload,
        orgSlug:        input.orgSlug,
        associatedData: input.associatedData,
      });

      const durationMs = Date.now() - start;

      if (!result) {
        persistentEncryptionAuditAdapter.push(
          createEncryptionAuditEvent({
            type:       "DECRYPTION_DENIED",
            orgSlug:    input.orgSlug,
            assetType:  input.envelope.meta.assetType ?? "unknown",
            keyVersion: input.envelope.meta.keyVersion,
            success:    false,
            reason:     "decryption_failed",
            durationMs,
          }),
        );
        return null;
      }

      persistentEncryptionAuditAdapter.push(
        createEncryptionAuditEvent({
          type:       "DATA_DECRYPTED",
          orgSlug:    input.orgSlug,
          assetType:  input.envelope.meta.assetType ?? "unknown",
          keyVersion: result.keyVersion,
          success:    true,
          durationMs,
        }),
      );

      return result;
    } catch (e: any) {
      process.stderr.write(`[encryption-service] decrypt error: ${e?.message ?? "unknown"}\n`);
      return null;
    }
  }

  /**
   * Validate an EncryptedPayload's structure and key version.
   * Does NOT decrypt. Never throws.
   */
  validate(payload: EncryptedPayload): PayloadValidationResult {
    try {
      return validatePayloadStructure(payload);
    } catch {
      return { valid: false, reason: "validation_error" };
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _service: EncryptionService | null = null;

/** Get the singleton EncryptionService instance. */
export function getEncryptionService(): EncryptionService {
  if (!_service) _service = new EncryptionService();
  return _service;
}
