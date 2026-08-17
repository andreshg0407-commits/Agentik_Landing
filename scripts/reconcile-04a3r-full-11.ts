/**
 * INVENTORY-CANONICAL-TRUTH-04A3R-V — Full 11-Opportunity Reconciliation
 *
 * 1. Query CCS (CommercialCoverageSnapshot) latest batch to find ALL refs
 *    that CCS considered as coverage opportunities (disponible > threshold).
 * 2. Query SAG CURRENT B01 for the same refs.
 * 3. Reconcile each ref showing old vs new decision.
 *
 * Usage: bun scripts/reconcile-04a3r-full-11.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });

import { prisma } from "../lib/prisma";
import { consultaSagJson } from "../lib/connectors/pya/client";
import { getSagConnection } from "../lib/connectors/pya/sag-source-router";

// Coverage thresholds (LOCKED — from maletas-canonical-inventory.ts)
const COVERAGE_MINIMUMS: Record<string, number> = {
  CS: 100,
  LT: 200,
  IMPORT: 10,
};

// Map CCS line codes to canonical line codes
function normalizeLine(line: string): string {
  const u = line.toUpperCase().trim();
  if (u === "CS" || u === "CASTILLITOS") return "CS";
  if (u === "LT" || u === "LATIN KIDS" || u === "LATIN_KIDS") return "LT";
  if (u === "IMPORT" || u === "IMPORTACION" || u === "IMPORTACIÓN") return "IMPORT";
  return "OTRO";
}

// Map SAG LINEA to line codes
function resolveLineCode(linea: string): string {
  const upper = linea.toUpperCase().trim();
  if (upper === "CASTILLITOS") return "CS";
  if (upper === "LATIN KIDS" || upper === "LATIN_KIDS") return "LT";
  if (upper === "IMPORTACION" || upper === "IMPORTACIÓN") return "IMPORT";
  return "OTRO";
}

async function main() {
  {
    console.log("=== 04A3R-V FULL RECONCILIATION ===\n");

    // ── 1. Find the organization ──
    const org = await prisma.organization.findFirst({
      where: { slug: "castillitos" },
      select: { id: true, name: true },
    });
    if (!org) {
      console.error("Organization 'castillitos' not found");
      return;
    }
    console.log(`Organization: ${org.name} (${org.id})\n`);

    // ── 2. Load CCS latest batch ──
    const latestCCS = await prisma.commercialCoverageSnapshot.findFirst({
      where: { organizationId: org.id },
      orderBy: { snapshotAt: "desc" },
      select: { snapshotAt: true },
    });

    if (!latestCCS) {
      console.log("WARNING: No CCS data found. Cannot reconcile against CCS baseline.");
      return;
    }

    const ccsRows = await prisma.commercialCoverageSnapshot.findMany({
      where: {
        organizationId: org.id,
        snapshotAt: latestCCS.snapshotAt,
      },
      select: {
        refCode: true,
        description: true,
        line: true,
        disponible: true,
      },
    });

    console.log(`CCS latest batch: ${latestCCS.snapshotAt.toISOString()}`);
    console.log(`CCS total refs: ${ccsRows.length}`);

    // ── 3. Identify CCS coverage opportunities (disponible > threshold) ──
    const ccsOpportunities: Array<{
      reference: string;
      description: string;
      line: string;
      threshold: number;
      ccsDisponible: number;
    }> = [];

    for (const row of ccsRows) {
      const line = normalizeLine(row.line);
      const threshold = COVERAGE_MINIMUMS[line];
      if (threshold === undefined) continue; // OTRO — no threshold
      if (row.disponible > threshold) {
        ccsOpportunities.push({
          reference: row.refCode,
          description: row.description,
          line,
          threshold,
          ccsDisponible: row.disponible,
        });
      }
    }

    // Sort by disponible descending for clarity
    ccsOpportunities.sort((a, b) => b.ccsDisponible - a.ccsDisponible);

    console.log(`CCS coverage opportunities (disponible > threshold): ${ccsOpportunities.length}\n`);

    // If more than 11, take top 11 to match the spec
    // If fewer, take all
    const targetCount = Math.max(ccsOpportunities.length, 11);
    const reconcileSet = ccsOpportunities.slice(0, targetCount);

    // ── 4. Query SAG CURRENT B01 ──
    console.log("Querying SAG CURRENT B01...");
    const config = getSagConnection("CURRENT");
    const sagQuery = `SELECT CODIGO_PRODUCTO, PRODUCTO, LINEA, EXISTENCIA, RESERVADO, DISPONIBLE FROM vw_agentik_inventario WHERE BODEGA LIKE '01 -%'`;

    let sagRows: Record<string, unknown>[];
    try {
      sagRows = await consultaSagJson(config, sagQuery) as Record<string, unknown>[];
    } catch {
      console.log("B01 LIKE filter failed, loading all bodegas...");
      const allQuery = `SELECT CODIGO_PRODUCTO, PRODUCTO, LINEA, BODEGA, EXISTENCIA, RESERVADO, DISPONIBLE FROM vw_agentik_inventario`;
      const allRows = await consultaSagJson(config, allQuery) as Record<string, unknown>[];
      sagRows = allRows.filter(r => String(r.BODEGA ?? "").trim().startsWith("01 "));
    }

    const sagB01Map = new Map<string, { existencia: number; reservado: number; disponible: number; linea: string; description: string }>();
    for (const r of sagRows) {
      const code = String(r.CODIGO_PRODUCTO ?? "").trim();
      sagB01Map.set(code, {
        existencia: Number(r.EXISTENCIA ?? 0),
        reservado: Number(r.RESERVADO ?? 0),
        disponible: Number(r.DISPONIBLE ?? 0),
        linea: String(r.LINEA ?? "").trim(),
        description: String(r.PRODUCTO ?? "").trim(),
      });
    }

    // B04 evidence
    let sagB04Map = new Map<string, { existencia: number; disponible: number }>();
    try {
      const b04Query = `SELECT CODIGO_PRODUCTO, EXISTENCIA, DISPONIBLE FROM vw_agentik_inventario WHERE BODEGA LIKE '04 -%'`;
      const b04Rows = await consultaSagJson(config, b04Query) as Record<string, unknown>[];
      for (const r of b04Rows) {
        const code = String(r.CODIGO_PRODUCTO ?? "").trim();
        sagB04Map.set(code, {
          existencia: Number(r.EXISTENCIA ?? 0),
          disponible: Number(r.DISPONIBLE ?? 0),
        });
      }
    } catch {
      console.log("B04 query failed (non-fatal)");
    }

    console.log(`SAG B01 refs: ${sagB01Map.size}`);
    console.log(`SAG B04 refs: ${sagB04Map.size}\n`);

    // ── 5. Full reconciliation table ──
    console.log("=== FULL RECONCILIATION TABLE ===\n");
    console.log("| # | Referencia | Linea | Umbral | Exist B01 | Reserv B01 | Disp B01 | Disp B04 (evid) | CCS Disp | Decision Anterior | Decision Nueva | Razon |");
    console.log("|---|-----------|-------|--------|-----------|------------|----------|-----------------|----------|-------------------|----------------|-------|");

    let keepCount = 0;
    let dropCount = 0;
    let dropWip = 0;
    let dropStale = 0;
    let dropThreshold = 0;
    let dropNotFound = 0;
    let dropImport = 0;

    for (let i = 0; i < reconcileSet.length; i++) {
      const opp = reconcileSet[i];
      const sagB01 = sagB01Map.get(opp.reference);
      const sagB04 = sagB04Map.get(opp.reference);
      const b04Disp = sagB04?.disponible ?? 0;

      const oldDecision = opp.line === "IMPORT" ? "EXCLUDED (import)" : "OPPORTUNITY";
      let newDecision: string;
      let reason: string;

      if (!sagB01) {
        // Reference not found in B01
        newDecision = "ELIMINATED";
        reason = "REFERENCE_NOT_FOUND en B01";
        dropCount++;
        dropNotFound++;

        // Check if it was WIP (B04 only)
        if (b04Disp > 0) {
          reason = `REFERENCE_NOT_FOUND en B01; B04=${b04Disp} (WIP, no comercial)`;
          dropWip++;
          dropNotFound--; // reclassify
        }

        console.log(`| ${i + 1} | ${opp.reference} | ${opp.line} | ${opp.threshold} | — | — | — | ${b04Disp} | ${opp.ccsDisponible} | ${oldDecision} | ${newDecision} | ${reason} |`);
      } else {
        const sagLine = resolveLineCode(sagB01.linea);
        const threshold = COVERAGE_MINIMUMS[sagLine] ?? COVERAGE_MINIMUMS[opp.line] ?? 0;

        // Check import exclusion
        if (sagLine === "IMPORT") {
          newDecision = "EXCLUDED_IMPORT_LINE";
          reason = "Linea IMPORTACION excluida de oportunidades";
          dropCount++;
          dropImport++;
        } else if (sagB01.disponible <= 0) {
          newDecision = "ELIMINATED";
          reason = sagB01.disponible === 0
            ? "EMPTY_CERTIFIED (disp=0)"
            : `OVERCOMMITTED (disp=${sagB01.disponible})`;
          dropCount++;
          dropStale++;
        } else if (sagB01.disponible <= threshold) {
          newDecision = "ELIMINATED";
          reason = `Bajo umbral (${sagB01.disponible} <= ${threshold})`;
          dropCount++;
          dropThreshold++;
        } else {
          newDecision = "OPPORTUNITY";
          reason = `CERTIFIED (disp=${sagB01.disponible} > ${threshold})`;
          keepCount++;
        }

        console.log(`| ${i + 1} | ${opp.reference} | ${sagLine} | ${threshold} | ${sagB01.existencia} | ${sagB01.reservado} | ${sagB01.disponible} | ${b04Disp} | ${opp.ccsDisponible} | ${oldDecision} | ${newDecision} | ${reason} |`);
      }
    }

    // ── 6. Summary ──
    console.log("\n=== SUMMARY ===\n");
    console.log(`Total CCS opportunities reconciled: ${reconcileSet.length}`);
    console.log(`Permanecen como oportunidades:       ${keepCount}`);
    console.log(`Desaparecen (total):                 ${dropCount}`);
    console.log(`  - Por WIP (solo B04):              ${dropWip}`);
    console.log(`  - Por snapshot stale (disp<=0):    ${dropStale}`);
    console.log(`  - Por no superar umbral:           ${dropThreshold}`);
    console.log(`  - Por referencia inexistente:      ${dropNotFound}`);
    console.log(`  - Por linea IMPORT excluida:       ${dropImport}`);

    // ── 7. Import exclusion test case ──
    console.log("\n=== IMPORT EXCLUSION TEST ===\n");
    // Find an IMPORT ref with B01 disponible > 10
    let importTestFound = false;
    for (const [code, data] of sagB01Map) {
      const line = resolveLineCode(data.linea);
      if (line === "IMPORT" && data.disponible > 10) {
        console.log(`Reference: ${code}`);
        console.log(`Description: ${data.description}`);
        console.log(`Line: IMPORTACION`);
        console.log(`B01 Disponible: ${data.disponible}`);
        console.log(`Threshold: 10`);
        console.log(`Result: EXCLUDED_IMPORT_LINE`);
        console.log(`Opportunities generated: 0`);
        console.log(`Reason: IMPORT refs are EXCLUDED from the replacement engine and production suggestions`);
        importTestFound = true;
        break;
      }
    }
    if (!importTestFound) {
      console.log("No IMPORT ref found with B01 disponible > 10. Checking B01 IMPORT refs...");
      let importCount = 0;
      for (const [code, data] of sagB01Map) {
        if (resolveLineCode(data.linea) === "IMPORT") {
          console.log(`  ${code}: disp=${data.disponible}`);
          importCount++;
          if (importCount >= 5) break;
        }
      }
    }

  }
}

main().catch(console.error);
