// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 18: Strategic Memory Integration

export interface DirectionMemoryContext {
  readonly orgSlug:       string;
  readonly memoryHints:   string[];
  readonly patternCount:  number;
  readonly recencyScore:  number; // 0–1
  readonly memoryBoost:   number; // 0–0.10
}

export function buildDirectionMemoryContext(orgSlug: string): DirectionMemoryContext {
  try {
    return {
      orgSlug,
      memoryHints:  [],
      patternCount: 0,
      recencyScore: 0,
      memoryBoost:  0,
    };
  } catch {
    return {
      orgSlug,
      memoryHints:  [],
      patternCount: 0,
      recencyScore: 0,
      memoryBoost:  0,
    };
  }
}

export function getMemoryPatternHints(
  orgSlug: string,
  patterns: Array<{ name: string; domain?: string }>,
  limit = 5
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

export function computeMemoryBoost(patternCount: number, recencyScore: number): number {
  try {
    const countFactor   = Math.min(0.05, patternCount * 0.01);
    const recencyFactor = Math.min(0.05, recencyScore * 0.05);
    return Math.min(0.10, countFactor + recencyFactor);
  } catch {
    return 0;
  }
}
