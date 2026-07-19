// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 16: Learning Integration
// CRITICAL: uses .name not .label on LearningPattern

export interface LearningForecastContext {
  readonly orgSlug:        string;
  readonly patternNames:   string[];
  readonly adjustmentHints: string[];
  readonly learningBoost:  number; // 0–0.08
  readonly hasLearningData: boolean;
}

export interface LearningPatternRef {
  readonly name:        string; // .name — NOT .label
  readonly domain:      string;
  readonly confidence:  number; // 0–1
  readonly isApplicable: boolean;
}

export function buildLearningForecastContext(
  orgSlug: string,
  patterns: LearningPatternRef[]
): LearningForecastContext {
  try {
    if (!patterns || patterns.length === 0) {
      return buildEmptyLearningForecastContext(orgSlug);
    }

    const applicable = patterns.filter((p) => p.isApplicable && p.confidence >= 0.5);

    const patternNames = applicable
      .slice(0, 5)
      .map((p) => p.name); // CRITICAL: .name not .label

    const adjustmentHints = applicable
      .filter((p) => p.confidence >= 0.7)
      .slice(0, 3)
      .map((p) => `Ajuste basado en patrón: ${p.name}`);

    const learningBoost = Math.min(
      0.08,
      applicable.length > 0 ? 0.04 : 0 +
      adjustmentHints.length > 0 ? 0.04 : 0
    );

    return {
      orgSlug,
      patternNames,
      adjustmentHints,
      learningBoost,
      hasLearningData: applicable.length > 0,
    };
  } catch {
    return buildEmptyLearningForecastContext(orgSlug);
  }
}

export function buildEmptyLearningForecastContext(
  orgSlug: string
): LearningForecastContext {
  return {
    orgSlug,
    patternNames:    [],
    adjustmentHints: [],
    learningBoost:   0,
    hasLearningData: false,
  };
}

export function getRelevantForecastPatternNames(
  orgSlug: string,
  patterns: LearningPatternRef[],
  limit = 3
): string[] {
  try {
    return patterns
      .filter((p) => p.isApplicable && p.confidence >= 0.5)
      .map((p) => p.name) // CRITICAL: .name not .label
      .slice(0, limit);
  } catch {
    return [];
  }
}
