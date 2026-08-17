/**
 * AUDIT-VARIANT-DB-04A6A — Check Prisma variant inventory for audit references
 */
import { prisma } from "../lib/prisma";

const AUDIT_REFS = ["L-9080", "L-9111", "L-8467", "CD-4123138B"];

async function main() {
  console.log("=== VARIANT DB AUDIT ===\n");

  for (const ref of AUDIT_REFS) {
    const product = await (prisma as any).productEntity.findFirst({
      where: { sku: ref, externalSource: "sag" },
      select: { id: true, sku: true },
    });
    if (!product) { console.log(`${ref}: NOT FOUND\n`); continue; }

    const variants = await (prisma as any).productVariant.findMany({
      where: { productId: product.id },
      select: { id: true, sku: true, attributes: true },
    });

    const levels = await (prisma as any).productInventoryLevel.findMany({
      where: { productId: product.id },
      select: {
        variantId: true, warehouseId: true, quantity: true,
        reservedQty: true, externalRef: true, syncedAt: true,
      },
    });

    // Map variant IDs to attributes
    const varMap = new Map<string, any>();
    for (const v of variants) varMap.set(v.id, v);

    // Filter to B01 (warehouseId="1" based on SAG internal PK)
    const b01Levels = levels.filter((l: any) => l.warehouseId === "1");
    const allWarehouses = [...new Set(levels.map((l: any) => l.warehouseId))];

    console.log(`${ref}: ${variants.length} variants, ${levels.length} levels (warehouses: ${allWarehouses.join(",")})`);
    console.log(`  B01 levels: ${b01Levels.length}`);

    let totalQtyB01 = 0;
    let totalReservedB01 = 0;
    for (const l of b01Levels) {
      const v = varMap.get(l.variantId);
      const attrs = v?.attributes as any;
      const talla = attrs?.tallaName || attrs?.talla || "(none)";
      const color = attrs?.colorName || attrs?.color || "(none)";
      totalQtyB01 += l.quantity;
      totalReservedB01 += l.reservedQty;
      if (b01Levels.length <= 30) {
        console.log(`    ${talla.padEnd(8)} | ${color.padEnd(12)} | qty=${String(l.quantity).padStart(5)} | reserved=${l.reservedQty}`);
      }
    }
    console.log(`  B01 TOTAL: qty=${totalQtyB01}, reserved=${totalReservedB01}`);

    // Check product-level level (variantId=null)
    const prodLevels = levels.filter((l: any) => !l.variantId);
    if (prodLevels.length > 0) {
      console.log(`  Product-level levels: ${prodLevels.length}`);
      for (const l of prodLevels) {
        console.log(`    wh=${l.warehouseId} | qty=${l.quantity} | reserved=${l.reservedQty}`);
      }
    }

    // Check freshness
    const syncDates = levels.map((l: any) => l.syncedAt).filter(Boolean).sort();
    if (syncDates.length > 0) {
      console.log(`  Last sync: ${syncDates[syncDates.length - 1]}`);
    }
    console.log();
  }

  // Also find refs with reserved > 0 in ProductInventoryLevel
  console.log("=== REFS WITH RESERVED > 0 ===\n");
  const withReserved = await (prisma as any).productInventoryLevel.findMany({
    where: { reservedQty: { gt: 0 } },
    select: { productId: true, variantId: true, warehouseId: true, quantity: true, reservedQty: true },
    take: 5,
  });
  console.log(`Levels with reservedQty > 0: ${withReserved.length}`);
  for (const l of withReserved) {
    console.log(`  product=${l.productId?.slice(0, 8)} variant=${l.variantId?.slice(0, 8)} wh=${l.warehouseId} qty=${l.quantity} reserved=${l.reservedQty}`);
  }

  await (prisma as any).$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
