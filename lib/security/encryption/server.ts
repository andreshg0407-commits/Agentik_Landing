/**
 * lib/security/encryption/server.ts
 *
 * AGENTIK-SECURITY-ENCRYPTION-01
 * Encryption Foundation — Server-Only Barrel
 *
 * Exports all runtime constructs:
 *   - Encryption Engine (encryptData, decryptData)
 *   - Encryption Service
 *   - Encryption Audit (log + persistent adapter)
 *   - Encryption Health
 *   - Domain adapters (memory, playbooks, executive)
 *
 * IMPORTANT: Server-only. Never import in client components.
 */

import "server-only";

// ── Engine ─────────────────────────────────────────────────────────────────────

export {
  encryptData,
  decryptData,
  validatePayloadStructure,
  LocalAesGcmProvider,
  getLocalAesGcmProvider,
} from "./encryption-engine";

// ── Service ────────────────────────────────────────────────────────────────────

export {
  EncryptionService,
  getEncryptionService,
} from "./encryption-service";

export type {
  ServiceEncryptInput,
  ServiceDecryptInput,
  ServiceEncryptResult,
} from "./encryption-service";

// ── Audit ──────────────────────────────────────────────────────────────────────

export {
  EncryptionAuditLog,
  PersistentEncryptionAuditAdapter,
  persistentEncryptionAuditAdapter,
  globalEncryptionAuditLog,
  createEncryptionAuditEvent,
} from "./encryption-audit";

export type {
  EncryptionAuditEvent,
  EncryptionAuditEventType,
} from "./encryption-audit";

// ── Health ─────────────────────────────────────────────────────────────────────

export {
  EncryptionHealthMonitor,
  checkEncryptionHealth,
} from "./encryption-health";

export type {
  EncryptionHealthReport,
  EncryptionHealthCheckResult,
  EncryptionHealthStatus,
} from "./encryption-health";

// ── Domain Adapters ────────────────────────────────────────────────────────────

export {
  MemoryEncryptionAdapter,
  getMemoryEncryptionAdapter,
  MEMORY_ENCRYPTED_FIELDS,
  MEMORY_TYPES_REQUIRING_ENCRYPTION,
} from "@/lib/copilot/memory/security/memory-encryption-adapter";

export {
  PlaybookEncryptionAdapter,
  getPlaybookEncryptionAdapter,
  PLAYBOOK_ENCRYPTED_FIELDS,
  PLAYBOOK_CATEGORIES_REQUIRING_ENCRYPTION,
} from "@/lib/copilot/playbooks/security/playbook-encryption-adapter";

export {
  ExecutiveEncryptionAdapter,
  getExecutiveEncryptionAdapter,
  EXECUTIVE_ENCRYPTED_FIELDS,
} from "@/lib/copilot/executive-brain/security/executive-encryption-adapter";

// ── Types (re-exported for convenience) ──────────────────────────────────────

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

export type {
  EncryptionRegistryEntry,
} from "./encryption-registry";

export {
  ENCRYPTION_REGISTRY,
  getEncryptionRegistryEntry,
  getRequiredEncryptionEntries,
  getAdapterReadyEntries,
  getPendingAdapterEntries,
  getEncryptionRegistrySummary,
} from "./encryption-registry";

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

export {
  requiresEncryption,
  toEncryptionClassification,
  classificationRank,
  elevateClassification,
  getAssetClassification,
  assetRequiresEncryption,
  getAllEncryptionRequiredAssets,
  ASSET_CLASSIFICATION_MAP,
} from "./encryption-classification-policy";

export type { DataClassification } from "./encryption-classification-policy";

export type {
  EncryptionProvider,
  EncryptionProviderInfo,
  EncryptionProviderError,
  EncryptionProviderErrorCode,
} from "./encryption-provider";
