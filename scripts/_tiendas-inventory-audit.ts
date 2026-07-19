/**
 * scripts/_tiendas-inventory-audit.ts
 *
 * Deep audit of Tiendas PIL inventory data.
 * Usage: DATABASE_URL=... npx tsx scripts/_tiendas-inventory-audit.ts
 */

import { prisma } from "../lib/prisma";

async function audit() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" }, select: { id: true } });
  if (!org) { console.log("No org"); return; }
  const db = prisma as any;

  // 1. PIL overview
  const pilCount = await db.productInventoryLevel.count({ where: { organizationId: org.id } });
  console.log("Total PIL records:", pilCount);

  // 2. externalRef is NOT a product ref — it's a SAG sub-code
  console.log("\n=== externalRef VALUES (NOT product refs) ===");
  const distinctExtRefs: Array<{ externalRef: string }> = await db.productInventoryLevel.findMany({
    where: { organizationId: org.id },
    select: { externalRef: true },
    distinct: ["externalRef"],
  });
  console.log("Distinct externalRef values:", distinctExtRefs.length);
  console.log("Values:", distinctExtRefs.map(r => r.externalRef).sort().join(", "));

  // 3. Product and Variant entities
  const totalProducts = await db.productEntity.count({ where: { organizationId: org.id } });
  const totalVariants = await db.productVariant.count({ where: { organizationId: org.id } });
  console.log("\n=== ENTITY COUNTS ===");
  console.log("Total ProductEntity:", totalProducts);
  console.log("Total ProductVariant:", totalVariants);

  // 4. Product SKU samples
  console.log("\n=== PRODUCT ENTITY SAMPLE ===");
  const sampleProds = await db.productEntity.findMany({
    where: { organizationId: org.id },
    select: { sku: true, name: true },
    take: 10,
  });
  for (const p of sampleProds) console.log(`  sku="${p.sku}" name="${(p.name || "").slice(0, 60)}"`);

  // 5. Variant SKU samples
  console.log("\n=== VARIANT SAMPLE ===");
  const sampleVars = await db.productVariant.findMany({
    where: { organizationId: org.id },
    select: { sku: true },
    take: 10,
  });
  for (const v of sampleVars) console.log(`  sku="${v.sku}"`);

  // 6. Per-warehouse: distinct productIds and variantIds
  console.log("\n=== PER-WAREHOUSE DISTINCT PRODUCT/VARIANT COUNTS ===");
  const warehouses: Array<{ warehouseId: string }> = await db.productInventoryLevel.findMany({
    where: { organizationId: org.id },
    select: { warehouseId: true },
    distinct: ["warehouseId"],
  });

  const whDetails: Array<{
    whId: string; total: number; distinctProds: number; distinctVars: number;
    totalUnits: number; lastSync: string;
  }> = [];

  for (const wh of warehouses.sort((a: any, b: any) => Number(a.warehouseId) - Number(b.warehouseId))) {
    const whId = wh.warehouseId;

    // Get all records for this warehouse
    const records: Array<{ productId: string | null; variantId: string | null; quantity: number; reservedQty: number; updatedAt: Date | null }> =
      await db.productInventoryLevel.findMany({
        where: { organizationId: org.id, warehouseId: whId },
        select: { productId: true, variantId: true, quantity: true, reservedQty: true, updatedAt: true },
      });

    const prodIds = new Set(records.map(r => r.productId).filter(Boolean));
    const varIds = new Set(records.map(r => r.variantId).filter(Boolean));
    let totalUnits = 0;
    let latestSync: Date | null = null;

    for (const r of records) {
      totalUnits += Math.max(0, r.quantity - r.reservedQty);
      if (r.updatedAt && (!latestSync || r.updatedAt > latestSync)) latestSync = r.updatedAt;
    }

    const syncStr = latestSync ? latestSync.toISOString().split("T")[0] : "never";
    whDetails.push({ whId, total: records.length, distinctProds: prodIds.size, distinctVars: varIds.size, totalUnits, lastSync: syncStr });
  }

  // Print table
  console.log("  WH  | Records | Products | Variants |    Units | Last Sync");
  console.log("  ----|---------|----------|----------|---------|----------");
  for (const w of whDetails) {
    console.log(`  ${w.whId.padStart(3)} | ${String(w.total).padStart(7)} | ${String(w.distinctProds).padStart(8)} | ${String(w.distinctVars).padStart(8)} | ${String(w.totalUnits).padStart(7)} | ${w.lastSync}`);
  }

  // Summary
  const totalUnits = whDetails.reduce((s, w) => s + w.totalUnits, 0);
  const zeroUnitWHs = whDetails.filter(w => w.totalUnits === 0);
  console.log(`\n  Total units across all: ${totalUnits}`);
  console.log(`  WHs with 0 available units: ${zeroUnitWHs.length} (${zeroUnitWHs.map(w => w.whId).join(", ")})`);

  // Top 10 by units
  console.log("\n=== TOP 10 BY UNITS ===");
  for (const w of [...whDetails].sort((a, b) => b.totalUnits - a.totalUnits).slice(0, 10)) {
    console.log(`  WH ${w.whId.padStart(3)}: ${String(w.totalUnits).padStart(8)} units, ${w.distinctProds} products, ${w.distinctVars} variants`);
  }

  // 7. Actual variant-level refs for WH 11 (a store)
  console.log("\n=== WH 11 — RESOLVED PRODUCT REFS (first 20) ===");
  const wh11 = await db.productInventoryLevel.findMany({
    where: { organizationId: org.id, warehouseId: "11" },
    select: { productId: true, variantId: true, quantity: true, reservedQty: true },
    take: 20,
  });

  const pIds11 = [...new Set(wh11.map((r: any) => r.productId).filter(Boolean))];
  const vIds11 = [...new Set(wh11.map((r: any) => r.variantId).filter(Boolean))];

  const pMap = new Map<string, string>();
  if (pIds11.length > 0) {
    const ps = await db.productEntity.findMany({ where: { id: { in: pIds11 } }, select: { id: true, sku: true, name: true } });
    for (const p of ps) pMap.set(p.id, p.sku || p.name?.slice(0, 30) || "?");
  }
  const vMap = new Map<string, string>();
  if (vIds11.length > 0) {
    const vs = await db.productVariant.findMany({ where: { id: { in: vIds11 } }, select: { id: true, sku: true } });
    for (const v of vs) vMap.set(v.id, v.sku || "?");
  }

  for (const r of wh11) {
    const vSku = r.variantId ? vMap.get(r.variantId) ?? "?" : "—";
    const pSku = r.productId ? pMap.get(r.productId) ?? "?" : "—";
    const net = Math.max(0, r.quantity - r.reservedQty);
    console.log(`  product="${pSku}" variant="${vSku}" available=${net}`);
  }

  // 8. AgentExecution operations
  console.log("\n=== AGENT EXECUTION OPERATIONS ===");
  const ops = await db.agentExecution.findMany({
    where: { tenantId: org.id },
    select: { operation: true },
    distinct: ["operation"],
  });
  for (const o of ops) console.log(`  ${o.operation}`);

  // 9. Search for warehouse lookup
  const whLookups = await db.agentExecution.findMany({
    where: { tenantId: org.id, OR: [
      { operation: { contains: "WAREHOUSE" } },
      { operation: { contains: "BODEGA" } },
      { operation: { contains: "LOOKUP" } },
    ] },
    select: { operation: true, id: true },
    take: 10,
  });
  console.log("\nWarehouse/Bodega/Lookup operations:", whLookups.length);
  for (const e of whLookups) console.log(`  ${e.operation}`);

  // 10. Check if ProductVariantAttribute has talla/color data
  console.log("\n=== VARIANT ATTRIBUTES SAMPLE ===");
  try {
    const attrs = await db.productVariantAttribute.findMany({
      where: { organizationId: org.id },
      select: { key: true, value: true, variantId: true },
      take: 20,
    });
    console.log("Sample attributes:", attrs.length);
    for (const a of attrs) console.log(`  ${a.key}="${a.value}" (variant ${a.variantId?.slice(0, 12)})`);

    const distinctKeys = await db.productVariantAttribute.findMany({
      where: { organizationId: org.id },
      select: { key: true },
      distinct: ["key"],
    });
    console.log("Distinct attribute keys:", distinctKeys.map((k: any) => k.key).join(", "));
  } catch (e: any) {
    console.log("Could not query variant attributes:", e.message?.slice(0, 100));
  }

  await prisma.$disconnect();
}

audit().catch((e: any) => { console.error(e); process.exit(1); });
