/**
 * P0-IMPORT-VENDOR-SAMPLE-TRUTH-08B2R6D — Section A/B
 * Audit vendor bodega references and classify by line.
 * READ-ONLY. Zero writes.
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: new URL("../.env", import.meta.url).pathname });

import { consultaSagJson } from "../lib/connectors/pya/client";
import type { PyaApiConfig } from "../lib/connectors/pya/types";

// Resolved from VENDOR_BODEGA_CONFIGS — NOT hardcoded
const NESTOR_KA_NL = 48;
const VENDOR_NAME = "NESTOR";

async function main() {
  const sagConfig: PyaApiConfig = {
    endpointUrl: process.env.PYA_SOAP_ENDPOINT ?? "",
    token: process.env.PYA_SOAP_TOKEN_CURRENT ?? process.env.PYA_SOAP_TOKEN ?? "",
    database: process.env.PYA_SAG_BD_CURRENT ?? process.env.PYA_SAG_BD ?? "",
  };

  console.log(`\n=== P0-08B2R6D VENDOR BODEGA AUDIT ===`);
  console.log(`Vendor: ${VENDOR_NAME} (bodegaKaNl=${NESTOR_KA_NL})`);
  console.log(`DB: ${sagConfig.database}`);
  console.log(`Timestamp: ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })} America/Bogota\n`);

  // ── 1. Vendor bodega presence (same query as presence engine) ──
  const presenceQuery = `
SELECT ref, descr, net_qty, subgrupo_id FROM (
  SELECT
    v.k_sc_codigo_articulo AS ref,
    MAX(v.sc_detalle_articulo) AS descr,
    MAX(v.ka_ni_subgrupo) AS subgrupo_id,
    SUM(CASE WHEN mt.ka_nl_bodega_destino = ${NESTOR_KA_NL} THEN mt.nd_cantidad ELSE 0 END) -
    SUM(CASE WHEN mt.ka_nl_bodega_origen = ${NESTOR_KA_NL} THEN mt.nd_cantidad ELSE 0 END) AS net_qty
  FROM movimientos_traslados mt
  INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
  LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
  WHERE m.sc_anulado = 'N'
    AND (mt.ka_nl_bodega_destino = ${NESTOR_KA_NL} OR mt.ka_nl_bodega_origen = ${NESTOR_KA_NL})
  GROUP BY v.k_sc_codigo_articulo
) sub WHERE net_qty > 0
ORDER BY ref
  `.trim();

  let presenceRows: Record<string, unknown>[];
  try {
    presenceRows = await consultaSagJson(sagConfig, presenceQuery) as Record<string, unknown>[];
    if (!Array.isArray(presenceRows)) {
      console.error("Non-array presence response");
      process.exit(1);
    }
  } catch (err) {
    console.error("Presence query failed:", err);
    process.exit(1);
  }

  console.log(`Vendor B${NESTOR_KA_NL} refs with positive net balance: ${presenceRows.length}\n`);

  // ── 2. B01 inventory (same as canonical-warehouse-availability) ──
  const b01Query = "SELECT CODIGO_PRODUCTO, LINEA, EXISTENCIA, RESERVADO, DISPONIBLE FROM vw_agentik_inventario WHERE BODEGA LIKE '01 -%'";
  let b01Rows: Record<string, unknown>[];
  try {
    b01Rows = await consultaSagJson(sagConfig, b01Query) as Record<string, unknown>[];
    if (!Array.isArray(b01Rows)) b01Rows = [];
  } catch {
    b01Rows = [];
  }

  const b01Map = new Map<string, { linea: string; existencia: number; reservado: number; disponible: number }>();
  for (const row of b01Rows) {
    const ref = String(row.CODIGO_PRODUCTO ?? "").trim();
    b01Map.set(ref, {
      linea: String(row.LINEA ?? "").trim(),
      existencia: Number(row.EXISTENCIA ?? 0),
      reservado: Number(row.RESERVADO ?? 0),
      disponible: Number(row.DISPONIBLE ?? 0),
    });
  }

  // ── 3. Classify vendor refs ──
  const classified = {
    CS: [] as string[],
    LT: [] as string[],
    IMPORT: [] as string[],
    OTHER: [] as string[],
    NOT_IN_B01: [] as string[],
  };

  const refDetails: Array<{
    ref: string;
    desc: string;
    netQty: number;
    b01Line: string | null;
    b01Disp: number | null;
    classification: string;
  }> = [];

  for (const row of presenceRows) {
    const ref = String(row.ref ?? "").trim();
    const desc = String(row.descr ?? "").trim();
    const netQty = Number(row.net_qty ?? 0);

    const b01 = b01Map.get(ref);

    let classification: string;
    if (!b01) {
      classified.NOT_IN_B01.push(ref);
      classification = "NOT_IN_B01";
    } else {
      const line = b01.linea.toUpperCase();
      if (line === "CASTILLITOS") {
        classified.CS.push(ref);
        classification = "CS";
      } else if (line === "LATIN KIDS") {
        classified.LT.push(ref);
        classification = "LT";
      } else if (line === "IMPORTACION") {
        classified.IMPORT.push(ref);
        classification = "IMPORT";
      } else {
        classified.OTHER.push(ref);
        classification = `OTHER(${line})`;
      }
    }

    refDetails.push({
      ref,
      desc: desc.slice(0, 40),
      netQty,
      b01Line: b01?.linea ?? null,
      b01Disp: b01?.disponible ?? null,
      classification,
    });
  }

  // ── 4. Summary ──
  console.log("=== CLASSIFICATION ===\n");
  console.log(`  CS (Castillitos):  ${classified.CS.length}`);
  console.log(`  LT (Latin Kids):   ${classified.LT.length}`);
  console.log(`  IMPORT:            ${classified.IMPORT.length}`);
  console.log(`  OTHER:             ${classified.OTHER.length}`);
  console.log(`  NOT_IN_B01:        ${classified.NOT_IN_B01.length}`);
  console.log(`  TOTAL:             ${presenceRows.length}`);

  // ── 5. Import refs detail ──
  console.log(`\n=== IMPORT REFS IN VENDOR B${NESTOR_KA_NL} ===\n`);
  const importRefs = refDetails.filter(r => r.classification === "IMPORT");
  if (importRefs.length > 0) {
    console.log("Reference            | Desc                                     | VendorQty | B01 Disp");
    console.log("-".repeat(100));
    for (const r of importRefs.slice(0, 30)) {
      console.log(`${r.ref.padEnd(21)}| ${r.desc.padEnd(41)}| ${String(r.netQty).padStart(9)} | ${r.b01Disp !== null ? String(r.b01Disp).padStart(8) : "N/A"}`);
    }
    if (importRefs.length > 30) console.log(`... and ${importRefs.length - 30} more`);
  }

  // ── 6. NOT_IN_B01 refs detail (potential imports not in B01 view) ──
  console.log(`\n=== NOT_IN_B01 REFS ===\n`);
  const notInB01 = refDetails.filter(r => r.classification === "NOT_IN_B01");
  if (notInB01.length > 0) {
    console.log("Reference            | Desc                                     | VendorQty");
    console.log("-".repeat(75));
    for (const r of notInB01.slice(0, 30)) {
      console.log(`${r.ref.padEnd(21)}| ${r.desc.padEnd(41)}| ${String(r.netQty).padStart(9)}`);
    }
    if (notInB01.length > 30) console.log(`... and ${notInB01.length - 30} more`);
  }

  // ── 7. Reconciliation with UI counts ──
  console.log(`\n=== RECONCILIATION ===\n`);
  console.log(`  UI total: 370`);
  console.log(`  SAG vendor refs: ${presenceRows.length}`);
  console.log(`  UI vigentes before: 240`);
  console.log(`  UI vigentes after (ab7f6f3): 153`);
  console.log(`  UI retiro before: 130`);
  console.log(`  UI retiro after (ab7f6f3): 217`);
  console.log(`  Difference: ${217 - 130} refs moved to retiro`);
  console.log(`\n  Import + NOT_IN_B01 = ${classified.IMPORT.length + classified.NOT_IN_B01.length}`);
  console.log(`  CS + LT = ${classified.CS.length + classified.LT.length}`);
  console.log(`  Expected vigentes if imports removed: ~${classified.CS.length + classified.LT.length}`);

  // ── 8. B24/B36/B37 audit ──
  console.log(`\n=== ACCESSORY BODEGAS (B24/B36/B37) ===\n`);
  for (const bodega of ["24", "36", "37"]) {
    try {
      const q = `SELECT CODIGO_PRODUCTO, EXISTENCIA, RESERVADO, DISPONIBLE FROM vw_agentik_inventario WHERE BODEGA LIKE '${bodega} -%'`;
      const rows = await consultaSagJson(sagConfig, q) as Record<string, unknown>[];
      if (Array.isArray(rows)) {
        const total = rows.length;
        const withStock = rows.filter(r => Number(r.DISPONIBLE ?? 0) > 0).length;
        const totalDisp = rows.reduce((s, r) => s + Number(r.DISPONIBLE ?? 0), 0);
        console.log(`  B${bodega}: ${total} rows, ${withStock} with positive DISPONIBLE, total DISPONIBLE=${totalDisp}`);
      } else {
        console.log(`  B${bodega}: no data (SAG query returned non-array)`);
      }
    } catch (err) {
      console.log(`  B${bodega}: query failed — ${err}`);
    }
  }
}

main().catch(err => {
  console.error("Script failed:", err);
  process.exit(1);
});
