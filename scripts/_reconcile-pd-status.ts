/**
 * _reconcile-pd-status.ts
 *
 * INVENTORY-PD-STATUS-RECONCILIATION-01
 *
 * Cross-reference CustomerOrderRecord (PD) with SaleRecord invoices
 * to transition stale PENDIENTE orders to their correct status.
 *
 * Strategy:
 *   1. FACTURADO — PD order's customerNit has SaleRecords with saleDate >= orderDate
 *      (customer was invoiced after placing the order → order is fulfilled)
 *   2. VENCIDO — PD order older than 90 days with NO customer invoices
 *      (order expired without fulfillment — likely cancelled informally)
 *   3. PENDIENTE — recent orders (last 90 days) without invoice match
 *      (genuinely pending commitments)
 *
 * After reconciliation, the recency window in _resync-coverage-snapshot.ts
 * can be removed — status-based filtering (WHERE status = 'PENDIENTE')
 * gives exact pending quantities.
 *
 * Usage: npx dotenv-cli -e .env -- npx tsx scripts/_reconcile-pd-status.ts [dryrun|apply]
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const ORG = "cmmpwstuf000dp5y58kj1daaj";
const VENCIDO_THRESHOLD_DAYS = 90;

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;

async function main() {
  const mode = (process.argv[2] || "dryrun").toLowerCase();
  if (!["dryrun", "apply"].includes(mode)) {
    console.error(R("Usage: _reconcile-pd-status.ts [dryrun|apply]"));
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  PD STATUS RECONCILIATION — INVENTORY-PD-STATUS-RECONCILIATION-01"));
  console.log(B(`  Mode: ${mode.toUpperCase()}`));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  // ── FASE 1: Pre-reconciliation snapshot ──────────────────────────────────────
  console.log(B("  FASE 1 — Pre-reconciliation status distribution"));
  const preDist: Array<{ status: string; cnt: number }> = await db.$queryRawUnsafe(
    `SELECT status, COUNT(*)::int as cnt
     FROM "CustomerOrderRecord"
     WHERE "organizationId" = $1
     GROUP BY status ORDER BY cnt DESC`,
    ORG,
  );
  for (const s of preDist) {
    console.log(`    ${s.status.padEnd(15)} ${String(s.cnt).padStart(8)}`);
  }
  console.log("");

  // ── FASE 2: Identify orders to transition → FACTURADO ────────────────────────
  // PD orders where the same customerNit has at least one SaleRecord
  // with saleDate >= orderDate
  console.log(B("  FASE 2 — Identifying FACTURADO candidates"));
  const facturadoIds: Array<{ id: string }> = await db.$queryRawUnsafe(
    `SELECT cor.id
     FROM "CustomerOrderRecord" cor
     WHERE cor."organizationId" = $1
       AND cor.status = 'PENDIENTE'
       AND EXISTS (
         SELECT 1 FROM "SaleRecord" sr
         WHERE sr."organizationId" = $1
           AND sr."customerNit" = cor."customerNit"
           AND sr."saleDate" >= cor."orderDate"
           AND sr."sagDocumentFamily" IN ('OFFICIAL_INVOICE', 'DISPATCH_REMISION', 'OTHER')
       )`,
    ORG,
  );
  console.log(`    FACTURADO candidates: ${G(String(facturadoIds.length))}`);

  // ── FASE 3: Identify orders to transition → CANCELADO (vencido) ──────────────
  // PD orders older than 90 days with NO customer invoices
  console.log(B("  FASE 3 — Identifying CANCELADO candidates (vencido > 90 days, no invoices)"));
  const canceladoIds: Array<{ id: string }> = await db.$queryRawUnsafe(
    `SELECT cor.id
     FROM "CustomerOrderRecord" cor
     WHERE cor."organizationId" = $1
       AND cor.status = 'PENDIENTE'
       AND cor."orderDate" < NOW() - INTERVAL '${VENCIDO_THRESHOLD_DAYS} days'
       AND NOT EXISTS (
         SELECT 1 FROM "SaleRecord" sr
         WHERE sr."organizationId" = $1
           AND sr."customerNit" = cor."customerNit"
           AND sr."saleDate" >= cor."orderDate"
       )`,
    ORG,
  );
  console.log(`    CANCELADO candidates:  ${Y(String(canceladoIds.length))}`);

  // Remaining PENDIENTE
  const remaining = preDist.find(s => s.status === "PENDIENTE")?.cnt ?? 0;
  const stillPending = remaining - facturadoIds.length - canceladoIds.length;
  console.log(`    Still PENDIENTE:       ${B(String(stillPending))}`);
  console.log("");

  // ── FASE 4: Validate against 4 audit refs ────────────────────────────────────
  console.log(B("  FASE 4 — Audit ref impact preview"));
  const AUDIT_REFS = [
    { sku: "L-1367", adminQty: 64 },
    { sku: "L-8467", adminQty: 511 },
    { sku: "CJ-1126012", adminQty: 79 },
    { sku: "CJ-2026004B", adminQty: 164 },
  ];

  // Compute what PD qty would be with status-based filtering after reconciliation
  const facturadoIdSet = new Set(facturadoIds.map(f => f.id));
  const canceladoIdSet = new Set(canceladoIds.map(c => c.id));

  for (const ref of AUDIT_REFS) {
    // Current: 30d window PD qty
    const current30d: Array<{ qty: number }> = await db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(col."quantity"), 0)::float as qty
       FROM "CustomerOrderLine" col
       JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
       WHERE col."organizationId" = $1
         AND col."referenceCode" = $2
         AND cor.status = 'PENDIENTE'
         AND cor."orderDate" >= NOW() - INTERVAL '30 days'`,
      ORG, ref.sku,
    );

    // After reconciliation: status = PENDIENTE (excluding facturado + cancelado)
    const afterRecon: Array<{ qty: number }> = await db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(col."quantity"), 0)::float as qty
       FROM "CustomerOrderLine" col
       JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
       WHERE col."organizationId" = $1
         AND col."referenceCode" = $2
         AND cor.status = 'PENDIENTE'
         AND cor.id NOT IN (
           SELECT id FROM "CustomerOrderRecord"
           WHERE "organizationId" = $1
             AND status = 'PENDIENTE'
             AND (
               EXISTS (
                 SELECT 1 FROM "SaleRecord" sr
                 WHERE sr."organizationId" = $1
                   AND sr."customerNit" = "CustomerOrderRecord"."customerNit"
                   AND sr."saleDate" >= "CustomerOrderRecord"."orderDate"
                   AND sr."sagDocumentFamily" IN ('OFFICIAL_INVOICE', 'DISPATCH_REMISION', 'OTHER')
               )
               OR "orderDate" < NOW() - INTERVAL '${VENCIDO_THRESHOLD_DAYS} days'
             )
         )`,
      ORG, ref.sku,
    );

    // Gross B01+B04
    const gross: Array<{ qty: number }> = await db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(pil."quantity"), 0)::float as qty
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1
         AND pe.sku = $2
         AND pil."externalRef" = ANY($3::text[])`,
      ORG, ref.sku, ["01", "04"],
    );

    const grossQty = Math.round(gross[0]?.qty ?? 0);
    const pd30d = Math.round(current30d[0]?.qty ?? 0);
    const pdRecon = Math.round(afterRecon[0]?.qty ?? 0);
    const disp30d = grossQty - pd30d;
    const dispRecon = grossQty - pdRecon;
    const gap30d = Math.abs(disp30d - ref.adminQty);
    const gapRecon = Math.abs(dispRecon - ref.adminQty);

    console.log(`    ${ref.sku.padEnd(14)} gross: ${String(grossQty).padStart(5)}  admin: ${String(ref.adminQty).padStart(5)}`);
    console.log(`      30d window:  PD=${String(pd30d).padStart(4)}  disp=${String(disp30d).padStart(5)}  gap=${String(gap30d).padStart(4)} (${Math.round((gap30d / ref.adminQty) * 100)}%)`);
    console.log(`      after recon: PD=${String(pdRecon).padStart(4)}  disp=${String(dispRecon).padStart(5)}  gap=${String(gapRecon).padStart(4)} (${Math.round((gapRecon / ref.adminQty) * 100)}%)`);
    console.log(`      ${gapRecon < gap30d ? G("IMPROVED") : gapRecon === gap30d ? Y("SAME") : R("WORSE")}`);
    console.log("");
  }

  // ── FASE 5: Apply transitions ────────────────────────────────────────────────
  if (mode === "dryrun") {
    console.log(Y("  DRY RUN — no changes applied. Use 'apply' to persist."));
    console.log("");
    await prisma.$disconnect();
    pool.end();
    return;
  }

  console.log(B("  FASE 5 — Applying status transitions"));
  const t0 = Date.now();

  // Batch update FACTURADO
  if (facturadoIds.length > 0) {
    const BATCH = 500;
    let updated = 0;
    for (let i = 0; i < facturadoIds.length; i += BATCH) {
      const batch = facturadoIds.slice(i, i + BATCH).map(f => f.id);
      const result = await db.$executeRawUnsafe(
        `UPDATE "CustomerOrderRecord"
         SET status = 'FACTURADO'::"CustomerOrderStatus", "syncedAt" = NOW()
         WHERE id = ANY($1::text[])`,
        batch,
      );
      updated += result;
    }
    console.log(`    → FACTURADO: ${G(String(updated))} orders updated`);
  }

  // Batch update CANCELADO
  if (canceladoIds.length > 0) {
    const batch = canceladoIds.map(c => c.id);
    const result = await db.$executeRawUnsafe(
      `UPDATE "CustomerOrderRecord"
       SET status = 'CANCELADO'::"CustomerOrderStatus", "syncedAt" = NOW()
       WHERE id = ANY($1::text[])`,
      batch,
    );
    console.log(`    → CANCELADO: ${Y(String(result))} orders updated`);
  }

  const elapsed = Date.now() - t0;
  console.log(`    Duration: ${elapsed}ms`);
  console.log("");

  // ── FASE 6: Post-reconciliation status distribution ──────────────────────────
  console.log(B("  FASE 6 — Post-reconciliation status distribution"));
  const postDist: Array<{ status: string; cnt: number }> = await db.$queryRawUnsafe(
    `SELECT status, COUNT(*)::int as cnt
     FROM "CustomerOrderRecord"
     WHERE "organizationId" = $1
     GROUP BY status ORDER BY cnt DESC`,
    ORG,
  );
  for (const s of postDist) {
    console.log(`    ${s.status.padEnd(15)} ${String(s.cnt).padStart(8)}`);
  }
  console.log("");

  // ── FASE 7: Validate PD quantities with status-based filtering ───────────────
  console.log(B("  FASE 7 — PD quantities with status-based filtering (no recency window)"));
  for (const ref of AUDIT_REFS) {
    const pdQty: Array<{ qty: number }> = await db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(col."quantity"), 0)::float as qty
       FROM "CustomerOrderLine" col
       JOIN "CustomerOrderRecord" cor ON cor.id = col."orderId"
       WHERE col."organizationId" = $1
         AND col."referenceCode" = $2
         AND cor.status = 'PENDIENTE'`,
      ORG, ref.sku,
    );
    const gross: Array<{ qty: number }> = await db.$queryRawUnsafe(
      `SELECT COALESCE(SUM(pil."quantity"), 0)::float as qty
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1
         AND pe.sku = $2
         AND pil."externalRef" = ANY($3::text[])`,
      ORG, ref.sku, ["01", "04"],
    );
    const grossQty = Math.round(gross[0]?.qty ?? 0);
    const pd = Math.round(pdQty[0]?.qty ?? 0);
    const disp = grossQty - pd;
    const gap = Math.abs(disp - ref.adminQty);
    const pct = Math.round((gap / ref.adminQty) * 100);
    const close = pct <= 20;
    console.log(`    ${ref.sku.padEnd(14)} gross: ${String(grossQty).padStart(5)}  PD: ${String(pd).padStart(5)}  disp: ${String(disp).padStart(5)}  admin: ${String(ref.adminQty).padStart(5)}  gap: ${String(gap).padStart(4)} (${pct}%) ${close ? G("[CLOSE]") : Y("[GAP]")}`);
  }
  console.log("");

  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(G("  Reconciliation complete."));
  console.log(`  Next: update _resync-coverage-snapshot.ts to remove 30d window.`);
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
