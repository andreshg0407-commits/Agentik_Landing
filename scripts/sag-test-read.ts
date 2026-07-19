/**
 * scripts/sag-test-read.ts
 *
 * Phase 2 + Phase 3 + Phase 4 — SAG read validation (homologation).
 *
 * Phase 2: Print homologation summary from castillitos-overrides.ts.
 * Phase 3: Fetch TOP 20 rows from TERCEROS (customers). Save sample.
 * Phase 4: Fetch TOP 20 rows from MOVIMIENTOS (receivables/documents).
 *          NOTE: CARTERA does not exist in this SAG installation.
 *          MOVIMIENTOS is the confirmed receivables/document table (2026-04-08).
 * Phase 4b: Fetch TOP 5 from ARTICULOS, BODEGAS, ZONAS, VENDEDORES (reference).
 * Gate:    Check write-preview readiness (≥3 confirmed value sets).
 *
 * All queries are SELECT-only. Zero SAG writes. Zero DB writes.
 * Samples are saved to scripts/samples/ for future field-mapping reference.
 *
 * SECURITY: Token is never printed. maskToken() emits only "[SET]".
 *
 * Usage:
 *   npx tsx scripts/sag-test-read.ts
 *   PYA_DEBUG=true npx tsx scripts/sag-test-read.ts
 *   npx tsx scripts/sag-test-read.ts --skip-save
 *
 * Prerequisites:
 *   Phase 0 + Phase 1 must pass (sag-test-connection.ts)
 */

import * as dotenv from "dotenv";
import * as path   from "path";
import * as fs     from "fs";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

import { loadSagHomologEnv, maskToken } from "../lib/sag/env";
import { sagInfo, sagError, serializeSagError } from "../lib/sag/logger";
import { consultaSagJson } from "../lib/connectors/pya/client";
import type { SagRows }    from "../lib/connectors/pya/types";
import {
  getHomologationSummary,
  ALL_VALUE_SETS,
}                          from "../lib/sag/master-data/castillitos-overrides";

// ── CLI flags ─────────────────────────────────────────────────────────────────

const SKIP_SAVE = process.argv.includes("--skip-save");

// ── Colour helpers ─────────────────────────────────────────────────────────────

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
function warn(msg: string) { console.log(`  ${C.yellow}⚠${C.reset} ${msg}`); }
function fail(msg: string) { console.log(`  ${C.red}✗${C.reset} ${msg}`); }
function info(msg: string) { console.log(`  ${C.grey}·${C.reset} ${msg}`); }

function section(title: string) {
  console.log(`\n${C.bold}${C.cyan}── ${title}${C.reset}`);
}

// ── Sample saver ──────────────────────────────────────────────────────────────

function saveSample(name: string, rows: SagRows): void {
  if (SKIP_SAVE) {
    info(`(--skip-save) skipping ${name}.json`);
    return;
  }

  const samplesDir = path.resolve(__dirname, "samples");
  if (!fs.existsSync(samplesDir)) {
    fs.mkdirSync(samplesDir, { recursive: true });
  }

  const filePath = path.join(samplesDir, `${name}.json`);
  fs.writeFileSync(
    filePath,
    JSON.stringify({ capturedAt: new Date().toISOString(), rows }, null, 2),
    "utf-8",
  );
  ok(`Sample saved → scripts/samples/${name}.json (${rows.length} rows)`);
}

// ── Field summary ─────────────────────────────────────────────────────────────

function printFieldSummary(label: string, rows: SagRows): void {
  if (rows.length === 0) {
    warn(`${label}: 0 rows — no fields to show`);
    return;
  }
  const fields = Object.keys(rows[0]);
  info(`${label} — ${fields.length} fields: ${fields.join(", ")}`);
}

// ── Module runner ─────────────────────────────────────────────────────────────

async function runQuery(
  pyaConfig: Parameters<typeof consultaSagJson>[0],
  label: string,
  query: string,
  sampleName: string,
): Promise<{ rows: SagRows; ok: boolean }> {
  info(`Query: ${query}`);
  const t = Date.now();
  try {
    const rows = await consultaSagJson(pyaConfig, query);
    const ms = Date.now() - t;
    ok(`${label}: ${rows.length} row(s) (ms: ${ms})`);
    printFieldSummary(label, rows);
    saveSample(sampleName, rows);
    sagInfo("sync:module:ok", { module: label, ms, rows: { imported: rows.length } });
    return { rows, ok: true };
  } catch (err) {
    const ms = Date.now() - t;
    fail(`${label} failed (ms: ${ms}): ${err instanceof Error ? err.message : String(err)}`);
    sagError("sync:module:fail", serializeSagError(err, { module: label, ms }));
    return { rows: [], ok: false };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let exitCode = 0;

  console.log(`\n${C.bold}SAG Read Test${C.reset} — Castillitos`);
  console.log(C.grey + new Date().toISOString() + C.reset);

  let env: ReturnType<typeof loadSagHomologEnv>;
  try {
    env = loadSagHomologEnv();
    info(`SAG_TEST_TOKEN: ${maskToken(env.token)}`);
    info(`SAG_TEST_DB:    ${env.database}`);
    info(`Endpoint:       ${env.endpointUrl}`);
  } catch (err) {
    fail(`Environment error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const pyaConfig = { token: env.token, endpointUrl: env.endpointUrl, database: env.database };

  // ── Phase 2: Homologation summary ─────────────────────────────────────────

  section("Phase 2 — Homologation Summary");

  const summary = getHomologationSummary();
  info(`Total value sets: ${summary.total}`);

  if (summary.confirmed === 0) {
    warn(`Confirmed: ${summary.confirmed} / ${summary.total} (${summary.pctComplete}%)`);
  } else {
    ok(`Confirmed: ${summary.confirmed} / ${summary.total} (${summary.pctComplete}%)`);
  }

  if (summary.pendingNames.length > 0) {
    info(`Pending: ${summary.pendingNames.join(", ")}`);
  }

  for (const [name, vs] of Object.entries(ALL_VALUE_SETS)) {
    const status = vs.confirmed
      ? `${C.green}✓ confirmed${C.reset}`
      : `${C.yellow}⬜ pending${C.reset}`;
    const vals = vs.values.length > 0
      ? `[${vs.values.slice(0, 5).join(", ")}${vs.values.length > 5 ? "…" : ""}]`
      : "[]";
    console.log(`    ${status}  ${name.padEnd(18)} ${C.grey}${vals}${C.reset}`);
  }

  sagInfo("homolog:summary", { message: "homologation summary", confirmed: summary.confirmed, pending: summary.pending });

  // ── Phase 3: TERCEROS (customers) ─────────────────────────────────────────

  section("Phase 3 — TERCEROS (Customers)");

  const { rows: tercerosRows, ok: tercerosOk } = await runQuery(
    pyaConfig, "TERCEROS", "SELECT TOP 20 * FROM TERCEROS", "terceros-top20",
  );
  if (!tercerosOk) exitCode = 1;

  // ── Phase 4: MOVIMIENTOS (receivables/documents) ───────────────────────────

  section("Phase 4 — MOVIMIENTOS (Receivables / Documents)");

  info("CARTERA not found in this installation — using MOVIMIENTOS (confirmed 2026-04-08)");

  const { rows: movRows, ok: movOk } = await runQuery(
    pyaConfig,
    "MOVIMIENTOS",
    "SELECT TOP 20 * FROM MOVIMIENTOS WHERE sc_anulado = 'N'",
    "movimientos-top20",
  );
  if (!movOk) exitCode = 1;

  // ── Phase 4b: Reference tables ────────────────────────────────────────────

  section("Phase 4b — Reference Tables (ARTICULOS, BODEGAS, ZONAS, VENDEDORES)");

  await runQuery(pyaConfig, "ARTICULOS",  "SELECT TOP 5 * FROM ARTICULOS",  "articulos-top5");
  await runQuery(pyaConfig, "BODEGAS",    "SELECT TOP 5 * FROM BODEGAS",    "bodegas-top5");
  await runQuery(pyaConfig, "ZONAS",      "SELECT TOP 5 * FROM ZONAS",      "zonas-top5");
  await runQuery(pyaConfig, "VENDEDORES", "SELECT TOP 5 * FROM VENDEDORES", "vendedores-top5");

  // ── Write-preview gate ────────────────────────────────────────────────────

  section("Write-Preview Gate");

  const THRESHOLD = 3;
  if (summary.confirmed >= THRESHOLD) {
    ok(`Gate OPEN — ${summary.confirmed} confirmed value sets (need ≥${THRESHOLD})`);
  } else {
    warn(`Gate CLOSED — ${summary.confirmed} / ${THRESHOLD} confirmed value sets`);
    warn("Populate castillitos-overrides.ts with confirmed values before proceeding to Phase 5");
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  section("Summary");

  const results = [
    { name: "TERCEROS",    ok: tercerosOk, rows: tercerosRows.length },
    { name: "MOVIMIENTOS", ok: movOk,      rows: movRows.length },
  ];

  for (const r of results) {
    const icon = r.ok ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
    console.log(`  ${icon} ${r.name}: ${r.rows} row(s)`);
  }

  console.log();

  if (exitCode === 0) {
    ok("Phase 2–4 complete");
    if (!SKIP_SAVE) info("Samples saved to scripts/samples/");
    console.log(`\n  ${C.green}${C.bold}Read validation complete.${C.reset}`);
    console.log(`  ${C.yellow}Next: populate castillitos-overrides.ts with discovered values, then re-run.${C.reset}\n`);
  } else {
    fail("One or more read queries failed");
    console.log(`\n  ${C.red}${C.bold}Fix SOAP errors before proceeding.${C.reset}\n`);
  }

  process.exit(exitCode);
}

main().catch(err => {
  console.error(`\n${C.red}Unhandled error:${C.reset}`, err);
  process.exit(1);
});
