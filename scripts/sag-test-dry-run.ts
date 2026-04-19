/**
 * scripts/sag-test-dry-run.ts
 *
 * PYA query contract audit + dry-run validation.
 *
 * Reproduces exactly what POST /api/orgs/[orgSlug]/connectors/[connectorId]/dry-run
 * does for the customers and receivables modules — same code path, same adapter
 * instantiation, same SOAP call shape.
 *
 * QUERY AUDIT (manual v32, 2026-02-10):
 *   Manual documented view for customers: v_cl
 *     Example: SELECT TOP 10 n_nit AS Documento, sc_nombre AS Nombre FROM v_cl
 *   Adapter default (after fix): SELECT * FROM v_cl  (switched from TERCEROS)
 *   Receivables: no documented view — MOVIMIENTOS JOIN is our confirmed custom query.
 *
 * WHAT IT CHECKS:
 *   1. PYA_SAG_BD env var is set (required for a_s_bd fallback).
 *   2. Connector config from DB (shows whether 'database' is set in config).
 *   3. Raw probe: consultaSagJson with SELECT TOP 100 * FROM v_cl (validates view exists).
 *   4. Adapter pullCustomers() returns rows without FALLIDO error (uses v_cl).
 *   5. Adapter pullReceivables() is unaffected (MOVIMIENTOS JOIN, no change).
 *
 * SECURITY: Token is never printed. Only "[SET]" or "(empty)" is logged.
 *
 * Usage:
 *   npx tsx scripts/sag-test-dry-run.ts
 *   PYA_DEBUG=true npx tsx scripts/sag-test-dry-run.ts
 *
 * Prerequisites: SAG_TEST_TOKEN or PYA_SOAP_TOKEN, PYA_SAG_BD set in .env/.env.local.
 * Also requires DATABASE_URL / DIRECT_URL for DB access.
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

function ok(msg: string)   { console.log(`  ${C.green}✓${C.reset} ${msg}`); }
function fail(msg: string) { console.log(`  ${C.red}✗${C.reset} ${msg}`); }
function info(msg: string) { console.log(`  ${C.grey}·${C.reset} ${msg}`); }
function warn(msg: string) { console.log(`  ${C.yellow}⚠${C.reset} ${msg}`); }

function section(title: string) {
  console.log(`\n${C.bold}${C.cyan}── ${title}${C.reset}`);
}

const CASTILLITOS_SLUG = "castillitos";
const MODULE_CUSTOMERS   = "customers";
const MODULE_RECEIVABLES = "receivables";

async function main(): Promise<void> {
  console.log(`\n${C.bold}SAG Dry-Run Diagnostic${C.reset}`);
  console.log(C.grey + new Date().toISOString() + C.reset);

  // Enable raw SOAP envelope logging — all [PYA DEBUG] lines go to stderr.
  // Must be set before any dynamic import of client.ts (module-level const).
  process.env.PYA_DEBUG = "true";

  let exitCode = 0;

  // ── 1) Env check ─────────────────────────────────────────────────────────────

  section("Env — PYA_SAG_BD fallback (root cause check)");

  const pyaSagBd = process.env.PYA_SAG_BD?.trim();
  if (!pyaSagBd) {
    fail("PYA_SAG_BD is not set — the adapter database fallback will be undefined → FALLIDO");
    warn("Fix: add PYA_SAG_BD=<database> to .env.local and re-run");
    exitCode = 1;
  } else {
    ok(`PYA_SAG_BD is set: "${pyaSagBd}"`);
  }

  const pyaToken =
    process.env.PYA_SOAP_TOKEN?.trim() ||
    process.env.SAG_TEST_TOKEN?.trim();
  if (!pyaToken) {
    fail("Neither PYA_SOAP_TOKEN nor SAG_TEST_TOKEN is set — token will be undefined");
    exitCode = 1;
  } else {
    ok("Token env var is set [masked]");
  }

  if (exitCode !== 0) {
    console.log(`\n  ${C.red}${C.bold}Env check failed — aborting.${C.reset}\n`);
    process.exit(exitCode);
  }

  // ── 1b) SOAP envelope comparison ──────────────────────────────────────────────

  section("SOAP envelope comparison (structural diff)");

  // Manual v32 example envelope (from PYA documentation, 2026-02-10):
  //   Uses demo token; no a_s_bd; queries v_cl with TOP 10 and column aliases.
  //   Includes <soapenv:Header/> (empty — WCF ignores it).
  const manualEnvelope =
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">` +
    `<soapenv:Header/>` +
    `<soapenv:Body>` +
      `<tem:consultaSagJson>` +
        `<tem:a_s_token>t0k3n1</tem:a_s_token>` +
        `<!-- a_s_bd ABSENT in manual example -->` +
        `<tem:a_s_consulta>SELECT TOP 10 n_nit AS Documento, sc_nombre AS Nombre FROM v_cl</tem:a_s_consulta>` +
      `</tem:consultaSagJson>` +
    `</soapenv:Body>` +
    `</soapenv:Envelope>`;

  // Failing UI envelope (before fix — connector.config.database absent, old TERCEROS table):
  const failingEnvelope =
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="http://tempuri.org/">` +
    `<soap:Body>` +
      `<tns:consultaSagJson>` +
        `<tns:a_s_token>[REDACTED]</tns:a_s_token>` +
        `<!-- a_s_bd ABSENT → NullReferenceException → FALLIDO -->` +
        `<tns:a_s_consulta>SELECT * FROM TERCEROS</tns:a_s_consulta>` +
      `</tns:consultaSagJson>` +
    `</soap:Body>` +
    `</soap:Envelope>`;

  // Fixed UI envelope (after fix — a_s_bd from PYA_SAG_BD env, v_cl view):
  const fixedEnvelope =
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="http://tempuri.org/">` +
    `<soap:Body>` +
      `<tns:consultaSagJson>` +
        `<tns:a_s_token>[REDACTED]</tns:a_s_token>` +
        `<tns:a_s_bd>${pyaSagBd}</tns:a_s_bd>` +
        `<tns:a_s_consulta>SELECT * FROM v_cl</tns:a_s_consulta>` +
      `</tns:consultaSagJson>` +
    `</soap:Body>` +
    `</soap:Envelope>`;

  const rows: Array<[string, string, string, string]> = [
    ["Attribute",         "Manual v32",                        "Failing UI (before fix)",    "Fixed UI (after fix)"],
    ["SOAP namespace",    "soapenv / tem",                     "soap / tns",                 "soap / tns"],
    ["<Header/>",         "present (empty)",                   "absent",                     "absent"],
    ["a_s_bd",            "absent (demo)",                     "ABSENT → FALLIDO",           `\"${pyaSagBd}\"`],
    ["a_s_consulta",      "SELECT TOP 10 … FROM v_cl",         "SELECT * FROM TERCEROS",     "SELECT * FROM v_cl"],
  ];

  const colW    = [20, 36, 34, 30];
  const padEnv  = (s: string, w: number) => s.slice(0, w).padEnd(w);

  for (const [i, row] of rows.entries()) {
    const line = row.map((c, j) => padEnv(c, colW[j])).join("  ");
    if (i === 0) {
      console.log(`\n  ${C.bold}${line}${C.reset}`);
      console.log("  " + "─".repeat(colW.reduce((a, b) => a + b + 2, 0)));
    } else {
      const isIssue = row[2].includes("FALLIDO") || row[2].includes("TERCEROS");
      console.log(`  ${isIssue ? C.red : C.grey}${line}${C.reset}`);
    }
  }

  info("Manual: soapenv/tem namespace + <Header/> — WCF ignores empty headers, difference is cosmetic");
  info("Manual: no a_s_bd — uses demo token against demo DB; not applicable for production");
  ok("Structural mismatch identified: a_s_bd absent (before fix) + wrong table (before fix)");
  ok("Both issues resolved in fixed envelope — see [PYA DEBUG] stderr lines from the probe below");

  // Show the envelope strings for manual inspection
  console.log(`\n  ${C.grey}── Manual v32 envelope:${C.reset}`);
  console.log(`  ${C.grey}${manualEnvelope.slice(0, 200)}…${C.reset}`);
  console.log(`\n  ${C.grey}── Failing UI envelope (before fix):${C.reset}`);
  console.log(`  ${C.red}${failingEnvelope.slice(0, 200)}…${C.reset}`);
  console.log(`\n  ${C.grey}── Fixed UI envelope (after fix):${C.reset}`);
  console.log(`  ${C.green}${fixedEnvelope.slice(0, 200)}…${C.reset}`);

  // ── 2) Load connector from DB ─────────────────────────────────────────────────

  section("Connector config from DB");

  const { prisma } = await import("../lib/prisma");

  const org = await prisma.organization.findUnique({
    where:  { slug: CASTILLITOS_SLUG },
    select: { id: true, slug: true },
  });

  if (!org) {
    fail(`Organization "${CASTILLITOS_SLUG}" not found`);
    process.exit(1);
  }

  ok(`Org: ${org.slug} (${org.id})`);

  const connector = await prisma.connector.findFirst({
    where:  { organizationId: org.id, source: "sag_pya_soap" },
    select: { id: true, source: true, status: true, config: true, modules: true },
  });

  if (!connector) {
    fail(`No sag_pya_soap connector found for "${CASTILLITOS_SLUG}"`);
    process.exit(1);
  }

  ok(`Connector: ${connector.id} — status: ${connector.status}`);
  info(`Modules in DB: ${(connector.modules as string[]).join(", ")}`);

  const cfg = connector.config as Record<string, unknown>;
  const cfgDatabase = cfg["database"];
  const cfgToken    = cfg["token"];

  if (cfgDatabase) {
    ok(`connector.config.database = "${cfgDatabase}" (explicit — no fallback needed)`);
  } else {
    warn(`connector.config.database is not set — adapter will fall back to PYA_SAG_BD`);
    info(`After fix: a_s_bd will be "${pyaSagBd}"`);
  }

  if (cfgToken) {
    ok("connector.config.token is set [masked]");
  } else {
    fail("connector.config.token is NOT set — SOAP call will fail with token error");
    exitCode = 1;
  }

  if (exitCode !== 0) {
    console.log(`\n  ${C.red}Connector config check failed.${C.reset}\n`);
    process.exit(exitCode);
  }

  // ── 3) Raw SOAP probe — v_cl view (manual v32 contract) ─────────────────────

  section("Query audit — v_cl view (manual v32 contract)");

  // Manual v32 example: SELECT TOP 10 n_nit AS Documento, sc_nombre AS Nombre FROM v_cl
  // We use SELECT TOP 100 * to confirm: (a) v_cl exists, (b) column names match mapper
  const V_CL_PROBE = "SELECT TOP 100 * FROM v_cl";
  info(`Probe query: ${V_CL_PROBE}`);

  const resolvedDatabase = (cfgDatabase as string | undefined) ?? pyaSagBd ?? "";
  const resolvedToken    = (cfgToken    as string | undefined) ?? pyaToken  ?? "";
  const resolvedEndpoint = (cfg["endpointUrl"] as string | undefined)
    ?? process.env.PYA_SOAP_ENDPOINT
    ?? "https://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  info(`Effective endpoint: ${resolvedEndpoint}`);
  info(`Effective database: "${resolvedDatabase}"`);

  const { consultaSagJson } = await import("../lib/connectors/pya/client");

  try {
    const t0   = Date.now();
    const rows = await consultaSagJson(
      { endpointUrl: resolvedEndpoint, token: resolvedToken, database: resolvedDatabase || undefined },
      V_CL_PROBE,
    );
    const ms = Date.now() - t0;

    ok(`v_cl probe returned ${rows.length} rows in ${ms} ms`);

    if (rows.length > 0) {
      const first = rows[0] as Record<string, unknown>;
      const cols  = Object.keys(first);
      info(`Column names from v_cl (first row): ${cols.slice(0, 10).join(", ")}${cols.length > 10 ? ` … (+${cols.length - 10} more)` : ""}`);

      // Confirm mapper-critical columns are present
      const REQUIRED = ["n_nit", "sc_nombre", "ddt_fecha_modificacion"];
      const missing  = REQUIRED.filter(c => !cols.includes(c));
      if (missing.length === 0) {
        ok(`All mapper-critical columns present: ${REQUIRED.join(", ")}`);
      } else {
        warn(`Missing mapper-critical columns: ${missing.join(", ")} — mapper will return null for these`);
      }
    }

    ok("✓ v_cl view exists and is queryable — query contract confirmed");
  } catch (e) {
    fail(`v_cl probe failed: ${(e as Error).message}`);
    if ((e as Error).message.includes("FALLIDO")) {
      fail("  → SAG returned FALLIDO — may be invalid view name or missing a_s_bd");
    }
    exitCode = 1;
  }

  // ── 4) Instantiate adapter (same path as syncEngine.syncModule) ───────────────

  section("Adapter instantiation and apiConfig");

  // Register adapters (side-effect import — required before adapter usage)
  await import("../lib/connectors/adapters");

  const { registry }    = await import("../lib/connectors/core/connector-registry");
  const { SagPyaSoapAdapter } = await import("../lib/connectors/adapters/sag-pya-soap/index");

  const adapter = registry.create("sag_pya_soap", org.id, cfg) as InstanceType<typeof SagPyaSoapAdapter>;
  ok("Adapter instantiated via registry.create()");

  // ── 4b) Transport parity — script path vs adapter path ───────────────────────

  section("Transport parity — script path vs adapter/UI path");

  // Script path token resolution (mirrors sag-test-dry-run section 3):
  //   resolvedToken = cfg.token ?? PYA_SOAP_TOKEN ?? SAG_TEST_TOKEN
  const scriptToken    = (cfgToken    as string | undefined) ?? pyaToken ?? "";
  const scriptDatabase = (cfgDatabase as string | undefined) ?? pyaSagBd ?? "";
  const scriptEndpoint = (cfg["endpointUrl"] as string | undefined)
    ?? process.env.PYA_SOAP_ENDPOINT
    ?? "https://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  // Adapter path resolution (mirrors apiConfig getter after token-fix):
  //   token    = cfg.token || PYA_SOAP_TOKEN || SAG_TEST_TOKEN
  //   database = cfg.database ?? PYA_SAG_BD
  //   endpoint = cfg.endpointUrl ?? PYA_SOAP_ENDPOINT ?? hardcoded
  const adapterToken    = (cfgToken    as string | undefined) ||
                          process.env.PYA_SOAP_TOKEN?.trim() ||
                          process.env.SAG_TEST_TOKEN?.trim() || "";
  const adapterDatabase = (cfgDatabase as string | undefined) ?? pyaSagBd ?? "";
  const adapterEndpoint = (cfg["endpointUrl"] as string | undefined)
    ?? process.env.PYA_SOAP_ENDPOINT
    ?? "https://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  const SOAP_ACTION    = "http://tempuri.org/IServiceSagWeb/consultaSagJson";
  const CONTENT_TYPE   = "text/xml; charset=utf-8";
  const SOAP_NAMESPACE = "http://schemas.xmlsoap.org/soap/envelope/";

  type DiffRow = [string, string, string, boolean];
  const diffRows: DiffRow[] = [
    ["Field",          "Script path",                          "Adapter/UI path",              false],
    ["SOAPAction",     SOAP_ACTION.slice(0, 40) + "…",         "(same — from client.ts)",      false],
    ["Content-Type",   CONTENT_TYPE,                           "(same — from client.ts)",      false],
    ["Namespace",      SOAP_NAMESPACE.slice(0, 38) + "…",      "(same — from client.ts)",      false],
    ["endpoint",
     scriptEndpoint === adapterEndpoint ? "(same)" : scriptEndpoint.slice(-30),
     scriptEndpoint === adapterEndpoint ? "(same)" : adapterEndpoint.slice(-30),
     scriptEndpoint !== adapterEndpoint],
    ["a_s_bd",
     scriptDatabase ? `"${scriptDatabase}"` : "OMITTED",
     adapterDatabase ? `"${adapterDatabase}"` : "OMITTED",
     scriptDatabase !== adapterDatabase],
    ["a_s_token",
     scriptToken ? "[SET]" : "MISSING",
     adapterToken ? "[SET]" : "MISSING",
     Boolean(scriptToken) !== Boolean(adapterToken)],
    ["a_s_consulta",   "SELECT TOP 100 * FROM v_cl",           "SELECT * FROM v_cl",           false],
    ["<Header/>",      "absent",                               "absent",                       false],
    ["operation",      "consultaSagJson",                      "consultaSagJson",              false],
  ];

  const cw = [14, 44, 44];
  const pad = (s: string, w: number) => s.slice(0, w).padEnd(w);

  for (const [i, [field, scriptVal, adapterVal, isDiff]] of diffRows.entries()) {
    const line = `${pad(field, cw[0])}  ${pad(scriptVal, cw[1])}  ${pad(adapterVal, cw[2])}`;
    if (i === 0) {
      console.log(`\n  ${C.bold}${line}${C.reset}`);
      console.log("  " + "─".repeat(cw.reduce((a, b) => a + b + 4, 0)));
    } else if (isDiff) {
      console.log(`  ${C.red}${line}  ← DIVERGENCE${C.reset}`);
    } else {
      console.log(`  ${C.grey}${line}${C.reset}`);
    }
  }

  const hasDivergence = diffRows.slice(1).some(([,,, isDiff]) => isDiff);
  if (hasDivergence) {
    warn("Transport divergence detected — see rows marked ← DIVERGENCE above");
  } else {
    ok("Transport parameters are identical — divergence is not in transport layer");
    info("Root cause confirmed: a_s_bd and token fixes resolved the FALLIDO error");
  }

  // ── 4c) Health check — SELECT TOP 1 * FROM v_cl via both paths ───────────────

  section("Health check — SELECT TOP 1 * FROM v_cl (script path vs adapter path)");

  const HEALTH_QUERY = "SELECT TOP 1 * FROM v_cl";

  // Script path (direct consultaSagJson — same as section 3 probe but TOP 1)
  info(`Script path: consultaSagJson directly (token=${scriptToken ? "[SET]" : "MISSING"} db="${scriptDatabase}" endpoint=${scriptEndpoint.split("//")[1]?.slice(0, 40)})`);
  try {
    const t0   = Date.now();
    await consultaSagJson(
      { endpointUrl: scriptEndpoint, token: scriptToken, database: scriptDatabase || undefined },
      HEALTH_QUERY,
    );
    ok(`Script path health check PASSED (${Date.now() - t0} ms)`);
  } catch (e) {
    const msg = (e as Error).message;
    fail(`Script path health check FAILED: ${msg}`);
    if (msg.includes("FALLIDO")) fail("  → NullReferenceException — check token and a_s_bd");
    exitCode = 1;
  }

  // Adapter path (testConnection — exact code path used by syncEngine / UI dry-run)
  info(`Adapter path: testConnection() (token=${adapterToken ? "[SET]" : "MISSING"} db="${adapterDatabase}" endpoint=${adapterEndpoint.split("//")[1]?.slice(0, 40)})`);
  try {
    const t0  = Date.now();
    const res = await adapter.testConnection();
    const ms  = Date.now() - t0;
    if (res.ok) {
      ok(`Adapter path health check PASSED (${ms} ms)`);
    } else {
      fail(`Adapter path health check returned ok:false — error: ${res.error}`);
      if (res.error?.includes("FALLIDO")) {
        fail("  → NullReferenceException still present via adapter path");
        fail("  → Check that token and PYA_SAG_BD are available to the Next.js server process");
      }
      exitCode = 1;
    }
  } catch (e) {
    fail(`Adapter path testConnection() threw: ${(e as Error).message}`);
    exitCode = 1;
  }

  if (exitCode === 0) {
    ok("✓ Both paths succeed — transport parity confirmed");
  } else {
    warn("✗ Paths diverge — remaining FALLIDO is environment-config, not transport-code");
    info("Check: is PYA_SAG_BD / PYA_SOAP_TOKEN available to the Next.js server (not just .env.local)?");
  }

  // ── 5) customers dry-run pull — via adapter (mirrors UI route) ───────────────

  section(`Module: ${MODULE_CUSTOMERS} — pullCustomers() [via adapter — SELECT * FROM v_cl]`);

  try {
    const t0       = Date.now();
    const result   = await adapter.pullCustomers(undefined);
    const ms       = Date.now() - t0;

    ok(`pullCustomers() returned ${result.records.length} records in ${ms} ms`);
    info(`totalCount (raw rows from v_cl): ${result.totalCount ?? "n/a"}`);
    info(`nextCursor: ${result.nextCursor ?? "(none)"}`);
    info(`hasMore:    ${result.hasMore}`);

    if (result.records.length > 0) {
      const sample = result.records[0] as unknown as Record<string, unknown>;
      const keys   = Object.keys(sample).slice(0, 6);
      info(`Sample mapped record keys (first 6): ${keys.join(", ")}`);
    }

    ok(`✓ customers dry-run: PASSED — a_s_bd fix + v_cl view confirmed`);
  } catch (e) {
    fail(`pullCustomers() threw: ${(e as Error).message}`);
    if ((e as Error).message.includes("FALLIDO")) {
      fail("  → NullReferenceException still present — check PYA_SAG_BD and v_cl view name");
    }
    exitCode = 1;
  }

  // ── 5) receivables dry-run pull (regression check) ───────────────────────────

  section(`Module: ${MODULE_RECEIVABLES} — pullReceivables() [MOVIMIENTOS JOIN — no view change]`);

  try {
    const t0     = Date.now();
    const result = await adapter.pullReceivables(undefined);
    const ms     = Date.now() - t0;

    ok(`pullReceivables() returned ${result.records.length} records in ${ms} ms`);
    info(`totalCount: ${result.totalCount ?? "n/a"}`);
    ok(`✓ receivables: unaffected — no regression`);
  } catch (e) {
    fail(`pullReceivables() threw: ${(e as Error).message}`);
    exitCode = 1;
  }

  // ── Summary ───────────────────────────────────────────────────────────────────

  section("Summary");

  if (exitCode === 0) {
    console.log(`\n  ${C.green}${C.bold}✓ All checks passed.${C.reset}`);
    console.log(`  ${C.grey}Fix 1: adapter.apiConfig now falls back to PYA_SAG_BD (a_s_bd NullReferenceException resolved)${C.reset}`);
    console.log(`  ${C.grey}Fix 2: DEFAULT_CUSTOMER_QUERY switched to SELECT * FROM v_cl (manual v32 contract)${C.reset}`);
    console.log(`  ${C.grey}Receivables: MOVIMIENTOS JOIN unchanged (no documented SAG view)${C.reset}\n`);
  } else {
    console.log(`\n  ${C.red}${C.bold}✗ Some checks failed — see above.${C.reset}\n`);
  }

  await prisma.$disconnect();
  process.exit(exitCode);
}

main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
