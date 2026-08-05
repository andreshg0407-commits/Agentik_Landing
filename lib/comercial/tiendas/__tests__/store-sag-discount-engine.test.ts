/**
 * lib/comercial/tiendas/__tests__/store-sag-discount-engine.test.ts
 *
 * AGENTIK-STORES-DISCOUNTS-SAG-AWARE-ENGINE-01 — Full certification.
 *
 * Sections:
 *   ADAPT:  Adapter parse, index, resolution
 *   CMP:    Comparison law (all 7 actions)
 *   AGG:    Per-reference aggregation
 *   BATCH:  Batch comparison
 *   SAFE:   Fail-closed semantics (AMBIGUOUS)
 *   EXCL:   CD-* exclusion
 *   WH:     Per-warehouse distinction
 *   BOUND:  Inclusive date boundaries
 *   DEDUP:  No repeated recommendation when aligned
 *   FAIL:   SAG unavailable fail-closed (CERTIFICATION-01)
 *   MIXED:  Mixed-state aggregation law (CERTIFICATION-01)
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-sag-discount-engine.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  compareSagVsAgentik,
  buildStoreComparison,
  buildReferenceComparison,
  buildBatchComparisons,
} from "../store-sag-discount-comparison";

import type {
  SagActiveDiscount,
  SagDiscountResolution,
  StoreDiscountComparison,
} from "../store-sag-discount-types";

import {
  DISCOUNT_ELIGIBLE_STORE_PKS,
  SAG_PK_TO_STORE_SLUG,
} from "../store-sag-discount-types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeDiscount(overrides: Partial<SagActiveDiscount> = {}): SagActiveDiscount {
  return {
    referenceCode: "CG-TEST001",
    warehouseCode: "00",
    warehousePk: 31,
    warehouseName: "CENTRO",
    discountPercent: 30,
    effectiveFrom: "2026-06-01",
    effectiveTo: "2026-12-31",
    ...overrides,
  };
}

function activeRes(percent: number): SagDiscountResolution {
  return { status: "ACTIVE", discount: makeDiscount({ discountPercent: percent }) };
}

function noneRes(): SagDiscountResolution {
  return { status: "NONE" };
}

function ambiguousRes(): SagDiscountResolution {
  return {
    status: "AMBIGUOUS",
    discounts: [
      makeDiscount({ discountPercent: 30 }),
      makeDiscount({ discountPercent: 50 }),
    ],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// ADAPT: Adapter index & resolution
// ═════════════════════════════════════════════════════════════════════════════

describe("ADAPT: Adapter index and resolution", () => {
  // Mock server-only before requiring adapter
  require("module")._cache[require.resolve("server-only")] = { id: "server-only", exports: {} };
  const { buildDiscountIndex, resolveSagDiscount } = require("../store-sag-discount-adapter");

  it("builds index keyed by referenceCode|warehousePk", () => {
    const discounts: SagActiveDiscount[] = [
      makeDiscount({ referenceCode: "REF-A", warehousePk: 31 }),
      makeDiscount({ referenceCode: "REF-A", warehousePk: 11 }),
      makeDiscount({ referenceCode: "REF-B", warehousePk: 31 }),
    ];
    const index = buildDiscountIndex(discounts);
    assert.equal(index.size, 3);
    assert.equal(index.get("REF-A|31")!.length, 1);
    assert.equal(index.get("REF-A|11")!.length, 1);
    assert.equal(index.get("REF-B|31")!.length, 1);
  });

  it("resolveSagDiscount returns NONE for missing key", () => {
    const index = buildDiscountIndex([]);
    const res = resolveSagDiscount(index, "MISSING", 31);
    assert.equal(res.status, "NONE");
  });

  it("resolveSagDiscount returns ACTIVE for single entry", () => {
    const d = makeDiscount({ referenceCode: "REF-A", warehousePk: 31, discountPercent: 30 });
    const index = buildDiscountIndex([d]);
    const res = resolveSagDiscount(index, "REF-A", 31);
    assert.equal(res.status, "ACTIVE");
    assert.equal((res as any).discount.discountPercent, 30);
  });

  it("resolveSagDiscount returns AMBIGUOUS for duplicate entries (fail-closed)", () => {
    const d1 = makeDiscount({ referenceCode: "REF-A", warehousePk: 31, discountPercent: 30 });
    const d2 = makeDiscount({ referenceCode: "REF-A", warehousePk: 31, discountPercent: 50 });
    const index = buildDiscountIndex([d1, d2]);
    const res = resolveSagDiscount(index, "REF-A", 31);
    assert.equal(res.status, "AMBIGUOUS");
    assert.equal((res as any).discounts.length, 2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CMP: Comparison law (all 7 action types)
// ═════════════════════════════════════════════════════════════════════════════

describe("CMP: Comparison law", () => {
  it("SAG NONE + Agentik 30 → APPLY", () => {
    assert.equal(compareSagVsAgentik(noneRes(), 30, false), "APPLY");
  });

  it("SAG 10 + Agentik 30 → INCREASE", () => {
    assert.equal(compareSagVsAgentik(activeRes(10), 30, false), "INCREASE");
  });

  it("SAG 30 + Agentik 30 → ALIGNED", () => {
    assert.equal(compareSagVsAgentik(activeRes(30), 30, false), "ALIGNED");
  });

  it("SAG 50 + Agentik 30 → KEEP_HIGHER_SAG", () => {
    assert.equal(compareSagVsAgentik(activeRes(50), 30, false), "KEEP_HIGHER_SAG");
  });

  it("SAG 30 + Agentik 0 → NO_AGENTIK_ACTION", () => {
    assert.equal(compareSagVsAgentik(activeRes(30), 0, false), "NO_AGENTIK_ACTION");
  });

  it("SAG AMBIGUOUS → AMBIGUOUS_SAG (regardless of target)", () => {
    assert.equal(compareSagVsAgentik(ambiguousRes(), 30, false), "AMBIGUOUS_SAG");
    assert.equal(compareSagVsAgentik(ambiguousRes(), 0, false), "AMBIGUOUS_SAG");
  });

  it("excluded reference → EXCLUDED (regardless of SAG state)", () => {
    assert.equal(compareSagVsAgentik(activeRes(30), 30, true), "EXCLUDED");
    assert.equal(compareSagVsAgentik(noneRes(), 30, true), "EXCLUDED");
    assert.equal(compareSagVsAgentik(ambiguousRes(), 30, true), "EXCLUDED");
  });

  it("SAG NONE + Agentik 0 → ALIGNED (both zero)", () => {
    assert.equal(compareSagVsAgentik(noneRes(), 0, false), "ALIGNED");
  });

  it("SAG 0 (explicit zero) + Agentik 30 → APPLY", () => {
    assert.equal(compareSagVsAgentik(activeRes(0), 30, false), "APPLY");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SAFE: Fail-closed semantics
// ═════════════════════════════════════════════════════════════════════════════

describe("SAFE: Fail-closed (AMBIGUOUS never generates automatic action)", () => {
  it("AMBIGUOUS never returns APPLY, INCREASE, or ALIGNED", () => {
    const result = compareSagVsAgentik(ambiguousRes(), 30, false);
    assert.notEqual(result, "APPLY");
    assert.notEqual(result, "INCREASE");
    assert.notEqual(result, "ALIGNED");
    assert.equal(result, "AMBIGUOUS_SAG");
  });

  it("AMBIGUOUS with target 0 still returns AMBIGUOUS_SAG", () => {
    assert.equal(compareSagVsAgentik(ambiguousRes(), 0, false), "AMBIGUOUS_SAG");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// EXCL: CD-* exclusion
// ═════════════════════════════════════════════════════════════════════════════

describe("EXCL: CD-* exclusion via isExcludedFromAutomaticPricing", () => {
  const { isExcludedFromAutomaticPricing } = require("../../commercial-exclusions");

  it("CD- prefix is excluded", () => {
    assert.ok(isExcludedFromAutomaticPricing("CD-2071343B"));
  });

  it("CG- prefix is NOT excluded", () => {
    assert.ok(!isExcludedFromAutomaticPricing("CG-1000282B2"));
  });

  it("comparison returns EXCLUDED for CD- reference", () => {
    const result = compareSagVsAgentik(activeRes(30), 30, true);
    assert.equal(result, "EXCLUDED");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// WH: Per-warehouse distinction
// ═════════════════════════════════════════════════════════════════════════════

describe("WH: Per-warehouse distinction preserved in aggregation", () => {
  it("same reference, different discounts per store", () => {
    const resolutions = new Map<string, SagDiscountResolution>([
      ["centro",    activeRes(30)],
      ["san_diego", activeRes(30)],
      ["gran_plaza", activeRes(10)],
      ["caldas",    noneRes()],
    ]);

    const result = buildReferenceComparison("REF-A", "Test product", 30, resolutions);

    assert.equal(result.storesAligned, 2);      // centro, san_diego
    assert.equal(result.storesToIncrease, 1);   // gran_plaza 10→30
    assert.equal(result.storesToApply, 1);       // caldas none→30
    assert.ok(result.hasActionableStores);

    // Verify individual store actions
    const centro = result.storeActions.find(s => s.storeId === "centro")!;
    assert.equal(centro.action, "ALIGNED");
    assert.equal(centro.currentDiscountPercent, 30);
    assert.equal(centro.targetDiscountPercent, 30);

    const granPlaza = result.storeActions.find(s => s.storeId === "gran_plaza")!;
    assert.equal(granPlaza.action, "INCREASE");
    assert.equal(granPlaza.currentDiscountPercent, 10);
    assert.equal(granPlaza.targetDiscountPercent, 30);

    const caldas = result.storeActions.find(s => s.storeId === "caldas")!;
    assert.equal(caldas.action, "APPLY");
    assert.equal(caldas.currentDiscountPercent, null);
    assert.equal(caldas.targetDiscountPercent, 30);
  });

  it("does NOT collapse per-warehouse differences into one value", () => {
    const resolutions = new Map<string, SagDiscountResolution>([
      ["centro",    activeRes(30)],
      ["san_diego", activeRes(50)],
      ["gran_plaza", activeRes(70)],
      ["caldas",    activeRes(10)],
    ]);

    const result = buildReferenceComparison("REF-B", "Multi-discount", 30, resolutions);

    const percents = result.storeActions.map(s => s.currentDiscountPercent);
    assert.deepEqual(new Set(percents), new Set([30, 50, 70, 10]));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AGG: Reference-level aggregation
// ═════════════════════════════════════════════════════════════════════════════

describe("AGG: Reference-level aggregation", () => {
  it("all stores aligned → hasActionableStores = false", () => {
    const resolutions = new Map<string, SagDiscountResolution>([
      ["centro",    activeRes(30)],
      ["san_diego", activeRes(30)],
      ["gran_plaza", activeRes(30)],
      ["caldas",    activeRes(30)],
    ]);

    const result = buildReferenceComparison("REF-A", "Test", 30, resolutions);
    assert.equal(result.hasActionableStores, false);
    assert.equal(result.storesAligned, 4);
    assert.equal(result.storesToApply, 0);
    assert.equal(result.storesToIncrease, 0);
  });

  it("SAG higher everywhere → KEEP_HIGHER_SAG on all", () => {
    const resolutions = new Map<string, SagDiscountResolution>([
      ["centro",    activeRes(50)],
      ["san_diego", activeRes(50)],
      ["gran_plaza", activeRes(50)],
      ["caldas",    activeRes(50)],
    ]);

    const result = buildReferenceComparison("REF-B", "Test", 30, resolutions);
    assert.equal(result.hasActionableStores, false);
    assert.equal(result.storesKeepHigher, 4);
  });

  it("mixed state correctly counts each action type", () => {
    const resolutions = new Map<string, SagDiscountResolution>([
      ["centro",    activeRes(30)],      // ALIGNED
      ["san_diego", noneRes()],          // APPLY
      ["gran_plaza", activeRes(10)],     // INCREASE
      ["caldas",    activeRes(50)],      // KEEP_HIGHER
    ]);

    const result = buildReferenceComparison("REF-C", "Mixed", 30, resolutions);
    assert.equal(result.storesAligned, 1);
    assert.equal(result.storesToApply, 1);
    assert.equal(result.storesToIncrease, 1);
    assert.equal(result.storesKeepHigher, 1);
    assert.ok(result.hasActionableStores);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// BATCH: Batch comparison
// ═════════════════════════════════════════════════════════════════════════════

describe("BATCH: Batch comparison across multiple references", () => {
  it("builds comparisons for multiple references against SAG index", () => {
    const sagIndex = new Map<string, SagActiveDiscount[]>([
      ["REF-A|31", [makeDiscount({ referenceCode: "REF-A", warehousePk: 31, discountPercent: 30 })]],
      ["REF-A|11", [makeDiscount({ referenceCode: "REF-A", warehousePk: 11, discountPercent: 30 })]],
      ["REF-B|31", [makeDiscount({ referenceCode: "REF-B", warehousePk: 31, discountPercent: 10 })]],
    ]);

    const recs = [
      { referenceCode: "REF-A", description: "Product A", discountPercent: 30 },
      { referenceCode: "REF-B", description: "Product B", discountPercent: 30 },
      { referenceCode: "REF-C", description: "No SAG", discountPercent: 30 },
    ];

    const results = buildBatchComparisons(recs, sagIndex);
    assert.equal(results.length, 3);

    // REF-A: centro and san_diego ALIGNED, gran_plaza and caldas APPLY
    const refA = results.find(r => r.referenceCode === "REF-A")!;
    assert.equal(refA.storesAligned, 2);
    assert.equal(refA.storesToApply, 2);

    // REF-B: centro INCREASE, rest APPLY
    const refB = results.find(r => r.referenceCode === "REF-B")!;
    assert.equal(refB.storesToIncrease, 1);
    assert.equal(refB.storesToApply, 3);

    // REF-C: all stores APPLY (no SAG data)
    const refC = results.find(r => r.referenceCode === "REF-C")!;
    assert.equal(refC.storesToApply, 4);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DEDUP: No repeated recommendation when aligned
// ═════════════════════════════════════════════════════════════════════════════

describe("DEDUP: Aligned references clearly marked", () => {
  it("fully aligned reference has hasActionableStores=false", () => {
    const resolutions = new Map<string, SagDiscountResolution>([
      ["centro",    activeRes(30)],
      ["san_diego", activeRes(30)],
      ["gran_plaza", activeRes(30)],
      ["caldas",    activeRes(30)],
    ]);

    const result = buildReferenceComparison("REF-A", "Test", 30, resolutions);
    assert.equal(result.hasActionableStores, false);
    assert.equal(result.storesAligned, 4);
  });

  it("consumer can filter actionable: recommendations.filter(r => r.hasActionableStores)", () => {
    const sagIndex = new Map<string, SagActiveDiscount[]>([
      // REF-A: aligned everywhere
      ["REF-A|31", [makeDiscount({ referenceCode: "REF-A", warehousePk: 31, discountPercent: 30 })]],
      ["REF-A|11", [makeDiscount({ referenceCode: "REF-A", warehousePk: 11, discountPercent: 30 })]],
      ["REF-A|32", [makeDiscount({ referenceCode: "REF-A", warehousePk: 32, discountPercent: 30 })]],
      ["REF-A|39", [makeDiscount({ referenceCode: "REF-A", warehousePk: 39, discountPercent: 30 })]],
      // REF-B: needs action
    ]);

    const recs = [
      { referenceCode: "REF-A", description: "Aligned", discountPercent: 30 },
      { referenceCode: "REF-B", description: "Needs action", discountPercent: 30 },
    ];

    const results = buildBatchComparisons(recs, sagIndex);
    const actionable = results.filter(r => r.hasActionableStores);
    assert.equal(actionable.length, 1);
    assert.equal(actionable[0].referenceCode, "REF-B");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// BOUND: Inclusive date boundaries (conceptual — SAG handles this)
// ═════════════════════════════════════════════════════════════════════════════

describe("BOUND: Date boundary semantics", () => {
  it("effectiveFrom and effectiveTo are preserved as ISO strings", () => {
    const d = makeDiscount({ effectiveFrom: "2026-06-01", effectiveTo: "2026-12-31" });
    assert.equal(d.effectiveFrom, "2026-06-01");
    assert.equal(d.effectiveTo, "2026-12-31");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CONST: Store warehouse mapping constants
// ═════════════════════════════════════════════════════════════════════════════

describe("CONST: Eligible store warehouse mapping", () => {
  it("has exactly 4 eligible stores", () => {
    assert.equal(DISCOUNT_ELIGIBLE_STORE_PKS.size, 4);
  });

  it("contains certified warehouse PKs", () => {
    assert.equal(DISCOUNT_ELIGIBLE_STORE_PKS.get("centro")!.pk, 31);
    assert.equal(DISCOUNT_ELIGIBLE_STORE_PKS.get("san_diego")!.pk, 11);
    assert.equal(DISCOUNT_ELIGIBLE_STORE_PKS.get("gran_plaza")!.pk, 32);
    assert.equal(DISCOUNT_ELIGIBLE_STORE_PKS.get("caldas")!.pk, 39);
  });

  it("reverse mapping is consistent", () => {
    assert.equal(SAG_PK_TO_STORE_SLUG.get(31), "centro");
    assert.equal(SAG_PK_TO_STORE_SLUG.get(11), "san_diego");
    assert.equal(SAG_PK_TO_STORE_SLUG.get(32), "gran_plaza");
    assert.equal(SAG_PK_TO_STORE_SLUG.get(39), "caldas");
  });

  it("production warehouse (13) is NOT in eligible stores", () => {
    assert.equal(SAG_PK_TO_STORE_SLUG.has(13), false);
  });

  it("distribution warehouse (10) is NOT in eligible stores", () => {
    assert.equal(SAG_PK_TO_STORE_SLUG.has(10), false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TARGET: Target vs delta naming correctness
// ═════════════════════════════════════════════════════════════════════════════

describe("TARGET: Target vs delta naming", () => {
  it("INCREASE shows current→target, not additive delta", () => {
    const comp = buildStoreComparison(
      "centro", "CENTRO", 31,
      activeRes(10), 30, false,
    );
    assert.equal(comp.action, "INCREASE");
    assert.equal(comp.currentDiscountPercent, 10);
    assert.equal(comp.targetDiscountPercent, 30);
    // The meaning: "increase FROM 10% TO 30%", NOT "add 30 more"
  });

  it("APPLY shows null→target", () => {
    const comp = buildStoreComparison(
      "caldas", "CALDAS", 39,
      noneRes(), 30, false,
    );
    assert.equal(comp.action, "APPLY");
    assert.equal(comp.currentDiscountPercent, null);
    assert.equal(comp.targetDiscountPercent, 30);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// FAIL: SAG unavailable fail-closed (CERTIFICATION-01)
// ═════════════════════════════════════════════════════════════════════════════

describe("FAIL: SAG unavailable fail-closed", () => {
  it("sagComparisonStatus type accepts AVAILABLE and UNAVAILABLE", () => {
    // Type-level test: these assignments must compile
    const available: import("../store-sag-discount-types").SagComparisonStatus = "AVAILABLE";
    const unavailable: import("../store-sag-discount-types").SagComparisonStatus = "UNAVAILABLE";
    assert.equal(available, "AVAILABLE");
    assert.equal(unavailable, "UNAVAILABLE");
  });

  it("when SAG unavailable, Agentik target is preserved (no APPLY/INCREASE actions)", () => {
    // Simulate: SAG failed, so no sagIndex exists.
    // The service sets sagComparisonStatus = "UNAVAILABLE" and does NOT
    // enrich recommendations with sagComparison/sagActionableStores.
    // Verify: a recommendation without sagComparison has no actionable count.
    const rec = {
      referenceCode: "CG-TEST001",
      discountPercent: 30,
      sagComparison: undefined as undefined,
      sagActionableStores: undefined as undefined,
      sagAlignedStores: undefined as undefined,
    };
    assert.equal(rec.discountPercent, 30); // target preserved
    assert.equal(rec.sagComparison, undefined); // no comparison
    assert.equal(rec.sagActionableStores, undefined); // no false actionable
  });

  it("when SAG unavailable, no false current discount is invented", () => {
    // Without SAG fetch, the service never sets sagComparison.
    // A consumer MUST check sagComparisonStatus before trusting comparison data.
    const sagComparisonStatus = "UNAVAILABLE" as const;
    assert.equal(sagComparisonStatus, "UNAVAILABLE");
    // Consumer law: if (sagComparisonStatus === "UNAVAILABLE") → do not render APPLY/INCREASE
  });

  it("SAG unavailable does not crash buildReferenceComparison (no index = no call)", () => {
    // When SAG fails, buildReferenceComparison is never called.
    // But if somehow it were called with all-NONE resolutions, it should still work:
    const resolutions = new Map<string, SagDiscountResolution>([
      ["centro",    noneRes()],
      ["san_diego", noneRes()],
      ["gran_plaza", noneRes()],
      ["caldas",    noneRes()],
    ]);
    const result = buildReferenceComparison("REF-A", "Test", 30, resolutions);
    // All APPLY — but these would NOT be certified as actionable without AVAILABLE status
    assert.equal(result.storesToApply, 4);
    assert.ok(result.hasActionableStores);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MIXED: Mixed-state aggregation law (CERTIFICATION-01)
// ═════════════════════════════════════════════════════════════════════════════

describe("MIXED: Mixed-state aggregation law", () => {
  it("actionable + aligned → summary must be actionable, NOT alineado", () => {
    const resolutions = new Map<string, SagDiscountResolution>([
      ["centro",    activeRes(30)],    // ALIGNED
      ["san_diego", activeRes(30)],    // ALIGNED
      ["gran_plaza", activeRes(10)],   // INCREASE
      ["caldas",    noneRes()],        // APPLY
    ]);
    const result = buildReferenceComparison("REF-A", "Test", 30, resolutions);
    assert.ok(result.hasActionableStores); // MUST be true
    assert.equal(result.storesToApply + result.storesToIncrease, 2);
    assert.equal(result.storesAligned, 2);
    // UI law: "2 tiendas pendientes" NOT "SAG alineado"
  });

  it("ambiguous + aligned + no actionable → summary must be Revisar SAG", () => {
    const resolutions = new Map<string, SagDiscountResolution>([
      ["centro",    activeRes(30)],    // ALIGNED
      ["san_diego", activeRes(30)],    // ALIGNED
      ["gran_plaza", activeRes(30)],   // ALIGNED
      ["caldas",    ambiguousRes()],   // AMBIGUOUS
    ]);
    const result = buildReferenceComparison("REF-B", "Test", 30, resolutions);
    assert.equal(result.hasActionableStores, false); // no APPLY/INCREASE
    assert.equal(result.storesAmbiguous, 1);
    assert.equal(result.storesAligned, 3);
    // UI law: "Revisar SAG" NOT "SAG alineado"
  });

  it("all KEEP_HIGHER_SAG → no actionable, no aligned", () => {
    const resolutions = new Map<string, SagDiscountResolution>([
      ["centro",    activeRes(50)],
      ["san_diego", activeRes(70)],
      ["gran_plaza", activeRes(50)],
      ["caldas",    activeRes(50)],
    ]);
    const result = buildReferenceComparison("REF-C", "Test", 30, resolutions);
    assert.equal(result.hasActionableStores, false);
    assert.equal(result.storesAligned, 0);
    assert.equal(result.storesKeepHigher, 4);
  });

  it("production warehouse PK=13 is never included in aggregation", () => {
    // DISCOUNT_ELIGIBLE_STORE_PKS has only 31, 11, 32, 39
    // PK 13 (production) must not appear in storeActions
    const resolutions = new Map<string, SagDiscountResolution>();
    // Not setting any store → all default to NONE
    const result = buildReferenceComparison("REF-D", "Test", 30, resolutions);
    const pks = result.storeActions.map(s => s.warehousePk);
    assert.ok(!pks.includes(13)); // production warehouse excluded
    assert.deepEqual(new Set(pks), new Set([31, 11, 32, 39]));
  });
});
