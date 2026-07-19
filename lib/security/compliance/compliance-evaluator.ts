/**
 * lib/security/compliance/compliance-evaluator.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Compliance & Governance — Compliance Evaluator
 *
 * Evaluates compliance status for controls, frameworks, tenants, and the platform.
 * Fail-closed: all evaluations default to NON_COMPLIANT on error.
 *
 * No server-only. No Prisma. Pure domain logic.
 */

import type {
  ComplianceEvidence,
  ComplianceFinding,
  ComplianceStatus,
  ComplianceSeverity,
  ComplianceFramework,
  ComplianceViolation,
} from "./compliance-types";
import {
  COMPLIANCE_SCORE_COMPLIANT,
  COMPLIANCE_SCORE_PARTIAL,
  COMPLIANCE_SCORE_NON_COMPLIANT,
  COMPLIANCE_SCORE_UNKNOWN,
  COMPLIANCE_SEVERITY_RANK,
} from "./compliance-types";
import {
  complianceRegistry,
  listControls,
} from "./compliance-registry";
import {
  getSupportingEvidence,
  getGapEvidence,
  filterActiveEvidence,
} from "./evidence-engine";

// ── ID generator ──────────────────────────────────────────────────────────────

function _id(): string {
  return `cfnd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ── evaluateControl ───────────────────────────────────────────────────────────

/**
 * evaluateControl — evaluate a single control for one org.
 *
 * Returns ComplianceFinding. Never throws.
 * Defaults to NON_COMPLIANT / UNKNOWN on error (fail-closed).
 */
export function evaluateControl(
  orgSlug:    string,
  controlId:  string,
  evidence:   ComplianceEvidence[],
  framework?: ComplianceFramework,
): ComplianceFinding {
  const now = new Date().toISOString();
  try {
    const control = complianceRegistry.getControl(controlId);
    if (!control) {
      return _unknownFinding(orgSlug, controlId, now, `Control "${controlId}" not registered`);
    }

    const active      = filterActiveEvidence(evidence.filter(e => e.controlId === controlId && e.orgSlug === orgSlug));
    const supporting  = getSupportingEvidence(active);
    const gaps        = getGapEvidence(active);
    const violations  = _buildViolationsFromGaps(orgSlug, controlId, gaps, framework);

    const status  = _deriveStatus(supporting.length, active.length, violations);
    const score   = _deriveScore(status);
    const severity = control.violationSeverity;

    return {
      id:           _id(),
      orgSlug,
      controlId,
      framework,
      type:         _findingType(status),
      status,
      severity,
      title:        `${control.name} — ${_statusLabel(status)}`,
      summary:      _buildSummary(control.name, status, supporting.length, gaps.length, violations.length),
      evidenceIds:  active.map(e => e.id),
      violations,
      score,
      evaluatedAt:  now,
      validUntil:   _nextEvaluation(now),
      remediations: _buildRemediations(violations),
    };
  } catch {
    return _unknownFinding(orgSlug, controlId, now, "evaluation error — fail closed");
  }
}

// ── evaluateFramework ─────────────────────────────────────────────────────────

/**
 * evaluateFramework — evaluate all controls for a given framework for one org.
 *
 * Returns array of ComplianceFinding (one per applicable control).
 * Never throws. Returns [] on error.
 */
export function evaluateFramework(
  orgSlug:   string,
  framework: ComplianceFramework,
  evidence:  ComplianceEvidence[],
): ComplianceFinding[] {
  try {
    const controls = listControls({ framework, enabled: true });
    return controls.map(c => evaluateControl(orgSlug, c.id, evidence, framework));
  } catch {
    return [];
  }
}

// ── evaluateTenant ────────────────────────────────────────────────────────────

/**
 * TenantComplianceEvaluation — aggregated compliance result for one org.
 */
export interface TenantComplianceEvaluation {
  orgSlug:        string;
  overallStatus:  ComplianceStatus;
  score:          number;   // 0–100
  findings:       ComplianceFinding[];
  criticalCount:  number;
  highCount:      number;
  evaluatedAt:    string;
}

/**
 * evaluateTenant — evaluate all enabled controls for one org.
 *
 * Returns a full tenant compliance picture. Never throws.
 */
export function evaluateTenant(
  orgSlug:  string,
  evidence: ComplianceEvidence[],
): TenantComplianceEvaluation {
  const now = new Date().toISOString();
  try {
    const controls = listControls({ enabled: true });
    const findings = controls.map(c => evaluateControl(orgSlug, c.id, evidence));

    const scores        = findings.map(f => f.score);
    const avgScore      = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

    const criticalCount = findings.filter(f => f.violations.some(v => v.severity === "CRITICAL")).length;
    const highCount     = findings.filter(f => f.violations.some(v => v.severity === "HIGH")).length;

    const overallStatus = _overallStatus(findings);

    return {
      orgSlug,
      overallStatus,
      score: avgScore,
      findings,
      criticalCount,
      highCount,
      evaluatedAt: now,
    };
  } catch {
    return {
      orgSlug,
      overallStatus:  "UNKNOWN",
      score:          0,
      findings:       [],
      criticalCount:  0,
      highCount:      0,
      evaluatedAt:    now,
    };
  }
}

// ── evaluatePlatform ──────────────────────────────────────────────────────────

/**
 * PlatformComplianceEvaluation — aggregated compliance result across all orgs.
 */
export interface PlatformComplianceEvaluation {
  tenants:       TenantComplianceEvaluation[];
  globalScore:   number;
  overallStatus: ComplianceStatus;
  evaluatedAt:   string;
}

/**
 * evaluatePlatform — evaluate compliance for all orgs in the platform.
 * evidenceMap: orgSlug → evidence list for that org.
 *
 * Never throws. Returns empty platform evaluation on error.
 */
export function evaluatePlatform(
  orgs:        string[],
  evidenceMap: Map<string, ComplianceEvidence[]>,
): PlatformComplianceEvaluation {
  const now = new Date().toISOString();
  try {
    const tenants = orgs.map(orgSlug =>
      evaluateTenant(orgSlug, evidenceMap.get(orgSlug) ?? []),
    );
    const scores      = tenants.map(t => t.score);
    const globalScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

    const overallStatus = tenants.some(t => t.overallStatus === "NON_COMPLIANT")
      ? "NON_COMPLIANT"
      : tenants.some(t => t.overallStatus === "PARTIAL" || t.overallStatus === "UNKNOWN")
        ? "PARTIAL"
        : "COMPLIANT";

    return { tenants, globalScore, overallStatus, evaluatedAt: now };
  } catch {
    return { tenants: [], globalScore: 0, overallStatus: "UNKNOWN", evaluatedAt: now };
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _deriveStatus(
  supportingCount: number,
  totalCount:      number,
  violations:      ComplianceViolation[],
): ComplianceStatus {
  if (violations.some(v => v.isBlocking)) return "NON_COMPLIANT";
  if (totalCount === 0) return "UNKNOWN";
  if (supportingCount === totalCount && violations.length === 0) return "COMPLIANT";
  if (supportingCount > 0) return "PARTIAL";
  return "NON_COMPLIANT";
}

function _deriveScore(status: ComplianceStatus): number {
  switch (status) {
    case "COMPLIANT":     return COMPLIANCE_SCORE_COMPLIANT;
    case "PARTIAL":       return COMPLIANCE_SCORE_PARTIAL;
    case "NON_COMPLIANT": return COMPLIANCE_SCORE_NON_COMPLIANT;
    default:              return COMPLIANCE_SCORE_UNKNOWN;
  }
}

function _findingType(status: ComplianceStatus): ComplianceFinding["type"] {
  switch (status) {
    case "COMPLIANT":     return "COMPLIANT";
    case "PARTIAL":       return "WARNING";
    case "NON_COMPLIANT": return "VIOLATION";
    default:              return "NOT_EVALUATED";
  }
}

function _statusLabel(status: ComplianceStatus): string {
  switch (status) {
    case "COMPLIANT":     return "Compliant";
    case "PARTIAL":       return "Partially Compliant";
    case "NON_COMPLIANT": return "Non-Compliant";
    default:              return "Not Evaluated";
  }
}

function _buildSummary(
  controlName:     string,
  status:          ComplianceStatus,
  supportingCount: number,
  gapCount:        number,
  violationCount:  number,
): string {
  if (status === "COMPLIANT") return `${controlName} is fully compliant. ${supportingCount} supporting evidence item(s) found.`;
  if (status === "PARTIAL")   return `${controlName} is partially compliant. ${supportingCount} supporting, ${gapCount} gap(s) detected.`;
  if (status === "NON_COMPLIANT") return `${controlName} is non-compliant. ${violationCount} violation(s) detected. Immediate remediation required.`;
  return `${controlName} could not be evaluated. No evidence collected.`;
}

function _buildViolationsFromGaps(
  orgSlug:   string,
  controlId: string,
  gaps:      ComplianceEvidence[],
  framework?: ComplianceFramework,
): ComplianceViolation[] {
  return gaps.map(gap => ({
    id:          `cviol_${gap.id}`,
    orgSlug,
    controlId,
    framework,
    type:        "CONFIGURATION_GAP" as const,
    severity:    "MEDIUM" as ComplianceSeverity,
    title:       `Gap detected: ${gap.summary.slice(0, 80)}`,
    description: gap.summary,
    remediation: "Review control configuration and collect fresh supporting evidence.",
    detectedAt:  gap.collectedAt,
    evidenceIds: [gap.id],
    isBlocking:  false,
  }));
}

function _buildRemediations(violations: ComplianceViolation[]): string[] {
  const unique = new Set(violations.map(v => v.remediation));
  return Array.from(unique);
}

function _nextEvaluation(now: string): string {
  return new Date(new Date(now).getTime() + 30 * 86_400_000).toISOString();
}

function _overallStatus(findings: ComplianceFinding[]): ComplianceStatus {
  if (findings.length === 0) return "UNKNOWN";
  if (findings.some(f => f.status === "NON_COMPLIANT")) return "NON_COMPLIANT";
  if (findings.some(f => f.status === "PARTIAL" || f.status === "UNKNOWN")) return "PARTIAL";
  return "COMPLIANT";
}

function _unknownFinding(
  orgSlug:   string,
  controlId: string,
  now:       string,
  reason:    string,
): ComplianceFinding {
  return {
    id:           _id(),
    orgSlug,
    controlId,
    type:         "NOT_EVALUATED",
    status:       "UNKNOWN",
    severity:     "HIGH",
    title:        `${controlId} — Not Evaluated`,
    summary:      reason,
    evidenceIds:  [],
    violations:   [],
    score:        COMPLIANCE_SCORE_UNKNOWN,
    evaluatedAt:  now,
    remediations: ["Collect evidence for this control before evaluation."],
  };
}

// ── Score utilities ────────────────────────────────────────────────────────────

/**
 * complianceScoreToStatus — map a numeric score (0–100) to ComplianceStatus.
 */
export function complianceScoreToStatus(score: number): ComplianceStatus {
  if (score >= 95) return "COMPLIANT";
  if (score >= 50) return "PARTIAL";
  if (score >   0) return "PARTIAL";
  return "NON_COMPLIANT";
}

/**
 * aggregateComplianceScores — compute weighted average of multiple scores.
 */
export function aggregateComplianceScores(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/**
 * rankFindings — sort findings by violation severity (CRITICAL first).
 */
export function rankFindings(findings: ComplianceFinding[]): ComplianceFinding[] {
  return [...findings].sort((a, b) =>
    COMPLIANCE_SEVERITY_RANK[b.severity] - COMPLIANCE_SEVERITY_RANK[a.severity],
  );
}
