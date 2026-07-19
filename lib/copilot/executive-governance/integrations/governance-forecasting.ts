// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 24: Forecasting Integration

export interface GovernanceForecastContext {
  readonly orgSlug:          string;
  readonly forecastHints:    string[];
  readonly forecastBoost:    number; // 0–1
  readonly hasForecast:      boolean;
}

export interface ForecastItem {
  readonly title:       string;
  readonly confidence?: number;
  readonly horizon?:    string;
}

export function buildGovernanceForecastContext(
  orgSlug: string,
  forecasts?: ForecastItem[]
): GovernanceForecastContext {
  try {
    const active = (forecasts ?? []).filter((f) => f.title && f.title.length > 0);
    const hints  = active.slice(0, 5).map((f) => f.title);
    const boost  = Math.min(0.08, hints.length * 0.015);
    return {
      orgSlug,
      forecastHints: hints,
      forecastBoost: boost,
      hasForecast:   hints.length > 0,
    };
  } catch {
    return { orgSlug, forecastHints: [], forecastBoost: 0, hasForecast: false };
  }
}
