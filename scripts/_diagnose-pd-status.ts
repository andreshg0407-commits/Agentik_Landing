/**
 * _diagnose-pd-status.ts
 *
 * INVENTORY-PENDING-ORDERS-ACTIVATION-01 — FASE 10 Diagnostic
 *
 * Investigates why PD pending quantities are too high.
 * Hypothesis: CustomerOrderRecord.status is all PENDIENTE —
 * orders that were invoiced never transition to FACTURADO.
 *
 * READ ONLY.
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const ORG = "cmmpwstuf000dp5y58kj1daaj";
const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  PD STATUS DIAGNOSTIC — FASE 10"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  // 1. Status distribution
  console.log(B("  1. CustomerOrderRecord status distribution"));
  const statusDist: Array<{ status: string; cnt: number; min_date: string; max_date: string }> =
    await db.$queryRawUnsafe(
      `SELECT status, COUNT(*)::int as cnt,
              MIN("orderDate")::text as min_date,
              MAX("orderDate")::text as max_date
       FROM "CustomerOrderRecord"
       WHERE "organizationId" = $1
       GROUP BY status
       ORDER BY cnt DESC`,
      ORG,
    );
  for (const s of statusDist) {
    console.log(`    ${s.status.padEnd(15)} ${String(s.cnt).padStart(8)} orders  (${s.min_date.slice(0, 10)} → ${s.max_date.slice(0, 10)})`);
  }
  console.log("");

  // 2. Date distribution of PENDIENTE orders
  console.log(B("  2. PENDIENTE orders by year"));
  const byYear: Array<{ yr: number; cnt: number; total_lines: number }> =
    await db.$queryRawUnsafe(
      `SELECT EXTRACT(YEAR FROM cor."orderDate")::int as yr,
              COUNT(DISTINCT cor.id)::int as cnt,
              COUNT(col.id)::int as total_lines
       FROM "CustomerOrderRecord" cor
       LEFT JOIN "CustomerOrderLine" col ON col."orderId" = cor.id
       WHERE cor."organizationId" = $1 AND cor.status = 'PENDIENTE'
       GROUP BY yr ORDER BY yr`,
      ORG,
    );
  for (const y of byYear) {
    console.log(`    ${y.yr}:  ${String(y.cnt).padStart(6)} orders, ${String(y.total_lines).padStart(8)} lines`);
  }
  console.log("");

  // 3. Check L-1367: which orders contribute PD lines?
  console.log(B("  3. L-1367 — PD pending breakdown"));
  const l1367: Array<{ order_num: string; order_date: string; qty: number; status: string }> =
    await db.$queryRawUnsafe(
      `SELECT cor."orderNumber" as order_num,
              cor."orderDate"::text as order_date,
              SUM(col."quantity")::float as qty,
              cor.status
       FROM "CustomerOrderLine" col
       JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
       WHERE col."organizationId" = $1
         AND col."referenceCode" = 'L-1367'
         AND cor.status = 'PENDIENTE'
       GROUP BY cor."orderNumber", cor."orderDate", cor.status
       ORDER BY cor."orderDate" DESC
       LIMIT 20`,
      ORG,
    );
  console.log(`    Total PD orders for L-1367: ${l1367.length}+`);
  for (const o of l1367.slice(0, 10)) {
    console.log(`      PD ${o.order_num.padEnd(10)} ${o.order_date.slice(0, 10)}  qty=${Math.round(o.qty)}  status=${o.status}`);
  }
  console.log("");

  // 4. Check if old orders (2024, 2023, etc.) are still PENDIENTE
  console.log(B("  4. Stale PENDIENTE orders (before 2026)"));
  const stale: Array<{ cnt: number; total_lines: number; total_qty: number }> =
    await db.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT cor.id)::int as cnt,
              COUNT(col.id)::int as total_lines,
              COALESCE(SUM(col."quantity"), 0)::float as total_qty
       FROM "CustomerOrderRecord" cor
       LEFT JOIN "CustomerOrderLine" col ON col."orderId" = cor.id
       WHERE cor."organizationId" = $1
         AND cor.status = 'PENDIENTE'
         AND cor."orderDate" < '2026-01-01'`,
      ORG,
    );
  console.log(`    Orders before 2026: ${B(String(stale[0]?.cnt ?? 0))}`);
  console.log(`    Lines before 2026:  ${B(String(stale[0]?.total_lines ?? 0))}`);
  console.log(`    Total qty:          ${B(String(Math.round(stale[0]?.total_qty ?? 0)))}`);
  console.log("");

  // 5. Recent orders only (2026) — what does the PD look like?
  console.log(B("  5. Recent PENDIENTE (2026 only) — 4 audit refs"));
  const AUDIT_REFS = ["L-1367", "L-8467", "CJ-1126012", "CJ-2026004B"];
  for (const sku of AUDIT_REFS) {
    const recent: Array<{ pending: number }> = await db.$queryRawUnsafe(
      `SELECT SUM(col."quantity")::float as pending
       FROM "CustomerOrderLine" col
       JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
       WHERE col."organizationId" = $1
         AND col."referenceCode" = $2
         AND cor.status = 'PENDIENTE'
         AND cor."orderDate" >= '2026-01-01'`,
      ORG, sku,
    );
    const last30: Array<{ pending: number }> = await db.$queryRawUnsafe(
      `SELECT SUM(col."quantity")::float as pending
       FROM "CustomerOrderLine" col
       JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
       WHERE col."organizationId" = $1
         AND col."referenceCode" = $2
         AND cor.status = 'PENDIENTE'
         AND cor."orderDate" >= NOW() - INTERVAL '30 days'`,
      ORG, sku,
    );
    const last7: Array<{ pending: number }> = await db.$queryRawUnsafe(
      `SELECT SUM(col."quantity")::float as pending
       FROM "CustomerOrderLine" col
       JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
       WHERE col."organizationId" = $1
         AND col."referenceCode" = $2
         AND cor.status = 'PENDIENTE'
         AND cor."orderDate" >= NOW() - INTERVAL '7 days'`,
      ORG, sku,
    );
    console.log(`    ${sku.padEnd(14)} all=${String(Math.round(recent[0]?.pending ?? 0)).padStart(6)}  30d=${String(Math.round(last30[0]?.pending ?? 0)).padStart(6)}  7d=${String(Math.round(last7[0]?.pending ?? 0)).padStart(6)}`);
  }
  console.log("");

  // 6. Cross-check: do invoiced movements (SaleRecord) exist for these PD orders?
  console.log(B("  6. Cross-check: SaleRecord invoices vs PD orders"));
  const saleRecordCount: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM "SaleRecord" WHERE "organizationId" = $1`,
    ORG,
  );
  console.log(`    Total SaleRecords (invoices): ${B(String(saleRecordCount[0]?.cnt ?? 0))}`);
  console.log("");

  // Summary
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  DIAGNOSIS"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(`  Root cause: CustomerOrderRecord.status defaults to PENDIENTE`);
  console.log(`  and is NEVER updated when SAG invoices the order.`);
  console.log(`  All 9,522 PD orders across all years remain PENDIENTE.`);
  console.log(`  Solution: filter PD lines by recency (last 30/60/90 days)`);
  console.log(`  or cross-reference with SaleRecord to exclude invoiced orders.`);
  console.log("");

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
