// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 29: Query Layer

import type {
  StrategicForecast,
  ForecastStatus,
  ForecastHorizon,
  ForecastDomain,
  ForecastConfidenceLevel,
} from "./strategic-forecasting-types";

export interface ForecastStats {
  readonly orgSlug:           string;
  readonly totalForecasts:    number;
  readonly avgForecastScore:  number;
  readonly activeCount:       number;
  readonly latestHorizon:     ForecastHorizon | null;
  readonly topDomain:         ForecastDomain | null;
  readonly avgConfidenceScore: number;
}

export function getForecasts(
  orgSlug: string,
  forecasts: StrategicForecast[]
): StrategicForecast[] {
  try {
    return forecasts.filter((f) => f.orgSlug === orgSlug);
  } catch {
    return [];
  }
}

export function getForecast(
  orgSlug: string,
  forecasts: StrategicForecast[],
  id: string
): StrategicForecast | null {
  try {
    return forecasts.find((f) => f.orgSlug === orgSlug && f.id === id) ?? null;
  } catch {
    return null;
  }
}

export function getLatestForecast(
  orgSlug: string,
  forecasts: StrategicForecast[]
): StrategicForecast | null {
  try {
    const scoped = getForecasts(orgSlug, forecasts);
    if (scoped.length === 0) return null;
    return [...scoped].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0] ?? null;
  } catch {
    return null;
  }
}

export function getForecastsByStatus(
  orgSlug: string,
  forecasts: StrategicForecast[],
  status: ForecastStatus
): StrategicForecast[] {
  try {
    return getForecasts(orgSlug, forecasts).filter((f) => f.status === status);
  } catch {
    return [];
  }
}

export function getForecastsByHorizon(
  orgSlug: string,
  forecasts: StrategicForecast[],
  horizon: ForecastHorizon
): StrategicForecast[] {
  try {
    return getForecasts(orgSlug, forecasts).filter((f) => f.horizon === horizon);
  } catch {
    return [];
  }
}

export function sortForecastsByScore(
  forecasts: StrategicForecast[]
): StrategicForecast[] {
  try {
    return [...forecasts].sort((a, b) => b.forecastScore - a.forecastScore);
  } catch {
    return forecasts;
  }
}

export function getForecastStats(
  orgSlug: string,
  forecasts: StrategicForecast[]
): ForecastStats {
  try {
    const scoped = getForecasts(orgSlug, forecasts);
    if (scoped.length === 0) {
      return buildEmptyForecastStats(orgSlug);
    }

    const avgForecastScore =
      scoped.reduce((s, f) => s + f.forecastScore, 0) / scoped.length;

    const avgConfidenceScore =
      scoped.reduce((s, f) => s + f.confidence.score, 0) / scoped.length;

    const activeCount = scoped.filter((f) => f.status === "ACTIVE").length;

    const latest = getLatestForecast(orgSlug, forecasts);

    // Find most common domain
    const domainCounts: Partial<Record<ForecastDomain, number>> = {};
    for (const f of scoped) {
      domainCounts[f.domain] = (domainCounts[f.domain] ?? 0) + 1;
    }
    const topDomain = (Object.entries(domainCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as ForecastDomain) ?? null;

    return {
      orgSlug,
      totalForecasts:    scoped.length,
      avgForecastScore,
      activeCount,
      latestHorizon:     latest?.horizon ?? null,
      topDomain,
      avgConfidenceScore,
    };
  } catch {
    return buildEmptyForecastStats(orgSlug);
  }
}

export function filterForecastsByConfidence(
  forecasts: StrategicForecast[],
  level: ForecastConfidenceLevel
): StrategicForecast[] {
  try {
    return forecasts.filter((f) => f.confidence.level === level);
  } catch {
    return [];
  }
}

function buildEmptyForecastStats(orgSlug: string): ForecastStats {
  return {
    orgSlug,
    totalForecasts:    0,
    avgForecastScore:  0,
    activeCount:       0,
    latestHorizon:     null,
    topDomain:         null,
    avgConfidenceScore: 0,
  };
}
