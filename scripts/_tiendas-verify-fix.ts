/**
 * Verify the include query works after fixing attributes → variantAttributes
 */
import { prisma } from "../lib/prisma";

async function verify() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" }, select: { id: true } });
  if (!org) { console.log("No org"); return; }
  const db = prisma as any;

  console.log("=== Test: Fixed include query (variantAttributes) ===");
  try {
    const results = await db.productInventoryLevel.findMany({
      where: { organizationId: org.id, warehouseId: "11" },
      include: {
        product: { select: { name: true, sku: true } },
        variant: { include: { variantAttributes: { select: { key: true, value: true } } } },
      },
      take: 10,
    });
    console.log("Query SUCCEEDED, results:", results.length);
    for (const lv of results) {
      const attrs = lv.variant?.variantAttributes ?? [];
      const size = attrs.find((a: any) => a.key === "talla")?.value ?? "";
      const color = attrs.find((a: any) => a.key === "color")?.value ?? "";
      const ref = lv.variant?.sku ?? lv.product?.sku ?? lv.externalRef ?? "";
      const name = lv.product?.name ?? ref;
      const avail = Math.max(0, lv.quantity - lv.reservedQty);
      console.log(`  ref="${ref}" name="${name?.slice(0,35)}" size="${size}" color="${color}" avail=${avail}`);
    }
  } catch (e: any) {
    console.log("FAILED:", e.message?.slice(0, 400));
  }

  // Now test what getStoreInventoryByWarehouse would return
  console.log("\n=== Test: Full getStoreInventoryByWarehouse result ===");
  try {
    const { getStoreInventoryByWarehouse } = await import("../lib/comercial/tiendas/sag-store-adapter");
    const inv = await getStoreInventoryByWarehouse(org.id, "store_11", "11");
    console.log("Returned items:", inv.length);
    console.log("First 5:");
    for (const item of inv.slice(0, 5)) {
      console.log(`  ref="${item.referenceCode}" name="${item.productName?.slice(0,35)}" size="${item.size}" color="${item.color}" units=${item.currentUnits}`);
    }
    const totalUnits = inv.reduce((s, i) => s + i.currentUnits, 0);
    console.log(`Total units: ${totalUnits}`);
    console.log(`With stock > 0: ${inv.filter(i => i.currentUnits > 0).length}`);
    console.log(`With stock = 0: ${inv.filter(i => i.currentUnits === 0).length}`);
  } catch (e: any) {
    console.log("IMPORT/CALL FAILED:", e.message?.slice(0, 300));
  }

  // Test main warehouse too
  console.log("\n=== Test: Main warehouse availability (WH 10) ===");
  try {
    const { getMainWarehouseAvailability } = await import("../lib/comercial/tiendas/sag-store-adapter");
    const main = await getMainWarehouseAvailability(org.id, "10");
    console.log("Returned items:", main.length);
    const totalUnits = main.reduce((s, i) => s + Math.max(0, i.availableUnits - i.reservedUnits), 0);
    console.log(`Total available units: ${totalUnits}`);
  } catch (e: any) {
    console.log("FAILED:", e.message?.slice(0, 300));
  }

  await prisma.$disconnect();
}

verify().catch((e: any) => { console.error(e); process.exit(1); });
