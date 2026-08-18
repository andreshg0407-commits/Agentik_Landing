import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

async function main() {
  // 1. Count products by SAG productLine
  const counts = await (prisma as any).productEntity.groupBy({
    by: ["productLine"],
    _count: { id: true },
    where: { organizationId: ORG_ID },
    orderBy: { _count: { id: "desc" } },
  });
  console.log("=== Products by SAG productLine ===");
  for (const c of counts) {
    console.log(`  Line ${JSON.stringify(c.productLine)} → ${c._count.id} products`);
  }

  // 2. Sample products from each line
  for (const line of ["1", "2", "3", "4", "5"]) {
    const samples = await (prisma as any).productEntity.findMany({
      where: { organizationId: ORG_ID, productLine: line },
      take: 5,
      select: { sku: true, name: true, productLine: true, grupoSag: true, subgrupoSag: true, lineaSag: true, description: true },
    });
    console.log(`\nLine ${line} samples:`);
    for (const s of samples) {
      console.log(`  ${s.sku} | ${(s.name ?? "").substring(0, 40)} | lineaSag:${s.lineaSag} grp:${s.grupoSag} sub:${s.subgrupoSag}`);
    }
  }

  // 3. Check what lineaSag values exist (the raw SAG label)
  const lineaSagCounts = await (prisma as any).productEntity.groupBy({
    by: ["lineaSag"],
    _count: { id: true },
    where: { organizationId: ORG_ID },
    orderBy: { _count: { id: "desc" } },
  });
  console.log("\n=== Products by lineaSag (raw SAG label) ===");
  for (const c of lineaSagCounts) {
    console.log(`  lineaSag=${JSON.stringify(c.lineaSag)} → ${c._count.id} products`);
  }

  await prisma.$disconnect();
  pool.end();
}
main();
