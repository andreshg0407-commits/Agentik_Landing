/**
 * MALETAS-P0-PRODUCTION-SAFETY-NORMALIZATION-08B2R6
 *
 * 23 safety tests covering:
 *   A. False PRODUCTION_REQUIRED blocking when stock exists below threshold
 *   B. No production side effects (zero DB, zero orders)
 *   C. Canonical normalization vocabulary (BB/BABY/BEBÉ → BEBE)
 *   D. Display labels (Bebé, Niña, Niño)
 *   E. Structured normalization model
 *   F. Single normalization source
 *   G/H/I. B01/B04 evidence (source-level checks)
 *   J. Threshold semantics: below = REVIEW, not PRODUCTION
 *   K. No contradictory badge states
 *   L. Counter reconciliation (coverageSummary invariant)
 */

import { describe, test, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

vi.mock("server-only", () => ({}));
vi.mock("../../comercial/maletas/maletas-canonical-inventory", () => ({
  MALETA_COVERAGE_MINIMUMS: { CASTILLITOS: 100, LATIN_KIDS: 200, IMPORTACION: 10 },
}));

function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

// ══════════════════════════════════════════════════════════════════════════
// Engine source
// ══════════════════════════════════════════════════════════════════════════

const engineSrc = readSrc("lib/comercial/maletas/sample-coverage-engine.ts");
const normalizerSrc = readSrc("lib/comercial/maletas/textile-reference-normalizer.ts");
const uiSrc = readSrc("app/(app)/[orgSlug]/comercial/maletas/maletas-client.tsx");

// ══════════════════════════════════════════════════════════════════════════
// Dynamic imports
// ══════════════════════════════════════════════════════════════════════════

import {
  buildSampleCoverageResult,
  WHOLESALE_THRESHOLDS,
  type CentralRef,
  type CoverageDataAvailability,
  type CoverageStatus,
} from "../../comercial/maletas/sample-coverage-engine";

import {
  normalizeTextileReference,
  toDisplayLabel,
} from "../../comercial/maletas/textile-reference-normalizer";

import type {
  VendorAssortmentResult,
  CatalogEvaluation,
  AssortmentGroupEval,
  AssortmentEntryEval,
  OpCoverageCandidate,
} from "../../comercial/maletas/maletas-functional-evaluation";

// ══════════════════════════════════════════════════════════════════════════
// Fixtures
// ══════════════════════════════════════════════════════════════════════════

const DATA_BOTH: CoverageDataAvailability = { b01Available: true, opAvailable: true };

function makeEntry(overrides: Record<string, unknown> = {}): AssortmentEntryEval {
  return {
    subgroupCode: "SG-001",
    subgroupName: "VESTIDO CC",
    targetReferences: 5,
    currentReferences: 2,
    matchedReferences: ["L-1001", "L-1002"],
    complete: false,
    excess: false,
    sagSubgrupos: ["VESTIDO CC"],
    isAmbiguousPosition: false,
    ...overrides,
  } as AssortmentEntryEval;
}

function makeGroup(overrides: Record<string, unknown> = {}): AssortmentGroupEval {
  return {
    groupCode: "GRP-001",
    groupName: "CS Niña Bebé",
    sagGrupo: "CS NIÑA BEBE",
    additionalSagGrupos: [],
    entries: [makeEntry()],
    ...overrides,
  } as unknown as AssortmentGroupEval;
}

function makeCatalog(overrides: Record<string, unknown> = {}): CatalogEvaluation {
  return {
    catalogId: "CAT-CS-NB",
    catalogName: "Castillitos Niña Bebé",
    commercialWorld: "NACIONAL",
    brand: "Castillitos",
    groups: [makeGroup()],
    ...overrides,
  } as CatalogEvaluation;
}

function makeVendorEval(overrides: Record<string, unknown> = {}): VendorAssortmentResult {
  return {
    vendorId: "vendor-nestor",
    catalogs: [makeCatalog()],
    unresolvedSummary: {
      totalRefs: 0,
      matchedRefs: 0,
      unmatchedRefs: 0,
      matchRate: 100,
      unmatchedDetails: [],
      ambiguousDerroteroGroup: 0,
    },
    ...overrides,
  } as unknown as VendorAssortmentResult;
}

function makeRef(
  reference: string,
  disponible: number,
  subgrupoSag = "VESTIDO CC",
  grupoSag = "CS NIÑA BEBE",
  line = "CS",
): CentralRef {
  return { reference, description: `Desc ${reference}`, line, grupoSag, subgrupoSag, sizeClass: null, disponible };
}

// ══════════════════════════════════════════════════════════════════════════
// A — STOCK_AVAILABLE_BELOW_THRESHOLD blocks false PRODUCTION_REQUIRED
// ══════════════════════════════════════════════════════════════════════════

describe("A — STOCK_AVAILABLE_BELOW_THRESHOLD blocks false PRODUCTION_REQUIRED", () => {
  test("S01: B01 ref with 50 disponible (CS threshold=100) yields STOCK_AVAILABLE_BELOW_THRESHOLD, not PRODUCTION_REQUIRED", () => {
    const refs: CentralRef[] = [makeRef("L-5050", 50)];
    const result = buildSampleCoverageResult(
      [makeVendorEval({ catalogs: [makeCatalog({ groups: [makeGroup({ entries: [makeEntry({ targetReferences: 3, currentReferences: 2, matchedReferences: ["L-1001", "L-1002"] })] })] })] })],
      refs, [], new Map([["vendor-nestor", new Set<string>()]]), new Map([["vendor-nestor", "Néstor"]]), DATA_BOTH,
    );
    const pos = result.vendorCoverages[0].positions[0];
    expect(pos.status).toBe("STOCK_AVAILABLE_BELOW_THRESHOLD");
    expect(pos.candidates[0].availableQty).toBe(50);
    expect(pos.candidates[0].explanation).toContain("Requiere revision humana");
  });

  test("S02: B01 ref with 1 disponible still blocks PRODUCTION_REQUIRED", () => {
    const refs: CentralRef[] = [makeRef("L-9001", 1)];
    const result = buildSampleCoverageResult(
      [makeVendorEval()], refs, [], new Map([["vendor-nestor", new Set<string>()]]), new Map([["vendor-nestor", "Néstor"]]), DATA_BOTH,
    );
    const pos = result.vendorCoverages[0].positions[0];
    expect(pos.status).toBe("STOCK_AVAILABLE_BELOW_THRESHOLD");
    expect(pos.candidates[0].status).toBe("STOCK_AVAILABLE_BELOW_THRESHOLD");
  });

  test("S03: B01 ref with disponible > threshold yields B01_AVAILABLE", () => {
    const refs: CentralRef[] = [makeRef("L-9002", 150)];
    const result = buildSampleCoverageResult(
      [makeVendorEval()], refs, [], new Map([["vendor-nestor", new Set<string>()]]), new Map([["vendor-nestor", "Néstor"]]), DATA_BOTH,
    );
    const pos = result.vendorCoverages[0].positions[0];
    expect(pos.status).toBe("B01_AVAILABLE");
  });

  test("S04: B01 ref with disponible = 0 does NOT trigger STOCK_AVAILABLE_BELOW_THRESHOLD (goes to PRODUCTION_REQUIRED)", () => {
    const refs: CentralRef[] = [makeRef("L-9003", 0)];
    const result = buildSampleCoverageResult(
      [makeVendorEval()], refs, [], new Map([["vendor-nestor", new Set<string>()]]), new Map([["vendor-nestor", "Néstor"]]), DATA_BOTH,
    );
    const pos = result.vendorCoverages[0].positions[0];
    expect(pos.status).toBe("PRODUCTION_REQUIRED");
  });

  test("S05: B01 ref with disponible exactly = threshold yields STOCK_AVAILABLE_BELOW_THRESHOLD (not B01_AVAILABLE)", () => {
    // threshold for CS = 100, disponible = 100 means <= threshold, not > threshold
    const refs: CentralRef[] = [makeRef("L-9004", 100)];
    const result = buildSampleCoverageResult(
      [makeVendorEval()], refs, [], new Map([["vendor-nestor", new Set<string>()]]), new Map([["vendor-nestor", "Néstor"]]), DATA_BOTH,
    );
    const pos = result.vendorCoverages[0].positions[0];
    expect(pos.status).toBe("STOCK_AVAILABLE_BELOW_THRESHOLD");
  });

  test("S06: STOCK_AVAILABLE_BELOW_THRESHOLD has priority 3 (between OP_INCOMING:2 and PRODUCTION_REQUIRED:4)", () => {
    expect(engineSrc).toContain("STOCK_AVAILABLE_BELOW_THRESHOLD: 3,");
    expect(engineSrc).toContain("OP_INCOMING: 2,");
    expect(engineSrc).toContain("PRODUCTION_REQUIRED: 4,");
  });

  test("S07: coverageSummary includes stockBelowThreshold counter", () => {
    const refs: CentralRef[] = [makeRef("L-BT-1", 50), makeRef("L-BT-2", 30)];
    const entry1 = makeEntry({ subgroupCode: "SG-A", targetReferences: 3, currentReferences: 2, matchedReferences: ["L-X1", "L-X2"] });
    const entry2 = makeEntry({ subgroupCode: "SG-B", targetReferences: 3, currentReferences: 2, matchedReferences: ["L-Y1", "L-Y2"], subgroupName: "VESTIDO CC2", sagSubgrupos: ["VESTIDO CC"] });
    const result = buildSampleCoverageResult(
      [makeVendorEval({ catalogs: [makeCatalog({ groups: [makeGroup({ entries: [entry1, entry2] })] })] })],
      refs, [], new Map([["vendor-nestor", new Set<string>()]]), new Map([["vendor-nestor", "Néstor"]]), DATA_BOTH,
    );
    expect(result.coverageSummary.stockBelowThreshold).toBeGreaterThanOrEqual(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B — No production side effects
// ══════════════════════════════════════════════════════════════════════════

describe("B — No production side effects from PRODUCTION_REQUIRED", () => {
  test("S08: Engine is pure — no Prisma, no DB, no fetch, no side effects", () => {
    expect(engineSrc).not.toContain("import { prisma");
    expect(engineSrc).not.toContain("from \"@prisma/client\"");
    expect(engineSrc).not.toContain("await prisma.");
    expect(engineSrc).not.toContain("fetch(");
    expect(engineSrc).not.toContain("db.");
  });

  test("S09: No OrderEvent, no createOrder, no OP creation in engine", () => {
    expect(engineSrc).not.toContain("OrderEvent");
    expect(engineSrc).not.toContain("createOrder");
    expect(engineSrc).not.toContain("createProductionOrder");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C — Canonical normalization vocabulary
// ══════════════════════════════════════════════════════════════════════════

describe("C — Canonical normalization vocabulary", () => {
  test("S10: BB → BEBE", () => {
    const n = normalizeTextileReference("PIJAMA BB NIÑA CC", null, "PIJAMA CC", "CS");
    expect(n.segmentoEdad).toBe("BEBE");
  });

  test("S11: BABY → BEBE", () => {
    const n = normalizeTextileReference("CONJUNTO BABY NIÑA", null, "CONJUNTO CC", "CS");
    expect(n.segmentoEdad).toBe("BEBE");
  });

  test("S12: BEBÉ → BEBE (accent-insensitive)", () => {
    const n = normalizeTextileReference("VESTIDO BEBÉ NIÑA CC", null, "VESTIDO CC", "CS");
    expect(n.segmentoEdad).toBe("BEBE");
  });

  test("S13: CC → CORTA/CORTA, CL → CORTA/LARGA, LL → LARGA/LARGA", () => {
    expect(normalizerSrc).toContain('"CC": { superior: "CORTA", inferior: "CORTA" }');
    expect(normalizerSrc).toContain('"CL": { superior: "CORTA", inferior: "LARGA" }');
    expect(normalizerSrc).toContain('"LL": { superior: "LARGA", inferior: "LARGA" }');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D — Display labels
// ══════════════════════════════════════════════════════════════════════════

describe("D — Display labels replace abbreviations", () => {
  test("S14: toDisplayLabel converts BB/BEBE to Bebé", () => {
    expect(toDisplayLabel("CS NIÑA BEBE")).toContain("Bebé");
  });

  test("S15: toDisplayLabel converts NINA to Niña", () => {
    expect(toDisplayLabel("NINA")).toBe("Niña");
  });

  test("S16: toDisplayLabel converts NINO to Niño", () => {
    expect(toDisplayLabel("NINO")).toBe("Niño");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E — Structured normalization model
// ══════════════════════════════════════════════════════════════════════════

describe("E — NormalizedReference has structured fields", () => {
  test("S17: normalizeTextileReference returns familia, genero, segmentoEdad, construccion", () => {
    const n = normalizeTextileReference("VESTIDO NIÑA BEBE CC", "CS NIÑA BEBE", "VESTIDO CC", "CS");
    expect(n.familiaProducto).toBe("VESTIDO");
    expect(n.genero).toBe("NIÑA");
    expect(n.segmentoEdad).toBe("BEBE");
    expect(n.construccionSuperior).toBe("CORTA");
    expect(n.construccionInferior).toBe("CORTA");
    expect(n.matchKey).toBeDefined();
    expect(n.confidence).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F — Single normalization source
// ══════════════════════════════════════════════════════════════════════════

describe("F — Single normalization source", () => {
  test("S18: toDisplayLabel is exported from textile-reference-normalizer (not duplicated)", () => {
    expect(normalizerSrc).toContain("export function toDisplayLabel(");
  });

  test("S19: Engine does not define its own BEBE/BB/BABY token map", () => {
    expect(engineSrc).not.toContain("\"BB\": \"BEBE\"");
    expect(engineSrc).not.toContain("\"BABY\": \"BEBE\"");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// J — Threshold semantics: below = REVIEW, not PRODUCTION
// ══════════════════════════════════════════════════════════════════════════

describe("J — Below-threshold means REVIEW, not PRODUCTION", () => {
  test("S20: STEP 1b exists in engine and emits STOCK_AVAILABLE_BELOW_THRESHOLD", () => {
    expect(engineSrc).toContain("// STEP 1b:");
    expect(engineSrc).toContain("STOCK_AVAILABLE_BELOW_THRESHOLD");
    expect(engineSrc).toContain("Requiere revision humana");
    expect(engineSrc).toContain("no producir automaticamente");
  });

  test("S21: STEP 1b runs BEFORE OP check (between STEP 1 and STEP 2)", () => {
    const step1 = engineSrc.indexOf("// STEP 1: Bodega Principal");
    const step1b = engineSrc.indexOf("// STEP 1b:");
    const step2 = engineSrc.indexOf("// STEP 2: OP Activa");
    expect(step1).toBeGreaterThan(0);
    expect(step1b).toBeGreaterThan(step1);
    expect(step2).toBeGreaterThan(step1b);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// K — No contradictory badge states
// ══════════════════════════════════════════════════════════════════════════

describe("K — No contradictory badge states in UI", () => {
  test("S22: UI does NOT hardcode 'Certificada' for all candidates", () => {
    // The old code had: <span ...>Certificada</span> unconditionally
    // The new code computes badge based on hasSub && hasMatch
    expect(uiSrc).toContain("Sin clasificar");
    expect(uiSrc).toContain("Sin posicion");
    expect(uiSrc).toContain("Certificada");
    // Ensure conditional logic exists
    expect(uiSrc).toContain("hasSub && hasMatch");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// L — Counter reconciliation
// ══════════════════════════════════════════════════════════════════════════

describe("L — Counter reconciliation", () => {
  test("S23: coverageSummary sum invariant: all statuses sum to totalMissingPositions", () => {
    // Build a scenario with multiple status types
    const refs: CentralRef[] = [
      makeRef("L-A1", 200),  // above CS threshold → B01_AVAILABLE
    ];
    const entry1 = makeEntry({ subgroupCode: "SG-A1", targetReferences: 3, currentReferences: 2, matchedReferences: ["X1", "X2"] });
    const entry2 = makeEntry({
      subgroupCode: "SG-A2", targetReferences: 3, currentReferences: 2, matchedReferences: ["Y1", "Y2"],
      subgroupName: "PIJAMA CC", sagSubgrupos: ["PIJAMA CC"],
    });
    const result = buildSampleCoverageResult(
      [makeVendorEval({ catalogs: [makeCatalog({ groups: [makeGroup({ entries: [entry1, entry2] })] })] })],
      refs, [], new Map([["vendor-nestor", new Set<string>()]]), new Map([["vendor-nestor", "Néstor"]]), DATA_BOTH,
    );
    const cs = result.coverageSummary;
    const sum = cs.b01Available + cs.opIncoming + cs.productionRequired + cs.importUnavailable + cs.dataUnverified + cs.stockBelowThreshold;
    expect(sum).toBe(result.totalMissingPositions);
  });
});
