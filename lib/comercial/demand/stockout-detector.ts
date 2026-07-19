/**
 * lib/comercial/demand/stockout-detector.ts
 *
 * Stockout detection from demand snapshot.
 *
 * A stockout is a ref with:
 *   - currentStock <= 0
 *   - AND dailyVelocity > 0 (real demand exists)
 *
 * Severity is computed from demand velocity + order count + customer count.
 *
 * Sprint: PEDIDOS-DEMANDA-PRODUCCION-01
 */

import type { DemandRefEntry } from "./demand-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StockoutSeverity = "critical" | "high" | "medium" | "low";

export interface StockoutAlert {
  refCode:          string;
  productName:      string;
  subgrupoSag:      string | null;

  // Demand evidence
  dailyVelocity:    number;
  last30dOrdered:   number;
  last7dOrdered:    number;
  orderCount30d:    number;
  customerCount30d: number;

  // Stock state
  currentStock:     number;
  reservedStock:    number;

  // Impact
  severity:         StockoutSeverity;
  estimatedLostUnits: number;  // dailyVelocity * days since stockout (capped at 30)
  affectedCustomers:  number;
}

export interface StockoutSummary {
  computedAt:       string;
  totalStockouts:   number;
  critical:         number;
  high:             number;
  medium:           number;
  low:              number;
  totalLostUnits:   number;
  alerts:           StockoutAlert[];
}

// ─── Severity logic ───────────────────────────────────────────────────────────

function computeSeverity(entry: DemandRefEntry): StockoutSeverity {
  // Critical: high velocity + many customers
  if (entry.dailyVelocity >= 50 && entry.customerCount30d >= 5) return "critical";
  if (entry.dailyVelocity >= 20 || entry.customerCount30d >= 10) return "high";
  if (entry.dailyVelocity >= 5 || entry.orderCount30d >= 3) return "medium";
  return "low";
}

// ─── Detector ─────────────────────────────────────────────────────────────────

/**
 * Detect stockouts from demand entries.
 * Pure function — no Prisma, no side effects.
 */
export function detectStockouts(entries: DemandRefEntry[]): StockoutSummary {
  const alerts: StockoutAlert[] = [];

  for (const e of entries) {
    // Only flag stockouts where there IS real demand
    if (e.currentStock > 0 || e.dailyVelocity <= 0) continue;

    const severity = computeSeverity(e);
    // Estimate lost units: velocity * 7 days (conservative)
    const estimatedLostUnits = Math.round(e.dailyVelocity * 7);

    alerts.push({
      refCode:           e.refCode,
      productName:       e.productName,
      subgrupoSag:       e.subgrupoSag,
      dailyVelocity:     e.dailyVelocity,
      last30dOrdered:    e.last30dOrdered,
      last7dOrdered:     e.last7dOrdered,
      orderCount30d:     e.orderCount30d,
      customerCount30d:  e.customerCount30d,
      currentStock:      e.currentStock,
      reservedStock:     e.reservedStock,
      severity,
      estimatedLostUnits,
      affectedCustomers: e.customerCount30d,
    });
  }

  // Sort by severity then velocity
  const severityOrder: Record<StockoutSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.dailyVelocity - a.dailyVelocity);

  return {
    computedAt:     new Date().toISOString(),
    totalStockouts: alerts.length,
    critical:       alerts.filter(a => a.severity === "critical").length,
    high:           alerts.filter(a => a.severity === "high").length,
    medium:         alerts.filter(a => a.severity === "medium").length,
    low:            alerts.filter(a => a.severity === "low").length,
    totalLostUnits: alerts.reduce((a, s) => a + s.estimatedLostUnits, 0),
    alerts,
  };
}
