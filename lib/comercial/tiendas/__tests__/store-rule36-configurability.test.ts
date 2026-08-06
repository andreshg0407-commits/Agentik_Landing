/**
 * lib/comercial/tiendas/__tests__/store-rule36-configurability.test.ts
 *
 * AGENTIK-DERROTERO-RULE36-CONFIG-01
 *
 * Certifies Rule 36 configurability across the full chain:
 *   persistence → effective resolution → all operational consumers
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-rule36-configurability.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LIB_DIR = join(__dirname, "..");
const readLib = (file: string) => readFileSync(join(LIB_DIR, file), "utf-8");

// ── Import pure types/functions (no server-only) ──────────────────────────────

import { CASTILLITOS_GLOBAL_LOW_STOCK } from "../store-policy-pack-config";
import type { StorePolicyRule } from "../store-policy-types";
import { isRule36Eligible } from "../store-rule36-eligibility";

// ── 1. TENANT DEFAULT FALLBACK ──────────────────────────────────────────────

describe("1 — Tenant default fallback", () => {
  it("CASTILLITOS_GLOBAL_LOW_STOCK constant exists as canonical default", () => {
    assert.equal(CASTILLITOS_GLOBAL_LOW_STOCK.threshold, 36);
    assert.deepEqual(CASTILLITOS_GLOBAL_LOW_STOCK.allowedStoreIds, ["centro", "caldas"]);
    assert.deepEqual(CASTILLITOS_GLOBAL_LOW_STOCK.allowedStoreNames, ["Centro", "Caldas"]);
  });

  it("isRule36Eligible uses parameterized threshold (not hardcoded 36)", () => {
    // With threshold=50, stock=45 → scarce → only allowed stores
    assert.equal(isRule36Eligible({
      mainStockUnits: 45,
      scarcityThreshold: 50,
      destinationStoreId: "centro",
      allowedStoreIds: ["centro", "caldas"],
    }), true);

    assert.equal(isRule36Eligible({
      mainStockUnits: 45,
      scarcityThreshold: 50,
      destinationStoreId: "san_diego",
      allowedStoreIds: ["centro", "caldas"],
    }), false);

    // With threshold=50, stock=51 → not scarce → all stores eligible
    assert.equal(isRule36Eligible({
      mainStockUnits: 51,
      scarcityThreshold: 50,
      destinationStoreId: "san_diego",
      allowedStoreIds: ["centro", "caldas"],
    }), true);
  });
});

// ── 2. PERSISTENCE CONTRACT ─────────────────────────────────────────────────

describe("2 — Persistence contract (StorePolicyRule SCARCITY_RULE36)", () => {
  it("StorePolicyRuleKind includes SCARCITY_RULE36", () => {
    const source = readLib("store-policy-types.ts");
    assert.ok(source.includes('"SCARCITY_RULE36"'), "SCARCITY_RULE36 must be in StorePolicyRuleKind");
  });

  it("StorePolicyScope includes tenant", () => {
    const source = readLib("store-policy-types.ts");
    assert.ok(source.includes('"tenant"'), "tenant scope must exist in StorePolicyScope");
  });

  it("StorePolicyRule has allowedStoreIds and allowedStoreNames fields", () => {
    const source = readLib("store-policy-types.ts");
    assert.ok(source.includes("allowedStoreIds?"), "allowedStoreIds must be optional field");
    assert.ok(source.includes("allowedStoreNames?"), "allowedStoreNames must be optional field");
  });

  it("TENANT_SCARCITY_STORE_ID sentinel is exported", () => {
    const source = readLib("store-distribution-actions.ts");
    assert.ok(source.includes('TENANT_SCARCITY_STORE_ID'), "sentinel storeId must be exported");
    assert.ok(source.includes('"__tenant_scarcity__"'), "sentinel value must be __tenant_scarcity__");
  });
});

// ── 3. EFFECTIVE RESOLUTION ─────────────────────────────────────────────────

describe("3 — Effective resolution reads persisted rules", () => {
  it("resolveScarcityConfig reads ruleKind === SCARCITY_RULE36 (not hardcoded)", () => {
    const source = readLib("store-distribution-actions.ts");
    // Must search for SCARCITY_RULE36 in the resolver
    assert.ok(source.includes('r.ruleKind === "SCARCITY_RULE36"'),
      "resolveScarcityConfig must look for SCARCITY_RULE36 rules");
  });

  it("resolveScarcityConfig applies vigencia checks", () => {
    const source = readLib("store-distribution-actions.ts");
    // The resolver must check validFrom/validTo like textile configs
    const resolverSection = source.slice(
      source.indexOf("function resolveScarcityConfig"),
      source.indexOf("function resolveScarcityConfig") + 1500,
    );
    assert.ok(resolverSection.includes("override.validFrom"), "must check validFrom for temporal validity");
    assert.ok(resolverSection.includes("override.validTo"), "must check validTo for temporal validity");
  });

  it("resolveScarcityConfig falls back to CASTILLITOS_GLOBAL_LOW_STOCK when no override", () => {
    const source = readLib("store-distribution-actions.ts");
    const resolverSection = source.slice(
      source.indexOf("function resolveScarcityConfig"),
      source.indexOf("function resolveScarcityConfig") + 2000,
    );
    assert.ok(resolverSection.includes("CASTILLITOS_GLOBAL_LOW_STOCK.threshold"),
      "must fall back to constant threshold");
    assert.ok(resolverSection.includes("CASTILLITOS_GLOBAL_LOW_STOCK.allowedStoreIds"),
      "must fall back to constant allowedStoreIds");
  });

  it("getEffectiveStoreConfig loads tenant scarcity policy separately from store policy", () => {
    const source = readLib("store-distribution-actions.ts");
    assert.ok(source.includes("TENANT_SCARCITY_STORE_ID"),
      "must reference tenant scarcity sentinel");
    assert.ok(source.includes("tenantScarcityPolicy"),
      "must load tenant scarcity policy in getEffectiveStoreConfig");
  });
});

// ── 4. SAVE + PERSISTENCE ───────────────────────────────────────────────────

describe("4 — Save persists scarcity as StorePolicyRule (not audit-only)", () => {
  it("saveDistributionConfig persists scarcity to tenant policy", () => {
    const source = readLib("store-distribution-actions.ts");
    assert.ok(source.includes("saveTenantScarcityRule"),
      "must call saveTenantScarcityRule when config.scarcity is present");
  });

  it("saveTenantScarcityRule builds SCARCITY_RULE36 rule", () => {
    const source = readLib("store-distribution-actions.ts");
    const fnSection = source.slice(
      source.indexOf("async function saveTenantScarcityRule"),
      source.indexOf("async function saveTenantScarcityRule") + 2000,
    );
    assert.ok(fnSection.includes('ruleKind:'), "must set ruleKind");
    assert.ok(fnSection.includes('"SCARCITY_RULE36"'), "ruleKind must be SCARCITY_RULE36");
    assert.ok(fnSection.includes('"tenant"'), "scope must be tenant");
    assert.ok(fnSection.includes("allowedStoreIds:"), "must persist allowedStoreIds");
    assert.ok(fnSection.includes("allowedStoreNames:"), "must persist allowedStoreNames");
    assert.ok(fnSection.includes("lowStockConcentrationThreshold"), "must persist threshold as minQty");
  });

  it("saveTenantScarcityRule handles revert (source=tenant_default removes rule)", () => {
    const source = readLib("store-distribution-actions.ts");
    const fnSection = source.slice(
      source.indexOf("async function saveTenantScarcityRule"),
      source.indexOf("async function saveTenantScarcityRule") + 2000,
    );
    assert.ok(fnSection.includes('"tenant_default"'),
      "must detect tenant_default source for revert");
    assert.ok(fnSection.includes('r.ruleKind !== "SCARCITY_RULE36"'),
      "revert must filter out existing SCARCITY_RULE36 rules");
  });

  it("saveTenantScarcityRule preserves stable identity (reuses existing rule ID)", () => {
    const source = readLib("store-distribution-actions.ts");
    const fnSection = source.slice(
      source.indexOf("async function saveTenantScarcityRule"),
      source.indexOf("async function saveTenantScarcityRule") + 2000,
    );
    assert.ok(fnSection.includes("prev?.id"),
      "must reuse existing rule ID for stable identity");
  });
});

// ── 5. OPERATIONAL CONSUMER PROPAGATION ─────────────────────────────────────

describe("5 — All operational consumers use effective scarcity (not hardcoded)", () => {
  it("store-distribution-service uses resolveScarcityFromPolicies", () => {
    const source = readLib("store-distribution-service.ts");
    assert.ok(source.includes("resolveScarcityFromPolicies"),
      "must import and use resolveScarcityFromPolicies");
    // getScarcityParams should still exist but as deprecated alias
    assert.ok(source.includes("getDefaultScarcityParams"),
      "renamed to getDefaultScarcityParams");
    assert.ok(source.includes("@deprecated"),
      "getScarcityParams must be marked deprecated");
  });

  it("store-structure-availability-service uses resolveScarcityFromPolicies", () => {
    const source = readLib("store-structure-availability-service.ts");
    assert.ok(source.includes("resolveScarcityFromPolicies"),
      "must use resolveScarcityFromPolicies instead of getScarcityParams");
    assert.ok(!source.includes("getScarcityParams"),
      "must NOT use getScarcityParams directly");
  });

  it("store-coverage-service uses resolveScarcityFromPolicies", () => {
    const source = readLib("store-coverage-service.ts");
    assert.ok(source.includes("resolveScarcityFromPolicies"),
      "must use resolveScarcityFromPolicies instead of getScarcityParams");
    assert.ok(!source.includes("getScarcityParams"),
      "must NOT use getScarcityParams directly");
  });

  it("store-warehouse-first-needs uses resolveScarcityFromPolicies", () => {
    const source = readLib("store-warehouse-first-needs.ts");
    assert.ok(source.includes("resolveScarcityFromPolicies"),
      "must use resolveScarcityFromPolicies instead of getScarcityParams");
    assert.ok(!source.includes("getScarcityParams"),
      "must NOT use getScarcityParams directly");
  });

  it("store-replenishment-plan-service uses buildEffectiveStorePriorityOrder", () => {
    const source = readLib("store-replenishment-plan-service.ts");
    assert.ok(source.includes("buildEffectiveStorePriorityOrder"),
      "must have persistence-aware priority order builder");
    assert.ok(source.includes("resolveScarcityFromPolicies"),
      "must use resolveScarcityFromPolicies");
  });

  it("store-snapshot-service uses resolveScarcityFromPolicies", () => {
    const source = readLib("store-snapshot-service.ts");
    assert.ok(source.includes("resolveScarcityFromPolicies"),
      "must override assembled scarcity with effective config");
  });

  it("store-derrotero-service passes effective config to warehouse matrix and priority engine", () => {
    const source = readLib("store-derrotero-service.ts");
    assert.ok(source.includes("resolveScarcityFromPolicies"),
      "must resolve scarcity from policies");
    assert.ok(source.includes("matrixConfig"),
      "must build and pass matrixConfig");
  });
});

// ── 6. resolveScarcityFromPolicies CONTRACT ─────────────────────────────────

describe("6 — resolveScarcityFromPolicies is exported and works correctly", () => {
  it("resolveScarcityFromPolicies is exported from store-distribution-actions", () => {
    const source = readLib("store-distribution-actions.ts");
    assert.ok(source.includes("export function resolveScarcityFromPolicies"),
      "must be an exported function");
  });

  it("resolveScarcityFromPolicies finds tenant policy by TENANT_SCARCITY_STORE_ID", () => {
    const source = readLib("store-distribution-actions.ts");
    const fnSection = source.slice(
      source.indexOf("export function resolveScarcityFromPolicies"),
      source.indexOf("export function resolveScarcityFromPolicies") + 500,
    );
    assert.ok(fnSection.includes("TENANT_SCARCITY_STORE_ID"),
      "must filter policies by tenant scarcity sentinel");
  });
});

// ── 7. UI REVERT SUPPORT ────────────────────────────────────────────────────

describe("7 — UI supports scarcity revert to tenant default", () => {
  it("tiendas-client resetToInherited handles scarcity block", () => {
    const clientPath = join(__dirname, "..", "..", "..", "..", "app", "(app)", "[orgSlug]", "comercial", "tiendas", "tiendas-client.tsx");
    const source = readFileSync(clientPath, "utf-8");
    assert.ok(source.includes('block === "scarcity"') && source.includes('source: "tenant_default"'),
      "resetToInherited must handle scarcity block revert");
  });
});

// ── 8. REGRESSION — line thresholds not broken ──────────────────────────────

describe("8 — Line threshold configurability regression", () => {
  it("resolveTextileConfig still reads persisted line overrides", () => {
    const source = readLib("store-distribution-actions.ts");
    assert.ok(source.includes('r.scope === "line"'),
      "resolveTextileConfig must still match line scope");
    assert.ok(source.includes("override.idealQty"),
      "must read idealQty from override");
  });

  it("resolveAccessoryConfig still reads persisted class_size overrides", () => {
    const source = readLib("store-distribution-actions.ts");
    assert.ok(source.includes('r.scope === "class_size"'),
      "resolveAccessoryConfig must still match class_size scope");
  });

  it("buildRulesFromConfig still builds textile and accessory rules", () => {
    const source = readLib("store-distribution-actions.ts");
    assert.ok(source.includes("buildTextileRule"),
      "must still build textile rules");
    assert.ok(source.includes("buildAccessoryRule"),
      "must still build accessory rules");
  });

  it("distribution-service still uses findApplicableRule for line thresholds", () => {
    const source = readLib("store-distribution-service.ts");
    assert.ok(source.includes("findApplicableRule(variant, policyRules)"),
      "resolveThresholds must still use findApplicableRule");
  });
});

// ── 9. NO DIRECT HARDCODED READS IN OPERATIONAL CONSUMERS ───────────────────

describe("9 — No direct CASTILLITOS_GLOBAL_LOW_STOCK reads in operational consumers", () => {
  const operationalFiles = [
    "store-structure-availability-service.ts",
    "store-coverage-service.ts",
    "store-warehouse-first-needs.ts",
  ];

  for (const file of operationalFiles) {
    it(`${file} does not import CASTILLITOS_GLOBAL_LOW_STOCK`, () => {
      const source = readLib(file);
      assert.ok(!source.includes("CASTILLITOS_GLOBAL_LOW_STOCK"),
        `${file} must NOT import the hardcoded constant directly`);
    });
  }

  it("store-distribution-service only uses CASTILLITOS_GLOBAL_LOW_STOCK in getDefaultScarcityParams", () => {
    const source = readLib("store-distribution-service.ts");
    // The constant should only appear in the import and in getDefaultScarcityParams
    const lines = source.split("\n");
    const usages = lines.filter(l =>
      l.includes("CASTILLITOS_GLOBAL_LOW_STOCK") &&
      !l.trim().startsWith("//") &&
      !l.trim().startsWith("*") &&
      !l.includes("import"),
    );
    // Should only be in getDefaultScarcityParams (3 usages: threshold, allowedStoreIds, allowedStoreNames)
    assert.ok(usages.length <= 4,
      `Expected <= 4 non-import usages of CASTILLITOS_GLOBAL_LOW_STOCK, found ${usages.length}`);
  });
});
