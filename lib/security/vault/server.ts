/**
 * lib/security/vault/server.ts
 *
 * AGENTIK-SECURITY-VAULT-01
 * Standalone Org-Scoped Secret Vault — Server-Only Barrel
 *
 * Import this barrel from server-side code only.
 * Exports all runtime vault capabilities including:
 *   - VaultService (CRUD + encryption + audit + policy)
 *   - VaultServiceAuditLog class + globalVaultServiceAuditLog singleton
 *   - PrismaVaultRepository (Prisma-backed implementation)
 *   - Encryption primitives (encryptRawSecret / decryptRawSecret)
 *   - All pure helpers and types
 *
 * DO NOT import this barrel from:
 *   - Client components (use lib/security/vault/index.ts)
 *   - Edge runtime
 *
 * IMPORTANT: This barrel intentionally uses server-only to enforce the boundary.
 */

import "server-only";

// ── Runtime classes ───────────────────────────────────────────────────────────

export { VaultService } from "./vault-service";
export { PrismaVaultRepository } from "./prisma-vault-repository";
export {
  VaultServiceAuditLog,
  globalVaultServiceAuditLog,
} from "./vault-service-audit";

// ── Encryption (server-only — uses Node.js crypto) ───────────────────────────

export { encryptRawSecret, decryptRawSecret, VaultEncryptionError } from "./vault-encryption";

// ── Access policy ─────────────────────────────────────────────────────────────

export {
  canAccessVaultSecret,
  canReadVaultSecret,
  canModifyVaultSecret,
} from "./vault-access-policy";

// ── Validation ────────────────────────────────────────────────────────────────

export { validateCreateInput, validateSecretValue } from "./vault-validation";

// ── Masking ───────────────────────────────────────────────────────────────────

export { maskSecret, isMasked, sanitizeForLog } from "./vault-masking";

// ── Registry ──────────────────────────────────────────────────────────────────

export {
  VAULT_SECRET_REGISTRY,
  getRegistryEntry,
  getEntriesByProvider,
  getEntriesByKind,
  getAllRegistryIds,
} from "./vault-registry";

// ── Migration planner ─────────────────────────────────────────────────────────

export {
  VAULT_MIGRATION_PLAN,
  getMigrationPhase,
  getPendingMigrationPhases,
} from "./vault-migration-planner";

// ── Repository interface ──────────────────────────────────────────────────────

export type { VaultRepository } from "./vault-repository";

// ── All types ─────────────────────────────────────────────────────────────────

export type {
  VaultSecretKind,
  VaultSecretStatus,
  VaultSecretClassification,
  VaultSecretMetadata,
  VaultSecretRecord,
  VaultCreateInput,
  VaultUpdateInput,
  VaultCaller,
  VaultWriteResult,
  VaultReadResult,
  VaultListResult,
  VaultDeleteResult,
  VaultServiceError,
  VaultServiceResult,
  VaultServiceErrorCode,
} from "./vault-secret-record";

export type {
  VaultAccessOperation,
  VaultAccessDecision,
} from "./vault-access-policy";

export type {
  VaultServiceEventType,
  VaultServiceAuditEvent,
} from "./vault-service-audit";

export type {
  VaultValidationResult,
} from "./vault-validation";

export type {
  VaultRegistryEntry,
} from "./vault-registry";

export type {
  MigrationPhase,
  MigrationStatus,
  MigrationPlanItem,
} from "./vault-migration-planner";
