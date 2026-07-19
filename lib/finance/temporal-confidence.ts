/**
 * lib/finance/temporal-confidence.ts
 *
 * FASE 8 — Temporal Confidence Evaluator
 *
 * Evaluates whether financial confidence is improving, collapsing,
 * recurring low, or stable based on FinancialMemory.
 *
 * Deterministic. No AI. Reads trends + patterns from memory.
 *
 * Sprint: AGENTIK-FINANCIAL-TEMPORAL-INTELLIGENCE-01
 */

import type { FinancialMemory } from "./financial-memory";
import type { FinancialTrend }  from "./trend-engine";

// ── Types ──────────────────────────────────────────────────────────────────────

export type TemporalConfidenceState =
  | "CONFIDENCE_RECOVERING"
  | "CONFIDENCE_STABLE"
  | "CONFIDENCE_COLLAPSING"
  | "CONFIDENCE_LOW_RECURRING"
  | "INSUFFICIENT_HISTORY";

export interface TemporalConfidenceResult {
  state:            TemporalConfidenceState;
  liquidityTrend?:  FinancialTrend;
  integrityTrend?:  FinancialTrend;
  isRecurringLow:   boolean;
  summary:          string;
}

// ── Summary builder ────────────────────────────────────────────────────────────

function buildConfidenceSummary(
  state:           TemporalConfidenceState,
  liquidityTrend?: FinancialTrend,
): string {
  switch (state) {
    case "CONFIDENCE_RECOVERING": {
      const pct = liquidityTrend ? `+${Math.abs(liquidityTrend.deltaPct)}%` : "";
      return `Confianza financiera en recuperación${pct ? ` (${pct})` : ""}.`;
    }
    case "CONFIDENCE_COLLAPSING": {
      const pct = liquidityTrend ? `${liquidityTrend.deltaPct}%` : "";
      return `Confianza financiera en colapso${pct ? ` (${pct})` : ""} · acción requerida.`;
    }
    case "CONFIDENCE_LOW_RECURRING":
      return "Confianza baja recurrente detectada · patrón persistente.";
    case "CONFIDENCE_STABLE":
      return "Confianza financiera estable.";
    case "INSUFFICIENT_HISTORY":
    default:
      return "Histórico insuficiente para evaluar trayectoria de confianza.";
  }
}

// ── Main function ──────────────────────────────────────────────────────────────

export function evaluateTemporalConfidence(
  memory: FinancialMemory,
): TemporalConfidenceResult {
  // No data or insufficient history
  if (memory.memoryState !== "READY") {
    return {
      state:          "INSUFFICIENT_HISTORY",
      isRecurringLow: false,
      summary:        buildConfidenceSummary("INSUFFICIENT_HISTORY"),
    };
  }

  const liquidityTrend = memory.trends.find(t => t.metric === "liquidityConfidence");
  const integrityTrend = memory.trends.find(t => t.metric === "graphIntegrityPct");

  // Recurring low confidence: detected in pattern engine
  const hasRecurringLow = memory.recurringIssues.some(
    p => p.type === "recurring_low_confidence"
  );

  if (hasRecurringLow) {
    return {
      state:           "CONFIDENCE_LOW_RECURRING",
      liquidityTrend,
      integrityTrend,
      isRecurringLow:  true,
      summary:         buildConfidenceSummary("CONFIDENCE_LOW_RECURRING"),
    };
  }

  // Derive from liquidity confidence trend
  if (liquidityTrend) {
    if (liquidityTrend.direction === "IMPROVING" || liquidityTrend.direction === "STABLE" && liquidityTrend.currentValue >= 0.6) {
      if (liquidityTrend.direction === "IMPROVING") {
        return {
          state:          "CONFIDENCE_RECOVERING",
          liquidityTrend,
          integrityTrend,
          isRecurringLow: false,
          summary:        buildConfidenceSummary("CONFIDENCE_RECOVERING", liquidityTrend),
        };
      }
    }

    if (
      liquidityTrend.direction === "DEGRADING" ||
      liquidityTrend.direction === "CRITICAL_ACCELERATION"
    ) {
      return {
        state:          "CONFIDENCE_COLLAPSING",
        liquidityTrend,
        integrityTrend,
        isRecurringLow: false,
        summary:        buildConfidenceSummary("CONFIDENCE_COLLAPSING", liquidityTrend),
      };
    }
  }

  // Stable by default
  return {
    state:          "CONFIDENCE_STABLE",
    liquidityTrend,
    integrityTrend,
    isRecurringLow: false,
    summary:        buildConfidenceSummary("CONFIDENCE_STABLE"),
  };
}
