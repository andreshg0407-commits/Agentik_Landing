/**
 * scripts/_validate-castillitos-order-policy-pack-01.ts
 *
 * FASE 12 — Structural validation for CASTILLITOS-ORDER-POLICY-PACK-01.
 *
 * Run: npx tsx scripts/_validate-castillitos-order-policy-pack-01.ts
 *
 * Validates:
 *   - Order Policy Pack files exist and are complete
 *   - Configuration decoupled from evaluators
 *   - No dependencies with Tiendas/Maletas domains
 *   - Evidence contract correct
 *   - Policy types and engine exports
 */

import * as fs from "fs";
import * as path from "path";

// ── Helpers ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ${"─".repeat(60 - title.length)}`);
}

const BASE = path.resolve(__dirname, "../lib/comercial/pedidos");

// ── Validation ──────────────────────────────────────────────────────────────

function validateFileExists(): void {
  section("File Existence");

  const requiredFiles = [
    "order-decision-types.ts",
    "order-policy-pack-config.ts",
    "order-decision-engine.ts",
    "order-policy-pack.ts",
  ];

  for (const f of requiredFiles) {
    const fullPath = path.join(BASE, f);
    check(fs.existsSync(fullPath), `${f} exists`);
  }

  const testFile = path.resolve(__dirname, "_test-castillitos-order-policy-pack-01.ts");
  check(fs.existsSync(testFile), "QA test script exists");
}

function validatePolicyPackContent(): void {
  section("Policy Pack Content");

  const packContent = fs.readFileSync(path.join(BASE, "order-policy-pack.ts"), "utf-8");

  // 6 policies
  const policyIds = [
    "cop-customer-branch-v1",
    "cop-customer-credit-v1",
    "cop-auto-size-distribution-v1",
    "cop-partial-delivery-v1",
    "cop-discount-override-v1",
    "cop-order-readiness-v1",
  ];

  for (const id of policyIds) {
    check(packContent.includes(id), `Policy "${id}" defined`);
  }

  check(packContent.includes("registerPolicy"), "Uses registerPolicy from Business Policy Engine");
  check(packContent.includes("registerCastillitosOrderPolicyPack"), "Exports registerCastillitosOrderPolicyPack()");
  check(packContent.includes("getCastillitosOrderPolicies"), "Exports getCastillitosOrderPolicies()");
  check(packContent.includes('category: "ORDER"'), 'All policies use category "ORDER"');
  check(packContent.includes("CASTILLITOS_ORDER_POLICY_COUNT"), "Exports CASTILLITOS_ORDER_POLICY_COUNT");
}

function validateConfigDecoupling(): void {
  section("Configuration Decoupling");

  const configContent = fs.readFileSync(path.join(BASE, "order-policy-pack-config.ts"), "utf-8");
  const engineContent = fs.readFileSync(path.join(BASE, "order-decision-engine.ts"), "utf-8");

  // Config exports all sections
  check(configContent.includes("CustomerCreditConfig"), "Config exports CustomerCreditConfig");
  check(configContent.includes("AutoSizeDistributionConfig"), "Config exports AutoSizeDistributionConfig");
  check(configContent.includes("PartialDeliveryConfig"), "Config exports PartialDeliveryConfig");
  check(configContent.includes("DiscountOverrideConfig"), "Config exports DiscountOverrideConfig");
  check(configContent.includes("OrderReadinessConfig"), "Config exports OrderReadinessConfig");
  check(configContent.includes("OrderPolicyPackConfig"), "Config exports OrderPolicyPackConfig");
  check(configContent.includes("CASTILLITOS_ORDER_POLICY_PACK_CONFIG"), "Config exports aggregate config");

  // Engine uses config, not hardcoded values
  check(engineContent.includes("OrderPolicyPackConfig"), "Engine imports OrderPolicyPackConfig");
  check(!engineContent.includes("warningDaysPastDue: 30"), "Engine does NOT hardcode warningDaysPastDue");
  check(!engineContent.includes("criticalDaysPastDue: 60"), "Engine does NOT hardcode criticalDaysPastDue");
  check(!engineContent.includes("maxUnitsPerSize: 50"), "Engine does NOT hardcode maxUnitsPerSize");
  check(!engineContent.includes("minFulfillmentPct: 0"), "Engine does NOT hardcode minFulfillmentPct");
}

function validateDomainSeparation(): void {
  section("Domain Separation");

  const filesToCheck = [
    "order-decision-types.ts",
    "order-policy-pack-config.ts",
    "order-decision-engine.ts",
    "order-policy-pack.ts",
  ];

  for (const f of filesToCheck) {
    const content = fs.readFileSync(path.join(BASE, f), "utf-8");
    const lower = content.toLowerCase();

    // Check for tiendas/maletas/vendedores imports or references
    const hasTiendasImport = content.includes('from "@/lib/comercial/tiendas') ||
                              content.includes("from '../tiendas") ||
                              content.includes('from "../tiendas');
    check(!hasTiendasImport, `${f}: no import from tiendas domain`);

    const hasMaletasImport = content.includes('from "@/lib/comercial/maletas') ||
                              content.includes("from '../maletas") ||
                              content.includes('from "../maletas');
    check(!hasMaletasImport, `${f}: no import from maletas domain`);

    // Check for store policy references (different domain)
    const hasStorePolicyRef = content.includes("store-policy-pack") ||
                               content.includes("StorePolicyPack") ||
                               content.includes("store-decision-engine");
    check(!hasStorePolicyRef, `${f}: no reference to store policy pack`);
  }
}

function validateEvidenceContract(): void {
  section("Evidence Contract");

  const typesContent = fs.readFileSync(path.join(BASE, "order-decision-types.ts"), "utf-8");

  // Evidence item has three-question fields
  check(typesContent.includes("activationReason"), "Evidence has activationReason (Q1: why activated)");
  check(typesContent.includes("dataUsed"), "Evidence has dataUsed (Q2: what data)");
  check(typesContent.includes("recommendedAction"), "Evidence has recommendedAction (Q3a: what action)");
  check(typesContent.includes("actionRationale"), "Evidence has actionRationale (Q3b: why this action)");
  check(typesContent.includes("confidence"), "Evidence has confidence score");
  check(typesContent.includes("severity"), "Evidence has severity level");
  check(typesContent.includes("evaluatedAt"), "Evidence has evaluatedAt timestamp");

  // All result types have evidence
  const resultTypes = [
    "CustomerBranchResult",
    "CustomerCreditResult",
    "AutoSizeDistributionResult",
    "PartialDeliveryResult",
    "DiscountOverrideResult",
    "OrderReadinessResult",
  ];

  for (const rt of resultTypes) {
    check(typesContent.includes(rt), `${rt} defined in types`);
  }

  check(typesContent.includes("OrderDecisionEvaluationResult"), "Full evaluation result type defined");
  check(typesContent.includes("allEvidence"), "Full result includes allEvidence array");
}

function validatePolicyTypes(): void {
  section("Policy Types");

  const typesContent = fs.readFileSync(path.join(BASE, "order-decision-types.ts"), "utf-8");

  const expectedTypes = [
    "ORDER_CUSTOMER_BRANCH",
    "ORDER_CUSTOMER_CREDIT",
    "ORDER_AUTO_SIZE_DISTRIBUTION",
    "ORDER_PARTIAL_DELIVERY",
    "ORDER_DISCOUNT_OVERRIDE",
    "ORDER_READINESS",
  ];

  for (const t of expectedTypes) {
    check(typesContent.includes(`"${t}"`), `OrderPolicyType includes "${t}"`);
  }

  // Delivery status
  check(typesContent.includes('"COMPLETE"'), "DeliveryStatus includes COMPLETE");
  check(typesContent.includes('"PARTIAL"'), "DeliveryStatus includes PARTIAL");
  check(typesContent.includes('"BACKORDER"'), "DeliveryStatus includes BACKORDER");

  // Readiness status
  check(typesContent.includes('"READY"'), "OrderReadinessStatus includes READY");
  check(typesContent.includes('"WARNING"'), "OrderReadinessStatus includes WARNING");
  check(typesContent.includes('"BLOCKED"'), "OrderReadinessStatus includes BLOCKED");
}

function validateEngineExports(): void {
  section("Engine Exports");

  const engineContent = fs.readFileSync(path.join(BASE, "order-decision-engine.ts"), "utf-8");

  const expectedExports = [
    "evaluateCustomerBranch",
    "evaluateCustomerCredit",
    "evaluateAutoSizeDistribution",
    "evaluatePartialDelivery",
    "evaluateDiscountOverride",
    "evaluateOrderReadiness",
    "evaluateOrderPolicyPack",
  ];

  for (const fn of expectedExports) {
    check(engineContent.includes(`export function ${fn}`), `Engine exports ${fn}()`);
  }

  // No Prisma, no DB, no side effects
  check(!engineContent.includes("from '@prisma"), "Engine has no Prisma imports");
  check(!engineContent.includes('from "@prisma'), "Engine has no @prisma imports");
  check(!engineContent.includes("prisma."), "Engine has no prisma. calls");
  check(!engineContent.includes("import { db"), "Engine has no db imports");
}

function validatePureFunction(): void {
  section("Pure Function Guarantees");

  const engineContent = fs.readFileSync(path.join(BASE, "order-decision-engine.ts"), "utf-8");

  check(!engineContent.includes("fetch("), "Engine has no fetch() calls");
  check(!engineContent.includes("console.log"), "Engine has no console.log");
  check(!engineContent.includes("process.env"), "Engine has no process.env access");
  check(!engineContent.includes("Math.random"), "Engine has no Math.random (deterministic)");
  check(!engineContent.includes("async "), "Engine has no async functions");
  check(!engineContent.includes("await "), "Engine has no await calls");
}

function validateOrderContext(): void {
  section("Order Context Contract");

  const typesContent = fs.readFileSync(path.join(BASE, "order-decision-types.ts"), "utf-8");

  check(typesContent.includes("OrderPolicyContext"), "OrderPolicyContext defined");
  check(typesContent.includes("tenantId: string"), "Context has tenantId");
  check(typesContent.includes("orderId: string"), "Context has orderId");
  check(typesContent.includes("customerId: string"), "Context has customerId");
  check(typesContent.includes("lines:"), "Context has lines array");
  check(typesContent.includes("credit:"), "Context has credit info");
  check(typesContent.includes("branches:"), "Context has branches");
  check(typesContent.includes("discount:"), "Context has discount info");
  check(typesContent.includes("discountOverride:"), "Context has discountOverride");
  check(typesContent.includes("SizeInventorySnapshot"), "SizeInventorySnapshot defined for distribution input");
}

// ── Run ────────────────────────────────────────────────────────────────────

console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║  CASTILLITOS-ORDER-POLICY-PACK-01 — Structural Validation ║");
console.log("╚════════════════════════════════════════════════════════════╝");

validateFileExists();
validatePolicyPackContent();
validateConfigDecoupling();
validateDomainSeparation();
validateEvidenceContract();
validatePolicyTypes();
validateEngineExports();
validatePureFunction();
validateOrderContext();

console.log(`\n${"═".repeat(60)}`);
console.log(`  RESULT: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(60)}`);

if (failed > 0) {
  console.log("\n  ⚠ Some validations failed. Review and fix before shipping.");
  process.exit(1);
} else {
  console.log("\n  ✓ All validations passed. CASTILLITOS-ORDER-POLICY-PACK-01 structurally sound.");
  process.exit(0);
}
