import { RunStatus, EventStatus, AlertSeverity, AlertStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FINANCIAL_DOC_TYPES } from "./queries";
import { upsertDocumentValidationAlert } from "./document-alerts";
import { extractPdfText, extractPdfItems, type PdfTextItem } from "@/lib/documents/pdf-extract";
import { extractXmlInvoice, type XmlExtractResult, type XmlInvoiceFields } from "@/lib/documents/xml-extract";

// ── Constants ─────────────────────────────────────────────────────────────────

const BATCH_LIMIT = 50;

const RUN_TYPE   = "finance.process_document";
const EVENT_TYPE = "finance.document_processed";
const ALERT_TYPE = "finance.document_processing_failed";

// ── Public types ──────────────────────────────────────────────────────────────

export interface ProcessDocumentResult {
  runId: string;
  documentId: string;
  /** Fields that were extracted or confirmed in this run. */
  extracted: {
    issuerName:   string | null;
    issuerId:     string | null;
    receiverName: string | null;
    receiverId:   string | null;
    amount:       number | null;
    currency:     string | null;
    documentDate: string | null; // ISO date string
  };
  /** Input sources that contributed at least one field. */
  sources: string[];
  /** Human-readable extraction summary for debugging. */
  summary: string;
}

// ── Internal extraction types ─────────────────────────────────────────────────

type SourceName = "metadata" | "xml" | "pdf" | "description" | "title" | "filename";

interface FieldResult<T> {
  value: T | null;
  source: SourceName | null;
}

interface ExtractedFields {
  issuerName:   FieldResult<string>;
  issuerId:     FieldResult<string>;
  receiverName: FieldResult<string>;
  receiverId:   FieldResult<string>;
  amount:       FieldResult<number>;
  currency:     FieldResult<string>;
  documentDate: FieldResult<Date>;
  /** Debug candidates from the line-aware amount parser (PDF source only). */
  amountCandidates:  AmountCandidate[];
  /** Debug candidates from the line-aware issuer parser (PDF source only). */
  issuerCandidates:  IssuerCandidate[];
  /** Debug candidates from the line-aware date parser (PDF source only). */
  dateCandidates:    DateCandidate[];
  /** Whether the PDF was detected as a FedEx/courier-style invoice. */
  isFedExDocument:   boolean;
  /** Canonical label → first line index; from the normalization pre-pass. */
  normalizedLabels:  Record<string, number>;
  /** Populated only when isFedExDocument is true — block-parser diagnostics. */
  fedexDebug:        FedExDebugInfo | null;
  /** Raw XML extraction result — null when no XML was present. */
  xmlExtraction:     XmlExtractResult | null;
  /** Document family classification based on text signals. */
  documentClassification: DocumentClassification;
  /** Populated only for ELECTRONIC_INVOICE_STANDARD documents parsed from PDF. */
  colombianInvoice:  ColombianInvoiceResult | null;
  /** Zone detection and per-field debug for ELECTRONIC_INVOICE_STANDARD. */
  invoiceZoneDebug:  InvoiceZoneDebug | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// AMOUNT PARSING
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Normalises a raw numeric string into a JavaScript number.
 *
 * Handles all common LATAM/international formats:
 *   "1.234.567,89"  → 1234567.89  (European: dots=thousands, comma=decimal)
 *   "1,234,567.89"  → 1234567.89  (US:       commas=thousands, dot=decimal)
 *   "1234567,89"    → 1234567.89  (LATAM comma-as-decimal, no thousands)
 *   "1.234.567"     → 1234567     (integer with dot thousands)
 *   "1.500"         → 1500        (LATAM integer – dot treated as thousands)
 *   "250000"        → 250000      (plain integer)
 *   "1,250.00"      → 1250        (US decimal)
 */
function normalizeAmount(raw: string): number | null {
  // Strip currency symbols, whitespace, non-numeric chars except separators
  const s = raw.replace(/[^\d.,]/g, "").trim();
  if (!s || !/\d/.test(s)) return null;

  const hasDot   = s.includes(".");
  const hasComma = s.includes(",");

  let normalized: string;

  if (hasDot && hasComma) {
    // Both present → the LAST separator is the decimal separator
    const lastDot   = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastComma > lastDot) {
      // "1.234.567,89" — European format
      normalized = s.replace(/\./g, "").replace(",", ".");
    } else {
      // "1,234,567.89" — US format
      normalized = s.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    // Comma only
    // If exactly 2 digits follow the last comma → decimal: "1234567,89"
    // Otherwise → US-style thousands: "1,234,567" → 1234567
    if (/,\d{1,2}$/.test(s)) {
      normalized = s.replace(",", ".");
    } else {
      normalized = s.replace(/,/g, "");
    }
  } else if (hasDot && !hasComma) {
    const parts    = s.split(".");
    const dotCount = parts.length - 1;
    if (dotCount > 1) {
      // Multiple dots → all are thousand separators: "1.234.567"
      normalized = s.replace(/\./g, "");
    } else {
      // Single dot → ambiguous: "1.500" vs "1234.56"
      // LATAM heuristic: if the fractional part is exactly 3 digits, it's a
      // thousand separator ("1.500" = 1500). Otherwise it's a decimal dot.
      const frac = parts[1] ?? "";
      normalized = frac.length === 3 ? s.replace(".", "") : s;
    }
  } else {
    normalized = s;
  }

  const n = parseFloat(normalized);
  return isFinite(n) && n > 0 ? n : null;
}

/**
 * Amount label patterns ordered from most specific to least specific.
 * Each regex captures the raw numeric string in group 1.
 * NOTE: IVA is included last — it's a tax partial, only used as a last resort.
 *
 * Colombian priority: TOTAL NETO > TOTAL OPERACION > TOTAL A PAGAR > generic TOTAL
 */
const AMOUNT_PATTERNS: RegExp[] = [
  // Highest priority: final payable amount
  /(?:total\s+a\s+pagar|total\s+pagar)\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  /(?:valor\s+total|total\s+valor)\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  /(?:total\s+factura|total\s+invoice)\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  /(?:total\s+neto)\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  // Colombian electronic invoice: TOTAL OPERACION is the tax-inclusive grand total
  /(?:total\s+operaci[oó]n)\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  /(?:monto\s+total)\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  /\btotal\b\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  /(?:importe\s+total)\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  /\bimporte\b\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  /\bmonto\b\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  /(?:valor\s+neto)\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  /\bvalor\b\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  /\bamount\b\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  /\bsubtotal\b\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  /\bprecio\b\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  /\bprice\b\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  // Currency-code prefix: "COP 250000", "USD 1,250.00"
  /\b(?:USD|COP|EUR|MXN|PEN|CLP|ARS|BRL|GBP|CAD)\s+([\d.,]+)/i,
  // Standalone $ prefix
  /\$\s*([\d.,]+)/,
  // IVA last — partial tax, only useful if nothing else matched
  /\bIVA\b\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
];

function parseAmount(text: string): number | null {
  for (const re of AMOUNT_PATTERNS) {
    const m = re.exec(text);
    if (m) {
      const n = normalizeAmount(m[1]);
      if (n !== null) return n;
    }
  }
  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// CURRENCY DETECTION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Structured result from currency detection. Stored verbatim in extractedJson
 * so operators can see exactly why a currency was selected.
 */
interface CurrencyDetection {
  selectedCurrency:       string | null;
  /** Every signal found, in discovery order. Multiple entries for the same code are normal. */
  currencyCandidates:     Array<{ code: string; signal: string }>;
  /** "CO" when Colombian invoice signals (NIT, DIAN, factura electrónica, etc.) were found. */
  inferredCountryContext: "CO" | null;
  detectionMethod:        "explicit_code" | "verbal" | "context_inference" | "dollar_sign" | "none";
}

/**
 * Signals that strongly indicate the document originates in Colombia.
 * A single match is enough to set inferredCountryContext = "CO".
 */
const CO_CONTEXT_SIGNALS: RegExp[] = [
  /\bNIT\b/i,
  /\bDIAN\b/i,
  /\bfactura\s+electr[oó]nica\b/i,
  /\bresponsable\s+de\s+IVA\b/i,
  /\bIVA\s+(?:al\s+)?19\b/i,
  /\bCUFE\b/i,
  /\b(?:bogot[aá]|medell[ií]n|cali|barranquilla|cartagena|bucaramanga|pereira|manizales|c[uú]cuta|ibagu[eé])\b/i,
  /\b(?:antioquia|cundinamarca|valle\s+del\s+cauca|atl[aá]ntico|santander)\b/i,
];

/** Foreign (non-COP) currency patterns. Presence of any of these prevents bare-peso inference. */
const FOREIGN_CURRENCY_PATTERNS: Array<{ re: RegExp; code: string; signal: string }> = [
  { re: /\bUSD\b/i,                                                   code: "USD", signal: "code:USD"               },
  { re: /\bUS\$/,                                                      code: "USD", signal: "symbol:US$"             },
  { re: /\bd[oó]lares?\s*(?:americanos?|estadounidenses?)?\b/i,        code: "USD", signal: "verbal:dolares"         },
  { re: /\bEUR\b/i,                                                    code: "EUR", signal: "code:EUR"               },
  { re: /\beuros?\b/i,                                                 code: "EUR", signal: "verbal:euros"           },
  { re: /\bGBP\b/i,                                                    code: "GBP", signal: "code:GBP"               },
  { re: /\blibras?\s+esterlinas?\b/i,                                  code: "GBP", signal: "verbal:libras"          },
  { re: /\bMXN\b/i,                                                    code: "MXN", signal: "code:MXN"               },
  { re: /\bpesos?\s+mexicanos?\b/i,                                    code: "MXN", signal: "verbal:pesos_mexicanos" },
  { re: /\bBRL\b|\breais?\b/i,                                         code: "BRL", signal: "code:BRL"               },
  { re: /\bPEN\b/i,                                                    code: "PEN", signal: "code:PEN"               },
  { re: /\bCLP\b/i,                                                    code: "CLP", signal: "code:CLP"               },
  { re: /\bARS\b/i,                                                    code: "ARS", signal: "code:ARS"               },
  { re: /\bCAD\b/i,                                                    code: "CAD", signal: "code:CAD"               },
];

/**
 * Detects the currency of a financial document with full diagnostic metadata.
 *
 * Detection order:
 *  1. Explicit COP signals  → "COP" / "pesos colombianos" / "pesos" (with no competing MXN)
 *  2. Foreign currency signals → ISO codes, verbal ("dólares", "euros"), "US$"
 *  3. Conflict resolution   → COP wins when combined with Colombian context
 *  4. Context inference     → Colombian signals present + no foreign currency → COP
 *  5. Dollar-sign inference → "$" present in Colombian context → COP
 *
 * Key rule: "$" defaults to COP in a Colombian document. It is NOT a USD signal.
 * Only "US$", "USD", or "dólares" should infer USD.
 */
function detectCurrency(text: string): CurrencyDetection {
  const candidates: Array<{ code: string; signal: string }> = [];

  // ── 1. Explicit COP ──────────────────────────────────────────────────────
  if (/\bCOP\b/i.test(text)) {
    candidates.push({ code: "COP", signal: "code:COP" });
  }
  if (/\bpesos?\s+colombianos?\b/i.test(text)) {
    candidates.push({ code: "COP", signal: "verbal:pesos_colombianos" });
  }
  // "pesos" alone → COP candidate; only valid when no competing MXN signal
  if (
    /\bpesos?\b/i.test(text) &&
    !/\bpesos?\s+mexicanos?\b/i.test(text) &&
    !/\bMXN\b/i.test(text)
  ) {
    candidates.push({ code: "COP", signal: "verbal:pesos" });
  }

  // ── 2. Foreign currencies ─────────────────────────────────────────────────
  for (const { re, code, signal } of FOREIGN_CURRENCY_PATTERNS) {
    if (re.test(text)) candidates.push({ code, signal });
  }

  // ── 3. Colombian context ──────────────────────────────────────────────────
  const hasColombianContext = CO_CONTEXT_SIGNALS.some((re) => re.test(text));
  const inferredCO: "CO" | null = hasColombianContext ? "CO" : null;

  // ── 4. Resolve ───────────────────────────────────────────────────────────
  const copCandidates    = candidates.filter((c) => c.code === "COP");
  const foreignCandidates = candidates.filter((c) => c.code !== "COP");
  const uniqueForeign    = [...new Set(foreignCandidates.map((c) => c.code))];

  // Explicit COP only
  if (copCandidates.length > 0 && uniqueForeign.length === 0) {
    const method = copCandidates[0].signal.startsWith("code") ? "explicit_code" : "verbal";
    return { selectedCurrency: "COP", currencyCandidates: candidates, inferredCountryContext: inferredCO, detectionMethod: method };
  }

  // Single foreign currency, no COP signal
  if (copCandidates.length === 0 && uniqueForeign.length === 1) {
    return { selectedCurrency: uniqueForeign[0], currencyCandidates: candidates, inferredCountryContext: inferredCO, detectionMethod: "explicit_code" };
  }

  // Both COP and foreign → trust COP if it was explicit (code or "pesos colombianos")
  if (copCandidates.length > 0 && uniqueForeign.length > 0) {
    const hasCopExplicit = copCandidates.some(
      (c) => c.signal === "code:COP" || c.signal === "verbal:pesos_colombianos",
    );
    if (hasCopExplicit) {
      return { selectedCurrency: "COP", currencyCandidates: candidates, inferredCountryContext: inferredCO, detectionMethod: "explicit_code" };
    }
    // Bare "pesos" lost to an explicit foreign code
    return { selectedCurrency: uniqueForeign[0], currencyCandidates: candidates, inferredCountryContext: inferredCO, detectionMethod: "explicit_code" };
  }

  // Multiple foreign, no COP → take first foreign found
  if (uniqueForeign.length > 1) {
    return { selectedCurrency: uniqueForeign[0], currencyCandidates: candidates, inferredCountryContext: inferredCO, detectionMethod: "explicit_code" };
  }

  // No currency signal at all → infer from Colombian context
  if (hasColombianContext) {
    const hasDollarSign  = /\$/.test(text);
    const detectionMethod = hasDollarSign ? "dollar_sign" : "context_inference";
    return { selectedCurrency: "COP", currencyCandidates: candidates, inferredCountryContext: "CO", detectionMethod };
  }

  return { selectedCurrency: null, currencyCandidates: candidates, inferredCountryContext: null, detectionMethod: "none" };
}

/** Thin wrapper — keeps existing call sites unchanged. */
function parseCurrency(text: string): string | null {
  return detectCurrency(text).selectedCurrency;
}

// ═════════════════════════════════════════════════════════════════════════════
// DATE PARSING
// ═════════════════════════════════════════════════════════════════════════════

const MONTHS_ES: Record<string, number> = {
  enero: 0,  febrero: 1,  marzo: 2,     abril: 3,
  mayo: 4,   junio: 5,    julio: 6,     agosto: 7,
  septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

const MONTHS_EN: Record<string, number> = {
  january: 0,  february: 1, march: 2,    april: 3,
  may: 4,      june: 5,     july: 6,     august: 7,
  september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6,
  aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** ISO date: 2024-01-15 */
const DATE_ISO_RE = /\b(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))\b/;
/** DD/MM/YYYY or DD-MM-YYYY */
const DATE_DMY_RE = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/;
/** Textual Spanish: "15 de enero de 2024" or "15 enero 2024" */
const DATE_ES_LONG_RE  = /(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})/i;
const DATE_ES_SHORT_RE = /(\d{1,2})\s+([a-záéíóúñ]+)\s+(\d{4})/i;
/** Textual English: "January 15, 2024" or "15 January 2024" */
const DATE_EN_MDY_RE = /([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/;
const DATE_EN_DMY_RE = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/;

/**
 * Date label patterns for full-text (non-line-aware) parsing, ordered from most
 * specific to least specific.  Captures the raw date string in group 1.
 *
 * Priority: Expedición > Factura > Generación > Emisión > Validación > generic
 * "Fecha Vencimiento" is intentionally absent here — it is a due/expiry date, not
 * an issue date, and appears only as a last resort in the line-aware parser.
 */
const DATE_LABEL_PATTERNS: RegExp[] = [
  // Highest priority: explicit Colombian DIAN issue-date labels
  /(?:fecha\s+de\s+expedici[oó]n)\s*[:\-]?\s*([\d\/\-]+)/i,
  /(?:fecha\s+factura|fecha\s+de\s+factura)\s*[:\-]?\s*([\d\/\-]+)/i,
  /(?:fecha\s+(?:de\s+)?generaci[oó]n)\s*[:\-]?\s*([\d\/\-]+)/i,
  /(?:fecha\s+de\s+emisi[oó]n|fecha\s+emisi[oó]n)\s*[:\-]?\s*([\d\/\-]+)/i,
  /(?:fecha\s+(?:de\s+)?validaci[oó]n)\s*[:\-]?\s*([\d\/\-]+)/i,
  /(?:fecha\s+documento)\s*[:\-]?\s*([\d\/\-]+)/i,
  /(?:fecha_documento|documentDate)\s*[:\-]?\s*([\d\/\-]+)/i,
  // English equivalents
  /\b(?:issued|issue\s+date|invoice\s+date)\b\s*[:\-]?\s*([\d\/\-]+)/i,
  /\bdate\b\s*[:\-]?\s*([\d\/\-]+)/i,
  /\bemitido\b\s*[:\-]?\s*([\d\/\-]+)/i,
  // Generic "fecha" — allow optional words between label and date value
  /\bfecha\b[^\n\d]{0,30}([\d]{1,2}[\/\-][\d]{1,2}[\/\-][\d]{4})/i,
  /\bfecha\b\s*[:\-]?\s*([\d\/\-]+)/i,
];

function parseDateFromDMY(d: string, m: string, y: string): Date | null {
  const candidate = new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
  return isNaN(candidate.getTime()) ? null : candidate;
}

function parseDateTextual(text: string): Date | null {
  // Spanish long: "15 de enero de 2024"
  let m = DATE_ES_LONG_RE.exec(text);
  if (m) {
    const monthIdx = MONTHS_ES[m[2].toLowerCase()];
    if (monthIdx !== undefined) {
      const d = new Date(parseInt(m[3]), monthIdx, parseInt(m[1]));
      if (!isNaN(d.getTime())) return d;
    }
  }
  // Spanish short: "15 enero 2024"
  m = DATE_ES_SHORT_RE.exec(text);
  if (m) {
    const monthIdx = MONTHS_ES[m[2].toLowerCase()];
    if (monthIdx !== undefined) {
      const d = new Date(parseInt(m[3]), monthIdx, parseInt(m[1]));
      if (!isNaN(d.getTime())) return d;
    }
  }
  // English MDY: "January 15, 2024"
  m = DATE_EN_MDY_RE.exec(text);
  if (m) {
    const monthIdx = MONTHS_EN[m[1].toLowerCase()];
    if (monthIdx !== undefined) {
      const d = new Date(parseInt(m[3]), monthIdx, parseInt(m[2]));
      if (!isNaN(d.getTime())) return d;
    }
  }
  // English DMY: "15 January 2024"
  m = DATE_EN_DMY_RE.exec(text);
  if (m) {
    const monthIdx = MONTHS_EN[m[2].toLowerCase()];
    if (monthIdx !== undefined) {
      const d = new Date(parseInt(m[3]), monthIdx, parseInt(m[1]));
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

function parseDate(text: string): Date | null {
  // 1. Labeled numeric dates (highest confidence)
  for (const re of DATE_LABEL_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const raw = m[1].trim();
    // Try ISO first, then DMY
    const iso = DATE_ISO_RE.exec(raw);
    if (iso) {
      const d = new Date(iso[1]);
      if (!isNaN(d.getTime())) return d;
    }
    const dmy = DATE_DMY_RE.exec(raw);
    if (dmy) {
      const candidate = parseDateFromDMY(dmy[1], dmy[2], dmy[3]);
      if (candidate) return candidate;
    }
  }

  // 2. Textual date anywhere in the text ("15 de enero de 2024")
  const textual = parseDateTextual(text);
  if (textual) return textual;

  // 3. ISO date anywhere in the text
  const iso = DATE_ISO_RE.exec(text);
  if (iso) {
    const d = new Date(iso[1]);
    if (!isNaN(d.getTime())) return d;
  }

  // 4. DD/MM/YYYY anywhere (Latin America convention)
  const dmy = DATE_DMY_RE.exec(text);
  if (dmy) {
    return parseDateFromDMY(dmy[1], dmy[2], dmy[3]);
  }

  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// ISSUER PARSING
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Issuer name label patterns, ordered from most specific to least.
 * Captures the name value in group 1.
 */
const ISSUER_PATTERNS: RegExp[] = [
  /(?:raz[oó]n\s+social)\s*[:\-]\s*([^\n,;$\d]{3,120})/i,
  /(?:nombre\s+del?\s+emisor|empresa\s+emisora)\s*[:\-]\s*([^\n,;$\d]{3,120})/i,
  /(?:emisor)\s*[:\-]\s*([^\n,;$\d]{3,120})/i,
  /(?:proveedor)\s*[:\-]\s*([^\n,;$\d]{3,120})/i,
  /(?:supplier|issuer)\s*[:\-]\s*([^\n,;$\d]{3,120})/i,
  /(?:nombre\s+empresa|empresa)\s*[:\-]\s*([^\n,;$\d]{3,120})/i,
  /(?:factura\s+de|facturado\s+por)\s*[:\-]?\s*([^\n,;$\d]{3,120})/i,
  /(?:invoice\s+from|billed\s+by)\s*[:\-]?\s*([^\n,;$\d]{3,120})/i,
  // "cliente:" is the receiver/buyer, included last for cases like remissions
  /(?:cliente)\s*[:\-]\s*([^\n,;$\d]{3,120})/i,
];

function parseIssuerName(text: string): string | null {
  for (const re of ISSUER_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const candidate = m[1].trim().replace(/\s+/g, " ");
    // Reject: starts with digit, too short, looks like a date or amount
    if (/^\d/.test(candidate)) continue;
    if (candidate.length < 3) continue;
    // Strip trailing punctuation
    return candidate.replace(/[.,;:\-]+$/, "").slice(0, 120);
  }
  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// TAX ID PARSING
// ═════════════════════════════════════════════════════════════════════════════

// Colombian NIT — digits with optional dot thousands and optional dash+check digit
// Handles: "NIT 890984843-3", "NIT: 890.984.843-3", "NIT No. 900123456-1", "NIT#890984843-3"
const NIT_RE = /\bNIT\s*(?:(?:no|n[úu]m(?:ero)?|#)\.?\s*)?[:\-.]?\s*(\d[\d.]{5,12}\d(?:\s*-\s*\d)?)\b/i;
// Generic tax IDs after known label prefixes
const TAX_ID_RE = /\b(?:RFC|RUC|CUIT|RIF|RUT|TAX[_\s]?ID)\s*[:\-#.]?\s*([A-Z0-9]{6,20})/i;
// Mexican RFC standalone (letter pattern)
const RFC_STANDALONE_RE = /\b([A-Z]{3,4}\d{6}[A-Z0-9]{3})\b/;

function normalizeNit(raw: string): string {
  // Strip dot thousand-separators: "900.123.456-1" → "900123456-1"
  // Normalise spaces around dash check digit: "900123456 - 1" → "900123456-1"
  return raw
    .replace(/\.(?=\d{3})/g, "")
    .replace(/\s*-\s*(\d)$/, "-$1");
}

function parseIssuerId(text: string): string | null {
  const nit = NIT_RE.exec(text);
  if (nit) return normalizeNit(nit[1].trim());

  const taxId = TAX_ID_RE.exec(text);
  if (taxId) return taxId[1].trim();

  const rfc = RFC_STANDALONE_RE.exec(text);
  if (rfc) return rfc[1].trim();

  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// BILINGUAL LABEL NORMALIZATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Canonical semantic categories for financial document labels.
 * Equivalent Spanish and English labels map to the same canonical value,
 * allowing all downstream parsers to reason about meaning rather than surface text.
 */
export type CanonicalLabel =
  | "DATE_ISSUE"       // Fecha de Expedición / Fecha Factura / Invoice Date / Issue Date
  | "DATE_GENERATION"  // Fecha Generación
  | "DATE_EMISSION"    // Fecha de Emisión
  | "DATE_VALIDATION"  // Fecha Validación
  | "DATE_EXPIRY"      // Fecha Vencimiento / Due Date / Payment Due
  | "DATE_CONTROL"     // Fecha de Control  (line-item field — never invoice date)
  | "DATE_SHIPMENT"    // Fecha de Envío / Ship Date  (line-item field — never invoice date)
  | "TOTAL_GLOBAL"     // Total Neto / Total a Pagar / Invoice Total / Amount Due / Grand Total
  | "TOTAL_INVOICE"    // Total Factura / Total Invoice
  | "TOTAL_NET"        // Valor Total / Net Amount / Net Total
  | "TOTAL_GENERIC"    // Total  (generic, lowest-confidence amount label)
  | "SUBTOTAL"         // Subtotal / Sub Total
  | "ISSUER_NAME"      // Razón Social / Company Name
  | "ISSUER_CONTEXT"   // Proveedor / Supplier / Vendor / Issuer / Emisor
  | "ISSUER_ID";       // NIT / Tax ID / Taxpayer ID / RFC / RUC

interface LabelRule {
  re:        RegExp;
  canonical: CanonicalLabel;
}

/**
 * Ordered matching rules: first match wins.
 * More-specific patterns MUST appear before more-generic ones
 * (e.g. "invoice date" before bare "date").
 */
const LABEL_RULES: LabelRule[] = [
  // ── Issue date ────────────────────────────────────────────────────────────
  { re: /\bfecha\s+de\s+expedici[oó]n\b/i,             canonical: "DATE_ISSUE"      },
  { re: /\bfecha\s+(?:de\s+)?factura\b/i,              canonical: "DATE_ISSUE"      },
  { re: /\binvoice\s+date\b/i,                          canonical: "DATE_ISSUE"      },
  { re: /\bissue(?:d)?\s+date\b/i,                     canonical: "DATE_ISSUE"      },
  { re: /\bdate\s+(?:of\s+)?invoice\b/i,               canonical: "DATE_ISSUE"      },
  // ── Other operational dates ───────────────────────────────────────────────
  { re: /\bfecha\s+(?:de\s+)?generaci[oó]n\b/i,       canonical: "DATE_GENERATION" },
  { re: /\bfecha\s+(?:de\s+)?emisi[oó]n\b/i,          canonical: "DATE_EMISSION"   },
  { re: /\bfecha\s+(?:de\s+)?validaci[oó]n\b/i,       canonical: "DATE_VALIDATION" },
  { re: /\bfecha\s+vencimiento\b/i,                    canonical: "DATE_EXPIRY"     },
  { re: /\bdue\s+date\b/i,                             canonical: "DATE_EXPIRY"     },
  { re: /\bpayment\s+due\b/i,                          canonical: "DATE_EXPIRY"     },
  { re: /\bpay(?:ment)?\s+by\b/i,                     canonical: "DATE_EXPIRY"     },
  // ── Line-item date fields (always rejected as invoice date) ───────────────
  { re: /\bfecha\s+de\s+control\b/i,                   canonical: "DATE_CONTROL"    },
  { re: /\bfecha\s+de\s+env[ií]o\b/i,                 canonical: "DATE_SHIPMENT"   },
  { re: /\bship(?:ment)?\s+date\b/i,                   canonical: "DATE_SHIPMENT"   },
  { re: /\bdispatch\s+date\b/i,                        canonical: "DATE_SHIPMENT"   },
  // ── Grand / payable totals (highest-priority amount labels) ──────────────
  { re: /\bimporte\s+a\s+pagar\b/i,                   canonical: "TOTAL_GLOBAL"    },
  { re: /\bimporte\s+total\b/i,                        canonical: "TOTAL_GLOBAL"    },
  { re: /\btotal\s+neto\b/i,                           canonical: "TOTAL_GLOBAL"    },
  { re: /\btotal\s+operaci[oó]n\b/i,                  canonical: "TOTAL_GLOBAL"    },
  { re: /\btotal\s+a\s+pagar\b/i,                     canonical: "TOTAL_GLOBAL"    },
  { re: /\binvoice\s+total\b/i,                        canonical: "TOTAL_GLOBAL"    },
  { re: /\bamount\s+due\b/i,                           canonical: "TOTAL_GLOBAL"    },
  { re: /\btotal\s+amount\b/i,                         canonical: "TOTAL_GLOBAL"    },
  { re: /\btotal\s+due\b/i,                            canonical: "TOTAL_GLOBAL"    },
  { re: /\bgrand\s+total\b/i,                          canonical: "TOTAL_GLOBAL"    },
  { re: /\btotal\s+factura\b/i,                        canonical: "TOTAL_INVOICE"   },
  { re: /\btotal\s+invoice\b/i,                        canonical: "TOTAL_INVOICE"   },
  { re: /\bvalor\s+total\b/i,                          canonical: "TOTAL_NET"       },
  { re: /\bnet\s+(?:amount|total)\b/i,                 canonical: "TOTAL_NET"       },
  { re: /\bsubtotal\b/i,                               canonical: "SUBTOTAL"        },
  { re: /\bsub\s+total\b/i,                            canonical: "SUBTOTAL"        },
  // generic "total" must come after all compound total patterns
  { re: /\btotal\b/i,                                  canonical: "TOTAL_GENERIC"   },
  // ── Issuer identification ─────────────────────────────────────────────────
  { re: /\braz[oó]n\s+social\b/i,                     canonical: "ISSUER_NAME"     },
  { re: /\bnombre\s+(?:de\s+(?:la?\s+)?)?empresa\b/i, canonical: "ISSUER_NAME"     },
  { re: /\bcompany\s+name\b/i,                         canonical: "ISSUER_NAME"     },
  { re: /\bproveedor\b/i,                              canonical: "ISSUER_CONTEXT"  },
  { re: /\bsupplier\b/i,                               canonical: "ISSUER_CONTEXT"  },
  { re: /\bvendor\b/i,                                 canonical: "ISSUER_CONTEXT"  },
  { re: /\bissuer\b/i,                                 canonical: "ISSUER_CONTEXT"  },
  { re: /\bemisore?\b/i,                               canonical: "ISSUER_CONTEXT"  },
  // ── Tax / company ID ─────────────────────────────────────────────────────
  { re: /\bNIT\b/i,                                    canonical: "ISSUER_ID"       },
  { re: /\btax(?:payer)?\s+(?:id|identification)\b/i, canonical: "ISSUER_ID"       },
  { re: /\bRFC\b/i,                                    canonical: "ISSUER_ID"       },
  { re: /\bRUC\b/i,                                    canonical: "ISSUER_ID"       },
];

export interface AnnotatedLine {
  text:      string;
  canonical: CanonicalLabel | null;
}

/** Returns the first canonical label that matches line, or null. */
function detectCanonicalLabel(line: string): CanonicalLabel | null {
  for (const { re, canonical } of LABEL_RULES) {
    if (re.test(line)) return canonical;
  }
  return null;
}

/**
 * Annotates every PDF line with its canonical label category.
 * Called once before all line-aware parsers so the annotation pass runs exactly
 * once per document regardless of how many parsers consume the result.
 */
export function annotatePdfLines(lines: string[]): AnnotatedLine[] {
  return lines.map((text) => ({ text, canonical: detectCanonicalLabel(text) }));
}

/**
 * Returns a compact index: canonical label → first line index where it appears.
 * Stored verbatim in extractedJson as normalizedLabelsDetected.
 */
export function summarizeAnnotations(
  annotated: AnnotatedLine[],
): Record<string, number> {
  const seen: Record<string, number> = {};
  for (let i = 0; i < annotated.length; i++) {
    const cat = annotated[i].canonical;
    if (cat && !(cat in seen)) seen[String(cat)] = i;
  }
  return seen;
}

// ═════════════════════════════════════════════════════════════════════════════
// LINE-AWARE PARSERS  (used only for PDF source)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Canonical amount label priority used by parseAmountFromLines.
 * Each entry carries a fallback regex for the rare case where normalization
 * did not annotate a line that clearly contains a total label.
 *
 * Order: highest-confidence totals first → lowest-confidence last.
 */
const AMOUNT_CANONICAL_PRIORITY: Array<{
  canonical:  CanonicalLabel;
  fallbackRe: RegExp;
}> = [
  {
    canonical:  "TOTAL_GLOBAL",
    fallbackRe: /\bimporte\s+a\s+pagar\b|\bimporte\s+total\b|\btotal\s+(?:neto|operaci[oó]n|a\s+pagar)\b|\binvoice\s+total\b|\bamount\s+due\b|\btotal\s+(?:amount|due)\b|\bgrand\s+total\b/i,
  },
  {
    canonical:  "TOTAL_NET",
    fallbackRe: /\bvalor\s+total\b|\bnet\s+(?:amount|total)\b/i,
  },
  {
    canonical:  "TOTAL_INVOICE",
    fallbackRe: /\btotal\s+factura\b|\btotal\s+invoice\b/i,
  },
  {
    canonical:  "TOTAL_GENERIC",
    fallbackRe: /\btotal\b/i,
  },
  {
    canonical:  "SUBTOTAL",
    fallbackRe: /\bsub\s*total\b/i,
  },
];

/**
 * Restricted priority for Colombian electronic invoices.
 * Excludes TOTAL_GENERIC and SUBTOTAL — those labels appear on line-item rows
 * (e.g. per-product subtotals) and must not be mistaken for the invoice total.
 * Only the three unambiguous "grand total" labels are attempted.
 */
const AMOUNT_COLOMBIAN_PRIORITY: Array<{ canonical: CanonicalLabel; fallbackRe: RegExp }> = [
  AMOUNT_CANONICAL_PRIORITY[0], // TOTAL_GLOBAL
  AMOUNT_CANONICAL_PRIORITY[1], // TOTAL_NET
  AMOUNT_CANONICAL_PRIORITY[2], // TOTAL_INVOICE
];

/**
 * Minimum plausible invoice total in any LATAM currency.
 * Values below this are almost certainly numeric fragments (NIT digits, CUFE
 * substrings, unit prices, tax coefficients) rather than grand totals.
 */
const AMOUNT_MIN_VALUE = 1_000;

export interface AmountCandidate {
  label: string;
  rawValue: string;
  normalizedValue: number | null;
  zone?: DateZone;
  accepted: boolean;
  reason: string;
}

interface AmountParseResult {
  amount: number | null;
  candidates: AmountCandidate[];
}

/**
 * Parses amounts from annotated PDF lines.
 *
 * Uses canonical label priority (TOTAL_GLOBAL → TOTAL_NET → TOTAL_INVOICE →
 * TOTAL_GENERIC → SUBTOTAL) so equivalent Spanish and English labels rank
 * identically — e.g. "Invoice Total" and "Total Neto" both map to TOTAL_GLOBAL
 * and are considered before the generic "Total" label.
 *
 * A fallback regex is checked for each priority level in case the normalization
 * pass missed a label (edge cases, unusual fonts, mixed-case).
 *
 * Stricter than full-text scanning:
 *  – Only the first contiguous numeric token immediately after the label.
 *  – Values below AMOUNT_MIN_VALUE are rejected (NIT digits, unit prices, etc.).
 */
function parseAmountFromLines(
  annotated:  AnnotatedLine[],
  zones:      DateZone[],
  isFedEx:    boolean,
  priorities: typeof AMOUNT_CANONICAL_PRIORITY = AMOUNT_CANONICAL_PRIORITY,
): AmountParseResult {
  const candidates: AmountCandidate[] = [];

  for (const { canonical, fallbackRe } of priorities) {
    for (let i = 0; i < annotated.length; i++) {
      const { text: line, canonical: lineCanonical } = annotated[i];
      const zone = zones[i] ?? "unknown";

      // For FedEx invoices: skip line-item rows entirely.
      // Line-item subtotals (e.g. "Sub Total $54,67") are per-shipment amounts,
      // not the global invoice total.  The real total lives in the footer zone.
      if (isFedEx && zone === "line_item") {
        continue;
      }

      // Match by canonical label (primary) or fallback regex (secondary)
      const matchedBy: "canonical" | "regex" | null =
        lineCanonical === canonical  ? "canonical" :
        fallbackRe.test(line)        ? "regex"     :
        null;
      if (!matchedBy) continue;

      // Capture label text for debug
      const labelText = matchedBy === "canonical"
        ? `${canonical} (canonical)`
        : (fallbackRe.exec(line)?.[0] ?? canonical).trim();

      // ── Strategy 1: value on same line ──────────────────────────────────────
      const restOfLine = line.replace(fallbackRe, "").replace(/^[\s$:.\-]*/g, "");
      const sameLineMatch = /^([\d.,]+)/.exec(restOfLine);

      if (sameLineMatch) {
        const raw      = sameLineMatch[1];
        const n        = normalizeAmount(raw);
        const accepted = n !== null && n >= AMOUNT_MIN_VALUE;
        candidates.push({
          label:           labelText,
          rawValue:        raw,
          normalizedValue: n,
          zone,
          accepted,
          reason: n === null
            ? "not a valid number"
            : accepted
            ? `same-line ${matchedBy} match (zone:${zone})`
            : `fragment: ${n} < minimum ${AMOUNT_MIN_VALUE}`,
        });
        if (accepted) return { amount: n, candidates };
        continue;
      }

      // ── Strategy 2: value on next non-empty line ─────────────────────────────
      for (let j = i + 1; j <= i + 2 && j < annotated.length; j++) {
        const next = annotated[j].text.trim();
        if (!next) continue;
        if (!/^\$?\s*\d/.test(next)) break;
        const raw      = next.replace(/[^0-9.,]/g, "").trim();
        const n        = normalizeAmount(raw);
        const accepted = n !== null && n >= AMOUNT_MIN_VALUE;
        candidates.push({
          label:           labelText,
          rawValue:        raw,
          normalizedValue: n,
          zone,
          accepted,
          reason: n === null
            ? "not a valid number"
            : accepted
            ? `next-line ${matchedBy} match (zone:${zone})`
            : `fragment: ${n} < minimum ${AMOUNT_MIN_VALUE}`,
        });
        if (accepted) return { amount: n, candidates };
        break;
      }
    }
  }

  return { amount: null, candidates };
}

/**
 * Two-pass amount parser tuned for Colombian electronic invoices.
 *
 * Pass 1 — last 30% of lines, full priority list.
 *   Colombian invoices always place the summary block (Subtotal / IVA / Total)
 *   at the bottom of the document.  Searching the tail first finds the correct
 *   total before any line-item TOTAL_GENERIC rows earlier in the document.
 *
 * Pass 2 — full document, AMOUNT_COLOMBIAN_PRIORITY only (no TOTAL_GENERIC / SUBTOTAL).
 *   Fallback when the tail scan finds nothing.  Restricts to unambiguous grand-
 *   total labels to avoid picking up per-product or intermediate subtotals.
 */
function parseAmountForColombianInvoice(
  annotated: AnnotatedLine[],
  zones:     DateZone[],
): AmountParseResult {
  // Pass 1: tail of the document (last 30%)
  const tailStart    = Math.floor(annotated.length * 0.7);
  const tailAnnotated = annotated.slice(tailStart);
  const pass1 = parseAmountFromLines(tailAnnotated, [], false);
  if (pass1.amount !== null) return pass1;

  // Pass 2: full document with restricted priority list
  return parseAmountFromLines(annotated, zones, false, AMOUNT_COLOMBIAN_PRIORITY);
}

/**
 * Patterns that indicate a date lives inside a legal / resolution disclaimer
 * rather than being the operational invoice date.
 *
 * When any of these are found within ±DATE_LEGAL_WINDOW lines of a date label,
 * that candidate is rejected with reason "legal context".
 */
const DATE_LEGAL_CONTEXT_RE =
  /\b(?:resoluci[oó]n|auto[-\s]?retenedor|gran\s+contribuyente|DIAN\s+calific[oó]|v[aá]lida\s+hasta|rango\s+de\s+facturaci[oó]n|habilitado\s+por|mediante\s+resoluci[oó]n|n[uú]mero\s+de\s+resoluci[oó]n|habilita\s+para|no\s+de\s+resoluci[oó]n)\b/i;

const DATE_LEGAL_WINDOW = 4;

/**
 * Labels that refer to operational/logistical fields, never the invoice issue date.
 * Rejected regardless of document type or zone.
 */
const DATE_REJECT_LABEL_RE =
  /\bfecha\s+(?:de\s+)?(?:control|env[ií]o|envio|entrega|embarque|despacho|corte|embalaje|recepci[oó]n|recibo)\b/i;

/**
 * Signals that identify a FedEx / courier-style multi-shipment invoice.
 * When any of these are found in the full PDF text the document is treated as
 * FedEx-style and zone-aware date filtering is applied.
 */
const FEDEX_DOCUMENT_RE =
  /\b(?:FEDEX|FEDERAL\s+EXPRESS|SFX[-\s]?\d|gu[ií]a\s+a[eé]rea)\b/i;

/**
 * Column-header patterns that mark the beginning of a line-item table in FedEx
 * invoices.  The first line matching this pattern transitions the zone from
 * "header" to "line_item".
 */
const LINE_ITEM_TABLE_START_RE =
  /\b(?:fecha\s+de\s+control|fecha\s+de\s+env[ií]o|gu[ií]a\s+(?:no|n[uú]m|a[eé]rea)|no\.?\s+de\s+gu[ií]a|tracking\s+(?:no|num|#))\b/i;

/**
 * Lines starting with a TOTAL/SUBTOTAL label mark the end of the line-item table
 * and the beginning of the footer/summary section.
 */
const TOTALS_ROW_RE = /^\s*(?:total|subtotal)\b/i;

// ── Zone types ────────────────────────────────────────────────────────────────

export type DateZone = "header" | "line_item" | "legal_disclaimer" | "footer" | "unknown";

/**
 * Classifies each line of a PDF document into a structural zone:
 *
 *  header            — before the first line-item table column header
 *  line_item         — inside the line-item table (between table header and TOTAL)
 *  footer            — after the TOTAL/summary line
 *  legal_disclaimer  — any line (or run of lines) matching legal-context patterns
 *  unknown           — unclassified (treated as header for date purposes)
 *
 * Legal-disclaimer lines are detected independently and override the other zones.
 */
function classifyLineZones(lines: string[]): DateZone[] {
  const zones: DateZone[] = new Array(lines.length).fill("header" as DateZone);
  let state: "header" | "line_item" | "footer" = "header";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Transition header → line_item
    if (state === "header" && LINE_ITEM_TABLE_START_RE.test(line)) {
      state = "line_item";
    }
    // Transition line_item → footer
    else if (state === "line_item" && TOTALS_ROW_RE.test(line)) {
      state = "footer";
    }

    zones[i] = state;
  }

  // Second pass: override with legal_disclaimer where relevant
  // Use a sliding window so a single legal line marks its neighbours too.
  for (let i = 0; i < lines.length; i++) {
    if (DATE_LEGAL_CONTEXT_RE.test(lines[i])) {
      const start = Math.max(0, i - DATE_LEGAL_WINDOW);
      const end   = Math.min(lines.length - 1, i + DATE_LEGAL_WINDOW);
      for (let j = start; j <= end; j++) {
        zones[j] = "legal_disclaimer";
      }
    }
  }

  return zones;
}

// ═════════════════════════════════════════════════════════════════════════════
// STANDARD INVOICE ZONE CLASSIFIER
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Structural zones for a standard Colombian electronic invoice.
 *
 *  header      — issuer block, invoice header (number, date, customer info)
 *  table_body  — product/service line-item rows
 *  summary     — totals block (subtotal, IVA, grand total)
 *  legal       — DIAN resolution / legal disclaimer text (never used for extraction)
 */
export type InvoiceZone = "header" | "table_body" | "summary" | "legal";

/** Records a zone-boundary transition for debug output. */
interface InvoiceZoneBoundary {
  lineIdx: number;
  zone:    InvoiceZone;
  trigger: string;
}

/**
 * Candidate product/service column-header tokens.
 * A line matching ≥2 of these is classified as a table column-header row,
 * marking the start of the table_body zone.
 *
 * Deliberately excludes bare "Total" — it appears in both column headers and
 * summary rows, so it is handled exclusively by INVOICE_SUMMARY_START_RE.
 */
const INVOICE_TABLE_COLUMN_TOKENS: RegExp[] = [
  /\bDescripci[oó]n\b/i,
  /\bConcepto\b/i,
  /\bProducto\b/i,
  /\bC[oó]d(?:igo)?\b/i,
  /\bReferencia\b/i,
  /\bCantidad\b/i,
  /\bCant\.?\b/i,
  /\bUnd\.?\b/i,
  /\bUnidad\b/i,
  /\bValor\s+Unitario\b/i,
  /\bPrecio\s+Unitario\b/i,
  /\bV[.\s]*Unit(?:ario)?\b/i,
  /\bDescuento\b/i,
  /\bDto\.?\b/i,
];

function isInvoiceTableHeaderLine(line: string): boolean {
  let count = 0;
  for (const re of INVOICE_TABLE_COLUMN_TOKENS) {
    if (re.test(line) && ++count >= 2) return true;
  }
  return false;
}

/**
 * Matches the first line of the summary/totals block.
 * Anchored at the start (^\s*) to avoid false positives in product descriptions.
 */
const INVOICE_SUMMARY_START_RE =
  /^\s*(?:subtotal|base\s+gravable|base\s+imponible|total\s+(?:neto|operaci[oó]n|a\s+pagar|factura|invoice)|IVA\b|valor\s+total)\b/i;

/**
 * Classifies each line of a standard invoice into a structural zone.
 *
 * State machine (first pass):
 *   header     → table_body  on first table column-header row
 *   table_body → summary     on first totals label row
 *   header     → summary     on first totals label row (when no table present)
 *
 * Second pass overlays legal zone (same DATE_LEGAL_CONTEXT_RE as the FedEx classifier).
 *
 * Returns the zone array and boundary events for debug output.
 */
function classifyInvoiceZones(lines: string[]): {
  zones:      InvoiceZone[];
  boundaries: InvoiceZoneBoundary[];
} {
  const zones: InvoiceZone[]      = new Array(lines.length).fill("header" as InvoiceZone);
  const boundaries: InvoiceZoneBoundary[] = [{ lineIdx: 0, zone: "header", trigger: "start" }];
  let state: "header" | "table_body" | "summary" = "header";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (state === "header") {
      if (isInvoiceTableHeaderLine(line)) {
        state = "table_body";
        boundaries.push({ lineIdx: i, zone: "table_body", trigger: line.trim().slice(0, 60) });
      } else if (INVOICE_SUMMARY_START_RE.test(line)) {
        state = "summary";
        boundaries.push({ lineIdx: i, zone: "summary", trigger: line.trim().slice(0, 60) });
      }
    } else if (state === "table_body" && INVOICE_SUMMARY_START_RE.test(line)) {
      state = "summary";
      boundaries.push({ lineIdx: i, zone: "summary", trigger: line.trim().slice(0, 60) });
    }
    zones[i] = state;
  }

  // Legal overlay — uses the same legal-context detector as the FedEx classifier.
  // Legal lines override whatever zone was assigned in the first pass.
  const markedLegal = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (DATE_LEGAL_CONTEXT_RE.test(lines[i])) {
      const start = Math.max(0, i - DATE_LEGAL_WINDOW);
      const end   = Math.min(lines.length - 1, i + DATE_LEGAL_WINDOW);
      for (let j = start; j <= end; j++) {
        if (!markedLegal.has(j)) {
          markedLegal.add(j);
          zones[j] = "legal";
          boundaries.push({ lineIdx: j, zone: "legal", trigger: lines[i].trim().slice(0, 60) });
        }
      }
    }
  }

  return { zones, boundaries };
}

/** Debug output from the zone-aware Colombian invoice parser. */
export interface InvoiceZoneDebug {
  /** Zone transition boundaries in document order. */
  boundaries: InvoiceZoneBoundary[];
  /** Aggregate line counts per zone. */
  zoneStats: {
    headerLines:     number;
    tableLines:      number;
    summaryLines:    number;
    legalLines:      number;
    /** true when at least one table_body line was detected. */
    tableDetected:   boolean;
    /** true when at least one summary line was detected. */
    summaryDetected: boolean;
  };
  /** Issuer candidates evaluated from the header zone. */
  issuerCandidates: IssuerCandidate[];
  /** Amount candidates evaluated from the summary zone. */
  amountCandidates: AmountCandidate[];
  /** Date candidates evaluated from the header zone. */
  dateCandidates:   DateCandidate[];
  /** Which zone each core field was extracted from (null = not extracted from PDF). */
  selectedZones: {
    issuerName:   InvoiceZone | null;
    totalAmount:  InvoiceZone | null;
    documentDate: InvoiceZone | null;
  };
}

// ── Position-aware row reconstruction ─────────────────────────────────────────

/**
 * Y-axis tolerance for grouping pdf2json text items into the same visual row.
 *
 * pdf2json v4 reports coordinates in inches (Page.Width ≈ 8.5 for US-Letter).
 * A typical body-text line height is ~14pt ≈ 0.194 inches.  0.2 inches is
 * tight enough to keep adjacent rows separate while allowing baseline variation
 * within the same row (superscripts, varying font sizes within one line, etc.).
 */
const ITEM_ROW_Y_TOLERANCE = 0.2; // inches

interface ReconstructedRow {
  pageIndex: number;
  /** Representative y of this row (y of the first item added). */
  y:    number;
  items: PdfTextItem[];
}

/**
 * Groups pdf2json text items into visual rows using their x/y coordinates.
 *
 * Algorithm:
 *  1. Sort items by (pageIndex ASC, y ASC, x ASC).
 *  2. Emit a new row whenever pageIndex changes OR |y – prevY| > ITEM_ROW_Y_TOLERANCE.
 *  3. Within each row, items are already sorted by x → join with a single space.
 *
 * Returns an array of non-empty strings, one per visual row, in reading order
 * (top-to-bottom, left-to-right within each page).
 *
 * This replaces the naive "join all items on a page with spaces" approach that
 * pdf2json uses for its plain-text output, which collapses entire page into one
 * line and breaks the FedEx block classifier.
 */
export function reconstructRowsFromItems(items: PdfTextItem[]): {
  rows:        string[];
  pageRegions: Array<{ pageIndex: number; startRow: number; endRow: number; rowCount: number }>;
} {
  if (items.length === 0) return { rows: [], pageRegions: [] };

  // Sort: page first, then top-to-bottom, then left-to-right
  const sorted = [...items].sort((a, b) =>
    a.pageIndex !== b.pageIndex ? a.pageIndex - b.pageIndex :
    Math.abs(a.y - b.y) < ITEM_ROW_Y_TOLERANCE ? a.x - b.x :
    a.y - b.y
  );

  const buckets: ReconstructedRow[] = [];

  for (const item of sorted) {
    const last = buckets[buckets.length - 1];
    if (
      last &&
      last.pageIndex === item.pageIndex &&
      Math.abs(item.y - last.y) <= ITEM_ROW_Y_TOLERANCE
    ) {
      last.items.push(item);
    } else {
      buckets.push({ pageIndex: item.pageIndex, y: item.y, items: [item] });
    }
  }

  // Convert each bucket to a text string; track per-page row ranges
  const rows: string[] = [];
  const pageRegions: Array<{ pageIndex: number; startRow: number; endRow: number; rowCount: number }> = [];
  let lastPage = -1;
  let pageStart = 0;

  for (const bucket of buckets) {
    // Sort items within the row by x (already sorted for new pages, but re-sort
    // to handle edge cases where items were inserted out of x-order)
    bucket.items.sort((a, b) => a.x - b.x);
    const text = bucket.items.map((i) => i.text).join(" ").trim();
    if (!text) continue;

    if (bucket.pageIndex !== lastPage) {
      if (lastPage >= 0) {
        pageRegions.push({ pageIndex: lastPage, startRow: pageStart, endRow: rows.length - 1, rowCount: rows.length - pageStart });
      }
      pageStart = rows.length;
      lastPage  = bucket.pageIndex;
    }
    rows.push(text);
  }

  if (lastPage >= 0) {
    pageRegions.push({ pageIndex: lastPage, startRow: pageStart, endRow: rows.length - 1, rowCount: rows.length - pageStart });
  }

  return { rows, pageRegions };
}

/**
 * Splits a FedEx/courier PDF into four structural blocks by line index.
 *
 * Pass 1 — state machine identical to classifyLineZones:
 *   header → line_item (first LINE_ITEM_TABLE_START_RE match)
 *   line_item → footer  (first TOTALS_ROW_RE match inside line_item)
 *
 * Pass 2 — legal disclaimer overlay:
 *   Any line matching DATE_LEGAL_CONTEXT_RE marks ±DATE_LEGAL_WINDOW neighbours
 *   as legal. These are EXCLUDED from headerLines (they would otherwise pollute
 *   the clean header block used for date extraction).
 *
 * Key guarantee: headerLines never contains legal-disclaimer lines, so date and
 * issuer parsers can process them without a separate legal-context guard.
 */
function splitFedExBlocks(lines: string[]): FedExBlockIndices {
  // Pass 1: state machine
  const stateMap: Array<"header" | "line_item" | "footer"> = [];
  let state: "header" | "line_item" | "footer" = "header";
  for (let i = 0; i < lines.length; i++) {
    if      (state === "header"    && LINE_ITEM_TABLE_START_RE.test(lines[i])) state = "line_item";
    else if (state === "line_item" && TOTALS_ROW_RE.test(lines[i]))            state = "footer";
    stateMap[i] = state;
  }

  // Pass 2: legal disclaimer set
  const legalSet = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (DATE_LEGAL_CONTEXT_RE.test(lines[i])) {
      const start = Math.max(0, i - DATE_LEGAL_WINDOW);
      const end   = Math.min(lines.length - 1, i + DATE_LEGAL_WINDOW);
      for (let j = start; j <= end; j++) legalSet.add(j);
    }
  }

  const headerLines:   number[] = [];
  const lineItemLines: number[] = [];
  const footerLines:   number[] = [];
  const legalLines:    number[] = [...legalSet].sort((a, b) => a - b);

  for (let i = 0; i < lines.length; i++) {
    if (legalSet.has(i)) continue; // legal lines are excluded from all three zones
    switch (stateMap[i]) {
      case "header":    headerLines.push(i);    break;
      case "line_item": lineItemLines.push(i);  break;
      case "footer":    footerLines.push(i);    break;
    }
  }

  return { headerLines, lineItemLines, footerLines, legalLines };
}

export interface DateCandidate {
  raw: string;
  normalized: string | null; // ISO date string, e.g. "2024-03-15"
  label: string;
  zone: DateZone;
  accepted: boolean;
  reason: string;
}

interface DateParseResult {
  date: Date | null;
  isFedEx: boolean;
  candidates: DateCandidate[];
}

/**
 * Date label sequence for the line-aware parser, ordered by priority.
 *
 * Each entry matches either by canonical label (primary — catches both Spanish
 * and English equivalents) or by a fallback regex (for unannotated lines).
 *
 * headerOnly = true means the label is only trusted in the "header" zone for
 * FedEx/courier invoices, where line-item rows contain per-shipment dates.
 */
const LINE_DATE_LABELS: Array<{
  canonical:  CanonicalLabel | null;
  fallbackRe: RegExp;
  label:      string;
  headerOnly?: boolean;
}> = [
  // Priority 1: explicit issue-date labels (ES + EN via canonical)
  {
    canonical:  "DATE_ISSUE",
    fallbackRe: /\bfecha\s+(?:de\s+)?expedici[oó]n\b|\bfecha\s+(?:de\s+)?factura\b|\binvoice\s+date\b|\bissue(?:d)?\s+date\b/i,
    label:      "Fecha de Expedición / Invoice Date",
  },
  // Priority 2: generation timestamp
  {
    canonical:  "DATE_GENERATION",
    fallbackRe: /\bfecha\s+(?:de\s+)?generaci[oó]n\b/i,
    label:      "Fecha Generación",
  },
  // Priority 3: emission alias
  {
    canonical:  "DATE_EMISSION",
    fallbackRe: /\bfecha\s+(?:de\s+)?emisi[oó]n\b/i,
    label:      "Fecha Emisión",
  },
  // Priority 4: validation stamp
  {
    canonical:  "DATE_VALIDATION",
    fallbackRe: /\bfecha\s+(?:de\s+)?validaci[oó]n\b/i,
    label:      "Fecha Validación",
  },
  // Priority 5: expiry / due date — fallback only, not preferred
  {
    canonical:  "DATE_EXPIRY",
    fallbackRe: /\bfecha\s+vencimiento\b|\bdue\s+date\b|\bpayment\s+due\b/i,
    label:      "Fecha Vencimiento / Due Date",
  },
  // Lowest priority: generic fecha / date — header-only in FedEx invoices
  {
    canonical:  null,
    fallbackRe: /\bfecha\b/i,
    label:      "Fecha (generic)",
    headerOnly: true,
  },
  {
    canonical:  null,
    fallbackRe: /\bdate\b/i,
    label:      "Date (generic-EN)",
    headerOnly: true,
  },
];

/** Returns true when any line within ±window of lineIdx matches the legal-context pattern. */
function isInLegalContext(lines: string[], lineIdx: number): boolean {
  const start = Math.max(0, lineIdx - DATE_LEGAL_WINDOW);
  const end   = Math.min(lines.length - 1, lineIdx + DATE_LEGAL_WINDOW);
  for (let i = start; i <= end; i++) {
    if (DATE_LEGAL_CONTEXT_RE.test(lines[i])) return true;
  }
  return false;
}

/**
 * Parses the invoice date from annotated PDF lines.
 *
 * Matching uses canonical labels (primary) so Spanish and English equivalents
 * are handled identically, then falls back to a regex for unannotated lines.
 *
 * For each label entry (in priority order):
 *  1. Skip lines whose canonical maps to DATE_CONTROL or DATE_SHIPMENT (always rejected).
 *  2. Reject lines in the legal_disclaimer zone.
 *  3. For FedEx documents: reject generic labels outside the header zone.
 *  4. Try to parse a date from the matched line, then the next non-empty line.
 *  5. Return the first accepted candidate.
 */
function parseDateFromLines(
  annotated:         AnnotatedLine[],
  allowedCanonicals?: ReadonlySet<CanonicalLabel>,
): DateParseResult {
  const lines   = annotated.map((a) => a.text);
  const isFedEx = lines.some((l) => FEDEX_DOCUMENT_RE.test(l));
  const zones   = classifyLineZones(lines);
  const candidates: DateCandidate[] = [];

  for (const { canonical, fallbackRe, label, headerOnly } of LINE_DATE_LABELS) {
    // When the caller restricts which canonical labels are allowed, skip entries
    // whose canonical is non-null and not in the allowed set.
    if (allowedCanonicals && canonical !== null && !allowedCanonicals.has(canonical)) continue;
    for (let i = 0; i < annotated.length; i++) {
      const { text: line, canonical: lineCanonical } = annotated[i];

      // Match by canonical (primary) or fallback regex (secondary).
      // For generic entries (canonical === null): only match lines that have no
      // canonical label, so we don't re-process lines already handled above.
      const matchedByCanonical = canonical !== null && lineCanonical === canonical;
      const matchedByFallback  = !matchedByCanonical &&
        (canonical === null ? lineCanonical === null : true) &&
        fallbackRe.test(line);

      if (!matchedByCanonical && !matchedByFallback) continue;

      const zone = zones[i];

      // ── Reject always-bad date labels via canonical ───────────────────────────
      if (lineCanonical === "DATE_CONTROL" || lineCanonical === "DATE_SHIPMENT") {
        candidates.push({ raw: line.trim().slice(0, 80), normalized: null, label, zone, accepted: false, reason: `rejected canonical label: ${lineCanonical}` });
        continue;
      }

      // ── Also reject by raw label pattern (belt-and-suspenders) ───────────────
      if (DATE_REJECT_LABEL_RE.test(line)) {
        candidates.push({ raw: line.trim().slice(0, 80), normalized: null, label, zone, accepted: false, reason: "rejected label (control/envío/entrega)" });
        continue;
      }

      // ── Reject legal / resolution context ────────────────────────────────────
      if (zone === "legal_disclaimer" || isInLegalContext(lines, i)) {
        candidates.push({ raw: line.trim().slice(0, 80), normalized: null, label, zone, accepted: false, reason: "legal context (resolution/disclaimer text nearby)" });
        continue;
      }

      // ── FedEx: generic labels only trusted in the header zone ────────────────
      if (isFedEx && headerOnly && zone !== "header") {
        candidates.push({ raw: line.trim().slice(0, 80), normalized: null, label, zone, accepted: false, reason: "FedEx: generic label outside header zone skipped" });
        continue;
      }

      // ── Try date on same line ────────────────────────────────────────────────
      const sameLine = parseDate(line);
      if (sameLine) {
        const iso = sameLine.toISOString().slice(0, 10);
        candidates.push({ raw: line.trim().slice(0, 80), normalized: iso, label, zone, accepted: true, reason: `same-line ${matchedByCanonical ? "canonical" : "regex"} match` });
        return { date: sameLine, isFedEx, candidates };
      }

      // ── Try date on next non-empty line ──────────────────────────────────────
      const next = lines[i + 1]?.trim();
      if (next) {
        const nextDate = parseDate(next);
        if (nextDate) {
          const iso = nextDate.toISOString().slice(0, 10);
          candidates.push({ raw: next.slice(0, 80), normalized: iso, label, zone, accepted: true, reason: `next-line ${matchedByCanonical ? "canonical" : "regex"} match` });
          return { date: nextDate, isFedEx, candidates };
        }
      }

      candidates.push({ raw: line.trim().slice(0, 80), normalized: null, label, zone, accepted: false, reason: "label matched but no date found on line or next line" });
    }
  }

  return { date: null, isFedEx, candidates };
}

// Patterns for Colombian/Latin American corporate legal suffixes
const CORPORATE_SUFFIX_RE =
  /\b(?:S\.?A\.?S\.?|LTDA\.?|S\.?A\.?|E\.?U\.?|SAS|CIA\.?|CORP(?:ORATION)?\.?|COMPAÑ[ÍI]A|INC\.?|LLC\.?|LTD\.?)\b/i;

// Standalone entity-type keywords that identify a line as a company name even
// without a legal suffix or high uppercase ratio.
const CORPORATE_KEYWORD_RE =
  /\b(?:CORPORACI[OÓ]N|FUNDACI[OÓ]N|COOPERATIVA|ASOCIACI[OÓ]N|EMPRESA|ENTIDAD|INSTITUTO|UNIVERSIDAD|BANCO|FINANCIERA|ASEGURADORA|FONDO|GRUPO)\b/i;

// Lines containing these terms are not company names
const ISSUER_REJECT_RE =
  /\b(?:NIT|IVA|CUFE|Calle|Carrera|Transversal|Diagonal|Avenida|CR\.|CL\.|AV\.|Factura|Total|Subtotal|Fecha|TEL[EF]?|FAX|Correo|Email|Web|Actividad|R\.I\.D|DIAN|Código|Direcci[oó]n|Ciudad|Tel[eé]fono|Barrio|Municipio|Departamento|Pa[ií]s|Forma\s+de\s+Pago|M[eé]todo\s+(?:de\s+)?Pago)\b/i;

// Single-word (≤ 2 tokens) geographic-name lines that should never be accepted
// as company names regardless of casing.
const GEOGRAPHIC_STANDALONE_RE =
  /^(?:antioquia|cundinamarca|valle(?:\s+del\s+cauca)?|atl[aá]ntico|santander|bogot[aá]|medell[ií]n|cali|barranquilla|cartagena|bucaramanga|pereira|manizales|c[uú]cuta|ibagu[eé])$/i;

/**
 * Returns a cleaned company-name string if the line looks like a company name,
 * or null if it should be rejected.
 *
 * Accepts lines that:
 *  – Are mostly uppercase (>60% uppercase letters), OR
 *  – Contain a recognised corporate legal suffix (S.A.S., LTDA., …), OR
 *  – Contain a recognised entity-type keyword (CORPORACION, FUNDACION, …).
 *
 * Explicit rejections take priority over acceptance rules.
 */
function validateCompanyLine(rawLine: string): string | null {
  const line = rawLine.trim();
  if (!line || line.length < 3 || line.length > 120) return null;
  if (/^\d/.test(line))                      return null; // starts with digit
  if (ISSUER_REJECT_RE.test(line))           return null;
  if (/@/.test(line))                        return null; // email address
  if (/https?:\/\//.test(line))              return null; // URL
  if (/\d{6,}/.test(line))                   return null; // long digit run (NIT, phone)
  if (GEOGRAPHIC_STANDALONE_RE.test(line))   return null; // standalone city/dept name

  const letters = line.replace(/[^a-záéíóúñA-ZÁÉÍÓÚ]/g, "");
  if (letters.length < 2) return null;

  const upperRatio =
    letters.replace(/[^A-ZÁÉÍÓÚ]/g, "").length / letters.length;
  const hasSuffix  = CORPORATE_SUFFIX_RE.test(line);
  const hasKeyword = CORPORATE_KEYWORD_RE.test(line);

  if (!hasSuffix && !hasKeyword && upperRatio < 0.6) return null;

  return line.replace(/[.,;:\-]+$/, "").slice(0, 120);
}

export interface IssuerCandidate {
  line: string;
  score: number;
  accepted: boolean;
  reason: string;
}

interface IssuerParseResult {
  name: string | null;
  candidates: IssuerCandidate[];
}

// ── FedEx block-parser types ───────────────────────────────────────────────

interface FedExBlockIndices {
  /** Pre-table lines that are NOT in a legal-disclaimer window. */
  headerLines:   number[];
  /** Lines inside the per-shipment table (between column-header and first TOTAL). */
  lineItemLines: number[];
  /** Lines after the first TOTAL row in the shipment table. */
  footerLines:   number[];
  /** All legal/disclaimer lines (±DATE_LEGAL_WINDOW of any legal trigger). */
  legalLines:    number[];
}

export interface FedExDebugInfo {
  fedexBlocksDetected: boolean;
  headerLineCount:     number;
  lineItemLineCount:   number;
  footerLineCount:     number;
  legalLineCount:      number;
  /** Fields found directly in the header/corporate block. */
  headerCandidates: Array<{
    field:       string;
    rawValue:    string;
    parsedValue: string | null;
    lineIdx:     number;
    line:        string;
  }>;
  /** Amount candidates evaluated from footer/header blocks (never line-item). */
  totalCandidates:  AmountCandidate[];
  /** Date candidates evaluated exclusively in the header block. */
  dateCandidates:   DateCandidate[];
  /** Which block the accepted amount came from, or null if none found. */
  selectedBlock:    "header" | "footer" | null;
  issuerSearched:   boolean;
  // ── Position-aware reconstruction fields (present when items were available) ─
  /** true when visual rows were reconstructed from pdf2json x/y items. */
  usedPositionAware:    boolean;
  /** Total rows after position-aware reconstruction (vs raw PDF lines). */
  reconstructedRowCount: number;
  /** Per-page row count after reconstruction. */
  pageRegions: Array<{
    pageIndex: number;
    startRow:  number;
    endRow:    number;
    rowCount:  number;
  }>;
  /** First 15 rows of the clean header block (for inspection). */
  selectedHeaderRows:  string[];
  /** First 15 rows of the footer/summary block (for inspection). */
  selectedSummaryRows: string[];
}

interface FedExParseOutput {
  issuerName:   string | null;
  issuerId:     string | null;
  amount:       number | null;
  currency:     string | null;
  documentDate: Date | null;
  debug:        FedExDebugInfo;
}

// ═════════════════════════════════════════════════════════════════════════════
// DOCUMENT CLASSIFICATION
// ═════════════════════════════════════════════════════════════════════════════

export type DocumentFamily =
  | "ELECTRONIC_INVOICE_STANDARD"
  | "COMMERCIAL_DOC_REMITISION_OR_PEDIDO"
  | "LOGISTICS_INVOICE"
  | "BANK_STATEMENT"
  | "UNKNOWN";

export interface DocumentClassification {
  family:         DocumentFamily;
  matchedSignals: string[];
  confidence:     "HIGH" | "MEDIUM" | "LOW";
}

interface ClassificationSignal { re: RegExp; label: string }

const BANK_STATEMENT_SIGNALS: ClassificationSignal[] = [
  { re: /\bestado\s+de\s+cuenta\b/i,  label: "ESTADO DE CUENTA" },
  { re: /\bsaldo\s+anterior\b/i,      label: "SALDO ANTERIOR"   },
  { re: /\btotal\s+abonos\b/i,        label: "TOTAL ABONOS"     },
  { re: /\btotal\s+cargos\b/i,        label: "TOTAL CARGOS"     },
  { re: /\bsaldo\s+actual\b/i,        label: "SALDO ACTUAL"     },
];

const LOGISTICS_INVOICE_SIGNALS: ClassificationSignal[] = [
  { re: /\bremitente\b/i,              label: "REMITENTE"          },
  { re: /\bdestinatario\b/i,           label: "DESTINATARIO"       },
  { re: /\bflete\b/i,                  label: "FLETE"              },
  { re: /\bfecha\s+elaboraci[oó]n\b/i, label: "FECHA ELABORACIÓN"  },
];

const COMMERCIAL_DOC_SIGNALS: ClassificationSignal[] = [
  { re: /\bremisi[oó]n\b/i,           label: "REMISION"           },
  { re: /\bpedidos?\s+clientes?\b/i,  label: "PEDIDOS CLIENTES"   },
];

const ELECTRONIC_INVOICE_SIGNALS: ClassificationSignal[] = [
  { re: /\bfactura\s+electr[oó]nica\s+de\s+venta\b/i,  label: "FACTURA ELECTRONICA DE VENTA" },
  { re: /\bCUFE\b/,                                      label: "CUFE"                         },
  { re: /\bfecha\s+(?:de\s+)?(?:factura|expedici[oó]n)\b/i, label: "FECHA FACTURA"            },
  { re: /\bsubtotal\b/i,                                 label: "SUBTOTAL"                     },
  { re: /\bIVA\b/,                                       label: "IVA"                          },
  { re: /\btotal\s+(?:factura|a\s+pagar)\b/i,            label: "TOTAL FACTURA"                },
];

/**
 * Classifies a document into a structural family using deterministic text signals.
 *
 * Priority order (most exclusive signals first):
 *   1. CUFE alone → ELECTRONIC_INVOICE_STANDARD (CUFE is DIAN-exclusive)
 *   2. BANK_STATEMENT  (≥2 signals)
 *   3. LOGISTICS_INVOICE  (≥2 signals)
 *   4. COMMERCIAL_DOC_REMITISION_OR_PEDIDO  (≥1 signal)
 *   5. ELECTRONIC_INVOICE_STANDARD  (≥2 signals, without CUFE)
 *   6. UNKNOWN
 */
export function classifyDocument(text: string): DocumentClassification {
  const matched = (sigs: ClassificationSignal[]): string[] =>
    sigs.filter(({ re }) => re.test(text)).map(({ label }) => label);

  // CUFE is the exclusive DIAN mandate signal — always overrides everything else.
  if (/\bCUFE\b/.test(text)) {
    return {
      family:         "ELECTRONIC_INVOICE_STANDARD",
      matchedSignals: matched(ELECTRONIC_INVOICE_SIGNALS),
      confidence:     "HIGH",
    };
  }

  const bankM = matched(BANK_STATEMENT_SIGNALS);
  if (bankM.length >= 2) {
    return { family: "BANK_STATEMENT", matchedSignals: bankM, confidence: bankM.length >= 4 ? "HIGH" : "MEDIUM" };
  }

  const logM = matched(LOGISTICS_INVOICE_SIGNALS);
  if (logM.length >= 2) {
    return { family: "LOGISTICS_INVOICE", matchedSignals: logM, confidence: logM.length >= 3 ? "HIGH" : "MEDIUM" };
  }

  const comM = matched(COMMERCIAL_DOC_SIGNALS);
  if (comM.length >= 1) {
    return { family: "COMMERCIAL_DOC_REMITISION_OR_PEDIDO", matchedSignals: comM, confidence: "HIGH" };
  }

  const invM = matched(ELECTRONIC_INVOICE_SIGNALS);
  if (invM.length >= 2) {
    const hasLabel = invM.includes("FACTURA ELECTRONICA DE VENTA");
    return { family: "ELECTRONIC_INVOICE_STANDARD", matchedSignals: invM, confidence: hasLabel ? "HIGH" : "MEDIUM" };
  }

  return { family: "UNKNOWN", matchedSignals: [], confidence: "LOW" };
}

// ═════════════════════════════════════════════════════════════════════════════
// COLOMBIAN ELECTRONIC INVOICE PARSER
// ═════════════════════════════════════════════════════════════════════════════

export interface ColombianInvoiceResult {
  /** Full invoice number (digits only). e.g. "10578", "11602", "597833". */
  invoiceNumber: string | null;
  /** Alphanumeric prefix. e.g. "FE", "FR". Null when document has no prefix. */
  prefix:        string | null;
  /** CUFE — DIAN SHA-384 hex digest (96 hex chars). */
  cufe:          string | null;
  /** Buyer / customer legal name (Razón Social del adquiriente). */
  customerName:  string | null;
  /** Buyer / customer tax ID (NIT or CC). */
  customerId:    string | null;
  /** Payment due date (Fecha de Vencimiento / Fecha Límite de Pago). */
  dueDate:       Date   | null;
  /** Pre-tax subtotal — base gravable before IVA. */
  subtotal:      number | null;
  /** IVA / tax amount (monetary value, not the percentage rate). */
  taxAmount:     number | null;
  /** Tax-inclusive grand total from the summary block (Valor Total / Total Neto). */
  totalAmount:   number | null;
}

// ── Invoice number ─────────────────────────────────────────────────────────

/**
 * Matches standalone prefix+number lines: "FE 10578", "FR597833", "FE 11,602".
 * Captures group 1 = prefix (FE/FR/FC/FV/NC/ND), group 2 = raw number string.
 */
const INVOICE_PREFIX_NUMBER_RE =
  /\b(FE|FR|FC|FV|NC|ND)\s*[-:]?\s*(\d[\d,. ]*\d|\d)\b/i;

/**
 * Matches labeled invoice number: "No. Factura: 10578", "Nro. de Factura 1111458461".
 * Captures group 1 = raw alphanumeric string (may contain prefix letters).
 */
const INVOICE_LABELED_RE =
  /(?:(?:n[oúu]mero|n[rg]o?|no)\.?\s*(?:de\s*)?(?:factura|fe|fr)\s*[:\-]?\s*|factura\s*(?:n[oú]\.?|n[rg]o\.?|#)?\s*[:\-]?\s*)([A-Z]{0,4}\s*\d[\d,. ]*)/i;

function cleanInvoiceNumber(raw: string): string {
  // Strip formatting separators within the number (commas, internal spaces)
  return raw.replace(/[,. ]/g, "").trim();
}

function parseInvoiceNumber(
  lines: string[],
): { invoiceNumber: string | null; prefix: string | null } {
  const limit = Math.min(40, lines.length);

  // Priority 1: labeled ("No. Factura: 10578" / "Nro. de Factura 1111458461")
  for (let i = 0; i < limit; i++) {
    const m = INVOICE_LABELED_RE.exec(lines[i]);
    if (!m) continue;
    const raw  = m[1].trim();
    const pfxM = /^([A-Z]{1,4})\s*(\d.*)$/i.exec(raw);
    if (pfxM) {
      return { prefix: pfxM[1].toUpperCase(), invoiceNumber: cleanInvoiceNumber(pfxM[2]) };
    }
    return { prefix: null, invoiceNumber: cleanInvoiceNumber(raw) };
  }

  // Priority 2: standalone prefix+number on its own line ("FE 10578")
  for (let i = 0; i < limit; i++) {
    const m = INVOICE_PREFIX_NUMBER_RE.exec(lines[i]);
    if (!m) continue;
    return { prefix: m[1].toUpperCase(), invoiceNumber: cleanInvoiceNumber(m[2]) };
  }

  return { prefix: null, invoiceNumber: null };
}

// ── CUFE ───────────────────────────────────────────────────────────────────

/**
 * CUFE is a SHA-384 hex digest: exactly 96 lowercase hex characters.
 * Also handles shorter alphanumeric codes from some generators (≥40 chars).
 */
const CUFE_RE = /\bCUFE\s*[:\-]?\s*([0-9a-fA-F]{40,100})/;

function parseCufe(text: string): string | null {
  const m = CUFE_RE.exec(text);
  return m ? m[1].toLowerCase() : null;
}

// ── Due date ───────────────────────────────────────────────────────────────

const DUE_DATE_LABEL_RES: RegExp[] = [
  /(?:fecha\s+(?:de\s+)?vencimiento)\s*[:\-]?\s*([\d\/\-]+)/i,
  /(?:fecha\s+l[ií]mite\s+(?:de\s+)?pago)\s*[:\-]?\s*([\d\/\-]+)/i,
  /(?:fecha\s+(?:de\s+)?pago)\s*[:\-]?\s*([\d\/\-]+)/i,
  /(?:vence?\s+el?)\s*[:\-]?\s*([\d\/\-]+)/i,
  /(?:due\s+date)\s*[:\-]?\s*([\d\/\-]+)/i,
];

function parseDueDate(lines: string[]): Date | null {
  for (const line of lines) {
    for (const re of DUE_DATE_LABEL_RES) {
      const m = re.exec(line);
      if (!m) continue;
      const raw = m[1].trim();
      const iso = DATE_ISO_RE.exec(raw);
      if (iso) { const d = new Date(iso[1]); if (!isNaN(d.getTime())) return d; }
      const dmy = DATE_DMY_RE.exec(raw);
      if (dmy) { const d = parseDateFromDMY(dmy[1], dmy[2], dmy[3]); if (d) return d; }
    }
  }
  return null;
}

// ── Subtotal ───────────────────────────────────────────────────────────────

const SUBTOTAL_FALLBACK_RES: RegExp[] = [
  /\bsubtotal\b\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  /\bbase\s+(?:gravable|iva)\b\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  /\bvalor\s+antes\s+de\s+iva\b\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  /\bbase\s+imponible\b\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
];

function parseSubtotal(annotated: AnnotatedLine[], fullText: string): number | null {
  // Canonical label pass
  for (const { text, canonical } of annotated) {
    if (canonical !== "SUBTOTAL") continue;
    const rest = text.replace(/sub\s*total/i, "").replace(/^[\s$:.\-]*/g, "");
    const m = /^([\d.,]+)/.exec(rest);
    if (m) {
      const n = normalizeAmount(m[1]);
      if (n !== null && n >= AMOUNT_MIN_VALUE) return n;
    }
  }
  // Fallback regex on full text
  for (const re of SUBTOTAL_FALLBACK_RES) {
    const m = re.exec(fullText);
    if (m) {
      const n = normalizeAmount(m[1]);
      if (n !== null && n >= AMOUNT_MIN_VALUE) return n;
    }
  }
  return null;
}

// ── Tax amount ─────────────────────────────────────────────────────────────

const TAX_AMOUNT_RES: RegExp[] = [
  /\bIVA\s*(?:\d+\s*%\s*)?\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  /\btotal\s+iva\b\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  /\bimpuesto\b\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  /\btributo\b\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
];

function parseTaxAmount(fullText: string): number | null {
  for (const re of TAX_AMOUNT_RES) {
    const m = re.exec(fullText);
    if (m) {
      const n = normalizeAmount(m[1]);
      if (n !== null && n > 0) return n;
    }
  }
  return null;
}

// ── Customer info ──────────────────────────────────────────────────────────

const CUSTOMER_NAME_RES: RegExp[] = [
  /(?:se[ñn]or(?:es)?|comprador|adquiri(?:ente|iente)|adquirente)\s*[:\-]\s*([^\n,;$\d]{3,120})/i,
  /(?:nombre\s+del?\s+(?:cliente|comprador|adquiri(?:ente|iente)))\s*[:\-]\s*([^\n,;$\d]{3,120})/i,
  /(?:facturar?\s+a(?:\s+nombre\s+de)?)\s*[:\-]?\s*([^\n,;$\d]{3,120})/i,
  /(?:cliente)\s*[:\-]\s*([^\n,;$\d]{3,120})/i,
];

const CUSTOMER_ID_RES: RegExp[] = [
  /(?:nit\s+del?\s+(?:comprador|cliente|adquiri(?:ente|iente)))\s*[:\-]?\s*(\d[\d.]{5,12}\d(?:\s*-\s*\d)?)/i,
  /(?:cc\s+del?\s+(?:comprador|cliente|adquiri(?:ente|iente)))\s*[:\-]?\s*([\d]{6,12})/i,
];

function parseCustomerInfo(
  lines: string[],
): { customerName: string | null; customerId: string | null } {
  let customerName: string | null = null;
  let customerId:   string | null = null;

  for (const line of lines) {
    if (!customerName) {
      for (const re of CUSTOMER_NAME_RES) {
        const m = re.exec(line);
        if (!m) continue;
        const c = m[1].trim().replace(/\s+/g, " ");
        if (c.length >= 3 && !/^\d/.test(c)) {
          customerName = c.replace(/[.,;:\-]+$/, "").slice(0, 120);
          break;
        }
      }
    }
    if (!customerId) {
      for (const re of CUSTOMER_ID_RES) {
        const m = re.exec(line);
        if (!m) continue;
        customerId = normalizeNit(m[1].trim());
        break;
      }
    }
    if (customerName && customerId) break;
  }

  return { customerName, customerId };
}

/**
 * Zone-aware parser for ELECTRONIC_INVOICE_STANDARD Colombian invoices.
 *
 * Replaces the old whole-text parseColombianElectronicInvoice.
 *
 * Uses classifyInvoiceZones to split the document into:
 *   header    — issuer/customer/date block
 *   table_body — line-item rows (excluded from all field extraction)
 *   summary   — totals block (subtotal, IVA, grand total only from here)
 *   legal     — DIAN resolution text (excluded from all field extraction)
 *
 * Field → zone mapping:
 *   issuerName, issuerId, documentDate, invoiceNumber, prefix,
 *   customerName, customerId, dueDate  →  header only
 *   subtotal, taxAmount, totalAmount   →  summary only
 *   cufe                               →  full text (CUFE appears in footer)
 *   currency                           →  full text (appears anywhere)
 *
 * No full-text fallback for issuerName, amount, or documentDate —
 * if the zone-aware pass finds nothing, the field is left null rather
 * than returning a value extracted from legal/footer context.
 */
function parseColombianInvoiceByZone(
  lines:     string[],
  annotated: AnnotatedLine[],
): {
  result:          ColombianInvoiceResult;
  zoneDebug:       InvoiceZoneDebug;
  pdfHeaderValues: { issuerName: string | null; issuerId: string | null; currency: string | null; documentDate: Date | null };
} {
  const { zones, boundaries } = classifyInvoiceZones(lines);

  // Partition line indices by zone
  const headerIdx:  number[] = [];
  const summaryIdx: number[] = [];
  let tableLines = 0;
  let legalLines = 0;

  for (let i = 0; i < zones.length; i++) {
    switch (zones[i]) {
      case "header":     headerIdx.push(i);  break;
      case "table_body": tableLines++;        break;
      case "summary":    summaryIdx.push(i); break;
      case "legal":      legalLines++;        break;
    }
  }

  const zoneStats: InvoiceZoneDebug["zoneStats"] = {
    headerLines:     headerIdx.length,
    tableLines,
    summaryLines:    summaryIdx.length,
    legalLines,
    tableDetected:   tableLines > 0,
    summaryDetected: summaryIdx.length > 0,
  };

  // Zone-restricted line and annotation arrays
  const headerLines     = headerIdx.map((i) => lines[i]);
  const headerAnnotated = headerIdx.map((i) => annotated[i]);
  const summaryLines    = summaryIdx.map((i) => lines[i]);
  const summaryAnnotated = summaryIdx.map((i) => annotated[i]);
  const headerText      = headerLines.join("\n");
  const summaryText     = summaryLines.join("\n");
  const fullText        = lines.join("\n");

  // ── documentDate — header zone, restricted to issue/generation/emission labels ──
  const DATE_COLOMBIAN_ALLOWED: ReadonlySet<CanonicalLabel> = new Set([
    "DATE_ISSUE", "DATE_GENERATION", "DATE_EMISSION",
  ] as CanonicalLabel[]);
  const dateParse   = parseDateFromLines(headerAnnotated, DATE_COLOMBIAN_ALLOWED);

  // ── issuerName / issuerId — header zone only ──────────────────────────────
  const issuerParse = parseIssuerNameFromLines(headerAnnotated, false);
  const issuerId    = parseIssuerId(headerText);

  // ── totalAmount — summary zone only, high-confidence labels only ──────────
  const amountParse = parseAmountFromLines(summaryAnnotated, [], false, AMOUNT_COLOMBIAN_PRIORITY);

  // ── currency — full text (appears in header, summary, or XML) ────────────
  const currency = parseCurrency(fullText);

  // ── Colombian-specific header fields ─────────────────────────────────────
  const { invoiceNumber, prefix }    = parseInvoiceNumber(headerLines);
  // CUFE appears in the summary/footer area — search full text
  const cufe                         = parseCufe(fullText);
  const dueDate                      = parseDueDate(headerLines.concat(summaryLines));

  // ── Subtotal and tax — summary zone only ──────────────────────────────────
  const subtotal  = parseSubtotal(summaryAnnotated, summaryText);
  const taxAmount = parseTaxAmount(summaryText);

  // ── Customer info — header zone only ─────────────────────────────────────
  const { customerName, customerId } = parseCustomerInfo(headerLines);

  // ── Debug assembly ────────────────────────────────────────────────────────
  const issuerCandidates: IssuerCandidate[] = issuerParse.candidates.map((c) => ({
    ...c,
    reason: `[header-zone] ${c.reason}`,
  }));

  const selectedZones: InvoiceZoneDebug["selectedZones"] = {
    issuerName:   issuerParse.name   !== null ? "header"  : null,
    totalAmount:  amountParse.amount !== null ? "summary" : null,
    documentDate: dateParse.date     !== null ? "header"  : null,
  };

  const zoneDebug: InvoiceZoneDebug = {
    boundaries,
    zoneStats,
    issuerCandidates,
    amountCandidates: amountParse.candidates,
    dateCandidates:   dateParse.candidates,
    selectedZones,
  };

  const result: ColombianInvoiceResult = {
    invoiceNumber,
    prefix,
    cufe,
    customerName,
    customerId,
    dueDate,
    subtotal,
    taxAmount,
    totalAmount: amountParse.amount,
  };

  const pdfHeaderValues = {
    issuerName:   issuerParse.name,
    issuerId,
    currency,
    documentDate: dateParse.date,
  };

  return { result, zoneDebug, pdfHeaderValues };
}

/**
 * Extracts the issuer name from PDF lines using contextual heuristics:
 *
 * 0. Text before "NIT" on the same NIT line — handles pdf2json merging
 *    "INTERACTUAR NIT 890984843-3" onto a single element.
 * 1. Lines immediately before the NIT line — highest confidence, because
 *    Colombian invoices always place the company name above the NIT.
 * 2. Lines immediately before "Responsable de IVA" — common header sequence.
 * 3. First 20 lines of the document (header area) — fallback.
 *
 * Within each zone, closer to the anchor = higher priority.
 * Lines are validated with validateCompanyLine() before being accepted.
 * Returns all evaluated candidates for debug output.
 */
function parseIssuerNameFromLines(
  annotated:   AnnotatedLine[],
  isFedEx:     boolean,
  headerLimit?: number,
): IssuerParseResult {
  const lines = annotated.map((a) => a.text);
  // Use canonical ISSUER_ID to find the NIT/Tax-ID anchor line (catches English labels too)
  const nitIdx = annotated.findIndex(
    (a) => a.canonical === "ISSUER_ID" || /\bNIT\b/i.test(a.text),
  );
  const ivaIdx = lines.findIndex((l) => /responsable\s+de\s+IVA/i.test(l));

  type InternalCandidate = { name: string; score: number };
  const accepted: InternalCandidate[] = [];
  const debugCandidates: IssuerCandidate[] = [];
  const seen = new Set<string>();

  const tryLine = (rawLine: string, score: number, zone: string) => {
    const cleaned = rawLine.trim();
    if (!cleaned) return;
    const name = validateCompanyLine(cleaned);
    const isAccepted = name !== null && !seen.has(name);
    debugCandidates.push({
      line:     cleaned.slice(0, 80),
      score,
      accepted: isAccepted,
      reason:   isAccepted ? `zone:${zone}` : name !== null ? "duplicate" : "validateCompanyLine rejected",
    });
    if (isAccepted) {
      seen.add(name);
      accepted.push({ name, score });
    }
  };

  // Zone 0: text on the NIT line itself, to the LEFT of "NIT"
  // Handles pdf2json collapsing "ACME S.A.S. NIT 900123456-1" onto one line.
  if (nitIdx >= 0) {
    const beforeNit = lines[nitIdx].replace(/\bNIT\b.*/i, "").trim();
    if (beforeNit) tryLine(beforeNit, 110, "nit-same-line");
  }

  // Zone 0.5: lines annotated as ISSUER_NAME canonical (e.g. "Razón Social: ACME S.A.S.")
  // Extract the value after the label separator so only the company name is validated.
  for (let i = 0; i < annotated.length; i++) {
    if (annotated[i].canonical !== "ISSUER_NAME") continue;
    const raw = lines[i];
    // Strip the label prefix ("Razón Social:", "Company Name:", etc.) if present
    const afterColon = raw.replace(/^[^:]+:\s*/, "").trim();
    const candidate  = afterColon || raw;
    tryLine(candidate, 105, "issuer-name-label");
  }

  // Zone 1: up to 4 lines before NIT (score 100 → 97, closest wins)
  if (nitIdx > 0) {
    for (let i = Math.max(0, nitIdx - 4); i < nitIdx; i++) {
      tryLine(lines[i], 100 - (nitIdx - i), "before-nit");
    }
  }

  // Zone 2: up to 6 lines before "Responsable de IVA"
  if (ivaIdx > 0) {
    for (let i = Math.max(0, ivaIdx - 6); i < ivaIdx; i++) {
      tryLine(lines[i], 50 - (ivaIdx - i), "before-iva");
    }
  }

  // Zone 3: header — first N lines (pdf2json can have many header elements).
  // headerLimit restricts the scan to the top portion of the document when the
  // caller knows the issuer block is confined to the header (e.g. Colombian invoices).
  const zone3Limit = headerLimit != null ? Math.min(headerLimit, lines.length) : Math.min(20, lines.length);
  for (let i = 0; i < zone3Limit; i++) {
    tryLine(lines[i], 20 - i, "header");
  }

  // Zone 4 (FedEx-specific): explicit courier name scan up to line 30.
  // FedEx invoices place "FEDERAL EXPRESS DE COLOMBIA S.A.S." or
  // "FEDERAL EXPRESS CORPORATION" in the top block, which may be beyond
  // line 20 in some pdf2json outputs with many header elements.
  if (isFedEx) {
    const FEDEX_ISSUER_RE = /\b(?:FEDERAL\s+EXPRESS|FEDEX\s+(?:DE\s+COLOMBIA|COLOMBIA))\b/i;
    for (let i = 0; i < Math.min(30, lines.length); i++) {
      if (FEDEX_ISSUER_RE.test(lines[i])) {
        tryLine(lines[i], 115 - i, "fedex-header");
      }
    }
  }

  if (accepted.length === 0) return { name: null, candidates: debugCandidates };
  accepted.sort((a, b) => b.score - a.score);
  return { name: accepted[0].name, candidates: debugCandidates };
}

// ═════════════════════════════════════════════════════════════════════════════
// FEDEX BLOCK-AWARE PARSER
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Matches the legal entity name that appears in FedEx Colombian invoices.
 * Handles both the Colombian subsidiary and the US parent entity.
 */
const FEDEX_CORP_RE =
  /\b(?:FEDERAL\s+EXPRESS\s+(?:CORPORATION|DE\s+COLOMBIA|COLOMBIA)|FEDEX\s+(?:DE\s+COLOMBIA|COLOMBIA))\b/i;

/**
 * Block-aware parser for FedEx / courier multi-shipment invoices.
 *
 * Generic line-aware parsers fail on FedEx PDFs because:
 *  – The DIAN legal disclaimer often appears BEFORE the invoice header in the
 *    flattened PDF text, poisoning the "header" zone with legal dates.
 *  – Per-shipment subtotals ("Sub Total $54,67") overwhelm the real global total.
 *  – "FEDERAL EXPRESS CORPORATION" may be beyond the 20-line header scan.
 *
 * This function solves all three problems by operating strictly on structurally
 * identified blocks:
 *
 *  headerBlock   — pre-table lines with legal lines removed → safe for date + issuer
 *  lineItemBlock — shipment rows → completely ignored for date and amount
 *  footerBlock   — post-TOTAL lines → preferred source for global invoice total
 *
 * Does NOT fall back to parseDate(fullText) — if no date is found in the
 * header block, documentDate is left null rather than returning a legal year.
 */
function parseFedExDocument(
  lines:     string[],
  annotated: AnnotatedLine[],
  positionAwareMeta?: {
    usedPositionAware:    boolean;
    reconstructedRowCount: number;
    pageRegions:          FedExDebugInfo["pageRegions"];
  },
): FedExParseOutput {
  const blocks      = splitFedExBlocks(lines);
  const headerSet   = new Set(blocks.headerLines);
  const lineItemSet = new Set(blocks.lineItemLines);
  const footerSet   = new Set(blocks.footerLines);

  const headerCandidates: FedExDebugInfo["headerCandidates"] = [];
  const totalCandidates:  AmountCandidate[]                  = [];
  const dateCandidates:   DateCandidate[]                    = [];

  // ── 1. IssuerName ──────────────────────────────────────────────────────────
  // Search up to line 50 for "FEDERAL EXPRESS CORPORATION" or any recognisable
  // FedEx legal entity name.  The generic issuer parser caps at 20–30 lines and
  // may miss the corporate header in heavily padded pdf2json output.
  let issuerName: string | null = null;
  const issuerLimit = Math.min(50, lines.length);

  for (let i = 0; i < issuerLimit; i++) {
    const line = lines[i];
    if (!FEDEX_CORP_RE.test(line) && !FEDEX_DOCUMENT_RE.test(line)) continue;
    const cleaned = validateCompanyLine(line);
    headerCandidates.push({
      field:       "issuerName",
      rawValue:    line.trim().slice(0, 100),
      parsedValue: cleaned,
      lineIdx:     i,
      line:        line.trim().slice(0, 100),
    });
    if (cleaned && !issuerName) issuerName = cleaned;
  }

  // ── 2. IssuerID (NIT) ──────────────────────────────────────────────────────
  // Prefer a NIT found in the header block; fall back to full-document scan.
  let issuerId: string | null = null;
  for (const idx of blocks.headerLines) {
    const m = NIT_RE.exec(lines[idx]);
    if (m) {
      issuerId = normalizeNit(m[1].trim());
      headerCandidates.push({
        field:       "issuerId",
        rawValue:    m[0],
        parsedValue: issuerId,
        lineIdx:     idx,
        line:        lines[idx].trim().slice(0, 100),
      });
      break;
    }
  }
  if (!issuerId) issuerId = parseIssuerId(lines.join("\n"));

  // ── 3. DocumentDate ────────────────────────────────────────────────────────
  // ONLY search the clean header block (legal lines already excluded).
  // Never read from line_item or footer — those contain shipment dates.
  // Never fall back to parseDate(fullText) — that would pick up legal dates.
  let documentDate: Date | null = null;

  outer_date: for (const { canonical, fallbackRe, label } of LINE_DATE_LABELS) {
    for (const idx of blocks.headerLines) {
      const ann = annotated[idx];

      const matchedByCanonical = canonical !== null && ann.canonical === canonical;
      const matchedByFallback  =
        !matchedByCanonical &&
        (canonical === null ? ann.canonical === null : true) &&
        fallbackRe.test(ann.text);
      if (!matchedByCanonical && !matchedByFallback) continue;

      // Reject bad label canonicals
      if (ann.canonical === "DATE_CONTROL" || ann.canonical === "DATE_SHIPMENT") {
        dateCandidates.push({ raw: ann.text.slice(0, 80), normalized: null, label, zone: "header", accepted: false, reason: "rejected canonical label" });
        continue;
      }
      if (DATE_REJECT_LABEL_RE.test(ann.text)) {
        dateCandidates.push({ raw: ann.text.slice(0, 80), normalized: null, label, zone: "header", accepted: false, reason: "rejected label (control/envío/entrega)" });
        continue;
      }

      // Try date on the same line
      const sameLine = parseDate(ann.text);
      if (sameLine) {
        const iso = sameLine.toISOString().slice(0, 10);
        dateCandidates.push({ raw: ann.text.slice(0, 80), normalized: iso, label, zone: "header", accepted: true, reason: "fedex-header same-line" });
        documentDate = sameLine;
        break outer_date;
      }

      // Try next non-empty line — only if it also belongs to the header block
      const nextIdx = idx + 1;
      if (nextIdx < lines.length && headerSet.has(nextIdx)) {
        const next = lines[nextIdx].trim();
        if (next) {
          const nextDate = parseDate(next);
          if (nextDate) {
            const iso = nextDate.toISOString().slice(0, 10);
            dateCandidates.push({ raw: next.slice(0, 80), normalized: iso, label, zone: "header", accepted: true, reason: "fedex-header next-line" });
            documentDate = nextDate;
            break outer_date;
          }
        }
      }

      dateCandidates.push({ raw: ann.text.slice(0, 80), normalized: null, label, zone: "header", accepted: false, reason: "label matched but no parseable date on line or next line" });
    }
  }

  // Fallback within the header block only: any bare DD-MM-YYYY or ISO date on
  // a line that had no label match (covers "02-03-2026" beside the invoice number).
  if (!documentDate) {
    for (const idx of blocks.headerLines) {
      const line = lines[idx];
      const dmy = DATE_DMY_RE.exec(line);
      if (dmy) {
        const d = parseDateFromDMY(dmy[1], dmy[2], dmy[3]);
        if (d) {
          const iso = d.toISOString().slice(0, 10);
          dateCandidates.push({ raw: line.slice(0, 80), normalized: iso, label: "standalone-dmy", zone: "header", accepted: true, reason: "fedex-header standalone DMY date" });
          documentDate = d;
          break;
        }
      }
      const isoM = DATE_ISO_RE.exec(line);
      if (isoM) {
        const d = new Date(isoM[1]);
        if (!isNaN(d.getTime())) {
          dateCandidates.push({ raw: line.slice(0, 80), normalized: isoM[1], label: "standalone-iso", zone: "header", accepted: true, reason: "fedex-header standalone ISO date" });
          documentDate = d;
          break;
        }
      }
    }
  }

  // ── 4. Amount (global invoice total) ──────────────────────────────────────
  // Search footer block first (where the grand total lives), then header.
  // Line-item lines are completely excluded.
  let amount:      number | null          = null;
  let amountBlock: "header" | "footer" | null = null;

  // Footer lines first, then header lines — never line_item
  const amountSearchOrder = [...blocks.footerLines, ...blocks.headerLines];

  outer_amount: for (const { canonical, fallbackRe } of AMOUNT_CANONICAL_PRIORITY) {
    for (const idx of amountSearchOrder) {
      if (lineItemSet.has(idx)) continue;
      const ann  = annotated[idx];
      const zone: DateZone = footerSet.has(idx) ? "footer" : "header";

      const matched =
        ann.canonical === canonical ||
        fallbackRe.test(ann.text);
      if (!matched) continue;

      const labelText = ann.canonical === canonical
        ? `${canonical} (canonical)`
        : (fallbackRe.exec(ann.text)?.[0] ?? String(canonical)).trim();

      // Strategy 1: value on the same line
      const restOfLine = ann.text.replace(fallbackRe, "").replace(/^[\s$:.\-]*/g, "");
      const sameM = /^([\d.,]+)/.exec(restOfLine);
      if (sameM) {
        const raw      = sameM[1];
        const n        = normalizeAmount(raw);
        const accepted = n !== null && n >= AMOUNT_MIN_VALUE;
        totalCandidates.push({
          label:           labelText,
          rawValue:        raw,
          normalizedValue: n,
          zone,
          accepted,
          reason: accepted
            ? `fedex-${zone} same-line`
            : `fragment: ${n} < minimum ${AMOUNT_MIN_VALUE}`,
        });
        if (accepted) { amount = n; amountBlock = zone; break outer_amount; }
        continue;
      }

      // Strategy 2: value on the next non-line-item line
      const nextIdx = idx + 1;
      if (nextIdx < lines.length && !lineItemSet.has(nextIdx)) {
        const next = lines[nextIdx].trim();
        if (next && /^\$?\s*\d/.test(next)) {
          const raw      = next.replace(/[^0-9.,]/g, "").trim();
          const n        = normalizeAmount(raw);
          const accepted = n !== null && n >= AMOUNT_MIN_VALUE;
          totalCandidates.push({
            label:           labelText,
            rawValue:        raw,
            normalizedValue: n,
            zone,
            accepted,
            reason: accepted
              ? `fedex-${zone} next-line`
              : `fragment: ${n} < minimum ${AMOUNT_MIN_VALUE}`,
          });
          if (accepted) { amount = n; amountBlock = zone; break outer_amount; }
        }
      }
    }
  }

  // ── 5. Currency ────────────────────────────────────────────────────────────
  // Use the full-text currency detector (handles "COP", "pesos colombianos", NIT
  // context etc.).  For Colombian FedEx invoices that have no explicit code, infer
  // COP from Colombian context signals when the detector returns null.
  const fullText      = lines.join("\n");
  const currDetection = detectCurrency(fullText);
  let currency        = currDetection.selectedCurrency;
  if (!currency && CO_CONTEXT_SIGNALS.some((re) => re.test(fullText))) {
    currency = "COP";
  }

  // ── Debug object ───────────────────────────────────────────────────────────
  const debug: FedExDebugInfo = {
    fedexBlocksDetected:   true,
    headerLineCount:       blocks.headerLines.length,
    lineItemLineCount:     blocks.lineItemLines.length,
    footerLineCount:       blocks.footerLines.length,
    legalLineCount:        blocks.legalLines.length,
    headerCandidates,
    totalCandidates,
    dateCandidates,
    selectedBlock:         amountBlock,
    issuerSearched:        true,
    // Position-aware fields (populated from the caller's reconstruction pass)
    usedPositionAware:     positionAwareMeta?.usedPositionAware     ?? false,
    reconstructedRowCount: positionAwareMeta?.reconstructedRowCount ?? 0,
    pageRegions:           positionAwareMeta?.pageRegions           ?? [],
    // Sampled rows for inspection
    selectedHeaderRows:  blocks.headerLines.slice(0, 15).map((i) => lines[i] ?? ""),
    selectedSummaryRows: blocks.footerLines.slice(0, 15).map((i) => lines[i] ?? ""),
  };

  return { issuerName, issuerId, amount, currency, documentDate, debug };
}

// ═════════════════════════════════════════════════════════════════════════════
// JSON FIELD EXTRACTOR
// ═════════════════════════════════════════════════════════════════════════════

interface RawExtraction {
  issuerName:   string | null;
  issuerId:     string | null;
  amount:       number | null;
  currency:     string | null;
  documentDate: Date | null;
}

function extractFromJsonObject(json: unknown): Partial<RawExtraction> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const obj = json as Record<string, unknown>;

  return {
    issuerName:
      pickString(obj, [
        "issuerName", "issuer", "emisor", "razonSocial", "razon_social",
        "proveedor", "supplier", "vendor", "empresa",
      ]),
    issuerId:
      pickString(obj, [
        "issuerId", "nit", "rfc", "ruc", "cuit", "rif", "rut",
        "taxId", "tax_id", "id_emisor", "identificacion",
      ]),
    currency:
      pickString(obj, ["currency", "moneda", "divisa", "cur", "tipo_moneda"]),
    amount:
      pickNumber(obj, [
        "amount", "total", "totalAPagar", "total_a_pagar",
        "valorTotal", "valor_total", "monto", "valor", "subtotal",
        "value", "importe",
      ]),
    documentDate:
      pickDate(obj, [
        "documentDate", "fechaEmision", "fecha_emision", "fecha",
        "date", "invoice_date", "fecha_documento", "issued_at", "issuedAt",
        "fechaFactura", "fecha_factura",
      ]),
  };
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    if (typeof obj[k] === "string" && (obj[k] as string).trim())
      return (obj[k] as string).trim();
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && isFinite(v) && v > 0) return v;
    if (typeof v === "string") {
      const n = normalizeAmount(v);
      if (n !== null) return n;
    }
  }
  return null;
}

function pickDate(obj: Record<string, unknown>, keys: string[]): Date | null {
  for (const k of keys) {
    const v = obj[k];
    if (!v) continue;
    const d = new Date(String(v));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// EXTRACTION PIPELINE
// ═════════════════════════════════════════════════════════════════════════════

type DocumentInput = {
  title:        string;
  description:  string | null;
  category:     string | null;
  metadataJson: unknown;
  /**
   * Fields extracted from a linked XML invoice file (UBL / CFDI).
   * When present, XML values are used as the second-priority source after
   * structured metadataJson and before embedded PDF text.
   */
  xmlFields:    XmlInvoiceFields | null;
  /** Embedded text extracted from a linked PDF file. Takes priority over description and title. */
  pdfText:      string | null;
  /**
   * Position-aware text items from pdf2json (x/y in inches, page-relative).
   * Present only for FedEx/courier invoices — obtained via extractPdfItems()
   * when the primary parser did not expose positions (pdf-parse path).
   * When non-empty, FedEx block detection uses reconstructed visual rows
   * instead of the flattened joined text.
   */
  pdfItems:     PdfTextItem[];
  file:         { name: string } | null;
};

/**
 * Runs all extractors across all available input sources in priority order.
 *
 * Priority: metadataJson > pdf (line-aware + full-text) > description > title > filename
 *
 * For PDF text the extraction runs in two passes:
 *   1. Line-aware parsers — handle label-on-line-N / value-on-line-N+1 patterns and
 *      unlabeled uppercase company names near NIT. These are specific to multi-line
 *      invoice layouts that full-text regex cannot reliably handle.
 *   2. Full-text regex fallback — catches anything the line-aware pass missed
 *      (e.g. label and value on the same line, ISO dates, inline NIT).
 *
 * Each field is filled independently — amount may come from pdf while currency
 * comes from description. This is intentional and correct (cross-source).
 */
function extractFinancialFields(doc: DocumentInput): ExtractedFields {
  // Source 1: structured JSON metadata
  const meta = extractFromJsonObject(doc.metadataJson);

  // Source 2: XML invoice fields (second priority, after metadata, before PDF)
  const xml = doc.xmlFields;

  // Classify the document before choosing the extraction path.
  // Use the richest available text in priority order.
  const classificationText =
    (doc.pdfText?.trim()) ||
    [doc.description, doc.category].filter(Boolean).join("\n") ||
    doc.title;
  const classification = classifyDocument(classificationText);

  // Source 3: embedded PDF text
  const pdfText  = doc.pdfText?.trim() || "";
  const pdfLines = pdfText ? pdfText.split(/\r?\n/) : [];

  // Annotate lines with canonical labels once — shared by all line-aware parsers.
  const annotated = pdfText ? annotatePdfLines(pdfLines) : null;

  // Detect FedEx — determines which parser path to use below.
  const isFedEx = pdfLines.some((l) => FEDEX_DOCUMENT_RE.test(l));

  // Source 4–6: free text, title, filename
  const descText     = [doc.description, doc.category].filter(Boolean).join("\n");
  const titleText    = doc.title;
  const filenameText = doc.file?.name
    ? doc.file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")
    : "";

  // resolve() picks the best available value across all sources in priority order.
  // Priority: metadataJson > xml > pdf > description > title > filename
  function resolve<T>(
    metaVal:  T | null | undefined,
    xmlVal:   T | null | undefined,
    pdfVal:   T | null | undefined,
    textFn:   (t: string) => T | null,
  ): FieldResult<T> {
    if (metaVal != null) return { value: metaVal, source: "metadata" };
    if (xmlVal  != null) return { value: xmlVal,  source: "xml" };
    if (pdfVal  != null) return { value: pdfVal,  source: "pdf" };
    if (descText) {
      const v = textFn(descText);
      if (v != null) return { value: v, source: "description" };
    }
    if (titleText) {
      const v = textFn(titleText);
      if (v != null) return { value: v, source: "title" };
    }
    if (filenameText) {
      const v = textFn(filenameText);
      if (v != null) return { value: v, source: "filename" };
    }
    return { value: null, source: null };
  }

  // resolveXmlOnly() is used for fields that only XML provides (receiverName, receiverId).
  function resolveXmlOnly<T>(xmlVal: T | null | undefined): FieldResult<T> {
    if (xmlVal != null) return { value: xmlVal, source: "xml" };
    return { value: null, source: null };
  }

  // ── FedEx block-aware parser path ─────────────────────────────────────────
  // When the document is a FedEx/courier multi-shipment invoice, delegate to a
  // specialised block parser that splits the PDF into clean header / line-item /
  // footer blocks and extracts each field from the appropriate block only.
  //
  // POSITION-AWARE MODE (preferred):
  //   When pdf2json text items with x/y coordinates are available (doc.pdfItems),
  //   visual rows are reconstructed by grouping items with similar y-values before
  //   block classification runs.  This fixes the root cause of headerLineCount=0:
  //   the flat join of all text items on one page into a single string merges the
  //   legal disclaimer with the invoice header, causing the legal-window overlay
  //   to mark every header line as legal and leaving no clean header lines.
  //
  // FALLBACK MODE (flat text):
  //   Used when no items are available (rare: pdf-parse succeeded on first pass).
  if (isFedEx && annotated) {
    // Determine whether position-aware rows can be used
    const hasItems = doc.pdfItems.length > 0;
    let fedexLines    = pdfLines;
    let fedexAnnotated = annotated;
    let positionAwareMeta: Parameters<typeof parseFedExDocument>[2] | undefined;

    if (hasItems) {
      const { rows, pageRegions } = reconstructRowsFromItems(doc.pdfItems);
      if (rows.length > 0) {
        fedexLines     = rows;
        fedexAnnotated = annotatePdfLines(rows);
        positionAwareMeta = {
          usedPositionAware:    true,
          reconstructedRowCount: rows.length,
          pageRegions,
        };
      }
    }

    const fedex = parseFedExDocument(fedexLines, fedexAnnotated, positionAwareMeta);
    return {
      issuerName:   resolve(meta.issuerName,   xml?.issuerName,   fedex.issuerName,   parseIssuerName),
      issuerId:     resolve(meta.issuerId,     xml?.issuerId,     fedex.issuerId,     parseIssuerId),
      receiverName: resolveXmlOnly(xml?.customerName),
      receiverId:   resolveXmlOnly(xml?.customerId),
      amount:       resolve(meta.amount,       xml?.totalAmount,  fedex.amount,       parseAmount),
      currency:     resolve(meta.currency,     xml?.currency,     fedex.currency,     parseCurrency),
      documentDate: resolve(meta.documentDate, xml?.documentDate, fedex.documentDate, parseDate),
      amountCandidates: fedex.debug.totalCandidates,
      issuerCandidates: [],   // FedEx issuer info lives in fedexDebug.headerCandidates
      dateCandidates:   fedex.debug.dateCandidates,
      isFedExDocument:  true,
      normalizedLabels: summarizeAnnotations(fedexAnnotated),
      fedexDebug:       fedex.debug,
      xmlExtraction:    null, // populated in processFinancialDocument
      documentClassification: classification,
      colombianInvoice:       null,
      invoiceZoneDebug:       null,
    };
  }

  // ── Colombian electronic invoice path — zone-aware ────────────────────────
  // Uses classifyInvoiceZones to split the document into header / table_body /
  // summary / legal blocks and extracts each field from the appropriate zone only.
  // No full-text fallback for issuerName, totalAmount, or documentDate — those
  // fields are only accepted from their designated zones.
  if (classification.family === "ELECTRONIC_INVOICE_STANDARD" && annotated) {
    const { result: colombian, zoneDebug, pdfHeaderValues } =
      parseColombianInvoiceByZone(pdfLines, annotated);

    // Merge XML-sourced dueDate and cufe into the Colombian result.
    // XML is authoritative for these fields when present — the PDF parser
    // derives dueDate from free-form payment terms lines and cufe from a long
    // hex string in the legal footer; the XML UUID element is unambiguous.
    const colombianWithXml: ColombianInvoiceResult = {
      ...colombian,
      dueDate: xml?.dueDate ?? colombian.dueDate,
      cufe:    xml?.cufe    ?? colombian.cufe,
    };

    return {
      issuerName:   resolve(meta.issuerName,   xml?.issuerName,   pdfHeaderValues.issuerName,   parseIssuerName),
      issuerId:     resolve(meta.issuerId,     xml?.issuerId,     pdfHeaderValues.issuerId,      parseIssuerId),
      receiverName: resolve(null,              xml?.customerName, colombian.customerName,         (_: string) => null),
      receiverId:   resolve(null,              xml?.customerId,   colombian.customerId,           (_: string) => null),
      amount:       resolve(meta.amount,       xml?.totalAmount,  colombian.totalAmount,          parseAmount),
      currency:     resolve(meta.currency,     xml?.currency,     pdfHeaderValues.currency,       parseCurrency),
      documentDate: resolve(meta.documentDate, xml?.documentDate, pdfHeaderValues.documentDate,   (_: string) => null),
      amountCandidates: zoneDebug.amountCandidates,
      issuerCandidates: zoneDebug.issuerCandidates,
      dateCandidates:   zoneDebug.dateCandidates,
      isFedExDocument:  false,
      normalizedLabels: summarizeAnnotations(annotated),
      fedexDebug:       null,
      xmlExtraction:    null, // populated in processFinancialDocument
      documentClassification: classification,
      colombianInvoice:       colombianWithXml,
      invoiceZoneDebug:       zoneDebug,
    };
  }

  // Shared line-aware parsers — used only by the generic (non-FedEx, non-Colombian) path.
  const zones       = pdfLines.length ? classifyLineZones(pdfLines) : ([] as DateZone[]);
  const issuerParse = annotated ? parseIssuerNameFromLines(annotated, false) : null;
  const amountParse = annotated ? parseAmountFromLines(annotated, zones, false) : null;
  const dateParse   = annotated ? parseDateFromLines(annotated) : null;

  // Suppress full-text fallback when line-aware parser ran and explicitly rejected
  // every candidate — the full-text fallback has no zone or legal-context guards.
  // The fallback is preserved when zero candidates were found (unlabelled PDFs).
  const dateLineAwareHadCandidates   = (dateParse?.candidates.length   ?? 0) > 0;
  const amountLineAwareHadCandidates = (amountParse?.candidates.length ?? 0) > 0;

  const pdfDateValue =
    dateParse?.date ??
    (dateLineAwareHadCandidates ? null : (pdfText ? parseDate(pdfText) : null));

  const pdfAmountValue =
    amountParse?.amount ??
    (amountLineAwareHadCandidates ? null : (pdfText ? parseAmount(pdfText) : null));

  const pdfValues = pdfText
    ? {
        issuerName:   issuerParse!.name ?? parseIssuerName(pdfText),
        issuerId:     parseIssuerId(pdfText),
        amount:       pdfAmountValue,
        currency:     parseCurrency(pdfText),
        documentDate: pdfDateValue,
      }
    : null;

  // ── Generic line-aware parser path (non-FedEx, non-standard-invoice) ──────
  return {
    issuerName:   resolve(meta.issuerName,   xml?.issuerName,   pdfValues?.issuerName,   parseIssuerName),
    issuerId:     resolve(meta.issuerId,     xml?.issuerId,     pdfValues?.issuerId,     parseIssuerId),
    receiverName: resolveXmlOnly(xml?.customerName),
    receiverId:   resolveXmlOnly(xml?.customerId),
    amount:       resolve(meta.amount,       xml?.totalAmount,  pdfValues?.amount,       parseAmount),
    currency:     resolve(meta.currency,     xml?.currency,     pdfValues?.currency,     parseCurrency),
    documentDate: resolve(meta.documentDate, xml?.documentDate, pdfValues?.documentDate, parseDate),
    amountCandidates: amountParse?.candidates         ?? [],
    issuerCandidates: issuerParse?.candidates         ?? [],
    dateCandidates:   dateParse?.candidates           ?? [],
    isFedExDocument:  false,
    normalizedLabels: annotated ? summarizeAnnotations(annotated) : {},
    fedexDebug:       null,
    xmlExtraction:    null, // populated in processFinancialDocument
    documentClassification: classification,
    colombianInvoice:       null,
    invoiceZoneDebug:       null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// EXTRACTION SUMMARY (exported helper)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns a compact human-readable summary of what was extracted and from
 * which source. Useful for debugging and for storing in extractedJson.
 *
 * Example: 'issuer="ACME S.A.S." [description], id="900123456-1" [description],
 *           amount=1500000 [description], currency=COP [title],
 *           date=2024-01-15 [metadata]'
 */
export function buildExtractionSummary(
  extracted: ProcessDocumentResult["extracted"],
  sources: string[]
): string {
  const parts: string[] = [];
  if (extracted.issuerName)               parts.push(`issuer="${extracted.issuerName}"`);
  if (extracted.issuerId)                 parts.push(`id="${extracted.issuerId}"`);
  if (extracted.amount != null)           parts.push(`amount=${extracted.amount}`);
  if (extracted.currency)                 parts.push(`currency=${extracted.currency}`);
  if (extracted.documentDate)             parts.push(`date=${extracted.documentDate.slice(0, 10)}`);
  if (parts.length === 0) return "no fields extracted";
  const fieldsSummary = parts.join(", ");
  return sources.length > 0
    ? `${fieldsSummary} — sources: ${sources.join(", ")}`
    : fieldsSummary;
}

// ═════════════════════════════════════════════════════════════════════════════
// XML-FIRST FIELD VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Validation statuses for extracted document fields.
 *
 *   VALID            — all 7 required fields present + math checks pass
 *   INCOMPLETE       — one or more required fields are missing
 *   REVIEW_REQUIRED  — all required fields present but a cross-field check failed
 */
export type ValidationStatus = "VALID" | "INCOMPLETE" | "REVIEW_REQUIRED";

export interface DocumentValidationResult {
  validationStatus:   ValidationStatus;
  /** Hard errors: required fields that are null. */
  validationErrors:   string[];
  /** Soft warnings: fields present but cross-field logic is suspicious. */
  validationWarnings: string[];
}

/**
 * Validates the final set of extracted fields for a Colombian electronic invoice.
 *
 * Required for VALID:
 *   issuerId, customerId, invoiceNumber, documentDate,
 *   totalAmount, currency, cufe
 *
 * Math check (when all three are present):
 *   |subtotal + taxAmount − totalAmount| ≤ max(1, totalAmount × 0.5%)
 *
 * A tolerance of 0.5% is used to absorb integer rounding in DIAN invoices
 * (e.g. TaxAmount 2738 vs computed 2738.28 in line-level tax vs header tax).
 */
export function validateDocumentFields(input: {
  issuerId:      string | null;
  customerId:    string | null;
  invoiceNumber: string | null;
  documentDate:  Date   | null;
  totalAmount:   number | null;
  currency:      string | null;
  cufe:          string | null;
  subtotal:      number | null;
  taxAmount:     number | null;
}): DocumentValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!input.issuerId)              errors.push("issuerId missing");
  if (!input.customerId)            errors.push("customerId missing");
  if (!input.invoiceNumber)         errors.push("invoiceNumber missing");
  if (!input.documentDate)          errors.push("documentDate missing");
  if (input.totalAmount == null)    errors.push("totalAmount missing");
  if (!input.currency)              errors.push("currency missing");
  if (!input.cufe)                  errors.push("cufe missing");

  // Math check: subtotal + taxAmount should equal totalAmount (within tolerance)
  if (input.subtotal != null && input.taxAmount != null && input.totalAmount != null && input.totalAmount > 0) {
    const computed  = input.subtotal + input.taxAmount;
    const diff      = Math.abs(computed - input.totalAmount);
    const tolerance = Math.max(1, input.totalAmount * 0.005);
    if (diff > tolerance) {
      warnings.push(
        `subtotal(${input.subtotal})+taxAmount(${input.taxAmount})=${computed} ` +
        `does not match totalAmount(${input.totalAmount}), diff=${diff.toFixed(2)}`
      );
    }
  }

  const validationStatus: ValidationStatus =
    errors.length > 0   ? "INCOMPLETE" :
    warnings.length > 0 ? "REVIEW_REQUIRED" :
                          "VALID";

  return { validationStatus, validationErrors: errors, validationWarnings: warnings };
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Processes a financial document:
 * 1. Validates it is a financial document type and is not already reviewed.
 * 2. Extracts structured fields from available inputs (no OCR, no LLM).
 * 3. Updates only null document fields — existing user-provided values are preserved.
 * 4. Creates a Run + Event on success; Run + Alert on failure.
 */
export async function processFinancialDocument(
  documentId: string,
  organizationId: string,
  userId?: string
): Promise<ProcessDocumentResult> {
  const now = new Date();

  // ── 1. Load document ───────────────────────────────────────────────────────
  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId, deletedAt: null },
    select: {
      id:           true,
      title:        true,
      description:  true,
      category:     true,
      type:         true,
      status:       true,
      projectId:    true,
      issuerName:   true,
      issuerId:     true,
      receiverName: true,
      receiverId:   true,
      amount:       true,
      currency:     true,
      documentDate: true,
      metadataJson:  true,
      extractedJson: true,   // needed to read existing operator overrides
      file:          { select: { name: true, url: true, mimeType: true } },
    },
  });

  if (!document) throw new Error("DOCUMENT_NOT_FOUND");

  if (!FINANCIAL_DOC_TYPES.includes(document.type)) {
    throw new Error("NOT_A_FINANCIAL_DOCUMENT");
  }

  // REVIEWED means a human has signed off — do not re-process automatically.
  if (document.status === "REVIEWED") {
    throw new Error("DOCUMENT_ALREADY_REVIEWED");
  }

  // ── 2. Create Run ──────────────────────────────────────────────────────────
  const run = await prisma.run.create({
    data: {
      organizationId,
      projectId: document.projectId ?? null,
      type:      RUN_TYPE,
      status:    RunStatus.RUNNING,
      startedAt: now,
      inputJson: { documentId, documentType: document.type, triggeredBy: userId ?? "system" },
    },
    select: { id: true },
  });

  try {
    // ── 3. Extract embedded PDF text (best-effort, never throws) ─────────────
    const pdfExtraction = document.file?.url
      ? await extractPdfText(document.file.url, document.file.mimeType ?? null)
      : { text: "", hasText: false, parserUsed: null, resolvedSource: "none" as const, resolvedPath: undefined, debugReason: undefined, items: undefined, timeoutMs: undefined };
    const pdfText = pdfExtraction.text;

    // ── 3a-check. Bail early on PDF_TIMEOUT ───────────────────────────────────
    // A timed-out PDF is unrecoverable in this run — extraction would produce
    // empty text regardless of how many more passes we attempt.  Continue the
    // run so the document is stamped with status=PROCESSED and extractedJson
    // is stored with the timeout debug info; no Alert is emitted here because
    // the run itself succeeds (it simply had no PDF text to work with).
    // If the caller needs to signal the timeout upstream they can inspect
    // extractedJson.pdfExtraction.debugReason === "PDF_TIMEOUT".
    //
    // No early return here — the rest of the pipeline runs normally; it will
    // just have pdfText="" and fall back to metadata / XML / description sources.

    // ── 3b. Position-aware items for FedEx documents ──────────────────────────
    // FedEx block detection requires visual rows reconstructed from x/y positions.
    // When pdf2json was the parser, items are already in pdfExtraction.items.
    // When pdf-parse was the parser (items absent), we run a secondary pdf2json
    // pass specifically to obtain item positions — this only happens for FedEx.
    //
    // Quick pre-check: test the flat text to decide whether to fetch items.
    // This avoids the secondary parse for all non-FedEx documents.
    const mightBeFedEx = FEDEX_DOCUMENT_RE.test(pdfText);
    let pdfItems: PdfTextItem[] = pdfExtraction.items ?? [];

    if (
      mightBeFedEx &&
      pdfItems.length === 0 &&
      document.file?.url &&
      // Skip if the primary pass already timed out — same PDF would hang again
      pdfExtraction.debugReason !== "PDF_TIMEOUT"
    ) {
      // Secondary pdf2json pass — position data only, best-effort, never throws
      pdfItems = await extractPdfItems(
        document.file.url,
        document.file.mimeType ?? null,
      );
    }

    // ── 3c. XML invoice extraction ────────────────────────────────────────────
    // Attempt XML extraction when the document file is an XML invoice.
    // XML is the highest-confidence source after structured metadataJson.
    const mimeType = document.file?.mimeType ?? null;
    const fileName = document.file?.name ?? "";
    const isXml =
      document.type === "XML" ||
      mimeType === "text/xml" ||
      mimeType === "application/xml" ||
      fileName.toLowerCase().endsWith(".xml");

    let xmlExtraction: XmlExtractResult | null = null;
    let xmlFields:     XmlInvoiceFields | null  = null;

    if (isXml && document.file?.url) {
      xmlExtraction = await extractXmlInvoice(document.file.url, mimeType);
      if (xmlExtraction.success) {
        xmlFields = xmlExtraction.fields;
      }
    }

    // ── 4. Extract structured fields ─────────────────────────────────────────
    const extracted = extractFinancialFields({
      title:        document.title,
      description:  document.description,
      category:     document.category,
      metadataJson: document.metadataJson,
      xmlFields,
      pdfText:      pdfText || null,
      pdfItems,
      file:         document.file,
    });

    // Attach the raw XML extraction result for debug storage
    extracted.xmlExtraction = xmlExtraction;

    const contributingSources = Array.from(
      new Set(
        [
          extracted.issuerName.source,
          extracted.issuerId.source,
          extracted.receiverName.source,
          extracted.receiverId.source,
          extracted.amount.source,
          extracted.currency.source,
          extracted.documentDate.source,
        ].filter((s): s is SourceName => s !== null)
      )
    );

    // ── Processing mode ────────────────────────────────────────────────────────
    // Describes which extraction path(s) actually contributed the final values.
    // Primarily used as a badge in the document detail UI to communicate how
    // confident the pipeline is in the extracted data.
    const sourceSet = new Set(contributingSources);
    const xmlAttempted = isXml && xmlExtraction !== null;
    const xmlSucceeded = xmlAttempted && (xmlExtraction?.success ?? false);
    const xmlContributed = sourceSet.has("xml");
    const pdfContributed = sourceSet.has("pdf");
    // Count core fields that ended up non-null
    const coreFieldCount = [
      extracted.issuerName.value,
      extracted.issuerId.value,
      extracted.amount.value,
      extracted.documentDate.value,
    ].filter(Boolean).length;

    type ProcessingMode = "xml-first" | "pdf-fallback" | "xml-and-pdf" | "manual-review-needed";
    const processingMode: ProcessingMode =
      coreFieldCount < 2                         ? "manual-review-needed" :
      xmlContributed && pdfContributed            ? "xml-and-pdf"         :
      xmlContributed                              ? "xml-first"           :
                                                    "pdf-fallback";

    // ── XML auto-resolution ────────────────────────────────────────────────────
    // When XML extraction succeeded, directly fill any required field that is
    // still null after the general extraction pass.  We check the XML source
    // explicitly (not just `extracted.*`) to catch cases where the field-merge
    // heuristics left a gap.
    //
    // Rules:
    //  - Only fill fields that are null in the DB AND null in extracted result.
    //  - Skip any field that already has an operator override — their deliberate
    //    choice must not be silently replaced by a new extraction run.
    //  - Track every auto-resolved field in autoResolvedFields[] for the audit.

    const existingOverrideKeys = new Set<string>(
      Object.keys(
        (
          (document.extractedJson as Record<string, unknown> | null)?.overrides ?? {}
        ) as Record<string, unknown>
      )
    );

    const autoResolvedFields: string[] = [];

    // Effective values — start from extraction output, then layer XML on top.
    let effectiveIssuerId   = extracted.issuerId.value;
    let effectiveReceiverId = extracted.receiverId.value;
    let effectiveAmount     = extracted.amount.value;
    let effectiveCurrency   = extracted.currency.value;

    if (xmlExtraction?.success && xmlFields) {
      if (!effectiveIssuerId && xmlFields.issuerId && !existingOverrideKeys.has("issuerId")) {
        effectiveIssuerId = xmlFields.issuerId;
        autoResolvedFields.push("issuerId");
      }
      // customerId in XML maps to receiverId in the document model
      if (!effectiveReceiverId && xmlFields.customerId && !existingOverrideKeys.has("receiverId")) {
        effectiveReceiverId = xmlFields.customerId;
        autoResolvedFields.push("customerId");
      }
      if (effectiveAmount == null && xmlFields.totalAmount != null && !existingOverrideKeys.has("totalAmount")) {
        effectiveAmount = xmlFields.totalAmount;
        autoResolvedFields.push("totalAmount");
      }
      if (!effectiveCurrency && xmlFields.currency && !existingOverrideKeys.has("currency")) {
        effectiveCurrency = xmlFields.currency;
        autoResolvedFields.push("currency");
      }
    }

    // ── XML-first field validation ─────────────────────────────────────────────
    // Pull Colombian-specific fields (invoiceNumber, cufe, subtotal, taxAmount)
    // from the XML extractor result first, then fall back to the PDF-derived
    // Colombian invoice block so the validation input is always as complete as
    // possible regardless of which path ran.
    // Use effective* values so that auto-resolved fields improve the status.
    const xmlF          = xmlExtraction?.fields ?? null;
    const colombianF    = extracted.colombianInvoice;
    const validation    = validateDocumentFields({
      issuerId:      effectiveIssuerId,
      customerId:    effectiveReceiverId,
      invoiceNumber: xmlF?.invoiceNumber      ?? colombianF?.invoiceNumber ?? null,
      documentDate:  extracted.documentDate.value ?? null,
      totalAmount:   effectiveAmount,
      currency:      effectiveCurrency,
      cufe:          xmlF?.cufe               ?? colombianF?.cufe          ?? null,
      subtotal:      xmlF?.subtotal           ?? colombianF?.subtotal      ?? null,
      taxAmount:     xmlF?.taxAmount          ?? colombianF?.taxAmount     ?? null,
    });

    const extractedResult: ProcessDocumentResult["extracted"] = {
      issuerName:   extracted.issuerName.value,
      issuerId:     extracted.issuerId.value,
      receiverName: extracted.receiverName.value,
      receiverId:   extracted.receiverId.value,
      amount:       extracted.amount.value,
      currency:     extracted.currency.value,
      documentDate: extracted.documentDate.value?.toISOString() ?? null,
    };

    const summary = buildExtractionSummary(extractedResult, contributingSources);

    // Currency detection debug — run on the richest available text source
    const currencyDebugText =
      pdfText ||
      [document.description, document.category].filter(Boolean).join("\n") ||
      document.title;
    const currencyDetection = detectCurrency(currencyDebugText);

    // ── 5. Compose document update ────────────────────────────────────────────
    // Only fill null fields — never overwrite values the user already provided.
    const docUpdate: Record<string, unknown> = {
      status: "PROCESSED",
      extractedJson: {
        extractedAt:     now.toISOString(),
        processedBy:     RUN_TYPE,
        runId:           run.id,
        actorUserId:     userId ?? null,
        processingMode,
        validationStatus:   validation.validationStatus,
        validationErrors:   validation.validationErrors,
        validationWarnings: validation.validationWarnings,
        ...(autoResolvedFields.length > 0 ? { autoResolvedFields } : {}),
        summary,
        // PDF extraction diagnostics — full text is NOT stored, only metadata
        pdfExtraction: {
          hasText:        pdfExtraction.hasText,
          parserUsed:     pdfExtraction.parserUsed  ?? null,
          pageCount:      pdfExtraction.pageCount   ?? null,
          charCount:      pdfText.length,
          // Number of position-aware items available (0 = flat-text only mode)
          itemCount:      pdfItems.length,
          resolvedSource: pdfExtraction.resolvedSource,
          // Safe partial path — strips cwd prefix to avoid leaking server paths
          resolvedPath:   pdfExtraction.resolvedPath
            ? pdfExtraction.resolvedPath.replace(process.cwd(), "<cwd>")
            : null,
          debugReason:    pdfExtraction.debugReason ?? null,
          // When the parser timed out, record how long it was allowed to run
          ...(pdfExtraction.timeoutMs !== undefined ? { timeoutMs: pdfExtraction.timeoutMs } : {}),
          // First 500 chars as a preview (only present when hasText is true)
          ...(pdfText ? { preview: pdfText.slice(0, 500) } : {}),
        },
        currencyDetection: {
          selectedCurrency:       currencyDetection.selectedCurrency,
          currencyCandidates:     currencyDetection.currencyCandidates,
          inferredCountryContext: currencyDetection.inferredCountryContext,
          detectionMethod:        currencyDetection.detectionMethod,
        },
        documentClassification: {
          family:         extracted.documentClassification.family,
          matchedSignals: extracted.documentClassification.matchedSignals,
          confidence:     extracted.documentClassification.confidence,
        },
        colombianInvoice: extracted.colombianInvoice
          ? {
              invoiceNumber: extracted.colombianInvoice.invoiceNumber,
              prefix:        extracted.colombianInvoice.prefix,
              cufe:          extracted.colombianInvoice.cufe,
              customerName:  extracted.colombianInvoice.customerName,
              customerId:    extracted.colombianInvoice.customerId,
              dueDate:       extracted.colombianInvoice.dueDate?.toISOString() ?? null,
              subtotal:      extracted.colombianInvoice.subtotal,
              taxAmount:     extracted.colombianInvoice.taxAmount,
              totalAmount:   extracted.colombianInvoice.totalAmount,
            }
          : null,
        invoiceZoneExtraction: extracted.invoiceZoneDebug
          ? {
              zoneStats:       extracted.invoiceZoneDebug.zoneStats,
              boundaries:      extracted.invoiceZoneDebug.boundaries,
              selectedZones:   extracted.invoiceZoneDebug.selectedZones,
              amountCandidates: extracted.invoiceZoneDebug.amountCandidates,
              dateCandidates:   extracted.invoiceZoneDebug.dateCandidates,
              // issuerCandidates appear in issuerDetection.candidates
            }
          : null,
        xmlExtraction: extracted.xmlExtraction
          ? (() => {
              const xf = extracted.xmlExtraction.fields;
              // The 12 fields XML v1 is expected to provide
              const XML_REQUIRED_FIELDS = [
                "issuerName", "issuerId", "customerName", "customerId",
                "invoiceNumber", "documentDate", "dueDate", "currency",
                "subtotal", "taxAmount", "totalAmount", "cufe",
              ] as const;
              const xfAny = xf as unknown as Record<string, unknown>;
              const extractedFields = XML_REQUIRED_FIELDS.filter((k) => xfAny[k] !== null);
              const missingFields   = XML_REQUIRED_FIELDS.filter((k) => xfAny[k] === null);
              const xi = extracted.xmlExtraction;
              return {
                success:         xi.success,
                xmlFormat:       xi.xmlFormat,
                parserUsed:      xi.parserUsed,
                matchedNodes:    xi.matchedNodes,
                debugNotes:      xi.debugNotes,
                errorReason:     xi.errorReason ?? null,
                // Colombia-first debug
                detectedRoot:            xi.detectedRoot            ?? null,
                colombiaXmlType:         xi.colombiaXmlType         ?? null,
                searchedPaths:           xi.searchedPaths           ?? [],
                embeddedPayloadDetected: xi.embeddedPayloadDetected ?? null,
                referencedDocumentInfo:  xi.referencedDocumentInfo  ?? null,
                extractedFields,
                missingFields,
                fields: {
                  issuerName:    xf.issuerName,
                  issuerId:      xf.issuerId,
                  customerName:  xf.customerName,
                  customerId:    xf.customerId,
                  invoiceNumber: xf.invoiceNumber,
                  documentDate:  xf.documentDate?.toISOString() ?? null,
                  dueDate:       xf.dueDate?.toISOString()      ?? null,
                  currency:      xf.currency,
                  subtotal:      xf.subtotal,
                  taxAmount:     xf.taxAmount,
                  totalAmount:   xf.totalAmount,
                  cufe:          xf.cufe,
                },
              };
            })()
          : null,
        fedexDetection: extracted.isFedExDocument
          ? {
              detected:              true,
              fedexBlocksDetected:   extracted.fedexDebug?.fedexBlocksDetected   ?? false,
              usedPositionAware:     extracted.fedexDebug?.usedPositionAware     ?? false,
              reconstructedRowCount: extracted.fedexDebug?.reconstructedRowCount ?? 0,
              headerLineCount:       extracted.fedexDebug?.headerLineCount,
              lineItemLineCount:     extracted.fedexDebug?.lineItemLineCount,
              footerLineCount:       extracted.fedexDebug?.footerLineCount,
              legalLineCount:        extracted.fedexDebug?.legalLineCount,
              selectedBlock:         extracted.fedexDebug?.selectedBlock         ?? null,
              issuerSearched:        extracted.fedexDebug?.issuerSearched        ?? false,
              pageRegions:           extracted.fedexDebug?.pageRegions           ?? [],
              headerCandidates:      extracted.fedexDebug?.headerCandidates      ?? [],
              totalCandidates:       extracted.fedexDebug?.totalCandidates       ?? [],
              dateCandidates:        extracted.fedexDebug?.dateCandidates        ?? [],
              selectedHeaderRows:    extracted.fedexDebug?.selectedHeaderRows    ?? [],
              selectedSummaryRows:   extracted.fedexDebug?.selectedSummaryRows   ?? [],
            }
          : { detected: false },
        normalizedLabelsDetected: extracted.normalizedLabels,
        amountDetection: {
          chosen:     extracted.amount.value,
          source:     extracted.amount.source,
          candidates: extracted.amountCandidates,
        },
        issuerDetection: {
          chosen:     extracted.issuerName.value,
          source:     extracted.issuerName.source,
          // For FedEx documents the issuer search is reported under fedexDetection.headerCandidates
          candidates: extracted.issuerCandidates,
        },
        dateDetection: {
          chosen:  extracted.documentDate.value?.toISOString().slice(0, 10) ?? null,
          source:  extracted.documentDate.source,
          isFedEx: extracted.isFedExDocument,
          // For FedEx the block parser never falls back to parseDate(fullText),
          // so fallbackSuppressed is always true when candidates were found.
          fallbackSuppressed: extracted.isFedExDocument
            ? true
            : extracted.dateCandidates.length > 0 && extracted.dateCandidates.every((c) => !c.accepted) && extracted.documentDate.source !== "pdf",
          candidates: extracted.dateCandidates,
        },
        fields: {
          issuerName:   { value: extracted.issuerName.value,   source: extracted.issuerName.source },
          issuerId:     { value: extracted.issuerId.value,     source: extracted.issuerId.source },
          receiverName: { value: extracted.receiverName.value, source: extracted.receiverName.source },
          receiverId:   { value: extracted.receiverId.value,   source: extracted.receiverId.source },
          amount:       { value: extracted.amount.value,       source: extracted.amount.source },
          currency:     { value: extracted.currency.value,     source: extracted.currency.source },
          documentDate: {
            value:  extracted.documentDate.value?.toISOString() ?? null,
            source: extracted.documentDate.source,
          },
        },
        sources: contributingSources,
      },
    };

    // ── Stale bad-value detection ──────────────────────────────────────────────
    // A previous processing run (before zone-aware extraction) may have saved an
    // obviously-invalid issuerName — e.g. an address line or payment-terms label
    // that slipped past the old heuristics.  We detect this by testing the stored
    // value against ISSUER_REJECT_RE (the same filter that rejects bad candidates
    // during extraction).  When the stored value is obviously invalid, we allow the
    // new zone-aware result to overwrite it — even though the field is non-null.
    const existingIssuerObviouslyInvalid =
      !!document.issuerName && ISSUER_REJECT_RE.test(document.issuerName);

    // Enrich extractedJson with issuer-flow debug so operators can see exactly
    // what happened at each step without needing to add console logs.
    const issuerPathUsed =
      extracted.invoiceZoneDebug !== null ? "colombian-zone-aware" :
      extracted.isFedExDocument           ? "fedex-block-aware"    :
      extracted.documentClassification.family === "ELECTRONIC_INVOICE_STANDARD"
                                          ? "colombian-no-pdf"     : "generic";

    (docUpdate.extractedJson as Record<string, unknown>).issuerFlowDebug = {
      issuerPathUsed,
      issuerExtractedCandidate:     extracted.issuerName.value,
      issuerExtractedSource:        extracted.issuerName.source,
      issuerExistingValue:             document.issuerName,
      issuerExistingObviouslyInvalid:  existingIssuerObviouslyInvalid,
      issuerOverwriteApplied:       existingIssuerObviouslyInvalid && !!extracted.issuerName.value,
      issuerOverwriteSkipped:       !!(extracted.issuerName.value && document.issuerName && !existingIssuerObviouslyInvalid),
      issuerFinalSavedValue:        null, // filled below after decision
    };

    if (extracted.issuerName.value && (!document.issuerName || existingIssuerObviouslyInvalid)) {
      docUpdate.issuerName = extracted.issuerName.value;
    }
    // Record the final value that will land in the database for debug tracing.
    (docUpdate.extractedJson as Record<string, unknown> & { issuerFlowDebug: Record<string, unknown> })
      .issuerFlowDebug.issuerFinalSavedValue =
        (docUpdate.issuerName as string | undefined) ?? document.issuerName ?? null;

    // Use effective* values so XML auto-resolved fields are saved to top-level DB columns.
    if (effectiveIssuerId             && !document.issuerId)     docUpdate.issuerId     = effectiveIssuerId;
    if (extracted.receiverName.value  && !document.receiverName) docUpdate.receiverName = extracted.receiverName.value;
    if (effectiveReceiverId           && !document.receiverId)   docUpdate.receiverId   = effectiveReceiverId;
    if (effectiveAmount != null && document.amount == null)      docUpdate.amount       = effectiveAmount;
    if (effectiveCurrency             && !document.currency)     docUpdate.currency     = effectiveCurrency;
    if (extracted.documentDate.value  && !document.documentDate) docUpdate.documentDate = extracted.documentDate.value;

    // ── 5. Commit: document update + Run success + Event ─────────────────────
    await prisma.$transaction([
      prisma.document.update({
        where: { id: documentId },
        data:  docUpdate,
      }),
      prisma.run.update({
        where: { id: run.id },
        data: {
          status:     RunStatus.SUCCEEDED,
          endedAt:    new Date(),
          outputJson: {
            documentId,
            extracted: extractedResult,
            sources:   contributingSources,
            summary,
          },
        },
      }),
      prisma.event.create({
        data: {
          organizationId,
          projectId:   document.projectId ?? null,
          type:        EVENT_TYPE,
          sourceType:  userId ? "user" : "system",
          sourceId:    userId ?? null,
          runId:       run.id,
          payloadJson: {
            documentId,
            documentType:    document.type,
            runId:           run.id,
            extractedFields: extractedResult,
            sources:         contributingSources,
            summary,
          },
          status:      EventStatus.PROCESSED,
          processedAt: new Date(),
        },
      }),
    ]);

    // ── 6. Validation alerts ──────────────────────────────────────────────────
    await upsertDocumentValidationAlert({
      documentId,
      organizationId,
      projectId:        document.projectId ?? null,
      documentTitle:    document.title,
      validationStatus: validation.validationStatus,
      validationErrors: validation.validationErrors,
      runId:            run.id,
    }).catch(() => {}); // never block the main result on alert errors

    return { runId: run.id, documentId, extracted: extractedResult, sources: contributingSources, summary };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await Promise.allSettled([
      prisma.run.update({
        where: { id: run.id },
        data: {
          status:    RunStatus.FAILED,
          endedAt:   new Date(),
          errorJson: { message: errorMessage, documentId },
        },
      }),
      prisma.document.update({
        where: { id: documentId },
        data:  { status: "ERROR" },
      }),
    ]);

    await prisma.alert
      .create({
        data: {
          organizationId,
          projectId:   document.projectId ?? null,
          type:        ALERT_TYPE,
          title:       `Document processing failed: ${document.title}`,
          message:     errorMessage,
          severity:    AlertSeverity.WARNING,
          status:      AlertStatus.OPEN,
          sourceType:  "run",
          sourceId:    run.id,
          metadataJson: { documentId, runId: run.id, documentType: document.type },
        },
      })
      .catch(() => {});

    throw err;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// BATCH PROCESSING
// ═════════════════════════════════════════════════════════════════════════════

export interface BatchProcessResult {
  total:     number;
  processed: number;
  failed:    number;
  results:   Array<{
    documentId: string;
    status:     "success" | "error";
    runId?:     string;
    error?:     string;
  }>;
}

/**
 * Finds all pending/errored financial documents for an org and processes them
 * sequentially, one at a time.
 *
 * - Capped at BATCH_LIMIT (50) documents per call to keep response times
 *   acceptable on a synchronous HTTP request. When a queue/worker layer is
 *   added later, replace this function with a job enqueuer and flip the API
 *   route to return a jobId instead of waiting for completion.
 * - Never throws: individual document failures are captured and counted so
 *   one bad document cannot abort the remaining batch.
 */
export async function processAllPendingFinancialDocuments(
  organizationId: string,
  actorUserId:    string
): Promise<BatchProcessResult> {
  const documents = await prisma.document.findMany({
    where: {
      organizationId,
      type:   { in: FINANCIAL_DOC_TYPES },
      status: { in: ["PENDING", "ERROR", "REJECTED"] },
      deletedAt: null,
    },
    orderBy: { createdAt: "asc" },
    take:    BATCH_LIMIT,
    select:  { id: true },
  });

  const results: BatchProcessResult["results"] = [];

  for (const doc of documents) {
    try {
      const result = await processFinancialDocument(doc.id, organizationId, actorUserId);
      results.push({ documentId: doc.id, status: "success", runId: result.runId });
    } catch (err) {
      results.push({
        documentId: doc.id,
        status:     "error",
        error:      err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    total:     documents.length,
    processed: results.filter((r) => r.status === "success").length,
    failed:    results.filter((r) => r.status === "error").length,
    results,
  };
}
