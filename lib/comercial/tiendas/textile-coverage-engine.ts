/**
 * lib/comercial/tiendas/textile-coverage-engine.ts
 *
 * Textile size+color coverage engine for Tiendas.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Core principle:
 *   A textile subgroup is NOT covered just because it has inventory.
 *   It must have balanced coverage of SIZE+COLOR COMBINATIONS.
 *
 *   The customer buys: talla 4, color azul.
 *   NOT "subgrupo pijama larga nino."
 *
 * Coverage formula (TIENDAS-TEXTILE-COVERAGE-REAL-01):
 *   overallCoveragePercent = coveredCombinations / expectedCombinations * 100
 *
 *   Expected combinations come from MAIN WAREHOUSE (what's available to send).
 *   Covered combinations come from STORE INVENTORY (what the store has).
 *   Missing = expected - covered.
 *
 * Severity thresholds:
 *   < 50%  → critica
 *   50-70% → alta
 *   70-85% → media
 *   85-95% → baja
 *   >= 95% → saludable
 *
 * Sprint: TIENDAS-TEXTILE-SIZE-COLOR-COVERAGE-01
 * Sprint: TIENDAS-TEXTILE-COVERAGE-REAL-01
 */

import type {
  StoreInventoryVariant,
  MainWarehouseAvailability,
} from "./store-replenishment-types";
import type {
  TextileCoverageAnalysis,
  TextileCoverageGap,
  TextileCoverageCandidate,
  TextileCoverageGapSeverity,
} from "./assortment-types";
import { buildTextileCoverageKey } from "./assortment-types";
import { inferProductClass } from "./active-inventory";

// ── Size/color normalization ────────────────────────────────────────────────

function normalizeSize(s: string): string {
  return (s || "").trim().toUpperCase();
}

function normalizeColor(c: string): string {
  return (c || "").trim().toUpperCase();
}

// ── Severity derivation ─────────────────────────────────────────────────────

export function deriveCoverageSeverity(percent: number): TextileCoverageGapSeverity {
  if (percent < 50) return "critica";
  if (percent < 70) return "alta";
  if (percent < 85) return "media";
  if (percent < 95) return "baja";
  return "saludable";
}

// ── Catalog resolution from MAIN WAREHOUSE ──────────────────────────────────

/**
 * Determine the expected sizes, colors, and SIZE+COLOR COMBINATIONS for a subgroup
 * based on MAIN WAREHOUSE availability (what can actually be sent to stores).
 *
 * Changed from allInventory to mainStock in TIENDAS-TEXTILE-COVERAGE-REAL-01:
 *   Expected = what the main warehouse has available to ship.
 *   If main warehouse has no stock for a combo, the store can't get it anyway.
 */
function resolveSubgroupCatalogFromMainWarehouse(
  subgroup: string,
  line: string | undefined,
  mainStock: MainWarehouseAvailability[],
  allInventory: StoreInventoryVariant[],
): { sizes: string[]; colors: string[]; combinations: Set<string> } {
  // Build a set of referenceCode that belong to this subgroup+line
  const subgroupRefs = new Set<string>();
  for (const v of allInventory) {
    if (inferProductClass(v) !== "textile") continue;
    const sg = v.category || v.line;
    if (sg !== subgroup) continue;
    if (line && v.line !== line) continue;
    subgroupRefs.add(v.referenceCode);
  }

  const sizes = new Set<string>();
  const colors = new Set<string>();
  const combinations = new Set<string>();

  for (const m of mainStock) {
    if (!subgroupRefs.has(m.referenceCode)) continue;
    const net = Math.max(0, m.availableUnits - m.reservedUnits);
    if (net <= 0) continue;

    const sz = normalizeSize(m.size);
    const cl = normalizeColor(m.color);
    if (!sz || !cl) continue;
    if (sz === "SIN_TALLA" || cl === "SIN_COLOR") continue;

    sizes.add(sz);
    colors.add(cl);
    combinations.add(`${sz}|${cl}`);
  }

  return {
    sizes: [...sizes].sort(),
    colors: [...colors].sort(),
    combinations,
  };
}

// ── Size coverage ───────────────────────────────────────────────────────────

export function computeSizeCoverage(
  storeInventory: StoreInventoryVariant[],
  subgroup: string,
  line: string | undefined,
  expectedSizes: string[],
): { covered: string[]; missing: string[]; percent: number } {
  if (expectedSizes.length === 0) return { covered: [], missing: [], percent: 100 };

  const storeSizes = new Set<string>();
  for (const v of storeInventory) {
    if (inferProductClass(v) !== "textile") continue;
    const sg = v.category || v.line;
    if (sg !== subgroup) continue;
    if (line && v.line !== line) continue;
    if (v.currentUnits <= 0) continue;
    const sz = normalizeSize(v.size);
    if (sz) storeSizes.add(sz);
  }

  const covered = expectedSizes.filter(s => storeSizes.has(s));
  const missing = expectedSizes.filter(s => !storeSizes.has(s));
  const percent = Math.round((covered.length / expectedSizes.length) * 100);

  return { covered, missing, percent };
}

// ── Color coverage ──────────────────────────────────────────────────────────

export function computeColorCoverage(
  storeInventory: StoreInventoryVariant[],
  subgroup: string,
  line: string | undefined,
  expectedColors: string[],
): { covered: string[]; missing: string[]; percent: number } {
  if (expectedColors.length === 0) return { covered: [], missing: [], percent: 100 };

  const storeColors = new Set<string>();
  for (const v of storeInventory) {
    if (inferProductClass(v) !== "textile") continue;
    const sg = v.category || v.line;
    if (sg !== subgroup) continue;
    if (line && v.line !== line) continue;
    if (v.currentUnits <= 0) continue;
    const cl = normalizeColor(v.color);
    if (cl) storeColors.add(cl);
  }

  const covered = expectedColors.filter(c => storeColors.has(c));
  const missing = expectedColors.filter(c => !storeColors.has(c));
  const percent = Math.round((covered.length / expectedColors.length) * 100);

  return { covered, missing, percent };
}

// ── Combination-based coverage ──────────────────────────────────────────────

/**
 * Compute combination-based coverage: which size+color combos does the store
 * have vs what the main warehouse can supply?
 */
function computeCombinationCoverage(
  storeInventory: StoreInventoryVariant[],
  subgroup: string,
  line: string | undefined,
  expectedCombinations: Set<string>,
): { covered: Set<string>; missing: Set<string>; percent: number } {
  if (expectedCombinations.size === 0) {
    return { covered: new Set(), missing: new Set(), percent: 100 };
  }

  // What combos does the store have with active stock?
  const storeCombos = new Set<string>();
  for (const v of storeInventory) {
    if (inferProductClass(v) !== "textile") continue;
    const sg = v.category || v.line;
    if (sg !== subgroup) continue;
    if (line && v.line !== line) continue;
    if (v.currentUnits <= 0) continue;
    const sz = normalizeSize(v.size);
    const cl = normalizeColor(v.color);
    if (sz && cl) storeCombos.add(`${sz}|${cl}`);
  }

  const covered = new Set<string>();
  const missing = new Set<string>();

  for (const combo of expectedCombinations) {
    if (storeCombos.has(combo)) {
      covered.add(combo);
    } else {
      missing.add(combo);
    }
  }

  const percent = Math.round((covered.size / expectedCombinations.size) * 100);
  return { covered, missing, percent };
}

// ── Gap detection (combination-based) ───────────────────────────────────────

/**
 * Detect specific size+color gaps for a subgroup.
 *
 * A gap exists when the main warehouse has a size+color combination
 * available but the store has zero active units for it.
 *
 * Severity per gap:
 *   - "critica" if store has 0 units for this combo
 *   - severity inherited from overall subgroup coverage otherwise
 */
function detectGaps(
  storeId: string,
  storeInventory: StoreInventoryVariant[],
  subgroup: string,
  line: string | undefined,
  missingCombinations: Set<string>,
  mainStock: MainWarehouseAvailability[],
  allInventory: StoreInventoryVariant[],
  overallSeverity: TextileCoverageGapSeverity,
): TextileCoverageGap[] {
  const gaps: TextileCoverageGap[] = [];

  for (const combo of missingCombinations) {
    const [sz, cl] = combo.split("|");

    const candidates = findGapCandidates(subgroup, line, sz, cl, mainStock, allInventory);

    gaps.push({
      subgroup,
      line: line ?? "",
      size: sz,
      color: cl,
      currentQty: 0,
      idealQty: 1,
      severity: "critica", // Missing combo = critica per-gap
      candidates,
    });
  }

  // Sort by size then color for readability
  return gaps.sort((a, b) => a.size.localeCompare(b.size) || a.color.localeCompare(b.color));
}

// ── Candidate search with priority ──────────────────────────────────────────

/**
 * Find candidates from main warehouse for a specific gap.
 *
 * Priority:
 *   1. Same subgroup + same size + same color (exact match)
 *   2. Same subgroup + same size (any color)
 *   3. Same subgroup (any size/color)
 */
function findGapCandidates(
  subgroup: string,
  line: string | undefined,
  targetSize: string,
  targetColor: string,
  mainStock: MainWarehouseAvailability[],
  allInventory: StoreInventoryVariant[],
): TextileCoverageCandidate[] {
  // Build ref info lookup for matching subgroup
  const refInfo = new Map<string, { productName: string; subgroup: string; line: string }>();
  for (const v of allInventory) {
    if (inferProductClass(v) !== "textile") continue;
    const sg = v.category || v.line;
    if (sg !== subgroup) continue;
    if (line && v.line !== line) continue;
    if (!refInfo.has(v.referenceCode)) {
      refInfo.set(v.referenceCode, { productName: v.productName, subgroup: sg, line: v.line });
    }
  }

  const candidates: TextileCoverageCandidate[] = [];

  for (const m of mainStock) {
    const info = refInfo.get(m.referenceCode);
    if (!info) continue;
    const net = Math.max(0, m.availableUnits - m.reservedUnits);
    if (net <= 0) continue;

    const mSize = normalizeSize(m.size);
    const mColor = normalizeColor(m.color);

    let matchLevel: TextileCoverageCandidate["matchLevel"];
    let reason: string;

    if (mSize === targetSize && mColor === targetColor) {
      matchLevel = "exact";
      reason = `Talla ${m.size} color ${m.color} — coincidencia exacta`;
    } else if (mSize === targetSize) {
      matchLevel = "same_size";
      reason = `Talla ${m.size} color ${m.color} — misma talla, color alternativo`;
    } else {
      matchLevel = "same_subgroup";
      reason = `Talla ${m.size} color ${m.color} — mismo subgrupo`;
    }

    candidates.push({
      referenceCode: m.referenceCode,
      productName: info.productName,
      size: m.size,
      color: m.color,
      availableMainWarehouseQty: net,
      matchLevel,
      reason,
    });
  }

  // Sort by match priority: exact > same_size > same_subgroup, then by qty desc
  const MATCH_ORDER: Record<TextileCoverageCandidate["matchLevel"], number> = {
    exact: 0, same_size: 1, same_subgroup: 2,
  };
  return candidates
    .sort((a, b) => MATCH_ORDER[a.matchLevel] - MATCH_ORDER[b.matchLevel] || b.availableMainWarehouseQty - a.availableMainWarehouseQty)
    .slice(0, 5);
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Compute textile size/color coverage for all textile subgroups in a store.
 *
 * Only runs when the store has rules (RULELESS-MODE-01 guard).
 * Only called from store detail (not dashboard) for performance (FASE 14).
 *
 * Returns one TextileCoverageAnalysis per subgroup.
 *
 * Coverage model (TIENDAS-TEXTILE-COVERAGE-REAL-01):
 *   Expected combinations = size+color combos available in main warehouse for this subgroup
 *   Covered combinations = size+color combos with active stock in this store
 *   Missing = expected - covered
 *   overallCoveragePercent = coveredCombinations / expectedCombinations * 100
 */
export function computeTextileCoverage(
  storeId: string,
  storeInventory: StoreInventoryVariant[],
  mainStock: MainWarehouseAvailability[],
  allInventory: StoreInventoryVariant[],
  hasRules: boolean,
): TextileCoverageAnalysis[] {
  // RULELESS-MODE guard — no operational intelligence without rules
  if (!hasRules) return [];

  // Discover textile subgroups in this store's inventory
  const subgroupSet = new Map<string, string | undefined>(); // subgroup → line
  for (const v of storeInventory) {
    if (inferProductClass(v) !== "textile") continue;
    const sg = v.category || v.line;
    if (!sg) continue;
    if (!subgroupSet.has(sg)) {
      subgroupSet.set(sg, v.line || undefined);
    }
  }

  const analyses: TextileCoverageAnalysis[] = [];

  for (const [subgroup, line] of subgroupSet) {
    // Resolve catalog from MAIN WAREHOUSE (what's available to ship)
    const catalog = resolveSubgroupCatalogFromMainWarehouse(subgroup, line, mainStock, allInventory);
    if (catalog.combinations.size === 0) continue;

    // Compute size and color coverage (kept for backward compat + detail views)
    const sizeCov = computeSizeCoverage(storeInventory, subgroup, line, catalog.sizes);
    const colorCov = computeColorCoverage(storeInventory, subgroup, line, catalog.colors);

    // Compute combination-based coverage (primary metric)
    const comboCov = computeCombinationCoverage(storeInventory, subgroup, line, catalog.combinations);

    // Overall = combination-based coverage (not average of size+color)
    const overall = comboCov.percent;
    const severity = deriveCoverageSeverity(overall);

    // Detect specific gaps for missing combinations
    const gaps = comboCov.missing.size > 0
      ? detectGaps(storeId, storeInventory, subgroup, line, comboCov.missing, mainStock, allInventory, severity)
      : [];

    analyses.push({
      storeId,
      line: line ?? "",
      subgroup,
      expectedSizes: catalog.sizes,
      expectedColors: catalog.colors,
      coveredSizes: sizeCov.covered,
      coveredColors: colorCov.covered,
      missingSizes: sizeCov.missing,
      missingColors: colorCov.missing,
      sizeCoveragePercent: sizeCov.percent,
      colorCoveragePercent: colorCov.percent,
      overallCoveragePercent: overall,
      severity,
      gaps,
      // Combination-based fields (TIENDAS-TEXTILE-COVERAGE-REAL-01)
      expectedCombinations: catalog.combinations.size,
      coveredCombinations: comboCov.covered.size,
      missingCombinations: comboCov.missing.size,
      combinationCoveragePercent: comboCov.percent,
    });
  }

  // Sort by severity (worst first)
  const SEV_ORDER: Record<TextileCoverageGapSeverity, number> = {
    critica: 0, alta: 1, media: 2, baja: 3, saludable: 4,
  };
  return analyses.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
}

/**
 * Compute aggregate textile coverage KPI for a store.
 *
 * Returns:
 *   overallPercent — combination-based coverage across all subgroups
 *   sizeCoveragePercent — average size coverage
 *   colorCoveragePercent — average color coverage
 *   gapCount — total number of size+color gaps
 *   expectedCombinations — total expected combos
 *   coveredCombinations — total covered combos
 *
 * Returns null if no textile inventory exists or store has no rules.
 */
export function computeTextileCoverageKpi(
  analyses: TextileCoverageAnalysis[],
): {
  overallPercent: number;
  sizeCoveragePercent: number;
  colorCoveragePercent: number;
  gapCount: number;
  expectedCombinations: number;
  coveredCombinations: number;
} | null {
  if (analyses.length === 0) return null;

  let sizeSum = 0;
  let colorSum = 0;
  let gapCount = 0;
  let totalExpected = 0;
  let totalCovered = 0;

  for (const a of analyses) {
    sizeSum += a.sizeCoveragePercent;
    colorSum += a.colorCoveragePercent;
    gapCount += a.gaps.length;
    totalExpected += a.expectedCombinations;
    totalCovered += a.coveredCombinations;
  }

  const sizePct = Math.round(sizeSum / analyses.length);
  const colorPct = Math.round(colorSum / analyses.length);
  const overall = totalExpected > 0 ? Math.round((totalCovered / totalExpected) * 100) : 100;

  return {
    overallPercent: overall,
    sizeCoveragePercent: sizePct,
    colorCoveragePercent: colorPct,
    gapCount,
    expectedCombinations: totalExpected,
    coveredCombinations: totalCovered,
  };
}
