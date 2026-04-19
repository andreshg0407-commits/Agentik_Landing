/**
 * Run a 1-page full sync and immediately verify erpId is set on matching rows.
 * This tests the complete pipeline without the spy.
 */
import * as path   from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

async function main() {
  const { prisma } = await import("../lib/prisma");
  const orgId = "cmmpwstuf000dp5y58kj1daaj";
  const CONNECTOR_ID = "cmnhu4hky0000n4y50jlhkfib";

  await import("../lib/connectors/adapters");
  const { syncEngine } = await import("../lib/connectors/core/sync-engine");

  const before = await prisma.customerProfile.count({ where: { organizationId: orgId, erpId: { not: null } } });
  console.log(`erpId set before sync: ${before}`);

  const runId = await syncEngine.syncModule(CONNECTOR_ID, "customers", {
    fullSync: true,
    maxPages: 1,
  });

  const run = await prisma.connectorRun.findUniqueOrThrow({
    where: { id: runId },
    select: { rowsRead: true, rowsImported: true, rowsErrored: true },
  });
  console.log(`ConnectorRun: read=${run.rowsRead} imported=${run.rowsImported} errored=${run.rowsErrored}`);

  const after = await prisma.customerProfile.count({ where: { organizationId: orgId, erpId: { not: null } } });
  console.log(`erpId set after sync: ${after}`);

  // Sample 3 rows with erpId set
  const samples = await prisma.customerProfile.findMany({
    where: { organizationId: orgId, erpId: { not: null } },
    take: 3,
    orderBy: { erpSyncedAt: "desc" },
    select: { slug: true, erpId: true, nit: true, erpSyncedAt: true },
  });
  if (samples.length > 0) {
    console.log("\nSample rows with erpId set:");
    for (const s of samples) console.log(`  slug=${s.slug} erpId=${s.erpId} nit=${s.nit} erpSyncedAt=${s.erpSyncedAt?.toISOString()}`);
  }

  if (after > before) {
    console.log(`\n✓ Sync wrote ${after - before} rows with erpId (${after} total)`);
  } else {
    console.log(`\n✗ No new erpId rows after sync (before=${before}, after=${after})`);
  }

  // DON'T reset — leave data in place so we can verify

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
