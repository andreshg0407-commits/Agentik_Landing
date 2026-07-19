/**
 * lib/finance/trend-engine.ts
 *
 * FASE 2 — Trend Engine
 *
 * Analyzes metric evolution across temporal snapshots.
 * Deterministic — no ML, no AI inference.
 * Minimum 3 snapshots required for a confident trend.
 *
 * Sprint: AGENTIK-FINANCIAL-TEMPORAL-INTELLIGENCE-01
 */

import type { TemporalFinancialSnapshot, TemporalWindow } from "./temporal-snapshots";

// ── Types ──────────────────────────────────────────────────────────────────────

export type TrendMetric =
  | "graphIntegrityPct"
  | "liquidityConfidence"
  | "reconciliationHealth"
  | "unresolvedCount"
  | "closeBlockers"
  | "staleSources"
  | "criticalEventCount";

export type TrendDirection =
  | "IMPROVING"
  | "STABLE"
  | "DEGRADING"
  | "VOLATILE"
  | "CRITICAL_ACCELERATION"
  | "INSUFFICIENT_HISTORY";

export interface FinancialTrend {
  metric:         TrendMetric;
  direction:      TrendDirection;
  /** Percentage change from first to last observed value */
  deltaPct:       number;
  currentValue:   number;
  previousValue:  number;
  /** 0–1: higher when more snapshots and less volatility */
  confidence:     number;
  window:         TemporalWindow;
}

// ── Direction for count metrics (higher = worse) vs ratio metrics (higher = better) ──

/** Metrics where a higher value is WORSE (counts of problems) */
const INVERSE_METRICS = new Set<TrendMetric>([
  "unresolvedCount",
  "closeBlockers",
  "staleSources",
  "criticalEventCount",
]);

// ── Trend analysis per metric ──────────────────────────────────────────────────

function extractValues(
  snapshots: TemporalFinancialSnapshot[],
  metric:    TrendMetric,
): number[] {
  return snapshots.map(s => s[metric]);
}

function computeDeltaPct(from: number, to: number): number {
  if (from === 0) return to === 0 ? 0 : 100;
  return Math.round(((to - from) / Math.abs(from)) * 100);
}

/**
 * Counts direction changes (reversals) in the value sequence.
 * Used to detect volatility.
 */
function countReversals(values: number[]): number {
  let reversals = 0;
  for (let i = 2; i < values.length; i++) {
    const prev  = values[i - 1] - values[i - 2];
    const curr  = values[i]     - values[i - 1];
    if ((prev > 0 && curr < 0) || (prev < 0 && curr > 0)) reversals++;
  }
  return reversals;
}

function analyzeMetricTrend(
  snapshots: TemporalFinancialSnapshot[],
  metric:    TrendMetric,
  window:    TemporalWindow,
): FinancialTrend {
  const values = extractValues(snapshots, metric);
  const n      = values.length;

  // Not enough data
  if (n < 3) {
    const current  = values[n - 1] ?? 0;
    const previous = values[n - 2] ?? current;
    return {
      metric,
      direction:     "INSUFFICIENT_HISTORY",
      deltaPct:      0,
      currentValue:  current,
      previousValue: previous,
      confidence:    0,
      window,
    };
  }

  const first   = values[0];
  const last    = values[n - 1];
  const prev    = values[n - 2];
  const deltaPct = computeDeltaPct(first, last);

  // Reversals determine volatility
  const reversals = countReversals(values);
  const reversalRate = reversals / (n - 2); // reversals per possible reversal

  // Confidence: more snapshots + less volatility = higher confidence
  const confidence = Math.min(1, (n / 10) * (1 - reversalRate * 0.5));

  // Critical acceleration: for count metrics, rapid increase in last interval
  const lastDelta = computeDeltaPct(prev, last);
  const isInverse = INVERSE_METRICS.has(metric);

  if (isInverse && lastDelta > 50 && last > 0) {
    return { metric, direction: "CRITICAL_ACCELERATION", deltaPct, currentValue: last, previousValue: prev, confidence, window };
  }

  // Volatile: many reversals
  if (reversalRate > 0.4) {
    return { metric, direction: "VOLATILE", deltaPct, currentValue: last, previousValue: prev, confidence, window };
  }

  // Determine direction based on overall delta
  // For inverse metrics: positive delta = degrading; for ratio metrics: positive = improving
  const STABLE_THRESHOLD = 5; // within ±5% = stable
  const direction: TrendDirection =
    Math.abs(deltaPct) <= STABLE_THRESHOLD ? "STABLE" :
    isInverse
      ? (deltaPct > 0 ? "DEGRADING" : "IMPROVING")
      : (deltaPct > 0 ? "IMPROVING" : "DEGRADING");

  return {
    metric,
    direction,
    deltaPct,
    currentValue:  last,
    previousValue: prev,
    confidence,
    window,
  };
}

// ── Main function ──────────────────────────────────────────────────────────────

const ALL_METRICS: TrendMetric[] = [
  "graphIntegrityPct",
  "liquidityConfidence",
  "reconciliationHealth",
  "unresolvedCount",
  "closeBlockers",
  "staleSources",
  "criticalEventCount",
];

export function analyzeFinancialTrends(
  snapshots: TemporalFinancialSnapshot[],
  window:    TemporalWindow,
): FinancialTrend[] {
  return ALL_METRICS.map(metric => analyzeMetricTrend(snapshots, metric, window));
}

// ── Convenience: strongest trend (highest absolute deltaPct, non-stable, non-insufficient) ──

export function findStrongestTrend(trends: FinancialTrend[]): FinancialTrend | undefined {
  return trends
    .filter(t => t.direction !== "STABLE" && t.direction !== "INSUFFICIENT_HISTORY")
    .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))[0];
}
