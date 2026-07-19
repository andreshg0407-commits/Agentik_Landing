// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 7: Forecast Opportunity Engine

import type {
  ForecastOpportunity,
  ForecastDomain,
  ForecastHorizon,
} from "./strategic-forecasting-types";
import { generateForecastOpportunityId } from "./strategic-forecasting-identity";

export interface RawForecastOpportunitySignal {
  readonly title:          string;
  readonly description:    string;
  readonly domain:         ForecastDomain;
  readonly horizon:        ForecastHorizon;
  readonly magnitude:      number; // 0–1
  readonly captureScore:   number; // 0–1 (readiness to capture)
  readonly timeHorizon:    number; // 0–1 (urgency: higher = sooner)
  readonly requirements?:  string[];
  readonly evidenceIds?:   string[];
  readonly isTransformational?: boolean;
  readonly metadata?:      Record<string, unknown>;
}

export function scoreForecastOpportunity(
  magnitude: number,
  captureScore: number,
  timeHorizon: number
): number {
  try {
    const m = Math.max(0, Math.min(1, magnitude));
    const c = Math.max(0, Math.min(1, captureScore));
    const h = Math.max(0, Math.min(1, timeHorizon));
    return Math.min(1, m * 0.40 + c * 0.40 + h * 0.20);
  } catch {
    return 0;
  }
}

export function buildForecastOpportunity(
  orgSlug: string,
  signal: RawForecastOpportunitySignal
): ForecastOpportunity {
  try {
    const magnitude    = Math.max(0, Math.min(1, signal.magnitude));
    const captureScore = Math.max(0, Math.min(1, signal.captureScore));
    return {
      id:                  generateForecastOpportunityId(),
      orgSlug,
      title:               signal.title,
      description:         signal.description,
      domain:              signal.domain,
      magnitude,
      captureScore,
      horizon:             signal.horizon,
      requirements:        signal.requirements ?? [],
      evidenceIds:         signal.evidenceIds ?? [],
      isTransformational:  signal.isTransformational ?? magnitude >= 0.8,
      createdAt:           new Date().toISOString(),
    };
  } catch {
    return buildEmptyForecastOpportunity(orgSlug, signal.title ?? "Unknown Opportunity");
  }
}

export function identifyForecastOpportunities(
  orgSlug: string,
  signals: RawForecastOpportunitySignal[]
): ForecastOpportunity[] {
  try {
    return signals.map((s) => buildForecastOpportunity(orgSlug, s));
  } catch {
    return [];
  }
}

export function rankForecastOpportunities(
  opportunities: ForecastOpportunity[]
): ForecastOpportunity[] {
  try {
    return [...opportunities].sort((a, b) => {
      const scoreA = a.magnitude * 0.5 + a.captureScore * 0.5;
      const scoreB = b.magnitude * 0.5 + b.captureScore * 0.5;
      return scoreB - scoreA;
    });
  } catch {
    return opportunities;
  }
}

export function getTransformationalForecastOpportunities(
  opportunities: ForecastOpportunity[]
): ForecastOpportunity[] {
  try {
    return opportunities.filter((o) => o.isTransformational);
  } catch {
    return [];
  }
}

export function getForecastOpportunitiesByHorizon(
  opportunities: ForecastOpportunity[],
  horizon: ForecastHorizon
): ForecastOpportunity[] {
  try {
    return opportunities.filter((o) => o.horizon === horizon);
  } catch {
    return [];
  }
}

export function getForecastOpportunitiesByDomain(
  opportunities: ForecastOpportunity[],
  domain: ForecastDomain
): ForecastOpportunity[] {
  try {
    return opportunities.filter((o) => o.domain === domain);
  } catch {
    return [];
  }
}

function buildEmptyForecastOpportunity(orgSlug: string, title: string): ForecastOpportunity {
  return {
    id:                 generateForecastOpportunityId(),
    orgSlug,
    title,
    description:        "",
    domain:             "CROSS_DOMAIN",
    magnitude:          0,
    captureScore:       0,
    horizon:            "MEDIUM_TERM",
    requirements:       [],
    evidenceIds:        [],
    isTransformational: false,
    createdAt:          new Date().toISOString(),
  };
}
