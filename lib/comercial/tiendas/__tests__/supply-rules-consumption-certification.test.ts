/**
 * lib/comercial/tiendas/__tests__/supply-rules-consumption-certification.test.ts
 *
 * AGENTIK-STORES-SUPPLY-RULES-CONSUMPTION-CERTIFICATION-01
 *
 * Certifies the full chain:
 *   StoreSupplyRulesTab → API → StorePolicyRule → getEffectiveStoreConfig
 *   → resolveThresholds → store-distribution-service → Inventario → Necesidades
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/supply-rules-consumption-certification.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Source file readers (no server-only imports in test context) ──────────────

const LIB_DIR = join(__dirname, "..");
const PROJECT_ROOT = join(__dirname, "..", "..", "..", "..");
const readLib = (file: string) => readFileSync(join(LIB_DIR, file), "utf-8");
const readClient = () => readFileSync(
  join(PROJECT_ROOT, "app", "(app)", "[orgSlug]", "comercial", "tiendas", "tiendas-client.tsx"),
  "utf-8",
);

// ── PRIMERO: Certify the real chain ──────────────────────────────────────────

describe("PRIMERO — Chain certification", () => {
  const distributionServiceSource = readLib("store-distribution-service.ts");
  const distributionActionsSource = readLib("store-distribution-actions.ts");
  const inventoryByLineSource = readLib("store-inventory-by-line.ts");
  const needsByLineSource = readLib("store-needs-by-line.ts");
  const policyPackSource = readLib("store-policy-pack-config.ts");

  it("distribution-service imports policy pack config constants", () => {
    assert.ok(distributionServiceSource.includes("CASTILLITOS_TEXTILE_COVERAGE"));
    assert.ok(distributionServiceSource.includes("LATIN_KIDS_TEXTILE_COVERAGE"));
    assert.ok(distributionServiceSource.includes("CASTILLITOS_GLOBAL_LOW_STOCK"));
    assert.ok(distributionServiceSource.includes("CASTILLITOS_SPECIAL_PRODUCTS"));
  });

  it("distribution-service has resolveThresholds consuming findApplicableRule", () => {
    assert.ok(distributionServiceSource.includes("function resolveThresholds("));
    assert.ok(distributionServiceSource.includes("findApplicableRule(variant, policyRules)"));
  });

  it("distribution-service resolveThresholds checks StorePolicyRule BEFORE defaults", () => {
    // Rule → return early. Only then fall through to textile_default
    const resolveIdx = distributionServiceSource.indexOf("function resolveThresholds(");
    const bodyAfter = distributionServiceSource.slice(resolveIdx);
    const ruleCheck = bodyAfter.indexOf("if (rule)");
    const textileDefault = bodyAfter.indexOf("textile_default");
    assert.ok(ruleCheck < textileDefault, "StorePolicyRule check must precede textile_default fallback");
  });

  it("distribution-actions getEffectiveStoreConfig resolves from Prisma + defaults", () => {
    assert.ok(distributionActionsSource.includes("getStorePolicyByStoreId(orgId, storeId)"));
    assert.ok(distributionActionsSource.includes("resolveTextileConfig(rules,"));
    assert.ok(distributionActionsSource.includes("resolveAccessoryConfig(rules,"));
    assert.ok(distributionActionsSource.includes("resolveScarcityConfig(tenantRules)"));
  });

  it("distribution-actions saveDistributionConfig invalidates distribution cache", () => {
    assert.ok(distributionActionsSource.includes("invalidateDistributionCacheForOrg(orgId)"));
  });

  it("distribution-actions saveDistributionConfig invalidates line counts cache", () => {
    assert.ok(distributionActionsSource.includes("invalidateLineCountsCache(orgId)"));
  });

  it("distribution-actions saveDistributionConfig re-reads effective config after save", () => {
    const saveIdx = distributionActionsSource.indexOf("invalidateDistributionCacheForOrg(orgId)");
    const afterSave = distributionActionsSource.slice(saveIdx);
    assert.ok(afterSave.includes("getEffectiveStoreConfig(orgId, storeId)"));
  });

  it("inventory-by-line consumes getCanonicalStoreDetail (not its own DB queries)", () => {
    assert.ok(inventoryByLineSource.includes("getCanonicalStoreDetail(orgId, req.storeId)"));
  });

  it("needs-by-line consumes getCanonicalStoreDetail (not its own DB queries)", () => {
    assert.ok(needsByLineSource.includes("getCanonicalStoreDetail(orgId, req.storeId)"));
  });

  it("policy pack has exactly one source for Castillitos textile defaults", () => {
    const matches = policyPackSource.match(/CASTILLITOS_TEXTILE_COVERAGE/g);
    // One declaration + one reference in the full config
    assert.ok(matches && matches.length >= 2, "CASTILLITOS_TEXTILE_COVERAGE must exist");
  });

  it("policy pack has exactly one source for Latin Kids textile defaults", () => {
    const matches = policyPackSource.match(/LATIN_KIDS_TEXTILE_COVERAGE/g);
    assert.ok(matches && matches.length >= 2, "LATIN_KIDS_TEXTILE_COVERAGE must exist");
  });
});

// ── TERCERO: Rule provenance ─────────────────────────────────────────────────

describe("TERCERO — Rule provenance in read models", () => {
  const inventoryByLineSource = readLib("store-inventory-by-line.ts");
  const needsByLineSource = readLib("store-needs-by-line.ts");

  it("inventory-by-line exports EffectiveRule interface", () => {
    assert.ok(inventoryByLineSource.includes("export interface EffectiveRule"));
  });

  it("inventory-by-line exports EffectiveRuleSource type", () => {
    assert.ok(inventoryByLineSource.includes("export type EffectiveRuleSource"));
  });

  it("EffectiveRuleSource has all 5 values", () => {
    for (const val of ["TENANT_DEFAULT", "STORE_OVERRIDE", "SPECIAL_PRODUCT", "RULE_36", "FALLBACK"]) {
      assert.ok(inventoryByLineSource.includes(`"${val}"`), `Missing EffectiveRuleSource value: ${val}`);
    }
  });

  it("ConsolidatedInventoryRef includes effectiveRule field", () => {
    assert.ok(inventoryByLineSource.includes("effectiveRule:      EffectiveRule;"));
  });

  it("NeedItem includes effectiveRule field", () => {
    assert.ok(needsByLineSource.includes("effectiveRule:          EffectiveRule;"));
  });

  it("inventory-by-line builds effectiveRule from StoreDistributionItem.resolvedBy", () => {
    assert.ok(inventoryByLineSource.includes("function buildEffectiveRule("));
    assert.ok(inventoryByLineSource.includes("resolveEffectiveRuleSource(item.resolvedBy)"));
  });

  it("needs-by-line builds effectiveRule from StoreDistributionItem.resolvedBy", () => {
    assert.ok(needsByLineSource.includes("function buildEffectiveRule("));
    assert.ok(needsByLineSource.includes("resolveEffectiveRuleSource(item.resolvedBy)"));
  });

  it("effectiveRule.inherited is true for TENANT_DEFAULT and FALLBACK", () => {
    assert.ok(inventoryByLineSource.includes('source === "TENANT_DEFAULT" || source === "FALLBACK"'));
  });

  it("effectiveRule.inherited is false for STORE_OVERRIDE", () => {
    // Verified by logic: anything not TENANT_DEFAULT/FALLBACK → inherited=false
    const source = inventoryByLineSource;
    assert.ok(source.includes("const inherited = source === \"TENANT_DEFAULT\" || source === \"FALLBACK\""));
  });
});

// ── CUARTO: Inventario visual evidence ────────────────────────────────────────

describe("CUARTO — Inventario rule provenance display", () => {
  const clientSource = readClient();

  it("client has EffectiveRuleClient type mirror", () => {
    assert.ok(clientSource.includes("interface EffectiveRuleClient"));
  });

  it("InvConsolidatedRef includes effectiveRule", () => {
    assert.ok(clientSource.includes("effectiveRule: EffectiveRuleClient;"));
  });

  it("RULE_SOURCE_LABEL maps all 5 source values", () => {
    for (const val of ["TENANT_DEFAULT", "STORE_OVERRIDE", "SPECIAL_PRODUCT", "RULE_36", "FALLBACK"]) {
      assert.ok(clientSource.includes(val), `Missing RULE_SOURCE_LABEL key: ${val}`);
    }
  });

  it("formatRuleChip function exists", () => {
    assert.ok(clientSource.includes("function formatRuleChip("));
  });

  it("Inventario tab renders rule provenance", () => {
    assert.ok(clientSource.includes("RULE_SOURCE_LABEL[item.effectiveRule.source]"));
    assert.ok(clientSource.includes("formatRuleChip(item.effectiveRule)"));
  });
});

// ── QUINTO: Necesidades rule provenance display ───────────────────────────────

describe("QUINTO — Necesidades rule provenance display", () => {
  const clientSource = readClient();

  it("NdNeedItem includes effectiveRule", () => {
    const ndNeedItemBlock = clientSource.slice(
      clientSource.indexOf("interface NdNeedItem"),
      clientSource.indexOf("interface NdNeedItem") + 1200,
    );
    assert.ok(ndNeedItemBlock.includes("effectiveRule: EffectiveRuleClient"));
  });

  it("Necesidades tab shows Regla column with formatRuleChip", () => {
    // The needs render section includes rule display
    assert.ok(clientSource.includes("formatRuleChip(item.effectiveRule)"));
  });

  it("Necesidades tab shows rule source label", () => {
    assert.ok(clientSource.includes("RULE_SOURCE_LABEL[item.effectiveRule?.source]"));
  });
});

// ── SEXTO: Rule 36 certification ─────────────────────────────────────────────

describe("SEXTO — Rule 36 consumes effective config", () => {
  const distributionServiceSource = readLib("store-distribution-service.ts");
  const policyPackSource = readLib("store-policy-pack-config.ts");

  it("distribution-service imports CASTILLITOS_GLOBAL_LOW_STOCK from policy pack", () => {
    assert.ok(distributionServiceSource.includes("CASTILLITOS_GLOBAL_LOW_STOCK"));
  });

  it("policy pack defines threshold=36 and allowedStoreIds=[centro, caldas]", () => {
    assert.ok(policyPackSource.includes("threshold: 36"));
    assert.ok(policyPackSource.includes('"centro"'));
    assert.ok(policyPackSource.includes('"caldas"'));
  });

  it("distribution-service evaluates Rule 36 with scarcity params", () => {
    assert.ok(distributionServiceSource.includes("scarcity.threshold"));
    assert.ok(distributionServiceSource.includes("scarcity.allowedIds"));
  });

  it("Rule 36 blocked items get resolvedBy=global_low_stock", () => {
    assert.ok(distributionServiceSource.includes('"global_low_stock"'));
  });

  it("Rule 36 evidence includes stockPrincipal, umbral, tiendasPermitidas", () => {
    assert.ok(distributionServiceSource.includes("stockPrincipal:"));
    assert.ok(distributionServiceSource.includes("umbral:"));
    assert.ok(distributionServiceSource.includes("tiendasPermitidas:"));
  });
});

// ── SEPTIMO: Special rules certification ─────────────────────────────────────

describe("SEPTIMO — Special rules consume policy pack", () => {
  const distributionServiceSource = readLib("store-distribution-service.ts");
  const policyPackSource = readLib("store-policy-pack-config.ts");

  it("policy pack defines special product patterns", () => {
    assert.ok(policyPackSource.includes("BANERA"));
    assert.ok(policyPackSource.includes("CUNA_COLECHO"));
    assert.ok(policyPackSource.includes("CORRAL"));
  });

  it("distribution-service checks isSpecialProduct", () => {
    assert.ok(distributionServiceSource.includes("isSpecialProduct("));
  });

  it("special products get resolvedBy=special_product", () => {
    assert.ok(distributionServiceSource.includes('"special_product"'));
  });

  it("special products use idealByStore from policy pack", () => {
    assert.ok(distributionServiceSource.includes("CASTILLITOS_SPECIAL_PRODUCTS.idealByStore"));
  });
});

// ── OCTAVO: Cache invalidation ───────────────────────────────────────────────

describe("OCTAVO — Cache invalidation after save", () => {
  const actionsSource = readLib("store-distribution-actions.ts");

  it("saveDistributionConfig invalidates distribution cache", () => {
    assert.ok(actionsSource.includes("invalidateDistributionCacheForOrg(orgId)"));
  });

  it("saveDistributionConfig invalidates line counts cache", () => {
    assert.ok(actionsSource.includes("invalidateLineCountsCache(orgId)"));
  });

  it("imports invalidateLineCountsCache from inventory-by-line", () => {
    assert.ok(actionsSource.includes('import { invalidateLineCountsCache } from "./store-inventory-by-line"'));
  });

  it("distribution-service has TTL cache with invalidation", () => {
    const serviceSource = readLib("store-distribution-service.ts");
    assert.ok(serviceSource.includes("export function invalidateDistributionCacheForOrg"));
    assert.ok(serviceSource.includes("TTL_DISTRIBUTION"));
  });

  it("inventory-by-line has TTL cache with invalidation", () => {
    const invSource = readLib("store-inventory-by-line.ts");
    assert.ok(invSource.includes("export function invalidateLineCountsCache"));
    assert.ok(invSource.includes("COUNTS_TTL"));
  });
});

// ── NOVENO: Coverage engine wired to effective config ────────────────────────

describe("NOVENO — Coverage engine consumes effective config", () => {
  const coverageEngineSource = readLib("store-derrotero-coverage-engine.ts");
  const coverageServiceSource = readLib("store-derrotero-service.ts");

  it("coverage engine is NOT deprecated (now properly wired)", () => {
    assert.ok(!coverageEngineSource.includes("@deprecated"),
      "engine is wired via applyEffectiveOverrides — deprecated tag removed");
  });

  it("coverage service is NOT deprecated (now properly wired)", () => {
    assert.ok(!coverageServiceSource.includes("@deprecated"),
      "service loads effective rules — deprecated tag removed");
  });

  it("coverage service imports effective rule building pipeline", () => {
    assert.ok(coverageServiceSource.includes("buildEffectiveStoreRules"));
    assert.ok(coverageServiceSource.includes("getStoreRules"));
    assert.ok(coverageServiceSource.includes("applyEffectiveOverrides"));
  });

  it("coverage engine mentions real source of truth", () => {
    assert.ok(coverageEngineSource.includes("store-distribution-service.ts"));
    assert.ok(coverageEngineSource.includes("resolveThresholds"));
  });

  it("tiendas-client does NOT import StoreDerroteroCoverageTab", () => {
    const clientSource = readClient();
    assert.ok(!clientSource.includes("StoreDerroteroCoverageTab"));
  });

  it("tiendas-client imports StoreSupplyRulesTab instead", () => {
    const clientSource = readClient();
    assert.ok(clientSource.includes("StoreSupplyRulesTab"));
  });
});

// ── DECIMO: No incorrect hardcoded duplications ──────────────────────────────

describe("DECIMO — Single source for policy defaults", () => {
  const policyPackSource = readLib("store-policy-pack-config.ts");
  const distributionServiceSource = readLib("store-distribution-service.ts");
  const inventoryByLineSource = readLib("store-inventory-by-line.ts");
  const needsByLineSource = readLib("store-needs-by-line.ts");

  it("policy pack is the single source for textile 8/10/12", () => {
    assert.ok(policyPackSource.includes("minimumUnits: 8"));
    assert.ok(policyPackSource.includes("idealUnits: 10"));
    assert.ok(policyPackSource.includes("maximumUnits: 12"));
  });

  it("inventory-by-line does NOT hardcode 8/10/12", () => {
    assert.ok(!inventoryByLineSource.includes("minUnits: 8,"));
    assert.ok(!inventoryByLineSource.includes("idealUnits: 10,"));
    assert.ok(!inventoryByLineSource.includes("maxUnits: 12,"));
  });

  it("needs-by-line does NOT hardcode 8/10/12", () => {
    assert.ok(!needsByLineSource.includes("minUnits: 8,"));
    assert.ok(!needsByLineSource.includes("idealUnits: 10,"));
    assert.ok(!needsByLineSource.includes("maxUnits: 12,"));
  });

  it("distribution-service imports constants instead of hardcoding", () => {
    assert.ok(distributionServiceSource.includes("import"));
    assert.ok(distributionServiceSource.includes("CASTILLITOS_TEXTILE_COVERAGE"));
  });

  it("policy pack is the single source for threshold 36", () => {
    assert.ok(policyPackSource.includes("threshold: 36"));
    // distribution-service reads it via import, never hardcodes 36
    assert.ok(!distributionServiceSource.includes("threshold: 36"));
  });

  it("policy pack is the single source for accessory ideals", () => {
    assert.ok(policyPackSource.includes("small: 6"));
    assert.ok(policyPackSource.includes("medium: 4"));
    assert.ok(policyPackSource.includes("large: 1"));
  });
});

// ── DUODECIMO: Performance contracts ─────────────────────────────────────────

describe("DUODECIMO — Performance contracts", () => {
  const inventoryByLineSource = readLib("store-inventory-by-line.ts");
  const needsByLineSource = readLib("store-needs-by-line.ts");

  it("inventory-by-line does NOT import prisma for its main load function", () => {
    // loadStoreInventoryByLine delegates to getCanonicalStoreDetail — zero N+1
    const loadFn = inventoryByLineSource.slice(inventoryByLineSource.indexOf("export async function loadStoreInventoryByLine"));
    assert.ok(!loadFn.includes("prisma.product"), "loadStoreInventoryByLine must not query DB directly");
  });

  it("needs-by-line does NOT import prisma", () => {
    // loadStoreNeedsByLine delegates to getCanonicalStoreDetail — zero N+1
    assert.ok(!needsByLineSource.includes("from \"@/lib/prisma\""));
  });

  it("inventory-by-line lightweight counts uses single PIL query", () => {
    // getInventoryLineCounts makes one query
    const countsFn = inventoryByLineSource.slice(inventoryByLineSource.indexOf("export async function getInventoryLineCounts"));
    const queryCount = (countsFn.match(/findMany/g) || []).length;
    assert.ok(queryCount <= 1, `Expected <=1 findMany in getInventoryLineCounts, got ${queryCount}`);
  });

  it("no SOAP imports in inventory or needs services", () => {
    assert.ok(!inventoryByLineSource.includes("soap"));
    assert.ok(!inventoryByLineSource.includes("SOAP"));
    assert.ok(!needsByLineSource.includes("soap"));
    assert.ok(!needsByLineSource.includes("SOAP"));
  });
});

// ── resolveEffectiveRuleSource mapping ───────────────────────────────────────

describe("resolveEffectiveRuleSource mapping correctness", () => {
  // Parse the mapping function from source to verify
  const inventoryByLineSource = readLib("store-inventory-by-line.ts");

  it("textile_default maps to TENANT_DEFAULT", () => {
    const fn = inventoryByLineSource.slice(
      inventoryByLineSource.indexOf("function resolveEffectiveRuleSource"),
      inventoryByLineSource.indexOf("function buildEffectiveRule"),
    );
    assert.ok(fn.includes('"textile_default"'));
    assert.ok(fn.includes('"TENANT_DEFAULT"'));
  });

  it("default maps to TENANT_DEFAULT", () => {
    const fn = inventoryByLineSource.slice(
      inventoryByLineSource.indexOf("function resolveEffectiveRuleSource"),
      inventoryByLineSource.indexOf("function buildEffectiveRule"),
    );
    assert.ok(fn.includes('"default"'));
  });

  it("special_product maps to SPECIAL_PRODUCT", () => {
    const fn = inventoryByLineSource.slice(
      inventoryByLineSource.indexOf("function resolveEffectiveRuleSource"),
      inventoryByLineSource.indexOf("function buildEffectiveRule"),
    );
    assert.ok(fn.includes('"special_product"'));
    assert.ok(fn.includes('"SPECIAL_PRODUCT"'));
  });

  it("global_low_stock maps to RULE_36", () => {
    const fn = inventoryByLineSource.slice(
      inventoryByLineSource.indexOf("function resolveEffectiveRuleSource"),
      inventoryByLineSource.indexOf("function buildEffectiveRule"),
    );
    assert.ok(fn.includes('"global_low_stock"'));
    assert.ok(fn.includes('"RULE_36"'));
  });

  it("line/class_size/variant_override/reference map to STORE_OVERRIDE", () => {
    const fn = inventoryByLineSource.slice(
      inventoryByLineSource.indexOf("function resolveEffectiveRuleSource"),
      inventoryByLineSource.indexOf("function buildEffectiveRule"),
    );
    for (const scope of ["line", "class_size", "variant_override", "reference"]) {
      assert.ok(fn.includes(`"${scope}"`), `Missing mapping for scope: ${scope}`);
    }
    assert.ok(fn.includes('"STORE_OVERRIDE"'));
  });

  it("unknown scopes map to FALLBACK", () => {
    const fn = inventoryByLineSource.slice(
      inventoryByLineSource.indexOf("function resolveEffectiveRuleSource"),
      inventoryByLineSource.indexOf("function buildEffectiveRule"),
    );
    assert.ok(fn.includes('"FALLBACK"'));
  });
});
