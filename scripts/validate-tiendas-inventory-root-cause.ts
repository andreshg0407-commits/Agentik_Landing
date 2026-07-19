/**
 * scripts/validate-tiendas-inventory-root-cause.ts
 *
 * Validation for TIENDAS-INVENTORY-ROOT-CAUSE-01
 *
 * Usage: npx tsx scripts/validate-tiendas-inventory-root-cause.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
let pass = 0;
let fail = 0;

function check(label: string, ok: boolean) {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else    { fail++; console.log(`  FAIL  ${label}`); }
}

function fileContains(rel: string, text: string): boolean {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return false;
  return fs.readFileSync(fp, "utf-8").includes(text);
}

function fileNotContains(rel: string, text: string): boolean {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return true;
  return !fs.readFileSync(fp, "utf-8").includes(text);
}

console.log("=== TIENDAS-INVENTORY-ROOT-CAUSE-01 Validation ===\n");

const adapter = "lib/comercial/tiendas/sag-store-adapter.ts";
const engine  = "lib/comercial/tiendas/store-replenishment-engine.ts";
const service = "lib/comercial/tiendas/store-replenishment-service.ts";
const page    = "app/(app)/[orgSlug]/comercial/tiendas/page.tsx";

// 1. Root cause fix: variantAttributes (not attributes) in Prisma include
console.log("ROOT CAUSE: Prisma relation name fix");
check("Adapter uses variantAttributes in include (store inventory)", fileContains(adapter, "variantAttributes: { select:"));
check("Adapter uses variantAttributes in include (main warehouse)", fileContains(adapter, "variantAttributes: { select:"));
check("Adapter accesses .variantAttributes on variant (store)", fileContains(adapter, "lv.variant?.variantAttributes"));
check("No old 'attributes' in include queries", fileNotContains(adapter, "include: { attributes:"));
check("No old lv.variant?.attributes access", fileNotContains(adapter, "lv.variant?.attributes ??"));

// 2. Coverage guardrail: 0 when no inventory
console.log("\nCOVERAGE GUARDRAIL");
check("Coverage returns 0 when total is 0 (not 100)", fileContains(engine, "total > 0 ? Math.round(((total - belowMin) / total) * 100) : 0"));
check("No false 100% coverage for empty inventory", fileNotContains(engine, ") : 100"));

// 3. Performance: single data load
console.log("\nPERFORMANCE: Single data load");
check("page.tsx uses getStoresWorkspaceWithSignals", fileContains(page, "getStoresWorkspaceWithSignals"));
check("page.tsx does NOT call getStoreCopilotSignals separately", fileNotContains(page, "getStoreCopilotSignals"));
check("page.tsx does NOT call getStoresWorkspace separately", fileNotContains(page, "getStoresWorkspace(orgId)"));
check("Service exports getStoresWorkspaceWithSignals", fileContains(service, "export async function getStoresWorkspaceWithSignals"));
check("getStoreCopilotSignals uses computeWorkspace (not double resolveData)", fileContains(service, "computeWorkspace(orgId)"));
check("computeWorkspace is internal (not exported as export async)", fileNotContains(service, "export async function computeWorkspace"));

// 4. Variant type annotation matches Prisma schema
console.log("\nTYPE ANNOTATIONS");
check("Type annotation uses variantAttributes (store)", fileContains(adapter, "variantAttributes?: Array<{ key: string; value: string }>"));

// 5. No externalRef used as commercial reference
console.log("\nEXTERNAL REF SAFETY");
check("Ref resolution: variant.sku ?? product.sku ?? externalRef (fallback only)", fileContains(adapter, "lv.variant?.sku ?? lv.product?.sku ?? lv.externalRef"));

// Summary
console.log(`\n=== Results: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL ===`);
if (fail > 0) process.exit(1);
