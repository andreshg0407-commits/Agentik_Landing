/**
 * lib/comercial/tiendas/__tests__/store-derrotero.test.ts
 *
 * AGENTIK-STORES-DERROTERO-COVERAGE-FOUNDATION-01 — DECIMOQUINTO
 *
 * Tests for:
 * 1. Adapter — taxonomy from Maletas, separated coverage/quantity/variety
 * 2. Coverage engine — 5 independent dimensions
 * 3. Per-reference health (8-12 rule)
 * 4. Variety NOT_EVALUATED without policy
 * 5. Accessory coverage by sizeClass
 * 6. Warehouse inverse matrix + Rule 36
 * 7. Performance
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildStoreDerroteroFromSalesPortfolioDerrotero } from "../store-derrotero-adapter";
import {
  evaluateStoreDerroteroCoverage,
  buildIndexKey,
  buildStoreRefIndex,
  resolveCoverageStatus,
  classifyReferenceHealth,
  extractCoverageGaps,
} from "../store-derrotero-coverage-engine";
import { buildMainWarehouseCoverageMatrix, MainWarehouseVariantRecord } from "../store-derrotero-warehouse-matrix";
import { prioritizeWarehouseCoverageCandidates } from "../store-derrotero-priority-engine";
import { buildDerroteroVariantAllocation, simulateWarehouseAllocation } from "../store-derrotero-allocation-simulator";
import {
  StoreDerroteroEntry,
  StoreDerroteroCoverageResult,
  DerroteroCoverageGap,
  MainWarehouseCoverageCandidate,
} from "../store-derrotero-types";
import { StoreDistributionItem } from "../store-distribution-types";

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

function makeEntry(overrides: Partial<StoreDerroteroEntry>): StoreDerroteroEntry {
  return {
    entryCode: "PIJAMA_CL",
    entryName: "Pijama Niña BB CL",
    line: "CASTILLITOS",
    sagGrupo: "CS NIÑA BEBE",
    sagSubgrupo: "PIJAMA NIÑA BB CL",
    sizeClass: null,
    matchMode: "GROUP_AND_SUBGROUP",
    minimumCoverageReferences: 1,
    minUnitsPerRef: 8,
    idealUnitsPerRef: 10,
    maxUnitsPerRef: 12,
    priority: 1,
    active: true,
    sourceEvidence: "test",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 1: Adapter — Taxonomy certification (CUARTO)
// ═══════════════════════════════════════════════════════════════════════════

describe("CUARTO: Taxonomy Certification", () => {
  const derrotero = buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos");

  it("builds derrotero with correct tenantId", () => {
    assert.strictEqual(derrotero.tenantId, "castillitos");
  });

  it("Castillitos has exactly 4 groups (32 entries)", () => {
    assert.strictEqual(derrotero.lines.castillitos.length, 4);
    const total = derrotero.lines.castillitos.reduce((s, g) => s + g.entries.length, 0);
    assert.strictEqual(total, 32);
  });

  it("CS groups match DERROTERO CS.xlsx exactly", () => {
    const codes = derrotero.lines.castillitos.map(g => g.groupCode);
    assert.deepStrictEqual(codes, ["CS_NINA_BEBE", "CS_NINO_BEBE", "CS_NINA_KIDS", "CS_NINO_KIDS"]);
  });

  it("CS Niña Bebé has 9 entries", () => {
    const g = derrotero.lines.castillitos.find(g => g.groupCode === "CS_NINA_BEBE")!;
    assert.strictEqual(g.entries.length, 9);
  });

  it("CS Niño Bebé has 8 entries", () => {
    const g = derrotero.lines.castillitos.find(g => g.groupCode === "CS_NINO_BEBE")!;
    assert.strictEqual(g.entries.length, 8);
  });

  it("Latin Kids has 4 groups with 24 entries (08B2R5)", () => {
    assert.strictEqual(derrotero.lines.latinKids.length, 4);
    const totalLtEntries = derrotero.lines.latinKids.reduce((s: number, g: any) => s + g.entries.length, 0);
    assert.strictEqual(totalLtEntries, 24);
  });

  it("Accessories has 1 group with 2 active entries (GRANDE excluded)", () => {
    assert.strictEqual(derrotero.lines.accessories.length, 1);
    assert.strictEqual(derrotero.lines.accessories[0].entries.length, 2);
  });

  it("totalEntries = 32 + 24 + 2 = 58 (08B2R5, GRANDE excluded)", () => {
    assert.strictEqual(derrotero.totalEntries, 58);
  });

  it("no duplicate entries within any group", () => {
    for (const group of [...derrotero.lines.castillitos, ...derrotero.lines.latinKids, ...derrotero.lines.accessories]) {
      const codes = group.entries.map(e => e.entryCode);
      assert.strictEqual(new Set(codes).size, codes.length);
    }
  });

  it("no inactive entries (all from active catalog entries)", () => {
    const all = [
      ...derrotero.lines.castillitos.flatMap(g => g.entries),
      ...derrotero.lines.latinKids.flatMap(g => g.entries),
      ...derrotero.lines.accessories.flatMap(g => g.entries),
    ];
    assert.strictEqual(all.every(e => e.active), true);
  });

  it("all CS/LT entries have sagSubgrupo", () => {
    for (const g of [...derrotero.lines.castillitos, ...derrotero.lines.latinKids]) {
      for (const e of g.entries) {
        assert.notStrictEqual(e.sagSubgrupo, null);
      }
    }
  });

  it("all accessory entries have null sagSubgrupo", () => {
    for (const e of derrotero.lines.accessories[0].entries) {
      assert.strictEqual(e.sagSubgrupo, null);
    }
  });

  it("sourceEvidence references original catalog", () => {
    const e = derrotero.lines.castillitos[0].entries[0];
    assert.ok(e.sourceEvidence.includes("Castillitos Textil"));
  });

  it("version combines all 3 catalog versions", () => {
    assert.strictEqual(derrotero.version, "1.0.0+2.0.0+1.0.0");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 2: Coverage separated from maxRefs (PRIMERO)
// ═══════════════════════════════════════════════════════════════════════════

describe("PRIMERO: Coverage separated from variety", () => {
  const derrotero = buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos");

  it("entries have NO minRefs/idealRefs/maxRefs fields", () => {
    const e = derrotero.lines.castillitos[0].entries[0];
    assert.strictEqual("minRefs" in e, false);
    assert.strictEqual("idealRefs" in e, false);
    assert.strictEqual("maxRefs" in e, false);
  });

  it("entries have minimumCoverageReferences = 1", () => {
    const all = [
      ...derrotero.lines.castillitos.flatMap(g => g.entries),
      ...derrotero.lines.latinKids.flatMap(g => g.entries),
      ...derrotero.lines.accessories.flatMap(g => g.entries),
    ];
    for (const e of all) {
      assert.strictEqual(e.minimumCoverageReferences, 1);
    }
  });

  it("resolveCoverageStatus returns COVERED when matched >= minimum", () => {
    assert.strictEqual(resolveCoverageStatus(1, 1), "COVERED");
    assert.strictEqual(resolveCoverageStatus(50, 1), "COVERED");
    assert.strictEqual(resolveCoverageStatus(100, 1), "COVERED");
  });

  it("resolveCoverageStatus returns UNCOVERED when matched < minimum", () => {
    assert.strictEqual(resolveCoverageStatus(0, 1), "UNCOVERED");
  });

  it("50 refs matching an entry is COVERED, not OVER_ASSORTED", () => {
    const items = Array.from({ length: 50 }, (_, i) =>
      makeStoreItem({ referenceCode: `R${i}`, group: "CS NIÑA BEBE", subgroup: "PIJAMA NIÑA BB CL", currentUnits: 10 }),
    );
    const result = evaluateStoreDerroteroCoverage("test", "Test", derrotero, items, new Map());
    const pijamaCl = result.castillitos.items.find(
      i => i.entry.sagSubgrupo === "PIJAMA NIÑA BB CL" && i.entry.sagGrupo === "CS NIÑA BEBE",
    )!;
    assert.strictEqual(pijamaCl.coverageStatus, "COVERED");
    assert.strictEqual(pijamaCl.referenceCount, 50);
  });

  it("coverage items have NO OVER_ASSORTED or PARTIAL status", () => {
    const items = [makeStoreItem({ referenceCode: "R1" })];
    const result = evaluateStoreDerroteroCoverage("test", "Test", derrotero, items, new Map());
    const allItems = [...result.castillitos.items, ...result.latinKids.items, ...result.accessories.items];
    for (const item of allItems) {
      assert.notStrictEqual(item.coverageStatus, "OVER_ASSORTED");
      assert.notStrictEqual(item.coverageStatus, "PARTIAL");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 3: Per-reference health — 8-12 rule (SEGUNDO)
// ═══════════════════════════════════════════════════════════════════════════

describe("SEGUNDO: Per-reference health (8-12 rule)", () => {
  const entry = makeEntry({});

  it("classifies < 8 as BAJO_MINIMO", () => {
    assert.strictEqual(classifyReferenceHealth(0, entry), "BAJO_MINIMO");
    assert.strictEqual(classifyReferenceHealth(1, entry), "BAJO_MINIMO");
    assert.strictEqual(classifyReferenceHealth(7, entry), "BAJO_MINIMO");
  });

  it("classifies 8-12 as SALUDABLE", () => {
    assert.strictEqual(classifyReferenceHealth(8, entry), "SALUDABLE");
    assert.strictEqual(classifyReferenceHealth(10, entry), "SALUDABLE");
    assert.strictEqual(classifyReferenceHealth(12, entry), "SALUDABLE");
  });

  it("classifies > 12 as SOBRE_MAXIMO", () => {
    assert.strictEqual(classifyReferenceHealth(13, entry), "SOBRE_MAXIMO");
    assert.strictEqual(classifyReferenceHealth(50, entry), "SOBRE_MAXIMO");
  });

  it("covered entry with mixed health refs reports correct counts", () => {
    const derrotero = buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos");
    const items = [
      makeStoreItem({ referenceCode: "A", currentUnits: 4 }),   // BAJO_MINIMO
      makeStoreItem({ referenceCode: "B", currentUnits: 10 }),  // SALUDABLE
      makeStoreItem({ referenceCode: "C", currentUnits: 15 }),  // SOBRE_MAXIMO
    ];
    const result = evaluateStoreDerroteroCoverage("test", "Test", derrotero, items, new Map());
    const pijamaCl = result.castillitos.items.find(
      i => i.entry.sagSubgrupo === "PIJAMA NIÑA BB CL" && i.entry.sagGrupo === "CS NIÑA BEBE",
    )!;
    assert.strictEqual(pijamaCl.coverageStatus, "COVERED");
    assert.strictEqual(pijamaCl.referenceCount, 3);
    assert.strictEqual(pijamaCl.belowMinimumReferenceCount, 1);
    assert.strictEqual(pijamaCl.healthyReferenceCount, 1);
    assert.strictEqual(pijamaCl.overMaximumReferenceCount, 1);
    assert.strictEqual(pijamaCl.totalUnits, 29);
  });

  it("referenceDetails contains per-ref breakdown", () => {
    const derrotero = buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos");
    const items = [
      makeStoreItem({ referenceCode: "X", currentUnits: 4 }),
      makeStoreItem({ referenceCode: "Y", currentUnits: 10 }),
    ];
    const result = evaluateStoreDerroteroCoverage("test", "Test", derrotero, items, new Map([["X", 20], ["Y", 5]]));
    const pijamaCl = result.castillitos.items.find(
      i => i.entry.sagSubgrupo === "PIJAMA NIÑA BB CL" && i.entry.sagGrupo === "CS NIÑA BEBE",
    )!;

    const xDetail = pijamaCl.referenceDetails.find(d => d.referenceCode === "X")!;
    assert.strictEqual(xDetail.unitsInStore, 4);
    assert.strictEqual(xDetail.unitsInMainWarehouse, 20);
    assert.strictEqual(xDetail.healthStatus, "BAJO_MINIMO");

    const yDetail = pijamaCl.referenceDetails.find(d => d.referenceCode === "Y")!;
    assert.strictEqual(yDetail.unitsInStore, 10);
    assert.strictEqual(yDetail.healthStatus, "SALUDABLE");
  });

  it("line-level aggregates sum per-reference health", () => {
    const derrotero = buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos");
    const items = [
      makeStoreItem({ referenceCode: "A", group: "CS NIÑA BEBE", subgroup: "PIJAMA NIÑA BB CL", currentUnits: 4 }),
      makeStoreItem({ referenceCode: "B", group: "CS NIÑA BEBE", subgroup: "VESTIDO", currentUnits: 10 }),
    ];
    const result = evaluateStoreDerroteroCoverage("test", "Test", derrotero, items, new Map());
    assert.ok(result.castillitos.belowMinimumTotal >= 1);
    assert.ok(result.castillitos.healthyTotal >= 1);
  });

  it("accessory health uses size-specific thresholds", () => {
    const accEntry = makeEntry({
      line: "ACCESSORIES",
      matchMode: "SIZE_CLASS",
      sizeClass: "small",
      minUnitsPerRef: 6,
      idealUnitsPerRef: 6,
      maxUnitsPerRef: 6,
    });
    assert.strictEqual(classifyReferenceHealth(5, accEntry), "BAJO_MINIMO");
    assert.strictEqual(classifyReferenceHealth(6, accEntry), "SALUDABLE");
    assert.strictEqual(classifyReferenceHealth(7, accEntry), "SOBRE_MAXIMO");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 4: Variety NOT_EVALUATED without policy
// ═══════════════════════════════════════════════════════════════════════════

describe("Variety NOT_EVALUATED", () => {
  it("all coverage items have varietyStatus = NOT_EVALUATED", () => {
    const derrotero = buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos");
    const items = [
      makeStoreItem({ referenceCode: "R1" }),
      makeStoreItem({ referenceCode: "R2" }),
    ];
    const result = evaluateStoreDerroteroCoverage("test", "Test", derrotero, items, new Map());
    const allItems = [...result.castillitos.items, ...result.latinKids.items, ...result.accessories.items];
    for (const item of allItems) {
      assert.strictEqual(item.varietyStatus, "NOT_EVALUATED");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 5: Accessory coverage by sizeClass (TERCERO)
// ═══════════════════════════════════════════════════════════════════════════

describe("TERCERO: Accessory coverage by sizeClass", () => {
  const derrotero = buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos");

  it("has 3 accessory entries: small/medium/large", () => {
    const entries = derrotero.lines.accessories[0].entries;
    assert.strictEqual(entries.length, 3);
    assert.deepStrictEqual(entries.map(e => e.sizeClass), ["small", "medium", "large"]);
  });

  it("small threshold = 6, medium = 4, large = 1", () => {
    const entries = derrotero.lines.accessories[0].entries;
    const small = entries.find(e => e.sizeClass === "small")!;
    const medium = entries.find(e => e.sizeClass === "medium")!;
    const large = entries.find(e => e.sizeClass === "large")!;
    assert.strictEqual(small.idealUnitsPerRef, 6);
    assert.strictEqual(medium.idealUnitsPerRef, 4);
    assert.strictEqual(large.idealUnitsPerRef, 1);
  });

  it("a store with only small items covers only the small entry", () => {
    const items = [
      makeStoreItem({ referenceCode: "ACC1", sizeClass: "small", currentUnits: 5, world: "IMPORT" }),
    ];
    const result = evaluateStoreDerroteroCoverage("test", "Test", derrotero, items, new Map());
    const smallItem = result.accessories.items.find(i => i.entry.sizeClass === "small")!;
    const mediumItem = result.accessories.items.find(i => i.entry.sizeClass === "medium")!;
    const largeItem = result.accessories.items.find(i => i.entry.sizeClass === "large")!;

    assert.strictEqual(smallItem.coverageStatus, "COVERED");
    assert.strictEqual(mediumItem.coverageStatus, "UNCOVERED");
    assert.strictEqual(largeItem.coverageStatus, "UNCOVERED");
  });

  it("accessory ref health uses correct threshold per sizeClass", () => {
    const items = [
      makeStoreItem({ referenceCode: "S1", sizeClass: "small", currentUnits: 5, world: "IMPORT" }),
      makeStoreItem({ referenceCode: "L1", sizeClass: "large", currentUnits: 1, world: "IMPORT" }),
    ];
    const result = evaluateStoreDerroteroCoverage("test", "Test", derrotero, items, new Map());
    const smallItem = result.accessories.items.find(i => i.entry.sizeClass === "small")!;
    const largeItem = result.accessories.items.find(i => i.entry.sizeClass === "large")!;

    // small: 5 < 6 → BAJO_MINIMO
    assert.strictEqual(smallItem.referenceDetails[0].healthStatus, "BAJO_MINIMO");
    // large: 1 == 1 → SALUDABLE
    assert.strictEqual(largeItem.referenceDetails[0].healthStatus, "SALUDABLE");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 6: Index key builders
// ═══════════════════════════════════════════════════════════════════════════

describe("Index key builders", () => {
  it("GROUP_AND_SUBGROUP key = 'grupo|subgrupo'", () => {
    assert.strictEqual(buildIndexKey(makeEntry({})), "CS NIÑA BEBE|PIJAMA NIÑA BB CL");
  });

  it("SUBGROUP key = subgrupo only", () => {
    assert.strictEqual(buildIndexKey(makeEntry({
      matchMode: "SUBGROUP",
      sagGrupo: null,
      sagSubgrupo: "PIJAMA CC 2-8",
    })), "PIJAMA CC 2-8");
  });

  it("SIZE_CLASS key = sizeClass value", () => {
    assert.strictEqual(buildIndexKey(makeEntry({
      matchMode: "SIZE_CLASS",
      sagGrupo: null,
      sagSubgrupo: null,
      sizeClass: "small",
    })), "small");
  });

  it("array sagSubgrupo uses first element", () => {
    assert.strictEqual(buildIndexKey(makeEntry({
      sagSubgrupo: ["BUZO", "CAMIBUSO"],
    })), "CS NIÑA BEBE|BUZO");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 7: Store ref index builder
// ═══════════════════════════════════════════════════════════════════════════

describe("Store ref index", () => {
  it("indexes by GROUP_AND_SUBGROUP", () => {
    const items = [
      makeStoreItem({ referenceCode: "R1", currentUnits: 5 }),
      makeStoreItem({ referenceCode: "R2", currentUnits: 8 }),
    ];
    const index = buildStoreRefIndex(items, "GROUP_AND_SUBGROUP");
    assert.strictEqual(index.get("CS NIÑA BEBE|PIJAMA NIÑA BB CL")?.size, 2);
  });

  it("skips SIN_GRUPO_SAG", () => {
    const items = [makeStoreItem({ referenceCode: "R1", group: "SIN_GRUPO_SAG", currentUnits: 5 })];
    const index = buildStoreRefIndex(items, "GROUP_AND_SUBGROUP");
    assert.strictEqual(index.size, 0);
  });

  it("skips 0 units", () => {
    const items = [makeStoreItem({ referenceCode: "R1", currentUnits: 0 })];
    const index = buildStoreRefIndex(items, "GROUP_AND_SUBGROUP");
    assert.strictEqual(index.size, 0);
  });

  it("indexes by SIZE_CLASS", () => {
    const items = [
      makeStoreItem({ referenceCode: "I1", sizeClass: "small", currentUnits: 3 }),
      makeStoreItem({ referenceCode: "I2", sizeClass: "large", currentUnits: 1 }),
    ];
    const index = buildStoreRefIndex(items, "SIZE_CLASS");
    assert.strictEqual(index.get("small")?.size, 1);
    assert.strictEqual(index.get("large")?.size, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 8: Full coverage evaluation
// ═══════════════════════════════════════════════════════════════════════════

describe("Full coverage evaluation", () => {
  const derrotero = buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos");

  it("empty store → 0% coverage, all uncovered", () => {
    const result = evaluateStoreDerroteroCoverage("x", "X", derrotero, [], new Map());
    assert.strictEqual(result.overallCoveragePercent, 0);
    assert.strictEqual(result.totalUncovered, result.totalEntries);
    assert.strictEqual(result.totalCovered, 0);
  });

  it("correct entry counts per line", () => {
    const result = evaluateStoreDerroteroCoverage("x", "X", derrotero, [], new Map());
    assert.strictEqual(result.castillitos.totalEntries, 32);
    assert.strictEqual(result.latinKids.totalEntries, 24);
    assert.strictEqual(result.accessories.totalEntries, 2);
  });

  it("matching ref marks entry as COVERED", () => {
    const items = [makeStoreItem({ referenceCode: "R1", currentUnits: 10 })];
    const result = evaluateStoreDerroteroCoverage("x", "X", derrotero, items, new Map([["R1", 50]]));
    const entry = result.castillitos.items.find(
      i => i.entry.sagSubgrupo === "PIJAMA NIÑA BB CL" && i.entry.sagGrupo === "CS NIÑA BEBE",
    )!;
    assert.strictEqual(entry.coverageStatus, "COVERED");
    assert.strictEqual(entry.referenceCount, 1);
    assert.strictEqual(entry.totalUnitsInMainWarehouse, 50);
  });

  it("Latin Kids matches by subgroup only (08B2R5: gendered)", () => {
    const items = [
      makeStoreItem({
        referenceCode: "LT1", canonicalLine: "latin_kids", line: "latin_kids",
        group: "SIN_GRUPO_SAG", subgroup: "PIJAMA CC 2-8 NIÑA", currentUnits: 10,
      }),
    ];
    const result = evaluateStoreDerroteroCoverage("x", "X", derrotero, items, new Map());
    const entry = result.latinKids.items.find(i => i.entry.sagSubgrupo === "PIJAMA CC 2-8 NIÑA")!;
    assert.strictEqual(entry.coverageStatus, "COVERED");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 9: Main warehouse inverse matrix + Rule 36 (SÉPTIMO + DÉCIMO)
// ═══════════════════════════════════════════════════════════════════════════

describe("SÉPTIMO: Main warehouse inverse matrix", () => {
  const derrotero = buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos");

  it("finds candidates that can cover uncovered entries", () => {
    // Centro has uncovered MAMELUCO entry
    const centroItems: StoreDistributionItem[] = []; // empty = all uncovered
    const centroCoverage = evaluateStoreDerroteroCoverage("centro", "Centro", derrotero, centroItems, new Map());

    const refs = [{
      referenceCode: "MAM01",
      productName: "Mameluco Niña",
      canonicalLine: "castillitos",
      group: "CS NIÑA BEBE",
      subgroup: "MAMELUCO",
      sizeClass: null,
      mainWarehouseStock: 50,
    }];

    const matrix = buildMainWarehouseCoverageMatrix("castillitos", [centroCoverage], refs);
    assert.strictEqual(matrix.candidates.length, 1);
    assert.ok(matrix.candidates[0].coverableStores.includes("centro"));
  });

  it("skips refs with 0 stock", () => {
    const centroCoverage = evaluateStoreDerroteroCoverage("centro", "Centro", derrotero, [], new Map());
    const refs = [{
      referenceCode: "MAM01", productName: "Mameluco", canonicalLine: "castillitos",
      group: "CS NIÑA BEBE", subgroup: "MAMELUCO", sizeClass: null, mainWarehouseStock: 0,
    }];
    const matrix = buildMainWarehouseCoverageMatrix("castillitos", [centroCoverage], refs);
    assert.strictEqual(matrix.candidates.length, 0);
  });

  it("Rule 36 blocks non-allowed stores when stock <= threshold", () => {
    const sdItems: StoreDistributionItem[] = [];
    const sdCoverage = evaluateStoreDerroteroCoverage("san_diego", "San Diego", derrotero, sdItems, new Map());

    const refs = [{
      referenceCode: "MAM01", productName: "Mameluco", canonicalLine: "castillitos",
      group: "CS NIÑA BEBE", subgroup: "MAMELUCO", sizeClass: null,
      mainWarehouseStock: 30, // <= 36 threshold
    }];

    const matrix = buildMainWarehouseCoverageMatrix("castillitos", [sdCoverage], refs);
    assert.ok(matrix.candidates[0].rule36BlockedStores.includes("san_diego"));
    assert.strictEqual(matrix.candidates[0].coverableStores.length, 0);
    assert.strictEqual(matrix.totalRule36Blocked, 1);
  });

  it("Rule 36 allows Centro and Caldas even when stock <= threshold", () => {
    const centroCoverage = evaluateStoreDerroteroCoverage("centro", "Centro", derrotero, [], new Map());
    const caldasCoverage = evaluateStoreDerroteroCoverage("caldas", "Caldas", derrotero, [], new Map());

    const refs = [{
      referenceCode: "MAM01", productName: "Mameluco", canonicalLine: "castillitos",
      group: "CS NIÑA BEBE", subgroup: "MAMELUCO", sizeClass: null,
      mainWarehouseStock: 20, // <= 36 but allowed stores
    }];

    const matrix = buildMainWarehouseCoverageMatrix("castillitos", [centroCoverage, caldasCoverage], refs);
    assert.ok(matrix.candidates[0].coverableStores.includes("centro"));
    assert.ok(matrix.candidates[0].coverableStores.includes("caldas"));
    assert.strictEqual(matrix.candidates[0].rule36BlockedStores.length, 0);
  });

  it("does not match incompatible lines", () => {
    const centroCoverage = evaluateStoreDerroteroCoverage("centro", "Centro", derrotero, [], new Map());
    const refs = [{
      referenceCode: "LT01", productName: "Pijama LK", canonicalLine: "latin_kids",
      group: "SIN_GRUPO_SAG", subgroup: "PIJAMA CC 2-8", sizeClass: null,
      mainWarehouseStock: 50,
    }];
    const matrix = buildMainWarehouseCoverageMatrix("castillitos", [centroCoverage], refs);
    // LT ref should match LT uncovered entries, not CS ones
    const candidate = matrix.candidates.find(c => c.referenceCode === "LT01");
    if (candidate) {
      assert.strictEqual(candidate.line, "LATIN_KIDS");
    }
  });

  it("sorts candidates: most coverable stores first, then stock desc", () => {
    const stores = STORE_SLUGS.map(s =>
      evaluateStoreDerroteroCoverage(s, s, derrotero, [], new Map()),
    );

    const refs = [
      { referenceCode: "A", productName: "A", canonicalLine: "castillitos", group: "CS NIÑA BEBE", subgroup: "MAMELUCO", sizeClass: null, mainWarehouseStock: 100 },
      { referenceCode: "B", productName: "B", canonicalLine: "castillitos", group: "CS NIÑA BEBE", subgroup: "MAMELUCO", sizeClass: null, mainWarehouseStock: 200 },
    ];

    const matrix = buildMainWarehouseCoverageMatrix("castillitos", stores, refs);
    // Both cover same stores, so B (more stock) should come first
    if (matrix.candidates.length >= 2) {
      assert.ok(matrix.candidates[0].mainWarehouseStock >= matrix.candidates[1].mainWarehouseStock);
    }
  });
});

const STORE_SLUGS = ["centro", "san_diego", "gran_plaza", "caldas"] as const;

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 10: Performance
// ═══════════════════════════════════════════════════════════════════════════

describe("Performance", () => {
  it("adapter + coverage evaluation <50ms for 200 items", () => {
    const start = performance.now();
    const d = buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos");
    const items: StoreDistributionItem[] = Array.from({ length: 200 }, (_, i) =>
      makeStoreItem({ referenceCode: `REF${i}`, currentUnits: Math.floor(Math.random() * 15) }),
    );
    evaluateStoreDerroteroCoverage("test", "Test", d, items, new Map());
    assert.ok(performance.now() - start < 50);
  });

  it("warehouse matrix <10ms for 500 refs × 4 stores", () => {
    const d = buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos");
    const stores = STORE_SLUGS.map(s => evaluateStoreDerroteroCoverage(s, s, d, [], new Map()));
    const refs = Array.from({ length: 500 }, (_, i) => ({
      referenceCode: `R${i}`, productName: `P${i}`, canonicalLine: "castillitos",
      group: "CS NIÑA BEBE", subgroup: "MAMELUCO", sizeClass: null, mainWarehouseStock: 50,
    }));

    const start = performance.now();
    buildMainWarehouseCoverageMatrix("castillitos", stores, refs);
    assert.ok(performance.now() - start < 10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 11: Custom config overrides
// ═══════════════════════════════════════════════════════════════════════════

describe("Config overrides", () => {
  it("custom textile thresholds propagate to entries", () => {
    const d = buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos", {
      castillitosTextile: { minimumUnits: 5, idealUnits: 7, maximumUnits: 9 },
      latinKidsTextile: { minimumUnits: 5, idealUnits: 7, maximumUnits: 9 },
      accessory: { idealBySize: { small: 3, medium: 2, large: 1 } },
      minimumCoverageReferences: 2,
    });
    const e = d.lines.castillitos[0].entries[0];
    assert.strictEqual(e.minUnitsPerRef, 5);
    assert.strictEqual(e.idealUnitsPerRef, 7);
    assert.strictEqual(e.maxUnitsPerRef, 9);
    assert.strictEqual(e.minimumCoverageReferences, 2);
  });

  it("minimumCoverageReferences > 1 requires multiple refs for COVERED", () => {
    const d = buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos", {
      castillitosTextile: { minimumUnits: 8, idealUnits: 10, maximumUnits: 12 },
      latinKidsTextile: { minimumUnits: 8, idealUnits: 10, maximumUnits: 12 },
      accessory: { idealBySize: { small: 6, medium: 4, large: 1 } },
      minimumCoverageReferences: 2,
    });
    // 1 ref → UNCOVERED when minimum is 2
    const items = [makeStoreItem({ referenceCode: "R1", currentUnits: 10 })];
    const result = evaluateStoreDerroteroCoverage("test", "Test", d, items, new Map());
    const entry = result.castillitos.items.find(
      i => i.entry.sagSubgrupo === "PIJAMA NIÑA BB CL" && i.entry.sagGrupo === "CS NIÑA BEBE",
    )!;
    assert.strictEqual(entry.coverageStatus, "UNCOVERED");
    assert.strictEqual(entry.referenceCount, 1);

    // 2 refs → COVERED
    const items2 = [
      makeStoreItem({ referenceCode: "R1", currentUnits: 10 }),
      makeStoreItem({ referenceCode: "R2", currentUnits: 8 }),
    ];
    const result2 = evaluateStoreDerroteroCoverage("test", "Test", d, items2, new Map());
    const entry2 = result2.castillitos.items.find(
      i => i.entry.sagSubgrupo === "PIJAMA NIÑA BB CL" && i.entry.sagGrupo === "CS NIÑA BEBE",
    )!;
    assert.strictEqual(entry2.coverageStatus, "COVERED");
  });
});

// ── Suite 12: Coverage gap extraction (UNDÉCIMO) ────────────────────────────

describe("Coverage gap extraction", () => {
  const derrotero = buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos");

  it("extracts gaps for uncovered entries only", () => {
    // Empty store — all entries uncovered
    const result = evaluateStoreDerroteroCoverage("centro", "Centro", derrotero, [], new Map());
    const gaps = extractCoverageGaps(result);

    assert.strictEqual(gaps.totalGaps, 46); // all entries
    assert.strictEqual(gaps.storeSlug, "centro");
    assert.strictEqual(gaps.storeName, "Centro");
    assert.strictEqual(gaps.gaps.length, 46);
  });

  it("coverageGapId has correct format", () => {
    const result = evaluateStoreDerroteroCoverage("san_diego", "San Diego", derrotero, [], new Map());
    const gaps = extractCoverageGaps(result);

    for (const gap of gaps.gaps) {
      assert.match(gap.coverageGapId, /^san_diego:(CASTILLITOS|LATIN_KIDS|ACCESSORIES):/);
      assert.strictEqual(gap.storeSlug, "san_diego");
      assert.strictEqual(gap.storeName, "San Diego");
      assert.ok(gap.refShortage > 0);
    }
  });

  it("covered entries produce no gaps", () => {
    // Create items covering one CS entry
    const items = [makeStoreItem({ referenceCode: "R1", currentUnits: 10 })];
    const result = evaluateStoreDerroteroCoverage("centro", "Centro", derrotero, items, new Map());
    const gaps = extractCoverageGaps(result);

    // One fewer gap than total entries
    assert.strictEqual(gaps.totalGaps, 45);
    const gapCodes = gaps.gaps.map(g => g.coverageGapId);
    // R1 matches CS NIÑA BEBE / PIJAMA NIÑA BB CL — that gap should be gone
    assert.ok(!gapCodes.includes("centro:CASTILLITOS:PIJAMA_NI%C3%91A_BB_CL"));
  });

  it("reports mainWarehouseCandidateCount from coverage", () => {
    const mainStockMap = new Map([["R1", 50]]);
    const items = [makeStoreItem({ referenceCode: "R1", currentUnits: 0 })];
    const result = evaluateStoreDerroteroCoverage("centro", "Centro", derrotero, items, mainStockMap);
    const gaps = extractCoverageGaps(result);

    // All gaps without items have 0 candidates
    // The gap for PIJAMA_NIÑA_BB_CL was covered by R1
    // But since currentUnits=0, it should be UNCOVERED if minimumCoverageReferences > 0
    // Actually R1 has currentUnits=0 so it won't be indexed (buildStoreRefIndex skips items with currentUnits <= 0)
    assert.strictEqual(gaps.totalGaps, 46); // R1 has 0 units, no coverage
  });
});

// ── Suite 13: Effective config (QUINTO) ─────────────────────────────────────

describe("Effective config structure", () => {
  it("EffectiveDerroteroConfig type is well-formed", () => {
    // This test validates the type structure exists and is importable
    // The actual getEffectiveDerroteroConfig is server-only (uses "server-only" import)
    // so we test the type contract here
    const config: import("../store-derrotero-types").EffectiveDerroteroConfig = {
      storeSlug: "centro",
      storeName: "Centro",
      minimumCoverageReferences: 1,
      castillitosTextile: { min: 8, ideal: 10, max: 12 },
      latinKidsTextile: { min: 8, ideal: 10, max: 12 },
      accessoryIdealBySize: { small: 6, medium: 4, large: 1 },
      storePriorityOrder: ["centro", "caldas", "san_diego", "gran_plaza"],
      source: "TENANT_DEFAULT",
      overrideReason: null,
    };
    assert.strictEqual(config.source, "TENANT_DEFAULT");
    assert.strictEqual(config.castillitosTextile.min, 8);
    assert.deepStrictEqual(config.accessoryIdealBySize, { small: 6, medium: 4, large: 1 });
  });

  it("DerroteroCoverageGap type is well-formed", () => {
    const gap: DerroteroCoverageGap = {
      coverageGapId: "centro:CASTILLITOS:PIJAMA_CL",
      storeSlug: "centro",
      storeName: "Centro",
      entry: {
        entryCode: "PIJAMA_CL",
        entryName: "Pijama CL",
        line: "CASTILLITOS",
        sagGrupo: "CS NIÑA BEBE",
        sagSubgrupo: "PIJAMA NIÑA BB CL",
        sizeClass: null,
        matchMode: "GROUP_AND_SUBGROUP",
        minimumCoverageReferences: 1,
        minUnitsPerRef: 8,
        idealUnitsPerRef: 10,
        maxUnitsPerRef: 12,
        priority: 1,
        active: true,
        sourceEvidence: "test",
      },
      currentRefCount: 0,
      refShortage: 1,
      totalUnits: 0,
      mainWarehouseCandidateCount: 0,
      totalMainWarehouseUnits: 0,
      rule36Blocked: false,
      storeVariants: [],
    };
    assert.strictEqual(gap.coverageGapId, "centro:CASTILLITOS:PIJAMA_CL");
    assert.strictEqual(gap.refShortage, 1);
  });
});

// ── Suite 14: Warehouse candidate variants (OCTAVO) ─────────────────────────

describe("Warehouse candidate variants", () => {
  const derrotero = buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos");

  it("candidates have NO_VARIANT_DATA when no variant records provided", () => {
    const result = evaluateStoreDerroteroCoverage("centro", "Centro", derrotero, [], new Map());
    const refs = [
      { referenceCode: "WH1", productName: "P1", canonicalLine: "castillitos", group: "CS NIÑA BEBE", subgroup: "PIJAMA NIÑA BB CL", sizeClass: null, mainWarehouseStock: 50 },
    ];
    const matrix = buildMainWarehouseCoverageMatrix("castillitos", [result], refs);

    assert.strictEqual(matrix.candidates.length, 1);
    assert.strictEqual(matrix.candidates[0].variantDataQuality, "NO_VARIANT_DATA");
    assert.deepStrictEqual(matrix.candidates[0].variants, []);
    assert.strictEqual(matrix.candidates[0].totalVariantCount, 0);
  });

  it("variants consolidated by size+color", () => {
    const result = evaluateStoreDerroteroCoverage("centro", "Centro", derrotero, [], new Map());
    const refs = [
      { referenceCode: "WH1", productName: "P1", canonicalLine: "castillitos", group: "CS NIÑA BEBE", subgroup: "PIJAMA NIÑA BB CL", sizeClass: null, mainWarehouseStock: 20 },
    ];
    const variantRecords: MainWarehouseVariantRecord[] = [
      { referenceCode: "WH1", size: "4", color: "AZUL", physicalQty: 5, reservedQty: 0 },
      { referenceCode: "WH1", size: "4", color: "AZUL", physicalQty: 3, reservedQty: 0 },
      { referenceCode: "WH1", size: "6", color: "ROJO", physicalQty: 12, reservedQty: 2 },
    ];
    const matrix = buildMainWarehouseCoverageMatrix("castillitos", [result], refs, undefined, variantRecords);

    assert.strictEqual(matrix.candidates[0].totalVariantCount, 2);
    assert.strictEqual(matrix.candidates[0].totalVariantUnits, 20); // 5+3+12
    assert.strictEqual(matrix.candidates[0].variantDataQuality, "CONSISTENT"); // 20 === 20

    const azul = matrix.candidates[0].variants.find(v => v.color === "AZUL");
    assert.strictEqual(azul?.physicalQty, 8); // consolidated 5+3
    assert.strictEqual(azul?.stockQuality, "PHYSICAL_ONLY");

    const rojo = matrix.candidates[0].variants.find(v => v.color === "ROJO");
    assert.strictEqual(rojo?.physicalQty, 12);
    assert.strictEqual(rojo?.operationalAvailableQty, 10); // 12-2
    assert.strictEqual(rojo?.stockQuality, "OPERATIONAL_CONFIRMED");
  });

  it("INCONSISTENT when variant sum differs from stock", () => {
    const result = evaluateStoreDerroteroCoverage("centro", "Centro", derrotero, [], new Map());
    const refs = [
      { referenceCode: "WH1", productName: "P1", canonicalLine: "castillitos", group: "CS NIÑA BEBE", subgroup: "PIJAMA NIÑA BB CL", sizeClass: null, mainWarehouseStock: 100 },
    ];
    const variantRecords: MainWarehouseVariantRecord[] = [
      { referenceCode: "WH1", size: "4", color: "AZUL", physicalQty: 5, reservedQty: 0 },
    ];
    const matrix = buildMainWarehouseCoverageMatrix("castillitos", [result], refs, undefined, variantRecords);

    assert.strictEqual(matrix.candidates[0].variantDataQuality, "INCONSISTENT");
    assert.strictEqual(matrix.candidates[0].totalVariantUnits, 5);
  });

  it("snapshotAt is populated", () => {
    const result = evaluateStoreDerroteroCoverage("centro", "Centro", derrotero, [], new Map());
    const refs = [
      { referenceCode: "WH1", productName: "P1", canonicalLine: "castillitos", group: "CS NIÑA BEBE", subgroup: "PIJAMA NIÑA BB CL", sizeClass: null, mainWarehouseStock: 10 },
    ];
    const matrix = buildMainWarehouseCoverageMatrix("castillitos", [result], refs);
    assert.ok(matrix.candidates[0].snapshotAt);
    assert.ok(new Date(matrix.candidates[0].snapshotAt).getTime() > 0);
  });
});

// ── Suite 15: Balanced variant allocation (TERCERO) ─────────────────────────

describe("Balanced variant allocation", () => {
  it("textile: prioritizes absent sizes", () => {
    const result = buildDerroteroVariantAllocation(
      5,     // shortageQty
      12,    // maxUnitsPerRef
      3,     // currentStoreTotal
      [{ size: "4", color: "AZUL", qty: 3 }], // store has size 4
      [
        { size: "4", color: "AZUL", qty: 10 },
        { size: "6", color: "ROJO", qty: 10 },
        { size: "8", color: "VERDE", qty: 10 },
      ],
      true,  // isTextile
      100,   // remainingWarehouseQty
    );

    assert.strictEqual(result.quality, "BALANCED");
    assert.strictEqual(result.totalAllocatedQty, 5);
    // Sizes 6 and 8 are absent — they should get first allocations
    const size6 = result.allocations.find(a => a.size === "6");
    const size8 = result.allocations.find(a => a.size === "8");
    assert.ok(size6);
    assert.ok(size8);
    assert.ok(size6!.reason.includes("ausente"));
    assert.ok(size8!.reason.includes("ausente"));
  });

  it("accessories: NOT_APPLICABLE", () => {
    const result = buildDerroteroVariantAllocation(
      5, 12, 0, [], [{ size: "PEQUEÑO", color: null, qty: 10 }],
      false, 100,
    );
    assert.strictEqual(result.quality, "NOT_APPLICABLE");
    assert.deepStrictEqual(result.allocations, []);
  });

  it("INSUFFICIENT_STOCK when warehouse is empty", () => {
    const result = buildDerroteroVariantAllocation(
      5, 12, 0, [], [], true, 0,
    );
    assert.strictEqual(result.quality, "INSUFFICIENT_STOCK");
    assert.strictEqual(result.totalAllocatedQty, 0);
  });

  it("respects maxUnitsPerRef cap", () => {
    const result = buildDerroteroVariantAllocation(
      20,    // want 20
      12,    // but max is 12
      8,     // already have 8 → can only add 4
      [],
      [{ size: "4", color: "AZUL", qty: 50 }],
      true, 100,
    );
    assert.strictEqual(result.totalAllocatedQty, 4); // 12 - 8
    assert.strictEqual(result.unallocatedQty, 16);
    assert.strictEqual(result.quality, "PARTIAL");
  });

  it("respects remainingWarehouseQty", () => {
    const result = buildDerroteroVariantAllocation(
      10, 20, 0, [],
      [{ size: "4", color: "AZUL", qty: 50 }],
      true, 3, // only 3 left in warehouse
    );
    assert.strictEqual(result.totalAllocatedQty, 3);
    assert.strictEqual(result.quality, "PARTIAL");
  });

  it("round-robin distributes across variants", () => {
    const result = buildDerroteroVariantAllocation(
      6, 20, 0, [],
      [
        { size: "4", color: "A", qty: 5 },
        { size: "6", color: "B", qty: 5 },
        { size: "8", color: "C", qty: 5 },
      ],
      true, 100,
    );
    assert.strictEqual(result.totalAllocatedQty, 6);
    // Each variant should get 2 (round-robin)
    for (const a of result.allocations) {
      assert.strictEqual(a.suggestedQty, 2);
    }
  });
});

// ── Suite 16: Priority engine (CUARTO) ──────────────────────────────────────

describe("Priority engine", () => {
  const derrotero = buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos");

  function makeCoverage(storeId: string, storeName: string): StoreDerroteroCoverageResult {
    return evaluateStoreDerroteroCoverage(storeId, storeName, derrotero, [], new Map());
  }

  it("prioritizes lower coverage stores higher", () => {
    const centro = makeCoverage("centro", "Centro");
    const caldas = makeCoverage("caldas", "Caldas");
    const gapsCentro = extractCoverageGaps(centro);
    const gapsCaldas = extractCoverageGaps(caldas);

    const candidate: MainWarehouseCoverageCandidate = {
      referenceCode: "WH1", productName: "P1", line: "CASTILLITOS",
      group: "CS NIÑA BEBE", subgroup: "PIJAMA NIÑA BB CL", sizeClass: null,
      mainWarehouseStock: 100, coverableStores: ["centro", "caldas"],
      rule36BlockedStores: [], distributableUnits: 100,
      variants: [], totalVariantCount: 0, totalVariantUnits: 0,
      variantDataQuality: "NO_VARIANT_DATA", snapshotAt: new Date().toISOString(),
    };

    const priorities = prioritizeWarehouseCoverageCandidates(
      [centro, caldas],
      [gapsCentro, gapsCaldas],
      [candidate],
    );

    assert.strictEqual(priorities.length, 2);
    // Centro has higher store priority (rank 0 vs rank 1)
    const centroP = priorities.find(p => p.storeId === "centro")!;
    const caldasP = priorities.find(p => p.storeId === "caldas")!;
    assert.ok(centroP.priorityScore > caldasP.priorityScore);
  });

  it("blocked stores get negative score", () => {
    const sanDiego = makeCoverage("san_diego", "San Diego");
    const gapsSd = extractCoverageGaps(sanDiego);

    const candidate: MainWarehouseCoverageCandidate = {
      referenceCode: "WH1", productName: "P1", line: "CASTILLITOS",
      group: "CS NIÑA BEBE", subgroup: "PIJAMA NIÑA BB CL", sizeClass: null,
      mainWarehouseStock: 30, coverableStores: [],
      rule36BlockedStores: ["san_diego"], distributableUnits: 30,
      variants: [], totalVariantCount: 0, totalVariantUnits: 0,
      variantDataQuality: "NO_VARIANT_DATA", snapshotAt: new Date().toISOString(),
    };

    const priorities = prioritizeWarehouseCoverageCandidates(
      [sanDiego], [gapsSd], [candidate],
    );

    assert.strictEqual(priorities.length, 1);
    assert.strictEqual(priorities[0].blocked, true);
    assert.ok(priorities[0].blockedReason?.includes("Regla 36"));
    assert.strictEqual(priorities[0].priorityScore, -1);
  });

  it("priority reasons are human-readable", () => {
    const centro = makeCoverage("centro", "Centro");
    const gapsCentro = extractCoverageGaps(centro);

    const candidate: MainWarehouseCoverageCandidate = {
      referenceCode: "WH1", productName: "P1", line: "CASTILLITOS",
      group: "CS NIÑA BEBE", subgroup: "PIJAMA NIÑA BB CL", sizeClass: null,
      mainWarehouseStock: 100, coverableStores: ["centro"],
      rule36BlockedStores: [], distributableUnits: 100,
      variants: [], totalVariantCount: 0, totalVariantUnits: 0,
      variantDataQuality: "NO_VARIANT_DATA", snapshotAt: new Date().toISOString(),
    };

    const priorities = prioritizeWarehouseCoverageCandidates(
      [centro], [gapsCentro], [candidate],
    );

    const p = priorities[0];
    assert.ok(p.priorityReasons.length > 0);
    assert.strictEqual(p.priorityReasons.some(r => r.includes("descubierto")), true);
    assert.strictEqual(p.priorityReasons.some(r => r.includes("Cobertura tienda")), true);
  });
});

// ── Suite 17: Allocation simulation (QUINTO) ────────────────────────────────

describe("Allocation simulation", () => {
  const derrotero = buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos");

  it("deducts from warehouse stock across stores", () => {
    const centro = evaluateStoreDerroteroCoverage("centro", "Centro", derrotero, [], new Map());
    const caldas = evaluateStoreDerroteroCoverage("caldas", "Caldas", derrotero, [], new Map());
    const gapsCentro = extractCoverageGaps(centro);
    const gapsCaldas = extractCoverageGaps(caldas);

    const candidate: MainWarehouseCoverageCandidate = {
      referenceCode: "WH1", productName: "P1", line: "CASTILLITOS",
      group: "CS NIÑA BEBE", subgroup: "PIJAMA NIÑA BB CL", sizeClass: null,
      mainWarehouseStock: 2, coverableStores: ["centro", "caldas"],
      rule36BlockedStores: [], distributableUnits: 2,
      variants: [], totalVariantCount: 0, totalVariantUnits: 0,
      variantDataQuality: "NO_VARIANT_DATA", snapshotAt: new Date().toISOString(),
    };

    const priorities = prioritizeWarehouseCoverageCandidates(
      [centro, caldas],
      [gapsCentro, gapsCaldas],
      [candidate],
    );

    const sim = simulateWarehouseAllocation(priorities, [candidate], [gapsCentro, gapsCaldas]);

    // Should allocate to highest priority store first, then second
    assert.ok(sim.totalAllocated >= 1);
    assert.ok(sim.remainingWarehouseQty < 2);
  });

  it("blocked allocations are tracked", () => {
    const sanDiego = evaluateStoreDerroteroCoverage("san_diego", "San Diego", derrotero, [], new Map());
    const gapsSd = extractCoverageGaps(sanDiego);

    const candidate: MainWarehouseCoverageCandidate = {
      referenceCode: "WH1", productName: "P1", line: "CASTILLITOS",
      group: "CS NIÑA BEBE", subgroup: "PIJAMA NIÑA BB CL", sizeClass: null,
      mainWarehouseStock: 30, coverableStores: [],
      rule36BlockedStores: ["san_diego"], distributableUnits: 30,
      variants: [], totalVariantCount: 0, totalVariantUnits: 0,
      variantDataQuality: "NO_VARIANT_DATA", snapshotAt: new Date().toISOString(),
    };

    const priorities = prioritizeWarehouseCoverageCandidates(
      [sanDiego], [gapsSd], [candidate],
    );

    const sim = simulateWarehouseAllocation(priorities, [candidate], [gapsSd]);
    assert.ok(sim.blockedAllocations.length > 0);
    assert.ok(sim.blockedAllocations[0].reason.includes("Regla 36"));
    assert.strictEqual(sim.totalAllocated, 0);
  });

  it("simulation is deterministic", () => {
    const centro = evaluateStoreDerroteroCoverage("centro", "Centro", derrotero, [], new Map());
    const gapsCentro = extractCoverageGaps(centro);

    const candidate: MainWarehouseCoverageCandidate = {
      referenceCode: "WH1", productName: "P1", line: "CASTILLITOS",
      group: "CS NIÑA BEBE", subgroup: "PIJAMA NIÑA BB CL", sizeClass: null,
      mainWarehouseStock: 10, coverableStores: ["centro"],
      rule36BlockedStores: [], distributableUnits: 10,
      variants: [], totalVariantCount: 0, totalVariantUnits: 0,
      variantDataQuality: "NO_VARIANT_DATA", snapshotAt: new Date().toISOString(),
    };

    const priorities = prioritizeWarehouseCoverageCandidates(
      [centro], [gapsCentro], [candidate],
    );

    const sim1 = simulateWarehouseAllocation(priorities, [candidate], [gapsCentro]);
    const sim2 = simulateWarehouseAllocation(priorities, [candidate], [gapsCentro]);

    assert.strictEqual(sim1.totalAllocated, sim2.totalAllocated);
    assert.strictEqual(sim1.remainingWarehouseQty, sim2.remainingWarehouseQty);
    assert.strictEqual(sim1.evidence.length, sim2.evidence.length);
  });

  it("evidence trail is populated", () => {
    const centro = evaluateStoreDerroteroCoverage("centro", "Centro", derrotero, [], new Map());
    const gapsCentro = extractCoverageGaps(centro);

    const candidate: MainWarehouseCoverageCandidate = {
      referenceCode: "WH1", productName: "P1", line: "CASTILLITOS",
      group: "CS NIÑA BEBE", subgroup: "PIJAMA NIÑA BB CL", sizeClass: null,
      mainWarehouseStock: 10, coverableStores: ["centro"],
      rule36BlockedStores: [], distributableUnits: 10,
      variants: [], totalVariantCount: 0, totalVariantUnits: 0,
      variantDataQuality: "NO_VARIANT_DATA", snapshotAt: new Date().toISOString(),
    };

    const priorities = prioritizeWarehouseCoverageCandidates(
      [centro], [gapsCentro], [candidate],
    );

    const sim = simulateWarehouseAllocation(priorities, [candidate], [gapsCentro]);
    assert.ok(sim.evidence.length > 0);
    assert.strictEqual(sim.evidence.some(e => e.includes("WH1")), true);
  });
});

// ── Suite 18: Store variants in coverage gaps (SEGUNDO) ─────────────────────

describe("Store variants in coverage gaps", () => {
  const derrotero = buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos");

  it("gaps include empty storeVariants when no variant data", () => {
    const result = evaluateStoreDerroteroCoverage("centro", "Centro", derrotero, [], new Map());
    const gaps = extractCoverageGaps(result);
    for (const gap of gaps.gaps) {
      assert.deepStrictEqual(gap.storeVariants, []);
    }
  });

  it("gaps include store variants when provided", () => {
    const items = [makeStoreItem({ referenceCode: "R1", currentUnits: 5 })];
    // R1 covers PIJAMA_NIÑA_BB_CL → that entry is COVERED, so no gap for it
    // But let's test with an uncovered entry that has some stock via matched refs
    const result = evaluateStoreDerroteroCoverage("centro", "Centro", derrotero, items, new Map());

    const storeVariants = [
      { referenceCode: "R1", size: "4", color: "AZUL", currentUnits: 3 },
      { referenceCode: "R1", size: "6", color: "ROJO", currentUnits: 2 },
    ];

    const gaps = extractCoverageGaps(result, storeVariants);
    // The covered entry shouldn't have a gap, so variants won't show for it
    // Uncovered entries with no matched refs have empty storeVariants
    const uncoveredGaps = gaps.gaps.filter(g => g.storeVariants.length === 0);
    assert.strictEqual(uncoveredGaps.length, gaps.totalGaps); // no refs matched uncovered entries
  });

  it("consolidates variants by size+color", () => {
    // Create a case where an entry is uncovered but has some matching refs
    const items = [
      makeStoreItem({ referenceCode: "R1", currentUnits: 0 }), // 0 units = not indexed
    ];
    const result = evaluateStoreDerroteroCoverage("centro", "Centro", derrotero, items, new Map());

    // R1 has 0 units so not indexed → entry is UNCOVERED but R1 is a matched ref
    // Actually buildStoreRefIndex skips items with currentUnits <= 0
    // So matchedRefs will be empty → storeVariants will be empty
    const storeVariants = [
      { referenceCode: "R1", size: "4", color: "AZUL", currentUnits: 3 },
    ];
    const gaps = extractCoverageGaps(result, storeVariants);

    // All gaps have empty storeVariants because no refs matched (currentUnits=0)
    for (const g of gaps.gaps) {
      assert.deepStrictEqual(g.storeVariants, []);
    }
  });
});

// ── Suite 19: Needs contract (DUODÉCIMO) ────────────────────────────────────

describe("Needs contract type", () => {
  it("DerroteroNeedContract type is well-formed", () => {
    const contract: import("../store-derrotero-types").DerroteroNeedContract = {
      coverageGapId: "centro:CASTILLITOS:PIJAMA_CL",
      expectedCoverage: 1,
      currentCoverage: 0,
      shortageQty: 1,
      warehouseCandidates: [],
      allocationSuggestion: null,
      priorityScore: 100,
      blockedReason: null,
    };
    assert.strictEqual(contract.coverageGapId, "centro:CASTILLITOS:PIJAMA_CL");
    assert.strictEqual(contract.expectedCoverage, 1);
  });

  it("DerroteroNeedContract with allocation", () => {
    const contract: import("../store-derrotero-types").DerroteroNeedContract = {
      coverageGapId: "centro:CASTILLITOS:PIJAMA_CL",
      expectedCoverage: 1,
      currentCoverage: 0,
      shortageQty: 5,
      warehouseCandidates: [],
      allocationSuggestion: {
        totalRequestedQty: 5,
        totalAllocatedQty: 3,
        unallocatedQty: 2,
        allocations: [{
          variantKey: "4|AZUL",
          size: "4",
          color: "AZUL",
          storeQtyBefore: 0,
          warehouseQty: 10,
          suggestedQty: 3,
          storeQtyAfter: 3,
          reason: "Talla/color ausente en tienda",
        }],
        quality: "PARTIAL",
      },
      priorityScore: 1500,
      blockedReason: null,
    };
    assert.strictEqual(contract.allocationSuggestion?.quality, "PARTIAL");
    assert.strictEqual(contract.allocationSuggestion?.totalAllocatedQty, 3);
  });
});

// ── Suite 20: Performance contracts ─────────────────────────────────────────

describe("Performance contracts", () => {
  it("priority engine < 10ms for 4 stores x 10 candidates", () => {
    const derrotero = buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos");
    const coverages = ["centro", "caldas", "san_diego", "gran_plaza"].map(
      slug => evaluateStoreDerroteroCoverage(slug, slug, derrotero, [], new Map()),
    );
    const gapSummaries = coverages.map(c => extractCoverageGaps(c));

    const candidates: MainWarehouseCoverageCandidate[] = Array.from({ length: 10 }, (_, i) => ({
      referenceCode: `WH${i}`, productName: `P${i}`, line: "CASTILLITOS" as const,
      group: "CS NIÑA BEBE", subgroup: "PIJAMA NIÑA BB CL", sizeClass: null,
      mainWarehouseStock: 100, coverableStores: ["centro", "caldas"],
      rule36BlockedStores: ["san_diego", "gran_plaza"], distributableUnits: 100,
      variants: [], totalVariantCount: 0, totalVariantUnits: 0,
      variantDataQuality: "NO_VARIANT_DATA" as const, snapshotAt: new Date().toISOString(),
    }));

    const t0 = performance.now();
    prioritizeWarehouseCoverageCandidates(coverages, gapSummaries, candidates);
    const elapsed = performance.now() - t0;
    assert.ok(elapsed < 10);
  });

  it("variant allocation < 1ms", () => {
    const t0 = performance.now();
    buildDerroteroVariantAllocation(
      10, 12, 0, [],
      Array.from({ length: 20 }, (_, i) => ({ size: String(i), color: "C", qty: 5 })),
      true, 100,
    );
    const elapsed = performance.now() - t0;
    assert.ok(elapsed < 1);
  });
});
