/**
 * scripts/validate-pedidos-drawer-lines-and-seller-history.ts
 *
 * PEDIDOS-DRAWER-LINES-AND-SELLER-HISTORY-ROOT-CAUSE-01
 *
 * Structural validation of:
 * - Order lines sync wired into cron pipeline
 * - syncOrderLines status filter fix
 * - Seller resolution helper
 * - Drawer UI empty state fixes
 *
 * Usage:
 *   npx tsx scripts/validate-pedidos-drawer-lines-and-seller-history.ts
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

function fileNotContains(rel: string, needle: string): boolean {
  return !fileContains(rel, needle);
}

console.log("=== PEDIDOS DRAWER LINES & SELLER HISTORY ROOT CAUSE VALIDATION ===\n");

const cronRoute     = "app/api/cron/data-sync/route.ts";
const lineSync      = "lib/connectors/adapters/sag-pya-soap/orders/sag-order-lines-sync.ts";
const orderService  = "lib/comercial/pedidos/order-service.ts";
const historyService = "lib/comercial/pedidos/order-history-service.ts";
const memoryBuilder = "lib/comercial/pedidos/commercial-memory-builder.ts";
const clientPath    = "app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx";

// ── 1. Order lines sync wired into cron ──────────────────────────────────────
console.log("[1] Order lines sync wired into cron pipeline");
check("cron imports syncOrderLines", fileContains(cronRoute, "import { syncOrderLines }"));
check("cron calls syncOrderLines after orders", fileContains(cronRoute, 'mod === "orders"'));
check("cron pushes order_lines result", fileContains(cronRoute, '"order_lines"'));
check("cron has time guard for lines", fileContains(cronRoute, "remainingMs > 60_000"));

// ── 2. syncOrderLines status filter fixed ────────────────────────────────────
console.log("\n[2] syncOrderLines queries ALL statuses");
check("no PENDIENTE-only filter", fileNotContains(lineSync, 'status: "PENDIENTE"'));
check("queries all orders for lines", fileContains(lineSync, "Query ALL statuses"));

// ── 3. Seller resolution helper ──────────────────────────────────────────────
console.log("\n[3] resolveSellerForCustomerOrder helper");
check("helper exists", fileContains(orderService, "async function resolveSellerForCustomerOrder"));
check("queries SaleRecord", fileContains(orderService, "saleRecord.findFirst"));
check("filters Sin Vendedor", fileContains(orderService, '"Sin Vendedor"'));
check("returns null if no real seller", fileContains(orderService, "return null"));

// ── 4. getOrder wires seller resolution ──────────────────────────────────────
console.log("\n[4] getOrder resolves seller for COR orders");
check("getOrder calls resolveSellerForCustomerOrder", fileContains(orderService, "resolveSellerForCustomerOrder(orgId"));
check("only for sag_customer_order origin", fileContains(orderService, 'draft.origin === "sag_customer_order"'));
check("sets header.sellerName from resolution", fileContains(orderService, "draft.header.sellerName = seller.sellerName"));

// ── 5. Customer history from CustomerOrderRecord ────────────────────────────
console.log("\n[5] Customer history includes CustomerOrderRecord");
check("history service queries COR", fileContains(historyService, "prisma.customerOrderRecord.findMany"));
check("history service includes lines", fileContains(historyService, "include: { lines: true }"));

// ── 6. Commercial memory from CustomerOrderRecord ───────────────────────────
console.log("\n[6] buildCustomerMemory includes CustomerOrderRecord");
check("memory builder queries COR", fileContains(memoryBuilder, "prisma.customerOrderRecord.findMany"));

// ── 7. Drawer UI empty states ────────────────────────────────────────────────
console.log("\n[7] Drawer UI empty states");
check("no primer pedido cliente message", fileNotContains(clientPath, "primer pedido de este cliente"));
check("no primer pedido vendedor message", fileNotContains(clientPath, "primer pedido de este vendedor"));
check("SAG seller unavailable message", fileContains(clientPath, "Vendedor no disponible en datos SAG"));
check("drawer header handles empty seller", fileContains(clientPath, 'order.header.sellerName ? ` · ${order.header.sellerName}` : ""'));

// ── 8. Commercial intelligence in customer panel ─────────────────────────────
console.log("\n[8] Commercial intelligence in customer panel");
check("ticket promedio computed", fileContains(clientPath, "const avgTicket"));
check("dias sin comprar computed", fileContains(clientPath, "const daysSinceLastOrder"));
check("ticket promedio label", fileContains(clientPath, '"Ticket promedio"'));
check("dias sin comprar label", fileContains(clientPath, '"Dias sin comprar"'));

// ── Summary ──────────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\n=== VALIDATION COMPLETE: ${pass}/${total} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
