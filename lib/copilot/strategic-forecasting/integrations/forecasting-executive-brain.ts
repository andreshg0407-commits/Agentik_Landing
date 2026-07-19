// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 17: Executive Brain Integration

export interface ExecutiveBrainForecastContext {
  readonly orgSlug:        string;
  readonly signals:        string[];
  readonly insights:       string[];
  readonly brainBoost:     number; // 0–0.12
  readonly hasBrainData:   boolean;
}

export interface ExecutiveBrainForecastEntry {
  readonly title:       string;
  readonly description: string;
  readonly confidence:  number; // 0–1
  readonly domain:      string;
  readonly priority:    "HIGH" | "MEDIUM" | "LOW";
}

export function buildExecutiveBrainForecastContext(
  orgSlug: string,
  entries: ExecutiveBrainForecastEntry[]
): ExecutiveBrainForecastContext {
  try {
    if (!entries || entries.length === 0) {
      return buildEmptyExecutiveBrainForecastContext(orgSlug);
    }

    const highPriority = entries.filter((e) => e.priority === "HIGH");
    const signals  = entries.slice(0, 5).map((e) => e.title);
    const insights = highPriority.slice(0, 3).map((e) => e.description);

    const brainBoost = Math.min(
      0.12,
      (entries.length > 0    ? 0.04 : 0) +
      (highPriority.length > 0 ? 0.05 : 0) +
      Math.min(0.03, entries.length * 0.005)
    );

    return {
      orgSlug,
      signals,
      insights,
      brainBoost,
      hasBrainData: true,
    };
  } catch {
    return buildEmptyExecutiveBrainForecastContext(orgSlug);
  }
}

export function buildEmptyExecutiveBrainForecastContext(
  orgSlug: string
): ExecutiveBrainForecastContext {
  return {
    orgSlug,
    signals:      [],
    insights:     [],
    brainBoost:   0,
    hasBrainData: false,
  };
}

export function getBrainForecastSignals(
  ctx: ExecutiveBrainForecastContext,
  limit = 3
): string[] {
  return ctx.signals.slice(0, limit);
}
