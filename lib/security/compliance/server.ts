/**
 * lib/security/compliance/server.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Server-Only Barrel — Compliance & Governance Layer
 *
 * Import from here in server components, API routes, and server actions.
 * NEVER import from here in client components.
 *
 * Exports all server-side compliance functionality:
 *   - Core types
 *   - Control catalog (11 controls)
 *   - Evidence engine (7 builders)
 *   - Compliance evaluator (4 functions)
 *   - Finding engine
 *   - Repositories (in-memory + Prisma)
 *   - Integration adapters (7 adapters + executive brain)
 *   - Data classification (5 levels)
 *   - Retention policies (14 policies)
 *   - Report builder (5 report types)
 *   - Health + readiness monitors
 *   - Dashboard contract
 *
 * Types and pure-domain helpers are also re-exported for server consumers.
 * For client-safe imports, use index.ts instead.
 */

import "server-only";

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

// ── Control Registry ───────────────────────────────────────────────────────────
export {
  ComplianceRegistry,
  complianceRegistry,
  registerControl,
  getControl,
  listControls,
  resolveControl,
} from "./compliance-registry";

// ── Control Catalog ────────────────────────────────────────────────────────────
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

// ── Evidence Engine ────────────────────────────────────────────────────────────
export {
  buildEvidence,
  buildAuditEvidence,
  buildRbacEvidence,
  buildMfaEvidence,
  buildVaultEvidence,
  buildKmsEvidence,
  buildZeroTrustEvidence,
  buildAnomalyEvidence,
  isEvidenceExpired,
  filterActiveEvidence,
  getSupportingEvidence,
  getGapEvidence,
} from "./evidence-engine";

// ── Compliance Evaluator ───────────────────────────────────────────────────────
export {
  evaluateControl,
  evaluateFramework,
  evaluateTenant,
  evaluatePlatform,
  complianceScoreToStatus,
  aggregateComplianceScores,
  rankFindings,
} from "./compliance-evaluator";
export type {
  TenantComplianceEvaluation,
  PlatformComplianceEvaluation,
} from "./compliance-evaluator";

// ── Finding Engine ─────────────────────────────────────────────────────────────
export {
  buildViolation,
  buildFinding,
  buildFindingsFromEvidence,
  buildWarning,
  buildRecommendation,
  getCriticalFindings,
  getBlockingFindings,
  getViolations,
  rankViolations,
  getComplianceScore,
} from "./finding-engine";
export type { ComplianceRecommendation } from "./finding-engine";

// ── Repository ─────────────────────────────────────────────────────────────────
export type { ComplianceRepository, ComplianceControlStatusRecord } from "./compliance-repository";
export {
  InMemoryComplianceRepository,
  inMemoryComplianceRepository,
} from "./compliance-repository";
export {
  PrismaComplianceRepository,
  prismaComplianceRepository,
} from "./persistence/prisma-compliance-repository";

// ── Integration Adapters ───────────────────────────────────────────────────────
export {
  auditToComplianceEvidence,
  hasAuditCoverage,
} from "./integrations/compliance-audit";
export type { AuditComplianceInput } from "./integrations/compliance-audit";

export {
  rbacToComplianceEvidence,
  hasRbacCoverage,
} from "./integrations/compliance-rbac";
export type { RbacComplianceInput } from "./integrations/compliance-rbac";

export {
  mfaToComplianceEvidence,
  getMfaCoveragePercent,
  isMfaCompliant,
} from "./integrations/compliance-mfa";
export type { MfaComplianceInput } from "./integrations/compliance-mfa";

export {
  vaultToComplianceEvidence,
  isVaultCompliant,
} from "./integrations/compliance-vault";
export type { VaultComplianceInput } from "./integrations/compliance-vault";

export {
  kmsToComplianceEvidence,
  isKmsCompliant,
} from "./integrations/compliance-kms";
export type { KmsComplianceInput } from "./integrations/compliance-kms";

export {
  zeroTrustToComplianceEvidence,
  isZeroTrustCompliant,
} from "./integrations/compliance-zero-trust";
export type { ZeroTrustComplianceInput } from "./integrations/compliance-zero-trust";

export {
  anomalyToComplianceEvidence,
  isAnomalyCompliant,
} from "./integrations/compliance-anomaly";
export type { AnomalyComplianceInput } from "./integrations/compliance-anomaly";

export {
  buildComplianceBrainSignals,
  formatComplianceMessage,
  getBlockingSignals,
} from "./integrations/compliance-executive-brain";
export type { ComplianceExecutiveSignal } from "./integrations/compliance-executive-brain";

// ── Data Classification ────────────────────────────────────────────────────────
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

// ── Retention Policies ─────────────────────────────────────────────────────────
export type { RetentionCategory, RetentionPolicy } from "./retention-policy";
export {
  RETENTION_POLICIES,
  getRetentionPolicy,
  isRetentionCompliant,
  isGdprErasurePermitted,
} from "./retention-policy";

// ── Report Builder ─────────────────────────────────────────────────────────────
export {
  buildSoc2ReadinessReport,
  buildIso27001ReadinessReport,
  buildTenantComplianceReport,
  buildSecurityComplianceReport,
  buildExecutiveComplianceSummary,
} from "./compliance-report-builder";
export type {
  ComplianceFrameworkReport,
  TenantComplianceReport,
  SecurityComplianceReport,
  ExecutiveComplianceSummary,
} from "./compliance-report-builder";

// ── Health ─────────────────────────────────────────────────────────────────────
export { evaluateComplianceHealth } from "./compliance-health";
export type {
  ComplianceHealthReport,
  ComplianceHealthStatus,
  ComplianceSubsystemHealth,
} from "./compliance-health";

// ── Readiness ──────────────────────────────────────────────────────────────────
export { scanComplianceReadiness } from "./compliance-readiness";
export type {
  ComplianceReadinessReport,
  ComplianceReadinessStatus,
  ComplianceSubsystemCheck,
} from "./compliance-readiness";

// ── Dashboard Contract ─────────────────────────────────────────────────────────
export {
  buildComplianceDashboard,
  buildEmptyComplianceDashboard,
} from "./compliance-dashboard-contract";
export type {
  ComplianceDashboardPayload,
  ComplianceControlSummary,
} from "./compliance-dashboard-contract";
