// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 3: Trend Engine

import type {
  ForecastTrend,
  ForecastDomain,
  ForecastHorizon,
  ForecastTrendDirection,
} from "./strategic-forecasting-types";
import { generateForecastTrendId } from "./strategic-forecasting-identity";

export interface RawTrendSignal {
  readonly title:       string;
  readonly description: string;
  readonly domain:      ForecastDomain;
  readonly horizon:     ForecastHorizon;
  readonly direction:   ForecastTrendDirection;
  readonly strength:    number; // 0–1 raw
  readonly drivers?:    string[];
  readonly risks?:      string[];
  readonly evidenceIds?: string[];
  readonly isEmergent?: boolean;
  readonly metadata?:   Record<string, unknown>;
}

export function scoreTrend(
  strength: number,
  direction: ForecastTrendDirection,
  isEmergent: boolean
): number {
  try {
    const base = Math.max(0, Math.min(1, strength));
    const directionBoost =
      direction === "ACCELERATING" ? 0.10 :
      direction === "GROWING"      ? 0.05 :
      direction === "EMERGING"     ? 0.08 :
      direction === "REVERSING"    ? 0.04 :
      direction === "DECLINING"    ? -0.05 :
      0;
    const emergentBoost = isEmergent ? 0.05 : 0;
    return Math.max(0, Math.min(1, base + directionBoost + emergentBoost));
  } catch {
    return 0;
  }
}

export function buildTrend(
  orgSlug: string,
  signal: RawTrendSignal
): ForecastTrend {
  try {
    const strength = scoreTrend(
      signal.strength,
      signal.direction,
      signal.isEmergent ?? false
    );
    return {
      id:          generateForecastTrendId(),
      orgSlug,
      title:       signal.title,
      description: signal.description,
      domain:      signal.domain,
      direction:   signal.direction,
      strength,
      horizon:     signal.horizon,
      evidenceIds: signal.evidenceIds ?? [],
      drivers:     signal.drivers ?? [],
      risks:       signal.risks ?? [],
      isEmergent:  signal.isEmergent ?? false,
      createdAt:   new Date().toISOString(),
    };
  } catch {
    return buildEmptyTrend(orgSlug, signal.title ?? "Unknown Trend");
  }
}

export function identifyTrends(
  orgSlug: string,
  signals: RawTrendSignal[]
): ForecastTrend[] {
  try {
    return signals.map((s) => buildTrend(orgSlug, s));
  } catch {
    return [];
  }
}

export function rankTrends(trends: ForecastTrend[]): ForecastTrend[] {
  try {
    return [...trends].sort((a, b) => b.strength - a.strength);
  } catch {
    return trends;
  }
}

export function groupTrends(
  trends: ForecastTrend[]
): Record<ForecastDomain, ForecastTrend[]> {
  try {
    const grouped: Partial<Record<ForecastDomain, ForecastTrend[]>> = {};
    for (const trend of trends) {
      if (!grouped[trend.domain]) grouped[trend.domain] = [];
      grouped[trend.domain]!.push(trend);
    }
    return grouped as Record<ForecastDomain, ForecastTrend[]>;
  } catch {
    return {} as Record<ForecastDomain, ForecastTrend[]>;
  }
}

export function getEmergentTrends(trends: ForecastTrend[]): ForecastTrend[] {
  try {
    return trends.filter((t) => t.isEmergent);
  } catch {
    return [];
  }
}

export function getAcceleratingTrends(trends: ForecastTrend[]): ForecastTrend[] {
  try {
    return trends.filter((t) => t.direction === "ACCELERATING");
  } catch {
    return [];
  }
}

export function getTrendsByHorizon(
  trends: ForecastTrend[],
  horizon: ForecastHorizon
): ForecastTrend[] {
  try {
    return trends.filter((t) => t.horizon === horizon);
  } catch {
    return [];
  }
}

function buildEmptyTrend(orgSlug: string, title: string): ForecastTrend {
  return {
    id:          generateForecastTrendId(),
    orgSlug,
    title,
    description: "",
    domain:      "CROSS_DOMAIN",
    direction:   "STABLE",
    strength:    0,
    horizon:     "MEDIUM_TERM",
    evidenceIds: [],
    drivers:     [],
    risks:       [],
    isEmergent:  false,
    createdAt:   new Date().toISOString(),
  };
}
