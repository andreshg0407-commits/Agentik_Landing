// AGENTIK-STRATEGIC-ADVISOR-01 — Phase 17: Learning Integration

import type { LearningPattern, LearningOutcome, LearningEvent } from "../../learning/learning-types";

export interface AdvisorLearningContext {
  readonly confirmedPatterns:   LearningPattern[];
  readonly rejectedPatterns:    LearningPattern[];
  readonly effectiveOutcomes:   LearningOutcome[];
  readonly failedOutcomes:      LearningOutcome[];
  readonly positiveOutcomeRate: number;
  readonly negativeOutcomeRate: number;
  readonly learningStrength:    number;
}

export function buildAdvisorLearningContext(
  orgSlug: string,
  patterns:  LearningPattern[],
  outcomes:  LearningOutcome[],
  events:    LearningEvent[]
): AdvisorLearningContext {
  const scopedPatterns  = patterns.filter((p) => p.orgSlug === orgSlug);
  const scopedOutcomes  = outcomes.filter((o) => o.orgSlug === orgSlug);

  const confirmedPatterns = scopedPatterns.filter((p) => p.status === "REINFORCED" || p.status === "ACTIVE");
  const rejectedPatterns  = scopedPatterns.filter((p) => p.status === "WEAKENED" || p.status === "DEPRECATED");
  const effectiveOutcomes = scopedOutcomes.filter((o) => o.result === "POSITIVE");
  const failedOutcomes    = scopedOutcomes.filter((o) => o.result === "NEGATIVE");

  const total = scopedOutcomes.length;
  const positiveOutcomeRate = total === 0 ? 0 : Math.round((effectiveOutcomes.length / total) * 100) / 100;
  const negativeOutcomeRate = total === 0 ? 0 : Math.round((failedOutcomes.length / total) * 100) / 100;

  const patternTotal    = scopedPatterns.length;
  const patternStrength = patternTotal === 0 ? 0 : confirmedPatterns.length / patternTotal;
  const learningStrength = Math.round((positiveOutcomeRate * 0.5 + patternStrength * 0.5) * 100) / 100;

  return {
    confirmedPatterns, rejectedPatterns, effectiveOutcomes, failedOutcomes,
    positiveOutcomeRate, negativeOutcomeRate, learningStrength,
  };
}

export function getConfirmedAdvisorPatterns(orgSlug: string, patterns: LearningPattern[]): LearningPattern[] {
  return patterns.filter((p) => p.orgSlug === orgSlug && p.status === "REINFORCED" || p.status === "ACTIVE")
    .sort((a, b) => b.reinforcementCount - a.reinforcementCount);
}

export function extractHistoricalAdvisorContext(orgSlug: string, outcomes: LearningOutcome[]): string {
  const scoped  = outcomes.filter((o) => o.orgSlug === orgSlug);
  const pos     = scoped.filter((o) => o.result === "POSITIVE").length;
  const neg     = scoped.filter((o) => o.result === "NEGATIVE").length;
  if (scoped.length === 0) return "Sin historial de outcomes disponible";
  return `${scoped.length} outcomes registrados: ${pos} positivos (${Math.round(pos / scoped.length * 100)}%), ${neg} negativos.`;
}
