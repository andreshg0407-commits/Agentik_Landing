// @ts-nocheck
/**
 * scripts/_production-forensics.ts
 *
 * PRODUCTION-FORENSICS-OP-01: Discover SAG production model for Castillitos.
 *
 * READ-ONLY. Zero writes to SAG or Prisma.
 *
 * Usage: npx tsx scripts/_production-forensics.ts
 */

import "dotenv/config";
import { consultaSagJson } from "../lib/connectors/pya/client";
import { loadSagTestEnv } from "../lib/sag/env";
import { CASTILLITOS_SOURCE_SEMANTIC_RULES } from "../lib/sag/master-data/source-semantic-rules";

// ── Setup ────────────────────────────────────────────────────────────────────

const env = loadSagTestEnv();
const config = {
  endpointUrl: env.endpointUrl,
  token: env.token,
  database: env.database,
};

// Production fuente IDs from source-semantic-rules.ts
const PRODUCTION_FUENTE_IDS = [33, 80, 81, 99, 100, 114, 115, 116, 117, 118, 119, 126, 127, 129, 133, 140];

const PRODUCTION_CODES: Record<number, string> = {};
for (const rule of CASTILLITOS_SOURCE_SEMANTIC_RULES) {
  if (PRODUCTION_FUENTE_IDS.includes(rule.kaNiFuente)) {
    PRODUCTION_CODES[rule.kaNiFuente] = `${rule.codigoFuente} (${rule.nombreFuente})`;
  }
}

async function safeQuery(label: string, sql: string): Promise<any[]> {
  console.log(`\n--- ${label} ---`);
  console.log(`SQL: ${sql.slice(0, 200)}${sql.length > 200 ? "..." : ""}`);
  try {
    const rows = await consultaSagJson(config, sql);
    console.log(`Result: ${rows.length} rows`);
    return rows;
  } catch (e: any) {
    console.log(`ERROR: ${e.message?.slice(0, 200)}`);
    return [];
  }
}

// ── Phase 1: Production movements in MOVIMIENTOS ────────────────────────────

async function phase1_productionMovements() {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 1: PRODUCTION MOVEMENTS IN MOVIMIENTOS TABLE");
  console.log("=".repeat(80));

  // Count movements by production fuente
  const fuenteList = PRODUCTION_FUENTE_IDS.join(",");

  const countByFuente = await safeQuery(
    "Count production movements by fuente",
    `SELECT m.ka_ni_fuente, COUNT(*) AS cnt FROM MOVIMIENTOS m WHERE m.ka_ni_fuente IN (${fuenteList}) AND m.sc_anulado = 'N' GROUP BY m.ka_ni_fuente ORDER BY m.ka_ni_fuente`,
  );

  if (countByFuente.length > 0) {
    console.log("\nProduction movement counts by document type:");
    for (const row of countByFuente) {
      const id = Number(row.ka_ni_fuente);
      const name = PRODUCTION_CODES[id] ?? `Unknown (${id})`;
      console.log(`  ${id.toString().padStart(3)} ${name.padEnd(40)} ${row.cnt} movimientos`);
    }
  }

  // Get date range for production movements
  const dateRange = await safeQuery(
    "Date range of production movements",
    `SELECT MIN(m.d_fecha_documento) AS fecha_min, MAX(m.d_fecha_documento) AS fecha_max FROM MOVIMIENTOS m WHERE m.ka_ni_fuente IN (${fuenteList}) AND m.sc_anulado = 'N'`,
  );

  if (dateRange.length > 0) {
    console.log(`\nDate range: ${dateRange[0].fecha_min} to ${dateRange[0].fecha_max}`);
  }

  return countByFuente;
}

// ── Phase 2: Sample OP (Orden de Producción, fuente 33) ─────────────────────

async function phase2_sampleOP() {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 2: SAMPLE ORDEN DE PRODUCCION (OP, fuente 33)");
  console.log("=".repeat(80));

  // Get 10 recent OP movements with all columns
  const ops = await safeQuery(
    "Recent OP movements (TOP 10)",
    "SELECT TOP 10 * FROM MOVIMIENTOS WHERE ka_ni_fuente = 33 AND sc_anulado = 'N' ORDER BY d_fecha_documento DESC",
  );

  if (ops.length > 0) {
    console.log("\nOP column names:");
    const cols = Object.keys(ops[0]);
    for (const col of cols) {
      console.log(`  ${col}: ${JSON.stringify(ops[0][col])}`);
    }

    console.log("\nAll 10 OPs summary:");
    for (const op of ops) {
      console.log(`  OP #${op.n_numero_documento} | fecha: ${op.d_fecha_documento} | tercero: ${op.sc_beneficiario} | mov_id: ${op.ka_nl_movimiento}`);
    }
  }

  return ops;
}

// ── Phase 3: OP line items (MOVIMIENTOS_ITEMS for fuente 33) ────────────────

async function phase3_opLineItems(ops: any[]) {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 3: OP LINE ITEMS (MOVIMIENTOS_ITEMS)");
  console.log("=".repeat(80));

  if (ops.length === 0) {
    console.log("No OPs found — skipping line items.");
    return [];
  }

  // Get line items for the first 5 OPs
  const movIds = ops.slice(0, 5).map((op) => op.ka_nl_movimiento);
  const movIdList = movIds.join(",");

  const items = await safeQuery(
    "OP line items (first 5 OPs)",
    `SELECT TOP 50 * FROM MOVIMIENTOS_ITEMS WHERE ka_nl_movimiento IN (${movIdList})`,
  );

  if (items.length > 0) {
    console.log("\nMOVIMIENTOS_ITEMS column names for OP lines:");
    const cols = Object.keys(items[0]);
    for (const col of cols) {
      console.log(`  ${col}: ${JSON.stringify(items[0][col])}`);
    }

    console.log(`\nTotal OP line items found: ${items.length}`);
    for (const item of items.slice(0, 10)) {
      console.log(`  mov_id: ${item.ka_nl_movimiento} | articulo: ${item.ka_nl_articulo ?? item.sc_articulo ?? "?"} | qty: ${item.n_cantidad ?? "?"} | valor: ${item.n_valor ?? "?"}`);
    }
  }

  return items;
}

// ── Phase 4: Discover table structure — probe common production tables ──────

async function phase4_discoverTables() {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 4: TABLE DISCOVERY — Probing for production-specific tables");
  console.log("=".repeat(80));

  const tablesToProbe = [
    "ORDENES_PRODUCCION",
    "PRODUCCION",
    "OP",
    "ORDEN_PRODUCCION",
    "PRODUCCION_TERMINADA",
    "CONSUMO_MP",
    "CONFECCIONISTAS",
    "TALLERES",
    "LOTES_PRODUCCION",
    "PLANIFICACION_PRODUCCION",
    "PROGRAMACION_PRODUCCION",
    "OPERACIONES",
    "COMPONENTES",
    "FORMULA",
    "FORMULA_DETALLE",
    "LISTA_MATERIALES",
    "BOM",
  ];

  const discovered: string[] = [];

  for (const table of tablesToProbe) {
    const rows = await safeQuery(
      `Probe: ${table}`,
      `SELECT TOP 1 * FROM ${table}`,
    );
    if (rows.length > 0) {
      discovered.push(table);
      console.log(`  FOUND: ${table} — columns: ${Object.keys(rows[0]).join(", ")}`);
    }
  }

  if (discovered.length === 0) {
    console.log("\nNo dedicated production tables found. Production data lives in MOVIMIENTOS/MOVIMIENTOS_ITEMS.");
  } else {
    console.log(`\nDiscovered tables: ${discovered.join(", ")}`);
  }

  return discovered;
}

// ── Phase 5: Trace OP lifecycle (OP → Consumo → PT → Inventario) ──────────

async function phase5_opLifecycle() {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 5: OP LIFECYCLE — Trace production → inventory flow");
  console.log("=".repeat(80));

  // Get one OP and trace its related movements
  const ops = await safeQuery(
    "Get 3 recent OPs with their document numbers",
    "SELECT TOP 3 ka_nl_movimiento, n_numero_documento, d_fecha_documento, sc_beneficiario FROM MOVIMIENTOS WHERE ka_ni_fuente = 33 AND sc_anulado = 'N' ORDER BY d_fecha_documento DESC",
  );

  if (ops.length === 0) {
    console.log("No OPs found — cannot trace lifecycle.");
    return;
  }

  for (const op of ops) {
    const docNum = op.n_numero_documento;
    console.log(`\n--- Tracing OP #${docNum} (fecha: ${op.d_fecha_documento}) ---`);

    // Find all movements with the same document number across all production fuentes
    const fuenteList = PRODUCTION_FUENTE_IDS.join(",");
    const related = await safeQuery(
      `All production movements for doc #${docNum}`,
      `SELECT ka_nl_movimiento, ka_ni_fuente, n_numero_documento, d_fecha_documento, sc_beneficiario FROM MOVIMIENTOS WHERE n_numero_documento = ${docNum} AND ka_ni_fuente IN (${fuenteList}) AND sc_anulado = 'N' ORDER BY ka_ni_fuente`,
    );

    if (related.length > 0) {
      console.log(`  Related production movements for OP #${docNum}:`);
      for (const r of related) {
        const id = Number(r.ka_ni_fuente);
        const name = PRODUCTION_CODES[id] ?? `Unknown (${id})`;
        console.log(`    ${name.padEnd(40)} doc #${r.n_numero_documento} | fecha: ${r.d_fecha_documento} | mov: ${r.ka_nl_movimiento}`);
      }
    } else {
      console.log(`  No related production movements found for doc #${docNum}`);
    }
  }
}

// ── Phase 6: Cross-reference with agotados ──────────────────────────────────

async function phase6_crossReferenceAgotados() {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 6: CROSS-REFERENCE — Production movements for top agotados");
  console.log("=".repeat(80));

  // We need to look at MOVIMIENTOS_ITEMS to find articulos in production
  // First get all unique articulos from production movements
  const fuenteList = PRODUCTION_FUENTE_IDS.join(",");

  const articulosInProduction = await safeQuery(
    "Unique articulos in production movements (recent 6 months)",
    `SELECT DISTINCT TOP 100 mi.ka_nl_articulo FROM MOVIMIENTOS_ITEMS mi INNER JOIN MOVIMIENTOS m ON mi.ka_nl_movimiento = m.ka_nl_movimiento WHERE m.ka_ni_fuente IN (${fuenteList}) AND m.sc_anulado = 'N' ORDER BY mi.ka_nl_articulo`,
  );

  console.log(`\nArticulos found in production movements: ${articulosInProduction.length}`);

  if (articulosInProduction.length > 0) {
    // Show first 20
    for (const a of articulosInProduction.slice(0, 20)) {
      console.log(`  Articulo: ${a.ka_nl_articulo}`);
    }
  }
}

// ── Phase 7: Production summary statistics ──────────────────────────────────

async function phase7_productionStats() {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 7: PRODUCTION STATISTICS");
  console.log("=".repeat(80));

  const fuenteList = PRODUCTION_FUENTE_IDS.join(",");

  // Total production movements
  const total = await safeQuery(
    "Total production movements",
    `SELECT COUNT(*) AS total FROM MOVIMIENTOS WHERE ka_ni_fuente IN (${fuenteList}) AND sc_anulado = 'N'`,
  );

  if (total.length > 0) {
    console.log(`\nTotal production movements: ${total[0].total}`);
  }

  // OP specific stats
  const opStats = await safeQuery(
    "OP (fuente 33) statistics",
    "SELECT COUNT(*) AS total_ops, MIN(d_fecha_documento) AS primera_op, MAX(d_fecha_documento) AS ultima_op FROM MOVIMIENTOS WHERE ka_ni_fuente = 33 AND sc_anulado = 'N'",
  );

  if (opStats.length > 0) {
    console.log(`\nOP statistics:`);
    console.log(`  Total OPs: ${opStats[0].total_ops}`);
    console.log(`  Primera OP: ${opStats[0].primera_op}`);
    console.log(`  Ultima OP: ${opStats[0].ultima_op}`);
  }

  // PT/ET (Entrada Producto Terminado, fuentes 81 and 116)
  const ptStats = await safeQuery(
    "Entrada PT (fuentes 81, 116) statistics",
    "SELECT COUNT(*) AS total_pt, MIN(d_fecha_documento) AS primera_pt, MAX(d_fecha_documento) AS ultima_pt FROM MOVIMIENTOS WHERE ka_ni_fuente IN (81, 116) AND sc_anulado = 'N'",
  );

  if (ptStats.length > 0) {
    console.log(`\nEntrada PT statistics:`);
    console.log(`  Total entradas PT: ${ptStats[0].total_pt}`);
    console.log(`  Primera: ${ptStats[0].primera_pt}`);
    console.log(`  Ultima: ${ptStats[0].ultima_pt}`);
  }

  // Production movements by year
  const byYear = await safeQuery(
    "Production movements by year",
    `SELECT YEAR(m.d_fecha_documento) AS anio, COUNT(*) AS cnt FROM MOVIMIENTOS m WHERE m.ka_ni_fuente IN (${fuenteList}) AND m.sc_anulado = 'N' GROUP BY YEAR(m.d_fecha_documento) ORDER BY anio`,
  );

  if (byYear.length > 0) {
    console.log("\nProduction movements by year:");
    for (const y of byYear) {
      console.log(`  ${y.anio}: ${y.cnt} movimientos`);
    }
  }
}

// ── Phase 8: MOVIMIENTOS_ITEMS detail for production ────────────────────────

async function phase8_itemsDetail() {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 8: PRODUCTION LINE ITEMS DETAIL");
  console.log("=".repeat(80));

  const fuenteList = PRODUCTION_FUENTE_IDS.join(",");

  // Count items per production document type
  const itemsByFuente = await safeQuery(
    "Production line items count by fuente",
    `SELECT m.ka_ni_fuente, COUNT(*) AS cnt FROM MOVIMIENTOS_ITEMS mi INNER JOIN MOVIMIENTOS m ON mi.ka_nl_movimiento = m.ka_nl_movimiento WHERE m.ka_ni_fuente IN (${fuenteList}) AND m.sc_anulado = 'N' GROUP BY m.ka_ni_fuente ORDER BY m.ka_ni_fuente`,
  );

  if (itemsByFuente.length > 0) {
    console.log("\nLine items by production document type:");
    let totalItems = 0;
    for (const row of itemsByFuente) {
      const id = Number(row.ka_ni_fuente);
      const name = PRODUCTION_CODES[id] ?? `Unknown (${id})`;
      const cnt = Number(row.cnt);
      totalItems += cnt;
      console.log(`  ${id.toString().padStart(3)} ${name.padEnd(40)} ${cnt} lineas`);
    }
    console.log(`  ${"".padStart(3)} ${"TOTAL".padEnd(40)} ${totalItems} lineas`);
  }

  // Sample MOVIMIENTOS_ITEMS columns for a PT entry (fuente 81 or 116)
  const ptItems = await safeQuery(
    "Sample PT items (fuente 81/116) — full row",
    "SELECT TOP 5 mi.* FROM MOVIMIENTOS_ITEMS mi INNER JOIN MOVIMIENTOS m ON mi.ka_nl_movimiento = m.ka_nl_movimiento WHERE m.ka_ni_fuente IN (81, 116) AND m.sc_anulado = 'N' ORDER BY m.d_fecha_documento DESC",
  );

  if (ptItems.length > 0) {
    console.log("\nPT (Entrada Producto Terminado) item columns:");
    const cols = Object.keys(ptItems[0]);
    for (const col of cols) {
      console.log(`  ${col}: ${JSON.stringify(ptItems[0][col])}`);
    }
  }
}

// ── Phase 9: FUENTES table — confirm production fuente metadata ─────────────

async function phase9_fuentesTable() {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 9: FUENTES TABLE — Production entries");
  console.log("=".repeat(80));

  const fuenteList = PRODUCTION_FUENTE_IDS.join(",");

  const fuentes = await safeQuery(
    "Production fuentes from FUENTES table",
    `SELECT * FROM FUENTES WHERE ka_ni_fuente IN (${fuenteList})`,
  );

  if (fuentes.length > 0) {
    console.log("\nFUENTES columns:");
    const cols = Object.keys(fuentes[0]);
    for (const col of cols) {
      console.log(`  ${col}`);
    }

    console.log("\nProduction fuentes detail:");
    for (const f of fuentes) {
      console.log(`  ${f.ka_ni_fuente} | ${f.k_sc_codigo_fuente ?? f.sc_codigo ?? "?"} | cobrar_pagar: ${f.sc_cobrar_pagar ?? "?"} | clase: ${f.k_n_clase_fuente ?? "?"}`);
    }
  }
}

// ── Phase 10: Articulos in active OP (cross with ProductEntity SKU) ────────

async function phase10_articulosInOP() {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 10: ARTICULOS IN ACTIVE PRODUCTION");
  console.log("=".repeat(80));

  // Get articulos currently in production (recent OPs)
  // OP items with quantity
  const recentOPItems = await safeQuery(
    "Articulos in recent OPs (last 50 OPs)",
    `SELECT mi.ka_nl_articulo, SUM(mi.n_cantidad) AS total_qty, COUNT(*) AS lines FROM MOVIMIENTOS_ITEMS mi INNER JOIN (SELECT TOP 50 ka_nl_movimiento FROM MOVIMIENTOS WHERE ka_ni_fuente = 33 AND sc_anulado = 'N' ORDER BY d_fecha_documento DESC) m ON mi.ka_nl_movimiento = m.ka_nl_movimiento GROUP BY mi.ka_nl_articulo ORDER BY total_qty DESC`,
  );

  if (recentOPItems.length > 0) {
    console.log(`\nArticulos in recent 50 OPs: ${recentOPItems.length}`);
    for (const item of recentOPItems.slice(0, 30)) {
      console.log(`  Articulo: ${item.ka_nl_articulo} | qty: ${item.total_qty} | lines: ${item.lines}`);
    }
  }

  // Try to resolve articulo IDs to product names via ARTICULOS table
  if (recentOPItems.length > 0) {
    const artIds = recentOPItems.slice(0, 20).map((a) => a.ka_nl_articulo).filter(Boolean);
    if (artIds.length > 0) {
      const artIdList = artIds.join(",");
      const articulos = await safeQuery(
        "Resolve articulo names",
        `SELECT TOP 20 ka_nl_articulo, sc_articulo, sc_descripcion FROM ARTICULOS WHERE ka_nl_articulo IN (${artIdList})`,
      );

      if (articulos.length > 0) {
        console.log("\nResolved articulo names:");
        for (const a of articulos) {
          console.log(`  ${a.ka_nl_articulo} → ${a.sc_articulo} | ${a.sc_descripcion}`);
        }
      } else {
        // Try alternate table name
        const artAlt = await safeQuery(
          "Try v_articulos view",
          `SELECT TOP 5 * FROM v_articulos`,
        );
        if (artAlt.length > 0) {
          console.log("\nv_articulos columns: " + Object.keys(artAlt[0]).join(", "));
        }
      }
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(80));
  console.log("PRODUCTION-FORENSICS-OP-01 — SAG Production Model Discovery");
  console.log("Target: Castillitos (SAG PYA SOAP)");
  console.log(`Database: ${config.database}`);
  console.log(`Endpoint: ${config.endpointUrl}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log("MODE: READ-ONLY FORENSICS — ZERO WRITES");
  console.log("=".repeat(80));

  const countByFuente = await phase1_productionMovements();
  const ops = await phase2_sampleOP();
  await phase3_opLineItems(ops);
  await phase4_discoverTables();
  await phase5_opLifecycle();
  await phase6_crossReferenceAgotados();
  await phase7_productionStats();
  await phase8_itemsDetail();
  await phase9_fuentesTable();
  await phase10_articulosInOP();

  console.log("\n" + "=".repeat(80));
  console.log("FORENSICS COMPLETE");
  console.log("=".repeat(80));
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
