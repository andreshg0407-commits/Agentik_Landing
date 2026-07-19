/**
 * scripts/_audit-tiendas-warehouse-names.ts
 *
 * Discover SAG BODEGAS warehouse names by querying PIL + InventoryTransfer.
 * Build the definitive storeSlug → warehouseId mapping.
 *
 * Read-only. No writes.
 *
 * Usage: npx tsx scripts/_audit-tiendas-warehouse-names.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("No org"); return; }
  const orgId = org.id;
  console.log(`\n=== WAREHOUSE NAME DISCOVERY — ${org.slug} ===\n`);

  // 1. All distinct (warehouseId, externalRef) from PIL
  console.log("--- 1. PIL: distinct (warehouseId, externalRef) ---");
  const pilWarehouses = await (prisma as any).$queryRaw`
    SELECT "warehouseId", "externalRef",
           COUNT(*)::int as records,
           SUM("quantity")::bigint as total_qty
    FROM "ProductInventoryLevel"
    WHERE "organizationId" = ${orgId}
    GROUP BY "warehouseId", "externalRef"
    ORDER BY "warehouseId"::int
  `;
  console.table(pilWarehouses);

  // 2. InventoryTransfer warehouse names (these HAVE names!)
  console.log("\n--- 2. InventoryTransfer: warehouse codes + names ---");
  try {
    const transferWarehouses = await (prisma as any).$queryRaw`
      SELECT DISTINCT code, name FROM (
        SELECT "originWarehouseCode" as code, "originWarehouseName" as name
        FROM "InventoryTransfer"
        WHERE "organizationId" = ${orgId}
        UNION
        SELECT "destinationWarehouseCode" as code, "destinationWarehouseName" as name
        FROM "InventoryTransfer"
        WHERE "organizationId" = ${orgId}
      ) sub
      ORDER BY code
    `;
    console.table(transferWarehouses);
  } catch (e: any) {
    console.log("  Error:", e.message?.slice(0, 150));
  }

  // 3. SaleRecord stores (the store slugs we need to map)
  console.log("\n--- 3. SaleRecord: all stores ---");
  const stores = await prisma.saleRecord.findMany({
    where: { organizationId: orgId },
    select: { storeSlug: true, storeName: true },
    distinct: ["storeSlug"],
  });
  for (const s of stores) {
    console.log(`  slug="${s.storeSlug}" → name="${s.storeName}"`);
  }

  // 4. CRMQuoteLine warehouse names
  console.log("\n--- 4. CRMQuoteLine: warehouse names ---");
  try {
    const crmWarehouses = await prisma.cRMQuoteLine.findMany({
      where: { organizationId: orgId, warehouseName: { not: null } },
      select: { warehouseName: true },
      distinct: ["warehouseName"],
    });
    for (const w of crmWarehouses) {
      console.log(`  "${w.warehouseName}"`);
    }
  } catch (e: any) {
    console.log("  Error:", e.message?.slice(0, 150));
  }

  // 5. ProductEntity + ProductVariant external IDs — check if warehouse info is embedded
  console.log("\n--- 5. ProductVariant attributes sample (talla/color per warehouse) ---");
  try {
    // Find variants that have inventory in different warehouses
    const variantWarehouses = await (prisma as any).$queryRaw`
      SELECT pil."warehouseId", pil."externalRef",
             COUNT(DISTINCT pv.id)::int as variants,
             COUNT(DISTINCT pe.id)::int as products
      FROM "ProductInventoryLevel" pil
      JOIN "ProductVariant" pv ON pv.id = pil."variantId"
      JOIN "ProductEntity" pe ON pe.id = pil."productId"
      WHERE pil."organizationId" = ${orgId}
      GROUP BY pil."warehouseId", pil."externalRef"
      ORDER BY pil."warehouseId"::int
    `;
    console.table(variantWarehouses);
  } catch (e: any) {
    console.log("  Error:", e.message?.slice(0, 150));
  }

  // 6. Check if Connector config has BODEGAS data cached
  console.log("\n--- 6. Connector config check ---");
  try {
    const connectors = await (prisma as any).connector.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, source: true, config: true },
    });
    for (const c of connectors as any[]) {
      const cfg = (c.config ?? {}) as Record<string, unknown>;
      console.log(`  connector=${c.name} (${c.source}), config keys: ${Object.keys(cfg).join(", ")}`);
      for (const [k, v] of Object.entries(cfg)) {
        if (k.toLowerCase().includes("warehouse") || k.toLowerCase().includes("bodega") || k.toLowerCase().includes("store")) {
          console.log(`    ${k} = ${JSON.stringify(v)}`);
        }
      }
    }
  } catch (e: any) {
    console.log("  Error:", e.message?.slice(0, 150));
  }

  // 7. Try to find BODEGAS data in ConnectorSync history
  console.log("\n--- 7. ConnectorSync history for BODEGAS ---");
  try {
    const syncs = await (prisma as any).connectorSync.findMany({
      where: { organizationId: orgId },
      select: { id: true, connectorId: true, syncType: true, status: true, metadata: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    for (const s of syncs) {
      const meta = s.metadata as Record<string, unknown>;
      const metaKeys = meta ? Object.keys(meta).join(", ") : "null";
      console.log(`  sync=${s.syncType} | status=${s.status} | ${s.createdAt} | meta=[${metaKeys}]`);
      // Check if warehouse map is in metadata
      if (meta && (meta.warehouses || meta.bodegas || meta.lookupMaps)) {
        console.log(`    FOUND warehouse data: ${JSON.stringify(meta.warehouses ?? meta.bodegas ?? meta.lookupMaps).slice(0, 500)}`);
      }
    }
  } catch (e: any) {
    console.log("  Error:", e.message?.slice(0, 150));
  }

  await pool.end();
  console.log("\n=== DONE ===");
}

main().catch(console.error);
