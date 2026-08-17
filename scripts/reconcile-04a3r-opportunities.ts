/**
 * INVENTORY-CANONICAL-TRUTH-04A3R — Reconciliation Script
 *
 * Queries SAG CURRENT vw_agentik_inventario for the 11 original opportunity
 * references and reconciles CCS vs SAG B01 availability.
 *
 * Usage: bun scripts/reconcile-04a3r-opportunities.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });

import { consultaSagJson } from "../lib/connectors/pya/client";
import { getSagConnection } from "../lib/connectors/pya/sag-source-router";

// The 5 mandatory cases from the spec + any others found in the opportunity list
const MANDATORY_REFS = [
  "L-6305",        // B01=0, B04=252 — not opportunity
  "CF-1662283",    // absent or no saldo — not opportunity
  "CG-1591443",    // no saldo — not opportunity
  "CGJ-1332225B",  // not found — not opportunity
  "CT-1021464B",   // stock only in Caldas — not B01
];

async function main() {
  const config = getSagConnection("CURRENT");
  console.log("=== 04A3R RECONCILIATION ===\n");
  console.log("Source: SAG CURRENT (LUDISAM)");
  console.log("Authority: vw_agentik_inventario\n");

  // 1. Query ALL B01 inventory
  const b01Query = `SELECT CODIGO_PRODUCTO, PRODUCTO, LINEA, EXISTENCIA, RESERVADO, DISPONIBLE FROM vw_agentik_inventario WHERE BODEGA LIKE '01 -%'`;
  let b01Rows: Record<string, unknown>[];
  try {
    b01Rows = await consultaSagJson(config, b01Query) as Record<string, unknown>[];
    console.log(`B01 total rows: ${b01Rows.length}`);
  } catch (err) {
    // Fallback: load all and filter
    console.log("LIKE filter failed, loading all bodegas...");
    const allQuery = `SELECT CODIGO_PRODUCTO, PRODUCTO, LINEA, BODEGA, EXISTENCIA, RESERVADO, DISPONIBLE FROM vw_agentik_inventario`;
    const allRows = await consultaSagJson(config, allQuery) as Record<string, unknown>[];
    b01Rows = allRows.filter(r => String(r.BODEGA ?? "").trim().startsWith("01 "));
    console.log(`B01 filtered rows: ${b01Rows.length} (from ${allRows.length} total)`);
  }

  const b01Map = new Map<string, { existencia: number; reservado: number; disponible: number; linea: string; description: string }>();
  for (const r of b01Rows) {
    const code = String(r.CODIGO_PRODUCTO ?? "").trim();
    b01Map.set(code, {
      existencia: Number(r.EXISTENCIA ?? 0),
      reservado: Number(r.RESERVADO ?? 0),
      disponible: Number(r.DISPONIBLE ?? 0),
      linea: String(r.LINEA ?? "").trim(),
      description: String(r.PRODUCTO ?? "").trim(),
    });
  }

  // 2. Query B04 for the mandatory refs (evidence only)
  const b04Query = `SELECT CODIGO_PRODUCTO, EXISTENCIA, RESERVADO, DISPONIBLE FROM vw_agentik_inventario WHERE BODEGA LIKE '04 -%'`;
  let b04Map = new Map<string, { existencia: number; reservado: number; disponible: number }>();
  try {
    const b04Rows = await consultaSagJson(config, b04Query) as Record<string, unknown>[];
    for (const r of b04Rows) {
      const code = String(r.CODIGO_PRODUCTO ?? "").trim();
      b04Map.set(code, {
        existencia: Number(r.EXISTENCIA ?? 0),
        reservado: Number(r.RESERVADO ?? 0),
        disponible: Number(r.DISPONIBLE ?? 0),
      });
    }
  } catch {
    console.log("B04 query failed (non-fatal)");
  }

  // 3. Thresholds
  const thresholds: Record<string, number> = { CS: 100, LT: 200, IMPORT: 10 };
  function resolveLineCode(linea: string): string {
    const u = linea.toUpperCase().trim();
    if (u === "CASTILLITOS") return "CS";
    if (u === "LATIN KIDS") return "LT";
    if (u === "IMPORTACION") return "IMPORT";
    return "OTRO";
  }

  // 4. Reconcile mandatory refs
  console.log("\n=== MANDATORY REFERENCE RECONCILIATION ===\n");
  console.log("| Reference | Line | Threshold | B01 Exist | B01 Reserv | B01 Disp | B04 Exist | Truth State | Decision |");
  console.log("|-----------|------|-----------|-----------|------------|----------|-----------|-------------|----------|");

  for (const ref of MANDATORY_REFS) {
    const b01 = b01Map.get(ref);
    const b04 = b04Map.get(ref);
    const b04Exist = b04?.existencia ?? 0;

    if (!b01) {
      console.log(`| ${ref} | — | — | — | — | — | ${b04Exist} | REFERENCE_NOT_FOUND | NOT opportunity |`);
      continue;
    }

    const line = resolveLineCode(b01.linea);
    const threshold = thresholds[line] ?? 0;
    let truthState: string;
    if (b01.disponible > 0) truthState = "CERTIFIED";
    else if (b01.disponible === 0) truthState = "EMPTY_CERTIFIED";
    else truthState = "OVERCOMMITTED";

    const isOpportunity = b01.disponible > threshold;
    const decision = isOpportunity ? "KEEP opportunity" : "NOT opportunity";

    console.log(`| ${ref} | ${line} | ${threshold} | ${b01.existencia} | ${b01.reservado} | ${b01.disponible} | ${b04Exist} | ${truthState} | ${decision} |`);
  }

  // 5. Summary stats
  console.log("\n=== B01 SUMMARY ===\n");
  console.log(`Total B01 references: ${b01Map.size}`);
  let certified = 0, emptyCertified = 0, overcommitted = 0;
  let aboveCS = 0, aboveLT = 0;
  for (const [_, data] of b01Map) {
    if (data.disponible > 0) certified++;
    else if (data.disponible === 0) emptyCertified++;
    else overcommitted++;

    const line = resolveLineCode(data.linea);
    if (line === "CS" && data.disponible > 100) aboveCS++;
    if (line === "LT" && data.disponible > 200) aboveLT++;
  }
  console.log(`CERTIFIED (disp > 0): ${certified}`);
  console.log(`EMPTY_CERTIFIED (disp = 0): ${emptyCertified}`);
  console.log(`OVERCOMMITTED (disp < 0): ${overcommitted}`);
  console.log(`CS refs above 100 threshold: ${aboveCS}`);
  console.log(`LT refs above 200 threshold: ${aboveLT}`);
}

main().catch(console.error);
