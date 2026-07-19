/**
 * lib/security/compliance/future-compatibility.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Future Compatibility Contract — External Integrations and Export Plans
 *
 * No server-only. Pure domain documentation + interface stubs.
 *
 * This file defines integration contracts for future compliance tooling:
 *   - SOC2 audit export (for auditor review)
 *   - ISO27001 audit export
 *   - GDPR reports (data subject requests, processing records)
 *   - External auditor API
 *   - Compliance automation APIs
 */

import type {
  ComplianceFinding,
  ComplianceEvidence,
  ComplianceFramework,
  ComplianceStatus,
  ComplianceSeverity,
} from "./compliance-types";

// ── SOC2 Audit Export ─────────────────────────────────────────────────────────

/**
 * Soc2AuditPackage — normalized export for SOC2 Type II auditor review.
 */
export interface Soc2AuditPackage {
  orgSlug:          string;
  auditPeriodStart: string;   // ISO 8601
  auditPeriodEnd:   string;   // ISO 8601
  generatedAt:      string;
  overallScore:     number;
  findings:         ComplianceFinding[];
  evidence:         ComplianceEvidence[];
  controlCoverage:  Array<{
    controlId:    string;
    status:       ComplianceStatus;
    evidenceCount: number;
  }>;
  trustServiceCriteria: TrustServiceCriteriaStatus[];
}

/**
 * TrustServiceCriteria — SOC2 TSC domains.
 */
export type TrustServiceCriteria =
  | "CC1_CONTROL_ENVIRONMENT"
  | "CC2_COMMUNICATION"
  | "CC3_RISK_ASSESSMENT"
  | "CC4_MONITORING"
  | "CC5_CONTROL_ACTIVITIES"
  | "CC6_LOGICAL_ACCESS"
  | "CC7_SYSTEM_OPERATIONS"
  | "CC8_CHANGE_MANAGEMENT"
  | "CC9_RISK_MITIGATION";

export interface TrustServiceCriteriaStatus {
  criteria:   TrustServiceCriteria;
  status:     ComplianceStatus;
  score:      number;
  controlIds: string[];
}

export const SOC2_TSC_CONTROL_MAP: Record<TrustServiceCriteria, string[]> = {
  CC1_CONTROL_ENVIRONMENT:  ["CTRL_ACCESS_CONTROL", "CTRL_AUDIT_LOGGING"],
  CC2_COMMUNICATION:        ["CTRL_AUDIT_LOGGING"],
  CC3_RISK_ASSESSMENT:      ["CTRL_ANOMALY_DETECTION", "CTRL_INCIDENT_TRACKING"],
  CC4_MONITORING:           ["CTRL_ANOMALY_DETECTION", "CTRL_AUDIT_LOGGING"],
  CC5_CONTROL_ACTIVITIES:   ["CTRL_ACCESS_CONTROL", "CTRL_MFA", "CTRL_ZERO_TRUST"],
  CC6_LOGICAL_ACCESS:       ["CTRL_ACCESS_CONTROL", "CTRL_MFA", "CTRL_ZERO_TRUST", "CTRL_ENCRYPTION"],
  CC7_SYSTEM_OPERATIONS:    ["CTRL_ANOMALY_DETECTION", "CTRL_INCIDENT_TRACKING", "CTRL_AUDIT_LOGGING"],
  CC8_CHANGE_MANAGEMENT:    ["CTRL_AUDIT_LOGGING", "CTRL_KEY_MANAGEMENT"],
  CC9_RISK_MITIGATION:      ["CTRL_SECRET_ROTATION", "CTRL_KEY_MANAGEMENT", "CTRL_ENCRYPTION"],
};

// ── ISO27001 Export ───────────────────────────────────────────────────────────

/**
 * Iso27001AuditPackage — normalized export for ISO27001 certification review.
 */
export interface Iso27001AuditPackage {
  orgSlug:       string;
  generatedAt:   string;
  overallScore:  number;
  findings:      ComplianceFinding[];
  evidence:      ComplianceEvidence[];
  annexControls: AnnexAControlStatus[];
}

/**
 * Iso27001AnnexA — Annex A control domains (27001:2022 subset).
 */
export type Iso27001AnnexA =
  | "A5_ORG_CONTROLS"
  | "A6_PEOPLE_CONTROLS"
  | "A7_PHYSICAL_CONTROLS"
  | "A8_TECH_CONTROLS";

export interface AnnexAControlStatus {
  annex:      Iso27001AnnexA;
  status:     ComplianceStatus;
  score:      number;
  controlIds: string[];
}

export const ISO27001_ANNEX_CONTROL_MAP: Record<Iso27001AnnexA, string[]> = {
  A5_ORG_CONTROLS:      ["CTRL_ACCESS_CONTROL", "CTRL_AUDIT_LOGGING", "CTRL_INCIDENT_TRACKING"],
  A6_PEOPLE_CONTROLS:   ["CTRL_MFA", "CTRL_ACCESS_CONTROL"],
  A7_PHYSICAL_CONTROLS: [],  // Cloud tenant — physical controls deferred to infrastructure
  A8_TECH_CONTROLS:     [
    "CTRL_ENCRYPTION", "CTRL_KEY_MANAGEMENT", "CTRL_SECRET_ROTATION",
    "CTRL_ANOMALY_DETECTION", "CTRL_ZERO_TRUST", "CTRL_TENANT_ISOLATION",
    "CTRL_DATA_RETENTION",
  ],
};

// ── GDPR Report ───────────────────────────────────────────────────────────────

/**
 * GdprComplianceReport — GDPR readiness and processing inventory report.
 */
export interface GdprComplianceReport {
  orgSlug:             string;
  generatedAt:         string;
  overallStatus:       ComplianceStatus;
  score:               number;
  dataClassifications: Array<{
    level:              string;
    isPersonalData:     boolean;
    subjectToErasure:   boolean;
    retentionDays:      number;
  }>;
  retentionCompliance: Array<{
    category:   string;
    compliant:  boolean;
    notes:      string;
  }>;
  controlFindings:     ComplianceFinding[];
}

// ── External Auditor API ──────────────────────────────────────────────────────

export interface ExternalAuditorIntegration {
  provider:          string;
  description:       string;
  exportFormat:      string;
  authMethod:        string;
  deliveryMethod:    string;
  readinessStatus:   "PLANNED" | "IN_PROGRESS" | "READY";
  targetSprint:      string;
}

export const EXTERNAL_AUDITOR_INTEGRATIONS: ReadonlyArray<ExternalAuditorIntegration> = [
  {
    provider:        "VANTA",
    description:     "Export ComplianceFinding and ComplianceEvidence to Vanta for continuous SOC2 monitoring. Findings map to Vanta tests; evidence links to Vanta evidence requests.",
    exportFormat:    "Vanta API v2 — JSON test results and evidence upload.",
    authMethod:      "Vanta API key stored in Vault.",
    deliveryMethod:  "Async HTTP POST to Vanta API. Never blocks evaluation pipeline.",
    readinessStatus: "PLANNED",
    targetSprint:    "AGENTIK-SECURITY-COMPLIANCE-AUDIT-01",
  },
  {
    provider:        "DRATA",
    description:     "Export compliance status to Drata for automated SOC2/ISO27001 tracking. Controls map to Drata control library.",
    exportFormat:    "Drata API v1 — control status and evidence records.",
    authMethod:      "Drata API key stored in Vault.",
    deliveryMethod:  "Async HTTP POST. Evidence and findings synced on evaluation.",
    readinessStatus: "PLANNED",
    targetSprint:    "AGENTIK-SECURITY-COMPLIANCE-AUDIT-01",
  },
  {
    provider:        "SECUREFRAME",
    description:     "Sync compliance findings with Secureframe for SOC2 Type II audit workflow management.",
    exportFormat:    "Secureframe API — test results and evidence.",
    authMethod:      "Secureframe API key stored in Vault.",
    deliveryMethod:  "Webhook push on evaluation.",
    readinessStatus: "PLANNED",
    targetSprint:    "AGENTIK-SECURITY-COMPLIANCE-AUDIT-02",
  },
  {
    provider:        "CUSTOM_AUDITOR_API",
    description:     "Generic auditor export API. Serves ComplianceFinding[], ComplianceEvidence[], and framework reports in OCSF-compatible JSON. For custom audit tooling.",
    exportFormat:    "OCSF (Open Cybersecurity Schema Framework) 1.0 + custom compliance extension.",
    authMethod:      "JWT bearer token scoped to AUDITOR role.",
    deliveryMethod:  "REST API endpoint: GET /api/orgs/{orgSlug}/compliance/export?framework={fw}",
    readinessStatus: "PLANNED",
    targetSprint:    "AGENTIK-SECURITY-COMPLIANCE-AUDIT-01",
  },
];

// ── Compliance Automation Plans ───────────────────────────────────────────────

export interface ComplianceAutomationPlan {
  id:              string;
  name:            string;
  description:     string;
  triggerCondition: string;
  outputAction:    string;
  targetSprint:    string;
  readinessStatus: "PLANNED" | "IN_PROGRESS" | "READY";
}

export const COMPLIANCE_AUTOMATION_PLANS: ReadonlyArray<ComplianceAutomationPlan> = [
  {
    id:               "AUTO_EVIDENCE_COLLECT",
    name:             "Automated Evidence Collection",
    description:      "Scheduled cron that auto-collects evidence from all 7 security subsystems for all active orgs. Updates ComplianceEvidence records. Triggers re-evaluation on new evidence.",
    triggerCondition: "Cron: daily at 2:00 AM UTC per org.",
    outputAction:     "Call all 7 compliance adapters. Persist evidence via PrismaComplianceRepository.",
    targetSprint:     "AGENTIK-SECURITY-COMPLIANCE-AUTO-COLLECT-01",
    readinessStatus:  "PLANNED",
  },
  {
    id:               "AUTO_FINDING_ALERT",
    name:             "Compliance Finding Alert",
    description:      "When a new NON_COMPLIANT or blocking finding is detected, emit executive brain signal and send notification to SECURITY_ADMIN.",
    triggerCondition: "New ComplianceFinding with status=NON_COMPLIANT or isBlocking=true.",
    outputAction:     "buildComplianceBrainSignals → executive layer. Notification via Slack/email.",
    targetSprint:     "AGENTIK-SECURITY-COMPLIANCE-AUTO-COLLECT-01",
    readinessStatus:  "PLANNED",
  },
  {
    id:               "GDPR_ERASURE_WORKFLOW",
    name:             "GDPR Data Subject Erasure Workflow",
    description:      "Operator-initiated workflow to process GDPR Article 17 erasure requests. Validates retention policy, anonymizes eligible records, logs the erasure request with legal hold check.",
    triggerCondition: "ORG_ADMIN initiates erasure request for a userId.",
    outputAction:     "Validate against RETENTION_POLICIES. Mark erasure-eligible records. Create GDPR audit event.",
    targetSprint:     "AGENTIK-SECURITY-COMPLIANCE-GDPR-01",
    readinessStatus:  "PLANNED",
  },
  {
    id:               "SOC2_TIMELINE_TRACKER",
    name:             "SOC2 Type II Evidence Timeline",
    description:      "Track 12-month evidence window for SOC2 Type II certification. Alert when evidence is approaching expiry or the window has gaps.",
    triggerCondition: "Weekly check: scan ComplianceEvidence for gaps in 12-month SOC2 window.",
    outputAction:     "Flag expired or missing evidence periods. Notify SECURITY_ADMIN.",
    targetSprint:     "AGENTIK-SECURITY-COMPLIANCE-SOC2-TIMELINE-01",
    readinessStatus:  "PLANNED",
  },
];

// ── Serialization helpers ─────────────────────────────────────────────────────

/**
 * complianceFindingToAuditorRecord — normalize a ComplianceFinding to a
 * flat, auditor-friendly record suitable for export.
 */
export interface AuditorFindingRecord {
  findingId:     string;
  orgSlug:       string;
  controlId:     string;
  framework?:    ComplianceFramework;
  status:        ComplianceStatus;
  severity:      ComplianceSeverity;
  score:         number;
  title:         string;
  summary:       string;
  violationCount: number;
  isBlocking:    boolean;
  evaluatedAt:   string;
  epochSeconds:  number;
}

export function complianceFindingToAuditorRecord(
  finding: ComplianceFinding,
): AuditorFindingRecord {
  return {
    findingId:     finding.id,
    orgSlug:       finding.orgSlug,
    controlId:     finding.controlId,
    framework:     finding.framework,
    status:        finding.status,
    severity:      finding.severity,
    score:         finding.score,
    title:         finding.title,
    summary:       finding.summary,
    violationCount: finding.violations.length,
    isBlocking:    finding.violations.some(v => v.isBlocking),
    evaluatedAt:   finding.evaluatedAt,
    epochSeconds:  Math.floor(new Date(finding.evaluatedAt).getTime() / 1000),
  };
}
