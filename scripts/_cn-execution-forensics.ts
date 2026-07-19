/**
 * _cn-execution-forensics.ts
 *
 * PRODUCTION-CN-EXECUTION-FORENSICS-01
 *
 * Forensic investigation of CN (fuente 80 = Consumos Insumos y Telas).
 * Discovery-only: queries SAG, analyzes structure, documents findings.
 * Does NOT sync or write to Prisma (except reading existing OP/ET data).
 *
 * Phases:
 *   1. Archaeology — what CN code exists
 *   2. Forensic Profile — statistical overview
 *   3. Structure Analysis — header + line fields
 *   4. CN ↔ OP Relationship
 *   5. CN ↔ ET Relationship
 *   6. Reference Analysis — chronological reconstruction
 *   7. Bodega Analysis — warehouse participation
 *   8. Event Classification — what CN represents
 *
 * Usage: npx tsx scripts/_cn-execution-forensics.ts
 */

import "dotenv/config";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import { loadSagTestEnv } from "@/lib/sag/env";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";
import { prisma } from "@/lib/prisma";

const CASTILLITOS_ORG_SLUG = "castillitos";

async function main() {
  console.log("=".repeat(80));
  console.log("PRODUCTION-CN-EXECUTION-FORENSICS-01");
  console.log("CN (fuente 80) — Forensic Investigation");
  console.log("=".repeat(80));
  console.log(`Date: ${new Date().toISOString()}`);

  const sagEnv = loadSagTestEnv();
  const config: PyaApiConfig = {
    endpointUrl: sagEnv.endpointUrl,
    token: sagEnv.token,
    database: sagEnv.database,
  };

  const db = prisma as any;
  const org = await db.organization.findUnique({
    where: { slug: CASTILLITOS_ORG_SLUG },
    select: { id: true, name: true },
  });
  if (!org) { console.error("ERROR: Castillitos not found"); process.exit(1); }
  console.log(`Org: ${org.name} (${org.id})\n`);

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — FORENSIC PROFILE
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("=".repeat(80));
  console.log("PHASE 2: FORENSIC PROFILE — Statistical Overview");
  console.log("=".repeat(80));

  // 2a. Header count
  const headerCount = await consultaSagJson(config, `
    SELECT COUNT(*) as total
    FROM MOVIMIENTOS m
    WHERE m.ka_ni_fuente = 80
  `);
  console.log(`\n  CN headers total: ${headerCount[0]?.total}`);

  // 2b. Line count
  const lineCount = await consultaSagJson(config, `
    SELECT COUNT(*) as total
    FROM MOVIMIENTOS_ITEMS mi
    INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mi.ka_nl_movimiento
    WHERE m.ka_ni_fuente = 80
  `);
  console.log(`  CN lines total: ${lineCount[0]?.total}`);

  // 2c. Date range
  const dateRange = await consultaSagJson(config, `
    SELECT MIN(m.d_fecha_documento) as earliest, MAX(m.d_fecha_documento) as latest
    FROM MOVIMIENTOS m
    WHERE m.ka_ni_fuente = 80
  `);
  console.log(`  Earliest CN: ${dateRange[0]?.earliest}`);
  console.log(`  Latest CN: ${dateRange[0]?.latest}`);

  // 2d. Doc number range
  const docRange = await consultaSagJson(config, `
    SELECT MIN(m.n_numero_documento) as min_doc, MAX(m.n_numero_documento) as max_doc
    FROM MOVIMIENTOS m
    WHERE m.ka_ni_fuente = 80
  `);
  console.log(`  Doc# range: ${docRange[0]?.min_doc} — ${docRange[0]?.max_doc}`);

  // 2e. Monthly frequency (last 12 months)
  console.log(`\n  Monthly frequency (recent):`);
  const monthlyFreq = await consultaSagJson(config, `
    SELECT
      YEAR(m.d_fecha_documento) as yr,
      MONTH(m.d_fecha_documento) as mo,
      COUNT(*) as cnt
    FROM MOVIMIENTOS m
    WHERE m.ka_ni_fuente = 80
      AND m.d_fecha_documento >= '2025-07-01'
    GROUP BY YEAR(m.d_fecha_documento), MONTH(m.d_fecha_documento)
    ORDER BY yr DESC, mo DESC
  `);
  for (const r of monthlyFreq) {
    console.log(`    ${r.yr}-${String(r.mo).padStart(2, "0")}: ${r.cnt} documents`);
  }

  // 2f. Open vs closed
  const closedStats = await consultaSagJson(config, `
    SELECT
      m.sc_dcto_cerrado,
      COUNT(*) as cnt
    FROM MOVIMIENTOS m
    WHERE m.ka_ni_fuente = 80
    GROUP BY m.sc_dcto_cerrado
  `);
  console.log(`\n  Open/Closed status:`);
  for (const r of closedStats) {
    console.log(`    sc_dcto_cerrado='${r.sc_dcto_cerrado}': ${r.cnt}`);
  }

  // 2g. Unique references in CN lines
  const uniqueRefs = await consultaSagJson(config, `
    SELECT COUNT(DISTINCT v.k_sc_codigo_articulo) as total
    FROM MOVIMIENTOS_ITEMS mi
    INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mi.ka_nl_movimiento
    LEFT JOIN v_articulos v ON v.ka_nl_articulo = mi.ka_nl_articulo
    WHERE m.ka_ni_fuente = 80
  `);
  console.log(`  Unique references in CN lines: ${uniqueRefs[0]?.total}`);

  // 2h. Lines per header distribution
  const linesPerHeader = await consultaSagJson(config, `
    SELECT
      CASE
        WHEN cnt = 0 THEN '0 lines'
        WHEN cnt BETWEEN 1 AND 5 THEN '1-5 lines'
        WHEN cnt BETWEEN 6 AND 10 THEN '6-10 lines'
        WHEN cnt BETWEEN 11 AND 20 THEN '11-20 lines'
        WHEN cnt BETWEEN 21 AND 50 THEN '21-50 lines'
        ELSE '50+ lines'
      END as bucket,
      COUNT(*) as headers
    FROM (
      SELECT m.ka_nl_movimiento, COUNT(mi.ka_nl_movimiento_item) as cnt
      FROM MOVIMIENTOS m
      LEFT JOIN MOVIMIENTOS_ITEMS mi ON mi.ka_nl_movimiento = m.ka_nl_movimiento
      WHERE m.ka_ni_fuente = 80
      GROUP BY m.ka_nl_movimiento
    ) sub
    GROUP BY
      CASE
        WHEN cnt = 0 THEN '0 lines'
        WHEN cnt BETWEEN 1 AND 5 THEN '1-5 lines'
        WHEN cnt BETWEEN 6 AND 10 THEN '6-10 lines'
        WHEN cnt BETWEEN 11 AND 20 THEN '11-20 lines'
        WHEN cnt BETWEEN 21 AND 50 THEN '21-50 lines'
        ELSE '50+ lines'
      END
    ORDER BY MIN(cnt)
  `);
  console.log(`\n  Lines per CN header distribution:`);
  for (const r of linesPerHeader) {
    console.log(`    ${String(r.bucket).padEnd(12)}: ${r.headers} headers`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3 — STRUCTURE ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 3: STRUCTURE ANALYSIS — Header + Line Fields");
  console.log("=".repeat(80));

  // 3a. Sample CN headers (5 most recent)
  const sampleHeaders = await consultaSagJson(config, `
    SELECT TOP 5 m.*
    FROM MOVIMIENTOS m
    WHERE m.ka_ni_fuente = 80
    ORDER BY m.d_fecha_documento DESC
  `);
  console.log(`\n  Sample CN headers (${sampleHeaders.length}):`);
  for (const h of sampleHeaders) {
    console.log(`\n  --- CN #${h.n_numero_documento} (movId=${h.ka_nl_movimiento}, date=${h.d_fecha_documento}) ---`);
    const nonEmpty: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(h)) {
      if (v !== null && v !== "" && v !== 0 && v !== "0" && v !== undefined) {
        nonEmpty[k] = v;
      }
    }
    for (const [k, v] of Object.entries(nonEmpty)) {
      console.log(`    ${k} = ${v}`);
    }
  }

  // 3b. Sample CN lines (from most recent header)
  if (sampleHeaders.length > 0) {
    const sampleMovId = Number(sampleHeaders[0].ka_nl_movimiento);
    const sampleLines = await consultaSagJson(config, `
      SELECT TOP 10 mi.*, v.k_sc_codigo_articulo, v.sc_detalle_articulo
      FROM MOVIMIENTOS_ITEMS mi
      LEFT JOIN v_articulos v ON v.ka_nl_articulo = mi.ka_nl_articulo
      WHERE mi.ka_nl_movimiento = ${sampleMovId}
    `);
    console.log(`\n  Sample CN lines for movimiento ${sampleMovId} (${sampleLines.length} lines):`);
    for (const l of sampleLines.slice(0, 5)) {
      console.log(`\n  --- Line item (itemId=${l.ka_nl_movimiento_item}) ---`);
      const nonEmpty: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(l)) {
        if (v !== null && v !== "" && v !== 0 && v !== "0" && v !== undefined) {
          nonEmpty[k] = v;
        }
      }
      for (const [k, v] of Object.entries(nonEmpty)) {
        console.log(`    ${k} = ${v}`);
      }
    }

    // 3c. Check what fields CN lines ALWAYS have
    console.log(`\n  CN line field population analysis (sample of 100 lines):`);
    const fieldSample = await consultaSagJson(config, `
      SELECT TOP 100 mi.*, v.k_sc_codigo_articulo, v.sc_detalle_articulo
      FROM MOVIMIENTOS_ITEMS mi
      INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mi.ka_nl_movimiento
      LEFT JOIN v_articulos v ON v.ka_nl_articulo = mi.ka_nl_articulo
      WHERE m.ka_ni_fuente = 80
      ORDER BY m.d_fecha_documento DESC
    `);
    if (fieldSample.length > 0) {
      const fieldCounts: Record<string, number> = {};
      for (const row of fieldSample) {
        for (const [k, v] of Object.entries(row)) {
          if (v !== null && v !== "" && v !== 0 && v !== "0" && v !== undefined) {
            fieldCounts[k] = (fieldCounts[k] ?? 0) + 1;
          }
        }
      }
      const sorted = Object.entries(fieldCounts).sort((a, b) => b[1] - a[1]);
      for (const [field, count] of sorted) {
        const pct = ((count / fieldSample.length) * 100).toFixed(0);
        console.log(`    ${field.padEnd(30)} ${count}/${fieldSample.length} (${pct}%)`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 4 — CN ↔ OP RELATIONSHIP
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 4: CN ↔ OP RELATIONSHIP");
  console.log("=".repeat(80));

  // 4a. Check ss_remision field (cross-reference used by ET for OP linkage)
  const remisionStats = await consultaSagJson(config, `
    SELECT
      CASE
        WHEN m.ss_remision IS NOT NULL AND m.ss_remision <> '' THEN 'HAS_REMISION'
        ELSE 'NO_REMISION'
      END as status,
      COUNT(*) as cnt
    FROM MOVIMIENTOS m
    WHERE m.ka_ni_fuente = 80
    GROUP BY
      CASE
        WHEN m.ss_remision IS NOT NULL AND m.ss_remision <> '' THEN 'HAS_REMISION'
        ELSE 'NO_REMISION'
      END
  `);
  console.log(`\n  ss_remision (OP cross-reference) on CN headers:`);
  for (const r of remisionStats) {
    console.log(`    ${r.status}: ${r.cnt}`);
  }

  // 4b. Sample ss_remision values
  const remisionSample = await consultaSagJson(config, `
    SELECT TOP 10 m.ka_nl_movimiento, m.n_numero_documento, m.ss_remision,
           m.d_fecha_documento, m.sv_observaciones
    FROM MOVIMIENTOS m
    WHERE m.ka_ni_fuente = 80
      AND m.ss_remision IS NOT NULL AND m.ss_remision <> ''
    ORDER BY m.d_fecha_documento DESC
  `);
  console.log(`\n  Sample CN ss_remision values:`);
  for (const r of remisionSample) {
    console.log(`    CN #${r.n_numero_documento} → remision: "${r.ss_remision}" (${r.d_fecha_documento})`);
    if (r.sv_observaciones) {
      const obs = String(r.sv_observaciones).substring(0, 120);
      console.log(`      observaciones: "${obs}"`);
    }
  }

  // 4c. Match CN references against OP references in Agentik DB
  console.log(`\n  CN references vs OP references (via SAG lines):`);
  const cnRefSample = await consultaSagJson(config, `
    SELECT DISTINCT TOP 200 v.k_sc_codigo_articulo
    FROM MOVIMIENTOS_ITEMS mi
    INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mi.ka_nl_movimiento
    LEFT JOIN v_articulos v ON v.ka_nl_articulo = mi.ka_nl_articulo
    WHERE m.ka_ni_fuente = 80
      AND v.k_sc_codigo_articulo IS NOT NULL
      AND m.d_fecha_documento >= '2025-01-01'
  `);
  const cnRefs = new Set(cnRefSample.map((r: any) => String(r.k_sc_codigo_articulo)));

  // Compare with OP lines in Agentik DB
  const opRefs = await db.productionOrderLine.findMany({
    where: { organizationId: org.id },
    distinct: ["referenceCode"],
    select: { referenceCode: true },
  });
  const opRefSet = new Set(opRefs.map((r: any) => r.referenceCode));

  let overlap = 0;
  let cnOnly = 0;
  for (const ref of cnRefs) {
    if (opRefSet.has(ref)) overlap++;
    else cnOnly++;
  }
  console.log(`    CN refs (2025+, sample 200): ${cnRefs.size}`);
  console.log(`    OP refs (all):               ${opRefSet.size}`);
  console.log(`    Overlap:                     ${overlap} (${cnRefs.size > 0 ? ((overlap / cnRefs.size) * 100).toFixed(1) : "N/A"}%)`);
  console.log(`    CN-only:                     ${cnOnly}`);

  // 4d. Check sv_observaciones for OP references
  const obsWithOP = await consultaSagJson(config, `
    SELECT TOP 10 m.n_numero_documento, m.sv_observaciones, m.ss_remision, m.d_fecha_documento
    FROM MOVIMIENTOS m
    WHERE m.ka_ni_fuente = 80
      AND m.sv_observaciones IS NOT NULL
      AND m.sv_observaciones <> ''
    ORDER BY m.d_fecha_documento DESC
  `);
  console.log(`\n  Sample CN observaciones:`);
  for (const r of obsWithOP) {
    const obs = String(r.sv_observaciones).substring(0, 150);
    console.log(`    CN #${r.n_numero_documento}: "${obs}"`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 5 — CN ↔ ET RELATIONSHIP
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 5: CN ↔ ET RELATIONSHIP");
  console.log("=".repeat(80));

  // 5a. Find common ss_remision values between CN and ET
  const cnRemisions = await consultaSagJson(config, `
    SELECT DISTINCT m.ss_remision
    FROM MOVIMIENTOS m
    WHERE m.ka_ni_fuente = 80
      AND m.ss_remision IS NOT NULL AND m.ss_remision <> ''
  `);
  const cnRemisionSet = new Set(cnRemisions.map((r: any) => String(r.ss_remision)));

  const etRemisions = await consultaSagJson(config, `
    SELECT DISTINCT m.ss_remision
    FROM MOVIMIENTOS m
    WHERE m.ka_ni_fuente = 116
      AND m.ss_remision IS NOT NULL AND m.ss_remision <> ''
  `);
  const etRemisionSet = new Set(etRemisions.map((r: any) => String(r.ss_remision)));

  let remisionOverlap = 0;
  for (const r of cnRemisionSet) {
    if (etRemisionSet.has(r)) remisionOverlap++;
  }
  console.log(`\n  CN unique ss_remision values: ${cnRemisionSet.size}`);
  console.log(`  ET unique ss_remision values: ${etRemisionSet.size}`);
  console.log(`  Shared ss_remision (CN ∩ ET):  ${remisionOverlap}`);
  console.log(`  CN→ET linkage rate:            ${cnRemisionSet.size > 0 ? ((remisionOverlap / cnRemisionSet.size) * 100).toFixed(1) : "N/A"}%`);

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 6 — REFERENCE ANALYSIS (Chronological Reconstruction)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 6: REFERENCE ANALYSIS — Chronological Reconstruction");
  console.log("=".repeat(80));

  // 6a. Pick a well-known reference that appears in CN, OP, and Bodega 01
  // Find a reference that exists in CN lines
  const knownRef = await consultaSagJson(config, `
    SELECT TOP 1 v.k_sc_codigo_articulo, COUNT(*) as cnt
    FROM MOVIMIENTOS_ITEMS mi
    INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mi.ka_nl_movimiento
    LEFT JOIN v_articulos v ON v.ka_nl_articulo = mi.ka_nl_articulo
    WHERE m.ka_ni_fuente = 80
      AND v.k_sc_codigo_articulo IS NOT NULL
      AND m.d_fecha_documento >= '2025-01-01'
    GROUP BY v.k_sc_codigo_articulo
    HAVING COUNT(*) >= 5
    ORDER BY COUNT(*) DESC
  `);

  if (knownRef.length > 0) {
    const ref = String(knownRef[0].k_sc_codigo_articulo);
    console.log(`\n  Reconstructing lifecycle for reference: ${ref} (${knownRef[0].cnt} CN appearances)`);

    // OP events for this reference
    console.log(`\n  --- OP events (fuente 33) ---`);
    const opEvents = await consultaSagJson(config, `
      SELECT m.n_numero_documento, m.d_fecha_documento, m.ss_remision,
             mi.n_cantidad, mi.ss_talla, mi.ss_color
      FROM MOVIMIENTOS m
      INNER JOIN MOVIMIENTOS_ITEMS mi ON mi.ka_nl_movimiento = m.ka_nl_movimiento
      LEFT JOIN v_articulos v ON v.ka_nl_articulo = mi.ka_nl_articulo
      WHERE m.ka_ni_fuente = 33
        AND v.k_sc_codigo_articulo = '${ref}'
      ORDER BY m.d_fecha_documento DESC
    `);
    console.log(`    Found: ${opEvents.length} OP lines`);
    for (const e of opEvents.slice(0, 5)) {
      console.log(`    OP #${e.n_numero_documento} | ${e.d_fecha_documento} | talla=${e.ss_talla} color=${e.ss_color} qty=${e.n_cantidad}`);
    }

    // CN events for this reference
    console.log(`\n  --- CN events (fuente 80) ---`);
    const cnEvents = await consultaSagJson(config, `
      SELECT m.n_numero_documento, m.d_fecha_documento, m.ss_remision,
             mi.n_cantidad, mi.ss_talla, mi.ss_color, mi.ka_nl_bodega,
             m.sv_observaciones
      FROM MOVIMIENTOS m
      INNER JOIN MOVIMIENTOS_ITEMS mi ON mi.ka_nl_movimiento = m.ka_nl_movimiento
      LEFT JOIN v_articulos v ON v.ka_nl_articulo = mi.ka_nl_articulo
      WHERE m.ka_ni_fuente = 80
        AND v.k_sc_codigo_articulo = '${ref}'
      ORDER BY m.d_fecha_documento DESC
    `);
    console.log(`    Found: ${cnEvents.length} CN lines`);
    for (const e of cnEvents.slice(0, 10)) {
      console.log(`    CN #${e.n_numero_documento} | ${e.d_fecha_documento} | talla=${e.ss_talla} color=${e.ss_color} qty=${e.n_cantidad} bodega=${e.ka_nl_bodega} remision=${e.ss_remision}`);
    }

    // ET events that share ss_remision with these CN events
    const cnRemisionValues = [...new Set(cnEvents.map((e: any) => String(e.ss_remision)).filter((r: string) => r && r !== "null" && r !== "undefined" && r !== ""))];
    if (cnRemisionValues.length > 0) {
      console.log(`\n  --- ET events matching CN ss_remision values ---`);
      // Parse OP numbers from remision (format: "XXXX-Y" → take first part)
      const opNumbers = [...new Set(cnRemisionValues.map(r => r.split("-")[0]))];
      console.log(`    OP numbers derived from CN remision: ${opNumbers.join(", ")}`);

      for (const opNum of opNumbers.slice(0, 3)) {
        const etMatch = await consultaSagJson(config, `
          SELECT m.n_numero_documento, m.d_fecha_documento, m.ss_remision
          FROM MOVIMIENTOS m
          WHERE m.ka_ni_fuente = 116
            AND m.ss_remision LIKE '${opNum}-%'
          ORDER BY m.d_fecha_documento
        `);
        console.log(`    ET matching OP#${opNum}: ${etMatch.length} events`);
        for (const e of etMatch.slice(0, 3)) {
          console.log(`      ET #${e.n_numero_documento} | ${e.d_fecha_documento} | remision=${e.ss_remision}`);
        }
      }
    }

    // Timeline: OP date → CN dates → ET date
    console.log(`\n  --- Timeline reconstruction for ${ref} ---`);
    if (opEvents.length > 0) {
      const opDate = String(opEvents[opEvents.length - 1]?.d_fecha_documento ?? "").split("T")[0];
      console.log(`    OP created:  ${opDate}`);
    }
    if (cnEvents.length > 0) {
      const cnDates = cnEvents.map((e: any) => String(e.d_fecha_documento).split("T")[0]);
      const uniqueCnDates = [...new Set(cnDates)].sort();
      console.log(`    CN events:   ${uniqueCnDates.join(", ")} (${cnEvents.length} total lines)`);

      // Check: does CN occur before ET?
      const cnFirst = uniqueCnDates[0];
      const cnLast = uniqueCnDates[uniqueCnDates.length - 1];
      console.log(`    CN first:    ${cnFirst}`);
      console.log(`    CN last:     ${cnLast}`);
    }

    // Check if CN occurs multiple times for same reference
    const cnDocCount = new Set(cnEvents.map((e: any) => e.n_numero_documento)).size;
    console.log(`    CN documents for this ref: ${cnDocCount}`);
    console.log(`    CN lines for this ref:     ${cnEvents.length}`);
    console.log(`    CN occurs multiple times:  ${cnDocCount > 1 ? "YES" : "NO"}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 7 — BODEGA ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 7: BODEGA ANALYSIS — Warehouse Participation");
  console.log("=".repeat(80));

  // 7a. Header-level bodega — SKIPPED: ka_nl_bodega does NOT exist on MOVIMIENTOS headers for CN.
  //     Bodega lives ONLY on MOVIMIENTOS_ITEMS lines.
  console.log(`\n  CN header-level bodega: N/A — ka_nl_bodega does NOT exist on MOVIMIENTOS headers for CN`);

  // 7b. Line-level bodega (ka_nl_bodega on MOVIMIENTOS_ITEMS)
  const lineBodega = await consultaSagJson(config, `
    SELECT
      mi.ka_nl_bodega,
      COUNT(*) as cnt
    FROM MOVIMIENTOS_ITEMS mi
    INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mi.ka_nl_movimiento
    WHERE m.ka_ni_fuente = 80
    GROUP BY mi.ka_nl_bodega
    ORDER BY COUNT(*) DESC
  `);
  console.log(`\n  CN line-level bodega (ka_nl_bodega on MOVIMIENTOS_ITEMS):`);
  for (const r of lineBodega) {
    console.log(`    bodega=${r.ka_nl_bodega}: ${r.cnt} lines`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 8 — EVENT CLASSIFICATION (Quantities + Patterns)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 8: EVENT CLASSIFICATION — Quantities & Patterns");
  console.log("=".repeat(80));

  // 8a. Quantity distribution
  const qtyStats = await consultaSagJson(config, `
    SELECT
      MIN(mi.n_cantidad) as min_qty,
      MAX(mi.n_cantidad) as max_qty,
      AVG(mi.n_cantidad) as avg_qty,
      SUM(mi.n_cantidad) as total_qty
    FROM MOVIMIENTOS_ITEMS mi
    INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mi.ka_nl_movimiento
    WHERE m.ka_ni_fuente = 80
  `);
  console.log(`\n  Quantity statistics across all CN lines:`);
  console.log(`    Min quantity:   ${qtyStats[0]?.min_qty}`);
  console.log(`    Max quantity:   ${qtyStats[0]?.max_qty}`);
  console.log(`    Avg quantity:   ${Number(qtyStats[0]?.avg_qty ?? 0).toFixed(2)}`);
  console.log(`    Total quantity: ${qtyStats[0]?.total_qty}`);

  // 8b. Negative vs positive quantities
  const qtySign = await consultaSagJson(config, `
    SELECT
      CASE
        WHEN mi.n_cantidad > 0 THEN 'positive'
        WHEN mi.n_cantidad < 0 THEN 'negative'
        ELSE 'zero'
      END as sign,
      COUNT(*) as cnt,
      SUM(mi.n_cantidad) as total
    FROM MOVIMIENTOS_ITEMS mi
    INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mi.ka_nl_movimiento
    WHERE m.ka_ni_fuente = 80
    GROUP BY
      CASE
        WHEN mi.n_cantidad > 0 THEN 'positive'
        WHEN mi.n_cantidad < 0 THEN 'negative'
        ELSE 'zero'
      END
  `);
  console.log(`\n  Quantity sign distribution:`);
  for (const r of qtySign) {
    console.log(`    ${String(r.sign).padEnd(10)}: ${r.cnt} lines (total: ${r.total})`);
  }

  // 8c. Cost data in CN (using n_valor — n_valor_unitario does NOT exist on CN items)
  const costStats = await consultaSagJson(config, `
    SELECT
      CASE
        WHEN mi.n_valor > 0 THEN 'has_cost'
        WHEN mi.n_valor = 0 THEN 'zero_cost'
        WHEN mi.n_valor IS NULL THEN 'null_cost'
        ELSE 'negative_cost'
      END as status,
      COUNT(*) as cnt
    FROM MOVIMIENTOS_ITEMS mi
    INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mi.ka_nl_movimiento
    WHERE m.ka_ni_fuente = 80
    GROUP BY
      CASE
        WHEN mi.n_valor > 0 THEN 'has_cost'
        WHEN mi.n_valor = 0 THEN 'zero_cost'
        WHEN mi.n_valor IS NULL THEN 'null_cost'
        ELSE 'negative_cost'
      END
  `);
  console.log(`\n  Cost data (n_valor) availability:`);
  for (const r of costStats) {
    console.log(`    ${String(r.status).padEnd(14)}: ${r.cnt} lines`);
  }

  // 8c2. Additional cost fields
  const costFieldStats = await consultaSagJson(config, `
    SELECT
      CASE WHEN mi.n_ultimo_costo > 0 THEN 'has' ELSE 'none' END as ultimo_costo,
      CASE WHEN mi.n_costo_promedio > 0 THEN 'has' ELSE 'none' END as costo_promedio,
      COUNT(*) as cnt
    FROM MOVIMIENTOS_ITEMS mi
    INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mi.ka_nl_movimiento
    WHERE m.ka_ni_fuente = 80
    GROUP BY
      CASE WHEN mi.n_ultimo_costo > 0 THEN 'has' ELSE 'none' END,
      CASE WHEN mi.n_costo_promedio > 0 THEN 'has' ELSE 'none' END
  `);
  console.log(`\n  Additional cost fields (n_ultimo_costo / n_costo_promedio):`);
  for (const r of costFieldStats) {
    console.log(`    ultimo_costo=${String(r.ultimo_costo).padEnd(6)} costo_promedio=${String(r.costo_promedio).padEnd(6)}: ${r.cnt} lines`);
  }

  // 8d. Size/Color availability
  // NOTE: ss_talla / ss_color do NOT exist on CN MOVIMIENTOS_ITEMS.
  // CN items identify articles via ka_nl_articulo → v_articulos (k_sc_codigo_articulo, sc_detalle_articulo).
  // Size/color may be embedded in the article description (e.g. "BELLA 170 AZUL NUBE 70012").
  console.log(`\n  Size/Color columns: NOT AVAILABLE on CN MOVIMIENTOS_ITEMS`);
  console.log(`    CN items use article references (k_sc_codigo_articulo) instead of talla/color columns.`);
  console.log(`    Size/color data is embedded in sc_detalle_articulo (article description).`);

  // 8e. Do CN lines reference articles that exist as products?
  // (checked via k_sc_codigo_articulo population)
  const articuloPopulation = await consultaSagJson(config, `
    SELECT
      CASE
        WHEN v.k_sc_codigo_articulo IS NOT NULL AND v.k_sc_codigo_articulo <> '' THEN 'has_ref'
        ELSE 'no_ref'
      END as status,
      COUNT(*) as cnt
    FROM MOVIMIENTOS_ITEMS mi
    INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mi.ka_nl_movimiento
    LEFT JOIN v_articulos v ON v.ka_nl_articulo = mi.ka_nl_articulo
    WHERE m.ka_ni_fuente = 80
    GROUP BY
      CASE
        WHEN v.k_sc_codigo_articulo IS NOT NULL AND v.k_sc_codigo_articulo <> '' THEN 'has_ref'
        ELSE 'no_ref'
      END
  `);
  console.log(`\n  Article reference population (via v_articulos JOIN):`);
  for (const r of articuloPopulation) {
    console.log(`    ${String(r.status).padEnd(10)}: ${r.cnt} lines`);
  }

  // 8f. Distinct article types in CN (to understand if CN has finished products or raw materials)
  const articleTypes = await consultaSagJson(config, `
    SELECT TOP 30 v.k_sc_codigo_articulo, v.sc_detalle_articulo, COUNT(*) as cnt
    FROM MOVIMIENTOS_ITEMS mi
    INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mi.ka_nl_movimiento
    LEFT JOIN v_articulos v ON v.ka_nl_articulo = mi.ka_nl_articulo
    WHERE m.ka_ni_fuente = 80
      AND v.k_sc_codigo_articulo IS NOT NULL
    GROUP BY v.k_sc_codigo_articulo, v.sc_detalle_articulo
    ORDER BY COUNT(*) DESC
  `);
  console.log(`\n  Top 30 articles in CN (by frequency):`);
  for (const r of articleTypes) {
    console.log(`    ${String(r.k_sc_codigo_articulo).padEnd(20)} | ${String(r.sc_detalle_articulo ?? "").substring(0, 50).padEnd(50)} | ${r.cnt} appearances`);
  }

  // 8g. Check if CN articles overlap with OP articles vs raw materials
  // OP articles start with reference codes like L-, C-, CD-, etc.
  // Raw materials would have different patterns
  const refPatterns = await consultaSagJson(config, `
    SELECT
      CASE
        WHEN v.k_sc_codigo_articulo LIKE 'L-%' THEN 'L- (LATIN KIDS)'
        WHEN v.k_sc_codigo_articulo LIKE 'C-%' THEN 'C- (CASTILLITOS)'
        WHEN v.k_sc_codigo_articulo LIKE 'CD-%' THEN 'CD- (CASTILLITOS-D)'
        WHEN v.k_sc_codigo_articulo LIKE 'CV-%' THEN 'CV-'
        WHEN v.k_sc_codigo_articulo LIKE 'CG-%' OR v.k_sc_codigo_articulo LIKE 'CGJ-%' THEN 'CG/CGJ'
        WHEN v.k_sc_codigo_articulo LIKE 'CA-%' THEN 'CA-'
        WHEN v.k_sc_codigo_articulo LIKE 'CF-%' THEN 'CF-'
        WHEN v.k_sc_codigo_articulo LIKE 'CP-%' THEN 'CP-'
        WHEN v.k_sc_codigo_articulo LIKE 'CT-%' THEN 'CT-'
        WHEN v.k_sc_codigo_articulo LIKE '[0-9]%' THEN 'NUMERIC (raw material?)'
        ELSE 'OTHER'
      END as pattern,
      COUNT(*) as cnt
    FROM MOVIMIENTOS_ITEMS mi
    INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mi.ka_nl_movimiento
    LEFT JOIN v_articulos v ON v.ka_nl_articulo = mi.ka_nl_articulo
    WHERE m.ka_ni_fuente = 80
      AND v.k_sc_codigo_articulo IS NOT NULL
    GROUP BY
      CASE
        WHEN v.k_sc_codigo_articulo LIKE 'L-%' THEN 'L- (LATIN KIDS)'
        WHEN v.k_sc_codigo_articulo LIKE 'C-%' THEN 'C- (CASTILLITOS)'
        WHEN v.k_sc_codigo_articulo LIKE 'CD-%' THEN 'CD- (CASTILLITOS-D)'
        WHEN v.k_sc_codigo_articulo LIKE 'CV-%' THEN 'CV-'
        WHEN v.k_sc_codigo_articulo LIKE 'CG-%' OR v.k_sc_codigo_articulo LIKE 'CGJ-%' THEN 'CG/CGJ'
        WHEN v.k_sc_codigo_articulo LIKE 'CA-%' THEN 'CA-'
        WHEN v.k_sc_codigo_articulo LIKE 'CF-%' THEN 'CF-'
        WHEN v.k_sc_codigo_articulo LIKE 'CP-%' THEN 'CP-'
        WHEN v.k_sc_codigo_articulo LIKE 'CT-%' THEN 'CT-'
        WHEN v.k_sc_codigo_articulo LIKE '[0-9]%' THEN 'NUMERIC (raw material?)'
        ELSE 'OTHER'
      END
    ORDER BY COUNT(*) DESC
  `);
  console.log(`\n  Reference patterns in CN lines (product vs raw material):`);
  for (const r of refPatterns) {
    console.log(`    ${String(r.pattern).padEnd(25)}: ${r.cnt} lines`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 9 — SECOND REFERENCE RECONSTRUCTION
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 9: SECOND REFERENCE RECONSTRUCTION");
  console.log("=".repeat(80));

  // Pick another reference for cross-validation
  const secondRef = await consultaSagJson(config, `
    SELECT TOP 1 v.k_sc_codigo_articulo, COUNT(*) as cnt
    FROM MOVIMIENTOS_ITEMS mi
    INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mi.ka_nl_movimiento
    LEFT JOIN v_articulos v ON v.ka_nl_articulo = mi.ka_nl_articulo
    WHERE m.ka_ni_fuente = 80
      AND v.k_sc_codigo_articulo IS NOT NULL
      AND v.k_sc_codigo_articulo LIKE 'C-%'
      AND m.d_fecha_documento >= '2025-06-01'
    GROUP BY v.k_sc_codigo_articulo
    HAVING COUNT(*) >= 3
    ORDER BY COUNT(*) DESC
  `);

  if (secondRef.length > 0) {
    const ref2 = String(secondRef[0].k_sc_codigo_articulo);
    console.log(`\n  Second reference: ${ref2} (${secondRef[0].cnt} CN appearances)`);

    // All production events for this reference across fuentes (OP and CN only — ET has no lines)
    for (const fuente of [33, 80]) {
      const fuenteName = fuente === 33 ? "OP" : "CN";
      const events = await consultaSagJson(config, `
        SELECT m.n_numero_documento, m.d_fecha_documento, m.ss_remision,
               mi.n_cantidad, mi.ka_nl_bodega, v.sc_detalle_articulo
        FROM MOVIMIENTOS m
        INNER JOIN MOVIMIENTOS_ITEMS mi ON mi.ka_nl_movimiento = m.ka_nl_movimiento
        LEFT JOIN v_articulos v ON v.ka_nl_articulo = mi.ka_nl_articulo
        WHERE m.ka_ni_fuente = ${fuente}
          AND v.k_sc_codigo_articulo = '${ref2}'
        ORDER BY m.d_fecha_documento
      `);
      console.log(`\n  ${fuenteName} (fuente ${fuente}) for ${ref2}: ${events.length} lines`);
      for (const e of events.slice(0, 5)) {
        console.log(`    ${fuenteName} #${e.n_numero_documento} | ${e.d_fecha_documento} | qty=${e.n_cantidad} bodega=${e.ka_nl_bodega} rem=${e.ss_remision} | ${String(e.sc_detalle_articulo ?? "").substring(0, 40)}`);
      }
      if (events.length > 5) console.log(`    ... +${events.length - 5} more`);
    }

    // ET has no lines, check header-only
    const etHeadersForRef = await consultaSagJson(config, `
      SELECT m.n_numero_documento, m.d_fecha_documento, m.ss_remision
      FROM MOVIMIENTOS m
      WHERE m.ka_ni_fuente = 116
        AND m.ss_remision IN (
          SELECT DISTINCT m2.ss_remision
          FROM MOVIMIENTOS m2
          INNER JOIN MOVIMIENTOS_ITEMS mi2 ON mi2.ka_nl_movimiento = m2.ka_nl_movimiento
          LEFT JOIN v_articulos v2 ON v2.ka_nl_articulo = mi2.ka_nl_articulo
          WHERE m2.ka_ni_fuente = 80
            AND v2.k_sc_codigo_articulo = '${ref2}'
            AND m2.ss_remision IS NOT NULL AND m2.ss_remision <> ''
        )
      ORDER BY m.d_fecha_documento
    `);
    console.log(`\n  ET headers linked via ss_remision to CN for ${ref2}: ${etHeadersForRef.length}`);
    for (const e of etHeadersForRef.slice(0, 5)) {
      console.log(`    ET #${e.n_numero_documento} | ${e.d_fecha_documento} | remision=${e.ss_remision}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 10 — USERS & AUTOMATION
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 10: USERS & AUTOMATION");
  console.log("=".repeat(80));

  // 10a. Is CN auto-generated or manual?
  const generatedStats = await consultaSagJson(config, `
    SELECT
      m.sc_generado,
      COUNT(*) as cnt
    FROM MOVIMIENTOS m
    WHERE m.ka_ni_fuente = 80
    GROUP BY m.sc_generado
  `);
  console.log(`\n  sc_generado (auto-generated flag):`);
  for (const r of generatedStats) {
    console.log(`    sc_generado='${r.sc_generado}': ${r.cnt}`);
  }

  // 10b. Users creating CN
  const userStats = await consultaSagJson(config, `
    SELECT TOP 10 m.ss_usuario_new, COUNT(*) as cnt
    FROM MOVIMIENTOS m
    WHERE m.ka_ni_fuente = 80
    GROUP BY m.ss_usuario_new
    ORDER BY COUNT(*) DESC
  `);
  console.log(`\n  Top users creating CN documents:`);
  for (const r of userStats) {
    const user = String(r.ss_usuario_new ?? "").substring(0, 50);
    console.log(`    ${user.padEnd(50)} : ${r.cnt}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(80));
  console.log("FORENSICS COMPLETE");
  console.log("=".repeat(80));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
