/**
 * _forensic-pd-invoice-match.ts
 *
 * INVENTORY-PD-STATUS-RECONCILIATION-01 — FASE 1 Forensics
 *
 * Cross-reference CustomerOrderRecord (PD) with SaleRecord (FV invoices)
 * to understand matching coverage and determine the best reconciliation strategy.
 *
 * Matching hypothesis:
 *   A PD order (CustomerOrderRecord) is "fulfilled" if FV SaleRecords exist
 *   for the same customerNit with saleDate >= orderDate.
 *
 * READ ONLY.
 *
 * Usage: npx dotenv-cli -e .env -- npx tsx scripts/_forensic-pd-invoice-match.ts
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const ORG = "cmmpwstuf000dp5y58kj1daaj";
const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  PD ↔ FV INVOICE MATCHING FORENSICS — FASE 1"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  // 1. Basic counts
  console.log(B("  1. Basic counts"));
  const pdCount: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM "CustomerOrderRecord" WHERE "organizationId" = $1`,
    ORG,
  );
  const fvCount: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM "SaleRecord"
     WHERE "organizationId" = $1 AND "comprobanteCode" = 'FV'`,
    ORG,
  );
  const allSaleCount: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM "SaleRecord" WHERE "organizationId" = $1`,
    ORG,
  );
  console.log(`    PD orders (CustomerOrderRecord):   ${B(String(pdCount[0]?.cnt ?? 0))}`);
  console.log(`    FV invoices (SaleRecord FV):        ${B(String(fvCount[0]?.cnt ?? 0))}`);
  console.log(`    All SaleRecords:                    ${B(String(allSaleCount[0]?.cnt ?? 0))}`);
  console.log("");

  // 2. SaleRecord comprobanteCode distribution
  console.log(B("  2. SaleRecord comprobanteCode distribution"));
  const compDist: Array<{ code: string; cnt: number }> = await db.$queryRawUnsafe(
    `SELECT "comprobanteCode" as code, COUNT(*)::int as cnt
     FROM "SaleRecord" WHERE "organizationId" = $1
     GROUP BY "comprobanteCode" ORDER BY cnt DESC`,
    ORG,
  );
  for (const c of compDist) {
    console.log(`    ${(c.code ?? "NULL").padEnd(10)} ${String(c.cnt).padStart(10)}`);
  }
  console.log("");

  // 3. CustomerNit overlap between PD and SaleRecord
  console.log(B("  3. CustomerNit overlap"));
  const pdNits: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT "customerNit")::int as cnt
     FROM "CustomerOrderRecord"
     WHERE "organizationId" = $1 AND "customerNit" IS NOT NULL`,
    ORG,
  );
  const saleNits: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT "customerNit")::int as cnt
     FROM "SaleRecord"
     WHERE "organizationId" = $1 AND "customerNit" IS NOT NULL`,
    ORG,
  );
  const overlapNits: Array<{ cnt: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as cnt FROM (
       SELECT DISTINCT "customerNit" FROM "CustomerOrderRecord"
       WHERE "organizationId" = $1 AND "customerNit" IS NOT NULL
       INTERSECT
       SELECT DISTINCT "customerNit" FROM "SaleRecord"
       WHERE "organizationId" = $1 AND "customerNit" IS NOT NULL
     ) t`,
    ORG,
  );
  console.log(`    Unique customerNit in PD:       ${B(String(pdNits[0]?.cnt ?? 0))}`);
  console.log(`    Unique customerNit in Sales:     ${B(String(saleNits[0]?.cnt ?? 0))}`);
  console.log(`    Overlap (both):                  ${G(String(overlapNits[0]?.cnt ?? 0))}`);
  const pdTotal = pdNits[0]?.cnt ?? 1;
  const overlapPct = Math.round(((overlapNits[0]?.cnt ?? 0) / pdTotal) * 100);
  console.log(`    PD nits with invoices:           ${overlapPct}%`);
  console.log("");

  // 4. PD orders with matching FV invoices (customerNit + saleDate >= orderDate)
  console.log(B("  4. PD orders matched to FV invoices (customerNit + date)"));
  const matchedOrders: Array<{ matched: number; total: number }> = await db.$queryRawUnsafe(
    `SELECT
       COUNT(DISTINCT cor.id)::int as matched,
       (SELECT COUNT(*)::int FROM "CustomerOrderRecord" WHERE "organizationId" = $1) as total
     FROM "CustomerOrderRecord" cor
     WHERE cor."organizationId" = $1
       AND EXISTS (
         SELECT 1 FROM "SaleRecord" sr
         WHERE sr."organizationId" = $1
           AND sr."customerNit" = cor."customerNit"
           AND sr."saleDate" >= cor."orderDate"
       )`,
    ORG,
  );
  const m = matchedOrders[0];
  console.log(`    PD orders with ANY SaleRecord match:  ${G(String(m?.matched ?? 0))} / ${String(m?.total ?? 0)}`);
  console.log(`    Match rate:                            ${Math.round(((m?.matched ?? 0) / (m?.total ?? 1)) * 100)}%`);
  console.log("");

  // 5. Stricter: PD orders matched to FV only (comprobanteCode = 'FV')
  console.log(B("  5. PD orders matched to FV invoices ONLY"));
  const matchedFV: Array<{ matched: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT cor.id)::int as matched
     FROM "CustomerOrderRecord" cor
     WHERE cor."organizationId" = $1
       AND EXISTS (
         SELECT 1 FROM "SaleRecord" sr
         WHERE sr."organizationId" = $1
           AND sr."customerNit" = cor."customerNit"
           AND sr."saleDate" >= cor."orderDate"
           AND sr."comprobanteCode" = 'FV'
       )`,
    ORG,
  );
  console.log(`    PD orders with FV invoice match:  ${G(String(matchedFV[0]?.matched ?? 0))}`);
  console.log("");

  // 6. Product-level matching for 4 audit refs
  console.log(B("  6. Product-level matching for audit refs"));
  const AUDIT_REFS = ["L-1367", "L-8467", "CJ-1126012", "CJ-2026004B"];
  for (const sku of AUDIT_REFS) {
    // PD orders with this SKU
    const pdForSku: Array<{ order_cnt: number; line_qty: number }> = await db.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT col."orderId")::int as order_cnt,
              COALESCE(SUM(col."quantity"), 0)::float as line_qty
       FROM "CustomerOrderLine" col
       JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
       WHERE col."organizationId" = $1
         AND col."referenceCode" = $2
         AND cor.status = 'PENDIENTE'`,
      ORG, sku,
    );

    // FV SaleRecords for the same productCode
    const fvForSku: Array<{ sale_cnt: number; sale_units: number }> = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int as sale_cnt,
              COALESCE(SUM("units"), 0)::int as sale_units
       FROM "SaleRecord"
       WHERE "organizationId" = $1
         AND "productCode" = $2
         AND "comprobanteCode" = 'FV'`,
      ORG, sku,
    );

    // PD orders for this SKU that also have FV invoices from same customer
    const matchedForSku: Array<{ matched: number }> = await db.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT col."orderId")::int as matched
       FROM "CustomerOrderLine" col
       JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
       WHERE col."organizationId" = $1
         AND col."referenceCode" = $2
         AND cor.status = 'PENDIENTE'
         AND EXISTS (
           SELECT 1 FROM "SaleRecord" sr
           WHERE sr."organizationId" = $1
             AND sr."customerNit" = cor."customerNit"
             AND sr."productCode" = $2
             AND sr."saleDate" >= cor."orderDate"
         )`,
      ORG, sku,
    );

    console.log(`    ${sku.padEnd(14)} PD orders: ${String(pdForSku[0]?.order_cnt ?? 0).padStart(5)}  qty: ${String(Math.round(pdForSku[0]?.line_qty ?? 0)).padStart(6)}  FV sales: ${String(fvForSku[0]?.sale_cnt ?? 0).padStart(6)}  FV units: ${String(fvForSku[0]?.sale_units ?? 0).padStart(6)}  matched: ${String(matchedForSku[0]?.matched ?? 0).padStart(5)}`);
  }
  console.log("");

  // 7. Date range analysis
  console.log(B("  7. Date ranges"));
  const pdDates: Array<{ min_d: string; max_d: string }> = await db.$queryRawUnsafe(
    `SELECT MIN("orderDate")::text as min_d, MAX("orderDate")::text as max_d
     FROM "CustomerOrderRecord" WHERE "organizationId" = $1`,
    ORG,
  );
  const saleDates: Array<{ min_d: string; max_d: string }> = await db.$queryRawUnsafe(
    `SELECT MIN("saleDate")::text as min_d, MAX("saleDate")::text as max_d
     FROM "SaleRecord" WHERE "organizationId" = $1`,
    ORG,
  );
  console.log(`    PD orders:   ${pdDates[0]?.min_d?.slice(0, 10)} → ${pdDates[0]?.max_d?.slice(0, 10)}`);
  console.log(`    SaleRecords: ${saleDates[0]?.min_d?.slice(0, 10)} → ${saleDates[0]?.max_d?.slice(0, 10)}`);
  console.log("");

  // 8. By year: how many PD orders can be matched to FV?
  console.log(B("  8. Match rate by year"));
  const byYear: Array<{ yr: number; total: number; matched: number }> = await db.$queryRawUnsafe(
    `SELECT
       EXTRACT(YEAR FROM cor."orderDate")::int as yr,
       COUNT(*)::int as total,
       SUM(CASE WHEN EXISTS (
         SELECT 1 FROM "SaleRecord" sr
         WHERE sr."organizationId" = $1
           AND sr."customerNit" = cor."customerNit"
           AND sr."saleDate" >= cor."orderDate"
       ) THEN 1 ELSE 0 END)::int as matched
     FROM "CustomerOrderRecord" cor
     WHERE cor."organizationId" = $1
     GROUP BY yr ORDER BY yr`,
    ORG,
  );
  console.log(`    ${"YEAR".padEnd(6)} ${"TOTAL".padStart(8)} ${"MATCHED".padStart(8)} ${"RATE".padStart(8)}`);
  console.log(`    ${"─".repeat(6)} ${"─".repeat(8)} ${"─".repeat(8)} ${"─".repeat(8)}`);
  for (const y of byYear) {
    const rate = y.total > 0 ? Math.round((y.matched / y.total) * 100) : 0;
    console.log(`    ${String(y.yr).padEnd(6)} ${String(y.total).padStart(8)} ${String(y.matched).padStart(8)} ${String(rate).padStart(7)}%`);
  }
  console.log("");

  // 9. Sample: unmatched PD orders (recent, no FV found)
  console.log(B("  9. Sample unmatched PD orders (2026, no FV)"));
  const unmatched: Array<{
    order_num: string; nit: string; order_date: string; amount: number;
  }> = await db.$queryRawUnsafe(
    `SELECT cor."orderNumber" as order_num,
            COALESCE(cor."customerNit", '—') as nit,
            cor."orderDate"::text as order_date,
            cor.amount::float as amount
     FROM "CustomerOrderRecord" cor
     WHERE cor."organizationId" = $1
       AND cor."orderDate" >= '2026-01-01'
       AND NOT EXISTS (
         SELECT 1 FROM "SaleRecord" sr
         WHERE sr."organizationId" = $1
           AND sr."customerNit" = cor."customerNit"
           AND sr."saleDate" >= cor."orderDate"
       )
     ORDER BY cor."orderDate" DESC
     LIMIT 10`,
    ORG,
  );
  for (const u of unmatched) {
    console.log(`    PD ${u.order_num.padEnd(10)} nit=${u.nit.padEnd(10)} ${u.order_date.slice(0, 10)}  $${Math.round(u.amount).toLocaleString()}`);
  }
  console.log("");

  // 10. Summary
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  FORENSIC SUMMARY"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  const total = m?.total ?? 0;
  const matched = m?.matched ?? 0;
  const unm = total - matched;
  console.log(`  Total PD orders:       ${total}`);
  console.log(`  Matched to invoices:   ${G(String(matched))} (${Math.round((matched / (total || 1)) * 100)}%)`);
  console.log(`  Unmatched (truly PD):  ${Y(String(unm))} (${Math.round((unm / (total || 1)) * 100)}%)`);
  console.log("");
  console.log(`  Strategy recommendation:`);
  if (matched / (total || 1) > 0.5) {
    console.log(`  ${G("HIGH MATCH RATE")} — customerNit + date is sufficient for reconciliation.`);
    console.log(`  Transition matched orders to FACTURADO and remove recency window.`);
  } else {
    console.log(`  ${Y("LOW MATCH RATE")} — need product-level matching or alternative strategy.`);
  }
  console.log("");

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
