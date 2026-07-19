/**
 * sag-pya-soap/mappers.ts
 *
 * Pure mapping functions that transform raw SAG SOAP row objects (Record<string,unknown>)
 * into canonical UnifiedCustomer and UnifiedReceivable types.
 *
 * Field names confirmed from live SAG data (2026-04-08):
 *
 * TERCEROS (55 fields):
 *   n_nit             — integer NIT (no dashes/dots, no DV)
 *   sc_nombre         — business/legal name or first-name for natural persons
 *   ss_nombre1/2      — first/second given names (natural persons)
 *   ss_apellido1/2    — first/second surnames (natural persons)
 *   sc_naturaleza     — "N" natural person | "J" juridical entity
 *   sc_tipo_tercero   — "G" gremia | "N" normal | "O" other
 *   sc_telefono_ppal  — primary phone
 *   ss_email          — primary email
 *   sc_direccion      — address string
 *   ka_ni_ciudad      — int FK → city table (no label without join)
 *   ka_nl_departamento — int FK → department table
 *   ddt_fecha_modificacion — last-modified datetime
 *   ddt_fecha_creacion_tercero — creation datetime (may be null)
 *
 * MOVIMIENTOS JOIN MOVIMIENTOS_ITEMS JOIN FUENTES (confirmed 2026-04-11):
 *   Rows produced by the single-pass JOIN query in DEFAULT_RECEIVABLE_QUERY.
 *   14 fields returned after GROUP BY:
 *
 *   ka_nl_movimiento   — PK integer (document header)
 *   ka_ni_fuente       — document type FK → FUENTES
 *   n_numero_documento — document number
 *   ka_nl_tercero      — FK → TERCEROS (customer)
 *   sc_beneficiario    — denormalized customer name
 *   d_fecha_documento  — issue date
 *   ss_moneda          — currency string ("PESOS" | "DOLARES" etc.)
 *   ddt_fecha_new      — creation datetime
 *   total_valor        — SUM(ISNULL(n_valor,0))     : net line values (ex-IVA)
 *   total_iva          — SUM(ISNULL(n_iva,0))        : sum of IVA rate% per line (ref only)
 *   total_descuento    — SUM(ISNULL(n_descuento,0))  : total discount
 *   sc_cobrar_pagar    — 'C' (AR/Cobrar) | 'P' (AP/Pagar) from FUENTES JOIN
 *   k_n_clase_fuente   — document class (4 = customer order) from FUENTES JOIN
 *   ka_ni_forma_pago_fte — FK to payment form (1=immediate | 2=30-day credit)
 *
 *   originalAmount = total_valor (net, ex-IVA).
 *   paidAmount     = 0 — not resolvable; RECIBOS/ANTICIPOS/ABONOS don't exist;
 *                    PAGOS table is empty. Reassess when payment source is found.
 *   balanceDue     = originalAmount (conservative: assume nothing paid).
 *
 * NIT normalisation: n_nit is already an integer in SAG — we convert it to
 * a string. No dots, dashes, or DV-stripping needed. normalizeNit() is kept
 * for backward compatibility with callers that pass raw string NITs.
 */

import type { UnifiedCustomer, UnifiedReceivable, UnifiedSagOrder, UnifiedCollection, ReceivableStatus } from "@/lib/connectors/core/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract a string field, returning undefined when absent/null/empty. */
function str(row: Record<string, unknown>, key: string): string | undefined {
  const v = row[key];
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

/** Coerce a value to a finite number, defaulting to `fallback` (default 0). */
function num(row: Record<string, unknown>, key: string, fallback = 0): number {
  const v = row[key];
  if (v == null) return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : fallback;
}

/**
 * Parse a date from a SAG field value.
 * SAG returns dates as ISO strings ("2024-03-15T00:00:00") or datetime strings.
 * Falls back to epoch (1970-01-01) when parsing fails so the record is
 * never dropped — callers should check .getTime() > 0 for meaningful dates.
 */
function parseDate(row: Record<string, unknown>, key: string): Date {
  const v = row[key];
  if (!v) return new Date(0);
  const s = String(v).trim();
  if (!s) return new Date(0);
  const d = new Date(s.includes("T") ? s : s.slice(0, 10) + "T00:00:00Z");
  return isNaN(d.getTime()) ? new Date(0) : d;
}

/**
 * Normalise a Colombian NIT.
 * In SAG TERCEROS, n_nit is already an integer (no dots/dashes/DV).
 * This function handles legacy string NITs from other sources:
 *   "900.123.456-7"  → "900123456"
 *   "900.123.456"    → "900123456"
 *   "9001234567"     → "900123456"  (10-digit with DV)
 *   "900123456"      → "900123456"  (already clean)
 * Returns undefined when the input is blank.
 */
export function normalizeNit(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let s = raw.trim().replace(/[\.\s]/g, "");
  s = s.replace(/-\d$/, "");
  if (/^\d{10}$/.test(s)) {
    s = s.slice(0, 9);
  }
  return s.length > 0 ? s : undefined;
}

// ── Customer mapper ───────────────────────────────────────────────────────────

/**
 * Map a raw SAG TERCEROS row to a canonical UnifiedCustomer.
 *
 * Confirmed TERCEROS columns used:
 *   n_nit, sc_nombre, ss_nombre1, ss_nombre2, ss_apellido1, ss_apellido2,
 *   sc_naturaleza, sc_telefono_ppal, ss_email, sc_direccion,
 *   ka_ni_ciudad (int FK), ka_nl_departamento (int FK),
 *   ddt_fecha_modificacion, ddt_fecha_creacion_tercero
 */
export function mapSagCustomer(
  row: Record<string, unknown>,
  orgId: string
): UnifiedCustomer {
  // n_nit is an integer in SAG — convert to string directly
  const nitRaw = row["n_nit"];
  const nitStr = nitRaw != null && nitRaw !== "" ? String(nitRaw).trim() : undefined;
  const taxId  = nitStr && nitStr !== "0" ? nitStr : undefined;

  // Name composition:
  //   Juridical (sc_naturaleza != "N"): use sc_nombre
  //   Natural person (sc_naturaleza = "N"): compose from ss_nombre1 + ss_apellido1 etc.
  //   Fall back to sc_nombre in all cases when individual name parts are absent.
  const naturaleza  = str(row, "sc_naturaleza");
  const scNombre    = str(row, "sc_nombre");
  const nombre1     = str(row, "ss_nombre1");
  const nombre2     = str(row, "ss_nombre2");
  const apellido1   = str(row, "ss_apellido1");
  const apellido2   = str(row, "ss_apellido2");

  let fullName: string;
  if (naturaleza === "N" && (nombre1 || apellido1)) {
    const parts = [nombre1, nombre2, apellido1, apellido2].filter(Boolean);
    fullName = parts.join(" ");
  } else {
    fullName = scNombre ?? "SIN NOMBRE";
  }

  // Source ID: prefer NIT; fall back to composite name slug
  const sourceId = taxId ?? slugify(fullName);

  const updatedAt = parseDate(row, "ddt_fecha_modificacion");
  const createdRaw = parseDate(row, "ddt_fecha_creacion_tercero");
  const createdAt  = createdRaw.getTime() > 0
    ? createdRaw
    : updatedAt.getTime() > 0 ? updatedAt : new Date();

  // City/state: SAG stores integer FKs (ka_ni_ciudad, ka_nl_departamento)
  // that are NOT resolvable without a CIUDADES/DEPARTAMENTOS lookup table.
  // Emitting them as city/state overwrites correct CRM DANE codes on every sync.
  // CUSTOMER-GEOGRAPHY-RECOVERY-01: emit undefined so SAG never touches geography.
  const cityCode:  string | undefined = undefined;
  const stateCode: string | undefined = undefined;

  const customerType: UnifiedCustomer["type"] =
    naturaleza === "J" ? "company"
    : naturaleza === "N" ? "individual"
    : taxId ? "company"
    : "unknown";

  return {
    sourceId,
    source:  "sag_pya_soap",
    orgId,

    name:  fullName,
    taxId,
    email: str(row, "ss_email"),
    phone: str(row, "sc_telefono_ppal"),

    type: customerType,

    address: {
      line1: str(row, "sc_direccion"),
      city:  cityCode,
      state: stateCode,
    },

    // VENDEDORES.ka_nl_tercero links back to TERCEROS — vendor name is not
    // denormalised onto TERCEROS rows; skip salesRepName for now.
    salesRepName: undefined,

    createdAt,
    updatedAt,

    meta: { raw: row },
  };
}

// ── Receivable mapper ─────────────────────────────────────────────────────────

/**
 * Map a SAG MOVIMIENTOS-JOIN-ITEMS-JOIN-FUENTES row to a canonical UnifiedReceivable.
 *
 * Input shape (14 fields, produced by DEFAULT_RECEIVABLE_QUERY):
 *   ka_nl_movimiento, ka_ni_fuente, n_numero_documento,
 *   ka_nl_tercero, sc_beneficiario, d_fecha_documento,
 *   ss_moneda, ddt_fecha_new,
 *   total_valor, total_iva, total_descuento,
 *   sc_cobrar_pagar, k_n_clase_fuente, ka_ni_forma_pago_fte  (from FUENTES JOIN)
 *
 * Returns null for non-AR documents (sc_cobrar_pagar='P' payables, or k_n_clase_fuente=4 orders).
 * Callers must filter out nulls.
 *
 * Amount logic (confirmed from live data 2026-04-08):
 *   originalAmount = total_valor   (net line sum, ex-IVA)
 *   paidAmount     = 0             (no payment source found; PAGOS table is empty)
 *   balanceDue     = originalAmount (conservative — assumes nothing paid)
 *
 * Due date (confirmed 2026-04-11 — no VENCIMIENTOS/FORMAS_PAGO table exists):
 *   ka_ni_forma_pago_fte = 2 → dueDate = issueDate + 30 days (credit invoices)
 *   otherwise             → dueDate = issueDate (immediate/POS payment)
 *
 * sourceId is stable: "MOV-{ka_nl_movimiento}" across sync runs.
 */
export function mapSagReceivable(
  row: Record<string, unknown>,
  orgId: string
): UnifiedReceivable | null {
  // ── FUENTES filter: skip non-AR documents ──────────────────────────────────
  // sc_cobrar_pagar: 'C' = Cobrar (AR), 'P' = Pagar (AP — payables)
  // k_n_clase_fuente: 4 = customer orders (not yet billed)
  const cobrarPagar = str(row, "sc_cobrar_pagar") ?? "C";
  const claseRaw    = row["k_n_clase_fuente"];
  const clase       = claseRaw != null ? Number(claseRaw) : 0;
  if (cobrarPagar === "P" || clase === 4) return null;

  // Primary key: ka_nl_movimiento (integer PK on MOVIMIENTOS)
  const movId    = num(row, "ka_nl_movimiento", 0);
  const docNum   = str(row, "n_numero_documento") ?? String(movId);
  const fuenteId = num(row, "ka_ni_fuente", 0);

  // Stable sourceId across sync runs
  const sourceId = `MOV-${movId}`;

  // Customer — denormalized name on the header row
  const customerName = str(row, "sc_beneficiario") ?? "SIN NOMBRE";
  // ka_nl_tercero is an integer FK to TERCEROS — NOT the real NIT.
  // Real NIT comes from TERCEROS.n_nit via the LEFT JOIN (field: nit_tercero).
  // Only fall back to String(terceroId) for meta/traceability — never expose it as NIT.
  const terceroId    = num(row, "ka_nl_tercero", 0);
  const nitTerceroRaw = row["nit_tercero"];
  const nitTercero    = nitTerceroRaw != null && String(nitTerceroRaw).trim() !== "" && String(nitTerceroRaw).trim() !== "0"
    ? String(nitTerceroRaw).trim()
    : null;
  // customerTaxId = real NIT from TERCEROS; undefined when not available (no fallback to internal FK)
  const customerTaxId: string | undefined = nitTercero ?? undefined;

  // Dates
  const issueDate = parseDate(row, "d_fecha_documento");
  const baseDate  = issueDate.getTime() > 0 ? issueDate : new Date();

  // Due date: no VENCIMIENTOS/FORMAS_PAGO table in this SAG installation.
  // Use ka_ni_forma_pago_fte as proxy for credit terms:
  //   forma_pago = 2 → 30-day credit (electronic invoices, remisiones)
  //   otherwise      → immediate (POS, cash)
  const formaPago = row["ka_ni_forma_pago_fte"] != null
    ? Number(row["ka_ni_forma_pago_fte"])
    : null;
  const creditDays = formaPago === 2 ? 30 : 0;
  const dueDate = new Date(baseDate.getTime() + creditDays * 24 * 60 * 60 * 1000);

  // Days overdue: MAX(0, days since dueDate)
  const msOverdue  = Date.now() - dueDate.getTime();
  const daysOverdue = msOverdue > 0 ? Math.floor(msOverdue / (24 * 60 * 60 * 1000)) : 0;

  // Currency: SAG returns human-readable string ("PESOS" | "DOLARES")
  const monedaRaw = str(row, "ss_moneda") ?? "PESOS";
  const currency  = monedaRaw.toUpperCase() === "DOLARES" ? "USD" : "COP";

  // ── Amounts (confirmed real from MOVIMIENTOS_ITEMS JOIN, 2026-04-08) ─────
  //
  // total_valor     = SUM(ISNULL(n_valor, 0))    — net line values (ex-IVA)
  // total_iva       = SUM(ISNULL(n_iva, 0))       — sum of IVA rate% (ref only)
  // total_descuento = SUM(ISNULL(n_descuento, 0)) — total discount applied
  //
  // originalAmount = total_valor (net, before IVA).
  // A gross amount (with IVA) would require SUM(n_valor * n_iva / 100), which
  // needs a separate query; deferred until confirmed with Castillitos accountant.
  //
  // paidAmount = 0 — RECIBOS/ANTICIPOS/ABONOS tables do not exist in this
  // SAG installation. PAGOS table is empty. Reassess in next sprint.
  const totalValor     = num(row, "total_valor",     0);
  const totalDescuento = num(row, "total_descuento", 0);
  const totalIva       = num(row, "total_iva",       0); // IVA rate sum — kept for meta

  const originalAmount = totalValor;
  const paidAmount     = 0;
  const balanceDue     = originalAmount - paidAmount;

  // Status: "open" for all — payment status unresolvable without a payment table
  const status: ReceivableStatus = "open";

  return {
    sourceId,
    source:  "sag_pya_soap",
    orgId,

    invoiceRef:    docNum,
    customerName,
    customerTaxId,

    originalAmount,
    paidAmount,
    balanceDue,
    currency,

    status,
    daysOverdue,

    issueDate,
    dueDate,
    paidDate: undefined,

    meta: {
      raw:            row,
      fuenteId,
      movId,
      terceroId,
      totalValor,
      totalDescuento,
      totalIvaRateSum:  totalIva,
      creditDays,
      // paidAmountPending: true until a payments table (PAGOS, RECIBOS, etc.) is available
      paidAmountPending: true,
    },
  };
}

// ── Movement mapper ───────────────────────────────────────────────────────────

// ── ka_ni_fuente → k_sc_codigo_fuente lookup ──────────────────────────────────
// k_sc_codigo_fuente cannot be added to the SAG GROUP BY on the full dataset
// (triggers NullReferenceException, confirmed 2026-04-24).  Instead we derive
// comprobanteCode client-side from the integer ka_ni_fuente using a per-connector
// lookup function passed in by the adapter instance.
//
// The lookup function is built from connector.config.fuentesMap (a Record<number,string>
// stored in the Connector DB row) so each PYA company uses its own FUENTES registry.
// Castillitos falls back to CASTILLITOS_SOURCE_SEMANTIC_RULES when fuentesMap is absent.

// Code → channel mapping (confirmed from probe 2026-04-24)
const EMPRESA_CODES = new Set([
  // Ventas empresa F1 (active + historical)
  "FE", "F1", "NE", "NC", "ND", "NF", "D1", "FX",
  // Cobros empresa
  "R1", "R2",
  // Consignaciones bancarias
  "CP", "B1", "B2", "H1", "H2",
]);
const ALMACEN_CODES = new Set([
  // Ventas almacén
  "FD", "FC", "FG", "FA", "VC", "NA", "NG", "NS", "NT", "DA",
  // POS recaudos
  "RS", "RC", "RG", "RA",
  // Retail financiero (Addi/Sistecredit — at stores)
  "SI", "AN",
]);
const WEB_CODES = new Set(["FW", "NW"]);

// Codes classified as Fuente 2 / REMISION (dispatch without invoice)
const REMISION_CODES = new Set(["F2", "R2", "NF2"]);

function deriveChannel(code: string | null): string {
  if (!code) return "OTRO";
  if (EMPRESA_CODES.has(code)) return "EMPRESA";
  if (ALMACEN_CODES.has(code)) return "ALMACEN";
  if (WEB_CODES.has(code))     return "ONLINE";
  return "OTRO";
}

function deriveSagSourceType(code: string | null): string {
  if (!code) return "OFICIAL";
  return REMISION_CODES.has(code) ? "REMISION" : "OFICIAL";
}

function deriveSagDocumentFamily(code: string | null): string {
  if (!code) return "OTHER";
  if (code === "F2") return "DISPATCH_REMISION";
  if (code.startsWith("N") && code.length === 2) return "CREDIT_NOTE";
  if (code.startsWith("D") && code.length === 2) return "CREDIT_NOTE";
  if (code.startsWith("F") && code.length === 2) return "OFFICIAL_INVOICE";
  if (["R1", "R2", "RS", "RC", "RG", "RA", "SI", "AN"].includes(code)) return "OTHER";
  if (["CP", "B1", "B2", "H1", "H2"].includes(code)) return "OTHER";
  return "OTHER";
}

function deriveStoreName(code: string | null, channel: string): string {
  if (!code) return "SAG";
  const STORE_LABELS: Record<string, string> = {
    FD: "Almacén D", FC: "Almacén C", FG: "Almacén G", FA: "Almacén A",
    FW: "Tienda Web", FE: "Empresa", F1: "Empresa F1", F2: "Empresa F2",
    R1: "Empresa", R2: "Empresa F2",
    RS: "POS", RC: "POS", RG: "POS", RA: "POS",
    SI: "Addi/Sistecredit", AN: "Addi/Sistecredit",
  };
  return STORE_LABELS[code] ?? (channel === "EMPRESA" ? "Empresa" : channel === "ALMACEN" ? "Almacén" : "SAG");
}

/**
 * Map a SAG MOVIMIENTOS+FUENTES row (DEFAULT_RECEIVABLE_QUERY shape — 14 fields)
 * to a canonical UnifiedMovement for SaleRecord storage.
 *
 * comprobanteCode is derived from ka_ni_fuente via the `fuenteToCode` lookup
 * provided by the adapter instance (per-connector FUENTES registry).
 * k_sc_codigo_fuente cannot be included in the SAG GROUP BY on the full dataset.
 *
 * Returns null for payables (sc_cobrar_pagar='P') and orders (k_n_clase_fuente=4).
 */
export function mapSagMovement(
  row: Record<string, unknown>,
  orgId: string,
  fuenteToCode: (kaNiFuente: number) => string | null,
): import("@/lib/connectors/core/types").UnifiedMovement | null {
  // Skip payables and orders (same filter as receivables)
  const cobrarPagar = str(row, "sc_cobrar_pagar") ?? "C";
  const clase       = row["k_n_clase_fuente"] != null ? Number(row["k_n_clase_fuente"]) : 0;
  if (cobrarPagar === "P" || clase === 4) return null;

  const movId    = num(row, "ka_nl_movimiento", 0);
  if (movId === 0) return null;

  // Derive comprobanteCode from integer ka_ni_fuente via rules lookup
  const fuenteId = num(row, "ka_ni_fuente", 0);
  const code     = fuenteId > 0 ? fuenteToCode(fuenteId) : null;
  const docNum      = str(row, "n_numero_documento") ?? String(movId);
  const saleDate    = parseDate(row, "d_fecha_documento");
  const customerName = str(row, "sc_beneficiario") ?? "SIN NOMBRE";
  const terceroId   = num(row, "ka_nl_tercero", 0);

  const totalValor  = num(row, "total_valor", 0);
  const moneda      = str(row, "ss_moneda") ?? "PESOS";
  const currency    = moneda.toUpperCase() === "DOLARES" ? "USD" : "COP";

  const channel           = deriveChannel(code);  // derived from comprobanteCode
  const sagSourceType     = deriveSagSourceType(code);
  const sagDocumentFamily = deriveSagDocumentFamily(code);
  const storeName         = deriveStoreName(code, channel);
  const storeSlug         = slugify(storeName);

  return {
    sourceId:          `MOV-${movId}`,
    source:            "sag_pya_soap",
    orgId,
    erpMovId:          movId,
    comprobanteCode:   code,
    comprobante:       docNum,
    saleDate,
    customerName,
    customerTaxId:     terceroId > 0 ? String(terceroId) : undefined,
    amount:            totalValor,
    currency,
    channel,
    sagSourceType,
    sagDocumentFamily,
    storeName,
    storeSlug,
    meta: { raw: row, code, channel, sagSourceType },
  };
}

// ── Collection mapper — SAG v_pagosnew ────────────────────────────────────────

// Cobro codes this mapper accepts. Any other code is rejected (returns null).
const COLLECTION_CODES = new Set(["R1", "R2", "RS", "RC", "RG", "RA", "SI", "AN"]);

/**
 * Slug helper (mirrors the slugify used in the movement mapper).
 * Used only for naturalKey fallback — not for display.
 */
function mkNaturalKey(parts: (string | number | null | undefined)[]): string {
  const crypto = require("crypto") as typeof import("crypto");
  return crypto
    .createHash("sha256")
    .update(parts.map(p => String(p ?? "")).join("|"))
    .digest("hex")
    .slice(0, 24);
}

/**
 * Map one row from v_pagosnew (or v_movimientos_pagos_con_facturas) to a
 * canonical UnifiedCollection for CollectionRecord storage.
 *
 * Field names in v_pagosnew use PascalCase; the mapper tries multiple casing
 * variants for each field to be resilient to SAG view differences.
 *
 * Confirmed fields from live v_pagosnew schema (2026-04-30):
 *   Codigo_Fuente_Comprobante — short code: R1, R2, RS, RC, RG, RA, SI, AN
 *   Valor_Pagado              — real payment amount (always positive in this view)
 *   Fecha_Documento           — payment date (NOT Fecha_Pago)
 *   Numero_Documento          — comprobante number (NOT Nro_Comprobante), numeric
 *   Documento_pagado          — the invoice number being settled
 *   Nit_Tercero               — customer NIT (numeric)
 *   Nombre_Tercero            — customer name
 *   NOTE: Ka_Nl_Movimiento does NOT exist in v_pagosnew — dedup = code+docNum+date
 *
 * Returns null if:
 *   - Codigo_Fuente_Comprobante is not a known cobro code
 *   - Valor_Pagado resolves to 0 after Math.abs (SAG structural zero — skip)
 */
export function mapSagCollection(
  row: Record<string, unknown>,
  orgId: string,
): UnifiedCollection | null {
  // ── Comprobante code — primary filter ──────────────────────────────────────
  const code =
    str(row, "Codigo_Fuente_Comprobante") ??
    str(row, "codigo_fuente_comprobante") ??
    str(row, "CODIGO_FUENTE_COMPROBANTE") ??
    str(row, "Codigo_Fuente") ??
    str(row, "codigo_fuente") ??
    str(row, "CodigoFuente");
  if (!code || !COLLECTION_CODES.has(code)) return null;

  // ── Amount — Valor_Pagado is the confirmed real amount field ───────────────
  // SAG may store as negative (signo=-1 convention). Always Math.abs.
  const rawAmount =
    num(row, "Valor_Pagado") ||
    num(row, "valor_pagado") ||
    num(row, "VALOR_PAGADO") ||
    num(row, "ValorPagado") ||
    num(row, "Valor_Pago") ||
    num(row, "valor_pago") ||
    0;
  const amount = Math.abs(rawAmount);
  // Skip structural zeros — no real payment data in this row
  if (amount === 0) return null;

  // ── SAG MOVIMIENTOS PK — used for dedup and cross-referencing SaleRecord ───
  const erpMovIdRaw =
    row["Ka_Nl_Movimiento"] ??
    row["ka_nl_movimiento"] ??
    row["KA_NL_MOVIMIENTO"] ??
    row["Id_Movimiento"] ??
    row["id_movimiento"] ??
    row["NL_MOVIMIENTO"];
  const erpMovId = erpMovIdRaw != null && erpMovIdRaw !== "" ? Number(erpMovIdRaw) : null;

  // ── Document number ────────────────────────────────────────────────────────
  // Confirmed from v_pagosnew live schema (2026-04-30): Numero_Documento
  const documentNumber =
    str(row, "Numero_Documento") ??
    str(row, "numero_documento") ??
    str(row, "Nro_Comprobante") ??
    str(row, "nro_comprobante") ??
    str(row, "Numero_Comprobante") ??
    str(row, "NRO_COMPROBANTE") ??
    str(row, "n_numero_documento") ??
    (erpMovId != null ? String(erpMovId) : undefined);

  // ── Collection date ────────────────────────────────────────────────────────
  // Confirmed from v_pagosnew live schema (2026-04-30): Fecha_Documento
  const collectionDate =
    parseDate(row, "Fecha_Documento") ||
    parseDate(row, "fecha_documento") ||
    parseDate(row, "Fecha_Pago") ||
    parseDate(row, "fecha_pago") ||
    parseDate(row, "FECHA_DOCUMENTO") ||
    parseDate(row, "Fecha") ||
    parseDate(row, "fecha") ||
    new Date(0);

  // ── Customer ───────────────────────────────────────────────────────────────
  // sagTerceroId = ka_nl_tercero (internal SAG integer PK) — NOT the real NIT.
  // Only used for identity resolution via resolveCustomerIdentity().
  const terceroIdRaw = row["Ka_Nl_Tercero"] ?? row["ka_nl_tercero"] ?? row["KA_NL_TERCERO"];
  const sagTerceroId = terceroIdRaw != null && Number(terceroIdRaw) > 0
    ? Number(terceroIdRaw)
    : undefined;

  // customerNit = real NIT from TERCEROS.n_nit (populated when TERCEROS JOIN present).
  // Never fall back to ka_nl_tercero here — that would re-introduce the 526 bug.
  const nitRaw =
    row["Nit_Tercero"] ?? row["nit_tercero"] ?? row["NIT_TERCERO"] ??
    row["NIT"] ?? row["nit"] ?? row["n_nit"];
  const customerNit =
    nitRaw != null && String(nitRaw).trim() !== "" && String(nitRaw) !== "0"
      ? String(nitRaw).trim()
      : undefined;

  const customerName =
    str(row, "Nombre_Tercero") ??
    str(row, "nombre_tercero") ??
    str(row, "NOMBRE_TERCERO") ??
    str(row, "Nombre") ??
    str(row, "nombre") ??
    str(row, "NOMBRE") ??
    str(row, "sc_beneficiario");

  // ── Currency ───────────────────────────────────────────────────────────────
  const moneda =
    str(row, "Moneda") ?? str(row, "moneda") ?? str(row, "MONEDA") ??
    str(row, "ss_moneda") ?? "PESOS";
  const currency = moneda.toUpperCase() === "DOLARES" ? "USD" : "COP";

  // ── Applied invoices (v_movimientos_pagos_con_facturas may provide these) ──
  const invoiceRef =
    str(row, "Numero_Factura") ?? str(row, "numero_factura") ??
    str(row, "Factura") ?? str(row, "factura");
  const appliedFacts = invoiceRef
    ? [{ invoiceNumber: invoiceRef, amount }]
    : undefined;

  // ── Bank reference (for B1/B2/CP consignaciones) ──────────────────────────
  const bankReference =
    str(row, "Referencia") ?? str(row, "referencia") ??
    str(row, "Nro_Cheque") ?? str(row, "nro_cheque") ??
    str(row, "ss_banco") ?? str(row, "n_numero_cheque");

  // ── Dedup natural key ──────────────────────────────────────────────────────
  // Prefer erpMovId (stable SAG PK). Fallback to code+docNum+date.
  const naturalKey = erpMovId != null && erpMovId > 0
    ? mkNaturalKey([orgId, erpMovId])
    : mkNaturalKey([orgId, code, documentNumber, collectionDate.toISOString().slice(0, 10)]);

  return {
    sourceId:        naturalKey,
    source:          "sag_pya_soap",
    orgId,
    erpMovId:        erpMovId != null && erpMovId > 0 ? erpMovId : undefined,
    comprobanteCode: code,
    documentNumber,
    collectionDate,
    sagTerceroId,
    customerNit,
    customerName,
    amount,
    currency,
    appliedFacts,
    bankReference,
    meta: { raw: row, code, erpMovId },
  };
}

// ── Order mapper — SAG PD (Pedidos Cliente) ───────────────────────────────────

/**
 * Map a SAG MOVIMIENTOS+FUENTES row to a canonical UnifiedSagOrder.
 *
 * Returns non-null ONLY for rows where:
 *   k_n_clase_fuente = 4 (customer orders)  AND
 *   sc_cobrar_pagar  = 'C' (AR direction)    AND
 *   derived comprobanteCode = 'PD'
 *
 * These rows are filtered out by mapSagMovement() (SaleRecord layer).
 * This mapper gives them a dedicated storage path: CustomerOrderRecord.
 */
export function mapSagOrder(
  row: Record<string, unknown>,
  orgId: string,
  fuenteToCode: (kaNiFuente: number) => string | null,
): UnifiedSagOrder | null {
  const cobrarPagar = str(row, "sc_cobrar_pagar") ?? "C";
  const clase       = row["k_n_clase_fuente"] != null ? Number(row["k_n_clase_fuente"]) : 0;
  if (cobrarPagar === "P" || clase !== 4) return null;

  const fuenteId = num(row, "ka_ni_fuente", 0);
  const code     = fuenteId > 0 ? fuenteToCode(fuenteId) : null;
  if (code !== "PD") return null; // only genuine PEDIDOS CLIENTES rows

  const movId       = num(row, "ka_nl_movimiento", 0);
  if (movId === 0) return null;

  const orderNumber  = str(row, "n_numero_documento") ?? String(movId);
  const customerName = str(row, "sc_beneficiario") ?? "SIN NOMBRE";
  const terceroId    = num(row, "ka_nl_tercero", 0);
  const orderDate    = parseDate(row, "d_fecha_documento");
  const totalValor   = num(row, "total_valor", 0);
  const moneda       = str(row, "ss_moneda") ?? "PESOS";
  const currency     = moneda.toUpperCase() === "DOLARES" ? "USD" : "COP";

  return {
    sourceId:     `ORD-${movId}`,
    source:       "sag_pya_soap",
    orgId,
    erpMovId:     movId,
    orderNumber,
    customerName,
    customerNit:  terceroId > 0 ? String(terceroId) : undefined,
    orderDate,
    amount:       totalValor,
    currency,
    sourceCode:   "PD",
  };
}

// ── Internal slug helper (module-scoped) ──────────────────────────────────────

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);
}
