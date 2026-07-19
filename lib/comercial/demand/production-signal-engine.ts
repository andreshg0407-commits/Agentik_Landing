/**
 * lib/comercial/demand/production-signal-engine.ts
 *
 * Production signal generator from demand snapshot.
 *
 * Generates production signals when:
 *   - Stock is depleted but demand exists (stockout)
 *   - Coverage is below threshold (rupture imminent / low coverage)
 *   - Demand velocity is accelerating (7d > 30d daily avg)
 *
 * NO inferred production. Signals are evidence-based recommendations.
 *
 * Sprint: PEDIDOS-DEMANDA-PRODUCCION-01
 */

import type { DemandRefEntry } from "./demand-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProductionUrgency = "urgente" | "alta" | "media" | "baja";

export type ProductionReason =
  | "sin_stock_con_demanda"       // stock=0, velocity>0
  | "ruptura_inminente"           // coverage < 7d
  | "cobertura_baja"              // coverage < 15d
  | "aceleracion_demanda"         // 7d velocity > 30d velocity
  | "pedidos_sin_inventario";     // orders exist, no matching inventory

export interface ProductionSignal {
  refCode:          string;
  productName:      string;
  subgrupoSag:      string | null;

  urgency:          ProductionUrgency;
  reason:           ProductionReason;

  // Evidence
  dailyVelocity:    number;
  last30dOrdered:   number;
  last7dOrdered:    number;
  currentStock:     number;
  coverageDays:     number | null;

  // Suggested production quantity (based on 30d demand coverage target)
  suggestedQty:     number;
}

export interface ProductionSignalSummary {
  computedAt:       string;
  totalSignals:     number;
  urgente:          number;
  alta:             number;
  media:            number;
  baja:             number;
  totalSuggestedQty: number;
  signals:          ProductionSignal[];
}

// ─── Signal generator ─────────────────────────────────────────────────────────

function generateSignal(entry: DemandRefEntry): ProductionSignal | null {
  // No demand = no production signal
  if (entry.dailyVelocity <= 0) return null;

  let reason: ProductionReason;
  let urgency: ProductionUrgency;

  if (entry.currentStock <= 0) {
    reason = "sin_stock_con_demanda";
    urgency = "urgente";
  } else if (entry.coverageStatus === "ruptura_inminente") {
    reason = "ruptura_inminente";
    urgency = "alta";
  } else if (entry.coverageStatus === "cobertura_baja") {
    reason = "cobertura_baja";
    urgency = "media";
  } else {
    // Check acceleration: 7d velocity > 30d velocity by 50%+
    const velocity7d = entry.last7dOrdered / 7;
    const velocity30d = entry.dailyVelocity;
    if (velocity30d > 0 && velocity7d > velocity30d * 1.5) {
      reason = "aceleracion_demanda";
      urgency = "media";
    } else {
      return null; // No signal needed
    }
  }

  // Target: 30 days of coverage from current stock
  const targetStock = Math.ceil(entry.dailyVelocity * 30);
  const suggestedQty = Math.max(0, targetStock - entry.currentStock);

  return {
    refCode:       entry.refCode,
    productName:   entry.productName,
    subgrupoSag:   entry.subgrupoSag,
    urgency,
    reason,
    dailyVelocity: entry.dailyVelocity,
    last30dOrdered: entry.last30dOrdered,
    last7dOrdered:  entry.last7dOrdered,
    currentStock:   entry.currentStock,
    coverageDays:   entry.coverageDays,
    suggestedQty,
  };
}

/**
 * Generate production signals from demand entries.
 * Pure function — no Prisma.
 */
export function generateProductionSignals(entries: DemandRefEntry[]): ProductionSignalSummary {
  const signals: ProductionSignal[] = [];

  for (const entry of entries) {
    const signal = generateSignal(entry);
    if (signal) signals.push(signal);
  }

  const urgencyOrder: Record<ProductionUrgency, number> = { urgente: 0, alta: 1, media: 2, baja: 3 };
  signals.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency] || b.dailyVelocity - a.dailyVelocity);

  return {
    computedAt:        new Date().toISOString(),
    totalSignals:      signals.length,
    urgente:           signals.filter(s => s.urgency === "urgente").length,
    alta:              signals.filter(s => s.urgency === "alta").length,
    media:             signals.filter(s => s.urgency === "media").length,
    baja:              signals.filter(s => s.urgency === "baja").length,
    totalSuggestedQty: signals.reduce((a, s) => a + s.suggestedQty, 0),
    signals,
  };
}
