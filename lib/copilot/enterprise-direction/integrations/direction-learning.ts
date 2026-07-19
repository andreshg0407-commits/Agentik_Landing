// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 19: Learning Integration
// CRITICAL: uses .name NOT .label on patterns

export interface DirectionLearningContext {
  readonly orgSlug:      string;
  readonly patternNames: string[];
  readonly learningBoost: number; // 0–0.10
}

export function getDirectionPatternNames(
  orgSlug: string,
  patterns: Array<{ name: string; domain?: string; confidence?: number }>,
  limit = 8
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

export function buildDirectionLearningContext(
  orgSlug: string,
  patterns: Array<{ name: string; domain?: string; confidence?: number }>
): DirectionLearningContext {
  try {
    const patternNames   = getDirectionPatternNames(orgSlug, patterns);
    const learningBoost  = Math.min(0.10, patternNames.length * 0.012);
    return { orgSlug, patternNames, learningBoost };
  } catch {
    return { orgSlug, patternNames: [], learningBoost: 0 };
  }
}

export function hasRelevantLearning(ctx: DirectionLearningContext): boolean {
  try {
    return ctx.patternNames.length > 0;
  } catch {
    return false;
  }
}
