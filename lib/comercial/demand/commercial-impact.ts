/**
 * lib/comercial/demand/commercial-impact.ts
 *
 * Commercial impact analysis from demand + stockout data.
 *
 * Answers: "how much revenue/coverage is at risk from stockouts?"
 * Uses real order data to estimate commercial impact.
 *
 * Sprint: PEDIDOS-DEMANDA-PRODUCCION-01
 */

import type { DemandRefEntry } from "./demand-engine";
import type { StockoutAlert } from "./stockout-detector";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CommercialImpactEntry {
  refCode:          string;
  productName:      string;
  subgrupoSag:      string | null;

  // Impact metrics
  estimatedLostUnitsPerWeek: number;
  affectedCustomers:         number;
  affectedOrders:            number;

  // Context
  coverageStatus:            string;
  dailyVelocity:             number;
  currentStock:              number;
}

export interface SubgrupoImpact {
  subgrupoSag:        string;
  refsAffected:       number;
  totalLostUnitsWeek: number;
  totalCustomers:     number;
}

export interface CommercialImpactSummary {
  computedAt:             string;

  // Global impact
  totalRefsAtRisk:        number;
  totalLostUnitsPerWeek:  number;
  totalAffectedCustomers: number;

  // By ref
  byRef:                  CommercialImpactEntry[];

  // By subgrupo
  bySubgrupo:             SubgrupoImpact[];
}

// ─── Impact engine ────────────────────────────────────────────────────────────

/**
 * Compute commercial impact from demand entries.
 * Considers refs where stock is insufficient for current demand.
 * Pure function.
 */
export function computeCommercialImpact(entries: DemandRefEntry[]): CommercialImpactSummary {
  const impactEntries: CommercialImpactEntry[] = [];

  for (const e of entries) {
    // Only include refs with demand AND insufficient stock
    if (e.dailyVelocity <= 0) continue;
    if (e.coverageStatus !== "sin_stock" && e.coverageStatus !== "ruptura_inminente") continue;

    const lostPerWeek = e.coverageStatus === "sin_stock"
      ? Math.round(e.dailyVelocity * 7)
      : Math.round(Math.max(0, (e.dailyVelocity * 7) - e.currentStock));

    if (lostPerWeek <= 0) continue;

    impactEntries.push({
      refCode:                    e.refCode,
      productName:                e.productName,
      subgrupoSag:                e.subgrupoSag,
      estimatedLostUnitsPerWeek:  lostPerWeek,
      affectedCustomers:          e.customerCount30d,
      affectedOrders:             e.orderCount30d,
      coverageStatus:             e.coverageStatus,
      dailyVelocity:              e.dailyVelocity,
      currentStock:               e.currentStock,
    });
  }

  impactEntries.sort((a, b) => b.estimatedLostUnitsPerWeek - a.estimatedLostUnitsPerWeek);

  // Aggregate by subgrupo
  const subMap = new Map<string, SubgrupoImpact>();
  for (const entry of impactEntries) {
    const sg = entry.subgrupoSag ?? "SIN SUBGRUPO";
    const existing = subMap.get(sg) ?? {
      subgrupoSag: sg,
      refsAffected: 0,
      totalLostUnitsWeek: 0,
      totalCustomers: 0,
    };
    existing.refsAffected++;
    existing.totalLostUnitsWeek += entry.estimatedLostUnitsPerWeek;
    existing.totalCustomers += entry.affectedCustomers;
    subMap.set(sg, existing);
  }

  const bySubgrupo = [...subMap.values()].sort((a, b) => b.totalLostUnitsWeek - a.totalLostUnitsWeek);

  const uniqueCustomers = new Set<number>();
  for (const e of impactEntries) uniqueCustomers.add(e.affectedCustomers);

  return {
    computedAt:             new Date().toISOString(),
    totalRefsAtRisk:        impactEntries.length,
    totalLostUnitsPerWeek:  impactEntries.reduce((a, e) => a + e.estimatedLostUnitsPerWeek, 0),
    totalAffectedCustomers: impactEntries.reduce((a, e) => a + e.affectedCustomers, 0),
    byRef:                  impactEntries,
    bySubgrupo,
  };
}
