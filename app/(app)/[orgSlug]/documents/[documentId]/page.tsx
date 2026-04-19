import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { getDocument, getDocumentAlerts, type DocumentAlert } from "@/lib/documents/queries";
import ContextHeader from "@/components/app/context-header";
import IndexKnowledgeButton from "./index-knowledge-button";
import ProcessButton from "@/components/finance/process-button";
import OverrideForm, { type OverrideEntry } from "./override-form";
import ReviewButton from "./review-button";
import { statusLabel } from "@/lib/ui/status-labels";

// ── Typed shape of extractedJson ──────────────────────────────────────────────

interface ClassificationJson {
  family:         string;
  matchedSignals: string[];
  confidence:     string;
}

interface ColombianInvoiceJson {
  invoiceNumber: string | null;
  prefix:        string | null;
  cufe:          string | null;
  customerName:  string | null;
  customerId:    string | null;
  dueDate:       string | null;
  subtotal:      number | null;
  taxAmount:     number | null;
  totalAmount:   number | null;
}

interface FieldEntryJson {
  value:  unknown;
  source: string | null;
}

type ValidationStatus = "VALID" | "INCOMPLETE" | "REVIEW_REQUIRED";

interface ExtractedJson {
  summary?:               string;
  sources?:               string[];
  processingMode?:        "xml-first" | "pdf-fallback" | "xml-and-pdf" | "manual-review-needed";
  validationStatus?:      ValidationStatus;
  validationErrors?:      string[];
  validationWarnings?:    string[];
  documentClassification?: ClassificationJson;
  colombianInvoice?:      ColombianInvoiceJson | null;
  xmlExtraction?:         {
    success:                 boolean;
    xmlFormat:               string | null;
    parserUsed:              string | null;
    detectedRoot?:           string | null;
    colombiaXmlType?:        string | null;
    embeddedPayloadDetected?: boolean | null;
    referencedDocumentInfo?: {
      invoiceNumber:    string | null;
      documentTypeCode: string | null;
      cufe:             string | null;
      issueDate:        string | null;
    } | null;
    extractedFields?: string[];
    missingFields?:  string[];
  } | null;
  pdfExtraction?:         { hasText: boolean; parserUsed: string | null; charCount: number; itemCount: number; pageCount: number | null; debugReason?: string | null; preview?: string } | null;
  fields?:                Record<string, FieldEntryJson>;
  amountDetection?:       { chosen: number | null; source: string | null };
  issuerDetection?:       { chosen: string | null; source: string | null };
  dateDetection?:         { chosen: string | null; source: string | null; isFedEx: boolean };
  fedexDetection?:        { detected: boolean; usedPositionAware?: boolean; headerLineCount?: number; lineItemLineCount?: number; footerLineCount?: number };
  extractedAt?:           string;
  actorUserId?:           string | null;
  autoResolvedFields?:    string[];
  overrides?:             Record<string, OverrideEntry>;
  lastOverrideAt?:        string;
  lastOverrideBy?:        string;
  review?:                { reviewedBy: string; reviewedAt: string; reviewedByEmail?: string | null; reviewedByName?: string | null };
  lastReprocessedAt?:     string;
  lastReprocessMode?:     "full" | "validation-only";
  previousValidationStatus?: string | null;
  reprocessHistory?:      Array<{
    at:             string;
    mode:           "full" | "validation-only";
    previousStatus: string | null;
    newStatus:      string;
    triggeredBy:    string;
  }>;
}

function parseExtractedJson(raw: unknown): ExtractedJson | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as ExtractedJson;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmt(date: Date) {
  return date.toISOString().slice(0, 10);
}

function fmtAmount(val: number | null | undefined, currency?: string | null) {
  if (val == null) return null;
  const n = parseFloat(String(val));
  if (!isFinite(n)) return String(val);
  const noDecimals = new Set(["COP", "CLP", "PEN"]);
  const dec = currency && noDecimals.has(currency.toUpperCase()) ? 0 : 2;
  const s = new Intl.NumberFormat("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);
  return currency ? `${s} ${currency.toUpperCase()}` : s;
}

// ── Style constants ───────────────────────────────────────────────────────────

const FAMILY_COLORS: Record<string, { bg: string; text: string }> = {
  ELECTRONIC_INVOICE_STANDARD:          { bg: "#e8f5e9", text: "#2e7d32" },
  COMMERCIAL_DOC_REMITISION_OR_PEDIDO:  { bg: "#fff3e0", text: "#e65100" },
  LOGISTICS_INVOICE:                    { bg: "#e3f2fd", text: "#1565c0" },
  BANK_STATEMENT:                       { bg: "#f3e5f5", text: "#6a1b9a" },
  UNKNOWN:                              { bg: "#f5f5f5", text: "#616161" },
};

const CONFIDENCE_COLORS: Record<string, string> = {
  HIGH:   "#2e7d32",
  MEDIUM: "#e65100",
  LOW:    "#9e9e9e",
};

const SOURCE_COLORS: Record<string, string> = {
  metadata:    "#1565c0",
  xml:         "#2e7d32",
  pdf:         "#b45309",
  description: "#6b7280",
  title:       "#6b7280",
  filename:    "#9ca3af",
};

function SourceTag({ source }: { source: string | null }) {
  if (!source) return <span style={{ color: "#bbb", fontSize: 11 }}>—</span>;
  const color = SOURCE_COLORS[source] ?? "#6b7280";
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color, border: `1px solid ${color}`,
      borderRadius: 3, padding: "0px 4px", whiteSpace: "nowrap",
    }}>
      {source.toUpperCase()}
    </span>
  );
}

function MissingTag() {
  return (
    <span style={{
      fontSize: 11, color: "#c62828",
      fontStyle: "italic",
    }}>
      missing
    </span>
  );
}

function Val({ v }: { v: unknown }) {
  if (v == null || v === "") return <MissingTag />;
  const s = String(v);
  // Truncate long values (CUFE is 96 chars)
  if (s.length > 80) {
    return (
      <span title={s} style={{ fontFamily: "monospace", fontSize: 11, wordBreak: "break-all" }}>
        {s.slice(0, 60)}…
      </span>
    );
  }
  return <span style={{ fontFamily: s.match(/^[\d.,]+$/) ? "monospace" : "inherit" }}>{s}</span>;
}

// ── Sub-sections ──────────────────────────────────────────────────────────────

function ClassificationSection({ c }: { c: ClassificationJson | undefined }) {
  if (!c) {
    return (
      <section style={{ marginTop: 24 }}>
        <h2 style={{ margin: "0 0 8px" }}>Document Classification</h2>
        <p style={{ color: "#888", fontSize: 13 }}>Not yet processed.</p>
      </section>
    );
  }
  const colors = FAMILY_COLORS[c.family] ?? FAMILY_COLORS.UNKNOWN;
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ margin: "0 0 10px" }}>Document Classification</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{
          background: colors.bg, color: colors.text,
          fontWeight: 700, fontSize: 13, padding: "4px 12px",
          borderRadius: 4, border: `1px solid ${colors.text}`,
        }}>
          {c.family}
        </span>
        <span style={{ fontSize: 12, color: CONFIDENCE_COLORS[c.confidence] ?? "#888" }}>
          {c.confidence} confidence
        </span>
      </div>
      {c.matchedSignals.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {c.matchedSignals.map((s) => (
            <span key={s} style={{
              fontSize: 11, background: "#f5f5f5", border: "1px solid #ddd",
              borderRadius: 3, padding: "1px 6px",
            }}>
              {s}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

interface FieldRow {
  label:   string;
  value:   unknown;
  source:  string | null;
  isKey?:  boolean;
}

function FieldsTable({ rows, title }: { rows: FieldRow[]; title: string }) {
  const missing = rows.filter((r) => r.value == null || r.value === "").length;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>{title}</h3>
        {missing > 0 && (
          <span style={{ fontSize: 11, color: "#c62828" }}>
            {missing} field{missing > 1 ? "s" : ""} missing
          </span>
        )}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td style={{ padding: "5px 8px 5px 0", width: 180, color: "#555", fontWeight: row.isKey ? 600 : 400 }}>
                {row.label}
              </td>
              <td style={{ padding: "5px 8px" }}>
                <Val v={row.value} />
              </td>
              <td style={{ padding: "5px 0 5px 8px", width: 80, textAlign: "right" }}>
                <SourceTag source={row.source} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GapAnalysis({ rows }: { rows: FieldRow[] }) {
  const missing = rows.filter((r) => r.value == null || r.value === "");
  const present = rows.filter((r) => r.value != null && r.value !== "");
  return (
    <div style={{ marginTop: 20, padding: "12px 14px", background: "#fafafa", border: "1px solid #e8e8e8", borderRadius: 6 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Gap Analysis</h3>
      <div style={{ display: "flex", gap: 20, fontSize: 13 }}>
        <div>
          <span style={{ color: "#2e7d32", fontWeight: 700 }}>{present.length}</span>
          <span style={{ color: "#555" }}> extracted</span>
          {present.length > 0 && (
            <div style={{ marginTop: 4, color: "#555" }}>
              {present.map((r) => (
                <span key={r.label} style={{ display: "inline-block", marginRight: 8 }}>✓ {r.label}</span>
              ))}
            </div>
          )}
        </div>
        {missing.length > 0 && (
          <div>
            <span style={{ color: "#c62828", fontWeight: 700 }}>{missing.length}</span>
            <span style={{ color: "#555" }}> missing</span>
            <div style={{ marginTop: 4, color: "#c62828" }}>
              {missing.map((r) => (
                <span key={r.label} style={{ display: "inline-block", marginRight: 8 }}>✗ {r.label}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Validation ────────────────────────────────────────────────────────────────

const VALIDATION_STYLES: Record<ValidationStatus, {
  bg: string; border: string; text: string; label: string;
}> = {
  VALID:            { bg: "#e8f5e9", border: "#a5d6a7", text: "#2e7d32", label: "VALID"           },
  INCOMPLETE:       { bg: "#fce4ec", border: "#f48fb1", text: "#b71c1c", label: "INCOMPLETE"       },
  REVIEW_REQUIRED:  { bg: "#fff8e1", border: "#ffe082", text: "#f57f17", label: "REVIEW REQUIRED"  },
};

const MODE_STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  "xml-first":            { bg: "#e8f5e9", border: "#a5d6a7", text: "#2e7d32", label: "XML-first"           },
  "xml-and-pdf":          { bg: "#e3f2fd", border: "#90caf9", text: "#1565c0", label: "XML + PDF"            },
  "pdf-fallback":         { bg: "#fff8e1", border: "#ffe082", text: "#f57f17", label: "PDF fallback"         },
  "manual-review-needed": { bg: "#fce4ec", border: "#f48fb1", text: "#b71c1c", label: "Manual review needed" },
};

// Required fields that validation checks — used to parse the missing-field list.
const REQUIRED_FIELD_LABELS: Record<string, string> = {
  issuerId:      "Issuer ID (NIT)",
  customerId:    "Customer ID (NIT)",
  invoiceNumber: "Invoice Number",
  documentDate:  "Document Date",
  totalAmount:   "Total Amount",
  currency:      "Currency",
  cufe:          "CUFE",
};

function ValidationSummary({
  validationStatus,
  validationErrors,
  validationWarnings,
  processingMode,
  xi,
  keyRows,
}: {
  validationStatus: ValidationStatus | null | undefined;
  validationErrors:   string[];
  validationWarnings: string[];
  processingMode: string | null | undefined;
  xi: ExtractedJson["xmlExtraction"] | null | undefined;
  keyRows: FieldRow[];
}) {
  if (!validationStatus) return null;

  const vs  = VALIDATION_STYLES[validationStatus];
  const pm  = processingMode ? (MODE_STYLES[processingMode] ?? null) : null;

  // Derive a human-readable reason line
  const reasonLine =
    validationStatus === "VALID"
      ? `All ${Object.keys(REQUIRED_FIELD_LABELS).length} required fields present.${
          validationWarnings.length === 0 ? " Math checks passed." : ""
        }`
      : validationStatus === "INCOMPLETE"
      ? `${validationErrors.length} required field${validationErrors.length > 1 ? "s" : ""} missing — document cannot be accepted until resolved.`
      : `All required fields present, but ${validationWarnings.length} warning${validationWarnings.length > 1 ? "s" : ""} need review.`;

  return (
    <section style={{
      margin: "24px 0",
      border: `1px solid ${vs.border}`,
      borderRadius: 6,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        background: vs.bg,
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        borderBottom: `1px solid ${vs.border}`,
      }}>
        <h2 style={{ margin: 0, fontSize: 15 }}>Validation Summary</h2>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: vs.text, background: "white",
          border: `1px solid ${vs.border}`,
          borderRadius: 4, padding: "2px 10px",
        }}>
          {vs.label}
        </span>
        {pm && (
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: pm.text, background: "white",
            border: `1px solid ${pm.border}`,
            borderRadius: 4, padding: "2px 8px",
          }}>
            {pm.label}
          </span>
        )}
        {xi?.colombiaXmlType && (
          <span style={{ fontSize: 11, color: "#555", marginLeft: 4 }}>
            {xi.colombiaXmlType}
            {xi.embeddedPayloadDetected ? " · embedded Invoice decoded" : ""}
          </span>
        )}
      </div>

      <div style={{ padding: "12px 14px" }}>
        {/* Reason */}
        <p style={{ margin: "0 0 12px", fontSize: 13, color: vs.text, fontWeight: 500 }}>
          {reasonLine}
        </p>

        {/* Blocking errors */}
        {validationErrors.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#b71c1c", marginBottom: 4 }}>
              Blocking errors — must resolve before the document is VALID:
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#b71c1c" }}>
              {validationErrors.map((err) => {
                // Try to map "issuerId missing" → "Issuer ID (NIT) missing"
                const matchedKey = Object.keys(REQUIRED_FIELD_LABELS).find((k) => err.startsWith(k));
                const display = matchedKey
                  ? err.replace(matchedKey, REQUIRED_FIELD_LABELS[matchedKey])
                  : err;
                return <li key={err}>{display}</li>;
              })}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {validationWarnings.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#f57f17", marginBottom: 4 }}>
              Warnings — document is accepted but should be reviewed:
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#7c4d00" }}>
              {validationWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Key extracted fields */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#444", marginBottom: 6 }}>
            Key fields:
          </div>
          <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
            <tbody>
              {keyRows.map((row) => {
                const missing = row.value == null || row.value === "";
                const isRequired = Object.values(REQUIRED_FIELD_LABELS).includes(row.label);
                return (
                  <tr key={row.label} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{
                      padding: "4px 8px 4px 0", width: 160,
                      color: missing && isRequired ? "#b71c1c" : "#555",
                      fontWeight: isRequired ? 600 : 400,
                    }}>
                      {row.label}
                    </td>
                    <td style={{ padding: "4px 8px" }}>
                      {missing ? (
                        <span style={{ color: isRequired ? "#b71c1c" : "#aaa", fontStyle: "italic" }}>
                          {isRequired ? "✗ missing" : "—"}
                        </span>
                      ) : (
                        <Val v={row.value} />
                      )}
                    </td>
                    <td style={{ padding: "4px 0 4px 8px", width: 60, textAlign: "right" }}>
                      {!missing && <SourceTag source={row.source} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* XML extracted / missing field lists */}
        {xi?.success && (
          <div style={{ marginTop: 12, fontSize: 11, lineHeight: 1.7, borderTop: "1px solid #f0f0f0", paddingTop: 10 }}>
            <span style={{ fontWeight: 700, color: "#444" }}>XML parser: </span>
            <span style={{ color: "#555" }}>
              {xi.xmlFormat ?? "?"}{xi.colombiaXmlType ? ` (${xi.colombiaXmlType})` : ""}
            </span>
            {xi.extractedFields && xi.extractedFields.length > 0 && (
              <div style={{ color: "#2e7d32" }}>
                ✓ {xi.extractedFields.join(", ")}
              </div>
            )}
            {xi.missingFields && xi.missingFields.length > 0 && (
              <div style={{ color: "#b71c1c" }}>
                ✗ {xi.missingFields.join(", ")}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function PdfInfo({ pdf }: { pdf: ExtractedJson["pdfExtraction"] }) {
  if (!pdf) return null;
  return (
    <div style={{ marginTop: 12, fontSize: 12, color: "#555" }}>
      <strong>PDF:</strong>{" "}
      {pdf.hasText
        ? `${pdf.charCount.toLocaleString()} chars, ${pdf.pageCount ?? "?"} pages, parser=${pdf.parserUsed ?? "none"}, items=${pdf.itemCount}`
        : `No text — ${pdf.debugReason ?? "unknown reason"}`}
      {pdf.preview && (
        <div style={{ marginTop: 6, background: "#f9f9f9", border: "1px solid #eee", borderRadius: 4, padding: "6px 8px", fontFamily: "monospace", fontSize: 11, whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto" }}>
          {pdf.preview}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DocumentDetailPage({
  params,
}: {
  params: { orgSlug: string; documentId: string };
}) {
  const { organization } = await requireOrgAccess(params.orgSlug);
  const [doc, docAlerts] = await Promise.all([
    getDocument(params.documentId, organization.id),
    getDocumentAlerts(params.documentId, organization.id),
  ]);

  if (!doc) notFound();

  const ej = parseExtractedJson(doc.extractedJson);
  const cls = ej?.documentClassification;
  const ci  = ej?.colombianInvoice;
  const xi  = ej?.xmlExtraction;
  const fields = ej?.fields ?? {};

  // ── Build field rows ────────────────────────────────────────────────────────

  const coreRows: FieldRow[] = [
    { label: "Issuer Name",    value: doc.issuerName,                           source: fields.issuerName?.source   ?? null },
    { label: "Issuer ID",      value: doc.issuerId,                             source: fields.issuerId?.source     ?? null },
    { label: "Customer Name",  value: doc.receiverName,                         source: fields.receiverName?.source ?? null },
    { label: "Customer ID",    value: doc.receiverId,                           source: fields.receiverId?.source   ?? null },
    { label: "Document Date",  value: doc.documentDate ? fmt(doc.documentDate) : null, source: fields.documentDate?.source ?? null },
    { label: "Amount / Total", value: fmtAmount(doc.amount != null ? parseFloat(String(doc.amount)) : null, doc.currency), source: fields.amount?.source ?? null },
    { label: "Currency",       value: doc.currency,                             source: fields.currency?.source     ?? null },
  ];

  // Determine which Colombian fields came from XML vs PDF based on what the
  // XML extractor actually found (missingFields = not in XML → source is pdf).
  const xmlMissing = new Set(xi?.missingFields ?? []);
  function colombianSource(fieldKey: string, hasValue: boolean): string | null {
    if (!hasValue) return null;
    return xmlMissing.has(fieldKey) ? "pdf" : "xml";
  }

  const colombianRows: FieldRow[] = cls?.family === "ELECTRONIC_INVOICE_STANDARD" ? [
    { label: "Invoice Number", value: ci?.invoiceNumber, source: colombianSource("invoiceNumber", !!ci?.invoiceNumber), isKey: true },
    { label: "Prefix",         value: ci?.prefix,        source: ci?.prefix ? "pdf" : null },
    { label: "Due Date",       value: ci?.dueDate ? ci.dueDate.slice(0, 10) : null, source: colombianSource("dueDate", !!ci?.dueDate) },
    { label: "Subtotal",       value: ci?.subtotal != null ? fmtAmount(ci.subtotal, doc.currency) : null, source: colombianSource("subtotal", ci?.subtotal != null) },
    { label: "Tax Amount",     value: ci?.taxAmount != null ? fmtAmount(ci.taxAmount, doc.currency) : null, source: colombianSource("taxAmount", ci?.taxAmount != null) },
    { label: "Total Amount",   value: ci?.totalAmount != null ? fmtAmount(ci.totalAmount, doc.currency) : null, source: colombianSource("totalAmount", ci?.totalAmount != null) },
    { label: "CUFE",           value: ci?.cufe, source: colombianSource("cufe", !!ci?.cufe) },
  ] : [];

  // All rows for gap analysis
  const allRows = cls?.family === "ELECTRONIC_INVOICE_STANDARD"
    ? [...coreRows, ...colombianRows]
    : coreRows;

  // Key rows for ValidationSummary — the 7 required fields + amount breakdown
  const keyRows: FieldRow[] = [
    { label: REQUIRED_FIELD_LABELS.issuerId,      value: doc.issuerId,       source: fields.issuerId?.source     ?? null, isKey: true },
    { label: coreRows[0].label /* Issuer Name */,  value: doc.issuerName,     source: fields.issuerName?.source   ?? null },
    { label: REQUIRED_FIELD_LABELS.customerId,     value: doc.receiverId,     source: fields.receiverId?.source   ?? null, isKey: true },
    { label: REQUIRED_FIELD_LABELS.invoiceNumber,  value: ci?.invoiceNumber ?? null, source: colombianSource("invoiceNumber", !!ci?.invoiceNumber), isKey: true },
    { label: REQUIRED_FIELD_LABELS.documentDate,   value: doc.documentDate ? fmt(doc.documentDate) : null, source: fields.documentDate?.source ?? null, isKey: true },
    { label: REQUIRED_FIELD_LABELS.totalAmount,    value: fmtAmount(doc.amount != null ? parseFloat(String(doc.amount)) : null, doc.currency), source: fields.amount?.source ?? null, isKey: true },
    { label: REQUIRED_FIELD_LABELS.currency,       value: doc.currency,       source: fields.currency?.source     ?? null, isKey: true },
    { label: REQUIRED_FIELD_LABELS.cufe,           value: ci?.cufe ?? null,   source: colombianSource("cufe", !!ci?.cufe), isKey: true },
  ];

  const isFinancial = ["INVOICE", "RECEIPT", "EXPENSE", "CREDIT_NOTE", "DEBIT_NOTE", "XML"].includes(doc.type);

  return (
    <main>
      <ContextHeader organization={organization} />

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>{doc.title}</h1>
        {isFinancial && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <ProcessButton
              documentId={doc.id}
              organizationId={organization.id}
              documentStatus={doc.status}
              hasOverrides={Object.keys(ej?.overrides ?? {}).length > 0}
            />
            <ReviewButton
              documentId={doc.id}
              organizationId={organization.id}
              documentStatus={doc.status}
              validationStatus={ej?.validationStatus ?? null}
            />
          </div>
        )}
      </div>

      {/* ── Core metadata ─────────────────────────────────────────────────── */}
      <dl style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "4px 12px", fontSize: 13, margin: "16px 0" }}>
        <dt style={{ color: "#888" }}>Tipo</dt>        <dd style={{ margin: 0 }}>{doc.type}</dd>
        <dt style={{ color: "#888" }}>Estado</dt>      <dd style={{ margin: 0 }}>
          {doc.status === "REVIEWED"
            ? <span style={{ fontWeight: 700, color: "#2e7d32" }}>{statusLabel("REVIEWED")}</span>
            : statusLabel(doc.status)}
        </dd>
        {ej?.review?.reviewedAt && (
          <>
            <dt style={{ color: "#888" }}>Revisado</dt>
            <dd style={{ margin: 0, fontSize: 13 }}>
              {new Date(ej.review.reviewedAt).toISOString().slice(0, 19).replace("T", " ")} UTC
              {(ej.review.reviewedByName || ej.review.reviewedByEmail) && (
                <span style={{ color: "#555" }}>
                  {" "}· {ej.review.reviewedByName ?? ej.review.reviewedByEmail}
                </span>
              )}
            </dd>
          </>
        )}
        {doc.category && <><dt style={{ color: "#888" }}>Category</dt><dd style={{ margin: 0 }}>{doc.category}</dd></>}
        {doc.description && <><dt style={{ color: "#888" }}>Description</dt><dd style={{ margin: 0 }}>{doc.description}</dd></>}
        {doc.workspace && <><dt style={{ color: "#888" }}>Workspace</dt><dd style={{ margin: 0 }}>{doc.workspace.name}</dd></>}
        {doc.project && <><dt style={{ color: "#888" }}>Project</dt><dd style={{ margin: 0 }}>{doc.project.name} ({doc.project.key})</dd></>}
        {doc.file?.mimeType && <><dt style={{ color: "#888" }}>File</dt><dd style={{ margin: 0 }}>{doc.file.name ?? "—"} · {doc.file.mimeType} {doc.file.sizeBytes ? `· ${formatBytes(doc.file.sizeBytes)}` : ""}</dd></>}
        <dt style={{ color: "#888" }}>Created</dt>     <dd style={{ margin: 0 }}>{doc.createdAt.toISOString().slice(0, 19).replace("T", " ")} UTC</dd>
      </dl>

      {doc.file?.url && (
        <p style={{ fontSize: 13 }}>
          <a href={doc.file.url} target="_blank" rel="noopener noreferrer">
            Download file{doc.file.name ? ` — ${doc.file.name}` : ""}
          </a>
        </p>
      )}

      {/* ── Classification ────────────────────────────────────────────────── */}
      <ClassificationSection c={cls} />

      {/* ── Validation Summary ────────────────────────────────────────────── */}
      {ej && (
        <ValidationSummary
          validationStatus={ej.validationStatus}
          validationErrors={ej.validationErrors ?? []}
          validationWarnings={ej.validationWarnings ?? []}
          processingMode={ej.processingMode}
          xi={xi}
          keyRows={keyRows}
        />
      )}

      {/* ── Document Completeness ─────────────────────────────────────────── */}
      {ej && (
        <DocumentCompleteness
          doc={doc}
          ci={ci}
          overrides={ej.overrides ?? {}}
          autoResolvedFields={(ej.autoResolvedFields as string[] | undefined) ?? []}
        />
      )}

      {/* ── Field Inventory (Excel comparison view) ───────────────────────── */}
      {ej && (
        <FieldInventory
          doc={doc}
          ci={ci}
          ej={ej}
          fields={fields}
          xmlMissing={xmlMissing}
          isColombianInvoice={cls?.family === "ELECTRONIC_INVOICE_STANDARD"}
        />
      )}

      {/* ── Extraction results ────────────────────────────────────────────── */}
      {ej ? (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ margin: "0 0 4px" }}>Extraction Results</h2>

          {ej.summary && (
            <p style={{ fontSize: 12, color: "#666", margin: "4px 0 12px", fontStyle: "italic" }}>
              {ej.summary}
            </p>
          )}

          {/* Sources used */}
          {ej.sources && ej.sources.length > 0 && (
            <div style={{ marginBottom: 12, display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#888" }}>Sources:</span>
              {ej.sources.map((s) => <SourceTag key={s} source={s} />)}
            </div>
          )}

          <FieldsTable rows={coreRows} title="Core Fields" />

          {cls?.family === "ELECTRONIC_INVOICE_STANDARD" && (
            <FieldsTable rows={colombianRows} title="Colombian Invoice Fields" />
          )}

          {/* XML extraction note — Colombia v1 */}
          {xi && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#555", lineHeight: 1.6 }}>
              <div>
                <strong>XML Colombia v1:</strong>{" "}
                {xi.success ? "Parsed successfully" : "Failed to parse"}{" "}
                {xi.colombiaXmlType && (
                  <span style={{ fontWeight: 600, color: "#1565c0" }}>
                    [{xi.colombiaXmlType}]
                  </span>
                )}{" "}
                {xi.xmlFormat && <span style={{ color: "#888" }}>({xi.xmlFormat})</span>}
                {xi.embeddedPayloadDetected === true && (
                  <span style={{ marginLeft: 8, color: "#2e7d32" }}>· embedded Invoice decoded</span>
                )}
                {xi.embeddedPayloadDetected === false && (
                  <span style={{ marginLeft: 8, color: "#b45309" }}>· no embedded payload</span>
                )}
              </div>
              {xi.extractedFields && xi.extractedFields.length > 0 && (
                <div style={{ color: "#2e7d32" }}>
                  ✓ {xi.extractedFields.join(", ")}
                </div>
              )}
              {xi.missingFields && xi.missingFields.length > 0 && (
                <div style={{ color: "#b71c1c" }}>
                  ✗ {xi.missingFields.join(", ")}
                </div>
              )}
              {xi.referencedDocumentInfo?.invoiceNumber && (
                <div style={{ color: "#555" }}>
                  Referencia: {xi.referencedDocumentInfo.invoiceNumber}
                  {xi.referencedDocumentInfo.issueDate && ` · ${xi.referencedDocumentInfo.issueDate}`}
                  {xi.referencedDocumentInfo.cufe && (
                    <span style={{ fontFamily: "monospace", fontSize: 10, marginLeft: 6 }}>
                      CUFE: {xi.referencedDocumentInfo.cufe.slice(0, 16)}…
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* PDF info */}
          <PdfInfo pdf={ej.pdfExtraction} />

          {/* FedEx note */}
          {ej.fedexDetection?.detected && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#b45309" }}>
              <strong>FedEx path:</strong>{" "}
              positionAware={ej.fedexDetection.usedPositionAware ? "yes" : "no"},{" "}
              headerLines={ej.fedexDetection.headerLineCount ?? "?"},{" "}
              lineItemLines={ej.fedexDetection.lineItemLineCount ?? "?"},{" "}
              footerLines={ej.fedexDetection.footerLineCount ?? "?"}
            </div>
          )}

          <GapAnalysis rows={allRows} />

          {/* Raw JSON */}
          <details style={{ marginTop: 20 }}>
            <summary style={{ cursor: "pointer", fontSize: 13, color: "#888" }}>
              Raw extractedJson
            </summary>
            <pre style={{
              marginTop: 8, padding: "10px 12px",
              background: "#f9f9f9", border: "1px solid #eee", borderRadius: 4,
              fontSize: 11, fontFamily: "monospace",
              overflow: "auto", maxHeight: 600,
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {JSON.stringify(ej, null, 2)}
            </pre>
          </details>
        </section>
      ) : (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ margin: "0 0 8px" }}>Extraction Results</h2>
          <p style={{ color: "#888", fontSize: 13 }}>
            No extraction data yet.{isFinancial ? " Click Process above to run the parser." : ""}
          </p>
        </section>
      )}

      {/* ── Manual Override ───────────────────────────────────────────────── */}
      {isFinancial && (
        <OverrideForm
          documentId={doc.id}
          organizationId={organization.id}
          current={{
            issuerName:    doc.issuerName,
            issuerId:      doc.issuerId,
            receiverName:  doc.receiverName,
            receiverId:    doc.receiverId,
            documentDate:  doc.documentDate?.toISOString().slice(0, 10) ?? null,
            currency:      doc.currency,
            totalAmount:   doc.amount != null ? parseFloat(String(doc.amount)) : null,
            invoiceNumber: ci?.invoiceNumber ?? null,
            dueDate:       ci?.dueDate       ?? null,
            subtotal:      ci?.subtotal      ?? null,
            taxAmount:     ci?.taxAmount     ?? null,
            cufe:          ci?.cufe          ?? null,
          }}
          existingOverrides={ej?.overrides ?? {}}
        />
      )}

      {/* ── Override History ──────────────────────────────────────────────── */}
      {ej?.overrides && Object.keys(ej.overrides).length > 0 && (
        <OverrideHistory overrides={ej.overrides} />
      )}

      {/* ── Reprocess History ─────────────────────────────────────────────── */}
      {ej?.reprocessHistory && ej.reprocessHistory.length > 0 && (
        <ReprocessHistory entries={ej.reprocessHistory} />
      )}

      {/* ── Document Timeline ─────────────────────────────────────────────── */}
      <DocumentTimeline doc={doc} ej={ej} alerts={docAlerts} />

      {/* ── Knowledge ─────────────────────────────────────────────────────── */}
      <section style={{ marginTop: 24 }}>
        <h2>Knowledge</h2>
        <IndexKnowledgeButton
          documentId={params.documentId}
          organizationId={organization.id}
        />
      </section>

      <p style={{ marginTop: 20 }}>
        <Link href={`/${params.orgSlug}/documents`}>← Back to documents</Link>
      </p>
    </main>
  );
}

// ── DocumentCompleteness ──────────────────────────────────────────────────────

const REQUIRED_FIELD_DEFS: { key: string; label: string }[] = [
  { key: "issuerId",      label: "Issuer ID (NIT)"  },
  { key: "receiverId",    label: "Customer ID (NIT)" },
  { key: "invoiceNumber", label: "Invoice Number"    },
  { key: "documentDate",  label: "Document Date"     },
  { key: "totalAmount",   label: "Total Amount"      },
  { key: "currency",      label: "Currency"          },
  { key: "cufe",          label: "CUFE"              },
];

function getRawRequired(
  doc: NonNullable<Awaited<ReturnType<typeof import("@/lib/documents/queries").getDocument>>>,
  ci:  ColombianInvoiceJson | null | undefined
): Record<string, unknown> {
  return {
    issuerId:      doc.issuerId,
    receiverId:    doc.receiverId,
    invoiceNumber: ci?.invoiceNumber ?? null,
    documentDate:  doc.documentDate,
    totalAmount:   doc.amount,
    currency:      doc.currency,
    cufe:          ci?.cufe ?? null,
  };
}

function DocumentCompleteness({
  doc, ci, overrides, autoResolvedFields,
}: {
  doc:                NonNullable<Awaited<ReturnType<typeof import("@/lib/documents/queries").getDocument>>>;
  ci:                 ColombianInvoiceJson | null | undefined;
  overrides:          Record<string, OverrideEntry>;
  autoResolvedFields: string[];
}) {
  const raw      = getRawRequired(doc, ci);
  const present  = REQUIRED_FIELD_DEFS.filter((f) => raw[f.key] != null && raw[f.key] !== "");
  const missing  = REQUIRED_FIELD_DEFS.filter((f) => raw[f.key] == null || raw[f.key] === "");
  const autoKeys = autoResolvedFields;
  const ovKeys   = Object.keys(overrides);

  const pill = (label: string, color: string, bg: string, border: string) => (
    <span key={label} style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 12,
      fontSize: 11, fontWeight: 600, color, background: bg,
      border: `1px solid ${border}`, whiteSpace: "nowrap",
    }}>{label}</span>
  );

  return (
    <section style={{
      margin: "16px 0",
      padding: "12px 14px",
      background: "#fafafa",
      border: "1px solid #e4e4e4",
      borderRadius: 6,
      fontSize: 13,
    }}>
      <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700 }}>Document Completeness</h3>

      {/* Required fields */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>
          Required fields: <span style={{ color: present.length === REQUIRED_FIELD_DEFS.length ? "#2e7d32" : "#b71c1c" }}>
            {present.length}/{REQUIRED_FIELD_DEFS.length}
          </span>
        </span>
        <div style={{ marginTop: 5, display: "flex", gap: 5, flexWrap: "wrap" }}>
          {REQUIRED_FIELD_DEFS.map((f) => {
            const has = raw[f.key] != null && raw[f.key] !== "";
            return pill(
              (has ? "✓ " : "✗ ") + f.label,
              has ? "#2e7d32" : "#b71c1c",
              has ? "#e8f5e9" : "#fce4ec",
              has ? "#a5d6a7" : "#f48fb1"
            );
          })}
        </div>
      </div>

      {/* Auto-resolved */}
      {autoKeys.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>Auto-resolved from XML: </span>
          <div style={{ marginTop: 5, display: "flex", gap: 5, flexWrap: "wrap" }}>
            {autoKeys.map((k) =>
              pill("🔗 " + (FIELD_LABEL[k] ?? k), "#1565c0", "#e3f2fd", "#90caf9")
            )}
          </div>
        </div>
      )}

      {/* Manually overridden */}
      {ovKeys.length > 0 && (
        <div>
          <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>Manually overridden: </span>
          <div style={{ marginTop: 5, display: "flex", gap: 5, flexWrap: "wrap" }}>
            {ovKeys.map((k) =>
              pill("✏️ " + (FIELD_LABEL[k] ?? k), "#b45309", "#fff8e1", "#ffe082")
            )}
          </div>
        </div>
      )}

      {missing.length === 0 && autoKeys.length === 0 && ovKeys.length === 0 && (
        <p style={{ margin: 0, fontSize: 12, color: "#2e7d32" }}>All required fields present — no manual corrections needed.</p>
      )}
    </section>
  );
}

// ── FieldInventory ────────────────────────────────────────────────────────────

interface InventoryRow {
  label:       string;
  value:       unknown;
  source:      string | null;
  required:    boolean;
  howObtained: "overridden" | "auto-resolved" | "extracted" | "missing";
}

function buildInventory(
  doc:       NonNullable<Awaited<ReturnType<typeof import("@/lib/documents/queries").getDocument>>>,
  ci:        ColombianInvoiceJson | null | undefined,
  ej:        ExtractedJson,
  fields:    Record<string, FieldEntryJson>,
  xmlMissing: Set<string>,
  isColombianInvoice: boolean
): InventoryRow[] {
  const overrideKeys   = new Set(Object.keys(ej.overrides ?? {}));
  const autoKeys       = new Set((ej.autoResolvedFields as string[] | undefined) ?? []);
  const requiredKeys   = new Set(["issuerId", "receiverId", "invoiceNumber", "documentDate", "totalAmount", "currency", "cufe"]);

  function how(key: string, hasValue: boolean): InventoryRow["howObtained"] {
    if (!hasValue) return "missing";
    if (overrideKeys.has(key)) return "overridden";
    if (autoKeys.has(key) || autoKeys.has(
      key === "receiverId" ? "customerId" : key === "totalAmount" ? "totalAmount" : key
    )) return "auto-resolved";
    return "extracted";
  }

  function xmlSrc(fieldKey: string, hasValue: boolean): string | null {
    if (!hasValue) return null;
    return xmlMissing.has(fieldKey) ? "pdf" : "xml";
  }

  const rows: InventoryRow[] = [
    { label: "Issuer Name",    value: doc.issuerName,     source: fields.issuerName?.source ?? null,    required: false, howObtained: how("issuerName",    !!doc.issuerName)  },
    { label: "Issuer ID (NIT)",value: doc.issuerId,       source: fields.issuerId?.source ?? null,      required: true,  howObtained: how("issuerId",      !!doc.issuerId)    },
    { label: "Customer Name",  value: doc.receiverName,   source: fields.receiverName?.source ?? null,  required: false, howObtained: how("receiverName",  !!doc.receiverName)},
    { label: "Customer ID (NIT)",value: doc.receiverId,   source: fields.receiverId?.source ?? null,    required: true,  howObtained: how("receiverId",    !!doc.receiverId)  },
    { label: "Document Date",  value: doc.documentDate ? fmt(doc.documentDate) : null, source: fields.documentDate?.source ?? null, required: true, howObtained: how("documentDate", !!doc.documentDate) },
    { label: "Total Amount",   value: doc.amount != null ? fmtAmount(parseFloat(String(doc.amount)), doc.currency) : null, source: fields.amount?.source ?? null, required: true, howObtained: how("totalAmount", doc.amount != null) },
    { label: "Currency",       value: doc.currency,       source: fields.currency?.source ?? null,      required: true,  howObtained: how("currency",      !!doc.currency)    },
  ];

  if (isColombianInvoice) {
    rows.push(
      { label: "Invoice Number", value: ci?.invoiceNumber ?? null, source: xmlSrc("invoiceNumber", !!ci?.invoiceNumber), required: true,  howObtained: how("invoiceNumber", !!ci?.invoiceNumber) },
      { label: "Prefix",         value: ci?.prefix ?? null,        source: ci?.prefix ? "pdf" : null,                   required: false, howObtained: how("prefix",        !!ci?.prefix)          },
      { label: "Due Date",       value: ci?.dueDate ? ci.dueDate.slice(0, 10) : null, source: xmlSrc("dueDate", !!ci?.dueDate), required: false, howObtained: how("dueDate", !!ci?.dueDate) },
      { label: "Subtotal",       value: ci?.subtotal != null ? fmtAmount(ci.subtotal, doc.currency) : null,   source: xmlSrc("subtotal",   ci?.subtotal != null),   required: false, howObtained: how("subtotal",   ci?.subtotal != null)   },
      { label: "Tax Amount",     value: ci?.taxAmount != null ? fmtAmount(ci.taxAmount, doc.currency) : null, source: xmlSrc("taxAmount",  ci?.taxAmount != null),  required: false, howObtained: how("taxAmount",  ci?.taxAmount != null)  },
      { label: "CUFE",           value: ci?.cufe ?? null,           source: xmlSrc("cufe", !!ci?.cufe),                 required: true,  howObtained: how("cufe",          !!ci?.cufe)            }
    );
  }

  return rows;
}

const HOW_STYLE: Record<InventoryRow["howObtained"], { label: string; color: string; bg: string; border: string }> = {
  "extracted":     { label: "Extracted",      color: "#1565c0", bg: "#e3f2fd", border: "#90caf9" },
  "auto-resolved": { label: "Auto-resolved",  color: "#2e7d32", bg: "#e8f5e9", border: "#a5d6a7" },
  "overridden":    { label: "Manual override",color: "#b45309", bg: "#fff8e1", border: "#ffe082" },
  "missing":       { label: "Missing",        color: "#b71c1c", bg: "#fce4ec", border: "#f48fb1" },
};

function FieldInventory({
  doc, ci, ej, fields, xmlMissing, isColombianInvoice,
}: {
  doc:                NonNullable<Awaited<ReturnType<typeof import("@/lib/documents/queries").getDocument>>>;
  ci:                 ColombianInvoiceJson | null | undefined;
  ej:                 ExtractedJson;
  fields:             Record<string, FieldEntryJson>;
  xmlMissing:         Set<string>;
  isColombianInvoice: boolean;
}) {
  const rows = buildInventory(doc, ci, ej, fields, xmlMissing, isColombianInvoice);
  const autoCount     = rows.filter((r) => r.howObtained === "auto-resolved").length;
  const overrideCount = rows.filter((r) => r.howObtained === "overridden").length;
  const missingCount  = rows.filter((r) => r.howObtained === "missing").length;
  const extractCount  = rows.filter((r) => r.howObtained === "extracted").length;

  return (
    <section style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 15 }}>Field Inventory</h2>
        <span style={{ fontSize: 12, color: "#888" }}>
          {extractCount} extracted
          {autoCount > 0 ? ` · ${autoCount} auto-resolved` : ""}
          {overrideCount > 0 ? ` · ${overrideCount} overridden` : ""}
          {missingCount > 0 ? ` · ${missingCount} missing` : ""}
        </span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #eee" }}>
            <th style={{ textAlign: "left", padding: "4px 8px 6px 0",  color: "#444", width: 170 }}>Field</th>
            <th style={{ textAlign: "left", padding: "4px 8px 6px",    color: "#444" }}>Value</th>
            <th style={{ textAlign: "left", padding: "4px 8px 6px",    color: "#444", width: 60  }}>Source</th>
            <th style={{ textAlign: "left", padding: "4px 0 6px 8px",  color: "#444", width: 130 }}>How obtained</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const st = HOW_STYLE[row.howObtained];
            const isMissing = row.howObtained === "missing";
            return (
              <tr key={row.label} style={{ borderBottom: "1px solid #f4f4f4" }}>
                <td style={{
                  padding: "5px 8px 5px 0",
                  fontWeight: row.required ? 600 : 400,
                  color: isMissing && row.required ? "#b71c1c" : "#333",
                }}>
                  {row.label}
                  {row.required && <span style={{ color: "#aaa", fontWeight: 400, marginLeft: 3 }}>*</span>}
                </td>
                <td style={{
                  padding: "5px 8px",
                  fontFamily: ["CUFE", "Issuer ID (NIT)", "Customer ID (NIT)"].includes(row.label) ? "monospace" : "inherit",
                  fontSize:   row.label === "CUFE" ? 11 : 13,
                  color:      isMissing ? "#aaa" : "#1a1a1a",
                  fontStyle:  isMissing ? "italic" : "normal",
                  wordBreak:  "break-word",
                }}>
                  {isMissing ? "—" : (
                    typeof row.value === "string" && row.value.length > 80
                      ? row.value.slice(0, 72) + "…"
                      : String(row.value ?? "—")
                  )}
                </td>
                <td style={{ padding: "5px 8px" }}>
                  <SourceTag source={isMissing ? null : row.source} />
                </td>
                <td style={{ padding: "5px 0 5px 8px" }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: st.color, background: st.bg,
                    border: `1px solid ${st.border}`,
                    borderRadius: 3, padding: "1px 6px",
                    whiteSpace: "nowrap",
                  }}>
                    {st.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ margin: "8px 0 0", fontSize: 11, color: "#aaa" }}>
        * Required for validation · Source: xml = DIAN XML · pdf = PDF text · metadata = document metadata · manual = operator override
      </p>
    </section>
  );
}

// ── DocumentTimeline ──────────────────────────────────────────────────────────

interface TimelineEvent {
  at:     Date;
  icon:   string;
  label:  string;
  actor?: string | null;
  note?:  string | null;
  color?: string;
}

const VS_COLOR: Record<string, string> = {
  VALID:            "#2e7d32",
  INCOMPLETE:       "#b71c1c",
  REVIEW_REQUIRED:  "#f57f17",
};

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "#b71c1c",
  WARNING:  "#f57f17",
  INFO:     "#1565c0",
};

function buildTimeline(
  doc:    NonNullable<Awaited<ReturnType<typeof import("@/lib/documents/queries").getDocument>>>,
  ej:     ExtractedJson | null,
  alerts: DocumentAlert[]
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // 1. Created / uploaded
  events.push({
    at:    doc.createdAt,
    icon:  "📄",
    label: "Document uploaded",
    note:  doc.file?.name ?? doc.type,
    color: "#1565c0",
  });

  // 2. First processing run
  if (ej?.extractedAt) {
    const mode = ej.processingMode;
    const modeLabel: Record<string, string> = {
      "xml-first":            "XML",
      "xml-and-pdf":          "XML + PDF",
      "pdf-fallback":         "PDF fallback",
      "manual-review-needed": "Manual review needed",
    };
    events.push({
      at:    new Date(ej.extractedAt),
      icon:  "⚙️",
      label: "Processed",
      actor: ej.actorUserId ?? null,
      note:  mode ? modeLabel[mode] ?? mode : null,
      color: "#555",
    });

    // 3. Validation status assigned (same run)
    if (ej.validationStatus) {
      events.push({
        at:    new Date(ej.extractedAt),
        icon:  ej.validationStatus === "VALID" ? "✅" : ej.validationStatus === "INCOMPLETE" ? "⚠️" : "🔍",
        label: `Validation: ${ej.validationStatus}`,
        note:  ej.validationErrors && ej.validationErrors.length > 0
          ? ej.validationErrors.slice(0, 2).join("; ") + (ej.validationErrors.length > 2 ? ` (+${ej.validationErrors.length - 2} more)` : "")
          : null,
        color: VS_COLOR[ej.validationStatus] ?? "#555",
      });
    }

    // 3b. Auto-resolved fields (same run)
    if (ej.autoResolvedFields && (ej.autoResolvedFields as string[]).length > 0) {
      events.push({
        at:    new Date(ej.extractedAt),
        icon:  "🔗",
        label: "Fields auto-resolved from XML",
        note:  (ej.autoResolvedFields as string[]).join(", "),
        color: "#2e7d32",
      });
    }
  }

  // 4. Alert raised / resolved (chronological, from DB)
  for (const alert of alerts) {
    events.push({
      at:    alert.createdAt,
      icon:  "🚨",
      label: `Alert raised: ${alert.type}`,
      note:  alert.title,
      color: SEVERITY_COLOR[alert.severity] ?? "#888",
    });
    if (alert.resolvedAt) {
      events.push({
        at:    alert.resolvedAt,
        icon:  "✔︎",
        label: "Alert resolved",
        note:  alert.title,
        color: "#2e7d32",
      });
    }
  }

  // 5. Manual overrides — group by setAt to collapse same-submission overrides
  if (ej?.overrides) {
    const grouped = new Map<string, string[]>();
    for (const [key, entry] of Object.entries(ej.overrides)) {
      const existing = grouped.get(entry.setAt) ?? [];
      existing.push(FIELD_LABEL[key] ?? key);
      grouped.set(entry.setAt, existing);
    }
    for (const [setAt, fields] of grouped) {
      // Find actor from any entry in this timestamp group
      const actor = Object.values(ej.overrides).find((e) => e.setAt === setAt)?.setBy ?? null;
      events.push({
        at:    new Date(setAt),
        icon:  "✏️",
        label: `${fields.length === 1 ? "Field" : `${fields.length} fields`} overridden`,
        actor,
        note:  fields.join(", "),
        color: "#b45309",
      });
    }
  }

  // 6. Reprocess runs
  if (ej?.reprocessHistory) {
    const modeLabel: Record<string, string> = {
      "full":            "Full re-extract",
      "validation-only": "Validation only",
    };
    for (const entry of ej.reprocessHistory) {
      events.push({
        at:    new Date(entry.at),
        icon:  "🔄",
        label: "Reprocessed",
        actor: entry.triggeredBy ?? null,
        note:  `${modeLabel[entry.mode] ?? entry.mode} · ${entry.previousStatus ?? "—"} → ${entry.newStatus}`,
        color: "#1565c0",
      });
    }
  }

  // 7. Reviewed / approved
  if (ej?.review?.reviewedAt) {
    events.push({
      at:    new Date(ej.review.reviewedAt),
      icon:  "✅",
      label: "Document approved",
      actor: ej.review.reviewedByName ?? ej.review.reviewedByEmail ?? ej.review.reviewedBy ?? null,
      color: "#2e7d32",
    });
  }

  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function DocumentTimeline({
  doc,
  ej,
  alerts,
}: {
  doc:    NonNullable<Awaited<ReturnType<typeof import("@/lib/documents/queries").getDocument>>>;
  ej:     ExtractedJson | null;
  alerts: DocumentAlert[];
}) {
  const events = buildTimeline(doc, ej, alerts);

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ margin: "0 0 14px", fontSize: 16 }}>Document Timeline</h2>
      <div style={{ position: "relative", paddingLeft: 24 }}>
        {/* vertical line */}
        <div style={{
          position: "absolute", left: 7, top: 8, bottom: 8,
          width: 2, background: "#e8e8e8",
        }} />

        {events.map((ev, i) => (
          <div key={i} style={{ position: "relative", marginBottom: 14, paddingLeft: 20 }}>
            {/* dot */}
            <div style={{
              position:    "absolute",
              left:        -17,
              top:         3,
              width:       10,
              height:      10,
              borderRadius: "50%",
              background:  ev.color ?? "#ccc",
              border:      "2px solid #fff",
              boxShadow:   "0 0 0 1px #ddd",
            }} />

            {/* timestamp */}
            <div style={{ fontSize: 11, color: "#aaa", marginBottom: 1, fontVariantNumeric: "tabular-nums" }}>
              {ev.at.toISOString().slice(0, 16).replace("T", " ")} UTC
            </div>

            {/* label row */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: ev.color ?? "#333" }}>
                {ev.icon} {ev.label}
              </span>
              {ev.actor && (
                <span style={{ fontSize: 11, color: "#888" }}>
                  by {ev.actor.length > 24 ? ev.actor.slice(0, 22) + "…" : ev.actor}
                </span>
              )}
            </div>

            {/* note */}
            {ev.note && (
              <div style={{ fontSize: 12, color: "#777", marginTop: 2, lineHeight: 1.4 }}>
                {ev.note}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── OverrideHistory ───────────────────────────────────────────────────────────

const FIELD_LABEL: Record<string, string> = {
  issuerName:    "Issuer Name",
  issuerId:      "Issuer ID (NIT)",
  receiverName:  "Customer Name",
  receiverId:    "Customer ID (NIT)",
  documentDate:  "Document Date",
  currency:      "Currency",
  totalAmount:   "Total Amount",
  invoiceNumber: "Invoice Number",
  dueDate:       "Due Date",
  subtotal:      "Subtotal",
  taxAmount:     "Tax Amount",
  cufe:          "CUFE",
};

function displayVal(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "number") return v.toLocaleString();
  const s = String(v);
  if (s.length > 64) return s.slice(0, 60) + "…";
  return s;
}

function OverrideHistory({ overrides }: { overrides: Record<string, OverrideEntry> }) {
  const entries = Object.entries(overrides).sort((a, b) =>
    a[1].setAt.localeCompare(b[1].setAt)
  );

  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Override History</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #eee" }}>
            <th style={{ textAlign: "left", padding: "4px 8px 6px 0",  width: 160, color: "#444" }}>Field</th>
            <th style={{ textAlign: "left", padding: "4px 8px 6px",    color: "#444" }}>Original (extracted)</th>
            <th style={{ textAlign: "left", padding: "4px 8px 6px",    color: "#444" }}>Override value</th>
            <th style={{ textAlign: "left", padding: "4px 8px 6px",    width: 140, color: "#444" }}>Changed at</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, entry]) => (
            <tr key={key} style={{ borderBottom: "1px solid #f4f4f4" }}>
              <td style={{ padding: "6px 8px 6px 0", fontWeight: 600 }}>
                {FIELD_LABEL[key] ?? key}
              </td>
              <td style={{
                padding: "6px 8px",
                color: entry.originalValue == null ? "#bbb" : "#888",
                fontStyle: entry.originalValue == null ? "italic" : "normal",
                fontFamily: key === "cufe" ? "monospace" : "inherit",
                fontSize: key === "cufe" ? 11 : 13,
              }}>
                {displayVal(entry.originalValue)}
              </td>
              <td style={{
                padding: "6px 8px",
                color: "#1a1a1a",
                fontFamily: key === "cufe" ? "monospace" : "inherit",
                fontSize: key === "cufe" ? 11 : 13,
              }}>
                {displayVal(entry.value)}
              </td>
              <td style={{ padding: "6px 8px", fontSize: 11, color: "#888" }}>
                {new Date(entry.setAt).toISOString().slice(0, 16).replace("T", " ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ── ReprocessHistory ──────────────────────────────────────────────────────────

const REPROCESS_MODE_LABEL: Record<string, string> = {
  "full":             "Full re-extract",
  "validation-only":  "Validation only",
};

const REPROCESS_STATUS_COLOR: Record<string, string> = {
  VALID:            "#2e7d32",
  INCOMPLETE:       "#b71c1c",
  REVIEW_REQUIRED:  "#f57f17",
};

function ReprocessHistory({
  entries,
}: {
  entries: NonNullable<ExtractedJson["reprocessHistory"]>;
}) {
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Reprocess History</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #eee" }}>
            <th style={{ textAlign: "left", padding: "4px 8px 6px 0", width: 160, color: "#444" }}>When</th>
            <th style={{ textAlign: "left", padding: "4px 8px 6px",   width: 150, color: "#444" }}>Mode</th>
            <th style={{ textAlign: "left", padding: "4px 8px 6px",   color: "#444" }}>Before → After</th>
          </tr>
        </thead>
        <tbody>
          {[...entries].reverse().map((entry, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #f4f4f4" }}>
              <td style={{ padding: "6px 8px 6px 0", fontSize: 11, color: "#888" }}>
                {new Date(entry.at).toISOString().slice(0, 16).replace("T", " ")} UTC
              </td>
              <td style={{ padding: "6px 8px" }}>
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color:      entry.mode === "full" ? "#1565c0" : "#555",
                  background: entry.mode === "full" ? "#e3f2fd" : "#f5f5f5",
                  border:    `1px solid ${entry.mode === "full" ? "#90caf9" : "#ddd"}`,
                  borderRadius: 3, padding: "1px 6px",
                }}>
                  {REPROCESS_MODE_LABEL[entry.mode] ?? entry.mode}
                </span>
              </td>
              <td style={{ padding: "6px 8px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: REPROCESS_STATUS_COLOR[entry.previousStatus ?? ""] ?? "#aaa", fontWeight: 600, fontSize: 12 }}>
                  {entry.previousStatus ?? "—"}
                </span>
                <span style={{ color: "#aaa" }}>→</span>
                <span style={{ color: REPROCESS_STATUS_COLOR[entry.newStatus] ?? "#555", fontWeight: 700, fontSize: 12 }}>
                  {entry.newStatus}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
