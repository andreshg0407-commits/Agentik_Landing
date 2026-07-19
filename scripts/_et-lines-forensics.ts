/**
 * _et-lines-forensics.ts
 *
 * PRODUCTION-ET-SYNC-01 — Phase 7: Forensic investigation of ET 0-lines anomaly.
 *
 * ET (fuente 116) has 3,640 headers in SAG but the standard MOVIMIENTOS_ITEMS
 * query returns 0 lines. This script investigates why.
 *
 * Hypotheses:
 *   H1. ET lines use a different table (not MOVIMIENTOS_ITEMS)
 *   H2. ET lines exist in MOVIMIENTOS_ITEMS but the JOIN condition fails
 *   H3. ET lines genuinely don't exist (ET is header-only in SAG PYA)
 *   H4. ET lines exist but with different column names
 *
 * Usage: npx tsx scripts/_et-lines-forensics.ts
 */

import "dotenv/config";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import { loadSagTestEnv } from "@/lib/sag/env";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";

async function main() {
  console.log("=".repeat(80));
  console.log("ET LINES FORENSICS — Investigating 0-lines anomaly");
  console.log("=".repeat(80));

  const sagEnv = loadSagTestEnv();
  const config: PyaApiConfig = {
    endpointUrl: sagEnv.endpointUrl,
    token: sagEnv.token,
    database: sagEnv.database,
  };

  // ── Test 1: Get a sample ET header ──────────────────────────────────────────
  console.log("\n--- TEST 1: Sample ET headers ---");
  const sampleHeaders = await consultaSagJson(config, `
    SELECT TOP 5 m.*
    FROM MOVIMIENTOS m
    WHERE m.ka_ni_fuente = 116
    ORDER BY m.d_fecha_documento DESC
  `);
  console.log(`Sample ET headers: ${sampleHeaders.length}`);
  for (const h of sampleHeaders) {
    console.log(`  ka_nl_movimiento=${h.ka_nl_movimiento} | doc#=${h.n_numero_documento} | date=${h.d_fecha_documento} | bodega=${h.ka_nl_bodega}`);
  }

  if (sampleHeaders.length === 0) {
    console.log("No ET headers found. Exiting.");
    return;
  }

  const sampleMovId = Number(sampleHeaders[0].ka_nl_movimiento);

  // ── Test 2: Direct MOVIMIENTOS_ITEMS query without JOIN ──────────────────
  console.log("\n--- TEST 2: Direct MOVIMIENTOS_ITEMS (no JOIN) ---");
  const directItems = await consultaSagJson(config, `
    SELECT TOP 10 mi.*
    FROM MOVIMIENTOS_ITEMS mi
    WHERE mi.ka_nl_movimiento = ${sampleMovId}
  `);
  console.log(`Direct items for movimiento ${sampleMovId}: ${directItems.length}`);
  if (directItems.length > 0) {
    console.log("  First item columns:", Object.keys(directItems[0]).join(", "));
    console.log("  First item:", JSON.stringify(directItems[0], null, 2));
  }

  // ── Test 3: Count all MOVIMIENTOS_ITEMS for ET fuente ───────────────────
  console.log("\n--- TEST 3: Count items for ALL ET headers ---");
  const countResult = await consultaSagJson(config, `
    SELECT COUNT(*) as total
    FROM MOVIMIENTOS_ITEMS mi
    INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mi.ka_nl_movimiento
    WHERE m.ka_ni_fuente = 116
  `);
  console.log(`Total ET items in MOVIMIENTOS_ITEMS: ${countResult[0]?.total ?? "N/A"}`);

  // ── Test 4: Count items for first 5 ET headers individually ─────────────
  console.log("\n--- TEST 4: Items per ET header (first 5) ---");
  for (const h of sampleHeaders) {
    const movId = Number(h.ka_nl_movimiento);
    const items = await consultaSagJson(config, `
      SELECT COUNT(*) as total
      FROM MOVIMIENTOS_ITEMS mi
      WHERE mi.ka_nl_movimiento = ${movId}
    `);
    console.log(`  movimiento ${movId} (doc#${h.n_numero_documento}): ${items[0]?.total ?? 0} items`);
  }

  // ── Test 5: Check if ET uses a different items relationship ─────────────
  console.log("\n--- TEST 5: Alternative item relationships ---");

  // Check n_numero_documento linkage
  const sampleDocNum = String(sampleHeaders[0].n_numero_documento);
  const byDocNum = await consultaSagJson(config, `
    SELECT TOP 5 mi.*
    FROM MOVIMIENTOS_ITEMS mi
    INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mi.ka_nl_movimiento
    WHERE m.n_numero_documento = ${sampleDocNum}
    AND m.ka_ni_fuente = 116
  `);
  console.log(`Items by document number ${sampleDocNum}: ${byDocNum.length}`);

  // ── Test 6: Compare with OP (fuente 33) to verify the query works ──────
  console.log("\n--- TEST 6: OP (fuente 33) items for comparison ---");
  const opSample = await consultaSagJson(config, `
    SELECT TOP 1 m.ka_nl_movimiento, m.n_numero_documento
    FROM MOVIMIENTOS m
    WHERE m.ka_ni_fuente = 33
    ORDER BY m.d_fecha_documento DESC
  `);
  if (opSample.length > 0) {
    const opMovId = Number(opSample[0].ka_nl_movimiento);
    const opItems = await consultaSagJson(config, `
      SELECT COUNT(*) as total
      FROM MOVIMIENTOS_ITEMS mi
      WHERE mi.ka_nl_movimiento = ${opMovId}
    `);
    console.log(`  OP movimiento ${opMovId} (doc#${opSample[0].n_numero_documento}): ${opItems[0]?.total ?? 0} items`);
  }

  // ── Test 7: Check if ET header itself contains reference data ───────────
  console.log("\n--- TEST 7: ET header field inspection ---");
  const fullHeader = sampleHeaders[0];
  const relevantFields: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(fullHeader)) {
    if (val !== null && val !== "" && val !== 0 && val !== "0") {
      relevantFields[key] = val;
    }
  }
  console.log("Non-empty/non-zero fields in ET header:");
  for (const [key, val] of Object.entries(relevantFields)) {
    console.log(`  ${key} = ${val}`);
  }

  // ── Test 8: Check ss_remision (cross-reference to OP) ──────────────────
  console.log("\n--- TEST 8: ET cross-references (ss_remision) ---");
  const remisionSample = await consultaSagJson(config, `
    SELECT TOP 10 m.ka_nl_movimiento, m.n_numero_documento, m.ss_remision, m.d_fecha_documento
    FROM MOVIMIENTOS m
    WHERE m.ka_ni_fuente = 116
    AND m.ss_remision IS NOT NULL
    AND m.ss_remision <> ''
    ORDER BY m.d_fecha_documento DESC
  `);
  console.log(`ET headers with ss_remision: ${remisionSample.length}`);
  for (const r of remisionSample.slice(0, 5)) {
    console.log(`  ET #${r.n_numero_documento} → remision: ${r.ss_remision} (date: ${r.d_fecha_documento})`);
  }

  // Count how many ET headers have non-null ss_remision
  const remisionCount = await consultaSagJson(config, `
    SELECT COUNT(*) as total
    FROM MOVIMIENTOS m
    WHERE m.ka_ni_fuente = 116
    AND m.ss_remision IS NOT NULL
    AND m.ss_remision <> ''
  `);
  console.log(`Total ET headers with ss_remision: ${remisionCount[0]?.total ?? 0} / 3640`);

  console.log("\n" + "=".repeat(80));
  console.log("ET LINES FORENSICS COMPLETE");
  console.log("=".repeat(80));
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
