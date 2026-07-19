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

  // Fix: find actual column names
  console.log("\n=== VendorCommercialBag COLUMNS ===");
  const vcbCols = await db.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'VendorCommercialBag' ORDER BY ordinal_position`,
  );
  console.table(vcbCols);

  console.log("\n=== VendorBagItem COLUMNS ===");
  const vbiCols = await db.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'VendorBagItem' ORDER BY ordinal_position`,
  );
  console.table(vbiCols);

  console.log("\n=== InventoryTransfer COLUMNS ===");
  const itCols = await db.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'InventoryTransfer' ORDER BY ordinal_position`,
  );
  console.table(itCols);

  console.log("\n=== InventoryTransferLine COLUMNS ===");
  const itlCols = await db.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'InventoryTransferLine' ORDER BY ordinal_position`,
  );
  console.table(itlCols);

  console.log("\n=== CustomerOrderRecord rawJson SAMPLE ===");
  const rawSample = await db.$queryRawUnsafe(
    `SELECT "rawJson" FROM "CustomerOrderRecord"
     WHERE "organizationId" = $1 LIMIT 1`, ORG,
  );
  if (rawSample[0]) {
    console.log("rawJson keys:", Object.keys(rawSample[0].rawJson));
    const rj = rawSample[0].rawJson;
    console.log("Sample fields:", {
      orderNumber: rj.n_numero_documento ?? rj.orderNumber,
      customer: rj.sc_beneficiario ?? rj.customerName,
      amount: rj.n_valor_documento ?? rj.amount,
    });
  }

  await prisma.$disconnect();
  pool.end();
}
main().catch(e => { console.error("FATAL:", (e as Error).message); process.exit(1); });
