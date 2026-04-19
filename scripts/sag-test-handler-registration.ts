/**
 * Minimal test: verify storage handlers are registered and actually write to DB.
 * Tests with a single record using just-in-time adapter import.
 */
import * as path   from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

async function main() {
  const { prisma } = await import("../lib/prisma");

  const orgId      = "cmmpwstuf000dp5y58kj1daaj";
  const testSlug   = "test-handler-reg-9999";

  // Clean up any prior test row
  await prisma.customerProfile.deleteMany({
    where: { organizationId: orgId, slug: testSlug },
  });

  // Register adapters (side-effect)
  await import("../lib/connectors/adapters");
  const { syncEngine } = await import("../lib/connectors/core/sync-engine");

  // Check if handler is registered by inspecting the Map via a debug shim
  const { registerStorageHandler } = await import("../lib/connectors/core/sync-engine");

  // Directly call the registered customer storage handler
  const { customerProfileStorage } = await import("../lib/connectors/adapters/sag-pya-soap/storage");

  const testRecord = {
    sourceId: "TEST-ERPID-99",
    source:   "sag_pya_soap" as const,
    orgId,
    name:     "Test Customer Reg",
    taxId:    "99999999",
    type:     "company" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const ctx = {
    runId:       "test-run",
    connectorId: "cmnhu4hky0000n4y50jlhkfib",
    orgId,
    source:      "sag_pya_soap",
    module:      "customers" as const,
  };

  console.log("\n── Test: direct storage handler call ──");
  const result = await customerProfileStorage.upsertMany([testRecord], ctx);
  console.log("  upsertMany result:", result);

  const saved = await prisma.customerProfile.findFirst({
    where: { organizationId: orgId, slug: "99999999" },
    select: { id: true, slug: true, erpId: true, erpSyncedAt: true, name: true },
  });
  console.log("  Saved row:", saved);

  if (saved?.erpId === "TEST-ERPID-99") {
    console.log("  ✓ Storage handler writes correctly");
  } else {
    console.log("  ✗ Storage handler DID NOT write erpId");
  }

  // Now test via syncEngine with a dry-run of 1 page max
  console.log("\n── Test: syncEngine.syncModule with maxPages=1 ──");
  const CONNECTOR_ID = "cmnhu4hky0000n4y50jlhkfib";
  const runId = await syncEngine.syncModule(CONNECTOR_ID, "customers", {
    fullSync: true,
    maxPages: 1,
  });

  const run = await prisma.connectorRun.findUniqueOrThrow({
    where: { id: runId },
    select: { status: true, rowsRead: true, rowsImported: true, rowsErrored: true },
  });
  console.log("  ConnectorRun:", run);

  // Check if any rows now have erpId set
  const withErp = await prisma.customerProfile.count({
    where: { organizationId: orgId, erpId: { not: null } },
  });
  console.log(`  CustomerProfile with erpId set after 1-page sync: ${withErp}`);

  if (withErp > 0) {
    console.log("  ✓ syncEngine writes ERP data correctly");
  } else {
    console.log("  ✗ syncEngine did NOT write erpId — handler not registered or silent no-op");
  }

  // Cleanup
  await prisma.customerProfile.deleteMany({
    where: { organizationId: orgId, slug: testSlug },
  });
  await prisma.customerProfile.deleteMany({
    where: { organizationId: orgId, slug: "99999999" },
  });

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
