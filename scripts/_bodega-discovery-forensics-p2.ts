/**
 * _bodega-discovery-forensics-p2.ts
 *
 * CASTILLITOS-SAG-BODEGA-DISCOVERY-01 — Phase 2
 * Deeper analysis: unknown warehouses, inventory by warehouse, transfers.
 *
 * Usage: npx tsx scripts/_bodega-discovery-forensics-p2.ts
 */

import { prisma } from "../lib/prisma";
import { CASTILLITOS_BODEGAS } from "../lib/sag/master-data/castillitos-overrides";

async function main() {
  console.log("=== BODEGA DISCOVERY — PHASE 2: DEEP ANALYSIS ===\n");

  // ── Warehouse codes NOT in master registry ────────────────────────────────
  console.log("── UNKNOWN WAREHOUSE CODES (in ProductInventoryLevel but NOT in CASTILLITOS_BODEGAS) ──");
  const allWarehouseIds = await prisma.$queryRawUnsafe<Array<{
    warehouseId: string;
    externalRef: string | null;
    variant_count: number;
    total_qty: number;
  }>>(
    `SELECT "warehouseId", "externalRef",
            COUNT(*)::int as variant_count,
            COALESCE(SUM("quantity"), 0)::int as total_qty
     FROM "ProductInventoryLevel"
     GROUP BY "warehouseId", "externalRef"
     ORDER BY "warehouseId"::int ASC`
  );

  const knownCodes = new Set(CASTILLITOS_BODEGAS.values);
  for (const row of allWarehouseIds) {
    const ref = row.externalRef ?? "—";
    const isKnown = knownCodes.has(ref);
    const label = CASTILLITOS_BODEGAS.labels[ref] ?? "NOT IN REGISTRY";
    const marker = isKnown ? "✓" : "⚠ UNKNOWN";
    console.log(`  ${marker} | wId=${row.warehouseId.padStart(2)} | ref=${ref.padStart(2)} | variants=${String(row.variant_count).padStart(6)} | qty=${String(row.total_qty).padStart(10)} | ${label}`);
  }

  // ── Seller warehouses (35-40) — detail ────────────────────────────────────
  console.log("\n── SELLER MALETA WAREHOUSES (35-40) — inventory detail ──");
  const sellerWarehouses = ["35", "36", "37", "38", "39", "40"];
  for (const ref of sellerWarehouses) {
    const data = await prisma.$queryRawUnsafe<Array<{
      variant_count: number;
      total_qty: number;
      positive_variants: number;
      negative_variants: number;
      zero_variants: number;
    }>>(
      `SELECT COUNT(*)::int as variant_count,
              COALESCE(SUM("quantity"), 0)::int as total_qty,
              COUNT(*) FILTER (WHERE "quantity" > 0)::int as positive_variants,
              COUNT(*) FILTER (WHERE "quantity" < 0)::int as negative_variants,
              COUNT(*) FILTER (WHERE "quantity" = 0)::int as zero_variants
       FROM "ProductInventoryLevel"
       WHERE "externalRef" = $1`,
      ref
    );
    if (data.length > 0) {
      const d = data[0];
      const label = CASTILLITOS_BODEGAS.labels[ref] ?? "UNKNOWN";
      console.log(`  ${ref} (${label}): variants=${d.variant_count} | qty=${d.total_qty} | positive=${d.positive_variants} | negative=${d.negative_variants} | zero=${d.zero_variants}`);
    }
  }

  // ── Top warehouses by POSITIVE inventory (active locations) ───────────────
  console.log("\n── TOP WAREHOUSES BY POSITIVE INVENTORY ──");
  const topPositive = await prisma.$queryRawUnsafe<Array<{
    externalRef: string;
    positive_variants: number;
    positive_qty: number;
  }>>(
    `SELECT "externalRef",
            COUNT(*) FILTER (WHERE "quantity" > 0)::int as positive_variants,
            COALESCE(SUM("quantity") FILTER (WHERE "quantity" > 0), 0)::int as positive_qty
     FROM "ProductInventoryLevel"
     WHERE "externalRef" IS NOT NULL
     GROUP BY "externalRef"
     HAVING COUNT(*) FILTER (WHERE "quantity" > 0) > 0
     ORDER BY positive_qty DESC
     LIMIT 20`
  );
  for (const row of topPositive) {
    const label = CASTILLITOS_BODEGAS.labels[row.externalRef] ?? "NOT IN REGISTRY";
    console.log(`  ref=${row.externalRef.padStart(2)} | active_variants=${String(row.positive_variants).padStart(5)} | positive_qty=${String(row.positive_qty).padStart(10)} | ${label}`);
  }

  // ── Store-to-bodega correlation via SaleRecord ────────────────────────────
  console.log("\n── SaleRecord stores — detailed stats ──");
  const storeStats = await prisma.$queryRawUnsafe<Array<{
    storeSlug: string | null;
    storeName: string | null;
    sale_count: number;
    total_amount: number;
    earliest: Date | null;
    latest: Date | null;
  }>>(
    `SELECT "storeSlug", "storeName",
            COUNT(*)::int as sale_count,
            COALESCE(SUM("totalAmount"), 0)::int as total_amount,
            MIN("saleDate") as earliest,
            MAX("saleDate") as latest
     FROM "SaleRecord"
     GROUP BY "storeSlug", "storeName"
     ORDER BY sale_count DESC`
  );
  for (const row of storeStats) {
    console.log(`  ${(row.storeSlug ?? "NULL").padEnd(20)} | ${(row.storeName ?? "NULL").padEnd(20)} | sales=${String(row.sale_count).padStart(6)} | $${String(row.total_amount).padStart(12)} | ${row.earliest?.toISOString().slice(0,10) ?? "—"} → ${row.latest?.toISOString().slice(0,10) ?? "—"}`);
  }

  // ── SaleRecord — SAG fuente/document type distribution ────────────────────
  console.log("\n── SaleRecord — fuente/source code distribution ──");
  try {
    const fuenteDist = await prisma.$queryRawUnsafe<Array<{
      sourceCode: string | null;
      sale_count: number;
    }>>(
      `SELECT "sourceCode", COUNT(*)::int as sale_count
       FROM "SaleRecord"
       GROUP BY "sourceCode"
       ORDER BY sale_count DESC
       LIMIT 15`
    );
    for (const row of fuenteDist) {
      console.log(`  sourceCode=${(row.sourceCode ?? "NULL").padEnd(10)} | sales=${row.sale_count}`);
    }
  } catch (e: unknown) {
    console.log(`  ERROR: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── ProductionOrder — sourceCode distribution ─────────────────────────────
  console.log("\n── ProductionOrder — sourceCode distribution ──");
  const prodSourceDist = await prisma.$queryRawUnsafe<Array<{
    sourceCode: string;
    count: number;
    open_count: number;
  }>>(
    `SELECT "sourceCode",
            COUNT(*)::int as count,
            COUNT(*) FILTER (WHERE "isClosed" = false)::int as open_count
     FROM "ProductionOrder"
     GROUP BY "sourceCode"
     ORDER BY count DESC`
  );
  for (const row of prodSourceDist) {
    console.log(`  sourceCode=${row.sourceCode} | total=${row.count} | open=${row.open_count}`);
  }

  // ── Inventory warehouse ID ↔ externalRef mapping anomalies ────────────────
  console.log("\n── WAREHOUSE ID vs EXTERNAL REF MAPPING ──");
  console.log("  (checking if warehouseId is always externalRef + offset)");
  const mapping = await prisma.$queryRawUnsafe<Array<{
    warehouseId: string;
    externalRef: string | null;
  }>>(
    `SELECT DISTINCT "warehouseId", "externalRef"
     FROM "ProductInventoryLevel"
     ORDER BY "warehouseId"::int ASC`
  );
  for (const row of mapping) {
    const wId = parseInt(row.warehouseId);
    const ref = row.externalRef ? parseInt(row.externalRef) : null;
    const offset = ref !== null ? wId - ref : null;
    console.log(`  warehouseId=${row.warehouseId.padStart(2)} → externalRef=${(row.externalRef ?? "NULL").padStart(2)} | offset=${offset ?? "N/A"}`);
  }

  console.log("\n=== PHASE 2 COMPLETE ===");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FATAL:", e);
  await prisma.$disconnect();
  process.exit(1);
});
