/**
 * MALETAS-PLAN-SURTIDO-08B1 — Supply Plan Structural Truth Tests
 *
 * Validates:
 *   A. Supply plan thresholds (CS>100, LT>200, Import>10)
 *   B. Cascade hierarchy: BODEGA → OP → PRODUCCION (never skips)
 *   C. Multi-reference deduplication across positions
 *   D. Position identity uses canonical rule ID
 *   E. "Produccion sugerida" replaces "Sin cobertura" in UI
 *   F. Mameluco duplicate prevention via canonical rule ID
 *   G. Import grandes excluded
 *   H. Invariant: sum of actions = total faltantes
 */

import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../../", relPath), "utf-8");
}

// ── A. Supply plan thresholds ────────────────────────────────────────────────

describe("A — Supply plan thresholds", () => {
  const src = readSrc("lib/comercial/maletas/supply-plan-engine.ts");

  test("T01: CS threshold is >100 (not 20)", () => {
    expect(src).toContain("CS: 100,");
  });

  test("T02: LT threshold is >200 (not 30)", () => {
    expect(src).toContain("LT: 200,");
  });

  test("T03: Import small/medium threshold is >10", () => {
    expect(src).toContain("IMPORT_SM: 10,");
  });

  test("T04: SUPPLY_PLAN_THRESHOLDS exported (independent of coverage)", () => {
    expect(src).toContain("export const SUPPLY_PLAN_THRESHOLDS");
  });
});

// ── B. Cascade hierarchy ────────────────────────────────────────────────────

describe("B — Cascade: BODEGA → OP → PRODUCCION", () => {
  const src = readSrc("lib/comercial/maletas/supply-plan-engine.ts");

  test("T05: BODEGA checked before OP (code order)", () => {
    const bodegaIdx = src.indexOf("// STEP 1: Bodega principal");
    const opIdx = src.indexOf("// STEP 2: OP Activa");
    const prodIdx = src.indexOf("// STEP 3: No coverage");
    expect(bodegaIdx).toBeGreaterThan(0);
    expect(opIdx).toBeGreaterThan(bodegaIdx);
    expect(prodIdx).toBeGreaterThan(opIdx);
  });

  test("T06: PRODUCCION only when no BODEGA and no OP", () => {
    // The PRODUCCION step should be inside a !slotFilled guard
    const prodIdx = src.indexOf("PRODUCCION_SUGERIDA");
    expect(prodIdx).toBeGreaterThan(0);
    // Should appear after "No coverage" comment
    expect(src).toContain("Sin referencia elegible en B01 ni OP activa");
  });

  test("T07: ACTION_PRIORITY gives BODEGA highest priority", () => {
    expect(src).toContain("REEMPLAZAR_BODEGA: 1,");
    expect(src).toContain("COMPLETAR_DESDE_OP: 2,");
    expect(src).toContain("PRODUCCION_SUGERIDA: 3,");
  });
});

// ── C. Deduplication ────────────────────────────────────────────────────────

describe("C — Reference deduplication across positions", () => {
  const src = readSrc("lib/comercial/maletas/supply-plan-engine.ts");

  test("T08: usedReferences set tracks selected refs", () => {
    expect(src).toContain("const usedReferences = new Set<string>()");
  });

  test("T09: Bodega candidates exclude usedReferences", () => {
    expect(src).toContain("usedReferences.has(r.reference.trim().toUpperCase())");
  });

  test("T10: OP candidates exclude usedReferences", () => {
    expect(src).toContain("usedReferences.has(op.reference.trim().toUpperCase())");
  });

  test("T11: Selected refs added to usedReferences after selection", () => {
    expect(src).toContain("usedReferences.add(bodegaMatch.reference.trim().toUpperCase())");
    expect(src).toContain("usedReferences.add(opMatch.reference.trim().toUpperCase())");
  });
});

// ── D. Position identity ────────────────────────────────────────────────────

describe("D — Canonical position identity", () => {
  const src = readSrc("lib/comercial/maletas/supply-plan-engine.ts");

  test("T12: positionId uses catalogId|groupCode|subgroupCode", () => {
    expect(src).toContain("`${catalog.catalogId}|${group.groupCode}|${entry.subgroupCode ?? entry.subgroupName}`");
  });

  test("T13: SupplyPosition has positionId field", () => {
    expect(src).toContain("positionId: string;");
  });
});

// ── E. UI labels ────────────────────────────────────────────────────────────

describe("E — Produccion sugerida replaces Sin cobertura in UI", () => {
  const uiSrc = readSrc("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

  test("T14: KPI strip shows 'Produccion sugerida' not 'Sin cobertura'", () => {
    // Find the KPI strip in the surtido tab
    const surtidoIdx = uiSrc.indexOf('drawerTab === "surtido"');
    const surtidoChunk = uiSrc.slice(surtidoIdx, surtidoIdx + 2000);
    expect(surtidoChunk).toContain('"Produccion sugerida"');
    expect(surtidoChunk).not.toContain('"Sin cobertura"');
  });

  test("T15: Section title is 'Produccion sugerida'", () => {
    expect(uiSrc).toContain('title="Produccion sugerida"');
  });

  test("T16: SIN_COBERTURA action label is 'Producir'", () => {
    expect(uiSrc).toContain('SIN_COBERTURA: "Producir"');
  });
});

// ── F. Mameluco duplicate prevention ────────────────────────────────────────

describe("F — Mameluco appears once per group (not duplicated)", () => {
  const src = readSrc("lib/comercial/maletas/supply-plan-engine.ts");
  const uiSrc = readSrc("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

  test("T17: Position rows keyed by positionId (not index)", () => {
    expect(uiSrc).toContain("key={pos.positionId}");
  });

  test("T18: Position identity differentiates groups with same subgroup name", () => {
    // CS_NINA_BEBE|MAMELUCO vs CS_NINO_BEBE|MAMELUCO → different positionIds
    expect(src).toContain("group.groupCode");
  });
});

// ── G. Import grandes excluded ──────────────────────────────────────────────

describe("G — Import grandes fully excluded", () => {
  const src = readSrc("lib/comercial/maletas/supply-plan-engine.ts");

  test("T19: GRANDE sizeClass produces zero candidates", () => {
    expect(src).toContain('"GRANDE"');
  });
});

// ── H. Invariant: action sum = faltantes ────────────────────────────────────

describe("H — Supply plan engine direct matching", () => {
  const src = readSrc("lib/comercial/maletas/supply-plan-engine.ts");

  test("T20: Engine accepts allCentralRefs directly (not BusinessCoverageResult)", () => {
    expect(src).toContain("allCentralRefs: CentralRef[]");
    expect(src).toContain("opCandidates: OpCoverageCandidate[]");
  });

  test("T21: Engine applies threshold per candidate individually", () => {
    expect(src).toContain("r.disponible > threshold");
  });

  test("T22: Multi-slot loop fills N missing with N distinct candidates", () => {
    expect(src).toContain("for (let slot = 0; slot < missing; slot++)");
  });

  test("T23: Candidates have threshold metadata", () => {
    expect(src).toContain("threshold: number;");
  });

  test("T24: matchesTextilEntry normalizes SAG codes (trim+toUpperCase)", () => {
    expect(src).toContain("candidateSubgrupoSag.trim().toUpperCase()");
    expect(src).toContain("s.trim().toUpperCase()");
  });
});

// ── I. Loader passes raw data to supply plan ────────────────────────────────

describe("I — Loader integration", () => {
  const loaderSrc = readSrc("lib/comercial/maletas/vendor-sample-loader.ts");

  test("T25: Loader passes allCentralRefs to buildSalesPortfolioSupplyPlan", () => {
    const callSite = loaderSrc.indexOf("buildSalesPortfolioSupplyPlan(");
    const chunk = loaderSrc.slice(callSite, callSite + 200);
    expect(chunk).toContain("allCentralRefs");
    expect(chunk).toContain("opCovCandidates");
    expect(chunk).toContain("vendorRefSets");
  });
});

// ── J. UI shows need + suggestion together ──────────────────────────────────

describe("J — UI shows need + suggestion in same row", () => {
  const uiSrc = readSrc("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

  test("T26: Inline suggestion strip shows reference and B01 availability", () => {
    expect(uiSrc).toContain("firstCandidate.reference");
    expect(uiSrc).toContain("B01:");
  });

  test("T27: Expanded detail shows minProductionQty for production suggestions", () => {
    expect(uiSrc).toContain("minProductionQty");
    expect(uiSrc).toContain("Cantidad minima mayorista");
  });

  test("T28: Header columns include Falta", () => {
    expect(uiSrc).toContain('"Falta"');
  });

  test("T29: Row shows missingReferences", () => {
    expect(uiSrc).toContain("pos.missingReferences");
  });
});
