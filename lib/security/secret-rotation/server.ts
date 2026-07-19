/**
 * lib/security/secret-rotation/server.ts
 *
 * AGENTIK-SECURITY-SECRET-ROTATION-01
 * Server-only barrel — complete rotation domain for server-side use
 *
 * Import this barrel in:
 *   - API routes
 *   - Server Actions
 *   - Health endpoints
 *   - Integration harnesses
 *
 * NEVER import this barrel in:
 *   - Client components
 *   - Client-side hooks
 *   - Shared utility files without server-only guards
 */

import "server-only";

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

export {
  successResult,
  failedResult,
  cancelledResult,
} from "./rotation-types";

// ── Secret Version ─────────────────────────────────────────────────────────────

export type { SecretVersion, SecretVersionStatus } from "./secret-version";

export {
  SecretVersionStore,
  secretVersionStore,
  createSecretVersion,
  isVersionExpired,
  isVersionActive,
  isVersionRevoked,
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

// ── Policy Engine ─────────────────────────────────────────────────────────────

export type {
  PolicyEvaluationResult,
  RotationRiskAssessment,
  RiskFactor,
} from "./rotation-policy-engine";

export {
  canRotate,
  requiresRotation,
  evaluateRotationRisk,
  determineStrategy,
} from "./rotation-policy-engine";

// ── Planner ────────────────────────────────────────────────────────────────────

export type { ScheduledRotation } from "./rotation-planner";

export {
  generateRotationPlan,
  buildRotationSchedule,
  detectExpiringSecrets,
  estimateRotationDurationSeconds,
} from "./rotation-planner";

// ── Repository ─────────────────────────────────────────────────────────────────

export type {
  RotationRecord,
  CreateRotationInput,
  RotationRepository,
} from "./rotation-repository";

// ── Prisma Repository ──────────────────────────────────────────────────────────

export {
  PrismaRotationRepository,
  prismaRotationRepository,
} from "./persistence/prisma-rotation-repository";

// ── Audit ──────────────────────────────────────────────────────────────────────

export type { RotationAuditEvent, RotationAuditEventType } from "./rotation-audit";

export {
  rotationAuditLog,
  emitRotationRequested,
  emitRotationStarted,
  emitRotationValidated,
  emitRotationActivated,
  emitRotationRevoked,
  emitRotationFailed,
  emitRotationCancelled,
} from "./rotation-audit";

// ── Service ────────────────────────────────────────────────────────────────────

export {
  SecretRotationService,
  getRotationService,
} from "./rotation-service";

// ── Approval Policy ────────────────────────────────────────────────────────────

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

// ── RBAC Integration ──────────────────────────────────────────────────────────

export type { RotationPermissionId } from "./integrations/rbac-rotation";

export {
  RbacRotationAdapter,
  getRbacRotationAdapter,
  rbacRotationAdapter,
} from "./integrations/rbac-rotation";

// ── Vault Integration ─────────────────────────────────────────────────────────

export {
  VaultRotationAdapter,
  vaultRotationAdapter,
} from "./integrations/vault-rotation";

// ── Query Helpers ─────────────────────────────────────────────────────────────

export type {
  ExpiringSecret,
  RotationHistoryEntry,
  RotationSummary,
  FailedRotationEntry,
} from "./rotation-query";

export {
  getActiveRotations,
  getPendingRotations,
  getExpiringSecrets,
  getRotationHistory,
  getRotationSummary,
  getVersionsByStatus,
  getOrphanedVersions,
  getStaleVersions,
  getFailedRotations,
  getLatestRotation,
  hasInProgressRotation,
} from "./rotation-query";

// ── Reports ────────────────────────────────────────────────────────────────────

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

export {
  buildRotationReport,
  buildExpirationReport,
  buildComplianceReport,
  formatRotationReport,
  formatExpirationReport,
  formatComplianceReport,
} from "./rotation-report-builder";

// ── Health ─────────────────────────────────────────────────────────────────────

export type {
  RotationHealthStatus,
  RotationHealthCheck,
  RotationHealthReport,
} from "./rotation-health";

export {
  RotationHealthMonitor,
  getRotationHealthMonitor,
  rotationHealthMonitor,
} from "./rotation-health";
