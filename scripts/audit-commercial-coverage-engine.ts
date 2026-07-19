/**
 * scripts/audit-commercial-coverage-engine.ts
 *
 * Executes test cases against the Commercial Coverage Rules Engine
 * and prints structured results.
 *
 * Usage: npx tsx scripts/audit-commercial-coverage-engine.ts
 *
 * Sprint: COMMERCIAL-COVERAGE-RULES-ENGINE-01
 */

import { evaluateCoverage } from "../lib/comercial/rules/coverage";
import type { CommercialCoverageInput, CommercialCoverageResult } from "../lib/comercial/rules/coverage";
import type { StorePolicyRule } from "../lib/comercial/tiendas/store-policy-types";

// ── Test fixtures ───────────────────────────────────────────────────────────

function makeRule(overrides: Partial<StorePolicyRule>): StorePolicyRule {
  return {
    id: "r-" + Math.random().toString(36).slice(2, 8),
    storeId: "store-01",
    scope: "line_subgroup",
    productClass: "textile",
    minQty: 2,
    idealQty: 4,
    maxQty: 6,
    allowReplacement: false,
    allowProductionSignal: false,
    allowMainWarehouseTransfer: true,
    priority: 10,
    active: true,
    ...overrides,
  };
}

function makeInput(overrides: Partial<CommercialCoverageInput>): CommercialCoverageInput {
  return {
    tenantId: "castillitos",
    organizationId: "org-01",
    storeId: "store-01",
    storeName: "Tienda Centro",
    referenceCode: "REF-001",
    productName: "Producto Test",
    productClass: "textile",
    businessLine: "castillitos",
    currentUnits: 2,
    activeRules: [],
    ...overrides,
  };
}

// ── Test cases ──────────────────────────────────────────────────────────────

interface TestCase {
  name: string;
  input: CommercialCoverageInput;
}

const textileRule = makeRule({
  scope: "line_subgroup",
  productClass: "textile",
  line: "castillitos",
  subgroup: "pijama ll",
  minQty: 2,
  idealQty: 4,
  maxQty: 6,
  coverageStrategy: "SUBGROUP",
});

const sizeRuleSmall = makeRule({
  scope: "class_size",
  productClass: "accessory",
  sizeClass: "small",
  minQty: 6,
  idealQty: 8,
  maxQty: 10,
  coverageStrategy: "SIZE",
});

const sizeRuleMedium = makeRule({
  scope: "class_size",
  productClass: "accessory",
  sizeClass: "medium",
  minQty: 4,
  idealQty: 6,
  maxQty: 8,
  coverageStrategy: "SIZE",
});

const sizeRuleLarge = makeRule({
  scope: "class_size",
  productClass: "accessory",
  sizeClass: "large",
  minQty: 1,
  idealQty: 2,
  maxQty: 3,
  coverageStrategy: "SIZE",
});

const allRules = [textileRule, sizeRuleSmall, sizeRuleMedium, sizeRuleLarge];

const cases: TestCase[] = [
  {
    name: "Textil por subgrupo — bajo minimo",
    input: makeInput({
      businessLine: "castillitos",
      productClass: "textile",
      subgroup: "pijama ll",
      currentUnits: 1,
      sourceAvailableUnits: 10,
      activeRules: allRules,
    }),
  },
  {
    name: "Textil por subgrupo — en ideal",
    input: makeInput({
      businessLine: "castillitos",
      productClass: "textile",
      subgroup: "pijama ll",
      currentUnits: 4,
      sourceAvailableUnits: 10,
      activeRules: allRules,
    }),
  },
  {
    name: "Textil por subgrupo — sobre maximo",
    input: makeInput({
      businessLine: "castillitos",
      productClass: "textile",
      subgroup: "pijama ll",
      currentUnits: 8,
      sourceAvailableUnits: 10,
      activeRules: allRules,
    }),
  },
  {
    name: "Textil sin subgrupo — datos insuficientes",
    input: makeInput({
      businessLine: "castillitos",
      productClass: "textile",
      subgroup: undefined,
      currentUnits: 2,
      activeRules: allRules,
    }),
  },
  {
    name: "Accesorios / Importacion pequeno — bajo minimo",
    input: makeInput({
      businessLine: "accesorios_importacion",
      productClass: "accessory",
      sizeClass: "small",
      currentUnits: 3,
      sourceAvailableUnits: 20,
      activeRules: allRules,
    }),
  },
  {
    name: "Accesorios / Importacion mediano — en ideal",
    input: makeInput({
      businessLine: "accesorios_importacion",
      productClass: "accessory",
      sizeClass: "medium",
      currentUnits: 6,
      sourceAvailableUnits: 10,
      activeRules: allRules,
    }),
  },
  {
    name: "Accesorios / Importacion grande — sobre maximo",
    input: makeInput({
      businessLine: "accesorios_importacion",
      productClass: "accessory",
      sizeClass: "large",
      currentUnits: 5,
      sourceAvailableUnits: 10,
      activeRules: allRules,
    }),
  },
  {
    name: "Accesorios sin tamano — datos insuficientes",
    input: makeInput({
      businessLine: "accesorios_importacion",
      productClass: "accessory",
      sizeClass: undefined,
      currentUnits: 2,
      activeRules: allRules,
    }),
  },
  {
    name: "Sin regla aplicable",
    input: makeInput({
      businessLine: "castillitos",
      productClass: "textile",
      subgroup: "desconocido",
      currentUnits: 1,
      activeRules: allRules,
    }),
  },
  {
    name: "Disponibilidad insuficiente en origen",
    input: makeInput({
      businessLine: "accesorios_importacion",
      productClass: "accessory",
      sizeClass: "small",
      currentUnits: 2,
      sourceAvailableUnits: 3,
      activeRules: allRules,
    }),
  },
  {
    name: "Alias 'accesorios' resuelve a SIZE",
    input: makeInput({
      businessLine: "accesorios",
      productClass: "accessory",
      sizeClass: "medium",
      currentUnits: 2,
      sourceAvailableUnits: 10,
      activeRules: allRules,
    }),
  },
  {
    name: "Alias 'importacion' resuelve a SIZE",
    input: makeInput({
      businessLine: "importacion",
      productClass: "accessory",
      sizeClass: "large",
      currentUnits: 0,
      sourceAvailableUnits: 5,
      activeRules: allRules,
    }),
  },
];

// ── Run & print ─────────────────────────────────────────────────────────────

console.log("\n=== Commercial Coverage Rules Engine — Audit ===\n");

let passCount = 0;

for (const tc of cases) {
  const result = evaluateCoverage(tc.input);
  const { evaluation, suggestion, explanation, dataQuality } = result;

  console.log(`── ${tc.name} ──`);
  console.log(`  Strategy:       ${evaluation.strategy}`);
  console.log(`  State:          ${evaluation.state}`);
  console.log(`  Rule matched:   ${evaluation.ruleMatch.selectedRule ? "YES" : "NO"}`);
  if (evaluation.ruleMatch.selectedRule) {
    console.log(`  Rule scope:     ${evaluation.ruleMatch.selectedRule.scope}`);
    console.log(`  Rule reason:    ${evaluation.ruleMatch.selectionReason}`);
  }
  console.log(`  Current:        ${evaluation.currentCoverage}`);
  console.log(`  Min/Ideal/Max:  ${evaluation.minQty ?? "—"} / ${evaluation.idealQty ?? "—"} / ${evaluation.maxQty ?? "—"}`);
  console.log(`  Gap to min:     ${evaluation.gapToMin}`);
  console.log(`  Gap to ideal:   ${evaluation.gapToIdeal}`);
  console.log(`  Action:         ${suggestion.action}`);
  console.log(`  Suggested qty:  ${suggestion.finalSuggestedQty} (raw: ${suggestion.rawSuggestedQty})`);
  if (suggestion.sourceConstrained) {
    console.log(`  Constrained:    YES (unmet: ${suggestion.unmetQty})`);
  }
  console.log(`  Confidence:     ${(dataQuality.confidence * 100).toFixed(0)}% (${dataQuality.confidenceLevel})`);
  console.log(`  Explanation:    ${explanation.summary}`);
  console.log("");

  // Basic sanity checks
  const sane =
    suggestion.finalSuggestedQty >= 0 &&
    suggestion.rawSuggestedQty >= 0 &&
    dataQuality.confidence >= 0 &&
    dataQuality.confidence <= 1 &&
    explanation.summary.length > 0;

  if (sane) passCount++;
}

console.log(`=== Audit complete: ${passCount}/${cases.length} cases passed sanity checks ===\n`);
if (passCount < cases.length) process.exit(1);
