/**
 * Quick smoke-test for parseColombianAmount and normalizeRow.
 * Run with:  npx tsx scripts/test-sales-normalize.ts
 */

import { parseColombianAmount, normalizeRow, normalizeRows } from "../lib/sales/normalize";
import { SaleGrain } from "@prisma/client";
import type { RawSagRow } from "../lib/sales/types";

// ── Amount parser tests ───────────────────────────────────────────────────────

const AMOUNT_CASES: [string | number, number][] = [
  // Colombian thousands + decimal
  ["1.250.000",       1_250_000],
  ["1.250.000,50",    1_250_000.5],
  ["1.250.000,00",    1_250_000],
  // With currency symbol
  ["$1.250.000",      1_250_000],
  ["COP 1.250.000",   1_250_000],
  // US format
  ["1,250,000",       1_250_000],
  ["1,250,000.50",    1_250_000.5],
  // Small decimals (NOT thousands)
  ["1.5",             1.5],
  ["0.75",            0.75],
  // Three digits after single dot → thousands
  ["1.250",           1_250],
  ["10.000",          10_000],
  // Non-three digits after single dot → decimal
  ["1.50",            1.5],
  ["1.5000",          1.5],
  // Plain integer
  ["1250000",         1_250_000],
  ["0",               0],
  ["",                0],
  // Already a number
  [1_250_000,         1_250_000],
  [0,                 0],
];

let passed = 0;
let failed = 0;

console.log("\n── parseColombianAmount ────────────────────────────────────────");
for (const [input, expected] of AMOUNT_CASES) {
  let got: number;
  let err = "";
  try {
    got = parseColombianAmount(input as string);
  } catch (e) {
    got = NaN;
    err = (e as Error).message;
  }
  const ok = Math.abs((got ?? NaN) - expected) < 0.0001;
  const symbol = ok ? "✓" : "✗";
  if (ok) passed++; else failed++;
  const label = JSON.stringify(input).padEnd(20);
  console.log(`  ${symbol}  ${label}  →  ${got ?? "ERR"}  (expected ${expected})${err ? "  ERR: " + err : ""}`);
}

// ── normalizeRow smoke test ───────────────────────────────────────────────────

console.log("\n── normalizeRow (TRANSACTION) ──────────────────────────────────");

const sampleTxn: RawSagRow = {
  fecha:           "15/03/2024",
  vendedor:        "María García",
  tienda:          "Tienda Norte",
  linea:           "Calzado",
  canal:           "tienda",
  valor:           "1.250.000",
  marca:           "Nike",
  zona:            "Bogotá",
  cod_comprobante: "FV",
  comprobante:     "FV-001234",
  nit_cliente:     "900123456",
  nombre_cliente:  "Empresa XYZ",
  unidades:        "2",
};

try {
  const norm = normalizeRow(sampleTxn, "org-test", SaleGrain.TRANSACTION);
  console.log("  saleDate:     ", norm.saleDate.toISOString());
  console.log("  amount:       ", norm.amount);
  console.log("  sellerSlug:   ", norm.sellerSlug);
  console.log("  storeSlug:    ", norm.storeSlug);
  console.log("  channel:      ", norm.channel);
  console.log("  txCount:      ", norm.txCount, " (should be 1)");
  console.log("  naturalKey:   ", norm.naturalKey, " (32 chars:", norm.naturalKey.length === 32, ")");
  passed++;
} catch (e) {
  console.log("  ✗ FAILED:", (e as Error).message);
  failed++;
}

console.log("\n── normalizeRow (AGGREGATED, no txCount) ───────────────────────");

const sampleAgg: RawSagRow = {
  fecha:          "202403",
  periodo_ao_mes: "202403",
  vendedor:       "JP001",
  tienda:         "TN01",
  linea:          "Ropa",
  canal:          "online",
  valor:          "5.000.000,00",
};

try {
  const norm = normalizeRow(sampleAgg, "org-test", SaleGrain.AGGREGATED);
  console.log("  periodoAoMes: ", norm.periodoAoMes, " (should be '202403')");
  console.log("  amount:       ", norm.amount, " (should be 5000000)");
  console.log("  txCount:      ", norm.txCount, " (should be null)");
  console.log("  sellerCode:   ", norm.sellerCode, " (should be 'JP001' — short alphanumeric)");
  passed++;
} catch (e) {
  console.log("  ✗ FAILED:", (e as Error).message);
  failed++;
}

console.log("\n── normalizeRows batch dedup ────────────────────────────────────");

const dupBatch: RawSagRow[] = [sampleTxn, sampleTxn]; // exact duplicate
const { ok, errors } = normalizeRows(dupBatch, "org-test", SaleGrain.TRANSACTION);
const dedupOk = ok.length === 1 && errors.length === 1 && errors[0].severity === "warn";
console.log(`  ${dedupOk ? "✓" : "✗"}  duplicate row detected (ok=${ok.length}, warns=${errors.length})`);
if (dedupOk) passed++; else failed++;

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n── Result: ${passed} passed, ${failed} failed ────────────────────────────\n`);
if (failed > 0) process.exit(1);
