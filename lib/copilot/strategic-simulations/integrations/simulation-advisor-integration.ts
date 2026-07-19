// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 21 — Strategic Advisor Integration
// Feeds simulation results back into the advisor context.

import type { StrategicAdvisorContext } from "../../strategic-advisor/strategic-context-builder";
import type { SimulationResult } from "../strategic-simulation-types";
import type { StrategicConcern, StrategicOpportunityAssessment } from "../../strategic-advisor/strategic-advisor-types";
import { convertSimulationToAdvisory } from "../simulation-advisor-engine";

export interface SimulationAdvisorFeedback {
  readonly enhancedConcerns:       StrategicConcern[];
  readonly enhancedOpportunities:  StrategicOpportunityAssessment[];
  readonly simulationBoost:        number;   // confidence adjustment from simulation data
}

export function buildSimulationAdvisorFeedback(
  result:  SimulationResult,
  _ctx:    StrategicAdvisorContext
): SimulationAdvisorFeedback {
  const advisory = convertSimulationToAdvisory(result);

  const simulationBoost = Math.min(0.10, result.scenarios.length * 0.02);

  return {
    enhancedConcerns:      advisory.concerns,
    enhancedOpportunities: advisory.opportunities,
    simulationBoost,
  };
}

export function computeSimulationEnrichedScore(
  baseScore:       number,
  simulationBoost: number
): number {
  return Math.min(1, Math.round((baseScore + simulationBoost) * 100) / 100);
}
