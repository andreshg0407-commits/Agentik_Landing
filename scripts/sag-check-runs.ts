import * as path   from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

async function main() {
  const { prisma } = await import("../lib/prisma");

  const orgId = "cmmpwstuf000dp5y58kj1daaj";
  const CONNECTOR_ID = "cmnhu4hky0000n4y50jlhkfib";

  // All recent runs
  const runs = await prisma.connectorRun.findMany({
    where: { connectorId: CONNECTOR_ID },
    orderBy: { startedAt: "desc" },
    take: 10,
    select: { id: true, module: true, status: true, rowsRead: true, rowsImported: true, rowsErrored: true, startedAt: true, finishedAt: true },
  });
  console.log("\n── All recent ConnectorRuns ──");
  for (const r of runs) {
    const ms = r.finishedAt && r.startedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : 0;
    console.log(`  [${r.module?.padEnd(12)}] ${r.status?.padEnd(8)} read=${String(r.rowsRead ?? 0).padStart(6)} imported=${String(r.rowsImported ?? 0).padStart(6)}  ${r.startedAt?.toISOString()}  (${Math.round(ms/1000)}s)`);
  }

  // Current counts
  const total = await prisma.customerProfile.count({ where: { organizationId: orgId } });
  const withErp = await prisma.customerProfile.count({ where: { organizationId: orgId, erpId: { not: null } } });
  const withErpSyncedAt = await prisma.customerProfile.count({ where: { organizationId: orgId, erpSyncedAt: { not: null } } });
  console.log(`\nCustomerProfile total      : ${total}`);
  console.log(`CustomerProfile with erpId : ${withErp}`);
  console.log(`CustomerProfile with erpSyncedAt: ${withErpSyncedAt}`);

  // erpSyncedAt distribution by day
  const dist = await prisma.$queryRaw<{day: string; cnt: bigint}[]>`
    SELECT DATE("erpSyncedAt") as day, COUNT(*) as cnt
    FROM "CustomerProfile"
    WHERE "organizationId" = ${orgId} AND "erpSyncedAt" IS NOT NULL
    GROUP BY DATE("erpSyncedAt")
    ORDER BY day DESC
  `;
  console.log("\nerpSyncedAt distribution:");
  for (const d of dist) console.log(`  ${d.day}  →  ${d.cnt} rows`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
