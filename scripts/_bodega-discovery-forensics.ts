/**
 * _bodega-discovery-forensics.ts
 *
 * CASTILLITOS-SAG-BODEGA-DISCOVERY-01
 * READ ONLY forensic script — discovers warehouse usage from Prisma data.
 *
 * Usage: npx tsx scripts/_bodega-discovery-forensics.ts
 */

import { prisma } from "../lib/prisma";
import { CASTILLITOS_BODEGAS } from "../lib/sag/master-data/castillitos-overrides";

async function main() {
  console.log("=== CASTILLITOS BODEGA DISCOVERY — FORENSIC REPORT ===\n");

  // ── Phase 1: Registered bodegas from master data ──────────────────────────
  console.log("── PHASE 1: CASTILLITOS_BODEGAS (master registry) ──");
  console.log(`Total registered: ${CASTILLITOS_BODEGAS.values.length}`);
  for (const code of CASTILLITOS_BODEGAS.values) {
    console.log(`  ${code.padStart(2, " ")} = ${CASTILLITOS_BODEGAS.labels[code]}`);
  }

  // ── Phase 2: ProductInventoryLevel — per-warehouse stock ──────────────────
  console.log("\n── PHASE 2: ProductInventoryLevel — warehouse distribution ──");
  try {
    const invLevels = await prisma.$queryRawUnsafe<Array<{
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
       ORDER BY variant_count DESC`
    );
    if (invLevels.length === 0) {
      console.log("  (no data)");
    }
    for (const row of invLevels) {
      const label = CASTILLITOS_BODEGAS.labels[row.warehouseId] ?? row.externalRef ?? "UNKNOWN";
      console.log(`  warehouseId=${row.warehouseId} | ref=${row.externalRef ?? "—"} | variants=${row.variant_count} | qty=${row.total_qty} | label=${label}`);
    }
  } catch (e: unknown) {
    console.log(`  ERROR: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Phase 3: ProductionOrder — warehouse usage ────────────────────────────
  console.log("\n── PHASE 3: ProductionOrder — warehouse distribution ──");
  try {
    const prodOrders = await prisma.$queryRawUnsafe<Array<{
      warehouseCode: string | null;
      warehouseName: string | null;
      order_count: number;
      open_count: number;
      earliest: Date | null;
      latest: Date | null;
    }>>(
      `SELECT "warehouseCode", "warehouseName",
              COUNT(*)::int as order_count,
              COUNT(*) FILTER (WHERE "isClosed" = false)::int as open_count,
              MIN("documentDate") as earliest,
              MAX("documentDate") as latest
       FROM "ProductionOrder"
       GROUP BY "warehouseCode", "warehouseName"
       ORDER BY order_count DESC`
    );
    if (prodOrders.length === 0) {
      console.log("  (no data)");
    }
    for (const row of prodOrders) {
      console.log(`  code=${row.warehouseCode ?? "NULL"} | name=${row.warehouseName ?? "NULL"} | orders=${row.order_count} | open=${row.open_count} | range=${row.earliest?.toISOString().slice(0,10) ?? "—"} → ${row.latest?.toISOString().slice(0,10) ?? "—"}`);
    }
  } catch (e: unknown) {
    console.log(`  ERROR: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Phase 4: ProductionOrderLine — reference distribution ─────────────────
  console.log("\n── PHASE 4: ProductionOrderLine — summary ──");
  try {
    const prodLines = await prisma.$queryRawUnsafe<Array<{
      line_count: number;
      distinct_refs: number;
      total_qty: number;
    }>>(
      `SELECT COUNT(*)::int as line_count,
              COUNT(DISTINCT "referenceCode")::int as distinct_refs,
              COALESCE(SUM("quantityOrdered"), 0)::int as total_qty
       FROM "ProductionOrderLine"`
    );
    for (const row of prodLines) {
      console.log(`  total_lines=${row.line_count} | distinct_references=${row.distinct_refs} | total_qty_ordered=${row.total_qty}`);
    }
  } catch (e: unknown) {
    console.log(`  ERROR: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Phase 5: CommercialCoverageSnapshot — inventory snapshot ──────────────
  console.log("\n── PHASE 5: CommercialCoverageSnapshot — summary ──");
  try {
    const covSnap = await prisma.$queryRawUnsafe<Array<{
      org_count: number;
      total_rows: number;
      distinct_refs: number;
      snapshot_count: number;
      latest_snapshot: Date | null;
      oldest_snapshot: Date | null;
    }>>(
      `SELECT COUNT(DISTINCT "organizationId")::int as org_count,
              COUNT(*)::int as total_rows,
              COUNT(DISTINCT "refCode")::int as distinct_refs,
              COUNT(DISTINCT "snapshotAt")::int as snapshot_count,
              MAX("snapshotAt") as latest_snapshot,
              MIN("snapshotAt") as oldest_snapshot
       FROM "CommercialCoverageSnapshot"`
    );
    for (const row of covSnap) {
      console.log(`  orgs=${row.org_count} | rows=${row.total_rows} | refs=${row.distinct_refs} | snapshots=${row.snapshot_count}`);
      console.log(`  range=${row.oldest_snapshot?.toISOString().slice(0,10) ?? "—"} → ${row.latest_snapshot?.toISOString().slice(0,10) ?? "—"}`);
    }

    // Line distribution
    const lineDistrib = await prisma.$queryRawUnsafe<Array<{
      line: string;
      ref_count: number;
      total_disponible: number;
      total_pending: number;
    }>>(
      `SELECT "line",
              COUNT(DISTINCT "refCode")::int as ref_count,
              COALESCE(SUM("disponible"), 0)::int as total_disponible,
              COALESCE(SUM("pendingOrdersQty"), 0)::int as total_pending
       FROM "CommercialCoverageSnapshot"
       WHERE "snapshotAt" = (SELECT MAX("snapshotAt") FROM "CommercialCoverageSnapshot")
       GROUP BY "line"
       ORDER BY ref_count DESC`
    );
    console.log("  Latest snapshot by line:");
    for (const row of lineDistrib) {
      console.log(`    ${row.line} | refs=${row.ref_count} | disponible=${row.total_disponible} | pending=${row.total_pending}`);
    }
  } catch (e: unknown) {
    console.log(`  ERROR: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Phase 6: CrmQuoteLineItem — warehouse references ─────────────────────
  console.log("\n── PHASE 6: CrmQuoteLineItem — warehouse distribution ──");
  try {
    const crmWh = await prisma.$queryRawUnsafe<Array<{
      warehouseName: string | null;
      warehouseId: string | null;
      line_count: number;
    }>>(
      `SELECT "warehouseName", "warehouseId", COUNT(*)::int as line_count
       FROM "CrmQuoteLineItem"
       GROUP BY "warehouseName", "warehouseId"
       ORDER BY line_count DESC
       LIMIT 20`
    );
    if (crmWh.length === 0) {
      console.log("  (no data)");
    }
    for (const row of crmWh) {
      console.log(`  name=${row.warehouseName ?? "NULL"} | id=${row.warehouseId ?? "NULL"} | lines=${row.line_count}`);
    }
  } catch (e: unknown) {
    console.log(`  ERROR: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Phase 7: SaleRecord — store distribution ─────────────────────────────
  console.log("\n── PHASE 7: SaleRecord — store/point-of-sale distribution ──");
  try {
    const stores = await prisma.$queryRawUnsafe<Array<{
      storeSlug: string | null;
      storeName: string | null;
      sale_count: number;
    }>>(
      `SELECT "storeSlug", "storeName", COUNT(*)::int as sale_count
       FROM "SaleRecord"
       GROUP BY "storeSlug", "storeName"
       ORDER BY sale_count DESC
       LIMIT 20`
    );
    if (stores.length === 0) {
      console.log("  (no data)");
    }
    for (const row of stores) {
      console.log(`  slug=${row.storeSlug ?? "NULL"} | name=${row.storeName ?? "NULL"} | sales=${row.sale_count}`);
    }
  } catch (e: unknown) {
    console.log(`  ERROR: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Phase 8: CollectionRecord — punto de cobro ────────────────────────────
  console.log("\n── PHASE 8: CollectionRecord — store distribution ──");
  try {
    const collections = await prisma.$queryRawUnsafe<Array<{
      storeSlug: string | null;
      storeName: string | null;
      coll_count: number;
    }>>(
      `SELECT "storeSlug", "storeName", COUNT(*)::int as coll_count
       FROM "CollectionRecord"
       GROUP BY "storeSlug", "storeName"
       ORDER BY coll_count DESC
       LIMIT 20`
    );
    if (collections.length === 0) {
      console.log("  (no data)");
    }
    for (const row of collections) {
      console.log(`  slug=${row.storeSlug ?? "NULL"} | name=${row.storeName ?? "NULL"} | collections=${row.coll_count}`);
    }
  } catch (e: unknown) {
    console.log(`  ERROR: ${e instanceof Error ? e.message : String(e)}`);
  }

  console.log("\n=== FORENSIC REPORT COMPLETE ===");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FATAL:", e);
  await prisma.$disconnect();
  process.exit(1);
});
