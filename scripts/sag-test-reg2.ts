/**
 * Simplified: test if customer handler is registered in syncEngine's Map
 * by running a mini sync and directly inspecting write results.
 */
import * as path   from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

async function main() {
  const { prisma } = await import("../lib/prisma");

  const orgId = "cmmpwstuf000dp5y58kj1daaj";
  const CONNECTOR_ID = "cmnhu4hky0000n4y50jlhkfib";

  // 1) Register adapters
  await import("../lib/connectors/adapters");

  // 2) Get syncEngine from same module path used by adapters
  const { syncEngine, registerStorageHandler } = await import("../lib/connectors/core/sync-engine");

  // 3) Replace the "customers" handler with a simple spy that writes a sentinel
  let handlerCalled = false;
  registerStorageHandler("customers" as any, {
    async upsertMany(records: any[], ctx: any) {
      handlerCalled = true;
      console.log(`  HANDLER CALLED: ${records.length} records, source=${ctx.source}`);
      // Write a single sentinel row to prove it ran
      await prisma.customerProfile.upsert({
        where: { organizationId_slug: { organizationId: orgId, slug: "HANDLER-SENTINEL" } },
        create: { organizationId: orgId, slug: "HANDLER-SENTINEL", name: "sentinel", erpId: "SENTINEL" },
        update: { erpId: "SENTINEL" },
      });
      return { imported: records.length, skipped: 0, errored: 0 };
    },
  });

  // 4) Run sync with maxPages=1
  console.log("\nRunning sync with spy handler...");
  const runId = await syncEngine.syncModule(CONNECTOR_ID, "customers", {
    fullSync: true,
    maxPages: 1,
  });

  const run = await prisma.connectorRun.findUniqueOrThrow({
    where: { id: runId },
    select: { status: true, rowsRead: true, rowsImported: true },
  });
  console.log("ConnectorRun:", run);
  console.log("Handler was called:", handlerCalled);

  // Check sentinel
  const sentinel = await prisma.customerProfile.findFirst({
    where: { organizationId: orgId, slug: "HANDLER-SENTINEL" },
    select: { erpId: true },
  });
  console.log("Sentinel row:", sentinel);

  if (sentinel?.erpId === "SENTINEL") {
    console.log("\n✓ Handler IS registered and was called by syncEngine");
  } else if (!handlerCalled) {
    console.log("\n✗ Handler NOT called — no-op path used (handler not registered or wrong module instance)");
  } else {
    console.log("\n✗ Handler called but sentinel not written (DB write issue)");
  }

  // Cleanup
  await prisma.customerProfile.deleteMany({ where: { organizationId: orgId, slug: "HANDLER-SENTINEL" } });
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
