import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);
  const db = prisma as any;

  const count: Array<{ c: number }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int as c FROM "CustomerOrderLine"`,
  );
  console.log("Current CustomerOrderLine count:", count[0].c);

  if (count[0].c > 0) {
    await db.$executeRawUnsafe(`DELETE FROM "CustomerOrderLine"`);
    console.log("Cleaned up partial sync data");
  } else {
    console.log("Table is empty — no cleanup needed");
  }

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
