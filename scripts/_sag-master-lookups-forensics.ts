/**
 * _sag-master-lookups-forensics.ts
 *
 * SAG-MASTER-LOOKUPS-01 Phase 1 — Forensic investigation of SAG master tables.
 *
 * Probes each candidate table via consultaSagJson in read-only mode.
 * Reports: exists/not, row count, field names, first 20 rows, probable FK to ARTICULOS.
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/_sag-master-lookups-forensics.ts
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import type { PyaApiConfig, SagRow } from "@/lib/connectors/pya/types";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const C = (s: string) => `\x1b[36m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

// Tables to investigate — names are guesses based on SAG conventions
const CANDIDATE_TABLES = [
  { name: "GRUPOS_ARTICULOS",    fkHint: "ka_ni_grupo → this table's PK",      articleField: "ka_ni_grupo" },
  { name: "SUBGRUPOS_ARTICULOS", fkHint: "ka_ni_subgrupo → this table's PK",   articleField: "ka_ni_subgrupo" },
  { name: "LINEAS_ARTICULOS",    fkHint: "ka_nl_linea → this table's PK",      articleField: "ka_nl_linea" },
  { name: "TALLAS",              fkHint: "sc_maneja_tallas variants",           articleField: "sc_maneja_tallas" },
  { name: "COLORES",             fkHint: "ss_detalle_artic2 or variant table",  articleField: "ss_detalle_artic2" },
  { name: "BODEGAS",             fkHint: "warehouse for INVENTARIO",            articleField: null },
  { name: "LISTAS_PRECIOS",      fkHint: "price lists",                        articleField: null },
  // Alternative naming conventions
  { name: "GRUPOS",              fkHint: "alt name for GRUPOS_ARTICULOS",       articleField: "ka_ni_grupo" },
  { name: "LINEAS",              fkHint: "alt name for LINEAS_ARTICULOS",       articleField: "ka_nl_linea" },
  { name: "SUBGRUPOS",           fkHint: "alt name for SUBGRUPOS_ARTICULOS",    articleField: "ka_ni_subgrupo" },
  { name: "TALLAS_COLORES",      fkHint: "combined talla+color table",          articleField: null },
  { name: "UNIDADES",            fkHint: "ka_ni_tipo_unidad → this table",      articleField: "ka_ni_tipo_unidad" },
  { name: "TIPOS_UNIDAD",        fkHint: "alt for UNIDADES",                    articleField: "ka_ni_tipo_unidad" },
  { name: "MARCAS",              fkHint: "brand lookup",                        articleField: null },
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
  console.log(B("  SAG-MASTER-LOOKUPS-01 — FASE 1: FORENSE DE MAESTROS"));
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log("");
  console.log(`  Endpoint: ${D(endpointUrl)}`);
  console.log(`  Database: ${D(database ?? "(env default)")}`);
  console.log(`  Token:    ${D(token.slice(0, 6) + "..." + token.slice(-4))}`);
  console.log(`  Tables to probe: ${B(String(CANDIDATE_TABLES.length))}`);
  console.log("");

  const results: {
    table: string;
    exists: boolean;
    rowCount: number;
    fields: string[];
    sample: SagRow[];
    fkHint: string;
    error?: string;
  }[] = [];

  for (const candidate of CANDIDATE_TABLES) {
    process.stdout.write(`  Probing ${C(candidate.name.padEnd(24))} ... `);

    try {
      const rows = await consultaSagJson(config, `SELECT * FROM ${candidate.name}`);
      const fields = rows.length > 0 ? Object.keys(rows[0]) : [];
      const sample = rows.slice(0, 20);

      results.push({
        table: candidate.name,
        exists: true,
        rowCount: rows.length,
        fields,
        sample,
        fkHint: candidate.fkHint,
      });

      console.log(G(`EXISTS`) + `  ${B(String(rows.length))} rows, ${fields.length} fields`);
    } catch (e) {
      const msg = (e as Error).message;
      const isNotFound = msg.includes("SAG_ERROR") || msg.includes("SOAP_FAULT") || msg.includes("no existe") || msg.includes("Invalid");

      results.push({
        table: candidate.name,
        exists: false,
        rowCount: 0,
        fields: [],
        sample: [],
        fkHint: candidate.fkHint,
        error: msg.slice(0, 200),
      });

      if (isNotFound) {
        console.log(Y(`NOT FOUND`));
      } else {
        console.log(R(`ERROR: ${msg.slice(0, 100)}`));
      }
    }
  }

  // ── Detailed report ─────────────────────────────────────────────────────

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════"));
  console.log(B("  DETAILED RESULTS"));
  console.log(B("═══════════════════════════════════════════════════════════════"));

  const found = results.filter(r => r.exists);
  const notFound = results.filter(r => !r.exists);

  for (const r of found) {
    console.log("");
    console.log(B(`  ┌─ ${r.table}`));
    console.log(`  │ Rows:    ${G(String(r.rowCount))}`);
    console.log(`  │ FK hint: ${D(r.fkHint)}`);
    console.log(`  │ Fields (${r.fields.length}):`);

    // Print fields in columns
    const cols = 4;
    for (let i = 0; i < r.fields.length; i += cols) {
      const chunk = r.fields.slice(i, i + cols);
      console.log(`  │   ${chunk.map(f => C(f.padEnd(30))).join(" ")}`);
    }

    // Print first 10 rows as a table
    if (r.sample.length > 0) {
      console.log(`  │`);
      console.log(`  │ Sample (first ${Math.min(r.sample.length, 10)} of ${r.rowCount}):`);

      // Find likely code/name fields
      const codeFields = r.fields.filter(f =>
        /codigo|code|id|clave|numero|pk|k_/i.test(f)
      ).slice(0, 2);
      const nameFields = r.fields.filter(f =>
        /nombre|name|descripcion|detalle|desc/i.test(f)
      ).slice(0, 2);
      const showFields = [...new Set([...codeFields, ...nameFields])].slice(0, 4);

      // If no good fields found, show first 4
      const displayFields = showFields.length >= 2 ? showFields : r.fields.slice(0, 4);

      console.log(`  │   ${displayFields.map(f => B(f.padEnd(30))).join(" ")}`);
      console.log(`  │   ${displayFields.map(() => "─".repeat(30)).join(" ")}`);

      for (const row of r.sample.slice(0, 10)) {
        const vals = displayFields.map(f => {
          const v = row[f];
          if (v == null) return "—";
          const s = String(v);
          return s.length > 28 ? s.slice(0, 26) + "…" : s;
        });
        console.log(`  │   ${vals.map(v => v.padEnd(30)).join(" ")}`);
      }

      if (r.rowCount > 10) {
        console.log(`  │   ... and ${r.rowCount - 10} more rows`);
      }
    }

    console.log(`  └──`);
  }

  if (notFound.length > 0) {
    console.log("");
    console.log(Y(`  Tables NOT found (${notFound.length}):`));
    for (const r of notFound) {
      console.log(`    ${r.table.padEnd(24)} ${D(r.error?.slice(0, 80) ?? "")}`);
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
      console.log(`    ${G(r.table.padEnd(24))} ${String(r.rowCount).padStart(8)} rows   ${r.fields.length} fields   FK: ${r.fkHint}`);
    }
  }

  // ── Full field dump for found tables ──────────────────────────────────

  console.log("");
  console.log(B("  ALL FIELDS PER TABLE (for type contracts):"));
  for (const r of found) {
    console.log(`\n  ${B(r.table)}:`);
    for (const f of r.fields) {
      // Sample values from first row
      const val = r.sample[0]?.[f];
      const typeHint = val == null ? "null" : typeof val;
      const sampleVal = val == null ? "—" : String(val).slice(0, 50);
      console.log(`    ${C(f.padEnd(35))} ${typeHint.padEnd(8)} ${D(sampleVal)}`);
    }
  }

  console.log("");
}

main().catch(e => {
  console.error(`FATAL: ${(e as Error).message}`);
  process.exit(1);
});
