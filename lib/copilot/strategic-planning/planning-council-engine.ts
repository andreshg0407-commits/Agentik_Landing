// AGENTIK-STRATEGIC-PLANNING-01 — Phase 37: Planning Council Engine
// Combines Executive Brain + Strategic Advisor + Strategic Simulations
// into a strategic consensus. Never executes. Never modifies operational data.

import type { ExecutivePriority, ExecutiveRisk } from "../executive-brain-v2/executive-brain-types";
import type { StrategicRecommendation, StrategicConcern } from "../strategic-advisor/strategic-advisor-types";
import type { SimulationResult } from "../strategic-simulations/strategic-simulation-types";
import type {
  StrategicObjective,
  StrategicInitiative,
  StrategicRisk,
  PlanningPriority,
  StrategicDomain,
} from "./strategic-planning-types";
import { buildObjectivesFromExecutiveBrain } from "./integrations/planning-executive-brain";
import { buildInitiativesFromAdvisorRecommendations, buildRisksFromAdvisorConcerns } from "./integrations/planning-advisor";
import { buildInitiativesFromSimulations, buildRisksFromSimulations, getSimulationConfidenceBoost } from "./integrations/planning-simulations";

export interface CouncilInput {
  readonly orgSlug:          string;
  readonly executivePriorities: ExecutivePriority[];
  readonly advisorRecs:         StrategicRecommendation[];
  readonly advisorConcerns:     StrategicConcern[];
  readonly simulationResults:   SimulationResult[];
}

export interface CouncilConsensus {
  readonly orgSlug:              string;
  readonly objectives:           StrategicObjective[];
  readonly initiatives:          StrategicInitiative[];
  readonly risks:                StrategicRisk[];
  readonly consensusScore:       number;           // 0–1
  readonly confidenceBoost:      number;           // 0–1
  readonly limitations:          string[];
  readonly sourcesUsed:          string[];
  readonly generatedAt:          string;
}

export function runPlanningCouncil(input: CouncilInput): CouncilConsensus {
  const { orgSlug } = input;

  // Guard
  if (!orgSlug || orgSlug.trim().length === 0) {
    return _emptyConsensus(orgSlug, "Invalid orgSlug.");
  }

  try {
    // 1. Build objectives from Executive Brain
    const objectives = buildObjectivesFromExecutiveBrain(orgSlug, input.executivePriorities);

    // 2. Build initiatives from Advisor and Simulations
    const firstObjectiveId = objectives[0]?.id ?? `council_obj_${Date.now()}`;
    const advisorInitiatives = buildInitiativesFromAdvisorRecommendations(
      orgSlug, firstObjectiveId, input.advisorRecs
    );
    const simulationInitiatives = buildInitiativesFromSimulations(
      orgSlug, firstObjectiveId, input.simulationResults
    );

    // De-duplicate by title
    const seenTitles = new Set<string>();
    const allInitiatives: StrategicInitiative[] = [];
    for (const i of [...advisorInitiatives, ...simulationInitiatives]) {
      const key = i.title.toLowerCase().slice(0, 40);
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        allInitiatives.push(i);
      }
    }

    // 3. Build risks from Advisor and Simulations
    const advisorRisks    = buildRisksFromAdvisorConcerns(orgSlug, `council_plan_${Date.now()}`, input.advisorConcerns);
    const simulationRisks = buildRisksFromSimulations(orgSlug, `council_plan_${Date.now()}`, input.simulationResults);

    const seenRiskTitles = new Set<string>();
    const allRisks: StrategicRisk[] = [];
    for (const r of [...advisorRisks, ...simulationRisks]) {
      const key = r.title.toLowerCase().slice(0, 40);
      if (!seenRiskTitles.has(key)) {
        seenRiskTitles.add(key);
        allRisks.push(r);
      }
    }

    // 4. Compute confidence boost
    const simBoost = getSimulationConfidenceBoost(orgSlug, input.simulationResults);
    const confidenceBoost = Math.min(0.15, simBoost + (objectives.length > 0 ? 0.05 : 0));

    // 5. Consensus score (0–1): proportion of sources that contributed data
    const sources: string[] = [];
    if (objectives.length > 0)   sources.push("EXECUTIVE_BRAIN");
    if (advisorInitiatives.length > 0 || advisorRisks.length > 0) sources.push("STRATEGIC_ADVISOR");
    if (simulationInitiatives.length > 0 || simulationRisks.length > 0) sources.push("STRATEGIC_SIMULATIONS");
    const consensusScore = Math.round(sources.length / 3 * 100) / 100;

    // Invariant: all initiatives have suggestedOnly: true — enforced by initiative-engine factory
    return {
      orgSlug,
      objectives,
      initiatives:      allInitiatives.slice(0, 8),
      risks:            allRisks.slice(0, 6),
      consensusScore,
      confidenceBoost,
      limitations: [
        "El consenso es una propuesta estructurada — no asigna tareas ni ejecuta acciones.",
        "Los datos de entrada pueden tener rezago respecto al estado operativo actual.",
        "La priorización del consejo es estimada y debe ser validada por el equipo directivo.",
      ],
      sourcesUsed: sources,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return _emptyConsensus(orgSlug, "Council engine failed — returning empty consensus.");
  }
}

function _emptyConsensus(orgSlug: string, reason: string): CouncilConsensus {
  return {
    orgSlug,
    objectives:       [],
    initiatives:      [],
    risks:            [],
    consensusScore:   0,
    confidenceBoost:  0,
    limitations:      [reason],
    sourcesUsed:      [],
    generatedAt:      new Date().toISOString(),
  };
}
