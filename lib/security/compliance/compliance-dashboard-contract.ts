/**
 * lib/security/compliance/compliance-dashboard-contract.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Compliance & Governance — Dashboard Contract
 *
 * Defines the payload contract for the compliance dashboard.
 * Pure domain — no server-only. Safe to use as a React prop type.
 * No UI — this is the data contract only.
 */

import type {
  ComplianceStatus,
  ComplianceSeverity,
  ComplianceFramework,
} from "./compliance-types";

// ── ComplianceDashboardPayload ─────────────────────────────────────────────────

/**
 * ComplianceDashboardPayload — the full compliance state for one org's dashboard.
 * Serializable. Never contains raw secrets or key material.
 */
export interface ComplianceDashboardPayload {
  orgSlug:          string;
  generatedAt:      string;   // ISO 8601
  overallStatus:    ComplianceStatus;
  overallScore:     number;   // 0–100
  riskLevel:        ComplianceSeverity;

  /** Per-framework readiness scores 0–100. */
  frameworkScores:  Record<ComplianceFramework, number>;

  /** Count of findings in each status. */
  compliantCount:   number;
  partialCount:     number;
  nonCompliantCount: number;
  unknownCount:     number;

  /** Count of violations by severity. */
  criticalViolations: number;
  highViolations:     number;
  blockingCount:      number;

  /** Top-level controls by status. */
  controlSummaries: ComplianceControlSummary[];

  /** Headline message for executive display. */
  headline:         string;
}

/**
 * ComplianceControlSummary — lightweight control snapshot for dashboard display.
 */
export interface ComplianceControlSummary {
  controlId:    string;
  name:         string;
  status:       ComplianceStatus;
  score:        number;
  severity:     ComplianceSeverity;
  violationCount: number;
}

// ── buildComplianceDashboard ──────────────────────────────────────────────────

import type { ComplianceFinding } from "./compliance-types";
import { complianceRegistry } from "./compliance-registry";

/**
 * buildComplianceDashboard — construct the dashboard payload from findings.
 * Never throws — returns empty dashboard on error.
 */
export function buildComplianceDashboard(
  orgSlug:  string,
  findings: ComplianceFinding[],
): ComplianceDashboardPayload {
  try {
    const now         = new Date().toISOString();
    const orgFindings = findings.filter(f => f.orgSlug === orgSlug);

    const compliantCount    = orgFindings.filter(f => f.status === "COMPLIANT").length;
    const partialCount      = orgFindings.filter(f => f.status === "PARTIAL").length;
    const nonCompliantCount = orgFindings.filter(f => f.status === "NON_COMPLIANT").length;
    const unknownCount      = orgFindings.filter(f => f.status === "UNKNOWN").length;

    const scores      = orgFindings.map(f => f.score);
    const overallScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

    const criticalViolations = orgFindings.flatMap(f => f.violations).filter(v => v.severity === "CRITICAL").length;
    const highViolations     = orgFindings.flatMap(f => f.violations).filter(v => v.severity === "HIGH").length;
    const blockingCount      = orgFindings.flatMap(f => f.violations).filter(v => v.isBlocking).length;

    const overallStatus: ComplianceStatus =
      nonCompliantCount > 0 ? "NON_COMPLIANT" :
      partialCount > 0 || unknownCount > 0 ? "PARTIAL" :
      compliantCount > 0 ? "COMPLIANT" : "UNKNOWN";

    const riskLevel: ComplianceSeverity =
      criticalViolations > 0 ? "CRITICAL" :
      highViolations > 0     ? "HIGH"     :
      partialCount > 0       ? "MEDIUM"   : "LOW";

    const frameworkScores = _buildFrameworkScores(orgFindings);
    const controlSummaries = _buildControlSummaries(orgFindings);
    const headline = _buildHeadline(overallStatus, overallScore, blockingCount);

    return {
      orgSlug,
      generatedAt:   now,
      overallStatus,
      overallScore,
      riskLevel,
      frameworkScores,
      compliantCount,
      partialCount,
      nonCompliantCount,
      unknownCount,
      criticalViolations,
      highViolations,
      blockingCount,
      controlSummaries,
      headline,
    };
  } catch {
    return buildEmptyComplianceDashboard(orgSlug);
  }
}

/**
 * buildEmptyComplianceDashboard — zero-state dashboard for orgs with no findings.
 */
export function buildEmptyComplianceDashboard(orgSlug: string): ComplianceDashboardPayload {
  return {
    orgSlug,
    generatedAt:     new Date().toISOString(),
    overallStatus:   "UNKNOWN",
    overallScore:    0,
    riskLevel:       "LOW",
    frameworkScores: { SOC2: 0, ISO27001: 0, GDPR: 0, HIPAA: 0, CUSTOM: 0 },
    compliantCount:  0,
    partialCount:    0,
    nonCompliantCount: 0,
    unknownCount:    0,
    criticalViolations: 0,
    highViolations:  0,
    blockingCount:   0,
    controlSummaries: [],
    headline:        "No compliance data collected yet. Run an evaluation to see compliance status.",
  };
}

// ── Private helpers ────────────────────────────────────────────────────────────

function _buildFrameworkScores(
  findings: ComplianceFinding[],
): Record<ComplianceFramework, number> {
  const scores: Record<ComplianceFramework, number> = {
    SOC2: 0, ISO27001: 0, GDPR: 0, HIPAA: 0, CUSTOM: 0,
  };
  // Simple approximation: average score of findings for controls in each framework
  for (const fw of Object.keys(scores) as ComplianceFramework[]) {
    const relevant = findings.filter(f => {
      const ctrl = complianceRegistry.getControl(f.controlId);
      return ctrl?.frameworks.includes(fw);
    });
    if (relevant.length > 0) {
      scores[fw] = Math.round(relevant.reduce((sum, f) => sum + f.score, 0) / relevant.length);
    }
  }
  return scores;
}

function _buildControlSummaries(findings: ComplianceFinding[]): ComplianceControlSummary[] {
  return findings.map(f => ({
    controlId:     f.controlId,
    name:          complianceRegistry.getControl(f.controlId)?.name ?? f.controlId,
    status:        f.status,
    score:         f.score,
    severity:      f.severity,
    violationCount: f.violations.length,
  }));
}

function _buildHeadline(
  status:       ComplianceStatus,
  score:        number,
  blockingCount: number,
): string {
  if (status === "COMPLIANT") return `All controls compliant. Score: ${score}/100.`;
  if (blockingCount > 0) return `${blockingCount} blocking violation(s). Score: ${score}/100. Action required.`;
  return `Compliance score: ${score}/100. Status: ${status}.`;
}
