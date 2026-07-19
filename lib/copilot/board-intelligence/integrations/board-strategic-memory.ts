// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 21: Strategic Memory Integration

export interface BoardMemoryContext {
  readonly orgSlug:           string;
  readonly pastBoardTopics:   string[];
  readonly pastOutcomes:      string[];
  readonly memoryBoost:       number;
  readonly recurrenceCount:   number;
  readonly hasRecurringIssues: boolean;
}

export function buildBoardMemoryContext(
  orgSlug:        string,
  pastTopics:     string[],
  pastOutcomes:   string[]
): BoardMemoryContext {
  try {
    const scoped        = pastTopics;  // memory is already org-scoped at query time
    const recurrenceCount = detectRecurrences(scoped);
    const hasRecurringIssues = recurrenceCount > 0;

    const memoryBoost = Math.min(
      0.08,
      (scoped.length > 0 ? 0.04 : 0) +
      (hasRecurringIssues ? -0.02 : 0.02) +
      (pastOutcomes.length > 0 ? 0.02 : 0)
    );

    return {
      orgSlug,
      pastBoardTopics:  scoped,
      pastOutcomes,
      memoryBoost:      Math.max(0, memoryBoost),
      recurrenceCount,
      hasRecurringIssues,
    };
  } catch {
    return buildEmptyBoardMemoryContext(orgSlug);
  }
}

export function buildEmptyBoardMemoryContext(orgSlug: string): BoardMemoryContext {
  return {
    orgSlug,
    pastBoardTopics:  [],
    pastOutcomes:     [],
    memoryBoost:      0,
    recurrenceCount:  0,
    hasRecurringIssues: false,
  };
}

function detectRecurrences(topics: string[]): number {
  try {
    const keys = topics.map((t) => t.slice(0, 20).toLowerCase());
    const counts = new Map<string, number>();
    for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
    return [...counts.values()].filter((v) => v > 1).length;
  } catch {
    return 0;
  }
}

export function getRecurringBoardTopics(ctx: BoardMemoryContext, limit = 3): string[] {
  return ctx.pastBoardTopics.slice(0, limit);
}

export function getBoardMemoryLimitations(ctx: BoardMemoryContext): string[] {
  const limits: string[] = [];
  if (ctx.pastBoardTopics.length === 0) {
    limits.push("Sin historial de sesiones de junta disponible");
  }
  if (ctx.hasRecurringIssues) {
    limits.push(`${ctx.recurrenceCount} tema(s) recurrente(s) detectado(s) — patrones históricos considerados`);
  }
  return limits;
}
