/**
 * _sag-variants-forensics-2.ts
 *
 * SAG-VARIANTS-01 Phase 1B — Deep forensic with SAG internal naming patterns.
 *
 * The first probe found 0 variant tables with conventional names.
 * SAG uses internal conventions — try SAG-specific table patterns.
 *
 * Also: query ARTICULOS for talla/color FK fields to trace the variant model.
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const C = (s: string) => `\x1b[36m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

async function main() {
  const token = (process.env.PYA_SOAP_TOKEN ?? process.env.SAG_TEST_TOKEN ?? "").trim();
  const database = (process.env.PYA_SAG_BD ?? "").trim() || undefined;
  const endpointUrl = process.env.PYA_SOAP_ENDPOINT?.trim() ??
    "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  if (!token) {
    console.error(R("ERROR: PYA_SOAP_TOKEN required.")); process.exit(1);
  }

  const config: PyaApiConfig = { token, endpointUrl, database };

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  SAG-VARIANTS-01 — FASE 1B: DEEP FORENSIC"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");

  // ── ROUND 1: SAG-style table names ───────────────────────────────────────

  const sagTables = [
    // SAG inventory tables (known SAG naming patterns)
    "SALDOS_INV",
    "SALDOS_INV_TALLA",
    "SALDOS_INVENTARIO_TALLA",
    "INV_SALDOS",
    "INV_ARTICULOS",
    "INV_TALLAS",
    "INV_BODEGAS",
    // Talla/color combinations
    "TALLAS_X_COLOR",
    "TALLAS_COLORES_ARTICULOS",
    "ART_TALLAS",
    "ART_COLORES",
    "ART_TALLAS_COLORES",
    // SAG PYA typical tables
    "MOVIMIENTOS",
    "MOVIMIENTOS_ITEMS",
    "FUENTES",
    "DOCUMENTOS",
    "DOCUMENTOS_ITEMS",
    // SAG inventory views
    "V_INVENTARIO",
    "V_SALDOS_INV",
    "V_EXISTENCIAS",
    "V_STOCK",
    // Other common SAG tables
    "TERCEROS",
    "VENDEDORES",
    "CLIENTES",
    "PROVEEDORES",
    "CENTROS_COSTO",
  ];

  console.log(B("  ROUND 1: SAG-style table names"));
  for (const table of sagTables) {
    process.stdout.write(`  ${C(table.padEnd(35))} `);
    try {
      const rows = await consultaSagJson(config, `SELECT TOP 5 * FROM ${table}`);
      const fields = rows.length > 0 ? Object.keys(rows[0]) : [];
      console.log(G(`EXISTS  ${rows.length} rows, ${fields.length} fields`));

      // Show variant-relevant fields
      const vFields = fields.filter(f =>
        /talla|color|articul|codigo|bodega|cantidad|exist|disponib|reserv|saldo/i.test(f)
      );
      if (vFields.length > 0) {
        console.log(`    Variant fields: ${vFields.map(f => G(f)).join(", ")}`);
      }

      // Show first row compact
      if (rows.length > 0) {
        const entries = Object.entries(rows[0])
          .filter(([, v]) => v != null && v !== "" && v !== 0)
          .slice(0, 15)
          .map(([k, v]) => `${k}=${String(v).slice(0, 25)}`)
          .join(", ");
        console.log(`    ${D(entries.slice(0, 250))}`);
      }
    } catch {
      console.log(Y("NOT FOUND"));
    }
  }

  // ── ROUND 2: Analyze ARTICULOS fields for variant FKs ────────────────────

  console.log("");
  console.log(B("  ROUND 2: ARTICULOS variant-related fields"));

  // Get all 182 field names from first article
  try {
    const sample = await consultaSagJson(config,
      "SELECT TOP 1 * FROM ARTICULOS WHERE sc_maneja_tallas = 'S' AND n_valor_venta_normal > 0"
    );
    if (sample.length > 0) {
      const allFields = Object.keys(sample[0]);
      console.log(`  Total fields in ARTICULOS: ${B(String(allFields.length))}`);

      // Filter for talla/color/variant/inventory related
      const varFields = allFields.filter(f =>
        /talla|color|bodega|inventar|kardex|exist|saldo|lote|refer|barr|ean|combin|variant/i.test(f)
      );
      console.log(`  Variant-related fields (${varFields.length}):`);
      for (const f of varFields) {
        const v = sample[0][f];
        console.log(`    ${C(f.padEnd(40))} = ${D(v == null ? "null" : String(v).slice(0, 50))}`);
      }

      // Also check for fields with "ka_nl_" prefix (FK to lookup tables)
      const fkFields = allFields.filter(f => f.startsWith("ka_nl_") || f.startsWith("ka_ni_"));
      console.log(`\n  FK fields (ka_nl_/ka_ni_) — ${fkFields.length}:`);
      for (const f of fkFields) {
        const v = sample[0][f];
        console.log(`    ${C(f.padEnd(40))} = ${D(v == null ? "null" : String(v))}`);
      }
    }
  } catch (e) {
    console.log(R(`  Failed: ${(e as Error).message.slice(0, 100)}`));
  }

  // ── ROUND 3: Query MOVIMIENTOS_ITEMS for talla/color in transactions ─────

  console.log("");
  console.log(B("  ROUND 3: MOVIMIENTOS_ITEMS structure (talla/color in transactions)"));

  try {
    const rows = await consultaSagJson(config,
      "SELECT TOP 10 * FROM MOVIMIENTOS_ITEMS"
    );
    if (rows.length > 0) {
      const fields = Object.keys(rows[0]);
      console.log(`  Fields (${fields.length}):`);

      // Show all fields with sample values
      for (const f of fields) {
        const v = rows[0][f];
        console.log(`    ${C(f.padEnd(40))} ${D(v == null ? "null" : String(v).slice(0, 50))}`);
      }

      // Highlight talla/color/bodega fields
      const vFields = fields.filter(f =>
        /talla|color|articul|bodega|cantidad|referenc/i.test(f)
      );
      if (vFields.length > 0) {
        console.log(`\n  ${G("KEY VARIANT FIELDS IN MOVIMIENTOS_ITEMS:")}`);
        for (const f of vFields) {
          // Get sample of different values
          const vals = rows.map(r => r[f]).filter(v => v != null && v !== "");
          console.log(`    ${G(f.padEnd(40))} samples: ${vals.slice(0, 5).map(v => String(v).slice(0, 20)).join(", ")}`);
        }
      }

      // Show 3 full rows compact
      console.log(`\n  Sample transactions:`);
      for (const row of rows.slice(0, 3)) {
        const entries = Object.entries(row)
          .filter(([, v]) => v != null && v !== "" && v !== 0)
          .slice(0, 12)
          .map(([k, v]) => `${k}=${String(v).slice(0, 25)}`)
          .join(", ");
        console.log(`    ${D(entries.slice(0, 250))}`);
      }
    }
  } catch (e) {
    console.log(Y(`  MOVIMIENTOS_ITEMS: ${(e as Error).message.slice(0, 100)}`));
  }

  // ── ROUND 4: Check known SAG inventory view via consultaSagInventario ────

  console.log("");
  console.log(B("  ROUND 4: Direct inventory queries"));

  const inventoryQueries = [
    {
      label: "Saldos inventario con talla (SAG view)",
      query: "SELECT TOP 20 * FROM SALDOS_INV_TALLA_COLOR",
    },
    {
      label: "SAG inventory by article+warehouse+talla+color",
      query: "SELECT TOP 20 * FROM SALDO_INV_ART_BOD_TAL_COL",
    },
    {
      label: "SAG SALDOS_INVENTARIO_BODEGA",
      query: "SELECT TOP 20 * FROM SALDOS_INVENTARIO_BODEGA",
    },
    {
      label: "INV table",
      query: "SELECT TOP 20 * FROM INV",
    },
    {
      label: "SALDOS_INVENTARIO_ARTICULO",
      query: "SELECT TOP 20 * FROM SALDOS_INVENTARIO_ARTICULO",
    },
    {
      label: "SALDOS counting by periodo",
      query: "SELECT TOP 3 k_sc_periodo, COUNT(*) as cnt FROM SALDOS GROUP BY k_sc_periodo ORDER BY k_sc_periodo DESC",
    },
    {
      label: "SALDOS with bodega field check",
      query: "SELECT TOP 10 * FROM SALDOS WHERE ka_nl_bodega IS NOT NULL",
    },
    {
      label: "MOVIMIENTOS top 5 with item details",
      query: "SELECT TOP 5 * FROM MOVIMIENTOS",
    },
  ];

  for (const iq of inventoryQueries) {
    process.stdout.write(`  ${C(iq.label.padEnd(55))} `);
    try {
      const rows = await consultaSagJson(config, iq.query);
      console.log(G(`${rows.length} rows`));
      if (rows.length > 0) {
        const fields = Object.keys(rows[0]);
        const vFields = fields.filter(f =>
          /talla|color|articul|bodega|cantidad|exist|saldo|disponib|reserv|codigo/i.test(f)
        );
        if (vFields.length > 0) {
          console.log(`    Key fields: ${vFields.map(f => G(f)).join(", ")}`);
        }
        // First row
        const entries = Object.entries(rows[0])
          .filter(([, v]) => v != null && v !== "" && v !== 0)
          .slice(0, 12)
          .map(([k, v]) => `${k}=${String(v).slice(0, 30)}`)
          .join(", ");
        console.log(`    ${D(entries.slice(0, 250))}`);
      }
    } catch {
      console.log(Y("NOT FOUND"));
    }
  }

  // ── ROUND 5: Check MOVIMIENTOS_ITEMS for article+talla+color breakdown ───

  console.log("");
  console.log(B("  ROUND 5: MOVIMIENTOS_ITEMS variant breakdown"));

  try {
    // Get a known commercial article that manages talla/color
    const arts = await consultaSagJson(config,
      "SELECT TOP 3 k_sc_codigo_articulo FROM ARTICULOS WHERE sc_maneja_tallas = 'S' AND n_valor_venta_normal > 0"
    );
    if (arts.length > 0) {
      const artCode = arts[0].k_sc_codigo_articulo;
      console.log(`  Testing with article: ${G(String(artCode))}`);

      // Find this article in MOVIMIENTOS_ITEMS
      const items = await consultaSagJson(config,
        `SELECT TOP 20 * FROM MOVIMIENTOS_ITEMS WHERE ka_nl_articulo = '${artCode}' OR k_sc_codigo_articulo = '${artCode}'`
      );
      console.log(`  MOVIMIENTOS_ITEMS for ${artCode}: ${items.length} rows`);

      if (items.length > 0) {
        const fields = Object.keys(items[0]);
        console.log(`  All fields: ${fields.join(", ")}`);

        for (const row of items.slice(0, 5)) {
          const entries = Object.entries(row)
            .filter(([, v]) => v != null && v !== "" && v !== 0)
            .map(([k, v]) => `${k}=${String(v).slice(0, 30)}`)
            .join(", ");
          console.log(`    ${D(entries.slice(0, 300))}`);
        }
      }
    }
  } catch (e) {
    console.log(Y(`  Failed: ${(e as Error).message.slice(0, 100)}`));
  }

  console.log("");
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
