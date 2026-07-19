// AGENTIK-STRATEGIC-ADVISOR-01 — Phase 19: Cross Module Integration

import type { ReasoningSignal } from "../../cross-module-reasoning/cross-module-types";
import type { StrategicDomain } from "../strategic-advisor-types";

export interface AdvisorCrossModuleContext {
  readonly highSeverityCount:    number;
  readonly criticalSignals:      ReasoningSignal[];
  readonly anomalySignals:       ReasoningSignal[];
  readonly crossDomainRiskScore: number;
  readonly affectedDomains:      StrategicDomain[];
}

export function buildAdvisorCrossModuleContext(
  orgSlug: string,
  signals: ReasoningSignal[]
): AdvisorCrossModuleContext {
  const scoped          = signals.filter((s) => s.orgSlug === orgSlug);
  const critical        = scoped.filter((s) => s.severity === "CRITICAL");
  const anomaly         = scoped.filter((s) => s.type === "ANOMALY");
  const highSeverity    = scoped.filter((s) => s.severity === "CRITICAL" || s.severity === "HIGH");

  const riskScore = Math.min(
    critical.length * 0.3 + highSeverity.length * 0.1,
    1
  );

  const domainSet = new Set(scoped.map((s) => _mapDomain(s.domain)));
  return {
    highSeverityCount:    highSeverity.length,
    criticalSignals:      critical.slice(0, 10),
    anomalySignals:       anomaly.slice(0, 10),
    crossDomainRiskScore: Math.round(riskScore * 100) / 100,
    affectedDomains:      [...domainSet],
  };
}

export function extractAdvisorRisksFromSignals(orgSlug: string, signals: ReasoningSignal[]): ReasoningSignal[] {
  return signals.filter((s) =>
    s.orgSlug === orgSlug &&
    (s.type === "ANOMALY" || s.type === "THRESHOLD_BREACH" || s.type === "METRIC_DROP")
  );
}

export function getAdvisorHighSeverityCount(orgSlug: string, signals: ReasoningSignal[]): number {
  return signals.filter((s) =>
    s.orgSlug === orgSlug && (s.severity === "CRITICAL" || s.severity === "HIGH")
  ).length;
}

function _mapDomain(domain: string): StrategicDomain {
  const map: Record<string, StrategicDomain> = {
    FINANCE: "FINANCE", COMMERCIAL: "COMMERCIAL", MARKETING: "MARKETING",
    OPERATIONS: "OPERATIONS", COMPLIANCE: "COMPLIANCE", TECHNOLOGY: "TECHNOLOGY",
    COLLECTIONS: "FINANCE", MEMORY: "CROSS_DOMAIN", GRAPH: "CROSS_DOMAIN", EXECUTIVE: "EXECUTIVE",
  };
  return map[domain] ?? "CROSS_DOMAIN";
}
