// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 19: Learning Integration
// CRITICAL: uses .name NOT .label on patterns

export interface GovernanceLearningContext {
  readonly orgSlug:        string;
  readonly patternNames:   string[];
  readonly learningBoost:  number; // 0–1
  readonly hasLearning:    boolean;
}

export interface LearningPattern {
  readonly name:       string; // NOTE: .name not .label
  readonly confidence: number;
  readonly domain?:    string;
}

export function getGovernancePatternNames(
  orgSlug: string,
  patterns: LearningPattern[],
  limit: number = 5
): string[] {
  try {
    return patterns
      .filter((p) => p.name && p.name.length > 0)
      .slice(0, limit)
      .map((p) => p.name); // .name NOT .label
  } catch {
    return [];
  }
}

export function buildGovernanceLearningContext(
  orgSlug: string,
  patterns?: LearningPattern[]
): GovernanceLearningContext {
  try {
    const names  = getGovernancePatternNames(orgSlug, patterns ?? [], 5);
    const boost  = Math.min(0.10, names.length * 0.02);
    return {
      orgSlug,
      patternNames:  names,
      learningBoost: boost,
      hasLearning:   names.length > 0,
    };
  } catch {
    return { orgSlug, patternNames: [], learningBoost: 0, hasLearning: false };
  }
}

export function applyLearningBoostToGovernanceScore(
  baseScore: number,
  learningContext: GovernanceLearningContext
): number {
  try {
    return Math.min(1, baseScore + learningContext.learningBoost);
  } catch {
    return baseScore;
  }
}
