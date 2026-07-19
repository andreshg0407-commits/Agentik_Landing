/**
 * lib/security/compliance/compliance-types.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Compliance & Governance — Core Domain Types
 *
 * Pure TypeScript domain types for the Compliance layer.
 * No Prisma. No React. No Next. No server-only.
 *
 * All fields use string (ISO 8601 timestamps) — fully JSON serializable.
 * No Date objects. No BigInt. No Symbol.
 *
 * This file is the single source of truth for compliance domain vocabulary
 * across the entire Agentik platform.
 */

// ── ComplianceFramework ───────────────────────────────────────────────────────

/**
 * ComplianceFramework — the certification or regulatory standard being evaluated.
 *
 * SOC2      — Service Organization Control 2 (Type I / Type II)
 * ISO27001  — ISO/IEC 27001:2022 Information Security Management
 * GDPR      — General Data Protection Regulation (EU 2016/679)
 * HIPAA     — Health Insurance Portability and Accountability Act
 * CUSTOM    — Tenant-specific compliance requirements
 */
export type ComplianceFramework =
  | "SOC2"
  | "ISO27001"
  | "GDPR"
  | "HIPAA"
  | "CUSTOM";

export const COMPLIANCE_FRAMEWORKS: ComplianceFramework[] = [
  "SOC2", "ISO27001", "GDPR", "HIPAA", "CUSTOM",
];

// ── ComplianceStatus ──────────────────────────────────────────────────────────

/**
 * ComplianceStatus — the state of a compliance control.
 *
 * COMPLIANT     — control fully implemented and verified.
 * PARTIAL       — control partially implemented; gaps exist.
 * NON_COMPLIANT — control not implemented or evidence is absent.
 * UNKNOWN       — evaluation could not determine status.
 */
export type ComplianceStatus =
  | "COMPLIANT"
  | "PARTIAL"
  | "NON_COMPLIANT"
  | "UNKNOWN";

export const COMPLIANCE_STATUSES: ComplianceStatus[] = [
  "COMPLIANT", "PARTIAL", "NON_COMPLIANT", "UNKNOWN",
];

// ── ComplianceSeverity ────────────────────────────────────────────────────────

/**
 * ComplianceSeverity — impact level of a compliance violation.
 *
 * LOW      — informational gap; no immediate compliance risk.
 * MEDIUM   — notable gap; may affect certification.
 * HIGH     — significant gap; will affect certification scope.
 * CRITICAL — blocking violation; immediate remediation required.
 */
export type ComplianceSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const COMPLIANCE_SEVERITIES: ComplianceSeverity[] = [
  "LOW", "MEDIUM", "HIGH", "CRITICAL",
];

export const COMPLIANCE_SEVERITY_RANK: Record<ComplianceSeverity, number> = {
  LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4,
};

// ── ComplianceCategory ────────────────────────────────────────────────────────

/**
 * ComplianceCategory — domain classification for controls.
 */
export type ComplianceCategory =
  | "ACCESS_CONTROL"
  | "AUDIT_LOGGING"
  | "TENANT_ISOLATION"
  | "ENCRYPTION"
  | "KEY_MANAGEMENT"
  | "MFA"
  | "ZERO_TRUST"
  | "SECRET_ROTATION"
  | "ANOMALY_DETECTION"
  | "DATA_RETENTION"
  | "INCIDENT_TRACKING"
  | "DATA_CLASSIFICATION"
  | "CHANGE_MANAGEMENT"
  | "VULNERABILITY_MANAGEMENT";

// ── ComplianceControl ─────────────────────────────────────────────────────────

/**
 * ComplianceControl — a specific control requirement in a compliance framework.
 * Immutable after creation.
 */
export interface ComplianceControl {
  /** Stable unique identifier, e.g. "CTRL_MFA". */
  id:             string;
  /** Human-readable name. */
  name:           string;
  /** Description of what this control requires. */
  description:    string;
  /** Applicable compliance frameworks. */
  frameworks:     ComplianceFramework[];
  /** Domain category. */
  category:       ComplianceCategory;
  /** Severity of a violation of this control. */
  violationSeverity: ComplianceSeverity;
  /** Whether this control is mandatory for SOC2 Type II. */
  isSoc2Required: boolean;
  /** Whether this control is mandatory for ISO27001. */
  isIso27001Required: boolean;
  /** Whether this control is mandatory for GDPR. */
  isGdprRequired:  boolean;
  /** Objective or goal of the control. */
  objective:       string;
  /** How evidence is collected for this control. */
  evidenceSources: string[];
  /** Whether this control is currently enabled for evaluation. */
  enabled:         boolean;
}

// ── ComplianceEvidence ────────────────────────────────────────────────────────

/**
 * EvidenceSource — which security subsystem produced the evidence.
 */
export type EvidenceSource =
  | "AUDIT_LOG"
  | "RBAC"
  | "MFA"
  | "VAULT"
  | "KMS"
  | "ZERO_TRUST"
  | "ANOMALY_DETECTION"
  | "SECRET_ROTATION"
  | "MANUAL"
  | "SYSTEM";

/**
 * ComplianceEvidence — a piece of evidence supporting or refuting a control.
 * Serializable. Append-only. Never contains raw secrets.
 */
export interface ComplianceEvidence {
  id:           string;
  orgSlug:      string;
  controlId:    string;
  source:       EvidenceSource;
  /** True = evidence supports compliance; false = evidence of a gap/violation. */
  isSupporting: boolean;
  summary:      string;
  /** Serializable supporting data — never raw secrets. */
  data:         Record<string, unknown>;
  collectedAt:  string;   // ISO 8601
  expiresAt?:   string;   // ISO 8601 — evidence TTL for recertification
  actorId?:     string;   // who or what produced this evidence
  framework?:   ComplianceFramework;
}

// ── ComplianceViolation ───────────────────────────────────────────────────────

/**
 * ViolationType — how a violation was identified.
 */
export type ViolationType =
  | "MISSING_CONTROL"
  | "CONTROL_BYPASSED"
  | "EVIDENCE_EXPIRED"
  | "CONFIGURATION_GAP"
  | "POLICY_VIOLATION"
  | "INCOMPLETE_COVERAGE"
  | "DATA_HANDLING_VIOLATION"
  | "ACCESS_CONTROL_VIOLATION"
  | "RETENTION_VIOLATION";

/**
 * ComplianceViolation — a specific compliance violation detected.
 * Serializable. Never contains raw secrets.
 */
export interface ComplianceViolation {
  id:           string;
  orgSlug:      string;
  controlId:    string;
  framework?:   ComplianceFramework;
  type:         ViolationType;
  severity:     ComplianceSeverity;
  title:        string;
  description:  string;
  remediation:  string;
  detectedAt:   string;   // ISO 8601
  evidenceIds:  string[];
  /** True if this violation blocks certification. */
  isBlocking:   boolean;
}

// ── ComplianceFinding ─────────────────────────────────────────────────────────

/**
 * FindingType — the nature of the compliance finding.
 */
export type FindingType =
  | "COMPLIANT"
  | "VIOLATION"
  | "WARNING"
  | "RECOMMENDATION"
  | "NOT_EVALUATED";

/**
 * ComplianceFinding — the result of evaluating one control for one org.
 * Aggregates evidence, violations, and a final status.
 */
export interface ComplianceFinding {
  id:           string;
  orgSlug:      string;
  controlId:    string;
  framework?:   ComplianceFramework;
  type:         FindingType;
  status:       ComplianceStatus;
  severity:     ComplianceSeverity;
  title:        string;
  summary:      string;
  evidenceIds:  string[];
  violations:   ComplianceViolation[];
  score:        number;    // 0–100: control compliance score
  evaluatedAt:  string;    // ISO 8601
  validUntil?:  string;    // ISO 8601 — when re-evaluation is required
  remediations: string[];  // ordered remediation steps
}

// ── ComplianceResult ──────────────────────────────────────────────────────────

/**
 * ComplianceResult<T> — fail-closed operation result for compliance operations.
 */
export type ComplianceResult<T> =
  | { ok: true;  value: T }
  | { ok: false; error: string; severity: ComplianceSeverity };

// ── ComplianceAuditEventType ──────────────────────────────────────────────────

export type ComplianceAuditEventType =
  | "CONTROL_EVALUATED"
  | "FINDING_CREATED"
  | "VIOLATION_DETECTED"
  | "EVIDENCE_COLLECTED"
  | "EVIDENCE_EXPIRED"
  | "REPORT_GENERATED"
  | "FRAMEWORK_EVALUATED"
  | "COMPLIANCE_STATUS_CHANGED";

// ── Scoring constants ─────────────────────────────────────────────────────────

export const COMPLIANCE_SCORE_COMPLIANT    = 100;
export const COMPLIANCE_SCORE_PARTIAL      =  50;
export const COMPLIANCE_SCORE_NON_COMPLIANT =  0;
export const COMPLIANCE_SCORE_UNKNOWN      = 25;

/** Evidence TTL in days (evidence expires after this period). */
export const EVIDENCE_TTL_DAYS: Record<EvidenceSource, number> = {
  AUDIT_LOG:        90,
  RBAC:             30,
  MFA:              30,
  VAULT:            30,
  KMS:              90,
  ZERO_TRUST:       30,
  ANOMALY_DETECTION: 30,
  SECRET_ROTATION:  90,
  MANUAL:           365,
  SYSTEM:           30,
};
