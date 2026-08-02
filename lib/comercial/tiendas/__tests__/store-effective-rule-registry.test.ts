/**
 * lib/comercial/tiendas/__tests__/store-effective-rule-registry.test.ts
 *
 * AGENTIK-STORES-DYNAMIC-DERROTERO-RULES-01 — E1-E15 certification.
 *
 * Certifies the effective rule registry: normalization, validation,
 * target key derivation, effect semantics, conflict resolution.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-effective-rule-registry.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeStorePolicyRule,
  validateStorePolicyRule,
  buildCoverageRuleTargetKey,
  buildEffectiveStoreRules,
  EffectiveRuleConflictError,
  type PolicyPackDefaults,
  type PackStructureEntry,
  type EffectiveRule,
} from "../store-effective-rule-registry";

import type { StorePolicyRule } from "../store-policy-types";

// ═════════════════════════════════════════════════════════════════════════════
// Fixtures
// ═════════════════════════════════════════════════════════════════════════════

const NOW = "2026-08-02T12:00:00.000Z";

function mkRule(overrides: Partial<StorePolicyRule> = {}): StorePolicyRule {
  return {
    id: "rule_test_1",
    storeId: "gran_plaza",
    scope: "line",
    productClass: "textile",
    line: "castillitos",
    minQty: 8,
    idealQty: 10,
    maxQty: 12,
    allowReplacement: false,
    allowProductionSignal: false,
    allowMainWarehouseTransfer: true,
    priority: 50,
    active: true,
    ...overrides,
  };
}

const PACK_DEFAULTS: PolicyPackDefaults = {
  castillitosTextile: { minimumUnits: 8, idealUnits: 10, maximumUnits: 12 },
  latinKidsTextile: { minimumUnits: 8, idealUnits: 10, maximumUnits: 12 },
  accessoryCoverage: { idealBySize: { small: 6, medium: 4, large: 1 } },
  specialProducts: {
    referencePatterns: ["BAÑERA", "CUNA_COLECHO", "CORRAL"],
    idealByStore: { gran_plaza: 1, centro: 1, caldas: 3, san_diego: 3 },
    defaultIdeal: 0,
  },
  storeId: "gran_plaza",
};

/** Minimal catalog entries for testing. */
const CATALOG_ENTRIES: readonly PackStructureEntry[] = [
  {
    structureKey: "CS|CS NIÑA BEBE|Blusas",
    label: "Blusas",
    groupLabel: "CS Niña Bebé",
    line: "castillitos",
    priority: 1,
    accSize: null,
    group: "CS NIÑA BEBE",
    subgroup: "Blusas",
  },
  {
    structureKey: "CS|CS NIÑA BEBE|Conjuntos",
    label: "Conjuntos",
    groupLabel: "CS Niña Bebé",
    line: "castillitos",
    priority: 2,
    accSize: null,
    group: "CS NIÑA BEBE",
    subgroup: "Conjuntos",
  },
  {
    structureKey: "LK|Camisetas",
    label: "Camisetas",
    groupLabel: null,
    line: "latin_kids",
    priority: 40,
    accSize: null,
    group: null,
    subgroup: "Camisetas",
  },
  {
    structureKey: "ACC|Pequeño",
    label: "Pequeño",
    groupLabel: "ACCESORIOS",
    line: "accesorios_importacion",
    priority: 44,
    accSize: "small",
    group: null,
    subgroup: "Pequeño",
  },
];

// ═════════════════════════════════════════════════════════════════════════════
// E1: Legacy rule without effect → maintains previous behavior
// ═════════════════════════════════════════════════════════════════════════════

describe("E1: legacy rule without effect → maintains previous behavior", () => {
  it("normalizes to effect=OVERRIDE", () => {
    const legacy = mkRule({ effect: undefined, ruleKind: undefined });
    const normalized = normalizeStorePolicyRule(legacy);
    assert.strictEqual(normalized.effect, "OVERRIDE");
    assert.strictEqual(normalized.ruleKind, "TEXTILE_STRUCTURE");
  });

  it("legacy override replaces pack thresholds", () => {
    const legacyOverride = mkRule({
      effect: undefined,
      ruleKind: undefined,
      subgroup: "Blusas",
      group: "CS NIÑA BEBE",
      minQty: 4,
      idealQty: 5,
      maxQty: 6,
    });
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [legacyOverride], NOW);
    const blusas = rules.find(r => r.ruleKind === "TEXTILE_STRUCTURE" && (r as any).subgroup === "Blusas");
    assert.ok(blusas, "Blusas rule must exist");
    assert.strictEqual(blusas.minimum, 4);
    assert.strictEqual(blusas.ideal, 5);
    assert.strictEqual(blusas.maximum, 6);
    assert.strictEqual(blusas.source, "POLICY_OVERRIDE");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E2: Inactive legacy override → pack fallback
// ═════════════════════════════════════════════════════════════════════════════

describe("E2: inactive legacy override → pack fallback", () => {
  it("active=false means persisted entry does not participate, pack applies", () => {
    const inactive = mkRule({
      active: false,
      subgroup: "Blusas",
      group: "CS NIÑA BEBE",
      minQty: 99,
      idealQty: 99,
      maxQty: 99,
    });
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [inactive], NOW);
    const blusas = rules.find(r => r.ruleKind === "TEXTILE_STRUCTURE" && (r as any).subgroup === "Blusas");
    assert.ok(blusas, "Blusas rule must exist from pack");
    assert.strictEqual(blusas.minimum, 8, "pack default min");
    assert.strictEqual(blusas.ideal, 10, "pack default ideal");
    assert.strictEqual(blusas.maximum, 12, "pack default max");
    assert.strictEqual(blusas.source, "PACK_DEFAULT");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E3: Active OVERRIDE → replaces pack
// ═════════════════════════════════════════════════════════════════════════════

describe("E3: active OVERRIDE → replaces pack", () => {
  it("replaces thresholds", () => {
    const override = mkRule({
      effect: "OVERRIDE",
      ruleKind: "TEXTILE_STRUCTURE",
      subgroup: "Blusas",
      group: "CS NIÑA BEBE",
      minQty: 5,
      idealQty: 7,
      maxQty: 9,
    });
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [override], NOW);
    const blusas = rules.find(r => r.ruleKind === "TEXTILE_STRUCTURE" && (r as any).subgroup === "Blusas");
    assert.ok(blusas);
    assert.strictEqual(blusas.minimum, 5);
    assert.strictEqual(blusas.ideal, 7);
    assert.strictEqual(blusas.maximum, 9);
    assert.strictEqual(blusas.source, "POLICY_OVERRIDE");
    assert.strictEqual(blusas.persistedRuleId, "rule_test_1");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E4: Active DISABLE → eliminates pack rule
// ═════════════════════════════════════════════════════════════════════════════

describe("E4: active DISABLE → eliminates pack rule", () => {
  it("suppresses pack base — rule disappears from effective list", () => {
    const disable = mkRule({
      effect: "DISABLE",
      ruleKind: "TEXTILE_STRUCTURE",
      subgroup: "Blusas",
      group: "CS NIÑA BEBE",
    });
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [disable], NOW);
    const blusas = rules.find(r => r.ruleKind === "TEXTILE_STRUCTURE" && (r as any).subgroup === "Blusas");
    assert.strictEqual(blusas, undefined, "Blusas must be suppressed by DISABLE");
    // But Conjuntos still exists
    const conjuntos = rules.find(r => r.ruleKind === "TEXTILE_STRUCTURE" && (r as any).subgroup === "Conjuntos");
    assert.ok(conjuntos, "Conjuntos must still exist");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E5: Inactive DISABLE → pack rule returns
// ═════════════════════════════════════════════════════════════════════════════

describe("E5: inactive DISABLE → pack returns", () => {
  it("active=false DISABLE does not participate, so pack applies", () => {
    const disableInactive = mkRule({
      effect: "DISABLE",
      ruleKind: "TEXTILE_STRUCTURE",
      subgroup: "Blusas",
      group: "CS NIÑA BEBE",
      active: false,
    });
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [disableInactive], NOW);
    const blusas = rules.find(r => r.ruleKind === "TEXTILE_STRUCTURE" && (r as any).subgroup === "Blusas");
    assert.ok(blusas, "Blusas must exist from pack (DISABLE is inactive)");
    assert.strictEqual(blusas.source, "PACK_DEFAULT");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E6: ADD → creates new rule
// ═════════════════════════════════════════════════════════════════════════════

describe("E6: ADD → creates new rule", () => {
  it("creates a new textile structure that did not exist in pack", () => {
    const add = mkRule({
      id: "rule_add_1",
      effect: "ADD",
      ruleKind: "TEXTILE_STRUCTURE",
      line: "new_brand",
      group: "NEW_GROUP",
      subgroup: "Faldas",
      minQty: 3,
      idealQty: 5,
      maxQty: 8,
      priority: 200,
    });
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [add], NOW);
    const faldas = rules.find(r => r.ruleKind === "TEXTILE_STRUCTURE" && (r as any).subgroup === "Faldas");
    assert.ok(faldas, "Faldas must appear from ADD");
    assert.strictEqual(faldas.minimum, 3);
    assert.strictEqual(faldas.ideal, 5);
    assert.strictEqual(faldas.maximum, 8);
    assert.strictEqual(faldas.source, "POLICY_ADD");
    assert.strictEqual(faldas.persistedRuleId, "rule_add_1");
  });

  it("creates a new special product rule", () => {
    const addSpecial = mkRule({
      id: "rule_add_sp",
      effect: "ADD",
      ruleKind: "SPECIAL_PRODUCT",
      specialPattern: "COLUMPIO",
      idealQty: 2,
      minQty: 2,
      maxQty: null,
      priority: 1005,
    });
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [addSpecial], NOW);
    const columpio = rules.find(r => r.ruleKind === "SPECIAL_PRODUCT" && (r as any).specialPattern === "COLUMPIO");
    assert.ok(columpio, "COLUMPIO must appear from ADD");
    assert.strictEqual(columpio.ideal, 2);
    assert.strictEqual(columpio.source, "POLICY_ADD");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E7: Inactive ADD → new rule disappears
// ═════════════════════════════════════════════════════════════════════════════

describe("E7: inactive ADD → new rule disappears", () => {
  it("active=false ADD does not participate", () => {
    const addInactive = mkRule({
      effect: "ADD",
      ruleKind: "TEXTILE_STRUCTURE",
      line: "new_brand",
      group: "NEW_GROUP",
      subgroup: "Faldas",
      active: false,
      priority: 200,
    });
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [addInactive], NOW);
    const faldas = rules.find(r => r.ruleKind === "TEXTILE_STRUCTURE" && (r as any).subgroup === "Faldas");
    assert.strictEqual(faldas, undefined, "Faldas must not appear (ADD is inactive)");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E8: targetKey derivation is stable
// ═════════════════════════════════════════════════════════════════════════════

describe("E8: targetKey derived stable", () => {
  it("same dimensions → same key, every time", () => {
    const k1 = buildCoverageRuleTargetKey("TEXTILE_STRUCTURE", {
      line: "castillitos", group: "CS NIÑA BEBE", subgroup: "Blusas",
    });
    const k2 = buildCoverageRuleTargetKey("TEXTILE_STRUCTURE", {
      line: "castillitos", group: "CS NIÑA BEBE", subgroup: "Blusas",
    });
    assert.strictEqual(k1, k2);
  });

  it("different dimensions → different key", () => {
    const k1 = buildCoverageRuleTargetKey("TEXTILE_STRUCTURE", {
      line: "castillitos", group: "CS NIÑA BEBE", subgroup: "Blusas",
    });
    const k2 = buildCoverageRuleTargetKey("TEXTILE_STRUCTURE", {
      line: "castillitos", group: "CS NIÑA BEBE", subgroup: "Conjuntos",
    });
    assert.notStrictEqual(k1, k2);
  });

  it("ACC key uses sizeClass", () => {
    const k = buildCoverageRuleTargetKey("ACCESSORY_SIZE", {
      line: "accesorios_importacion", sizeClass: "small",
    });
    assert.ok(k.includes("small"));
    assert.ok(k.startsWith("ACC:"));
  });

  it("SPECIAL key uses specialPattern (normalized to lowercase)", () => {
    const k = buildCoverageRuleTargetKey("SPECIAL_PRODUCT", {
      specialPattern: "BAÑERA",
    });
    assert.ok(k.includes("bañera"), `key should contain normalized pattern: ${k}`);
    assert.ok(k.startsWith("SPECIAL:"));
    // Same pattern in different case → same key
    const k2 = buildCoverageRuleTargetKey("SPECIAL_PRODUCT", {
      specialPattern: "bañera",
    });
    assert.strictEqual(k, k2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E9: targetKey does NOT depend on human label
// ═════════════════════════════════════════════════════════════════════════════

describe("E9: targetKey does not depend on label", () => {
  it("effective rule targetKey is derived from dimensions, not label", () => {
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [], NOW);
    const blusas = rules.find(r => r.ruleKind === "TEXTILE_STRUCTURE" && (r as any).subgroup === "Blusas");
    assert.ok(blusas);
    // Key should contain normalized structural dimensions
    assert.ok(blusas.targetKey.includes("castillitos"));
    assert.ok(blusas.targetKey.includes("cs niña bebe")); // normalized lowercase
    assert.ok(blusas.targetKey.includes("blusas"));        // normalized lowercase
    // Original label is preserved (not normalized)
    assert.strictEqual(blusas.label, "Blusas");
    // Same dimensions in different case → same key (canonical identity)
    const targetKey = buildCoverageRuleTargetKey("TEXTILE_STRUCTURE", {
      line: "castillitos", group: "CS NIÑA BEBE", subgroup: "BLUSAS",
    });
    assert.strictEqual(blusas.targetKey, targetKey);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E10: Conflicting rules for same targetKey → deterministic resolution
// ═════════════════════════════════════════════════════════════════════════════

describe("E10: conflicting rules same targetKey → deterministic", () => {
  it("highest priority (lowest number) wins", () => {
    const r1 = mkRule({
      id: "rule_conflict_a",
      effect: "OVERRIDE",
      ruleKind: "TEXTILE_STRUCTURE",
      subgroup: "Blusas",
      group: "CS NIÑA BEBE",
      minQty: 4,
      idealQty: 5,
      maxQty: 6,
      priority: 10,
    });
    const r2 = mkRule({
      id: "rule_conflict_b",
      effect: "OVERRIDE",
      ruleKind: "TEXTILE_STRUCTURE",
      subgroup: "Blusas",
      group: "CS NIÑA BEBE",
      minQty: 20,
      idealQty: 25,
      maxQty: 30,
      priority: 50,
    });
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [r1, r2], NOW);
    const blusas = rules.find(r => r.ruleKind === "TEXTILE_STRUCTURE" && (r as any).subgroup === "Blusas");
    assert.ok(blusas);
    assert.strictEqual(blusas.minimum, 4, "priority 10 (r1) wins over priority 50 (r2)");
    assert.strictEqual(blusas.persistedRuleId, "rule_conflict_a");
  });

  it("priority tie → most recent ID wins", () => {
    const r1 = mkRule({
      id: "rule_alpha",
      effect: "OVERRIDE",
      ruleKind: "TEXTILE_STRUCTURE",
      subgroup: "Blusas",
      group: "CS NIÑA BEBE",
      minQty: 4,
      idealQty: 5,
      maxQty: 6,
      priority: 50,
    });
    const r2 = mkRule({
      id: "rule_zeta",
      effect: "OVERRIDE",
      ruleKind: "TEXTILE_STRUCTURE",
      subgroup: "Blusas",
      group: "CS NIÑA BEBE",
      minQty: 20,
      idealQty: 25,
      maxQty: 30,
      priority: 50,
    });
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [r1, r2], NOW);
    const blusas = rules.find(r => r.ruleKind === "TEXTILE_STRUCTURE" && (r as any).subgroup === "Blusas");
    assert.ok(blusas);
    // "rule_zeta" > "rule_alpha" lexicographically → r2 wins
    assert.strictEqual(blusas.minimum, 20);
    assert.strictEqual(blusas.persistedRuleId, "rule_zeta");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E11: Invalid discriminated rule rejected
// ═════════════════════════════════════════════════════════════════════════════

describe("E11: invalid discriminated rule rejected", () => {
  it("TEXTILE_STRUCTURE without line → validation error", () => {
    const bad = mkRule({
      ruleKind: "TEXTILE_STRUCTURE",
      line: undefined,
      subgroup: "Blusas",
    });
    const errors = validateStorePolicyRule(bad);
    assert.ok(errors.some(e => e.field === "line"), "must reject missing line");
  });

  it("ACCESSORY_SIZE without sizeClass → validation error", () => {
    const bad = mkRule({
      ruleKind: "ACCESSORY_SIZE",
      sizeClass: undefined,
    });
    const errors = validateStorePolicyRule(bad);
    assert.ok(errors.some(e => e.field === "sizeClass"), "must reject missing sizeClass");
  });

  it("SPECIAL_PRODUCT without specialPattern → validation error", () => {
    const bad = mkRule({
      ruleKind: "SPECIAL_PRODUCT",
      specialPattern: undefined,
    });
    const errors = validateStorePolicyRule(bad);
    assert.ok(errors.some(e => e.field === "specialPattern"), "must reject missing specialPattern");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E12: min > ideal rejected
// ═════════════════════════════════════════════════════════════════════════════

describe("E12: min > ideal rejected", () => {
  it("minQty > idealQty → validation error", () => {
    const bad = mkRule({ minQty: 15, idealQty: 10, maxQty: 20 });
    const errors = validateStorePolicyRule(bad);
    assert.ok(errors.some(e => e.field === "minQty" && e.message.includes("<=")), "must reject min > ideal");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E13: ideal > max rejected when max != null
// ═════════════════════════════════════════════════════════════════════════════

describe("E13: ideal > max rejected when max != null", () => {
  it("idealQty > maxQty → validation error", () => {
    const bad = mkRule({ minQty: 5, idealQty: 15, maxQty: 10 });
    const errors = validateStorePolicyRule(bad);
    assert.ok(errors.some(e => e.field === "idealQty" && e.message.includes("<=")), "must reject ideal > max");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E14: ACC max=null is valid
// ═════════════════════════════════════════════════════════════════════════════

describe("E14: ACC max=null is valid", () => {
  it("maxQty=null is accepted for ACCESSORY_SIZE", () => {
    const acc = mkRule({
      ruleKind: "ACCESSORY_SIZE",
      scope: "class_size",
      sizeClass: "small",
      productClass: "accessory",
      minQty: 4,
      idealQty: 6,
      maxQty: null,
    });
    const errors = validateStorePolicyRule(acc);
    assert.ok(!errors.some(e => e.field === "maxQty"), "null maxQty must be accepted");
    assert.ok(!errors.some(e => e.field === "idealQty"), "no ideal > max error when max is null");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E15: SPECIAL without specialPattern rejected
// ═════════════════════════════════════════════════════════════════════════════

describe("E15: SPECIAL without specialPattern rejected", () => {
  it("empty string specialPattern → validation error", () => {
    const bad = mkRule({
      ruleKind: "SPECIAL_PRODUCT",
      specialPattern: "",
    });
    const errors = validateStorePolicyRule(bad);
    assert.ok(errors.some(e => e.field === "specialPattern"), "must reject empty specialPattern");
  });

  it("undefined specialPattern → validation error", () => {
    const bad = mkRule({
      ruleKind: "SPECIAL_PRODUCT",
      specialPattern: undefined,
    });
    const errors = validateStorePolicyRule(bad);
    assert.ok(errors.some(e => e.field === "specialPattern"), "must reject undefined specialPattern");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Supplementary: full registry smoke test
// ═════════════════════════════════════════════════════════════════════════════

describe("registry: full pack baseline without persisted rules", () => {
  it("produces all base rules from catalog + specials", () => {
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [], NOW);
    // 2 CS textiles + 1 LK textile + 1 ACC + 3 specials = 7
    assert.strictEqual(rules.length, 7, `expected 7 effective rules, got ${rules.length}`);

    const textiles = rules.filter(r => r.ruleKind === "TEXTILE_STRUCTURE");
    assert.strictEqual(textiles.length, 3);

    const acc = rules.filter(r => r.ruleKind === "ACCESSORY_SIZE");
    assert.strictEqual(acc.length, 1);

    const specials = rules.filter(r => r.ruleKind === "SPECIAL_PRODUCT");
    assert.strictEqual(specials.length, 3);
  });

  it("all base rules have source=PACK_DEFAULT and null persistedRuleId", () => {
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [], NOW);
    for (const r of rules) {
      assert.strictEqual(r.source, "PACK_DEFAULT");
      assert.strictEqual(r.persistedRuleId, null);
    }
  });

  it("rules are sorted by priority", () => {
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [], NOW);
    for (let i = 1; i < rules.length; i++) {
      assert.ok(rules[i].priority >= rules[i - 1].priority,
        `priority out of order at index ${i}: ${rules[i].priority} < ${rules[i - 1].priority}`);
    }
  });
});

describe("registry: expired/future rules are ignored", () => {
  it("future validFrom → does not participate", () => {
    const future = mkRule({
      effect: "OVERRIDE",
      ruleKind: "TEXTILE_STRUCTURE",
      subgroup: "Blusas",
      group: "CS NIÑA BEBE",
      minQty: 99,
      idealQty: 99,
      maxQty: 99,
      validFrom: "2099-01-01T00:00:00.000Z",
    });
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [future], NOW);
    const blusas = rules.find(r => r.ruleKind === "TEXTILE_STRUCTURE" && (r as any).subgroup === "Blusas");
    assert.ok(blusas);
    assert.strictEqual(blusas.minimum, 8, "pack default still applies (future rule ignored)");
    assert.strictEqual(blusas.source, "PACK_DEFAULT");
  });

  it("expired validTo → does not participate", () => {
    const expired = mkRule({
      effect: "DISABLE",
      ruleKind: "TEXTILE_STRUCTURE",
      subgroup: "Blusas",
      group: "CS NIÑA BEBE",
      validTo: "2020-01-01T00:00:00.000Z",
    });
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [expired], NOW);
    const blusas = rules.find(r => r.ruleKind === "TEXTILE_STRUCTURE" && (r as any).subgroup === "Blusas");
    assert.ok(blusas, "Blusas must exist (expired DISABLE ignored, pack applies)");
    assert.strictEqual(blusas.source, "PACK_DEFAULT");
  });
});

describe("registry: DISABLE on special product", () => {
  it("DISABLE suppresses a special product rule", () => {
    const disableSpecial = mkRule({
      effect: "DISABLE",
      ruleKind: "SPECIAL_PRODUCT",
      specialPattern: "BAÑERA",
    });
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [disableSpecial], NOW);
    const banera = rules.find(r => r.ruleKind === "SPECIAL_PRODUCT" && (r as any).specialPattern === "BAÑERA");
    assert.strictEqual(banera, undefined, "BAÑERA must be suppressed");
    // Others remain
    const cuna = rules.find(r => r.ruleKind === "SPECIAL_PRODUCT" && (r as any).specialPattern === "CUNA_COLECHO");
    assert.ok(cuna, "CUNA_COLECHO must still exist");
  });
});

describe("registry: validation — DISABLE skips threshold checks", () => {
  it("DISABLE with min>ideal does not fail validation", () => {
    const disableRule = mkRule({
      effect: "DISABLE",
      ruleKind: "TEXTILE_STRUCTURE",
      subgroup: "Blusas",
      minQty: 99,
      idealQty: 1,
      maxQty: 0,
    });
    const errors = validateStorePolicyRule(disableRule);
    assert.ok(!errors.some(e => e.field === "minQty"), "threshold checks skipped for DISABLE");
    assert.ok(!errors.some(e => e.field === "idealQty"), "threshold checks skipped for DISABLE");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// K1-K8: Canonical Identity Tests (§5 pre-close)
// ═════════════════════════════════════════════════════════════════════════════

import { normalizeCoverageRuleIdentityPart } from "../store-effective-rule-registry";

describe("K1-K3: normalizeCoverageRuleIdentityPart", () => {
  it("K1: same target with different case → same targetKey", () => {
    const k1 = buildCoverageRuleTargetKey("TEXTILE_STRUCTURE", {
      line: "castillitos", group: "CS NIÑA BEBE", subgroup: "Blusas",
    });
    const k2 = buildCoverageRuleTargetKey("TEXTILE_STRUCTURE", {
      line: "castillitos", group: "cs niña bebe", subgroup: "blusas",
    });
    const k3 = buildCoverageRuleTargetKey("TEXTILE_STRUCTURE", {
      line: "CASTILLITOS", group: "CS NIÑA BEBE", subgroup: "BLUSAS",
    });
    assert.strictEqual(k1, k2);
    assert.strictEqual(k2, k3);
  });

  it("K2: redundant spaces → same targetKey", () => {
    const k1 = buildCoverageRuleTargetKey("TEXTILE_STRUCTURE", {
      line: "castillitos", group: "CS NIÑA BEBE", subgroup: "Pijama Niña BB CL",
    });
    const k2 = buildCoverageRuleTargetKey("TEXTILE_STRUCTURE", {
      line: "castillitos", group: "  CS  NIÑA  BEBE  ", subgroup: "  Pijama   Niña   BB   CL  ",
    });
    assert.strictEqual(k1, k2);
  });

  it("K3: Unicode equivalent → same targetKey", () => {
    // NFC vs NFD representation of Ñ
    const nfc = "NIÑA";                        // pre-composed
    const nfd = "NIN\u0303A";                  // decomposed N + combining tilde
    const k1 = buildCoverageRuleTargetKey("TEXTILE_STRUCTURE", {
      line: "castillitos", group: `CS ${nfc} BEBE`, subgroup: "Blusas",
    });
    const k2 = buildCoverageRuleTargetKey("TEXTILE_STRUCTURE", {
      line: "castillitos", group: `CS ${nfd} BEBE`, subgroup: "Blusas",
    });
    assert.strictEqual(k1, k2);
  });

  it("K4: commercially distinct labels → distinct targetKeys", () => {
    const k1 = buildCoverageRuleTargetKey("TEXTILE_STRUCTURE", {
      line: "castillitos", group: "CS NIÑA BEBE", subgroup: "Blusas",
    });
    const k2 = buildCoverageRuleTargetKey("TEXTILE_STRUCTURE", {
      line: "castillitos", group: "CS NIÑA BEBE", subgroup: "Pantalones",
    });
    assert.notStrictEqual(k1, k2);
    // Ñ ≠ N (semantic distinctness preserved)
    const k3 = buildCoverageRuleTargetKey("TEXTILE_STRUCTURE", {
      line: "castillitos", group: "CS NINA BEBE", subgroup: "Blusas",
    });
    const k4 = buildCoverageRuleTargetKey("TEXTILE_STRUCTURE", {
      line: "castillitos", group: "CS NIÑA BEBE", subgroup: "Blusas",
    });
    assert.notStrictEqual(k3, k4, "Ñ and N must remain distinct");
  });
});

describe("K5-K6: OVERRIDE/DISABLE case-insensitive matching", () => {
  it("K5: OVERRIDE with different case replaces PACK base, does not duplicate", () => {
    // Find first CS catalog entry to get the original-case group/subgroup
    const firstCS = CATALOG_ENTRIES.find(e => e.line === "castillitos")!;
    const overrideRule = mkRule({
      effect: "OVERRIDE",
      ruleKind: "TEXTILE_STRUCTURE",
      line: "castillitos",
      group: firstCS.group!.toUpperCase(),     // different case than catalog
      subgroup: firstCS.subgroup.toUpperCase(), // different case than catalog
      minQty: 20,
      idealQty: 30,
      maxQty: 40,
    });
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [overrideRule], NOW);
    // Should still be 7 total (4 structural + 3 special), not 8
    assert.equal(rules.length, 7);
    const overridden = rules.find(r =>
      r.ruleKind === "TEXTILE_STRUCTURE" &&
      (r as any).subgroup === firstCS.subgroup, // original-case label preserved
    );
    assert.ok(overridden, "overridden rule should exist with original label");
    assert.equal(overridden!.ideal, 30);
    assert.equal(overridden!.source, "POLICY_OVERRIDE");
  });

  it("K6: DISABLE with different case suppresses PACK base", () => {
    const firstCS = CATALOG_ENTRIES.find(e => e.line === "castillitos")!;
    const disableRule = mkRule({
      effect: "DISABLE",
      ruleKind: "TEXTILE_STRUCTURE",
      line: "CASTILLITOS",                      // different case
      group: firstCS.group!.toLowerCase(),      // different case
      subgroup: firstCS.subgroup.toUpperCase(), // different case
    });
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [disableRule], NOW);
    // Should be 6 (4 - 1 disabled + 3 special)
    assert.equal(rules.length, 6);
    const disabled = rules.find(r =>
      r.ruleKind === "TEXTILE_STRUCTURE" &&
      (r as any).subgroup === firstCS.subgroup,
    );
    assert.strictEqual(disabled, undefined, "disabled structure should be suppressed");
  });
});

describe("K7: ADD collision with existing after normalization", () => {
  it("ADD that collides with pack base target after normalization → treated as OVERRIDE (not duplicated)", () => {
    const firstCS = CATALOG_ENTRIES.find(e => e.line === "castillitos")!;
    const addRule = mkRule({
      effect: "ADD",
      ruleKind: "TEXTILE_STRUCTURE",
      line: "castillitos",
      group: firstCS.group!.toUpperCase(),
      subgroup: firstCS.subgroup.toUpperCase(),
      minQty: 99,
      idealQty: 99,
      maxQty: 99,
    });
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [addRule], NOW);
    // ADD with colliding targetKey overwrites existing → total still 7
    assert.equal(rules.length, 7);
    // The collided entry should have the ADD values
    const collided = rules.find(r => {
      if (r.ruleKind !== "TEXTILE_STRUCTURE") return false;
      const tk = buildCoverageRuleTargetKey("TEXTILE_STRUCTURE", {
        line: "castillitos",
        group: firstCS.group!,
        subgroup: firstCS.subgroup,
      });
      return r.targetKey === tk;
    });
    assert.ok(collided);
    assert.equal(collided!.ideal, 99);
    assert.equal(collided!.source, "POLICY_ADD");
  });
});

describe("K8: special pattern normalization coherent with identity", () => {
  it("special targetKey normalized coherently, NFD matcher unaffected", () => {
    // Keys match regardless of case/NFD
    const k1 = buildCoverageRuleTargetKey("SPECIAL_PRODUCT", { specialPattern: "BAÑERA" });
    const k2 = buildCoverageRuleTargetKey("SPECIAL_PRODUCT", { specialPattern: "bañera" });
    const k3 = buildCoverageRuleTargetKey("SPECIAL_PRODUCT", { specialPattern: "BAN\u0303ERA" });
    assert.strictEqual(k1, k2);
    // NFC normalization makes decomposed Ñ equal to composed Ñ
    assert.strictEqual(k1, k3);
    // But identity preserves diacritics: "banera" (no tilde) ≠ "bañera"
    const k4 = buildCoverageRuleTargetKey("SPECIAL_PRODUCT", { specialPattern: "BANERA" });
    assert.notStrictEqual(k1, k4, "BAÑERA ≠ BANERA — ñ preserved");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Gate 5: Promise Test — CREATE/EDIT/DISABLE/REACTIVATE without catalog knowledge
// ═════════════════════════════════════════════════════════════════════════════

describe("promise test: lifecycle without catalog knowledge", () => {
  // Simulates a Derrotero user who only knows business field names,
  // NOT the internal casing of buildPackCatalogEntries().
  const firstCS = CATALOG_ENTRIES.find(e => e.line === "castillitos")!;
  // User knows the SAG grupo/subgrupo in THEIR case (e.g. uppercased from SAG)
  const USER_GROUP = firstCS.group!.toUpperCase();
  const USER_SUBGROUP = firstCS.subgroup.toUpperCase();

  it("CREATE: ADD appears in effective rules", () => {
    const addRule = mkRule({
      id: "promise-create",
      effect: "ADD",
      ruleKind: "TEXTILE_STRUCTURE",
      line: "castillitos",
      group: "NUEVA LINEA",
      subgroup: "NUEVO SUBGRUPO",
      minQty: 3,
      idealQty: 5,
      maxQty: 10,
    });
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [addRule], NOW);
    const created = rules.find(r =>
      r.ruleKind === "TEXTILE_STRUCTURE" &&
      (r as any).subgroup === "NUEVO SUBGRUPO",
    );
    assert.ok(created, "created rule should appear");
    assert.equal(created!.ideal, 5);
    assert.equal(created!.source, "POLICY_ADD");
    assert.equal(rules.length, 8); // 7 base + 1 ADD
  });

  it("EDIT: OVERRIDE with user-case replaces PACK, thresholds change", () => {
    const overrideRule = mkRule({
      id: "promise-edit",
      effect: "OVERRIDE",
      ruleKind: "TEXTILE_STRUCTURE",
      line: "castillitos",
      group: USER_GROUP,
      subgroup: USER_SUBGROUP,
      minQty: 15,
      idealQty: 25,
      maxQty: 35,
    });
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [overrideRule], NOW);
    const edited = rules.find(r =>
      r.ruleKind === "TEXTILE_STRUCTURE" &&
      (r as any).subgroup === firstCS.subgroup, // original label preserved
    );
    assert.ok(edited, "edited rule should exist with original label");
    assert.equal(edited!.ideal, 25, "threshold should be overridden");
    assert.equal(edited!.source, "POLICY_OVERRIDE");
    assert.equal(rules.length, 7); // no duplication
  });

  it("DISABLE: user-case DISABLE suppresses PACK rule", () => {
    const disableRule = mkRule({
      id: "promise-disable",
      effect: "DISABLE",
      ruleKind: "TEXTILE_STRUCTURE",
      line: "castillitos",
      group: USER_GROUP,
      subgroup: USER_SUBGROUP,
    });
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [disableRule], NOW);
    const disabled = rules.find(r =>
      r.ruleKind === "TEXTILE_STRUCTURE" &&
      (r as any).subgroup === firstCS.subgroup,
    );
    assert.strictEqual(disabled, undefined, "disabled rule should be suppressed");
    assert.equal(rules.length, 6); // 7 - 1
  });

  it("REACTIVATE: active=false after DISABLE → PACK base re-emerges", () => {
    const disabledRule = mkRule({
      id: "promise-reactivate",
      effect: "DISABLE",
      ruleKind: "TEXTILE_STRUCTURE",
      line: "castillitos",
      group: USER_GROUP,
      subgroup: USER_SUBGROUP,
      active: false, // deactivated → pack base applies again
    });
    const rules = buildEffectiveStoreRules(PACK_DEFAULTS, CATALOG_ENTRIES, [disabledRule], NOW);
    const reactivated = rules.find(r =>
      r.ruleKind === "TEXTILE_STRUCTURE" &&
      (r as any).subgroup === firstCS.subgroup,
    );
    assert.ok(reactivated, "pack base should re-emerge when persisted rule is inactive");
    assert.equal(reactivated!.source, "PACK_DEFAULT");
    assert.equal(rules.length, 7); // back to baseline
  });
});
