/**
 * Test what exactly fails in the include query
 */
import { prisma } from "../lib/prisma";

async function test() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" }, select: { id: true } });
  if (!org) { console.log("No org"); return; }
  const db = prisma as any;

  // Test 1: just product include
  console.log("=== Test 1: include product only ===");
  try {
    const r1 = await db.productInventoryLevel.findMany({
      where: { organizationId: org.id, warehouseId: "11" },
      include: { product: { select: { name: true, sku: true } } },
      take: 2,
    });
    console.log("OK, got", r1.length, "results");
    console.log("  product:", r1[0]?.product);
  } catch (e: any) {
    console.log("FAILED:", e.message?.slice(0, 400));
  }

  // Test 2: just variant include (no attributes)
  console.log("\n=== Test 2: include variant only (no attrs) ===");
  try {
    const r2 = await db.productInventoryLevel.findMany({
      where: { organizationId: org.id, warehouseId: "11" },
      include: { variant: { select: { sku: true } } },
      take: 2,
    });
    console.log("OK, got", r2.length, "results");
    console.log("  variant:", r2[0]?.variant);
  } catch (e: any) {
    console.log("FAILED:", e.message?.slice(0, 400));
  }

  // Test 3: variant with attributes include
  console.log("\n=== Test 3: include variant with attributes ===");
  try {
    const r3 = await db.productInventoryLevel.findMany({
      where: { organizationId: org.id, warehouseId: "11" },
      include: { variant: { include: { attributes: { select: { key: true, value: true } } } } },
      take: 2,
    });
    console.log("OK, got", r3.length, "results");
    console.log("  variant:", r3[0]?.variant?.sku);
    console.log("  attrs:", r3[0]?.variant?.attributes);
  } catch (e: any) {
    console.log("FAILED:", e.message?.slice(0, 400));
  }

  // Test 4: both includes (the exact query from getStoreInventoryByWarehouse)
  console.log("\n=== Test 4: include both (exact adapter query) ===");
  try {
    const r4 = await db.productInventoryLevel.findMany({
      where: { organizationId: org.id, warehouseId: "11" },
      include: {
        product: { select: { name: true, sku: true } },
        variant: { include: { attributes: { select: { key: true, value: true } } } },
      },
      take: 2,
    });
    console.log("OK, got", r4.length, "results");
  } catch (e: any) {
    console.log("FAILED:", e.message?.slice(0, 500));
  }

  // Test 5: select with nested select (alternative to include)
  console.log("\n=== Test 5: select with nested select ===");
  try {
    const r5 = await db.productInventoryLevel.findMany({
      where: { organizationId: org.id, warehouseId: "11" },
      select: {
        quantity: true,
        reservedQty: true,
        externalRef: true,
        productId: true,
        variantId: true,
        updatedAt: true,
      },
      take: 2,
    });
    console.log("OK, got", r5.length, "results");
  } catch (e: any) {
    console.log("FAILED:", e.message?.slice(0, 400));
  }

  await prisma.$disconnect();
}

test().catch((e: any) => { console.error(e); process.exit(1); });
