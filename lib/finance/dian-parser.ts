/**
 * dian-parser.ts
 *
 * Sprint 3 — DIAN Read Layer / Verdad fiscal V1
 *
 * Extracts all DIAN-relevant fiscal fields from a Document's
 * stored extractedJson. No live DIAN API required — works entirely
 * from the already-persisted XML extraction results.
 *
 * Field priority for CO_ATTACHED_DOCUMENT:
 *   1. referencedDocumentInfo (envelope metadata — always present)
 *   2. fields (from embedded Invoice payload — present only when
 *      embeddedPayloadDetected = true)
 *
 * CUFE / CUDE semantics:
 *   - CO_INVOICE / CO_ATTACHED_DOCUMENT → CUFE (SHA-384, 96 hex chars)
 *   - CO_CREDIT_NOTE                    → CUDE (same format, different purpose)
 *   - CO_DEBIT_NOTE                     → CUDE
 *   The xml-extract layer stores all of these in the `cufe` field;
 *   we disambiguate by xmlFormat below.
 *
 * CUFE validation rules (tolerant — matches xml-extract.ts normaliseCufe):
 *   - Valid:   hex string ≥ 40 chars
 *   - Nominal: exactly 96 chars (SHA-384 canonical form)
 *   - Invalid: non-hex chars, empty string, < 40 chars
 */

// ── Extracted field types ──────────────────────────────────────────────────────

/** All DIAN-relevant fiscal fields parsed from a Document's extractedJson. */
export interface DianFields {
  // ── Core identity ──────────────────────────────────────────────────────────
  /** CUFE (facturas) or CUDE (notas). 96 hex = SHA-384 canonical. */
  cufe:           string | null;
  /** Prefix / serie (e.g. "PREF", "FE", "NC"). */
  prefix:         string | null;
  /** Invoice / nota number without prefix. */
  invoiceNumber:  string | null;
  /** Full reference = prefix + invoiceNumber (convenience). */
  fullReference:  string | null;

  // ── Dates ──────────────────────────────────────────────────────────────────
  issueDate:      Date | null;
  dueDate:        Date | null;

  // ── Parties ────────────────────────────────────────────────────────────────
  issuerNit:      string | null;
  issuerName:     string | null;
  receiverNit:    string | null;
  receiverName:   string | null;

  // ── Amounts ────────────────────────────────────────────────────────────────
  subtotal:       number | null;
  taxAmount:      number | null;   // IVA
  totalAmount:    number | null;
  currency:       string | null;

  // ── Document family ────────────────────────────────────────────────────────
  /** CO_INVOICE | CO_ATTACHED_DOCUMENT | CO_CREDIT_NOTE | CO_DEBIT_NOTE | CFDI | UNKNOWN */
  xmlFormat:         string | null;
  /** FACTURA_ELECTRONICA | NOTA_CREDITO | NOTA_DEBITO | … */
  colombiaXmlType:   string | null;
  /** Whether this CUFE/CUDE is a credit/debit note (not a primary invoice). */
  isNota:            boolean;

  // ── Extraction health ──────────────────────────────────────────────────────
  extractionSuccess: boolean;
  /** Set when extraction failed: INVALID_URL | FILE_NOT_FOUND | FETCH_FAILED | PARSE_FAILED | NOT_XML | NO_FIELDS_EXTRACTED */
  errorReason:       string | null;
  embeddedPayload:   boolean;
}

/** CUFE validation result. */
export interface CufeValidation {
  present:  boolean;
  valid:    boolean;
  nominal:  boolean;  // exactly 96 hex chars
  reason:   string | null;
}

// ── Safe extractedJson helpers ─────────────────────────────────────────────────

type EJ = Record<string, unknown>;

function safe(ej: unknown): EJ | null {
  return ej && typeof ej === "object" && !Array.isArray(ej) ? (ej as EJ) : null;
}

function str(o: EJ, k: string): string | null {
  const v = o[k];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(o: EJ, k: string): number | null {
  const v = o[k];
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") { const n = parseFloat(v); return isFinite(n) ? n : null; }
  return null;
}

function obj(o: EJ, k: string): EJ | null {
  const v = o[k];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as EJ) : null;
}

function bool(o: EJ, k: string): boolean {
  return o[k] === true;
}

function parseDate(o: EJ, k: string): Date | null {
  const v = o[k];
  if (v instanceof Date) return v;
  if (typeof v === "string" && v) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// ── CUFE validation ────────────────────────────────────────────────────────────

const HEX_RE = /^[a-f0-9]+$/i;

export function validateCufe(cufe: string | null): CufeValidation {
  if (!cufe) return { present: false, valid: false, nominal: false, reason: "Ausente" };
  const clean = cufe.trim().toLowerCase();
  if (!HEX_RE.test(clean)) {
    return { present: true, valid: false, nominal: false, reason: "Caracteres no hexadecimales" };
  }
  if (clean.length < 40) {
    return { present: true, valid: false, nominal: false, reason: `Longitud insuficiente (${clean.length} < 40)` };
  }
  const nominal = clean.length === 96;
  return {
    present: true,
    valid:   true,
    nominal,
    reason:  nominal ? null : `Longitud no canónica (${clean.length}/96)`,
  };
}

// ── NIT normalizer ─────────────────────────────────────────────────────────────

/** Strips formatting (dots, hyphens, spaces) and lowercases for comparison. */
export function normalizeNit(nit: string | null | undefined): string {
  if (!nit) return "";
  return nit.replace(/[\s\-\.]/g, "").toLowerCase();
}

/** Extracts only the numeric base (drops check digit after hyphen). */
export function nitBase(nit: string | null | undefined): string {
  const clean = normalizeNit(nit);
  return clean.replace(/-.*$/, "").replace(/\D/g, "");
}

// ── Main parser ────────────────────────────────────────────────────────────────

/**
 * Parse all DIAN-relevant fiscal fields from a Document's extractedJson.
 * Safe to call with null / non-XML documents — always returns a DianFields
 * with extractionSuccess = false.
 */
export function parseDianFields(extractedJson: unknown): DianFields {
  const EMPTY: DianFields = {
    cufe: null, prefix: null, invoiceNumber: null, fullReference: null,
    issueDate: null, dueDate: null,
    issuerNit: null, issuerName: null, receiverNit: null, receiverName: null,
    subtotal: null, taxAmount: null, totalAmount: null, currency: null,
    xmlFormat: null, colombiaXmlType: null, isNota: false,
    extractionSuccess: false, errorReason: null, embeddedPayload: false,
  };

  const ej = safe(extractedJson);
  if (!ej) return EMPTY;

  const xmlExt = obj(ej, "xmlExtraction");
  if (!xmlExt) return EMPTY;

  const success        = bool(xmlExt, "success");
  const errorReason    = str(xmlExt, "errorReason");
  const xmlFormat      = str(xmlExt, "xmlFormat");
  const colombiaXmlType = str(xmlExt, "colombiaXmlType");
  const embeddedPayload = bool(xmlExt, "embeddedPayloadDetected");

  const isNota = xmlFormat === "CO_CREDIT_NOTE" || xmlFormat === "CO_DEBIT_NOTE";

  // ── Fields from the inline Invoice payload (highest fidelity when present)
  const fields = obj(xmlExt, "fields");

  // ── Reference envelope (CO_ATTACHED_DOCUMENT) — present even without payload
  const refInfo = obj(xmlExt, "referencedDocumentInfo");

  // ── CUFE: prefer fields.cufe (parsed from payload), fall back to envelope
  let cufe = (fields && str(fields, "cufe"))
          ?? (refInfo && str(refInfo, "cufe"))
          ?? null;

  // ── Invoice number: prefer fields, fall back to envelope
  let rawInvoiceNumber = (fields && str(fields, "invoiceNumber"))
                      ?? (refInfo && str(refInfo, "invoiceNumber"))
                      ?? null;

  // Split prefix from invoice number if format is "PREFIX-NNNN"
  let prefix: string | null = null;
  if (rawInvoiceNumber) {
    const match = rawInvoiceNumber.match(/^([A-Za-z]+[\-]?)(\d+)$/);
    if (match) {
      prefix           = match[1].replace(/-$/, "");
      rawInvoiceNumber = match[2];
    }
  }

  // ── Dates
  let issueDate: Date | null = null;
  if (fields) issueDate = parseDate(fields, "documentDate");
  if (!issueDate && refInfo) {
    const raw = str(refInfo, "issueDate");
    if (raw) { const d = new Date(raw); if (!isNaN(d.getTime())) issueDate = d; }
  }
  const dueDate = fields ? parseDate(fields, "dueDate") : null;

  // ── Parties
  const issuerNit  = (fields && str(fields, "issuerId"))   ?? null;
  const issuerName = (fields && str(fields, "issuerName")) ?? null;
  const receiverNit  = (fields && str(fields, "customerId"))    ?? null;
  const receiverName = (fields && str(fields, "customerName"))  ?? null;

  // ── Amounts (only from payload — envelope never has amounts)
  const subtotal    = fields ? num(fields, "subtotal")    : null;
  const taxAmount   = fields ? num(fields, "taxAmount")   : null;
  const totalAmount = fields ? num(fields, "totalAmount") : null;
  const currency    = fields ? str(fields, "currency")    : null;

  const fullReference = [prefix, rawInvoiceNumber].filter(Boolean).join("-") || null;

  return {
    cufe, prefix, invoiceNumber: rawInvoiceNumber, fullReference,
    issueDate, dueDate,
    issuerNit, issuerName, receiverNit, receiverName,
    subtotal, taxAmount, totalAmount, currency,
    xmlFormat, colombiaXmlType, isNota,
    extractionSuccess: success,
    errorReason:       success ? null : errorReason,
    embeddedPayload,
  };
}
