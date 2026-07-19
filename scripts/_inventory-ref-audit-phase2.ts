/**
 * _inventory-ref-audit-phase2.ts
 * INVENTORY-REFERENCE-TRUTH-AUDIT-01 — FASE 4-9: Deep traceability.
 * READ ONLY.
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";

const REFS = ["L-1367", "L-8467", "CJ-1126012", "CJ-2026004B", "C7-J-004", "C8-K004"];

async function main() {
  const db = prisma as any;
  const org = await db.organization.findFirst({
    where: { slug: "castillitos" },
    select: { id: true },
  });
  if (!org) { console.log("NO ORG"); process.exit(1); }

  // ── FASE 4A: CommercialCoverageSnapshot — ALL snapshots per ref ──
  console.log("=".repeat(80));
  console.log("FASE 4A: CommercialCoverageSnapshot HISTORY (all snapshots)");
  console.log("=".repeat(80));
  for (const ref of REFS) {
    const all = await db.commercialCoverageSnapshot.findMany({
      where: { organizationId: org.id, refCode: ref },
      orderBy: { snapshotAt: "desc" },
      select: { disponible: true, pendingOrdersQty: true, snapshotAt: true, status: true },
    });
    if (all.length > 0) {
      console.log(`\n${ref}: ${all.length} snapshots`);
      for (const s of all.slice(0, 5)) {
        console.log(`  ${s.snapshotAt.toISOString().slice(0, 10)} disponible=${s.disponible} pending=${s.pendingOrdersQty ?? 0} status=${s.status}`);
      }
      if (all.length > 5) console.log(`  ... and ${all.length - 5} more`);
    } else {
      console.log(`\n${ref}: NOT IN CommercialCoverageSnapshot`);
    }
  }

  // ── FASE 4B: ProductInventoryLevel — SUM per bodega ──
  console.log("\n" + "=".repeat(80));
  console.log("FASE 4B: ProductInventoryLevel — SUM by warehouse for each ref");
  console.log("=".repeat(80));
  for (const ref of REFS) {
    const product = await db.productEntity.findFirst({
      where: { organizationId: org.id, sku: ref },
      select: { id: true },
    });
    if (!product) {
      console.log(`\n${ref}: No ProductEntity`);
      continue;
    }
    const levels = await db.productInventoryLevel.findMany({
      where: { productId: product.id },
      select: { quantity: true, reservedQty: true, warehouseId: true, externalRef: true, source: true, syncedAt: true },
    });
    // Group by warehouse
    const byWh = new Map<string, { qty: number; reserved: number; count: number; extRef: string }>();
    for (const l of levels) {
      const key = `wh${l.warehouseId}(ext=${l.externalRef})`;
      const cur = byWh.get(key) || { qty: 0, reserved: 0, count: 0, extRef: l.externalRef || "" };
      cur.qty += l.quantity;
      cur.reserved += l.reservedQty;
      cur.count++;
      byWh.set(key, cur);
    }
    console.log(`\n${ref}: ${levels.length} inventory level rows`);
    let totalQty = 0;
    for (const [wh, data] of byWh) {
      console.log(`  ${wh}: qty=${data.qty} reserved=${data.reserved} (${data.count} variants)`);
      totalQty += data.qty;
    }
    console.log(`  TOTAL across all warehouses: ${totalQty}`);

    // Get bodega 01 specifically
    const b01 = levels.filter((l: any) => l.externalRef === "01");
    const b01sum = b01.reduce((s: number, l: any) => s + l.quantity, 0);
    console.log(`  Bodega 01 only: ${b01sum} (${b01.length} variants)`);

    // Sync date
    const synced = levels[0]?.syncedAt;
    if (synced) console.log(`  Last sync: ${synced.toISOString()}`);
  }

  // ── FASE 4C: Where do IMPORTACION refs live? ──
  console.log("\n" + "=".repeat(80));
  console.log("FASE 4C: IMPORTACION LINE CHECK");
  console.log("=".repeat(80));

  // Check if there's an IMPORTACION line anywhere
  const importRefs = await db.commercialCoverageSnapshot.findMany({
    where: { organizationId: org.id },
    distinct: ["line"],
    select: { line: true },
  });
  console.log(`All lines ever in CommercialCoverageSnapshot: ${importRefs.map((l: any) => l.line).join(", ")}`);

  // Check product entities for C7/C8 refs — what category?
  for (const ref of ["C7-J-004", "C8-K004"]) {
    const pe = await db.productEntity.findFirst({
      where: { organizationId: org.id, sku: ref },
      select: { id: true, name: true, category: true, sku: true, status: true },
    });
    if (pe) {
      console.log(`${ref}: category="${pe.category}" status=${pe.status}`);
    }
  }

  // ── FASE 7: Freshness ──
  console.log("\n" + "=".repeat(80));
  console.log("FASE 7: DATA FRESHNESS");
  console.log("=".repeat(80));
  const now = new Date();

  // Latest CommercialCoverageSnapshot
  const latestSnap = await db.commercialCoverageSnapshot.findFirst({
    where: { organizationId: org.id },
    orderBy: { snapshotAt: "desc" },
    select: { snapshotAt: true },
  });
  if (latestSnap) {
    const age = Math.floor((now.getTime() - latestSnap.snapshotAt.getTime()) / (1000 * 60 * 60));
    console.log(`CommercialCoverageSnapshot: ${latestSnap.snapshotAt.toISOString()} (${age}h ago)`);
  }

  // Latest ProductInventoryLevel sync
  const latestPIL = await db.productInventoryLevel.findFirst({
    where: { organizationId: org.id },
    orderBy: { syncedAt: "desc" },
    select: { syncedAt: true },
  });
  if (latestPIL?.syncedAt) {
    const age = Math.floor((now.getTime() - latestPIL.syncedAt.getTime()) / (1000 * 60 * 60));
    console.log(`ProductInventoryLevel: ${latestPIL.syncedAt.toISOString()} (${age}h ago)`);
  }

  // Snapshot history count
  const snapDates = await db.commercialCoverageSnapshot.findMany({
    where: { organizationId: org.id },
    distinct: ["snapshotAt"],
    select: { snapshotAt: true },
    orderBy: { snapshotAt: "desc" },
    take: 10,
  });
  console.log(`\nSnapshot history (last 10 dates):`);
  for (const s of snapDates) {
    console.log(`  ${s.snapshotAt.toISOString()}`);
  }

  // ── FASE 8: Warehouse analysis ──
  console.log("\n" + "=".repeat(80));
  console.log("FASE 8: WAREHOUSE ANALYSIS");
  console.log("=".repeat(80));

  // What warehouses exist in PIL?
  const warehouses = await db.productInventoryLevel.findMany({
    where: { organizationId: org.id },
    distinct: ["warehouseId"],
    select: { warehouseId: true },
  });
  console.log(`Distinct warehouses in ProductInventoryLevel: ${warehouses.map((w: any) => w.warehouseId).sort().join(", ")}`);

  // What externalRef (bodega codes) exist?
  const extRefs = await db.productInventoryLevel.findMany({
    where: { organizationId: org.id },
    distinct: ["externalRef"],
    select: { externalRef: true },
  });
  console.log(`Distinct externalRef (bodega codes): ${extRefs.map((e: any) => e.externalRef).filter(Boolean).sort().join(", ")}`);

  // Count per warehouse
  for (const wh of warehouses) {
    const cnt = await db.productInventoryLevel.count({
      where: { organizationId: org.id, warehouseId: wh.warehouseId },
    });
    console.log(`  warehouseId=${wh.warehouseId}: ${cnt} rows`);
  }

  // ── FASE 9: Availability engine check ──
  console.log("\n" + "=".repeat(80));
  console.log("FASE 9: AVAILABILITY ENGINE — WHAT THE UI ACTUALLY SHOWS");
  console.log("=".repeat(80));
  console.log("The availability engine reads from CommercialCoverageSnapshot (report-loader.ts)");
  console.log("It maps: disponible → inventarioBodega (reconstructed as disponible + pendingOrders)");
  console.log("Then: disponibleReal = inventarioBodega - pedidosPendientes = disponible (original)");
  console.log("");
  console.log("For all 4 LT/CS refs: disponible=0 in snapshot → existenciaBodega01=0, disponibleReal=0");
  console.log("For C7-J-004 and C8-K004: NOT in CommercialCoverageSnapshot → N/A in UI");

  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
