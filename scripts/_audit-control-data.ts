import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "castillitos" }, select: { id: true } });
  if (!org) { console.log("No org"); return; }
  const id = org.id;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + 1); weekStart.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  
  console.log(`=== Dates ===`);
  console.log(`monthStart: ${monthStart.toISOString()}`);
  console.log(`weekStart:  ${weekStart.toISOString()}`);
  console.log(`today:      ${today.toISOString()}`);

  // SaleRecord
  const salesTotal = await prisma.saleRecord.count({ where: { organizationId: id } });
  const earliest = await prisma.saleRecord.findFirst({ where: { organizationId: id }, orderBy: { saleDate: "asc" }, select: { saleDate: true, sagSourceType: true } });
  const latest = await prisma.saleRecord.findFirst({ where: { organizationId: id }, orderBy: { saleDate: "desc" }, select: { saleDate: true, sagSourceType: true } });
  const salesMonth = await prisma.saleRecord.count({ where: { organizationId: id, saleDate: { gte: monthStart, lt: tomorrow } } });
  const salesMonthOficial = await prisma.saleRecord.count({ where: { organizationId: id, saleDate: { gte: monthStart, lt: tomorrow }, sagSourceType: "OFICIAL" } });
  
  console.log(`\n=== SaleRecord ===`);
  console.log(`Total: ${salesTotal}`);
  console.log(`Earliest: ${earliest?.saleDate?.toISOString()} (${earliest?.sagSourceType})`);
  console.log(`Latest: ${latest?.saleDate?.toISOString()} (${latest?.sagSourceType})`);
  console.log(`This month ALL: ${salesMonth}`);
  console.log(`This month OFICIAL: ${salesMonthOficial}`);

  // Sum amounts
  const allSales = await prisma.saleRecord.findMany({ where: { organizationId: id }, select: { amount: true, sagSourceType: true } });
  let oficialSum = 0, remisionSum = 0;
  for (const s of allSales) { const a = Number(s.amount)||0; if (s.sagSourceType==="OFICIAL") oficialSum+=a; else remisionSum+=a; }
  console.log(`OFICIAL sum: $${Math.round(oficialSum).toLocaleString()}`);
  console.log(`REMISION sum: $${Math.round(remisionSum).toLocaleString()}`);

  // Sample
  const sample = await prisma.saleRecord.findMany({ where: { organizationId: id }, orderBy: { saleDate: "desc" }, take: 5, select: { saleDate: true, amount: true, sellerName: true, sagSourceType: true, channel: true, storeName: true } });
  console.log(`\nLatest 5:`);
  for (const s of sample) console.log(`  ${s.saleDate?.toISOString()?.slice(0,10)} $${s.amount} ${s.sagSourceType} ${s.channel} ${s.sellerName} @ ${s.storeName}`);

  // Sellers
  const sellers = await prisma.saleRecord.findMany({ where: { organizationId: id }, select: { sellerSlug: true }, distinct: ["sellerSlug"] });
  console.log(`\nDistinct sellers: ${sellers.length}`);

  // Channels
  const channels = await prisma.saleRecord.findMany({ where: { organizationId: id }, select: { channel: true }, distinct: ["channel"] });
  console.log(`Channels: ${channels.map(c=>c.channel).join(", ")}`);

  // Stores
  const stores = await prisma.saleRecord.findMany({ where: { organizationId: id }, select: { storeSlug: true, storeName: true }, distinct: ["storeSlug"] });
  console.log(`Stores (${stores.length}): ${stores.slice(0,10).map(s=>`${s.storeSlug}`).join(", ")}`);

  // CRMQuote
  const qtotal = await prisma.cRMQuote.count({ where: { organizationId: id } });
  const qmonth = await prisma.cRMQuote.count({ where: { organizationId: id, issuedAt: { gte: monthStart, lt: tomorrow } } });
  const qearliest = await prisma.cRMQuote.findFirst({ where: { organizationId: id }, orderBy: { issuedAt: "asc" }, select: { issuedAt: true } });
  const qlatest = await prisma.cRMQuote.findFirst({ where: { organizationId: id }, orderBy: { issuedAt: "desc" }, select: { issuedAt: true } });
  const qsellers = await prisma.cRMQuote.findMany({ where: { organizationId: id }, select: { sellerSlug: true }, distinct: ["sellerSlug"] });
  console.log(`\n=== CRMQuote ===`);
  console.log(`Total: ${qtotal}, This month: ${qmonth}`);
  console.log(`Earliest: ${qearliest?.issuedAt?.toISOString()}, Latest: ${qlatest?.issuedAt?.toISOString()}`);
  console.log(`Distinct sellers: ${qsellers.length}`);

  // CollectionRecord
  const ctotal = await prisma.collectionRecord.count({ where: { organizationId: id } });
  const cmonth = await prisma.collectionRecord.count({ where: { organizationId: id, collectionDate: { gte: monthStart, lt: tomorrow } } });
  const cearliest = await prisma.collectionRecord.findFirst({ where: { organizationId: id }, orderBy: { collectionDate: "asc" }, select: { collectionDate: true } });
  const clatest = await prisma.collectionRecord.findFirst({ where: { organizationId: id }, orderBy: { collectionDate: "desc" }, select: { collectionDate: true } });
  console.log(`\n=== CollectionRecord ===`);
  console.log(`Total: ${ctotal}, This month: ${cmonth}`);
  console.log(`Earliest: ${cearliest?.collectionDate?.toISOString()}, Latest: ${clatest?.collectionDate?.toISOString()}`);

  // CustomerReceivable
  const rtotal = await prisma.customerReceivable.count({ where: { organizationId: id } });
  const rbalance = await prisma.customerReceivable.count({ where: { organizationId: id, balanceDue: { gt: 0 } } });
  const roverdue = await prisma.customerReceivable.count({ where: { organizationId: id, balanceDue: { gt: 0 }, daysOverdue: { gt: 0 } } });
  // Total cartera
  const allRec = await prisma.customerReceivable.findMany({ where: { organizationId: id, balanceDue: { gt: 0 } }, select: { balanceDue: true, daysOverdue: true } });
  let totalCartera = 0, vencidaCartera = 0;
  for (const r of allRec) { const b = Number(r.balanceDue)||0; totalCartera += b; if ((r.daysOverdue??0)>0) vencidaCartera += b; }
  console.log(`\n=== CustomerReceivable ===`);
  console.log(`Total: ${rtotal}, With balance: ${rbalance}, Overdue: ${roverdue}`);
  console.log(`Total cartera: $${Math.round(totalCartera).toLocaleString()}`);
  console.log(`Vencida: $${Math.round(vencidaCartera).toLocaleString()} (${totalCartera>0?(vencidaCartera/totalCartera*100).toFixed(1):"0"}%)`);

  // CustomerProfile
  const ptotal = await prisma.customerProfile.count({ where: { organizationId: id } });
  const pactive = await prisma.customerProfile.count({ where: { organizationId: id, status: "ACTIVE" } });
  console.log(`\n=== CustomerProfile ===`);
  console.log(`Total: ${ptotal}, Active: ${pactive}`);

  await prisma.$disconnect(); await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
