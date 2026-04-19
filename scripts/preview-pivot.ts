/**
 * CLI preview for pivot-style Castillitos reports — no DB writes.
 *
 * Usage:
 *   npx tsx scripts/preview-pivot.ts <path-to-file> [--seller "JUAN GARCIA"] [--canal tienda]
 *
 * Accepts .xlsx, .xls, .ods, .csv
 */

import * as fs   from "fs";
import * as path from "path";
import { parsePivotCsv, parsePivotXlsx } from "../lib/sales/pivot-parser";
import { parseColombianAmount }           from "../lib/sales/normalize";

// ── CLI args ──────────────────────────────────────────────────────────────────

const args         = process.argv.slice(2);
const filePath     = args.find(a => !a.startsWith("--"));
const sellerIdx    = args.indexOf("--seller");
const canalIdx     = args.indexOf("--canal");
const sellerOverride = sellerIdx !== -1 ? args[sellerIdx + 1] : undefined;
const defaultCanal   = canalIdx  !== -1 ? args[canalIdx  + 1] : "tienda";

if (!filePath) {
  console.error("Usage: npx tsx scripts/preview-pivot.ts <file> [--seller NAME] [--canal tienda]");
  process.exit(1);
}

// ── Parse ─────────────────────────────────────────────────────────────────────

const absPath  = path.resolve(filePath);
const isXlsx   = /\.(xlsx|xls|ods)$/i.test(absPath);

const result = isXlsx
  ? parsePivotXlsx(fs.readFileSync(absPath), { sellerOverride, defaultCanal })
  : parsePivotCsv(fs.readFileSync(absPath, "utf-8"), { sellerOverride, defaultCanal });

// ── Output ────────────────────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════════════");
console.log("  PIVOT PREVIEW");
console.log(`  File   : ${path.basename(absPath)}`);
console.log(`  Seller : ${result.seller}`);
console.log("═══════════════════════════════════════════════════════════\n");

if (result.warnings.length > 0) {
  console.log("── Warnings ─────────────────────────────────────────────────");
  result.warnings.forEach(w => console.log(`  ⚠  ${w}`));
  console.log();
}

console.log("── Structure detected ───────────────────────────────────────");
console.log(`  Column header row : ${result.colHeaderRowIdx}`);
console.log(`  Lines detected    : ${result.linesDetected.join(" | ") || "(none)"}`);
console.log(`  Raw data rows     : ${result.totalRawRows}`);
console.log(`  Produced flat rows: ${result.producedRows}`);
console.log(`  Skipped rows      : ${result.skippedRows}`);
console.log();

if (result.rows.length === 0) {
  console.log("  ✗ No rows produced. Check warnings above.\n");
  process.exit(1);
}

// Period distribution
const periodMap: Record<string, number> = {};
for (const r of result.rows) {
  const p = r.periodo_ao_mes ?? "unknown";
  periodMap[p] = (periodMap[p] ?? 0) + 1;
}
console.log("── Periods found ────────────────────────────────────────────");
for (const [p, cnt] of Object.entries(periodMap).sort()) {
  console.log(`  ${p}  ${cnt} rows`);
}
console.log();

// Line distribution
const lineMap: Record<string, { rows: number; total: number }> = {};
for (const r of result.rows) {
  const l = r.linea;
  if (!lineMap[l]) lineMap[l] = { rows: 0, total: 0 };
  lineMap[l].rows++;
  try { lineMap[l].total += parseColombianAmount(r.valor); } catch { /* skip */ }
}
console.log("── Line totals ──────────────────────────────────────────────");
for (const [l, v] of Object.entries(lineMap)) {
  console.log(`  ${l.padEnd(20)} ${String(v.rows).padStart(5)} rows   ${fmtCOP(v.total)}`);
}
console.log();

// First 10 rows
console.log("── First 10 flat rows ───────────────────────────────────────");
console.log(
  "  #".padEnd(5),
  "DATE".padEnd(12),
  "LINE".padEnd(20),
  "VALOR".padStart(16),
  "QTY".padStart(6),
  "CLIENTE"
);
console.log("  " + "─".repeat(80));
for (let i = 0; i < Math.min(10, result.rows.length); i++) {
  const r = result.rows[i];
  console.log(
    `  ${String(i+1).padEnd(4)}`,
    String(r.fecha).padEnd(12),
    String(r.linea).slice(0,19).padEnd(20),
    String(r.valor).padStart(16),
    String(r.unidades ?? "—").padStart(6),
    String(r.nombre_cliente ?? "").slice(0, 25)
  );
}
console.log();

console.log("── What to verify ───────────────────────────────────────────");
console.log("  1. Lines detected match your Excel column groups.");
console.log("  2. Seller name is correct (use --seller to override).");
console.log("  3. Row counts match Excel data rows (minus headers/subtotals).");
console.log("  4. Valor amounts look right (check for COP format parsing).");
console.log("  5. Periods match the file's date range.");
console.log("  6. If lines show as 'SIN LÍNEA', the line-group row is not");
console.log("     being detected — check that VALOR/CANTIDAD are in the");
console.log("     row immediately below the line group names.\n");

function fmtCOP(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}
