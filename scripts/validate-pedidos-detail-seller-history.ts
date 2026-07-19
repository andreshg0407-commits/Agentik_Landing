/**
 * scripts/validate-pedidos-detail-seller-history.ts
 *
 * PEDIDOS-DETAIL-AND-SELLER-HISTORY-01
 *
 * Structural validation of CustomerOrderRecord integration into
 * history service, commercial memory builder, and drawer UI.
 *
 * Usage:
 *   npx tsx scripts/validate-pedidos-detail-seller-history.ts
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

console.log("=== PEDIDOS DETAIL AND SELLER HISTORY VALIDATION ===\n");

const historyService = "lib/comercial/pedidos/order-history-service.ts";
const memoryBuilder  = "lib/comercial/pedidos/commercial-memory-builder.ts";
const clientPath     = "app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx";

// ── 1. getCustomerHistory queries CustomerOrderRecord ────────────────────────
console.log("[1] getCustomerHistory queries CustomerOrderRecord");
check("history service includes CustomerOrderRecord query", fileContains(historyService, "prisma.customerOrderRecord.findMany"));
check("history service matches by customerNit", fileContains(historyService, "customerNit:    customerCode"));
check("history service includes lines in COR query", fileContains(historyService, "include: { lines: true }"));
check("history service sets origin sag_customer_order", fileContains(historyService, '"sag_customer_order"'));
check("history service sorts entries by date", fileContains(historyService, "entries.sort((a, b) => (a.date < b.date ? 1 : -1))"));

// ── 2. getSellerHistory handles empty sellerName ────────────────────────────
console.log("\n[2] getSellerHistory handles empty sellerName");
check("returns empty if sellerName is blank", fileContains(historyService, "if (!sellerName.trim()) return empty"));

// ── 3. COR status mapper ────────────────────────────────────────────────────
console.log("\n[3] COR status mapper in history service");
check("corStatusToHistoryStatus function exists", fileContains(historyService, "function corStatusToHistoryStatus"));
check("FACTURADO maps to sincronizado", fileContains(historyService, '"FACTURADO":   return "sincronizado"'));
check("PENDIENTE maps to pendiente_sag", fileContains(historyService, '"PENDIENTE":   return "pendiente_sag"'));

// ── 4. commercial-memory-builder queries CustomerOrderRecord ─────────────────
console.log("\n[4] buildCustomerMemory queries CustomerOrderRecord");
check("memory builder includes COR query", fileContains(memoryBuilder, "prisma.customerOrderRecord.findMany"));
check("memory builder matches by customerNit", fileContains(memoryBuilder, "customerNit:    customerCode"));
check("memory builder includes lines", fileContains(memoryBuilder, "include: { lines: true }"));
check("memory builder early return for empty customerCode", fileContains(memoryBuilder, "if (!customerCode) return empty"));

// ── 5. Drawer header handles empty sellerName ────────────────────────────────
console.log("\n[5] Drawer header handles empty sellerName");
check("header omits seller dot separator when empty", fileContains(clientPath, "order.header.sellerName ? ` · ${order.header.sellerName}` : \"\""));

// ── 6. Customer history panel shows proper empty state ──────────────────────
console.log("\n[6] Customer history panel empty state");
check("no 'primer pedido de este cliente' message", !fileContains(clientPath, "primer pedido de este cliente"));
check("shows 'Sin historial registrado para este cliente'", fileContains(clientPath, "Sin historial registrado para este cliente"));

// ── 7. Seller history panel shows proper empty state ────────────────────────
console.log("\n[7] Seller history panel empty state");
check("no 'primer pedido de este vendedor' message", !fileContains(clientPath, "primer pedido de este vendedor"));
check("shows SAG seller unavailable message", fileContains(clientPath, "Vendedor no disponible en datos SAG"));
check("shows fallback for non-SAG seller", fileContains(clientPath, "Sin historial registrado para este vendedor"));

// ── 8. Commercial intelligence metrics in customer panel ─────────────────────
console.log("\n[8] Commercial intelligence metrics in customer panel");
check("avgTicket computed", fileContains(clientPath, "const avgTicket = history.totalOrders > 0"));
check("daysSinceLastOrder computed", fileContains(clientPath, "const daysSinceLastOrder = history.lastOrderDate"));
check("Ticket promedio displayed", fileContains(clientPath, 'label="Ticket promedio"'));
check("Primer pedido displayed", fileContains(clientPath, 'label="Primer pedido"'));
check("Dias sin comprar displayed", fileContains(clientPath, 'label="Dias sin comprar"'));
check("formatDateShort helper exists", fileContains(clientPath, "function formatDateShort"));

// ── 9. AgentExecution path preserved ────────────────────────────────────────
console.log("\n[9] AgentExecution path preserved");
check("history service still queries AgentExecution", fileContains(historyService, "execDb().findMany"));
check("memory builder still queries AgentExecution", fileContains(memoryBuilder, "loadOrderRows(orgId)"));

// ── Summary ──────────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\n=== VALIDATION COMPLETE: ${pass}/${total} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
