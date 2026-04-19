/**
 * scripts/sag-test-items.ts
 *
 * Phase 5 prep — MOVIMIENTOS_ITEMS field discovery + aggregate query validation.
 *
 * Objectives:
 *   A. Discover MOVIMIENTOS_ITEMS field names and value ranges.
 *   B. Validate GROUP BY aggregate query (SUM per ka_nl_movimiento).
 *   C. Validate a single-pass JOIN query (MOVIMIENTOS + items aggregate).
 *   D. Probe for paidAmount / balance signals (RECIBOS, ANTICIPOS, PAGOS tables).
 *   E. Save all samples to scripts/samples/ for mapper reference.
 *
 * All queries are SELECT-only. Zero SAG writes. Zero DB writes.
 * Token is never printed — maskToken() emits only "[SET]".
 *
 * Usage:
 *   npx tsx scripts/sag-test-items.ts
 *   PYA_DEBUG=true npx tsx scripts/sag-test-items.ts
 *   npx tsx scripts/sag-test-items.ts --skip-save
 */

import * as dotenv from "dotenv";
import * as path   from "path";
import * as fs     from "fs";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

import { loadSagHomologEnv, maskToken } from "../lib/sag/env";
import { sagInfo, sagError, serializeSagError } from "../lib/sag/logger";
import { consultaSagJson } from "../lib/connectors/pya/client";
import type { SagRows } from "../lib/connectors/pya/types";

// ── CLI flags ──────────────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function saveSample(name: string, rows: SagRows): void {
  if (SKIP_SAVE) {
    info(`(--skip-save) skipping ${name}.json`);
    return;
  }
  const samplesDir = path.resolve(__dirname, "samples");
  if (!fs.existsSync(samplesDir)) fs.mkdirSync(samplesDir, { recursive: true });
  const filePath = path.join(samplesDir, `${name}.json`);
  fs.writeFileSync(
    filePath,
    JSON.stringify({ capturedAt: new Date().toISOString(), rows }, null, 2),
    "utf-8",
  );
  ok(`Saved → scripts/samples/${name}.json (${rows.length} rows)`);
}

function printFields(label: string, rows: SagRows): void {
  if (rows.length === 0) { warn(`${label}: 0 rows`); return; }
  const fields = Object.keys(rows[0] as object);
  info(`${label} — ${fields.length} fields: ${fields.join(", ")}`);
}

function printSample(label: string, rows: SagRows, limit = 3): void {
  if (rows.length === 0) return;
  info(`${label} — first ${Math.min(limit, rows.length)} row(s):`);
  rows.slice(0, limit).forEach((r, i) => {
    const relevant = Object.fromEntries(
      Object.entries(r as object).filter(([, v]) => v !== null && v !== "" && v !== 0)
    );
    console.log(`    [${i}]`, JSON.stringify(relevant));
  });
}

async function tryQuery(
  pyaConfig: Parameters<typeof consultaSagJson>[0],
  label: string,
  query: string,
  sampleName?: string,
): Promise<{ rows: SagRows; ok: boolean }> {
  info(`Query: ${query}`);
  const t = Date.now();
  try {
    const rows = await consultaSagJson(pyaConfig, query);
    const ms = Date.now() - t;
    ok(`${label}: ${rows.length} row(s) (${ms} ms)`);
    printFields(label, rows);
    printSample(label, rows);
    if (sampleName) saveSample(sampleName, rows);
    sagInfo("sync:module:ok", { module: label, ms, rows: { imported: rows.length } });
    return { rows, ok: true };
  } catch (err) {
    const ms = Date.now() - t;
    fail(`${label} failed (${ms} ms): ${err instanceof Error ? err.message : String(err)}`);
    sagError("sync:module:fail", serializeSagError(err, { module: label, ms }));
    return { rows: [], ok: false };
  }
}

// ── Amount analysis helpers ────────────────────────────────────────────────────

function analyzeAmounts(label: string, rows: SagRows): void {
  if (rows.length === 0) return;

  const first = rows[0] as Record<string, unknown>;
  const fields = Object.keys(first);

  // Look for numeric amount-like fields
  const amountFields = fields.filter(f => {
    const v = first[f];
    return typeof v === "number" && !["ka_nl_movimiento", "ka_ni_fuente"].includes(f);
  });

  if (amountFields.length > 0) {
    info(`${label} — numeric fields: ${amountFields.join(", ")}`);

    // Print totals across all rows for context
    const totals: Record<string, number> = {};
    for (const row of rows as Record<string, unknown>[]) {
      for (const f of amountFields) {
        totals[f] = (totals[f] ?? 0) + (typeof row[f] === "number" ? (row[f] as number) : 0);
      }
    }
    info(`${label} — sums: ${JSON.stringify(totals)}`);
  } else {
    warn(`${label} — no numeric amount fields found in first row`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let exitCode = 0;

  console.log(`\n${C.bold}SAG Items Test${C.reset} — MOVIMIENTOS_ITEMS discovery`);
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

  const pyaConfig = {
    token:       env.token,
    endpointUrl: env.endpointUrl,
    database:    env.database,
  };

  // ── A. MOVIMIENTOS_ITEMS schema ────────────────────────────────────────────

  section("A — MOVIMIENTOS_ITEMS: field discovery (TOP 5)");

  const { rows: itemsRows, ok: itemsOk } = await tryQuery(
    pyaConfig,
    "MOVIMIENTOS_ITEMS TOP5",
    "SELECT TOP 5 * FROM MOVIMIENTOS_ITEMS",
    "movimientos-items-top5",
  );
  if (!itemsOk) exitCode = 1;

  if (itemsOk && itemsRows.length > 0) {
    analyzeAmounts("MOVIMIENTOS_ITEMS", itemsRows);
  }

  // ── B. Aggregate: SUM per ka_nl_movimiento ─────────────────────────────────

  section("B — Aggregate: SUM(n_valor, n_iva, n_descuento) GROUP BY ka_nl_movimiento (TOP 20)");

  const aggregateQuery =
    "SELECT TOP 20 ka_nl_movimiento, " +
    "SUM(n_valor) AS total_valor, " +
    "SUM(n_iva) AS total_iva, " +
    "SUM(n_descuento) AS total_descuento " +
    "FROM MOVIMIENTOS_ITEMS " +
    "GROUP BY ka_nl_movimiento " +
    "ORDER BY ka_nl_movimiento";

  const { rows: aggRows, ok: aggOk } = await tryQuery(
    pyaConfig,
    "ITEMS_AGGREGATE",
    aggregateQuery,
    "movimientos-items-aggregate-top20",
  );
  if (!aggOk) exitCode = 1;

  // ── C. JOIN: MOVIMIENTOS + items aggregate in one query ───────────────────

  section("C — JOIN: MOVIMIENTOS + items aggregate (TOP 20 documents)");

  // Try a JOIN with GROUP BY — SAG SQL engine may or may not support this.
  // If it fails, two-pass client-side merge is the fallback.
  const joinQuery =
    "SELECT TOP 20 " +
    "m.ka_nl_movimiento, m.ka_ni_fuente, m.n_numero_documento, " +
    "m.ka_nl_tercero, m.sc_beneficiario, m.d_fecha_documento, " +
    "m.ss_moneda, m.ddt_fecha_new, " +
    "SUM(ISNULL(mi.n_valor, 0)) AS total_valor, " +
    "SUM(ISNULL(mi.n_iva, 0)) AS total_iva, " +
    "SUM(ISNULL(mi.n_descuento, 0)) AS total_descuento " +
    "FROM MOVIMIENTOS m " +
    "LEFT JOIN MOVIMIENTOS_ITEMS mi ON mi.ka_nl_movimiento = m.ka_nl_movimiento " +
    "WHERE m.sc_anulado = 'N' " +
    "GROUP BY m.ka_nl_movimiento, m.ka_ni_fuente, m.n_numero_documento, " +
    "m.ka_nl_tercero, m.sc_beneficiario, m.d_fecha_documento, " +
    "m.ss_moneda, m.ddt_fecha_new " +
    "ORDER BY m.ka_nl_movimiento";

  const { rows: joinRows, ok: joinOk } = await tryQuery(
    pyaConfig,
    "MOVIMIENTOS_JOIN_ITEMS",
    joinQuery,
    "movimientos-with-amounts-top20",
  );
  if (!joinOk) {
    warn("JOIN query failed — will use two-pass client-side merge as fallback");
    exitCode = 1;
  }

  // ── D. paidAmount probe — RECIBOS / PAGOS tables ──────────────────────────

  section("D — paidAmount probe: RECIBOS, PAGOS tables");

  await tryQuery(pyaConfig, "RECIBOS", "SELECT TOP 5 * FROM RECIBOS", "recibos-top5");
  await tryQuery(pyaConfig, "PAGOS",   "SELECT TOP 5 * FROM PAGOS",   "pagos-top5");

  // Also probe ANTICIPOS and ABONOS as they appear in some SAG installations
  await tryQuery(pyaConfig, "ANTICIPOS", "SELECT TOP 5 * FROM ANTICIPOS", "anticipos-top5");
  await tryQuery(pyaConfig, "ABONOS",    "SELECT TOP 5 * FROM ABONOS",    "abonos-top5");

  // ── E. Summary ────────────────────────────────────────────────────────────

  section("Summary");

  const checks = [
    { name: "MOVIMIENTOS_ITEMS schema",    ok: itemsOk },
    { name: "Items aggregate (GROUP BY)",  ok: aggOk   },
    { name: "JOIN query (single-pass)",    ok: joinOk  },
  ];

  for (const c of checks) {
    const icon = c.ok ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
    console.log(`  ${icon} ${c.name}`);
  }

  if (joinOk && joinRows.length > 0) {
    ok("Single-pass JOIN supported — adapter can use one SOAP call per sync");
    const sample = joinRows[0] as Record<string, unknown>;
    const totalValor    = sample["total_valor"]    ?? "?";
    const totalIva      = sample["total_iva"]      ?? "?";
    const totalDescuento = sample["total_descuento"] ?? "?";
    info(`First row amounts: total_valor=${totalValor}, total_iva=${totalIva}, total_descuento=${totalDescuento}`);
  } else if (aggOk) {
    warn("JOIN failed but aggregate works — will use two-pass merge (two SOAP calls per sync)");
  } else {
    fail("Both JOIN and aggregate failed — check MOVIMIENTOS_ITEMS table name");
  }

  console.log();
  if (exitCode === 0) {
    ok("Phase 5 prep complete");
    if (!SKIP_SAVE) info("Samples saved to scripts/samples/");
    console.log(`\n  ${C.green}${C.bold}Items discovery complete.${C.reset}`);
    console.log(`  ${C.yellow}Next: update pullReceivables() to use JOIN or two-pass merge.${C.reset}\n`);
  } else {
    warn("Some queries failed — check samples and adjust query strategy");
    console.log(`\n  ${C.yellow}${C.bold}Review failures above before updating adapter.${C.reset}\n`);
  }

  process.exit(exitCode);
}

main().catch(err => {
  console.error(`\n${C.red}Unhandled error:${C.reset}`, err);
  process.exit(1);
});
