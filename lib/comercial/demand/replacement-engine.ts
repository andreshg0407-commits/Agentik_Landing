/**
 * lib/comercial/demand/replacement-engine.ts
 *
 * Replacement suggestion engine.
 *
 * When a ref is in stockout, finds alternative refs in the same subgrupo
 * that have available stock. NO AI, NO heuristics — uses subgrupoSag match only.
 *
 * Sprint: PEDIDOS-DEMANDA-PRODUCCION-01
 */

import type { DemandRefEntry } from "./demand-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SuggestedReplacement {
  stockoutRef:       string;
  stockoutName:      string;
  subgrupoSag:       string;

  replacementRef:    string;
  replacementName:   string;
  availableStock:    number;
  dailyVelocity:     number;
  coverageDays:      number | null;
}

export interface ReplacementSummary {
  computedAt:            string;
  stockoutsWithOptions:  number;
  stockoutsWithout:      number;
  suggestions:           SuggestedReplacement[];
}

// ─── Engine ───────────────────────────────────────────────────────────────────

/**
 * Find replacement suggestions for stockout refs.
 * Matches by subgrupoSag — same product category, different ref with stock.
 * Pure function.
 */
export function findReplacements(entries: DemandRefEntry[]): ReplacementSummary {
  // Build subgrupo → refs with stock index
  const stockBySubgrupo = new Map<string, DemandRefEntry[]>();
  for (const e of entries) {
    if (!e.subgrupoSag || e.currentStock <= 0) continue;
    const existing = stockBySubgrupo.get(e.subgrupoSag) ?? [];
    existing.push(e);
    stockBySubgrupo.set(e.subgrupoSag, existing);
  }

  // Find stockouts with demand
  const stockouts = entries.filter(e => e.currentStock <= 0 && e.dailyVelocity > 0 && e.subgrupoSag);

  const suggestions: SuggestedReplacement[] = [];
  let stockoutsWithOptions = 0;
  let stockoutsWithout = 0;

  for (const so of stockouts) {
    const alternatives = stockBySubgrupo.get(so.subgrupoSag!) ?? [];
    // Exclude self
    const valid = alternatives.filter(a => a.refCode !== so.refCode);

    if (valid.length === 0) {
      stockoutsWithout++;
      continue;
    }

    stockoutsWithOptions++;

    // Pick top 3 by available stock
    const sorted = valid.sort((a, b) => b.currentStock - a.currentStock).slice(0, 3);

    for (const alt of sorted) {
      suggestions.push({
        stockoutRef:    so.refCode,
        stockoutName:   so.productName,
        subgrupoSag:    so.subgrupoSag!,
        replacementRef: alt.refCode,
        replacementName: alt.productName,
        availableStock: alt.currentStock,
        dailyVelocity:  alt.dailyVelocity,
        coverageDays:   alt.coverageDays,
      });
    }
  }

  return {
    computedAt:           new Date().toISOString(),
    stockoutsWithOptions,
    stockoutsWithout,
    suggestions,
  };
}
