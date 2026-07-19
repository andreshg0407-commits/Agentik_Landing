/**
 * lib/security/kms/index.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS Client-Safe Barrel
 *
 * Only exports types, enums, constants, and pure helpers
 * that are safe to import in any context (client or server).
 *
 * DO NOT add server-only imports here.
 * For full KMS access (engine, providers, audit), use server.ts.
 */

// ── Core types ────────────────────────────────────────────────────────────
export type {
  KmsProviderType,
  KmsKeyStatus,
  KmsOperation,
  KmsRiskLevel,
  KmsHealthStatus,
  KmsResult,
  KmsErrorCode,
  KmsAuditEventType,
  KmsAccessContext,
} from "./kms-types";
export {
  KMS_OPERATION_RISK,
  KMS_PROVIDER_PRIORITY,
} from "./kms-types";

// ── Key types ─────────────────────────────────────────────────────────────
export type {
  KmsKeyMetadata,
  KmsKeyCreateInput,
  KmsKeyVersionRef,
  KmsEncryptedEnvelope,
} from "./kms-key";
export {
  getKeyRiskLevel,
  isKeyActive,
  isKeyExpired,
  isKeyOperational,
  buildKeyVersionRef,
} from "./kms-key";

// ── Provider interface ────────────────────────────────────────────────────
export type {
  KmsProvider,
  KmsEncryptParams,
  KmsDecryptParams,
  KmsDecryptResult,
  KmsRotateParams,
  KmsRotateResult,
  KmsKeyLifecycleParams,
  KmsProviderHealthResult,
} from "./kms-provider";

// ── Dashboard types ───────────────────────────────────────────────────────
export type {
  KmsDashboardPayload,
  KmsTenantSummary,
} from "./kms-dashboard-contract";
export {
  buildKmsDashboard,
  buildEmptyKmsDashboard,
  buildTenantSummaries,
} from "./kms-dashboard-contract";

// ── Report types ──────────────────────────────────────────────────────────
export type {
  KmsKeyInventoryReport,
  KmsProviderReport,
  KmsRotationReport,
  KmsComplianceReport,
} from "./kms-report-builder";

// ── Audit event type ──────────────────────────────────────────────────────
export type { KmsAuditEvent, KmsAuditInput } from "./kms-audit";

// ── RBAC types ────────────────────────────────────────────────────────────
export type { KmsRbacInput, KmsRbacResult } from "./integrations/kms-rbac";

// ── Repository interface ──────────────────────────────────────────────────
export type { KmsRepository } from "./kms-repository";

// ── Health and readiness types ────────────────────────────────────────────
export type { KmsHealthReport } from "./kms-health";
export type { KmsReadinessReport, KmsSubsystemCheck, KmsReadinessStatus } from "./kms-readiness";

// ── Query types ───────────────────────────────────────────────────────────
export type { KmsProviderSummary, KmsTenantKeySummary } from "./kms-query";
