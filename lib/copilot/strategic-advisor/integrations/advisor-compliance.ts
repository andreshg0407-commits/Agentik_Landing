// AGENTIK-STRATEGIC-ADVISOR-01 — Phase 22: Compliance Integration

import type { StrategicRecommendation, StrategicAdvice } from "../strategic-advisor-types";

export type AdvisorComplianceStatus = "PASS" | "WARN" | "FAIL";

export interface AdvisorComplianceResult {
  readonly status:      AdvisorComplianceStatus;
  readonly violations:  string[];
  readonly warnings:    string[];
}

export function evaluateAdvisorComplianceGate(
  orgSlug: string,
  recommendations: StrategicRecommendation[],
  advice: StrategicAdvice[]
): AdvisorComplianceResult {
  const violations: string[] = [];
  const warnings:   string[] = [];

  // Check: all recommendations have rationale
  for (const rec of recommendations) {
    if (!rec.rationale || rec.rationale.length < 10) {
      violations.push(`Recommendation "${rec.title}" lacks adequate rationale`);
    }
    if (rec.evidenceIds.length === 0 && rec.priority === "CRITICAL") {
      warnings.push(`Critical recommendation "${rec.title}" has no evidence IDs`);
    }
    if (!rec.suggestedOnly) {
      violations.push(`Recommendation "${rec.title}" missing suggestedOnly:true — cannot have side effects`);
    }
  }

  // Check: all advice is traceable for high-confidence items
  for (const adv of advice.filter((a) => a.confidenceScore >= 0.7)) {
    if (!adv.traceable || adv.evidenceIds.length === 0) {
      warnings.push(`High-confidence advice "${adv.title}" is not fully traceable`);
    }
  }

  const status: AdvisorComplianceStatus =
    violations.length > 0 ? "FAIL" : warnings.length > 3 ? "WARN" : "PASS";

  return { status, violations, warnings };
}

export function enforceAdvisorTenantBoundary(requestOrgSlug: string, dataOrgSlug: string): void {
  if (requestOrgSlug !== dataOrgSlug) {
    throw new Error(
      `[STRATEGIC_ADVISOR] Cross-tenant boundary violation: request orgSlug "${requestOrgSlug}" attempted to access data for "${dataOrgSlug}"`
    );
  }
}

export function buildAdvisorComplianceRisk(
  orgSlug: string,
  findingCount: number,
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
): { hasRisk: boolean; level: string } {
  const hasRisk = findingCount > 0 && (severity === "HIGH" || severity === "CRITICAL");
  return { hasRisk, level: hasRisk ? severity : "NONE" };
}
