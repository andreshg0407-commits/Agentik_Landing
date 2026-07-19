/**
 * scripts/sag-master-report.ts
 *
 * CLI compatibility report for the SAG / Castillitos master-data sprint.
 *
 * Prints a structured terminal report showing:
 *   1. Homologation status per value set
 *   2. Query catalog readiness
 *   3. Field inventory (blocking / warn / validated)
 *   4. Write-type safety matrix
 *   5. Exact queries to run for homologation
 *   6. Recommended next steps
 *
 * READ-ONLY — zero DB writes, zero SAG calls.
 *
 * Usage:
 *   npx tsx scripts/sag-master-report.ts
 *   npx tsx scripts/sag-master-report.ts --queries       # show homologation queries
 *   npx tsx scripts/sag-master-report.ts --fields        # show full field inventory
 *   npx tsx scripts/sag-master-report.ts --matrix        # show compatibility table
 *
 * After running SAG homologation queries, populate:
 *   lib/sag/master-data/castillitos-overrides.ts
 *
 * Then re-run this script to see homologation progress update.
 */

import {
  MASTER_FIELDS,
  PENDING_HOMOLOGATION,
  HARD_BLOCK_FIELDS,
  VALIDATED_FIELDS,
  renderCompatibilityTable,
  getHomologationQueries,
} from "../lib/sag/master-data/compatibility-matrix";

import {
  getHomologationSummary,
  ALL_VALUE_SETS,
} from "../lib/sag/master-data/castillitos-overrides";

import {
  queryCatalogSummary,
  allQueries,
  QUERY_CATALOG,
} from "../lib/connectors/adapters/sag-pya-soap/query-catalog";

// ── CLI flags ─────────────────────────────────────────────────────────────────

const SHOW_QUERIES = process.argv.includes("--queries");
const SHOW_FIELDS  = process.argv.includes("--fields");
const SHOW_MATRIX  = process.argv.includes("--matrix");
const SHOW_ALL     = !SHOW_QUERIES && !SHOW_FIELDS && !SHOW_MATRIX;

// ── Colour helpers ─────────────────────────────────────────────────────────────

const C = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  red:     "\x1b[31m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  blue:    "\x1b[34m",
  cyan:    "\x1b[36m",
  white:   "\x1b[37m",
  grey:    "\x1b[90m",
};

function ok(msg: string)    { console.log(`  ${C.green}✓${C.reset} ${msg}`); }
function warn(msg: string)  { console.log(`  ${C.yellow}⚠${C.reset} ${msg}`); }
function block(msg: string) { console.log(`  ${C.red}✗${C.reset} ${msg}`); }
function info(msg: string)  { console.log(`  ${C.grey}·${C.reset} ${msg}`); }

function section(title: string) {
  console.log(`\n${C.bold}${C.cyan}── ${title} ${C.reset}`);
  console.log(C.grey + "─".repeat(70) + C.reset);
}

function subsection(title: string) {
  console.log(`\n  ${C.bold}${title}${C.reset}`);
}

function progressBar(done: number, total: number, width = 30): string {
  const pct    = total === 0 ? 0 : done / total;
  const filled = Math.round(pct * width);
  const empty  = width - filled;
  const color  = pct === 1 ? C.green : pct > 0.5 ? C.yellow : C.red;
  return color + "█".repeat(filled) + C.grey + "░".repeat(empty) + C.reset
    + ` ${done}/${total} (${Math.round(pct * 100)}%)`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  console.log(`\n${C.bold}╔══════════════════════════════════════════════════════════════════════╗`);
  console.log(`║     Agentik × SAG — Compatibility & Master Data Report              ║`);
  console.log(`║     Organización: Castillitos (PYA SAG SOAP)                        ║`);
  console.log(`╚══════════════════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`  Fecha: ${new Date().toLocaleString("es-CO")}`);

  // ── 1. Homologation status ───────────────────────────────────────────────────

  if (SHOW_ALL || SHOW_QUERIES) {
    section("1. Homologación de Datos Maestros");

    const homoSummary = getHomologationSummary();
    console.log(`\n  ${C.bold}Progreso global:${C.reset} ${progressBar(homoSummary.confirmed, homoSummary.total)}\n`);

    for (const [name, vs] of Object.entries(ALL_VALUE_SETS)) {
      if (vs.confirmed) {
        ok(`${name.padEnd(20)} — ${vs.values.length} valores confirmados${vs.confirmedAt ? ` (${vs.confirmedAt})` : ""}`);
      } else if (vs.values.length > 0) {
        warn(`${name.padEnd(20)} — ${vs.values.length} valores provisionales (sin confirmar)`);
      } else {
        block(`${name.padEnd(20)} — PENDIENTE: sin valores homologados`);
      }
    }

    if (SHOW_QUERIES) {
      subsection("Queries de Homologación (ejecutar en SAG Castillitos):");
      const homoQueries = getHomologationQueries();
      for (const [domain, entries] of Object.entries(homoQueries)) {
        console.log(`\n  ${C.bold}${domain.toUpperCase()}${C.reset}`);
        for (const e of entries) {
          console.log(`    ${C.cyan}${e.sagField}:${C.reset}`);
          console.log(`      ${C.yellow}${e.query}${C.reset}`);
        }
      }

      console.log(`\n  ${C.bold}Master lookups (catálogo SAG PYA):${C.reset}`);
      for (const q of Object.values(QUERY_CATALOG.masterLookups)) {
        const statusColor = q.status === "validated" ? C.green : q.status === "pending" ? C.yellow : C.grey;
        console.log(`    ${statusColor}[${q.status}]${C.reset} ${q.key}`);
        console.log(`      SQL: ${C.yellow}${q.query}${C.reset}`);
      }
    }
  }

  // ── 2. Query catalog readiness ───────────────────────────────────────────────

  if (SHOW_ALL || SHOW_QUERIES) {
    section("2. Catálogo de Queries SAG");

    const qs = queryCatalogSummary();
    console.log(`\n  ${C.bold}Queries validadas:${C.reset} ${progressBar(qs.validated, qs.total)}`);
    console.log(`  Pendientes: ${qs.pending}  |  Placeholders: ${qs.placeholder}\n`);

    for (const [domain, stat] of Object.entries(qs.byDomain)) {
      const domainBar = progressBar(stat.validated, stat.total, 20);
      console.log(`  ${domain.padEnd(15)} ${domainBar}`);
    }
  }

  // ── 3. Field inventory ───────────────────────────────────────────────────────

  if (SHOW_ALL || SHOW_FIELDS) {
    section("3. Inventario de Campos Master");

    console.log(`\n  ${C.bold}Resumen:${C.reset}`);
    info(`Total campos documentados:  ${MASTER_FIELDS.length}`);
    info(`Hard block (validación activa): ${HARD_BLOCK_FIELDS.length}`);
    info(`Warn only (homologación pendiente): ${MASTER_FIELDS.filter(f => f.blockPolicy === "warn_only").length}`);
    info(`Validated OK (ya cubierto): ${MASTER_FIELDS.filter(f => f.blockPolicy === "validated_ok").length}`);
    info(`Pendientes homologación: ${PENDING_HOMOLOGATION.length}`);
    info(`Validados / estándar colombiano: ${VALIDATED_FIELDS.length}`);

    if (SHOW_FIELDS) {
      console.log();
      console.log(renderCompatibilityTable());
    }
  }

  // ── 4. Write safety matrix ───────────────────────────────────────────────────

  if (SHOW_ALL) {
    section("4. Matriz de Seguridad de Escrituras SAG");

    const writeTypes = [
      { type: 1,  name: "Upsert Cliente (tipo 1)",         risk: "LOW",    safe: false,
        reason: "Pendiente homologación FORMA_PAGO, ZONA, NIT_VENDEDOR, DANE" },
      { type: 3,  name: "Upsert Tercero (tipo 3)",         risk: "LOW",    safe: false,
        reason: "Mismos bloqueadores que tipo 1" },
      { type: 5,  name: "Upsert Artículo (tipo 5)",        risk: "LOW",    safe: false,
        reason: "Pendiente GRUPO, LINEA, TARIFA_IVA" },
      { type: 2,  name: "Crear Documento (tipo 2)",        risk: "HIGH",   safe: false,
        reason: "BODEGA no confirmada — BLOQUEADOR CRÍTICO" },
      { type: 28, name: "Documento Genérico (tipo 28)",    risk: "MEDIUM", safe: false,
        reason: "BODEGA no confirmada — BLOQUEADOR CRÍTICO" },
      { type: 6,  name: "Recibos / Egresos (tipo 6)",      risk: "HIGH",   safe: false,
        reason: "BLOQUEADO por política v1 — requiere aprobación legal" },
    ];

    console.log();
    for (const w of writeTypes) {
      const riskColor = w.risk === "HIGH" ? C.red : w.risk === "MEDIUM" ? C.yellow : C.green;
      const icon = w.safe ? `${C.green}✓ SEGURO  ${C.reset}` : `${C.red}✗ NO SEGURO${C.reset}`;
      console.log(`  tipo ${w.type}  ${riskColor}[${w.risk}]${C.reset}  ${icon}  ${w.name}`);
      console.log(`         ${C.grey}${w.reason}${C.reset}`);
    }
  }

  // ── 5. Recommendations ──────────────────────────────────────────────────────

  if (SHOW_ALL) {
    section("5. Recomendaciones — Próximos Pasos");

    subsection("✓ Seguro probar AHORA:");
    console.log(`    · Leer TERCEROS y CARTERA (ya validado)`);
    console.log(`    · Preview de cliente y artículo (sin enqueue)`);
    console.log(`    · UI de Cola de Aprobaciones (flujo completo)`);

    subsection("⚠ Requiere homologación primero:");
    console.log(`    · Upsert real de cliente (tipo 1) — confirmar FORMA_PAGO, ZONA, VENDEDORES`);
    console.log(`    · Upsert real de artículo (tipo 5) — confirmar GRUPO, LINEA, TARIFA_IVA`);
    console.log(`    · Tipo 2/28 — confirmar BODEGA (CRÍTICO)`);

    subsection("📋 Datos a solicitar de Castillitos / PYA DBA:");
    const queries = getHomologationQueries();
    let i = 1;
    for (const [, entries] of Object.entries(queries)) {
      for (const e of entries) {
        console.log(`    ${i++}. ${e.sagField}: ${C.yellow}${e.query}${C.reset}`);
      }
    }
    // Add extra queries from masterLookups
    for (const q of Object.values(QUERY_CATALOG.masterLookups)) {
      console.log(`    ${i++}. ${q.key.replace("master.", "")}: ${C.yellow}${q.query}${C.reset}`);
    }

    subsection("🚀 Orden recomendado para primer test real:");
    const steps = [
      "Ejecutar todas las queries de homologación → poblar castillitos-overrides.ts",
      "Test upsert cliente mínimo (NIT + NOMBRE únicamente)",
      "Verificar que el cliente aparece en SELECT * FROM TERCEROS",
      "Test upsert artículo mínimo (CODIGO + DESCRIPCION + PRECIO + IVA=19 + UNIDAD=UND)",
      "Verificar que el artículo aparece en SELECT * FROM ARTICULOS",
      "Confirmar BODEGAS, luego test documento tipo 2 con 1 línea",
    ];
    steps.forEach((s, idx) => console.log(`    ${idx + 1}. ${s}`));
  }

  // ── 6. Compatibility matrix (optional) ──────────────────────────────────────

  if (SHOW_MATRIX) {
    section("Matriz de Compatibilidad — Campos Master");
    console.log();
    console.log(renderCompatibilityTable());
  }

  // ── Final status line ────────────────────────────────────────────────────────

  const homo    = getHomologationSummary();
  const queries = queryCatalogSummary();
  const readiness = homo.confirmed === homo.total && queries.validated === queries.total
    ? `${C.green}PRODUCTION_READY${C.reset}`
    : homo.confirmed > 0
    ? `${C.yellow}PARTIAL — ${homo.pending} conjuntos pendientes${C.reset}`
    : `${C.red}NOT_READY — homologación requerida${C.reset}`;

  console.log(`\n${C.bold}Estado de Integración Castillitos:${C.reset} ${readiness}`);
  console.log(`${C.grey}Para poblar datos de homologación: lib/sag/master-data/castillitos-overrides.ts${C.reset}\n`);
}

main();
