import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" }, select: { id: true } });
  const all = await prisma.customerProfile.findMany({ where: { organizationId: org!.id }, select: { city: true, department: true } });
  const text = all.filter(p => p.city && !/^\d+$/.test(p.city.trim())).length;
  const numeric = all.filter(p => p.city && /^\d+$/.test(p.city.trim())).length;
  const empty = all.filter(p => !p.city || p.city.trim() === "").length;
  const withDept = all.filter(p => p.department && !/^\d+$/.test(p.department.trim())).length;
  console.log(`Text cities: ${text} | Numeric: ${numeric} | Empty: ${empty} | Total: ${all.length}`);
  console.log(`With department name: ${withDept}`);
  await prisma.$disconnect(); await pool.end();
}
main();
