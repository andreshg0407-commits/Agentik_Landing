/**
 * _run-collections-sync.ts
 *
 * Sync CollectionRecord from SAG v_pagosnew for the Castillitos connector.
 * Runs a full sync (cursor reset) then audits results.
 *
 * Usage:
 *   npx tsx scripts/_run-collections-sync.ts
 *   npx tsx scripts/_run-collections-sync.ts --incremental   # use existing cursor
 *   npx tsx scripts/_run-collections-sync.ts --dry-run       # count only, no writes
 */

import "@/lib/connectors/adapters";
import { syncEngine }  from "@/lib/connectors/core/sync-engine";
import { prisma }      from "@/lib/prisma";

// ── Config ────────────────────────────────────────────────────────────────────

const CONNECTOR_ID = "cmnhu4hky0000n4y50jlhkfib";   // Castillitos SAG PYA SOAP
const ORG_ID       = "cmmpwstuf000dp5y58kj1daaj";    // Castillitos org

// ── Args ──────────────────────────────────────────────────────────────────────

const args       = process.argv.slice(2);
const fullSync   = !args.includes("--incremental");
const dryRun     = args.includes("--dry-run");

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  COBROS REALES — CollectionRecord Sync");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  connector : ${CONNECTOR_ID}`);
  console.log(`  org       : ${ORG_ID}`);
  console.log(`  mode      : ${fullSync ? "FULL SYNC" : "INCREMENTAL"}`);
  console.log(`  dry-run   : ${dryRun}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Run sync
  const runId = await syncEngine.syncModule(CONNECTOR_ID, "collections", {
    fullSync,
    dryRun,
  });

  console.log(`\n[sync] Run ID: ${runId}`);

  // ── Fetch run stats ───────────────────────────────────────────────────────
  const run = await prisma.connectorRun.findUniqueOrThrow({ where: { id: runId } });

  console.log("\n┌─ Run Summary ──────────────────────────────────────");
  console.log(`│  status       : ${run.status}`);
  console.log(`│  rowsRead     : ${run.rowsRead}`);
  console.log(`│  rowsImported : ${run.rowsImported}`);
  console.log(`│  rowsSkipped  : ${run.rowsSkipped}`);
  console.log(`│  rowsErrored  : ${run.rowsErrored}`);
  console.log(`│  cursorAfter  : ${run.cursorAfter ?? "(none)"}`);
  if (run.error) console.log(`│  error        : ${run.error}`);
  console.log("└────────────────────────────────────────────────────\n");

  if (dryRun) {
    console.log("[dry-run] No records written. Exiting.\n");
    return;
  }

  // ── Audit CollectionRecord ─────────────────────────────────────────────────

  const [totalCount, maxDateRow, bySource, top10] = await Promise.all([
    // Total count
    prisma.collectionRecord.count({ where: { organizationId: ORG_ID } }),

    // Max collectionDate
    prisma.collectionRecord.findFirst({
      where:   { organizationId: ORG_ID },
      orderBy: { collectionDate: "desc" },
      select:  { collectionDate: true },
    }),

    // SUM and COUNT by comprobanteCode
    prisma.collectionRecord.groupBy({
      by:      ["comprobanteCode"],
      where:   { organizationId: ORG_ID },
      _sum:    { amount: true },
      _count:  { _all: true },
      orderBy: { _sum: { amount: "desc" } },
    }),

    // Top 10 most recent records
    prisma.collectionRecord.findMany({
      where:   { organizationId: ORG_ID },
      orderBy: { collectionDate: "desc" },
      take:    10,
      select: {
        comprobanteCode: true,
        collectionDate:  true,
        customerNit:     true,
        customerName:    true,
        amount:          true,
        currency:        true,
        documentNumber:  true,
        erpMovId:        true,
      },
    }),
  ]);

  // ── Print audit ───────────────────────────────────────────────────────────

  console.log("┌─ Audit — CollectionRecord ─────────────────────────");
  console.log(`│  total records   : ${totalCount}`);
  console.log(`│  latest date     : ${maxDateRow?.collectionDate?.toISOString() ?? "(none)"}`);
  console.log("└────────────────────────────────────────────────────\n");

  console.log("┌─ By comprobanteCode ────────────────────────────────");
  console.log("│  Code   Count    SUM(amount)");
  console.log("│  ─────  ──────   ──────────────────");
  for (const g of bySource) {
    const code   = g.comprobanteCode.padEnd(6);
    const count  = String(g._count._all).padStart(6);
    const sum    = g._sum.amount != null
      ? Number(g._sum.amount).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
      : "$0";
    console.log(`│  ${code} ${count}   ${sum}`);
  }
  console.log("└────────────────────────────────────────────────────\n");

  console.log("┌─ Top 10 Recent CollectionRecords ──────────────────");
  for (const r of top10) {
    const date = r.collectionDate.toISOString().slice(0, 10);
    const amt  = Number(r.amount).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
    console.log(`│  [${r.comprobanteCode}] ${date}  ${amt.padStart(18)}  ${r.customerName ?? r.customerNit ?? "—"}  doc:${r.documentNumber ?? "-"}`);
  }
  console.log("└────────────────────────────────────────────────────\n");

  console.log("Done.\n");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
