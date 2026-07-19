// AGENTIK-STRATEGIC-PLANNING-01 — Phase 14: Learning Integration

import type { LearningPattern, LearningOutcome } from "../../learning/learning-types";

export interface PlanningLearningContext {
  readonly confirmedPatternCount: number;
  readonly positiveOutcomeRate:   number;
  readonly learningConfidenceBoost: number;
}

export function buildPlanningLearningContext(
  orgSlug:  string,
  patterns: LearningPattern[],
  outcomes: LearningOutcome[]
): PlanningLearningContext {
  const scopedP = patterns.filter((p) => p.orgSlug === orgSlug);
  const scopedO = outcomes.filter((o) => o.orgSlug === orgSlug);
  const confirmed = scopedP.filter((p) => p.status === "REINFORCED" || p.status === "ACTIVE");
  const positive  = scopedO.filter((o) => o.result === "POSITIVE");

  const positiveOutcomeRate = scopedO.length === 0 ? 0
    : Math.round(positive.length / scopedO.length * 100) / 100;
  const patternRate = scopedP.length === 0 ? 0 : confirmed.length / scopedP.length;
  const learningConfidenceBoost = Math.min(0.15, Math.round((positiveOutcomeRate * 0.5 + patternRate * 0.5) * 0.15 * 100) / 100);

  return { confirmedPatternCount: confirmed.length, positiveOutcomeRate, learningConfidenceBoost };
}

export function getTopLearningPatternLabels(orgSlug: string, patterns: LearningPattern[], limit = 3): string[] {
  return patterns
    .filter((p) => p.orgSlug === orgSlug && (p.status === "REINFORCED" || p.status === "ACTIVE"))
    .sort((a, b) => b.reinforcementCount - a.reinforcementCount)
    .slice(0, limit)
    .map((p) => p.name);
}
