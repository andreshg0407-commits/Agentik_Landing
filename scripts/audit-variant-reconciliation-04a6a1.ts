/**
 * scripts/audit-variant-reconciliation-04a6a1.ts
 *
 * READ-ONLY audit: variant inventory reconciliation for B01 warehouse.
 * Compares SUM(variant B01 quantity) vs reference-level data.
 *
 * Usage: npx tsx scripts/audit-variant-reconciliation-04a6a1.ts
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const ORG_SLUG = "castillitos";
const WAREHOUSE_B01 = "10"; // warehouseId="10" = B01
const TARGET_REFS = ["L-9080", "L-9111", "L-8467", "CD-4123138B"];

interface VariantRow {
  id: string;
  productId: string;
  name: string | null;
  sku: string | null;
  attributes: Record<string, unknown> | null;
}

interface InventoryRow {
  id: string;
  productId: string;
  variantId: string | null;
  warehouseId: string;
  quantity: number;
  reservedQty: number;
  syncedAt: Date | null;
}

interface RefResult {
  sku: string;
  productId: string | null;
  productName: string | null;
  variantCount: number;
  b01LevelCount: number;
  sumB01Qty: number;
  sumB01Reserved: number;
  lastSyncDate: Date | null;
  variants: {
    variantId: string;
    talla: string;
    color: string;
    b01Qty: number;
    b01Reserved: number;
    syncedAt: Date | null;
  }[];
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any) as any;

  try {
    const org = await prisma.organization.findUnique({ where: { slug: ORG_SLUG } });
    if (!org) { console.error("Org not found"); return; }
    const orgId = org.id;

    console.log("=== VARIANT-INVENTORY-RECONCILIATION-04a6a1 ===");
    console.log(`Org: ${ORG_SLUG} (${orgId})`);
    console.log(`Warehouse: B01 (warehouseId=${WAREHOUSE_B01})`);
    console.log(`Date: ${new Date().toISOString()}\n`);

    // ═══════════════════════════════════════════════════════════
    // PHASE 0 — Find a 5th reference with positive variant qty
    // ═══════════════════════════════════════════════════════════
    console.log("═".repeat(70));
    console.log("PHASE 0: Discovering a 5th reference with positive B01 variant data");
    console.log("═".repeat(70));

    const positiveLevel = await prisma.productInventoryLevel.findFirst({
      where: {
        warehouseId: WAREHOUSE_B01,
        quantity: { gt: 0 },
        variantId: { not: null },
        product: { organizationId: orgId },
      },
      include: { product: { select: { sku: true, name: true } } },
      orderBy: { quantity: "desc" },
    });

    let fifthRef: string | null = null;
    if (positiveLevel) {
      fifthRef = positiveLevel.product?.sku ?? null;
      if (fifthRef && TARGET_REFS.includes(fifthRef)) {
        // Already in list, find another
        const anotherLevel = await prisma.productInventoryLevel.findFirst({
          where: {
            warehouseId: WAREHOUSE_B01,
            quantity: { gt: 0 },
            variantId: { not: null },
            product: {
              organizationId: orgId,
              sku: { notIn: TARGET_REFS },
            },
          },
          include: { product: { select: { sku: true, name: true } } },
          orderBy: { quantity: "desc" },
        });
        fifthRef = anotherLevel?.product?.sku ?? null;
      }
    }

    const allRefs = [...TARGET_REFS];
    if (fifthRef) {
      allRefs.push(fifthRef);
      console.log(`  Found 5th ref: ${fifthRef} (qty=${positiveLevel?.quantity})\n`);
    } else {
      console.log("  No 5th ref with positive B01 variant data found.\n");
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 1 — Per-reference variant + inventory audit
    // ═══════════════════════════════════════════════════════════
    console.log("═".repeat(70));
    console.log("PHASE 1: Per-reference variant inventory audit");
    console.log("═".repeat(70));

    const results: RefResult[] = [];

    for (const sku of allRefs) {
      console.log(`\n── Reference: ${sku} ──`);

      // Find product
      const product = await prisma.productEntity.findFirst({
        where: { organizationId: orgId, sku },
        select: { id: true, name: true, sku: true },
      });

      if (!product) {
        console.log("  Product NOT FOUND in ProductEntity");
        results.push({
          sku,
          productId: null,
          productName: null,
          variantCount: 0,
          b01LevelCount: 0,
          sumB01Qty: 0,
          sumB01Reserved: 0,
          lastSyncDate: null,
          variants: [],
        });
        continue;
      }

      console.log(`  ProductEntity: ${product.id}`);
      console.log(`  Name: ${product.name}`);

      // Get variants
      const variants: VariantRow[] = await prisma.productVariant.findMany({
        where: { productId: product.id },
        select: { id: true, productId: true, name: true, sku: true, attributes: true },
      });

      console.log(`  Variants: ${variants.length}`);

      // Get B01 inventory levels for this product (all — reference + variant)
      const levels: InventoryRow[] = await prisma.productInventoryLevel.findMany({
        where: {
          productId: product.id,
          warehouseId: WAREHOUSE_B01,
        },
        select: {
          id: true,
          productId: true,
          variantId: true,
          warehouseId: true,
          quantity: true,
          reservedQty: true,
          syncedAt: true,
        },
      });

      const variantLevels = levels.filter((l: InventoryRow) => l.variantId !== null);
      const refLevels = levels.filter((l: InventoryRow) => l.variantId === null);

      const sumVariantQty = variantLevels.reduce((s: number, l: InventoryRow) => s + (l.quantity ?? 0), 0);
      const sumVariantReserved = variantLevels.reduce((s: number, l: InventoryRow) => s + (l.reservedQty ?? 0), 0);
      const sumRefQty = refLevels.reduce((s: number, l: InventoryRow) => s + (l.quantity ?? 0), 0);

      const allSyncDates = levels
        .map((l: InventoryRow) => l.syncedAt)
        .filter((d: Date | null): d is Date => d !== null)
        .sort((a: Date, b: Date) => b.getTime() - a.getTime());
      const lastSync = allSyncDates.length > 0 ? allSyncDates[0] : null;

      console.log(`  B01 inventory levels (total): ${levels.length}`);
      console.log(`    - Reference-level (variantId=null): ${refLevels.length}, qty=${sumRefQty}`);
      console.log(`    - Variant-level: ${variantLevels.length}, SUM(qty)=${sumVariantQty}`);
      console.log(`  Last sync: ${lastSync ? lastSync.toISOString() : "—"}`);

      // Per-variant detail
      const variantDetail: RefResult["variants"] = [];
      for (const v of variants) {
        const attrs = (v.attributes ?? {}) as Record<string, string>;
        const talla = attrs.tallaName ?? attrs.talla ?? "—";
        const color = attrs.colorName ?? attrs.color ?? "—";

        const vLevel = variantLevels.find((l: InventoryRow) => l.variantId === v.id);
        variantDetail.push({
          variantId: v.id,
          talla,
          color,
          b01Qty: vLevel?.quantity ?? 0,
          b01Reserved: vLevel?.reservedQty ?? 0,
          syncedAt: vLevel?.syncedAt ?? null,
        });
      }

      // Show variant table
      if (variantDetail.length > 0) {
        console.log(`\n  Variant detail (B01):`);
        console.log(`  ${"Talla".padEnd(10)} ${"Color".padEnd(15)} ${"Qty".padStart(6)} ${"Res".padStart(6)} Synced`);
        console.log(`  ${"─".repeat(10)} ${"─".repeat(15)} ${"─".repeat(6)} ${"─".repeat(6)} ${"─".repeat(20)}`);
        for (const vd of variantDetail) {
          console.log(
            `  ${vd.talla.padEnd(10)} ${vd.color.padEnd(15)} ${String(vd.b01Qty).padStart(6)} ${String(vd.b01Reserved).padStart(6)} ${vd.syncedAt ? vd.syncedAt.toISOString().slice(0, 19) : "—"}`
          );
        }
      }

      results.push({
        sku,
        productId: product.id,
        productName: product.name,
        variantCount: variants.length,
        b01LevelCount: levels.length,
        sumB01Qty: sumVariantQty,
        sumB01Reserved: sumVariantReserved,
        lastSyncDate: lastSync,
        variants: variantDetail,
      });
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 2 — Reconciliation matrix
    // ═══════════════════════════════════════════════════════════
    console.log("\n\n" + "═".repeat(70));
    console.log("PHASE 2: Reconciliation Matrix");
    console.log("═".repeat(70));

    console.log(
      `\n  ${"Reference".padEnd(18)} ${"Variants".padStart(8)} ${"B01 Levels".padStart(10)} ${"SUM(B01)".padStart(10)} ${"Reserved".padStart(10)} ${"Last Sync".padEnd(20)} Status`
    );
    console.log(
      `  ${"─".repeat(18)} ${"─".repeat(8)} ${"─".repeat(10)} ${"─".repeat(10)} ${"─".repeat(10)} ${"─".repeat(20)} ${"─".repeat(12)}`
    );

    for (const r of results) {
      let status = "OK";
      if (!r.productId) status = "NOT_FOUND";
      else if (r.variantCount === 0) status = "NO_VARIANTS";
      else if (r.b01LevelCount === 0) status = "NO_B01_DATA";
      else if (r.sumB01Qty === 0) status = "ZERO_QTY";

      console.log(
        `  ${r.sku.padEnd(18)} ${String(r.variantCount).padStart(8)} ${String(r.b01LevelCount).padStart(10)} ${String(r.sumB01Qty).padStart(10)} ${String(r.sumB01Reserved).padStart(10)} ${(r.lastSyncDate ? r.lastSyncDate.toISOString().slice(0, 19) : "—").padEnd(20)} ${status}`
      );
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 3 — Coverage stats
    // ═══════════════════════════════════════════════════════════
    console.log("\n\n" + "═".repeat(70));
    console.log("PHASE 3: Coverage Stats");
    console.log("═".repeat(70));

    const totalRefs = results.length;
    const foundRefs = results.filter(r => r.productId !== null).length;
    const withVariants = results.filter(r => r.variantCount > 0).length;
    const withB01Data = results.filter(r => r.b01LevelCount > 0).length;
    const withPositiveQty = results.filter(r => r.sumB01Qty > 0).length;
    const totalVariants = results.reduce((s, r) => s + r.variantCount, 0);
    const totalB01Qty = results.reduce((s, r) => s + r.sumB01Qty, 0);

    console.log(`\n  References audited:           ${totalRefs}`);
    console.log(`  Found in ProductEntity:       ${foundRefs}/${totalRefs} (${((foundRefs / totalRefs) * 100).toFixed(0)}%)`);
    console.log(`  With variants:                ${withVariants}/${totalRefs} (${((withVariants / totalRefs) * 100).toFixed(0)}%)`);
    console.log(`  With B01 inventory levels:    ${withB01Data}/${totalRefs} (${((withB01Data / totalRefs) * 100).toFixed(0)}%)`);
    console.log(`  With positive B01 quantity:   ${withPositiveQty}/${totalRefs} (${((withPositiveQty / totalRefs) * 100).toFixed(0)}%)`);
    console.log(`  Total variants across refs:   ${totalVariants}`);
    console.log(`  Total B01 qty (all refs):     ${totalB01Qty}`);

    // Global stats
    console.log("\n── Global B01 inventory stats ──");
    const globalLevelCount = await prisma.productInventoryLevel.count({
      where: {
        warehouseId: WAREHOUSE_B01,
        product: { organizationId: orgId },
      },
    });
    const globalVariantLevelCount = await prisma.productInventoryLevel.count({
      where: {
        warehouseId: WAREHOUSE_B01,
        variantId: { not: null },
        product: { organizationId: orgId },
      },
    });

    const globalPositive = await prisma.productInventoryLevel.count({
      where: {
        warehouseId: WAREHOUSE_B01,
        quantity: { gt: 0 },
        product: { organizationId: orgId },
      },
    });
    const globalPositiveVariant = await prisma.productInventoryLevel.count({
      where: {
        warehouseId: WAREHOUSE_B01,
        quantity: { gt: 0 },
        variantId: { not: null },
        product: { organizationId: orgId },
      },
    });

    console.log(`  Total B01 inventory levels:         ${globalLevelCount}`);
    console.log(`  B01 variant-level records:           ${globalVariantLevelCount}`);
    console.log(`  B01 levels with qty > 0:             ${globalPositive}`);
    console.log(`  B01 variant levels with qty > 0:     ${globalPositiveVariant}`);

    console.log("\n── NOTE ──");
    console.log("  Reference-level EXISTENCIA from SAG views is NOT available in this");
    console.log("  local audit. Full reconciliation (variant SUM vs SAG existencia)");
    console.log("  requires runtime SAG SOAP access or the canonical inventory loader.");
    console.log("  The data above shows variant-level decomposition only.\n");

    console.log("=== AUDIT COMPLETE ===");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
