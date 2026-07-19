// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 18: Advisor Integration

export interface AdvisorForecastContext {
  readonly orgSlug:          string;
  readonly advisorySignals:  string[];
  readonly criticalFlags:    string[];
  readonly advisorBoost:     number; // 0–0.10
  readonly hasAdvisorData:   boolean;
  readonly criticalRecCount: number;
}

export interface AdvisorForecastEntry {
  readonly title:      string;
  readonly isCritical: boolean;
  readonly domain:     string;
  readonly confidence: number; // 0–1
}

export function buildAdvisorForecastContext(
  orgSlug: string,
  entries: AdvisorForecastEntry[]
): AdvisorForecastContext {
  try {
    if (!entries || entries.length === 0) {
      return buildEmptyAdvisorForecastContext(orgSlug);
    }

    const critical = entries.filter((e) => e.isCritical);
    const advisorySignals = entries.slice(0, 5).map((e) => e.title);
    const criticalFlags   = critical.slice(0, 3).map((e) => e.title);

    const advisorBoost = Math.min(
      0.10,
      (entries.length > 0  ? 0.03 : 0) +
      (critical.length > 0 ? 0.04 : 0) +
      Math.min(0.03, entries.length * 0.005)
    );

    return {
      orgSlug,
      advisorySignals,
      criticalFlags,
      advisorBoost,
      hasAdvisorData: true,
      criticalRecCount: critical.length,
    };
  } catch {
    return buildEmptyAdvisorForecastContext(orgSlug);
  }
}

export function buildEmptyAdvisorForecastContext(
  orgSlug: string
): AdvisorForecastContext {
  return {
    orgSlug,
    advisorySignals:  [],
    criticalFlags:    [],
    advisorBoost:     0,
    hasAdvisorData:   false,
    criticalRecCount: 0,
  };
}

export function getAdvisorCriticalFlags(
  ctx: AdvisorForecastContext,
  limit = 3
): string[] {
  return ctx.criticalFlags.slice(0, limit);
}
