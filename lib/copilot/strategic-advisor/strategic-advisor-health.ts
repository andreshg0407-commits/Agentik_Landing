// AGENTIK-STRATEGIC-ADVISOR-01 — Phase 29: Health Check
import "server-only";

import type { StrategicAdvisorResult } from "./strategic-advisor-types";

export type StrategicAdvisorHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export interface StrategicAdvisorHealth {
  readonly status:       StrategicAdvisorHealthStatus;
  readonly orgSlug:      string;
  readonly advisorScore: number;
  readonly concerns:     string[];
  readonly checkedAt:    string;
}

export function checkStrategicAdvisorHealth(orgSlug: string, lastResult: StrategicAdvisorResult | null): StrategicAdvisorHealth {
  const concerns: string[] = [];

  if (!lastResult) {
    return { status: "UNAVAILABLE", orgSlug, advisorScore: 0, concerns: ["No advisor run found"], checkedAt: new Date().toISOString() };
  }

  if (lastResult.status === "FAILED") {
    return { status: "UNAVAILABLE", orgSlug, advisorScore: 0, concerns: [`Last run failed: ${lastResult.error ?? "unknown"}`], checkedAt: new Date().toISOString() };
  }

  const report = lastResult.report;
  if (!report) {
    return { status: "UNAVAILABLE", orgSlug, advisorScore: 0, concerns: ["No report in last result"], checkedAt: new Date().toISOString() };
  }

  if (report.advisorScore < 0.3) concerns.push("Low advisor score — context may be insufficient");
  if (report.concerns.length === 0 && report.opportunities.length === 0) concerns.push("No concerns or opportunities — advisor may lack data");
  if (report.recommendations.length === 0) concerns.push("No recommendations generated");

  const status: StrategicAdvisorHealthStatus = concerns.length >= 2 ? "DEGRADED" : "HEALTHY";
  return { status, orgSlug, advisorScore: report.advisorScore, concerns, checkedAt: new Date().toISOString() };
}
