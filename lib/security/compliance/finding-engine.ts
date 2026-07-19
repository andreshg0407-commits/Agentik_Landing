/**
 * lib/security/compliance/finding-engine.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Compliance & Governance — Finding Engine
 *
 * Produces ComplianceFinding, ComplianceViolation, warnings, and recommendations
 * from evidence collections and control evaluations.
 *
 * No server-only. No Prisma. Pure domain logic.
 */

import type {
  ComplianceEvidence,
  ComplianceFinding,
  ComplianceViolation,
  ComplianceSeverity,
  ComplianceStatus,
  ComplianceFramework,
  ViolationType,
} from "./compliance-types";
import { COMPLIANCE_SEVERITY_RANK } from "./compliance-types";
import { complianceRegistry } from "./compliance-registry";
import { getSupportingEvidence, getGapEvidence } from "./evidence-engine";

// ── ID generators ──────────────────────────────────────────────────────────────

function _fid(): string {
  return `cfnd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function _vid(): string {
  return `cviol_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── buildViolation ────────────────────────────────────────────────────────────

/**
 * buildViolation — create a typed ComplianceViolation.
 */
export function buildViolation(params: {
  orgSlug:     string;
  controlId:   string;
  type:        ViolationType;
  severity:    ComplianceSeverity;
  title:       string;
  description: string;
  remediation: string;
  evidenceIds: string[];
  isBlocking:  boolean;
  framework?:  ComplianceFramework;
}): ComplianceViolation {
  return {
    id:          _vid(),
    orgSlug:     params.orgSlug,
    controlId:   params.controlId,
    framework:   params.framework,
    type:        params.type,
    severity:    params.severity,
    title:       params.title,
    description: params.description,
    remediation: params.remediation,
    detectedAt:  new Date().toISOString(),
    evidenceIds: params.evidenceIds,
    isBlocking:  params.isBlocking,
  };
}

// ── buildFinding ──────────────────────────────────────────────────────────────

/**
 * buildFinding — construct a ComplianceFinding directly from parameters.
 */
export function buildFinding(params: {
  orgSlug:     string;
  controlId:   string;
  status:      ComplianceStatus;
  severity:    ComplianceSeverity;
  summary:     string;
  evidenceIds: string[];
  violations:  ComplianceViolation[];
  score:       number;
  framework?:  ComplianceFramework;
}): ComplianceFinding {
  const now  = new Date().toISOString();
  const type = params.violations.length > 0
    ? (params.status === "NON_COMPLIANT" ? "VIOLATION" : "WARNING")
    : params.status === "COMPLIANT"
      ? "COMPLIANT"
      : "NOT_EVALUATED";

  const controlName = complianceRegistry.getControl(params.controlId)?.name ?? params.controlId;

  return {
    id:           _fid(),
    orgSlug:      params.orgSlug,
    controlId:    params.controlId,
    framework:    params.framework,
    type,
    status:       params.status,
    severity:     params.severity,
    title:        `${controlName} — ${_statusLabel(params.status)}`,
    summary:      params.summary,
    evidenceIds:  params.evidenceIds,
    violations:   params.violations,
    score:        Math.max(0, Math.min(100, params.score)),
    evaluatedAt:  now,
    validUntil:   new Date(Date.now() + 30 * 86_400_000).toISOString(),
    remediations: params.violations.map(v => v.remediation).filter(Boolean),
  };
}

// ── buildFindingsFromEvidence ─────────────────────────────────────────────────

/**
 * buildFindingsFromEvidence — generate findings for all controls from a pool of evidence.
 * Groups evidence by controlId and derives findings for each.
 *
 * Never throws — returns [] on error.
 */
export function buildFindingsFromEvidence(
  evidence:  ComplianceEvidence[],
  controlIds: string[],
  orgSlug:   string,
  framework?: ComplianceFramework,
): ComplianceFinding[] {
  try {
    return controlIds.map(controlId => {
      const ctrl     = complianceRegistry.getControl(controlId);
      const ctrlEvidence = evidence.filter(e => e.controlId === controlId && e.orgSlug === orgSlug);
      const supporting   = getSupportingEvidence(ctrlEvidence);
      const gaps         = getGapEvidence(ctrlEvidence);

      const violations = gaps.map(gap => buildViolation({
        orgSlug,
        controlId,
        type:        "CONFIGURATION_GAP",
        severity:    ctrl?.violationSeverity ?? "MEDIUM",
        title:       `Gap: ${gap.summary.slice(0, 80)}`,
        description: gap.summary,
        remediation: "Review and reconfigure this control, then collect fresh evidence.",
        evidenceIds: [gap.id],
        isBlocking:  (ctrl?.violationSeverity ?? "MEDIUM") === "CRITICAL",
        framework,
      }));

      const status: ComplianceStatus = ctrlEvidence.length === 0
        ? "UNKNOWN"
        : violations.some(v => v.isBlocking)
          ? "NON_COMPLIANT"
          : violations.length > 0
            ? "PARTIAL"
            : "COMPLIANT";

      const score = status === "COMPLIANT" ? 100 :
                    status === "PARTIAL"   ?  50 :
                    status === "UNKNOWN"   ?  25 : 0;

      return buildFinding({
        orgSlug,
        controlId,
        status,
        severity:    ctrl?.violationSeverity ?? "MEDIUM",
        summary:     _findingSummary(status, supporting.length, gaps.length),
        evidenceIds: ctrlEvidence.map(e => e.id),
        violations,
        score,
        framework,
      });
    });
  } catch {
    return [];
  }
}

// ── buildWarning ──────────────────────────────────────────────────────────────

/**
 * buildWarning — construct a WARNING-type finding (not yet a violation).
 */
export function buildWarning(params: {
  orgSlug:    string;
  controlId:  string;
  summary:    string;
  details:    string;
  framework?: ComplianceFramework;
}): ComplianceFinding {
  return buildFinding({
    orgSlug:     params.orgSlug,
    controlId:   params.controlId,
    status:      "PARTIAL",
    severity:    "MEDIUM",
    summary:     params.summary,
    evidenceIds: [],
    violations:  [buildViolation({
      orgSlug:     params.orgSlug,
      controlId:   params.controlId,
      type:        "INCOMPLETE_COVERAGE",
      severity:    "MEDIUM",
      title:       `Warning: ${params.summary.slice(0, 80)}`,
      description: params.details,
      remediation: "Investigate the gap and collect evidence to resolve the warning.",
      evidenceIds: [],
      isBlocking:  false,
      framework:   params.framework,
    })],
    score:       50,
    framework:   params.framework,
  });
}

// ── buildRecommendation ───────────────────────────────────────────────────────

/**
 * buildRecommendation — a non-violation advisory recommendation.
 */
export interface ComplianceRecommendation {
  id:           string;
  orgSlug:      string;
  controlId:    string;
  priority:     "LOW" | "MEDIUM" | "HIGH";
  title:        string;
  description:  string;
  action:       string;
  framework?:   ComplianceFramework;
  createdAt:    string;
}

export function buildRecommendation(params: {
  orgSlug:    string;
  controlId:  string;
  priority:   "LOW" | "MEDIUM" | "HIGH";
  title:      string;
  description: string;
  action:     string;
  framework?: ComplianceFramework;
}): ComplianceRecommendation {
  return {
    id:          `crec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    orgSlug:     params.orgSlug,
    controlId:   params.controlId,
    priority:    params.priority,
    title:       params.title,
    description: params.description,
    action:      params.action,
    framework:   params.framework,
    createdAt:   new Date().toISOString(),
  };
}

// ── Finding aggregation ───────────────────────────────────────────────────────

/**
 * getCriticalFindings — return findings with CRITICAL violations.
 */
export function getCriticalFindings(findings: ComplianceFinding[]): ComplianceFinding[] {
  return findings.filter(f => f.violations.some(v => v.severity === "CRITICAL"));
}

/**
 * getBlockingFindings — return findings with blocking violations.
 */
export function getBlockingFindings(findings: ComplianceFinding[]): ComplianceFinding[] {
  return findings.filter(f => f.violations.some(v => v.isBlocking));
}

/**
 * getViolations — extract all violations from a set of findings.
 */
export function getViolations(findings: ComplianceFinding[]): ComplianceViolation[] {
  return findings.flatMap(f => f.violations);
}

/**
 * rankViolations — sort violations by severity (CRITICAL first).
 */
export function rankViolations(violations: ComplianceViolation[]): ComplianceViolation[] {
  return [...violations].sort((a, b) =>
    COMPLIANCE_SEVERITY_RANK[b.severity] - COMPLIANCE_SEVERITY_RANK[a.severity],
  );
}

/**
 * getComplianceScore — compute average score from findings.
 */
export function getComplianceScore(findings: ComplianceFinding[]): number {
  if (findings.length === 0) return 0;
  return Math.round(findings.reduce((sum, f) => sum + f.score, 0) / findings.length);
}

// ── Private helpers ────────────────────────────────────────────────────────────

function _statusLabel(status: ComplianceStatus): string {
  switch (status) {
    case "COMPLIANT":     return "Compliant";
    case "PARTIAL":       return "Partially Compliant";
    case "NON_COMPLIANT": return "Non-Compliant";
    default:              return "Not Evaluated";
  }
}

function _findingSummary(
  status:          ComplianceStatus,
  supportingCount: number,
  gapCount:        number,
): string {
  switch (status) {
    case "COMPLIANT":     return `${supportingCount} supporting evidence item(s). No gaps detected.`;
    case "PARTIAL":       return `${supportingCount} supporting, ${gapCount} gap(s). Partial compliance only.`;
    case "NON_COMPLIANT": return `${gapCount} gap(s) detected. Control is not compliant.`;
    default:              return "No evidence collected for this control.";
  }
}
