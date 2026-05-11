/**
 * _probe-sag-movements.ts
 *
 * Dry-run structural probe of SAG PYA MOVIMIENTOS table.
 *
 * Goals:
 *   1. Confirm column names in FUENTES (especially k_sc_codigo_fuente / short code)
 *   2. Get distribution of ka_ni_fuente values actually present in MOVIMIENTOS
 *   3. Sample 10 recent MOVIMIENTOS rows to see field shapes
 *   4. Map ka_ni_fuente → known codes from source-semantic-rules
 *   5. Show how these map to SaleRecord fields
 *
 * READ-ONLY — zero DB writes. Hits SAG SOAP API (consumes 3 rate-limit tokens).
 *
 * Usage:
 *   ORG_SLUG=castillitos npx tsx --env-file=.env scripts/_probe-sag-movements.ts
 */

import { prisma }           from "@/lib/prisma";
import { consultaSagJson }  from "@/lib/connectors/pya/client";

// ── Source-semantic-rules knowledge (from lib/sag/master-data/source-semantic-rules.ts)
// Maps ka_ni_fuente (numeric) → { codigoFuente, familyGroup }
const KNOWN_FUENTES: Record<number, { code: string; label: string; group: string }> = {
  4:   { code: "R1",  label: "Recibo Caja Empresa",        group: "COBRO_EMPRESA_R1" },
  94:  { code: "R2",  label: "Recibo Caja 2 / Remisiones", group: "COBRO_EMPRESA_R2" },
  108: { code: "RS",  label: "Recibo Caja Sandiego",       group: "POS_ALMACEN" },
  174: { code: "RC",  label: "Recibo Caja Centro",         group: "POS_ALMACEN" },
  178: { code: "RG",  label: "Recibo Caja Gran Plaza",     group: "POS_ALMACEN" },
  198: { code: "RA",  label: "Recibo Caja Caldas",         group: "POS_ALMACEN" },
  111: { code: "SI",  label: "Sistecredit",                group: "RETAIL_FINANCIERO" },
  12:  { code: "AN",  label: "Anticipos Clientes SC",      group: "RETAIL_FINANCIERO" },
  152: { code: "CP",  label: "Consignación Pendiente",     group: "CONSIGNACION_PENDIENTE" },
  148: { code: "B1",  label: "Consignación Bancaria 1",    group: "CONSIGNACION_PENDIENTE" },
  149: { code: "B2",  label: "Consignación Bancaria 2",    group: "CONSIGNACION_PENDIENTE" },
  150: { code: "H1",  label: "Consignación H1",            group: "CONSIGNACION_PENDIENTE" },
  151: { code: "H2",  label: "Consignación H2",            group: "CONSIGNACION_PENDIENTE" },
  // Ventas empresa F1
  1:   { code: "FE",  label: "Factura Empresa",            group: "VENTA_EMPRESA_F1" },
  2:   { code: "NE",  label: "Nota Crédito Empresa",       group: "VENTA_EMPRESA_F1" },
  // Almacenes
  100: { code: "FD",  label: "Factura Sandiego",           group: "VENTA_ALMACEN" },
  101: { code: "FC",  label: "Factura Centro",             group: "VENTA_ALMACEN" },
  102: { code: "FG",  label: "Factura Gran Plaza",         group: "VENTA_ALMACEN" },
  103: { code: "FA",  label: "Factura Caldas",             group: "VENTA_ALMACEN" },
  // Web
  200: { code: "FW",  label: "Factura Web",                group: "VENTA_WEB" },
  201: { code: "NW",  label: "Nota Crédito Web",           group: "VENTA_WEB" },
};

// ── Colour helpers ────────────────────────────────────────────────────────────
const W  = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const Y  = (s: string) => `\x1b[33m${s}\x1b[0m`;
const R  = (s: string) => `\x1b[31m${s}\x1b[0m`;
const B  = (s: string) => `\x1b[34m${s}\x1b[0m`;
const D  = (s: string) => `\x1b[90m${s}\x1b[0m`;

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

function toNum(v: unknown, fallback = 0): number {
  if (v == null) return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : fallback;
}

const ORG_SLUG = process.env.ORG_SLUG ?? "castillitos";

async function main() {
  console.log(W("\n══════════════════════════════════════════════════════════════"));
  console.log(W(" SAG MOVEMENTS DRY-RUN PROBE — Castillitos SOAP              "));
  console.log(W("══════════════════════════════════════════════════════════════\n"));

  // ── 1. Load connector config from DB ────────────────────────────────────────
  const org = await (prisma as any).organization.findFirst({
    where: { slug: ORG_SLUG }, select: { id: true, name: true },
  });
  if (!org) { console.error(R(`Org not found: ${ORG_SLUG}`)); process.exit(1); }
  console.log(D(`Org: ${org.name} (${org.id})\n`));

  const connector = await (prisma as any).connector.findFirst({
    where: { organizationId: org.id, source: "sag_pya_soap" },
    select: { config: true },
  });
  if (!connector) { console.error(R("Connector sag_pya_soap not found")); process.exit(1); }

  const cfg = typeof connector.config === "string" ? JSON.parse(connector.config) : connector.config;
  const apiConfig = {
    token:       cfg.token || process.env.PYA_SOAP_TOKEN || process.env.SAG_TEST_TOKEN || "",
    endpointUrl: cfg.endpointUrl || process.env.PYA_SOAP_ENDPOINT || "https://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap",
    database:    cfg.database || process.env.PYA_SAG_BD,
  };
  console.log(D(`Endpoint: ${apiConfig.endpointUrl}`));
  console.log(D(`Database: ${apiConfig.database ?? "(omitted)"}`));
  console.log(D(`Token: ${apiConfig.token ? "[SET]" : R("MISSING")}\n`));

  // ── PROBE 1: FUENTES table — discover column names ──────────────────────────
  console.log(B("══ PROBE 1: FUENTES structure ─────────────────────────────────"));
  console.log(D("Query: SELECT TOP 5 * FROM FUENTES\n"));
  try {
    const fuentesRows = await consultaSagJson(apiConfig, "SELECT TOP 5 * FROM FUENTES") as Record<string, unknown>[];
    if (fuentesRows.length === 0) {
      console.log(Y("  No rows returned from FUENTES — table may be empty or name wrong"));
    } else {
      console.log(G(`  ✓ ${fuentesRows.length} rows returned`));
      console.log(W("\n  Column names:"));
      const cols = Object.keys(fuentesRows[0]);
      cols.forEach(c => console.log(`    ${c}`));
      console.log(W("\n  First row values:"));
      const first = fuentesRows[0];
      cols.forEach(c => {
        const v = first[c];
        if (v != null && v !== "" && v !== 0) console.log(`    ${c.padEnd(30)} = ${String(v).slice(0,60)}`);
      });
      console.log(W("\n  All rows (key fields):"));
      for (const r of fuentesRows) {
        const id = r["ka_ni_fuente"] ?? r["KA_NI_FUENTE"] ?? r["id"] ?? "?";
        const known = KNOWN_FUENTES[toNum(id)];
        const allVals = cols.map(c => `${c}=${JSON.stringify(r[c])?.slice(0,20)}`).join("  ");
        console.log(`    fuente_id=${id}  ${known ? G(known.code + " · " + known.group) : ""}  ${D(allVals)}`);
      }
    }
  } catch (e) {
    console.log(R(`  ERROR: ${(e as Error).message}`));
  }

  // ── PROBE 2: MOVIMIENTOS distribution by ka_ni_fuente ──────────────────────
  console.log(B("\n══ PROBE 2: MOVIMIENTOS distribution by ka_ni_fuente ──────────"));
  // Using a sample (TOP 2000) and doing client-side groupBy to avoid relying on
  // COUNT(*) which may or may not be supported by SAG SQL engine.
  const sampleQuery = [
    "SELECT TOP 2000",
    "  m.ka_ni_fuente, m.sc_anulado,",
    "  SUM(ISNULL(mi.n_valor, 0)) AS total_valor",
    "FROM MOVIMIENTOS m",
    "LEFT JOIN MOVIMIENTOS_ITEMS mi ON mi.ka_nl_movimiento = m.ka_nl_movimiento",
    "WHERE m.sc_anulado = 'N'",
    "GROUP BY m.ka_ni_fuente, m.sc_anulado",
    "ORDER BY total_valor DESC",
  ].join(" ");

  console.log(D(`Query: ${sampleQuery.slice(0, 120)}...\n`));
  try {
    const distRows = await consultaSagJson(apiConfig, sampleQuery) as Record<string, unknown>[];
    console.log(G(`  ✓ ${distRows.length} distinct fuente groups returned`));
    console.log(W("\n  ka_ni_fuente  code      group                        total_valor (in sample)"));
    console.log(D("  " + "─".repeat(80)));
    for (const r of distRows) {
      const fuenteId = toNum(r["ka_ni_fuente"] ?? r["KA_NI_FUENTE"]);
      const valor    = toNum(r["total_valor"] ?? r["TOTAL_VALOR"]);
      const known    = KNOWN_FUENTES[fuenteId];
      const codeStr  = known ? G(known.code.padEnd(8)) : Y("??".padEnd(8));
      const groupStr = known ? known.group.padEnd(30) : Y("(unknown)".padEnd(30));
      const marker   = known?.group.startsWith("COBRO") || known?.group.startsWith("CONSIGNACION")
        ? R("  ← cobro/CP")
        : known?.group.startsWith("VENTA") ? G("  ← venta") : "";
      console.log(`  ${String(fuenteId).padEnd(14)}${codeStr}${groupStr} ${fmtCOP(valor).padStart(22)}${marker}`);
    }
  } catch (e) {
    console.log(R(`  ERROR querying distribution: ${(e as Error).message}`));
    console.log(Y("  Fallback: trying simpler GROUP BY without SUM..."));
    const fallbackQuery = "SELECT TOP 2000 m.ka_ni_fuente FROM MOVIMIENTOS m WHERE m.sc_anulado = 'N' GROUP BY m.ka_ni_fuente";
    try {
      const fallbackRows = await consultaSagJson(apiConfig, fallbackQuery) as Record<string, unknown>[];
      for (const r of fallbackRows) {
        const fuenteId = toNum(r["ka_ni_fuente"] ?? r["KA_NI_FUENTE"]);
        const known    = KNOWN_FUENTES[fuenteId];
        console.log(`  ${String(fuenteId).padEnd(14)}${known ? G(known.code) : Y("??")}  ${known?.group ?? "(unknown)"}`);
      }
    } catch (e2) {
      console.log(R(`  Fallback also failed: ${(e2 as Error).message}`));
    }
  }

  // ── PROBE 3: Sample MOVIMIENTOS rows — full field list ──────────────────────
  console.log(B("\n══ PROBE 3: Sample MOVIMIENTOS rows (TOP 10, all fields) ──────"));
  const sampleAllQuery = [
    "SELECT TOP 10",
    "  m.ka_nl_movimiento, m.ka_ni_fuente, m.n_numero_documento,",
    "  m.ka_nl_tercero, m.sc_beneficiario, m.d_fecha_documento,",
    "  m.sc_anulado, m.ss_moneda, m.ddt_fecha_new,",
    "  SUM(ISNULL(mi.n_valor, 0))     AS total_valor,",
    "  SUM(ISNULL(mi.n_iva, 0))       AS total_iva,",
    "  SUM(ISNULL(mi.n_descuento, 0)) AS total_descuento,",
    "  f.sc_cobrar_pagar, f.k_n_clase_fuente, f.ka_ni_forma_pago_fte,",
    "  f.k_sc_codigo_fuente",   // ← the short code we need (may not exist)
    "FROM MOVIMIENTOS m",
    "LEFT JOIN MOVIMIENTOS_ITEMS mi ON mi.ka_nl_movimiento = m.ka_nl_movimiento",
    "LEFT JOIN FUENTES f ON f.ka_ni_fuente = m.ka_ni_fuente",
    "WHERE m.sc_anulado = 'N'",
    "GROUP BY",
    "  m.ka_nl_movimiento, m.ka_ni_fuente, m.n_numero_documento,",
    "  m.ka_nl_tercero, m.sc_beneficiario, m.d_fecha_documento,",
    "  m.sc_anulado, m.ss_moneda, m.ddt_fecha_new,",
    "  f.sc_cobrar_pagar, f.k_n_clase_fuente, f.ka_ni_forma_pago_fte,",
    "  f.k_sc_codigo_fuente",
    "ORDER BY m.ka_nl_movimiento DESC",
  ].join(" ");

  console.log(D(`Query includes f.k_sc_codigo_fuente — will error if field doesn't exist\n`));
  let sampleCols: string[] = [];
  let sampleRows: Record<string, unknown>[] = [];

  try {
    sampleRows = await consultaSagJson(apiConfig, sampleAllQuery) as Record<string, unknown>[];
    if (sampleRows.length > 0) {
      sampleCols = Object.keys(sampleRows[0]);
      console.log(G(`  ✓ ${sampleRows.length} rows returned`));
      console.log(W("\n  Columns returned:"), sampleCols.join(", "));

      // Check if k_sc_codigo_fuente was returned
      const hasCodigoFuente = sampleCols.some(c => c.toLowerCase().includes("k_sc_codigo_fuente") || c.toLowerCase().includes("codigo_fuente"));
      if (hasCodigoFuente) {
        console.log(G("\n  ✓ k_sc_codigo_fuente field IS present in FUENTES — can use as comprobanteCode directly"));
      } else {
        console.log(Y("\n  ⚠ k_sc_codigo_fuente not returned — must derive comprobanteCode from ka_ni_fuente mapping"));
      }

      console.log(W("\n  Sample rows:"));
      for (const r of sampleRows) {
        const fuenteId = toNum(r["ka_ni_fuente"]);
        const known    = KNOWN_FUENTES[fuenteId];
        const codigoFuente = r["k_sc_codigo_fuente"] ?? r["K_SC_CODIGO_FUENTE"];
        const doc      = r["n_numero_documento"] ?? "?";
        const nombre   = String(r["sc_beneficiario"] ?? "").slice(0, 25).padEnd(25);
        const fecha    = String(r["d_fecha_documento"] ?? "").slice(0, 10);
        const valor    = toNum(r["total_valor"]);
        const cobrarPagar = r["sc_cobrar_pagar"] ?? "?";
        const movId    = r["ka_nl_movimiento"];
        const codeDisplay = codigoFuente
          ? G(String(codigoFuente).padEnd(6))
          : known ? Y(known.code.padEnd(6)) : R("??    ");
        console.log(
          `  mov=${String(movId).padEnd(8)} fuente=${String(fuenteId).padEnd(4)} code=${codeDisplay}` +
          ` doc=${String(doc).padEnd(8)} ${fecha} ${nombre} ${cobrarPagar} ${fmtCOP(valor).padStart(15)}`
        );
      }
    } else {
      console.log(Y("  No rows returned — MOVIMIENTOS may be empty or query has issues"));
    }
  } catch (e) {
    console.log(R(`  ERROR with k_sc_codigo_fuente included: ${(e as Error).message}`));
    console.log(Y("  Retrying WITHOUT k_sc_codigo_fuente (fall back to ka_ni_fuente lookup)...\n"));
    const fallbackSampleQuery = sampleAllQuery.replace(",  f.k_sc_codigo_fuente", "").replace(",  f.k_sc_codigo_fuente", "");
    try {
      sampleRows = await consultaSagJson(apiConfig, fallbackSampleQuery) as Record<string, unknown>[];
      if (sampleRows.length > 0) {
        sampleCols = Object.keys(sampleRows[0]);
        console.log(G(`  ✓ Fallback succeeded: ${sampleRows.length} rows returned`));
        console.log(W("  Columns:"), sampleCols.join(", "));
        console.log(W("\n  Conclusion: k_sc_codigo_fuente NOT in FUENTES — must use ka_ni_fuente → code mapping"));
        for (const r of sampleRows.slice(0, 5)) {
          const fuenteId = toNum(r["ka_ni_fuente"]);
          const known    = KNOWN_FUENTES[fuenteId];
          const valor    = toNum(r["total_valor"]);
          const fecha    = String(r["d_fecha_documento"] ?? "").slice(0, 10);
          const nombre   = String(r["sc_beneficiario"] ?? "").slice(0, 25);
          console.log(`  fuente=${String(fuenteId).padEnd(4)} ${known ? G(known.code) : R("??")} ${fecha} ${nombre} ${fmtCOP(valor)}`);
        }
      }
    } catch (e2) {
      console.log(R(`  Fallback also failed: ${(e2 as Error).message}`));
    }
  }

  // ── PROBE 4: SaleRecord mapping assessment ──────────────────────────────────
  console.log(B("\n══ PROBE 4: SaleRecord field mapping ──────────────────────────"));
  console.log(W("\n  MOVIMIENTOS → SaleRecord mapping:"));
  const mapping = [
    { sag: "ka_nl_movimiento",     sr: "erpId",           status: "✓", note: "Stable PK for dedup" },
    { sag: "ka_ni_fuente",         sr: "comprobanteCode", status: "~", note: "Map via KNOWN_FUENTES table (or k_sc_codigo_fuente if present)" },
    { sag: "n_numero_documento",   sr: "comprobante",     status: "✓", note: "Document number" },
    { sag: "d_fecha_documento",    sr: "saleDate",        status: "✓", note: "Issue date" },
    { sag: "ka_nl_tercero",        sr: "customerNit",     status: "~", note: "Integer FK → need n_nit from TERCEROS (use sync'd CustomerProfile)" },
    { sag: "sc_beneficiario",      sr: "customerName",    status: "✓", note: "Denormalized customer name" },
    { sag: "total_valor",          sr: "amount",          status: "✓", note: "Net value ex-IVA (confirmed from live data)" },
    { sag: "ss_moneda",            sr: "currency",        status: "✓", note: "PESOS→COP, DOLARES→USD" },
    { sag: "f.sc_cobrar_pagar",    sr: "(filter)",        status: "i", note: "C=AR(cobros/facturas), P=AP(payables). Filter to both C and P for SaleRecord" },
    { sag: "f.k_n_clase_fuente",   sr: "sagDocumentFamily", status: "~", note: "4=orders (skip). Map to OFFICIAL_INVOICE/DISPATCH_REMISION/etc." },
    { sag: "(derived)",            sr: "channel",         status: "~", note: "Derive from ka_ni_fuente: ALMACEN/EMPRESA/WEB via KNOWN_FUENTES.group" },
    { sag: "(derived)",            sr: "sagSourceType",   status: "~", note: "OFICIAL if sc_cobrar_pagar=C + not CP. NO_OFICIAL for remisiones/R2" },
    { sag: "sc_beneficiario",      sr: "storeName",       status: "~", note: "For POS almacenes — derive from KNOWN_FUENTES.label" },
    { sag: "(missing)",            sr: "sellerName",      status: "✗", note: "Not in MOVIMIENTOS header — may need separate VENDEDOR join or query" },
    { sag: "(missing)",            sr: "productLine",     status: "✗", note: "Would need MOVIMIENTOS_ITEMS.ka_ni_articulo join (out of scope for header sync)" },
  ];

  for (const m of mapping) {
    const icon = m.status === "✓" ? G("✓") : m.status === "~" ? Y("~") : m.status === "i" ? B("i") : R("✗");
    console.log(`  ${icon}  ${m.sag.padEnd(26)} → ${m.sr.padEnd(22)} ${D(m.note)}`);
  }

  console.log(W("\n  Legend: ✓ direct map  ~ derived/needs logic  i info  ✗ not available in query"));

  console.log(B("\n══ CONCLUSION ────────────────────────────────────────────────────��"));
  console.log(`
  ${W("Source")}:  MOVIMIENTOS JOIN MOVIMIENTOS_ITEMS JOIN FUENTES (SAME query as receivables)
  ${W("Key gap")}: Mapper currently saves ONLY sc_cobrar_pagar='C' → CustomerReceivable
  ${W("New need")}: Save ALL rows (C + P + bank movements) → SaleRecord with comprobanteCode

  ${W("Next step")}: Add pullMovements() to SagPyaSoapAdapter
    - Same SQL as DEFAULT_RECEIVABLE_QUERY (already confirmed working)
    - Map to SaleRecord instead of CustomerReceivable
    - comprobanteCode = k_sc_codigo_fuente (if present) OR lookup via ka_ni_fuente
    - channel = derive from KNOWN_FUENTES group (EMPRESA/ALMACEN/WEB)
    - No k_sc_codigo_fuente? Use ka_ni_fuente → comprobanteCode hardcoded map

  ${W("Rate limit")}: 1 extra SOAP call per sync run (340/day limit — current usage: ${G("~53/2d = safe")})
`);
}

main()
  .catch(e => { console.error(R(`\nFATAL: ${e.message}`)); process.exit(1); })
  .finally(() => (prisma as any).$disconnect());
