/**
 * scripts/sag-switch-credentials.ts
 *
 * Production credential switch — Castillitos SAG PYA connector.
 *
 * Switches the Neon connector row (cmnhu4hky0000n4y50jlhkfib) from the
 * sandbox token / database to the new production credentials issued by PYA.
 *
 * Changes applied to connector.config:
 *   token       sandbox → production
 *   database    sandbox → production
 *   customerQuery   cleared → adapter uses DEFAULT_CUSTOMER_QUERY (SELECT * FROM v_cl)
 *   receivableQuery cleared → adapter uses DEFAULT_RECEIVABLE_QUERY (MOVIMIENTOS JOIN)
 *   endpointUrl  preserved (no endpoint change)
 *
 * Dry-run flag:
 *   By default the script runs in READ-ONLY mode and shows the diff without
 *   writing to the DB. Pass --apply to commit the changes.
 *
 * Usage:
 *   # Preview only (no writes):
 *   npx tsx scripts/sag-switch-credentials.ts
 *
 *   # Apply and verify:
 *   npx tsx scripts/sag-switch-credentials.ts --apply
 *
 * Prerequisites: DATABASE_URL / DIRECT_URL set in .env or .env.local.
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
};

const APPLY = process.argv.includes("--apply");

function ok(msg: string)   { console.log(`  ${C.green}✓${C.reset} ${msg}`); }
function fail(msg: string) { console.log(`  ${C.red}✗${C.reset} ${msg}`); }
function info(msg: string) { console.log(`  ${C.grey}·${C.reset} ${msg}`); }
function warn(msg: string) { console.log(`  ${C.yellow}⚠${C.reset} ${msg}`); }

function section(title: string) {
  console.log(`\n${C.bold}${C.cyan}── ${title}${C.reset}`);
}

function mask(s: string | undefined | null): string {
  if (!s) return "(absent)";
  return s.slice(0, 8) + "…";
}

// ── Production credentials (new values from PYA) ─────────────────────────────

const CONNECTOR_ID     = "cmnhu4hky0000n4y50jlhkfib";
const NEW_TOKEN        = "66BD3E30-AAC9-461C-BBF3-B4D0464980F7";
const NEW_DATABASE     = "INDDIANAA_CASTILLO-ALZATE";

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${C.bold}SAG PYA Credential Switch${C.reset}`);
  console.log(C.grey + new Date().toISOString() + C.reset);
  console.log(C.yellow + (APPLY ? "  MODE: APPLY (writes to DB)" : "  MODE: DRY-RUN (read-only — pass --apply to commit)") + C.reset);

  let exitCode = 0;

  const { prisma } = await import("../lib/prisma");

  // ── 1) Read current connector row ────────────────────────────────────────────

  section("Current connector config (before switch)");

  const connector = await prisma.connector.findUnique({
    where:  { id: CONNECTOR_ID },
    select: { id: true, source: true, status: true, config: true, organizationId: true, modules: true },
  });

  if (!connector) {
    fail(`Connector ${CONNECTOR_ID} not found — verify the ID is correct for this environment`);
    process.exit(1);
  }

  const cfg = connector.config as Record<string, unknown>;

  const currentToken        = cfg["token"]         as string | undefined;
  const currentDatabase     = cfg["database"]      as string | undefined;
  const currentEndpoint     = cfg["endpointUrl"]   as string | undefined;
  const currentCustomerQ    = cfg["customerQuery"] as string | undefined;
  const currentReceivableQ  = cfg["receivableQuery"] as string | undefined;

  ok(`Connector: ${connector.id} — source: ${connector.source} — status: ${connector.status}`);
  info(`Modules: ${(connector.modules as string[]).join(", ")}`);
  console.log();
  info(`  token         : ${mask(currentToken)}`);
  info(`  database      : ${currentDatabase ?? "(absent — falls back to env)"}`);
  info(`  endpointUrl   : ${currentEndpoint ?? "(absent — falls back to default)"}`);
  info(`  customerQuery : ${currentCustomerQ ?? "(absent — uses adapter default: SELECT * FROM v_cl)"}`);
  info(`  receivableQ   : ${currentReceivableQ ? currentReceivableQ.slice(0, 60) + "…" : "(absent — uses adapter JOIN default)"}`);

  // ── 2) Diff ──────────────────────────────────────────────────────────────────

  section("Proposed changes");

  type DiffRow = [string, string, string, boolean];
  const diff: DiffRow[] = [
    ["Field",           "BEFORE",                           "AFTER",                          false],
    ["token",           mask(currentToken),                 mask(NEW_TOKEN),                   currentToken !== NEW_TOKEN],
    ["database",        currentDatabase ?? "(absent)",      NEW_DATABASE,                      currentDatabase !== NEW_DATABASE],
    ["customerQuery",   currentCustomerQ ?? "(absent)",     "SELECT * FROM TERCEROS",         currentCustomerQ !== "SELECT * FROM TERCEROS"],
    ["receivableQuery", currentReceivableQ ? "(explicit)" : "(absent)", "(cleared → JOIN default)", !!currentReceivableQ],
    ["endpointUrl",     currentEndpoint ?? "(absent)",      "(preserved)",                    false],
  ];

  const cw = [16, 40, 38];
  const pad = (s: string, w: number) => s.slice(0, w).padEnd(w);

  for (const [i, [field, before, after, changed]] of diff.entries()) {
    const line = `${pad(field, cw[0])}  ${pad(before, cw[1])}  ${pad(after, cw[2])}`;
    if (i === 0) {
      console.log(`\n  ${C.bold}${line}${C.reset}`);
      console.log("  " + "─".repeat(cw.reduce((a, b) => a + b + 4, 0)));
    } else if (changed) {
      console.log(`  ${C.yellow}${line}  ← CHANGED${C.reset}`);
    } else {
      console.log(`  ${C.grey}${line}${C.reset}`);
    }
  }

  const anyChange = diff.slice(1).some(([,,, c]) => c);
  if (!anyChange) {
    ok("No changes needed — connector already has production credentials");
    await prisma.$disconnect();
    process.exit(0);
  }

  // ── 3) Apply or preview ──────────────────────────────────────────────────────

  if (!APPLY) {
    section("Summary (dry-run — no writes)");
    warn("Changes listed above NOT applied.");
    warn("Re-run with --apply to commit:");
    info("  npx tsx scripts/sag-switch-credentials.ts --apply");
    await prisma.$disconnect();
    process.exit(0);
  }

  section("Applying changes");

  // Build the new config: preserve all existing keys, override the ones we change.
  //
  // customerQuery: production DB INDDIANAA_CASTILLO-ALZATE does NOT have the v_cl view
  // (confirmed 2026-04-10 — "Invalid object name 'v_cl'").  Set TERCEROS explicitly so
  // the adapter's DEFAULT_CUSTOMER_QUERY (v_cl) is bypassed for this installation.
  //
  // receivableQuery: cleared — adapter DEFAULT_RECEIVABLE_QUERY (MOVIMIENTOS JOIN) applies.
  const newConfig: Record<string, unknown> = {
    ...cfg,
    token:         NEW_TOKEN,
    database:      NEW_DATABASE,
    customerQuery: "SELECT * FROM TERCEROS",
  };
  // Remove stale receivableQuery (CARTERA doesn't exist) — adapter JOIN default applies
  delete newConfig["receivableQuery"];

  await prisma.connector.update({
    where: { id: CONNECTOR_ID },
    data: {
      config:    newConfig as import("@prisma/client").Prisma.InputJsonValue,
      status:    "ACTIVE",
      updatedAt: new Date(),
    },
  });

  ok("Connector config updated in Neon DB");

  // ── 4) Verify ────────────────────────────────────────────────────────────────

  section("Verification — read-back from DB");

  const updated = await prisma.connector.findUniqueOrThrow({
    where:  { id: CONNECTOR_ID },
    select: { config: true, status: true },
  });

  const uc = updated.config as Record<string, unknown>;

  const gotToken    = uc["token"]         as string | undefined;
  const gotDatabase = uc["database"]      as string | undefined;
  const gotCustQ    = uc["customerQuery"] as string | undefined;
  const gotRecQ     = uc["receivableQuery"] as string | undefined;

  if (gotToken === NEW_TOKEN) {
    ok(`token    : ${mask(gotToken)} ✓`);
  } else {
    fail(`token mismatch — got ${mask(gotToken)}, expected ${mask(NEW_TOKEN)}`);
    exitCode = 1;
  }

  if (gotDatabase === NEW_DATABASE) {
    ok(`database : "${gotDatabase}" ✓`);
  } else {
    fail(`database mismatch — got "${gotDatabase}", expected "${NEW_DATABASE}"`);
    exitCode = 1;
  }

  if (!gotCustQ) {
    ok("customerQuery   : cleared — adapter will use SELECT * FROM v_cl ✓");
  } else {
    warn(`customerQuery not cleared — still "${gotCustQ}" — adapter default bypassed`);
  }

  if (!gotRecQ) {
    ok("receivableQuery : cleared — adapter will use MOVIMIENTOS JOIN ✓");
  } else {
    warn(`receivableQuery not cleared — still "${gotRecQ.slice(0, 50)}…"`);
  }

  ok(`connector status: ${updated.status}`);

  if (exitCode !== 0) {
    fail("Read-back verification failed — check DB write permissions");
    await prisma.$disconnect();
    process.exit(exitCode);
  }

  // ── 5) Health checks with new credentials ───────────────────────────────────

  section("Health check — production credentials");

  // Enable raw SOAP logging to stderr
  process.env.PYA_DEBUG = "true";

  const { consultaSagJson } = await import("../lib/connectors/pya/client");

  const effectiveEndpoint =
    (uc["endpointUrl"] as string | undefined) ??
    process.env.PYA_SOAP_ENDPOINT ??
    "https://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  info(`endpoint : ${effectiveEndpoint}`);
  info(`database : "${NEW_DATABASE}"`);
  info(`token    : ${mask(NEW_TOKEN)}`);

  // ── 5a) customers — SELECT TOP 1 * FROM TERCEROS ─────────────────────────────

  console.log();
  info("customers: SELECT TOP 1 * FROM TERCEROS");

  try {
    const t0   = Date.now();
    const rows = await consultaSagJson(
      { endpointUrl: effectiveEndpoint, token: NEW_TOKEN, database: NEW_DATABASE },
      "SELECT TOP 1 * FROM TERCEROS",
    );
    const ms = Date.now() - t0;

    ok(`customers health check PASSED — ${rows.length} row(s) in ${ms} ms`);
    if (rows.length > 0) {
      const cols = Object.keys(rows[0] as Record<string, unknown>);
      info(`Columns (first ${Math.min(cols.length, 8)}): ${cols.slice(0, 8).join(", ")}`);
    }
  } catch (e) {
    const msg = (e as Error).message;
    fail(`customers health check FAILED: ${msg}`);
    if (msg.includes("FALLIDO")) {
      fail("  → SAG FALLIDO — token or database may be incorrect");
      fail(`  → Verify exact database name with PYA: "${NEW_DATABASE}"`);
    }
    exitCode = 1;
  }

  // ── 5b) receivables — SELECT TOP 1 * FROM MOVIMIENTOS ────────────────────────

  console.log();
  info("receivables: SELECT TOP 1 * FROM MOVIMIENTOS");

  try {
    const t0   = Date.now();
    const rows = await consultaSagJson(
      { endpointUrl: effectiveEndpoint, token: NEW_TOKEN, database: NEW_DATABASE },
      "SELECT TOP 1 * FROM MOVIMIENTOS",
    );
    const ms = Date.now() - t0;

    ok(`receivables health check PASSED — ${rows.length} row(s) in ${ms} ms`);
    if (rows.length > 0) {
      const cols = Object.keys(rows[0] as Record<string, unknown>);
      info(`Columns (first ${Math.min(cols.length, 8)}): ${cols.slice(0, 8).join(", ")}`);
    }
  } catch (e) {
    const msg = (e as Error).message;
    fail(`receivables health check FAILED: ${msg}`);
    if (msg.includes("Invalid object")) warn("  → MOVIMIENTOS table may have different name in this installation");
    if (msg.includes("FALLIDO"))       fail("  → SAG FALLIDO — check token and database");
    exitCode = 1;
  }

  // ── Summary ──────────────────────────────────────────────────────────────────

  section("Summary");

  if (exitCode === 0) {
    console.log(`\n  ${C.green}${C.bold}✓ Credential switch complete.${C.reset}`);
    console.log(`  ${C.grey}token   : ${mask(currentToken)} → ${mask(NEW_TOKEN)}${C.reset}`);
    console.log(`  ${C.grey}database: ${currentDatabase ?? "(absent)"} → ${NEW_DATABASE}${C.reset}`);
    console.log(`\n  ${C.cyan}Next steps:${C.reset}`);
    console.log(`  ${C.grey}1. Run customers dry-run from UI: POST /api/orgs/castillitos/connectors/${CONNECTOR_ID}/dry-run${C.reset}`);
    console.log(`  ${C.grey}   body: { "module": "customers" }${C.reset}`);
    console.log(`  ${C.grey}2. If rowsRead > 0, run receivables dry-run${C.reset}`);
    console.log(`  ${C.grey}3. If both dry-runs succeed, run full sync (clears cursor for fresh import)${C.reset}`);
    console.log(`  ${C.grey}4. Recommended: run sag-test-dry-run.ts to confirm column mapping${C.reset}\n`);
  } else {
    console.log(`\n  ${C.red}${C.bold}✗ Credential switch incomplete — see errors above.${C.reset}\n`);
  }

  await prisma.$disconnect();
  process.exit(exitCode);
}

main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
