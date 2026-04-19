/**
 * Debug: find where the 32,673 "imported" rows actually went.
 */
import * as path   from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

async function main() {
  const { prisma } = await import("../lib/prisma");

  const orgId = "cmmpwstuf000dp5y58kj1daaj";

  // Global counts
  const cpGlobal = await prisma.customerProfile.count();
  const crGlobal = await prisma.customerReceivable.count();
  console.log(`\nGlobal CustomerProfile   : ${cpGlobal}`);
  console.log(`Global CustomerReceivable: ${crGlobal}`);

  // Count per org
  const cpByOrg = await prisma.$queryRaw<{organizationId: string; cnt: bigint}[]>`
    SELECT "organizationId", COUNT(*) as cnt
    FROM "CustomerProfile"
    GROUP BY "organizationId"
    ORDER BY cnt DESC
  `;
  console.log("\nCustomerProfile by org:");
  for (const r of cpByOrg) console.log(`  ${r.organizationId}  →  ${r.cnt}`);

  // Rows with erpId set (any org)
  const cpWithErp = await prisma.customerProfile.count({ where: { erpId: { not: null } } });
  console.log(`\nCustomerProfile with erpId set (global): ${cpWithErp}`);

  // Rows with erpSyncedAt set (any org)
  const cpWithSync = await prisma.customerProfile.count({ where: { erpSyncedAt: { not: null } } });
  console.log(`CustomerProfile with erpSyncedAt set (global): ${cpWithSync}`);

  // ConnectorRun records (use startedAt)
  const runs = await prisma.connectorRun.findMany({
    where: { connectorId: "cmnhu4hky0000n4y50jlhkfib" },
    orderBy: { startedAt: "desc" },
    take: 6,
    select: {
      id: true,
      module: true,
      status: true,
      rowsRead: true,
      rowsImported: true,
      rowsErrored: true,
      startedAt: true,
      finishedAt: true,
      error: true,
    },
  });
  console.log("\n── Recent ConnectorRuns ──");
  for (const r of runs) {
    console.log(`  [${r.module?.padEnd(12)}] ${r.status?.padEnd(8)} read=${String(r.rowsRead ?? 0).padStart(6)} imported=${String(r.rowsImported ?? 0).padStart(6)} errored=${r.rowsErrored ?? 0}  started=${r.startedAt?.toISOString() ?? "?"}  ${r.error ?? ""}`);
  }

  // Check ConnectorRun schema: does it have startedAt or createdAt?
  const runCols = await prisma.$queryRaw<{column_name: string}[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ConnectorRun'
    ORDER BY ordinal_position
  `;
  console.log("\n── ConnectorRun columns ──");
  console.log(runCols.map(c => c.column_name).join(", "));

  // Newest CustomerProfile row with erpId set
  const newest = await prisma.customerProfile.findFirst({
    where: { erpId: { not: null } },
    orderBy: { erpSyncedAt: "desc" },
    select: { id: true, organizationId: true, slug: true, erpId: true, nit: true, erpSyncedAt: true },
  });
  console.log("\nNewest CustomerProfile with erpId set:", newest);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
