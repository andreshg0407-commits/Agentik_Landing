/**
 * scripts/_validate-order-assistant-01.ts
 *
 * Structural validation for ORDER-ASSISTANT-01.
 *
 * Run: npx tsx scripts/_validate-order-assistant-01.ts
 *
 * Sprint: ORDER-ASSISTANT-01
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
  const pad = Math.max(0, 60 - title.length);
  console.log(`\n── ${title} ${"─".repeat(pad)}`);
}

const BASE = path.resolve(__dirname, "../lib/comercial/pedidos");

// ── Validations ─────────────────────────────────────────────────────────────

function validateFileExists(): void {
  section("File Existence");

  const requiredFiles = [
    "order-assistant-types.ts",
    "order-assistant-engine.ts",
    "order-assistant-service.ts",
  ];

  for (const f of requiredFiles) {
    check(fs.existsSync(path.join(BASE, f)), `${f} exists`);
  }

  check(
    fs.existsSync(path.resolve(__dirname, "_test-order-assistant-01.ts")),
    "QA test script exists",
  );
}

function validateTypesContract(): void {
  section("Types Contract");

  const content = fs.readFileSync(path.join(BASE, "order-assistant-types.ts"), "utf-8");

  check(content.includes("OrderAssistantResult"), "OrderAssistantResult defined");
  check(content.includes("OrderAssistantCustomer"), "OrderAssistantCustomer defined");
  check(content.includes("OrderAssistantCredit"), "OrderAssistantCredit defined");
  check(content.includes("OrderAssistantBranches"), "OrderAssistantBranches defined");
  check(content.includes("OrderAssistantRecentOrder"), "OrderAssistantRecentOrder defined");
  check(content.includes("OrderAssistantAutoSurtido"), "OrderAssistantAutoSurtido defined");
  check(content.includes("OrderAssistantAlert"), "OrderAssistantAlert defined");
  check(content.includes("OrderAssistantWarning"), "OrderAssistantWarning defined");
  check(content.includes("OrderAssistantAction"), "OrderAssistantAction defined");
  check(content.includes("OrderAssistantStatus"), "OrderAssistantStatus defined");
  check(content.includes("OrderAssistantInput"), "OrderAssistantInput defined");

  // Result fields
  check(content.includes("customer:"), "Result has customer");
  check(content.includes("branches:"), "Result has branches");
  check(content.includes("credit:"), "Result has credit");
  check(content.includes("readiness:"), "Result has readiness");
  check(content.includes("alerts:"), "Result has alerts");
  check(content.includes("warnings:"), "Result has warnings");
  check(content.includes("recommendedActions:"), "Result has recommendedActions");
  check(content.includes("confidence:"), "Result has confidence");
  check(content.includes("evidence:"), "Result has evidence");
  check(content.includes("recentOrders:"), "Result has recentOrders");
  check(content.includes("autoSurtido:"), "Result has autoSurtido");
  check(content.includes("policyResults:"), "Result has raw policyResults");
}

function validateEngineIsPure(): void {
  section("Engine: Pure Function Guarantees");

  const content = fs.readFileSync(path.join(BASE, "order-assistant-engine.ts"), "utf-8");

  check(content.includes("assembleOrderAssistant"), "assembleOrderAssistant exported");
  check(content.includes("PreOrderData"), "PreOrderData interface exported");
  check(!content.includes("import \"server-only\""), "Engine NOT server-only (pure)");
  check(!content.includes("from '@prisma"), "No Prisma imports");
  check(!content.includes('from "@prisma'), "No @prisma imports");
  check(!content.includes("prisma."), "No prisma calls");
  check(!content.includes("fetch("), "No fetch calls");
  check(!content.includes("console.log"), "No console.log");
  check(!content.includes("process.env"), "No process.env");
  check(!content.includes("async "), "No async functions");
  check(!content.includes("await "), "No await calls");
}

function validateEngineConsumesExisting(): void {
  section("Engine: Consumes Existing Infrastructure");

  const content = fs.readFileSync(path.join(BASE, "order-assistant-engine.ts"), "utf-8");

  check(content.includes("evaluateCustomerBranch"), "Consumes evaluateCustomerBranch");
  check(content.includes("evaluateCustomerCredit"), "Consumes evaluateCustomerCredit");
  check(content.includes('from "./order-decision-engine"'), "Imports from order-decision-engine");
  check(content.includes("OrderPolicyPackConfig"), "Uses OrderPolicyPackConfig");
}

function validateServiceIsServerOnly(): void {
  section("Service: Server-Only Loader");

  const content = fs.readFileSync(path.join(BASE, "order-assistant-service.ts"), "utf-8");

  check(content.includes('import "server-only"'), "Service is server-only");
  check(content.includes("loadCliente360"), "Consumes loadCliente360");
  check(content.includes("listOrders"), "Consumes listOrders");
  check(content.includes("CASTILLITOS_ORDER_POLICY_PACK_CONFIG"), "Uses policy pack config");
  check(content.includes("assembleOrderAssistant"), "Delegates to pure engine");
  check(content.includes("loadOrderAssistant"), "Exports loadOrderAssistant");
}

function validateNoNewEngines(): void {
  section("No New Engines / No New Policies");

  const engineContent = fs.readFileSync(path.join(BASE, "order-assistant-engine.ts"), "utf-8");
  const serviceContent = fs.readFileSync(path.join(BASE, "order-assistant-service.ts"), "utf-8");
  const typesContent = fs.readFileSync(path.join(BASE, "order-assistant-types.ts"), "utf-8");

  check(!engineContent.includes("registerPolicy"), "Engine does NOT register policies");
  check(!serviceContent.includes("registerPolicy"), "Service does NOT register policies");
  check(!engineContent.includes("BusinessPolicy"), "Engine does NOT define BusinessPolicy");
  check(!typesContent.includes("BusinessPolicy"), "Types does NOT reference BusinessPolicy");
}

function validateDomainSeparation(): void {
  section("Domain Separation");

  const files = [
    "order-assistant-types.ts",
    "order-assistant-engine.ts",
    "order-assistant-service.ts",
  ];

  for (const f of files) {
    const content = fs.readFileSync(path.join(BASE, f), "utf-8");

    check(!content.includes('from "@/lib/comercial/tiendas'), `${f}: no tiendas import`);
    check(!content.includes('from "@/lib/comercial/maletas'), `${f}: no maletas import`);
    check(!content.includes("store-policy"), `${f}: no store-policy reference`);
    check(!content.includes("store-decision"), `${f}: no store-decision reference`);
  }
}

function validateReadOnlyContract(): void {
  section("Read-Only Contract");

  const engineContent = fs.readFileSync(path.join(BASE, "order-assistant-engine.ts"), "utf-8");
  const serviceContent = fs.readFileSync(path.join(BASE, "order-assistant-service.ts"), "utf-8");

  check(!engineContent.includes("createOrder"), "Engine: no createOrder");
  check(!engineContent.includes("updateOrder"), "Engine: no updateOrder");
  check(!engineContent.includes("submitOrder"), "Engine: no submitOrder");
  check(!engineContent.includes("syncSag"), "Engine: no SAG sync");

  check(!serviceContent.includes("createOrder"), "Service: no createOrder");
  check(!serviceContent.includes("updateOrder"), "Service: no updateOrder");
  check(!serviceContent.includes("submitOrder"), "Service: no submitOrder");
  check(!serviceContent.includes("syncSag"), "Service: no SAG sync");
}

// ── Run ────────────────────────────────────────────────────────────────────

console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║  ORDER-ASSISTANT-01 — Structural Validation               ║");
console.log("╚════════════════════════════════════════════════════════════╝");

validateFileExists();
validateTypesContract();
validateEngineIsPure();
validateEngineConsumesExisting();
validateServiceIsServerOnly();
validateNoNewEngines();
validateDomainSeparation();
validateReadOnlyContract();

console.log(`\n${"═".repeat(60)}`);
console.log(`  RESULT: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(60)}`);

if (failed > 0) {
  console.log("\n  ⚠ Some validations failed.");
  process.exit(1);
} else {
  console.log("\n  ✓ All validations passed. ORDER-ASSISTANT-01 structurally sound.");
  process.exit(0);
}
