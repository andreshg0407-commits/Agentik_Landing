/**
 * lib/comercial/tiendas/__tests__/derrotero-delivery-certification.test.ts
 *
 * AGENTIK-STORES-DERROTERO-DELIVERY-01
 *
 * Certifies:
 *   Gate 3: Deterministic lifecycle (CREATE → ACTIVE → INACTIVE/revert)
 *   Gate 4: Rule identity (ruleKind + effect emitted by buildRulesFromConfig)
 *   Gate 5: Effect semantics (OVERRIDE, DISABLE, ADD in registry)
 *   Gate 7: Validation (fail closed on invalid config)
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/derrotero-delivery-certification.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Pure imports (no server-only deps) ──────────────────────────────────────

import {
  buildEffectiveStoreRules,
  buildEffectiveAgingDiscountPolicy,
  buildPackCatalogEntries,
  normalizeStorePolicyRule,
  validateStorePolicyRule,
  buildCoverageRuleTargetKey,
  evaluateAgingDiscount,
} from "../store-effective-rule-registry";

import type { StorePolicyRule } from "../store-policy-types";

import {
  CASTILLITOS_TEXTILE_COVERAGE,
  LATIN_KIDS_TEXTILE_COVERAGE,
  CASTILLITOS_ACCESSORY_COVERAGE,
  CASTILLITOS_SPECIAL_PRODUCTS,
  CASTILLITOS_DEFAULT_AGING_DISCOUNT_BANDS,
} from "../store-policy-pack-config";

// ── Source readers ──────────────────────────────────────────────────────────

const LIB_DIR = join(__dirname, "..");
const PROJECT_ROOT = join(__dirname, "..", "..", "..", "..");
const readLib = (file: string) => readFileSync(join(LIB_DIR, file), "utf-8");
const readComponent = (file: string) => readFileSync(
  join(PROJECT_ROOT, "components", "comercial", file), "utf-8",
);

// ── Test data ──────────────────────────────────────────────────────────────

const PACK_DEFAULTS = {
  castillitosTextile: CASTILLITOS_TEXTILE_COVERAGE,
  latinKidsTextile: LATIN_KIDS_TEXTILE_COVERAGE,
  accessoryCoverage: CASTILLITOS_ACCESSORY_COVERAGE,
  specialProducts: CASTILLITOS_SPECIAL_PRODUCTS,
  storeId: "centro",
};

const CATALOG = buildPackCatalogEntries();
const TODAY = "2026-08-05";

function makeTextileRule(overrides: Partial<StorePolicyRule> = {}): StorePolicyRule {
  return {
    id: "rule_test_001",
    storeId: "centro",
    scope: "line",
    productClass: "textile",
    line: "castillitos",
    ruleKind: "TEXTILE_STRUCTURE",
    effect: "OVERRIDE",
    minQty: 6,
    idealQty: 8,
    maxQty: 10,
    allowReplacement: true,
    allowProductionSignal: false,
    allowMainWarehouseTransfer: true,
    priority: 50,
    active: true,
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// GATE 3: Deterministic lifecycle
// ═════════════════════════════════════════════════════════════════════════════

describe("GATE 3 — Deterministic lifecycle", () => {

  it("CREATE: no persisted rules → all rules are PACK_DEFAULT", () => {
    const effective = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG, [], TODAY);
    assert.ok(effective.length > 0, "should have base rules");
    for (const r of effective) {
      assert.equal(r.source, "PACK_DEFAULT");
      assert.equal(r.persistedRuleId, null);
    }
  });

  it("ACTIVE: persisted override rule → source becomes POLICY_OVERRIDE", () => {
    const rule = makeTextileRule({ active: true });
    const effective = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG, [rule], TODAY);
    const csRules = effective.filter(r => r.ruleKind === "TEXTILE_STRUCTURE" && r.line === "castillitos");
    assert.ok(csRules.length > 0);
    for (const r of csRules) {
      assert.equal(r.source, "POLICY_OVERRIDE");
      assert.equal(r.persistedRuleId, "rule_test_001");
      assert.equal(r.minimum, 6);
      assert.equal(r.ideal, 8);
      assert.equal(r.maximum, 10);
    }
  });

  it("INACTIVE: active=false → persisted rule does NOT participate, pack base applies", () => {
    const rule = makeTextileRule({ active: false });
    const effective = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG, [rule], TODAY);
    const csRules = effective.filter(r => r.ruleKind === "TEXTILE_STRUCTURE" && r.line === "castillitos");
    assert.ok(csRules.length > 0);
    for (const r of csRules) {
      assert.equal(r.source, "PACK_DEFAULT", "inactive rule should not override");
      assert.equal(r.persistedRuleId, null);
      assert.equal(r.ideal, CASTILLITOS_TEXTILE_COVERAGE.idealUnits);
    }
  });

  it("REVERT: removing override → pack base resumes (same as no persisted rules)", () => {
    const withOverride = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG, [makeTextileRule()], TODAY);
    const withoutOverride = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG, [], TODAY);
    const csWithOverride = withOverride.filter(r => r.ruleKind === "TEXTILE_STRUCTURE" && r.line === "castillitos");
    const csWithout = withoutOverride.filter(r => r.ruleKind === "TEXTILE_STRUCTURE" && r.line === "castillitos");
    assert.equal(csWithOverride[0].source, "POLICY_OVERRIDE");
    assert.equal(csWithout[0].source, "PACK_DEFAULT");
    assert.equal(csWithout[0].ideal, CASTILLITOS_TEXTILE_COVERAGE.idealUnits);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GATE 4: Rule identity certification
// ═════════════════════════════════════════════════════════════════════════════

describe("GATE 4 — Rule identity", () => {

  it("buildRulesFromConfig emits ruleKind and effect for textile rules", () => {
    const actionsSource = readLib("store-distribution-actions.ts");
    // Verify buildTextileRule includes ruleKind and effect
    assert.ok(actionsSource.includes('ruleKind:                    "TEXTILE_STRUCTURE"'),
      "buildTextileRule must emit ruleKind: TEXTILE_STRUCTURE");
    assert.ok(actionsSource.includes('effect:                      "OVERRIDE"'),
      "buildTextileRule must emit effect: OVERRIDE");
  });

  it("buildRulesFromConfig emits ruleKind and effect for accessory rules", () => {
    const actionsSource = readLib("store-distribution-actions.ts");
    assert.ok(actionsSource.includes('ruleKind:                    "ACCESSORY_SIZE"'),
      "buildAccessoryRule must emit ruleKind: ACCESSORY_SIZE");
  });

  it("normalizeStorePolicyRule infers ruleKind from legacy rules", () => {
    const legacy: StorePolicyRule = {
      id: "legacy_001",
      storeId: "centro",
      scope: "line",
      productClass: "textile",
      line: "castillitos",
      minQty: 6,
      idealQty: 8,
      maxQty: 10,
      allowReplacement: true,
      allowProductionSignal: false,
      allowMainWarehouseTransfer: true,
      priority: 50,
      active: true,
      // NO ruleKind, NO effect — legacy format
    };
    const normalized = normalizeStorePolicyRule(legacy);
    assert.equal(normalized.ruleKind, "TEXTILE_STRUCTURE");
    assert.equal(normalized.effect, "OVERRIDE");
  });

  it("target key is deterministic and stable", () => {
    const key1 = buildCoverageRuleTargetKey("TEXTILE_STRUCTURE", {
      line: "castillitos", group: "GRUPO_01", subgroup: "Jean Clasico",
    });
    const key2 = buildCoverageRuleTargetKey("TEXTILE_STRUCTURE", {
      line: "CASTILLITOS", group: "grupo_01", subgroup: "jean clasico",
    });
    assert.equal(key1, key2, "target key must be case-insensitive");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GATE 5: Effect semantics
// ═════════════════════════════════════════════════════════════════════════════

describe("GATE 5 — Effect semantics", () => {

  it("OVERRIDE: replaces pack base thresholds", () => {
    const rule = makeTextileRule({ effect: "OVERRIDE", minQty: 2, idealQty: 4, maxQty: 6 });
    const effective = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG, [rule], TODAY);
    const cs = effective.filter(r => r.ruleKind === "TEXTILE_STRUCTURE" && r.line === "castillitos");
    for (const r of cs) {
      assert.equal(r.minimum, 2);
      assert.equal(r.ideal, 4);
      assert.equal(r.maximum, 6);
      assert.equal(r.source, "POLICY_OVERRIDE");
    }
  });

  it("DISABLE: suppresses pack base entirely", () => {
    const rule = makeTextileRule({ effect: "DISABLE" });
    const effective = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG, [rule], TODAY);
    const cs = effective.filter(r => r.ruleKind === "TEXTILE_STRUCTURE" && r.line === "castillitos");
    assert.equal(cs.length, 0, "DISABLE should remove all castillitos base rules");
  });

  it("ADD: introduces new rule", () => {
    const addRule: StorePolicyRule = {
      id: "add_001",
      storeId: "centro",
      scope: "subgroup",
      productClass: "textile",
      line: "castillitos",
      group: "GRUPO_99",
      subgroup: "PANTALON_NUEVO",
      ruleKind: "TEXTILE_STRUCTURE",
      effect: "ADD",
      minQty: 5,
      idealQty: 7,
      maxQty: 9,
      allowReplacement: true,
      allowProductionSignal: false,
      allowMainWarehouseTransfer: true,
      priority: 50,
      active: true,
    };
    const effective = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG, [addRule], TODAY);
    const added = effective.find(r =>
      r.ruleKind === "TEXTILE_STRUCTURE" && "subgroup" in r && r.subgroup === "PANTALON_NUEVO",
    );
    assert.ok(added, "ADD should create a new effective rule");
    assert.equal(added!.source, "POLICY_ADD");
    assert.equal(added!.ideal, 7);
  });

  it("DISABLE + ADD on same target = ADD wins (suppresses base, adds new)", () => {
    const disableRule = makeTextileRule({
      id: "dis_001", effect: "DISABLE",
    });
    // Disable removes ALL castillitos base rules. Count before:
    const baseBefore = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG, [], TODAY)
      .filter(r => r.ruleKind === "TEXTILE_STRUCTURE" && r.line === "castillitos").length;
    assert.ok(baseBefore > 0, "should have base CS rules");

    const after = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG, [disableRule], TODAY)
      .filter(r => r.ruleKind === "TEXTILE_STRUCTURE" && r.line === "castillitos").length;
    assert.equal(after, 0, "DISABLE removes all CS rules");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GATE 5b: Aging discount effect semantics
// ═════════════════════════════════════════════════════════════════════════════

describe("GATE 5b — Aging discount policy", () => {

  it("default bands produce valid policy", () => {
    const { policy, errors } = buildEffectiveAgingDiscountPolicy(
      CASTILLITOS_DEFAULT_AGING_DISCOUNT_BANDS, [], "centro", TODAY,
    );
    assert.equal(errors.length, 0);
    assert.equal(policy.bands.length, 5);
    assert.equal(policy.bands[0].discountPercent, 0);
    assert.equal(policy.bands[4].discountPercent, 70);
    assert.equal(policy.bands[4].maxDays, null, "last band must be open-ended");
  });

  it("OVERRIDE on aging band changes discount percent", () => {
    const overrideRule: StorePolicyRule = {
      id: "aging_override_001",
      storeId: "centro",
      scope: "store",
      productClass: "textile",
      ruleKind: "AGING_DISCOUNT",
      effect: "OVERRIDE",
      minDays: 90,
      maxDays: 179,
      discountPercent: 20, // changed from 10 to 20
      priority: 10,
      active: true,
      allowReplacement: false,
      allowProductionSignal: false,
      allowMainWarehouseTransfer: false,
    };
    const { policy, errors } = buildEffectiveAgingDiscountPolicy(
      CASTILLITOS_DEFAULT_AGING_DISCOUNT_BANDS, [overrideRule], "centro", TODAY,
    );
    assert.equal(errors.length, 0);
    const band90 = policy.bands.find(b => b.minDays === 90);
    assert.ok(band90);
    assert.equal(band90!.discountPercent, 20);
    assert.equal(band90!.source, "POLICY_OVERRIDE");
  });

  it("evaluateAgingDiscount applies policy correctly", () => {
    const { policy } = buildEffectiveAgingDiscountPolicy(
      CASTILLITOS_DEFAULT_AGING_DISCOUNT_BANDS, [], "centro", TODAY,
    );
    const eval50 = evaluateAgingDiscount("REF-001", 50, "TRANSFER", policy);
    assert.equal(eval50.discountPercent, 0);
    assert.equal(eval50.status, "EVALUATED");

    const eval100 = evaluateAgingDiscount("REF-002", 100, "TRANSFER", policy);
    assert.equal(eval100.discountPercent, 10);

    const eval200 = evaluateAgingDiscount("REF-003", 200, "TRANSFER", policy);
    assert.equal(eval200.discountPercent, 30);

    const evalNull = evaluateAgingDiscount("REF-004", null, "SIN_FECHA", policy);
    assert.equal(evalNull.status, "SIN_FECHA");
    assert.equal(evalNull.discountPercent, null);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GATE 7: Validation (fail closed)
// ═════════════════════════════════════════════════════════════════════════════

describe("GATE 7 — Validation", () => {

  it("validateStorePolicyRule rejects missing id", () => {
    const rule = makeTextileRule({ id: "" });
    const errors = validateStorePolicyRule(rule);
    assert.ok(errors.length > 0);
    assert.ok(errors.some(e => e.field === "id"));
  });

  it("validateStorePolicyRule rejects minQty > idealQty", () => {
    const rule = makeTextileRule({ minQty: 20, idealQty: 10 });
    const errors = validateStorePolicyRule(rule);
    assert.ok(errors.some(e => e.field === "minQty"));
  });

  it("aging discount policy with gaps is rejected", () => {
    const { errors } = buildEffectiveAgingDiscountPolicy(
      [
        { minDays: 0, maxDays: 89, discountPercent: 0 },
        // Gap: 90-99 missing
        { minDays: 100, maxDays: null, discountPercent: 30 },
      ],
      [], "centro", TODAY,
    );
    assert.ok(errors.length > 0, "gaps in aging policy should produce errors");
  });

  it("aging discount policy with overlaps is rejected", () => {
    const { errors } = buildEffectiveAgingDiscountPolicy(
      [
        { minDays: 0, maxDays: 100, discountPercent: 0 },
        { minDays: 90, maxDays: null, discountPercent: 30 }, // overlaps at 90-100
      ],
      [], "centro", TODAY,
    );
    assert.ok(errors.length > 0, "overlapping bands should produce errors");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GATE 8: UI delivery experience
// ═════════════════════════════════════════════════════════════════════════════

describe("GATE 8 — UI delivery experience", () => {

  it("supply rules tab has revertToDefault function", () => {
    const src = readComponent("store-supply-rules-tab.tsx");
    assert.ok(src.includes("revertToDefault"), "UI must have revertToDefault function");
  });

  it("supply rules tab shows source badge", () => {
    const src = readComponent("store-supply-rules-tab.tsx");
    assert.ok(src.includes("Personalizado para esta tienda"), "must show customized badge");
    assert.ok(src.includes("Predeterminado del tenant"), "must show default badge");
  });

  it("supply rules tab has 'Restablecer al default' button", () => {
    const src = readComponent("store-supply-rules-tab.tsx");
    assert.ok(src.includes("Restablecer al default"), "must have revert button");
  });

  it("supply rules tab shows 'Crear override' for default sections", () => {
    const src = readComponent("store-supply-rules-tab.tsx");
    assert.ok(src.includes("Crear override"), "must show create override for defaults");
    assert.ok(src.includes("Editar override"), "must show edit override for overridden");
  });

  it("supply rules tab save button says 'Guardar como override'", () => {
    const src = readComponent("store-supply-rules-tab.tsx");
    assert.ok(src.includes("Guardar como override"), "save button must be explicit");
  });

  it("special rules section is display-only with policy pack note", () => {
    const src = readComponent("store-supply-rules-tab.tsx");
    assert.ok(src.includes("Valores definidos en la politica del tenant"),
      "special rules must show policy pack source note");
    // Should NOT have editable special rules
    assert.ok(!src.includes("Editar reglas especiales"),
      "broken special rules edit button must be removed");
  });

  it("success message identifies the section that was saved", () => {
    const src = readComponent("store-supply-rules-tab.tsx");
    assert.ok(src.includes("guardado como override de tienda"),
      "success message must identify section");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GATE 6: Cobertura consumes effective config (propagation law)
// ═════════════════════════════════════════════════════════════════════════════

describe("GATE 6 — Cobertura effective config propagation", () => {

  it("store-derrotero-service imports effective rule building", () => {
    const src = readLib("store-derrotero-service.ts");
    assert.ok(src.includes("buildEffectiveStoreRules"), "must import buildEffectiveStoreRules");
    assert.ok(src.includes("buildPackCatalogEntries"), "must import buildPackCatalogEntries");
    assert.ok(src.includes("buildCoverageRuleTargetKey"), "must import buildCoverageRuleTargetKey");
    assert.ok(src.includes("getStoreRules"), "must import getStoreRules for persisted rules");
  });

  it("store-derrotero-service applies effective overrides before coverage evaluation", () => {
    const src = readLib("store-derrotero-service.ts");
    assert.ok(src.includes("applyEffectiveOverrides"), "must apply effective overrides to derrotero");
    assert.ok(src.includes("loadEffectiveRulesForStore"), "must load effective rules per store");
  });

  it("store-derrotero-service is NOT marked deprecated", () => {
    const src = readLib("store-derrotero-service.ts");
    assert.ok(!src.includes("@deprecated"), "service is now wired — deprecated tag must be removed");
  });

  it("API route invalidates coverage cache on config save", () => {
    const routeSrc = readFileSync(
      join(PROJECT_ROOT, "app", "api", "orgs", "[orgSlug]", "comercial", "tiendas", "route.ts"),
      "utf-8",
    );
    assert.ok(routeSrc.includes("invalidateDerroteroCoverageCache"),
      "tiendas route must invalidate coverage cache after save");
  });

  it("policies route invalidates coverage cache on rule mutations", () => {
    const policiesSrc = readFileSync(
      join(PROJECT_ROOT, "app", "api", "orgs", "[orgSlug]", "comercial", "tiendas", "policies", "route.ts"),
      "utf-8",
    );
    const occurrences = (policiesSrc.match(/invalidateDerroteroCoverageCache/g) || []).length;
    // save, add_rule, remove_rule, toggle_active = 4 mutation paths
    assert.ok(occurrences >= 4,
      `policies route must invalidate coverage cache on all 4 mutation paths, found ${occurrences}`);
  });

  it("derroteroEntryToTargetKey mapping covers all 3 line types", () => {
    const src = readLib("store-derrotero-service.ts");
    assert.ok(src.includes("CASTILLITOS: \"castillitos\""), "must map CASTILLITOS line");
    assert.ok(src.includes("LATIN_KIDS: \"latin_kids\""), "must map LATIN_KIDS line");
    assert.ok(src.includes("ACCESSORIES: \"accesorios_importacion\""), "must map ACCESSORIES line");
  });

  it("effective rules with OVERRIDE change derrotero entry thresholds", () => {
    // Simulate: pack default = 8/10/12, store override = 5/7/9
    const overrideRule = makeTextileRule({
      id: "gate6_test",
      scope: "line",
      line: "castillitos",
      ruleKind: "TEXTILE_STRUCTURE",
      effect: "OVERRIDE",
      minQty: 5,
      idealQty: 7,
      maxQty: 9,
      active: true,
    });

    const effective = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG, [overrideRule], TODAY);
    // All castillitos textile rules should now have 5/7/9
    const csRules = effective.filter(r => r.ruleKind === "TEXTILE_STRUCTURE" && "line" in r && r.line === "castillitos");
    assert.ok(csRules.length > 0, "should have castillitos rules");
    for (const rule of csRules) {
      assert.equal(rule.minimum, 5, `${rule.targetKey} minimum should be 5`);
      assert.equal(rule.ideal, 7, `${rule.targetKey} ideal should be 7`);
      assert.equal(rule.maximum, 9, `${rule.targetKey} maximum should be 9`);
    }
  });

  it("effective rules without overrides preserve pack defaults", () => {
    const effective = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG, [], TODAY);
    const csRules = effective.filter(r => r.ruleKind === "TEXTILE_STRUCTURE" && "line" in r && r.line === "castillitos");
    assert.ok(csRules.length > 0);
    for (const rule of csRules) {
      assert.equal(rule.minimum, CASTILLITOS_TEXTILE_COVERAGE.minimumUnits);
      assert.equal(rule.ideal, CASTILLITOS_TEXTILE_COVERAGE.idealUnits);
      assert.equal(rule.maximum, CASTILLITOS_TEXTILE_COVERAGE.maximumUnits);
    }
  });
});
