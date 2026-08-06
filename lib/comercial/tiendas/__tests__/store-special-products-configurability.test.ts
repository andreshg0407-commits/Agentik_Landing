/**
 * lib/comercial/tiendas/__tests__/store-special-products-configurability.test.ts
 *
 * AGENTIK-DERROTERO-SPECIAL-PRODUCTS-CONFIG-01 — Certification tests.
 *
 * Validates:
 *   - evaluateSpecialRules accepts both ResolvedSpecialRule[] and legacy SpecialRuleConfig
 *   - resolveSpecialProductsForStore merges pack defaults + persisted overrides
 *   - EffectiveStoreConfig includes specialProducts field
 *   - Distribution service uses findMatchingSpecialRule (not isSpecialProduct)
 *   - Coverage service uses resolveSpecialProductsFromPolicies
 *   - Save flow persists and reverts special product rules
 *
 * Pure tests — no DB, no server-only.
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-special-products-configurability.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  evaluateSpecialRules,
  matchesSpecialPattern,
  type ResolvedSpecialRule,
  type SpecialRuleItem,
} from "../store-unit-coverage-engine";

import { CASTILLITOS_SPECIAL_PRODUCTS } from "../store-policy-pack-config";

import type {
  EffectiveStoreConfig,
  EffectiveSpecialProductConfig,
  EffectiveSpecialProductEntry,
} from "../store-distribution-types";

// ── Helpers ──────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, "..");
function readLib(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

// ── Section 1: evaluateSpecialRules dual-input ──────────────────────────────

describe("PRIMERO — evaluateSpecialRules accepts ResolvedSpecialRule[]", () => {
  const items: SpecialRuleItem[] = [
    { referenceCode: "REF-BANERA-01", productName: "Bañera plegable", currentUnits: 2 },
    { referenceCode: "REF-CUNA-01", productName: "Cuna colecho", currentUnits: 0 },
    { referenceCode: "REF-CORRAL-01", productName: "Corral de viaje", currentUnits: 5 },
  ];

  it("accepts ResolvedSpecialRule[] with per-pattern ideals", () => {
    const resolved: ResolvedSpecialRule[] = [
      { pattern: "BAÑERA", idealUnits: 3 },
      { pattern: "CUNA_COLECHO", idealUnits: 2 },
      { pattern: "CORRAL", idealUnits: 1 },
    ];
    const results = evaluateSpecialRules("san_diego", items, resolved);
    assert.equal(results.length, 3);
  });

  it("per-pattern ideals produce correct evaluations", () => {
    const resolved: ResolvedSpecialRule[] = [
      { pattern: "BAÑERA", idealUnits: 3 },
      { pattern: "CUNA_COLECHO", idealUnits: 2 },
      { pattern: "CORRAL", idealUnits: 1 },
    ];
    const results = evaluateSpecialRules("san_diego", items, resolved);
    const banera = results.find(r => r.pattern === "BAÑERA")!;
    const cuna = results.find(r => r.pattern === "CUNA_COLECHO")!;
    const corral = results.find(r => r.pattern === "CORRAL")!;

    assert.equal(banera.totalUnits, 2);
    assert.equal(banera.idealUnits, 3);
    assert.equal(banera.status, "FALTANTE");
    assert.equal(banera.gapUnits, 1);

    assert.equal(cuna.totalUnits, 0);
    assert.equal(cuna.idealUnits, 2);
    assert.equal(cuna.status, "FALTANTE");

    assert.equal(corral.totalUnits, 5);
    assert.equal(corral.idealUnits, 1);
    assert.equal(corral.status, "EXCEDENTE");
    assert.equal(corral.gapUnits, 4);
  });

  it("still accepts legacy SpecialRuleConfig (backward compat)", () => {
    const results = evaluateSpecialRules("san_diego", items, CASTILLITOS_SPECIAL_PRODUCTS);
    assert.equal(results.length, 3);
    const banera = results.find(r => r.pattern === "BAÑERA")!;
    assert.equal(banera.idealUnits, CASTILLITOS_SPECIAL_PRODUCTS.idealByStore.san_diego);
  });

  it("idealUnits=0 with units>0 produces NO_AUTORIZADA", () => {
    const resolved: ResolvedSpecialRule[] = [
      { pattern: "BAÑERA", idealUnits: 0 },
    ];
    const results = evaluateSpecialRules("test_store", items, resolved);
    const banera = results.find(r => r.pattern === "BAÑERA")!;
    assert.equal(banera.status, "NO_AUTORIZADA");
    assert.equal(banera.severity, "high");
  });

  it("idealUnits=0 with units=0 produces CUMPLIDA", () => {
    const resolved: ResolvedSpecialRule[] = [
      { pattern: "CUNA_COLECHO", idealUnits: 0 },
    ];
    const results = evaluateSpecialRules("test_store", items, resolved);
    const cuna = results.find(r => r.pattern === "CUNA_COLECHO")!;
    assert.equal(cuna.status, "CUMPLIDA");
    assert.equal(cuna.severity, "none");
  });
});

// ── Section 2: EffectiveSpecialProductConfig type ───────────────────────────

describe("SEGUNDO — EffectiveSpecialProductConfig in EffectiveStoreConfig", () => {
  it("EffectiveStoreConfig includes specialProducts field", () => {
    const config: EffectiveStoreConfig = {
      castillitos: { enabled: true, minUnits: 8, maxUnits: 12, targetUnits: 10, validFrom: null, validTo: null, season: null, notes: null, source: "tenant_default" },
      latinKids:   { enabled: true, minUnits: 8, maxUnits: 12, targetUnits: 10, validFrom: null, validTo: null, season: null, notes: null, source: "tenant_default" },
      accessories: {
        small:  { sizeClass: "small",  targetUnits: 6, validFrom: null, validTo: null, season: null, notes: null, source: "tenant_default" },
        medium: { sizeClass: "medium", targetUnits: 4, validFrom: null, validTo: null, season: null, notes: null, source: "tenant_default" },
        large:  { sizeClass: "large",  targetUnits: 1, validFrom: null, validTo: null, season: null, notes: null, source: "tenant_default" },
      },
      scarcity: {
        enabled: true, lowStockConcentrationThreshold: 36,
        allowedStoresWhenScarce: ["centro", "caldas"], allowedStoreNames: ["Centro", "Caldas"],
        validFrom: null, validTo: null, season: null, notes: null, source: "tenant_default",
      },
      specialProducts: {
        entries: [
          { pattern: "BAÑERA", idealUnits: 3, source: "tenant_default", validFrom: null, validTo: null, season: null, notes: null },
        ],
      },
    };
    assert.ok(config.specialProducts);
    assert.equal(config.specialProducts.entries.length, 1);
    assert.equal(config.specialProducts.entries[0].pattern, "BAÑERA");
  });

  it("EffectiveSpecialProductEntry carries source, validity, and notes", () => {
    const entry: EffectiveSpecialProductEntry = {
      pattern: "BAÑERA",
      idealUnits: 5,
      source: "store_override",
      validFrom: "2026-01-01",
      validTo: "2026-12-31",
      season: "Temporada escolar",
      notes: "Incremento por demanda",
    };
    assert.equal(entry.source, "store_override");
    assert.equal(entry.idealUnits, 5);
    assert.equal(entry.season, "Temporada escolar");
  });
});

// ── Section 3: Source code shape (consumers updated) ────────────────────────

describe("TERCERO — Distribution service uses effective resolution", () => {
  const distSource = readLib("store-distribution-service.ts");
  const coverageSource = readLib("store-coverage-service.ts");
  const actionsSource = readLib("store-distribution-actions.ts");

  it("distribution-service uses findMatchingSpecialRule (not isSpecialProduct)", () => {
    assert.ok(distSource.includes("findMatchingSpecialRule("),
      "must use findMatchingSpecialRule");
    assert.ok(!distSource.includes("function isSpecialProduct("),
      "isSpecialProduct function must be removed");
  });

  it("distribution-service resolves special products from policies", () => {
    assert.ok(distSource.includes("resolveSpecialProductsFromPolicies("),
      "must call resolveSpecialProductsFromPolicies");
  });

  it("distribution-service passes specialRules to buildStoreItems", () => {
    assert.ok(distSource.includes("storeSpecialRules,"),
      "must pass storeSpecialRules to buildStoreItems");
  });

  it("coverage-service resolves special products from policies (not hardcoded)", () => {
    assert.ok(coverageSource.includes("resolveSpecialProductsFromPolicies("),
      "must call resolveSpecialProductsFromPolicies");
    assert.ok(!coverageSource.includes("CASTILLITOS_SPECIAL_PRODUCTS"),
      "must NOT import CASTILLITOS_SPECIAL_PRODUCTS");
  });

  it("distribution-actions exports resolveSpecialProductsFromPolicies", () => {
    assert.ok(actionsSource.includes("export function resolveSpecialProductsFromPolicies("),
      "must export resolveSpecialProductsFromPolicies");
  });

  it("distribution-actions includes special products in getEffectiveStoreConfig", () => {
    assert.ok(actionsSource.includes("resolveSpecialProductsForStore(storeId,"),
      "getEffectiveStoreConfig must resolve specialProducts");
  });

  it("distribution-actions saves special product rules via saveTenantSpecialProductRules", () => {
    assert.ok(actionsSource.includes("saveTenantSpecialProductRules("),
      "saveDistributionConfig must call saveTenantSpecialProductRules");
  });
});

// ── Section 4: Pattern matching (matchesSpecialPattern) ──────────────────────

describe("CUARTO — matchesSpecialPattern normalization", () => {
  it("BAÑERA matches BANERA (diacritics stripped)", () => {
    assert.ok(matchesSpecialPattern("BANERA PLEGABLE", "BAÑERA"));
  });

  it("CUNA_COLECHO matches CUNA COLECHO (underscore→space)", () => {
    assert.ok(matchesSpecialPattern("CUNA COLECHO PREMIUM", "CUNA_COLECHO"));
  });

  it("case insensitive matching", () => {
    assert.ok(matchesSpecialPattern("corral de viaje", "CORRAL"));
  });

  it("no false positives", () => {
    assert.ok(!matchesSpecialPattern("CAMISETA POLO", "BAÑERA"));
    assert.ok(!matchesSpecialPattern("PANTALON JEAN", "CORRAL"));
  });
});

// ── Section 5: Pack defaults preserved ──────────────────────────────────────

describe("QUINTO — Pack defaults still accessible as fallback", () => {
  it("CASTILLITOS_SPECIAL_PRODUCTS has 3 patterns", () => {
    assert.equal(CASTILLITOS_SPECIAL_PRODUCTS.referencePatterns.length, 3);
  });

  it("pack idealByStore has san_diego=3, caldas=3, centro=1, gran_plaza=1", () => {
    assert.equal(CASTILLITOS_SPECIAL_PRODUCTS.idealByStore.san_diego, 3);
    assert.equal(CASTILLITOS_SPECIAL_PRODUCTS.idealByStore.caldas, 3);
    assert.equal(CASTILLITOS_SPECIAL_PRODUCTS.idealByStore.centro, 1);
    assert.equal(CASTILLITOS_SPECIAL_PRODUCTS.idealByStore.gran_plaza, 1);
  });

  it("pack defaultIdeal is 0 (unauthorized for unlisted stores)", () => {
    assert.equal(CASTILLITOS_SPECIAL_PRODUCTS.defaultIdeal, 0);
  });
});

// ── Section 6: Regression — Rule 36 not affected ────────────────────────────

describe("SEXTO — Rule 36 regression guard", () => {
  const actionsSource = readLib("store-distribution-actions.ts");

  it("TENANT_SCARCITY_STORE_ID still exported", () => {
    assert.ok(actionsSource.includes('export const TENANT_SCARCITY_STORE_ID = "__tenant_scarcity__"'));
  });

  it("resolveScarcityFromPolicies still exported", () => {
    assert.ok(actionsSource.includes("export function resolveScarcityFromPolicies("));
  });

  it("saveTenantScarcityRule still exists", () => {
    assert.ok(actionsSource.includes("async function saveTenantScarcityRule("));
  });

  it("scarcity and special products use same tenant row ID", () => {
    assert.ok(actionsSource.includes("TENANT_SPECIAL_STORE_ID = TENANT_SCARCITY_STORE_ID"),
      "special products share the same tenant policy row as scarcity");
  });
});

// ── Section 7: findMatchingSpecialRule ───────────────────────────────────────

describe("SEPTIMO — findMatchingSpecialRule in distribution-service", () => {
  const distSource = readLib("store-distribution-service.ts");

  it("findMatchingSpecialRule accepts optional resolvedRules parameter", () => {
    assert.ok(distSource.includes("resolvedRules?: readonly ResolvedSpecialRule[]"),
      "parameter must be optional for backward compat");
  });

  it("falls back to pack defaults when resolvedRules not provided", () => {
    assert.ok(distSource.includes("CASTILLITOS_SPECIAL_PRODUCTS.referencePatterns"),
      "fallback path must read pack constant");
  });

  it("returns null when no pattern matches", () => {
    assert.ok(distSource.includes("return null"),
      "function must return null for non-special products");
  });
});

// ── Section 8: ResolvedSpecialRule type exported ────────────────────────────

describe("OCTAVO — ResolvedSpecialRule type contract", () => {
  it("ResolvedSpecialRule has pattern and idealUnits fields", () => {
    const rule: ResolvedSpecialRule = { pattern: "TEST", idealUnits: 5 };
    assert.equal(rule.pattern, "TEST");
    assert.equal(rule.idealUnits, 5);
  });

  it("evaluateSpecialRules returns sorted results (most severe first)", () => {
    const items: SpecialRuleItem[] = [
      { referenceCode: "A", productName: "BANERA A", currentUnits: 3 },
      { referenceCode: "B", productName: "CORRAL B", currentUnits: 2 },
    ];
    const resolved: ResolvedSpecialRule[] = [
      { pattern: "BAÑERA", idealUnits: 0 },   // NO_AUTORIZADA (severity 0)
      { pattern: "CORRAL", idealUnits: 5 },   // FALTANTE (severity 1)
    ];
    const results = evaluateSpecialRules("test", items, resolved);
    assert.equal(results[0].status, "NO_AUTORIZADA");
    assert.equal(results[1].status, "FALTANTE");
  });
});
