/**
 * lib/security/security-report-builder.ts
 *
 * Agentik — Security Foundation — Security Report Builder
 * Sprint: AGENTIK-SECURITY-FOUNDATION-01
 *
 * Generates structured, serializable security reports from audit events,
 * signals, and policy decisions.
 *
 * Reports are plain data objects — no UI, no HTML, no PDF.
 * They are designed to be:
 *   - Serialized to JSON and stored
 *   - Rendered by dashboard components
 *   - Sent to external SIEM systems (future)
 *   - Used as input to Executive Brain signals (future)
 *
 * No Prisma. No server-only. No AI.
 */

import type { SecuritySeverity, SecurityCategory, SecurityEventType } from "./security-types";
import type { SecurityEvent } from "./security-types";
import type { SecuritySignal } from "./security-signals";
import type { PolicyDecision } from "./security-policy-engine";
import { SECURITY_SEVERITY_RANK, compareSeverity } from "./security-types";

// ── Report Structures ─────────────────────────────────────────────────────────

export interface SecurityEventSummary {
  eventType:  SecurityEventType;
  count:      number;
  severity:   SecuritySeverity;
}

export interface PolicySummary {
  policyId:  string;
  passed:    number;
  failed:    number;
}

export interface SecurityRisk {
  id:          string;
  title:       string;
  severity:    SecuritySeverity;
  description: string;
  count:       number;
}

/**
 * SecurityReport — the full output of buildSecurityReport().
 * Fully JSON-serializable.
 */
export interface SecurityReport {
  /** Tenant this report covers. */
  orgSlug:             string;
  /** ISO 8601 timestamp when the report was generated. */
  generatedAt:         string;
  /** Time range covered by the report (ISO 8601). */
  periodStart:         string;
  periodEnd:           string;
  /** Total number of security events analyzed. */
  totalEvents:         number;
  /** Events grouped by type. */
  eventsByType:        SecurityEventSummary[];
  /** Events grouped by severity. */
  eventsBySeverity:    Record<SecuritySeverity, number>;
  /** Events grouped by category. */
  eventsByCategory:    Record<SecurityCategory, number>;
  /** Total security violations (ACCESS_DENIED + POLICY_VIOLATION). */
  totalViolations:     number;
  /** Policy evaluation summary. */
  policySummary:       PolicySummary[];
  /** Active security signals (risks). */
  activeSignals:       SecuritySignal[];
  /** Computed top risks (up to 5). */
  topRisks:            SecurityRisk[];
  /** Overall security posture score (0–100, higher = better). */
  securityScore:       number;
  /** Human-readable assessment. */
  assessment:          string;
}

// ── Report Builder ────────────────────────────────────────────────────────────

/**
 * buildSecurityReport — generate a security report from audit data.
 *
 * @param orgSlug     — the tenant to report on
 * @param events      — security events from the audit log
 * @param signals     — active security signals
 * @param decisions   — policy evaluation results
 * @param periodStart — ISO 8601 start of reporting period
 * @param periodEnd   — ISO 8601 end of reporting period
 */
export function buildSecurityReport(
  orgSlug:     string,
  events:      SecurityEvent[],
  signals:     SecuritySignal[],
  decisions:   PolicyDecision[],
  periodStart: string = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  periodEnd:   string = new Date().toISOString(),
): SecurityReport {
  // Filter to org events only
  const orgEvents = events.filter(e => e.orgSlug === orgSlug);

  // Events by type
  const typeMap = new Map<SecurityEventType, { count: number; severity: SecuritySeverity }>();
  for (const e of orgEvents) {
    const existing = typeMap.get(e.eventType);
    if (!existing) {
      typeMap.set(e.eventType, { count: 1, severity: e.severity });
    } else {
      existing.count++;
      if (SECURITY_SEVERITY_RANK[e.severity] > SECURITY_SEVERITY_RANK[existing.severity]) {
        existing.severity = e.severity;
      }
    }
  }
  const eventsByType: SecurityEventSummary[] = [...typeMap.entries()].map(
    ([eventType, { count, severity }]) => ({ eventType, count, severity }),
  );

  // Events by severity
  const eventsBySeverity: Record<SecuritySeverity, number> = {
    LOW:      0,
    MEDIUM:   0,
    HIGH:     0,
    CRITICAL: 0,
  };
  for (const e of orgEvents) {
    eventsBySeverity[e.severity]++;
  }

  // Events by category
  const catMap = new Map<SecurityCategory, number>();
  for (const e of orgEvents) {
    catMap.set(e.category, (catMap.get(e.category) ?? 0) + 1);
  }
  const eventsByCategory = Object.fromEntries(catMap) as Record<SecurityCategory, number>;

  // Violations
  const totalViolations = orgEvents.filter(
    e => e.eventType === "ACCESS_DENIED" || e.eventType === "POLICY_VIOLATION",
  ).length;

  // Policy summary
  const policyMap = new Map<string, { passed: number; failed: number }>();
  for (const d of decisions) {
    const existing = policyMap.get(d.policyId) ?? { passed: 0, failed: 0 };
    if (d.allowed) { existing.passed++; } else { existing.failed++; }
    policyMap.set(d.policyId, existing);
  }
  const policySummary: PolicySummary[] = [...policyMap.entries()].map(
    ([policyId, { passed, failed }]) => ({ policyId, passed, failed }),
  );

  // Top risks from signals (up to 5, sorted by severity)
  const orgSignals  = signals.filter(s => s.orgSlug === orgSlug);
  const topRisks: SecurityRisk[] = orgSignals
    .sort((a, b) => compareSeverity(a.severity, b.severity))
    .slice(0, 5)
    .map(s => ({
      id:          s.id,
      title:       s.title,
      severity:    s.severity,
      description: s.description,
      count:       1,
    }));

  // Security score (simple heuristic 0–100)
  const securityScore = _calculateScore(orgEvents, orgSignals, totalViolations);

  // Assessment
  const assessment = _buildAssessment(securityScore, orgSignals, totalViolations);

  return {
    orgSlug,
    generatedAt:      new Date().toISOString(),
    periodStart,
    periodEnd,
    totalEvents:      orgEvents.length,
    eventsByType,
    eventsBySeverity,
    eventsByCategory,
    totalViolations,
    policySummary,
    activeSignals:    orgSignals,
    topRisks,
    securityScore,
    assessment,
  };
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

function _calculateScore(
  events:     SecurityEvent[],
  signals:    SecuritySignal[],
  violations: number,
): number {
  let score = 100;

  // Deduct for violations
  score -= Math.min(violations * 5, 30);

  // Deduct for critical signals
  const criticalSignals = signals.filter(s => s.severity === "CRITICAL").length;
  score -= Math.min(criticalSignals * 15, 40);

  // Deduct for high signals
  const highSignals = signals.filter(s => s.severity === "HIGH").length;
  score -= Math.min(highSignals * 8, 20);

  // Deduct for high/critical events
  const severeEvents = events.filter(
    e => e.severity === "HIGH" || e.severity === "CRITICAL",
  ).length;
  score -= Math.min(severeEvents * 2, 20);

  return Math.max(0, Math.min(100, score));
}

function _buildAssessment(
  score:      number,
  signals:    SecuritySignal[],
  violations: number,
): string {
  if (score >= 90 && signals.length === 0) {
    return "Security posture is STRONG. No active risks detected in this period.";
  }
  if (score >= 75) {
    return `Security posture is ACCEPTABLE. ${violations} violation(s) detected. ${signals.length} signal(s) require monitoring.`;
  }
  if (score >= 50) {
    const critCount = signals.filter(s => s.severity === "CRITICAL").length;
    return `Security posture requires ATTENTION. ${critCount} CRITICAL signal(s) active. Immediate review recommended.`;
  }
  return `Security posture is at RISK. Score=${score}. Escalate to security team immediately.`;
}
