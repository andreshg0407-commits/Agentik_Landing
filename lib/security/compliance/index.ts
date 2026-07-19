/**
 * lib/security/compliance/index.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Client-Safe Barrel — Compliance & Governance Layer
 *
 * Safe to import from client components. Contains ONLY:
 *   - Type definitions
 *   - Interfaces
 *   - Pure domain constants (no DB, no crypto, no server-only)
 *
 * For server-side evaluation, use lib/security/compliance/server.ts instead.
 *
 * Architecture: compliance evaluation is server-only. Client components receive
 * serialized ComplianceFinding / ComplianceDashboardPayload as props from
 * server components or API routes.
 */

// ── Core Types ─────────────────────────────────────────────────────────────────
export type {
  ComplianceFramework,
  ComplianceStatus,
  ComplianceSeverity,
  ComplianceCategory,
  ComplianceControl,
  ComplianceEvidence,
  ComplianceViolation,
  ComplianceFinding,
  ComplianceResult,
  ComplianceAuditEventType,
  EvidenceSource,
  ViolationType,
  FindingType,
} from "./compliance-types";

export {
  COMPLIANCE_FRAMEWORKS,
  COMPLIANCE_STATUSES,
  COMPLIANCE_SEVERITIES,
  COMPLIANCE_SEVERITY_RANK,
  COMPLIANCE_SCORE_COMPLIANT,
  COMPLIANCE_SCORE_PARTIAL,
  COMPLIANCE_SCORE_NON_COMPLIANT,
  COMPLIANCE_SCORE_UNKNOWN,
  EVIDENCE_TTL_DAYS,
} from "./compliance-types";

// ── Control Registry (pure — no server-only) ───────────────────────────────────
export {
  complianceRegistry,
  getControl,
  listControls,
} from "./compliance-registry";

// ── Control Catalog (pure — no server-only) ────────────────────────────────────
export {
  COMPLIANCE_CONTROLS,
  CTRL_ACCESS_CONTROL,
  CTRL_AUDIT_LOGGING,
  CTRL_TENANT_ISOLATION,
  CTRL_ENCRYPTION,
  CTRL_KEY_MANAGEMENT,
  CTRL_MFA,
  CTRL_ZERO_TRUST,
  CTRL_SECRET_ROTATION,
  CTRL_ANOMALY_DETECTION,
  CTRL_DATA_RETENTION,
  CTRL_INCIDENT_TRACKING,
} from "./control-catalog";

// ── Data Classification (pure — no server-only) ────────────────────────────────
export type { DataClassificationLevel, DataClassificationPolicy } from "./data-classification";
export {
  DATA_CLASSIFICATION_LEVELS,
  DATA_CLASSIFICATION_RANK,
  DATA_CLASSIFICATION_POLICIES,
  getClassificationPolicy,
  isHigherClassification,
  requiresEncryption,
  requiresMfaForAccess,
  isGdprPersonalData,
} from "./data-classification";

// ── Retention Policies (pure — no server-only) ─────────────────────────────────
export type { RetentionCategory, RetentionPolicy } from "./retention-policy";
export {
  RETENTION_POLICIES,
  getRetentionPolicy,
  isRetentionCompliant,
  isGdprErasurePermitted,
} from "./retention-policy";

// ── Repository Interface (type only — no implementation) ───────────────────────
export type { ComplianceRepository, ComplianceControlStatusRecord } from "./compliance-repository";

// ── Finding Engine types only ──────────────────────────────────────────────────
// Functions are server-only. Types safe for client prop contracts.
export type { ComplianceRecommendation } from "./finding-engine";

// ── Evaluator types only ───────────────────────────────────────────────────────
export type {
  TenantComplianceEvaluation,
  PlatformComplianceEvaluation,
} from "./compliance-evaluator";

// ── Report types only ──────────────────────────────────────────────────────────
export type {
  ComplianceFrameworkReport,
  TenantComplianceReport,
  SecurityComplianceReport,
  ExecutiveComplianceSummary,
} from "./compliance-report-builder";

// ── Health / Readiness types only ─────────────────────────────────────────────
export type {
  ComplianceHealthReport,
  ComplianceHealthStatus,
  ComplianceSubsystemHealth,
} from "./compliance-health";

export type {
  ComplianceReadinessReport,
  ComplianceReadinessStatus,
  ComplianceSubsystemCheck,
} from "./compliance-readiness";

// ── Dashboard Contract types ───────────────────────────────────────────────────
export {
  buildEmptyComplianceDashboard,
} from "./compliance-dashboard-contract";
export type {
  ComplianceDashboardPayload,
  ComplianceControlSummary,
} from "./compliance-dashboard-contract";

// ── Integration types only ─────────────────────────────────────────────────────
export type { AuditComplianceInput }      from "./integrations/compliance-audit";
export type { RbacComplianceInput }       from "./integrations/compliance-rbac";
export type { MfaComplianceInput }        from "./integrations/compliance-mfa";
export type { VaultComplianceInput }      from "./integrations/compliance-vault";
export type { KmsComplianceInput }        from "./integrations/compliance-kms";
export type { ZeroTrustComplianceInput }  from "./integrations/compliance-zero-trust";
export type { AnomalyComplianceInput }    from "./integrations/compliance-anomaly";
export type { ComplianceExecutiveSignal } from "./integrations/compliance-executive-brain";
