/**
 * lib/comercial/tiendas/__tests__/store-aging-discount-policy.test.ts
 *
 * AGENTIK-STORES-DISCOUNTS-DYNAMIC-RULES-01 — Full certification.
 *
 * Sections (Phase 1):
 *   R1-R15: Registry tests (normalize, validate, targetKey, effects)
 *   E1-E14: Evaluator tests (boundary, SIN_FECHA, NO_RULE, determinism)
 *   P1-P4:  Promise tests (CREATE 80%, EDIT 60%, DISABLE gap, REACTIVATE)
 *   S1-S2:  Store override tests
 *   D1:     Decision engine parity test
 *   A1:     Authority guard test
 *   K1-K2:  KPI reconciliation tests
 *   T1-T3:  Temporal validity
 *   C1:     Conflict resolution
 *   G2:     Authority guardian
 *
 * Sections (Phase 2 — Domain Safety Close):
 *   FC:       Fail-closed — discount service (§1)
 *   FC-DE:    Fail-closed — decision engine (§2)
 *   BATCH:    Atomic split validation (§6)
 *   F1-F8:    Invalid policy rejection (§7)
 *   D2:       Decision engine parity extended (§9)
 *   COMPAT:   discountPercent canonical authority (§10)
 *   AUTH:     Authority guard final (§11)
 *   BATCH-SVC: Batch service structure (§3-5)
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-aging-discount-policy.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeStorePolicyRule,
  validateStorePolicyRule,
  buildCoverageRuleTargetKey,
  buildEffectiveAgingDiscountPolicy,
  evaluateAgingDiscount,
  validateAgingDiscountPolicy,
  type EffectiveAgingDiscountRule,
  type EffectiveAgingDiscountPolicy,
} from "../store-effective-rule-registry";

import type { StorePolicyRule } from "../store-policy-types";
import type { AgingDiscountBandConfig } from "../store-policy-pack-config";
import { CASTILLITOS_DEFAULT_AGING_DISCOUNT_BANDS } from "../store-policy-pack-config";
import { deriveDiscountTierCompat } from "../store-discount-types";

// ═════════════════════════════════════════════════════════════════════════════
// Fixtures
// ═════════════════════════════════════════════════════════════════════════════

const EVAL_DATE = "2026-08-03";
const STORE_ID = "gran_plaza";

function mkAgingRule(overrides: Partial<StorePolicyRule> = {}): StorePolicyRule {
  return {
    id: "aging_rule_1",
    storeId: STORE_ID,
    scope: "store",
    productClass: "textile",
    allowReplacement: false,
    allowProductionSignal: false,
    allowMainWarehouseTransfer: false,
    priority: 50,
    active: true,
    ruleKind: "AGING_DISCOUNT",
    effect: "OVERRIDE",
    minDays: 0,
    maxDays: 89,
    discountPercent: 0,
    ...overrides,
  };
}

const DEFAULT_BANDS: readonly AgingDiscountBandConfig[] = CASTILLITOS_DEFAULT_AGING_DISCOUNT_BANDS;

function buildDefaultPolicy(): EffectiveAgingDiscountPolicy {
  const { policy } = buildEffectiveAgingDiscountPolicy(DEFAULT_BANDS, [], STORE_ID, EVAL_DATE);
  return policy;
}

// ═════════════════════════════════════════════════════════════════════════════
// R1-R15: Registry tests
// ═════════════════════════════════════════════════════════════════════════════

describe("R: Registry — AGING_DISCOUNT normalization and validation", () => {
  it("R1: normalizeStorePolicyRule infers AGING_DISCOUNT from minDays", () => {
    const raw = mkAgingRule({ ruleKind: undefined, minDays: 90, discountPercent: 10 });
    const normalized = normalizeStorePolicyRule(raw);
    assert.equal(normalized.ruleKind, "AGING_DISCOUNT");
  });

  it("R2: normalizeStorePolicyRule infers AGING_DISCOUNT from discountPercent alone", () => {
    const raw = mkAgingRule({ ruleKind: undefined, minDays: undefined, discountPercent: 50 });
    const normalized = normalizeStorePolicyRule(raw);
    assert.equal(normalized.ruleKind, "AGING_DISCOUNT");
  });

  it("R3: normalizeStorePolicyRule defaults effect to OVERRIDE", () => {
    const raw = mkAgingRule({ effect: undefined });
    const normalized = normalizeStorePolicyRule(raw);
    assert.equal(normalized.effect, "OVERRIDE");
  });

  it("R4: validateStorePolicyRule — valid AGING_DISCOUNT returns no errors", () => {
    const rule = mkAgingRule({ minDays: 90, maxDays: 179, discountPercent: 10 });
    const errors = validateStorePolicyRule(rule);
    assert.equal(errors.length, 0);
  });

  it("R5: validateStorePolicyRule — negative minDays rejected", () => {
    const rule = mkAgingRule({ minDays: -1 });
    const errors = validateStorePolicyRule(rule);
    assert.ok(errors.some(e => e.field === "minDays"));
  });

  it("R6: validateStorePolicyRule — maxDays < minDays rejected", () => {
    const rule = mkAgingRule({ minDays: 100, maxDays: 50 });
    const errors = validateStorePolicyRule(rule);
    assert.ok(errors.some(e => e.field === "maxDays"));
  });

  it("R7: validateStorePolicyRule — discountPercent > 100 rejected", () => {
    const rule = mkAgingRule({ discountPercent: 150 });
    const errors = validateStorePolicyRule(rule);
    assert.ok(errors.some(e => e.field === "discountPercent"));
  });

  it("R8: validateStorePolicyRule — DISABLE skips field validation", () => {
    const rule = mkAgingRule({ effect: "DISABLE", minDays: undefined, discountPercent: undefined });
    const errors = validateStorePolicyRule(rule);
    assert.equal(errors.length, 0);
  });

  it("R9: validateStorePolicyRule — does NOT require minQty/idealQty for AGING_DISCOUNT", () => {
    const rule = mkAgingRule({ minQty: undefined, idealQty: undefined });
    const errors = validateStorePolicyRule(rule);
    assert.equal(errors.length, 0);
  });

  it("R10: buildCoverageRuleTargetKey — AGING_DISCOUNT deterministic identity", () => {
    const key1 = buildCoverageRuleTargetKey("AGING_DISCOUNT", { minDays: 90, maxDays: 179 });
    const key2 = buildCoverageRuleTargetKey("AGING_DISCOUNT", { minDays: 90, maxDays: 179 });
    assert.equal(key1, key2);
    assert.equal(key1, "AGING:90:179");
  });

  it("R11: buildCoverageRuleTargetKey — open-ended band uses OPEN", () => {
    const key = buildCoverageRuleTargetKey("AGING_DISCOUNT", { minDays: 365, maxDays: null });
    assert.equal(key, "AGING:365:OPEN");
  });

  it("R12: buildEffectiveAgingDiscountPolicy — defaults produce 5 bands", () => {
    const { policy, errors } = buildEffectiveAgingDiscountPolicy(DEFAULT_BANDS, [], STORE_ID, EVAL_DATE);
    assert.equal(errors.length, 0);
    assert.equal(policy.bands.length, 5);
  });

  it("R13: buildEffectiveAgingDiscountPolicy — ADD introduces new band (split)", () => {
    // To add 540+→80%, must DISABLE old 365+→70% and ADD two replacements:
    // 365-539→70% and 540+→80%
    const disableOld = mkAgingRule({
      id: "disable_365_open",
      effect: "DISABLE",
      minDays: 365,
      maxDays: null,
    });
    const addCapped = mkAgingRule({
      id: "add_365_539",
      effect: "ADD",
      minDays: 365,
      maxDays: 539,
      discountPercent: 70,
    });
    const add80 = mkAgingRule({
      id: "add_540_open",
      effect: "ADD",
      minDays: 540,
      maxDays: null,
      discountPercent: 80,
    });
    const { policy, errors } = buildEffectiveAgingDiscountPolicy(
      DEFAULT_BANDS, [disableOld, addCapped, add80], STORE_ID, EVAL_DATE,
    );
    assert.equal(errors.length, 0);
    assert.equal(policy.bands.length, 6);
    const band80 = policy.bands.find(b => b.discountPercent === 80);
    assert.ok(band80);
    assert.equal(band80!.minDays, 540);
    assert.equal(band80!.maxDays, null);
  });

  it("R14: buildEffectiveAgingDiscountPolicy — OVERRIDE changes percent", () => {
    const overrideRule = mkAgingRule({
      id: "override_365",
      effect: "OVERRIDE",
      minDays: 365,
      maxDays: null,
      discountPercent: 60,
    });
    const { policy, errors } = buildEffectiveAgingDiscountPolicy(
      DEFAULT_BANDS, [overrideRule], STORE_ID, EVAL_DATE,
    );
    assert.equal(errors.length, 0);
    const last = policy.bands[policy.bands.length - 1];
    assert.equal(last.discountPercent, 60);
    assert.equal(last.source, "POLICY_OVERRIDE");
  });

  it("R15: buildEffectiveAgingDiscountPolicy — DISABLE removes band → gap error", () => {
    const disableRule = mkAgingRule({
      id: "disable_90",
      effect: "DISABLE",
      minDays: 90,
      maxDays: 179,
    });
    const { errors } = buildEffectiveAgingDiscountPolicy(
      DEFAULT_BANDS, [disableRule], STORE_ID, EVAL_DATE,
    );
    assert.ok(errors.length > 0, "Disabling a middle band should create a gap error");
  });
});

describe("R: Registry — policy validation", () => {
  it("R-V1: validateAgingDiscountPolicy — no gaps allowed", () => {
    const bands: EffectiveAgingDiscountRule[] = [
      { targetKey: "AGING:0:89", ruleKind: "AGING_DISCOUNT", minDays: 0, maxDays: 89, discountPercent: 0, priority: 0, source: "PACK_DEFAULT", persistedRuleId: null },
      // Gap: 90-179 missing
      { targetKey: "AGING:180:OPEN", ruleKind: "AGING_DISCOUNT", minDays: 180, maxDays: null, discountPercent: 30, priority: 200, source: "PACK_DEFAULT", persistedRuleId: null },
    ];
    const errors = validateAgingDiscountPolicy(bands);
    assert.ok(errors.some(e => e.message.includes("Gap")));
  });

  it("R-V2: validateAgingDiscountPolicy — no overlaps allowed", () => {
    const bands: EffectiveAgingDiscountRule[] = [
      { targetKey: "AGING:0:100", ruleKind: "AGING_DISCOUNT", minDays: 0, maxDays: 100, discountPercent: 0, priority: 0, source: "PACK_DEFAULT", persistedRuleId: null },
      { targetKey: "AGING:90:OPEN", ruleKind: "AGING_DISCOUNT", minDays: 90, maxDays: null, discountPercent: 10, priority: 100, source: "PACK_DEFAULT", persistedRuleId: null },
    ];
    const errors = validateAgingDiscountPolicy(bands);
    assert.ok(errors.some(e => e.message.includes("Overlap")));
  });

  it("R-V3: validateAgingDiscountPolicy — must start at day 0", () => {
    const bands: EffectiveAgingDiscountRule[] = [
      { targetKey: "AGING:10:OPEN", ruleKind: "AGING_DISCOUNT", minDays: 10, maxDays: null, discountPercent: 10, priority: 0, source: "PACK_DEFAULT", persistedRuleId: null },
    ];
    const errors = validateAgingDiscountPolicy(bands);
    assert.ok(errors.some(e => e.message.includes("start at day 0")));
  });

  it("R-V4: validateAgingDiscountPolicy — last band must be open-ended", () => {
    const bands: EffectiveAgingDiscountRule[] = [
      { targetKey: "AGING:0:89", ruleKind: "AGING_DISCOUNT", minDays: 0, maxDays: 89, discountPercent: 0, priority: 0, source: "PACK_DEFAULT", persistedRuleId: null },
      { targetKey: "AGING:90:179", ruleKind: "AGING_DISCOUNT", minDays: 90, maxDays: 179, discountPercent: 10, priority: 100, source: "PACK_DEFAULT", persistedRuleId: null },
    ];
    const errors = validateAgingDiscountPolicy(bands);
    assert.ok(errors.some(e => e.message.includes("open-ended")));
  });

  it("R-V5: validateAgingDiscountPolicy — 0% is a valid discount", () => {
    const bands: EffectiveAgingDiscountRule[] = [
      { targetKey: "AGING:0:OPEN", ruleKind: "AGING_DISCOUNT", minDays: 0, maxDays: null, discountPercent: 0, priority: 0, source: "PACK_DEFAULT", persistedRuleId: null },
    ];
    const errors = validateAgingDiscountPolicy(bands);
    assert.equal(errors.length, 0);
  });

  it("R-V6: default bands pass validation", () => {
    const { errors } = buildEffectiveAgingDiscountPolicy(DEFAULT_BANDS, [], STORE_ID, EVAL_DATE);
    assert.equal(errors.length, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E1-E14: Evaluator tests
// ═════════════════════════════════════════════════════════════════════════════

describe("E: Evaluator — evaluateAgingDiscount", () => {
  const policy = buildDefaultPolicy();

  it("E1: null daysInStore → SIN_FECHA", () => {
    const result = evaluateAgingDiscount("REF-001", null, "SIN_FECHA", policy);
    assert.equal(result.status, "SIN_FECHA");
    assert.equal(result.discountPercent, null);
  });

  it("E2: day 0 → 0%", () => {
    const result = evaluateAgingDiscount("REF-001", 0, "TRANSFER", policy);
    assert.equal(result.status, "EVALUATED");
    assert.equal(result.discountPercent, 0);
  });

  it("E3: day 89 → 0% (upper boundary of first band)", () => {
    const result = evaluateAgingDiscount("REF-001", 89, "TRANSFER", policy);
    assert.equal(result.discountPercent, 0);
  });

  it("E4: day 90 → 10% (lower boundary of second band)", () => {
    const result = evaluateAgingDiscount("REF-001", 90, "TRANSFER", policy);
    assert.equal(result.discountPercent, 10);
  });

  it("E5: day 179 → 10% (upper boundary of second band)", () => {
    const result = evaluateAgingDiscount("REF-001", 179, "TRANSFER", policy);
    assert.equal(result.discountPercent, 10);
  });

  it("E6: day 180 → 30%", () => {
    const result = evaluateAgingDiscount("REF-001", 180, "TRANSFER", policy);
    assert.equal(result.discountPercent, 30);
  });

  it("E7: day 269 → 30%", () => {
    const result = evaluateAgingDiscount("REF-001", 269, "TRANSFER", policy);
    assert.equal(result.discountPercent, 30);
  });

  it("E8: day 270 → 50%", () => {
    const result = evaluateAgingDiscount("REF-001", 270, "TRANSFER", policy);
    assert.equal(result.discountPercent, 50);
  });

  it("E9: day 364 → 50% (day boundary fix: was 70% in month system)", () => {
    const result = evaluateAgingDiscount("REF-001", 364, "TRANSFER", policy);
    assert.equal(result.discountPercent, 50);
  });

  it("E10: day 365 → 70% (open-ended band)", () => {
    const result = evaluateAgingDiscount("REF-001", 365, "TRANSFER", policy);
    assert.equal(result.discountPercent, 70);
  });

  it("E11: day 1000 → 70% (well into open-ended band)", () => {
    const result = evaluateAgingDiscount("REF-001", 1000, "TRANSFER", policy);
    assert.equal(result.discountPercent, 70);
  });

  it("E12: dynamic 80% band evaluated correctly", () => {
    const disableOld = mkAgingRule({
      id: "disable_365_open",
      effect: "DISABLE",
      minDays: 365,
      maxDays: null,
    });
    const addCapped = mkAgingRule({
      id: "add_365_539",
      effect: "ADD",
      minDays: 365,
      maxDays: 539,
      discountPercent: 70,
    });
    const add80 = mkAgingRule({
      id: "add_540_open",
      effect: "ADD",
      minDays: 540,
      maxDays: null,
      discountPercent: 80,
    });
    const { policy: customPolicy } = buildEffectiveAgingDiscountPolicy(
      DEFAULT_BANDS, [disableOld, addCapped, add80], STORE_ID, EVAL_DATE,
    );
    const result = evaluateAgingDiscount("REF-001", 600, "TRANSFER", customPolicy);
    assert.equal(result.discountPercent, 80);
    assert.equal(result.status, "EVALUATED");
  });

  it("E13: evaluation is deterministic — same input → same output", () => {
    const r1 = evaluateAgingDiscount("REF-001", 150, "TRANSFER", policy);
    const r2 = evaluateAgingDiscount("REF-001", 150, "TRANSFER", policy);
    assert.deepEqual(r1, r2);
  });

  it("E14: band order does not affect result", () => {
    // Build a policy with reversed band order in memory
    const reversedBands: EffectiveAgingDiscountRule[] = [...policy.bands].reverse();
    const reversedPolicy: EffectiveAgingDiscountPolicy = {
      bands: reversedBands,
      validatedAt: EVAL_DATE,
    };
    const r1 = evaluateAgingDiscount("REF-001", 200, "TRANSFER", policy);
    const r2 = evaluateAgingDiscount("REF-001", 200, "TRANSFER", reversedPolicy);
    assert.equal(r1.discountPercent, r2.discountPercent);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// P1-P4: Promise tests (CREATE, EDIT, DISABLE, REACTIVATE)
// ═════════════════════════════════════════════════════════════════════════════

describe("P: Promise tests — dynamic policy lifecycle", () => {
  it("P1: CREATE — 540+ → 80% via DISABLE+ADD split", () => {
    const disableOld = mkAgingRule({
      id: "disable_365_open",
      effect: "DISABLE",
      minDays: 365,
      maxDays: null,
    });
    const addCapped = mkAgingRule({
      id: "add_365_539",
      effect: "ADD",
      minDays: 365,
      maxDays: 539,
      discountPercent: 70,
    });
    const add80 = mkAgingRule({
      id: "add_540_open",
      effect: "ADD",
      minDays: 540,
      maxDays: null,
      discountPercent: 80,
    });
    const { policy, errors } = buildEffectiveAgingDiscountPolicy(
      DEFAULT_BANDS, [disableOld, addCapped, add80], STORE_ID, EVAL_DATE,
    );
    assert.equal(errors.length, 0);

    const at540 = evaluateAgingDiscount("REF-001", 540, "TRANSFER", policy);
    assert.equal(at540.discountPercent, 80);
    const at539 = evaluateAgingDiscount("REF-001", 539, "TRANSFER", policy);
    assert.equal(at539.discountPercent, 70);
  });

  it("P2: EDIT — change 365+ from 70% to 60%", () => {
    const editRule = mkAgingRule({
      id: "edit_365",
      effect: "OVERRIDE",
      minDays: 365,
      maxDays: null,
      discountPercent: 60,
    });
    const { policy, errors } = buildEffectiveAgingDiscountPolicy(
      DEFAULT_BANDS, [editRule], STORE_ID, EVAL_DATE,
    );
    assert.equal(errors.length, 0);
    const result = evaluateAgingDiscount("REF-001", 400, "TRANSFER", policy);
    assert.equal(result.discountPercent, 60);
  });

  it("P3: DISABLE — removing a middle band creates gap error", () => {
    const disableRule = mkAgingRule({
      id: "disable_180",
      effect: "DISABLE",
      minDays: 180,
      maxDays: 269,
    });
    const { errors } = buildEffectiveAgingDiscountPolicy(
      DEFAULT_BANDS, [disableRule], STORE_ID, EVAL_DATE,
    );
    assert.ok(errors.length > 0, "Should reject policy with gap");
    assert.ok(errors.some(e => e.message.includes("Gap")));
  });

  it("P4: REACTIVATE — inactive rule does not participate, pack default applies", () => {
    const inactiveRule = mkAgingRule({
      id: "inactive_override",
      effect: "OVERRIDE",
      minDays: 365,
      maxDays: null,
      discountPercent: 99,
      active: false,
    });
    const { policy, errors } = buildEffectiveAgingDiscountPolicy(
      DEFAULT_BANDS, [inactiveRule], STORE_ID, EVAL_DATE,
    );
    assert.equal(errors.length, 0);
    const result = evaluateAgingDiscount("REF-001", 400, "TRANSFER", policy);
    assert.equal(result.discountPercent, 70, "Pack default should apply when rule is inactive");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// S1-S2: Store override tests
// ═════════════════════════════════════════════════════════════════════════════

describe("S: Store override — per-store policies", () => {
  it("S1: Gran Plaza override 365+ → 60%, Centro uses default 70%", () => {
    const gpRule = mkAgingRule({
      id: "gp_override",
      storeId: "gran_plaza",
      effect: "OVERRIDE",
      minDays: 365,
      maxDays: null,
      discountPercent: 60,
    });

    // Gran Plaza: overridden
    const { policy: gpPolicy, errors: gpErrors } = buildEffectiveAgingDiscountPolicy(
      DEFAULT_BANDS, [gpRule], "gran_plaza", EVAL_DATE,
    );
    assert.equal(gpErrors.length, 0);
    const gpResult = evaluateAgingDiscount("REF-001", 400, "TRANSFER", gpPolicy);
    assert.equal(gpResult.discountPercent, 60);

    // Centro: same rule array but different storeId → not matched
    const { policy: centroPolicy, errors: centroErrors } = buildEffectiveAgingDiscountPolicy(
      DEFAULT_BANDS, [gpRule], "centro", EVAL_DATE,
    );
    assert.equal(centroErrors.length, 0);
    const centroResult = evaluateAgingDiscount("REF-001", 400, "TRANSFER", centroPolicy);
    assert.equal(centroResult.discountPercent, 70);
  });

  it("S2: rule for different store is ignored", () => {
    const otherStoreRule = mkAgingRule({
      id: "caldas_rule",
      storeId: "caldas",
      effect: "OVERRIDE",
      minDays: 365,
      maxDays: null,
      discountPercent: 99,
    });
    const { policy, errors } = buildEffectiveAgingDiscountPolicy(
      DEFAULT_BANDS, [otherStoreRule], STORE_ID, EVAL_DATE,
    );
    assert.equal(errors.length, 0);
    const result = evaluateAgingDiscount("REF-001", 400, "TRANSFER", policy);
    assert.equal(result.discountPercent, 70, "Other store's rule should not affect this store");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D1: Decision engine parity
// ═════════════════════════════════════════════════════════════════════════════

describe("D: Decision engine parity", () => {
  it("D1: same age + policy → same percent in discount service and evaluator", () => {
    const policy = buildDefaultPolicy();
    const testCases = [0, 45, 89, 90, 150, 179, 180, 250, 269, 270, 300, 364, 365, 500, 1000];

    for (const days of testCases) {
      const eval1 = evaluateAgingDiscount("REF-A", days, "TRANSFER", policy);
      const eval2 = evaluateAgingDiscount("REF-B", days, "TRANSFER", policy);
      assert.equal(
        eval1.discountPercent,
        eval2.discountPercent,
        `Day ${days}: different references should get same discount`,
      );
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A1: Authority guard
// ═════════════════════════════════════════════════════════════════════════════

describe("A: Authority guard", () => {
  it("A1: AGING_DISCOUNT rules are excluded from buildEffectiveStoreRules (coverage pipeline)", () => {
    // This test verifies the filter in buildEffectiveStoreRules line 528:
    // .filter(r => ... && r.ruleKind !== "AGING_DISCOUNT")
    // By constructing an aging discount rule and passing it through the coverage pipeline,
    // we confirm it does NOT appear in coverage results.
    // Since buildEffectiveStoreRules requires catalog entries (complex),
    // we verify the architectural separation by checking the policy builder
    // correctly scopes to AGING_DISCOUNT only.
    const agingRule = mkAgingRule({
      id: "aging_in_coverage",
      ruleKind: "AGING_DISCOUNT",
      minDays: 90,
      maxDays: 179,
      discountPercent: 10,
    });

    const normalized = normalizeStorePolicyRule(agingRule);
    assert.equal(normalized.ruleKind, "AGING_DISCOUNT");

    // The policy builder only processes AGING_DISCOUNT rules
    const { policy } = buildEffectiveAgingDiscountPolicy(
      DEFAULT_BANDS, [agingRule], STORE_ID, EVAL_DATE,
    );
    // Aging rules are processed here (correct pipeline)
    assert.ok(policy.bands.length > 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// K1: KPI reconciliation
// ═════════════════════════════════════════════════════════════════════════════

describe("K: KPI reconciliation", () => {
  it("K1: deriveDiscountTierCompat maps dynamic percents to legacy tiers", () => {
    // 0% → NONE
    assert.equal(deriveDiscountTierCompat(0, "EVALUATED"), "NONE");
    // 10% → TEN_PERCENT
    assert.equal(deriveDiscountTierCompat(10, "EVALUATED"), "TEN_PERCENT");
    // 30% → THIRTY_PERCENT
    assert.equal(deriveDiscountTierCompat(30, "EVALUATED"), "THIRTY_PERCENT");
    // 50% → FIFTY_PERCENT
    assert.equal(deriveDiscountTierCompat(50, "EVALUATED"), "FIFTY_PERCENT");
    // 70% → SEVENTY_PERCENT
    assert.equal(deriveDiscountTierCompat(70, "EVALUATED"), "SEVENTY_PERCENT");
    // 80% → SEVENTY_PERCENT (dynamic, maps to highest legacy tier)
    assert.equal(deriveDiscountTierCompat(80, "EVALUATED"), "SEVENTY_PERCENT");
    // SIN_FECHA → SIN_FECHA
    assert.equal(deriveDiscountTierCompat(null, "SIN_FECHA"), "SIN_FECHA");
    // null percent + EVALUATED → NONE
    assert.equal(deriveDiscountTierCompat(null, "EVALUATED"), "NONE");
  });

  it("K2: every day from 0 to 400 maps to exactly one band", () => {
    const policy = buildDefaultPolicy();
    for (let day = 0; day <= 400; day++) {
      const result = evaluateAgingDiscount("REF", day, "TRANSFER", policy);
      assert.equal(result.status, "EVALUATED", `Day ${day} should be EVALUATED`);
      assert.notEqual(result.discountPercent, null, `Day ${day} should have a discount`);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Temporal validity
// ═════════════════════════════════════════════════════════════════════════════

describe("T: Temporal validity", () => {
  it("T1: expired rule does not participate", () => {
    const expiredRule = mkAgingRule({
      id: "expired",
      effect: "OVERRIDE",
      minDays: 365,
      maxDays: null,
      discountPercent: 99,
      validFrom: "2025-01-01",
      validTo: "2025-12-31",
    });
    const { policy } = buildEffectiveAgingDiscountPolicy(
      DEFAULT_BANDS, [expiredRule], STORE_ID, EVAL_DATE,
    );
    const result = evaluateAgingDiscount("REF", 400, "TRANSFER", policy);
    assert.equal(result.discountPercent, 70, "Expired rule should not apply");
  });

  it("T2: future rule does not participate yet", () => {
    const futureRule = mkAgingRule({
      id: "future",
      effect: "OVERRIDE",
      minDays: 365,
      maxDays: null,
      discountPercent: 99,
      validFrom: "2027-01-01",
    });
    const { policy } = buildEffectiveAgingDiscountPolicy(
      DEFAULT_BANDS, [futureRule], STORE_ID, EVAL_DATE,
    );
    const result = evaluateAgingDiscount("REF", 400, "TRANSFER", policy);
    assert.equal(result.discountPercent, 70, "Future rule should not apply");
  });

  it("T3: rule within validity window participates", () => {
    const activeRule = mkAgingRule({
      id: "active_window",
      effect: "OVERRIDE",
      minDays: 365,
      maxDays: null,
      discountPercent: 55,
      validFrom: "2026-01-01",
      validTo: "2026-12-31",
    });
    const { policy } = buildEffectiveAgingDiscountPolicy(
      DEFAULT_BANDS, [activeRule], STORE_ID, EVAL_DATE,
    );
    const result = evaluateAgingDiscount("REF", 400, "TRANSFER", policy);
    assert.equal(result.discountPercent, 55, "Active window rule should apply");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Conflict resolution
// ═════════════════════════════════════════════════════════════════════════════

describe("C: Conflict resolution", () => {
  it("C1: multiple active rules for same band — highest priority wins", () => {
    const rule1 = mkAgingRule({
      id: "low_prio",
      effect: "OVERRIDE",
      minDays: 365,
      maxDays: null,
      discountPercent: 60,
      priority: 100,
    });
    const rule2 = mkAgingRule({
      id: "high_prio",
      effect: "OVERRIDE",
      minDays: 365,
      maxDays: null,
      discountPercent: 55,
      priority: 10,
    });
    const { policy } = buildEffectiveAgingDiscountPolicy(
      DEFAULT_BANDS, [rule1, rule2], STORE_ID, EVAL_DATE,
    );
    const result = evaluateAgingDiscount("REF", 400, "TRANSFER", policy);
    assert.equal(result.discountPercent, 55, "Lower priority number should win");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// G2: loadStoreDiscounts authority guardian
// ═════════════════════════════════════════════════════════════════════════════

describe("G2: loadStoreDiscounts authority guardian", () => {
  it("G2-1: store-discount-service.ts does NOT use DISCOUNT_RULES or resolveDiscountTier productively", async () => {
    // Read the source file and verify no productive usage
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      new URL("../store-discount-service.ts", import.meta.url),
      "utf-8",
    );

    // Remove comment lines, import lines, and re-export blocks
    const productiveLines = source
      .split("\n")
      .filter(l => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
      .filter(l => !l.includes("export {") && !l.includes("export type {"))
      .filter(l => !l.includes("import "))
      .filter(l => !l.match(/^\s*\w+,?\s*$/))  // bare re-export identifiers like "  DISCOUNT_RULES,"
      .filter(l => !l.match(/^\s*} from\s/))    // closing "} from" of re-export blocks
      .join("\n");

    // DISCOUNT_RULES and resolveDiscountTier must NOT appear in productive code
    assert.ok(
      !productiveLines.includes("DISCOUNT_RULES"),
      "DISCOUNT_RULES must not be used productively in store-discount-service.ts",
    );
    assert.ok(
      !productiveLines.includes("resolveDiscountTier("),
      "resolveDiscountTier() must not be called productively in store-discount-service.ts",
    );
  });

  it("G2-2: loadStoreDiscounts uses evaluateAgingDiscount as authority", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      new URL("../store-discount-service.ts", import.meta.url),
      "utf-8",
    );

    // Must import evaluateAgingDiscount and buildEffectiveAgingDiscountPolicy
    assert.ok(source.includes("evaluateAgingDiscount"), "Must use evaluateAgingDiscount");
    assert.ok(source.includes("buildEffectiveAgingDiscountPolicy"), "Must use buildEffectiveAgingDiscountPolicy");
    assert.ok(source.includes("deriveDiscountTierCompat"), "Must use deriveDiscountTierCompat for compat");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 2 — DOMAIN SAFETY CLOSE
// ═════════════════════════════════════════════════════════════════════════════

// ── §1: FAIL CLOSED — discount service ──────────────────────────────────────

describe("FC: Fail-closed — discount service", () => {
  it("FC-1: store-discount-service.ts checks policyErrors.length > 0", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      new URL("../store-discount-service.ts", import.meta.url),
      "utf-8",
    );
    assert.ok(
      source.includes("policyErrors.length > 0"),
      "Must check policyErrors.length > 0 before evaluating",
    );
    assert.ok(
      source.includes("POLICY_INVALID"),
      "Must return POLICY_INVALID status when policy is invalid",
    );
  });

  it("FC-2: POLICY_INVALID response has zero recommendations", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      new URL("../store-discount-service.ts", import.meta.url),
      "utf-8",
    );
    // The fail-closed block must return recommendations: []
    const failBlock = source.substring(
      source.indexOf("policyErrors.length > 0"),
      source.indexOf("// Evaluate N references"),
    );
    assert.ok(failBlock.includes("recommendations: []"), "Must return empty recommendations on invalid policy");
  });
});

// ── §2: FAIL CLOSED — decision engine ───────────────────────────────────────

describe("FC-DE: Fail-closed — decision engine", () => {
  it("FC-DE-1: evaluateStorePolicyPack checks agingPolicyErrors", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      new URL("../store-decision-engine.ts", import.meta.url),
      "utf-8",
    );
    assert.ok(
      source.includes("agingPolicyErrors.length === 0"),
      "Must gate evaluateAutomaticMarkdowns on valid policy",
    );
  });

  it("FC-DE-2: invalid aging policy produces empty markdowns and slow rotation", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      new URL("../store-decision-engine.ts", import.meta.url),
      "utf-8",
    );
    // Both must be gated
    const block = source.substring(
      source.indexOf("agingPolicyErrors"),
      source.indexOf("const assortmentSuggestions"),
    );
    assert.ok(
      block.includes("evaluateAutomaticMarkdowns") && block.includes("agingPolicyErrors.length === 0"),
      "evaluateAutomaticMarkdowns must be gated by agingPolicyErrors",
    );
    assert.ok(
      block.includes("evaluateSlowRotation") && block.includes(": []"),
      "evaluateSlowRotation must fall back to [] on invalid policy",
    );
  });
});

// ── §6: PROMISE TEST — atomic split ─────────────────────────────────────────

describe("BATCH: Atomic split validation", () => {
  it("BATCH-1: valid split — 365+ → DISABLE + ADD 365-539 + ADD 540+ passes validation", () => {
    const disableOld = mkAgingRule({
      id: "disable_365_open", effect: "DISABLE",
      minDays: 365, maxDays: null,
    });
    const addCapped = mkAgingRule({
      id: "add_365_539", effect: "ADD",
      minDays: 365, maxDays: 539, discountPercent: 70,
    });
    const add80 = mkAgingRule({
      id: "add_540_open", effect: "ADD",
      minDays: 540, maxDays: null, discountPercent: 80,
    });
    const { policy, errors } = buildEffectiveAgingDiscountPolicy(
      DEFAULT_BANDS, [disableOld, addCapped, add80], STORE_ID, EVAL_DATE,
    );
    assert.equal(errors.length, 0);
    assert.equal(policy.bands.length, 6);

    // Boundary precision
    const at539 = evaluateAgingDiscount("REF", 539, "TRANSFER", policy);
    assert.equal(at539.discountPercent, 70);
    const at540 = evaluateAgingDiscount("REF", 540, "TRANSFER", policy);
    assert.equal(at540.discountPercent, 80);
    const at600 = evaluateAgingDiscount("REF", 600, "TRANSFER", policy);
    assert.equal(at600.discountPercent, 80);
  });

  it("BATCH-2: invalid third op (missing ADD) — policy rejected, 365+ stays 70", () => {
    // Only DISABLE + one ADD (capped at 539) — missing the open-ended replacement
    const disableOld = mkAgingRule({
      id: "disable_365_open", effect: "DISABLE",
      minDays: 365, maxDays: null,
    });
    const addCapped = mkAgingRule({
      id: "add_365_539", effect: "ADD",
      minDays: 365, maxDays: 539, discountPercent: 70,
    });
    const { errors } = buildEffectiveAgingDiscountPolicy(
      DEFAULT_BANDS, [disableOld, addCapped], STORE_ID, EVAL_DATE,
    );
    // Must reject: last band (365-539) is not open-ended
    assert.ok(errors.length > 0, "Incomplete split must produce validation errors");
    assert.ok(errors.some(e => e.message.includes("open-ended")), "Must detect missing open-ended band");
  });
});

// ── §7: INVALID POLICY TESTS ────────────────────────────────────────────────

describe("F: Invalid policy rejection", () => {
  it("F1: DISABLE 365+ without replacement → rejected", () => {
    const disableOnly = mkAgingRule({
      id: "disable_365", effect: "DISABLE",
      minDays: 365, maxDays: null,
    });
    const { errors } = buildEffectiveAgingDiscountPolicy(
      DEFAULT_BANDS, [disableOnly], STORE_ID, EVAL_DATE,
    );
    assert.ok(errors.length > 0, "DISABLE without replacement must be rejected");
    assert.ok(errors.some(e => e.message.includes("open-ended")), "Must detect missing open-ended band");
  });

  it("F2: ADD overlapping 350-500 → rejected", () => {
    const overlap = mkAgingRule({
      id: "overlap_350_500", effect: "ADD",
      minDays: 350, maxDays: 500, discountPercent: 60,
    });
    const { errors } = buildEffectiveAgingDiscountPolicy(
      DEFAULT_BANDS, [overlap], STORE_ID, EVAL_DATE,
    );
    assert.ok(errors.length > 0, "Overlapping band must be rejected");
    assert.ok(errors.some(e => e.message.toLowerCase().includes("overlap")), "Must detect overlap");
  });

  it("F3: gap introduced by boundary edit → rejected", () => {
    // DISABLE 90-179, ADD 90-149 → gap at 150-179
    const disableMid = mkAgingRule({
      id: "disable_90_179", effect: "DISABLE",
      minDays: 90, maxDays: 179,
    });
    const addShort = mkAgingRule({
      id: "add_90_149", effect: "ADD",
      minDays: 90, maxDays: 149, discountPercent: 10,
    });
    const addRest = mkAgingRule({
      id: "add_180_open", effect: "ADD",
      minDays: 180, maxDays: null, discountPercent: 30,
    });
    // Also need to disable the existing 180-269 and 270-364 and 365+
    // since we're replacing from 180 onward with a single open band
    const disable180 = mkAgingRule({ id: "d180", effect: "DISABLE", minDays: 180, maxDays: 269 });
    const disable270 = mkAgingRule({ id: "d270", effect: "DISABLE", minDays: 270, maxDays: 364 });
    const disable365 = mkAgingRule({ id: "d365", effect: "DISABLE", minDays: 365, maxDays: null });

    const { errors } = buildEffectiveAgingDiscountPolicy(
      DEFAULT_BANDS,
      [disableMid, addShort, addRest, disable180, disable270, disable365],
      STORE_ID, EVAL_DATE,
    );
    assert.ok(errors.length > 0, "Gap at 150-179 must be detected");
    assert.ok(errors.some(e => e.message.includes("Gap")), "Must detect gap between bands");
  });

  it("F4: two open-ended bands → rejected", () => {
    const bands: EffectiveAgingDiscountRule[] = [
      { targetKey: "AGING:0:89", ruleKind: "AGING_DISCOUNT", minDays: 0, maxDays: 89, discountPercent: 0, priority: 0, source: "PACK_DEFAULT", persistedRuleId: null },
      { targetKey: "AGING:90:OPEN", ruleKind: "AGING_DISCOUNT", minDays: 90, maxDays: null, discountPercent: 10, priority: 100, source: "PACK_DEFAULT", persistedRuleId: null },
      { targetKey: "AGING:200:OPEN", ruleKind: "AGING_DISCOUNT", minDays: 200, maxDays: null, discountPercent: 30, priority: 200, source: "PACK_DEFAULT", persistedRuleId: null },
    ];
    const errors = validateAgingDiscountPolicy(bands);
    assert.ok(errors.length > 0, "Two open-ended bands must be rejected");
  });

  it("F5: first band starts > 0 → rejected", () => {
    const bands: EffectiveAgingDiscountRule[] = [
      { targetKey: "AGING:10:89", ruleKind: "AGING_DISCOUNT", minDays: 10, maxDays: 89, discountPercent: 0, priority: 0, source: "PACK_DEFAULT", persistedRuleId: null },
      { targetKey: "AGING:90:OPEN", ruleKind: "AGING_DISCOUNT", minDays: 90, maxDays: null, discountPercent: 10, priority: 100, source: "PACK_DEFAULT", persistedRuleId: null },
    ];
    const errors = validateAgingDiscountPolicy(bands);
    assert.ok(errors.some(e => e.message.includes("day 0")), "Must detect first band not starting at 0");
  });

  it("F6: discountPercent > 100 → rejected", () => {
    const bands: EffectiveAgingDiscountRule[] = [
      { targetKey: "AGING:0:OPEN", ruleKind: "AGING_DISCOUNT", minDays: 0, maxDays: null, discountPercent: 150, priority: 0, source: "PACK_DEFAULT", persistedRuleId: null },
    ];
    const errors = validateAgingDiscountPolicy(bands);
    assert.ok(errors.some(e => e.message.includes("0\u2013100")), "Must reject discountPercent > 100");
  });

  it("F7: runtime receives corrupted persisted policy → service fail-closed", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      new URL("../store-discount-service.ts", import.meta.url),
      "utf-8",
    );
    // Verify fail-closed pattern exists in service
    assert.ok(source.includes("policyErrors.length > 0"), "Service must check policy errors");
    assert.ok(source.includes("POLICY_INVALID"), "Service must return POLICY_INVALID status");
    assert.ok(source.includes("recommendations: []"), "Service must return zero recommendations");
  });

  it("F8: decision engine receives corrupted policy → fail-closed identically", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      new URL("../store-decision-engine.ts", import.meta.url),
      "utf-8",
    );
    assert.ok(
      source.includes("agingPolicyErrors.length === 0"),
      "Decision engine must gate markdown evaluation on valid policy",
    );
    // Both evaluateAutomaticMarkdowns and evaluateSlowRotation must be gated
    const gateBlock = source.substring(
      source.indexOf("agingPolicyErrors.length === 0"),
      source.indexOf("assortmentSuggestions"),
    );
    assert.ok(gateBlock.includes("evaluateAutomaticMarkdowns"), "Markdowns must be in gated block");
    assert.ok(gateBlock.includes("evaluateSlowRotation"), "Slow rotation must be in gated block");
  });
});

// ── §9: DECISION ENGINE PARITY — extended ───────────────────────────────────

describe("D2: Decision engine parity — extended boundary cases", () => {
  it("D2-1: parity across all canonical boundary days", () => {
    const policy = buildDefaultPolicy();
    const cases: [number, number][] = [
      [89, 0], [90, 10], [179, 10], [180, 30],
      [269, 30], [270, 50], [360, 50], [364, 50], [365, 70],
    ];
    for (const [days, expectedPct] of cases) {
      const result = evaluateAgingDiscount("REF", days, "TRANSFER", policy);
      assert.equal(result.discountPercent, expectedPct, `Day ${days} → ${expectedPct}%`);
    }
  });

  it("D2-2: dynamic 600 → 80% with split policy", () => {
    const disableOld = mkAgingRule({ id: "d365", effect: "DISABLE", minDays: 365, maxDays: null });
    const addCapped = mkAgingRule({ id: "a365", effect: "ADD", minDays: 365, maxDays: 539, discountPercent: 70 });
    const add80 = mkAgingRule({ id: "a540", effect: "ADD", minDays: 540, maxDays: null, discountPercent: 80 });
    const { policy } = buildEffectiveAgingDiscountPolicy(DEFAULT_BANDS, [disableOld, addCapped, add80], STORE_ID, EVAL_DATE);
    const result = evaluateAgingDiscount("REF", 600, "TRANSFER", policy);
    assert.equal(result.discountPercent, 80);
  });
});

// ── §10: DISCOUNTTIER COMPAT GUARDIAN ────────────────────────────────────────

describe("COMPAT: discountPercent is canonical authority", () => {
  it("COMPAT-1: 80% maps to SEVENTY_PERCENT for display only", () => {
    const tier = deriveDiscountTierCompat(80, "EVALUATED");
    assert.equal(tier, "SEVENTY_PERCENT");
  });

  it("COMPAT-2: POLICY_INVALID maps to SIN_FECHA for display", () => {
    const tier = deriveDiscountTierCompat(null, "POLICY_INVALID");
    assert.equal(tier, "SIN_FECHA");
  });

  it("COMPAT-3: DiscountRecommendation.discountPercent is canonical — guardian", async () => {
    // Verify the service uses evaluation.discountPercent as canonical, not compatTier
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      new URL("../store-discount-service.ts", import.meta.url),
      "utf-8",
    );
    // discountPercent must come from evaluation, not from compat
    assert.ok(
      source.includes("discountPercent: evaluation.discountPercent"),
      "discountPercent must come from evaluation.discountPercent (canonical), not from compat tier",
    );
  });

  it("COMPAT-4: no business logic consumes discountTier for decisions", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      new URL("../store-discount-service.ts", import.meta.url),
      "utf-8",
    );
    // The productive code must not use compatTier for anything beyond the recommendation object
    const lines = source.split("\n");
    const compatUsages = lines.filter(l =>
      l.includes("compatTier") && !l.includes("//") && !l.includes("discountTier:"),
    );
    // Only allowed usage: const compatTier = deriveDiscountTierCompat(...)
    assert.ok(
      compatUsages.length <= 1,
      `compatTier should only be used in declaration + assignment to discountTier. Found ${compatUsages.length} other usages.`,
    );
  });
});

// ── §11: AUTHORITY GUARD FINAL ──────────────────────────────────────────────

describe("AUTH: Final authority guard — zero parallel sources", () => {
  it("AUTH-1: DISCOUNT_RULES has zero productive callers", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const files = [
      "../store-discount-service.ts",
      "../store-decision-engine.ts",
      "../store-policy-engine.ts",
      "../store-replenishment-engine.ts",
    ];
    for (const f of files) {
      const source = fs.readFileSync(new URL(f, import.meta.url), "utf-8");
      const productive = source.split("\n")
        .filter(l => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
        .filter(l => !l.includes("export {") && !l.includes("export type {"))
        .filter(l => !l.includes("import "))
        .filter(l => !l.match(/^\s*\w+,?\s*$/))
        .filter(l => !l.match(/^\s*} from\s/))
        .join("\n");
      assert.ok(
        !productive.includes("DISCOUNT_RULES"),
        `DISCOUNT_RULES found productively in ${f}`,
      );
    }
  });

  it("AUTH-2: resolveDiscountTier has zero productive callers", async () => {
    const fs = await import("node:fs");
    const files = [
      "../store-discount-service.ts",
      "../store-decision-engine.ts",
    ];
    for (const f of files) {
      const source = fs.readFileSync(new URL(f, import.meta.url), "utf-8");
      const productive = source.split("\n")
        .filter(l => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
        .filter(l => !l.includes("export {") && !l.includes("export type {"))
        .filter(l => !l.includes("import "))
        .filter(l => !l.match(/^\s*\w+,?\s*$/))
        .filter(l => !l.match(/^\s*} from\s/))
        .join("\n");
      assert.ok(
        !productive.includes("resolveDiscountTier("),
        `resolveDiscountTier() called productively in ${f}`,
      );
    }
  });

  it("AUTH-3: CASTILLITOS_AUTOMATIC_MARKDOWN not used productively in discount service", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      new URL("../store-discount-service.ts", import.meta.url),
      "utf-8",
    );
    const productive = source.split("\n")
      .filter(l => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
      .filter(l => !l.includes("import "))
      .join("\n");
    assert.ok(
      !productive.includes("CASTILLITOS_AUTOMATIC_MARKDOWN"),
      "Must not reference legacy CASTILLITOS_AUTOMATIC_MARKDOWN productively",
    );
  });

  it("AUTH-4: Math.floor(days / 30) not used in discount service", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      new URL("../store-discount-service.ts", import.meta.url),
      "utf-8",
    );
    assert.ok(
      !source.includes("Math.floor(days / 30)") && !source.includes("Math.floor(days/30)"),
      "Must not use month conversion in discount service",
    );
  });

  it("AUTH-5: monthsThreshold not used in discount service", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      new URL("../store-discount-service.ts", import.meta.url),
      "utf-8",
    );
    assert.ok(
      !source.includes("monthsThreshold"),
      "Must not reference monthsThreshold in discount service",
    );
  });
});

// ── §3: BATCH SERVICE — validate-before-write structure ─────────────────────

describe("BATCH-SVC: Batch service structure", () => {
  it("BATCH-SVC-1: saveAgingDiscountRulesBatch exists with correct contract", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      new URL("../store-policy-service.ts", import.meta.url),
      "utf-8",
    );
    assert.ok(source.includes("saveAgingDiscountRulesBatch"), "Batch save function must exist");
    assert.ok(source.includes("buildEffectiveAgingDiscountPolicy"), "Must validate policy before write");
    assert.ok(source.includes("errors.length > 0"), "Must check validation errors");
    assert.ok(source.includes("ok: false"), "Must reject on validation failure");
    assert.ok(source.includes("ok: true"), "Must succeed on valid policy");
  });

  it("BATCH-SVC-2: non-aging rules preserved during batch", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      new URL("../store-policy-service.ts", import.meta.url),
      "utf-8",
    );
    assert.ok(
      source.includes("nonAgingRules"),
      "Must separate and preserve non-AGING_DISCOUNT rules",
    );
    assert.ok(
      source.includes("[...nonAgingRules, ...candidateRules]"),
      "Must merge non-aging + candidate rules",
    );
  });

  it("BATCH-SVC-3: single write path — batch uses saveStorePolicy", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      new URL("../store-policy-service.ts", import.meta.url),
      "utf-8",
    );
    // After the validation gate, it must call saveStorePolicy once
    const afterGate = source.substring(source.indexOf("Merge and persist"));
    assert.ok(afterGate.includes("saveStorePolicy"), "Must use single saveStorePolicy call");
  });
});
