/**
 * scripts/_audit-tiendas-warehouse-map.ts
 *
 * Deep warehouse mapping audit. Read-only.
 * Try to match SAG numeric warehouse codes to store names.
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

  // 1. PIL externalRef values per warehouse — externalRef might contain the store code
  console.log("--- 1. PIL externalRef per warehouseId ---");
  const extRefs = await (prisma as any).$queryRaw`
    SELECT "warehouseId", "externalRef", COUNT(*)::int as cnt
    FROM "ProductInventoryLevel"
    WHERE "organizationId" = ${orgId}
    GROUP BY "warehouseId", "externalRef"
    ORDER BY "warehouseId"::int, cnt DESC
  `;
  console.table(extRefs);

  // 2. InventoryTransfer — full distinct routes
  console.log("\n--- 2. Transfer Routes (all distinct pairs) ---");
  try {
    const routes = await (prisma as any).$queryRaw`
      SELECT "originWarehouseCode", "destinationWarehouseCode",
             COUNT(*)::int as transfers,
             SUM((SELECT COUNT(*) FROM "InventoryTransferLine" l WHERE l."transferId" = t.id))::int as total_lines
      FROM "InventoryTransfer" t
      WHERE "organizationId" = ${orgId}
      GROUP BY "originWarehouseCode", "destinationWarehouseCode"
      ORDER BY transfers DESC
    `;
    console.table(routes);
  } catch (e: any) {
    console.log("  Error:", e.message?.slice(0, 120));
  }

  // 3. What does warehouse "13" look like? (biggest positive stock = likely main warehouse)
  console.log("\n--- 3. Warehouse 13 sample products (likely MAIN) ---");
  const wh13 = await (prisma as any).productInventoryLevel.findMany({
    where: { organizationId: orgId, warehouseId: "13" },
    take: 10,
    orderBy: { quantity: "desc" },
    include: {
      product: { select: { name: true, sku: true } },
    },
  });
  for (const r of wh13) {
    console.log(`  sku=${r.product?.sku} | ${r.product?.name} | qty=${r.quantity} | extRef=${r.externalRef}`);
  }

  // 4. SaleRecord rawJson — check if any has bodega info
  console.log("\n--- 4. SaleRecord rawJson sample (check for warehouse codes) ---");
  const saleJsons = await prisma.saleRecord.findMany({
    where: { organizationId: orgId },
    take: 3,
    select: { storeSlug: true, storeName: true, rawJson: true },
    orderBy: { saleDate: "desc" },
  });
  for (const s of saleJsons) {
    const raw = s.rawJson as Record<string, unknown>;
    const keys = Object.keys(raw);
    const bodegaKeys = keys.filter(k =>
      k.toLowerCase().includes("bodega") ||
      k.toLowerCase().includes("warehouse") ||
      k.toLowerCase().includes("almacen") ||
      k.toLowerCase().includes("ka_nl")
    );
    console.log(`  store=${s.storeSlug} | rawJson keys with bodega/warehouse: ${bodegaKeys.join(", ") || "NONE"}`);
    // Show all raw keys for first record
    if (saleJsons.indexOf(s) === 0) {
      console.log(`  All rawJson keys: ${keys.join(", ")}`);
      // Show bodega-related values
      for (const k of bodegaKeys) {
        console.log(`    ${k} = ${JSON.stringify(raw[k])}`);
      }
    }
  }

  // 5. Look at SAG connector config for warehouse mapping
  console.log("\n--- 5. Connector configs with warehouse info ---");
  try {
    const connectors = await (prisma as any).connector.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, source: true, config: true },
    });
    for (const c of connectors as any[]) {
      const cfg = (c.config ?? {}) as Record<string, unknown>;
      const whKeys = Object.keys(cfg).filter(k =>
        k.toLowerCase().includes("warehouse") ||
        k.toLowerCase().includes("bodega") ||
        k.toLowerCase().includes("store") ||
        k.toLowerCase().includes("tienda")
      );
      if (whKeys.length > 0) {
        console.log(`  connector=${c.name} (${c.source})`);
        for (const k of whKeys) {
          console.log(`    ${k} = ${JSON.stringify(cfg[k])}`);
        }
      }
    }
  } catch (e: any) {
    console.log(`  Error: ${e.message?.slice(0, 120)}`);
  }

  // 6. Look at rawJson in the SAG mapper for bodega field
  console.log("\n--- 6. SaleRecord full rawJson keys (first record per store) ---");
  for (const slug of ["sag", "almacen-a", "almacen-c", "almacen-d", "almacen-g", "tienda-web"]) {
    const rec = await prisma.saleRecord.findFirst({
      where: { organizationId: orgId, storeSlug: slug },
      select: { rawJson: true, storeSlug: true, storeName: true },
      orderBy: { saleDate: "desc" },
    });
    if (rec) {
      const raw = rec.rawJson as Record<string, unknown>;
      console.log(`\n  ${slug} (${rec.storeName}):`);
      // Show ka_nl fields (SAG FK fields)
      const nlKeys = Object.keys(raw).filter(k => k.startsWith("ka_nl") || k.startsWith("ss_") || k.includes("bodega"));
      for (const k of nlKeys) {
        console.log(`    ${k} = ${JSON.stringify(raw[k])}`);
      }
      if (nlKeys.length === 0) {
        // Show first 15 keys
        console.log(`    First 15 keys: ${Object.keys(raw).slice(0, 15).join(", ")}`);
      }
    }
  }

  await pool.end();
  console.log("\n=== DONE ===");
}

main().catch(console.error);
