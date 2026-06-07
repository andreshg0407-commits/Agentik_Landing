// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Learning ↔ Compliance integration adapter

import type { LearningEvent, LearningPattern, LearningOutcome } from "../learning-types";

export type LearningComplianceStatus = "PASS" | "WARN" | "FAIL";

export interface LearningComplianceSignal {
  readonly domain: string;
  readonly severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly description: string;
  readonly eventId?: string;
  readonly patternId?: string;
}

export interface LearningComplianceReport {
  readonly orgSlug: string;
  readonly status: LearningComplianceStatus;
  readonly signals: LearningComplianceSignal[];
  readonly crossTenantViolations: number;
  readonly criticalAutoChangeAttempts: number;
  readonly unevidencedAdjustments: number;
  readonly generatedAt: string; // ISO8601
}

export function eventToComplianceSignal(
  event: LearningEvent
): LearningComplianceSignal | null {
  // Flag failed actions in finance/compliance domains
  if (
    (event.type === "ACTION_FAILED" || event.type === "HYPOTHESIS_REJECTED") &&
    (event.domain === "FINANCE" || event.domain === "COMPLIANCE")
  ) {
    return {
      domain: event.domain,
      severity: event.confidenceScore >= 0.8 ? "HIGH" : "MEDIUM",
      description: `Learning event ${event.type} in ${event.domain} domain`,
      eventId: event.id,
    };
  }
  return null;
}

export function patternToComplianceSignal(
  pattern: LearningPattern
): LearningComplianceSignal | null {
  if (
    pattern.status === "DEPRECATED" &&
    (pattern.domain === "FINANCE" || pattern.domain === "COMPLIANCE")
  ) {
    return {
      domain: pattern.domain,
      severity: "HIGH",
      description: `Pattern "${pattern.name}" deprecated in ${pattern.domain} domain after ${pattern.weakeningCount} weakening events`,
      patternId: pattern.id,
    };
  }
  return null;
}

export function buildComplianceLearningReport(
  orgSlug: string,
  events: LearningEvent[],
  patterns: LearningPattern[],
  crossTenantViolations: number,
  criticalAutoChangeAttempts: number
): LearningComplianceReport {
  const signals: LearningComplianceSignal[] = [];

  for (const event of events) {
    const signal = eventToComplianceSignal(event);
    if (signal) signals.push(signal);
  }

  for (const pattern of patterns) {
    const signal = patternToComplianceSignal(pattern);
    if (signal) signals.push(signal);
  }

  // Unevidenced: events with empty referenceId
  const unevidencedAdjustments = events.filter(
    (e) => !e.referenceId || e.referenceId.trim() === ""
  ).length;

  const criticalSignals = signals.filter((s) => s.severity === "CRITICAL").length;
  const highSignals = signals.filter((s) => s.severity === "HIGH").length;

  let status: LearningComplianceStatus;
  if (crossTenantViolations > 0 || criticalAutoChangeAttempts > 0 || criticalSignals > 0) {
    status = "FAIL";
  } else if (highSignals > 0 || unevidencedAdjustments > 0) {
    status = "WARN";
  } else {
    status = "PASS";
  }

  return {
    orgSlug,
    status,
    signals,
    crossTenantViolations,
    criticalAutoChangeAttempts,
    unevidencedAdjustments,
    generatedAt: new Date().toISOString(),
  };
}

export function evaluateLearningComplianceGate(
  report: LearningComplianceReport
): { allowed: boolean; reason: string } {
  if (report.status === "FAIL") {
    return {
      allowed: false,
      reason: `Learning compliance gate FAILED: ${report.crossTenantViolations} cross-tenant violations, ${report.criticalAutoChangeAttempts} critical auto-change attempts`,
    };
  }
  return { allowed: true, reason: `Learning compliance gate ${report.status}` };
}
