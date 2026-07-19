/**
 * End-to-end debug runner: SagPyaAdapter → SaleRecord bridge validation.
 *
 * Usage:
 *   npx tsx scripts/run-sag-orders-sync.ts <file.xlsx|file.csv> [options]
 *
 * Options:
 *   --org=<slug>     Organisation slug (default: castillitos)
 *   --seller=<name>  Override auto-detected seller name
 *   --canal=<value>  Default canal (default: tienda)
 *   --full           Force full re-sync (ignore saved cursor)
 *   --dry            Dry-run: parse + normalise but do not write to DB
 *   --reset          Clear the connector cursor before running
 *   --min=<amount>   Skip rows below this COP amount (default: 0)
 *
 * What this validates:
 *   Universal Connector Layer  →  SagPyaAdapter  →  SalesImportBatch + SaleRecord
 *
 * After a successful run the script prints the exact URL to verify the data
 * in the Executive Sales Dashboard.
 */

import * as fs   from "fs";
import * as path from "path";

// ── Load env files BEFORE any app imports that read process.env ──────────────
// Mirrors Next.js precedence: .env.local overrides .env.
// Override: false means existing process.env values (e.g. CI secrets) win.
import { config as loadEnv } from "dotenv";
const root = path.resolve(__dirname, "..");
loadEnv({ path: path.join(root, ".env.local"), override: false });
loadEnv({ path: path.join(root, ".env"),       override: false });

// ── Register adapters BEFORE importing the engine ────────────────────────────
import "@/lib/connectors/adapters";

import { syncEngine }  from "@/lib/connectors/core/sync-engine";
import { cursorStore } from "@/lib/connectors/core/cursor-store";
import { prisma }      from "@/lib/prisma";

// ── Parse CLI args ────────────────────────────────────────────────────────────

const args          = process.argv.slice(2);
const filePath      = args.find(a => !a.startsWith("--"));
const orgSlug       = args.find(a => a.startsWith("--org="))?.slice(6)    ?? "castillitos";
const sellerOverride = args.find(a => a.startsWith("--seller="))?.slice(9);
const defaultCanal  = args.find(a => a.startsWith("--canal="))?.slice(8)  ?? "tienda";
const minAmount     = Number(args.find(a => a.startsWith("--min="))?.slice(6) ?? 0);
const fullSync      = args.includes("--full");
const dryRun        = args.includes("--dry");
const resetCursor   = args.includes("--reset");

if (!filePath) {
  console.error(
    "\nUsage: npx tsx scripts/run-sag-orders-sync.ts <file.xlsx|file.csv>\n" +
    "       [--org=castillitos] [--seller=\"SELLER NAME\"] [--canal=tienda]\n" +
    "       [--min=0] [--full] [--dry] [--reset]\n"
  );
  process.exit(1);
}

// ── Banner ────────────────────────────────────────────────────────────────────

function banner(title: string) {
  const line = "═".repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
}

function row(label: string, value: unknown) {
  const pad = 22;
  console.log(`  ${label.padEnd(pad)}: ${value ?? "(none)"}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const absPath  = path.resolve(filePath!);
  const fileName = path.basename(absPath);

  if (!fs.existsSync(absPath)) {
    console.error(`\n✗ File not found: ${absPath}\n`);
    process.exit(1);
  }

  banner("SAG PYA ORDERS SYNC — DEBUG RUNNER");
  row("File",         fileName);
  row("Org",          orgSlug);
  row("Seller",       sellerOverride ?? "(auto-detect)");
  row("Canal",        defaultCanal);
  row("Min amount",   minAmount > 0 ? `COP ${minAmount.toLocaleString("es-CO")}` : "(none)");
  row("Flags",        [fullSync && "full", dryRun && "dry", resetCursor && "reset"]
                        .filter(Boolean).join(", ") || "none");

  // ── 1. Resolve org ───────────────────────────────────────────────────────────

  const org = await prisma.organization.findFirst({ where: { slug: orgSlug } });
  if (!org) {
    const available = (await prisma.organization.findMany({ select: { slug: true } }))
      .map(o => o.slug).join(", ");
    console.error(`\n✗ Organisation "${orgSlug}" not found.\n  Available: ${available}\n`);
    process.exit(1);
  }
  row("Org ID",       org.id);

  // ── 2. Load file → base64 ────────────────────────────────────────────────────

  const fileBuffer = fs.readFileSync(absPath).toString("base64");
  row("File size",    `${(Buffer.byteLength(fileBuffer, "base64") / 1024).toFixed(1)} KB`);

  // ── 3. Find or create connector ──────────────────────────────────────────────

  const connectorConfig = {
    fileName,
    fileBuffer,
    defaultCanal,
    ...(sellerOverride ? { sellerOverride } : {}),
    ...(minAmount > 0  ? { minOrderAmount: minAmount } : {}),
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
        status:         "ACTIVE",
        modules:        ["orders"],
        config:         connectorConfig,
      },
    });
    row("Connector",     `${connector.id}  (created)`);
  } else {
    connector = await prisma.connector.update({
      where: { id: connector.id },
      data:  { config: connectorConfig, status: "ACTIVE" },
    });
    row("Connector",     `${connector.id}  (updated)`);
  }

  // ── 4. Cursor state ──────────────────────────────────────────────────────────

  if (resetCursor) {
    await cursorStore.clear(connector.id, "orders");
    row("Cursor",        "cleared (full re-sync forced)");
  } else {
    const existing = await cursorStore.get(connector.id, "orders");
    row("Cursor",        existing
      ? `since ${new Date(existing).toLocaleDateString("es-CO", { dateStyle: "medium" })}`
      : "(none — will pull all rows)");
  }

  // ── 5. Execute sync ──────────────────────────────────────────────────────────

  console.log(`\n  Running syncEngine.syncModule("${connector.id}", "orders")…\n`);

  const t0    = Date.now();
  const runId = await syncEngine.syncModule(connector.id, "orders", { fullSync, dryRun });
  const ms    = Date.now() - t0;

  // ── 6. Run summary ───────────────────────────────────────────────────────────

  const run = await prisma.connectorRun.findUnique({ where: { id: runId } });
  if (!run) {
    console.error("  ✗ ConnectorRun record not found — internal error.\n");
    process.exit(1);
  }

  const statusIcon = { SUCCESS: "✓", PARTIAL: "⚠", FAILED: "✗", RUNNING: "…" }[run.status] ?? "?";

  banner(`RUN SUMMARY  ${statusIcon} ${run.status}`);
  row("Run ID",         run.id);
  row("Duration",       `${(ms / 1000).toFixed(2)}s`);
  row("Rows read",      run.rowsRead);
  row("Rows imported",  `${run.rowsImported}${dryRun ? "  (dry-run — not written)" : ""}`);
  row("Rows skipped",   `${run.rowsSkipped}  (dedup / below min amount)`);
  row("Rows errored",   run.rowsErrored);
  row("Cursor before",  run.cursorBefore ?? "(none)");
  row("Cursor after",   run.cursorAfter  ?? "(none)");
  if (run.error) row("Error",  run.error);

  // ── 7. Linked SalesImportBatch ───────────────────────────────────────────────

  if (!dryRun) {
    const batch = await prisma.salesImportBatch.findFirst({
      where:   { organizationId: org.id, scopeType: "ADHOC", scopeKey: runId },
      select:  { id: true, status: true, rowCount: true, importedCount: true, skippedCount: true },
    });

    banner("SALES IMPORT BATCH");
    if (batch) {
      row("Batch ID",     batch.id);
      row("Status",       batch.status);
      row("Row count",    batch.rowCount);
      row("Imported",     batch.importedCount);
      row("Skipped",      batch.skippedCount);
    } else {
      console.log("  (no batch created — run may have produced 0 records or errored)");
    }

    // ── 8. First 5 SaleRecord rows ─────────────────────────────────────────────

    if (batch) {
      const samples = await prisma.saleRecord.findMany({
        where:   { organizationId: org.id, importBatchId: batch.id },
        orderBy: { saleDate: "asc" },
        take:    5,
        select: {
          id:          true,
          saleDate:    true,
          sellerName:  true,
          productLine: true,
          channel:     true,
          amount:      true,
          customerName: true,
        },
      });

      banner(`FIRST ${samples.length} SALE RECORDS`);
      if (samples.length === 0) {
        console.log("  (no records — all deduplicated or run produced 0 rows)");
      } else {
        const colW = { date: 12, seller: 24, line: 20, channel: 14, amount: 16, customer: 24 };
        const hdr =
          "DATE".padEnd(colW.date) +
          "SELLER".padEnd(colW.seller) +
          "LINE".padEnd(colW.line) +
          "CHANNEL".padEnd(colW.channel) +
          "AMOUNT (COP)".padEnd(colW.amount) +
          "CUSTOMER";
        console.log(`  ${hdr}`);
        console.log(`  ${"─".repeat(hdr.length)}`);

        for (const s of samples) {
          const dateStr   = s.saleDate.toISOString().slice(0, 10);
          const amountStr = Number(s.amount).toLocaleString("es-CO");
          console.log(
            `  ${dateStr.padEnd(colW.date)}` +
            `${(s.sellerName).padEnd(colW.seller)}` +
            `${(s.productLine).padEnd(colW.line)}` +
            `${(s.channel).padEnd(colW.channel)}` +
            `${amountStr.padEnd(colW.amount)}` +
            `${s.customerName ?? ""}`
          );
        }
      }
    }
  }

  // ── 9. Outcome + validation URL ───────────────────────────────────────────────

  console.log();
  if (run.status === "SUCCESS" && !dryRun) {
    const period = run.cursorAfter
      ? new Date(run.cursorAfter).toLocaleDateString("es-CO", { dateStyle: "medium" })
      : "all periods";

    console.log(`  ✓ Sync complete. ${run.rowsImported} record(s) imported.`);
    console.log();
    console.log(`  → Validate the data in the Executive Sales Dashboard:`);
    console.log(`    http://localhost:3001/${orgSlug}/sales`);
    console.log();
    console.log(`  → Next incremental run will pull orders after: ${period}`);
    console.log(`    Re-run without --full to test incremental behaviour.`);
    console.log();
  } else if (run.status === "SUCCESS" && dryRun) {
    console.log(`  ✓ Dry-run complete — ${run.rowsImported} record(s) normalised, nothing written.`);
    console.log(`    Re-run without --dry to commit.\n`);
  } else if (run.status === "PARTIAL") {
    console.log(`  ⚠ Sync finished with ${run.rowsErrored} error(s). Review rows above.\n`);
    process.exit(1);
  } else if (run.status === "FAILED") {
    console.log(`  ✗ Sync failed: ${run.error ?? "(unknown error)"}\n`);
    process.exit(1);
  }
}

main()
  .catch(e => { console.error("\nFatal:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
