// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 18 — Executive Brain V2 Integration

import type { ExecutivePriority, ExecutiveRisk } from "../../executive-brain-v2/executive-brain-types";
import type { SimulationConstraint, SimulationAssumption } from "../strategic-simulation-types";
import { buildConstraint } from "../constraint-engine";
import { buildAssumption } from "../assumption-engine";

export function buildConstraintsFromExecutivePriorities(
  orgSlug: string,
  priorities: ExecutivePriority[]
): SimulationConstraint[] {
  return priorities
    .filter((p) => p.orgSlug === orgSlug && p.level === "CRITICAL")
    .slice(0, 4)
    .map((p) =>
      buildConstraint({
        label:       `Prioridad ejecutiva: ${p.title}`,
        description: p.description,
        domain:      p.domain as SimulationConstraint["domain"],
        type:        "HARD",
        origin:      "STRATEGIC",
        impact:      "CRITICAL",
        isViolated:  false,
        metadata:    { priorityId: p.id, source: "EXECUTIVE_BRAIN" },
      })
    );
}

export function buildAssumptionsFromExecutiveRisks(
  orgSlug: string,
  risks:   ExecutiveRisk[]
): SimulationAssumption[] {
  return risks
    .filter((r) => r.orgSlug === orgSlug && (r.level === "CRITICAL" || r.level === "HIGH"))
    .slice(0, 4)
    .map((r) =>
      buildAssumption({
        label:           `Riesgo ejecutivo: ${r.title}`,
        description:     r.description,
        domain:          r.domain as SimulationAssumption["domain"],
        confidenceScore: r.confidenceScore,
        isKeyAssumption: r.level === "CRITICAL",
        source:          "EXPERT",
        metadata:        { riskId: r.id, source: "EXECUTIVE_BRAIN" },
      })
    );
}

export function getExecutiveBrainSimulationBoost(
  orgSlug:    string,
  priorities: ExecutivePriority[],
  risks:      ExecutiveRisk[]
): number {
  const critPriorities = priorities.filter((p) => p.orgSlug === orgSlug && p.level === "CRITICAL").length;
  const critRisks      = risks.filter((r) => r.orgSlug === orgSlug && r.level === "CRITICAL").length;
  // More executive context = higher simulation reliability (capped at 0.10)
  const boost = Math.min(0.10, (critPriorities + critRisks) * 0.02);
  return Math.round(boost * 100) / 100;
}
