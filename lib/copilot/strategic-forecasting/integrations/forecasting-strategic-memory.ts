// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 15: Strategic Memory Integration

export interface StrategicMemoryForecastContext {
  readonly orgSlug:          string;
  readonly historicalPatterns: string[];
  readonly recurringThemes:   string[];
  readonly memoryBoost:       number; // 0–0.10
  readonly hasMemoryData:     boolean;
}

export interface MemoryForecastEntry {
  readonly title:       string;
  readonly description: string;
  readonly recurrences: number;
  readonly domain:      string;
}

export function buildStrategicMemoryForecastContext(
  orgSlug: string,
  entries: MemoryForecastEntry[]
): StrategicMemoryForecastContext {
  try {
    if (!entries || entries.length === 0) {
      return buildEmptyMemoryForecastContext(orgSlug);
    }

    const historicalPatterns = entries
      .filter((e) => e.recurrences >= 2)
      .slice(0, 5)
      .map((e) => e.title);

    const recurringThemes = entries
      .filter((e) => e.recurrences >= 3)
      .slice(0, 3)
      .map((e) => e.description);

    const memoryBoost = Math.min(
      0.10,
      (historicalPatterns.length > 0 ? 0.03 : 0) +
      (recurringThemes.length > 0    ? 0.04 : 0) +
      Math.min(0.03, entries.length * 0.005)
    );

    return {
      orgSlug,
      historicalPatterns,
      recurringThemes,
      memoryBoost,
      hasMemoryData: true,
    };
  } catch {
    return buildEmptyMemoryForecastContext(orgSlug);
  }
}

export function buildEmptyMemoryForecastContext(
  orgSlug: string
): StrategicMemoryForecastContext {
  return {
    orgSlug,
    historicalPatterns: [],
    recurringThemes:    [],
    memoryBoost:        0,
    hasMemoryData:      false,
  };
}

export function getMemoryPatternLabels(
  ctx: StrategicMemoryForecastContext,
  limit = 3
): string[] {
  return ctx.historicalPatterns.slice(0, limit);
}
