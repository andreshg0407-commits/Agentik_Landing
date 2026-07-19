/**
 * scripts/validate-pedidos-customer-order-record-integration.ts
 *
 * PEDIDOS-CUSTOMER-ORDER-RECORD-INTEGRATION-01
 *
 * Structural validation of CustomerOrderRecord integration.
 *
 * Usage:
 *   npx tsx scripts/validate-pedidos-customer-order-record-integration.ts
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

console.log("=== PEDIDOS CUSTOMER ORDER RECORD INTEGRATION VALIDATION ===\n");

const servicePath = "lib/comercial/pedidos/order-service.ts";
const typesPath   = "lib/comercial/pedidos/order-types.ts";
const pagePath    = "app/(app)/[orgSlug]/comercial/pedidos/page.tsx";
const clientPath  = "app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx";

// ── 1. listOrders consulta CustomerOrderRecord ─────────────────────────────
console.log("[1] listOrders queries CustomerOrderRecord");
check("listCustomerOrderRecords function exists", fileContains(servicePath, "export async function listCustomerOrderRecords"));
check("listOrders calls listCustomerOrderRecords", fileContains(servicePath, "listCustomerOrderRecords(orgId"));
check("CustomerOrderRecord integrated in listOrders", fileContains(servicePath, "CustomerOrderRecord rows (real SAG orders)"));

// ── 2. Mapper exists ───────────────────────────────────────────────────────
console.log("\n[2] CustomerOrderRecord mapper");
check("customerOrderRecordToOrderDraft function", fileContains(servicePath, "function customerOrderRecordToOrderDraft"));
check("customerOrderStatusToOrderStatus function", fileContains(servicePath, "function customerOrderStatusToOrderStatus"));
check("Maps FACTURADO to sincronizado", fileContains(servicePath, '"FACTURADO":   return "sincronizado"'));
check("Maps PENDIENTE to pendiente_sag", fileContains(servicePath, '"PENDIENTE":   return "pendiente_sag"'));

// ── 3. UI receives source sag_customer_order ───────────────────────────────
console.log("\n[3] UI receives sag_customer_order origin");
check("OrderOrigin includes sag_customer_order", fileContains(typesPath, '"sag_customer_order"'));
check("Mapper sets origin sag_customer_order", fileContains(servicePath, 'origin:          "sag_customer_order"'));
check("Client renders SAG badge for sag_customer_order", fileContains(clientPath, 'o.origin === "sag_customer_order"'));

// ── 4. Ordered by orderDate desc ───────────────────────────────────────────
console.log("\n[4] Orders sorted by date descending");
check("listCustomerOrderRecords orders by orderDate desc", fileContains(servicePath, 'orderBy: { orderDate: "desc" }'));
check("listOrders sorts merged result by createdAt desc", fileContains(servicePath, "result.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))"));

// ── 5. Header shows freshness metric ──────────────────────────────────────
console.log("\n[5] Header shows last SAG order date");
check("getMaxCustomerOrderDate exported", fileContains(servicePath, "export async function getMaxCustomerOrderDate"));
check("page.tsx calls getMaxCustomerOrderDate", fileContains(pagePath, "getMaxCustomerOrderDate"));
check("maxSagOrderDate passed to client", fileContains(pagePath, "maxSagOrderDate={maxSagOrderDate}"));
check("Client shows Ultimo date in header", fileContains(clientPath, "Ultimo:"));

// ── 6. Does not break CRMQuote ────────────────────────────────────────────
console.log("\n[6] CRMQuote path preserved");
check("listSagOrders still exists", fileContains(servicePath, "export async function listSagOrders"));
check("CRMQuote still queried in listOrders", fileContains(servicePath, "listSagOrders(orgId"));
check("CRMQuote still queried in getOrder", fileContains(servicePath, "prisma.cRMQuote.findFirst"));

// ── 7. Does not break AgentExecution ──────────────────────────────────────
console.log("\n[7] AgentExecution path preserved");
check("AgentExecution still queried in listOrders", fileContains(servicePath, "execDb().findMany"));
check("AgentExecution still queried in getOrder", fileContains(servicePath, "execDb().findFirst"));

// ── 8. getOrder includes CustomerOrderRecord fallback ─────────────────────
console.log("\n[8] getOrder includes CustomerOrderRecord fallback");
check("getOrder tries CustomerOrderRecord", fileContains(servicePath, "prisma.customerOrderRecord.findFirst"));
check("getOrder includes lines", fileContains(servicePath, "include: { lines: true }"));

// ── 9. Stats include CustomerOrderRecord ──────────────────────────────────
console.log("\n[9] getOrderStats includes CustomerOrderRecord");
check("getOrderStats queries CustomerOrderRecord", fileContains(servicePath, "prisma.customerOrderRecord.findMany"));
check("corTotal added to stats.today", fileContains(servicePath, "agentikCount + sagTotal + corTotal"));

// ── 10. Origin badges ────────────────────────────────────────────────────
console.log("\n[10] Origin badges in UI");
check("SAG badge for sag_customer_order", fileContains(clientPath, 'label: "SAG"'));
check("CRM badge for sag (CRMQuote)", fileContains(clientPath, 'label: "CRM"'));
check("AGK badge for agentik", fileContains(clientPath, 'label: "AGK"'));

// ── Summary ──────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\n=== VALIDATION COMPLETE: ${pass}/${total} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
