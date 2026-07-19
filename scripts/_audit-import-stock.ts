import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as dotenv from "dotenv";
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any) as any;

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("FATAL: org not found"); return; }
  const orgId = org.id;

  console.log("=== PHASE 1: ProductEntity.productLine distribution ===\n");
  const lines = await prisma.$queryRaw`
    SELECT "productLine", COUNT(*)::int AS cnt
    FROM "ProductEntity"
    WHERE "organizationId" = ${orgId}
    GROUP BY "productLine"
    ORDER BY cnt DESC
  `;
  for (const r of lines as any[]) console.log(`  productLine=${r.productLine ?? "NULL"}: ${r.cnt} refs`);

  console.log("\n=== PHASE 2: ProductInventoryLevel columns + warehouses ===\n");

  // Check actual column names
  const cols = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'ProductInventoryLevel'
    ORDER BY ordinal_position
  `;
  console.log("[2a] Actual columns:", (cols as any[]).map((c: any) => c.column_name).join(", "));

  // All distinct warehouseId values
  const whs = await prisma.$queryRaw`
    SELECT "warehouseId", COUNT(*)::int AS cnt, SUM("quantity")::float AS units
    FROM "ProductInventoryLevel"
    WHERE "organizationId" = ${orgId}
    GROUP BY "warehouseId"
    ORDER BY units DESC
  `;
  console.log("\n[2b] All warehouseId values:");
  for (const r of whs as any[]) console.log(`  warehouseId=${r.warehouseId}: ${r.cnt} rows, ${Math.round(r.units)} uds`);

  // All distinct externalRef values (sample)
  const refs = await prisma.$queryRaw`
    SELECT "externalRef", COUNT(*)::int AS cnt, SUM("quantity")::float AS units
    FROM "ProductInventoryLevel"
    WHERE "organizationId" = ${orgId}
    AND "externalRef" IS NOT NULL
    GROUP BY "externalRef"
    ORDER BY units DESC
    LIMIT 20
  `;
  console.log("\n[2c] Top externalRef values:");
  for (const r of refs as any[]) console.log(`  externalRef=${r.externalRef}: ${r.cnt} rows, ${Math.round(r.units)} uds`);

  console.log("\n=== PHASE 3: Import refs + their inventory ===\n");

  // Import refs with inventory breakdown
  const importInv = await prisma.$queryRaw`
    SELECT pil."warehouseId",
           COUNT(DISTINCT p."id")::int AS refs,
           SUM(pil."quantity")::float AS units
    FROM "ProductInventoryLevel" pil
    JOIN "ProductEntity" p ON p."id" = pil."productId" AND p."organizationId" = pil."organizationId"
    WHERE p."organizationId" = ${orgId}
    AND p."productLine" = '5'
    GROUP BY pil."warehouseId"
    ORDER BY units DESC
  `;
  console.log("[3a] Import (productLine=5) inventory by warehouseId:");
  if ((importInv as any[]).length === 0) console.log("  (NONE)");
  for (const r of importInv as any[]) console.log(`  warehouseId=${r.warehouseId}: ${r.refs} refs, ${Math.round(r.units)} uds`);

  // Import refs with externalRef breakdown
  const importExtRef = await prisma.$queryRaw`
    SELECT pil."externalRef",
           COUNT(DISTINCT p."id")::int AS refs,
           SUM(pil."quantity")::float AS units
    FROM "ProductInventoryLevel" pil
    JOIN "ProductEntity" p ON p."id" = pil."productId" AND p."organizationId" = pil."organizationId"
    WHERE p."organizationId" = ${orgId}
    AND p."productLine" = '5'
    GROUP BY pil."externalRef"
    ORDER BY units DESC
  `;
  console.log("\n[3b] Import (productLine=5) inventory by externalRef:");
  if ((importExtRef as any[]).length === 0) console.log("  (NONE)");
  for (const r of importExtRef as any[]) console.log(`  externalRef=${r.externalRef ?? "NULL"}: ${r.refs} refs, ${Math.round(r.units)} uds`);

  // Top 15 import refs with stock
  const topImport = await prisma.$queryRaw`
    SELECT p."sku", p."name",
           SUM(pil."quantity")::float AS total_stock,
           STRING_AGG(DISTINCT pil."warehouseId", ',') AS warehouses,
           STRING_AGG(DISTINCT pil."externalRef", ',') AS ext_refs
    FROM "ProductEntity" p
    LEFT JOIN "ProductInventoryLevel" pil ON pil."productId" = p."id" AND pil."organizationId" = p."organizationId"
    WHERE p."organizationId" = ${orgId}
    AND p."productLine" = '5'
    GROUP BY p."sku", p."name"
    ORDER BY total_stock DESC
    LIMIT 15
  `;
  console.log("\n[3c] Top 15 import refs by stock:");
  for (const r of topImport as any[]) console.log(`  ${r.sku}: ${Math.round(r.total_stock ?? 0)} uds (wh: ${r.warehouses ?? "NONE"}, ext: ${r.ext_refs ?? "NONE"})`);

  // How many import refs have ANY inventory at all?
  const importWithStock = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT p."sku")::int AS with_stock
    FROM "ProductEntity" p
    JOIN "ProductInventoryLevel" pil ON pil."productId" = p."id" AND pil."organizationId" = p."organizationId"
    WHERE p."organizationId" = ${orgId}
    AND p."productLine" = '5'
    AND pil."quantity" > 0
  `;
  const importTotal = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS total
    FROM "ProductEntity" p
    WHERE p."organizationId" = ${orgId}
    AND p."productLine" = '5'
  `;
  console.log(`\n[3d] Import refs with stock > 0: ${(importWithStock as any[])[0]?.with_stock ?? 0} / ${(importTotal as any[])[0]?.total ?? 0}`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
