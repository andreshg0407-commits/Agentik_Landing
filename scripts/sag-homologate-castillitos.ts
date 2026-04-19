/**
 * scripts/sag-homologate-castillitos.ts
 *
 * Real SAG master-data discovery and homologation runner for Castillitos.
 *
 * Connects to the live Castillitos SAG SOAP endpoint using the credentials
 * stored in the sag_pya_soap Connector record, runs 14+ master lookup queries,
 * and optionally auto-patches lib/sag/master-data/castillitos-overrides.ts
 * with confirmed values.
 *
 * Phases executed:
 *   Phase 1 — Run master lookup queries (BODEGAS, FORMAS_PAGO, ZONAS, …)
 *   Phase 2 — Structural discovery (ARTICULOS table name + fields, INVENTARIO)
 *   Phase 3 — Auto-patch castillitos-overrides.ts (only with --write flag)
 *
 * Usage:
 *   npx tsx scripts/sag-homologate-castillitos.ts
 *   npx tsx scripts/sag-homologate-castillitos.ts --write          # patch overrides file
 *   npx tsx scripts/sag-homologate-castillitos.ts --verbose        # show discovered rows
 *   npx tsx scripts/sag-homologate-castillitos.ts --org=castillitos
 *   PYA_DEBUG=true npx tsx scripts/sag-homologate-castillitos.ts   # log raw SOAP
 *
 * READ-ONLY to SAG (only SELECT queries). Zero SAG writes.
 * DB reads only (loads connector config). Zero DB writes.
 */

import * as fs   from "fs";
import * as path from "path";
import { prisma }         from "../lib/prisma";
import { getPyaConfig }   from "../lib/connectors/pya/auth";
import { consultaSagJson } from "../lib/connectors/pya/client";
import type { SagRows }   from "../lib/connectors/pya/types";

// ── CLI options ────────────────────────────────────────────────────────────────

const ORG_SLUG  = process.argv.find(a => a.startsWith("--org="))?.slice(6) ?? "castillitos";
const DO_WRITE  = process.argv.includes("--write");
const VERBOSE   = process.argv.includes("--verbose");

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
  grey:    "\x1b[90m",
};

function ok(msg: string)    { console.log(`  ${C.green}✓${C.reset} ${msg}`); }
function warn(msg: string)  { console.log(`  ${C.yellow}⚠${C.reset} ${msg}`); }
function fail(msg: string)  { console.log(`  ${C.red}✗${C.reset} ${msg}`); }
function info(msg: string)  { console.log(`  ${C.grey}·${C.reset} ${msg}`); }

function section(title: string) {
  console.log(`\n${C.bold}${C.cyan}── ${title}${C.reset}`);
  console.log(C.grey + "─".repeat(68) + C.reset);
}

// ── Discovery types ────────────────────────────────────────────────────────────

interface DiscoveryTask {
  /** Key in castillitos-overrides ALL_VALUE_SETS (PascalCase without CASTILLITOS_) */
  overridesKey: string;
  label:        string;
  /** SQL queries to try in priority order — first success wins */
  queries:      string[];
  /** Row field to use as the value code. Default: CODIGO */
  codeField:    string;
  /** Row field to use as the human label. Default: DESCRIPCION */
  labelField:   string;
  /** Custom extractor when code/label logic is non-standard */
  transform?:   (rows: SagRows) => { codes: string[]; labels: Record<string, string> };
}

interface DiscoveryResult {
  task:        DiscoveryTask;
  ok:          boolean;
  codes:       string[];
  labels:      Record<string, string>;
  sourceQuery: string;         // the query that succeeded
  sourceTable: string;         // inferred from the query
  sampleSize:  number;
  fieldNames:  string[];       // actual fields returned by SAG
  confidence:  number;         // 0.0 – 1.0
  error?:      string;
  rawSample?:  Record<string, unknown>[];
}

interface StructuralDiscovery {
  articlesTable:    string | null;  // confirmed table name for ARTICULOS
  articlesFields:   string[];
  inventoryTable:   string | null;
  inventoryFields:  string[];
  notes:            string[];
}

// ── Discovery task definitions ─────────────────────────────────────────────────

const MASTER_TASKS: DiscoveryTask[] = [

  {
    overridesKey: "BODEGAS",
    label:        "Bodegas (Warehouses)",
    queries: [
      "SELECT * FROM BODEGAS",
      "SELECT * FROM ALMACENES",
      "SELECT * FROM BODEGA",
    ],
    codeField:  "CODIGO",
    labelField: "DESCRIPCION",
  },

  {
    overridesKey: "FORMAS_PAGO",
    label:        "Formas de Pago",
    queries: [
      "SELECT * FROM FORMAS_PAGO",
      "SELECT * FROM FORMA_PAGO",
      "SELECT * FROM FORMAS_DE_PAGO",
      "SELECT * FROM CONDICION_PAGO",
    ],
    codeField:  "CODIGO",
    labelField: "DESCRIPCION",
  },

  {
    overridesKey: "ZONAS",
    label:        "Zonas Comerciales",
    queries: [
      "SELECT * FROM ZONAS",
      "SELECT * FROM ZONA",
      "SELECT * FROM ZONAS_COMERCIALES",
      "SELECT * FROM ZONA_COMERCIAL",
    ],
    codeField:  "CODIGO",
    labelField: "DESCRIPCION",
  },

  {
    overridesKey: "TIPOS_TERCERO",
    label:        "Tipos de Tercero",
    queries: [
      "SELECT * FROM TIPO_TERCERO",
      "SELECT * FROM TIPOS_TERCERO",
      "SELECT * FROM TIPO_TERCEROS",
    ],
    codeField:  "CODIGO",
    labelField: "DESCRIPCION",
  },

  {
    overridesKey: "TIPOS_CLIENTE",
    label:        "Tipos de Cliente",
    queries: [
      "SELECT * FROM TIPO_CLIENTE",
      "SELECT * FROM TIPOS_CLIENTE",
      "SELECT * FROM TIPO_CLIENTES",
    ],
    codeField:  "CODIGO",
    labelField: "DESCRIPCION",
  },

  {
    overridesKey: "VENDEDORES",
    label:        "Vendedores (Sales Reps)",
    queries: [
      "SELECT NIT, NOMBRE FROM TERCEROS WHERE TIPO_TERCERO = 'VEN'",
      "SELECT NIT, NOMBRE FROM TERCEROS WHERE TIPO_TERCERO = 'V'",
      "SELECT NIT, NOMBRE FROM TERCEROS WHERE TIPO_TERCERO = 'VENDEDOR'",
      "SELECT NIT, NOMBRE FROM TERCEROS WHERE TIPO = 'V'",
      // Fallback: dedicated vendors table
      "SELECT NIT, NOMBRE FROM VENDEDORES",
    ],
    codeField:  "NIT",
    labelField: "NOMBRE",
    transform: (rows) => {
      const codes: string[] = [];
      const labels: Record<string, string> = {};
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        const nit = normalizeNit9(String(row.NIT ?? ""));
        const nom = String(row.NOMBRE ?? "").trim();
        if (nit) {
          codes.push(nit);
          if (nom) labels[nit] = nom;
        }
      }
      return { codes, labels };
    },
  },

  {
    overridesKey: "LISTAS_PRECIO",
    label:        "Listas de Precio",
    queries: [
      "SELECT * FROM LISTAS_PRECIOS",
      "SELECT * FROM LISTA_PRECIOS",
      "SELECT * FROM LISTAS_PRECIO",
      "SELECT * FROM PRECIOS_LISTA",
    ],
    codeField:  "LISTA_PRECIO",
    labelField: "DESCRIPCION",
    transform: (rows) => {
      // Extract distinct LISTA_PRECIO values (may be numeric 1-7)
      const seen = new Set<string>();
      const labels: Record<string, string> = {};
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        // Try multiple field name variants
        const code = String(
          row.LISTA_PRECIO ?? row.CODIGO_LISTA ?? row.NUMERO_LISTA ?? ""
        ).trim();
        const label = String(row.DESCRIPCION ?? row.NOMBRE ?? "").trim();
        if (code) {
          seen.add(code);
          if (label) labels[code] = label;
        }
      }
      return { codes: [...seen].sort(), labels };
    },
  },

  {
    overridesKey: "GRUPOS",
    label:        "Grupos de Artículo",
    queries: [
      "SELECT * FROM GRUPOS_ARTICULOS",
      "SELECT * FROM GRUPOS",
      "SELECT * FROM GRUPO_ARTICULOS",
      "SELECT * FROM GRUPO",
      "SELECT DISTINCT GRUPO, DESCRIPCION_GRUPO FROM ARTICULOS",
    ],
    codeField:  "CODIGO",
    labelField: "DESCRIPCION",
    transform: (rows) => {
      const seen = new Set<string>();
      const labels: Record<string, string> = {};
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        const code = String(
          row.CODIGO ?? row.GRUPO ?? row.COD_GRUPO ?? ""
        ).trim().toUpperCase();
        const label = String(
          row.DESCRIPCION ?? row.DESCRIPCION_GRUPO ?? row.NOMBRE ?? ""
        ).trim();
        if (code) {
          seen.add(code);
          if (label) labels[code] = label;
        }
      }
      return { codes: [...seen].sort(), labels };
    },
  },

  {
    overridesKey: "SUB_GRUPOS",
    label:        "Sub-Grupos de Artículo",
    queries: [
      "SELECT * FROM SUB_GRUPOS_ARTICULOS",
      "SELECT * FROM SUBGRUPOS_ARTICULOS",
      "SELECT * FROM SUB_GRUPOS",
      "SELECT * FROM SUBGRUPOS",
      "SELECT DISTINCT SUB_GRUPO FROM ARTICULOS",
    ],
    codeField:  "CODIGO",
    labelField: "DESCRIPCION",
    transform: (rows) => {
      const seen = new Set<string>();
      const labels: Record<string, string> = {};
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        const code = String(
          row.CODIGO ?? row.SUB_GRUPO ?? row.SUBGRUPO ?? ""
        ).trim().toUpperCase();
        const label = String(
          row.DESCRIPCION ?? row.NOMBRE ?? ""
        ).trim();
        if (code) {
          seen.add(code);
          if (label) labels[code] = label;
        }
      }
      return { codes: [...seen].sort(), labels };
    },
  },

  {
    overridesKey: "LINEAS",
    label:        "Líneas de Artículo",
    queries: [
      "SELECT * FROM LINEAS_ARTICULOS",
      "SELECT * FROM LINEAS",
      "SELECT * FROM LINEA_ARTICULOS",
      "SELECT * FROM LINEA",
      "SELECT DISTINCT LINEA, DESCRIPCION_LINEA FROM ARTICULOS",
    ],
    codeField:  "CODIGO",
    labelField: "DESCRIPCION",
    transform: (rows) => {
      const seen = new Set<string>();
      const labels: Record<string, string> = {};
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        const code = String(
          row.CODIGO ?? row.LINEA ?? row.COD_LINEA ?? ""
        ).trim().toUpperCase();
        const label = String(
          row.DESCRIPCION ?? row.DESCRIPCION_LINEA ?? row.NOMBRE ?? ""
        ).trim();
        if (code) {
          seen.add(code);
          if (label) labels[code] = label;
        }
      }
      return { codes: [...seen].sort(), labels };
    },
  },

  {
    overridesKey: "TARIFAS_IVA",
    label:        "Tarifas IVA",
    queries: [
      "SELECT * FROM TARIFAS_IVA",
      "SELECT * FROM TARIFA_IVA",
      "SELECT * FROM IVA_TARIFAS",
      "SELECT * FROM IVA",
      "SELECT DISTINCT TARIFA_IVA, IVA FROM ARTICULOS",
    ],
    codeField:  "CODIGO",
    labelField: "DESCRIPCION",
    transform: (rows) => {
      const seen = new Set<string>();
      const labels: Record<string, string> = {};
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        const code = String(
          row.CODIGO ?? row.TARIFA_IVA ?? row.COD_IVA ?? ""
        ).trim().toUpperCase();
        const pct  = row.PORCENTAJE ?? row.IVA ?? "";
        const label = String(
          row.DESCRIPCION ?? (pct !== "" ? `IVA ${pct}%` : "")
        ).trim();
        if (code) {
          seen.add(code);
          if (label) labels[code] = label;
        }
      }
      return { codes: [...seen].sort(), labels };
    },
  },

  {
    overridesKey: "TALLAS",
    label:        "Tallas",
    queries: [
      "SELECT * FROM TALLAS",
      "SELECT * FROM TALLA",
      "SELECT DISTINCT TALLA FROM ARTICULOS",
    ],
    codeField:  "CODIGO",
    labelField: "DESCRIPCION",
    transform: (rows) => {
      const seen = new Set<string>();
      const labels: Record<string, string> = {};
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        const code = String(
          row.CODIGO ?? row.TALLA ?? ""
        ).trim().toUpperCase();
        const label = String(row.DESCRIPCION ?? row.NOMBRE ?? code).trim();
        if (code) {
          seen.add(code);
          labels[code] = label || code;
        }
      }
      return { codes: [...seen].sort(), labels };
    },
  },

  {
    overridesKey: "COLORES",
    label:        "Colores",
    queries: [
      "SELECT * FROM COLORES",
      "SELECT * FROM COLOR",
      "SELECT DISTINCT COLOR FROM ARTICULOS",
    ],
    codeField:  "CODIGO",
    labelField: "DESCRIPCION",
    transform: (rows) => {
      const seen = new Set<string>();
      const labels: Record<string, string> = {};
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        const code = String(
          row.CODIGO ?? row.COLOR ?? ""
        ).trim().toUpperCase();
        const label = String(row.DESCRIPCION ?? row.NOMBRE ?? code).trim();
        if (code) {
          seen.add(code);
          labels[code] = label || code;
        }
      }
      return { codes: [...seen].sort(), labels };
    },
  },

  {
    overridesKey: "UNIDADES",
    label:        "Unidades de Medida",
    queries: [
      "SELECT * FROM UNIDADES_MEDIDA",
      "SELECT * FROM UNIDADES",
      "SELECT * FROM UNIDAD_MEDIDA",
      "SELECT DISTINCT UNIDAD FROM ARTICULOS",
    ],
    codeField:  "CODIGO",
    labelField: "DESCRIPCION",
    transform: (rows) => {
      const seen = new Set<string>();
      const labels: Record<string, string> = {};
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        const code = String(
          row.CODIGO ?? row.UNIDAD ?? ""
        ).trim().toUpperCase();
        const label = String(row.DESCRIPCION ?? row.NOMBRE ?? code).trim();
        if (code) {
          seen.add(code);
          labels[code] = label || code;
        }
      }
      return { codes: [...seen].sort(), labels };
    },
  },

];

// ── Structural discovery tasks ─────────────────────────────────────────────────

const STRUCT_QUERIES = {
  articlesCandidates: [
    "SELECT * FROM ARTICULOS",
    "SELECT * FROM PRODUCTOS",
    "SELECT * FROM ITEMS",
  ],
  inventoryCandidates: [
    "SELECT * FROM INVENTARIO",
    "SELECT * FROM SALDOS",
    "SELECT * FROM EXISTENCIAS",
    "SELECT * FROM SALDOS_INVENTARIO",
  ],
};

// ── NIT helper (local, no dependency on normalizer) ───────────────────────────

function normalizeNit9(raw: string): string {
  if (!raw) return "";
  let s = raw.trim().replace(/[.\s]/g, "");
  s = s.replace(/-\d$/, "");
  if (/^\d{10}$/.test(s)) s = s.slice(0, 9);
  return /^\d{9}$/.test(s) ? s : "";
}

// ── Error classifier ──────────────────────────────────────────────────────────

type SagErrorKind =
  | "transport"      // network failure, HTTP non-200 before SOAP parsing
  | "sag_app"        // SAG returned s_estado != 0 / FALLIDO
  | "invalid_query"  // table/view doesn't exist for this tenant
  | "auth"           // token rejected or tenant mismatch
  | "unknown";

function classifySagError(msg: string): { kind: SagErrorKind; hint: string } {
  const m = msg.toUpperCase();

  // Transport-level: HTTP error before SAG processed the request
  if (msg.startsWith("PYA_HTTP_ERROR")) {
    return {
      kind: "transport",
      hint: "El servidor SAG devolvió un error HTTP. Verificar endpoint y conectividad de red.",
    };
  }

  // Authentication / tenant: token invalid or tenant not found
  if (
    m.includes("TOKEN") ||
    m.includes("AUTENTI") ||
    m.includes("INVALID_TOKEN") ||
    m.includes("ACCESO DENEGADO") ||
    m.includes("ACCESS DENIED")
  ) {
    return {
      kind: "auth",
      hint: "Token rechazado o tenant incorrecto. Verificar PYA_SOAP_TOKEN y org slug.",
    };
  }

  // SAG application-level error (s_estado FALLIDO / non-zero)
  if (msg.startsWith("PYA_SAG_ERROR")) {
    // Null-reference is typically a bad query or missing view, not auth
    if (
      m.includes("OBJECT REFERENCE") ||
      m.includes("NULL") ||
      m.includes("NullReferenceException".toUpperCase())
    ) {
      return {
        kind: "invalid_query",
        hint: "La vista o tabla no existe en este tenant SAG. Probar otra query.",
      };
    }
    return {
      kind: "sag_app",
      hint: "SAG rechazó la consulta a nivel de aplicación (s_estado FALLIDO).",
    };
  }

  // SOAP fault
  if (msg.startsWith("PYA_SOAP_FAULT")) {
    return {
      kind: "transport",
      hint: "SOAP fault devuelto por el servidor. Puede indicar problema de protocolo o versión.",
    };
  }

  // Generic: "invalid object name" = table/view absent
  if (
    m.includes("INVALID OBJECT NAME") ||
    m.includes("OBJETO NO VÁLIDO") ||
    m.includes("NO EXISTE") ||
    m.includes("DOES NOT EXIST")
  ) {
    return {
      kind: "invalid_query",
      hint: "La tabla o vista no existe en este tenant.",
    };
  }

  return { kind: "unknown", hint: "Error desconocido." };
}

// ── Connectivity probe ────────────────────────────────────────────────────────
//
// Tries each probe query in order; first success wins.
// Returns the working query and its rows, or aborts the run with a
// human-readable diagnosis if all probes fail.

const PROBE_QUERIES: Array<{ label: string; sql: string }> = [
  {
    label: "v_clientes TOP 1 (official example)",
    sql:   "SELECT TOP 1 n_nit AS Documento, sc_nombre AS Nombre FROM v_clientes",
  },
  {
    label: "v_clientes TOP 1 *",
    sql:   "SELECT TOP 1 * FROM v_clientes",
  },
  {
    label: "cartera TOP 1",
    sql:   "SELECT TOP 1 * FROM cartera",
  },
  {
    label: "terceros TOP 1",
    sql:   "SELECT TOP 1 * FROM terceros",
  },
];

async function probeConnection(
  config: { token: string; endpointUrl: string },
): Promise<{ sql: string; label: string; rows: SagRows }> {
  const probeErrors: Array<{ label: string; sql: string; kind: SagErrorKind; hint: string; raw: string }> = [];

  for (const probe of PROBE_QUERIES) {
    const res = await tryQuery(config, probe.sql);

    if (res.ok) {
      ok(`Probe "${probe.label}" — OK (${res.rows.length} fila(s))`);
      return { sql: probe.sql, label: probe.label, rows: res.rows };
    }

    const { kind, hint } = classifySagError(res.error);
    probeErrors.push({ ...probe, kind, hint, raw: res.error });
    info(`Probe "${probe.label}" — ${kind}: ${hint}`);

    // If error is auth-related, all other queries will fail too — abort early
    if (kind === "auth") {
      break;
    }
  }

  // All probes failed — print diagnosis then exit
  console.log();
  fail("DIAGNÓSTICO: ningún probe SAG respondió correctamente.\n");

  // Group by kind for clearer output
  const kinds = [...new Set(probeErrors.map(e => e.kind))];
  for (const kind of kinds) {
    const group = probeErrors.filter(e => e.kind === kind);
    console.log(`  ${C.bold}${kind.toUpperCase()}${C.reset}`);
    for (const e of group) {
      console.log(`    · "${e.label}"`);
      console.log(`      ${C.grey}${e.raw.slice(0, 120)}${C.reset}`);
    }
    console.log(`    Sugerencia: ${group[0].hint}`);
    console.log();
  }

  if (probeErrors.some(e => e.kind === "auth")) {
    console.error(`${C.red}Homologación cancelada — problema de autenticación/tenant.${C.reset}`);
    console.error("Verificar: token en DB connector, org slug, PYA_SOAP_TOKEN env.");
  } else if (probeErrors.every(e => e.kind === "invalid_query")) {
    console.error(`${C.red}Homologación cancelada — ninguna vista/tabla de prueba existe en este SAG.${C.reset}`);
    console.error("El tenant puede tener un esquema diferente. Compartir el WSDL o esquema con P&A.");
  } else {
    console.error(`${C.red}Homologación cancelada — sin conexión SAG.${C.reset}`);
  }

  process.exit(1);
}

// ── Query runner ──────────────────────────────────────────────────────────────

async function tryQuery(
  config: { token: string; endpointUrl: string },
  sql: string,
): Promise<{ rows: SagRows; ok: true } | { ok: false; error: string }> {
  try {
    const rows = await consultaSagJson(config, sql);
    return { rows, ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function runDiscoveryTask(
  config: { token: string; endpointUrl: string },
  task: DiscoveryTask,
): Promise<DiscoveryResult> {
  let lastError = "";

  for (const sql of task.queries) {
    const res = await tryQuery(config, sql);

    if (!res.ok) {
      lastError = res.error;
      continue;  // try next variant
    }

    const rows    = res.rows;
    const sample  = rows.slice(0, 3) as Record<string, unknown>[];
    const fieldNames = rows.length > 0
      ? Object.keys(rows[0] as Record<string, unknown>)
      : [];

    // Extract codes + labels
    let codes:  string[]             = [];
    let labels: Record<string, string> = {};

    if (task.transform) {
      const extracted = task.transform(rows);
      codes  = extracted.codes;
      labels = extracted.labels;
    } else {
      for (const r of rows) {
        const row = r as Record<string, unknown>;
        const code  = String(row[task.codeField] ?? "").trim().toUpperCase();
        const label = String(row[task.labelField] ?? "").trim();
        if (code) {
          codes.push(code);
          if (label) labels[code] = label;
        }
      }
      // Deduplicate
      codes = [...new Set(codes)].sort();
    }

    // Infer table name from query
    const tableMatch = sql.match(/FROM\s+(\w+)/i);
    const sourceTable = tableMatch ? tableMatch[1] : "UNKNOWN";

    // Confidence scoring
    const hasKnownFields = fieldNames.some(f =>
      ["CODIGO", "DESCRIPCION", "NIT", "NOMBRE", "LISTA_PRECIO"].includes(f.toUpperCase())
    );
    let confidence =
      rows.length > 20 ? 1.0 :
      rows.length > 5  ? 0.9 :
      rows.length > 0  ? 0.8 :
      0.5;  // table exists but empty
    if (!hasKnownFields && rows.length > 0) confidence *= 0.7;

    return {
      task,
      ok:          true,
      codes,
      labels,
      sourceQuery: sql,
      sourceTable,
      sampleSize:  rows.length,
      fieldNames,
      confidence,
      rawSample:   VERBOSE ? sample : undefined,
    };
  }

  // All variants failed
  return {
    task,
    ok:          false,
    codes:       [],
    labels:      {},
    sourceQuery: "",
    sourceTable: "",
    sampleSize:  0,
    fieldNames:  [],
    confidence:  0,
    error:       lastError,
  };
}

async function runStructuralDiscovery(
  config: { token: string; endpointUrl: string },
): Promise<StructuralDiscovery> {
  const result: StructuralDiscovery = {
    articlesTable:   null,
    articlesFields:  [],
    inventoryTable:  null,
    inventoryFields: [],
    notes:           [],
  };

  // Articles table discovery
  for (const sql of STRUCT_QUERIES.articlesCandidates) {
    const res = await tryQuery(config, sql);
    if (res.ok && res.rows.length > 0) {
      const tableMatch = sql.match(/FROM\s+(\w+)/i);
      result.articlesTable  = tableMatch?.[1] ?? null;
      result.articlesFields = Object.keys(res.rows[0] as Record<string, unknown>);
      result.notes.push(`ARTICULOS: table confirmed as ${result.articlesTable} (${res.rows.length} rows)`);

      // Check for key field variants
      const fields = result.articlesFields.map(f => f.toUpperCase());
      if (fields.includes("PRECIO_1"))     result.notes.push("ARTICULOS: price field is PRECIO_1 (not PRECIO)");
      if (fields.includes("PV1"))          result.notes.push("ARTICULOS: price field is PV1");
      if (fields.includes("PRECIO"))       result.notes.push("ARTICULOS: price field confirmed as PRECIO");
      if (!fields.includes("FECHA_MODIFICACION")) result.notes.push("ARTICULOS: FECHA_MODIFICACION absent — incremental sync not available");
      break;
    }
  }

  if (!result.articlesTable) {
    result.notes.push("ARTICULOS: all table candidates failed — article sync not yet available");
  }

  // Inventory table discovery
  for (const sql of STRUCT_QUERIES.inventoryCandidates) {
    const res = await tryQuery(config, sql);
    if (res.ok && res.rows.length > 0) {
      const tableMatch = sql.match(/FROM\s+(\w+)/i);
      result.inventoryTable  = tableMatch?.[1] ?? null;
      result.inventoryFields = Object.keys(res.rows[0] as Record<string, unknown>);
      result.notes.push(`INVENTARIO: table confirmed as ${result.inventoryTable} (${res.rows.length} rows)`);

      const fields = result.inventoryFields.map(f => f.toUpperCase());
      if (fields.includes("BODEGA"))          result.notes.push("INVENTARIO: BODEGA field confirmed");
      if (fields.includes("SALDO"))           result.notes.push("INVENTARIO: balance field is SALDO");
      if (fields.includes("EXISTENCIA"))      result.notes.push("INVENTARIO: balance field is EXISTENCIA");
      if (fields.includes("COSTO_PROMEDIO"))  result.notes.push("INVENTARIO: COSTO_PROMEDIO available");
      break;
    }
  }

  if (!result.inventoryTable) {
    result.notes.push("INVENTARIO: all table candidates failed — inventory sync not yet available");
  }

  return result;
}

// ── Overrides file generator ───────────────────────────────────────────────────

function generateOverridesFile(
  results: DiscoveryResult[],
  struct:  StructuralDiscovery,
  today:   string,
): string {
  // Build a map of confirmed results
  const confirmed = new Map<string, DiscoveryResult>();
  for (const r of results) {
    if (r.ok && r.codes.length > 0) {
      confirmed.set(r.task.overridesKey, r);
    }
  }

  function valueSetCode(key: string, task: DiscoveryTask): string {
    const r = confirmed.get(key);
    if (!r) {
      return `// NOT CONFIRMED — all discovery queries failed\nexport const CASTILLITOS_${key}: CastillitosValueSet = todo();\n`;
    }
    const valuesJson  = JSON.stringify(r.codes, null, 4)
      .replace(/\n/g, "\n    ");
    const labelsLines = Object.entries(r.labels)
      .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n");
    const labelsJson = labelsLines ? `{\n${labelsLines}\n  }` : "{}";

    return (
      `// Confirmed by homologation — sourceTable: ${r.sourceTable}, sampleSize: ${r.sampleSize}, confidence: ${r.confidence.toFixed(2)}\n` +
      `export const CASTILLITOS_${key}: CastillitosValueSet = {\n` +
      `  confirmed:   true,\n` +
      `  confirmedAt: ${JSON.stringify(today)},\n` +
      `  values:      ${valuesJson},\n` +
      `  labels:      ${labelsJson},\n` +
      `};\n`
    );
  }

  const structNotes = struct.notes.map(n => ` * ${n}`).join("\n");
  const articlesTableNote = struct.articlesTable
    ? `"${struct.articlesTable}"` : "null /* not confirmed */";
  const inventoryTableNote = struct.inventoryTable
    ? `"${struct.inventoryTable}"` : "null /* not confirmed */";
  const articleFields = struct.articlesFields.length > 0
    ? JSON.stringify(struct.articlesFields) : "[] /* not confirmed */";
  const inventoryFields = struct.inventoryFields.length > 0
    ? JSON.stringify(struct.inventoryFields) : "[] /* not confirmed */";

  return `/**
 * lib/sag/master-data/castillitos-overrides.ts
 *
 * AUTO-GENERATED by scripts/sag-homologate-castillitos.ts
 * Last run: ${today}
 *
 * Structural discovery notes:
${structNotes}
 *
 * DO NOT edit confirmed: true sections manually unless re-confirming
 * after a SAG configuration change.
 *
 * To regenerate: npx tsx scripts/sag-homologate-castillitos.ts --write
 */

// ── Type definitions ──────────────────────────────────────────────────────────

export interface CastillitosValueSet {
  /** True once the values have been confirmed from Castillitos SAG. */
  confirmed:   boolean;
  /** ISO date when this was last confirmed. */
  confirmedAt?: string;
  /** Array of valid code strings. Empty = not yet homologated. */
  values:  string[];
  /** Human-readable labels keyed by code. */
  labels:  Record<string, string>;
}

function todo(): CastillitosValueSet {
  return { confirmed: false, values: [], labels: {} };
}

// ── Structural discovery results ──────────────────────────────────────────────
// Populated by the homologation script. Used to update query-catalog.ts statuses.

export const CASTILLITOS_STRUCT = {
  articlesTable:   ${articlesTableNote},
  articlesFields:  ${articleFields},
  inventoryTable:  ${inventoryTableNote},
  inventoryFields: ${inventoryFields},
} as const;

// ── Tenant configuration ──────────────────────────────────────────────────────
// Set these manually after confirming with Castillitos operations team.

export interface CastillitosConfig {
  /** Default warehouse for new article inventory queries. */
  defaultWarehouse?:      string;
  /** Default bodega for tipo 28 document writes. Required before enabling tipo 28. */
  defaultBodegaForTipo28?: string;
  /** Whether Castillitos uses MANEJA_TALLA_COLOR articles. */
  usesTallaColor?:        boolean;
}

export const CASTILLITOS_CONFIG: CastillitosConfig = {
  defaultWarehouse:       undefined,  // TODO: set after BODEGAS confirmed
  defaultBodegaForTipo28: undefined,  // TODO: set after ops team confirms primary warehouse
  usesTallaColor:         undefined,  // TODO: confirm from ARTICULOS query
};

// ── Customer master values ────────────────────────────────────────────────────

${valueSetCode("FORMAS_PAGO", MASTER_TASKS.find(t => t.overridesKey === "FORMAS_PAGO")!)}
${valueSetCode("ZONAS", MASTER_TASKS.find(t => t.overridesKey === "ZONAS")!)}
${valueSetCode("TIPOS_TERCERO", MASTER_TASKS.find(t => t.overridesKey === "TIPOS_TERCERO")!)}
${valueSetCode("TIPOS_CLIENTE", MASTER_TASKS.find(t => t.overridesKey === "TIPOS_CLIENTE")!)}
${valueSetCode("VENDEDORES", MASTER_TASKS.find(t => t.overridesKey === "VENDEDORES")!)}
${valueSetCode("LISTAS_PRECIO", MASTER_TASKS.find(t => t.overridesKey === "LISTAS_PRECIO")!)}

// ── Product / article master values ──────────────────────────────────────────

${valueSetCode("GRUPOS", MASTER_TASKS.find(t => t.overridesKey === "GRUPOS")!)}
${valueSetCode("SUB_GRUPOS", MASTER_TASKS.find(t => t.overridesKey === "SUB_GRUPOS")!)}
${valueSetCode("LINEAS", MASTER_TASKS.find(t => t.overridesKey === "LINEAS")!)}
${valueSetCode("TARIFAS_IVA", MASTER_TASKS.find(t => t.overridesKey === "TARIFAS_IVA")!)}

/** UND is always safe as the default unit in SAG PYA. */
${valueSetCode("UNIDADES", MASTER_TASKS.find(t => t.overridesKey === "UNIDADES")!)}
${valueSetCode("TALLAS", MASTER_TASKS.find(t => t.overridesKey === "TALLAS")!)}
${valueSetCode("COLORES", MASTER_TASKS.find(t => t.overridesKey === "COLORES")!)}

// ── Document / inventory master values ───────────────────────────────────────

${valueSetCode("BODEGAS", MASTER_TASKS.find(t => t.overridesKey === "BODEGAS")!)}

// ── Summary helpers ───────────────────────────────────────────────────────────

export interface HomologationSummary {
  total:        number;
  confirmed:    number;
  pending:      number;
  pctComplete:  number;
  pendingNames: string[];
}

const ALL_VALUE_SETS: Record<string, CastillitosValueSet> = {
  FORMAS_PAGO:    CASTILLITOS_FORMAS_PAGO,
  ZONAS:          CASTILLITOS_ZONAS,
  TIPOS_TERCERO:  CASTILLITOS_TIPOS_TERCERO,
  TIPOS_CLIENTE:  CASTILLITOS_TIPOS_CLIENTE,
  VENDEDORES:     CASTILLITOS_VENDEDORES,
  LISTAS_PRECIO:  CASTILLITOS_LISTAS_PRECIO,
  GRUPOS:         CASTILLITOS_GRUPOS,
  SUB_GRUPOS:     CASTILLITOS_SUB_GRUPOS,
  LINEAS:         CASTILLITOS_LINEAS,
  TARIFAS_IVA:    CASTILLITOS_TARIFAS_IVA,
  UNIDADES:       CASTILLITOS_UNIDADES,
  TALLAS:         CASTILLITOS_TALLAS,
  COLORES:        CASTILLITOS_COLORES,
  BODEGAS:        CASTILLITOS_BODEGAS,
};

export function getHomologationSummary(): HomologationSummary {
  const entries   = Object.entries(ALL_VALUE_SETS);
  const confirmedEntries = entries.filter(([, v]) => v.confirmed);
  const pending   = entries.filter(([, v]) => !v.confirmed).map(([k]) => k);
  return {
    total:        entries.length,
    confirmed:    confirmedEntries.length,
    pending:      pending.length,
    pctComplete:  Math.round((confirmedEntries.length / entries.length) * 100),
    pendingNames: pending,
  };
}

export { ALL_VALUE_SETS };
`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${C.bold}╔════════════════════════════════════════════════════════════════════╗`);
  console.log(`║  Agentik × SAG — Homologación Real Castillitos                    ║`);
  console.log(`╚════════════════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`  Org: ${C.bold}${ORG_SLUG}${C.reset}  |  Write: ${DO_WRITE ? C.yellow + "SI" : C.grey + "NO (dry-run)"}${C.reset}  |  ${new Date().toLocaleString("es-CO")}\n`);

  // ── Load org ──────────────────────────────────────────────────────────────────

  const org = await prisma.organization.findFirst({ where: { slug: ORG_SLUG } });
  if (!org) {
    console.error(`${C.red}ERROR: Organización "${ORG_SLUG}" no encontrada.${C.reset}`);
    const avail = (await prisma.organization.findMany({ select: { slug: true } })).map(o => o.slug);
    console.error(`Disponibles: ${avail.join(", ")}`);
    process.exit(1);
  }

  // ── Load SAG credentials ──────────────────────────────────────────────────────

  const connector = await prisma.connector.findFirst({
    where: { organizationId: org.id, source: "sag_pya_soap" },
    select: { id: true, status: true, config: true },
  });

  if (!connector) {
    console.error(`${C.red}ERROR: Conector sag_pya_soap no encontrado para ${ORG_SLUG}.`);
    console.error(`Ejecutar primero: npx tsx scripts/setup-castillitos-connectors.ts${C.reset}`);
    process.exit(1);
  }

  if (connector.status !== "ACTIVE") {
    warn(`Conector sag_pya_soap en estado ${connector.status} — se intentará de todas formas.`);
  }

  let sagConfig: { token: string; endpointUrl: string };
  try {
    sagConfig = getPyaConfig(connector.config) as { token: string; endpointUrl: string };
  } catch (e) {
    console.error(`${C.red}ERROR: ${(e as Error).message}${C.reset}`);
    console.error("Verificar que el conector tiene token en config.token.");
    process.exit(1);
  }

  info(`Conector ID:  ${connector.id}`);
  info(`Endpoint:     ${sagConfig.endpointUrl}`);
  info(`Token:        ${sagConfig.token.slice(0, 8)}…\n`);

  // ── Test connection ────────────────────────────────────────────────────────────
  // probeConnection tries 4 queries in order, classifies each error by type,
  // and exits with a diagnostic if all fail.

  section("Prueba de Conexión SAG");
  const probe = await probeConnection(sagConfig);
  ok(`SAG responde correctamente — probe: "${probe.label}" (${probe.rows.length} fila(s))`);

  // ── Phase 1 — Master lookup discovery ──────────────────────────────────────────

  section("FASE 1 — Descubrimiento de Datos Maestros");

  const results: DiscoveryResult[] = [];

  for (const task of MASTER_TASKS) {
    process.stdout.write(`  Consultando ${task.label.padEnd(30, " ")} … `);
    const result = await runDiscoveryTask(sagConfig, task);
    results.push(result);

    if (result.ok && result.codes.length > 0) {
      console.log(`${C.green}✓${C.reset} ${result.codes.length} valores — tabla: ${result.sourceTable} (confianza: ${(result.confidence * 100).toFixed(0)}%)`);
      if (VERBOSE && result.rawSample) {
        for (const s of result.rawSample) {
          console.log(`    ${C.grey}${JSON.stringify(s)}${C.reset}`);
        }
      }
    } else if (result.ok && result.sampleSize === 0) {
      console.log(`${C.yellow}⚠${C.reset} tabla ${result.sourceTable} existe pero está vacía`);
    } else {
      console.log(`${C.red}✗${C.reset} ${result.error?.slice(0, 80) ?? "fallo en todas las variantes"}`);
    }
  }

  // ── Phase 2 — Structural discovery ────────────────────────────────────────────

  section("FASE 2 — Descubrimiento Estructural (Artículos e Inventario)");

  const struct = await runStructuralDiscovery(sagConfig);

  if (struct.articlesTable) {
    ok(`Tabla artículos: ${C.bold}${struct.articlesTable}${C.reset}  (${struct.articlesFields.length} campos)`);
    info(`Campos: ${struct.articlesFields.slice(0, 12).join(", ")}${struct.articlesFields.length > 12 ? ", …" : ""}`);
  } else {
    fail("Tabla de artículos no encontrada — actualizar queries manualmente");
  }

  if (struct.inventoryTable) {
    ok(`Tabla inventario: ${C.bold}${struct.inventoryTable}${C.reset}  (${struct.inventoryFields.length} campos)`);
    info(`Campos: ${struct.inventoryFields.slice(0, 12).join(", ")}${struct.inventoryFields.length > 12 ? ", …" : ""}`);
  } else {
    fail("Tabla de inventario no encontrada — actualizar queries manualmente");
  }

  for (const note of struct.notes) {
    info(note);
  }

  // ── Phase 3 — Summary report ───────────────────────────────────────────────────

  section("Resumen de Homologación");

  const confirmed  = results.filter(r => r.ok && r.codes.length > 0);
  const emptyTable = results.filter(r => r.ok && r.codes.length === 0);
  const failed     = results.filter(r => !r.ok);

  console.log();
  ok(`${confirmed.length} conjuntos confirmados:`);
  for (const r of confirmed) {
    info(`  ${r.task.label.padEnd(28)} ${r.codes.length} valores (tabla: ${r.sourceTable}, confianza: ${(r.confidence * 100).toFixed(0)}%)`);
    if (VERBOSE) {
      info(`    Valores: ${r.codes.slice(0, 10).join(", ")}${r.codes.length > 10 ? ", …" : ""}`);
    }
  }

  if (emptyTable.length > 0) {
    console.log();
    warn(`${emptyTable.length} tabla(s) encontradas pero vacías:`);
    for (const r of emptyTable) {
      info(`  ${r.task.label} — tabla: ${r.sourceTable}`);
    }
  }

  if (failed.length > 0) {
    console.log();
    fail(`${failed.length} conjuntos sin confirmar (queries fallaron):`);
    for (const r of failed) {
      info(`  ${r.task.label}`);
    }
  }

  // ── Phase 5 — Production-safe recommendation ──────────────────────────────────

  section("Recomendación: Flujos Seguros Tras Esta Homologación");

  const bodegasOk = confirmed.some(r => r.task.overridesKey === "BODEGAS");
  const gruposOk  = confirmed.some(r => r.task.overridesKey === "GRUPOS");
  const lineasOk  = confirmed.some(r => r.task.overridesKey === "LINEAS");
  const formaOk   = confirmed.some(r => r.task.overridesKey === "FORMAS_PAGO");
  const zonasOk   = confirmed.some(r => r.task.overridesKey === "ZONAS");
  const artOk     = struct.articlesTable !== null;
  const invOk     = struct.inventoryTable !== null;

  const safeFlows: string[]    = [];
  const blockedFlows: string[] = [];

  // Customer writes
  if (formaOk && zonasOk) {
    safeFlows.push("Upsert Cliente (tipo 1) — FORMA_PAGO y ZONA confirmadas");
  } else {
    blockedFlows.push(`Upsert Cliente — ${!formaOk ? "FORMA_PAGO" : "ZONA"} sin confirmar`);
  }

  // Article writes
  if (artOk && gruposOk && lineasOk) {
    safeFlows.push("Upsert Artículo (tipo 5) — tabla ARTICULOS + GRUPO + LINEA confirmados");
  } else {
    const missing: string[] = [];
    if (!artOk)    missing.push("tabla ARTICULOS");
    if (!gruposOk) missing.push("GRUPOS");
    if (!lineasOk) missing.push("LINEAS");
    blockedFlows.push(`Upsert Artículo — pendiente: ${missing.join(", ")}`);
  }

  // Document writes (tipo 28)
  if (bodegasOk) {
    safeFlows.push("Documento tipo 28 — BODEGAS confirmadas (configurar defaultBodegaForTipo28 primero)");
  } else {
    blockedFlows.push("Documento tipo 28 — BODEGAS sin confirmar (BLOQUEADOR CRÍTICO)");
  }

  // Inventory sync
  if (invOk) {
    safeFlows.push(`Sync inventario — tabla ${struct.inventoryTable} descubierta`);
  } else {
    blockedFlows.push("Sync inventario — tabla no encontrada");
  }

  // Article catalog sync
  if (artOk) {
    safeFlows.push(`Sync catálogo artículos — tabla ${struct.articlesTable} descubierta`);
  }

  // Always safe
  safeFlows.push("Reads TERCEROS + CARTERA — ya validados");
  safeFlows.push("Preview cliente/artículo — validación sin enqueue");
  safeFlows.push("Cola de Aprobaciones UI — operacional");
  blockedFlows.push("Recibos tipo 6 — bloqueado por política v1");
  blockedFlows.push("Documento tipo 2 — evaluar después de tipo 28 estable");

  console.log();
  ok("SEGURO AHORA:");
  for (const f of safeFlows) info(`  · ${f}`);
  console.log();
  fail("BLOQUEADO:");
  for (const f of blockedFlows) info(`  · ${f}`);

  // ── Write overrides file ───────────────────────────────────────────────────────

  if (DO_WRITE) {
    section("Actualizando castillitos-overrides.ts");

    const today   = new Date().toISOString().slice(0, 10);
    const content = generateOverridesFile(results, struct, today);
    const outPath = path.resolve(__dirname, "../lib/sag/master-data/castillitos-overrides.ts");

    fs.writeFileSync(outPath, content, "utf8");
    ok(`Archivo actualizado: ${outPath}`);
    info(`${confirmed.length} conjuntos confirmados | ${failed.length} pendientes`);

    if (confirmed.length > 0) {
      ok("Ejecutar TypeScript check: npx tsc --noEmit");
      ok("Luego ejecutar: npx tsx scripts/sag-master-report.ts --matrix");
    }
  } else {
    console.log(`\n  ${C.grey}Para aplicar estos resultados, ejecutar con --write:${C.reset}`);
    console.log(`  ${C.yellow}npx tsx scripts/sag-homologate-castillitos.ts --write${C.reset}\n`);
  }

  // Machine-readable summary to stdout
  const machineSummary = {
    runAt:             new Date().toISOString(),
    org:               ORG_SLUG,
    confirmedSets:     confirmed.map(r => ({
      key:        r.task.overridesKey,
      valueCount: r.codes.length,
      table:      r.sourceTable,
      confidence: r.confidence,
    })),
    failedSets: failed.map(r => r.task.overridesKey),
    structural: {
      articlesTable:   struct.articlesTable,
      inventoryTable:  struct.inventoryTable,
    },
    safeFlows,
    blockedFlows,
    writtenToFile: DO_WRITE,
  };

  console.log(`\n${C.grey}JSON de resultado (para integración):${C.reset}`);
  console.log(JSON.stringify(machineSummary, null, 2));
}

main()
  .catch(e => { console.error(`${C.red}Fatal:${C.reset}`, e); process.exit(1); })
  .finally(() => prisma.$disconnect());
