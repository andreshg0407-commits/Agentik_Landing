/**
 * Diagnose module identity: do adapters/index.ts and this script share the same
 * storageHandlers Map in sync-engine.ts?
 */
import * as path   from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

async function main() {
  // Load adapters (side-effect registration)
  await import("../lib/connectors/adapters");

  // Load sync-engine via relative path (same as scripts use)
  const syncEngineRel = await import("../lib/connectors/core/sync-engine");

  // Load sync-engine via @/ alias (same as internal code uses)
  // @ts-ignore — dynamic import with alias
  const syncEngineAlias = await import("@/lib/connectors/core/sync-engine");

  console.log("same instance (rel === alias)?", syncEngineRel === syncEngineAlias);
  console.log("syncEngine rel   :", typeof syncEngineRel.syncEngine, syncEngineRel.syncEngine === syncEngineAlias.syncEngine ? "(same)" : "(DIFFERENT)");

  // Check if registerStorageHandler from rel and alias are the same function
  console.log("registerStorageHandler rel === alias?",
    syncEngineRel.registerStorageHandler === syncEngineAlias.registerStorageHandler
  );

  // Register a test handler via relative-path import
  syncEngineRel.registerStorageHandler("invoices" as any, {
    upsertMany: async () => ({ imported: 999, skipped: 0, errored: 0 }),
  });

  // Check if the alias-path module sees it — if not, they're separate instances
  // We can't directly read the Map, but we can register from alias and see if rel gets it
  // Instead: load directly from both and compare
  const { registerStorageHandler: regAlias } = syncEngineAlias;
  const { registerStorageHandler: regRel }   = syncEngineRel;
  console.log("registerStorageHandler functions identical?", regRel === regAlias);

  await (await import("../lib/prisma")).prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
