/**
 * lib/comercial/maletas/maletas-deadstock.ts
 *
 * Dead stock detection for commercial cases.
 * Identifies references that occupy commercial space without contributing to sales.
 *
 * These signals feed into:
 *   - Comercial (remove from maleta)
 *   - Producción (stop producing)
 *   - Compras (stop ordering raw materials)
 *   - Bodegas (free physical space)
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-INTELLIGENCE-01
 */

import type {
  DeadStockSignal,
  DeadStockReason,
  DeadStockDisposal,
  CoverageSignal,
  RefVelocity,
} from "./maletas-intelligence-types";
import type { CaseItem } from "./maletas-types";

// ─── Thresholds ────────────────────────────────────────────────────────────────

const DEAD_COVERAGE_EXCESS_DAYS = 90;   // > 90d coverage at current velocity → excess
const DEAD_NO_SALE_DAYS         = 30;   // no sale in 30d → dead signal
const DEAD_HIGH_STOCK_THRESHOLD = 10;   // disponible > 10 AND no velocity → suspicious

// ─── Main function ─────────────────────────────────────────────────────────────

/**
 * Detect dead stock references from items + velocity + coverage data.
 */
export function detectDeadStock(
  items: CaseItem[],
  velocityMap: Map<string, RefVelocity>,
  coverageSignals: CoverageSignal[],
  today: Date = new Date(),
): DeadStockSignal[] {
  const coverageByRef = new Map<string, CoverageSignal>();
  for (const cs of coverageSignals) {
    coverageByRef.set(cs.refCode.toUpperCase(), cs);
  }

  const signals: DeadStockSignal[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const key = item.reference.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const velocity = velocityMap.get(key);
    const coverage = coverageByRef.get(key);

    const result = evaluateDeadStock(item, velocity ?? null, coverage ?? null, today);
    if (result) {
      signals.push(result);
    }
  }

  // Sort by commercial risk desc
  return signals.sort((a, b) => b.commercialRisk - a.commercialRisk);
}

// ─── Evaluation logic ─────────────────────────────────────────────────────────

function evaluateDeadStock(
  item: CaseItem,
  velocity: RefVelocity | null,
  coverage: CoverageSignal | null,
  today: Date,
): DeadStockSignal | null {
  // Skip if no stock — not a dead stock issue
  if (item.currentUnits <= 0) return null;

  const dailyVelocity = velocity?.dailyVelocity ?? null;
  const units30d = velocity?.units30d ?? null;

  let reason: DeadStockReason | null = null;
  let disposalSuggestion: DeadStockDisposal = "revisar";
  let lastSaleDate: string | null = null;
  let daysSinceLastSale: number | null = null;
  let commercialRisk = 0;

  // Case 1: Has velocity data, no sales in 30d, has stock
  if (units30d !== null && units30d === 0 && item.currentUnits > 0) {
    reason = "sin_ventas_30d";
    commercialRisk = 70 + Math.min(30, item.currentUnits / 2);
    disposalSuggestion = item.currentUnits > 20 ? "reubicar" : "revisar";
  }

  // Case 2: Coverage way above threshold (excess stock vs known velocity)
  const coverageDaysValue = coverage?.coverageDays ?? null;
  if (
    reason === null &&
    coverage !== null &&
    coverageDaysValue !== null &&
    coverageDaysValue > DEAD_COVERAGE_EXCESS_DAYS
  ) {
    reason = "cobertura_excesiva";
    commercialRisk = Math.min(
      90,
      40 + Math.round((coverageDaysValue - DEAD_COVERAGE_EXCESS_DAYS) / 10),
    );
    disposalSuggestion = coverageDaysValue > 180 ? "reubicar" : "revisar";
  }

  // Case 3: No SAG velocity data + high disponible
  if (
    reason === null &&
    dailyVelocity === null &&
    item.currentUnits > DEAD_HIGH_STOCK_THRESHOLD
  ) {
    reason = "sin_rotacion_conocida";
    // Lower risk since we just don't have data yet
    commercialRisk = 30 + Math.min(20, item.currentUnits / 5);
    disposalSuggestion = "revisar";
  }

  if (reason === null) return null;

  // Determine disposal more precisely
  if (velocity?.classification === "muerta") {
    disposalSuggestion = "descontinuar";
    commercialRisk = Math.min(100, commercialRisk + 15);
  }

  return {
    refCode: item.reference,
    description: item.description,
    line: item.line,
    disponible: item.currentUnits,
    lastSaleDate,
    daysSinceLastSale,
    assignedSalesRepIds: item.assignedToSalesReps,
    reason,
    disposalSuggestion,
    commercialRisk: Math.round(Math.min(100, Math.max(0, commercialRisk))),
  };
}

// ─── Aggregated dead stock analysis ───────────────────────────────────────────

export type DeadStockSummary = {
  total: number;
  byReason: Record<DeadStockReason, number>;
  byDisposal: Record<DeadStockDisposal, number>;
  highRisk: number; // commercialRisk >= 70
  totalDisponibleLocked: number; // sum of disponible across all dead refs
};

export function summarizeDeadStock(signals: DeadStockSignal[]): DeadStockSummary {
  const byReason: Record<DeadStockReason, number> = {
    sin_ventas_30d: 0,
    cobertura_excesiva: 0,
    sin_rotacion_conocida: 0,
    linea_discontinuada: 0,
  };
  const byDisposal: Record<DeadStockDisposal, number> = {
    revisar: 0,
    reubicar: 0,
    descontinuar: 0,
  };

  let totalDisponibleLocked = 0;
  let highRisk = 0;

  for (const s of signals) {
    byReason[s.reason]++;
    byDisposal[s.disposalSuggestion]++;
    totalDisponibleLocked += s.disponible;
    if (s.commercialRisk >= 70) highRisk++;
  }

  return {
    total: signals.length,
    byReason,
    byDisposal,
    highRisk,
    totalDisponibleLocked,
  };
}
