/**
 * INVENTORY-CANONICAL-TRUTH-04A — Phase F: Reconciliation
 *
 * Compare the numbers the user sees in the UI against SAG canonical truth.
 * User-reported numbers: 4,007 refs, 89,302 units, 1,327,589 "En proceso"
 *
 * Goal: Identify where each number comes from and whether it's correct.
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: new URL("../.env", import.meta.url).pathname });

import { createRequire } from "module";
const _require = createRequire(import.meta.url);
try { require.cache[_require.resolve("server-only")] = { id: "server-only", filename: "server-only", loaded: true, exports: {} } as any; } catch {}

const { consultaSagJson } = _require("@/lib/connectors/pya/client");
const { getSagConnection } = _require("@/lib/connectors/pya/sag-source-router");

// Import warehouse profiles
const profiles = _require("@/lib/comercial/inventory/castillitos-warehouse-profiles");

async function q(sql: string): Promise<any[]> {
  const config = getSagConnection("CURRENT");
  try {
    return await consultaSagJson(config, sql) as any[];
  } catch (e: any) {
    console.log(`  FAILED: ${e.message?.substring(0, 150)}`);
    return [];
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Phase F: Number Reconciliation");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // ── 1. Total refs in view (unfiltered) ──
  console.log("=== 1. REFERENCE COUNT RECONCILIATION ===\n");

  const viewTotal = await q("SELECT COUNT(DISTINCT CODIGO_PRODUCTO) AS n FROM vw_agentik_inventario");
  console.log(`  vw_agentik_inventario distinct products: ${viewTotal[0]?.n}`);

  // Commercial-only refs (using warehouse classification)
  const viewRows = await q("SELECT CODIGO_PRODUCTO, BODEGA, EXISTENCIA, DISPONIBLE FROM vw_agentik_inventario");

  const commercialRefs = new Set<string>();
  const allRefs = new Set<string>();
  let commercialUnits = 0;
  let allUnits = 0;
  let commercialAvailable = 0;
  let rawMaterialUnits = 0;
  let wipUnits = 0;
  let importUnits = 0;

  for (const r of viewRows) {
    const code = String(r.CODIGO_PRODUCTO ?? "").trim();
    const bodega = String(r.BODEGA ?? "").trim();
    const existencia = Number(r.EXISTENCIA ?? 0);
    const disponible = Number(r.DISPONIBLE ?? 0);

    allRefs.add(code);
    allUnits += existencia;

    const profile = profiles.getWarehouseProfileByViewBodega(bodega);
    if (!profile) continue;

    if (profile.commercialScope === "COMMERCIAL") {
      commercialRefs.add(code);
      commercialUnits += existencia;
      commercialAvailable += disponible;
    } else if (profile.commercialScope === "SUPPLY_CHAIN") {
      switch (profile.role) {
        case "RAW_MATERIAL": rawMaterialUnits += existencia; break;
        case "WIP": wipUnits += existencia; break;
        case "IMPORT_STAGING": importUnits += existencia; break;
      }
    }
  }

  console.log(`\n  ALL bodegas:           ${allRefs.size} refs, ${allUnits.toLocaleString()} units`);
  console.log(`  COMMERCIAL bodegas:    ${commercialRefs.size} refs, ${commercialUnits.toLocaleString()} units (available: ${commercialAvailable.toLocaleString()})`);
  console.log(`  RAW MATERIAL:          ${rawMaterialUnits.toLocaleString()} units`);
  console.log(`  WIP:                   ${wipUnits.toLocaleString()} units`);
  console.log(`  IMPORT STAGING:        ${importUnits.toLocaleString()} units`);

  // ── 2. Production "En proceso" ──
  console.log("\n=== 2. PRODUCTION RECONCILIATION ===\n");

  const prodStats = await q(
    "SELECT ESTADO_PRODUCCION, COUNT(*) AS cnt, SUM(ISNULL(CANTIDAD_PROGRAMADA, 0)) AS prog, SUM(ISNULL(CANTIDAD_PRODUCIDA, 0)) AS prod FROM vw_agentik_produccion GROUP BY ESTADO_PRODUCCION"
  );
  let totalProgramada = 0;
  let totalProducida = 0;
  for (const r of prodStats) {
    console.log(`  ${r.ESTADO_PRODUCCION}: ${r.cnt} orders, programada=${Number(r.prog).toLocaleString()}, producida=${Number(r.prod).toLocaleString()}`);
    totalProgramada += Number(r.prog);
    totalProducida += Number(r.prod);
  }
  console.log(`\n  Total programada: ${totalProgramada.toLocaleString()}`);
  console.log(`  Total producida: ${totalProducida.toLocaleString()}`);
  console.log(`  Pending (programada - producida): ${(totalProgramada - totalProducida).toLocaleString()}`);

  // ── 3. Compare against user-reported numbers ──
  console.log("\n=== 3. COMPARISON WITH USER-REPORTED NUMBERS ===\n");
  console.log("  User says: 4,007 refs | 89,302 units | 1,327,589 en proceso\n");

  console.log(`  4,007 refs → SAG ALL: ${allRefs.size} refs (delta: ${allRefs.size - 4007})`);
  console.log(`           → SAG COMMERCIAL: ${commercialRefs.size} refs`);
  console.log(`  89,302 units → SAG ALL existencia: ${allUnits.toLocaleString()} (delta: ${(allUnits - 89302).toLocaleString()})`);
  console.log(`              → SAG COMMERCIAL existencia: ${commercialUnits.toLocaleString()}`);
  console.log(`  1,327,589 en proceso → SAG programada (all): ${totalProgramada.toLocaleString()} (delta: ${(totalProgramada - 1327589).toLocaleString()})`);
  console.log(`                      → SAG producida (all): ${totalProducida.toLocaleString()}`);

  // ── 4. CommercialCoverageSnapshot comparison ──
  console.log("\n=== 4. COVERAGE SNAPSHOT MODEL COMPARISON ===\n");

  // The CommercialCoverageSnapshot uses disponible and pendingOrdersQty
  // from the SAG inventory refresh pipeline, NOT directly from the view
  console.log("  CommercialCoverageSnapshot reads from Prisma (PIL sync)");
  console.log("  The view is the SAG source; the pipeline transforms before storage.");
  console.log("  Differences are expected if:");
  console.log("    - PIL sync hasn't run since the last SAG saldo update");
  console.log("    - CRM reservations modify the disponible after sync");
  console.log("    - Pipeline filters or aggregates differently than the view");

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Phase F Complete");
  console.log("═══════════════════════════════════════════════════════════════");
}

main().catch(console.error);
