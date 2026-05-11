/**
 * scripts/_probe-cobros-tables.ts
 *
 * Sprint COBROS REALES — Fase 1 probe.
 *
 * Objetivo: descubrir si SAG expone alguna tabla o vista con los montos reales
 * de cobros (R1, R2, RS, RC, RG, RA, SI). Tablas conocidas como PAGOS están
 * vacías; RECIBOS/ANTICIPOS/ABONOS no existen en esta instalación.
 *
 * Este script intenta (en orden):
 *   1. Listar tablas del esquema que contengan "cobro" / "recibo" / "abono" / "pago"
 *   2. Probar tablas candidatas con SELECT TOP 5 *
 *   3. Buscar vistas (v_cobros, v_recibos, v_cartera_cobros, etc.)
 *   4. Probar MOVIMIENTOS_ITEMS para un cobro R1 real (ka_ni_fuente=4)
 *      — confirmar que efectivamente hay cero ítems
 *   5. Inspeccionar campos numéricos de MOVIMIENTOS header para un R1 real
 *      — buscar si algún campo header tiene el monto
 *
 * READ-ONLY — zero DB writes. Consume ~8 SOAP tokens.
 *
 * Usage:
 *   ORG_SLUG=castillitos npx tsx --env-file=.env scripts/_probe-cobros-tables.ts
 */

import { prisma }          from "@/lib/prisma";
import { consultaSagJson } from "@/lib/connectors/pya/client";

const ORG_SLUG = process.env.ORG_SLUG ?? "castillitos";

// ── Colour helpers ────────────────────────────────────────────────────────────
const W = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const B = (s: string) => `\x1b[34m${s}\x1b[0m`;
const D = (s: string) => `\x1b[90m${s}\x1b[0m`;

function hr(title: string) {
  console.log(B(`\n══ ${title} ${"─".repeat(Math.max(0, 70 - title.length))}`));
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : 0;
}

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", maximumFractionDigits: 0,
  }).format(n);
}

// ── SAG fuente IDs for cobros ─────────────────────────────────────────────────
const COBRO_FUENTES: Record<number, string> = {
  4:   "R1",
  94:  "R2",
  108: "RS",
  174: "RC",
  178: "RG",
  198: "RA",
  111: "SI",
  12:  "AN",
  152: "CP",
  148: "B1",
  149: "B2",
  150: "H1",
  151: "H2",
};

// Tables / views to probe
const CANDIDATE_TABLES = [
  // Payment-related candidates
  "COBROS_MOVIMIENTOS",
  "COBROS_DETALLE",
  "COBROS_APLICADOS",
  "COBROS_FACTURAS",
  "DETALLE_RECIBOS",
  "DETALLE_COBROS",
  "ABONOS_MOVIMIENTOS",
  "ABONOS_CARTERA",
  "ABONOS_FACTURAS",
  "APLICACIONES",
  "APLICACIONES_COBROS",
  "RECIBOS_CAJA",
  "RECIBOS_DETALLE",
  // Views
  "v_cobros",
  "v_recibos",
  "v_abonos",
  "v_cartera_cobros",
  "v_cartera_pagos",
  "v_recibos_caja",
  "v_aplicaciones",
  "v_movimientos_cobros",
  // Other candidates
  "CARTERA_COBROS",
  "CARTERA_PAGOS",
  "PAGOS_DETALLE",
  "MOVIMIENTOS_COBROS",
];

type ApiConfig = { token: string; endpointUrl: string; database?: string };

async function tryTable(
  apiConfig: ApiConfig,
  tableName: string,
): Promise<{ exists: boolean; rowCount: number; cols: string[]; firstRow: Record<string, unknown> | null }> {
  try {
    const rows = await consultaSagJson(
      apiConfig,
      `SELECT TOP 5 * FROM ${tableName}`,
    ) as Record<string, unknown>[];
    return {
      exists:   true,
      rowCount: rows.length,
      cols:     rows.length > 0 ? Object.keys(rows[0]) : [],
      firstRow: rows.length > 0 ? rows[0] : null,
    };
  } catch {
    return { exists: false, rowCount: 0, cols: [], firstRow: null };
  }
}

async function main() {
  console.log(W("\n══════════════════════════════════════════════════════════════════"));
  console.log(W(" SAG COBROS PROBE — tabla discovery + monto audit               "));
  console.log(W("══════════════════════════════════════════════════════════════════\n"));

  // ── Load org + connector config ──────────────────────────────────────────────
  const org = await (prisma as any).organization.findFirst({
    where: { slug: ORG_SLUG }, select: { id: true, name: true },
  });
  if (!org) { console.error(R(`Org not found: ${ORG_SLUG}`)); process.exit(1); }
  console.log(D(`Org: ${org.name} (${org.id})`));

  const connector = await (prisma as any).connector.findFirst({
    where: { organizationId: org.id, source: "sag_pya_soap" },
    select: { config: true },
  });
  if (!connector) { console.error(R("Connector sag_pya_soap not found")); process.exit(1); }

  const cfg = typeof connector.config === "string" ? JSON.parse(connector.config) : connector.config;
  const apiConfig: ApiConfig = {
    token:       cfg.token       || process.env.PYA_SOAP_TOKEN || process.env.SAG_TEST_TOKEN || "",
    endpointUrl: cfg.endpointUrl || process.env.PYA_SOAP_ENDPOINT || "https://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap",
    database:    cfg.database    || process.env.PYA_SAG_BD,
  };
  console.log(D(`Endpoint: ${apiConfig.endpointUrl}`));
  console.log(D(`Database: ${apiConfig.database ?? "(env)"}`));
  console.log(D(`Token:    ${apiConfig.token ? "[SET]" : R("MISSING")}\n`));

  // ── PROBE 1: Schema discovery via INFORMATION_SCHEMA ────────────────────────
  hr("PROBE 1: INFORMATION_SCHEMA.TABLES — cobro/pago/abono/recibo tables");
  const schemaQueries = [
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%COBRO%' OR TABLE_NAME LIKE '%cobro%'`,
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%PAGO%'  OR TABLE_NAME LIKE '%pago%'`,
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%ABONO%' OR TABLE_NAME LIKE '%abono%'`,
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%RECIBO%'OR TABLE_NAME LIKE '%recibo%'`,
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%APLICA%'`,
  ];

  const discoveredTables: string[] = [];
  for (const sq of schemaQueries) {
    try {
      const rows = await consultaSagJson(apiConfig, sq) as Record<string, unknown>[];
      if (rows.length > 0) {
        const names = rows.map(r => String(r["TABLE_NAME"] ?? r["table_name"] ?? Object.values(r)[0] ?? "?"));
        names.forEach(n => { if (!discoveredTables.includes(n)) discoveredTables.push(n); });
        console.log(G(`  Found: ${names.join(", ")}`));
      } else {
        console.log(D(`  [no match] ${sq.slice(56, 120)}`));
      }
    } catch (e) {
      console.log(Y(`  INFORMATION_SCHEMA not supported or query failed: ${(e as Error).message.slice(0, 80)}`));
      break;
    }
  }

  if (discoveredTables.length > 0) {
    console.log(W(`\n  Discovered ${discoveredTables.length} schema tables: ${discoveredTables.join(", ")}`));
    // Add discovered tables to probe list
    for (const t of discoveredTables) {
      if (!CANDIDATE_TABLES.includes(t)) CANDIDATE_TABLES.push(t);
    }
  } else {
    console.log(Y("  INFORMATION_SCHEMA returned no results — will probe candidates directly"));
  }

  // ── PROBE 2: Direct probe of candidate tables ────────────────────────────────
  hr("PROBE 2: Candidate tables — direct SELECT TOP 5");
  console.log(D(`  Probing ${CANDIDATE_TABLES.length} candidates...\n`));

  const found: Array<{ name: string; rowCount: number; cols: string[]; firstRow: Record<string, unknown> | null }> = [];

  for (const tableName of CANDIDATE_TABLES) {
    const result = await tryTable(apiConfig, tableName);
    if (result.exists) {
      found.push({ name: tableName, ...result });
      const hasMonto = result.cols.some(c =>
        /valor|monto|total|amount|abono|aplicad/i.test(c)
      );
      console.log(
        G(`  [EXISTS] `) +
        W(tableName.padEnd(28)) +
        D(`${result.rowCount} rows`) +
        (hasMonto ? G("  ← HAS monetary fields") : Y("  (no obvious amount field)")),
      );
      if (result.cols.length > 0) {
        console.log(D(`           cols: ${result.cols.join(", ")}`));
      }
    } else {
      process.stdout.write(D("."));
    }
  }
  console.log(); // newline after dots

  if (found.length === 0) {
    console.log(R("\n  RESULT: No cobro-specific tables found in SAG for this installation."));
    console.log(Y("  Conclusion: SAG amounts for R1/R2/RS/RC/RA/RG/SI must come from external sources."));
  } else {
    console.log(W(`\n  RESULT: ${found.length} table(s) found:`));
    for (const t of found) {
      console.log(`\n  ${W(t.name)} — ${t.rowCount} rows, ${t.cols.length} columns`);
      if (t.firstRow) {
        const numericFields = Object.entries(t.firstRow).filter(([, v]) => {
          const n = toNum(v);
          return n !== 0;
        });
        if (numericFields.length > 0) {
          console.log("  Numeric non-zero fields in first row:");
          for (const [k, v] of numericFields) {
            console.log(`    ${k.padEnd(30)} = ${JSON.stringify(v)}  → ${fmtCOP(toNum(v))}`);
          }
        }
        // Print all fields of first row
        console.log("  All fields:");
        for (const [k, v] of Object.entries(t.firstRow)) {
          console.log(`    ${k.padEnd(30)} = ${JSON.stringify(v)}`);
        }
      }
    }
  }

  // ── PROBE 3: MOVIMIENTOS_ITEMS for a real R1 cobro ──────────────────────────
  hr("PROBE 3: MOVIMIENTOS_ITEMS for R1 cobros (ka_ni_fuente=4)");
  const r1MovsQuery = [
    "SELECT TOP 3 m.ka_nl_movimiento, m.n_numero_documento, m.d_fecha_documento,",
    "  m.sc_beneficiario",
    "FROM MOVIMIENTOS m",
    "WHERE m.ka_ni_fuente = 4 AND m.sc_anulado = 'N'",
    "ORDER BY m.ka_nl_movimiento DESC",
  ].join(" ");

  try {
    const r1Movs = await consultaSagJson(apiConfig, r1MovsQuery) as Record<string, unknown>[];
    if (r1Movs.length === 0) {
      console.log(Y("  No R1 movimientos found — fuente 4 may have different ID in this DB"));
    } else {
      console.log(G(`  Found ${r1Movs.length} R1 movement(s):`));
      for (const m of r1Movs) {
        const movId = m["ka_nl_movimiento"];
        console.log(D(`  mov=${movId}  doc=${m["n_numero_documento"]}  fecha=${String(m["d_fecha_documento"]).slice(0,10)}  cliente=${m["sc_beneficiario"]}`));

        // Now check MOVIMIENTOS_ITEMS for this cobro
        const itemsQuery = `SELECT TOP 10 * FROM MOVIMIENTOS_ITEMS WHERE ka_nl_movimiento = ${movId}`;
        try {
          const items = await consultaSagJson(apiConfig, itemsQuery) as Record<string, unknown>[];
          if (items.length === 0) {
            console.log(R(`    → MOVIMIENTOS_ITEMS: 0 rows (CONFIRMED: R1 cobros have no line items)`));
          } else {
            console.log(G(`    → MOVIMIENTOS_ITEMS: ${items.length} rows FOUND — unexpected!`));
            for (const item of items) {
              const valor = toNum(item["n_valor"]);
              const iva   = toNum(item["n_iva"]);
              console.log(`      n_valor=${fmtCOP(valor)}  n_iva=${iva}  all: ${JSON.stringify(item).slice(0, 120)}`);
            }
          }
        } catch (e) {
          console.log(Y(`    → items query error: ${(e as Error).message.slice(0, 60)}`));
        }
      }
    }
  } catch (e) {
    console.log(R(`  R1 MOVIMIENTOS query failed: ${(e as Error).message}`));
  }

  // ── PROBE 4: MOVIMIENTOS header fields for R1 cobros ────────────────────────
  hr("PROBE 4: Full MOVIMIENTOS header for R1 (all fields incl. banco/cheque)");
  const r1FullQuery = "SELECT TOP 2 * FROM MOVIMIENTOS WHERE ka_ni_fuente = 4 AND sc_anulado = 'N' ORDER BY ka_nl_movimiento DESC";
  try {
    const r1Full = await consultaSagJson(apiConfig, r1FullQuery) as Record<string, unknown>[];
    if (r1Full.length === 0) {
      console.log(Y("  No R1 rows returned"));
    } else {
      console.log(G(`  ${r1Full.length} R1 row(s):`));
      for (const [i, row] of r1Full.entries()) {
        console.log(`\n  ── Row ${i + 1}: mov=${row["ka_nl_movimiento"]} doc=${row["n_numero_documento"]} ──`);
        // Print all non-null, non-empty, non-zero fields
        const interesting = Object.entries(row).filter(([, v]) => v != null && v !== "" && v !== 0 && v !== "N");
        console.log("  Non-null/non-zero fields:");
        for (const [k, v] of interesting) {
          const n = toNum(v);
          const numStr = n !== 0 ? G(`  → ${fmtCOP(n)}`) : "";
          console.log(`    ${k.padEnd(30)} = ${JSON.stringify(v)}${numStr}`);
        }
        // Print ALL fields for completeness
        console.log("  All fields:");
        for (const [k, v] of Object.entries(row)) {
          console.log(`    ${k.padEnd(30)} = ${JSON.stringify(v)}`);
        }
      }
    }
  } catch (e) {
    console.log(R(`  Full header query failed: ${(e as Error).message}`));
  }

  // ── PROBE 5: Same for RS (POS almacen cobro, ka_ni_fuente=108) ──────────────
  hr("PROBE 5: MOVIMIENTOS_ITEMS for RS cobros (ka_ni_fuente=108)");
  const rsMovsQuery = [
    "SELECT TOP 3 m.ka_nl_movimiento, m.n_numero_documento, m.d_fecha_documento,",
    "  m.sc_beneficiario",
    "FROM MOVIMIENTOS m",
    "WHERE m.ka_ni_fuente = 108 AND m.sc_anulado = 'N'",
    "ORDER BY m.ka_nl_movimiento DESC",
  ].join(" ");

  try {
    const rsMovs = await consultaSagJson(apiConfig, rsMovsQuery) as Record<string, unknown>[];
    if (rsMovs.length === 0) {
      console.log(Y("  No RS movimientos found"));
    } else {
      for (const m of rsMovs) {
        const movId = m["ka_nl_movimiento"];
        console.log(D(`  mov=${movId}  doc=${m["n_numero_documento"]}  fecha=${String(m["d_fecha_documento"]).slice(0,10)}`));
        const itemsQuery = `SELECT TOP 5 * FROM MOVIMIENTOS_ITEMS WHERE ka_nl_movimiento = ${movId}`;
        try {
          const items = await consultaSagJson(apiConfig, itemsQuery) as Record<string, unknown>[];
          if (items.length === 0) {
            console.log(R(`    → 0 items (RS cobros also have no line items)`));
          } else {
            console.log(G(`    → ${items.length} items FOUND — RS has monetary data!`));
            for (const item of items) {
              const valor = toNum(item["n_valor"]);
              console.log(`      n_valor=${fmtCOP(valor)}  cols: ${Object.keys(item).join(", ")}`);
            }
          }
        } catch (e) {
          console.log(Y(`    → items error: ${(e as Error).message.slice(0, 60)}`));
        }
      }
    }
  } catch (e) {
    console.log(R(`  RS query failed: ${(e as Error).message}`));
  }

  // ── PROBE 6: SI / Sistecredit ────────────────────────────────────────────────
  hr("PROBE 6: MOVIMIENTOS_ITEMS for SI cobros (ka_ni_fuente=111)");
  const siMovsQuery = [
    "SELECT TOP 3 m.ka_nl_movimiento, m.n_numero_documento, m.d_fecha_documento",
    "FROM MOVIMIENTOS m",
    "WHERE m.ka_ni_fuente = 111 AND m.sc_anulado = 'N'",
    "ORDER BY m.ka_nl_movimiento DESC",
  ].join(" ");

  try {
    const siMovs = await consultaSagJson(apiConfig, siMovsQuery) as Record<string, unknown>[];
    if (siMovs.length === 0) {
      console.log(Y("  No SI movimientos found"));
    } else {
      for (const m of siMovs) {
        const movId = m["ka_nl_movimiento"];
        console.log(D(`  mov=${movId}  doc=${m["n_numero_documento"]}`));
        const itemsQuery = `SELECT TOP 5 * FROM MOVIMIENTOS_ITEMS WHERE ka_nl_movimiento = ${movId}`;
        try {
          const items = await consultaSagJson(apiConfig, itemsQuery) as Record<string, unknown>[];
          if (items.length === 0) {
            console.log(R(`    → 0 items (SI also has no line items)`));
          } else {
            console.log(G(`    → ${items.length} items — SI has monetary data!`));
            for (const item of items) {
              console.log(`      n_valor=${fmtCOP(toNum(item["n_valor"]))}  ${Object.keys(item).join(", ")}`);
            }
          }
        } catch (e) {
          console.log(Y(`    → error: ${(e as Error).message.slice(0, 60)}`));
        }
      }
    }
  } catch (e) {
    console.log(R(`  SI query failed: ${(e as Error).message}`));
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  hr("SUMMARY");
  console.log(`
  ${W("Tables discovered")}:    ${found.length === 0 ? R("NONE — no cobro-specific tables exist") : G(found.map(f => f.name).join(", "))}

  ${W("Next steps")} (based on results above):

  If ${G("tables found")} with monetary fields:
    → Add new query to query-catalog.ts
    → Map to CollectionRecord (new Prisma model)
    → B1/B2 read CollectionRecord.amount when SaleRecord.amount == 0

  If ${R("no tables found")} (all probes return 0 rows or error):
    → SAG does NOT expose cobro amounts via SQL for this installation
    → RS/RC/RA/RG: correlate against same-day POS factura (FD/FC/FA) amounts
    → R1/R2: import from bank extract or SAG PDF export
    → SI/AN: import Sistecredit/ADDI settlement file (CSV)
    → Show "monto pendiente" in dashboard until source is confirmed

  ${W("Probe tokens used")}: ~8 (well within 340/day limit)
`);

  await (prisma as any).$disconnect();
}

main().catch(e => { console.error(R(`\nFATAL: ${e.message}`)); process.exit(1); });
