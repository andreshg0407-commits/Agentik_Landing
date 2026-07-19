// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 17 — Cross Module Integration

import type { ReasoningSignal } from "../../cross-module-reasoning/cross-module-types";
import type { ExecutiveRisk, ExecutiveDomain } from "../executive-brain-types";
import {
  generateEbv2Id,
  confidenceFromScore,
  riskLevelFromScore,
} from "../executive-brain-types";

export interface CrossModuleExecContext {
  readonly orgSlug: string;
  readonly criticalSignals: ReasoningSignal[];
  readonly riskSignals: ReasoningSignal[];
  readonly opportunitySignals: ReasoningSignal[];
  readonly crossDomainRiskScore: number; // 0–1
}

export function buildCrossModuleExecContext(
  orgSlug: string,
  signals: ReasoningSignal[]
): CrossModuleExecContext {
  const scoped = signals.filter((s) => s.orgSlug === orgSlug);

  const criticalSignals = scoped.filter(
    (s) => s.severity === "CRITICAL" || s.severity === "HIGH"
  );
  const riskSignals = scoped.filter(
    (s) => s.type === "ANOMALY" || s.type === "THRESHOLD_BREACH" || s.type === "METRIC_DROP"
  );
  const opportunitySignals = scoped.filter(
    (s) => s.type === "METRIC_RISE" && s.direction === "UP"
  );

  const crossDomainRiskScore = criticalSignals.length > 0
    ? Math.min(criticalSignals.length * 0.15 + 0.1, 1)
    : 0;

  return {
    orgSlug,
    criticalSignals,
    riskSignals,
    opportunitySignals,
    crossDomainRiskScore: Math.round(crossDomainRiskScore * 100) / 100,
  };
}

export function extractRisksFromReasoningSignals(
  orgSlug: string,
  signals: ReasoningSignal[]
): ExecutiveRisk[] {
  return signals
    .filter(
      (s) =>
        s.orgSlug === orgSlug &&
        (s.severity === "CRITICAL" || s.severity === "HIGH") &&
        (s.type === "ANOMALY" || s.type === "THRESHOLD_BREACH" || s.type === "METRIC_DROP")
    )
    .map((s) => {
      const impact = s.severity === "CRITICAL" ? 0.9 : 0.7;
      const likelihood = s.confidence;
      const compositeRisk = Math.round((likelihood * 0.4 + impact * 0.6) * 100) / 100;
      return {
        id: generateEbv2Id("risk"),
        orgSlug,
        title: s.label,
        description: s.description,
        domain: _mapSignalDomain(s.domain),
        level: riskLevelFromScore(compositeRisk),
        confidence: confidenceFromScore(s.confidence),
        confidenceScore: s.confidence,
        likelihood,
        impact,
        compositeRisk,
        rationale: `Señal cross-module: ${s.type} en ${s.domain}`,
        evidenceIds: [s.id],
        mitigationSuggestions: [],
        metadata: { source: "CROSS_MODULE", signalId: s.id, signalType: s.type, signalDomain: s.domain },
      };
    });
}

export function getHighSeveritySignalCount(
  orgSlug: string,
  signals: ReasoningSignal[]
): number {
  return signals.filter(
    (s) => s.orgSlug === orgSlug && (s.severity === "CRITICAL" || s.severity === "HIGH")
  ).length;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _mapSignalDomain(domain: string): ExecutiveDomain {
  const map: Record<string, ExecutiveDomain> = {
    FINANCE: "FINANCE", COMMERCIAL: "COMMERCIAL", COLLECTIONS: "FINANCE",
    MARKETING: "MARKETING", EXECUTIVE: "EXECUTIVE", PLAYBOOKS: "CROSS_DOMAIN",
    MEMORY: "CROSS_DOMAIN", GRAPH: "CROSS_DOMAIN",
  };
  return map[domain] ?? "CROSS_DOMAIN";
}
