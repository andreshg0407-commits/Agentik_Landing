// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 33: Dashboard Contract
// NOT server-only — pure domain types for client consumption

import type {
  StrategicForecast,
  ForecastHealth,
  ForecastConfidenceLevel,
  ForecastHorizon,
  ForecastDomain,
} from "./strategic-forecasting-types";

export interface StrategicForecastingDashboard {
  readonly orgSlug:              string;
  readonly forecastHealth:       ForecastHealth;
  readonly totalForecasts:       number;
  readonly avgForecastScore:     number;
  readonly avgConfidenceScore:   number;
  readonly activeForecasts:      number;
  readonly topConfidenceLevel:   ForecastConfidenceLevel | null;
  readonly dominantHorizon:      ForecastHorizon | null;
  readonly dominantDomain:       ForecastDomain | null;
  readonly latestForecastScore:  number | null;
  readonly totalScenarios:       number;
  readonly totalRisks:           number;
  readonly totalOpportunities:   number;
  readonly criticalRiskCount:    number;
  readonly transformationalOppCount: number;
}

export function buildStrategicForecastingDashboard(
  orgSlug: string,
  forecasts: StrategicForecast[]
): StrategicForecastingDashboard {
  try {
    const scoped = forecasts.filter((f) => f.orgSlug === orgSlug);

    if (scoped.length === 0) {
      return buildEmptyForecastingDashboard(orgSlug);
    }

    const active     = scoped.filter((f) => f.status === "ACTIVE");
    const avgForecastScore  = scoped.reduce((s, f) => s + f.forecastScore, 0) / scoped.length;
    const avgConfidenceScore = scoped.reduce((s, f) => s + f.confidence.score, 0) / scoped.length;

    const sorted = [...scoped].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const latest = sorted[0];

    const forecastHealth: ForecastHealth =
      scoped.length === 0             ? "EMPTY"    :
      avgConfidenceScore >= 0.70       ? "HEALTHY"  :
      avgConfidenceScore >= 0.45       ? "DEGRADED" :
      "CRITICAL";

    // Dominant horizon
    const horizonCounts: Partial<Record<ForecastHorizon, number>> = {};
    for (const f of scoped) horizonCounts[f.horizon] = (horizonCounts[f.horizon] ?? 0) + 1;
    const dominantHorizon = (Object.entries(horizonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as ForecastHorizon) ?? null;

    // Dominant domain
    const domainCounts: Partial<Record<ForecastDomain, number>> = {};
    for (const f of scoped) domainCounts[f.domain] = (domainCounts[f.domain] ?? 0) + 1;
    const dominantDomain = (Object.entries(domainCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as ForecastDomain) ?? null;

    // Aggregate report stats
    let totalScenarios = 0, totalRisks = 0, totalOpportunities = 0,
        criticalRiskCount = 0, transformationalOppCount = 0;

    for (const f of scoped) {
      totalScenarios       += f.report.scenarios.length;
      totalRisks           += f.report.risks.length;
      totalOpportunities   += f.report.opportunities.length;
      criticalRiskCount    += f.report.risks.filter((r) => r.compositeRisk >= 0.7).length;
      transformationalOppCount += f.report.opportunities.filter((o) => o.isTransformational).length;
    }

    // Top confidence level
    const confCounts: Partial<Record<ForecastConfidenceLevel, number>> = {};
    for (const f of scoped) confCounts[f.confidence.level] = (confCounts[f.confidence.level] ?? 0) + 1;
    const topConfidenceLevel = (Object.entries(confCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as ForecastConfidenceLevel) ?? null;

    return {
      orgSlug,
      forecastHealth,
      totalForecasts:       scoped.length,
      avgForecastScore,
      avgConfidenceScore,
      activeForecasts:      active.length,
      topConfidenceLevel,
      dominantHorizon,
      dominantDomain,
      latestForecastScore:  latest?.forecastScore ?? null,
      totalScenarios,
      totalRisks,
      totalOpportunities,
      criticalRiskCount,
      transformationalOppCount,
    };
  } catch {
    return buildEmptyForecastingDashboard(orgSlug);
  }
}

function buildEmptyForecastingDashboard(
  orgSlug: string
): StrategicForecastingDashboard {
  return {
    orgSlug,
    forecastHealth:            "EMPTY",
    totalForecasts:            0,
    avgForecastScore:          0,
    avgConfidenceScore:        0,
    activeForecasts:           0,
    topConfidenceLevel:        null,
    dominantHorizon:           null,
    dominantDomain:            null,
    latestForecastScore:       null,
    totalScenarios:            0,
    totalRisks:                0,
    totalOpportunities:        0,
    criticalRiskCount:         0,
    transformationalOppCount:  0,
  };
}
