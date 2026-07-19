/**
 * scripts/_validate-sales-rep-policy-pack-01.ts
 *
 * FASE 17 — Structural validation for SalesRep Policy Pack.
 * Run: npx tsx scripts/_validate-sales-rep-policy-pack-01.ts
 *
 * Sprint: SALES-REP-POLICY-PACK-01
 */

import * as fs from "fs";
import * as path from "path";

let passed = 0;
let failed = 0;

function section(title: string) {
  const pad = Math.max(0, 60 - title.length);
  console.log(`\n${"─".repeat(pad)} ${title} ${"─".repeat(pad)}`);
}

function assert(label: string, condition: boolean) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${label}`);
  }
}

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.resolve(__dirname, "..", relativePath));
}

function readFile(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

// ═══════════════════════════════════════════════════════════════════════
// VALIDATIONS
// ═══════════════════════════════════════════════════════════════════════

section("1: File Existence");
{
  const files = [
    "lib/comercial/sales-reps/sales-rep-decision-types.ts",
    "lib/comercial/sales-reps/sales-rep-policy-pack-config.ts",
    "lib/comercial/sales-reps/sales-rep-policy-pack.ts",
    "lib/comercial/sales-reps/sales-rep-decision-engine.ts",
    "lib/comercial/sales-reps/sales-rep-alerts.ts",
    "lib/comercial/sales-reps/sales-rep-read-models.ts",
    "lib/comercial/sales-reps/sales-rep-evidence.ts",
    "lib/comercial/sales-reps/index.ts",
  ];
  for (const f of files) {
    assert(`${f} exists`, fileExists(f));
  }
}

section("2: No Prisma Imports in Engine Files");
{
  const engineFiles = [
    "lib/comercial/sales-reps/sales-rep-decision-engine.ts",
    "lib/comercial/sales-reps/sales-rep-alerts.ts",
    "lib/comercial/sales-reps/sales-rep-read-models.ts",
    "lib/comercial/sales-reps/sales-rep-evidence.ts",
    "lib/comercial/sales-reps/sales-rep-decision-types.ts",
    "lib/comercial/sales-reps/sales-rep-policy-pack-config.ts",
  ];
  for (const f of engineFiles) {
    const content = readFile(f);
    assert(`${path.basename(f)}: no Prisma import`, !content.includes("from \"@prisma") && !content.includes("from '@prisma"));
    assert(`${path.basename(f)}: no prisma import`, !content.includes("lib/prisma"));
  }
}

section("3: No React/UI Imports");
{
  const allFiles = [
    "lib/comercial/sales-reps/sales-rep-decision-engine.ts",
    "lib/comercial/sales-reps/sales-rep-alerts.ts",
    "lib/comercial/sales-reps/sales-rep-read-models.ts",
    "lib/comercial/sales-reps/sales-rep-evidence.ts",
    "lib/comercial/sales-reps/sales-rep-decision-types.ts",
    "lib/comercial/sales-reps/sales-rep-policy-pack-config.ts",
    "lib/comercial/sales-reps/sales-rep-policy-pack.ts",
  ];
  for (const f of allFiles) {
    const content = readFile(f);
    assert(`${path.basename(f)}: no React import`, !content.includes("from \"react") && !content.includes("from 'react"));
    assert(`${path.basename(f)}: no Next.js import`, !content.includes("from \"next/") && !content.includes("from 'next/"));
  }
}

section("4: No Cross-Domain Imports");
{
  const engineFiles = [
    "lib/comercial/sales-reps/sales-rep-decision-engine.ts",
    "lib/comercial/sales-reps/sales-rep-alerts.ts",
    "lib/comercial/sales-reps/sales-rep-read-models.ts",
    "lib/comercial/sales-reps/sales-rep-evidence.ts",
  ];
  const forbidden = [
    "tiendas",
    "maletas/",
    "pedidos/",
    "clientes/",
    "importaciones",
    "inventario/",
    "marketing-studio",
    "copilot/",
    "finance/",
  ];
  for (const f of engineFiles) {
    const content = readFile(f);
    for (const fbd of forbidden) {
      assert(`${path.basename(f)}: no import from ${fbd}`, !content.includes(`from "${fbd}`) && !content.includes(`from "./${fbd}`) && !content.includes(`from "@/lib/${fbd}`));
    }
  }
}

section("5: Policy Pack Content");
{
  const content = readFile("lib/comercial/sales-reps/sales-rep-policy-pack.ts");
  assert("Has 7 policies", content.includes("CASTILLITOS_SALESREP_POLICY_COUNT = 7"));
  assert("Has registerCastillitosRepPolicyPack", content.includes("registerCastillitosRepPolicyPack"));
  assert("Has getCastillitosRepPolicies", content.includes("getCastillitosRepPolicies"));
  assert("Uses registerPolicy from business-policy", content.includes("registerPolicy"));
  assert("All 7 policy IDs present", [
    "srp-mallet-out-of-stock-v1",
    "srp-mallet-replacement-v1",
    "srp-overdue-receivable-v1",
    "srp-inactive-customer-v1",
    "srp-customer-priority-v1",
    "srp-mallet-status-v1",
    "srp-order-fulfillment-v1",
  ].every(id => content.includes(id)));
}

section("6: Config Decoupling");
{
  const configContent = readFile("lib/comercial/sales-reps/sales-rep-policy-pack-config.ts");
  assert("Has CASTILLITOS_SALESREP_POLICY_PACK_CONFIG", configContent.includes("CASTILLITOS_SALESREP_POLICY_PACK_CONFIG"));
  assert("Has outOfStockThreshold", configContent.includes("outOfStockThreshold"));
  assert("Has overdueDaysThreshold", configContent.includes("overdueDaysThreshold"));
  assert("Has inactivityThresholdDays", configContent.includes("inactivityThresholdDays"));
  assert("Has weights", configContent.includes("weights"));
  assert("Has todayHours freshness", configContent.includes("todayHours"));

  const engineContent = readFile("lib/comercial/sales-reps/sales-rep-decision-engine.ts");
  // The "30" in priority scoring is a tier boundary, not the overdue policy threshold.
  // Verify the actual overdue check uses config:
  assert("Engine uses config for overdue threshold (not hardcoded)", engineContent.includes("overdueDaysThreshold") && engineContent.includes("rec.maxDaysPastDue > overdueDaysThreshold"));
  assert("Engine does NOT hardcode threshold 90", !engineContent.match(/> 90[^0-9]/) && !engineContent.match(/=== 90[^0-9]/));
}

section("7: Decision Engine Exports");
{
  const content = readFile("lib/comercial/sales-reps/sales-rep-decision-engine.ts");
  const expectedExports = [
    "evaluateMalletOutOfStock",
    "evaluateMalletReplacement",
    "evaluateCustomerReceivablesAlert",
    "evaluateCustomerInactivity",
    "evaluateCustomerPriority",
    "buildSalesRepMalletState",
    "buildOrderFulfillmentState",
    "buildSalesRepDailyState",
  ];
  for (const exp of expectedExports) {
    assert(`Engine exports ${exp}`, content.includes(`export function ${exp}`));
  }
}

section("8: Alert Builder Exports");
{
  const content = readFile("lib/comercial/sales-reps/sales-rep-alerts.ts");
  const expectedExports = [
    "buildOutOfStockAlert",
    "buildReplacementAlert",
    "buildOverdueReceivableAlert",
    "buildInactiveCustomerAlert",
    "buildOrderFollowUpAlert",
    "buildDataQualityAlert",
    "buildAllAlerts",
  ];
  for (const exp of expectedExports) {
    assert(`Alerts exports ${exp}`, content.includes(`export function ${exp}`));
  }
}

section("9: Evidence Module Exports");
{
  const content = readFile("lib/comercial/sales-reps/sales-rep-evidence.ts");
  assert("Has bridgeToCommercialEvidence", content.includes("bridgeToCommercialEvidence"));
  assert("Has summarizeDailyEvidence", content.includes("summarizeDailyEvidence"));
  assert("Has validateEvidence", content.includes("validateEvidence"));
  assert("Has validateAllEvidence", content.includes("validateAllEvidence"));
}

section("10: Read Models Exports");
{
  const content = readFile("lib/comercial/sales-reps/sales-rep-read-models.ts");
  assert("Has buildMobileContract", content.includes("buildMobileContract"));
  assert("Has getMobileCapabilityCount", content.includes("getMobileCapabilityCount"));
  assert("Has 6 capability definitions", (content.match(/id: "/g) || []).length === 6);
}

section("11: Type Completeness");
{
  const types = readFile("lib/comercial/sales-reps/sales-rep-decision-types.ts");
  const expectedTypes = [
    "SalesRepPolicyType",
    "SalesRepEvidenceItem",
    "MalletOutOfStockResult",
    "MalletReplacementSuggestion",
    "OverdueReceivableResult",
    "InactiveCustomerResult",
    "CustomerPriorityResult",
    "SalesRepMalletState",
    "OrderFulfillmentState",
    "SalesRepDailyState",
    "SalesRepAlert",
    "SalesRepMobileContract",
    "SalesRepPolicyContext",
    "MalletItemInput",
    "CustomerInput",
    "ReplacementCandidateInput",
    "OrderInput",
    "MalletStateInput",
  ];
  for (const t of expectedTypes) {
    assert(`Type ${t} defined`, types.includes(t));
  }
}

section("12: Barrel Index Completeness");
{
  const barrel = readFile("lib/comercial/sales-reps/index.ts");
  assert("Re-exports from decision-types", barrel.includes("sales-rep-decision-types"));
  assert("Re-exports from policy-pack-config", barrel.includes("sales-rep-policy-pack-config"));
  assert("Re-exports from policy-pack", barrel.includes("sales-rep-policy-pack"));
  assert("Re-exports from decision-engine", barrel.includes("sales-rep-decision-engine"));
  assert("Re-exports from alerts", barrel.includes("sales-rep-alerts"));
  assert("Re-exports from read-models", barrel.includes("sales-rep-read-models"));
  assert("Re-exports from evidence", barrel.includes("sales-rep-evidence"));
}

section("13: Pure Functions — No Side Effects");
{
  const engineContent = readFile("lib/comercial/sales-reps/sales-rep-decision-engine.ts");
  assert("No fetch calls", !engineContent.includes("fetch("));
  assert("No console.log", !engineContent.includes("console.log"));
  assert("No process.env", !engineContent.includes("process.env"));
  assert("No setTimeout", !engineContent.includes("setTimeout"));
  assert("No async", !engineContent.match(/async function /));
}

section("14: Nomenclature — SalesRep Not Vendor");
{
  const files = [
    "lib/comercial/sales-reps/sales-rep-decision-types.ts",
    "lib/comercial/sales-reps/sales-rep-decision-engine.ts",
    "lib/comercial/sales-reps/sales-rep-alerts.ts",
    "lib/comercial/sales-reps/sales-rep-evidence.ts",
  ];
  for (const f of files) {
    const content = readFile(f);
    // Check that "Vendor" is not used to mean seller (VENDOR category in policies is allowed)
    const lines = content.split("\n");
    let hasVendorForSeller = false;
    for (const line of lines) {
      // Skip lines that are policy category or type definitions
      if (line.includes("VENDOR") && (line.includes("category") || line.includes("scope") || line.includes("type") || line.includes("SalesRepPolicyType") || line.includes('"VENDOR"'))) continue;
      // Flag if "Vendor" used to mean seller in variable/function names
      if (line.match(/vendor(?:Id|Name|Sales|Rep)/i) && !line.includes("VendorBag") && !line.includes("vendedor")) {
        hasVendorForSeller = true;
      }
    }
    assert(`${path.basename(f)}: no Vendor-as-seller naming`, !hasVendorForSeller);
  }
}

section("15: Sprint Header");
{
  const files = [
    "lib/comercial/sales-reps/sales-rep-decision-types.ts",
    "lib/comercial/sales-reps/sales-rep-policy-pack-config.ts",
    "lib/comercial/sales-reps/sales-rep-policy-pack.ts",
    "lib/comercial/sales-reps/sales-rep-decision-engine.ts",
    "lib/comercial/sales-reps/sales-rep-alerts.ts",
    "lib/comercial/sales-reps/sales-rep-read-models.ts",
    "lib/comercial/sales-reps/sales-rep-evidence.ts",
    "lib/comercial/sales-reps/index.ts",
  ];
  for (const f of files) {
    const content = readFile(f);
    assert(`${path.basename(f)}: has sprint header`, content.includes("SALES-REP-POLICY-PACK-01"));
  }
}

// ═══════════════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════════════

console.log(`\n${"═".repeat(60)}`);
console.log(`SALES-REP-POLICY-PACK-01 Validation: ${passed}/${passed + failed} passed`);
if (failed > 0) {
  console.log(`❌ ${failed} FAILED`);
  process.exit(1);
} else {
  console.log(`✅ ALL PASSED`);
}
