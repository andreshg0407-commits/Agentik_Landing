// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 6: Forecast Risk Engine

import type {
  ForecastRisk,
  ForecastDomain,
  ForecastHorizon,
} from "./strategic-forecasting-types";
import { generateForecastRiskId } from "./strategic-forecasting-identity";

export interface RawForecastRiskSignal {
  readonly title:        string;
  readonly description:  string;
  readonly domain:       ForecastDomain;
  readonly horizon:      ForecastHorizon;
  readonly likelihood:   number; // 0–1
  readonly impact:       number; // 0–1
  readonly mitigations?: string[];
  readonly evidenceIds?: string[];
  readonly isSystemic?:  boolean;
  readonly metadata?:    Record<string, unknown>;
}

export function scoreForecastRisk(
  likelihood: number,
  impact: number
): number {
  try {
    const l = Math.max(0, Math.min(1, likelihood));
    const i = Math.max(0, Math.min(1, impact));
    // Geometric-weighted composite
    return Math.min(1, Math.sqrt(l * i) * 0.6 + (l * i) * 0.4);
  } catch {
    return 0;
  }
}

export function buildForecastRisk(
  orgSlug: string,
  signal: RawForecastRiskSignal
): ForecastRisk {
  try {
    const likelihood    = Math.max(0, Math.min(1, signal.likelihood));
    const impact        = Math.max(0, Math.min(1, signal.impact));
    const compositeRisk = scoreForecastRisk(likelihood, impact);
    return {
      id:           generateForecastRiskId(),
      orgSlug,
      title:        signal.title,
      description:  signal.description,
      domain:       signal.domain,
      likelihood,
      impact,
      compositeRisk,
      horizon:      signal.horizon,
      mitigations:  signal.mitigations ?? [],
      evidenceIds:  signal.evidenceIds ?? [],
      isSystemic:   signal.isSystemic ?? false,
      createdAt:    new Date().toISOString(),
    };
  } catch {
    return buildEmptyForecastRisk(orgSlug, signal.title ?? "Unknown Risk");
  }
}

export function identifyForecastRisks(
  orgSlug: string,
  signals: RawForecastRiskSignal[]
): ForecastRisk[] {
  try {
    return signals.map((s) => buildForecastRisk(orgSlug, s));
  } catch {
    return [];
  }
}

export function rankForecastRisks(risks: ForecastRisk[]): ForecastRisk[] {
  try {
    return [...risks].sort((a, b) => b.compositeRisk - a.compositeRisk);
  } catch {
    return risks;
  }
}

export function getSystemicForecastRisks(risks: ForecastRisk[]): ForecastRisk[] {
  try {
    return risks.filter((r) => r.isSystemic);
  } catch {
    return [];
  }
}

export function getCriticalForecastRisks(risks: ForecastRisk[]): ForecastRisk[] {
  try {
    return risks.filter((r) => r.compositeRisk >= 0.7);
  } catch {
    return [];
  }
}

export function getForecastRisksByHorizon(
  risks: ForecastRisk[],
  horizon: ForecastHorizon
): ForecastRisk[] {
  try {
    return risks.filter((r) => r.horizon === horizon);
  } catch {
    return [];
  }
}

export function getForecastRisksByDomain(
  risks: ForecastRisk[],
  domain: ForecastDomain
): ForecastRisk[] {
  try {
    return risks.filter((r) => r.domain === domain);
  } catch {
    return [];
  }
}

function buildEmptyForecastRisk(orgSlug: string, title: string): ForecastRisk {
  return {
    id:           generateForecastRiskId(),
    orgSlug,
    title,
    description:  "",
    domain:       "CROSS_DOMAIN",
    likelihood:   0,
    impact:       0,
    compositeRisk: 0,
    horizon:      "MEDIUM_TERM",
    mitigations:  [],
    evidenceIds:  [],
    isSystemic:   false,
    createdAt:    new Date().toISOString(),
  };
}
