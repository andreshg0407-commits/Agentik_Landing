/**
 * Forensic analysis: why does the engine return MORE refs than the ledger?
 *
 * Hypothesis: the engine groups by (ref, talla, color) at the SQL level,
 * then aggregates by ref in TypeScript. But multiple talla/color variants
 * with HAVING > 0 each create separate engine rows for the same reference.
 * The ledger script counts unique refs after summing all IN/OUT.
 *
 * This script queries SAG for bodega 45 (Orlando) to understand the delta.
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import { loadSagTestEnv } from "@/lib/sag/env";

async function main() {
  const env = loadSagTestEnv();
  const config = { endpointUrl: env.endpointUrl, token: env.token, database: env.database };

  const BOD = 45; // Orlando
  console.log(`=== Engine variant analysis for bodega ${BOD} (ORLANDO) ===\n`);

  // 1. Engine query (same as presence engine) — returns per talla/color rows
  const engineQuery = `
SELECT
  v.k_sc_codigo_articulo AS ref,
  v.sc_detalle_articulo AS descr,
  mt.ss_talla,
  mt.ss_color,
  SUM(CASE WHEN mt.ka_nl_bodega_destino = ${BOD} THEN mt.nd_cantidad ELSE 0 END) -
  SUM(CASE WHEN mt.ka_nl_bodega_origen = ${BOD} THEN mt.nd_cantidad ELSE 0 END) AS net_qty
FROM movimientos_traslados mt
INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
WHERE m.sc_anulado = 'N'
  AND (mt.ka_nl_bodega_destino = ${BOD} OR mt.ka_nl_bodega_origen = ${BOD})
GROUP BY v.k_sc_codigo_articulo, v.sc_detalle_articulo, mt.ss_talla, mt.ss_color
HAVING SUM(CASE WHEN mt.ka_nl_bodega_destino = ${BOD} THEN mt.nd_cantidad ELSE 0 END) -
       SUM(CASE WHEN mt.ka_nl_bodega_origen = ${BOD} THEN mt.nd_cantidad ELSE 0 END) > 0
  `.trim();

  const engineRows = await consultaSagJson(config, engineQuery);
  console.log(`Engine query returned ${engineRows.length} rows (per talla/color)\n`);

  // Aggregate by ref (same as engine TypeScript)
  const refMap = new Map<string, { ref: string; totalNet: number; variants: number }>();
  for (const row of engineRows) {
    const ref = String(row.ref ?? "").trim();
    if (!ref) continue;
    const existing = refMap.get(ref);
    if (existing) {
      existing.totalNet += Number(row.net_qty) || 0;
      existing.variants++;
    } else {
      refMap.set(ref, { ref, totalNet: Number(row.net_qty) || 0, variants: 1 });
    }
  }

  console.log(`After aggregation by ref: ${refMap.size} unique refs\n`);

  // 2. Ledger query — compute balance per ref WITHOUT talla/color grouping
  const ledgerQuery = `
SELECT
  v.k_sc_codigo_articulo AS ref,
  SUM(CASE WHEN mt.ka_nl_bodega_destino = ${BOD} THEN mt.nd_cantidad ELSE 0 END) -
  SUM(CASE WHEN mt.ka_nl_bodega_origen = ${BOD} THEN mt.nd_cantidad ELSE 0 END) AS net_qty
FROM movimientos_traslados mt
INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
WHERE m.sc_anulado = 'N'
  AND (mt.ka_nl_bodega_destino = ${BOD} OR mt.ka_nl_bodega_origen = ${BOD})
GROUP BY v.k_sc_codigo_articulo
HAVING SUM(CASE WHEN mt.ka_nl_bodega_destino = ${BOD} THEN mt.nd_cantidad ELSE 0 END) -
       SUM(CASE WHEN mt.ka_nl_bodega_origen = ${BOD} THEN mt.nd_cantidad ELSE 0 END) > 0
  `.trim();

  const ledgerRows = await consultaSagJson(config, ledgerQuery);
  console.log(`Ledger query (grouped by ref only): ${ledgerRows.length} refs with net > 0\n`);

  // Compare
  const engineRefs = new Set(refMap.keys());
  const ledgerRefs = new Set(ledgerRows.map((r) => String(r.ref ?? "").trim()).filter(Boolean));

  const inEngineOnly = [...engineRefs].filter((r) => !ledgerRefs.has(r));
  const inLedgerOnly = [...ledgerRefs].filter((r) => !engineRefs.has(r));

  console.log(`Engine unique refs: ${engineRefs.size}`);
  console.log(`Ledger unique refs: ${ledgerRefs.size}`);
  console.log(`In engine only: ${inEngineOnly.length}`);
  console.log(`In ledger only: ${inLedgerOnly.length}\n`);

  // Show the refs that are in engine but not ledger
  if (inEngineOnly.length > 0) {
    console.log("Refs in engine but NOT in ledger (after ref aggregation):");
    for (const ref of inEngineOnly.slice(0, 20)) {
      const data = refMap.get(ref)!;
      console.log(`  ${ref.padEnd(20)} totalNet=${data.totalNet} variants=${data.variants}`);
    }
  }

  // Now check: refs that have variant-level net > 0 but ref-level net <= 0
  // This is the root cause of the discrepancy
  console.log("\n--- ROOT CAUSE ANALYSIS ---");
  console.log("Refs where some variants have net > 0 but overall ref balance is <= 0:\n");

  // Get ALL balances per ref (including negative and zero)
  const fullRefQuery = `
SELECT
  v.k_sc_codigo_articulo AS ref,
  SUM(CASE WHEN mt.ka_nl_bodega_destino = ${BOD} THEN mt.nd_cantidad ELSE 0 END) AS total_in,
  SUM(CASE WHEN mt.ka_nl_bodega_origen = ${BOD} THEN mt.nd_cantidad ELSE 0 END) AS total_out,
  SUM(CASE WHEN mt.ka_nl_bodega_destino = ${BOD} THEN mt.nd_cantidad ELSE 0 END) -
  SUM(CASE WHEN mt.ka_nl_bodega_origen = ${BOD} THEN mt.nd_cantidad ELSE 0 END) AS net_qty
FROM movimientos_traslados mt
INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
WHERE m.sc_anulado = 'N'
  AND (mt.ka_nl_bodega_destino = ${BOD} OR mt.ka_nl_bodega_origen = ${BOD})
  AND v.k_sc_codigo_articulo IN (${inEngineOnly.slice(0, 20).map((r) => `'${r}'`).join(",")})
GROUP BY v.k_sc_codigo_articulo
  `.trim();

  if (inEngineOnly.length > 0) {
    const fullRefRows = await consultaSagJson(config, fullRefQuery);
    for (const row of fullRefRows) {
      console.log(
        `  ${String(row.ref).padEnd(20)} IN=${String(row.total_in).padStart(3)} OUT=${String(row.total_out).padStart(3)} NET=${String(row.net_qty).padStart(3)}`
      );
    }

    // Now show variant-level detail for first 5
    console.log("\nVariant-level detail for first 5 discrepant refs:");
    for (const ref of inEngineOnly.slice(0, 5)) {
      const variantQuery = `
SELECT
  v.k_sc_codigo_articulo AS ref,
  mt.ss_talla, mt.ss_color,
  SUM(CASE WHEN mt.ka_nl_bodega_destino = ${BOD} THEN mt.nd_cantidad ELSE 0 END) AS var_in,
  SUM(CASE WHEN mt.ka_nl_bodega_origen = ${BOD} THEN mt.nd_cantidad ELSE 0 END) AS var_out,
  SUM(CASE WHEN mt.ka_nl_bodega_destino = ${BOD} THEN mt.nd_cantidad ELSE 0 END) -
  SUM(CASE WHEN mt.ka_nl_bodega_origen = ${BOD} THEN mt.nd_cantidad ELSE 0 END) AS net_qty
FROM movimientos_traslados mt
INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
WHERE m.sc_anulado = 'N'
  AND (mt.ka_nl_bodega_destino = ${BOD} OR mt.ka_nl_bodega_origen = ${BOD})
  AND v.k_sc_codigo_articulo = '${ref}'
GROUP BY v.k_sc_codigo_articulo, mt.ss_talla, mt.ss_color
      `.trim();

      const variants = await consultaSagJson(config, variantQuery);
      console.log(`\n  ${ref}:`);
      for (const v of variants) {
        const net = Number(v.net_qty);
        const marker = net > 0 ? " <-- engine sees this" : "";
        console.log(`    T:${String(v.ss_talla).padEnd(6)} C:${String(v.ss_color).padEnd(6)} IN=${String(v.var_in).padStart(2)} OUT=${String(v.var_out).padStart(2)} NET=${String(net).padStart(3)}${marker}`);
      }
    }
  }

  console.log("\n=== ANALYSIS COMPLETE ===");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
