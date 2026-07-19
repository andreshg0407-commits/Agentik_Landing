// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 23: Learning Framework Integration

import type { LearningPattern } from "../../learning/learning-types";

export interface LearningCouncilContext {
  readonly patterns:      LearningPattern[];
  readonly learningBoost: number;
  readonly activePatternCount:    number;
  readonly reinforcedPatternCount: number;
}

export function buildLearningCouncilContext(
  orgSlug:  string,
  patterns: LearningPattern[]
): LearningCouncilContext {
  try {
    const scoped      = patterns.filter((p) => p.orgSlug === orgSlug);
    const active      = scoped.filter((p) => p.status === "ACTIVE");
    const reinforced  = scoped.filter((p) => p.status === "REINFORCED");

    const learningBoost = Math.min(
      0.10,
      (active.length > 0 ? 0.05 : 0) + (reinforced.length > 0 ? 0.05 : 0)
    );

    return {
      patterns: scoped,
      learningBoost,
      activePatternCount:     active.length,
      reinforcedPatternCount: reinforced.length,
    };
  } catch {
    return { patterns: [], learningBoost: 0, activePatternCount: 0, reinforcedPatternCount: 0 };
  }
}

export function getRelevantPatternLabels(
  orgSlug:  string,
  patterns: LearningPattern[],
  limit = 3
): string[] {
  return patterns
    .filter((p) => p.orgSlug === orgSlug && (p.status === "REINFORCED" || p.status === "ACTIVE"))
    .slice(0, limit)
    .map((p) => p.name);
}
