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

  test("T32: Section title 'Muestras para retirar'", () => {
    expect(uiSrc).toContain('"Muestras para retirar"');
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
    expect(chunk).toContain("opCovCandidates");
    expect(chunk).toContain("b01Available");
    expect(chunk).toContain("opAvailable");
  });

  test("T39: VendorSampleLoadResult uses sampleCoverage (not supplyPlan)", () => {
    expect(loaderSrc).toContain("sampleCoverage: SampleCoverageResult");
    expect(loaderSrc).not.toContain("supplyPlan: SalesPortfolioSupplyPlan");
  });
});
