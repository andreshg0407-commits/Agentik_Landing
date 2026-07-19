import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const ORG = "cmmpwstuf000dp5y58kj1daaj";
const REFS = ["L-1367", "L-8467", "CJ-1126012", "CJ-2026004B"];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  console.log("\n=== Q1: ALL BODEGAS FOR 4 AUDIT REFS ===");
  const q1 = await db.$queryRawUnsafe(
    `SELECT pe.sku, pil."externalRef" as bodega, SUM(pil."quantity")::float as qty
     FROM "ProductInventoryLevel" pil
     JOIN "ProductEntity" pe ON pe.id = pil."productId"
     WHERE pil."organizationId" = $1 AND pe.sku = ANY($2::text[])
     GROUP BY pe.sku, pil."externalRef"
     ORDER BY pe.sku, pil."externalRef"`,
    ORG, REFS,
  );
  console.table(q1);

  console.log("\n=== Q2: ALL BODEGAS GLOBALLY ===");
  const q2 = await db.$queryRawUnsafe(
    `SELECT "externalRef" as bodega, COUNT(DISTINCT "productId")::int as products,
            SUM("quantity")::float as total_qty
     FROM "ProductInventoryLevel"
     WHERE "organizationId" = $1
     GROUP BY "externalRef"
     ORDER BY "externalRef"`,
    ORG,
  );
  console.table(q2);

  console.log("\n=== Q3: CUSTOMER ORDER STATUS ===");
  const q3 = await db.$queryRawUnsafe(
    `SELECT status, COUNT(*)::int as cnt FROM "CustomerOrderRecord"
     WHERE "organizationId" = $1 GROUP BY status ORDER BY cnt DESC`, ORG,
  );
  console.table(q3);

  console.log("\n=== Q4: CUSTOMER ORDER COLUMNS ===");
  const q4 = await db.$queryRawUnsafe(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'CustomerOrderRecord' ORDER BY ordinal_position`,
  );
  console.table(q4);

  console.log("\n=== Q5: CRM QUOTE LINE COUNT + 4 REFS ===");
  try {
    const q5a = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int as total FROM "CRMQuoteLine" WHERE "organizationId" = $1`, ORG,
    );
    console.log("Total CRMQuoteLines:", q5a);
    const q5b = await db.$queryRawUnsafe(
      `SELECT reference, SUM(qty::float)::float as total_qty, COUNT(*)::int as lines,
              STRING_AGG(DISTINCT "warehouseName", ', ') as warehouses
       FROM "CRMQuoteLine" WHERE "organizationId" = $1 AND reference = ANY($2::text[])
       GROUP BY reference ORDER BY reference`,
      ORG, REFS,
    );
    console.table(q5b);
  } catch (e) { console.log("CRMQuoteLine:", (e as Error).message); }

  console.log("\n=== Q6: COMMITMENT TABLES ===");
  const q6 = await db.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
     AND (table_name ILIKE '%maleta%' OR table_name ILIKE '%vendor%' OR table_name ILIKE '%bag%'
       OR table_name ILIKE '%store%' OR table_name ILIKE '%tienda%' OR table_name ILIKE '%transfer%'
       OR table_name ILIKE '%reservation%' OR table_name ILIKE '%commitment%'
       OR table_name ILIKE '%CommercialCase%')
     ORDER BY table_name`,
  );
  console.table(q6);

  console.log("\n=== Q7: COVERAGE SNAPSHOT FOR 4 REFS ===");
  const q7 = await db.$queryRawUnsafe(
    `SELECT "refCode", disponible, "pendingOrdersQty", status, "snapshotAt"
     FROM "CommercialCoverageSnapshot"
     WHERE "organizationId" = $1 AND "refCode" = ANY($2::text[])
     ORDER BY "refCode", "snapshotAt" DESC`,
    ORG, REFS,
  );
  console.table(q7);

  console.log("\n=== Q8: RESERVED QTY ===");
  const q8 = await db.$queryRawUnsafe(
    `SELECT pe.sku, pil."externalRef" as bodega,
            SUM(pil."quantity")::float as qty, SUM(pil."reservedQty")::float as reserved
     FROM "ProductInventoryLevel" pil
     JOIN "ProductEntity" pe ON pe.id = pil."productId"
     WHERE pil."organizationId" = $1 AND pe.sku = ANY($2::text[])
       AND pil."externalRef" IN ('01', '04')
     GROUP BY pe.sku, pil."externalRef"
     ORDER BY pe.sku, pil."externalRef"`,
    ORG, REFS,
  );
  console.table(q8);

  console.log("\n=== Q9: STORES IN SALE RECORDS ===");
  const q9 = await db.$queryRawUnsafe(
    `SELECT "storeSlug", "storeName", COUNT(*)::int as sales
     FROM "SaleRecord" WHERE "organizationId" = $1
     GROUP BY "storeSlug", "storeName" ORDER BY sales DESC LIMIT 20`, ORG,
  );
  console.table(q9);

  console.log("\n=== Q10: CRM QUOTE STATUS ===");
  try {
    const q10 = await db.$queryRawUnsafe(
      `SELECT status, COUNT(*)::int as cnt FROM "CRMQuote"
       WHERE "organizationId" = $1 GROUP BY status ORDER BY cnt DESC`, ORG,
    );
    console.table(q10);
  } catch (e) { console.log("CRMQuote:", (e as Error).message); }

  console.log("\n=== Q11: BODEGAS BEYOND 01/04 FOR 4 REFS ===");
  const q11 = await db.$queryRawUnsafe(
    `SELECT pe.sku, pil."externalRef" as bodega, SUM(pil."quantity")::float as qty
     FROM "ProductInventoryLevel" pil
     JOIN "ProductEntity" pe ON pe.id = pil."productId"
     WHERE pil."organizationId" = $1 AND pe.sku = ANY($2::text[])
       AND pil."externalRef" NOT IN ('01', '04')
     GROUP BY pe.sku, pil."externalRef"
     HAVING ABS(SUM(pil."quantity")) > 0.01
     ORDER BY pe.sku, pil."externalRef"`,
    ORG, REFS,
  );
  console.table(q11);

  await prisma.$disconnect();
  pool.end();
}
main().catch(e => { console.error("FATAL:", (e as Error).message); process.exit(1); });
