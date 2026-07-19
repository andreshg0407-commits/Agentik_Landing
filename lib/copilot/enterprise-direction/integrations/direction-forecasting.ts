// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 26: Forecasting Integration

export interface DirectionForecastContext {
  readonly orgSlug:         string;
  readonly forecastScore:   number; // 0–1
  readonly forecastBoost:   number; // 0–0.10
  readonly hasForecastData: boolean;
}

export function buildDirectionForecastContext(
  orgSlug: string,
  forecasts: Array<{ score?: number; confidence?: string }> = []
): DirectionForecastContext {
  try {
    if (forecasts.length === 0) {
      return { orgSlug, forecastScore: 0, forecastBoost: 0, hasForecastData: false };
    }
    const avgScore    = forecasts.reduce((s, f) => s + (f.score ?? 0.5), 0) / forecasts.length;
    const forecastBoost = Math.min(0.10, forecasts.length * 0.02);
    return {
      orgSlug,
      forecastScore:   Math.min(1, avgScore),
      forecastBoost,
      hasForecastData: true,
    };
  } catch {
    return { orgSlug, forecastScore: 0, forecastBoost: 0, hasForecastData: false };
  }
}
