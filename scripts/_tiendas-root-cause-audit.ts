/**
 * TIENDAS-INVENTORY-ROOT-CAUSE-01 — FASE 1+2 database audit
 * Read-only queries against castillitos WH 11 (BODEGA SANDIEGO)
 * Usage: DATABASE_URL=... npx tsx scripts/_tiendas-root-cause-audit.ts
 */
import { prisma } from "../lib/prisma";

async function audit() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" }, select: { id: true } });
  if (!org) { console.log("No org"); return; }
  const db = prisma as any;
  const orgId = org.id;

  console.log("ORG ID:", orgId);
  console.log("\n=== FASE 1: WH 11 PIL Overview ===");

  const totalPil = await db.productInventoryLevel.count({
    where: { organizationId: orgId, warehouseId: "11" },
  });
  console.log("Total PIL records (WH 11):", totalPil);

  // Get all records for analysis
  const allRecords: Array<{
    productId: string | null; variantId: string | null;
    quantity: number; reservedQty: number;
    externalRef: string | null; updatedAt: Date | null;
  }> = await db.productInventoryLevel.findMany({
    where: { organizationId: orgId, warehouseId: "11" },
    select: { productId: true, variantId: true, quantity: true, reservedQty: true, externalRef: true, updatedAt: true },
  });

  let withProduct = 0, withVariant = 0, bothNull = 0, onlyProduct = 0, onlyVariant = 0, bothPresent = 0;
  let totalQty = 0, totalRsv = 0, totalAvail = 0;
  let maxUpdated: Date | null = null;
  const productIds = new Set<string>();
  const variantIds = new Set<string>();

  for (const r of allRecords) {
    const hasPid = r.productId != null;
    const hasVid = r.variantId != null;
    if (hasPid) { withProduct++; productIds.add(r.productId!); }
    if (hasVid) { withVariant++; variantIds.add(r.variantId!); }
    if (!hasPid && !hasVid) bothNull++;
    if (hasPid && !hasVid) onlyProduct++;
    if (!hasPid && hasVid) onlyVariant++;
    if (hasPid && hasVid) bothPresent++;

    totalQty += r.quantity;
    totalRsv += r.reservedQty;
    totalAvail += Math.max(0, r.quantity - r.reservedQty);
    if (r.updatedAt && (!maxUpdated || r.updatedAt > maxUpdated)) maxUpdated = r.updatedAt;
  }

  console.log("PIL with productId:", withProduct);
  console.log("PIL with variantId:", withVariant);
  console.log("PIL with BOTH null:", bothNull);
  console.log("PIL with productId only (no variant):", onlyProduct);
  console.log("PIL with variantId only (no product):", onlyVariant);
  console.log("PIL with BOTH present:", bothPresent);
  console.log("Distinct productId count:", productIds.size);
  console.log("Distinct variantId count:", variantIds.size);
  console.log("Total quantity:", totalQty);
  console.log("Total reservedQty:", totalRsv);
  console.log("Total available (qty - rsv, min 0):", totalAvail);
  console.log("Max updatedAt:", maxUpdated?.toISOString() ?? "null");

  // externalRef
  const extRefSet = new Set(allRecords.map(r => r.externalRef));
  console.log("\nDistinct externalRef values:", extRefSet.size, "=>", [...extRefSet].map(v => `"${v}"`).join(", "));

  // Sample raw records
  console.log("\n=== PIL Sample (first 10, raw fields) ===");
  for (const r of allRecords.slice(0, 10)) {
    console.log(`  pid=${r.productId?.slice(0,16) ?? "NULL"} vid=${r.variantId?.slice(0,16) ?? "NULL"} extRef="${r.externalRef}" qty=${r.quantity} rsv=${r.reservedQty}`);
  }

  // Resolve product/variant for sample
  console.log("\n=== Resolve product/variant for first 5 ===");
  for (const r of allRecords.slice(0, 5)) {
    let pInfo = "NULL";
    let vInfo = "NULL";
    if (r.productId) {
      try {
        const p = await db.productEntity.findUnique({ where: { id: r.productId }, select: { sku: true, name: true } });
        pInfo = p ? `sku="${p.sku}" name="${(p.name || "").slice(0,40)}"` : "NOT FOUND";
      } catch { pInfo = "QUERY ERROR"; }
    }
    if (r.variantId) {
      try {
        const v = await db.productVariant.findUnique({ where: { id: r.variantId }, select: { sku: true } });
        vInfo = v ? `sku="${v.sku}"` : "NOT FOUND";
      } catch { vInfo = "QUERY ERROR"; }
    }
    console.log(`  product: ${pInfo} | variant: ${vInfo} | available: ${Math.max(0, r.quantity - r.reservedQty)}`);
  }

  // Test the include query (same as getStoreInventoryByWarehouse)
  console.log("\n=== Test include query (same as getStoreInventoryByWarehouse) ===");
  try {
    const incl = await db.productInventoryLevel.findMany({
      where: { organizationId: orgId, warehouseId: "11" },
      include: {
        product: { select: { name: true, sku: true } },
        variant: { include: { attributes: { select: { key: true, value: true } } } },
      },
      take: 5,
    });
    console.log("Include query SUCCEEDED, results:", incl.length);
    for (const lv of incl) {
      const ref = lv.variant?.sku ?? lv.product?.sku ?? lv.externalRef ?? "";
      console.log(`  ref="${ref}" product.sku="${lv.product?.sku ?? "NULL"}" variant.sku="${lv.variant?.sku ?? "NULL"}" qty=${lv.quantity}`);
    }

    // Count how many pass the `if (!ref) continue` filter
    const allIncl = await db.productInventoryLevel.findMany({
      where: { organizationId: orgId, warehouseId: "11" },
      include: {
        product: { select: { name: true, sku: true } },
        variant: { include: { attributes: { select: { key: true, value: true } } } },
      },
    });
    let passedFilter = 0;
    let skippedNoRef = 0;
    for (const lv of allIncl) {
      const ref = lv.variant?.sku ?? lv.product?.sku ?? lv.externalRef ?? "";
      if (!ref) { skippedNoRef++; continue; }
      passedFilter++;
    }
    console.log(`\nTotal include results: ${allIncl.length}`);
    console.log(`Passed ref filter: ${passedFilter}`);
    console.log(`Skipped (no ref): ${skippedNoRef}`);
    console.log(`>>> This is what getStoreInventoryByWarehouse would return: ${passedFilter} items`);

  } catch (e: any) {
    console.log("INCLUDE QUERY FAILED:", e.message?.slice(0, 400));
    console.log("\n>>> ROOT CAUSE: The include query crashes. getStoreInventoryByWarehouse catches this silently and returns [].");
  }

  // Check the store identifier format
  console.log("\n=== Store warehouseCode mapping ===");
  // getStoreWarehouses uses sagWarehouseCode = wh.warehouseId from BODEGAS lookup
  // But what does the InventarioTab pass?
  // It passes store.sagWarehouseCode which comes from StoreCard.store.sagWarehouseCode
  // This comes from the StoreLocation type which is built in getStoreWarehouses

  await prisma.$disconnect();
}

audit().catch((e: any) => { console.error(e); process.exit(1); });
