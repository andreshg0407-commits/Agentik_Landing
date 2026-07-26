/**
 * lib/comercial/tiendas/store-derrotero-priority-engine.ts
 *
 * AGENTIK-STORES-DERROTERO-COVERAGE-FOUNDATION-01 — CUARTO + SEXTO + SÉPTIMO
 *
 * Formal priority engine for warehouse coverage candidates.
 *
 * Priority order (CUARTO):
 *   1. Completely uncovered entry (coverageStatus === "UNCOVERED")
 *   2. Lowest coverage percentage of the store
 *   3. Largest shortage quantity
 *   4. Configured store priority (SÉPTIMO)
 *   5. Most absent variants
 *   6. Lowest current stock in store
 *   7. Rule 36 blocking (SEXTO)
 *   8. Stable tiebreak by storeId
 *
 * Pure function — no DB, no side effects. Suggestions only — no execution.
 */

import type {
  StoreDerroteroCoverageResult,
  StoreCoveragePriority,
  DerroteroCoverageGapSummary,
  MainWarehouseCoverageCandidate,
  StorePriorityConfig,
} from "./store-derrotero-types";
import type { GlobalLowStockConfig } from "./store-policy-pack-config";
import { CASTILLITOS_GLOBAL_LOW_STOCK } from "./store-policy-pack-config";

// ── Default store priority order (SÉPTIMO) ──────────────────────────────────

const DEFAULT_STORE_PRIORITY: StorePriorityConfig = {
  storePriorityOrder: ["centro", "caldas", "san_diego", "gran_plaza"],
};

// ── Priority config ─────────────────────────────────────────────────────────

export interface PriorityEngineConfig {
  storePriority: StorePriorityConfig;
  rule36: GlobalLowStockConfig;
}

const DEFAULT_CONFIG: PriorityEngineConfig = {
  storePriority: DEFAULT_STORE_PRIORITY,
  rule36: CASTILLITOS_GLOBAL_LOW_STOCK,
};

// ── Priority weights ────────────────────────────────────────────────────────
// Higher score = higher priority

const W = {
  UNCOVERED_ENTRY:       1000,   // completely uncovered gets max weight
  COVERAGE_PERCENT:        10,   // multiplied by (100 - coveragePercent)
  SHORTAGE:                 5,   // multiplied by shortage qty
  STORE_PRIORITY:          50,   // multiplied by (maxStores - storeRank)
  ABSENT_VARIANTS:          3,   // multiplied by absent variant count
  LOW_STORE_STOCK:          2,   // multiplied by (maxStock - currentStock)
} as const;

// ── Main prioritization function ────────────────────────────────────────────

/**
 * Prioritize warehouse coverage candidates across stores.
 *
 * For each candidate × store combination, computes a priority score
 * and returns a sorted list of StoreCoveragePriority entries.
 */
export function prioritizeWarehouseCoverageCandidates(
  coverages: StoreDerroteroCoverageResult[],
  gapSummaries: DerroteroCoverageGapSummary[],
  candidates: MainWarehouseCoverageCandidate[],
  config: PriorityEngineConfig = DEFAULT_CONFIG,
): StoreCoveragePriority[] {
  const priorities: StoreCoveragePriority[] = [];
  const storeOrder = config.storePriority.storePriorityOrder;
  const maxStoreRank = storeOrder.length;

  // Build coverage lookup by storeId
  const coverageByStore = new Map<string, StoreDerroteroCoverageResult>();
  for (const c of coverages) coverageByStore.set(c.storeId, c);

  // Build gap lookup by storeId
  const gapsByStore = new Map<string, DerroteroCoverageGapSummary>();
  for (const g of gapSummaries) gapsByStore.set(g.storeSlug, g);

  for (const candidate of candidates) {
    const allStores = [...candidate.coverableStores, ...candidate.rule36BlockedStores];

    for (const storeId of allStores) {
      const coverage = coverageByStore.get(storeId);
      if (!coverage) continue;

      const gaps = gapsByStore.get(storeId);
      const gap = gaps?.gaps.find(g =>
        g.entry.line === candidate.line &&
        isEntryMatch(candidate, g.entry.sagGrupo, g.entry.sagSubgrupo, g.entry.sizeClass),
      );

      const isBlocked = candidate.rule36BlockedStores.includes(storeId);
      const reasons: string[] = [];
      let score = 0;

      // 1. Completely uncovered entry
      if (gap && gap.currentRefCount === 0) {
        score += W.UNCOVERED_ENTRY;
        reasons.push("Punto de Derrotero completamente descubierto");
      }

      // 2. Lowest coverage percentage
      const coveragePct = coverage.overallCoveragePercent;
      score += W.COVERAGE_PERCENT * (100 - coveragePct);
      reasons.push(`Cobertura tienda: ${coveragePct}%`);

      // 3. Largest shortage
      const shortage = gap ? gap.refShortage : 0;
      score += W.SHORTAGE * shortage;
      if (shortage > 0) reasons.push(`Faltante: ${shortage} ref(s)`);

      // 4. Configured store priority
      const storeRank = storeOrder.indexOf(storeId);
      const priorityRank = storeRank >= 0 ? storeRank : maxStoreRank;
      score += W.STORE_PRIORITY * (maxStoreRank - priorityRank);
      if (storeRank >= 0) reasons.push(`Prioridad tienda: #${storeRank + 1}`);

      // 5. Absent variants (estimate from variant count)
      const absentVariants = candidate.totalVariantCount;
      score += W.ABSENT_VARIANTS * absentVariants;
      if (absentVariants > 0) reasons.push(`Variantes bodega: ${absentVariants}`);

      // 6. Lowest current stock
      const currentStock = gap ? gap.totalUnits : 0;
      const stockPenalty = Math.max(0, 100 - currentStock);
      score += W.LOW_STORE_STOCK * stockPenalty;
      if (currentStock === 0) reasons.push("Sin stock en tienda");

      // 7. Rule 36 blocking
      let blockedReason: string | null = null;
      if (isBlocked) {
        blockedReason = `Candidato compatible, no asignable por Regla 36 (stock bodega: ${candidate.mainWarehouseStock} <= ${config.rule36.threshold})`;
        reasons.push("Bloqueado por Regla 36");
        score = -1; // Push to bottom but keep visible
      }

      const coverageGapId = gap
        ? gap.coverageGapId
        : `${storeId}:${candidate.line}:${candidate.referenceCode}`;

      priorities.push({
        storeId,
        storeName: coverage.storeName,
        coverageGapId,
        priorityScore: score,
        priorityReasons: reasons,
        blocked: isBlocked,
        blockedReason,
      });
    }
  }

  // Sort by priority score descending, blocked last, tiebreak by storeId
  priorities.sort((a, b) => {
    if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
    if (a.priorityScore !== b.priorityScore) return b.priorityScore - a.priorityScore;
    return a.storeId.localeCompare(b.storeId);
  });

  return priorities;
}

// ── Entry matching helper ───────────────────────────────────────────────────

function isEntryMatch(
  candidate: MainWarehouseCoverageCandidate,
  sagGrupo: string | null,
  sagSubgrupo: string | string[] | null,
  sizeClass: string | null,
): boolean {
  switch (candidate.line) {
    case "CASTILLITOS":
      return candidate.group === sagGrupo &&
        (typeof sagSubgrupo === "string" ? candidate.subgroup === sagSubgrupo :
         Array.isArray(sagSubgrupo) ? sagSubgrupo.includes(candidate.subgroup) : false);
    case "LATIN_KIDS":
      return typeof sagSubgrupo === "string" ? candidate.subgroup === sagSubgrupo :
        Array.isArray(sagSubgrupo) ? sagSubgrupo.includes(candidate.subgroup) : false;
    case "ACCESSORIES":
      return candidate.sizeClass === sizeClass;
  }
}
