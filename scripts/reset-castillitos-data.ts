/**
 * reset-castillitos-data.ts
 *
 * Safe, repeatable tenant-level data cleanup for Castillitos (or any org).
 *
 * Four modes:
 *
 *   --documents-and-sales-only  (SELECTIVE — documents + sales)
 *     Removes only test upload artifacts and derived sales data.
 *     Preserves all CRM data, CustomerProfile, ActionTask, and connector state.
 *     Use this when CRM data is already validated and only the CSV/XML upload
 *     test data needs to be cleared before importing real SAG sales.
 *
 *   --finance-history-only  (SELECTIVE — finance history)
 *     Removes stale financial alerts and document/finance processing history
 *     (Alert, Run, Event rows with finance/document type prefixes).
 *     Preserves ALL CRM data, CustomerProfile, connectors, actions, and tenant
 *     structure. Use this after --documents-and-sales-only when the Finance
 *     module still shows residual alerts or activity from old test uploads.
 *
 *   --runs-history-only  (SELECTIVE — orphan runs)
 *     Removes ALL Run rows for the tenant that are not finance/document type
 *     (i.e. orphaned demo/seed runs: marketing.*, inventory.*, catalog.*, etc.).
 *     Safe to use after --finance-history-only has already cleared finance-prefixed
 *     runs. ConnectorRun history (separate table) is always preserved.
 *     Use this when the /runs page still shows stale demo entries after the
 *     finance-history pass.
 *
 *   (no mode flag)  (FULL RESET)
 *     Removes all operational/test data for the tenant.
 *     Preserves tenant structure, connector config, memberships, and users.
 *     Use this for a complete clean slate before a full real-data onboarding.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ──────────────────────────────────────────────────────────────────────────────
 *
 *   SELECTIVE MODE (documents + sales) — dry-run first (ALWAYS):
 *     npx tsx --env-file=.env scripts/reset-castillitos-data.ts \
 *       --dry-run --documents-and-sales-only
 *
 *   SELECTIVE MODE (documents + sales) — real execution:
 *     npx tsx --env-file=.env scripts/reset-castillitos-data.ts \
 *       --execute --documents-and-sales-only
 *
 *   SELECTIVE MODE (finance history) — dry-run first:
 *     npx tsx --env-file=.env scripts/reset-castillitos-data.ts \
 *       --dry-run --finance-history-only
 *
 *   SELECTIVE MODE (finance history) — real execution:
 *     npx tsx --env-file=.env scripts/reset-castillitos-data.ts \
 *       --execute --finance-history-only
 *
 *   SELECTIVE MODE (orphan runs) — dry-run first:
 *     npx tsx --env-file=.env scripts/reset-castillitos-data.ts \
 *       --dry-run --runs-history-only
 *
 *   SELECTIVE MODE (orphan runs) — real execution:
 *     npx tsx --env-file=.env scripts/reset-castillitos-data.ts \
 *       --execute --runs-history-only
 *
 *   FULL RESET — dry-run first:
 *     npx tsx --env-file=.env scripts/reset-castillitos-data.ts --dry-run
 *
 *   FULL RESET — real execution:
 *     npx tsx --env-file=.env scripts/reset-castillitos-data.ts --execute
 *
 *   Target a different org (both modes):
 *     ... --org=my-other-org [--org-confirmed]
 *
 *   FULL RESET additional flags:
 *     --preserve-documents       Do not delete Documents or FileObjects
 *     --reset-cursors            Delete ConnectorCursors (restart sync from zero)
 *     --clear-connector-runs     Delete ConnectorRun history
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * SELECTIVE MODE (documents + sales) — exact delete set
 * ──────────────────────────────────────────────────────────────────────────────
 *   DELETE (in FK-safe order):
 *    1. SaleRecord           — rows from test CSV/XML imports
 *    2. SalesImportBatch     — the batch containers for those imports
 *    3. BusinessAlert        — derived by alert engine from SaleRecord data
 *    4. MetricSnapshot       — derived from sales aggregations
 *    5. OrderSnapshot        — connector-imported order snapshots
 *    6. ProductSnapshot      — connector-imported product snapshots
 *    7. Document             — uploaded PDFs, XMLs, CSVs
 *    8. FileObject           — backing storage objects for those uploads
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * SELECTIVE MODE (finance history) — exact delete set
 * ──────────────────────────────────────────────────────────────────────────────
 *   DELETE (no FK ordering needed — all independent):
 *    1. Alert  where type starts with: finance. accounting. tax. invoice.
 *                                      payment. bank. document.
 *    2. Run    where type starts with: document. integration.pya.
 *                                      accounting. finance. bank.
 *    3. Event  where type starts with: document. integration.pya.
 *                                      accounting. finance. bank.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * SELECTIVE MODE (orphan runs) — exact delete set
 * ──────────────────────────────────────────────────────────────────────────────
 *   DELETE:
 *    1. Run — ALL remaining Run rows for the org (demo/seed orphans such as
 *             marketing.*, inventory.*, catalog.*, etc. that were NOT cleared
 *             by --finance-history-only because their type prefix does not
 *             match finance/document prefixes).
 *   PRESERVE:
 *    ✓ ConnectorRun — real connector execution history (separate table, untouched)
 *    ✓ All CRM data, CustomerProfile, connectors, actions, tenant structure
 *
 *   PRESERVE (everything else):
 *    ✓ Organization + settings
 *    ✓ Membership / Users
 *    ✓ CustomerProfile
 *    ✓ CustomerReceivable
 *    ✓ CRMOpportunity
 *    ✓ CRMActivity
 *    ✓ CRMQuote
 *    ✓ ActionTask
 *    ✓ Notification
 *    ✓ ScheduledReport
 *    ✓ SagWriteOperation
 *    ✓ Connector config + ConnectorMapping
 *    ✓ ConnectorRun history
 *    ✓ ConnectorCursor (incremental sync positions)
 *    ✓ PipelineStage
 *    ✓ Integration (legacy PYA)
 *    ✓ Workspace / WorkspaceMembership
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * FULL RESET — delete order (FK-safe)
 * ──────────────────────────────────────────────────────────────────────────────
 *    1. ScheduledReport      (FK → ActionTask SetNull, Organization Cascade)
 *    2. Notification         (FK → ActionTask SetNull, Organization Cascade)
 *    3. ActionTask           (FK → Organization Cascade)
 *    4. SagWriteOperation    (FK → Organization Cascade)
 *    5. CRMQuote             (FK → CRMOpportunity SetNull, CustomerProfile SetNull)
 *    6. CRMActivity          (FK → CRMOpportunity SetNull, CustomerProfile SetNull)
 *    7. CRMOpportunity       (FK → CustomerProfile SetNull, Organization Cascade)
 *    8. CustomerReceivable   (FK → CustomerProfile SetNull, Organization Cascade)
 *    9. CustomerProfile      (FK → Organization Cascade)
 *   10. BusinessAlert        (FK → Organization Cascade)
 *   11. SaleRecord           (FK → SalesImportBatch no-action → must go first)
 *   12. SalesImportBatch     (FK → Organization Cascade)
 *   13. OrderSnapshot        (FK → Organization Cascade)
 *   14. ProductSnapshot      (FK → Organization Cascade)
 *   15. MetricSnapshot       (FK → Organization Cascade)
 *   16. SyncJob              (FK → Organization Cascade)
 *   [optional]
 *   17. ConnectorRun         — if --clear-connector-runs
 *   18. ConnectorCursor      — if --reset-cursors
 *   19. Document             — unless --preserve-documents
 *   20. FileObject           — unless --preserve-documents
 */

import { prisma } from "@/lib/prisma";

// ── CLI flags ─────────────────────────────────────────────────────────────────

const args            = process.argv.slice(2);
const ORG_SLUG        = args.find(a => a.startsWith("--org="))?.slice(6) ?? "castillitos";
const DRY_RUN         = args.includes("--dry-run");
const EXECUTE         = args.includes("--execute");
const SELECTIVE       = args.includes("--documents-and-sales-only");
const FINANCE_HISTORY = args.includes("--finance-history-only");
const RUNS_HISTORY    = args.includes("--runs-history-only");
const PRESERVE_DOCS   = args.includes("--preserve-documents");   // full-reset only
const RESET_CURSORS   = args.includes("--reset-cursors");        // full-reset only
const CLEAR_CONN_RUNS = args.includes("--clear-connector-runs"); // full-reset only

// ── Colour helpers ─────────────────────────────────────────────────────────────

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

function header(msg: string) {
  console.log(`\n${C.bold}${C.cyan}${msg}${C.reset}`);
  console.log("─".repeat(70));
}

function row(label: string, current: number, toDelete: number, preserved: number) {
  const delStr  = toDelete > 0 ? `${C.red}−${toDelete}${C.reset}` : `${C.grey}0${C.reset}`;
  const presStr = preserved > 0 ? `${C.green}✓ ${preserved}${C.reset}` : `${C.grey}—${C.reset}`;
  const pad     = (s: string, n: number) => s.padEnd(n);
  console.log(
    `  ${pad(label, 26)} ` +
    `current: ${pad(String(current), 7)} ` +
    `delete: ${delStr.padEnd(20)} ` +
    `preserved: ${presStr}`,
  );
}

function warn(msg: string) { console.log(`  ${C.yellow}⚠${C.reset}  ${msg}`); }
function ok(msg: string)   { console.log(`  ${C.green}✓${C.reset}  ${msg}`); }
function info(msg: string) { console.log(`  ${C.grey}·${C.reset}  ${msg}`); }
function step(msg: string) { console.log(`  ${C.blue}→${C.reset}  ${msg}`); }
function fail(msg: string) { console.log(`  ${C.red}✗${C.reset}  ${msg}`); }
function keep(msg: string) { console.log(`  ${C.green}✓${C.reset}  ${C.grey}PRESERVE${C.reset}  ${msg}`); }

// ── Safe count helper ─────────────────────────────────────────────────────────

type AnyTable = { count: (args: unknown) => Promise<number> };

function m(name: string): AnyTable {
  return (prisma as unknown as Record<string, AnyTable>)[name];
}

async function cnt(table: string, where: Record<string, unknown>): Promise<number> {
  try {
    return await m(table).count({ where });
  } catch {
    return -1;
  }
}

// ── Delete helper (dry-run safe) ──────────────────────────────────────────────

type AnyDeleteable = { deleteMany: (args: unknown) => Promise<{ count: number }> };

async function del(table: string, where: Record<string, unknown>): Promise<number> {
  try {
    const result = await (prisma as unknown as Record<string, AnyDeleteable>)[table]
      .deleteMany({ where });
    return result.count;
  } catch (e) {
    warn(`deleteMany on ${table} failed: ${(e as Error).message}`);
    return 0;
  }
}

// ── Execution helper (logs + accumulates total) ───────────────────────────────

let totalDeleted = 0;

async function doDelete(label: string, table: string, where: Record<string, unknown>) {
  step(`Eliminando ${label}…`);
  const n = await del(table, where);
  if (n > 0) ok(`  ${n} filas eliminadas de ${table}`);
  else       info(`  ${table}: sin filas (noop)`);
  totalDeleted += n;
}

// ══════════════════════════════════════════════════════════════════════════════
// SELECTIVE CLEANUP
// ══════════════════════════════════════════════════════════════════════════════

async function runSelectiveDryRun(OID: string, ORG_SLUG: string) {
  header("FASE 1 — Conteo selectivo: documentos + ventas únicamente");

  const [
    cntSaleRecord, cntSalesImportBatch, cntBusinessAlert,
    cntMetricSnapshot, cntOrderSnapshot, cntProductSnapshot,
    cntDocument, cntFileObject,
  ] = await Promise.all([
    cnt("saleRecord",        { organizationId: OID }),
    cnt("salesImportBatch",  { organizationId: OID }),
    cnt("businessAlert",     { organizationId: OID }),
    cnt("metricSnapshot",    { organizationId: OID }),
    cnt("orderSnapshot",     { organizationId: OID }),
    cnt("productSnapshot",   { organizationId: OID }),
    cnt("document",          { organizationId: OID }),
    cnt("fileObject",        { organizationId: OID }),
  ]);

  const [
    cntCustomerProfile, cntCrmOpportunity, cntCrmActivity,
    cntCrmQuote, cntActionTask, cntConnector, cntConnectorRun,
    cntConnectorCursor, cntCustomerReceivable,
  ] = await Promise.all([
    cnt("customerProfile",    { organizationId: OID }),
    cnt("cRMOpportunity",     { organizationId: OID }),
    cnt("cRMActivity",        { organizationId: OID }),
    cnt("cRMQuote",           { organizationId: OID }),
    cnt("actionTask",         { organizationId: OID }),
    cnt("connector",          { organizationId: OID }),
    cnt("connectorRun",       { organizationId: OID }),
    cnt("connectorCursor",    { organizationId: OID }),
    cnt("customerReceivable", { organizationId: OID }),
  ]);

  const totalToDelete = [
    cntSaleRecord, cntSalesImportBatch, cntBusinessAlert,
    cntMetricSnapshot, cntOrderSnapshot, cntProductSnapshot,
    cntDocument, cntFileObject,
  ].filter(n => n > 0).reduce((a, b) => a + b, 0);

  // ── DELETE section ──────────────────────────────────────────────────────────

  console.log();
  console.log(
    `  ${"Tabla".padEnd(26)} ${"Actual".padEnd(15)} ${"A eliminar".padEnd(22)} Preservado`,
  );
  console.log("  " + "─".repeat(66));
  console.log(`  ${C.yellow}── SE ELIMINA ──────────────────────────────────────────────────${C.reset}`);

  row("SaleRecord",        cntSaleRecord,        cntSaleRecord,        0);
  row("SalesImportBatch",  cntSalesImportBatch,  cntSalesImportBatch,  0);
  row("BusinessAlert",     cntBusinessAlert,     cntBusinessAlert,     0);
  row("MetricSnapshot",    cntMetricSnapshot,    cntMetricSnapshot,    0);
  row("OrderSnapshot",     cntOrderSnapshot,     cntOrderSnapshot,     0);
  row("ProductSnapshot",   cntProductSnapshot,   cntProductSnapshot,   0);
  row("Document",          cntDocument,          cntDocument,          0);
  row("FileObject",        cntFileObject,        cntFileObject,        0);

  // ── PRESERVE section ────────────────────────────────────────────────────────

  console.log();
  console.log(`  ${C.green}── SE PRESERVA ─────────────────────────────────────────────────${C.reset}`);

  row("CustomerProfile",    cntCustomerProfile,    0, cntCustomerProfile);
  row("CustomerReceivable", cntCustomerReceivable, 0, cntCustomerReceivable);
  row("CRMOpportunity",     cntCrmOpportunity,     0, cntCrmOpportunity);
  row("CRMActivity",        cntCrmActivity,        0, cntCrmActivity);
  row("CRMQuote",           cntCrmQuote,           0, cntCrmQuote);
  row("ActionTask",         cntActionTask,         0, cntActionTask);
  row("Connector",          cntConnector,          0, cntConnector);
  row("ConnectorRun",       cntConnectorRun,       0, cntConnectorRun);
  row("ConnectorCursor",    cntConnectorCursor,    0, cntConnectorCursor);

  console.log();
  info(`Total de filas a eliminar: ${C.bold}${C.red}${totalToDelete}${C.reset}`);

  console.log(`\n${C.yellow}${C.bold}DRY-RUN completado — sin cambios en base de datos.${C.reset}`);
  console.log("\nPara ejecutar el cleanup selectivo real:\n");
  console.log(
    `  ${C.bold}npx tsx --env-file=.env scripts/reset-castillitos-data.ts \\${C.reset}\n` +
    `  ${C.bold}  --execute --documents-and-sales-only --org=${ORG_SLUG}${C.reset}\n`,
  );
}

async function runSelectiveExecute(OID: string, ORG_SLUG: string) {
  header("FASE 2 — Cleanup selectivo: documentos + ventas");
  console.log();

  // FK-safe order:
  // SaleRecord must precede SalesImportBatch (no onDelete cascade on that FK).
  // Document precedes FileObject (Document.fileObjectId → FileObject with SetNull,
  // so Document can be deleted cleanly first).

  await doDelete("SaleRecord",       "saleRecord",       { organizationId: OID });
  await doDelete("SalesImportBatch", "salesImportBatch", { organizationId: OID });
  await doDelete("BusinessAlert",    "businessAlert",    { organizationId: OID });
  await doDelete("MetricSnapshot",   "metricSnapshot",   { organizationId: OID });
  await doDelete("OrderSnapshot",    "orderSnapshot",    { organizationId: OID });
  await doDelete("ProductSnapshot",  "productSnapshot",  { organizationId: OID });
  await doDelete("Document",         "document",         { organizationId: OID });
  await doDelete("FileObject",       "fileObject",       { organizationId: OID });

  // ── Verification ───────────────────────────────────────────────────────────

  header("FASE 3 — Verificación post-cleanup selectivo");
  console.log();

  const [
    postSaleRecords, postBatches, postDocuments, postFileObjects,
    postCustomers, postOpps, postQuotes, postActionTasks,
  ] = await Promise.all([
    cnt("saleRecord",       { organizationId: OID }),
    cnt("salesImportBatch", { organizationId: OID }),
    cnt("document",         { organizationId: OID }),
    cnt("fileObject",       { organizationId: OID }),
    cnt("customerProfile",  { organizationId: OID }),
    cnt("cRMOpportunity",   { organizationId: OID }),
    cnt("cRMQuote",         { organizationId: OID }),
    cnt("actionTask",       { organizationId: OID }),
  ]);

  // Cleaned tables — expect zero
  const cleaned: [string, number][] = [
    ["SaleRecord",       postSaleRecords],
    ["SalesImportBatch", postBatches],
    ["Document",         postDocuments],
    ["FileObject",       postFileObjects],
  ];
  let verifyPassed = true;
  for (const [label, count] of cleaned) {
    if (count === 0) ok(`${label}: 0 — limpio`);
    else { fail(`${label}: ${count} filas residuales — revisar manualmente`); verifyPassed = false; }
  }

  console.log();

  // Preserved tables — expect non-zero (warn only, not a failure)
  if (postCustomers > 0)    keep(`CustomerProfile: ${postCustomers} filas intactas`);
  else                      warn("CustomerProfile: 0 — sin perfiles (no esperado si había datos CRM)");
  if (postOpps > 0)         keep(`CRMOpportunity: ${postOpps} oportunidades intactas`);
  else                      info("CRMOpportunity: 0 (sin datos CRM cargados aún)");
  if (postQuotes > 0)       keep(`CRMQuote: ${postQuotes} cotizaciones intactas`);
  else                      info("CRMQuote: 0 (sin cotizaciones CRM)");
  if (postActionTasks >= 0) keep(`ActionTask: ${postActionTasks} tareas intactas`);

  // ── Summary ────────────────────────────────────────────────────────────────

  header("RESUMEN — Cleanup selectivo");
  console.log();
  ok(`${totalDeleted} filas eliminadas en total (documentos + ventas)`);
  if (verifyPassed) ok("Verificación: PASÓ");
  else              warn("Verificación: hay filas residuales — revisar manualmente.");

  console.log(`
${C.bold}Próximos pasos recomendados:${C.reset}

  ${C.bold}1. Re-importar ventas SAG reales (CSV desde panel):${C.reset}
     /${ORG_SLUG}/sales  →  Importar datos SAG

  ${C.bold}2. Recalcular Customer 360 scoring:${C.reset}
     POST /api/orgs/${ORG_SLUG}/customer-360/score

  ${C.bold}3. Validar coherencia ERP ↔ CRM:${C.reset}
     npx tsx --env-file=.env scripts/validate-castillitos.ts --verbose
`);
}

// ══════════════════════════════════════════════════════════════════════════════
// FINANCE HISTORY CLEANUP
// ══════════════════════════════════════════════════════════════════════════════

// Type prefixes that identify finance / document processing records.
// Mirrors exactly what lib/finance/queries.ts uses when reading the Finance page.
const FINANCE_ALERT_PREFIXES = [
  "finance.", "accounting.", "tax.", "invoice.", "payment.", "bank.", "document.",
];
const FINANCE_RUN_EVENT_PREFIXES = [
  "document.", "integration.pya.", "accounting.", "finance.", "bank.",
];

function alertWhere(OID: string) {
  return {
    organizationId: OID,
    OR: FINANCE_ALERT_PREFIXES.map(p => ({ type: { startsWith: p } })),
  };
}

function runWhere(OID: string) {
  return {
    organizationId: OID,
    OR: FINANCE_RUN_EVENT_PREFIXES.map(p => ({ type: { startsWith: p } })),
  };
}

function eventWhere(OID: string) {
  return {
    organizationId: OID,
    OR: FINANCE_RUN_EVENT_PREFIXES.map(p => ({ type: { startsWith: p } })),
  };
}

async function runFinanceHistoryDryRun(OID: string, ORG_SLUG: string) {
  header("FASE 1 — Conteo selectivo: historial finance únicamente");

  const [cntAlert, cntRun, cntEvent] = await Promise.all([
    cnt("alert", alertWhere(OID)),
    cnt("run",   runWhere(OID)),
    cnt("event", eventWhere(OID)),
  ]);

  const [
    cntCustomerProfile, cntCrmOpportunity, cntCrmActivity,
    cntCrmQuote, cntActionTask, cntConnector, cntConnectorRun,
    cntConnectorCursor, cntCustomerReceivable,
  ] = await Promise.all([
    cnt("customerProfile",    { organizationId: OID }),
    cnt("cRMOpportunity",     { organizationId: OID }),
    cnt("cRMActivity",        { organizationId: OID }),
    cnt("cRMQuote",           { organizationId: OID }),
    cnt("actionTask",         { organizationId: OID }),
    cnt("connector",          { organizationId: OID }),
    cnt("connectorRun",       { organizationId: OID }),
    cnt("connectorCursor",    { organizationId: OID }),
    cnt("customerReceivable", { organizationId: OID }),
  ]);

  const totalToDelete = [cntAlert, cntRun, cntEvent]
    .filter(n => n > 0)
    .reduce((a, b) => a + b, 0);

  console.log();
  console.log(
    `  ${"Tabla".padEnd(26)} ${"Actual".padEnd(15)} ${"A eliminar".padEnd(22)} Preservado`,
  );
  console.log("  " + "─".repeat(66));
  console.log(`  ${C.yellow}── SE ELIMINA ──────────────────────────────────────────────────${C.reset}`);

  row("Alert (finance/doc tipos)", cntAlert, cntAlert, 0);
  row("Run (finance/doc tipos)",   cntRun,   cntRun,   0);
  row("Event (finance/doc tipos)", cntEvent, cntEvent, 0);

  console.log();
  console.log(`  ${C.green}── SE PRESERVA ─────────────────────────────────────────────────${C.reset}`);

  row("CustomerProfile",    cntCustomerProfile,    0, cntCustomerProfile);
  row("CustomerReceivable", cntCustomerReceivable, 0, cntCustomerReceivable);
  row("CRMOpportunity",     cntCrmOpportunity,     0, cntCrmOpportunity);
  row("CRMActivity",        cntCrmActivity,        0, cntCrmActivity);
  row("CRMQuote",           cntCrmQuote,           0, cntCrmQuote);
  row("ActionTask",         cntActionTask,         0, cntActionTask);
  row("Connector",          cntConnector,          0, cntConnector);
  row("ConnectorRun",       cntConnectorRun,       0, cntConnectorRun);
  row("ConnectorCursor",    cntConnectorCursor,    0, cntConnectorCursor);

  console.log();
  info(`Total de filas a eliminar: ${C.bold}${C.red}${totalToDelete}${C.reset}`);
  console.log(`\n  ${C.grey}Nota: Alert/Run/Event filtrados por type prefix — sólo registros de tipo${C.reset}`);
  console.log(`  ${C.grey}finance/document son eliminados. Otros tipos (marketing, etc.) se preservan.${C.reset}`);

  console.log(`\n${C.yellow}${C.bold}DRY-RUN completado — sin cambios en base de datos.${C.reset}`);
  console.log("\nPara ejecutar el cleanup de historial finance real:\n");
  console.log(
    `  ${C.bold}npx tsx --env-file=.env scripts/reset-castillitos-data.ts \\${C.reset}\n` +
    `  ${C.bold}  --execute --finance-history-only --org=${ORG_SLUG}${C.reset}\n`,
  );
}

async function runFinanceHistoryExecute(OID: string, ORG_SLUG: string) {
  header("FASE 2 — Cleanup historial finance");
  console.log();

  await doDelete("Alert (finance/doc tipos)", "alert", alertWhere(OID));
  await doDelete("Run (finance/doc tipos)",   "run",   runWhere(OID));
  await doDelete("Event (finance/doc tipos)", "event", eventWhere(OID));

  // ── Verification ───────────────────────────────────────────────────────────

  header("FASE 3 — Verificación post-cleanup finance history");
  console.log();

  const [postAlert, postRun, postEvent, postCustomers, postQuotes] = await Promise.all([
    cnt("alert", alertWhere(OID)),
    cnt("run",   runWhere(OID)),
    cnt("event", eventWhere(OID)),
    cnt("customerProfile", { organizationId: OID }),
    cnt("cRMQuote",        { organizationId: OID }),
  ]);

  let verifyPassed = true;
  for (const [label, count] of [
    ["Alert (finance/doc)", postAlert],
    ["Run (finance/doc)",   postRun],
    ["Event (finance/doc)", postEvent],
  ] as [string, number][]) {
    if (count === 0) ok(`${label}: 0 — limpio`);
    else { fail(`${label}: ${count} filas residuales — revisar manualmente`); verifyPassed = false; }
  }

  console.log();
  if (postCustomers > 0) keep(`CustomerProfile: ${postCustomers} filas intactas`);
  else                   warn("CustomerProfile: 0 — no esperado si hay datos CRM");
  if (postQuotes > 0)    keep(`CRMQuote: ${postQuotes} cotizaciones intactas`);
  else                   info("CRMQuote: 0 (sin cotizaciones CRM)");

  header("RESUMEN — Cleanup finance history");
  console.log();
  ok(`${totalDeleted} filas eliminadas en total (alertas + runs + eventos finance)`);
  if (verifyPassed) ok("Verificación: PASÓ");
  else              warn("Verificación: hay filas residuales — revisar manualmente.");

  console.log(`
${C.bold}El módulo Finance debería mostrarse limpio ahora.${C.reset}
Verifica en: /${ORG_SLUG}/finance
`);
}

// ══════════════════════════════════════════════════════════════════════════════
// ORPHAN RUNS CLEANUP
// ══════════════════════════════════════════════════════════════════════════════

// Residual Event type prefixes NOT covered by --finance-history-only.
// These are demo/seed event types (e.g. inventory.*, catalog.*, marketing.*).
// Finance prefixes (finance., document., accounting., bank., integration.pya., tax.,
// invoice., payment.) were already cleaned by --finance-history-only.
const RESIDUAL_EVENT_PREFIXES = [
  "inventory.", "catalog.", "marketing.", "order.", "product.", "sync.",
  "workspace.", "project.", "demo.", "test.", "seed.",
];

function residualEventWhere(OID: string) {
  return {
    organizationId: OID,
    OR: RESIDUAL_EVENT_PREFIXES.map(p => ({ type: { startsWith: p } })),
  };
}

async function runRunsHistoryDryRun(OID: string, ORG_SLUG: string) {
  header("FASE 1 — Conteo selectivo: runs + events huérfanos");

  // Count ALL remaining runs (finance-prefixed were already cleaned separately)
  const cntRuns = await prisma.run.count({ where: { organizationId: OID } });

  // Break down by type so we can confirm what will be deleted
  const runRows = await prisma.run.findMany({
    where: { organizationId: OID },
    select: {
      type: true,
      status: true,
      project: { select: { name: true, workspace: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const byType: Record<string, number> = {};
  const byWorkspace: Record<string, number> = {};
  for (const r of runRows) {
    byType[r.type] = (byType[r.type] ?? 0) + 1;
    const ws = r.project?.workspace?.name ?? "(sin proyecto/workspace)";
    byWorkspace[ws] = (byWorkspace[ws] ?? 0) + 1;
  }

  // Residual Event rows (those not matched by --finance-history-only prefixes)
  const cntResidualEvents = await prisma.event.count({ where: residualEventWhere(OID) });
  const eventRows = await prisma.event.findMany({
    where: residualEventWhere(OID),
    select: { type: true },
    take: 200,
  });
  const byEventType: Record<string, number> = {};
  for (const e of eventRows) {
    byEventType[e.type] = (byEventType[e.type] ?? 0) + 1;
  }

  const [cntConnectorRun, cntCustomerProfile, cntCrmQuote, cntConnector] = await Promise.all([
    prisma.connectorRun.count({ where: { connector: { organizationId: OID } } }),
    prisma.customerProfile.count({ where: { organizationId: OID } }),
    prisma.cRMQuote.count({ where: { organizationId: OID } }),
    prisma.connector.count({ where: { organizationId: OID } }),
  ]);

  const totalToDelete = cntRuns + cntResidualEvents;

  console.log();
  console.log(
    `  ${"Tabla".padEnd(26)} ${"Actual".padEnd(15)} ${"A eliminar".padEnd(22)} Preservado`,
  );
  console.log("  " + "─".repeat(66));
  console.log(`  ${C.yellow}── SE ELIMINA ──────────────────────────────────────────────────${C.reset}`);

  row("Run (todos los tipos)",           cntRuns,           cntRuns,           0);
  row("Event (prefijos no-finance)",     cntResidualEvents, cntResidualEvents, 0);

  console.log();
  if (Object.keys(byType).length > 0) {
    info("Runs — desglose por type:");
    for (const [t, c] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      info(`  ${String(c).padStart(4)}  ${t}`);
    }
    console.log();
    info("Runs — desglose por workspace:");
    for (const [w, c] of Object.entries(byWorkspace).sort((a, b) => b[1] - a[1])) {
      info(`  ${String(c).padStart(4)}  ${w}`);
    }
    console.log();
  }
  if (Object.keys(byEventType).length > 0) {
    info("Events — desglose por type:");
    for (const [t, c] of Object.entries(byEventType).sort((a, b) => b[1] - a[1])) {
      info(`  ${String(c).padStart(4)}  ${t}`);
    }
    console.log();
  }

  console.log(`  ${C.green}── SE PRESERVA ─────────────────────────────────────────────────${C.reset}`);
  row("ConnectorRun",     cntConnectorRun,     0, cntConnectorRun);
  row("CustomerProfile",  cntCustomerProfile,  0, cntCustomerProfile);
  row("CRMQuote",         cntCrmQuote,         0, cntCrmQuote);
  row("Connector",        cntConnector,        0, cntConnector);

  console.log();
  info(`Total de filas a eliminar: ${C.bold}${C.red}${totalToDelete}${C.reset}`);
  console.log(`\n  ${C.grey}Nota: ConnectorRun (historial real de sync) es tabla separada — NO se toca.${C.reset}`);
  console.log(`  ${C.grey}Events con prefijos finance/document ya fueron limpiados por --finance-history-only.${C.reset}`);

  console.log(`\n${C.yellow}${C.bold}DRY-RUN completado — sin cambios en base de datos.${C.reset}`);
  console.log("\nPara ejecutar el cleanup de runs/events huérfanos:\n");
  console.log(
    `  ${C.bold}npx tsx --env-file=.env scripts/reset-castillitos-data.ts \\${C.reset}\n` +
    `  ${C.bold}  --execute --runs-history-only --org=${ORG_SLUG}${C.reset}\n`,
  );
}

async function runRunsHistoryExecute(OID: string, ORG_SLUG: string) {
  header("FASE 2 — Cleanup runs + events huérfanos");
  console.log();

  await doDelete("Run (todos los tipos)",       "run",   { organizationId: OID });
  await doDelete("Event (prefijos no-finance)", "event", residualEventWhere(OID));

  header("FASE 3 — Verificación post-cleanup runs");
  console.log();

  const [postRuns, postResidualEvents, postConnectorRun, postCustomers] = await Promise.all([
    prisma.run.count({ where: { organizationId: OID } }),
    prisma.event.count({ where: residualEventWhere(OID) }),
    prisma.connectorRun.count({ where: { connector: { organizationId: OID } } }),
    prisma.customerProfile.count({ where: { organizationId: OID } }),
  ]);

  let verifyPassed = true;
  for (const [label, count] of [
    ["Run",                    postRuns],
    ["Event (no-finance)",     postResidualEvents],
  ] as [string, number][]) {
    if (count === 0) ok(`${label}: 0 — limpio`);
    else { fail(`${label}: ${count} filas residuales — revisar manualmente`); verifyPassed = false; }
  }

  console.log();
  keep(`ConnectorRun: ${postConnectorRun} filas intactas (historial de sync)`);
  if (postCustomers > 0) keep(`CustomerProfile: ${postCustomers} filas intactas`);

  header("RESUMEN — Cleanup runs/events huérfanos");
  console.log();
  ok(`${totalDeleted} filas eliminadas en total`);
  if (verifyPassed) ok("Verificación: PASÓ");
  else              warn("Verificación: hay filas residuales — revisar manualmente.");

  console.log(`
${C.bold}El módulo Runs debería estar limpio ahora.${C.reset}
Verifica en: /${ORG_SLUG}/runs
`);
}

// ══════════════════════════════════════════════════════════════════════════════
// FULL RESET
// ══════════════════════════════════════════════════════════════════════════════

async function runFullResetDryRun(
  OID: string,
  ORG_SLUG: string,
  connectorIds: string[],
) {
  header("FASE 1 — Conteo actual (antes de cualquier cambio)");

  const [
    cntScheduledReport, cntNotification, cntActionTask,
    cntSagWriteOp, cntCrmQuote, cntCrmActivity, cntCrmOpportunity,
    cntReceivable, cntCustomerProfile, cntBusinessAlert,
    cntSaleRecord, cntSalesImportBatch, cntOrderSnapshot,
    cntProductSnapshot, cntMetricSnapshot, cntSyncJob,
  ] = await Promise.all([
    cnt("scheduledReport",   { organizationId: OID }),
    cnt("notification",      { organizationId: OID }),
    cnt("actionTask",        { organizationId: OID }),
    cnt("sagWriteOperation", { organizationId: OID }),
    cnt("cRMQuote",          { organizationId: OID }),
    cnt("cRMActivity",       { organizationId: OID }),
    cnt("cRMOpportunity",    { organizationId: OID }),
    cnt("customerReceivable",{ organizationId: OID }),
    cnt("customerProfile",   { organizationId: OID }),
    cnt("businessAlert",     { organizationId: OID }),
    cnt("saleRecord",        { organizationId: OID }),
    cnt("salesImportBatch",  { organizationId: OID }),
    cnt("orderSnapshot",     { organizationId: OID }),
    cnt("productSnapshot",   { organizationId: OID }),
    cnt("metricSnapshot",    { organizationId: OID }),
    cnt("syncJob",           { organizationId: OID }),
  ]);

  const [
    cntConnectorRun, cntConnectorCursor, cntDocument, cntFileObject,
  ] = await Promise.all([
    connectorIds.length > 0
      ? cnt("connectorRun",    { connectorId: { in: connectorIds } })
      : Promise.resolve(0),
    connectorIds.length > 0
      ? cnt("connectorCursor", { connectorId: { in: connectorIds } })
      : Promise.resolve(0),
    cnt("document",   { organizationId: OID }),
    cnt("fileObject", { organizationId: OID }),
  ]);

  const [
    cntOrg, cntMembership, cntConnector, cntConnectorMapping,
    cntPipelineStage, cntIntegration, cntWorkspace,
  ] = await Promise.all([
    cnt("organization",     { id: OID }),
    cnt("membership",       { organizationId: OID }),
    cnt("connector",        { organizationId: OID }),
    cnt("connectorMapping", { organizationId: OID }),
    cnt("pipelineStage",    { organizationId: OID }),
    cnt("integration",      { organizationId: OID }),
    cnt("workspace",        { organizationId: OID }),
  ]);

  const delConnRuns    = CLEAR_CONN_RUNS ? cntConnectorRun    : 0;
  const delConnCursors = RESET_CURSORS   ? cntConnectorCursor : 0;
  const delDocuments   = !PRESERVE_DOCS  ? cntDocument        : 0;
  const delFileObjects = !PRESERVE_DOCS  ? cntFileObject      : 0;

  console.log();
  console.log(
    `  ${"Tabla".padEnd(26)} ${"Actual".padEnd(15)} ${"A eliminar".padEnd(22)} Preservado`,
  );
  console.log("  " + "─".repeat(66));

  row("ScheduledReport",    cntScheduledReport,  cntScheduledReport,  0);
  row("Notification",       cntNotification,     cntNotification,     0);
  row("ActionTask",         cntActionTask,       cntActionTask,       0);
  row("SagWriteOperation",  cntSagWriteOp,       cntSagWriteOp,       0);
  row("CRMQuote",           cntCrmQuote,         cntCrmQuote,         0);
  row("CRMActivity",        cntCrmActivity,      cntCrmActivity,      0);
  row("CRMOpportunity",     cntCrmOpportunity,   cntCrmOpportunity,   0);
  row("CustomerReceivable", cntReceivable,       cntReceivable,       0);
  row("CustomerProfile",    cntCustomerProfile,  cntCustomerProfile,  0);
  row("BusinessAlert",      cntBusinessAlert,    cntBusinessAlert,    0);
  row("SaleRecord",         cntSaleRecord,       cntSaleRecord,       0);
  row("SalesImportBatch",   cntSalesImportBatch, cntSalesImportBatch, 0);
  row("OrderSnapshot",      cntOrderSnapshot,    cntOrderSnapshot,    0);
  row("ProductSnapshot",    cntProductSnapshot,  cntProductSnapshot,  0);
  row("MetricSnapshot",     cntMetricSnapshot,   cntMetricSnapshot,   0);
  row("SyncJob",            cntSyncJob,          cntSyncJob,          0);
  row("ConnectorRun",       cntConnectorRun,     delConnRuns,         CLEAR_CONN_RUNS ? 0 : cntConnectorRun);
  row("ConnectorCursor",    cntConnectorCursor,  delConnCursors,      RESET_CURSORS   ? 0 : cntConnectorCursor);
  row("Document",           cntDocument,         delDocuments,        PRESERVE_DOCS   ? cntDocument   : 0);
  row("FileObject",         cntFileObject,       delFileObjects,      PRESERVE_DOCS   ? cntFileObject : 0);

  console.log("\n  " + "─".repeat(66));
  console.log(`  ${"PRESERVADO (siempre)".padEnd(26)}`);
  console.log("  " + "─".repeat(66));
  row("Organization",      cntOrg,              0, cntOrg);
  row("Membership",        cntMembership,       0, cntMembership);
  row("Connector",         cntConnector,        0, cntConnector);
  row("ConnectorMapping",  cntConnectorMapping, 0, cntConnectorMapping);
  row("PipelineStage",     cntPipelineStage,    0, cntPipelineStage);
  row("Integration",       cntIntegration,      0, cntIntegration);
  row("Workspace",         cntWorkspace,        0, cntWorkspace);

  const totalToDelete = [
    cntScheduledReport, cntNotification, cntActionTask,
    cntSagWriteOp, cntCrmQuote, cntCrmActivity, cntCrmOpportunity,
    cntReceivable, cntCustomerProfile, cntBusinessAlert,
    cntSaleRecord, cntSalesImportBatch,
    cntOrderSnapshot, cntProductSnapshot, cntMetricSnapshot, cntSyncJob,
    delConnRuns, delConnCursors, delDocuments, delFileObjects,
  ].filter(n => n > 0).reduce((a, b) => a + b, 0);

  console.log();
  info(`Total de filas a eliminar: ${C.bold}${C.red}${totalToDelete}${C.reset}`);

  console.log(`\n${C.yellow}${C.bold}DRY-RUN completado — sin cambios en base de datos.${C.reset}`);
  console.log("\nPara ejecutar el reset completo real:\n");
  const flags = [
    "--execute",
    `--org=${ORG_SLUG}`,
    ...(PRESERVE_DOCS   ? ["--preserve-documents"]  : []),
    ...(RESET_CURSORS   ? ["--reset-cursors"]        : []),
    ...(CLEAR_CONN_RUNS ? ["--clear-connector-runs"] : []),
  ].join(" ");
  console.log(`  ${C.bold}npx tsx --env-file=.env scripts/reset-castillitos-data.ts ${flags}${C.reset}\n`);
}

async function runFullResetExecute(
  OID: string,
  ORG_SLUG: string,
  connectorIds: string[],
  connectors: { id: string; source: string; name: string }[],
) {
  header("FASE 2 — Ejecución de eliminaciones (full reset)");
  console.log();

  await doDelete("ScheduledReport",    "scheduledReport",   { organizationId: OID });
  await doDelete("Notification",       "notification",      { organizationId: OID });
  await doDelete("ActionTask",         "actionTask",        { organizationId: OID });
  await doDelete("SagWriteOperation",  "sagWriteOperation", { organizationId: OID });
  await doDelete("CRMQuote",           "cRMQuote",          { organizationId: OID });
  await doDelete("CRMActivity",        "cRMActivity",       { organizationId: OID });
  await doDelete("CRMOpportunity",     "cRMOpportunity",    { organizationId: OID });
  await doDelete("CustomerReceivable", "customerReceivable",{ organizationId: OID });
  await doDelete("CustomerProfile",    "customerProfile",   { organizationId: OID });
  await doDelete("BusinessAlert",      "businessAlert",     { organizationId: OID });
  await doDelete("SaleRecord",         "saleRecord",        { organizationId: OID });
  await doDelete("SalesImportBatch",   "salesImportBatch",  { organizationId: OID });
  await doDelete("OrderSnapshot",      "orderSnapshot",     { organizationId: OID });
  await doDelete("ProductSnapshot",    "productSnapshot",   { organizationId: OID });
  await doDelete("MetricSnapshot",     "metricSnapshot",    { organizationId: OID });
  await doDelete("SyncJob",            "syncJob",           { organizationId: OID });

  if (CLEAR_CONN_RUNS && connectorIds.length > 0) {
    await doDelete("ConnectorRun", "connectorRun", { connectorId: { in: connectorIds } });
  } else {
    info("ConnectorRun: preservado (usa --clear-connector-runs para limpiar)");
  }

  if (RESET_CURSORS && connectorIds.length > 0) {
    await doDelete("ConnectorCursor", "connectorCursor", { connectorId: { in: connectorIds } });
    warn("ConnectorCursor borrado — la próxima sincronización iniciará desde el comienzo.");
  } else {
    info("ConnectorCursor: preservado (usa --reset-cursors para reiniciar sync position)");
  }

  if (!PRESERVE_DOCS) {
    await doDelete("Document",   "document",   { organizationId: OID });
    await doDelete("FileObject", "fileObject", { organizationId: OID });
  } else {
    info("Documents: preservados (--preserve-documents activo)");
    info("FileObjects: preservados");
  }

  // ── Verification ───────────────────────────────────────────────────────────

  header("FASE 3 — Verificación post-reset");
  console.log();

  const [
    postCrmOpps, postCustomers, postSaleRecords, postActionTasks,
    postNotifs, postSchedReports,
  ] = await Promise.all([
    cnt("cRMOpportunity",  { organizationId: OID }),
    cnt("customerProfile", { organizationId: OID }),
    cnt("saleRecord",      { organizationId: OID }),
    cnt("actionTask",      { organizationId: OID }),
    cnt("notification",    { organizationId: OID }),
    cnt("scheduledReport", { organizationId: OID }),
  ]);

  const checks: [string, number][] = [
    ["CRMOpportunity",  postCrmOpps],
    ["CustomerProfile", postCustomers],
    ["SaleRecord",      postSaleRecords],
    ["ActionTask",      postActionTasks],
    ["Notification",    postNotifs],
    ["ScheduledReport", postSchedReports],
  ];

  let verifyPassed = true;
  for (const [label, count] of checks) {
    if (count === 0) ok(`${label}: 0 filas — limpio`);
    else { fail(`${label}: ${count} filas aún presentes — verificar manualmente`); verifyPassed = false; }
  }

  const postOrg         = await cnt("organization", { id: OID });
  const postMemberships = await cnt("membership",   { organizationId: OID });
  const postConnectors  = await cnt("connector",    { organizationId: OID });
  const postStages      = await cnt("pipelineStage",{ organizationId: OID });

  console.log();
  if (postOrg > 0)         ok("Organization: preservada");
  else                     fail("Organization: NO ENCONTRADA — error crítico");
  if (postMemberships > 0) ok(`Memberships: ${postMemberships} preservadas`);
  else                     warn("Memberships: 0 — sin usuarios asignados");
  if (postConnectors > 0)  ok(`Connectors: ${postConnectors} preservados`);
  else                     warn("Connectors: 0 — ejecutar setup-castillitos-connectors.ts");
  if (postStages > 0)      ok(`PipelineStage: ${postStages} etapas preservadas`);
  else                     warn("PipelineStage: 0 — etapas del pipeline no configuradas");

  // ── Summary ────────────────────────────────────────────────────────────────

  header("RESUMEN");
  console.log();
  ok(`${totalDeleted} filas eliminadas en total`);
  if (verifyPassed) ok("Verificación post-reset: PASÓ");
  else              warn("Verificación post-reset: hay tablas con filas residuales — revisar manualmente.");

  console.log(`
${C.bold}Orden de re-sincronización recomendado:${C.reset}

  ${C.bold}1. ERP — Clientes:${C.reset}
     POST /api/orgs/${ORG_SLUG}/connectors/<sag-id>/sync  body: { "module": "customers" }

  ${C.bold}2. ERP — Cartera:${C.reset}
     POST /api/orgs/${ORG_SLUG}/connectors/<sag-id>/sync  body: { "module": "receivables" }

  ${C.bold}3. CRM — Cuentas/Clientes:${C.reset}
     POST /api/orgs/${ORG_SLUG}/connectors/<crm-id>/sync  body: { "module": "customers" }

  ${C.bold}4. CRM — Oportunidades:${C.reset}
     POST /api/orgs/${ORG_SLUG}/connectors/<crm-id>/sync  body: { "module": "opportunities" }

  ${C.bold}5. CRM — Actividades:${C.reset}
     POST /api/orgs/${ORG_SLUG}/connectors/<crm-id>/sync  body: { "module": "activities" }

  ${C.bold}6. CRM — Cotizaciones:${C.reset}
     POST /api/orgs/${ORG_SLUG}/connectors/<crm-id>/sync  body: { "module": "quotes" }

  ${C.bold}7. Ventas — Re-importar CSV SAG:${C.reset}
     /${ORG_SLUG}/sales  →  Importar datos SAG

  ${C.bold}8. Scoring:${C.reset}
     POST /api/orgs/${ORG_SLUG}/customer-360/score

  ${C.bold}9. Validar:${C.reset}
     npx tsx --env-file=.env scripts/validate-castillitos.ts --verbose
`);

  if (connectors.length > 0) {
    info("Conectores configurados:");
    connectors.forEach(c => info(`  ${c.source.padEnd(20)} ID: ${c.id}  (${c.name})`));
  }

  console.log();
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  // ── Guard ────────────────────────────────────────────────────────────────────

  if (!DRY_RUN && !EXECUTE) {
    console.log(`
${C.bold}${C.red}ERROR: Debes especificar --dry-run o --execute.${C.reset}

Uso (modo SELECTIVO — solo documentos + ventas):
  npx tsx --env-file=.env scripts/reset-castillitos-data.ts \\
    --dry-run  --documents-and-sales-only
  npx tsx --env-file=.env scripts/reset-castillitos-data.ts \\
    --execute  --documents-and-sales-only

Uso (modo SELECTIVO — solo historial finance):
  npx tsx --env-file=.env scripts/reset-castillitos-data.ts \\
    --dry-run  --finance-history-only
  npx tsx --env-file=.env scripts/reset-castillitos-data.ts \\
    --execute  --finance-history-only

Uso (modo SELECTIVO — runs huérfanos):
  npx tsx --env-file=.env scripts/reset-castillitos-data.ts \\
    --dry-run  --runs-history-only
  npx tsx --env-file=.env scripts/reset-castillitos-data.ts \\
    --execute  --runs-history-only

Uso (FULL RESET — limpieza completa):
  npx tsx --env-file=.env scripts/reset-castillitos-data.ts --dry-run
  npx tsx --env-file=.env scripts/reset-castillitos-data.ts --execute

Flags opcionales (full reset):
  --org=<slug>               Organización (default: castillitos)
  --preserve-documents       No eliminar Documents ni FileObjects
  --reset-cursors            Borrar ConnectorCursors (reinicia sync desde cero)
  --clear-connector-runs     Borrar historial de ConnectorRuns
`);
    process.exit(1);
  }

  if (DRY_RUN && EXECUTE) {
    console.log(`\n${C.red}ERROR: No puedes usar --dry-run y --execute al mismo tiempo.${C.reset}\n`);
    process.exit(1);
  }

  // ── Banner ───────────────────────────────────────────────────────────────────

  const modeLabel = SELECTIVE
    ? `${C.cyan}SELECTIVO — documentos + ventas${C.reset}`
    : FINANCE_HISTORY
      ? `${C.cyan}SELECTIVO — historial finance${C.reset}`
      : RUNS_HISTORY
        ? `${C.cyan}SELECTIVO — runs huérfanos${C.reset}`
        : `${C.red}${C.bold}FULL RESET${C.reset}`;
  const execLabel = DRY_RUN
    ? `${C.yellow}DRY-RUN${C.reset}`
    : `${C.red}${C.bold}EJECUCIÓN REAL${C.reset}`;

  console.log(`
${C.bold}════════════════════════════════════════════════════════════════════${C.reset}
  ${C.bold}Agentik — Tenant Data Reset${C.reset}
  Organización : ${C.bold}${ORG_SLUG}${C.reset}
  Modo         : ${modeLabel}
  Ejecución    : ${execLabel}
  Fecha        : ${new Date().toLocaleString("es-CO")}
${C.bold}════════════════════════════════════════════════════════════════════${C.reset}
`);

  // ── Resolve org ──────────────────────────────────────────────────────────────

  const org = await prisma.organization.findFirst({
    where: { slug: ORG_SLUG },
    select: { id: true, name: true, slug: true, status: true },
  });

  if (!org) {
    fail(`Organización "${ORG_SLUG}" no encontrada.`);
    const all = await prisma.organization.findMany({ select: { slug: true, name: true } });
    console.log("\nOrganizaciones disponibles:");
    all.forEach(o => console.log(`  - ${o.slug}  (${o.name})`));
    process.exit(1);
  }

  const OID = org.id;
  info(`ID:     ${OID}`);
  info(`Nombre: ${org.name}`);
  info(`Estado: ${org.status}`);

  // ── Safety guard ──────────────────────────────────────────────────────────────

  if (EXECUTE && ORG_SLUG !== "castillitos") {
    warn(`Vas a ejecutar el reset en "${ORG_SLUG}" (no es castillitos).`);
    if (!args.includes("--org-confirmed")) {
      fail("Abortando por seguridad. Agrega --org-confirmed para confirmar.");
      process.exit(1);
    }
  }

  // ── Connector IDs ─────────────────────────────────────────────────────────────

  const connectors = await prisma.connector.findMany({
    where: { organizationId: OID },
    select: { id: true, source: true, name: true },
  });
  const connectorIds = connectors.map(c => c.id);

  // ── Dispatch ──────────────────────────────────────────────────────────────────

  if (SELECTIVE) {
    if (DRY_RUN) {
      await runSelectiveDryRun(OID, ORG_SLUG);
    } else {
      await runSelectiveExecute(OID, ORG_SLUG);
    }
  } else if (FINANCE_HISTORY) {
    if (DRY_RUN) {
      await runFinanceHistoryDryRun(OID, ORG_SLUG);
    } else {
      await runFinanceHistoryExecute(OID, ORG_SLUG);
    }
  } else if (RUNS_HISTORY) {
    if (DRY_RUN) {
      await runRunsHistoryDryRun(OID, ORG_SLUG);
    } else {
      await runRunsHistoryExecute(OID, ORG_SLUG);
    }
  } else {
    if (DRY_RUN) {
      await runFullResetDryRun(OID, ORG_SLUG, connectorIds);
    } else {
      await runFullResetExecute(OID, ORG_SLUG, connectorIds, connectors);
    }
  }
}

main()
  .catch(e => { console.error(`\n${C.red}Error fatal:${C.reset}`, e); process.exit(1); })
  .finally(() => prisma.$disconnect());
