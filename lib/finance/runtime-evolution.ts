/**
 * lib/finance/runtime-evolution.ts
 *
 * FASE 5 — Runtime Evolution Engine
 *
 * Translates financial memory into an operational evolution state.
 * Produces Diego-ready language: deterministic, no chatbot framing.
 *
 * Rules:
 *   - INSUFFICIENT_HISTORY if memoryState != READY
 *   - Evolution state derived from the strongest trend direction
 *   - Volatile if most trends are VOLATILE
 *   - CRITICAL_ACCELERATION if any trend is CRITICAL_ACCELERATION
 *
 * Sprint: AGENTIK-FINANCIAL-TEMPORAL-INTELLIGENCE-01
 */

import { buildFinancialMemory }        from "./financial-memory";
import { findStrongestTrend }          from "./trend-engine";
import type { TemporalWindow }         from "./temporal-snapshots";
import type { FinancialMemory }        from "./financial-memory";
import type { FinancialTrend }         from "./trend-engine";
import type { FinancialTemporalPattern } from "./pattern-engine";

// ── Types ──────────────────────────────────────────────────────────────────────

export type FinancialEvolutionState =
  | "IMPROVING"
  | "STABLE"
  | "DEGRADING"
  | "VOLATILE"
  | "CRITICAL_ACCELERATION"
  | "INSUFFICIENT_HISTORY";

export interface FinancialRuntimeEvolution {
  organizationId:      string;
  window:              TemporalWindow;
  state:               FinancialEvolutionState;
  strongestTrend?:     FinancialTrend;
  mostRepeatedPattern?: FinancialTemporalPattern;
  summary:             string;
  confidence:          number;
  generatedAt:         Date;
}

// ── Metric labels for Diego language ──────────────────────────────────────────

const METRIC_LABEL: Record<string, string> = {
  graphIntegrityPct:    "Integridad de grafo",
  liquidityConfidence:  "Liquidez",
  reconciliationHealth: "Conciliación",
  unresolvedCount:      "Relaciones sin resolver",
  closeBlockers:        "Bloqueos de cierre",
  staleSources:         "Fuentes desactualizadas",
  criticalEventCount:   "Eventos críticos",
};

// ── Summary builder ────────────────────────────────────────────────────────────

function buildEvolutionSummary(
  state:   FinancialEvolutionState,
  trend?:  FinancialTrend,
  window?: TemporalWindow,
): string {
  if (state === "INSUFFICIENT_HISTORY") {
    return "Histórico insuficiente para tendencia financiera.";
  }

  if (!trend || !window) {
    if (state === "STABLE")  return `Estado financiero estable en ${window ?? "ventana"}.`;
    if (state === "VOLATILE") return `Volatilidad detectada en métricas financieras.`;
    return "Estado evolutivo sin tendencia dominante.";
  }

  const label    = METRIC_LABEL[trend.metric] ?? trend.metric;
  const delta    = Math.abs(trend.deltaPct);
  const deltaStr = delta > 0 ? ` ${delta > 0 ? "+" : ""}${trend.deltaPct}% en ${window}` : "";

  switch (state) {
    case "IMPROVING":
      return `${label} en mejora sostenida${deltaStr}.`;
    case "DEGRADING":
      return `${label} degradándose${deltaStr}.`;
    case "CRITICAL_ACCELERATION":
      return `${label} en aceleración crítica${deltaStr} · intervención requerida.`;
    case "VOLATILE":
      return `${label} con alta volatilidad en ${window}.`;
    case "STABLE":
    default:
      return `${label} estable en ${window}.`;
  }
}

// ── Derive evolution state from trend set ─────────────────────────────────────

function deriveEvolutionState(trends: FinancialTrend[]): FinancialEvolutionState {
  if (trends.length === 0) return "INSUFFICIENT_HISTORY";

  const directions = trends.map(t => t.direction);

  if (directions.includes("CRITICAL_ACCELERATION"))  return "CRITICAL_ACCELERATION";

  const volatile  = directions.filter(d => d === "VOLATILE").length;
  const degrading = directions.filter(d => d === "DEGRADING").length;
  const improving = directions.filter(d => d === "IMPROVING").length;
  const total     = directions.filter(d => d !== "INSUFFICIENT_HISTORY").length;

  if (total === 0) return "INSUFFICIENT_HISTORY";

  if (volatile / total > 0.4)                        return "VOLATILE";
  if (degrading > improving && degrading / total > 0.3) return "DEGRADING";
  if (improving > degrading && improving / total > 0.3) return "IMPROVING";
  return "STABLE";
}

// ── Main function ──────────────────────────────────────────────────────────────

export async function evaluateFinancialRuntimeEvolution(
  orgId:  string,
  window: TemporalWindow,
): Promise<FinancialRuntimeEvolution> {
  const generatedAt = new Date();
  const memory      = await buildFinancialMemory(orgId, window);

  // Insufficient or no data
  if (memory.memoryState !== "READY") {
    return {
      organizationId: orgId,
      window,
      state:          "INSUFFICIENT_HISTORY",
      summary:        "Histórico insuficiente para tendencia financiera.",
      confidence:     0,
      generatedAt,
    };
  }

  const state          = deriveEvolutionState(memory.trends);
  const strongestTrend = findStrongestTrend(memory.trends);
  const mostRepeated   = memory.recurringIssues[0]; // already sorted by frequency

  // Aggregate confidence: average of trend confidences
  const confValues = memory.trends.map(t => t.confidence).filter(c => c > 0);
  const confidence = confValues.length > 0
    ? confValues.reduce((s, c) => s + c, 0) / confValues.length
    : 0;

  const summary = buildEvolutionSummary(state, strongestTrend, window);

  return {
    organizationId:      orgId,
    window,
    state,
    strongestTrend,
    mostRepeatedPattern: mostRepeated,
    summary,
    confidence,
    generatedAt,
  };
}

// ── Re-export FinancialMemory for consumers that need it together ─────────────

export type { FinancialMemory };
