/**
 * _forensic-crm-reservation-audit.ts
 *
 * INVENTORY-CRM-RESERVATION-LAYER-01 — Phases 1, 4, 9
 *
 * READ ONLY audit of CRM quote statuses, warehouse names,
 * top reservations, and overlap with PD orders.
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
  console.log(B("==============================================================="));
  console.log(B("  CRM RESERVATION AUDIT — INVENTORY-CRM-RESERVATION-LAYER-01"));
  console.log(B("==============================================================="));
  console.log("");

  // ── FASE 1: CRM Quote Statuses ─────────────────────────────────────────────
  console.log(B("  FASE 1 — CRM Quote Statuses"));
  console.log("");

  const quoteStatuses: Array<{ status: string; quote_count: number; line_count: number; total_qty: number }> = await db.$queryRawUnsafe(
    `SELECT cq.status,
            COUNT(DISTINCT cq.id)::int AS quote_count,
            COUNT(cql.id)::int AS line_count,
            COALESCE(SUM(cql.qty), 0)::float AS total_qty
     FROM "CRMQuote" cq
     LEFT JOIN "CRMQuoteLine" cql ON cql."quoteId" = cq.id
     WHERE cq."organizationId" = $1
     GROUP BY cq.status
     ORDER BY total_qty DESC`,
    ORG,
  );

  console.log(`  ${"Status".padEnd(20)} ${"Quotes".padStart(8)} ${"Lines".padStart(8)} ${"Qty".padStart(10)}`);
  console.log(`  ${"─".repeat(20)} ${"─".repeat(8)} ${"─".repeat(8)} ${"─".repeat(10)}`);
  for (const s of quoteStatuses) {
    console.log(`  ${(s.status ?? "NULL").padEnd(20)} ${String(s.quote_count).padStart(8)} ${String(s.line_count).padStart(8)} ${String(Math.round(s.total_qty)).padStart(10)}`);
  }
  console.log("");

  // ── Warehouse names ────────────────────────────────────────────────────────
  console.log(B("  CRM QuoteLine warehouseName distribution"));
  console.log("");

  const warehouses: Array<{ warehouseName: string; cnt: number; total_qty: number }> = await db.$queryRawUnsafe(
    `SELECT cql."warehouseName",
            COUNT(*)::int AS cnt,
            COALESCE(SUM(cql.qty), 0)::float AS total_qty
     FROM "CRMQuoteLine" cql
     JOIN "CRMQuote" cq ON cq.id = cql."quoteId"
     WHERE cql."organizationId" = $1
     GROUP BY cql."warehouseName"
     ORDER BY total_qty DESC`,
    ORG,
  );

  console.log(`  ${"warehouseName".padEnd(35)} ${"Lines".padStart(8)} ${"Qty".padStart(10)}`);
  console.log(`  ${"─".repeat(35)} ${"─".repeat(8)} ${"─".repeat(10)}`);
  for (const w of warehouses) {
    console.log(`  ${(w.warehouseName ?? "NULL").padEnd(35)} ${String(w.cnt).padStart(8)} ${String(Math.round(w.total_qty)).padStart(10)}`);
  }
  console.log("");

  // ── Status x warehouseName cross-tab ───────────────────────────────────────
  console.log(B("  Status x warehouseName cross-tab"));
  console.log("");

  const crossTab: Array<{ status: string; warehouseName: string; cnt: number; total_qty: number }> = await db.$queryRawUnsafe(
    `SELECT cq.status, cql."warehouseName",
            COUNT(*)::int AS cnt,
            COALESCE(SUM(cql.qty), 0)::float AS total_qty
     FROM "CRMQuoteLine" cql
     JOIN "CRMQuote" cq ON cq.id = cql."quoteId"
     WHERE cql."organizationId" = $1
     GROUP BY cq.status, cql."warehouseName"
     ORDER BY cq.status, total_qty DESC`,
    ORG,
  );

  console.log(`  ${"Status".padEnd(15)} ${"warehouseName".padEnd(35)} ${"Lines".padStart(8)} ${"Qty".padStart(10)}`);
  console.log(`  ${"─".repeat(15)} ${"─".repeat(35)} ${"─".repeat(8)} ${"─".repeat(10)}`);
  for (const c of crossTab) {
    console.log(`  ${(c.status ?? "?").padEnd(15)} ${(c.warehouseName ?? "NULL").padEnd(35)} ${String(c.cnt).padStart(8)} ${String(Math.round(c.total_qty)).padStart(10)}`);
  }
  console.log("");

  // ── Line status ────────────────────────────────────────────────────────────
  console.log(B("  CRM QuoteLine status field (estado_pedido_c)"));
  console.log("");

  const lineStatuses: Array<{ status: string; cnt: number; total_qty: number }> = await db.$queryRawUnsafe(
    `SELECT cql.status,
            COUNT(*)::int AS cnt,
            COALESCE(SUM(cql.qty), 0)::float AS total_qty
     FROM "CRMQuoteLine" cql
     WHERE cql."organizationId" = $1
     GROUP BY cql.status
     ORDER BY total_qty DESC`,
    ORG,
  );

  console.log(`  ${"Line Status".padEnd(25)} ${"Lines".padStart(8)} ${"Qty".padStart(10)}`);
  console.log(`  ${"─".repeat(25)} ${"─".repeat(8)} ${"─".repeat(10)}`);
  for (const s of lineStatuses) {
    console.log(`  ${(s.status ?? "NULL").padEnd(25)} ${String(s.cnt).padStart(8)} ${String(Math.round(s.total_qty)).padStart(10)}`);
  }
  console.log("");

  // ── FASE 4: Top 50 refs ────────────────────────────────────────────────────
  console.log(B("  FASE 4 — Top 50 references with CRM DRAFT reservations"));
  console.log("");

  const top50: Array<{ reference: string; total_qty: number; line_count: number }> = await db.$queryRawUnsafe(
    `SELECT cql."reference",
            SUM(cql.qty)::float AS total_qty,
            COUNT(*)::int AS line_count
     FROM "CRMQuoteLine" cql
     JOIN "CRMQuote" cq ON cq.id = cql."quoteId"
     WHERE cql."organizationId" = $1
       AND cq.status = 'DRAFT'
     GROUP BY cql."reference"
     ORDER BY total_qty DESC
     LIMIT 50`,
    ORG,
  );

  console.log(`  ${"Reference".padEnd(18)} ${"Qty".padStart(8)} ${"Lines".padStart(6)}`);
  console.log(`  ${"─".repeat(18)} ${"─".repeat(8)} ${"─".repeat(6)}`);
  for (const t of top50) {
    console.log(`  ${t.reference.padEnd(18)} ${String(Math.round(t.total_qty)).padStart(8)} ${String(t.line_count).padStart(6)}`);
  }
  console.log("");

  // ── Global stats ───────────────────────────────────────────────────────────
  console.log(B("  Global CRM DRAFT stats"));
  const globalStats: Array<{ ref_count: number; total_qty: number; total_lines: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT cql."reference")::int AS ref_count,
            SUM(cql.qty)::float AS total_qty,
            COUNT(*)::int AS total_lines
     FROM "CRMQuoteLine" cql
     JOIN "CRMQuote" cq ON cq.id = cql."quoteId"
     WHERE cql."organizationId" = $1
       AND cq.status = 'DRAFT'`,
    ORG,
  );
  for (const g of globalStats) {
    console.log(`  Refs: ${g.ref_count}, Lines: ${g.total_lines}, Total qty: ${Math.round(g.total_qty)}`);
  }
  console.log("");

  // ── FASE 9: Overlap CRM + PD ──────────────────────────────────────────────
  console.log(B("  FASE 9 — CRM DRAFT refs that ALSO have PENDIENTE PD orders"));
  console.log("");

  const overlap: Array<{ reference: string; crm_qty: number; pd_qty: number }> = await db.$queryRawUnsafe(
    `WITH crm_agg AS (
       SELECT cql."reference", SUM(cql.qty)::float AS crm_qty
       FROM "CRMQuoteLine" cql
       JOIN "CRMQuote" cq ON cq.id = cql."quoteId"
       WHERE cql."organizationId" = $1 AND cq.status = 'DRAFT'
       GROUP BY cql."reference"
     ),
     pd_agg AS (
       SELECT col."referenceCode" AS reference, SUM(col."quantity")::float AS pd_qty
       FROM "CustomerOrderLine" col
       JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
       WHERE col."organizationId" = $1 AND cor.status = 'PENDIENTE'
       GROUP BY col."referenceCode"
     )
     SELECT c.reference, c.crm_qty, COALESCE(p.pd_qty, 0)::float AS pd_qty
     FROM crm_agg c
     JOIN pd_agg p ON p.reference = c.reference
     ORDER BY c.crm_qty DESC`,
    ORG,
  );

  console.log(`  Overlap count: ${overlap.length} refs have BOTH CRM DRAFT and PENDIENTE PD`);
  if (overlap.length > 0) {
    console.log(`  ${"Reference".padEnd(18)} ${"CRM".padStart(8)} ${"PD".padStart(8)}`);
    console.log(`  ${"─".repeat(18)} ${"─".repeat(8)} ${"─".repeat(8)}`);
    for (const o of overlap) {
      console.log(`  ${o.reference.padEnd(18)} ${String(Math.round(o.crm_qty)).padStart(8)} ${String(Math.round(o.pd_qty)).padStart(8)}`);
    }
  } else {
    console.log(G("  NO OVERLAP — CRM DRAFT and PENDIENTE PD are disjoint sets."));
    console.log(G("  No double-deduction risk."));
  }
  console.log("");

  // ── 4-ref validation preview ───────────────────────────────────────────────
  console.log(B("  4-Reference validation preview"));
  console.log("");

  const auditRefs = ["L-1367", "L-8467", "CJ-1126012", "CJ-2026004B"];
  const adminQty: Record<string, number> = { "L-1367": 64, "L-8467": 511, "CJ-1126012": 79, "CJ-2026004B": 164 };

  for (const sku of auditRefs) {
    const pil: Array<{ qty: number }> = await db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(pil."quantity"), 0)::float AS qty
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1 AND pe.sku = $2
         AND pil."externalRef" IN ('01', '04')`,
      ORG, sku,
    );
    const pd: Array<{ qty: number }> = await db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(col."quantity"), 0)::float AS qty
       FROM "CustomerOrderLine" col
       JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
       WHERE col."organizationId" = $1 AND col."referenceCode" = $2
         AND cor.status = 'PENDIENTE'`,
      ORG, sku,
    );
    const crm: Array<{ qty: number }> = await db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(cql.qty), 0)::float AS qty
       FROM "CRMQuoteLine" cql
       JOIN "CRMQuote" cq ON cq.id = cql."quoteId"
       WHERE cql."organizationId" = $1 AND cql."reference" = $2
         AND cq.status = 'DRAFT'`,
      ORG, sku,
    );

    const physical = Math.round(pil[0]?.qty ?? 0);
    const pdQty = Math.round(pd[0]?.qty ?? 0);
    const crmQty = Math.round(crm[0]?.qty ?? 0);
    const dispOld = physical - pdQty;
    const dispNew = Math.max(0, physical - pdQty - crmQty);
    const admin = adminQty[sku];
    const gapOld = dispOld - admin;
    const gapNew = dispNew - admin;

    console.log(`  ${sku.padEnd(14)} physical=${String(physical).padStart(5)} PD=${String(pdQty).padStart(3)} CRM=${String(crmQty).padStart(4)} old_disp=${String(dispOld).padStart(5)} new_disp=${String(dispNew).padStart(5)} admin=${String(admin).padStart(5)} old_gap=${String(gapOld).padStart(4)} new_gap=${String(gapNew).padStart(4)}`);
  }

  console.log("");
  await prisma.$disconnect();
  pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
