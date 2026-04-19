/**
 * Trace the exact handler execution path during syncEngine.syncModule.
 * Monkey-patches the customer storage handler to verify it's called.
 */
import * as path   from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

async function main() {
  const { prisma } = await import("../lib/prisma");

  // Load adapters (side-effect registration)
  await import("../lib/connectors/adapters");

  const { syncEngine, registerStorageHandler } = await import("../lib/connectors/core/sync-engine");

  // Monkey-patch: wrap the "customers" handler with a spy
  let spyCalled = false;
  let spyImported = 0;

  const { customerProfileStorage } = await import("../lib/connectors/adapters/sag-pya-soap/storage");
  const orig = customerProfileStorage.upsertMany.bind(customerProfileStorage);

  const spy = {
    async upsertMany(records: any[], ctx: any) {
      spyCalled = true;
      spyImported += records.length;
      console.log(`  [SPY] upsertMany called with ${records.length} records, orgId=${ctx.orgId}`);
      const res = await orig(records, ctx);
      console.log(`  [SPY] upsertMany result: imported=${res.imported} skipped=${res.skipped} errored=${res.errored}`);
      return res;
    },
  };

  // Override the "customers" handler with our spy
  // (The mux calls customerProfileStorage for sag_pya_soap source, so wrap at that level)
  registerStorageHandler("customers" as any, {
    async upsertMany(records: any[], ctx: any) {
      if (ctx.source === "castillitos_crm") {
        // passthrough for CRM
        return { imported: 0, skipped: 0, errored: 0 };
      }
      return spy.upsertMany(records, ctx);
    },
  });

  const orgId = "cmmpwstuf000dp5y58kj1daaj";
  const CONNECTOR_ID = "cmnhu4hky0000n4y50jlhkfib";

  const beforeCount = await prisma.customerProfile.count({
    where: { organizationId: orgId, erpId: { not: null } },
  });
  console.log(`\nCustomerProfile with erpId before sync: ${beforeCount}`);

  console.log("\nRunning syncEngine.syncModule with maxPages=1 ...");
  const runId = await syncEngine.syncModule(CONNECTOR_ID, "customers", {
    fullSync: true,
    maxPages: 1,
  });

  const run = await prisma.connectorRun.findUniqueOrThrow({
    where: { id: runId },
    select: { status: true, rowsRead: true, rowsImported: true, rowsErrored: true },
  });
  console.log("\nConnectorRun result:", run);
  console.log(`Spy called: ${spyCalled}  |  Spy total records: ${spyImported}`);

  const afterCount = await prisma.customerProfile.count({
    where: { organizationId: orgId, erpId: { not: null } },
  });
  console.log(`\nCustomerProfile with erpId after sync: ${afterCount}`);

  if (!spyCalled) {
    console.log("\n✗ HANDLER WAS NOT CALLED — no-op path used (handler not registered in syncEngine's Map)");
  } else if (afterCount > beforeCount) {
    console.log(`\n✓ Handler called and wrote ${afterCount - beforeCount} new erpId values`);
  } else {
    console.log("\n✗ Handler called but no rows were updated");
  }

  // Cleanup: reset all erpId/erpSyncedAt to null for rows we just set
  if (afterCount > beforeCount) {
    await prisma.customerProfile.updateMany({
      where: { organizationId: orgId, erpId: { not: null } },
      data: { erpId: null, erpSyncedAt: null, rawErpJson: { set: {} } },
    });
    console.log(`Cleaned up ${afterCount} rows`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
