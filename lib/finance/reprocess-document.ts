import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { processFinancialDocument, validateDocumentFields } from "./process-document";
import { type OverrideMap } from "./override-document";

// ── Public types ──────────────────────────────────────────────────────────────

export type ReprocessMode = "full" | "validation-only";

export interface ReprocessHistoryEntry {
  at:             string;   // ISO timestamp
  mode:           ReprocessMode;
  previousStatus: string | null;
  newStatus:      string;
  triggeredBy:    string;   // userId
}

export interface ReprocessResult {
  mode:               ReprocessMode;
  previousStatus:     string | null;
  newStatus:          string;
  validationErrors:   string[];
  validationWarnings: string[];
  overridesRestored:  boolean;
}

// ── Internal snapshot of the doc before any write ─────────────────────────────

interface DocSnapshot {
  id:           string;
  issuerName:   string | null;
  issuerId:     string | null;
  receiverName: string | null;
  receiverId:   string | null;
  documentDate: Date   | null;
  amount:       Prisma.Decimal | null;
  currency:     string | null;
  extractedJson: Prisma.JsonValue;
}

// ── reprocessDocument ─────────────────────────────────────────────────────────

/**
 * Reprocesses a financial document.
 *
 * FULL_REPROCESS:
 *   - Runs the complete extraction pipeline (XML + PDF) via processFinancialDocument.
 *   - If the document had operator overrides, restores them into the fresh
 *     extractedJson and re-runs validation with the merged values.
 *   - originalValues in each override entry are preserved unchanged.
 *
 * VALIDATION_ONLY:
 *   - Skips extraction entirely.
 *   - Merges current top-level DB fields + existing overrides.
 *   - Re-runs validateDocumentFields and writes only the validation fields.
 *   - Extraction data, colombianInvoice, overrides etc. are not touched.
 *
 * Both modes:
 *   - Append a ReprocessHistoryEntry to extractedJson.reprocessHistory.
 *   - Write lastReprocessedAt, lastReprocessMode, previousValidationStatus.
 *   - Never lose overrides.
 */
export async function reprocessDocument(
  documentId:    string,
  organizationId: string,
  userId:        string,
  mode:          ReprocessMode
): Promise<ReprocessResult> {
  // ── 1. Read current state ─────────────────────────────────────────────────
  const doc = await prisma.document.findFirst({
    where: { id: documentId, organizationId, deletedAt: null },
    select: {
      id:            true,
      status:        true,
      issuerName:    true,
      issuerId:      true,
      receiverName:  true,
      receiverId:    true,
      documentDate:  true,
      amount:        true,
      currency:      true,
      extractedJson: true,
    },
  });

  if (!doc) throw new Error("DOCUMENT_NOT_FOUND");
  if (doc.status === "REVIEWED") throw new Error("DOCUMENT_ALREADY_REVIEWED");

  const ej = (doc.extractedJson ?? {}) as Record<string, unknown>;
  const previousStatus  = (ej.validationStatus as string | undefined) ?? null;
  const savedOverrides  = (ej.overrides         as OverrideMap | undefined) ?? {};
  const existingHistory = (ej.reprocessHistory  as ReprocessHistoryEntry[] | undefined) ?? [];
  const hasOverrides    = Object.keys(savedOverrides).length > 0;

  const now = new Date();

  // ── 2. Execute chosen mode ────────────────────────────────────────────────
  let newStatus:         string;
  let validationErrors:  string[];
  let validationWarnings: string[];

  if (mode === "validation-only") {
    const res = await execValidationOnly(doc, ej, savedOverrides, now);
    newStatus         = res.newStatus;
    validationErrors  = res.validationErrors;
    validationWarnings = res.validationWarnings;
  } else {
    const res = await execFullReprocess(doc.id, organizationId, userId, savedOverrides, now);
    newStatus         = res.newStatus;
    validationErrors  = res.validationErrors;
    validationWarnings = res.validationWarnings;
  }

  // ── 3. Patch reprocessHistory into the final extractedJson ────────────────
  // Read whatever extractedJson is now (both modes have already written to it).
  const latest = await prisma.document.findFirst({
    where: { id: documentId },
    select: { extractedJson: true },
  });
  const latestEj = (latest?.extractedJson ?? {}) as Record<string, unknown>;

  const historyEntry: ReprocessHistoryEntry = {
    at:             now.toISOString(),
    mode,
    previousStatus,
    newStatus,
    triggeredBy:    userId,
  };

  await prisma.document.update({
    where: { id: documentId },
    data: {
      extractedJson: ({
        ...latestEj,
        lastReprocessedAt:        now.toISOString(),
        lastReprocessMode:        mode,
        previousValidationStatus: previousStatus,
        reprocessHistory:         [...existingHistory, historyEntry],
      } as unknown) as Prisma.InputJsonValue,
      updatedAt: now,
    },
  });

  return { mode, previousStatus, newStatus, validationErrors, validationWarnings, overridesRestored: mode === "full" && hasOverrides };
}

// ── execValidationOnly ────────────────────────────────────────────────────────

async function execValidationOnly(
  doc:       DocSnapshot,
  ej:        Record<string, unknown>,
  overrides: OverrideMap,
  now:       Date
): Promise<{ newStatus: string; validationErrors: string[]; validationWarnings: string[] }> {
  const ci = (ej.colombianInvoice ?? {}) as Record<string, unknown>;

  function resolve<T>(key: string, fallback: T): T {
    const ov = overrides[key];
    return ov !== undefined ? (ov.value as T) ?? fallback : fallback;
  }

  const validation = validateDocumentFields({
    issuerId:      resolve("issuerId",      doc.issuerId      ?? null),
    customerId:    resolve("receiverId",     doc.receiverId    ?? null),
    invoiceNumber: resolve("invoiceNumber",  (ci.invoiceNumber  as string | null) ?? null),
    documentDate:  (() => {
      const d = resolve<string | null>("documentDate", doc.documentDate?.toISOString().slice(0, 10) ?? null);
      return d ? new Date(d) : null;
    })(),
    totalAmount:   resolve("totalAmount",    doc.amount != null ? parseFloat(doc.amount.toString()) : null),
    currency:      resolve("currency",       doc.currency ?? null),
    cufe:          resolve("cufe",           (ci.cufe           as string | null) ?? null),
    subtotal:      resolve("subtotal",       (ci.subtotal       as number | null) ?? null),
    taxAmount:     resolve("taxAmount",      (ci.taxAmount      as number | null) ?? null),
  });

  // Write only validation result fields — do not touch anything else.
  await prisma.document.update({
    where: { id: doc.id },
    data: {
      extractedJson: {
        ...ej,
        validationStatus:   validation.validationStatus,
        validationErrors:   validation.validationErrors,
        validationWarnings: validation.validationWarnings,
      } as Prisma.InputJsonValue,
      updatedAt: now,
    },
  });

  return {
    newStatus:          validation.validationStatus,
    validationErrors:   validation.validationErrors,
    validationWarnings: validation.validationWarnings,
  };
}

// ── execFullReprocess ─────────────────────────────────────────────────────────

async function execFullReprocess(
  documentId:     string,
  organizationId: string,
  userId:         string,
  savedOverrides: OverrideMap,
  now:            Date
): Promise<{ newStatus: string; validationErrors: string[]; validationWarnings: string[] }> {
  // Run full extraction pipeline — creates Run + Event, writes brand-new extractedJson.
  await processFinancialDocument(documentId, organizationId, userId);

  // Read fresh state post-extraction.
  const fresh = await prisma.document.findFirst({
    where: { id: documentId },
    select: {
      issuerName:    true,
      issuerId:      true,
      receiverName:  true,
      receiverId:    true,
      documentDate:  true,
      amount:        true,
      currency:      true,
      extractedJson: true,
    },
  });

  if (!fresh) throw new Error("DOCUMENT_NOT_FOUND_POST_REPROCESS");

  const freshEj = (fresh.extractedJson ?? {}) as Record<string, unknown>;
  const hasOverrides = Object.keys(savedOverrides).length > 0;

  if (!hasOverrides) {
    return {
      newStatus:          (freshEj.validationStatus  as string)   ?? "INCOMPLETE",
      validationErrors:   (freshEj.validationErrors  as string[]) ?? [],
      validationWarnings: (freshEj.validationWarnings as string[]) ?? [],
    };
  }

  // Re-inject saved overrides (preserving their originalValues) and re-validate.
  const ci = (freshEj.colombianInvoice ?? {}) as Record<string, unknown>;

  function rov<T>(key: string, newExtracted: T): T {
    const ov = savedOverrides[key];
    return ov !== undefined ? (ov.value as T) ?? newExtracted : newExtracted;
  }

  const mergedIssuerId      = rov("issuerId",      fresh.issuerId      ?? null);
  const mergedReceiverId    = rov("receiverId",     fresh.receiverId    ?? null);
  const mergedIssuerName    = rov("issuerName",     fresh.issuerName    ?? null);
  const mergedReceiverName  = rov("receiverName",   fresh.receiverName  ?? null);
  const mergedCurrency      = rov("currency",       fresh.currency      ?? null);
  const mergedTotalAmount   = rov("totalAmount",    fresh.amount != null ? parseFloat(fresh.amount.toString()) : null);
  const mergedDocumentDate  = rov("documentDate",   fresh.documentDate?.toISOString().slice(0, 10) ?? null);
  const mergedInvoiceNumber = rov("invoiceNumber",  (ci.invoiceNumber as string | null) ?? null);
  const mergedSubtotal      = rov("subtotal",       (ci.subtotal      as number | null) ?? null);
  const mergedTaxAmount     = rov("taxAmount",      (ci.taxAmount     as number | null) ?? null);
  const mergedCufe          = rov("cufe",           (ci.cufe          as string | null) ?? null);
  const mergedDueDate       = rov("dueDate",        (ci.dueDate       as string | null) ?? null);

  const validation = validateDocumentFields({
    issuerId:      mergedIssuerId,
    customerId:    mergedReceiverId,
    invoiceNumber: mergedInvoiceNumber,
    documentDate:  mergedDocumentDate ? new Date(mergedDocumentDate) : null,
    totalAmount:   mergedTotalAmount,
    currency:      mergedCurrency,
    cufe:          mergedCufe,
    subtotal:      mergedSubtotal,
    taxAmount:     mergedTaxAmount,
  });

  const patchedEj: Record<string, unknown> = {
    ...freshEj,
    overrides:          savedOverrides,   // restored with originalValues intact
    validationStatus:   validation.validationStatus,
    validationErrors:   validation.validationErrors,
    validationWarnings: validation.validationWarnings,
    colombianInvoice: {
      ...ci,
      invoiceNumber: mergedInvoiceNumber,
      dueDate:       mergedDueDate,
      subtotal:      mergedSubtotal,
      taxAmount:     mergedTaxAmount,
      totalAmount:   mergedTotalAmount,
      cufe:          mergedCufe,
    },
  };

  const dbData: Prisma.DocumentUpdateInput = {
    extractedJson: patchedEj as Prisma.InputJsonValue,
    updatedAt:     now,
  };

  if (savedOverrides.issuerName)   dbData.issuerName   = mergedIssuerName;
  if (savedOverrides.issuerId)     dbData.issuerId     = mergedIssuerId;
  if (savedOverrides.receiverName) dbData.receiverName = mergedReceiverName;
  if (savedOverrides.receiverId)   dbData.receiverId   = mergedReceiverId;
  if (savedOverrides.currency)     dbData.currency     = mergedCurrency;
  if (savedOverrides.documentDate) dbData.documentDate = mergedDocumentDate ? new Date(mergedDocumentDate) : null;
  if (savedOverrides.totalAmount)  dbData.amount       = mergedTotalAmount != null ? new Prisma.Decimal(mergedTotalAmount) : null;

  await prisma.document.update({ where: { id: documentId }, data: dbData });

  return {
    newStatus:          validation.validationStatus,
    validationErrors:   validation.validationErrors,
    validationWarnings: validation.validationWarnings,
  };
}
