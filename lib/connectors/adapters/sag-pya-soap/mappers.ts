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

import type { UnifiedCustomer, UnifiedReceivable, ReceivableStatus } from "@/lib/connectors/core/types";

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

  // City/state: SAG stores integer FKs — emit as string codes for now;
  // a JOIN against CIUDADES/DEPARTAMENTOS would be needed for labels.
  const cityCode  = str(row, "ka_ni_ciudad");
  const stateCode = str(row, "ka_nl_departamento");

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
  // ka_nl_tercero is an integer FK to TERCEROS; store as string for traceability
  const terceroId = num(row, "ka_nl_tercero", 0);
  const customerTaxId: string | undefined = terceroId > 0 ? String(terceroId) : undefined;

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
