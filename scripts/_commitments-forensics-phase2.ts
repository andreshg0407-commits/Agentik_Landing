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

  // Q1: VendorCommercialBag status
  console.log("\n=== VENDOR BAGS ===");
  try {
    const q1 = await db.$queryRawUnsafe(
      `SELECT status, COUNT(*)::int as cnt FROM "VendorCommercialBag"
       WHERE "orgId" = $1 GROUP BY status`, ORG,
    );
    console.table(q1);
  } catch (e) { console.log("VendorCommercialBag:", (e as Error).message); }

  // Q2: VendorBagItem for 4 refs
  console.log("\n=== VENDOR BAG ITEMS FOR 4 REFS ===");
  try {
    const q2 = await db.$queryRawUnsafe(
      `SELECT vbi.reference, vbi."assignedQty", vbi."soldQty", vbi."availableToSellQty",
              vbi.status, vcb.status as bag_status, vcb."salesRepId"
       FROM "VendorBagItem" vbi
       JOIN "VendorCommercialBag" vcb ON vcb.id = vbi."bagId"
       WHERE vcb."orgId" = $1 AND vbi.reference = ANY($2::text[])
       ORDER BY vbi.reference`, ORG, REFS,
    );
    console.table(q2);
  } catch (e) { console.log("VendorBagItem:", (e as Error).message); }

  // Q3: InventoryTransfer status
  console.log("\n=== INVENTORY TRANSFERS ===");
  try {
    const q3 = await db.$queryRawUnsafe(
      `SELECT status, COUNT(*)::int as cnt FROM "InventoryTransfer"
       WHERE "organizationId" = $1 GROUP BY status`, ORG,
    );
    console.table(q3);
  } catch (e) { console.log("InventoryTransfer:", (e as Error).message); }

  // Q4: InventoryTransferLine for 4 refs
  console.log("\n=== TRANSFER LINES FOR 4 REFS ===");
  try {
    const q4 = await db.$queryRawUnsafe(
      `SELECT itl.reference, itl.qty, it.status, it."fromWarehouse", it."toWarehouse"
       FROM "InventoryTransferLine" itl
       JOIN "InventoryTransfer" it ON it.id = itl."transferId"
       WHERE it."organizationId" = $1 AND itl.reference = ANY($2::text[])`, ORG, REFS,
    );
    console.table(q4);
  } catch (e) { console.log("InventoryTransferLine:", (e as Error).message); }

  // Q5: OperationalReservation
  console.log("\n=== OPERATIONAL RESERVATIONS ===");
  try {
    const q5 = await db.$queryRawUnsafe(
      `SELECT status, COUNT(*)::int as cnt FROM "OperationalReservation"
       WHERE "organizationId" = $1 GROUP BY status`, ORG,
    );
    console.table(q5);
  } catch (e) { console.log("OperationalReservation:", (e as Error).message); }

  // Q6: CommercialCaseItem for 4 refs (maleta assignments)
  console.log("\n=== COMMERCIAL CASE ITEMS FOR 4 REFS ===");
  try {
    const q6 = await db.$queryRawUnsafe(
      `SELECT reference, line, "currentUnits", "assignedSalesRepIds", "snapshotAt"
       FROM "CommercialCaseItem"
       WHERE "organizationId" = $1 AND reference = ANY($2::text[])
       ORDER BY reference, "snapshotAt" DESC`, ORG, REFS,
    );
    console.table(q6);
  } catch (e) { console.log("CommercialCaseItem:", (e as Error).message); }

  // Q7: Bodegas 02, 03, 22, 23, 29 — what are they? Count textile products
  console.log("\n=== POTENTIAL VENDOR/STORE BODEGAS (TEXTILE ONLY) ===");
  const q7 = await db.$queryRawUnsafe(
    `SELECT pil."externalRef" as bodega,
            COUNT(DISTINCT pe.sku)::int as textile_products,
            SUM(pil."quantity")::float as total_qty,
            SUM(CASE WHEN pil."quantity" < 0 THEN 1 ELSE 0 END)::int as negatives,
            SUM(CASE WHEN pil."quantity" > 0 THEN 1 ELSE 0 END)::int as positives
     FROM "ProductInventoryLevel" pil
     JOIN "ProductEntity" pe ON pe.id = pil."productId"
     WHERE pil."organizationId" = $1
       AND pe."productLine" IN ('1', '2')
       AND pil."externalRef" NOT IN ('01', '04')
     GROUP BY pil."externalRef"
     ORDER BY textile_products DESC`, ORG,
  );
  console.table(q7);

  // Q8: CustomerOrderRecord — sample rawJson to see if it has product refs
  console.log("\n=== SAMPLE ORDER rawJson KEYS ===");
  const q8 = await db.$queryRawUnsafe(
    `SELECT jsonb_object_keys("rawJson") as key
     FROM "CustomerOrderRecord"
     WHERE "organizationId" = $1
     LIMIT 1`, ORG,
  );
  // Actually get all keys from one record
  const q8b = await db.$queryRawUnsafe(
    `SELECT DISTINCT jsonb_object_keys("rawJson") as key
     FROM (SELECT "rawJson" FROM "CustomerOrderRecord"
           WHERE "organizationId" = $1 LIMIT 1) sub`, ORG,
  );
  console.table(q8b);

  // Q9: VendorBagOrderLine
  console.log("\n=== VENDOR BAG ORDER LINES ===");
  try {
    const q9 = await db.$queryRawUnsafe(
      `SELECT COUNT(*)::int as cnt FROM "VendorBagOrderLine"
       WHERE "organizationId" = $1`, ORG,
    );
    console.table(q9);
  } catch (e) { console.log("VendorBagOrderLine:", (e as Error).message); }

  await prisma.$disconnect();
  pool.end();
}
main().catch(e => { console.error("FATAL:", (e as Error).message); process.exit(1); });
