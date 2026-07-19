/**
 * dian-read.ts
 *
 * Sprint 3 — DIAN Read Layer / Verdad fiscal V1
 *
 * Cross-check engine: compares parsed DIAN fields against:
 *   - Document.amount / Document.documentDate / Document.issuerId
 *   - CustomerReceivable (by invoiceNumber + NIT)
 *   - Duplicate CUFE detection across all documents
 *
 * No live DIAN API — all data comes from the already-stored extractedJson.
 *
 * Mismatch severity:
 *   CRITICAL → forces INCONSISTENTE regardless of other signals
 *   WARNING  → forces INCONSISTENTE when no CRITICAL mismatches
 *   INFO     → logged but does not change status
 */

import { prisma }          from "@/lib/prisma";
import { parseDianFields, validateCufe, normalizeNit, nitBase } from "./dian-parser";
import type { DianFields } from "./dian-parser";

// ── Fiscal status type ─────────────────────────────────────────────────────────

export type FiscalStatus =
  | "VALIDADO"       // CUFE present + valid + all cross-checks pass
  | "RECHAZADO"      // XML extraction failed or CUFE malformed
  | "NO_ENCONTRADO"  // Invoice/nota without CUFE or XML backing
  | "INCONSISTENTE"  // CUFE valid but cross-check mismatch detected
  | "DUPLICADO";     // Same CUFE appears in multiple documents

// ── Mismatch type ──────────────────────────────────────────────────────────────

export interface FiscalMismatch {
  field:    string;
  dianValue: string;
  docValue:  string;
  severity:  "CRITICAL" | "WARNING" | "INFO";
  note:      string;
}

// ── Per-document fiscal record ────────────────────────────────────────────────

export interface FiscalDocument {
  documentId:    string;
  documentTitle: string;
  documentType:  string;
  documentDate:  Date   | null;
  amount:        number | null;
  currency:      string | null;
  issuerId:      string | null;
  receiverId:    string | null;
  /** All DIAN-parsed fiscal fields. */
  dian:          DianFields;
  fiscalStatus:  FiscalStatus;
  mismatches:    FiscalMismatch[];
  /** documentId of the original when this is a DUPLICADO. */
  duplicateOf:   string | null;
  notes:         string[];
}

// ── Batch summary ──────────────────────────────────────────────────────────────

export interface FiscalSummary {
  total:         number;
  validado:      number;
  rechazado:     number;
  noEncontrado:  number;
  inconsistente: number;
  duplicado:     number;
  items:         FiscalDocument[];
  hasData:       boolean;
}

// ── Tolerances ─────────────────────────────────────────────────────────────────

const AMOUNT_CRITICAL_PCT  = 0.05;  // > 5% → CRITICAL
const AMOUNT_WARNING_PCT   = 0.02;  // 2-5% → WARNING
const DATE_WARNING_DAYS    = 30;    // > 30 days gap → WARNING
const DATE_CRITICAL_DAYS   = 90;    // > 90 days gap → CRITICAL

// ── Families that MUST have a CUFE ────────────────────────────────────────────

const CUFE_REQUIRED_FAMILIES = new Set([
  "CO_INVOICE",
  "CO_ATTACHED_DOCUMENT",
  "CO_CREDIT_NOTE",
  "CO_DEBIT_NOTE",
]);

// ── Cross-check rules ─────────────────────────────────────────────────────────

function checkAmountConsistency(
  dianAmount: number | null,
  docAmount:  number | null,
  label:      string,
): FiscalMismatch | null {
  if (dianAmount === null || docAmount === null) return null;
  const diff = Math.abs(dianAmount - docAmount);
  const base = Math.max(Math.abs(dianAmount), Math.abs(docAmount), 1);
  const pct  = diff / base;
  if (pct <= AMOUNT_WARNING_PCT) return null;
  const severity: FiscalMismatch["severity"] = pct > AMOUNT_CRITICAL_PCT ? "CRITICAL" : "WARNING";
  return {
    field:    label,
    dianValue: `$${dianAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
    docValue:  `$${docAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
    severity,
    note:      `Diferencia de ${(pct * 100).toFixed(1)}%`,
  };
}

function checkDateConsistency(
  dianDate: Date | null,
  docDate:  Date | null,
): FiscalMismatch | null {
  if (!dianDate || !docDate) return null;
  const diffDays = Math.abs(dianDate.getTime() - docDate.getTime()) / 86_400_000;
  if (diffDays <= 3) return null;
  const severity: FiscalMismatch["severity"] = diffDays > DATE_CRITICAL_DAYS ? "CRITICAL" : "WARNING";
  return {
    field:    "Fecha de emisión",
    dianValue: dianDate.toISOString().slice(0, 10),
    docValue:  docDate.toISOString().slice(0, 10),
    severity,
    note:      `${Math.round(diffDays)} días de diferencia`,
  };
}

function checkNitConsistency(
  dianNit:  string | null,
  docNit:   string | null,
  label:    string,
): FiscalMismatch | null {
  if (!dianNit || !docNit) return null;
  // Compare base NIT (no check digit, no formatting)
  if (nitBase(dianNit) === nitBase(docNit)) return null;
  // Looser: full normalized
  if (normalizeNit(dianNit) === normalizeNit(docNit)) return null;
  return {
    field:    label,
    dianValue: dianNit,
    docValue:  docNit,
    severity:  "WARNING",
    note:      "NIT no coincide entre XML y metadatos del documento",
  };
}

function checkReceivableConsistency(
  dianTotal:    number | null,
  recOriginal:  number,
  invoiceNum:   string,
): FiscalMismatch | null {
  if (dianTotal === null) return null;
  const diff = Math.abs(dianTotal - recOriginal);
  const pct  = diff / Math.max(Math.abs(recOriginal), 1);
  if (pct <= AMOUNT_WARNING_PCT) return null;
  const severity: FiscalMismatch["severity"] = pct > AMOUNT_CRITICAL_PCT ? "CRITICAL" : "WARNING";
  return {
    field:    "Monto vs cartera ERP",
    dianValue: `$${dianTotal.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
    docValue:  `$${recOriginal.toLocaleString("en-US", { maximumFractionDigits: 0 })} (FAC ${invoiceNum})`,
    severity,
    note:      `Diferencia de ${(pct * 100).toFixed(1)}% vs cartera ERP`,
  };
}

// ── Status resolution ─────────────────────────────────────────────────────────

function resolveFiscalStatus(params: {
  dian:         DianFields;
  mismatches:   FiscalMismatch[];
  isDuplicate:  boolean;
  cufeRequired: boolean;
}): FiscalStatus {
  const { dian, mismatches, isDuplicate, cufeRequired } = params;

  if (isDuplicate) return "DUPLICADO";

  if (!dian.extractionSuccess) return "RECHAZADO";

  const cufeVal = validateCufe(dian.cufe);

  if (cufeRequired && !cufeVal.present) return "NO_ENCONTRADO";
  if (cufeVal.present && !cufeVal.valid) return "RECHAZADO";

  if (mismatches.some((m) => m.severity === "CRITICAL")) return "INCONSISTENTE";
  if (mismatches.some((m) => m.severity === "WARNING"))  return "INCONSISTENTE";

  if (!cufeRequired && !cufeVal.present) return "NO_ENCONTRADO";

  return "VALIDADO";
}

// ── Raw DB types ──────────────────────────────────────────────────────────────

type RawDoc = {
  id:            string;
  title:         string;
  type:          string;
  amount:        { toNumber(): number } | null;
  currency:      string | null;
  documentDate:  Date | null;
  issuerId:      string | null;
  receiverId:    string | null;
  extractedJson: unknown;
};

type RawReceivable = {
  invoiceNumber:  string | null;
  customerNit:    string | null;
  originalAmount: { toNumber(): number };
};

// ── Main query ────────────────────────────────────────────────────────────────

export async function getDianFiscalSummary(
  organizationId: string,
): Promise<FiscalSummary> {
  // Load XML documents + invoice-family PDFs
  const [rawDocs, rawRecs] = await Promise.all([
    prisma.document.findMany({
      where: {
        organizationId,
        deletedAt: null,
        type: { in: ["XML", "PDF"] },
        status: { in: ["PENDING", "PROCESSED", "REVIEWED"] },
      },
      orderBy: { documentDate: "desc" },
      take:    200,
      select: {
        id:            true,
        title:         true,
        type:          true,
        amount:        true,
        currency:      true,
        documentDate:  true,
        issuerId:      true,
        receiverId:    true,
        extractedJson: true,
      },
    }) as Promise<RawDoc[]>,

    prisma.customerReceivable.findMany({
      where:   { organizationId },
      take:    300,
      select: { invoiceNumber: true, customerNit: true, originalAmount: true },
    }) as Promise<RawReceivable[]>,
  ]);

  if (rawDocs.length === 0) {
    return {
      total: 0, validado: 0, rechazado: 0, noEncontrado: 0,
      inconsistente: 0, duplicado: 0, items: [], hasData: false,
    };
  }

  // Build receivable lookup: invoiceNumber → originalAmount
  const recByInvoice = new Map<string, number>();
  for (const r of rawRecs) {
    if (r.invoiceNumber) {
      recByInvoice.set(r.invoiceNumber.trim().toUpperCase(), r.originalAmount.toNumber());
    }
  }

  // ── Pass 1: parse DIAN fields + build CUFE registry for duplicate detection
  const parsed: Array<{ doc: RawDoc; dian: DianFields }> = [];
  const cufeRegistry = new Map<string, string>(); // normalised CUFE → first documentId

  for (const doc of rawDocs) {
    const dian = parseDianFields(doc.extractedJson);
    parsed.push({ doc, dian });

    if (dian.cufe) {
      const normCufe = dian.cufe.trim().toLowerCase();
      if (!cufeRegistry.has(normCufe)) cufeRegistry.set(normCufe, doc.id);
    }
  }

  // ── Pass 2: cross-check each document
  const items: FiscalDocument[] = [];

  for (const { doc, dian } of parsed) {
    const mismatches:   FiscalMismatch[] = [];
    const notes:        string[]         = [];
    let   duplicateOf:  string | null    = null;

    // Only apply fiscal logic to XML docs or PDFs that produced XML data
    const hasXmlData = dian.extractionSuccess || dian.xmlFormat !== null;
    const isPdf      = doc.type === "PDF";
    if (isPdf && !hasXmlData) continue; // skip PDFs with no XML extraction

    const docAmount = doc.amount?.toNumber() ?? null;
    const cufeRequired = dian.xmlFormat
      ? CUFE_REQUIRED_FAMILIES.has(dian.xmlFormat)
      : doc.type === "XML"; // raw XML doc without format → still require CUFE

    // ── Duplicate CUFE check
    if (dian.cufe) {
      const normCufe = dian.cufe.trim().toLowerCase();
      const firstId  = cufeRegistry.get(normCufe);
      if (firstId && firstId !== doc.id) {
        duplicateOf = firstId;
        notes.push(`CUFE duplicado — original: ${firstId.slice(0, 8)}…`);
      }
    }

    // ── Amount consistency (dian total vs doc amount)
    if (!duplicateOf) {
      const amtMismatch = checkAmountConsistency(dian.totalAmount, docAmount, "Monto total");
      if (amtMismatch) mismatches.push(amtMismatch);

      // ── Date consistency
      const dateMismatch = checkDateConsistency(dian.issueDate, doc.documentDate);
      if (dateMismatch) mismatches.push(dateMismatch);

      // ── NIT consistency (issuer)
      const issuerNitMismatch = checkNitConsistency(
        dian.issuerNit, doc.issuerId, "NIT emisor",
      );
      if (issuerNitMismatch) mismatches.push(issuerNitMismatch);

      // ── NIT consistency (receiver/customer)
      const receiverNitMismatch = checkNitConsistency(
        dian.receiverNit, doc.receiverId, "NIT receptor",
      );
      if (receiverNitMismatch) mismatches.push(receiverNitMismatch);

      // ── Cross-check against CustomerReceivable
      const invNum = dian.invoiceNumber?.trim().toUpperCase();
      if (invNum) {
        const recAmount = recByInvoice.get(invNum);
        if (recAmount !== undefined) {
          const recMismatch = checkReceivableConsistency(
            dian.totalAmount, recAmount, invNum,
          );
          if (recMismatch) mismatches.push(recMismatch);
        } else if (!dian.isNota) {
          // Invoice not found in cartera at all (info only)
          notes.push("Factura no encontrada en cartera ERP");
        }
      }

      // ── CUFE format warning (valid but non-canonical length)
      const cufeVal = validateCufe(dian.cufe);
      if (cufeVal.present && cufeVal.valid && !cufeVal.nominal && cufeVal.reason) {
        mismatches.push({
          field:    "CUFE",
          dianValue: `${dian.cufe?.length ?? 0} chars`,
          docValue:  "96 chars (SHA-384)",
          severity:  "INFO",
          note:      cufeVal.reason,
        });
      }

      // ── Embedded payload note
      if (dian.xmlFormat === "CO_ATTACHED_DOCUMENT" && !dian.embeddedPayload) {
        notes.push("AttachedDocument sin payload incrustado — montos no disponibles");
        if (dian.totalAmount === null && docAmount !== null) {
          // Can't check amount but flag it
          notes.push("Monto tomado de metadatos del documento (no del XML)");
        }
      }

      // ── Non-canonical XML type info
      if (dian.xmlFormat === "CFDI") {
        notes.push("Comprobante Fiscal mexicano (CFDI) — no aplicable a DIAN Colombia");
      }
    }

    const fiscalStatus = resolveFiscalStatus({
      dian, mismatches, isDuplicate: duplicateOf !== null, cufeRequired,
    });

    items.push({
      documentId:    doc.id,
      documentTitle: doc.title,
      documentType:  doc.type,
      documentDate:  doc.documentDate,
      amount:        docAmount,
      currency:      doc.currency,
      issuerId:      doc.issuerId,
      receiverId:    doc.receiverId,
      dian,
      fiscalStatus,
      mismatches,
      duplicateOf,
      notes,
    });
  }

  // ── Sort: most critical first
  const STATUS_ORDER: Record<FiscalStatus, number> = {
    RECHAZADO:     0,
    DUPLICADO:     1,
    INCONSISTENTE: 2,
    NO_ENCONTRADO: 3,
    VALIDADO:      4,
  };
  items.sort((a, b) => STATUS_ORDER[a.fiscalStatus] - STATUS_ORDER[b.fiscalStatus]);

  return {
    total:         items.length,
    validado:      items.filter((i) => i.fiscalStatus === "VALIDADO").length,
    rechazado:     items.filter((i) => i.fiscalStatus === "RECHAZADO").length,
    noEncontrado:  items.filter((i) => i.fiscalStatus === "NO_ENCONTRADO").length,
    inconsistente: items.filter((i) => i.fiscalStatus === "INCONSISTENTE").length,
    duplicado:     items.filter((i) => i.fiscalStatus === "DUPLICADO").length,
    items,
    hasData:       items.length > 0,
  };
}

// ── UI helpers (exported for the finance page) ────────────────────────────────

export const FISCAL_STATUS_STYLE: Record<FiscalStatus, {
  color: string; bg: string; border: string; label: string; icon: string;
}> = {
  VALIDADO:      { color: "#2e7d32", bg: "#e8f5e9", border: "#a5d6a7", label: "Validado",      icon: "✓" },
  RECHAZADO:     { color: "#c00",    bg: "#fce4ec", border: "#f48fb1", label: "Rechazado",     icon: "✕" },
  NO_ENCONTRADO: { color: "#555",    bg: "#f5f5f5", border: "#ddd",    label: "Sin soporte XML",icon: "○" },
  INCONSISTENTE: { color: "#f57f17", bg: "#fff8e1", border: "#ffe082", label: "Inconsistente", icon: "△" },
  DUPLICADO:     { color: "#6a1b9a", bg: "#f3e5f5", border: "#ce93d8", label: "Duplicado",     icon: "⊡" },
};
