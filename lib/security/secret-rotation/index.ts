/**
 * lib/security/secret-rotation/index.ts
 *
 * AGENTIK-SECURITY-SECRET-ROTATION-01
 * Client-safe barrel — pure types, enums, and stateless helpers only
 *
 * This barrel is safe to import in client components.
 *
 * NEVER re-exports:
 *   - server-only modules (rotation-service, prisma-rotation-repository, rotation-audit, vault-rotation, rbac-rotation, rotation-health)
 *   - secretVersionStore (server-side in-memory store)
 *   - prismaRotationRepository
 *   - getPersistentAuditService
 *   - any function that imports "server-only"
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type {
  SecretRotationStatus,
  RotationStrategy,
  RotationRiskLevel,
  RotationPlan,
  RotationStep,
  RotationPolicy,
  RotationResult,
  RotationRequest,
  RotationValidationInput,
} from "./rotation-types";

// Result factories are pure (no IO) — safe to export
export {
  successResult,
  failedResult,
  cancelledResult,
} from "./rotation-types";

// ── Secret Version Types ──────────────────────────────────────────────────────

export type { SecretVersion, SecretVersionStatus } from "./secret-version";

// Pure helpers (no store access, no IO)
export {
  isVersionExpired,
  isVersionActive,
  versionAgeInDays,
  rotationStatusToVersionStatus,
} from "./secret-version";

// ── Registry ──────────────────────────────────────────────────────────────────

export type { RotationRegistryEntry } from "./rotation-registry";

export {
  ROTATION_REGISTRY,
  getRotationEntry,
  isRotatable,
  getEntriesByRisk,
  getRegistrySummary,
} from "./rotation-registry";

// ── Approval Policy ───────────────────────────────────────────────────────────

export type {
  ApprovalRequirement,
  ApprovalDecision,
} from "./rotation-approval-policy";

export {
  getApprovalRequirement,
  evaluateApproval,
  canSelfApprove,
  getApprovalSummary,
  getRiskApprovalMatrix,
} from "./rotation-approval-policy";

// ── Repository Types ──────────────────────────────────────────────────────────

export type {
  RotationRecord,
  CreateRotationInput,
  RotationRepository,
} from "./rotation-repository";

// ── Report Types ──────────────────────────────────────────────────────────────

export type {
  ReportMeta,
  RotationReport,
  RotationSummaryItem,
  RotationStatusBreakdown,
  ExpirationReport,
  ExpirationItem,
  ExpirationUrgency,
  ComplianceReport,
  ComplianceItem,
  ComplianceSummary,
  ComplianceStatus,
} from "./rotation-report-builder";

// ── Query Types ───────────────────────────────────────────────────────────────

export type {
  ExpiringSecret,
  RotationHistoryEntry,
  RotationSummary,
  FailedRotationEntry,
} from "./rotation-query";

// Pure query helpers operating on plain RotationRecord arrays (no store/DB access)
export {
  getActiveRotations,
  getPendingRotations,
  getRotationHistory,
  getFailedRotations,
  getLatestRotation,
  hasInProgressRotation,
} from "./rotation-query";

// ── Approval Permission Id ────────────────────────────────────────────────────

export type { RotationPermissionId } from "./integrations/rbac-rotation";
