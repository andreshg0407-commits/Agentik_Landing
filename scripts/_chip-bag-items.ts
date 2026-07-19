import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" } });
  if (!org) { console.log("no org"); return; }

  const importProducts = await prisma.productEntity.findMany({
    where: { organizationId: org.id, productLine: "5" },
    select: { sku: true },
  });
  const importRefSet = new Set(importProducts.map((p: any) => p.sku).filter(Boolean));
  console.log("Import ref universe: " + importRefSet.size);

  const bags = await prisma.vendorCommercialBag.findMany({
    where: { organizationId: org.id },
    select: { salesRepId: true, items: { select: { reference: true } } },
  });

  for (const b of bags) {
    const importItems = b.items.filter((i: any) => importRefSet.has(i.reference));
    console.log(b.salesRepId + ": total=" + b.items.length + " import=" + importItems.length);
  }

  await prisma.$disconnect();
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
