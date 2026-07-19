/**
 * lib/security/encryption/index.ts
 *
 * AGENTIK-SECURITY-ENCRYPTION-01
 * Encryption Foundation — Client-Safe Barrel
 *
 * Exports ONLY:
 *   - Types
 *   - Pure helpers (serialization, type guards)
 *   - Classification policy (deterministic, no crypto)
 *   - Registry (pure domain data)
 *   - Key references (opaque, no key material)
 *   - Provider contract (interface only)
 *
 * NEVER exports:
 *   - encryptData / decryptData
 *   - EncryptionService
 *   - LocalAesGcmProvider
 *   - EncryptionHealthMonitor
 *   - Any domain adapters
 *
 * Safe to import in client components, server components, and shared modules.
 */

// ── Domain Types ──────────────────────────────────────────────────────────────

export type {
  EncryptionAlgorithm,
  EncryptionStatus,
  EncryptionClassification,
  EncryptedPayload,
  EncryptionInput,
  EncryptionResult,
  DecryptionInput,
  DecryptionResult,
  PayloadValidationResult,
} from "./encryption-types";

export {
  CURRENT_ENCRYPTION_ALGORITHM,
  isEncryptedPayload,
  serializePayload,
  deserializePayload,
} from "./encryption-types";

// ── Metadata ──────────────────────────────────────────────────────────────────

export type {
  EncryptionMetadata,
  EncryptedEnvelope,
} from "./encryption-metadata";

export {
  createEncryptionMetadata,
  createEnvelope,
  validateEnvelopeMetadata,
  safeMetadataSummary,
  serializeEnvelope,
  deserializeEnvelope,
} from "./encryption-metadata";

// ── Classification Policy ─────────────────────────────────────────────────────

export type { DataClassification } from "./encryption-classification-policy";

export {
  requiresEncryption,
  toEncryptionClassification,
  classificationRank,
  isMoreSensitiveThan,
  elevateClassification,
  getAssetClassification,
  assetRequiresEncryption,
  getAllEncryptionRequiredAssets,
  ASSET_CLASSIFICATION_MAP,
} from "./encryption-classification-policy";

// ── Registry ──────────────────────────────────────────────────────────────────

export type { EncryptionRegistryEntry } from "./encryption-registry";

export {
  ENCRYPTION_REGISTRY,
  getEncryptionRegistryEntry,
  getRequiredEncryptionEntries,
  getAdapterReadyEntries,
  getPendingAdapterEntries,
  getEncryptionRegistrySummary,
} from "./encryption-registry";

// ── Key References (opaque — no key material) ─────────────────────────────────

export type {
  KeyStatus,
  EncryptionKeyReference,
} from "./key-management";

export {
  KEY_VERSION_REGISTRY,
  getActiveKeyReference,
  getActiveKeyVersion,
  getKeyReference,
  canDecryptWithVersion,
  getDecryptableKeyVersions,
  getKeyRegistrySummary,
} from "./key-management";

// ── Provider Contract ─────────────────────────────────────────────────────────

export type {
  EncryptionProvider,
  EncryptionProviderInfo,
  EncryptionProviderError,
  EncryptionProviderErrorCode,
} from "./encryption-provider";
