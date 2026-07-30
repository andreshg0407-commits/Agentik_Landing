/**
 * lib/comercial/__tests__/derrotero-semantics.test.ts
 *
 * AGENTIK-DERROTERO-MEASUREMENT-SEMANTICS-01 — certification tests.
 *
 * Certifies the business law:
 *   TIENDAS (STORE)           → measured in UNITS (total of the rule group)
 *   MALETAS (SALES_PORTFOLIO) → measured in DISTINCT REFERENCES
 *
 * Run: npx tsx --test lib/comercial/__tests__/derrotero-semantics.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  MEASUREMENT_UNIT_BY_SCOPE,
  measurementUnitForScope,
  assertScopeMeasurementCoherence,
  evaluateUnitsRule,
  countDistinctReferences,
  distinctReferences,
  evaluateReferencesRule,
} from "../derrotero-semantics";

import { evaluateCatalog } from "../maletas/maletas-functional-evaluation";
import type {
  MalletAssortmentCatalog,
  MalletAssortmentEntry,
} from "../maletas/assortment-catalog/mallet-assortment-types";
import type { VendorSampleRef } from "../maletas/vendor-sample-types";
import { buildStoreDerroteroFromSalesPortfolioDerrotero } from "../tiendas/store-derrotero-adapter";

// ═════════════════════════════════════════════════════════════════════════════
// 1. Scope → measurement binding
// ═════════════════════════════════════════════════════════════════════════════

describe("scope → measurement unit binding", () => {
  it("STORE is measured in UNITS", () => {
    assert.equal(MEASUREMENT_UNIT_BY_SCOPE.STORE, "UNITS");
    assert.equal(measurementUnitForScope("STORE"), "UNITS");
  });

  it("SALES_PORTFOLIO is measured in REFERENCES", () => {
    assert.equal(MEASUREMENT_UNIT_BY_SCOPE.SALES_PORTFOLIO, "REFERENCES");
    assert.equal(measurementUnitForScope("SALES_PORTFOLIO"), "REFERENCES");
  });

  it("coherence guard throws on mixed semantics", () => {
    assert.throws(() => assertScopeMeasurementCoherence("STORE", "REFERENCES"));
    assert.throws(() => assertScopeMeasurementCoherence("SALES_PORTFOLIO", "UNITS"));
    assert.doesNotThrow(() => assertScopeMeasurementCoherence("STORE", "UNITS"));
    assert.doesNotThrow(() => assertScopeMeasurementCoherence("SALES_PORTFOLIO", "REFERENCES"));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. TIENDAS — units rule (roadmap example: PIJAMA NIÑA BB CL, min 8 / max 12)
// ═════════════════════════════════════════════════════════════════════════════

const STORE_RULE = { minUnits: 8, idealUnits: 10, maxUnits: 12 };

describe("STORE semantic — total units of the rule group", () => {
  it("1 reference with 8 units fulfills the rule", () => {
    const r = evaluateUnitsRule([8], STORE_RULE);
    assert.equal(r.fulfilled, true);
    assert.equal(r.status, "WITHIN_RANGE");
    assert.equal(r.totalUnits, 8);
  });

  it("4 references with 2 units each fulfill the rule (8 total)", () => {
    const r = evaluateUnitsRule([2, 2, 2, 2], STORE_RULE);
    assert.equal(r.fulfilled, true);
    assert.equal(r.status, "WITHIN_RANGE");
  });

  it("8 references with 1 unit each fulfill the rule (8 total)", () => {
    const r = evaluateUnitsRule([1, 1, 1, 1, 1, 1, 1, 1], STORE_RULE);
    assert.equal(r.fulfilled, true);
  });

  it("2 references with 2 units each do NOT fulfill (4 < 8), deficit reported", () => {
    const r = evaluateUnitsRule([2, 2], STORE_RULE);
    assert.equal(r.fulfilled, false);
    assert.equal(r.status, "BELOW_MINIMUM");
    assert.equal(r.deficitToMin, 4);
    assert.equal(r.deficitToIdeal, 6);
  });

  it("13 total units exceed the maximum of 12", () => {
    const r = evaluateUnitsRule([6, 7], STORE_RULE);
    assert.equal(r.status, "OVER_MAXIMUM");
    assert.equal(r.excessOverMax, 1);
    // Minimum is still satisfied — excess is a separate signal
    assert.equal(r.fulfilled, true);
  });

  it("accepts a pre-aggregated total", () => {
    const r = evaluateUnitsRule(10, STORE_RULE);
    assert.equal(r.status, "WITHIN_RANGE");
    assert.equal(r.deficitToIdeal, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. MALETAS — references rule (roadmap example: objetivo 3 referencias)
// ═════════════════════════════════════════════════════════════════════════════

describe("SALES_PORTFOLIO semantic — distinct references", () => {
  it("3 distinct references fulfill a target of 3", () => {
    const r = evaluateReferencesRule(["REF-A", "REF-B", "REF-C"], 3);
    assert.equal(r.fulfilled, true);
    assert.equal(r.currentReferences, 3);
    assert.equal(r.shortage, 0);
  });

  it("many units of ONE reference do NOT substitute missing references (1/3)", () => {
    // 12 rows of the same reference — e.g. 12 units in the maleta
    const rows = Array.from({ length: 12 }, () => "REF-A");
    const r = evaluateReferencesRule(rows, 3);
    assert.equal(r.currentReferences, 1);
    assert.equal(r.shortage, 2);
    assert.equal(r.fulfilled, false);
  });

  it("dedupe is identity-normalized (case/whitespace)", () => {
    assert.equal(countDistinctReferences(["ref-a", "REF-A", " REF-A ", "REF-B"]), 2);
    assert.deepEqual(distinctReferences(["ref-a", "REF-A", "REF-B"]), ["ref-a", "REF-B"]);
  });

  it("empty and blank references are ignored", () => {
    assert.equal(countDistinctReferences(["", "  ", "REF-A"]), 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. MALETAS evaluator integration — evaluateCatalog counts DISTINCT references
// ═════════════════════════════════════════════════════════════════════════════

function makeEntry(overrides: Partial<MalletAssortmentEntry> = {}): MalletAssortmentEntry {
  return {
    subgroupCode: "PIJAMA_NINA_BB_CL",
    subgroupName: "PIJAMA NIÑA BB CL",
    targetUnits: 3, // legacy name — semantically a REFERENCE count
    minUnits: null,
    maxUnits: null,
    priority: 1,
    active: true,
    evidence: { source: "test", confidence: 1, note: null },
    sagSubgrupo: "PIJAMA NIÑA BB CL",
    ...overrides,
  };
}

function makeCatalog(entry: MalletAssortmentEntry): MalletAssortmentCatalog {
  return {
    catalogId: "test_catalog",
    tenantId: "castillitos",
    name: "TEST DERROTERO",
    scope: "SALES_PORTFOLIO",
    measurementUnit: "REFERENCES",
    commercialWorld: "TEXTIL",
    brand: "Castillitos",
    version: "test-1",
    status: "ACTIVE",
    validFrom: new Date("2026-01-01"),
    validUntil: null,
    groups: [
      {
        groupCode: "BEBE_NINA",
        groupName: "BEBÉ NIÑA",
        sagGrupo: "BEBE NIÑA",
        entries: [entry],
      },
    ],
    source: "test",
    evidence: {
      domain: "MALLET_ASSORTMENT",
      traceId: "test",
      tenantId: "castillitos",
      catalogId: "test_catalog",
      source: "test",
      confidence: 1,
      observedAt: new Date("2026-01-01"),
      note: null,
    },
    createdAt: new Date("2026-01-01"),
    activatedAt: new Date("2026-01-01"),
  };
}

function makeRef(reference: string): VendorSampleRef {
  return {
    reference,
    description: `Producto ${reference}`,
    line: "CS",
    subgrupoSag: "PIJAMA NIÑA BB CL",
    subgrupoId: 1,
    grupoSag: "BEBE NIÑA",
    group: null,
    imageUrl: null,
    brand: "Castillitos",
    sizeClass: null,
    present: true,
  } as unknown as VendorSampleRef;
}

describe("evaluateCatalog — maletas measured in DISTINCT references", () => {
  it("3 distinct references complete a target of 3", () => {
    const evalResult = evaluateCatalog(
      makeCatalog(makeEntry()),
      [makeRef("REF-001"), makeRef("REF-002"), makeRef("REF-003")],
      "TEXTIL",
    );
    const entry = evalResult.groups[0].entries[0];
    assert.equal(entry.measurementUnit, "REFERENCES");
    assert.equal(entry.currentReferences, 3);
    assert.equal(entry.targetReferences, 3);
    assert.equal(entry.complete, true);
    // Deprecated aliases stay coherent
    assert.equal(entry.currentUnits, entry.currentReferences);
    assert.equal(entry.targetUnits, entry.targetReferences);
  });

  it("duplicated reference rows count ONCE (units never substitute references)", () => {
    const evalResult = evaluateCatalog(
      makeCatalog(makeEntry()),
      [makeRef("REF-001"), makeRef("REF-001"), makeRef("ref-001 "), makeRef("REF-002")],
      "TEXTIL",
    );
    const entry = evalResult.groups[0].entries[0];
    assert.equal(entry.currentReferences, 2);
    assert.equal(entry.complete, false);
    assert.equal(entry.delta, -1);
    assert.deepEqual(entry.matchedReferences, ["REF-001", "REF-002"]);
  });

  it("explicit targetReferences takes precedence over legacy targetUnits", () => {
    const evalResult = evaluateCatalog(
      makeCatalog(makeEntry({ targetUnits: 99, targetReferences: 2 })),
      [makeRef("REF-001"), makeRef("REF-002")],
      "TEXTIL",
    );
    const entry = evalResult.groups[0].entries[0];
    assert.equal(entry.targetReferences, 2);
    assert.equal(entry.complete, true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. TIENDAS adapter — scope boundary declares STORE / UNITS
// ═════════════════════════════════════════════════════════════════════════════

describe("store derrotero adapter — scope declaration", () => {
  it("adapted store derrotero declares scope STORE measured in UNITS", () => {
    const derrotero = buildStoreDerroteroFromSalesPortfolioDerrotero("castillitos");
    assert.equal(derrotero.scope, "STORE");
    assert.equal(derrotero.measurementUnit, "UNITS");
    assert.doesNotThrow(() =>
      assertScopeMeasurementCoherence(derrotero.scope, derrotero.measurementUnit),
    );
  });
});
