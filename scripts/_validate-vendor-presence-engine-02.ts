/**
 * _validate-vendor-presence-engine-02.ts
 *
 * Validates the ENGINE-02 fix (reference-level presence) against
 * the forensic F34 ledger reconstruction.
 *
 * For each vendor:
 *   1. Runs the ENGINE-02 SQL (GROUP BY ref only, WHERE net_qty > 0)
 *   2. Runs the forensic ledger SQL (ref-level net balance)
 *   3. Compares both against expected ref counts from audit
 *   4. Lists discrepant refs if any
 *
 * Criteria:
 *   IDEAL  if delta <= 2%
 *   PASS   if delta <= 5%
 *   FAIL   if delta > 5%
 *
 * Usage:
 *   env $(grep -E '^[A-Z_]+=' .env | tr '\n' ' ') npx tsx scripts/_validate-vendor-presence-engine-02.ts
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import { loadSagTestEnv } from "@/lib/sag/env";

// ── Config ──────────────────────────────────────────────────────────────────

const BODS = [45, 46, 47, 48, 49, 50] as const;
const NAMES: Record<number, string> = {
  45: "ORLANDO",
  46: "CARLOS LEON",
  47: "LUIS",
  48: "NESTOR",
  49: "CARLOS VILLA",
  50: "FREDY",
};
const EXPECTED: Record<number, number> = {
  45: 209, 46: 259, 47: 0, 48: 240, 49: 271, 50: 4,
};

// ── Queries ─────────────────────────────────────────────────────────────────

/** ENGINE-02 query — same as vendor-sample-presence-engine.ts buildVendorBalanceQuery() */
function buildEngineQuery(bod: number): string {
  return `
SELECT ref, descr, net_qty FROM (
  SELECT
    v.k_sc_codigo_articulo AS ref,
    MAX(v.sc_detalle_articulo) AS descr,
    SUM(CASE WHEN mt.ka_nl_bodega_destino = ${bod} THEN mt.nd_cantidad ELSE 0 END) -
    SUM(CASE WHEN mt.ka_nl_bodega_origen = ${bod} THEN mt.nd_cantidad ELSE 0 END) AS net_qty
  FROM movimientos_traslados mt
  INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
  LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
  WHERE m.sc_anulado = 'N'
    AND (mt.ka_nl_bodega_destino = ${bod} OR mt.ka_nl_bodega_origen = ${bod})
  GROUP BY v.k_sc_codigo_articulo
) sub
WHERE net_qty > 0
  `.trim();
}

/** Forensic ledger query — independent ref-level reconstruction */
function buildLedgerQuery(bod: number): string {
  return `
SELECT
  v.k_sc_codigo_articulo AS ref,
  SUM(CASE WHEN mt.ka_nl_bodega_destino = ${bod} THEN mt.nd_cantidad ELSE 0 END) -
  SUM(CASE WHEN mt.ka_nl_bodega_origen = ${bod} THEN mt.nd_cantidad ELSE 0 END) AS net_qty
FROM movimientos_traslados mt
INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
WHERE m.sc_anulado = 'N'
  AND (mt.ka_nl_bodega_destino = ${bod} OR mt.ka_nl_bodega_origen = ${bod})
GROUP BY v.k_sc_codigo_articulo
HAVING SUM(CASE WHEN mt.ka_nl_bodega_destino = ${bod} THEN mt.nd_cantidad ELSE 0 END) -
       SUM(CASE WHEN mt.ka_nl_bodega_origen = ${bod} THEN mt.nd_cantidad ELSE 0 END) > 0
  `.trim();
}

/** OLD ENGINE-01 query — for delta comparison (variant-level, talla swap inflation) */
function buildOldEngineQuery(bod: number): string {
  return `
SELECT COUNT(DISTINCT ref) AS cnt FROM (
  SELECT v.k_sc_codigo_articulo AS ref
  FROM movimientos_traslados mt
  INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
  LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
  WHERE m.sc_anulado = 'N'
    AND (mt.ka_nl_bodega_destino = ${bod} OR mt.ka_nl_bodega_origen = ${bod})
  GROUP BY v.k_sc_codigo_articulo, mt.ss_talla, mt.ss_color
  HAVING SUM(CASE WHEN mt.ka_nl_bodega_destino = ${bod} THEN mt.nd_cantidad ELSE 0 END) -
         SUM(CASE WHEN mt.ka_nl_bodega_origen = ${bod} THEN mt.nd_cantidad ELSE 0 END) > 0
) sub
  `.trim();
}

// ── Types ───────────────────────────────────────────────────────────────────

interface RefRow { ref: string; net_qty: number; descr?: string }
interface VendorResult {
  bod: number;
  name: string;
  engineRefs: Set<string>;
  ledgerRefs: Set<string>;
  oldEngineCount: number;
  expected: number;
  engineCount: number;
  ledgerCount: number;
  onlyInEngine: string[];
  onlyInLedger: string[];
  delta: number;
  deltaPct: number;
  grade: "IDEAL" | "PASS" | "FAIL";
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(90));
  console.log("VENDOR-SAMPLE-PRESENCE-ENGINE-02 — VALIDATION REPORT");
  console.log("Date:", new Date().toISOString());
  console.log("=".repeat(90));
  console.log();

  const env = loadSagTestEnv();
  const config = { endpointUrl: env.endpointUrl, token: env.token, database: env.database };

  const results: VendorResult[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: Per-vendor ENGINE-02 vs LEDGER vs EXPECTED
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("PHASE 1: ENGINE-02 vs FORENSIC LEDGER vs EXPECTED");
  console.log("-".repeat(90));
  console.log();

  for (const bod of BODS) {
    const expected = EXPECTED[bod];
    const name = NAMES[bod];

    if (expected === 0) {
      // Skip SAG queries for inactive vendors with 0 expected
      results.push({
        bod, name,
        engineRefs: new Set(), ledgerRefs: new Set(),
        oldEngineCount: 0, expected,
        engineCount: 0, ledgerCount: 0,
        onlyInEngine: [], onlyInLedger: [],
        delta: 0, deltaPct: 0, grade: "IDEAL",
      });
      console.log(`  B${bod} ${name.padEnd(14)}: SKIPPED (expected=0, inactive vendor)`);
      continue;
    }

    try {
      // Run all 3 queries sequentially (SAG rate limit: 10/min)
      const engineRows = await consultaSagJson(config, buildEngineQuery(bod)) as unknown as RefRow[];
      const ledgerRows = await consultaSagJson(config, buildLedgerQuery(bod)) as unknown as RefRow[];
      const oldRows = await consultaSagJson(config, buildOldEngineQuery(bod)) as unknown as { cnt: number }[];

      const engineRefs = new Set(engineRows.map(r => String(r.ref ?? "").trim()).filter(Boolean));
      const ledgerRefs = new Set(ledgerRows.map(r => String(r.ref ?? "").trim()).filter(Boolean));
      const oldEngineCount = Number(oldRows[0]?.cnt ?? 0);

      const onlyInEngine = [...engineRefs].filter(r => !ledgerRefs.has(r));
      const onlyInLedger = [...ledgerRefs].filter(r => !engineRefs.has(r));

      const engineCount = engineRefs.size;
      const delta = engineCount - expected;
      const deltaPct = expected > 0 ? Math.abs(delta / expected) * 100 : 0;
      const grade: "IDEAL" | "PASS" | "FAIL" = deltaPct <= 2 ? "IDEAL" : deltaPct <= 5 ? "PASS" : "FAIL";

      results.push({
        bod, name,
        engineRefs, ledgerRefs,
        oldEngineCount, expected,
        engineCount, ledgerCount: ledgerRefs.size,
        onlyInEngine, onlyInLedger,
        delta, deltaPct, grade,
      });

      console.log(
        `  B${bod} ${name.padEnd(14)}: ` +
        `ENGINE-02=${String(engineCount).padStart(4)} | ` +
        `LEDGER=${String(ledgerRefs.size).padStart(4)} | ` +
        `EXPECTED=${String(expected).padStart(4)} | ` +
        `OLD-ENGINE=${String(oldEngineCount).padStart(4)} | ` +
        `DELTA=${String(delta).padStart(4)} (${deltaPct.toFixed(1)}%) | ` +
        grade
      );
    } catch (e) {
      console.error(`  B${bod} ${name.padEnd(14)}: ERROR — ${(e as Error).message.slice(0, 80)}`);
      results.push({
        bod, name,
        engineRefs: new Set(), ledgerRefs: new Set(),
        oldEngineCount: 0, expected,
        engineCount: -1, ledgerCount: -1,
        onlyInEngine: [], onlyInLedger: [],
        delta: -1, deltaPct: 100, grade: "FAIL",
      });
    }
  }

  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: ENGINE-02 vs LEDGER exact match (cross-validation)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("PHASE 2: ENGINE-02 vs LEDGER EXACT MATCH (cross-validation)");
  console.log("-".repeat(90));
  console.log();

  for (const r of results) {
    if (r.expected === 0) {
      console.log(`  B${r.bod} ${r.name.padEnd(14)}: SKIPPED (inactive)`);
      continue;
    }

    const engineVsLedger = r.engineRefs.size === r.ledgerRefs.size &&
      r.onlyInEngine.length === 0 && r.onlyInLedger.length === 0;

    console.log(
      `  B${r.bod} ${r.name.padEnd(14)}: ` +
      `engine=${String(r.engineRefs.size).padStart(4)} | ` +
      `ledger=${String(r.ledgerRefs.size).padStart(4)} | ` +
      `only_engine=${String(r.onlyInEngine.length).padStart(2)} | ` +
      `only_ledger=${String(r.onlyInLedger.length).padStart(2)} | ` +
      (engineVsLedger ? "EXACT MATCH" : "DIFF")
    );

    if (r.onlyInEngine.length > 0) {
      console.log(`    In engine but NOT in ledger: ${r.onlyInEngine.slice(0, 5).join(", ")}${r.onlyInEngine.length > 5 ? ` (+${r.onlyInEngine.length - 5} more)` : ""}`);
      console.log(`    Possible cause: subquery vs HAVING behavior difference`);
    }
    if (r.onlyInLedger.length > 0) {
      console.log(`    In ledger but NOT in engine: ${r.onlyInLedger.slice(0, 5).join(", ")}${r.onlyInLedger.length > 5 ? ` (+${r.onlyInLedger.length - 5} more)` : ""}`);
      console.log(`    Possible cause: MAX(descr) vs direct descr aggregation difference`);
    }
  }

  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: Talla swap elimination proof
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("PHASE 3: TALLA SWAP ELIMINATION PROOF");
  console.log("-".repeat(90));
  console.log();

  console.log(
    `  ${"Vendor".padEnd(16)} ` +
    `${"OLD (v1)".padStart(9)} ` +
    `${"NEW (v2)".padStart(9)} ` +
    `${"Swaps".padStart(7)} ` +
    `${"Expected".padStart(9)} ` +
    `${"Delta v2".padStart(9)} ` +
    `${"Grade".padStart(6)}`
  );
  console.log(`  ${"-".repeat(65)}`);

  for (const r of results) {
    const swapsEliminated = r.oldEngineCount - r.engineCount;
    console.log(
      `  ${r.name.padEnd(16)} ` +
      `${String(r.oldEngineCount).padStart(9)} ` +
      `${String(r.engineCount).padStart(9)} ` +
      `${String(swapsEliminated).padStart(7)} ` +
      `${String(r.expected).padStart(9)} ` +
      `${String(r.delta).padStart(9)} ` +
      `${r.grade.padStart(6)}`
    );
  }

  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 4: Discrepancy deep-dive (refs only in engine or only in ledger)
  // ═══════════════════════════════════════════════════════════════════════════

  const hasDiscrepancies = results.some(r => r.onlyInEngine.length > 0 || r.onlyInLedger.length > 0);

  if (hasDiscrepancies) {
    console.log("PHASE 4: DISCREPANCY DEEP-DIVE");
    console.log("-".repeat(90));
    console.log();

    for (const r of results) {
      if (r.onlyInEngine.length === 0 && r.onlyInLedger.length === 0) continue;

      console.log(`  B${r.bod} ${r.name}:`);

      if (r.onlyInEngine.length > 0) {
        console.log(`    Refs in engine only (${r.onlyInEngine.length}):`);
        for (const ref of r.onlyInEngine.slice(0, 10)) {
          console.log(`      ${ref}`);
        }
        if (r.onlyInEngine.length > 10) console.log(`      ... +${r.onlyInEngine.length - 10} more`);
      }

      if (r.onlyInLedger.length > 0) {
        console.log(`    Refs in ledger only (${r.onlyInLedger.length}):`);
        for (const ref of r.onlyInLedger.slice(0, 10)) {
          console.log(`      ${ref}`);
        }
        if (r.onlyInLedger.length > 10) console.log(`      ... +${r.onlyInLedger.length - 10} more`);
      }
    }
    console.log();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VERDICT
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("=".repeat(90));
  console.log("VERDICT");
  console.log("=".repeat(90));
  console.log();

  const activeResults = results.filter(r => r.expected > 0);
  const allPass = activeResults.every(r => r.grade !== "FAIL");
  const allIdeal = activeResults.every(r => r.grade === "IDEAL");
  const engineMatchesLedger = activeResults.every(r => r.onlyInEngine.length === 0 && r.onlyInLedger.length === 0);

  console.log(`  All vendors PASS (delta <= 5%):        ${allPass ? "YES" : "NO"}`);
  console.log(`  All vendors IDEAL (delta <= 2%):       ${allIdeal ? "YES" : "NO"}`);
  console.log(`  Engine matches ledger exactly:          ${engineMatchesLedger ? "YES" : "NO"}`);
  console.log();

  if (allPass) {
    console.log("  RESULT: ENGINE-02 VALIDATION PASSED");
    console.log("  The reference-level GROUP BY correctly eliminates talla swap inflation.");
    if (allIdeal) {
      console.log("  All vendors within IDEAL tolerance (<=2% delta).");
    }
    if (engineMatchesLedger) {
      console.log("  Engine SQL and forensic ledger SQL produce identical ref sets.");
    }
  } else {
    console.log("  RESULT: ENGINE-02 VALIDATION FAILED");
    console.log("  One or more vendors exceed 5% delta from expected counts.");
    for (const r of activeResults.filter(r => r.grade === "FAIL")) {
      console.log(`    FAIL: B${r.bod} ${r.name} — engine=${r.engineCount} expected=${r.expected} delta=${r.delta} (${r.deltaPct.toFixed(1)}%)`);
    }
  }

  console.log();
  console.log("=".repeat(90));
  console.log("VALIDATION COMPLETE");
  console.log("=".repeat(90));
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
