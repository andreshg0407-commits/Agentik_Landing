import { readFile, access } from "fs/promises";
import { join } from "path";

// ═════════════════════════════════════════════════════════════════════════════
// XML Colombia v1 — Electronic Invoice Extractor
//
// Purpose: Extract structured financial fields from Colombian electronic
// invoice XML files issued under the DIAN UBL 2.1 standard.
//
// Supported document families (Colombia-first):
//   CO_ATTACHED_DOCUMENT — AttachedDocument (Contenedor DIAN) — most common
//   CO_INVOICE           — Factura Electrónica de Venta (Invoice root)
//   CO_CREDIT_NOTE       — Nota Crédito (CreditNote root)
//   CO_DEBIT_NOTE        — Nota Débito (DebitNote root)
//   CFDI                 — Comprobante Fiscal Digital (Mexican SAT — out of
//                          Colombia v1 scope but preserved for future use)
//   UNKNOWN              — Unrecognised root element
// ═════════════════════════════════════════════════════════════════════════════

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * Structured financial fields extracted from a Colombian electronic invoice.
 *
 * Spanish DIAN concept → field name mapping:
 *   Razón Social del Emisor          → issuerName
 *   NIT del Emisor                   → issuerId
 *   Razón Social del Adquiriente     → customerName
 *   NIT del Adquiriente              → customerId
 *   Número de Factura                → invoiceNumber
 *   Fecha de Emisión / Expedición    → documentDate
 *   Fecha de Vencimiento             → dueDate
 *   Moneda                           → currency
 *   Subtotal (base gravable)         → subtotal
 *   Impuestos (IVA — valor)          → taxAmount
 *   Total a Pagar                    → totalAmount
 *   CUFE (SHA-384 hex, 96 chars)     → cufe
 *
 * Null means the field was not found or could not be parsed.
 */
export interface XmlInvoiceFields {
  issuerName:    string | null;  // Razón Social del Emisor
  issuerId:      string | null;  // NIT del Emisor
  customerName:  string | null;  // Razón Social del Adquiriente
  customerId:    string | null;  // NIT del Adquiriente
  invoiceNumber: string | null;  // Número de Factura
  documentDate:  Date   | null;  // Fecha de Emisión
  dueDate:       Date   | null;  // Fecha de Vencimiento
  currency:      string | null;  // Moneda (COP, USD, …)
  subtotal:      number | null;  // Subtotal (base gravable)
  taxAmount:     number | null;  // Impuestos (IVA — valor monetario)
  totalAmount:   number | null;  // Total a Pagar
  cufe:          string | null;  // CUFE (Código Único de Factura Electrónica)
}

/** One successfully matched node, stored verbatim for debug. */
export interface XmlMatchedNode {
  field:    string;
  nodePath: string;
  rawValue: string;
}

/**
 * Colombia-first XML document family classification.
 *
 * CO_ATTACHED_DOCUMENT — Contenedor DIAN (AttachedDocument root).
 *   The most common format delivered by DIAN-authorized software.
 *   Contains party information directly and embeds the full Invoice XML
 *   inside Attachment.ExternalReference.Description (raw CDATA).
 *
 * CO_INVOICE     — Factura Electrónica de Venta (Invoice root).
 *   Direct UBL 2.1 Invoice, contains all fields natively.
 *
 * CO_CREDIT_NOTE — Nota Crédito (CreditNote root).
 * CO_DEBIT_NOTE  — Nota Débito (DebitNote root).
 *   Same sub-tree structure as CO_INVOICE.
 *
 * CFDI   — Mexican SAT Comprobante Fiscal Digital (out of CO v1 scope).
 * UNKNOWN — Root element not recognised as any known format.
 */
export type XmlFormat =
  | "CO_ATTACHED_DOCUMENT"
  | "CO_INVOICE"
  | "CO_CREDIT_NOTE"
  | "CO_DEBIT_NOTE"
  | "CFDI"
  | "UNKNOWN";

/**
 * Spanish semantic label for the detected Colombian XML type.
 * Stored in debug output as `colombiaXmlType`.
 */
export type ColombiaXmlType =
  | "DOCUMENTO_ADJUNTO"   // CO_ATTACHED_DOCUMENT
  | "FACTURA_ELECTRONICA" // CO_INVOICE
  | "NOTA_CREDITO"        // CO_CREDIT_NOTE
  | "NOTA_DEBITO"         // CO_DEBIT_NOTE
  | "NO_COLOMBIANO"       // CFDI (Mexican)
  | "DESCONOCIDO";        // UNKNOWN

export interface XmlExtractResult {
  success:      boolean;
  fields:       XmlInvoiceFields;
  parserUsed:   "fast-xml-parser" | null;
  /** Colombia-first XML document family. */
  xmlFormat:    XmlFormat | null;
  matchedNodes: XmlMatchedNode[];
  debugNotes:   string[];
  /** Set when success is false. */
  errorReason?: "INVALID_URL" | "FILE_NOT_FOUND" | "FETCH_FAILED" | "PARSE_FAILED" | "NOT_XML" | "NO_FIELDS_EXTRACTED";
  /** XML root element detected after namespace stripping (e.g. "AttachedDocument", "Invoice"). */
  detectedRoot?:           string;
  /** Spanish semantic label for the detected type (e.g. "FACTURA_ELECTRONICA"). */
  colombiaXmlType?:        ColombiaXmlType;
  /**
   * Every dot-path that was searched during field extraction.
   * Useful for diagnosing why a field was not found.
   */
  searchedPaths?:          string[];
  /**
   * True when a CO_ATTACHED_DOCUMENT contained a parseable embedded Invoice
   * XML payload inside Attachment.ExternalReference.Description (CDATA).
   * When true, currency/amounts/dueDate were extracted from that payload.
   * When false or undefined, those fields may be null even if the envelope
   * was parsed successfully.
   */
  embeddedPayloadDetected?: boolean;
  /**
   * Reference metadata from the AttachedDocument envelope itself.
   * Available even when the embedded Invoice payload could not be decoded.
   * Present only for CO_ATTACHED_DOCUMENT format.
   */
  referencedDocumentInfo?: {
    /** Número de Factura from AttachedDocument.ParentDocumentID */
    invoiceNumber:    string | null;
    /** DocumentType from ParentDocumentLineReference.DocumentReference */
    documentTypeCode: string | null;
    /** CUFE from ParentDocumentLineReference.DocumentReference.UUID */
    cufe:             string | null;
    /** Invoice IssueDate from DocumentReference (not the envelope date) */
    issueDate:        string | null;
  } | null;
}

// ── fast-xml-parser configuration ─────────────────────────────────────────────

/**
 * Parser options for UBL 2.1 (Colombian DIAN) and CFDI:
 *
 *  removeNSPrefix     — strips cbc:, cac:, cfdi:, ext:, sts: prefixes so
 *                       paths work without namespace qualifiers.
 *  ignoreAttributes   — false to capture attribute-encoded values (CFDI
 *                       amounts, DIAN schemeID / currencyID attributes).
 *  attributeNamePrefix — "@_" distinguishes attributes from child nodes.
 *  parseTagValue /
 *  parseAttributeValue — auto-converts numeric strings so amount fields
 *                        don't need separate string-to-number parsing.
 */
const PARSER_OPTIONS = {
  ignoreAttributes:       false,
  attributeNamePrefix:    "@_",
  textNodeName:           "#text",
  removeNSPrefix:         true,
  parseTagValue:          true,
  parseAttributeValue:    true,
  trimValues:             true,
  allowBooleanAttributes: false, // prevent XXE / external entity injection
} as const;

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Identifies the Colombian XML document family from the parsed root keys.
 *
 * Real DIAN AttachedDocument files have "?xml" and "AttachedDocument" as
 * the only top-level keys after namespace stripping — the XML declaration
 * is surfaced as a pseudo-key by fast-xml-parser when parseTagValue is on.
 */
function detectFormat(parsed: Record<string, unknown>): {
  format:         XmlFormat;
  root:           string;
  colombiaXmlType: ColombiaXmlType;
} {
  const keys = Object.keys(parsed);
  if (keys.includes("AttachedDocument")) return { format: "CO_ATTACHED_DOCUMENT", root: "AttachedDocument", colombiaXmlType: "DOCUMENTO_ADJUNTO"   };
  if (keys.includes("Invoice"))          return { format: "CO_INVOICE",           root: "Invoice",          colombiaXmlType: "FACTURA_ELECTRONICA" };
  if (keys.includes("CreditNote"))       return { format: "CO_CREDIT_NOTE",       root: "CreditNote",       colombiaXmlType: "NOTA_CREDITO"        };
  if (keys.includes("DebitNote"))        return { format: "CO_DEBIT_NOTE",        root: "DebitNote",        colombiaXmlType: "NOTA_DEBITO"         };
  if (keys.includes("Comprobante"))      return { format: "CFDI",                 root: "Comprobante",      colombiaXmlType: "NO_COLOMBIANO"       };
  // Surface the first meaningful root key for debug (skip XML declaration pseudo-keys)
  const root = keys.find((k) => !k.startsWith("?") && !k.startsWith("!")) ?? keys[0] ?? "unknown";
  return { format: "UNKNOWN", root, colombiaXmlType: "DESCONOCIDO" };
}

// ── Path traversal ────────────────────────────────────────────────────────────

/**
 * Walks a dot-separated path through the parsed XML object.
 * When an intermediate node is an array (repeated element), the first item
 * is used — consistent with DIAN invoices where TaxTotal may be a list.
 */
function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
    if (Array.isArray(cur)) cur = cur[0];
  }
  return cur;
}

/**
 * Converts a parsed XML node value to a plain string.
 *
 * Handles:
 *   string                      → trimmed string (or null if empty)
 *   number | boolean            → String()
 *   { "#text": v, "@_attr": … } → extract #text (mixed-content node)
 */
function nodeToString(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string")  return v.trim() || null;
  if (typeof v === "number")  return isFinite(v) ? String(v) : null;
  if (typeof v === "boolean") return String(v);
  if (typeof v === "object" && !Array.isArray(v)) {
    const text = (v as Record<string, unknown>)["#text"];
    if (text !== undefined) return nodeToString(text);
  }
  return null;
}

/** Converts a parsed node value to a finite positive number, or null. */
function nodeToNumber(v: unknown): number | null {
  const s = nodeToString(v);
  if (!s) return null;
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : null;
}

function pickString(parsed: unknown, paths: string[]): { value: string | null; path: string | null } {
  for (const path of paths) {
    const v = nodeToString(getByPath(parsed, path));
    if (v !== null) return { value: v, path };
  }
  return { value: null, path: null };
}

function pickNumber(parsed: unknown, paths: string[]): { value: number | null; path: string | null } {
  for (const path of paths) {
    const v = nodeToNumber(getByPath(parsed, path));
    if (v !== null && v > 0) return { value: v, path };
  }
  return { value: null, path: null };
}

/** Parses an ISO-like date string, returns null and records a note on failure. */
function parseXmlDate(raw: string | null, label: string, notes: string[]): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d;
  notes.push(`${label}: could not parse "${raw}" as a date`);
  return null;
}

/** Validates and normalises a CUFE (96-char hex SHA-384) to lowercase. */
function normaliseCufe(raw: string | null, notes: string[]): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // CUFE is exactly 96 hex chars (SHA-384); accept anything ≥40 hex chars
  // to tolerate CUDE and other DIAN digest variants
  if (/^[0-9a-fA-F]{40,}$/.test(trimmed)) return trimmed.toLowerCase();
  notes.push(`cufe: raw value "${trimmed.slice(0, 20)}…" rejected — not valid hex`);
  return null;
}

/** Strips dot-thousands separators from Colombian NITs: "890.984.843" → "890984843". */
function normaliseId(raw: string | null): string | null {
  return raw ? raw.replace(/\.(?=\d{3})/g, "").trim() : null;
}

// ═════════════════════════════════════════════════════════════════════════════
// PATH SPECIFICATIONS — Colombian UBL 2.1 (DIAN) & CFDI
// ═════════════════════════════════════════════════════════════════════════════

// ── Colombian UBL 2.1 (Factura / Nota Crédito / Nota Débito) ─────────────────
//
// CreditNote and DebitNote share the same sub-tree as Invoice, so all three
// roots are checked in order. RegistrationName (Razón Social) is preferred
// over PartyName.Name because it is the legally registered name in DIAN UBL.

const CO_UBL_ROOTS = ["Invoice", "CreditNote", "DebitNote"] as const;

function coUblPaths(suffix: string): string[] {
  return CO_UBL_ROOTS.map((r) => `${r}.${suffix}`);
}

// Número de Factura — cbc:ID on the root document element
const CO_UBL_INVOICE_NUMBER = coUblPaths("ID");

// Fecha de Emisión — cbc:IssueDate
const CO_UBL_ISSUE_DATE = coUblPaths("IssueDate");

// Fecha de Vencimiento — cac:PaymentMeans.cbc:PaymentDueDate (most common in DIAN)
// or top-level cbc:DueDate (some DIAN implementations)
const CO_UBL_DUE_DATE = [
  ...coUblPaths("PaymentMeans.PaymentDueDate"),
  ...coUblPaths("DueDate"),
];

// Moneda — cbc:DocumentCurrencyCode
const CO_UBL_CURRENCY = coUblPaths("DocumentCurrencyCode");

// CUFE — cbc:UUID (DIAN SHA-384 digest, 96 hex chars)
const CO_UBL_CUFE = coUblPaths("UUID");

// Razón Social del Emisor — cac:AccountingSupplierParty
const CO_UBL_ISSUER_NAME = [
  ...coUblPaths("AccountingSupplierParty.Party.PartyLegalEntity.RegistrationName"),
  ...coUblPaths("AccountingSupplierParty.Party.PartyName.Name"),
  ...coUblPaths("AccountingSupplierParty.Party.PartyTaxScheme.RegistrationName"),
];

// NIT del Emisor — cac:AccountingSupplierParty
const CO_UBL_ISSUER_ID = [
  ...coUblPaths("AccountingSupplierParty.Party.PartyTaxScheme.CompanyID"),
  ...coUblPaths("AccountingSupplierParty.Party.PartyLegalEntity.CompanyID"),
];

// Razón Social del Adquiriente — cac:AccountingCustomerParty
const CO_UBL_CUSTOMER_NAME = [
  ...coUblPaths("AccountingCustomerParty.Party.PartyLegalEntity.RegistrationName"),
  ...coUblPaths("AccountingCustomerParty.Party.PartyName.Name"),
  ...coUblPaths("AccountingCustomerParty.Party.PartyTaxScheme.RegistrationName"),
];

// NIT del Adquiriente — cac:AccountingCustomerParty
const CO_UBL_CUSTOMER_ID = [
  ...coUblPaths("AccountingCustomerParty.Party.PartyTaxScheme.CompanyID"),
  ...coUblPaths("AccountingCustomerParty.Party.PartyLegalEntity.CompanyID"),
];

// Total a Pagar — cac:LegalMonetaryTotal
const CO_UBL_TOTAL = [
  ...coUblPaths("LegalMonetaryTotal.PayableAmount"),
  ...coUblPaths("LegalMonetaryTotal.TaxInclusiveAmount"),
  ...coUblPaths("LegalMonetaryTotal.LineExtensionAmount"),
];

// Subtotal (base gravable)
const CO_UBL_SUBTOTAL = [
  ...coUblPaths("LegalMonetaryTotal.LineExtensionAmount"),
  ...coUblPaths("LegalMonetaryTotal.TaxExclusiveAmount"),
];

// Impuestos (IVA — valor monetario, not percentage)
// TaxTotal may be an array when multiple tax types appear → getByPath takes first
const CO_UBL_TAX = coUblPaths("TaxTotal.TaxAmount");

// ── AttachedDocument (Contenedor DIAN / Documento Adjunto) ───────────────────
//
// After removeNSPrefix, the AttachedDocument structure exposes:
//
//   AttachedDocument.ParentDocumentID                       → F33165638 (invoice number, top-level)
//   AttachedDocument.IssueDate                              → envelope date (NOT the invoice date)
//   AttachedDocument.SenderParty.PartyTaxScheme.{RegistrationName,CompanyID}
//   AttachedDocument.ReceiverParty.PartyTaxScheme.{RegistrationName,CompanyID}
//   AttachedDocument.Attachment.ExternalReference.Description → raw Invoice XML (CDATA)
//   AttachedDocument.ParentDocumentLineReference.DocumentReference.ID          → invoice number
//   AttachedDocument.ParentDocumentLineReference.DocumentReference.IssueDate   → invoice date ✓
//   AttachedDocument.ParentDocumentLineReference.DocumentReference.UUID        → CUFE ✓
//   AttachedDocument.ParentDocumentLineReference.DocumentReference.DocumentType → "ApplicationResponse"

const AD = "AttachedDocument";

// Número de Factura — top-level ParentDocumentID is most direct
const AD_INVOICE_NUMBER = [
  `${AD}.ParentDocumentID`,
  `${AD}.ParentDocumentLineReference.DocumentReference.ID`,
];

// Fecha de Emisión — use DocumentReference.IssueDate (actual invoice date),
// NOT AttachedDocument.IssueDate which is the envelope/container creation date
const AD_ISSUE_DATE = [
  `${AD}.ParentDocumentLineReference.DocumentReference.IssueDate`,
];

// CUFE from DocumentReference.UUID
const AD_CUFE = [
  `${AD}.ParentDocumentLineReference.DocumentReference.UUID`,
];

// DocumentType for referencedDocumentInfo
const AD_DOC_TYPE = [
  `${AD}.ParentDocumentLineReference.DocumentReference.DocumentType`,
  `${AD}.DocumentType`,
];

// Razón Social del Emisor — SenderParty (not AccountingSupplierParty)
const AD_ISSUER_NAME = [
  `${AD}.SenderParty.PartyTaxScheme.RegistrationName`,
  `${AD}.SenderParty.PartyLegalEntity.RegistrationName`,
  `${AD}.SenderParty.PartyName.Name`,
];

// NIT del Emisor
const AD_ISSUER_ID = [
  `${AD}.SenderParty.PartyTaxScheme.CompanyID`,
  `${AD}.SenderParty.PartyLegalEntity.CompanyID`,
];

// Razón Social del Adquiriente — ReceiverParty
const AD_CUSTOMER_NAME = [
  `${AD}.ReceiverParty.PartyTaxScheme.RegistrationName`,
  `${AD}.ReceiverParty.PartyLegalEntity.RegistrationName`,
  `${AD}.ReceiverParty.PartyName.Name`,
];

// NIT del Adquiriente
const AD_CUSTOMER_ID = [
  `${AD}.ReceiverParty.PartyTaxScheme.CompanyID`,
  `${AD}.ReceiverParty.PartyLegalEntity.CompanyID`,
];

// Embedded Invoice XML — Attachment.ExternalReference.Description (CDATA, raw XML)
const AD_EMBEDDED_DESC = `${AD}.Attachment.ExternalReference.Description`;
const AD_EMBEDDED_MIME = `${AD}.Attachment.ExternalReference.MimeCode`;

// ── CFDI (Mexican SAT — out-of-scope for CO v1, preserved for future) ─────────

const CFDI_INVOICE_NUMBER = ["Comprobante.@_Folio", "Comprobante.@_NoCertificado"];
const CFDI_ISSUE_DATE     = ["Comprobante.@_Fecha"];
const CFDI_CURRENCY       = ["Comprobante.@_Moneda"];
const CFDI_ISSUER_NAME    = ["Comprobante.Emisor.@_Nombre", "Comprobante.Emisor.@_nombre"];
const CFDI_ISSUER_ID      = ["Comprobante.Emisor.@_Rfc",   "Comprobante.Emisor.@_rfc"];
const CFDI_CUSTOMER_NAME  = ["Comprobante.Receptor.@_Nombre", "Comprobante.Receptor.@_nombre"];
const CFDI_CUSTOMER_ID    = ["Comprobante.Receptor.@_Rfc",    "Comprobante.Receptor.@_rfc"];
const CFDI_TOTAL          = ["Comprobante.@_Total"];
const CFDI_SUBTOTAL       = ["Comprobante.@_SubTotal"];
const CFDI_TAX            = [
  "Comprobante.Impuestos.@_TotalImpuestosTrasladados",
  "Comprobante.Impuestos.@_totalImpuestosTrasladados",
];

// ═════════════════════════════════════════════════════════════════════════════
// FIELD EXTRACTION — CO_INVOICE / CO_CREDIT_NOTE / CO_DEBIT_NOTE / CFDI
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Extracts all 12 v1 fields from a direct UBL Invoice / CreditNote / DebitNote
 * or CFDI document. Also handles UNKNOWN format by trying both path sets.
 *
 * Returns extracted fields, matched nodes (for debug), notes, and a list of
 * every path that was attempted (searchedPaths).
 */
function extractUblFields(
  parsed:  unknown,
  format:  XmlFormat,
): { fields: XmlInvoiceFields; matched: XmlMatchedNode[]; notes: string[]; searchedPaths: string[] } {
  const matched:  XmlMatchedNode[] = [];
  const notes:    string[]         = [];
  const searched: string[]         = [];

  const isUbl     = format === "CO_INVOICE" || format === "CO_CREDIT_NOTE" || format === "CO_DEBIT_NOTE";
  const isCfdi    = format === "CFDI";
  const isUnknown = format === "UNKNOWN";

  /** Selects UBL or CFDI path list (or both for UNKNOWN) and records them. */
  function ps(ublList: string[], cfdiList: string[] = []): string[] {
    const paths = isUbl ? ublList : isCfdi ? cfdiList : isUnknown ? [...ublList, ...cfdiList] : ublList;
    searched.push(...paths);
    return paths;
  }

  function str(label: string, paths: string[]): string | null {
    const { value, path } = pickString(parsed, paths);
    if (value && path) matched.push({ field: label, nodePath: path, rawValue: value });
    return value;
  }

  function num(label: string, paths: string[]): number | null {
    const { value, path } = pickNumber(parsed, paths);
    if (value !== null && path) matched.push({ field: label, nodePath: path, rawValue: String(value) });
    return value;
  }

  const invoiceNumberRaw = str("invoiceNumber", ps(CO_UBL_INVOICE_NUMBER, CFDI_INVOICE_NUMBER));
  const currencyRaw      = str("currency",      ps(CO_UBL_CURRENCY,       CFDI_CURRENCY));
  const issuerNameRaw    = str("issuerName",    ps(CO_UBL_ISSUER_NAME,    CFDI_ISSUER_NAME));
  const issuerIdRaw      = str("issuerId",      ps(CO_UBL_ISSUER_ID,      CFDI_ISSUER_ID));
  const customerNameRaw  = str("customerName",  ps(CO_UBL_CUSTOMER_NAME,  CFDI_CUSTOMER_NAME));
  const customerIdRaw    = str("customerId",    ps(CO_UBL_CUSTOMER_ID,    CFDI_CUSTOMER_ID));

  const dateRaw    = str("documentDate", ps(CO_UBL_ISSUE_DATE, CFDI_ISSUE_DATE));
  const dueDateRaw = str("dueDate",      ps(CO_UBL_DUE_DATE,  []));   // CFDI has no standard due-date field
  const documentDate = parseXmlDate(dateRaw,    "documentDate", notes);
  const dueDate      = parseXmlDate(dueDateRaw, "dueDate",      notes);

  const cufePathList = ps(CO_UBL_CUFE, []);
  const cufeRaw      = str("cufe", cufePathList);
  const cufe         = normaliseCufe(cufeRaw, notes);

  const totalAmount = num("totalAmount", ps(CO_UBL_TOTAL,   CFDI_TOTAL));
  const subtotal    = num("subtotal",    ps(CO_UBL_SUBTOTAL, CFDI_SUBTOTAL));
  const taxAmount   = num("taxAmount",   ps(CO_UBL_TAX,      CFDI_TAX));

  const fields: XmlInvoiceFields = {
    issuerName:    issuerNameRaw,
    issuerId:      normaliseId(issuerIdRaw),
    customerName:  customerNameRaw,
    customerId:    normaliseId(customerIdRaw),
    invoiceNumber: invoiceNumberRaw,
    documentDate,
    dueDate,
    currency:      currencyRaw ? currencyRaw.toUpperCase() : null,
    subtotal,
    taxAmount,
    totalAmount,
    cufe,
  };

  return { fields, matched, notes, searchedPaths: searched };
}

// ═════════════════════════════════════════════════════════════════════════════
// ATTACHED DOCUMENT EXTRACTION — CO_ATTACHED_DOCUMENT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Tries to extract and parse the embedded Invoice XML from the CDATA block
 * inside AttachedDocument.Attachment.ExternalReference.Description.
 *
 * Real DIAN AttachedDocuments embed the full Invoice XML as raw XML in a
 * CDATA section (MimeCode="text/xml"). Some older implementations base64-
 * encode it — we try raw first, then base64.
 *
 * Returns the fields extracted from the embedded invoice and a `found` flag.
 * Currency, amounts (subtotal, taxAmount, totalAmount), and dueDate are only
 * available from this embedded payload — they are not in the envelope itself.
 */
async function tryExtractEmbeddedInvoice(
  parsed:  Record<string, unknown>,
  notes:   string[],
): Promise<{ fields: Partial<XmlInvoiceFields>; found: boolean; embeddedFormat: XmlFormat | null }> {
  // Only attempt if MimeCode indicates XML
  const mimeCode = nodeToString(getByPath(parsed, AD_EMBEDDED_MIME));
  if (mimeCode && !mimeCode.toLowerCase().includes("xml")) {
    notes.push(`embedded: MimeCode="${mimeCode}" — not XML, skipping`);
    return { fields: {}, found: false, embeddedFormat: null };
  }

  const descRaw = nodeToString(getByPath(parsed, AD_EMBEDDED_DESC));
  if (!descRaw) {
    notes.push("embedded: Attachment.ExternalReference.Description is empty or absent");
    return { fields: {}, found: false, embeddedFormat: null };
  }

  // Strategy: try raw XML first (CDATA in most DIAN implementations),
  // then base64 decode as a fallback for older software
  let xmlCandidate: string | null = null;

  const trimmed = descRaw.trimStart();
  if (trimmed.startsWith("<") || trimmed.startsWith("<?")) {
    xmlCandidate = descRaw;
    notes.push("embedded: Description appears to be raw XML (CDATA)");
  } else {
    try {
      const decoded = Buffer.from(descRaw.trim(), "base64").toString("utf-8");
      if (decoded.trimStart().startsWith("<")) {
        xmlCandidate = decoded;
        notes.push("embedded: Description decoded from base64 → XML");
      } else {
        notes.push("embedded: Description is not raw XML or base64-encoded XML — skipping");
        return { fields: {}, found: false, embeddedFormat: null };
      }
    } catch {
      notes.push("embedded: base64 decode failed — skipping");
      return { fields: {}, found: false, embeddedFormat: null };
    }
  }

  // Parse the embedded XML
  let embeddedParsed: Record<string, unknown>;
  try {
    const { XMLParser } = await import("fast-xml-parser");
    embeddedParsed = new XMLParser(PARSER_OPTIONS).parse(xmlCandidate) as Record<string, unknown>;
  } catch {
    notes.push("embedded: fast-xml-parser failed to parse embedded XML");
    return { fields: {}, found: true, embeddedFormat: null };
  }

  const { format: embeddedFormat, root: embeddedRoot } = detectFormat(embeddedParsed);
  notes.push(`embedded: parsed — root="${embeddedRoot}", format="${embeddedFormat}"`);

  if (embeddedFormat === "UNKNOWN" || embeddedFormat === "CO_ATTACHED_DOCUMENT") {
    notes.push("embedded: unrecognised format in embedded payload — no fields extracted");
    return { fields: {}, found: true, embeddedFormat };
  }

  // Run the UBL/CFDI extractor on the embedded Invoice
  const { fields, notes: embeddedNotes, searchedPaths } = extractUblFields(embeddedParsed, embeddedFormat);
  notes.push(...embeddedNotes.map((n) => `embedded: ${n}`));
  const extracted = Object.values(fields).filter((v) => v !== null).length;
  notes.push(`embedded: extracted ${extracted}/12 fields (searched ${searchedPaths.length} paths)`);

  return { fields, found: true, embeddedFormat };
}

/**
 * Extracts all available fields from a CO_ATTACHED_DOCUMENT (Contenedor DIAN).
 *
 * Field availability:
 *   Directly in AttachedDocument envelope:
 *     ✓ issuerName    (SenderParty.PartyTaxScheme.RegistrationName)
 *     ✓ issuerId      (SenderParty.PartyTaxScheme.CompanyID)
 *     ✓ customerName  (ReceiverParty.PartyTaxScheme.RegistrationName)
 *     ✓ customerId    (ReceiverParty.PartyTaxScheme.CompanyID)
 *     ✓ invoiceNumber (ParentDocumentID)
 *     ✓ documentDate  (ParentDocumentLineReference.DocumentReference.IssueDate — invoice date)
 *     ✓ cufe          (ParentDocumentLineReference.DocumentReference.UUID)
 *
 *   Only in the embedded Invoice XML (Attachment.ExternalReference.Description):
 *     ✓ currency      (Invoice.DocumentCurrencyCode)
 *     ✓ subtotal      (Invoice.LegalMonetaryTotal.LineExtensionAmount)
 *     ✓ taxAmount     (Invoice.TaxTotal.TaxAmount)
 *     ✓ totalAmount   (Invoice.LegalMonetaryTotal.PayableAmount)
 *     ✓ dueDate       (Invoice.PaymentMeans.PaymentDueDate)
 *
 * NOTE: AttachedDocument.IssueDate is the envelope creation date (may be 1-3 days
 * after the invoice), NOT the invoice date. Always use DocumentReference.IssueDate.
 */
async function extractAttachedDocument(
  parsed: Record<string, unknown>,
  notes:  string[],
): Promise<{
  fields:                XmlInvoiceFields;
  matched:               XmlMatchedNode[];
  searchedPaths:         string[];
  embeddedPayloadDetected: boolean;
  embeddedFormat:        XmlFormat | null;
  referencedDocumentInfo: XmlExtractResult["referencedDocumentInfo"];
}> {
  const matched:  XmlMatchedNode[] = [];
  const searched: string[]         = [];

  function str(label: string, paths: string[]): string | null {
    searched.push(...paths);
    const { value, path } = pickString(parsed, paths);
    if (value && path) matched.push({ field: label, nodePath: path, rawValue: value });
    return value;
  }

  // ── Direct fields from AttachedDocument envelope ──────────────────────────

  const issuerNameRaw   = str("issuerName",    AD_ISSUER_NAME);
  const issuerIdRaw     = str("issuerId",      AD_ISSUER_ID);
  const customerNameRaw = str("customerName",  AD_CUSTOMER_NAME);
  const customerIdRaw   = str("customerId",    AD_CUSTOMER_ID);
  const invoiceNumberRaw = str("invoiceNumber", AD_INVOICE_NUMBER);

  // Use DocumentReference.IssueDate as the invoice date (not envelope date)
  const dateRaw     = str("documentDate", AD_ISSUE_DATE);
  const documentDate = parseXmlDate(dateRaw, "documentDate", notes);

  // CUFE
  const cufeRaw = str("cufe", AD_CUFE);
  const cufe    = normaliseCufe(cufeRaw, notes);

  // DocumentType for referencedDocumentInfo (informational only)
  const docTypeRaw = str("documentTypeCode", AD_DOC_TYPE);

  // ── Embedded Invoice XML ──────────────────────────────────────────────────
  const {
    fields: embeddedFields,
    found:  embeddedPayloadDetected,
    embeddedFormat,
  } = await tryExtractEmbeddedInvoice(parsed, notes);

  // ── Merge ─────────────────────────────────────────────────────────────────
  // Envelope provides: issuerName, issuerId, customerName, customerId,
  //                    invoiceNumber, documentDate, cufe
  // Embedded Invoice provides: currency, subtotal, taxAmount, totalAmount, dueDate
  // CUFE is authoritative from the envelope; embedded may confirm it.

  const fields: XmlInvoiceFields = {
    issuerName:    issuerNameRaw,
    issuerId:      normaliseId(issuerIdRaw),
    customerName:  customerNameRaw,
    customerId:    normaliseId(customerIdRaw),
    invoiceNumber: invoiceNumberRaw,
    documentDate,
    dueDate:       embeddedFields.dueDate       ?? null,
    currency:      embeddedFields.currency      ?? null,
    subtotal:      embeddedFields.subtotal       ?? null,
    taxAmount:     embeddedFields.taxAmount      ?? null,
    totalAmount:   embeddedFields.totalAmount    ?? null,
    cufe:          cufe ?? embeddedFields.cufe   ?? null,
  };

  const referencedDocumentInfo: XmlExtractResult["referencedDocumentInfo"] = {
    invoiceNumber:    invoiceNumberRaw,
    documentTypeCode: docTypeRaw,
    cufe,
    issueDate:        dateRaw,
  };

  return { fields, matched, searchedPaths: searched, embeddedPayloadDetected, embeddedFormat, referencedDocumentInfo };
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═════════════════════════════════════════════════════════════════════════════

const EMPTY_FIELDS: XmlInvoiceFields = {
  issuerName: null, issuerId: null, customerName: null, customerId: null,
  invoiceNumber: null, documentDate: null, dueDate: null, currency: null,
  subtotal: null, taxAmount: null, totalAmount: null, cufe: null,
};

/**
 * XML Colombia v1 — Electronic Invoice Extractor.
 *
 * Extracts all 12 financial fields from Colombian DIAN electronic invoice XML.
 * Supports AttachedDocument (Contenedor), Invoice, CreditNote, and DebitNote.
 *
 * Extraction strategy:
 *   CO_ATTACHED_DOCUMENT — extract envelope fields directly + decode and parse
 *                          the embedded Invoice XML from
 *                          Attachment.ExternalReference.Description (CDATA).
 *   CO_INVOICE / CO_CREDIT_NOTE / CO_DEBIT_NOTE — walk UBL 2.1 field paths.
 *   CFDI — walk Mexican CFDI attribute paths (best-effort).
 *   UNKNOWN — try both UBL and CFDI path sets.
 *
 * Always resolves, never throws.
 */
export async function extractXmlInvoice(
  url:      string,
  mimeType: string | null,
): Promise<XmlExtractResult> {
  function fail(
    reason: XmlExtractResult["errorReason"],
    notes:  string[] = [],
  ): XmlExtractResult {
    return {
      success: false, fields: EMPTY_FIELDS, parserUsed: null,
      xmlFormat: null, matchedNodes: [], debugNotes: notes,
      errorReason: reason,
    };
  }

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!url || typeof url !== "string") return fail("INVALID_URL");

  const isXml =
    mimeType === "text/xml" ||
    mimeType === "application/xml" ||
    (!mimeType && url.toLowerCase().includes(".xml"));

  if (!isXml) {
    return fail("NOT_XML", [`mimeType="${mimeType}", url="${url.slice(-40)}" — not recognised as XML`]);
  }

  // ── Resolve source ────────────────────────────────────────────────────────
  const isRemote = url.startsWith("http://") || url.startsWith("https://");
  if (!isRemote && !url.startsWith("/") && !url.match(/^[a-z]:/i)) {
    return fail("INVALID_URL", [`url "${url.slice(-50)}" is not absolute`]);
  }

  const resolvedPath = isRemote
    ? url
    : join(process.cwd(), "public", url.startsWith("/") ? url.slice(1) : url);

  // ── Load content ──────────────────────────────────────────────────────────
  let xmlString: string;

  if (!isRemote) {
    try { await access(resolvedPath); } catch { return fail("FILE_NOT_FOUND"); }
    try { xmlString = await readFile(resolvedPath, "utf-8"); } catch { return fail("FILE_NOT_FOUND"); }
  } else {
    try {
      const res = await fetch(url);
      if (!res.ok) return fail("FETCH_FAILED", [`HTTP ${res.status}`]);
      xmlString = await res.text();
    } catch (e) {
      return fail("FETCH_FAILED", [String(e)]);
    }
  }

  if (!xmlString.trimStart().startsWith("<")) {
    return fail("NOT_XML", ["content does not start with '<'"]);
  }

  // ── Parse outer XML ───────────────────────────────────────────────────────
  let parsed: Record<string, unknown>;
  try {
    const { XMLParser } = await import("fast-xml-parser");
    parsed = new XMLParser(PARSER_OPTIONS).parse(xmlString) as Record<string, unknown>;
  } catch (e) {
    return fail("PARSE_FAILED", [`fast-xml-parser threw: ${String(e)}`]);
  }

  // ── Detect Colombian document family ──────────────────────────────────────
  const { format, root, colombiaXmlType } = detectFormat(parsed);
  const notes: string[] = [
    `format=${format}`,
    `root=${root}`,
    `colombiaXmlType=${colombiaXmlType}`,
    `rootKeys=${Object.keys(parsed).join(",")}`,
  ];

  // ── Extract fields ────────────────────────────────────────────────────────
  let fields:                XmlInvoiceFields;
  let matched:               XmlMatchedNode[];
  let fieldNotes:            string[];
  let searchedPaths:         string[];
  let embeddedPayloadDetected: boolean | undefined;
  let referencedDocumentInfo: XmlExtractResult["referencedDocumentInfo"] | undefined;

  if (format === "CO_ATTACHED_DOCUMENT") {
    const result = await extractAttachedDocument(parsed, notes);
    fields                 = result.fields;
    matched                = result.matched;
    fieldNotes             = [];
    searchedPaths          = result.searchedPaths;
    embeddedPayloadDetected = result.embeddedPayloadDetected;
    referencedDocumentInfo  = result.referencedDocumentInfo;
  } else {
    const result = extractUblFields(parsed, format);
    fields        = result.fields;
    matched       = result.matched;
    fieldNotes    = result.notes;
    searchedPaths = result.searchedPaths;
  }

  notes.push(...fieldNotes);

  const anyExtracted = Object.values(fields).some((v) => v !== null);
  if (!anyExtracted) {
    notes.push(`no fields matched any known path (searched ${searchedPaths.length} paths)`);
    return {
      success: false, fields, parserUsed: "fast-xml-parser",
      xmlFormat: format, matchedNodes: matched, debugNotes: notes,
      errorReason: "NO_FIELDS_EXTRACTED",
      detectedRoot: root, colombiaXmlType, searchedPaths,
      ...(embeddedPayloadDetected !== undefined ? { embeddedPayloadDetected } : {}),
      ...(referencedDocumentInfo  !== undefined ? { referencedDocumentInfo  } : {}),
    };
  }

  return {
    success: true, fields, parserUsed: "fast-xml-parser",
    xmlFormat: format, matchedNodes: matched, debugNotes: notes,
    detectedRoot: root, colombiaXmlType, searchedPaths,
    ...(embeddedPayloadDetected !== undefined ? { embeddedPayloadDetected } : {}),
    ...(referencedDocumentInfo  !== undefined ? { referencedDocumentInfo  } : {}),
  };
}
