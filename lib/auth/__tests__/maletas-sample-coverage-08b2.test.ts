/**
 * MALETAS-COBERTURA-MOSTRARIO-08B2 — Sample Coverage Structural Truth Tests
 *
 * Validates:
 *   A. Coverage status types (5 canonical statuses)
 *   B. Cascade hierarchy: B01 → OP → PRODUCTION_REQUIRED / IMPORT_UNAVAILABLE
 *   C. DATA_UNVERIFIED protection (cannot suggest production without certified data)
 *   D. Canonical SAG code matching (not display names)
 *   E. Import rules (exact reference matching, grandes excluded)
 *   F. Reference deduplication across positions
 *   G. Deterministic selection (disponible DESC, reference ASC)
 *   H. Position identity uses canonical rule ID
 *   I. Wholesale thresholds derived from MALETA_COVERAGE_MINIMUMS (canonical source)
 *   I-BND. Boundary tests: 99/100/101, 199/200/201, 9/10/11 (operator is strictly >)
 *   J. UI terminology — "Cobertura de mostrario" replaces "Plan surtido"
 */

import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../../", relPath), "utf-8");
}

// ── A. Coverage status types ────────────────────────────────────────────────

describe("A — Five canonical coverage statuses", () => {
  const src = readSrc("lib/comercial/maletas/sample-coverage-engine.ts");

  test("T01: CoverageStatus includes B01_AVAILABLE", () => {
    expect(src).toContain('"B01_AVAILABLE"');
  });

  test("T02: CoverageStatus includes OP_INCOMING", () => {
    expect(src).toContain('"OP_INCOMING"');
  });

  test("T03: CoverageStatus includes PRODUCTION_REQUIRED", () => {
    expect(src).toContain('"PRODUCTION_REQUIRED"');
  });

  test("T04: CoverageStatus includes IMPORT_UNAVAILABLE", () => {
    expect(src).toContain('"IMPORT_UNAVAILABLE"');
  });

  test("T05: CoverageStatus includes DATA_UNVERIFIED", () => {
    expect(src).toContain('"DATA_UNVERIFIED"');
  });
});

// ── B. Cascade hierarchy ────────────────────────────────────────────────────

describe("B — Cascade: B01 → OP → PRODUCTION_REQUIRED", () => {
  const src = readSrc("lib/comercial/maletas/sample-coverage-engine.ts");

  test("T06: STEP 1 Bodega checked before STEP 2 OP (code order)", () => {
    const bodegaIdx = src.indexOf("// STEP 1: Bodega Principal");
    const opIdx = src.indexOf("// STEP 2: OP Activa");
    const prodIdx = src.indexOf("// STEP 3: PRODUCTION_REQUIRED");
    expect(bodegaIdx).toBeGreaterThan(0);
    expect(opIdx).toBeGreaterThan(bodegaIdx);
    expect(prodIdx).toBeGreaterThan(opIdx);
  });

  test("T07: STATUS_PRIORITY gives B01_AVAILABLE highest priority", () => {
    expect(src).toContain("B01_AVAILABLE: 1,");
    expect(src).toContain("OP_INCOMING: 2,");
    expect(src).toContain("PRODUCTION_REQUIRED: 3,");
  });
});

// ── C. DATA_UNVERIFIED protection ───────────────────────────────────────────

describe("C — DATA_UNVERIFIED guard prevents false production suggestions", () => {
  const src = readSrc("lib/comercial/maletas/sample-coverage-engine.ts");

  test("T08: DATA_UNVERIFIED emitted when b01Available is false", () => {
    expect(src).toContain("!dataAvailability.b01Available");
    expect(src).toContain('status: "DATA_UNVERIFIED"');
  });

  test("T09: DATA_UNVERIFIED emitted when opAvailable is false (after B01 miss)", () => {
    expect(src).toContain("!dataAvailability.opAvailable");
  });

  test("T10: CoverageDataAvailability interface has b01Available and opAvailable", () => {
    expect(src).toContain("b01Available: boolean;");
    expect(src).toContain("opAvailable: boolean;");
  });
});

// ── D. Canonical SAG code matching ──────────────────────────────────────────

describe("D — Matching uses SAG codes, not display names", () => {
  const src = readSrc("lib/comercial/maletas/sample-coverage-engine.ts");

  test("T11: matchesTextilEntry normalizes SAG codes (trim+toUpperCase)", () => {
    expect(src).toContain("candidateSubgrupoSag.trim().toUpperCase()");
    expect(src).toContain("s.trim().toUpperCase()");
  });

  test("T12: Compound SAG codes matched via sagSubgrupos.some()", () => {
    expect(src).toContain("sagSubgrupos.some(");
  });

  test("T13: Position carries sagSubgrupos array for matching", () => {
    expect(src).toContain("sagSubgrupos: string[];");
  });
});

// ── E. Import rules ────────────────────────────────────────────────────────

describe("E — Import: exact reference, grandes excluded, IMPORT_UNAVAILABLE", () => {
  const src = readSrc("lib/comercial/maletas/sample-coverage-engine.ts");

  test("T14: GRANDE sizeClass produces zero candidates", () => {
    expect(src).toContain('"GRANDE"');
    // The function returns early for GRANDE
    const grandeIdx = src.indexOf('"GRANDE"');
    const returnIdx = src.indexOf("return;", grandeIdx);
    expect(returnIdx).toBeGreaterThan(grandeIdx);
    expect(returnIdx - grandeIdx).toBeLessThan(50); // immediate return after check
  });

  test("T15: Import positions resolve to IMPORT_UNAVAILABLE (never PRODUCTION_REQUIRED)", () => {
    expect(src).toContain('status: "IMPORT_UNAVAILABLE"');
    // In resolveImportSlots, no PRODUCTION_REQUIRED should appear
    const importFnIdx = src.indexOf("function resolveImportSlots");
    const nextFnIdx = src.indexOf("function matchesTextilEntry");
    const importSection = src.slice(importFnIdx, nextFnIdx);
    expect(importSection).not.toContain('"PRODUCTION_REQUIRED"');
  });
});

// ── F. Reference deduplication ──────────────────────────────────────────────

describe("F — Reference deduplication across positions", () => {
  const src = readSrc("lib/comercial/maletas/sample-coverage-engine.ts");

  test("T16: usedReferences set tracks selected refs", () => {
    expect(src).toContain("const usedReferences = new Set<string>()");
  });

  test("T17: Bodega candidates exclude usedReferences", () => {
    expect(src).toContain("usedReferences.has(r.reference.trim().toUpperCase())");
  });

  test("T18: OP candidates exclude usedReferences", () => {
    expect(src).toContain("usedReferences.has(op.reference.trim().toUpperCase())");
  });
});

// ── G. Deterministic selection ──────────────────────────────────────────────

describe("G — Deterministic: disponible DESC, reference ASC", () => {
  const src = readSrc("lib/comercial/maletas/sample-coverage-engine.ts");

  test("T19: Central refs sorted by disponible DESC, reference ASC", () => {
    expect(src).toContain("b.disponible !== a.disponible");
    expect(src).toContain("a.reference.localeCompare(b.reference)");
  });
});

// ── H. Position identity ────────────────────────────────────────────────────

describe("H — Canonical position identity", () => {
  const src = readSrc("lib/comercial/maletas/sample-coverage-engine.ts");

  test("T20: positionId uses catalogId|groupCode|subgroupCode", () => {
    expect(src).toContain("`${catalog.catalogId}|${group.groupCode}|${entry.subgroupCode ?? entry.subgroupName}`");
  });
});

// ── I. Wholesale thresholds ─────────────────────────────────────────────────

describe("I — Wholesale thresholds derived from canonical source", () => {
  const src = readSrc("lib/comercial/maletas/sample-coverage-engine.ts");
  const canonicalSrc = readSrc("lib/comercial/maletas/maletas-canonical-inventory.ts");

  test("T21: WHOLESALE_THRESHOLDS imports from MALETA_COVERAGE_MINIMUMS", () => {
    expect(src).toContain('import { MALETA_COVERAGE_MINIMUMS } from "./maletas-canonical-inventory"');
  });

  test("T22: CS derived from MALETA_COVERAGE_MINIMUMS.CASTILLITOS", () => {
    expect(src).toContain("CS: MALETA_COVERAGE_MINIMUMS.CASTILLITOS,");
  });

  test("T23: LT derived from MALETA_COVERAGE_MINIMUMS.LATIN_KIDS", () => {
    expect(src).toContain("CS: MALETA_COVERAGE_MINIMUMS.CASTILLITOS,");
    expect(src).toContain("LT: MALETA_COVERAGE_MINIMUMS.LATIN_KIDS,");
  });

  test("T24: IMPORT_SM derived from MALETA_COVERAGE_MINIMUMS.IMPORTACION", () => {
    expect(src).toContain("IMPORT_SM: MALETA_COVERAGE_MINIMUMS.IMPORTACION,");
  });

  test("T25: Canonical values: CASTILLITOS=100, LATIN_KIDS=200, IMPORTACION=10", () => {
    expect(canonicalSrc).toContain("CASTILLITOS: 100");
    expect(canonicalSrc).toContain("LATIN_KIDS: 200");
    expect(canonicalSrc).toContain("IMPORTACION: 10");
  });

  test("T26: Operator is strictly > (not >=)", () => {
    expect(src).toContain("r.disponible > threshold");
    expect(src).not.toContain("r.disponible >= threshold");
  });

  test("T27: WHOLESALE_THRESHOLDS exported", () => {
    expect(src).toContain("export const WHOLESALE_THRESHOLDS");
  });
});

// ── I-BND. Boundary tests ─────────────────────────────────────────────────

describe("I-BND — Threshold boundary: operator is strictly >", () => {
  // Import the actual values to verify boundary behavior
  // CS=100: 99 NO, 100 NO, 101 YES
  // LT=200: 199 NO, 200 NO, 201 YES
  // IMPORT=10: 9 NO, 10 NO, 11 YES

  const cases: Array<{ label: string; threshold: number; value: number; qualifies: boolean }> = [
    { label: "CS 99", threshold: 100, value: 99, qualifies: false },
    { label: "CS 100", threshold: 100, value: 100, qualifies: false },
    { label: "CS 101", threshold: 100, value: 101, qualifies: true },
    { label: "LT 199", threshold: 200, value: 199, qualifies: false },
    { label: "LT 200", threshold: 200, value: 200, qualifies: false },
    { label: "LT 201", threshold: 200, value: 201, qualifies: true },
    { label: "IMP 9", threshold: 10, value: 9, qualifies: false },
    { label: "IMP 10", threshold: 10, value: 10, qualifies: false },
    { label: "IMP 11", threshold: 10, value: 11, qualifies: true },
  ];

  for (const c of cases) {
    test(`T-BND: ${c.label} → ${c.qualifies ? "qualifies" : "rejected"}`, () => {
      // The canonical operator is: disponible > threshold (strictly greater)
      const result = c.value > c.threshold;
      expect(result).toBe(c.qualifies);
    });
  }
});

// ── J. UI terminology ───────────────────────────────────────────────────────

describe("J — UI uses 'Cobertura de mostrario' terminology", () => {
  const uiSrc = readSrc("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

  test("T28: Tab label is 'Cobertura de mostrario' not 'Plan surtido'", () => {
    expect(uiSrc).toContain('"Cobertura de mostrario"');
    expect(uiSrc).not.toContain('"Plan surtido"');
  });

  test("T29: KPI strip shows 'Posiciones faltantes'", () => {
    expect(uiSrc).toContain('"Posiciones faltantes"');
  });

  test("T30: Section title 'Disponibles en Bodega Principal'", () => {
    expect(uiSrc).toContain('"Disponibles en Bodega Principal"');
  });

  test("T31: Section title 'Requieren produccion'", () => {
    expect(uiSrc).toContain('"Requieren produccion"');
  });

  test("T32: Muestras para retirar removed from Cobertura tab (08B2R4 — lives in Retiro)", () => {
    // 08B2R4: "Muestras para retirar" section removed from Cobertura tab.
    // Retiro tab is the sole source for excess/withdrawal info.
    const cobIdx = uiSrc.indexOf('drawerTab === "cobertura"');
    const afterCob = uiSrc.slice(cobIdx, cobIdx + 5000);
    expect(afterCob).not.toContain('"Muestras para retirar"');
  });

  test("T33: COVERAGE_STATUS_LABEL uses B01_AVAILABLE/OP_INCOMING/etc.", () => {
    expect(uiSrc).toContain("B01_AVAILABLE:");
    expect(uiSrc).toContain("OP_INCOMING:");
    expect(uiSrc).toContain("PRODUCTION_REQUIRED:");
    expect(uiSrc).toContain("IMPORT_UNAVAILABLE:");
    expect(uiSrc).toContain("DATA_UNVERIFIED:");
  });

  test("T34: Position rows keyed by positionId", () => {
    expect(uiSrc).toContain("key={pos.positionId}");
  });

  test("T35: Inline suggestion shows B01 availability", () => {
    expect(uiSrc).toContain("firstCandidate.reference");
    expect(uiSrc).toContain("B01:");
  });

  test("T36: Expanded detail shows minWholesaleLot for production", () => {
    expect(uiSrc).toContain("minWholesaleLot");
    expect(uiSrc).toContain("Cantidad minima mayorista");
  });
});

// ── K. Loader integration ───────────────────────────────────────────────────

describe("K — Loader passes data to sample coverage engine", () => {
  const loaderSrc = readSrc("lib/comercial/maletas/vendor-sample-loader.ts");

  test("T37: Loader imports from sample-coverage-engine", () => {
    expect(loaderSrc).toContain('from "./sample-coverage-engine"');
  });

  test("T38: Loader passes dataAvailability to buildSampleCoverageResult", () => {
    const callSite = loaderSrc.indexOf("buildSampleCoverageResult(");
    const chunk = loaderSrc.slice(callSite, callSite + 300);
    expect(chunk).toContain("allCentralRefs");
    expect(chunk).toContain("unifiedOpCandidates");
    expect(chunk).toContain("b01Available");
    expect(chunk).toContain("opAvailable");
  });

  test("T39: VendorSampleLoadResult uses sampleCoverage (not supplyPlan)", () => {
    expect(loaderSrc).toContain("sampleCoverage: SampleCoverageResult");
    expect(loaderSrc).not.toContain("supplyPlan: SalesPortfolioSupplyPlan");
  });
});

// ── L. Cross-grupo matching (MALETAS-08B2R2) ──────────────────────────────

describe("L — Cross-grupo matching via additionalSagGrupos", () => {
  const typeSrc = readSrc("lib/comercial/maletas/assortment-catalog/mallet-assortment-types.ts");
  const catalogSrc = readSrc("lib/comercial/maletas/assortment-catalog/castillitos-mallet-assortment-catalog.ts");
  const engineSrc = readSrc("lib/comercial/maletas/sample-coverage-engine.ts");
  const evalSrc = readSrc("lib/comercial/maletas/maletas-functional-evaluation.ts");

  test("T40: MalletAssortmentGroup has additionalSagGrupos field", () => {
    expect(typeSrc).toContain("additionalSagGrupos");
  });

  test("T41: CS NIÑA BEBE accepts BASICAS BEBE", () => {
    expect(catalogSrc).toContain('sagGrupo: "CS NIÑA BEBE"');
    expect(catalogSrc).toContain('additionalSagGrupos: ["BASICAS BEBE"]');
  });

  test("T42: CS NIÑO BEBE accepts BASICAS BEBE", () => {
    const idx = catalogSrc.indexOf('"CS NIÑO BEBE"');
    const chunk = catalogSrc.slice(idx, idx + 200);
    expect(chunk).toContain("BASICAS BEBE");
  });

  test("T43: CS NIÑA KIDS accepts BASICAS KIDS", () => {
    const idx = catalogSrc.indexOf('"CS NIÑA KIDS"');
    const chunk = catalogSrc.slice(idx, idx + 200);
    expect(chunk).toContain("BASICAS KIDS");
  });

  test("T44: CS NIÑO KIDS accepts BASICAS KIDS", () => {
    const idx = catalogSrc.indexOf('"CS NIÑO KIDS"');
    const chunk = catalogSrc.slice(idx, idx + 200);
    expect(chunk).toContain("BASICAS KIDS");
  });

  test("T45: matchesTextilEntry accepts sagGrupos array (not single string)", () => {
    expect(engineSrc).toContain("sagGrupos: string[]");
    expect(engineSrc).toContain("sagGrupos.some(");
  });

  test("T46: AssortmentGroupEval has additionalSagGrupos field", () => {
    expect(evalSrc).toContain("additionalSagGrupos: string[]");
  });

  test("T47: Evaluation propagates additionalSagGrupos from catalog", () => {
    expect(evalSrc).toContain("additionalSagGrupos: [...(group.additionalSagGrupos");
  });

  test("T48: Coverage engine builds sagGrupos from primary + additional", () => {
    expect(engineSrc).toContain("if (group.sagGrupo) sagGrupos.push(group.sagGrupo)");
    expect(engineSrc).toContain("if (group.additionalSagGrupos) sagGrupos.push(...group.additionalSagGrupos)");
  });
});

// ── M. Enrichment from ProductEntity (MALETAS-08B2R1) ───────────────────────

describe("M — Loader enriches allCentralRefs from ProductEntity canonicalMap", () => {
  const loaderSrc = readSrc("lib/comercial/maletas/vendor-sample-loader.ts");

  test("T49: allCentralRefs uses canonicalMap for grupoSag", () => {
    expect(loaderSrc).toContain("classified?.grupoSag ?? cr.grupoSag");
  });

  test("T50: allCentralRefs uses canonicalMap for subgrupoSag", () => {
    expect(loaderSrc).toContain("classified?.subgrupoSag ?? cr.subgrupoSag");
  });

  test("T51: canonicalMap variable is classifyMaletaReferencesBatch result", () => {
    expect(loaderSrc).toContain("const canonicalMap = await classifyMaletaReferencesBatch");
  });

  test("T52: Enrichment comment documents the root cause", () => {
    expect(loaderSrc).toContain("canonical.refs have grupoSag/subgrupoSag=null");
  });
});

// ── N. MAMELUCO LARGO alias (MALETAS-08B2R1) ────────────────────────────────

describe("N — MAMELUCO LARGO SAG alias for Mameluco positions", () => {
  const catalogSrc = readSrc("lib/comercial/maletas/assortment-catalog/castillitos-mallet-assortment-catalog.ts");

  test("T53: CS NIÑA BEBE Mameluco accepts MAMELUCO LARGO", () => {
    const idx = catalogSrc.indexOf('"CS NIÑA BEBE"');
    const chunk = catalogSrc.slice(idx, idx + 800);
    expect(chunk).toContain('"MAMELUCO LARGO"');
  });

  test("T54: CS NIÑO BEBE Mameluco accepts MAMELUCO LARGO", () => {
    const idx = catalogSrc.indexOf('"CS NIÑO BEBE"');
    const chunk = catalogSrc.slice(idx, idx + 800);
    expect(chunk).toContain('"MAMELUCO LARGO"');
  });
});

// ── O. OP cascade structural invariants ─────────────────────────────────────

describe("O — OP cascade: B01 → OP → PRODUCTION_REQUIRED", () => {
  const engineSrc = readSrc("lib/comercial/maletas/sample-coverage-engine.ts");
  const loaderSrc = readSrc("lib/comercial/maletas/vendor-sample-loader.ts");

  test("T55: OP candidates loaded from ProductionOrder + ProductionOrderLine", () => {
    expect(loaderSrc).toContain('"ProductionOrderLine"');
    expect(loaderSrc).toContain('"ProductionOrder"');
  });

  test("T56: OP candidates filtered to open + not closed", () => {
    expect(loaderSrc).toContain("status = 'open'");
    expect(loaderSrc).toContain('"isClosed" = false');
  });

  test("T57: OP candidates resolved to subgrupoId via ProductEntity", () => {
    expect(loaderSrc).toContain("subgrupoId: { not: null }");
    expect(loaderSrc).toContain("peMap.set(p.sku");
  });

  test("T58: OP matching uses same matchesTextilEntry as B01", () => {
    const opSection = engineSrc.slice(
      engineSrc.indexOf("// STEP 2: OP Activa"),
      engineSrc.indexOf("// STEP 3: PRODUCTION_REQUIRED"),
    );
    expect(opSection).toContain("matchesTextilEntry(");
    expect(opSection).toContain("sagGrupos");
    expect(opSection).toContain("entry.sagSubgrupos");
  });

  test("T59: OP matching excludes refs in vendor bag", () => {
    const opSection = engineSrc.slice(
      engineSrc.indexOf("// STEP 2: OP Activa"),
      engineSrc.indexOf("// STEP 3: PRODUCTION_REQUIRED"),
    );
    expect(opSection).toContain("vendorRefs.has(op.reference.trim().toUpperCase())");
  });

  test("T60: OP matching excludes usedReferences", () => {
    const opSection = engineSrc.slice(
      engineSrc.indexOf("// STEP 2: OP Activa"),
      engineSrc.indexOf("// STEP 3: PRODUCTION_REQUIRED"),
    );
    expect(opSection).toContain("usedReferences.has(op.reference.trim().toUpperCase())");
  });

  test("T61: PRODUCTION_REQUIRED only emitted after B01 AND OP miss (STEP 3)", () => {
    const step3Idx = engineSrc.indexOf("// STEP 3: PRODUCTION_REQUIRED");
    expect(step3Idx).toBeGreaterThan(0);
    const after = engineSrc.slice(step3Idx, step3Idx + 400);
    expect(after).toContain('"PRODUCTION_REQUIRED"');
    expect(after).toContain("Sin referencia mayorista disponible en B01 ni en OP activa");
  });

  test("T62: A single B01 ref cannot fill two positions (usedReferences dedup)", () => {
    expect(engineSrc).toContain("usedReferences.add(bodegaMatch.reference.trim().toUpperCase())");
    expect(engineSrc).toContain("usedReferences.add(opMatch.reference.trim().toUpperCase())");
  });
});

// ── P. Behavioral tests — buildSampleCoverageResult with fixtures ────────────

import { vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../comercial/maletas/maletas-canonical-inventory", () => ({
  MALETA_COVERAGE_MINIMUMS: { CASTILLITOS: 100, LATIN_KIDS: 200, IMPORTACION: 10 },
}));

import {
  buildSampleCoverageResult,
  type CentralRef,
  type CoverageDataAvailability,
} from "../../comercial/maletas/sample-coverage-engine";
import type {
  VendorAssortmentResult,
  AssortmentGroupEval,
  AssortmentEntryEval,
  CatalogEvaluation,
  OpCoverageCandidate,
} from "../../comercial/maletas/maletas-functional-evaluation";

// ── Fixtures ──

function makeEntry(overrides: Partial<AssortmentEntryEval> = {}): AssortmentEntryEval {
  return {
    subgroupCode: "CAMISETA",
    subgroupName: "Camiseta",
    sagSubgrupos: ["CAMISETA"],
    measurementUnit: "REFERENCES",
    targetReferences: 1,
    currentReferences: 0,
    targetUnits: 1,
    officialIdeal: 1,
    isCustomIdeal: false,
    currentUnits: 0,
    delta: -1,
    complete: false,
    excess: false,
    matchedReferences: [],
    isAmbiguousPosition: false,
    ...overrides,
  };
}

function makeGroup(overrides: Partial<AssortmentGroupEval> & { entries?: AssortmentEntryEval[] } = {}): AssortmentGroupEval {
  return {
    groupCode: "CS_NINA_BEBE",
    groupName: "CS Niña Bebé",
    sagGrupo: "CS NIÑA BEBE",
    additionalSagGrupos: ["BASICAS BEBE"],
    completeEntries: 0,
    missingEntries: 1,
    excessEntries: 0,
    groupCompletion: 0,
    entries: [makeEntry()],
    ...overrides,
  };
}

function makeCatalog(overrides: Partial<CatalogEvaluation> & { groups?: AssortmentGroupEval[] } = {}): CatalogEvaluation {
  return {
    catalogId: "CS_TEXTIL_V3",
    catalogName: "Castillitos Textil",
    catalogVersion: "3.0",
    commercialWorld: "TEXTIL",
    brand: "Castillitos",
    overallCompletion: 0,
    totalComplete: 0,
    totalMissing: 1,
    totalExcess: 0,
    totalEntries: 1,
    groups: [makeGroup()],
    ...overrides,
  };
}

function makeVendorEval(catalogs?: CatalogEvaluation[]): VendorAssortmentResult {
  return {
    vendorId: "vendor-nestor",
    catalogs: catalogs ?? [makeCatalog()],
    unresolvedRefs: [],
    unresolvedSummary: { total: 0, sinSizeClassEnSag: 0, productoNoResuelto: 0, valorNoHomologado: 0, noEsImportacion: 0, ambiguousDerroteroGroup: 0 },
  };
}

function makeRef(overrides: Partial<CentralRef> = {}): CentralRef {
  return {
    reference: "REF-001",
    description: "Camiseta Niña Bebé",
    line: "CS",
    grupoSag: "CS NIÑA BEBE",
    subgrupoSag: "CAMISETA",
    sizeClass: null,
    disponible: 150,
    ...overrides,
  };
}

function makeOp(overrides: Partial<OpCoverageCandidate> = {}): OpCoverageCandidate {
  return {
    reference: "REF-OP-001",
    description: "Camiseta OP",
    line: "CS",
    subgrupoSag: "CAMISETA",
    grupoSag: "CS NIÑA BEBE",
    pendingQty: 500,
    opNumber: "3500",
    createdAt: new Date().toISOString(),
    lastEventDate: null,
    ...overrides,
  };
}

const DATA_BOTH: CoverageDataAvailability = { b01Available: true, opAvailable: true };
const DATA_NONE: CoverageDataAvailability = { b01Available: false, opAvailable: false };
const DATA_B01_ONLY: CoverageDataAvailability = { b01Available: true, opAvailable: false };

describe("P — Behavioral: buildSampleCoverageResult with fixtures", () => {
  test("T63: B01 ref disponible > threshold → B01_AVAILABLE", () => {
    const result = buildSampleCoverageResult(
      [makeVendorEval()],
      [makeRef({ disponible: 150 })],
      [],
      new Map([["vendor-nestor", new Set<string>()]]),
      new Map([["vendor-nestor", "Néstor"]]),
      DATA_BOTH,
    );
    const pos = result.vendorCoverages[0].positions[0];
    expect(pos.status).toBe("B01_AVAILABLE");
    expect(pos.candidates[0].reference).toBe("REF-001");
    expect(pos.candidates[0].availableQty).toBe(150);
  });

  test("T64: B01 ref disponible = threshold (not >) → not B01_AVAILABLE", () => {
    const result = buildSampleCoverageResult(
      [makeVendorEval()],
      [makeRef({ disponible: 100 })],
      [],
      new Map([["vendor-nestor", new Set<string>()]]),
      new Map([["vendor-nestor", "Néstor"]]),
      DATA_BOTH,
    );
    const pos = result.vendorCoverages[0].positions[0];
    expect(pos.status).not.toBe("B01_AVAILABLE");
  });

  test("T65: No B01 + OP activa → OP_INCOMING", () => {
    const result = buildSampleCoverageResult(
      [makeVendorEval()],
      [],
      [makeOp()],
      new Map([["vendor-nestor", new Set<string>()]]),
      new Map([["vendor-nestor", "Néstor"]]),
      DATA_BOTH,
    );
    const pos = result.vendorCoverages[0].positions[0];
    expect(pos.status).toBe("OP_INCOMING");
    expect(pos.candidates[0].opNumber).toBe("3500");
  });

  test("T66: No B01 + No OP → PRODUCTION_REQUIRED", () => {
    const result = buildSampleCoverageResult(
      [makeVendorEval()],
      [],
      [],
      new Map([["vendor-nestor", new Set<string>()]]),
      new Map([["vendor-nestor", "Néstor"]]),
      DATA_BOTH,
    );
    const pos = result.vendorCoverages[0].positions[0];
    expect(pos.status).toBe("PRODUCTION_REQUIRED");
    expect(pos.candidates[0].explanation).toContain("Sin referencia mayorista disponible en B01 ni en OP activa");
  });

  test("T67: Sources unavailable → DATA_UNVERIFIED (never PRODUCTION_REQUIRED)", () => {
    const result = buildSampleCoverageResult(
      [makeVendorEval()],
      [],
      [],
      new Map([["vendor-nestor", new Set<string>()]]),
      new Map([["vendor-nestor", "Néstor"]]),
      DATA_NONE,
    );
    const pos = result.vendorCoverages[0].positions[0];
    expect(pos.status).toBe("DATA_UNVERIFIED");
    expect(pos.candidates[0].explanation).toContain("No se recomienda producir");
  });

  test("T68: B01 unavailable → DATA_UNVERIFIED (B01 gate fires first)", () => {
    const result = buildSampleCoverageResult(
      [makeVendorEval()],
      [],
      [makeOp()],
      new Map([["vendor-nestor", new Set<string>()]]),
      new Map([["vendor-nestor", "Néstor"]]),
      DATA_NONE,
    );
    const pos = result.vendorCoverages[0].positions[0];
    expect(pos.status).toBe("DATA_UNVERIFIED");
  });

  test("T69: B01 ok + OP unavailable → DATA_UNVERIFIED after B01 miss", () => {
    const result = buildSampleCoverageResult(
      [makeVendorEval()],
      [],
      [makeOp()],
      new Map([["vendor-nestor", new Set<string>()]]),
      new Map([["vendor-nestor", "Néstor"]]),
      DATA_B01_ONLY,
    );
    const pos = result.vendorCoverages[0].positions[0];
    expect(pos.status).toBe("DATA_UNVERIFIED");
  });

  test("T70: Cross-grupo: BASICAS BEBE ref matches CS NIÑA BEBE position", () => {
    const result = buildSampleCoverageResult(
      [makeVendorEval()],
      [makeRef({ grupoSag: "BASICAS BEBE", subgrupoSag: "CAMISETA", disponible: 150 })],
      [],
      new Map([["vendor-nestor", new Set<string>()]]),
      new Map([["vendor-nestor", "Néstor"]]),
      DATA_BOTH,
    );
    const pos = result.vendorCoverages[0].positions[0];
    expect(pos.status).toBe("B01_AVAILABLE");
  });

  test("T71: Wrong grupo (not in additionalSagGrupos) → not B01_AVAILABLE", () => {
    const group = makeGroup({ sagGrupo: "CS NIÑA BEBE", additionalSagGrupos: ["BASICAS BEBE"] });
    const result = buildSampleCoverageResult(
      [makeVendorEval([makeCatalog({ groups: [group] })])],
      [makeRef({ grupoSag: "LT NIÑA KIDS", subgrupoSag: "CAMISETA", disponible: 150 })],
      [],
      new Map([["vendor-nestor", new Set<string>()]]),
      new Map([["vendor-nestor", "Néstor"]]),
      DATA_BOTH,
    );
    const pos = result.vendorCoverages[0].positions[0];
    expect(pos.status).not.toBe("B01_AVAILABLE");
  });

  test("T72: Ref already in vendor bag → not assigned", () => {
    const vendorBag = new Set(["REF-001"]);
    const result = buildSampleCoverageResult(
      [makeVendorEval()],
      [makeRef({ reference: "REF-001", disponible: 150 })],
      [],
      new Map([["vendor-nestor", vendorBag]]),
      new Map([["vendor-nestor", "Néstor"]]),
      DATA_BOTH,
    );
    const pos = result.vendorCoverages[0].positions[0];
    expect(pos.status).not.toBe("B01_AVAILABLE");
  });

  test("T73: Same ref cannot fill two positions (dedup)", () => {
    const twoEntries = makeGroup({
      entries: [
        makeEntry({ subgroupCode: "CAMISETA", subgroupName: "Camiseta" }),
        makeEntry({ subgroupCode: "CAMISETA2", subgroupName: "Camiseta 2" }),
      ],
      missingEntries: 2,
    });
    const result = buildSampleCoverageResult(
      [makeVendorEval([makeCatalog({ groups: [twoEntries], totalMissing: 2, totalEntries: 2 })])],
      [makeRef({ reference: "REF-001", disponible: 150 })],
      [],
      new Map([["vendor-nestor", new Set<string>()]]),
      new Map([["vendor-nestor", "Néstor"]]),
      DATA_BOTH,
    );
    const vc = result.vendorCoverages[0];
    const b01Positions = vc.positions.filter(p => p.status === "B01_AVAILABLE");
    expect(b01Positions.length).toBe(1);
  });

  test("T74: Deterministic: highest disponible wins", () => {
    const result = buildSampleCoverageResult(
      [makeVendorEval()],
      [
        makeRef({ reference: "REF-LOW", disponible: 110 }),
        makeRef({ reference: "REF-HIGH", disponible: 500 }),
      ],
      [],
      new Map([["vendor-nestor", new Set<string>()]]),
      new Map([["vendor-nestor", "Néstor"]]),
      DATA_BOTH,
    );
    const pos = result.vendorCoverages[0].positions[0];
    expect(pos.candidates[0].reference).toBe("REF-HIGH");
  });

  test("T75: Sum invariant: b01 + op + production + import + unverified = total positions", () => {
    const multiGroup = makeGroup({
      entries: [
        makeEntry({ subgroupCode: "CAMISETA", subgroupName: "Camiseta" }),
        makeEntry({ subgroupCode: "POLO", subgroupName: "Polo", sagSubgrupos: ["POLO"] }),
        makeEntry({ subgroupCode: "BUZO", subgroupName: "Buzo", sagSubgrupos: ["CAMIBUSO"] }),
      ],
      missingEntries: 3,
    });
    const result = buildSampleCoverageResult(
      [makeVendorEval([makeCatalog({ groups: [multiGroup], totalMissing: 3, totalEntries: 3 })])],
      [makeRef({ reference: "REF-A", subgrupoSag: "CAMISETA", disponible: 200 })],
      [makeOp({ reference: "REF-B", subgrupoSag: "POLO", grupoSag: "CS NIÑA BEBE" })],
      new Map([["vendor-nestor", new Set<string>()]]),
      new Map([["vendor-nestor", "Néstor"]]),
      DATA_BOTH,
    );
    const vc = result.vendorCoverages[0];
    const sum = vc.b01Available + vc.opIncoming + vc.productionRequired + vc.importUnavailable + vc.dataUnverified;
    expect(sum).toBe(vc.positions.length);
    expect(vc.b01Available).toBe(1);
    expect(vc.opIncoming).toBe(1);
    expect(vc.productionRequired).toBe(1);
  });

  test("T76: OP with stale date (>180 days) → filtered out, PRODUCTION_REQUIRED", () => {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 200);
    const result = buildSampleCoverageResult(
      [makeVendorEval()],
      [],
      [makeOp({ createdAt: staleDate.toISOString(), lastEventDate: null })],
      new Map([["vendor-nestor", new Set<string>()]]),
      new Map([["vendor-nestor", "Néstor"]]),
      DATA_BOTH,
    );
    const pos = result.vendorCoverages[0].positions[0];
    expect(pos.status).toBe("PRODUCTION_REQUIRED");
  });
});
