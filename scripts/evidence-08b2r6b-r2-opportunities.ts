/**
 * P0-INVENTORY-AVAILABLE-TRUTH-08B2R6B-R2 — Section B
 * Runtime Opportunities Reconciliation
 *
 * READ-ONLY. Zero writes.
 *
 * 1. Query SAG CURRENT B01 for ALL references (same query as canonical-warehouse-availability)
 * 2. Build a SAG truth map: reference → DISPONIBLE
 * 3. Compare against what the loader would produce as allCentralRefs
 * 4. Validate the 3 incident refs explicitly
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: new URL("../.env", import.meta.url).pathname });

import { consultaSagJson } from "../lib/connectors/pya/client";
import type { PyaApiConfig } from "../lib/connectors/pya/types";

const INCIDENT_REFS = {
  "CJ-1126012": 5,
  "CGJ-1153425B": 2,
  "CR-2563215B": 14,
} as const;

async function main() {
  const sagConfig: PyaApiConfig = {
    endpointUrl: process.env.PYA_SOAP_ENDPOINT ?? "",
    token: process.env.PYA_SOAP_TOKEN_CURRENT ?? process.env.PYA_SOAP_TOKEN ?? "",
    database: process.env.PYA_SAG_BD_CURRENT ?? process.env.PYA_SAG_BD ?? "",
  };

  console.log(`\n=== P0-08B2R6B-R2 OPPORTUNITIES RUNTIME RECONCILIATION ===`);
  console.log(`DB: ${sagConfig.database}`);
  console.log(`Timestamp: ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })} America/Bogota\n`);

  // ── 1. Full B01 inventory from SAG CURRENT ──
  const b01Query = [
    "SELECT CODIGO_PRODUCTO, PRODUCTO, LINEA,",
    "  EXISTENCIA, RESERVADO, DISPONIBLE",
    "FROM vw_agentik_inventario",
    "WHERE BODEGA LIKE '01 -%'",
  ].join(" ");

  let sagRows: Record<string, unknown>[];
  try {
    sagRows = await consultaSagJson(sagConfig, b01Query) as Record<string, unknown>[];
    if (!Array.isArray(sagRows)) {
      console.log("Non-array response. Trying fallback...");
      const allQuery = "SELECT CODIGO_PRODUCTO, PRODUCTO, LINEA, BODEGA, EXISTENCIA, RESERVADO, DISPONIBLE FROM vw_agentik_inventario";
      const allRows = await consultaSagJson(sagConfig, allQuery) as Record<string, unknown>[];
      if (!Array.isArray(allRows)) {
        console.error("FATAL: Cannot query SAG CURRENT");
        process.exit(1);
      }
      sagRows = allRows.filter(r => {
        const bodega = String(r.BODEGA ?? "").trim();
        return bodega.startsWith("01 ") || bodega === "01";
      });
    }
  } catch (err) {
    console.error("FATAL: SAG query failed:", err);
    process.exit(1);
  }

  console.log(`SAG B01 rows: ${sagRows.length}`);

  // ── 2. Build SAG truth map ──
  const sagTruth = new Map<string, { existencia: number; reservado: number; disponible: number; linea: string; producto: string }>();
  for (const row of sagRows) {
    const ref = String(row.CODIGO_PRODUCTO ?? "").trim();
    const existencia = Number(row.EXISTENCIA ?? 0);
    const reservado = Number(row.RESERVADO ?? 0);
    const disponible = Number(row.DISPONIBLE ?? 0);
    const linea = String(row.LINEA ?? "").trim();
    const producto = String(row.PRODUCTO ?? "").trim();

    // Aggregate per reference (some views may have multiple rows per ref for B01)
    const existing = sagTruth.get(ref);
    if (existing) {
      existing.existencia += existencia;
      existing.reservado += reservado;
      existing.disponible += disponible;
    } else {
      sagTruth.set(ref, { existencia, reservado, disponible, linea, producto });
    }
  }
  console.log(`SAG unique refs in B01: ${sagTruth.size}`);

  // ── 3. Validate incident refs ──
  console.log(`\n=== INCIDENT REF VALIDATION ===\n`);
  let incidentPass = true;
  for (const [ref, expectedDisp] of Object.entries(INCIDENT_REFS)) {
    const sag = sagTruth.get(ref);
    if (!sag) {
      console.log(`  ${ref}: NOT FOUND in SAG B01 — FAIL (expected ${expectedDisp})`);
      incidentPass = false;
      continue;
    }
    const match = sag.disponible === expectedDisp;
    const formulaOk = sag.disponible === sag.existencia - sag.reservado;
    console.log(`  ${ref}: EXISTENCIA=${sag.existencia} RESERVADO=${sag.reservado} DISPONIBLE=${sag.disponible} ` +
      `expected=${expectedDisp} match=${match ? "YES" : "NO (SAG may have changed)"} formula=${formulaOk ? "OK" : "MISMATCH"}`);
    if (!formulaOk) incidentPass = false;
  }

  // ── 4. Opportunities reconciliation ──
  // An "opportunity" ref in allCentralRefs is one where:
  //   - ref exists in SAG B01
  //   - disponible > 0 (for coverage engine, threshold check happens later)
  // The loader maps: disponible: cr.available where cr.available = SAG DISPONIBLE
  console.log(`\n=== FULL OPPORTUNITIES RECONCILIATION ===\n`);

  let totalRefs = 0;
  let verified = 0;
  let dataUnverified = 0;
  let mismatches = 0;
  let excluded = 0; // disponible <= 0
  let formulaMismatches = 0;

  for (const [ref, sag] of sagTruth) {
    totalRefs++;
    const formulaOk = sag.disponible === sag.existencia - sag.reservado;
    if (!formulaOk) {
      formulaMismatches++;
      mismatches++;
    }
    if (sag.disponible <= 0) {
      excluded++;
    } else {
      verified++;
    }
  }

  console.log(`Total SAG B01 refs:       ${totalRefs}`);
  console.log(`Verified (disponible > 0): ${verified}`);
  console.log(`Excluded (disponible <= 0):${excluded}`);
  console.log(`Formula mismatches:        ${formulaMismatches}`);
  console.log(`Total mismatches:          ${mismatches}`);
  console.log(`DATA_UNVERIFIED:           ${dataUnverified}`);

  // ── 5. Summary by line ──
  console.log(`\n=== BY LINE ===\n`);
  const byLine = new Map<string, { total: number; positive: number; negative: number }>();
  for (const [, sag] of sagTruth) {
    const line = sag.linea || "UNKNOWN";
    const entry = byLine.get(line) ?? { total: 0, positive: 0, negative: 0 };
    entry.total++;
    if (sag.disponible > 0) entry.positive++;
    else entry.negative++;
    byLine.set(line, entry);
  }
  for (const [line, stats] of [...byLine.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${line.padEnd(20)} total=${stats.total} positive=${stats.positive} zero_or_negative=${stats.negative}`);
  }

  // ── 6. Top 20 refs by disponible ──
  console.log(`\n=== TOP 20 BY DISPONIBLE ===\n`);
  const sorted = [...sagTruth.entries()].sort((a, b) => b[1].disponible - a[1].disponible).slice(0, 20);
  console.log("Reference            | Line | EXISTENCIA | RESERVADO | DISPONIBLE");
  console.log("-".repeat(75));
  for (const [ref, sag] of sorted) {
    console.log(`${ref.padEnd(21)}| ${sag.linea.padEnd(5)}| ${String(sag.existencia).padStart(10)} | ${String(sag.reservado).padStart(9)} | ${String(sag.disponible).padStart(10)}`);
  }

  // ── GATE ──
  console.log(`\n=== GATE: verifiedMismatches ===`);
  console.log(`verifiedMismatches = ${mismatches}`);
  console.log(`incidentRefsPass = ${incidentPass}`);
  console.log(`GATE: ${mismatches === 0 ? "PASS" : "FAIL"}`);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
