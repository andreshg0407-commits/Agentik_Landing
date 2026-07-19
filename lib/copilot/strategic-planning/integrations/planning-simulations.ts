// AGENTIK-STRATEGIC-PLANNING-01 — Phase 17: Strategic Simulations Integration

import type { SimulationResult, SimulationRecommendation } from "../../strategic-simulations/strategic-simulation-types";
import type { StrategicInitiative, StrategicRisk, StrategicDomain } from "../strategic-planning-types";
import { createInitiativeFromRecommendation } from "../initiative-engine";
import { buildPlanningRisk } from "../risk-planning-engine";

export function buildInitiativesFromSimulations(
  orgSlug:     string,
  objectiveId: string,
  results:     SimulationResult[]
): StrategicInitiative[] {
  const allRecs = results
    .flatMap((r) => r.recommendations)
    .filter((r) => r.orgSlug === orgSlug);

  return allRecs.slice(0, 5).map((r) =>
    createInitiativeFromRecommendation({
      orgSlug,
      objectiveId,
      domain:          r.domain,
      recTitle:        r.title,
      recDesc:         r.description,
      recPriority:     r.priority,
      confidenceScore: r.confidenceScore,
      evidenceIds:     r.evidenceIds,
    })
  );
}

export function buildRisksFromSimulations(
  orgSlug:  string,
  planId:   string,
  results:  SimulationResult[]
): StrategicRisk[] {
  return results
    .flatMap((r) => r.scenarios.flatMap((s) => s.risks))
    .filter((r) => r.level === "CRITICAL" || r.level === "HIGH")
    .slice(0, 4)
    .map((r) =>
      buildPlanningRisk({
        orgSlug, planId,
        title:       `[Simulación] ${r.title}`,
        description: r.description,
        domain:      r.domain,
        likelihood:  r.likelihood,
        impact:      r.impact,
        mitigations: r.mitigations,
        metadata:    { source: "SIMULATION" },
      })
    );
}

export function getSimulationConfidenceBoost(orgSlug: string, results: SimulationResult[]): number {
  const scoped = results.filter((r) => r.orgSlug === orgSlug && r.status === "COMPLETED");
  return Math.min(0.10, scoped.length * 0.03);
}
