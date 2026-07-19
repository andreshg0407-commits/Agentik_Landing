/**
 * scripts/audit-pedidos-vendedor-resolution.ts
 *
 * PEDIDOS-VENDEDOR-RESOLUTION-01
 *
 * Validates seller resolution infrastructure and prints audit summary.
 *
 * Usage:
 *   npx tsx scripts/audit-pedidos-vendedor-resolution.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
let pass = 0;
let fail = 0;

function check(label: string, ok: boolean) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
}

function fileContains(rel: string, needle: string): boolean {
  const fullPath = path.join(ROOT, rel);
  if (!fs.existsSync(fullPath)) return false;
  return fs.readFileSync(fullPath, "utf-8").includes(needle);
}

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

console.log("=== PEDIDOS VENDEDOR RESOLUTION AUDIT ===\n");

// ── 1. Service file ─────────────────────────────────────────────────────────
const svc = "lib/comercial/pedidos/seller-resolution-service.ts";
console.log("[1] Seller resolution service");
check("file exists", fileExists(svc));
check("exports resolveSellerForSagOrder", fileContains(svc, "export async function resolveSellerForSagOrder"));
check("exports resolveSellersBatch", fileContains(svc, "export async function resolveSellersBatch"));
check("exports generateSellerResolutionReport", fileContains(svc, "export async function generateSellerResolutionReport"));
check("exports ResolvedSeller type", fileContains(svc, "export interface ResolvedSeller"));
check("exports SellerResolutionReport type", fileContains(svc, "export interface SellerResolutionReport"));
check("uses ka_nl_tercero_vend from SAG", fileContains(svc, "ka_nl_tercero_vend"));
check("uses TERCEROS for name resolution", fileContains(svc, "sc_nombre"));
check("uses CRM fallback", fileContains(svc, "crm_quote_history"));
check("confidence levels: high/medium/low/unknown", fileContains(svc, '"high" | "medium" | "low" | "unknown"'));
check("server-only guard", fileContains(svc, 'import "server-only"'));
check("sprint tag", fileContains(svc, "PEDIDOS-VENDEDOR-RESOLUTION-01"));

// ── 2. OrderDraft type updated ───────────────────────────────────────────────
const types = "lib/comercial/pedidos/order-types.ts";
console.log("\n[2] OrderDraft type");
check("sellerSource field added", fileContains(types, "sellerSource?:"));
check("sellerConfidence field added", fileContains(types, "sellerConfidence?:"));
check("sprint tag", fileContains(types, "PEDIDOS-VENDEDOR-RESOLUTION-01"));

// ── 3. Order service wiring ──────────────────────────────────────────────────
const orderSvc = "lib/comercial/pedidos/order-service.ts";
console.log("\n[3] Order service wiring");
check("imports resolveSellerForSagOrder", fileContains(orderSvc, 'import { resolveSellerForSagOrder }'));
check("calls resolveSellerForSagOrder in getOrder", fileContains(orderSvc, "resolveSellerForSagOrder(orgId"));
check("sets sellerSource on draft", fileContains(orderSvc, "draft.sellerSource"));
check("sets sellerConfidence on draft", fileContains(orderSvc, "draft.sellerConfidence"));
check("only shows high/medium confidence", fileContains(orderSvc, '"high" || resolved.confidence === "medium"'));
check("sprint tag", fileContains(orderSvc, "VENDEDOR-RESOLUTION-01"));

// ── 4. API route ─────────────────────────────────────────────────────────────
const route = "app/api/orgs/[orgSlug]/comercial/pedidos/history/route.ts";
console.log("\n[4] API route");
check("imports generateSellerResolutionReport", fileContains(route, "generateSellerResolutionReport"));
check("seller_resolution action", fileContains(route, '"seller_resolution"'));
check("sprint tag", fileContains(route, "VENDEDOR-RESOLUTION-01"));

// ── 5. UI integration ───────────────────────────────────────────────────────
const client = "app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx";
console.log("\n[5] UI integration");
check("shows sellerSource in drawer", fileContains(client, "order.sellerSource"));
check("shows sellerConfidence in drawer", fileContains(client, "order.sellerConfidence"));
check("vendedor no identificado message", fileContains(client, "Vendedor no identificado en SAG"));
check("pedidos sin vendedor note", fileContains(client, "Pedidos sin vendedor identificado"));
check("SAG source label", fileContains(client, '"sag_movimientos"'));
check("CRM source label", fileContains(client, '"CRM"'));
check("confidence label alta/media", fileContains(client, '"alta"'));

// ── 6. Data source evidence ──────────────────────────────────────────────────
console.log("\n[6] Data source evidence (from audit)");
console.log("  INFO  SAG MOVIMIENTOS.ka_nl_tercero_vend: EXISTS (18 distinct vendors)");
console.log("  INFO  Coverage: 47.3% global, 92% for 2026, 0% for 2023-2025");
console.log("  INFO  Resolution: TERCEROS.sc_nombre → real vendor names");
console.log("  INFO  CRM match: 8/9 sellers match SAG vendors");
console.log("  INFO  CustomerProfile.sellerName: 46/33k (not useful)");
console.log("  INFO  VendorCommercialBag: 0 bags (not available)");
console.log("  INFO  Cartera/Receivables: no seller field");

// ── Summary ─────────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\n=== VALIDATION COMPLETE: ${pass}/${total} PASS, ${fail} FAIL ===`);
console.log("\n=== RECOMMENDATION FOR MEETING ===");
console.log("DECISION: OPTION A — Vendedor resuelto con evidencia.");
console.log("SOURCE 1: SAG ka_nl_tercero_vend → TERCEROS.sc_nombre (HIGH confidence)");
console.log("  - 92% of 2026 PD orders have vendor");
console.log("  - 18 distinct vendors, all resolved to real names");
console.log("SOURCE 2: CRM quote history → customer → seller (MEDIUM confidence)");
console.log("  - 8/9 CRM sellers match SAG vendors");
console.log("  - Covers 2023-2025 gap where SAG stopped populating");
console.log("GAP: 2023-2025 orders without SAG vendor AND without CRM history → unknown");
console.log("UI: Shows 'Vendedor no identificado en SAG' for unknown orders");
console.log("KPIs: Unknown orders excluded from per-vendor calculations");

process.exit(fail > 0 ? 1 : 0);
