// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 19 — Cross-Module Reasoning Integration

import type { ReasoningSignal } from "../../cross-module-reasoning/cross-module-types";
import type { SimulationRisk } from "../strategic-simulation-types";
import { generateSimRiskId } from "../strategic-simulation-identity";
import { simulationRiskLevelFromScore } from "../strategic-simulation-types";

export function buildSimulationRisksFromSignals(
  orgSlug:  string,
  signals:  ReasoningSignal[]
): SimulationRisk[] {
  return signals
    .filter((s) => s.orgSlug === orgSlug && (s.severity === "CRITICAL" || s.severity === "HIGH"))
    .slice(0, 6)
    .map((s) => ({
      id:            generateSimRiskId(),
      domain:        s.domain as SimulationRisk["domain"],
      title:         `[Señal] ${s.label}`,
      description:   s.description,
      level:         simulationRiskLevelFromScore(s.confidence),
      likelihood:    s.confidence,
      impact:        s.severity === "CRITICAL" ? 0.90 : 0.65,
      compositeRisk: Math.round(s.confidence * (s.severity === "CRITICAL" ? 0.90 : 0.65) * 100) / 100,
      timeHorizon:   "SHORT_TERM" as const,
      mitigations:   [],
      evidenceIds:   [],
      metadata:      { signalId: s.id, source: "CROSS_MODULE_REASONING" },
    }));
}

export function getSignalDensityBoost(orgSlug: string, signals: ReasoningSignal[]): number {
  const scoped = signals.filter((s) => s.orgSlug === orgSlug);
  return Math.min(0.10, scoped.length / 100);
}
