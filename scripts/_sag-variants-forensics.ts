/**
 * _sag-variants-forensics.ts
 *
 * SAG-VARIANTS-01 Phase 1 — Forensic investigation of variant/inventory tables.
 *
 * Probes candidate tables related to: talla, color, inventario, kardex,
 * existencias, referencias, combinaciones articulo+talla+color.
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/_sag-variants-forensics.ts
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import type { PyaApiConfig, SagRow } from "@/lib/connectors/pya/types";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const C = (s: string) => `\x1b[36m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

// ── Candidate tables ────────────────────────────────────────────────────────

const CANDIDATE_TABLES = [
  // Variant combination tables
  "ARTICULOS_TALLAS",
  "ARTICULOS_COLORES",
  "ARTICULOS_TALLAS_COLORES",
  "TALLAS_COLORES",
  "TALLAS_ARTICULOS",
  "COLORES_ARTICULOS",
  "COMBINACIONES",
  "COMBINACIONES_ARTICULOS",
  "REFERENCIAS",
  "REFERENCIAS_ARTICULOS",
  // Inventory / stock tables
  "INVENTARIO",
  "INVENTARIOS",
  "EXISTENCIAS",
  "KARDEX",
  "KARDEX_ARTICULOS",
  "MOVIMIENTOS_KARDEX",
  "SALDOS",
  "SALDOS_INVENTARIO",
  "SALDOS_ARTICULOS",
  "SALDOS_BODEGA",
  // Warehouse inventory
  "INVENTARIO_BODEGAS",
  "EXISTENCIAS_BODEGA",
  "EXISTENCIAS_BODEGAS",
  "STOCK",
  "STOCK_BODEGAS",
  // Price lists per variant
  "PRECIOS_ARTICULOS",
  "LISTAS_PRECIOS_ARTICULOS",
  // Barcode / EAN
  "CODIGOS_BARRAS",
  "CODIGO_BARRAS",
  "EAN",
  "BARRAS",
  // Other variant patterns
  "ARTICULOS_DETALLE",
  "DETALLE_ARTICULOS",
  "VARIANTES",
  "VARIANTES_ARTICULOS",
  "ITEMS",
  "ITEMS_ARTICULOS",
];

async function main() {
  const token = (process.env.PYA_SOAP_TOKEN ?? process.env.SAG_TEST_TOKEN ?? "").trim();
  const database = (process.env.PYA_SAG_BD ?? "").trim() || undefined;
  const endpointUrl = process.env.PYA_SOAP_ENDPOINT?.trim() ??
    "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  if (!token) {
    console.error(R("ERROR: PYA_SOAP_TOKEN or SAG_TEST_TOKEN required."));
    process.exit(1);
  }

  const config: PyaApiConfig = { token, endpointUrl, database };

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  SAG-VARIANTS-01 — FASE 1: FORENSE DE VARIANTES"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");
  console.log(`  Tables to probe: ${B(String(CANDIDATE_TABLES.length))}`);
  console.log("");

  interface TableResult {
    table: string;
    exists: boolean;
    rowCount: number;
    fields: string[];
    sample: SagRow[];
    error?: string;
  }

  const results: TableResult[] = [];

  for (const table of CANDIDATE_TABLES) {
    process.stdout.write(`  Probing ${C(table.padEnd(30))} ... `);

    try {
      const rows = await consultaSagJson(config, `SELECT * FROM ${table}`);
      const fields = rows.length > 0 ? Object.keys(rows[0]) : [];

      results.push({ table, exists: true, rowCount: rows.length, fields, sample: rows.slice(0, 30) });
      console.log(G(`EXISTS`) + `  ${B(String(rows.length))} rows, ${fields.length} fields`);
    } catch (e) {
      const msg = (e as Error).message;
      results.push({ table, exists: false, rowCount: 0, fields: [], sample: [], error: msg.slice(0, 150) });
      console.log(Y(`NOT FOUND`));
    }
  }

  // ── Detailed report for found tables ─────────────────────────────────────

  const found = results.filter(r => r.exists);
  const notFound = results.filter(r => !r.exists);

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  DETAILED RESULTS — FOUND TABLES"));
  console.log(B("═══════════════════════════════════════════════════════════════"));

  for (const r of found) {
    console.log("");
    console.log(B(`  ┌─ ${r.table} (${r.rowCount} rows, ${r.fields.length} fields)`));

    // All fields with types
    console.log(`  │ Fields:`);
    for (const f of r.fields) {
      const val = r.sample[0]?.[f];
      const typeHint = val == null ? "null" : typeof val;
      const sampleVal = val == null ? "—" : String(val).slice(0, 60);
      console.log(`  │   ${C(f.padEnd(35))} ${typeHint.padEnd(8)} ${D(sampleVal)}`);
    }

    // Highlight variant-related fields
    const variantFields = r.fields.filter(f =>
      /talla|color|articul|codigo|referenc|exist|saldo|disponib|reserv|bodega|kardex|barr|ean/i.test(f)
    );
    if (variantFields.length > 0) {
      console.log(`  │`);
      console.log(`  │ ${G("Variant-related fields:")}`);
      for (const f of variantFields) {
        console.log(`  │   ${G(f)}`);
      }
    }

    // Sample rows (show key fields)
    if (r.sample.length > 0) {
      console.log(`  │`);
      console.log(`  │ Sample rows (first 5):`);

      // Pick most relevant fields for display
      const displayFields = r.fields.slice(0, 8);
      console.log(`  │   ${displayFields.map(f => B(f.slice(0, 20).padEnd(22))).join("")}`);
      console.log(`  │   ${displayFields.map(() => "─".repeat(22)).join("")}`);

      for (const row of r.sample.slice(0, 5)) {
        const vals = displayFields.map(f => {
          const v = row[f];
          if (v == null) return "—";
          const s = String(v);
          return s.length > 20 ? s.slice(0, 18) + "…" : s;
        });
        console.log(`  │   ${vals.map(v => v.padEnd(22)).join("")}`);
      }

      if (r.rowCount > 5) {
        console.log(`  │   ... and ${r.rowCount - 5} more`);
      }
    }

    console.log(`  └──`);
  }

  // ── Targeted queries for variant discovery ───────────────────────────────

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  TARGETED VARIANT QUERIES"));
  console.log(B("═══════════════════════════════════════════════════════════════"));

  // Try to find the article-talla-color combination in found tables
  const targetedQueries = [
    {
      label: "INVENTARIO with talla/color fields",
      query: "SELECT TOP 20 * FROM INVENTARIO WHERE ka_nl_talla IS NOT NULL",
    },
    {
      label: "INVENTARIO first 20 rows",
      query: "SELECT TOP 20 * FROM INVENTARIO",
    },
    {
      label: "EXISTENCIAS first 20 rows",
      query: "SELECT TOP 20 * FROM EXISTENCIAS",
    },
    {
      label: "KARDEX first 20 rows",
      query: "SELECT TOP 20 * FROM KARDEX",
    },
    {
      label: "SALDOS first 20 rows",
      query: "SELECT TOP 20 * FROM SALDOS",
    },
    {
      label: "SALDOS_INVENTARIO first 20 rows",
      query: "SELECT TOP 20 * FROM SALDOS_INVENTARIO",
    },
    {
      label: "ARTICULOS variant sample (talla+color managed)",
      query: "SELECT TOP 5 k_sc_codigo_articulo, sc_detalle_articulo, sc_maneja_tallas, n_valor_venta_normal FROM ARTICULOS WHERE sc_maneja_tallas = 'S' AND n_valor_venta_normal > 0",
    },
  ];

  for (const tq of targetedQueries) {
    console.log("");
    process.stdout.write(`  ${C(tq.label)} ... `);
    try {
      const rows = await consultaSagJson(config, tq.query);
      console.log(G(`${rows.length} rows`));

      if (rows.length > 0) {
        const fields = Object.keys(rows[0]);
        // Show variant-related fields
        const vFields = fields.filter(f =>
          /talla|color|articul|codigo|referenc|exist|saldo|disponib|reserv|bodega|cantidad|unidad/i.test(f)
        );
        if (vFields.length > 0) {
          console.log(`    Variant fields: ${vFields.map(f => G(f)).join(", ")}`);
        }

        // Show first 3 rows with all fields
        for (const row of rows.slice(0, 3)) {
          const entries = Object.entries(row)
            .filter(([, v]) => v != null && v !== "" && v !== 0)
            .map(([k, v]) => `${k}=${String(v).slice(0, 30)}`)
            .join(", ");
          console.log(`    ${D(entries.slice(0, 200))}`);
        }
      }
    } catch (e) {
      console.log(Y(`FAILED: ${(e as Error).message.slice(0, 80)}`));
    }
  }

  // ── Additional discovery: check if INVENTARIO has talla/color/bodega breakdown

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  INVENTORY STRUCTURE DISCOVERY"));
  console.log(B("═══════════════════════════════════════════════════════════════"));

  // Try to count distinct articles in inventory tables
  const countQueries = [
    { label: "INVENTARIO total rows", query: "SELECT COUNT(*) AS cnt FROM INVENTARIO" },
    { label: "EXISTENCIAS total rows", query: "SELECT COUNT(*) AS cnt FROM EXISTENCIAS" },
    { label: "SALDOS total rows", query: "SELECT COUNT(*) AS cnt FROM SALDOS" },
    { label: "KARDEX total rows", query: "SELECT COUNT(*) AS cnt FROM KARDEX" },
  ];

  for (const cq of countQueries) {
    process.stdout.write(`  ${cq.label.padEnd(35)} `);
    try {
      const rows = await consultaSagJson(config, cq.query);
      const cnt = rows[0]?.cnt ?? rows[0]?.CNT ?? "?";
      console.log(G(String(cnt)));
    } catch {
      console.log(Y("N/A"));
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  SUMMARY"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(`  Tables probed:    ${B(String(CANDIDATE_TABLES.length))}`);
  console.log(`  Tables found:     ${G(String(found.length))}`);
  console.log(`  Tables not found: ${Y(String(notFound.length))}`);
  console.log("");

  if (found.length > 0) {
    console.log(B("  Found tables:"));
    for (const r of found) {
      console.log(`    ${G(r.table.padEnd(30))} ${String(r.rowCount).padStart(10)} rows   ${r.fields.length} fields`);
    }
  }

  console.log("");
  if (notFound.length > 0) {
    console.log(Y(`  Not found (${notFound.length}):`));
    for (const r of notFound) {
      console.log(`    ${r.table}`);
    }
  }

  console.log("");
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
