// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 4: Signal Engine

import type {
  ForecastSignal,
  ForecastSignalType,
  ForecastDomain,
  ForecastHorizon,
} from "./strategic-forecasting-types";
import { generateForecastSignalId } from "./strategic-forecasting-identity";

export interface RawSignalInput {
  readonly title:        string;
  readonly description:  string;
  readonly domain:       ForecastDomain;
  readonly horizon:      ForecastHorizon;
  readonly type:         ForecastSignalType;
  readonly intensity:    number; // 0–1 raw
  readonly evidenceIds?: string[];
  readonly isWeak?:      boolean;
  readonly isConfirmed?: boolean;
  readonly metadata?:    Record<string, unknown>;
}

export function scoreSignal(
  intensity: number,
  type: ForecastSignalType,
  isConfirmed: boolean
): number {
  try {
    const base = Math.max(0, Math.min(1, intensity));
    const typeBoost =
      type === "LEADING"    ? 0.08 :
      type === "CONFIRMED"  ? 0.10 :
      type === "COINCIDENT" ? 0.04 :
      type === "LAGGING"    ? 0.02 :
      0; // WEAK_SIGNAL
    const confirmedBoost = isConfirmed ? 0.07 : 0;
    return Math.max(0, Math.min(1, base + typeBoost + confirmedBoost));
  } catch {
    return 0;
  }
}

export function classifySignal(
  intensity: number,
  evidenceCount: number
): ForecastSignalType {
  try {
    if (evidenceCount < 2 || intensity < 0.3) return "WEAK_SIGNAL";
    if (evidenceCount >= 4 && intensity >= 0.7) return "CONFIRMED";
    if (intensity >= 0.6) return "LEADING";
    if (intensity >= 0.4) return "COINCIDENT";
    return "LAGGING";
  } catch {
    return "WEAK_SIGNAL";
  }
}

export function buildSignal(
  orgSlug: string,
  input: RawSignalInput
): ForecastSignal {
  try {
    const intensity = scoreSignal(
      input.intensity,
      input.type,
      input.isConfirmed ?? false
    );
    return {
      id:          generateForecastSignalId(),
      orgSlug,
      title:       input.title,
      description: input.description,
      domain:      input.domain,
      type:        input.type,
      intensity,
      horizon:     input.horizon,
      evidenceIds: input.evidenceIds ?? [],
      isWeak:      input.isWeak ?? intensity < 0.35,
      isConfirmed: input.isConfirmed ?? false,
      metadata:    input.metadata ?? {},
      createdAt:   new Date().toISOString(),
    };
  } catch {
    return buildEmptySignal(orgSlug, input.title ?? "Unknown Signal");
  }
}

export function detectSignals(
  orgSlug: string,
  inputs: RawSignalInput[]
): ForecastSignal[] {
  try {
    return inputs.map((i) => buildSignal(orgSlug, i));
  } catch {
    return [];
  }
}

export function rankSignals(signals: ForecastSignal[]): ForecastSignal[] {
  try {
    return [...signals].sort((a, b) => b.intensity - a.intensity);
  } catch {
    return signals;
  }
}

export function getWeakSignals(signals: ForecastSignal[]): ForecastSignal[] {
  try {
    return signals.filter((s) => s.isWeak);
  } catch {
    return [];
  }
}

export function getConfirmedSignals(signals: ForecastSignal[]): ForecastSignal[] {
  try {
    return signals.filter((s) => s.isConfirmed);
  } catch {
    return [];
  }
}

export function getLeadingSignals(signals: ForecastSignal[]): ForecastSignal[] {
  try {
    return signals.filter((s) => s.type === "LEADING");
  } catch {
    return [];
  }
}

export function groupSignalsByDomain(
  signals: ForecastSignal[]
): Record<ForecastDomain, ForecastSignal[]> {
  try {
    const grouped: Partial<Record<ForecastDomain, ForecastSignal[]>> = {};
    for (const s of signals) {
      if (!grouped[s.domain]) grouped[s.domain] = [];
      grouped[s.domain]!.push(s);
    }
    return grouped as Record<ForecastDomain, ForecastSignal[]>;
  } catch {
    return {} as Record<ForecastDomain, ForecastSignal[]>;
  }
}

function buildEmptySignal(orgSlug: string, title: string): ForecastSignal {
  return {
    id:          generateForecastSignalId(),
    orgSlug,
    title,
    description: "",
    domain:      "CROSS_DOMAIN",
    type:        "WEAK_SIGNAL",
    intensity:   0,
    horizon:     "MEDIUM_TERM",
    evidenceIds: [],
    isWeak:      true,
    isConfirmed: false,
    metadata:    {},
    createdAt:   new Date().toISOString(),
  };
}
