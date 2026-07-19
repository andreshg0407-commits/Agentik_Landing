/**
 * _transfer-discovery-forensics.ts
 *
 * CASTILLITOS-SAG-TRANSFER-DISCOVERY-01
 * READ ONLY forensic script — discovers transfer patterns from ProductInventoryLevel.
 *
 * ProductInventoryLevel stores per-variant per-warehouse balances computed from
 * SUM(signed MOVIMIENTOS_ITEMS). By analyzing quantity distributions across
 * warehouses for the same product, we can infer transfer patterns.
 *
 * Usage: npx tsx scripts/_transfer-discovery-forensics.ts
 */

import { prisma } from "../lib/prisma";
import { CASTILLITOS_BODEGAS } from "../lib/sag/master-data/castillitos-overrides";

function wName(ref: string): string {
  return CASTILLITOS_BODEGAS.labels[ref] ?? `UNKNOWN(${ref})`;
}

async function main() {
  console.log("=== CASTILLITOS TRANSFER DISCOVERY — FORENSIC REPORT ===\n");

  // ── Phase 1: Movement document distribution (via ProductInventoryLevel) ────
  // ProductInventoryLevel is the result of all movements. We can't see individual
  // movements but we can see the NET EFFECT per warehouse.

  console.log("── PHASE 1: WAREHOUSE NET BALANCE DISTRIBUTION ──");
  const balances = await prisma.$queryRawUnsafe<Array<{
    externalRef: string;
    variant_count: number;
    total_qty: number;
    positive_count: number;
    negative_count: number;
    zero_count: number;
    positive_qty: number;
    negative_qty: number;
  }>>(
    `SELECT "externalRef",
            COUNT(*)::int as variant_count,
            COALESCE(SUM("quantity"), 0)::int as total_qty,
            COUNT(*) FILTER (WHERE "quantity" > 0)::int as positive_count,
            COUNT(*) FILTER (WHERE "quantity" < 0)::int as negative_count,
            COUNT(*) FILTER (WHERE "quantity" = 0)::int as zero_count,
            COALESCE(SUM("quantity") FILTER (WHERE "quantity" > 0), 0)::int as positive_qty,
            COALESCE(SUM("quantity") FILTER (WHERE "quantity" < 0), 0)::int as negative_qty
     FROM "ProductInventoryLevel"
     WHERE "externalRef" IS NOT NULL
     GROUP BY "externalRef"
     ORDER BY variant_count DESC`
  );

  console.log("  ref | name                        | variants | net_qty    | +qty       | -qty       | +items | -items | 0items");
  console.log("  ----+-----------------------------+----------+------------+------------+------------+--------+--------+-------");
  for (const b of balances) {
    const ref = b.externalRef.padStart(2);
    const name = wName(b.externalRef).padEnd(27);
    console.log(`  ${ref} | ${name} | ${String(b.variant_count).padStart(8)} | ${String(b.total_qty).padStart(10)} | ${String(b.positive_qty).padStart(10)} | ${String(b.negative_qty).padStart(10)} | ${String(b.positive_count).padStart(6)} | ${String(b.negative_count).padStart(6)} | ${String(b.zero_count).padStart(5)}`);
  }

  // ── Phase 2: Infer transfer ROUTES by shared products across warehouses ────
  console.log("\n── PHASE 2: PRODUCTS ACROSS MULTIPLE WAREHOUSES (transfer evidence) ──");
  const multiWarehouse = await prisma.$queryRawUnsafe<Array<{
    warehouse_count: number;
    product_count: number;
  }>>(
    `SELECT warehouse_count, COUNT(*)::int as product_count
     FROM (
       SELECT "productId", COUNT(DISTINCT "externalRef")::int as warehouse_count
       FROM "ProductInventoryLevel"
       WHERE "externalRef" IS NOT NULL
       GROUP BY "productId"
     ) sub
     GROUP BY warehouse_count
     ORDER BY warehouse_count`
  );
  console.log("  Products by number of warehouses they appear in:");
  for (const row of multiWarehouse) {
    console.log(`    ${row.warehouse_count} warehouses: ${row.product_count} products`);
  }

  // ── Phase 3: Warehouse PAIRS — which warehouses share the most products? ──
  console.log("\n── PHASE 3: WAREHOUSE PAIRS (shared products = likely transfer routes) ──");
  const warehousePairs = await prisma.$queryRawUnsafe<Array<{
    ref_a: string;
    ref_b: string;
    shared_products: number;
  }>>(
    `SELECT a."externalRef" as ref_a, b."externalRef" as ref_b,
            COUNT(DISTINCT a."productId")::int as shared_products
     FROM "ProductInventoryLevel" a
     JOIN "ProductInventoryLevel" b
       ON a."productId" = b."productId"
       AND a."externalRef" < b."externalRef"
       AND a."externalRef" IS NOT NULL
       AND b."externalRef" IS NOT NULL
     GROUP BY a."externalRef", b."externalRef"
     HAVING COUNT(DISTINCT a."productId") > 10
     ORDER BY shared_products DESC
     LIMIT 30`
  );
  console.log("  Route (A→B)                                    | Shared Products");
  console.log("  -----------------------------------------------+----------------");
  for (const row of warehousePairs) {
    const nameA = wName(row.ref_a);
    const nameB = wName(row.ref_b);
    const route = `${row.ref_a.padStart(2)} (${nameA}) ↔ ${row.ref_b.padStart(2)} (${nameB})`;
    console.log(`  ${route.padEnd(47)} | ${row.shared_products}`);
  }

  // ── Phase 4: Seller warehouses (35-40) — which products do they share with 01? ──
  console.log("\n── PHASE 4: SELLER WAREHOUSES vs BODEGA PRINCIPAL — overlap ──");
  for (const sellerRef of ["35", "36", "37", "38", "39", "40"]) {
    const overlap = await prisma.$queryRawUnsafe<Array<{
      shared: number;
      seller_only: number;
      seller_total: number;
    }>>(
      `SELECT
        COUNT(DISTINCT CASE WHEN b."productId" IS NOT NULL THEN a."productId" END)::int as shared,
        COUNT(DISTINCT CASE WHEN b."productId" IS NULL THEN a."productId" END)::int as seller_only,
        COUNT(DISTINCT a."productId")::int as seller_total
       FROM "ProductInventoryLevel" a
       LEFT JOIN "ProductInventoryLevel" b
         ON a."productId" = b."productId" AND b."externalRef" = '01'
       WHERE a."externalRef" = $1`,
      sellerRef
    );
    if (overlap.length > 0 && overlap[0].seller_total > 0) {
      const o = overlap[0];
      console.log(`  ${sellerRef} (${wName(sellerRef)}): total=${o.seller_total} | shared_with_01=${o.shared} | seller_only=${o.seller_only}`);
    } else {
      console.log(`  ${sellerRef} (${wName(sellerRef)}): no data`);
    }
  }

  // ── Phase 5: Store warehouses — overlap with Bodega Principal ─────────────
  console.log("\n── PHASE 5: STORE WAREHOUSES vs BODEGA PRINCIPAL — overlap ──");
  for (const storeRef of ["00", "02", "03", "23", "29"]) {
    const overlap = await prisma.$queryRawUnsafe<Array<{
      shared: number;
      total: number;
      store_positive_qty: number;
    }>>(
      `SELECT
        COUNT(DISTINCT CASE WHEN b."productId" IS NOT NULL THEN a."productId" END)::int as shared,
        COUNT(DISTINCT a."productId")::int as total,
        COALESCE(SUM(a."quantity") FILTER (WHERE a."quantity" > 0), 0)::int as store_positive_qty
       FROM "ProductInventoryLevel" a
       LEFT JOIN "ProductInventoryLevel" b
         ON a."productId" = b."productId" AND b."externalRef" = '01'
       WHERE a."externalRef" = $1`,
      storeRef
    );
    if (overlap.length > 0) {
      const o = overlap[0];
      console.log(`  ${storeRef} (${wName(storeRef)}): total_products=${o.total} | shared_with_01=${o.shared} | positive_qty=${o.store_positive_qty}`);
    }
  }

  // ── Phase 6: Production flow 04→01 — products in both ─────────────────────
  console.log("\n── PHASE 6: PRODUCTION FLOW — Bodega 04 → Bodega 01 ──");
  const prodFlow = await prisma.$queryRawUnsafe<Array<{
    both: number;
    only_04: number;
    only_01: number;
    total_04: number;
    total_01: number;
  }>>(
    `SELECT
      COUNT(DISTINCT CASE WHEN a."externalRef" = '04' AND b."externalRef" = '01' THEN a."productId" END)::int as both,
      COUNT(DISTINCT CASE WHEN a."externalRef" = '04' AND b."productId" IS NULL THEN a."productId" END)::int as only_04,
      COUNT(DISTINCT CASE WHEN a."externalRef" = '01' AND c."productId" IS NULL THEN a."productId" END)::int as only_01,
      COUNT(DISTINCT CASE WHEN a."externalRef" = '04' THEN a."productId" END)::int as total_04,
      COUNT(DISTINCT CASE WHEN a."externalRef" = '01' THEN a."productId" END)::int as total_01
     FROM "ProductInventoryLevel" a
     LEFT JOIN "ProductInventoryLevel" b
       ON a."productId" = b."productId" AND b."externalRef" = '01' AND a."externalRef" = '04'
     LEFT JOIN "ProductInventoryLevel" c
       ON a."productId" = c."productId" AND c."externalRef" = '04' AND a."externalRef" = '01'`
  );
  if (prodFlow.length > 0) {
    const p = prodFlow[0];
    console.log(`  Bodega 04 products: ${p.total_04}`);
    console.log(`  Bodega 01 products: ${p.total_01}`);
    console.log(`  In BOTH 04 and 01: ${p.both}`);
    console.log(`  Only in 04 (WIP not yet finished): ${p.only_04}`);
    console.log(`  Only in 01 (finished, no WIP): ${p.only_01}`);
  }

  // ── Phase 7: Import flow — containers → 24 (staging) → 01 ────────────────
  console.log("\n── PHASE 7: IMPORT FLOW — Containers → Staging → Principal ──");
  const importRefs = ["42", "43", "44", "45", "46", "48", "49"];
  for (const ref of importRefs) {
    const flow = await prisma.$queryRawUnsafe<Array<{
      total: number;
      shared_24: number;
      shared_01: number;
    }>>(
      `SELECT
        COUNT(DISTINCT a."productId")::int as total,
        COUNT(DISTINCT CASE WHEN b."productId" IS NOT NULL THEN a."productId" END)::int as shared_24,
        COUNT(DISTINCT CASE WHEN c."productId" IS NOT NULL THEN a."productId" END)::int as shared_01
       FROM "ProductInventoryLevel" a
       LEFT JOIN "ProductInventoryLevel" b
         ON a."productId" = b."productId" AND b."externalRef" = '24'
       LEFT JOIN "ProductInventoryLevel" c
         ON a."productId" = c."productId" AND c."externalRef" = '01'
       WHERE a."externalRef" = $1`,
      ref
    );
    if (flow.length > 0 && flow[0].total > 0) {
      const f = flow[0];
      console.log(`  ${ref} (${wName(ref)}): products=${f.total} | shared_with_24=${f.shared_24} | shared_with_01=${f.shared_01}`);
    }
  }

  // ── Phase 8: Franchise warehouses — activity patterns ─────────────────────
  console.log("\n── PHASE 8: FRANCHISE WAREHOUSES — activity patterns ──");
  const franchiseRefs = ["08", "09", "10", "11", "12", "13", "14", "15", "21"];
  for (const ref of franchiseRefs) {
    const stats = await prisma.$queryRawUnsafe<Array<{
      total: number;
      total_qty: number;
      shared_01: number;
    }>>(
      `SELECT
        COUNT(DISTINCT a."productId")::int as total,
        COALESCE(SUM(a."quantity"), 0)::int as total_qty,
        COUNT(DISTINCT CASE WHEN b."productId" IS NOT NULL THEN a."productId" END)::int as shared_01
       FROM "ProductInventoryLevel" a
       LEFT JOIN "ProductInventoryLevel" b
         ON a."productId" = b."productId" AND b."externalRef" = '01'
       WHERE a."externalRef" = $1`,
      ref
    );
    if (stats.length > 0 && stats[0].total > 0) {
      const s = stats[0];
      console.log(`  ${ref} (${wName(ref)}): products=${s.total} | net_qty=${s.total_qty} | shared_with_01=${s.shared_01}`);
    }
  }

  // ── Phase 9: Top products by warehouse spread ─────────────────────────────
  console.log("\n── PHASE 9: TOP PRODUCTS BY WAREHOUSE SPREAD (most distributed) ──");
  const topSpread = await prisma.$queryRawUnsafe<Array<{
    productId: string;
    warehouse_count: number;
    total_qty: number;
    warehouses: string;
  }>>(
    `SELECT p."productId",
            COUNT(DISTINCT p."externalRef")::int as warehouse_count,
            COALESCE(SUM(p."quantity"), 0)::int as total_qty,
            STRING_AGG(DISTINCT p."externalRef", ',' ORDER BY p."externalRef") as warehouses
     FROM "ProductInventoryLevel" p
     WHERE p."externalRef" IS NOT NULL
     GROUP BY p."productId"
     ORDER BY warehouse_count DESC
     LIMIT 10`
  );
  for (const row of topSpread) {
    console.log(`  ${row.productId.substring(0,36)} | warehouses=${row.warehouse_count} | qty=${row.total_qty} | refs=[${row.warehouses}]`);
  }

  console.log("\n=== FORENSIC REPORT COMPLETE ===");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FATAL:", e);
  await prisma.$disconnect();
  process.exit(1);
});
