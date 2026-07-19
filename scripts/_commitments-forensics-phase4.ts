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

  // Q1: VendorCommercialBag
  console.log("\n=== VENDOR BAGS ===");
  const q1 = await db.$queryRawUnsafe(
    `SELECT status, COUNT(*)::int as cnt FROM "VendorCommercialBag"
     WHERE "organizationId" = $1 GROUP BY status`, ORG,
  );
  console.table(q1);

  // Q2: VendorBagItem for 4 refs
  console.log("\n=== VENDOR BAG ITEMS FOR 4 REFS ===");
  const q2 = await db.$queryRawUnsafe(
    `SELECT vbi.reference, vbi."assignedQty", vbi."soldQty", vbi."availableToSellQty",
            vbi.status, vcb.status as bag_status, vcb."salesRepId"
     FROM "VendorBagItem" vbi
     JOIN "VendorCommercialBag" vcb ON vcb.id = vbi."bagId"
     WHERE vcb."organizationId" = $1 AND vbi.reference = ANY($2::text[])
     ORDER BY vbi.reference`, ORG, REFS,
  );
  console.table(q2);

  // Q3: Total assigned qty per ref across all active bags
  console.log("\n=== TOTAL ASSIGNED QTY ACROSS ALL BAGS (ALL REFS) ===");
  const q3 = await db.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT vbi.reference)::int as distinct_refs,
            SUM(vbi."assignedQty")::float as total_assigned,
            SUM(vbi."soldQty")::float as total_sold,
            vcb.status as bag_status
     FROM "VendorBagItem" vbi
     JOIN "VendorCommercialBag" vcb ON vcb.id = vbi."bagId"
     WHERE vcb."organizationId" = $1
     GROUP BY vcb.status`, ORG,
  );
  console.table(q3);

  // Q4: InventoryTransfer — open transfers with textile products
  console.log("\n=== OPEN TRANSFERS ===");
  const q4 = await db.$queryRawUnsafe(
    `SELECT it."originWarehouseCode" as from_wh, it."destinationWarehouseCode" as to_wh,
            COUNT(DISTINCT it.id)::int as transfers,
            COUNT(itl.id)::int as lines,
            SUM(itl.quantity::float)::float as total_qty
     FROM "InventoryTransfer" it
     JOIN "InventoryTransferLine" itl ON itl."inventoryTransferId" = it.id
     WHERE it."organizationId" = $1 AND it.status = 'open'
     GROUP BY it."originWarehouseCode", it."destinationWarehouseCode"
     ORDER BY total_qty DESC`, ORG,
  );
  console.table(q4);

  // Q5: Transfer lines for 4 refs
  console.log("\n=== TRANSFER LINES FOR 4 REFS ===");
  const q5 = await db.$queryRawUnsafe(
    `SELECT itl."referenceCode", itl.quantity::float as qty,
            it.status, it."originWarehouseCode" as from_wh,
            it."destinationWarehouseCode" as to_wh, it."documentDate"
     FROM "InventoryTransferLine" itl
     JOIN "InventoryTransfer" it ON it.id = itl."inventoryTransferId"
     WHERE it."organizationId" = $1 AND itl."referenceCode" = ANY($2::text[])
     ORDER BY itl."referenceCode", it."documentDate" DESC`, ORG, REFS,
  );
  console.table(q5);

  // Q6: Bodega analysis — what are bodegas 02, 03, 22, 23, 29?
  // Check if they appear as destination in transfers
  console.log("\n=== BODEGAS AS TRANSFER DESTINATIONS ===");
  const q6 = await db.$queryRawUnsafe(
    `SELECT "destinationWarehouseCode" as bodega,
            "destinationWarehouseName" as name,
            COUNT(*)::int as transfers
     FROM "InventoryTransfer"
     WHERE "organizationId" = $1
     GROUP BY "destinationWarehouseCode", "destinationWarehouseName"
     ORDER BY transfers DESC`, ORG,
  );
  console.table(q6);

  // Q7: CRMQuote lines for 4 refs — pending quotes as commitments
  console.log("\n=== CRM QUOTE LINES FOR 4 REFS (PENDING) ===");
  try {
    const q7 = await db.$queryRawUnsafe(
      `SELECT ql.reference, ql.qty::float as qty, ql."warehouseName",
              q.status as quote_status, q."sellerSlug"
       FROM "CRMQuoteLine" ql
       JOIN "CRMQuote" q ON q.id = ql."quoteId"
       WHERE ql."organizationId" = $1 AND ql.reference = ANY($2::text[])
       ORDER BY ql.reference`, ORG, REFS,
    );
    console.table(q7);
  } catch (e) { console.log("CRMQuote join:", (e as Error).message); }

  // Q8: rawJson content for CustomerOrderRecord
  console.log("\n=== ORDER rawJson (first non-empty) ===");
  const q8 = await db.$queryRawUnsafe(
    `SELECT "rawJson"::text FROM "CustomerOrderRecord"
     WHERE "organizationId" = $1 AND "rawJson"::text != '{}'
     LIMIT 1`, ORG,
  );
  if (q8[0]) console.log(q8[0].rawJson.substring(0, 500));
  else console.log("All rawJson are empty");

  await prisma.$disconnect();
  pool.end();
}
main().catch(e => { console.error("FATAL:", (e as Error).message); process.exit(1); });
