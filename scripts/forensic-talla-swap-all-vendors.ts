/**
 * Quick check: for each vendor, how many refs have ref-level net=0
 * but variant-level net > 0 (talla swaps)?
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import { loadSagTestEnv } from "@/lib/sag/env";

const BODS = [45, 46, 47, 48, 49, 50];
const NAMES: Record<number, string> = {
  45: "ORLANDO", 46: "CARLOS LEON", 47: "LUIS", 48: "NESTOR", 49: "CARLOS VILLA", 50: "FREDY",
};

async function main() {
  const env = loadSagTestEnv();
  const config = { endpointUrl: env.endpointUrl, token: env.token, database: env.database };

  console.log("=== TALLA SWAP ANALYSIS ACROSS ALL VENDORS ===\n");
  console.log(`${"Vendor".padEnd(16)} ${"RefNet>0".padStart(9)} ${"VarNet>0".padStart(9)} ${"Delta".padStart(7)} ${"TallaSwaps".padStart(12)}`);
  console.log("-".repeat(55));

  for (const bod of BODS) {
    // Ref-level query (no talla/color)
    const refQ = `
SELECT COUNT(*) AS cnt FROM (
  SELECT v.k_sc_codigo_articulo AS ref
  FROM movimientos_traslados mt
  INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
  LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
  WHERE m.sc_anulado = 'N'
    AND (mt.ka_nl_bodega_destino = ${bod} OR mt.ka_nl_bodega_origen = ${bod})
  GROUP BY v.k_sc_codigo_articulo
  HAVING SUM(CASE WHEN mt.ka_nl_bodega_destino = ${bod} THEN mt.nd_cantidad ELSE 0 END) -
         SUM(CASE WHEN mt.ka_nl_bodega_origen = ${bod} THEN mt.nd_cantidad ELSE 0 END) > 0
) sub
    `.trim();

    // Variant-level → aggregated to ref (engine's approach)
    const varQ = `
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

    try {
      const [refRows, varRows] = await Promise.all([
        consultaSagJson(config, refQ),
        consultaSagJson(config, varQ),
      ]);
      const refCount = Number(refRows[0]?.cnt ?? 0);
      const varCount = Number(varRows[0]?.cnt ?? 0);
      const delta = varCount - refCount;
      console.log(
        `${NAMES[bod].padEnd(16)} ${String(refCount).padStart(9)} ${String(varCount).padStart(9)} ${String(delta).padStart(7)} ${String(delta).padStart(12)}`
      );
    } catch (e) {
      console.log(`${NAMES[bod].padEnd(16)} ERROR: ${(e as Error).message.slice(0, 50)}`);
    }
  }

  console.log("\nRefNet>0 = ref-level aggregation (what ledger uses)");
  console.log("VarNet>0 = variant-level aggregation (what engine uses)");
  console.log("Delta = talla swaps (refs where variant-level shows presence but ref-level is 0 or negative)");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
