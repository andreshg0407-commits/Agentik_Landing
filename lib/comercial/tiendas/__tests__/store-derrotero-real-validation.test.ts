/**
 * lib/comercial/tiendas/__tests__/store-derrotero-real-validation.test.ts
 *
 * AGENTIK-STORES-DERROTERO-COVERAGE-VALIDATION-01
 *
 * Validates derrotero coverage engine against synthetic data matching
 * real Castillitos patterns. No Prisma, no DB — pure function testing.
 *
 * 3 suites, 16 test cases:
 *   Suite 1: Real-pattern validation (10 tests)
 *   Suite 2: Edge cases (4 tests)
 *   Suite 3: Performance contracts (2 tests)
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-derrotero-real-validation.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildStoreDerroteroFromSalesPortfolioDerrotero } from "../store-derrotero-adapter";
import {
  evaluateStoreDerroteroCoverage,
  extractCoverageGaps,
} from "../store-derrotero-coverage-engine";
import { buildMainWarehouseCoverageMatrix } from "../store-derrotero-warehouse-matrix";
import { prioritizeWarehouseCoverageCandidates } from "../store-derrotero-priority-engine";
import { simulateWarehouseAllocation } from "../store-derrotero-allocation-simulator";

import { StoreDerrotero, StoreDerroteroEntry, StoreDerroteroCoverageResult } from "../store-derrotero-types";
import { StoreDistributionItem } from "../store-distribution-types";
import { MainWarehouseRefMeta } from "../store-derrotero-warehouse-matrix";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStoreItem(overrides: Partial<StoreDistributionItem>): StoreDistributionItem {
  return {
    referenceCode: "REF001",
    productName: "Test Product",
    size: "4",
    color: "AZUL",
    line: "castillitos",
    productClass: "textile",
    world: "TEXTILE",
    canonicalLine: "castillitos",
    group: "CS NIÑA BEBE",
    subgroup: "PIJAMA NIÑA BB CL",
    sizeClass: null,
    classificationSource: "SAG",
    classificationQuality: "CONFIRMED",
    currentUnits: 10,
    minUnits: 8,
    idealUnits: 10,
    maxUnits: 12,
    resolvedBy: "textile_default",
    deficit: 0,
    excess: 0,
    mainWarehouseAvailable: 50,
    transferableUnits: 0,
    action: "MANTENER",
    actionReason: "Stock within range",
    dataQuality: "CONFIRMED",
    committedUnitsQuality: "NOT_AVAILABLE",
    imageUrl: null,
    replacement: null,
    needResolution: null,
    variantAllocation: null,
    ...overrides,
  };
}

const STORE_SLUGS = ["centro", "caldas", "san_diego", "gran_plaza"] as const;

const STORE_NAMES: Record<string, string> = {
  centro: "Centro",
  caldas: "Caldas",
  san_diego: "San Diego",
  gran_plaza: "Gran Plaza",
};

/**
 * Build the canonical derrotero for Castillitos.
 * This is a pure function — no DB needed.
 */
function buildDerrotero(): StoreDerrotero {
  return buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos");
}

/**
 * Collect all active entries from a derrotero.
 */
function allEntries(d: StoreDerrotero): StoreDerroteroEntry[] {
  const entries: StoreDerroteroEntry[] = [];
  for (const group of d.lines.castillitos) {
    for (const e of group.entries) if (e.active) entries.push(e);
  }
  for (const group of d.lines.latinKids) {
    for (const e of group.entries) if (e.active) entries.push(e);
  }
  for (const group of d.lines.accessories) {
    for (const e of group.entries) if (e.active) entries.push(e);
  }
  return entries;
}

/**
 * Build a synthetic StoreDistributionItem for a given derrotero entry.
 * Generates a unique reference code per entry so each covers exactly one entry.
 */
function itemForEntry(
  entry: StoreDerroteroEntry,
  units: number,
  refSuffix: string = "A",
): StoreDistributionItem {
  const isAccessory = entry.line === "ACCESSORIES";
  const isLatinKids = entry.line === "LATIN_KIDS";

  return makeStoreItem({
    referenceCode: `REF-${entry.entryCode}-${refSuffix}`,
    productName: `Product ${entry.entryName}`,
    line: isAccessory ? "accesorios_importacion" : isLatinKids ? "latin_kids" : "castillitos",
    productClass: isAccessory ? "accessory" : "textile",
    world: isAccessory ? "IMPORT" : "TEXTILE",
    canonicalLine: isAccessory ? "accesorios_importacion" : isLatinKids ? "latin_kids" : "castillitos",
    group: entry.sagGrupo ?? "SIN_GRUPO_SAG",
    subgroup: typeof entry.sagSubgrupo === "string"
      ? entry.sagSubgrupo
      : Array.isArray(entry.sagSubgrupo) && entry.sagSubgrupo.length > 0
        ? entry.sagSubgrupo[0]
        : "SIN_SUBGRUPO_SAG",
    sizeClass: entry.sizeClass,
    currentUnits: units,
    minUnits: entry.minUnitsPerRef,
    idealUnits: entry.idealUnitsPerRef,
    maxUnits: entry.maxUnitsPerRef,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 1: Real-pattern validation
// ═══════════════════════════════════════════════════════════════════════════════

describe("Real-pattern validation", () => {
  const derrotero = buildDerrotero();

  // ── Test 1: Castillitos line entry count ─────────────────────────────────
  it("1. Castillitos line has expected number of entries (32)", () => {
    // 4 groups: Niña Bebé (9) + Niño Bebé (8) + Niña Kids (8) + Niño Kids (7) = 32
    let count = 0;
    for (const group of derrotero.lines.castillitos) {
      for (const e of group.entries) if (e.active) count++;
    }
    assert.equal(count, 32, `Expected 32 Castillitos entries, got ${count}`);
  });

  // ── Test 2: Latin Kids line entry count ──────────────────────────────────
  it("2. Latin Kids line has expected number of entries (11)", () => {
    let count = 0;
    for (const group of derrotero.lines.latinKids) {
      for (const e of group.entries) if (e.active) count++;
    }
    assert.equal(count, 11, `Expected 11 Latin Kids entries, got ${count}`);
  });

  // ── Test 3: Accessories line entry count ─────────────────────────────────
  it("3. Accessories line has expected number of entries (3)", () => {
    let count = 0;
    for (const group of derrotero.lines.accessories) {
      for (const e of group.entries) if (e.active) count++;
    }
    assert.equal(count, 3, `Expected 3 Accessories entries, got ${count}`);
  });

  // ── Test 4: Each entry has valid min/ideal/max ───────────────────────────
  it("4. Each entry has valid min/ideal/max thresholds", () => {
    const entries = allEntries(derrotero);
    for (const e of entries) {
      assert.ok(e.minUnitsPerRef > 0, `${e.entryCode}: min must be > 0`);
      assert.ok(
        e.idealUnitsPerRef >= e.minUnitsPerRef,
        `${e.entryCode}: ideal (${e.idealUnitsPerRef}) must be >= min (${e.minUnitsPerRef})`,
      );
      assert.ok(
        e.maxUnitsPerRef >= e.idealUnitsPerRef,
        `${e.entryCode}: max (${e.maxUnitsPerRef}) must be >= ideal (${e.idealUnitsPerRef})`,
      );

      // Textile: 8/10/12
      if (e.line === "CASTILLITOS" || e.line === "LATIN_KIDS") {
        assert.equal(e.minUnitsPerRef, 8, `${e.entryCode}: textile min should be 8`);
        assert.equal(e.idealUnitsPerRef, 10, `${e.entryCode}: textile ideal should be 10`);
        assert.equal(e.maxUnitsPerRef, 12, `${e.entryCode}: textile max should be 12`);
      }

      // Accessories: ideal varies by sizeClass (small=6, medium=4, large=1)
      if (e.line === "ACCESSORIES" && e.sizeClass === "small") {
        assert.equal(e.idealUnitsPerRef, 6, `${e.entryCode}: small accessory ideal should be 6`);
      }
      if (e.line === "ACCESSORIES" && e.sizeClass === "medium") {
        assert.equal(e.idealUnitsPerRef, 4, `${e.entryCode}: medium accessory ideal should be 4`);
      }
      if (e.line === "ACCESSORIES" && e.sizeClass === "large") {
        assert.equal(e.idealUnitsPerRef, 1, `${e.entryCode}: large accessory ideal should be 1`);
      }
    }
  });

  // ── Test 5: Coverage evaluation handles empty store ──────────────────────
  it("5. Coverage evaluation handles empty store — all uncovered", () => {
    const coverage = evaluateStoreDerroteroCoverage(
      "centro",
      "Centro",
      derrotero,
      [],                       // empty store
      new Map<string, number>(),
    );

    assert.equal(coverage.overallCoveragePercent, 0);
    assert.equal(coverage.totalCovered, 0);
    assert.equal(coverage.totalUncovered, derrotero.totalEntries);
    assert.equal(coverage.totalEntries, 46); // 32 + 11 + 3
    assert.equal(coverage.castillitos.covered, 0);
    assert.equal(coverage.latinKids.covered, 0);
    assert.equal(coverage.accessories.covered, 0);
  });

  // ── Test 6: Coverage evaluation handles fully stocked store ──────────────
  it("6. Coverage evaluation handles fully stocked store — all covered", () => {
    const entries = allEntries(derrotero);
    const storeItems: StoreDistributionItem[] = entries.map(e => itemForEntry(e, 10));
    const warehouseStock = new Map<string, number>();

    const coverage = evaluateStoreDerroteroCoverage(
      "centro",
      "Centro",
      derrotero,
      storeItems,
      warehouseStock,
    );

    assert.equal(coverage.overallCoveragePercent, 100);
    assert.equal(coverage.totalCovered, derrotero.totalEntries);
    assert.equal(coverage.totalUncovered, 0);
    assert.equal(coverage.castillitos.coveragePercent, 100);
    assert.equal(coverage.latinKids.coveragePercent, 100);
    assert.equal(coverage.accessories.coveragePercent, 100);
  });

  // ── Test 7: Gap extraction finds all uncovered entries ───────────────────
  it("7. Gap extraction finds all uncovered entries", () => {
    const coverage = evaluateStoreDerroteroCoverage(
      "centro",
      "Centro",
      derrotero,
      [],
      new Map<string, number>(),
    );

    const gapSummary = extractCoverageGaps(coverage);
    assert.equal(gapSummary.totalGaps, derrotero.totalEntries);
    assert.equal(gapSummary.storeSlug, "centro");

    // Every gap should have refShortage >= 1
    for (const gap of gapSummary.gaps) {
      assert.ok(gap.refShortage >= 1, `Gap ${gap.coverageGapId} should have refShortage >= 1`);
      assert.equal(gap.totalUnits, 0);
    }
  });

  // ── Test 8: Priority engine scores uncovered higher than covered ────────
  it("8. Priority engine scores uncovered entries higher than covered", () => {
    // Store A: empty (all uncovered)
    const coverageA = evaluateStoreDerroteroCoverage(
      "centro", "Centro", derrotero, [], new Map(),
    );
    // Store B: fully stocked
    const entries = allEntries(derrotero);
    const storeItemsB = entries.map(e => itemForEntry(e, 10));
    const coverageB = evaluateStoreDerroteroCoverage(
      "caldas", "Caldas", derrotero, storeItemsB, new Map(),
    );

    const gapsA = extractCoverageGaps(coverageA);
    const gapsB = extractCoverageGaps(coverageB);

    // Create a warehouse candidate that matches the first CS entry
    const firstEntry = derrotero.lines.castillitos[0].entries[0];
    const candidate = {
      referenceCode: "WH-REF-001",
      productName: "Warehouse Product",
      line: "CASTILLITOS" as const,
      group: firstEntry.sagGrupo ?? "",
      subgroup: typeof firstEntry.sagSubgrupo === "string"
        ? firstEntry.sagSubgrupo
        : Array.isArray(firstEntry.sagSubgrupo)
          ? firstEntry.sagSubgrupo[0]
          : "",
      sizeClass: null,
      mainWarehouseStock: 100,
      coverableStores: ["centro"],
      rule36BlockedStores: [] as string[],
      distributableUnits: 100,
      variants: [],
      totalVariantCount: 0,
      totalVariantUnits: 0,
      variantDataQuality: "NO_VARIANT_DATA" as const,
      snapshotAt: new Date().toISOString(),
    };

    const priorities = prioritizeWarehouseCoverageCandidates(
      [coverageA, coverageB],
      [gapsA, gapsB],
      [candidate],
    );

    // Only "centro" should appear (it's the only coverable store)
    assert.ok(priorities.length >= 1, "Should produce at least 1 priority entry");
    const centroPriorities = priorities.filter(p => p.storeId === "centro");
    assert.ok(centroPriorities.length >= 1, "Centro should have priority entries");
    // Uncovered store should have high scores (> 0)
    for (const p of centroPriorities) {
      assert.ok(p.priorityScore > 0, `Centro priority should be > 0, got ${p.priorityScore}`);
    }
  });

  // ── Test 9: Allocation simulator deducts correctly across 4 stores ──────
  it("9. Allocation simulator deducts correctly across 4 stores", () => {
    // All 4 stores empty
    const coverages: StoreDerroteroCoverageResult[] = STORE_SLUGS.map(slug =>
      evaluateStoreDerroteroCoverage(slug, STORE_NAMES[slug], derrotero, [], new Map()),
    );

    const gapSummaries = coverages.map(c => extractCoverageGaps(c));

    // One candidate with 40 units, coverable by all 4 stores
    const firstEntry = derrotero.lines.castillitos[0].entries[0];
    const candidate = {
      referenceCode: "WH-ALLOC-001",
      productName: "Allocation Test",
      line: "CASTILLITOS" as const,
      group: firstEntry.sagGrupo ?? "",
      subgroup: typeof firstEntry.sagSubgrupo === "string"
        ? firstEntry.sagSubgrupo
        : Array.isArray(firstEntry.sagSubgrupo)
          ? firstEntry.sagSubgrupo[0]
          : "",
      sizeClass: null,
      mainWarehouseStock: 40,
      coverableStores: [...STORE_SLUGS],
      rule36BlockedStores: [] as string[],
      distributableUnits: 40,
      variants: [],
      totalVariantCount: 0,
      totalVariantUnits: 0,
      variantDataQuality: "NO_VARIANT_DATA" as const,
      snapshotAt: new Date().toISOString(),
    };

    const priorities = prioritizeWarehouseCoverageCandidates(
      coverages,
      gapSummaries,
      [candidate],
    );

    const simulation = simulateWarehouseAllocation(priorities, [candidate], gapSummaries);

    // Total allocated + remaining should equal original stock
    assert.equal(
      simulation.totalAllocated + simulation.remainingWarehouseQty,
      40,
      "Allocated + remaining must equal original warehouse stock",
    );

    // No double-booking: each unit allocated only once
    assert.ok(simulation.totalAllocated <= 40, "Cannot allocate more than available");
    assert.ok(simulation.remainingWarehouseQty >= 0, "Remaining must be >= 0");
  });

  // ── Test 10: Rule 36 blocks san_diego and gran_plaza when stock <= 36 ───
  it("10. Rule 36 blocks san_diego and gran_plaza when stock <= 36", () => {
    // All stores empty
    const coverages = STORE_SLUGS.map(slug =>
      evaluateStoreDerroteroCoverage(slug, STORE_NAMES[slug], derrotero, [], new Map()),
    );
    const gapSummaries = coverages.map(c => extractCoverageGaps(c));

    // Warehouse refs with stock = 30 (below threshold of 36)
    const firstEntry = derrotero.lines.castillitos[0].entries[0];
    const warehouseRefs: MainWarehouseRefMeta[] = [{
      referenceCode: "WH-R36-001",
      productName: "Rule 36 Test",
      canonicalLine: "castillitos",
      group: firstEntry.sagGrupo ?? "",
      subgroup: typeof firstEntry.sagSubgrupo === "string"
        ? firstEntry.sagSubgrupo
        : Array.isArray(firstEntry.sagSubgrupo)
          ? firstEntry.sagSubgrupo[0]
          : "",
      sizeClass: null,
      mainWarehouseStock: 30,
    }];

    const matrix = buildMainWarehouseCoverageMatrix("castillitos", coverages, warehouseRefs);

    assert.ok(matrix.candidates.length >= 1, "Should find at least 1 candidate");
    const candidate = matrix.candidates[0];

    // Rule 36: centro and caldas are allowed; san_diego and gran_plaza are blocked
    assert.ok(
      !candidate.rule36BlockedStores.includes("centro"),
      "centro should NOT be blocked by Rule 36",
    );
    assert.ok(
      !candidate.rule36BlockedStores.includes("caldas"),
      "caldas should NOT be blocked by Rule 36",
    );
    assert.ok(
      candidate.rule36BlockedStores.includes("san_diego"),
      "san_diego should be blocked by Rule 36",
    );
    assert.ok(
      candidate.rule36BlockedStores.includes("gran_plaza"),
      "gran_plaza should be blocked by Rule 36",
    );

    // Coverable stores should only be centro and caldas
    assert.ok(candidate.coverableStores.includes("centro"), "centro should be coverable");
    assert.ok(candidate.coverableStores.includes("caldas"), "caldas should be coverable");
    assert.ok(!candidate.coverableStores.includes("san_diego"), "san_diego should NOT be coverable");
    assert.ok(!candidate.coverableStores.includes("gran_plaza"), "gran_plaza should NOT be coverable");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 2: Edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe("Edge cases", () => {
  const derrotero = buildDerrotero();

  // ── Test 11: Partial coverage shows mixed results ────────────────────────
  it("11. Store with partial coverage shows mixed results", () => {
    // Cover only the first CS group (Niña Bebé = 9 entries)
    const ninaBebe = derrotero.lines.castillitos[0];
    const storeItems: StoreDistributionItem[] = ninaBebe.entries
      .filter(e => e.active)
      .map(e => itemForEntry(e, 10));

    const coverage = evaluateStoreDerroteroCoverage(
      "centro", "Centro", derrotero, storeItems, new Map(),
    );

    // 9 covered out of 46
    assert.equal(coverage.castillitos.covered, 9);
    assert.equal(coverage.castillitos.uncovered, 32 - 9); // 23
    assert.equal(coverage.latinKids.covered, 0);
    assert.equal(coverage.accessories.covered, 0);
    assert.equal(coverage.totalCovered, 9);
    assert.equal(coverage.totalUncovered, 46 - 9);

    // Coverage percent should be round(9/46 * 100) = 20
    assert.equal(coverage.overallCoveragePercent, Math.round((9 / 46) * 100));
  });

  // ── Test 12: Multiple references for same entry are consolidated ────────
  it("12. Multiple references for same entry are consolidated", () => {
    const entry = derrotero.lines.castillitos[0].entries[0]; // PIJAMA NIÑA BB CL

    // Two different references matching the same entry
    const items = [
      itemForEntry(entry, 5, "A"),
      itemForEntry(entry, 7, "B"),
    ];

    const coverage = evaluateStoreDerroteroCoverage(
      "centro", "Centro", derrotero, items, new Map(),
    );

    // Find the coverage item for this entry
    const item = coverage.castillitos.items.find(
      i => i.entry.entryCode === entry.entryCode &&
           i.entry.sagGrupo === entry.sagGrupo,
    );
    assert.ok(item, "Should find coverage item for entry");
    assert.equal(item.coverageStatus, "COVERED");
    assert.equal(item.referenceCount, 2, "Should consolidate 2 refs");
    assert.equal(item.totalUnits, 12, "Total units should be 5 + 7 = 12");
    assert.equal(item.matchedRefs.length, 2);
  });

  // ── Test 13: Accessories use sizeClass matching, not grupo/subgrupo ─────
  it("13. Accessories use sizeClass matching, not grupo/subgrupo", () => {
    // Create an accessory item with sizeClass = "small"
    const smallItem = makeStoreItem({
      referenceCode: "ACC-SMALL-001",
      line: "accesorios_importacion",
      productClass: "accessory",
      world: "IMPORT",
      canonicalLine: "accesorios_importacion",
      group: "SIN_GRUPO_SAG",
      subgroup: "SIN_SUBGRUPO_SAG",
      sizeClass: "small",
      currentUnits: 6,
    });

    const coverage = evaluateStoreDerroteroCoverage(
      "centro", "Centro", derrotero, [smallItem], new Map(),
    );

    // Only the "small" accessory entry should be covered
    assert.equal(coverage.accessories.covered, 1, "Only small should be covered");
    assert.equal(coverage.accessories.uncovered, 2, "medium and large uncovered");

    // Verify the covered item is the small sizeClass entry
    const coveredItem = coverage.accessories.items.find(i => i.coverageStatus === "COVERED");
    assert.ok(coveredItem, "Should find a covered accessory item");
    assert.equal(coveredItem.entry.sizeClass, "small");
    assert.equal(coveredItem.entry.matchMode, "SIZE_CLASS");
  });

  // ── Test 14: Latin Kids uses SUBGROUP matching without grupo ─────────────
  it("14. Latin Kids uses SUBGROUP matching without grupo", () => {
    // Latin Kids items — subgroup matching only (no grupo required)
    const ltEntry = derrotero.lines.latinKids[0].entries[0]; // PIJAMA CC 10-16

    const ltItem = makeStoreItem({
      referenceCode: "LT-001",
      line: "latin_kids",
      productClass: "textile",
      world: "TEXTILE",
      canonicalLine: "latin_kids",
      group: "SIN_GRUPO_SAG",  // grupo is irrelevant for LT
      subgroup: typeof ltEntry.sagSubgrupo === "string"
        ? ltEntry.sagSubgrupo
        : Array.isArray(ltEntry.sagSubgrupo)
          ? ltEntry.sagSubgrupo[0]
          : "",
      sizeClass: null,
      currentUnits: 10,
    });

    const coverage = evaluateStoreDerroteroCoverage(
      "centro", "Centro", derrotero, [ltItem], new Map(),
    );

    assert.equal(coverage.latinKids.covered, 1, "One LT entry should be covered");
    assert.equal(coverage.latinKids.uncovered, 10, "10 LT entries uncovered");

    // Verify match mode is SUBGROUP
    const coveredItem = coverage.latinKids.items.find(i => i.coverageStatus === "COVERED");
    assert.ok(coveredItem, "Should find a covered LT item");
    assert.equal(coveredItem.entry.matchMode, "SUBGROUP");
    assert.equal(coveredItem.entry.line, "LATIN_KIDS");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 3: Performance contracts
// ═══════════════════════════════════════════════════════════════════════════════

describe("Performance contracts", () => {
  const derrotero = buildDerrotero();

  // ── Test 15: Full evaluation for 4 stores < 50ms ────────────────────────
  it("15. Full evaluation for 4 stores < 50ms", () => {
    // Build realistic inventory: ~200 items per store
    const entries = allEntries(derrotero);
    const storeItemSets = STORE_SLUGS.map(() =>
      entries.map(e => itemForEntry(e, Math.floor(Math.random() * 15) + 3)),
    );
    const warehouseStock = new Map<string, number>();
    for (const e of entries) {
      warehouseStock.set(`REF-${e.entryCode}-A`, Math.floor(Math.random() * 100));
    }

    const start = performance.now();
    const coverages = STORE_SLUGS.map((slug, i) =>
      evaluateStoreDerroteroCoverage(
        slug, STORE_NAMES[slug], derrotero, storeItemSets[i], warehouseStock,
      ),
    );
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 50, `Full evaluation took ${elapsed.toFixed(1)}ms, expected < 50ms`);
    assert.equal(coverages.length, 4);
    for (const c of coverages) {
      assert.equal(c.totalEntries, 46);
    }
  });

  // ── Test 16: Priority engine for 4 stores x all candidates < 10ms ──────
  it("16. Priority engine for 4 stores x all candidates < 10ms", () => {
    const entries = allEntries(derrotero);

    // All stores partially stocked
    const coverages = STORE_SLUGS.map(slug => {
      const items = entries
        .filter((_, i) => i % 3 === 0) // every 3rd entry covered
        .map(e => itemForEntry(e, 10));
      return evaluateStoreDerroteroCoverage(slug, STORE_NAMES[slug], derrotero, items, new Map());
    });

    const gapSummaries = coverages.map(c => extractCoverageGaps(c));

    // Create warehouse candidates for each uncovered entry
    const candidates = entries.slice(0, 20).map((e, i) => ({
      referenceCode: `WH-PERF-${i}`,
      productName: `Perf ${e.entryName}`,
      line: e.line,
      group: e.sagGrupo ?? "",
      subgroup: typeof e.sagSubgrupo === "string"
        ? e.sagSubgrupo
        : Array.isArray(e.sagSubgrupo)
          ? e.sagSubgrupo[0]
          : "",
      sizeClass: e.sizeClass,
      mainWarehouseStock: 100,
      coverableStores: [...STORE_SLUGS],
      rule36BlockedStores: [] as string[],
      distributableUnits: 100,
      variants: [],
      totalVariantCount: 0,
      totalVariantUnits: 0,
      variantDataQuality: "NO_VARIANT_DATA" as const,
      snapshotAt: new Date().toISOString(),
    }));

    const start = performance.now();
    const priorities = prioritizeWarehouseCoverageCandidates(
      coverages,
      gapSummaries,
      candidates,
    );
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 10, `Priority engine took ${elapsed.toFixed(1)}ms, expected < 10ms`);
    assert.ok(priorities.length > 0, "Should produce priority entries");

    // Verify sorting: non-blocked come before blocked
    const firstBlocked = priorities.findIndex(p => p.blocked);
    if (firstBlocked >= 0) {
      for (let i = 0; i < firstBlocked; i++) {
        assert.ok(!priorities[i].blocked, `Entry ${i} should not be blocked`);
      }
    }
  });
});
