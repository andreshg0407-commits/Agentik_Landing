// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 43: Future Signals Engine

import type {
  ForecastSignal,
  ForecastDomain,
  ForecastHorizon,
} from "./strategic-forecasting-types";
import { buildSignal } from "./signal-engine";

export interface FutureSignalInput {
  readonly title:        string;
  readonly description:  string;
  readonly domain:       ForecastDomain;
  readonly horizon:      ForecastHorizon;
  readonly rawScore:     number; // 0–1
  readonly evidenceIds?: string[];
  readonly metadata?:    Record<string, unknown>;
}

export function detectWeakSignals(
  orgSlug: string,
  inputs: FutureSignalInput[]
): ForecastSignal[] {
  try {
    return inputs
      .filter((i) => i.rawScore < 0.35)
      .map((i) =>
        buildSignal(orgSlug, {
          title:       i.title,
          description: i.description,
          domain:      i.domain,
          horizon:     i.horizon,
          type:        "WEAK_SIGNAL",
          intensity:   i.rawScore,
          evidenceIds: i.evidenceIds ?? [],
          isWeak:      true,
          isConfirmed: false,
          metadata:    i.metadata ?? {},
        })
      );
  } catch {
    return [];
  }
}

export function promoteWeakSignals(
  orgSlug: string,
  weakSignals: ForecastSignal[],
  confirmationThreshold = 0.50
): ForecastSignal[] {
  try {
    return weakSignals
      .filter((s) => s.intensity >= confirmationThreshold)
      .map((s) =>
        buildSignal(orgSlug, {
          title:       s.title,
          description: s.description,
          domain:      s.domain,
          horizon:     s.horizon,
          type:        "LEADING",
          intensity:   s.intensity,
          evidenceIds: s.evidenceIds,
          isWeak:      false,
          isConfirmed: false,
          metadata:    s.metadata,
        })
      );
  } catch {
    return [];
  }
}

export function scoreFutureSignals(signals: ForecastSignal[]): ForecastSignal[] {
  // Already scored by buildSignal — just return ranked
  try {
    return [...signals].sort((a, b) => b.intensity - a.intensity);
  } catch {
    return signals;
  }
}

export function detectEmergingPatterns(
  orgSlug: string,
  signals: ForecastSignal[]
): string[] {
  try {
    // Patterns: clusters of weak signals in the same domain suggest an emerging trend
    const domainCounts: Partial<Record<ForecastDomain, number>> = {};
    for (const s of signals) {
      if (s.isWeak) {
        domainCounts[s.domain] = (domainCounts[s.domain] ?? 0) + 1;
      }
    }
    return Object.entries(domainCounts)
      .filter(([, count]) => count >= 2)
      .map(([domain]) => `Patrón emergente en dominio: ${domain}`);
  } catch {
    return [];
  }
}

export function buildFutureSignalSummary(
  orgSlug: string,
  signals: ForecastSignal[]
): {
  total: number;
  weak: number;
  confirmed: number;
  leading: number;
  dominantDomain: ForecastDomain | null;
} {
  try {
    const weak      = signals.filter((s) => s.isWeak).length;
    const confirmed = signals.filter((s) => s.isConfirmed).length;
    const leading   = signals.filter((s) => s.type === "LEADING").length;

    const domainCounts: Partial<Record<ForecastDomain, number>> = {};
    for (const s of signals) {
      domainCounts[s.domain] = (domainCounts[s.domain] ?? 0) + 1;
    }
    const dominantDomain =
      (Object.entries(domainCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as ForecastDomain) ?? null;

    return { total: signals.length, weak, confirmed, leading, dominantDomain };
  } catch {
    return { total: 0, weak: 0, confirmed: 0, leading: 0, dominantDomain: null };
  }
}
