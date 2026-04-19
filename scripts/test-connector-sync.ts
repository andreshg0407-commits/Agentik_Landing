/**
 * End-to-end connector sync test for Castillitos SAG PYA orders.
 *
 * Usage:
 *   npx tsx scripts/test-connector-sync.ts <file.xlsx> [options]
 *
 * Options:
 *   --org=<slug>    Organisation slug to sync into (default: castillitos)
 *   --seller=<name> Override auto-detected seller name
 *   --canal=<value> Default canal (default: tienda)
 *   --full          Force full re-sync (ignore saved cursor)
 *   --dry           Dry-run: parse + normalise but do not write to DB
 *   --reset         Delete the connector's cursor before running
 *
 * What this script does:
 *   1. Resolves the org by slug
 *   2. Creates or updates a Connector record (sag_pya source)
 *   3. Stores the file as base64 in Connector.config
 *   4. Calls syncEngine.syncModule(connectorId, "orders")
 *   5. Prints the ConnectorRun summary
 *
 * After a successful run, open /[orgSlug]/sales in the dev server
 * to verify the records appear in the Executive Sales Dashboard.
 */

import * as fs   from "fs";
import * as path from "path";

// Register adapters + storage handlers BEFORE importing the engine
import "@/lib/connectors/adapters";

import { syncEngine }  from "@/lib/connectors/core/sync-engine";
import { cursorStore } from "@/lib/connectors/core/cursor-store";
import { prisma }      from "@/lib/prisma";

// ── Parse CLI args ────────────────────────────────────────────────────────────

const args       = process.argv.slice(2);
const filePath   = args.find(a => !a.startsWith("--"));
const orgSlug    = args.find(a => a.startsWith("--org="))?.slice(6)    ?? "castillitos";
const seller     = args.find(a => a.startsWith("--seller="))?.slice(9);
const canal      = args.find(a => a.startsWith("--canal="))?.slice(8)  ?? "tienda";
const fullSync   = args.includes("--full");
const dryRun     = args.includes("--dry");
const resetCursor = args.includes("--reset");

if (!filePath) {
  console.error(
    "Usage: npx tsx scripts/test-connector-sync.ts <file.xlsx|file.csv>\n" +
    "       [--org=castillitos] [--seller=\"JUAN GARCIA\"] [--canal=tienda]\n" +
    "       [--full] [--dry] [--reset]"
  );
  process.exit(1);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const absPath  = path.resolve(filePath!);
  const fileName = path.basename(absPath);

  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  SAG PYA CONNECTOR SYNC`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`  File   : ${fileName}`);
  console.log(`  Org    : ${orgSlug}`);
  console.log(`  Seller : ${seller ?? "(auto-detect)"}`);
  console.log(`  Canal  : ${canal}`);
  console.log(`  Flags  : ${[fullSync && "full", dryRun && "dry", resetCursor && "reset"].filter(Boolean).join(", ") || "none"}`);
  console.log();

  // 1. Resolve org
  const org = await prisma.organization.findFirst({ where: { slug: orgSlug } });
  if (!org) {
    console.error(
      `Organisation "${orgSlug}" not found.\n` +
      `Available orgs: ` +
      (await prisma.organization.findMany({ select: { slug: true } })).map(o => o.slug).join(", ")
    );
    process.exit(1);
  }
  console.log(`  Org ID : ${org.id}`);

  // 2. Load file → base64
  // NOTE: For production use fileUrl pointing to R2/GCS instead.
  const fileBuffer = fs.readFileSync(absPath).toString("base64");

  // 3. Find or create connector
  const connectorConfig = {
    fileName,
    fileBuffer,
    defaultCanal: canal,
    ...(seller ? { sellerOverride: seller } : {}),
  };

  let connector = await prisma.connector.findFirst({
    where: { organizationId: org.id, source: "sag_pya", name: "SAG PYA" },
  });

  if (!connector) {
    connector = await prisma.connector.create({
      data: {
        organizationId: org.id,
        source:         "sag_pya",
        name:           "SAG PYA",
        status:         "INACTIVE",
        modules:        ["orders"],
        config:         connectorConfig,
      },
    });
    console.log(`  Connector: ${connector.id} (created)`);
  } else {
    // Update config so the adapter reads the new file
    connector = await prisma.connector.update({
      where: { id: connector.id },
      data:  { config: connectorConfig },
    });
    console.log(`  Connector: ${connector.id} (updated)`);
  }

  // 4. Optionally reset cursor
  if (resetCursor) {
    await cursorStore.clear(connector.id, "orders");
    console.log(`  Cursor   : cleared`);
  } else {
    const existing = await cursorStore.get(connector.id, "orders");
    console.log(`  Cursor   : ${existing ? `since ${new Date(existing).toLocaleDateString("es-CO")}` : "(none — full sync)"}`);
  }

  console.log();

  // 5. Run sync
  const t0    = Date.now();
  const runId = await syncEngine.syncModule(connector.id, "orders", { fullSync, dryRun });
  const ms    = Date.now() - t0;

  // 6. Print run summary
  const run = await prisma.connectorRun.findUnique({ where: { id: runId } });
  if (!run) {
    console.log("Run record not found — something went wrong internally.");
    return;
  }

  const statusIcon = { SUCCESS: "✓", PARTIAL: "⚠", FAILED: "✗", RUNNING: "…" }[run.status] ?? "?";

  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`  RUN SUMMARY  ${statusIcon} ${run.status}`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`  Run ID       : ${run.id}`);
  console.log(`  Duration     : ${(ms / 1000).toFixed(1)}s`);
  console.log(`  Rows read    : ${run.rowsRead}`);
  console.log(`  Rows imported: ${run.rowsImported}${dryRun ? " (dry-run — not written)" : ""}`);
  console.log(`  Rows skipped : ${run.rowsSkipped}  (dedup / below min amount)`);
  console.log(`  Rows errored : ${run.rowsErrored}`);
  console.log(`  Cursor before: ${run.cursorBefore ?? "(none)"}`);
  console.log(`  Cursor after : ${run.cursorAfter  ?? "(none)"}`);
  if (run.error) {
    console.log(`  Error        : ${run.error}`);
  }
  console.log(`═══════════════════════════════════════════════════════════\n`);

  if (run.status === "SUCCESS" && !dryRun) {
    console.log(
      `✓ Sync complete.\n` +
      `  → Open https://localhost:3000/${orgSlug}/sales to see the dashboard.\n` +
      `  → Next incremental run will only pull orders after ${run.cursorAfter ? new Date(run.cursorAfter).toLocaleDateString("es-CO") : "now"}.\n`
    );
  } else if (run.status === "PARTIAL") {
    console.log(`⚠ Sync finished with errors. Review rows above.\n`);
  } else if (run.status === "FAILED") {
    console.log(`✗ Sync failed. Fix the error above and retry.\n`);
    process.exit(1);
  } else if (dryRun) {
    console.log(
      `  Dry-run complete — no records written.\n` +
      `  Re-run without --dry to commit.\n`
    );
  }
}

main()
  .catch(e => { console.error("Fatal:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
