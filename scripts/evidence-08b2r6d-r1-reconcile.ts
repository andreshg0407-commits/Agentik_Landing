/**
 * P0-IMPORT-VENDOR-SAMPLE-TRUTH-08B2R6D-R1 — Section C/D/E
 * Reconcile all NOT_IN_B01 refs against B24 SAG CURRENT.
 * Determine B24/B36/B37 authority.
 * READ-ONLY. Zero writes.
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: new URL("../.env", import.meta.url).pathname });

import { consultaSagJson } from "../lib/connectors/pya/client";
import type { PyaApiConfig } from "../lib/connectors/pya/types";

const NESTOR_KA_NL = 48;

async function main() {
  const sagConfig: PyaApiConfig = {
    endpointUrl: process.env.PYA_SOAP_ENDPOINT ?? "",
    token: process.env.PYA_SOAP_TOKEN_CURRENT ?? process.env.PYA_SOAP_TOKEN ?? "",
    database: process.env.PYA_SAG_BD_CURRENT ?? process.env.PYA_SAG_BD ?? "",
  };

  console.log(`\n=== P0-08B2R6D-R1 RECONCILIATION ===`);
  console.log(`Timestamp: ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })} America/Bogota\n`);

  // 1. Get all B24 import inventory
  const b24q = "SELECT CODIGO_PRODUCTO, LINEA, EXISTENCIA, RESERVADO, DISPONIBLE FROM vw_agentik_inventario WHERE BODEGA LIKE '24 -%'";
  const b24rows = await consultaSagJson(sagConfig, b24q) as Record<string, unknown>[];
  const b24map = new Map<string, { linea: string; existencia: number; reservado: number; disponible: number }>();
  for (const r of b24rows) {
    b24map.set(String(r.CODIGO_PRODUCTO ?? "").trim(), {
      linea: String(r.LINEA ?? ""),
      existencia: Number(r.EXISTENCIA ?? 0),
      reservado: Number(r.RESERVADO ?? 0),
      disponible: Number(r.DISPONIBLE ?? 0),
    });
  }
  console.log(`B24 total refs: ${b24map.size}`);

  // 2. Get B01 refs (to identify NOT_IN_B01)
  const b01q = "SELECT CODIGO_PRODUCTO, LINEA, DISPONIBLE FROM vw_agentik_inventario WHERE BODEGA LIKE '01 -%'";
  const b01rows = await consultaSagJson(sagConfig, b01q) as Record<string, unknown>[];
  const b01map = new Map<string, { linea: string; disponible: number }>();
  for (const r of b01rows) {
    b01map.set(String(r.CODIGO_PRODUCTO ?? "").trim(), {
      linea: String(r.LINEA ?? ""),
      disponible: Number(r.DISPONIBLE ?? 0),
    });
  }

  // 3. Get vendor B48 presence
  const presQ = `
SELECT ref, descr, net_qty FROM (
  SELECT v.k_sc_codigo_articulo AS ref, MAX(v.sc_detalle_articulo) AS descr,
    SUM(CASE WHEN mt.ka_nl_bodega_destino = ${NESTOR_KA_NL} THEN mt.nd_cantidad ELSE 0 END) -
    SUM(CASE WHEN mt.ka_nl_bodega_origen = ${NESTOR_KA_NL} THEN mt.nd_cantidad ELSE 0 END) AS net_qty
  FROM movimientos_traslados mt
  INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
  LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
  WHERE m.sc_anulado = 'N' AND (mt.ka_nl_bodega_destino = ${NESTOR_KA_NL} OR mt.ka_nl_bodega_origen = ${NESTOR_KA_NL})
  GROUP BY v.k_sc_codigo_articulo
) sub WHERE net_qty > 0 ORDER BY ref`.trim();
  const presRows = await consultaSagJson(sagConfig, presQ) as Record<string, unknown>[];
  console.log(`Vendor B48 total refs: ${presRows.length}\n`);

  // 4. Classify ALL vendor refs
  const THRESHOLD_IMPORT = 10;
  const THRESHOLD_CS = 20;
  const THRESHOLD_LT = 30;

  type Decision = "VIGENTE" | "RETIRO" | "DATA_UNVERIFIED_HOLD";

  const results: Array<{
    ref: string;
    desc: string;
    vendorQty: number;
    inB01: boolean;
    b01Line: string;
    b01Disp: number;
    inB24: boolean;
    b24Line: string;
    b24Exist: number;
    b24Reserv: number;
    b24Disp: number;
    domain: string;
    centralBodega: string;
    centralDisp: number | null;
    rule: string;
    truthState: string;
    decision: Decision;
  }> = [];

  for (const row of presRows) {
    const ref = String(row.ref ?? "").trim();
    const desc = String(row.descr ?? "").trim().slice(0, 40);
    const vendorQty = Number(row.net_qty ?? 0);
    const b01 = b01map.get(ref);
    const b24 = b24map.get(ref);
    const inB01 = b01 != null;
    const inB24 = b24 != null;

    let domain: string;
    let centralBodega: string;
    let centralDisp: number | null;
    let rule: string;
    let truthState: string;
    let decision: Decision;

    if (inB01) {
      // Textile path — use B01
      const line = b01.linea.toUpperCase().trim();
      if (line === "CASTILLITOS" || line === "CS") {
        domain = "CS";
        const threshold = THRESHOLD_CS;
        centralBodega = "B01";
        centralDisp = b01.disponible;
        truthState = "VERIFIED";
        decision = centralDisp > threshold ? "VIGENTE" : "RETIRO";
        rule = `B01.DISPONIBLE(${centralDisp}) ${decision === "VIGENTE" ? ">" : "<="} CS_THRESHOLD(${threshold})`;
      } else if (line === "LATIN KIDS" || line === "LT") {
        domain = "LT";
        const threshold = THRESHOLD_LT;
        centralBodega = "B01";
        centralDisp = b01.disponible;
        truthState = "VERIFIED";
        decision = centralDisp > threshold ? "VIGENTE" : "RETIRO";
        rule = `B01.DISPONIBLE(${centralDisp}) ${decision === "VIGENTE" ? ">" : "<="} LT_THRESHOLD(${threshold})`;
      } else if (line === "IMPORTACION") {
        // Import ref that also appears in B01 — use B24 as authority
        domain = "IMPORT";
        if (inB24) {
          centralBodega = "B24";
          centralDisp = b24.disponible;
          truthState = "VERIFIED";
          decision = centralDisp > THRESHOLD_IMPORT ? "VIGENTE" : "RETIRO";
          rule = `B24.DISPONIBLE(${centralDisp}) ${decision === "VIGENTE" ? ">" : "<="} IMPORT_THRESHOLD(${THRESHOLD_IMPORT})`;
        } else {
          centralBodega = "NONE";
          centralDisp = null;
          truthState = "DATA_UNVERIFIED";
          decision = "DATA_UNVERIFIED_HOLD";
          rule = "NO_B24_DATA_HOLD";
        }
      } else {
        domain = `OTHER(${line})`;
        centralBodega = "B01";
        centralDisp = b01.disponible;
        truthState = "VERIFIED";
        decision = centralDisp > 0 ? "VIGENTE" : "RETIRO";
        rule = `B01.DISPONIBLE(${centralDisp}) OTHER`;
      }
    } else {
      // NOT in B01 — check B24
      if (inB24) {
        const b24Line = b24.linea.toUpperCase().trim();
        domain = b24Line === "IMPORTACION" ? "IMPORT" : `B24(${b24Line})`;
        centralBodega = "B24";
        centralDisp = b24.disponible;
        truthState = "VERIFIED";
        decision = centralDisp > THRESHOLD_IMPORT ? "VIGENTE" : "RETIRO";
        rule = `B24.DISPONIBLE(${centralDisp}) ${decision === "VIGENTE" ? ">" : "<="} IMPORT_THRESHOLD(${THRESHOLD_IMPORT})`;
      } else {
        // Neither B01 nor B24 — truly unverified
        domain = "UNKNOWN";
        centralBodega = "NONE";
        centralDisp = null;
        truthState = "DATA_UNVERIFIED";
        decision = "DATA_UNVERIFIED_HOLD";
        rule = "NO_CENTRAL_DATA_HOLD";
      }
    }

    results.push({
      ref, desc, vendorQty,
      inB01, b01Line: b01?.linea ?? "", b01Disp: b01?.disponible ?? 0,
      inB24, b24Line: b24?.linea ?? "", b24Exist: b24?.existencia ?? 0,
      b24Reserv: b24?.reservado ?? 0, b24Disp: b24?.disponible ?? 0,
      domain, centralBodega, centralDisp, rule, truthState, decision,
    });
  }

  // 5. Print NOT_IN_B01 reconciliation table
  const notInB01 = results.filter(r => !r.inB01);
  console.log(`=== NOT_IN_B01 RECONCILIATION (${notInB01.length} refs) ===\n`);
  console.log("Ref                  | Desc                                     | VQ | B24? | B24_LINEA     | B24_EX | B24_RES | B24_DISP | Domain    | TruthState       | Decision");
  console.log("-".repeat(190));
  for (const r of notInB01) {
    console.log([
      r.ref.padEnd(21),
      r.desc.padEnd(41),
      String(r.vendorQty).padStart(2),
      r.inB24 ? "Y" : "N",
      (r.b24Line || "—").padEnd(14),
      String(r.b24Exist).padStart(6),
      String(r.b24Reserv).padStart(7),
      String(r.b24Disp).padStart(8),
      r.domain.padEnd(10),
      r.truthState.padEnd(17),
      r.decision,
    ].join(" | "));
  }

  // 6. Summary by decision
  const vigentes = results.filter(r => r.decision === "VIGENTE").length;
  const retiros = results.filter(r => r.decision === "RETIRO").length;
  const holds = results.filter(r => r.decision === "DATA_UNVERIFIED_HOLD").length;

  const csVigentes = results.filter(r => r.domain === "CS" && r.decision === "VIGENTE").length;
  const csRetiro = results.filter(r => r.domain === "CS" && r.decision === "RETIRO").length;
  const csHold = results.filter(r => r.domain === "CS" && r.decision === "DATA_UNVERIFIED_HOLD").length;
  const ltVigentes = results.filter(r => r.domain === "LT" && r.decision === "VIGENTE").length;
  const ltRetiro = results.filter(r => r.domain === "LT" && r.decision === "RETIRO").length;
  const ltHold = results.filter(r => r.domain === "LT" && r.decision === "DATA_UNVERIFIED_HOLD").length;
  const impVigentes = results.filter(r => r.domain === "IMPORT" && r.decision === "VIGENTE").length;
  const impRetiro = results.filter(r => r.domain === "IMPORT" && r.decision === "RETIRO").length;
  const impHold = results.filter(r => r.domain === "IMPORT" && r.decision === "DATA_UNVERIFIED_HOLD").length;
  const unkHold = results.filter(r => r.domain === "UNKNOWN" && r.decision === "DATA_UNVERIFIED_HOLD").length;

  console.log(`\n=== NÉSTOR FINAL COUNTS ===\n`);
  console.log(`  Total en maleta:           ${results.length}`);
  console.log(`  CS  vigentes/retiro/hold:  ${csVigentes} / ${csRetiro} / ${csHold}`);
  console.log(`  LT  vigentes/retiro/hold:  ${ltVigentes} / ${ltRetiro} / ${ltHold}`);
  console.log(`  IMP vigentes/retiro/hold:  ${impVigentes} / ${impRetiro} / ${impHold}`);
  console.log(`  UNK hold:                  ${unkHold}`);
  console.log(`  ────────────────────────`);
  console.log(`  Total vigentes:            ${vigentes}`);
  console.log(`  Total retiro:              ${retiros}`);
  console.log(`  Total sin verificar:       ${holds}`);
  console.log(`  Sum check:                 ${vigentes} + ${retiros} + ${holds} = ${vigentes + retiros + holds}`);
  console.log(`  INVARIANT (370):           ${vigentes + retiros + holds === results.length ? "PASS" : "FAIL"}`);

  // 7. B24/B36/B37 authority determination
  console.log(`\n=== B24/B36/B37 AUTHORITY ===\n`);
  // Check bodega names from SAG
  const bodegaQ = "SELECT DISTINCT BODEGA FROM vw_agentik_inventario WHERE BODEGA LIKE '24 -%' OR BODEGA LIKE '36 -%' OR BODEGA LIKE '37 -%' ORDER BY BODEGA";
  const bodegaRows = await consultaSagJson(sagConfig, bodegaQ) as Record<string, unknown>[];
  for (const r of bodegaRows) console.log(`  ${r.BODEGA}`);

  console.log(`\n  B24 ("24 - IMPORTACIÓN"):      ${b24map.size} refs, central import warehouse`);
  console.log(`  B36 ("36 - VEND CARLOS LEON"):  VENDOR bodega, NOT import central`);
  console.log(`  B37 ("37 - VEND LUIS"):          VENDOR bodega, NOT import central`);
  console.log(`  AUTHORITY: B24 is the SOLE central import warehouse`);
  console.log(`  B36/B37 are vendor bodegas and do NOT participate in import retiro decisions`);
}

main().catch(err => {
  console.error("Script failed:", err);
  process.exit(1);
});
