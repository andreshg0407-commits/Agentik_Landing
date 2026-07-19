/**
 * scripts/_audit-tiendas-inventory.ts
 *
 * FASE 2+3: Read-only audit of ProductInventoryLevel + store-warehouse mapping
 * for Castillitos. No writes.
 *
 * Usage: npx tsx scripts/_audit-tiendas-inventory.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("No org found"); return; }
  const orgId = org.id;
  console.log(`\n=== TIENDAS INVENTORY AUDIT — ${org.slug} (${orgId}) ===\n`);

  // ── 1. ProductInventoryLevel summary ──────────────────────────────────────
  console.log("--- 1. ProductInventoryLevel Summary ---");
  try {
    const summary = await (prisma as any).productInventoryLevel.aggregate({
      where: { organizationId: orgId },
      _count: true,
      _sum: { quantity: true, reservedQty: true },
    });
    console.log(`  Total records: ${summary._count}`);
    console.log(`  Total quantity: ${summary._sum?.quantity ?? 0}`);
    console.log(`  Total reservedQty: ${summary._sum?.reservedQty ?? 0}`);

    // Distinct warehouses
    const warehouses = await (prisma as any).productInventoryLevel.findMany({
      where: { organizationId: orgId },
      select: { warehouseId: true },
      distinct: ["warehouseId"],
    });
    console.log(`  Distinct warehouses: ${warehouses.length}`);
    for (const w of warehouses) {
      console.log(`    - "${w.warehouseId}"`);
    }

    // Distinct products
    const products = await (prisma as any).productInventoryLevel.findMany({
      where: { organizationId: orgId },
      select: { productId: true },
      distinct: ["productId"],
    });
    console.log(`  Distinct products: ${products.length}`);

    // Distinct sources
    const sources = await (prisma as any).productInventoryLevel.findMany({
      where: { organizationId: orgId },
      select: { source: true },
      distinct: ["source"],
    });
    console.log(`  Sources: ${sources.map((s: any) => s.source).join(", ")}`);

    // Per-warehouse breakdown
    console.log("\n--- 1b. Per-Warehouse Breakdown ---");
    for (const w of warehouses) {
      const whSummary = await (prisma as any).productInventoryLevel.aggregate({
        where: { organizationId: orgId, warehouseId: w.warehouseId },
        _count: true,
        _sum: { quantity: true, reservedQty: true },
      });
      const whProducts = await (prisma as any).productInventoryLevel.findMany({
        where: { organizationId: orgId, warehouseId: w.warehouseId },
        select: { productId: true },
        distinct: ["productId"],
      });
      console.log(`  "${w.warehouseId}": ${whSummary._count} records, ${whProducts.length} products, qty=${whSummary._sum?.quantity ?? 0}, reserved=${whSummary._sum?.reservedQty ?? 0}`);
    }

    // Sample records with product info
    console.log("\n--- 1c. Sample Records (first 5) ---");
    const samples = await (prisma as any).productInventoryLevel.findMany({
      where: { organizationId: orgId },
      take: 5,
      include: {
        product: { select: { name: true, sku: true, category: true } },
        variant: { select: { name: true, sku: true, attributes: true } },
      },
    });
    for (const s of samples) {
      console.log(`  warehouseId="${s.warehouseId}" | qty=${s.quantity} | reserved=${s.reservedQty} | source=${s.source} | extRef=${s.externalRef}`);
      console.log(`    product: ${s.product?.name ?? "?"} (sku=${s.product?.sku ?? "?"})`);
      console.log(`    variant: ${s.variant?.name ?? "none"} (sku=${s.variant?.sku ?? "?"})`);
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message?.slice(0, 200)}`);
  }

  // ── 2. ProductEntity summary ──────────────────────────────────────────────
  console.log("\n--- 2. ProductEntity Summary ---");
  try {
    const productCount = await (prisma as any).productEntity.count({
      where: { organizationId: orgId },
    });
    console.log(`  Total products: ${productCount}`);

    // Sample products
    const sampleProducts = await (prisma as any).productEntity.findMany({
      where: { organizationId: orgId },
      take: 5,
      select: { id: true, name: true, sku: true, category: true, status: true, importSource: true },
    });
    for (const p of sampleProducts) {
      console.log(`  - ${p.name} | sku=${p.sku} | cat=${p.category} | status=${p.status} | source=${p.importSource ?? "?"}`);
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message?.slice(0, 200)}`);
  }

  // ── 3. ProductVariant summary ─────────────────────────────────────────────
  console.log("\n--- 3. ProductVariant Summary ---");
  try {
    const variantCount = await (prisma as any).productVariant.count({
      where: { organizationId: orgId },
    });
    console.log(`  Total variants: ${variantCount}`);

    // Sample variants with attributes
    const sampleVariants = await (prisma as any).productVariant.findMany({
      where: { organizationId: orgId },
      take: 5,
      include: {
        attributes: { select: { key: true, value: true } },
        product: { select: { name: true, sku: true } },
      },
    });
    for (const v of sampleVariants) {
      const attrs = (v.attributes ?? []).map((a: any) => `${a.key}=${a.value}`).join(", ");
      console.log(`  - ${v.product?.name ?? "?"} | variant=${v.name} | sku=${v.sku} | attrs=[${attrs}]`);
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message?.slice(0, 200)}`);
  }

  // ── 4. CommercialCoverageSnapshot summary ─────────────────────────────────
  console.log("\n--- 4. CommercialCoverageSnapshot Summary ---");
  try {
    const snapCount = await (prisma as any).commercialCoverageSnapshot.count({
      where: { organizationId: orgId },
    });
    console.log(`  Total snapshots: ${snapCount}`);

    const snapAgg = await (prisma as any).commercialCoverageSnapshot.aggregate({
      where: { organizationId: orgId },
      _sum: { disponible: true },
      _max: { snapshotAt: true },
    });
    console.log(`  Total disponible: ${snapAgg._sum?.disponible ?? 0}`);
    console.log(`  Latest snapshot: ${snapAgg._max?.snapshotAt ?? "none"}`);

    // Sample
    const sampleSnaps = await (prisma as any).commercialCoverageSnapshot.findMany({
      where: { organizationId: orgId },
      take: 5,
      orderBy: { snapshotAt: "desc" },
      select: { refCode: true, description: true, disponible: true, status: true, snapshotAt: true },
    });
    for (const s of sampleSnaps) {
      console.log(`  - ${s.refCode} | "${s.description}" | disp=${s.disponible} | status=${s.status} | at=${s.snapshotAt}`);
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message?.slice(0, 200)}`);
  }

  // ── 5. SaleRecord stores → warehouse mapping attempt ─────────────────────
  console.log("\n--- 5. Store → Warehouse Mapping Attempt ---");
  try {
    // Get all SaleRecord stores
    const stores = await prisma.saleRecord.findMany({
      where: { organizationId: orgId },
      select: { storeSlug: true, storeName: true, storeCode: true },
      distinct: ["storeSlug"],
    });
    console.log(`  SaleRecord stores: ${stores.length}`);

    // Get all PIL warehouses
    const warehouses = await (prisma as any).productInventoryLevel.findMany({
      where: { organizationId: orgId },
      select: { warehouseId: true, externalRef: true },
      distinct: ["warehouseId"],
    });
    const whIds = warehouses.map((w: any) => w.warehouseId);
    console.log(`  PIL warehouses: ${whIds.join(", ")}`);

    // Try to match
    for (const s of stores) {
      const slug = s.storeSlug;
      const name = s.storeName;
      const code = s.storeCode;

      // Check if any warehouse matches
      const match = whIds.find((w: string) =>
        w.toLowerCase() === slug.toLowerCase() ||
        w.toLowerCase() === name.toLowerCase() ||
        (code && w.toLowerCase() === code.toLowerCase())
      );

      const confidence = match ? "MATCH" : "NO_MATCH";
      console.log(`  ${slug.padEnd(20)} | ${name.padEnd(20)} | code=${(code ?? "null").padEnd(8)} | warehouse=${match ?? "—"} | ${confidence}`);
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message?.slice(0, 200)}`);
  }

  // ── 6. CRMQuoteLine warehouse names ───────────────────────────────────────
  console.log("\n--- 6. CRMQuoteLine Warehouse Names ---");
  try {
    const crmWarehouses = await prisma.cRMQuoteLine.findMany({
      where: { organizationId: orgId, warehouseName: { not: null } },
      select: { warehouseName: true },
      distinct: ["warehouseName"],
    });
    console.log(`  Distinct CRM warehouse names: ${crmWarehouses.length}`);
    for (const w of crmWarehouses) {
      console.log(`    - "${w.warehouseName}"`);
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message?.slice(0, 200)}`);
  }

  // ── 7. InventoryTransfer warehouses ───────────────────────────────────────
  console.log("\n--- 7. InventoryTransfer Warehouses ---");
  try {
    const transferWarehouses = await (prisma as any).$queryRaw`
      SELECT DISTINCT "originWarehouseCode", "originWarehouseName",
             "destinationWarehouseCode", "destinationWarehouseName"
      FROM "InventoryTransfer"
      WHERE "organizationId" = ${orgId}
      LIMIT 30
    `;
    console.log(`  Transfer warehouse pairs: ${(transferWarehouses as any[]).length}`);
    for (const t of transferWarehouses as any[]) {
      console.log(`    ${t.originWarehouseCode} (${t.originWarehouseName}) → ${t.destinationWarehouseCode} (${t.destinationWarehouseName})`);
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message?.slice(0, 200)}`);
  }

  // ── 8. SaleRecord storeCode values ────────────────────────────────────────
  console.log("\n--- 8. SaleRecord storeCode values ---");
  try {
    const storeCodes = await prisma.saleRecord.findMany({
      where: { organizationId: orgId, storeCode: { not: null } },
      select: { storeSlug: true, storeName: true, storeCode: true },
      distinct: ["storeCode"],
    });
    console.log(`  Distinct storeCodes: ${storeCodes.length}`);
    for (const s of storeCodes) {
      console.log(`    slug=${s.storeSlug} | name=${s.storeName} | code=${s.storeCode}`);
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message?.slice(0, 200)}`);
  }

  await pool.end();
  console.log("\n=== AUDIT COMPLETE ===");
}

main().catch(console.error);
