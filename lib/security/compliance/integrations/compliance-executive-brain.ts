/**
 * lib/security/compliance/integrations/compliance-executive-brain.ts
 *
 * AGENTIK-SECURITY-COMPLIANCE-01
 * Compliance Integration — Executive Brain
 *
 * Converts critical compliance findings into executive brain signals.
 * Enables the AI executive layer to surface compliance risks.
 *
 * No server-only. Pure domain adapter.
 */

import type {
  ComplianceFinding,
  ComplianceViolation,
  ComplianceSeverity,
  ComplianceFramework,
} from "../compliance-types";
import { COMPLIANCE_SEVERITY_RANK } from "../compliance-types";

// ── ComplianceExecutiveSignal ─────────────────────────────────────────────────

/**
 * ComplianceExecutiveSignal — a compliance finding translated into an
 * executive-layer insight signal.
 */
export interface ComplianceExecutiveSignal {
  id:            string;
  orgSlug:       string;
  controlId:     string;
  framework?:    ComplianceFramework;
  severity:      ComplianceSeverity;
  title:         string;
  message:       string;
  score:         number;
  violationCount: number;
  isBlocking:    boolean;
  generatedAt:   string;
}

// ── buildComplianceBrainSignals ───────────────────────────────────────────────

/**
 * buildComplianceBrainSignals — convert HIGH/CRITICAL findings into executive signals.
 * Filters to findings that warrant executive attention (HIGH or CRITICAL severity).
 *
 * Never throws — returns [] on error.
 */
export function buildComplianceBrainSignals(
  findings: ComplianceFinding[],
  orgSlug:  string,
): ComplianceExecutiveSignal[] {
  try {
    return findings
      .filter(f =>
        f.orgSlug === orgSlug &&
        COMPLIANCE_SEVERITY_RANK[f.severity] >= COMPLIANCE_SEVERITY_RANK["HIGH"] &&
        f.status !== "COMPLIANT",
      )
      .map(f => ({
        id:             `cexs_${f.id}`,
        orgSlug:        f.orgSlug,
        controlId:      f.controlId,
        framework:      f.framework,
        severity:       f.severity,
        title:          f.title,
        message:        _buildMessage(f),
        score:          f.score,
        violationCount: f.violations.length,
        isBlocking:     f.violations.some(v => v.isBlocking),
        generatedAt:    new Date().toISOString(),
      }))
      .sort((a, b) => COMPLIANCE_SEVERITY_RANK[b.severity] - COMPLIANCE_SEVERITY_RANK[a.severity]);
  } catch {
    return [];
  }
}

// ── formatComplianceMessage ───────────────────────────────────────────────────

/**
 * formatComplianceMessage — format a ComplianceExecutiveSignal for executive display.
 */
export function formatComplianceMessage(signal: ComplianceExecutiveSignal): string {
  const frameworkStr = signal.framework ? ` [${signal.framework}]` : "";
  const blockingStr  = signal.isBlocking ? " — BLOCKING CERTIFICATION" : "";
  return `[COMPLIANCE ${signal.severity}]${frameworkStr} ${signal.title}${blockingStr}. Score: ${signal.score}/100. ${signal.violationCount} violation(s) detected.`;
}

// ── getBlockingSignals ────────────────────────────────────────────────────────

/**
 * getBlockingSignals — return only signals that block certification.
 */
export function getBlockingSignals(
  signals: ComplianceExecutiveSignal[],
): ComplianceExecutiveSignal[] {
  return signals.filter(s => s.isBlocking);
}

// ── Private helpers ────────────────────────────────────────────────────────────

function _buildMessage(finding: ComplianceFinding): string {
  const topViolation = _topViolation(finding.violations);
  if (topViolation) {
    return `${finding.summary} Top violation: ${topViolation.title}. Remediation: ${topViolation.remediation}`;
  }
  return finding.summary;
}

function _topViolation(violations: ComplianceViolation[]): ComplianceViolation | null {
  if (violations.length === 0) return null;
  return [...violations].sort((a, b) =>
    COMPLIANCE_SEVERITY_RANK[b.severity] - COMPLIANCE_SEVERITY_RANK[a.severity],
  )[0];
}
