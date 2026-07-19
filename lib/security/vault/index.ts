/**
 * lib/security/vault/index.ts
 *
 * AGENTIK-SECURITY-VAULT-01
 * Standalone Org-Scoped Secret Vault — Client-Safe Barrel
 *
 * Safe to import from client components, edge runtime, and shared code.
 *
 * Exports ONLY:
 *   - Domain types (no runtime classes)
 *   - Pure helpers (masking, validation, registry, migration planner)
 *   - Access policy helpers (pure, synchronous, no Prisma)
 *
 * DOES NOT export:
 *   - VaultService class (requires Prisma)
 *   - PrismaVaultRepository (requires Prisma)
 *   - VaultServiceAuditLog class (server singleton)
 *   - globalVaultServiceAuditLog singleton
 *   - encryptRawSecret / decryptRawSecret (require Node.js crypto)
 *
 * For server-side vault operations, use: lib/security/vault/server.ts
 */

// ── Types only — no server-only, no Prisma, no Node.js crypto ────────────────

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

export type { VaultRepository } from "./vault-repository";

// ── Pure helpers — safe for client ───────────────────────────────────────────

export { maskSecret, isMasked, sanitizeForLog } from "./vault-masking";

export {
  validateCreateInput,
  validateSecretValue,
} from "./vault-validation";

export {
  canAccessVaultSecret,
  canReadVaultSecret,
  canModifyVaultSecret,
} from "./vault-access-policy";

export {
  VAULT_SECRET_REGISTRY,
  getRegistryEntry,
  getEntriesByProvider,
  getEntriesByKind,
  getAllRegistryIds,
} from "./vault-registry";

export {
  VAULT_MIGRATION_PLAN,
  getMigrationPhase,
  getPendingMigrationPhases,
} from "./vault-migration-planner";
