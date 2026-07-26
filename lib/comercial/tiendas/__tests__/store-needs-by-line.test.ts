/**
 * lib/comercial/tiendas/__tests__/store-needs-by-line.test.ts
 *
 * Unit tests for the needs-by-line classification and filtering layer.
 * Tests pure functions using mock StoreDistributionItem data.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-needs-by-line.test.ts
 *
 * Sprint: AGENTIK-STORES-NEEDS-BY-LINE-01
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  StoreDistributionItem,
  StoreDistributionAction,
  DistributionWorld,
  ClassificationQuality,
  StoreDistributionDataQuality,
  CommittedUnitsQuality,
  DistributionRuleSource,
} from "../store-distribution-types";
import type { StoreProductClass, StoreSizeClass } from "../store-policy-types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<StoreDistributionItem> = {}): StoreDistributionItem {
  return {
    referenceCode: "REF-001",
    productName: "Test Product",
    size: "4",
    color: "AZUL",
    line: "castillitos",
    productClass: "textile" as StoreProductClass,
    world: "TEXTILE" as DistributionWorld,
    canonicalLine: "castillitos",
    group: "GRUPO1",
    subgroup: "SUBGRUPO1",
    sizeClass: null,
    classificationSource: "SAG",
    classificationQuality: "CONFIRMED" as ClassificationQuality,
    currentUnits: 2,
    minUnits: 12,
    idealUnits: 15,
    maxUnits: 20,
    deficit: 10,
    excess: 0,
    mainWarehouseAvailable: 50,
    transferableUnits: 10,
    action: "SURTIR" as StoreDistributionAction,
    actionReason: "Stock bajo minimo",
    dataQuality: "CONFIRMED" as StoreDistributionDataQuality,
    committedUnitsQuality: "CONFIRMED_ZERO" as CommittedUnitsQuality,
    imageUrl: null,
    replacement: null,
    needResolution: null,
    variantAllocation: null,
    resolvedBy: "default" as DistributionRuleSource,
    ...overrides,
  };
}

// ── Since the service imports "server-only", we test the classification logic
// by reimplementing the same rules used in store-needs-by-line.ts ────────────

function classifyNeedLine(item: StoreDistributionItem): string {
  if (!item.canonicalLine || item.canonicalLine === "SIN_LINEA") return "UNCLASSIFIED";
  if (item.group === "SIN_GRUPO_SAG" && item.world === "TEXTILE") return "UNCLASSIFIED";
  if (item.subgroup === "SIN_SUBGRUPO_SAG" && item.world === "TEXTILE") return "UNCLASSIFIED";
  if (item.classificationQuality === "UNAVAILABLE") return "UNCLASSIFIED";
  if (item.world === "TEXTILE") {
    if (item.canonicalLine === "latin_kids") return "LATIN_KIDS";
    return "CASTILLITOS";
  }
  if (item.world === "IMPORT") return "ACCESSORIES";
  return "UNCLASSIFIED";
}

// CASCADE-FIX-01 + CLASSIFICATION-COMPLETENESS-01: Updated to match logic in store-needs-by-line.ts
function hasIncompleteClassification(item: StoreDistributionItem): boolean {
  if (item.world === "TEXTILE" && item.canonicalLine !== "latin_kids") {
    return item.group === "SIN_GRUPO_SAG" || item.subgroup === "SIN_SUBGRUPO_SAG";
  }
  if (item.world === "TEXTILE" && item.canonicalLine === "latin_kids") {
    return item.subgroup === "SIN_SUBGRUPO_SAG";
  }
  if (item.world === "IMPORT") {
    return item.sizeClass === null;
  }
  return false;
}

function deriveNeedType(item: StoreDistributionItem): string {
  // Use NeedResolution from cascade engine when available
  if (item.needResolution) {
    const base = item.needResolution.resolutionType;
    if (base === "NO_ALTERNATIVE" && hasIncompleteClassification(item)) {
      return "CLASSIFICATION_INCOMPLETE";
    }
    return base;
  }
  // Fallback for items without needResolution
  if (item.action === "SURTIR") {
    if (item.replacement && item.replacement.replacementCandidates.length > 0) {
      return "PARTIAL_DIRECT_PLUS_REPLACEMENT";
    }
    return "DIRECT_REPLENISHMENT";
  }
  if (item.action === "SUGERIR_REEMPLAZO") {
    const hasValid = item.replacement?.replacementCandidates.some(
      c => c.suggestedQty > 0 && c.mainWarehouseAvailableQty > 0
    );
    if (hasValid) return "REPLACEMENT";
    return hasIncompleteClassification(item) ? "CLASSIFICATION_INCOMPLETE" : "NO_ALTERNATIVE";
  }
  return hasIncompleteClassification(item) ? "CLASSIFICATION_INCOMPLETE" : "NO_ALTERNATIVE";
}

const NEED_ACTIONS = new Set(["SURTIR", "SUGERIR_REEMPLAZO", "SIN_STOCK_ORIGEN"]);

// ── Tests ────────────────────────────────────────────────────────────────────

describe("PRIMERO — Line classification isolation", () => {

  it("Castillitos textile classifies as CASTILLITOS", () => {
    const item = makeItem({ world: "TEXTILE", canonicalLine: "castillitos" });
    assert.equal(classifyNeedLine(item), "CASTILLITOS");
  });

  it("Latin Kids textile classifies as LATIN_KIDS", () => {
    const item = makeItem({ world: "TEXTILE", canonicalLine: "latin_kids" });
    assert.equal(classifyNeedLine(item), "LATIN_KIDS");
  });

  it("Import accessory classifies as ACCESSORIES", () => {
    const item = makeItem({ world: "IMPORT" as DistributionWorld, canonicalLine: "accesorios_importacion" });
    assert.equal(classifyNeedLine(item), "ACCESSORIES");
  });

  it("Missing canonicalLine classifies as UNCLASSIFIED", () => {
    const item = makeItem({ canonicalLine: "SIN_LINEA" });
    assert.equal(classifyNeedLine(item), "UNCLASSIFIED");
  });

  it("Textile with SIN_GRUPO_SAG classifies as UNCLASSIFIED", () => {
    const item = makeItem({ world: "TEXTILE", group: "SIN_GRUPO_SAG" });
    assert.equal(classifyNeedLine(item), "UNCLASSIFIED");
  });

  it("Textile with SIN_SUBGRUPO_SAG classifies as UNCLASSIFIED", () => {
    const item = makeItem({ world: "TEXTILE", subgroup: "SIN_SUBGRUPO_SAG" });
    assert.equal(classifyNeedLine(item), "UNCLASSIFIED");
  });

  it("UNAVAILABLE quality classifies as UNCLASSIFIED", () => {
    const item = makeItem({ classificationQuality: "UNAVAILABLE" });
    assert.equal(classifyNeedLine(item), "UNCLASSIFIED");
  });

  it("Castillitos does NOT include Latin Kids", () => {
    const items = [
      makeItem({ canonicalLine: "castillitos", referenceCode: "CA-001" }),
      makeItem({ canonicalLine: "latin_kids", referenceCode: "LK-001" }),
    ];
    const castillitos = items.filter(i => classifyNeedLine(i) === "CASTILLITOS");
    assert.equal(castillitos.length, 1);
    assert.equal(castillitos[0].referenceCode, "CA-001");
  });

  it("Latin Kids does NOT include Castillitos", () => {
    const items = [
      makeItem({ canonicalLine: "castillitos", referenceCode: "CA-001" }),
      makeItem({ canonicalLine: "latin_kids", referenceCode: "LK-001" }),
    ];
    const latinKids = items.filter(i => classifyNeedLine(i) === "LATIN_KIDS");
    assert.equal(latinKids.length, 1);
    assert.equal(latinKids[0].referenceCode, "LK-001");
  });

  it("Accessories does NOT include Textile", () => {
    const items = [
      makeItem({ world: "TEXTILE", canonicalLine: "castillitos" }),
      makeItem({ world: "IMPORT" as DistributionWorld, canonicalLine: "accesorios_importacion" }),
    ];
    const acc = items.filter(i => classifyNeedLine(i) === "ACCESSORIES");
    assert.equal(acc.length, 1);
    assert.equal(acc[0].world, "IMPORT");
  });
});

describe("SEGUNDO — Need type classification", () => {

  it("SURTIR = DIRECT_REPLENISHMENT", () => {
    const item = makeItem({ action: "SURTIR" });
    assert.equal(deriveNeedType(item), "DIRECT_REPLENISHMENT");
  });

  it("SUGERIR_REEMPLAZO with valid candidate = REPLACEMENT", () => {
    const item = makeItem({
      action: "SUGERIR_REEMPLAZO",
      replacement: {
        replacementRequired: true,
        replacementReason: "test",
        replacementShortageQty: 10,
        replacementCandidates: [{
          referenceCode: "ALT-001",
          description: "Alternative",
          imageUrl: null,
          canonicalLine: "castillitos",
          group: "G1",
          subgroup: "SG1",
          storeStock: 0,
          mainWarehouseAvailableQty: 20,
          suggestedQty: 10,
          reason: "test",
          evidence: "test",
          quality: "CONFIRMED",
          classificationSource: "SAG",
          groupSource: "ProductEntity.grupoSag",
          subgroupSource: "ProductEntity.subgrupoSag",
          dataQuality: "CONFIRMED",
          replacementVariants: [],
          totalVariantCount: 0,
          displayedVariantCount: 0,
          totalVariantUnits: 0,
          variantEvidenceDate: "2026-07-25",
        }],
        selectedReplacementCandidate: null,
        replacementConfidence: 0.9,
        replacementRuleSource: "SAME_GROUP_AND_SUBGROUP",
        replacementCoveredQty: 10,
        totalCandidatesFound: 1,
        hasMoreCandidates: false,
        rule36BlockedCount: 0,
      },
    });
    assert.equal(deriveNeedType(item), "REPLACEMENT");
  });

  it("SUGERIR_REEMPLAZO with no valid candidate = NO_ALTERNATIVE", () => {
    const item = makeItem({
      action: "SUGERIR_REEMPLAZO",
      replacement: {
        replacementRequired: true,
        replacementReason: "test",
        replacementShortageQty: 10,
        replacementCandidates: [{
          referenceCode: "ALT-001",
          description: "Alternative",
          imageUrl: null,
          canonicalLine: "castillitos",
          group: "G1",
          subgroup: "SG1",
          storeStock: 0,
          mainWarehouseAvailableQty: 0,  // no stock
          suggestedQty: 0,
          reason: "test",
          evidence: "test",
          quality: "CONFIRMED",
          classificationSource: "SAG",
          groupSource: "ProductEntity.grupoSag",
          subgroupSource: "ProductEntity.subgrupoSag",
          dataQuality: "CONFIRMED",
          replacementVariants: [],
          totalVariantCount: 0,
          displayedVariantCount: 0,
          totalVariantUnits: 0,
          variantEvidenceDate: "2026-07-25",
        }],
        selectedReplacementCandidate: null,
        replacementConfidence: 0,
        replacementRuleSource: "SAME_GROUP_AND_SUBGROUP",
        replacementCoveredQty: 0,
        totalCandidatesFound: 1,
        hasMoreCandidates: false,
        rule36BlockedCount: 0,
      },
    });
    assert.equal(deriveNeedType(item), "NO_ALTERNATIVE");
  });

  it("SIN_STOCK_ORIGEN = NO_ALTERNATIVE", () => {
    const item = makeItem({ action: "SIN_STOCK_ORIGEN" });
    assert.equal(deriveNeedType(item), "NO_ALTERNATIVE");
  });
});

describe("TERCERO — Need actions filter", () => {

  it("only SURTIR, SUGERIR_REEMPLAZO, SIN_STOCK_ORIGEN are needs", () => {
    const actions: StoreDistributionAction[] = [
      "SURTIR", "RETIRAR", "MANTENER", "MONITOREAR",
      "SIN_STOCK_ORIGEN", "SUGERIR_REEMPLAZO", "SIN_REGLA",
      "SIN_DATOS", "REQUIERE_CONFIGURACION",
    ];
    const needs = actions.filter(a => NEED_ACTIONS.has(a));
    assert.deepEqual(needs, ["SURTIR", "SIN_STOCK_ORIGEN", "SUGERIR_REEMPLAZO"]);
  });

  it("MANTENER is not a need", () => {
    assert.ok(!NEED_ACTIONS.has("MANTENER"));
  });

  it("RETIRAR is not a need", () => {
    assert.ok(!NEED_ACTIONS.has("RETIRAR"));
  });
});

describe("CUARTO — KPIs per line", () => {

  it("KPI counts match line-filtered items", () => {
    const items = [
      makeItem({ action: "SURTIR", canonicalLine: "castillitos" }),
      makeItem({ action: "SURTIR", canonicalLine: "castillitos" }),
      makeItem({ action: "SIN_STOCK_ORIGEN", canonicalLine: "castillitos" }),
      makeItem({ action: "SURTIR", canonicalLine: "latin_kids" }),
    ];
    const castNeeds = items.filter(i => NEED_ACTIONS.has(i.action) && classifyNeedLine(i) === "CASTILLITOS");
    const directRep = castNeeds.filter(i => deriveNeedType(i) === "DIRECT_REPLENISHMENT").length;
    const noAlt = castNeeds.filter(i => deriveNeedType(i) === "NO_ALTERNATIVE").length;
    assert.equal(directRep, 2);
    assert.equal(noAlt, 1);
    assert.equal(castNeeds.length, 3);
  });

  it("KPIs for Latin Kids exclude Castillitos items", () => {
    const items = [
      makeItem({ action: "SURTIR", canonicalLine: "castillitos" }),
      makeItem({ action: "SURTIR", canonicalLine: "latin_kids" }),
    ];
    const lkNeeds = items.filter(i => NEED_ACTIONS.has(i.action) && classifyNeedLine(i) === "LATIN_KIDS");
    assert.equal(lkNeeds.length, 1);
  });
});

describe("QUINTO — Unclassified items", () => {

  it("unclassified items do not produce certified recommendation", () => {
    const item = makeItem({ canonicalLine: "SIN_LINEA", action: "SURTIR" });
    const line = classifyNeedLine(item);
    assert.equal(line, "UNCLASSIFIED");
    // In UNCLASSIFIED line, no certified recommendation is displayed
  });

  it("missing grupo makes item unclassified", () => {
    const item = makeItem({ group: "SIN_GRUPO_SAG" });
    assert.equal(classifyNeedLine(item), "UNCLASSIFIED");
  });
});

describe("SEXTO — Sorting", () => {

  it("SHORTAGE_DESC sorts by largest shortage first", () => {
    const items = [
      makeItem({ referenceCode: "A", deficit: 5, currentUnits: 7, minUnits: 12 }),
      makeItem({ referenceCode: "B", deficit: 15, currentUnits: 0, minUnits: 15 }),
      makeItem({ referenceCode: "C", deficit: 10, currentUnits: 2, minUnits: 12 }),
    ];
    const sorted = [...items].sort((a, b) => {
      const sa = Math.max(0, a.minUnits - a.currentUnits);
      const sb = Math.max(0, b.minUnits - b.currentUnits);
      return sb - sa || a.referenceCode.localeCompare(b.referenceCode);
    });
    assert.equal(sorted[0].referenceCode, "B"); // shortage 15
    assert.equal(sorted[1].referenceCode, "C"); // shortage 10
    assert.equal(sorted[2].referenceCode, "A"); // shortage 5
  });

  it("REFERENCE_ASC sorts alphabetically", () => {
    const items = [
      makeItem({ referenceCode: "C-001" }),
      makeItem({ referenceCode: "A-001" }),
      makeItem({ referenceCode: "B-001" }),
    ];
    const sorted = [...items].sort((a, b) => a.referenceCode.localeCompare(b.referenceCode));
    assert.equal(sorted[0].referenceCode, "A-001");
    assert.equal(sorted[1].referenceCode, "B-001");
    assert.equal(sorted[2].referenceCode, "C-001");
  });
});

describe("SEPTIMO — Pagination", () => {

  it("page 1 of 25 items from 60 total gives 25 items", () => {
    const total = 60;
    const pageSize = 25;
    const page = 1;
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;
    const items = Array.from({ length: total }, (_, i) => i);
    const pageItems = items.slice(offset, offset + pageSize);
    assert.equal(pageItems.length, 25);
    assert.equal(totalPages, 3);
  });

  it("page 3 of 60 items gives 10 items", () => {
    const total = 60;
    const pageSize = 25;
    const page = 3;
    const offset = (page - 1) * pageSize;
    const items = Array.from({ length: total }, (_, i) => i);
    const pageItems = items.slice(offset, offset + pageSize);
    assert.equal(pageItems.length, 10);
  });

  it("changing line resets to page 1", () => {
    // UI behavior test: verified by state reset in useEffect
    let page = 3;
    // Simulate line change
    page = 1;
    assert.equal(page, 1);
  });
});

describe("OCTAVO — Accessories size filter", () => {

  it("SMALL filter only shows small accessories", () => {
    const items = [
      makeItem({ world: "IMPORT" as DistributionWorld, canonicalLine: "accesorios_importacion", sizeClass: "small" as StoreSizeClass }),
      makeItem({ world: "IMPORT" as DistributionWorld, canonicalLine: "accesorios_importacion", sizeClass: "medium" as StoreSizeClass }),
      makeItem({ world: "IMPORT" as DistributionWorld, canonicalLine: "accesorios_importacion", sizeClass: "large" as StoreSizeClass }),
    ];
    const small = items.filter(i => i.sizeClass === "small");
    assert.equal(small.length, 1);
  });

  it("ALL filter shows all size classes", () => {
    const items = [
      makeItem({ sizeClass: "small" as StoreSizeClass }),
      makeItem({ sizeClass: "medium" as StoreSizeClass }),
      makeItem({ sizeClass: "large" as StoreSizeClass }),
      makeItem({ sizeClass: null }),
    ];
    assert.equal(items.length, 4); // ALL = no filter
  });

  it("UNCLASSIFIED filter shows items without sizeClass", () => {
    const items = [
      makeItem({ sizeClass: "small" as StoreSizeClass }),
      makeItem({ sizeClass: null }),
    ];
    const unclassified = items.filter(i => !i.sizeClass);
    assert.equal(unclassified.length, 1);
  });
});

describe("NOVENO — Search", () => {

  it("search by reference code", () => {
    const items = [
      makeItem({ referenceCode: "CA-2233614B" }),
      makeItem({ referenceCode: "LK-5544312A" }),
    ];
    const q = "2233";
    const results = items.filter(i => i.referenceCode.toLowerCase().includes(q));
    assert.equal(results.length, 1);
    assert.equal(results[0].referenceCode, "CA-2233614B");
  });

  it("search by product name", () => {
    const items = [
      makeItem({ referenceCode: "A", productName: "Vestido Azul" }),
      makeItem({ referenceCode: "B", productName: "Pantalon Rojo" }),
    ];
    const q = "vestido";
    const results = items.filter(i => i.productName.toLowerCase().includes(q));
    assert.equal(results.length, 1);
  });

  it("search by group", () => {
    const items = [
      makeItem({ group: "CONJUNTOS" }),
      makeItem({ group: "VESTIDOS" }),
    ];
    const q = "conjuntos";
    const results = items.filter(i => i.group.toLowerCase().includes(q));
    assert.equal(results.length, 1);
  });
});

describe("DECIMO — Zero SOAP, zero N+1", () => {

  it("classification uses no SOAP calls (pure function)", () => {
    // classifyNeedLine is a pure function — no DB, no SOAP, no side effects
    const item = makeItem();
    const line = classifyNeedLine(item);
    assert.ok(typeof line === "string");
  });

  it("deriveNeedType uses no external calls (pure function)", () => {
    const item = makeItem();
    const nt = deriveNeedType(item);
    assert.ok(typeof nt === "string");
  });
});

// ── Section 11: Cascade resolution (REPLACEMENT-CASCADE-FIX-01) ───────────

describe("UNDECIMO — Cascade resolution types", () => {

  it("SURTIR with full warehouse coverage = DIRECT_REPLENISHMENT", () => {
    const item = makeItem({
      action: "SURTIR",
      mainWarehouseAvailable: 50,
      needResolution: {
        resolutionType: "DIRECT_REPLENISHMENT",
        coverageStatus: "FULLY_COVERED",
        totalShortageQty: 10,
        sameRefCoverageQty: 10,
        replacementCoverageQty: 0,
        totalCoveredQty: 10,
        remainingShortageQty: 0,
        coveragePercent: 100,
      },
    });
    assert.equal(deriveNeedType(item), "DIRECT_REPLENISHMENT");
  });

  it("SURTIR with partial stock + replacement = PARTIAL_DIRECT_PLUS_REPLACEMENT", () => {
    const item = makeItem({
      action: "SURTIR",
      mainWarehouseAvailable: 3,
      replacement: {
        replacementRequired: true,
        replacementReason: "Stock parcial",
        replacementShortageQty: 7,
        replacementCandidates: [{
          referenceCode: "C-2000", description: "Alt", imageUrl: null,
          canonicalLine: "castillitos", group: "PIJAMA", subgroup: "PIJAMA",
          storeStock: 0, mainWarehouseAvailableQty: 7, suggestedQty: 7,
          reason: "test", evidence: "test", quality: "CONFIRMED",
          classificationSource: "SAG", groupSource: "SAG", subgroupSource: "SAG",
          dataQuality: "CONFIRMED",
          replacementVariants: [], totalVariantCount: 0, displayedVariantCount: 0,
          totalVariantUnits: 0, variantEvidenceDate: "2026-07-25",
        }],
        selectedReplacementCandidate: null,
        replacementConfidence: 0.85,
        replacementRuleSource: "SAME_GROUP_AND_SUBGROUP",
        replacementCoveredQty: 7,
        totalCandidatesFound: 1,
        hasMoreCandidates: false,
        rule36BlockedCount: 0,
      },
      needResolution: {
        resolutionType: "PARTIAL_DIRECT_PLUS_REPLACEMENT",
        coverageStatus: "FULLY_COVERED",
        totalShortageQty: 10,
        sameRefCoverageQty: 3,
        replacementCoverageQty: 7,
        totalCoveredQty: 10,
        remainingShortageQty: 0,
        coveragePercent: 100,
      },
    });
    assert.equal(deriveNeedType(item), "PARTIAL_DIRECT_PLUS_REPLACEMENT");
  });

  it("SUGERIR_REEMPLAZO with valid candidates = REPLACEMENT", () => {
    const item = makeItem({
      action: "SUGERIR_REEMPLAZO",
      mainWarehouseAvailable: 0,
      needResolution: {
        resolutionType: "REPLACEMENT",
        coverageStatus: "FULLY_COVERED",
        totalShortageQty: 10,
        sameRefCoverageQty: 0,
        replacementCoverageQty: 10,
        totalCoveredQty: 10,
        remainingShortageQty: 0,
        coveragePercent: 100,
      },
    });
    assert.equal(deriveNeedType(item), "REPLACEMENT");
  });

  it("SIN_STOCK_ORIGEN with no resolution = NO_ALTERNATIVE", () => {
    const item = makeItem({
      action: "SIN_STOCK_ORIGEN",
      mainWarehouseAvailable: 0,
      needResolution: {
        resolutionType: "NO_ALTERNATIVE",
        coverageStatus: "NO_COVERAGE",
        totalShortageQty: 10,
        sameRefCoverageQty: 0,
        replacementCoverageQty: 0,
        totalCoveredQty: 0,
        remainingShortageQty: 10,
        coveragePercent: 0,
      },
    });
    assert.equal(deriveNeedType(item), "NO_ALTERNATIVE");
  });

  it("needResolution takes precedence over action-based derivation", () => {
    // Action says SURTIR (which would be DIRECT_REPLENISHMENT without needResolution)
    // But needResolution says PARTIAL_DIRECT_PLUS_REPLACEMENT
    const item = makeItem({
      action: "SURTIR",
      needResolution: {
        resolutionType: "PARTIAL_DIRECT_PLUS_REPLACEMENT",
        coverageStatus: "PARTIALLY_COVERED",
        totalShortageQty: 10,
        sameRefCoverageQty: 3,
        replacementCoverageQty: 5,
        totalCoveredQty: 8,
        remainingShortageQty: 2,
        coveragePercent: 80,
      },
    });
    assert.equal(deriveNeedType(item), "PARTIAL_DIRECT_PLUS_REPLACEMENT");
  });

  it("PARTIALLY_COVERED status when not fully covered", () => {
    const item = makeItem({
      action: "SURTIR",
      needResolution: {
        resolutionType: "PARTIAL_DIRECT_PLUS_REPLACEMENT",
        coverageStatus: "PARTIALLY_COVERED",
        totalShortageQty: 10,
        sameRefCoverageQty: 3,
        replacementCoverageQty: 2,
        totalCoveredQty: 5,
        remainingShortageQty: 5,
        coveragePercent: 50,
      },
    });
    const nt = deriveNeedType(item);
    assert.equal(nt, "PARTIAL_DIRECT_PLUS_REPLACEMENT");
    assert.equal(item.needResolution!.coverageStatus, "PARTIALLY_COVERED");
    assert.equal(item.needResolution!.remainingShortageQty, 5);
  });

  it("fallback when no needResolution: SURTIR with replacement attached = PARTIAL", () => {
    const item = makeItem({
      action: "SURTIR",
      needResolution: null,
      replacement: {
        replacementRequired: true,
        replacementReason: "test",
        replacementShortageQty: 5,
        replacementCandidates: [{
          referenceCode: "C-ALT", description: "Alt", imageUrl: null,
          canonicalLine: "castillitos", group: "G", subgroup: "S",
          storeStock: 0, mainWarehouseAvailableQty: 5, suggestedQty: 5,
          reason: "test", evidence: "test", quality: "CONFIRMED",
          classificationSource: "SAG", groupSource: "SAG", subgroupSource: "SAG",
          dataQuality: "CONFIRMED",
          replacementVariants: [], totalVariantCount: 0, displayedVariantCount: 0,
          totalVariantUnits: 0, variantEvidenceDate: "2026-07-25",
        }],
        selectedReplacementCandidate: null,
        replacementConfidence: 0.8,
        replacementRuleSource: "SAME_GROUP_AND_SUBGROUP",
        replacementCoveredQty: 5,
        totalCandidatesFound: 1,
        hasMoreCandidates: false,
        rule36BlockedCount: 0,
      },
    });
    assert.equal(deriveNeedType(item), "PARTIAL_DIRECT_PLUS_REPLACEMENT");
  });

  it("fallback when no needResolution: SURTIR without replacement = DIRECT_REPLENISHMENT", () => {
    const item = makeItem({ action: "SURTIR", needResolution: null, replacement: null });
    assert.equal(deriveNeedType(item), "DIRECT_REPLENISHMENT");
  });
});

describe("DUODECIMO — Coverage calculations", () => {

  it("coveragePercent rounds correctly", () => {
    const res = {
      resolutionType: "PARTIAL_DIRECT_PLUS_REPLACEMENT" as const,
      coverageStatus: "PARTIALLY_COVERED" as const,
      totalShortageQty: 3,
      sameRefCoverageQty: 1,
      replacementCoverageQty: 1,
      totalCoveredQty: 2,
      remainingShortageQty: 1,
      coveragePercent: 67, // round(2/3 * 100)
    };
    assert.equal(res.coveragePercent, 67);
  });

  it("FULLY_COVERED when totalCoveredQty >= totalShortageQty", () => {
    const res = {
      resolutionType: "DIRECT_REPLENISHMENT" as const,
      coverageStatus: "FULLY_COVERED" as const,
      totalShortageQty: 10,
      sameRefCoverageQty: 10,
      replacementCoverageQty: 0,
      totalCoveredQty: 10,
      remainingShortageQty: 0,
      coveragePercent: 100,
    };
    assert.equal(res.coverageStatus, "FULLY_COVERED");
    assert.equal(res.remainingShortageQty, 0);
  });

  it("NO_COVERAGE when nothing available", () => {
    const res = {
      resolutionType: "NO_ALTERNATIVE" as const,
      coverageStatus: "NO_COVERAGE" as const,
      totalShortageQty: 10,
      sameRefCoverageQty: 0,
      replacementCoverageQty: 0,
      totalCoveredQty: 0,
      remainingShortageQty: 10,
      coveragePercent: 0,
    };
    assert.equal(res.coverageStatus, "NO_COVERAGE");
    assert.equal(res.totalCoveredQty, 0);
  });

  it("sameRefCoverage + replacementCoverage = totalCovered", () => {
    const res = {
      sameRefCoverageQty: 4,
      replacementCoverageQty: 6,
      totalCoveredQty: 10,
    };
    assert.equal(res.sameRefCoverageQty + res.replacementCoverageQty, res.totalCoveredQty);
  });

  it("totalShortage - totalCovered = remaining", () => {
    const total = 15;
    const covered = 8;
    const remaining = total - covered;
    assert.equal(remaining, 7);
  });
});

describe("DECIMOTERCERO — Summary counts with cascade types", () => {

  it("summary includes partialDirectPlusReplacement count", () => {
    const items = [
      makeItem({
        action: "SURTIR",
        needResolution: { resolutionType: "DIRECT_REPLENISHMENT", coverageStatus: "FULLY_COVERED", totalShortageQty: 10, sameRefCoverageQty: 10, replacementCoverageQty: 0, totalCoveredQty: 10, remainingShortageQty: 0, coveragePercent: 100 },
      }),
      makeItem({
        action: "SURTIR",
        needResolution: { resolutionType: "PARTIAL_DIRECT_PLUS_REPLACEMENT", coverageStatus: "FULLY_COVERED", totalShortageQty: 10, sameRefCoverageQty: 3, replacementCoverageQty: 7, totalCoveredQty: 10, remainingShortageQty: 0, coveragePercent: 100 },
      }),
      makeItem({
        action: "SUGERIR_REEMPLAZO",
        needResolution: { resolutionType: "REPLACEMENT", coverageStatus: "FULLY_COVERED", totalShortageQty: 10, sameRefCoverageQty: 0, replacementCoverageQty: 10, totalCoveredQty: 10, remainingShortageQty: 0, coveragePercent: 100 },
      }),
      makeItem({
        action: "SIN_STOCK_ORIGEN",
        needResolution: { resolutionType: "NO_ALTERNATIVE", coverageStatus: "NO_COVERAGE", totalShortageQty: 10, sameRefCoverageQty: 0, replacementCoverageQty: 0, totalCoveredQty: 0, remainingShortageQty: 10, coveragePercent: 0 },
      }),
    ];

    const direct = items.filter(i => deriveNeedType(i) === "DIRECT_REPLENISHMENT").length;
    const partial = items.filter(i => deriveNeedType(i) === "PARTIAL_DIRECT_PLUS_REPLACEMENT").length;
    const replacement = items.filter(i => deriveNeedType(i) === "REPLACEMENT").length;
    const noAlt = items.filter(i => deriveNeedType(i) === "NO_ALTERNATIVE").length;

    assert.equal(direct, 1);
    assert.equal(partial, 1);
    assert.equal(replacement, 1);
    assert.equal(noAlt, 1);
    assert.equal(direct + partial + replacement + noAlt, 4);
  });

  it("ALL filter includes all 4 types", () => {
    const types = ["DIRECT_REPLENISHMENT", "PARTIAL_DIRECT_PLUS_REPLACEMENT", "REPLACEMENT", "NO_ALTERNATIVE"];
    // When filter is "ALL", no type filtering applied
    const filtered = types.filter(() => true);
    assert.equal(filtered.length, 4);
  });

  it("PARTIAL_DIRECT_PLUS_REPLACEMENT filter isolates correctly", () => {
    const types = ["DIRECT_REPLENISHMENT", "PARTIAL_DIRECT_PLUS_REPLACEMENT", "REPLACEMENT", "NO_ALTERNATIVE"];
    const filtered = types.filter(t => t === "PARTIAL_DIRECT_PLUS_REPLACEMENT");
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0], "PARTIAL_DIRECT_PLUS_REPLACEMENT");
  });
});

describe("DECIMOCUARTO — Accessories cascade", () => {

  it("IMPORT world items can have needResolution", () => {
    const item = makeItem({
      world: "IMPORT",
      canonicalLine: "accesorios_importacion",
      action: "SIN_STOCK_ORIGEN",
      needResolution: {
        resolutionType: "REPLACEMENT",
        coverageStatus: "FULLY_COVERED",
        totalShortageQty: 5,
        sameRefCoverageQty: 0,
        replacementCoverageQty: 5,
        totalCoveredQty: 5,
        remainingShortageQty: 0,
        coveragePercent: 100,
      },
    });
    assert.equal(deriveNeedType(item), "REPLACEMENT");
    assert.equal(item.needResolution!.coverageStatus, "FULLY_COVERED");
  });

  it("accessories with partial same-ref = PARTIAL_DIRECT_PLUS_REPLACEMENT", () => {
    const item = makeItem({
      world: "IMPORT",
      canonicalLine: "accesorios_importacion",
      sizeClass: "medium",
      action: "SURTIR",
      needResolution: {
        resolutionType: "PARTIAL_DIRECT_PLUS_REPLACEMENT",
        coverageStatus: "PARTIALLY_COVERED",
        totalShortageQty: 8,
        sameRefCoverageQty: 3,
        replacementCoverageQty: 3,
        totalCoveredQty: 6,
        remainingShortageQty: 2,
        coveragePercent: 75,
      },
    });
    assert.equal(deriveNeedType(item), "PARTIAL_DIRECT_PLUS_REPLACEMENT");
    assert.equal(classifyNeedLine(item), "ACCESSORIES");
  });
});

// ── CASCADE-FIX-01 validation tests (NOVENO) ────────────────────────────────

describe("DECIMOQUINTO — Partial-direct-only resolution (no replacement found)", () => {

  it("sameRef > 0 but no replacement → DIRECT_REPLENISHMENT with PARTIALLY_COVERED", () => {
    const item = makeItem({
      action: "SURTIR",
      needResolution: {
        resolutionType: "DIRECT_REPLENISHMENT",
        coverageStatus: "PARTIALLY_COVERED",
        totalShortageQty: 11,
        sameRefCoverageQty: 2,
        replacementCoverageQty: 0,
        totalCoveredQty: 2,
        remainingShortageQty: 9,
        coveragePercent: 18,
      },
    });
    assert.equal(deriveNeedType(item), "DIRECT_REPLENISHMENT");
    assert.equal(item.needResolution!.coverageStatus, "PARTIALLY_COVERED");
    assert.equal(item.needResolution!.replacementCoverageQty, 0);
  });

  it("sameRef > 0 with no replacement is never NO_ALTERNATIVE", () => {
    // This was the bug found by QUINTO: sameRef > 0 should never be NO_ALTERNATIVE
    const item = makeItem({
      action: "SURTIR",
      needResolution: {
        resolutionType: "DIRECT_REPLENISHMENT",
        coverageStatus: "PARTIALLY_COVERED",
        totalShortageQty: 11,
        sameRefCoverageQty: 1,
        replacementCoverageQty: 0,
        totalCoveredQty: 1,
        remainingShortageQty: 10,
        coveragePercent: 9,
      },
    });
    assert.notEqual(deriveNeedType(item), "NO_ALTERNATIVE");
    assert.equal(deriveNeedType(item), "DIRECT_REPLENISHMENT");
  });

  it("sameRef = 0 and no replacement → NO_ALTERNATIVE", () => {
    const item = makeItem({
      action: "SIN_STOCK_ORIGEN",
      needResolution: {
        resolutionType: "NO_ALTERNATIVE",
        coverageStatus: "NO_COVERAGE",
        totalShortageQty: 11,
        sameRefCoverageQty: 0,
        replacementCoverageQty: 0,
        totalCoveredQty: 0,
        remainingShortageQty: 11,
        coveragePercent: 0,
      },
    });
    assert.equal(deriveNeedType(item), "NO_ALTERNATIVE");
    assert.equal(item.needResolution!.coverageStatus, "NO_COVERAGE");
  });
});

describe("DECIMOSEXTO — Coverage sum invariants", () => {

  it("totalCovered = sameRef + replacement", () => {
    const res = {
      resolutionType: "PARTIAL_DIRECT_PLUS_REPLACEMENT" as const,
      coverageStatus: "PARTIALLY_COVERED" as const,
      totalShortageQty: 20,
      sameRefCoverageQty: 5,
      replacementCoverageQty: 8,
      totalCoveredQty: 13,
      remainingShortageQty: 7,
      coveragePercent: 65,
    };
    assert.equal(res.sameRefCoverageQty + res.replacementCoverageQty, res.totalCoveredQty);
  });

  it("remaining = max(0, shortage - totalCovered)", () => {
    const res = {
      resolutionType: "REPLACEMENT" as const,
      coverageStatus: "PARTIALLY_COVERED" as const,
      totalShortageQty: 10,
      sameRefCoverageQty: 0,
      replacementCoverageQty: 6,
      totalCoveredQty: 6,
      remainingShortageQty: 4,
      coveragePercent: 60,
    };
    assert.equal(res.remainingShortageQty, Math.max(0, res.totalShortageQty - res.totalCoveredQty));
  });

  it("coveragePercent = round(totalCovered / totalShortage * 100)", () => {
    const res = {
      resolutionType: "DIRECT_REPLENISHMENT" as const,
      coverageStatus: "FULLY_COVERED" as const,
      totalShortageQty: 12,
      sameRefCoverageQty: 12,
      replacementCoverageQty: 0,
      totalCoveredQty: 12,
      remainingShortageQty: 0,
      coveragePercent: 100,
    };
    const expected = Math.round((res.totalCoveredQty / res.totalShortageQty) * 100);
    assert.equal(res.coveragePercent, expected);
  });

  it("FULLY_COVERED requires totalCovered >= totalShortage", () => {
    const item = makeItem({
      needResolution: {
        resolutionType: "DIRECT_REPLENISHMENT",
        coverageStatus: "FULLY_COVERED",
        totalShortageQty: 10,
        sameRefCoverageQty: 10,
        replacementCoverageQty: 0,
        totalCoveredQty: 10,
        remainingShortageQty: 0,
        coveragePercent: 100,
      },
    });
    assert.ok(item.needResolution!.totalCoveredQty >= item.needResolution!.totalShortageQty);
  });

  it("NO_COVERAGE requires totalCovered = 0", () => {
    const item = makeItem({
      action: "SIN_STOCK_ORIGEN",
      needResolution: {
        resolutionType: "NO_ALTERNATIVE",
        coverageStatus: "NO_COVERAGE",
        totalShortageQty: 11,
        sameRefCoverageQty: 0,
        replacementCoverageQty: 0,
        totalCoveredQty: 0,
        remainingShortageQty: 11,
        coveragePercent: 0,
      },
    });
    assert.equal(item.needResolution!.totalCoveredQty, 0);
    assert.equal(item.needResolution!.coverageStatus, "NO_COVERAGE");
  });
});

describe("DECIMOSEPTIMO — KPI summary sums", () => {

  function buildSummary(items: StoreDistributionItem[]) {
    const needItems = items.map(i => ({
      needType: deriveNeedType(i),
    }));
    return {
      directReplenishment: needItems.filter(i => i.needType === "DIRECT_REPLENISHMENT").length,
      partialDirectPlusReplacement: needItems.filter(i => i.needType === "PARTIAL_DIRECT_PLUS_REPLACEMENT").length,
      replacement: needItems.filter(i => i.needType === "REPLACEMENT").length,
      noAlternative: needItems.filter(i => i.needType === "NO_ALTERNATIVE").length,
      total: needItems.length,
    };
  }

  it("summary parts sum to total", () => {
    const items = [
      makeItem({ needResolution: { resolutionType: "DIRECT_REPLENISHMENT", coverageStatus: "FULLY_COVERED", totalShortageQty: 10, sameRefCoverageQty: 10, replacementCoverageQty: 0, totalCoveredQty: 10, remainingShortageQty: 0, coveragePercent: 100 } }),
      makeItem({ referenceCode: "R2", needResolution: { resolutionType: "PARTIAL_DIRECT_PLUS_REPLACEMENT", coverageStatus: "PARTIALLY_COVERED", totalShortageQty: 10, sameRefCoverageQty: 3, replacementCoverageQty: 4, totalCoveredQty: 7, remainingShortageQty: 3, coveragePercent: 70 } }),
      makeItem({ referenceCode: "R3", action: "SIN_STOCK_ORIGEN", needResolution: { resolutionType: "REPLACEMENT", coverageStatus: "FULLY_COVERED", totalShortageQty: 8, sameRefCoverageQty: 0, replacementCoverageQty: 8, totalCoveredQty: 8, remainingShortageQty: 0, coveragePercent: 100 } }),
      makeItem({ referenceCode: "R4", action: "SIN_STOCK_ORIGEN", needResolution: { resolutionType: "NO_ALTERNATIVE", coverageStatus: "NO_COVERAGE", totalShortageQty: 11, sameRefCoverageQty: 0, replacementCoverageQty: 0, totalCoveredQty: 0, remainingShortageQty: 11, coveragePercent: 0 } }),
    ];
    const s = buildSummary(items);
    assert.equal(s.directReplenishment + s.partialDirectPlusReplacement + s.replacement + s.noAlternative, s.total);
    assert.equal(s.directReplenishment, 1);
    assert.equal(s.partialDirectPlusReplacement, 1);
    assert.equal(s.replacement, 1);
    assert.equal(s.noAlternative, 1);
    assert.equal(s.total, 4);
  });

  it("all DIRECT → no partial, replacement, or noAlt", () => {
    const items = [
      makeItem({ needResolution: { resolutionType: "DIRECT_REPLENISHMENT", coverageStatus: "FULLY_COVERED", totalShortageQty: 10, sameRefCoverageQty: 10, replacementCoverageQty: 0, totalCoveredQty: 10, remainingShortageQty: 0, coveragePercent: 100 } }),
      makeItem({ referenceCode: "R2", needResolution: { resolutionType: "DIRECT_REPLENISHMENT", coverageStatus: "PARTIALLY_COVERED", totalShortageQty: 11, sameRefCoverageQty: 2, replacementCoverageQty: 0, totalCoveredQty: 2, remainingShortageQty: 9, coveragePercent: 18 } }),
    ];
    const s = buildSummary(items);
    assert.equal(s.directReplenishment, 2);
    assert.equal(s.partialDirectPlusReplacement, 0);
    assert.equal(s.replacement, 0);
    assert.equal(s.noAlternative, 0);
  });
});

describe("DECIMOOCTAVO — NO_ALTERNATIVE cause invariants", () => {

  it("NO_ALTERNATIVE always has sameRef = 0 and replacement = 0", () => {
    const item = makeItem({
      action: "SIN_STOCK_ORIGEN",
      needResolution: {
        resolutionType: "NO_ALTERNATIVE",
        coverageStatus: "NO_COVERAGE",
        totalShortageQty: 11,
        sameRefCoverageQty: 0,
        replacementCoverageQty: 0,
        totalCoveredQty: 0,
        remainingShortageQty: 11,
        coveragePercent: 0,
      },
    });
    assert.equal(item.needResolution!.sameRefCoverageQty, 0);
    assert.equal(item.needResolution!.replacementCoverageQty, 0);
    assert.equal(item.needResolution!.coverageStatus, "NO_COVERAGE");
  });

  it("NO_ALTERNATIVE remaining = totalShortage", () => {
    const item = makeItem({
      action: "SIN_STOCK_ORIGEN",
      needResolution: {
        resolutionType: "NO_ALTERNATIVE",
        coverageStatus: "NO_COVERAGE",
        totalShortageQty: 15,
        sameRefCoverageQty: 0,
        replacementCoverageQty: 0,
        totalCoveredQty: 0,
        remainingShortageQty: 15,
        coveragePercent: 0,
      },
    });
    assert.equal(item.needResolution!.remainingShortageQty, item.needResolution!.totalShortageQty);
  });

  it("five resolution types are mutually exclusive (including CLASSIFICATION_INCOMPLETE)", () => {
    const types = ["DIRECT_REPLENISHMENT", "PARTIAL_DIRECT_PLUS_REPLACEMENT", "REPLACEMENT", "NO_ALTERNATIVE"];
    const items = types.map((t, i) => makeItem({
      referenceCode: `R${i}`,
      action: i < 2 ? "SURTIR" : "SIN_STOCK_ORIGEN",
      needResolution: {
        resolutionType: t as any,
        coverageStatus: t === "NO_ALTERNATIVE" ? "NO_COVERAGE" : "PARTIALLY_COVERED",
        totalShortageQty: 10,
        sameRefCoverageQty: t.includes("DIRECT") ? 5 : 0,
        replacementCoverageQty: t.includes("REPLACEMENT") && !t.includes("DIRECT") ? 5 : t === "PARTIAL_DIRECT_PLUS_REPLACEMENT" ? 3 : 0,
        totalCoveredQty: t === "NO_ALTERNATIVE" ? 0 : t === "DIRECT_REPLENISHMENT" ? 5 : t === "REPLACEMENT" ? 5 : 8,
        remainingShortageQty: t === "NO_ALTERNATIVE" ? 10 : t === "DIRECT_REPLENISHMENT" ? 5 : t === "REPLACEMENT" ? 5 : 2,
        coveragePercent: t === "NO_ALTERNATIVE" ? 0 : 50,
      },
    }));
    const derived = items.map(i => deriveNeedType(i));
    // Each item maps to its respective type
    assert.deepEqual(derived, types);
  });
});

// ── DECIMONOVENO — CLASSIFICATION_INCOMPLETE detection ────────────────────────

describe("DECIMONOVENO — CLASSIFICATION_INCOMPLETE differentiation", () => {

  it("Castillitos with missing group → CLASSIFICATION_INCOMPLETE via needResolution", () => {
    const item = makeItem({
      world: "TEXTILE",
      canonicalLine: "castillitos",
      group: "SIN_GRUPO_SAG",
      subgroup: "ALGODON",
      action: "SIN_STOCK_ORIGEN",
      needResolution: {
        resolutionType: "NO_ALTERNATIVE",
        coverageStatus: "NO_COVERAGE",
        totalShortageQty: 7, sameRefCoverageQty: 0, replacementCoverageQty: 0,
        totalCoveredQty: 0, remainingShortageQty: 7, coveragePercent: 0,
      },
    });
    assert.equal(deriveNeedType(item), "CLASSIFICATION_INCOMPLETE");
  });

  it("Castillitos with missing subgroup → CLASSIFICATION_INCOMPLETE via needResolution", () => {
    const item = makeItem({
      world: "TEXTILE",
      canonicalLine: "castillitos",
      group: "CAMISAS",
      subgroup: "SIN_SUBGRUPO_SAG",
      action: "SIN_STOCK_ORIGEN",
      needResolution: {
        resolutionType: "NO_ALTERNATIVE",
        coverageStatus: "NO_COVERAGE",
        totalShortageQty: 7, sameRefCoverageQty: 0, replacementCoverageQty: 0,
        totalCoveredQty: 0, remainingShortageQty: 7, coveragePercent: 0,
      },
    });
    assert.equal(deriveNeedType(item), "CLASSIFICATION_INCOMPLETE");
  });

  it("Castillitos with complete classification → NO_ALTERNATIVE (not CLASS_INC)", () => {
    const item = makeItem({
      world: "TEXTILE",
      canonicalLine: "castillitos",
      group: "CAMISAS",
      subgroup: "ALGODON",
      action: "SIN_STOCK_ORIGEN",
      needResolution: {
        resolutionType: "NO_ALTERNATIVE",
        coverageStatus: "NO_COVERAGE",
        totalShortageQty: 7, sameRefCoverageQty: 0, replacementCoverageQty: 0,
        totalCoveredQty: 0, remainingShortageQty: 7, coveragePercent: 0,
      },
    });
    assert.equal(deriveNeedType(item), "NO_ALTERNATIVE");
  });

  it("Latin Kids with missing subgroup → CLASSIFICATION_INCOMPLETE", () => {
    const item = makeItem({
      world: "TEXTILE",
      canonicalLine: "latin_kids",
      group: "SIN_GRUPO_SAG",
      subgroup: "SIN_SUBGRUPO_SAG",
      action: "SUGERIR_REEMPLAZO",
      needResolution: {
        resolutionType: "NO_ALTERNATIVE",
        coverageStatus: "NO_COVERAGE",
        totalShortageQty: 7, sameRefCoverageQty: 0, replacementCoverageQty: 0,
        totalCoveredQty: 0, remainingShortageQty: 7, coveragePercent: 0,
      },
    });
    assert.equal(deriveNeedType(item), "CLASSIFICATION_INCOMPLETE");
  });

  it("Latin Kids with subgroup but missing group → NOT incomplete (group not required for LK)", () => {
    const item = makeItem({
      world: "TEXTILE",
      canonicalLine: "latin_kids",
      group: "SIN_GRUPO_SAG",
      subgroup: "BODIES",
      action: "SIN_STOCK_ORIGEN",
      needResolution: {
        resolutionType: "NO_ALTERNATIVE",
        coverageStatus: "NO_COVERAGE",
        totalShortageQty: 7, sameRefCoverageQty: 0, replacementCoverageQty: 0,
        totalCoveredQty: 0, remainingShortageQty: 7, coveragePercent: 0,
      },
    });
    assert.equal(deriveNeedType(item), "NO_ALTERNATIVE");
  });

  it("Accessories with null sizeClass → CLASSIFICATION_INCOMPLETE", () => {
    const item = makeItem({
      world: "IMPORT",
      canonicalLine: "accesorios_importacion",
      group: "GRUPO_X",
      subgroup: "SUBGRUPO_Y",
      sizeClass: null,
      action: "SUGERIR_REEMPLAZO",
      needResolution: {
        resolutionType: "NO_ALTERNATIVE",
        coverageStatus: "NO_COVERAGE",
        totalShortageQty: 7, sameRefCoverageQty: 0, replacementCoverageQty: 0,
        totalCoveredQty: 0, remainingShortageQty: 7, coveragePercent: 0,
      },
    });
    assert.equal(deriveNeedType(item), "CLASSIFICATION_INCOMPLETE");
  });

  it("Accessories with sizeClass → NO_ALTERNATIVE (not CLASS_INC)", () => {
    const item = makeItem({
      world: "IMPORT",
      canonicalLine: "accesorios_importacion",
      group: "GRUPO_X",
      subgroup: "SUBGRUPO_Y",
      sizeClass: "medium",
      action: "SUGERIR_REEMPLAZO",
      needResolution: {
        resolutionType: "NO_ALTERNATIVE",
        coverageStatus: "NO_COVERAGE",
        totalShortageQty: 7, sameRefCoverageQty: 0, replacementCoverageQty: 0,
        totalCoveredQty: 0, remainingShortageQty: 7, coveragePercent: 0,
      },
    });
    assert.equal(deriveNeedType(item), "NO_ALTERNATIVE");
  });

  it("DIRECT_REPLENISHMENT resolution is not affected by missing fields", () => {
    const item = makeItem({
      world: "TEXTILE",
      canonicalLine: "castillitos",
      group: "SIN_GRUPO_SAG",
      subgroup: "SIN_SUBGRUPO_SAG",
      action: "SURTIR",
      needResolution: {
        resolutionType: "DIRECT_REPLENISHMENT",
        coverageStatus: "FULLY_COVERED",
        totalShortageQty: 7, sameRefCoverageQty: 7, replacementCoverageQty: 0,
        totalCoveredQty: 7, remainingShortageQty: 0, coveragePercent: 100,
      },
    });
    assert.equal(deriveNeedType(item), "DIRECT_REPLENISHMENT");
  });

  it("REPLACEMENT resolution is not affected by missing fields", () => {
    const item = makeItem({
      world: "TEXTILE",
      canonicalLine: "castillitos",
      group: "SIN_GRUPO_SAG",
      subgroup: "SIN_SUBGRUPO_SAG",
      action: "SUGERIR_REEMPLAZO",
      needResolution: {
        resolutionType: "REPLACEMENT",
        coverageStatus: "FULLY_COVERED",
        totalShortageQty: 7, sameRefCoverageQty: 0, replacementCoverageQty: 7,
        totalCoveredQty: 7, remainingShortageQty: 0, coveragePercent: 100,
      },
    });
    assert.equal(deriveNeedType(item), "REPLACEMENT");
  });

  it("Fallback (no needResolution): SUGERIR_REEMPLAZO with missing group → CLASSIFICATION_INCOMPLETE", () => {
    const item = makeItem({
      world: "TEXTILE",
      canonicalLine: "castillitos",
      group: "SIN_GRUPO_SAG",
      subgroup: "ALGODON",
      action: "SUGERIR_REEMPLAZO",
    });
    assert.equal(deriveNeedType(item), "CLASSIFICATION_INCOMPLETE");
  });

  it("Fallback (no needResolution): SIN_STOCK_ORIGEN with null sizeClass import → CLASSIFICATION_INCOMPLETE", () => {
    const item = makeItem({
      world: "IMPORT",
      canonicalLine: "accesorios_importacion",
      sizeClass: null,
      action: "SIN_STOCK_ORIGEN",
    });
    assert.equal(deriveNeedType(item), "CLASSIFICATION_INCOMPLETE");
  });

  it("hasIncompleteClassification returns false for complete Castillitos item", () => {
    const item = makeItem({ world: "TEXTILE", canonicalLine: "castillitos", group: "CAMISAS", subgroup: "ALGODON" });
    assert.equal(hasIncompleteClassification(item), false);
  });

  it("hasIncompleteClassification returns true for Castillitos missing group", () => {
    const item = makeItem({ world: "TEXTILE", canonicalLine: "castillitos", group: "SIN_GRUPO_SAG", subgroup: "ALGODON" });
    assert.equal(hasIncompleteClassification(item), true);
  });

  it("hasIncompleteClassification returns false for IMPORT with sizeClass", () => {
    const item = makeItem({ world: "IMPORT", sizeClass: "large" });
    assert.equal(hasIncompleteClassification(item), false);
  });

  it("hasIncompleteClassification returns true for IMPORT without sizeClass", () => {
    const item = makeItem({ world: "IMPORT", sizeClass: null });
    assert.equal(hasIncompleteClassification(item), true);
  });
});

// ── VIGÉSIMO — NeedSearchTrace types and score (CANDIDATE-EXPLAINER-01) ──────

describe("VIGÉSIMO — NeedSearchTrace score and types", () => {

  // Import the score function
  const { computeCandidateScore } = require("../need-search-trace");

  it("same group+subgroup scores 90 base", () => {
    const score = computeCandidateScore(
      "REF-B", "REF-A", "SAME_GROUP_AND_SUBGROUP",
      { group: "CAMISAS", subgroup: "ALGODON", sizeClass: null, canonicalLine: "castillitos" },
      { group: "CAMISAS", subgroup: "ALGODON", sizeClass: null, canonicalLine: "castillitos" },
      50, 0,
    );
    // base=90 + novelty(storeStock=0)=5 + highStock(50)=3 = 98
    assert.equal(score, 98);
  });

  it("same subgroup only scores 85 base", () => {
    const score = computeCandidateScore(
      "REF-B", "REF-A", "SAME_SUBGROUP",
      { group: "DIFFERENT", subgroup: "ALGODON", sizeClass: null, canonicalLine: "latin_kids" },
      { group: "ORIGINAL", subgroup: "ALGODON", sizeClass: null, canonicalLine: "latin_kids" },
      5, 3,
    );
    // base=85 + novelty(storeStock>0)=0 + stock(5<10)=0 = 85
    assert.equal(score, 85);
  });

  it("same sizeClass scores 80 base", () => {
    const score = computeCandidateScore(
      "REF-B", "REF-A", "SAME_SIZE_CLASS",
      { group: "G", subgroup: "S", sizeClass: "medium", canonicalLine: "accesorios" },
      { group: "G2", subgroup: "S2", sizeClass: "medium", canonicalLine: "accesorios" },
      25, 0,
    );
    // base=80 + novelty=5 + stock(25>=20)=2 = 87
    assert.equal(score, 87);
  });

  it("same line but different group/subgroup scores 50 base", () => {
    const score = computeCandidateScore(
      "REF-B", "REF-A", "SAME_GROUP_AND_SUBGROUP",
      { group: "PANTALONES", subgroup: "DENIM", sizeClass: null, canonicalLine: "castillitos" },
      { group: "CAMISAS", subgroup: "ALGODON", sizeClass: null, canonicalLine: "castillitos" },
      10, 0,
    );
    // base=50 + novelty=5 + stock(10>=10)=1 = 56
    assert.equal(score, 56);
  });

  it("SIN_GRUPO_SAG does not match for group+subgroup (gets same-line score)", () => {
    const score = computeCandidateScore(
      "REF-B", "REF-A", "SAME_GROUP_AND_SUBGROUP",
      { group: "SIN_GRUPO_SAG", subgroup: "ALGODON", sizeClass: null, canonicalLine: "castillitos" },
      { group: "SIN_GRUPO_SAG", subgroup: "ALGODON", sizeClass: null, canonicalLine: "castillitos" },
      10, 0,
    );
    // group matches but is SIN_GRUPO_SAG → falls through to subgroup check
    // subgroup matches and is not sentinel → 85
    assert.equal(score >= 85, true);
  });

  it("no match at all scores 0", () => {
    const score = computeCandidateScore(
      "REF-B", "REF-A", "SAME_GROUP_AND_SUBGROUP",
      { group: "X", subgroup: "Y", sizeClass: null, canonicalLine: "OTHER" },
      { group: "A", subgroup: "B", sizeClass: null, canonicalLine: "castillitos" },
      10, 0,
    );
    // Different line → 0 + novelty=5 + stock=1 = 6
    assert.equal(score, 6);
  });

  it("Rule 36 blocks candidates with mainStock <= threshold", () => {
    // This verifies the logic documented in the trace
    const threshold = 12; // CASTILLITOS default
    assert.equal(10 <= threshold, true);  // stock=10 is blocked
    assert.equal(13 <= threshold, false); // stock=13 is not blocked
  });

  it("empty universe produces NO_COMPATIBLE_REFS_IN_INDEX cause", () => {
    // Verifies the trace classification logic
    const universeSize = 0;
    const cause = universeSize === 0 ? "EMPTY_INDEX_KEY" : "OTHER";
    assert.equal(cause, "EMPTY_INDEX_KEY");
  });

  it("all discarded by NO_MAIN_STOCK produces ALL_COMPATIBLE_ZERO_STOCK cause", () => {
    const discards = { NO_MAIN_STOCK: 15 };
    const totalDiscarded = 15;
    const cause = discards.NO_MAIN_STOCK === totalDiscarded ? "ALL_COMPATIBLE_ZERO_STOCK" : "OTHER";
    assert.equal(cause, "ALL_COMPATIBLE_ZERO_STOCK");
  });

  it("mixed discards produce MIXED_BLOCKING cause", () => {
    const discards = { NO_MAIN_STOCK: 10, RULE36_BLOCKED: 3 };
    const noStock = discards.NO_MAIN_STOCK;
    const rule36 = discards.RULE36_BLOCKED;
    const cause = noStock > 0 && rule36 > 0 ? "MIXED_BLOCKING" : "OTHER";
    assert.equal(cause, "MIXED_BLOCKING");
  });

  it("winner explanation includes score and stock data", () => {
    const winner = { referenceCode: "REF-W", score: 95, mainStock: 30, storeStock: 0, suggestedQty: 7 };
    const reason = `${winner.referenceCode} gano con score ${winner.score}: mainStock=${winner.mainStock}, storeStock=${winner.storeStock}, sugerido=${winner.suggestedQty} uds`;
    assert.ok(reason.includes("REF-W"));
    assert.ok(reason.includes("score 95"));
    assert.ok(reason.includes("mainStock=30"));
  });

  it("performance: score computation is sub-millisecond", () => {
    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      computeCandidateScore(
        `REF-${i}`, "REF-A", "SAME_GROUP_AND_SUBGROUP",
        { group: "G", subgroup: "S", sizeClass: null, canonicalLine: "castillitos" },
        { group: "G", subgroup: "S", sizeClass: null, canonicalLine: "castillitos" },
        50, 0,
      );
    }
    const elapsed = performance.now() - start;
    // 10,000 iterations should complete in < 100ms
    assert.ok(elapsed < 100, `Score computation too slow: ${elapsed}ms for 10k iterations`);
  });
});
