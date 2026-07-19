import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const ORG = "cmmpwstuf000dp5y58kj1daaj";
const REFS = ["L-1367", "L-8467", "CJ-1126012", "CJ-2026004B"];
const ADMIN: Record<string, number> = { "L-1367": 64, "L-8467": 511, "CJ-1126012": 79, "CJ-2026004B": 164 };

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  // CRM Quote statuses
  console.log("\n=== CRM QUOTE STATUS ENUM ===");
  const qStatuses = await db.$queryRawUnsafe(
    `SELECT DISTINCT status FROM "CRMQuote" WHERE "organizationId" = $1`, ORG,
  );
  console.table(qStatuses);

  // CRM commitment with DRAFT status (the only one that exists)
  console.log("\n=== CRM DRAFT COMMITMENTS FOR 4 REFS ===");
  for (const ref of REFS) {
    const crm = await db.$queryRawUnsafe(
      `SELECT SUM(ql.qty::float)::float as qty, COUNT(*)::int as lines
       FROM "CRMQuoteLine" ql
       JOIN "CRMQuote" q ON q.id = ql."quoteId"
       WHERE ql."organizationId" = $1 AND ql.reference = $2`, ORG, ref,
    );
    const crmQty = Math.round(crm[0]?.qty ?? 0);
    const b01b04Rows = await db.$queryRawUnsafe(
      `SELECT SUM(pil."quantity")::float as qty
       FROM "ProductInventoryLevel" pil
       JOIN "ProductEntity" pe ON pe.id = pil."productId"
       WHERE pil."organizationId" = $1 AND pe.sku = $2
         AND pil."externalRef" IN ('01','04')`, ORG, ref,
    );
    const gross = Math.round(b01b04Rows[0]?.qty ?? 0);
    const calculated = gross - crmQty;
    const adminQty = ADMIN[ref];
    
    console.log(`  ${ref.padEnd(14)} gross=${gross}  crm_draft=${crmQty}  calc=${calculated}  admin=${adminQty}  gap=${adminQty - calculated}`);
  }

  // Global: CRM draft commitments impact
  console.log("\n=== GLOBAL CRM DRAFT COMMITMENT IMPACT ===");
  const globalCrm = await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT ql.reference)::int as refs,
            SUM(ql.qty::float)::float as total_qty
     FROM "CRMQuoteLine" ql
     JOIN "CRMQuote" q ON q.id = ql."quoteId"
     WHERE ql."organizationId" = $1 AND q.status = 'DRAFT'`, ORG,
  );
  console.table(globalCrm);

  // Bodegas 00, 02, 03, 22, 23, 29 — what are they? Check transfer destinations
  console.log("\n=== BODEGA IDENTITY FROM MASTER LOOKUPS ===");
  try {
    // Check if there's a warehouse/bodega lookup in ProductInventoryLevel
    const whNames = await db.$queryRawUnsafe(
      `SELECT DISTINCT pil."externalRef" as code, pil."warehouseId" as name
       FROM "ProductInventoryLevel" pil
       WHERE pil."organizationId" = $1
         AND pil."externalRef" IN ('00','02','03','08','09','10','11','12','13','14','15','22','23','29')
       ORDER BY pil."externalRef"
       LIMIT 30`, ORG,
    );
    console.table(whNames);
  } catch (e) { console.log("Warehouse names:", (e as Error).message); }

  // SaleRecord stores — do any map to bodegas?
  console.log("\n=== STORE SLUGS IN SALE RECORDS ===");
  const stores = await db.$queryRawUnsafe(
    `SELECT "storeSlug", "storeName", COUNT(*)::int as cnt
     FROM "SaleRecord" WHERE "organizationId" = $1
     GROUP BY "storeSlug", "storeName"
     ORDER BY cnt DESC`, ORG,
  );
  console.table(stores);

  // Key question: are bodegas 08-15 the vendor/store bodegas?
  // Check warehouse names from SAG
  console.log("\n=== WAREHOUSE NAMES FROM ProductInventoryLevel ===");
  const whAll = await db.$queryRawUnsafe(
    `SELECT DISTINCT "externalRef" as code, "warehouseId" as wh_id
     FROM "ProductInventoryLevel"
     WHERE "organizationId" = $1
     ORDER BY "externalRef"`, ORG,
  );
  console.table(whAll);

  await prisma.$disconnect();
  pool.end();
}
main().catch(e => { console.error("FATAL:", (e as Error).message); process.exit(1); });
