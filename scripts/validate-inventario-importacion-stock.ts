/**
 * validate-inventario-importacion-stock.ts
 *
 * INVENTARIO-IMPORTACION-STOCK-ROOT-CAUSE-01 — Validation script.
 *
 * Usage: npx tsx scripts/validate-inventario-importacion-stock.ts
 */
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
  if (!org) { console.log("FATAL: org not found"); process.exit(1); }
  const orgId = org.id;

  let pass = 0;
  let fail = 0;
  const check = (label: string, ok: boolean, detail?: string) => {
    if (ok) { pass++; console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`); }
    else    { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`); }
  };

  console.log("=== INVENTARIO-IMPORTACION-STOCK VALIDATION ===\n");

  // 1. Import refs exist
  const totalImport = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS cnt FROM "ProductEntity"
    WHERE "organizationId" = ${orgId} AND "productLine" = '5'
  ` as any[];
  const importCount = totalImport[0]?.cnt ?? 0;
  check("Import refs exist (productLine=5)", importCount > 0, `${importCount} refs`);

  // 2. Warehouses 36/37 have inventory rows
  const wh36 = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS cnt, SUM("quantity")::float AS units
    FROM "ProductInventoryLevel"
    WHERE "organizationId" = ${orgId} AND "warehouseId" = '36'
  ` as any[];
  const wh37 = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS cnt, SUM("quantity")::float AS units
    FROM "ProductInventoryLevel"
    WHERE "organizationId" = ${orgId} AND "warehouseId" = '37'
  ` as any[];
  check("Warehouse 36 has rows", (wh36[0]?.cnt ?? 0) > 0, `${wh36[0]?.cnt} rows, ${Math.round(wh36[0]?.units ?? 0)} uds`);
  check("Warehouse 37 has rows", (wh37[0]?.cnt ?? 0) > 0, `${wh37[0]?.cnt} rows, ${Math.round(wh37[0]?.units ?? 0)} uds`);

  // 3. Import refs in B36+B37 have stock
  const importB36B37 = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT p."sku")::int AS refs,
           SUM(GREATEST(pil."quantity", 0))::float AS units
    FROM "ProductInventoryLevel" pil
    JOIN "ProductEntity" p ON p."id" = pil."productId" AND p."organizationId" = pil."organizationId"
    WHERE p."organizationId" = ${orgId}
    AND p."productLine" = '5'
    AND pil."warehouseId" IN ('36', '37')
  ` as any[];
  const b36b37Refs = importB36B37[0]?.refs ?? 0;
  const b36b37Units = Math.round(importB36B37[0]?.units ?? 0);
  check("Import refs in B36+B37 > 0", b36b37Refs > 0, `${b36b37Refs} refs`);
  check("Import units in B36+B37 > 0", b36b37Units > 0, `${b36b37Units} uds`);

  // 4. Column names are correct (no warehouseCode, no productEntityId)
  const cols = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'ProductInventoryLevel'
  ` as any[];
  const colNames = (cols as any[]).map((c: any) => c.column_name);
  check("Column 'warehouseId' exists", colNames.includes("warehouseId"));
  check("Column 'productId' exists", colNames.includes("productId"));
  check("Column 'warehouseCode' does NOT exist", !colNames.includes("warehouseCode"));
  check("Column 'productEntityId' does NOT exist", !colNames.includes("productEntityId"));

  // 5. Import units by warehouse breakdown
  console.log("\n--- Import inventory by warehouse ---");
  const importByWh = await prisma.$queryRaw`
    SELECT pil."warehouseId",
           COUNT(DISTINCT p."sku")::int AS refs,
           SUM(GREATEST(pil."quantity", 0))::float AS units
    FROM "ProductInventoryLevel" pil
    JOIN "ProductEntity" p ON p."id" = pil."productId" AND p."organizationId" = pil."organizationId"
    WHERE p."organizationId" = ${orgId}
    AND p."productLine" = '5'
    AND pil."quantity" > 0
    GROUP BY pil."warehouseId"
    ORDER BY units DESC
    LIMIT 10
  ` as any[];
  for (const r of importByWh) {
    console.log(`  warehouseId=${r.warehouseId}: ${r.refs} refs, ${Math.round(r.units)} uds`);
  }

  // 6. First 20 import refs WITH stock (B36+B37)
  console.log("\n--- First 20 import refs WITH stock (B36+B37) ---");
  const withStock = await prisma.$queryRaw`
    SELECT p."sku", p."name",
           SUM(GREATEST(pil."quantity", 0))::int AS available
    FROM "ProductInventoryLevel" pil
    JOIN "ProductEntity" p ON p."id" = pil."productId" AND p."organizationId" = pil."organizationId"
    WHERE p."organizationId" = ${orgId}
    AND p."productLine" = '5'
    AND pil."warehouseId" IN ('36', '37')
    AND pil."quantity" > 0
    GROUP BY p."sku", p."name"
    ORDER BY available DESC
    LIMIT 20
  ` as any[];
  for (const r of withStock) {
    console.log(`  ${r.sku}: ${r.available} uds — ${(r.name ?? "").slice(0, 50)}`);
  }

  // 7. First 20 import refs WITHOUT stock (B36+B37)
  console.log("\n--- First 20 import refs WITHOUT stock in B36+B37 ---");
  const noStock = await prisma.$queryRaw`
    SELECT p."sku", p."name"
    FROM "ProductEntity" p
    WHERE p."organizationId" = ${orgId}
    AND p."productLine" = '5'
    AND p."sku" NOT IN (
      SELECT DISTINCT pe."sku"
      FROM "ProductInventoryLevel" pil
      JOIN "ProductEntity" pe ON pe."id" = pil."productId" AND pe."organizationId" = pil."organizationId"
      WHERE pe."organizationId" = ${orgId}
      AND pe."productLine" = '5'
      AND pil."warehouseId" IN ('36', '37')
      AND pil."quantity" > 0
    )
    LIMIT 20
  ` as any[];
  for (const r of noStock) {
    console.log(`  ${r.sku}: 0 uds — ${(r.name ?? "").slice(0, 50)}`);
  }

  console.log(`\n=== RESULT: ${pass} PASS / ${fail} FAIL ===`);
  await prisma.$disconnect();
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
