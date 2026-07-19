import * as path   from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

async function main() {
  const { prisma } = await import("../lib/prisma");
  const orgId = "cmmpwstuf000dp5y58kj1daaj";

  // Total and erpId counts
  const total     = await prisma.customerProfile.count({ where: { organizationId: orgId } });
  const withErp   = await prisma.customerProfile.count({ where: { organizationId: orgId, erpId: { not: null } } });
  const withSync  = await prisma.customerProfile.count({ where: { organizationId: orgId, erpSyncedAt: { not: null } } });
  console.log(`Total: ${total}  withErpId: ${withErp}  withErpSyncedAt: ${withSync}`);

  // erpSyncedAt distribution by hour
  const dist = await prisma.$queryRaw<{hr: string; cnt: bigint}[]>`
    SELECT to_char("erpSyncedAt", 'YYYY-MM-DD HH24:00') as hr, COUNT(*) as cnt
    FROM "CustomerProfile"
    WHERE "organizationId" = ${orgId} AND "erpSyncedAt" IS NOT NULL
    GROUP BY hr
    ORDER BY hr DESC
    LIMIT 10
  `;
  console.log("\nerpSyncedAt by hour:");
  for (const d of dist) console.log(`  ${d.hr}  →  ${d.cnt} rows`);

  // Newest 5 rows by erpSyncedAt
  const newest = await prisma.customerProfile.findMany({
    where: { organizationId: orgId, erpSyncedAt: { not: null } },
    orderBy: { erpSyncedAt: "desc" },
    take: 5,
    select: { id: true, slug: true, erpId: true, nit: true, erpSyncedAt: true },
  });
  console.log("\nNewest 5 rows by erpSyncedAt:");
  for (const r of newest) console.log(`  slug=${r.slug} erpId=${r.erpId} erpSyncedAt=${r.erpSyncedAt?.toISOString()}`);

  // Sample rows without erpSyncedAt (original CRM rows)
  const noSync = await prisma.customerProfile.findMany({
    where: { organizationId: orgId, erpSyncedAt: null },
    take: 5,
    orderBy: { id: "desc" },
    select: { id: true, slug: true, erpId: true, nit: true, crmId: true },
  });
  console.log("\nNewest 5 rows without erpSyncedAt (by id desc):");
  for (const r of noSync) console.log(`  slug=${r.slug} erpId=${r.erpId ?? "null"} nit=${r.nit} crmId=${r.crmId ?? "null"}`);

  // Check CustomerReceivable
  const crGlobal = await prisma.customerReceivable.count();
  const crOrg    = await prisma.customerReceivable.count({ where: { organizationId: orgId } });
  console.log(`\nCustomerReceivable global=${crGlobal}  org=${crOrg}`);

  // Sample receivables if any
  if (crOrg > 0) {
    const sample = await prisma.customerReceivable.findMany({
      where: { organizationId: orgId },
      take: 3,
      select: { erpId: true, customerName: true, originalAmount: true, currency: true, status: true },
    });
    for (const r of sample) console.log(`  erpId=${r.erpId} name=${r.customerName} amt=${r.originalAmount} ${r.currency} ${r.status}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
