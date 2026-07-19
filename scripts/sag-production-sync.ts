/**
 * scripts/sag-production-sync.ts
 *
 * First production full sync — Castillitos SAG PYA connector.
 *
 * ORDER
 *   1. Reset cursors (customers + receivables) so no stale cursor skips rows.
 *   2. Full sync — customers   (fullSync: true → ignores cursor even after reset).
 *   3. Verify: ConnectorRun counters + sample CustomerProfile rows.
 *   4. Full sync — receivables (fullSync: true).
 *   5. Verify: ConnectorRun counters + sample CustomerReceivable rows.
 *   6. Report data mapping issues found.
 *
 * Usage:
 *   # Preview only (cursor reset + connector state — no sync):
 *   npx tsx scripts/sag-production-sync.ts --preview
 *
 *   # Full run:
 *   npx tsx scripts/sag-production-sync.ts
 *
 * Prerequisites: DATABASE_URL + PYA_SOAP_TOKEN + PYA_SAG_BD set in .env.
 */

import * as path   from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  grey:   "\x1b[90m",
  blue:   "\x1b[34m",
};

const PREVIEW = process.argv.includes("--preview");

function ok(msg: string)   { console.log(`  ${C.green}✓${C.reset} ${msg}`); }
function fail(msg: string) { console.log(`  ${C.red}✗${C.reset} ${msg}`); }
function info(msg: string) { console.log(`  ${C.grey}·${C.reset} ${msg}`); }
function warn(msg: string) { console.log(`  ${C.yellow}⚠${C.reset} ${msg}`); }

function section(title: string) {
  console.log(`\n${C.bold}${C.cyan}── ${title}${C.reset}`);
}

function elapsed(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

const CONNECTOR_ID = "cmnhu4hky0000n4y50jlhkfib";
const ORG_SLUG     = "castillitos";

async function main(): Promise<void> {
  console.log(`\n${C.bold}SAG PYA — First Production Full Sync${C.reset}`);
  console.log(C.grey + new Date().toISOString() + C.reset);
  if (PREVIEW) {
    console.log(C.yellow + "  MODE: PREVIEW (no sync — shows cursor + connector state only)" + C.reset);
  }

  let exitCode = 0;

  // Dynamic imports (after dotenv)
  const { prisma }      = await import("../lib/prisma");
  const { cursorStore } = await import("../lib/connectors/core/cursor-store");

  // ── 1) Connector state ───────────────────────────────────────────────────────

  section("Connector state");

  const connector = await prisma.connector.findUnique({
    where:  { id: CONNECTOR_ID },
    select: { id: true, source: true, status: true, config: true, modules: true, organizationId: true },
  });

  if (!connector) {
    fail(`Connector ${CONNECTOR_ID} not found`);
    process.exit(1);
  }

  const cfg = connector.config as Record<string, unknown>;
  ok(`${connector.source} — status: ${connector.status}`);
  info(`orgId   : ${connector.organizationId}`);
  info(`modules : ${(connector.modules as string[]).join(", ")}`);
  info(`token   : ${cfg["token"] ? "[SET]" : "MISSING"}`);
  info(`database: "${cfg["database"] ?? "(absent — env fallback)"}"`);
  info(`endpoint: ${cfg["endpointUrl"] ?? "(env fallback)"}`);
  info(`customerQuery  : ${cfg["customerQuery"] ?? "(adapter default)"}`);
  info(`receivableQuery: ${cfg["receivableQuery"] ? (cfg["receivableQuery"] as string).slice(0, 60) + "…" : "(adapter default)"}`);

  if (connector.status === "ERROR") {
    warn("Connector is in ERROR state — this run will attempt to reset it to ACTIVE");
  }

  // ── 2) Current cursor state ──────────────────────────────────────────────────

  section("Current cursor state (before reset)");

  const cursors = await prisma.connectorCursor.findMany({
    where:  { connectorId: CONNECTOR_ID },
    select: { module: true, cursor: true, updatedAt: true },
  });

  if (cursors.length === 0) {
    info("No cursors found — connector has not been synced or cursors already cleared");
  } else {
    for (const c of cursors) {
      info(`${c.module.padEnd(12)} cursor: ${c.cursor.slice(0, 40)}… (set ${c.updatedAt.toISOString()})`);
    }
  }

  if (PREVIEW) {
    section("Preview complete — run without --preview to execute sync");
    await prisma.$disconnect();
    process.exit(0);
  }

  // ── 3) Reset cursors ─────────────────────────────────────────────────────────

  section("Cursor reset");

  await cursorStore.clearAll(CONNECTOR_ID);
  ok("All cursors cleared for connector — next sync will be a full pull from SAG");

  // Verify cleared
  const afterClear = await prisma.connectorCursor.count({ where: { connectorId: CONNECTOR_ID } });
  if (afterClear === 0) {
    ok("Cursor table: 0 rows remaining ✓");
  } else {
    warn(`Cursor table: ${afterClear} rows still present — clear may have partially failed`);
  }

  // ── 4) Register adapters + engine ────────────────────────────────────────────

  section("Adapter registration");

  await import("../lib/connectors/adapters");
  const { syncEngine, registerStorageHandler } = await import("../lib/connectors/core/sync-engine");

  // Explicitly force-register the storage handlers to guard against any
  // module-cache ordering quirk that causes the storageHandlers Map to be
  // populated in a different instance than the one syncEngine reads from.
  const { customerProfileStorage, customerReceivableStorage } =
    await import("../lib/connectors/adapters/sag-pya-soap/storage");
  const { crmCustomerStorage } =
    await import("../lib/connectors/adapters/castillitos-crm/storage");

  type AnyHandler = Parameters<typeof registerStorageHandler>[1];
  registerStorageHandler("customers", {
    async upsertMany(records: any[], ctx: any) {
      if (ctx.source === "castillitos_crm") {
        return (crmCustomerStorage as AnyHandler).upsertMany(records, ctx);
      }
      return (customerProfileStorage as AnyHandler).upsertMany(records, ctx);
    },
  } as AnyHandler);
  registerStorageHandler("receivables", customerReceivableStorage as AnyHandler);

  ok("Adapters registered — syncEngine ready (handlers explicitly bound)");

  // ── 5) Full sync — customers ─────────────────────────────────────────────────

  section("Full sync — customers");
  info(`connector : ${CONNECTOR_ID}`);
  info(`module    : customers`);
  info(`query     : ${cfg["customerQuery"] ?? "SELECT * FROM TERCEROS (adapter default)"}`);
  info(`fullSync  : true (cursor ignored)`);
  console.log();

  let customersRunId: string | null = null;
  const t0Customers = Date.now();

  try {
    customersRunId = await syncEngine.syncModule(CONNECTOR_ID, "customers", { fullSync: true });
    const msCustomers = Date.now() - t0Customers;

    const run = await prisma.connectorRun.findUnique({
      where:  { id: customersRunId },
      select: { status: true, rowsRead: true, rowsImported: true, rowsSkipped: true, rowsErrored: true, error: true, cursorAfter: true },
    });

    if (!run) { fail("ConnectorRun not found after sync"); exitCode = 1; }
    else {
      const icon = run.status === "SUCCESS" ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
      console.log(`  ${icon} customers sync ${run.status} in ${elapsed(msCustomers)}`);
      info(`runId        : ${customersRunId}`);
      info(`rowsRead     : ${run.rowsRead}`);
      info(`rowsImported : ${run.rowsImported}`);
      info(`rowsSkipped  : ${run.rowsSkipped}`);
      info(`rowsErrored  : ${run.rowsErrored}`);
      info(`cursorAfter  : ${run.cursorAfter ?? "(none — no updatedAt found)"}`);
      if (run.error) fail(`error: ${run.error}`);

      if (run.status === "FAILED") exitCode = 1;
      if (run.rowsErrored > 0)    warn(`${run.rowsErrored} rows errored — check [CustomerProfileStorage] logs`);
    }
  } catch (e) {
    fail(`customers sync threw: ${(e as Error).message}`);
    exitCode = 1;
  }

  // ── 6) Sample customer records ───────────────────────────────────────────────

  section("Sample imported CustomerProfile rows (top 5)");

  const org = await prisma.organization.findFirst({
    where:  { slug: ORG_SLUG },
    select: { id: true },
  });

  const sampleCustomers = org
    ? await prisma.customerProfile.findMany({
        where:   { organizationId: org.id, erpId: { not: null } },
        orderBy: { erpSyncedAt: "desc" },
        take:    5,
        select: {
          id:        true,
          slug:      true,
          erpId:     true,
          nit:       true,
          name:      true,
          city:      true,
          erpSyncedAt: true,
        },
      })
    : [];

  const totalCustomers = org
    ? await prisma.customerProfile.count({ where: { organizationId: org.id, erpId: { not: null } } })
    : 0;

  info(`Total CustomerProfile rows with erpId: ${totalCustomers}`);
  console.log();

  if (sampleCustomers.length === 0) {
    warn("No CustomerProfile rows found — storage handler may have errored on all records");
  } else {
    const hdr = `${"slug".padEnd(22)}  ${"erpId".padEnd(14)}  ${"nit".padEnd(12)}  ${"name".padEnd(35)}  city`;
    console.log(`  ${C.bold}${hdr}${C.reset}`);
    console.log("  " + "─".repeat(hdr.length));
    for (const c of sampleCustomers) {
      const line =
        (c.slug ?? "").padEnd(22).slice(0, 22) + "  " +
        (c.erpId ?? "").padEnd(14).slice(0, 14) + "  " +
        (c.nit ?? "").padEnd(12).slice(0, 12) + "  " +
        (c.name ?? "").padEnd(35).slice(0, 35) + "  " +
        (c.city ?? "");
      console.log(`  ${C.grey}${line}${C.reset}`);
    }
  }

  // ── 7) Full sync — receivables ───────────────────────────────────────────────

  section("Full sync — receivables");
  info(`module    : receivables`);
  info(`query     : ${cfg["receivableQuery"] ?? "MOVIMIENTOS LEFT JOIN MOVIMIENTOS_ITEMS (adapter default)"}`);
  info(`fullSync  : true`);
  console.log();

  let receivablesRunId: string | null = null;
  const t0Receivables = Date.now();

  try {
    receivablesRunId = await syncEngine.syncModule(CONNECTOR_ID, "receivables", { fullSync: true });
    const msReceivables = Date.now() - t0Receivables;

    const run = await prisma.connectorRun.findUnique({
      where:  { id: receivablesRunId },
      select: { status: true, rowsRead: true, rowsImported: true, rowsSkipped: true, rowsErrored: true, error: true, cursorAfter: true },
    });

    if (!run) { fail("ConnectorRun not found after sync"); exitCode = 1; }
    else {
      const icon = run.status === "SUCCESS" ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
      console.log(`  ${icon} receivables sync ${run.status} in ${elapsed(msReceivables)}`);
      info(`runId        : ${receivablesRunId}`);
      info(`rowsRead     : ${run.rowsRead}`);
      info(`rowsImported : ${run.rowsImported}`);
      info(`rowsSkipped  : ${run.rowsSkipped}`);
      info(`rowsErrored  : ${run.rowsErrored}`);
      info(`cursorAfter  : ${run.cursorAfter ?? "(none — no issue date found)"}`);
      if (run.error) fail(`error: ${run.error}`);

      if (run.status === "FAILED") exitCode = 1;
      if (run.rowsErrored > 0)    warn(`${run.rowsErrored} rows errored — check [CustomerReceivableStorage] logs`);
    }
  } catch (e) {
    fail(`receivables sync threw: ${(e as Error).message}`);
    exitCode = 1;
  }

  // ── 8) Sample receivable records ─────────────────────────────────────────────

  section("Sample imported CustomerReceivable rows (top 5 by balanceDue)");

  const sampleReceivables = org
    ? await prisma.customerReceivable.findMany({
        where:   { organizationId: org.id },
        orderBy: { balanceDue: "desc" },
        take:    5,
        select: {
          erpId:          true,
          invoiceNumber:  true,
          customerName:   true,
          customerNit:    true,
          originalAmount: true,
          balanceDue:     true,
          currency:       true,
          status:         true,
          invoiceDate:    true,
          agingBucket:    true,
        },
      })
    : [];

  const totalReceivables = org
    ? await prisma.customerReceivable.count({ where: { organizationId: org.id } })
    : 0;

  info(`Total CustomerReceivable rows: ${totalReceivables}`);
  console.log();

  if (sampleReceivables.length === 0) {
    warn("No CustomerReceivable rows found");
  } else {
    const hdr = `${"erpId".padEnd(12)}  ${"invoiceNo".padEnd(14)}  ${"customerName".padEnd(30)}  ${"customerNit".padEnd(12)}  ${"original".padStart(14)}  ${"balance".padStart(14)}  curr  status  aging`;
    console.log(`  ${C.bold}${hdr}${C.reset}`);
    console.log("  " + "─".repeat(hdr.length));
    for (const r of sampleReceivables) {
      const line =
        (r.erpId ?? "").padEnd(12).slice(0, 12) + "  " +
        (r.invoiceNumber ?? "").padEnd(14).slice(0, 14) + "  " +
        (r.customerName ?? "").padEnd(30).slice(0, 30) + "  " +
        (r.customerNit ?? "").padEnd(12).slice(0, 12) + "  " +
        String(Math.round(Number(r.originalAmount))).padStart(14) + "  " +
        String(Math.round(Number(r.balanceDue))).padStart(14) + "  " +
        (r.currency ?? "").padEnd(4).slice(0, 4) + "  " +
        (r.status ?? "").padEnd(6).slice(0, 6) + "  " +
        (r.agingBucket ?? "");
      console.log(`  ${C.grey}${line}${C.reset}`);
    }
  }

  // ── 9) Cursor state after sync ────────────────────────────────────────────────

  section("Cursor state after sync");

  const cursorsAfter = await prisma.connectorCursor.findMany({
    where:  { connectorId: CONNECTOR_ID },
    select: { module: true, cursor: true, updatedAt: true },
  });

  for (const c of cursorsAfter) {
    ok(`${c.module.padEnd(12)} cursor advanced to: ${c.cursor.slice(0, 50)}`);
  }

  if (cursorsAfter.length === 0) {
    warn("No cursors written — adapter returned null nextCursor (no updatedAt / issueDate in data?)");
  }

  // ── 10) Data mapping issues ───────────────────────────────────────────────────

  section("Data mapping issues found");

  warn("ISSUE 1 — receivable.customerTaxId is ka_nl_tercero (integer FK), not the real NIT.");
  info("  The receivable mapper sets customerTaxId = String(ka_nl_tercero) (e.g. '186').");
  info("  The customer mapper sets profile.nit = String(n_nit) (e.g. '860123456').");
  info("  refreshProfileReceivables() matches on nit and will never find a CustomerProfile.");
  info("  Impact: totalReceivable / overdueReceivable KPIs on CustomerProfile stay null.");
  info("  Fix (next sprint): add n_nit to the receivables query via:");
  info("    SELECT m.*, t.n_nit FROM MOVIMIENTOS m JOIN TERCEROS t ON t.ka_nl_tercero = m.ka_nl_tercero …");
  info("  Then use t.n_nit as customerTaxId in the mapper.");
  console.log();

  warn("ISSUE 2 — receivable.dueDate falls back to issueDate (MOVIMIENTOS has no due-date column).");
  info("  daysOverdue is always 0. agingBucket is always CURRENT.");
  info("  Impact: aging reports and overdue dashboards show all receivables as current.");
  info("  Fix (next sprint): confirm with Castillitos whether MOVIMIENTOS.d_fecha_vencimiento");
  info("    or a VENCIMIENTOS table exists, then surface a real dueDate.");
  console.log();

  warn("ISSUE 3 — receivable.paidAmount = 0 (no payment source).");
  info("  PAGOS table is empty; RECIBOS/ANTICIPOS/ABONOS do not exist.");
  info("  balanceDue = originalAmount (conservative). Cannot show partial payments.");
  info("  Fix (next sprint): ask PYA/Castillitos which table records cash receipts.");

  // ── Summary ──────────────────────────────────────────────────────────────────

  section("Summary");

  const connector2 = await prisma.connector.findUnique({
    where:  { id: CONNECTOR_ID },
    select: { status: true },
  });

  if (exitCode === 0) {
    console.log(`\n  ${C.green}${C.bold}✓ First production sync complete.${C.reset}`);
  } else {
    console.log(`\n  ${C.red}${C.bold}✗ Sync finished with errors — see above.${C.reset}`);
  }

  console.log(`  ${C.grey}connector status : ${connector2?.status}${C.reset}`);
  console.log(`  ${C.grey}CustomerProfile  : ${totalCustomers} rows with erpId${C.reset}`);
  console.log(`  ${C.grey}CustomerReceivable: ${totalReceivables} rows${C.reset}`);

  console.log(`\n  ${C.cyan}Recommendations before next sync:${C.reset}`);
  console.log(`  ${C.grey}1. Fix receivable customerTaxId: add n_nit to MOVIMIENTOS JOIN (see Issue 1)${C.reset}`);
  console.log(`  ${C.grey}2. Confirm dueDate column or VENCIMIENTOS table with Castillitos (Issue 2)${C.reset}`);
  console.log(`  ${C.grey}3. Investigate PAGOS / payment tables for paidAmount (Issue 3)${C.reset}`);
  console.log(`  ${C.grey}4. Schedule incremental syncs after Issues 1-2 are resolved${C.reset}\n`);

  await prisma.$disconnect();
  process.exit(exitCode);
}

main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
