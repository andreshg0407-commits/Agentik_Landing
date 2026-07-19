/**
 * Dry-run CSV preview — NO database writes.
 *
 * Usage:
 *   npx tsx scripts/preview-csv.ts <path-to-csv> [--grain TRANSACTION|AGGREGATED]
 *
 * What it shows:
 *   - Column headers detected
 *   - Total raw rows parsed
 *   - Grain used (from flag, or auto-detected)
 *   - scopeKey that the import service would derive
 *   - Normalization results: ok / warn / error counts
 *   - Amount distribution (min, max, total, unique count)
 *   - Channels detected with counts
 *   - First 10 normalized rows (human-readable)
 *   - All parse errors with row numbers
 */

import * as fs   from "fs";
import * as path from "path";
import Papa      from "papaparse";
import { SaleGrain, SaleScopeType } from "@prisma/client";
import { normalizeRows }            from "../lib/sales/normalize";
import { deriveScopeKey }           from "../lib/sales/scope";
import type { RawSagRow }           from "../lib/sales/types";

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const filePath = args.find(a => !a.startsWith("--"));
const grainArg = args[args.indexOf("--grain") + 1] as string | undefined;

if (!filePath) {
  console.error("Usage: npx tsx scripts/preview-csv.ts <path-to-csv> [--grain TRANSACTION|AGGREGATED]");
  process.exit(1);
}

const grain: SaleGrain =
  grainArg === "AGGREGATED" ? SaleGrain.AGGREGATED : SaleGrain.TRANSACTION;

// ── Read + parse CSV ──────────────────────────────────────────────────────────

const csvText = fs.readFileSync(path.resolve(filePath), "utf-8");
const parsed  = Papa.parse<Record<string, string>>(csvText, {
  header:          true,
  skipEmptyLines:  true,
  transformHeader: h => h.trim().toLowerCase().replace(/\s+/g, "_"),
});

const rows = parsed.data as unknown as RawSagRow[];

// ── Header check ──────────────────────────────────────────────────────────────

const REQUIRED_COLS = ["fecha", "vendedor", "tienda", "linea", "canal", "valor"];
const headers       = Object.keys(rows[0] ?? {});
const missing       = REQUIRED_COLS.filter(c => !headers.includes(c));

console.log("\n═══════════════════════════════════════════════════════════");
console.log("  SAG CSV PREVIEW");
console.log(`  File : ${path.basename(filePath)}`);
console.log(`  Grain: ${grain}`);
console.log("═══════════════════════════════════════════════════════════\n");

console.log("── Columns detected ─────────────────────────────────────────");
console.log("  ", headers.join(", "));
if (missing.length > 0) {
  console.log("\n  ⚠  MISSING required columns:", missing.join(", "));
  console.log("     Import will fail for every row missing these fields.\n");
} else {
  console.log("  ✓  All required columns present.\n");
}

if (parsed.errors.length > 0) {
  console.log("── CSV parse warnings ───────────────────────────────────────");
  parsed.errors.slice(0, 10).forEach(e => console.log(`  row ${e.row}: ${e.message}`));
  console.log();
}

// ── Normalize ─────────────────────────────────────────────────────────────────

const { ok, errors } = normalizeRows(rows, "PREVIEW", grain);

// ── ScopeKey derivation ───────────────────────────────────────────────────────

let scopeKey = "(could not derive)";
try {
  scopeKey = deriveScopeKey(rows, SaleScopeType.MONTH);
} catch {
  try {
    scopeKey = deriveScopeKey(rows, SaleScopeType.RANGE) + "  ← multiple periods, use RANGE scope";
  } catch {
    scopeKey = "(no periodo_ao_mes found — will use date range)";
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

const warnCount  = errors.filter(e => e.severity === "warn").length;
const errorCount = errors.filter(e => e.severity === "error").length;

console.log("── Import summary ───────────────────────────────────────────");
console.log(`  Raw rows parsed : ${rows.length}`);
console.log(`  Normalized (ok) : ${ok.length}`);
console.log(`  Skipped (dups)  : ${warnCount}`);
console.log(`  Errors          : ${errorCount}`);
console.log(`  scopeKey        : ${scopeKey}`);
console.log();

// ── Amount distribution ───────────────────────────────────────────────────────

if (ok.length > 0) {
  const amounts   = ok.map(r => r.amount);
  const total     = amounts.reduce((s, a) => s + a, 0);
  const minAmt    = Math.min(...amounts);
  const maxAmt    = Math.max(...amounts);
  const negCount  = amounts.filter(a => a < 0).length;
  const zeroCount = amounts.filter(a => a === 0).length;

  console.log("── Amount distribution ──────────────────────────────────────");
  console.log(`  Total   : ${fmtCOP(total)}`);
  console.log(`  Min     : ${fmtCOP(minAmt)}`);
  console.log(`  Max     : ${fmtCOP(maxAmt)}`);
  console.log(`  Avg     : ${fmtCOP(total / ok.length)}`);
  if (negCount  > 0) console.log(`  ⚠ Negative amounts : ${negCount} rows`);
  if (zeroCount > 0) console.log(`  ⚠ Zero amounts     : ${zeroCount} rows`);
  console.log();

  // ── Channel distribution ──────────────────────────────────────────────────
  const channelCounts: Record<string, number> = {};
  for (const r of ok) {
    channelCounts[r.channel] = (channelCounts[r.channel] ?? 0) + 1;
  }
  const rawChannels = [...new Set(rows.map(r => (r.canal ?? "").toLowerCase().trim()))];
  const unmapped = rawChannels.filter(c => c && !Object.keys(channelCounts).length); // simplified

  console.log("── Channels detected ────────────────────────────────────────");
  for (const [ch, cnt] of Object.entries(channelCounts).sort((a,b) => b[1] - a[1])) {
    console.log(`  ${ch.padEnd(14)} ${cnt} rows`);
  }
  // Warn on raw channel values that mapped to OTRO
  const otroRows = ok.filter(r => r.channel === "OTRO");
  if (otroRows.length > 0) {
    const rawVals = [...new Set(rows
      .filter((_, i) => ok[i]?.channel === "OTRO")
      .map(r => r.canal)
    )].slice(0, 5);
    console.log(`  ⚠ OTRO (unmapped): ${otroRows.length} rows — raw values: ${rawVals.join(", ")}`);
  }
  console.log();

  // ── Periods found ─────────────────────────────────────────────────────────
  const periods = [...new Set(ok.map(r => r.periodoAoMes ?? r.saleDate.toISOString().slice(0,7).replace("-","")))]
    .sort();
  console.log("── Periods found ────────────────────────────────────────────");
  for (const p of periods) {
    const periodRows = ok.filter(r =>
      (r.periodoAoMes ?? r.saleDate.toISOString().slice(0,7).replace("-","")) === p
    );
    const periodTotal = periodRows.reduce((s,r) => s + r.amount, 0);
    console.log(`  ${p}  ${String(periodRows.length).padStart(5)} rows   ${fmtCOP(periodTotal)}`);
  }
  console.log();

  // ── First 10 normalized rows ──────────────────────────────────────────────
  console.log("── First 10 normalized rows ─────────────────────────────────");
  console.log(
    "  #".padEnd(5),
    "DATE".padEnd(12),
    "SELLER".padEnd(20),
    "STORE".padEnd(18),
    "LINE".padEnd(14),
    "CHANNEL".padEnd(14),
    "AMOUNT".padStart(14),
    "TXCOUNT".padStart(8)
  );
  console.log("  " + "─".repeat(104));
  for (let i = 0; i < Math.min(10, ok.length); i++) {
    const r = ok[i];
    console.log(
      `  ${String(i + 1).padEnd(4)}`,
      r.saleDate.toISOString().slice(0,10).padEnd(12),
      truncate(r.sellerName, 19).padEnd(20),
      truncate(r.storeName,  17).padEnd(18),
      truncate(r.productLine,13).padEnd(14),
      r.channel.padEnd(14),
      fmtCOP(r.amount).padStart(14),
      String(r.txCount ?? "—").padStart(8)
    );
  }
  console.log();
}

// ── Parse errors ──────────────────────────────────────────────────────────────

if (errors.length > 0) {
  console.log("── Parse errors / warnings ──────────────────────────────────");
  for (const e of errors.slice(0, 30)) {
    const tag = e.severity === "error" ? "ERR " : "WARN";
    console.log(`  [${tag}] row ${e.rowIndex}: ${e.error}`);
    if (e.severity === "error") {
      const raw = e.row as Record<string, unknown>;
      console.log(`         fecha=${raw.fecha}  valor=${raw.valor}  canal=${raw.canal}`);
    }
  }
  if (errors.length > 30) {
    console.log(`  … and ${errors.length - 30} more`);
  }
  console.log();
}

// ── Validation checklist ──────────────────────────────────────────────────────

console.log("── What to verify against your Excel ───────────────────────");
console.log("  1. Total amount matches your Excel grand total for the period.");
console.log("  2. Row count matches (after deducting header/footer rows).");
console.log("  3. Channel mapping: check OTRO rows — add missing channels to");
console.log("     lib/sales/normalize.ts CHANNEL_MAP if needed.");
console.log("  4. Amount format: if min or max looks wrong, check for COP/USD mix.");
console.log("  5. Periods: if multiple periods found and you expected one month,");
console.log("     use --grain AGGREGATED or split the file before importing.");
console.log("  6. Seller names: slugs must be stable across exports. If SAG");
console.log("     uses codes sometimes and names other times, natural key will");
console.log("     differ — normalise in the source or add a seller alias table.");
console.log();

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 1) + "…" : s;
}
