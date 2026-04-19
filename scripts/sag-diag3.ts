import * as path   from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

async function main() {
  const { prisma } = await import("../lib/prisma");
  const orgId = "cmmpwstuf000dp5y58kj1daaj";

  // Find rows with erpSyncedAt from current sync (23:12 UTC = window)
  const t1 = new Date("2026-04-10T23:00:00Z");
  const t2 = new Date("2026-04-11T00:00:00Z");
  const recentSync = await prisma.customerProfile.count({
    where: { organizationId: orgId, erpSyncedAt: { gte: t1, lte: t2 } },
  });
  console.log(`Rows with erpSyncedAt 2026-04-10 23:xx UTC: ${recentSync}`);

  // Find the most recent ConnectorRun for customers
  const run = await prisma.connectorRun.findFirst({
    where: { connectorId: "cmnhu4hky0000n4y50jlhkfib", module: "customers" },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true, finishedAt: true, rowsRead: true, rowsImported: true, rowsErrored: true, status: true },
  });
  console.log("\nMost recent customers run:", run);

  // Check if there are rows with 9-digit slugs and erpId set (from the fix)
  const nineDigit = await prisma.$queryRaw<{cnt: bigint}[]>`
    SELECT COUNT(*) as cnt FROM "CustomerProfile"
    WHERE "organizationId" = ${orgId}
    AND "erpId" IS NOT NULL
    AND "erpSyncedAt" IS NOT NULL
    AND LENGTH(slug) = 9
    AND slug ~ '^\d{9}$'
  `;
  console.log(`\nRows with 9-digit slug + erpId set: ${nineDigit[0]?.cnt}`);

  const tenDigit = await prisma.$queryRaw<{cnt: bigint}[]>`
    SELECT COUNT(*) as cnt FROM "CustomerProfile"
    WHERE "organizationId" = ${orgId}
    AND "erpId" IS NOT NULL
    AND "erpSyncedAt" IS NOT NULL
    AND LENGTH(slug) = 10
    AND slug ~ '^\d{10}$'
  `;
  console.log(`Rows with 10-digit slug + erpId set: ${tenDigit[0]?.cnt}`);

  // Total slug length distribution for rows with erpId
  const slens = await prisma.$queryRaw<{slen: number; cnt: bigint}[]>`
    SELECT LENGTH(slug) as slen, COUNT(*) as cnt FROM "CustomerProfile"
    WHERE "organizationId" = ${orgId} AND "erpId" IS NOT NULL
    GROUP BY slen ORDER BY slen
  `;
  console.log("\nSlug length distribution for erpId rows:");
  for (const s of slens) console.log(`  len=${s.slen}  →  ${s.cnt} rows`);

  // Sample 3 rows with 9-digit slug + erpId
  const nineDigitSamples = await prisma.customerProfile.findMany({
    where: { organizationId: orgId, erpId: { not: null }, erpSyncedAt: { not: null } },
    orderBy: { erpSyncedAt: "desc" },
    take: 3,
    select: { slug: true, erpId: true, nit: true, erpSyncedAt: true, crmId: true },
  });
  console.log("\nSample erpId rows (most recent erpSyncedAt):");
  for (const r of nineDigitSamples) {
    console.log(`  slug=${r.slug} (len=${r.slug?.length}) erpId=${r.erpId} nit=${r.nit} erpSyncedAt=${r.erpSyncedAt?.toISOString()} crmId=${r.crmId ?? "null"}`);
  }

  // Rows with no erpId AND no crmId (neither ERP nor CRM source)
  const orphans = await prisma.customerProfile.count({
    where: { organizationId: orgId, erpId: null, crmId: null },
  });
  console.log(`\nRows with no erpId AND no crmId (orphan): ${orphans}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
