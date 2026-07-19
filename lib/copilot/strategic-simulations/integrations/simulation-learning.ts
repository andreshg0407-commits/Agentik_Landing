// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 16 — Learning Framework Integration

import type { LearningPattern, LearningOutcome } from "../../learning/learning-types";
import type { SimulationAssumption } from "../strategic-simulation-types";
import { buildAssumption } from "../assumption-engine";

export interface SimulationLearningContext {
  readonly confirmedPatternCount: number;
  readonly positiveOutcomeRate:   number;
  readonly learningBoost:         number;   // 0–1: how much learning data improves confidence
}

export function buildSimulationLearningContext(
  orgSlug:  string,
  patterns: LearningPattern[],
  outcomes: LearningOutcome[]
): SimulationLearningContext {
  const scoped   = patterns.filter((p) => p.orgSlug === orgSlug);
  const confirmed = scoped.filter((p) => p.status === "REINFORCED" || p.status === "ACTIVE");
  const scopedOut = outcomes.filter((o) => o.orgSlug === orgSlug);
  const positive  = scopedOut.filter((o) => o.result === "POSITIVE");

  const positiveOutcomeRate = scopedOut.length === 0 ? 0
    : Math.round((positive.length / scopedOut.length) * 100) / 100;
  const patternRate = scoped.length === 0 ? 0 : confirmed.length / scoped.length;
  const learningBoost = Math.round((positiveOutcomeRate * 0.5 + patternRate * 0.5) * 100) / 100;

  return { confirmedPatternCount: confirmed.length, positiveOutcomeRate, learningBoost };
}

export function buildAssumptionsFromLearning(
  orgSlug:  string,
  patterns: LearningPattern[]
): SimulationAssumption[] {
  return patterns
    .filter((p) => p.orgSlug === orgSlug && (p.status === "REINFORCED" || p.status === "ACTIVE"))
    .sort((a, b) => b.reinforcementCount - a.reinforcementCount)
    .slice(0, 5)
    .map((p) =>
      buildAssumption({
        label:           `Patrón confirmado: ${p.name}`,
        description:     p.description,
        domain:          p.domain as SimulationAssumption["domain"],
        confidenceScore: p.confidenceScore,
        isKeyAssumption: p.reinforcementCount >= 4,
        source:          "HISTORICAL",
        metadata:        { patternId: p.id, reinforcementCount: p.reinforcementCount },
      })
    );
}
