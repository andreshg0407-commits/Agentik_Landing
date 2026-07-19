import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateDocumentFields } from "./process-document";
import { upsertDocumentValidationAlert } from "./document-alerts";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OverrideFields {
  issuerName?:    string | null;
  issuerId?:      string | null;
  receiverName?:  string | null;
  receiverId?:    string | null;
  documentDate?:  string | null;  // ISO date string "YYYY-MM-DD"
  currency?:      string | null;
  totalAmount?:   number | null;
  invoiceNumber?: string | null;
  dueDate?:       string | null;  // ISO date string
  subtotal?:      number | null;
  taxAmount?:     number | null;
  cufe?:          string | null;
}

export interface OverrideEntry {
  value:         unknown;
  originalValue: unknown;
  setBy:         string;  // userId
  setAt:         string;  // ISO timestamp
}

export type OverrideMap = Record<string, OverrideEntry>;

export interface OverrideResult {
  validationStatus:   string;
  validationErrors:   string[];
  validationWarnings: string[];
}

// ── applyDocumentOverrides ────────────────────────────────────────────────────

/**
 * Applies manual field overrides to a document.
 *
 * - Stores overrides with original extracted values and audit metadata.
 * - Updates top-level document fields in the DB.
 * - Recomputes validationStatus/validationErrors/validationWarnings.
 * - Never deletes previously stored extraction data.
 */
export async function applyDocumentOverrides(
  documentId:    string,
  organizationId: string,
  userId:        string,
  overrides:     OverrideFields
): Promise<OverrideResult> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, organizationId, deletedAt: null },
    select: {
      title:         true,
      projectId:     true,
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

  // Destructure into consts so TypeScript can narrow inside nested closures.
  const {
    issuerName: docIssuerName, issuerId: docIssuerId,
    receiverName: docReceiverName, receiverId: docReceiverId,
    documentDate: docDocumentDate, amount: docAmount, currency: docCurrency,
    extractedJson: docExtractedJson,
  } = doc;

  const now = new Date();
  const ej  = (docExtractedJson ?? {}) as Record<string, unknown>;
  const ci  = (ej.colombianInvoice ?? {}) as Record<string, unknown>;
  const existingOverrideMap = (ej.overrides ?? {}) as OverrideMap;

  // ── Build new override map ─────────────────────────────────────────────────

  const newOverrideMap: OverrideMap = { ...existingOverrideMap };

  // For each incoming field: capture originalValue once (before any override),
  // then write the new override entry.
  function captureOriginal(key: string): unknown {
    // If we already stored the original before, keep it so we don't lose it.
    if (existingOverrideMap[key]) return existingOverrideMap[key].originalValue;
    // First override — the current effective value IS the original extracted value.
    switch (key) {
      case "issuerName":    return docIssuerName    ?? null;
      case "issuerId":      return docIssuerId      ?? null;
      case "receiverName":  return docReceiverName  ?? null;
      case "receiverId":    return docReceiverId    ?? null;
      case "documentDate":  return docDocumentDate?.toISOString().slice(0, 10) ?? null;
      case "currency":      return docCurrency      ?? null;
      case "totalAmount":   return docAmount != null ? parseFloat(docAmount.toString()) : null;
      case "invoiceNumber": return ci.invoiceNumber  ?? null;
      case "dueDate":       return ci.dueDate        ?? null;
      case "subtotal":      return ci.subtotal       ?? null;
      case "taxAmount":     return ci.taxAmount      ?? null;
      case "cufe":          return ci.cufe           ?? null;
      default:              return null;
    }
  }

  for (const key of Object.keys(overrides) as (keyof OverrideFields)[]) {
    if (overrides[key] === undefined) continue;
    newOverrideMap[key] = {
      value:         overrides[key] ?? null,
      originalValue: captureOriginal(key),
      setBy:         userId,
      setAt:         now.toISOString(),
    };
  }

  // ── Merge: override value wins over extracted value ────────────────────────

  function resolve<T>(key: keyof OverrideFields, fallback: T): T {
    const ov = newOverrideMap[key];
    return ov !== undefined ? (ov.value as T) ?? fallback : fallback;
  }

  const mergedIssuerId      = resolve("issuerId",      docIssuerId      ?? null);
  const mergedReceiverId    = resolve("receiverId",     docReceiverId    ?? null);
  const mergedIssuerName    = resolve("issuerName",     docIssuerName    ?? null);
  const mergedReceiverName  = resolve("receiverName",   docReceiverName  ?? null);
  const mergedCurrency      = resolve("currency",       docCurrency      ?? null);
  const mergedDocumentDate  = resolve("documentDate",   docDocumentDate?.toISOString().slice(0, 10) ?? null);
  const mergedTotalAmount   = resolve("totalAmount",    docAmount != null ? parseFloat(docAmount.toString()) : null);
  const mergedInvoiceNumber = resolve("invoiceNumber",  (ci.invoiceNumber  as string | null) ?? null);
  const mergedSubtotal      = resolve("subtotal",       (ci.subtotal       as number | null) ?? null);
  const mergedTaxAmount     = resolve("taxAmount",      (ci.taxAmount      as number | null) ?? null);
  const mergedCufe          = resolve("cufe",           (ci.cufe           as string | null) ?? null);
  const mergedDueDate       = resolve("dueDate",        (ci.dueDate        as string | null) ?? null);

  // ── Recompute validation ───────────────────────────────────────────────────

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

  // ── Build updated extractedJson ────────────────────────────────────────────

  const updatedEj: Record<string, unknown> = {
    ...ej,
    overrides:          newOverrideMap,
    validationStatus:   validation.validationStatus,
    validationErrors:   validation.validationErrors,
    validationWarnings: validation.validationWarnings,
    lastOverrideAt:     now.toISOString(),
    lastOverrideBy:     userId,
    // Keep colombianInvoice in sync with merged values
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

  // ── Build top-level DB update (only fields that were overridden) ───────────

  const dbData: Prisma.DocumentUpdateInput = {
    extractedJson: updatedEj as Prisma.InputJsonValue,
    updatedAt:     now,
  };

  if (overrides.issuerName   !== undefined) dbData.issuerName   = mergedIssuerName;
  if (overrides.issuerId     !== undefined) dbData.issuerId     = mergedIssuerId;
  if (overrides.receiverName !== undefined) dbData.receiverName = mergedReceiverName;
  if (overrides.receiverId   !== undefined) dbData.receiverId   = mergedReceiverId;
  if (overrides.currency     !== undefined) dbData.currency     = mergedCurrency;
  if (overrides.documentDate !== undefined) {
    dbData.documentDate = mergedDocumentDate ? new Date(mergedDocumentDate) : null;
  }
  if (overrides.totalAmount !== undefined) {
    dbData.amount = mergedTotalAmount != null
      ? new Prisma.Decimal(mergedTotalAmount)
      : null;
  }

  await prisma.document.update({ where: { id: documentId }, data: dbData });

  // Sync validation alerts: resolve existing ones and raise a new one if needed.
  await upsertDocumentValidationAlert({
    documentId,
    organizationId,
    projectId:        doc.projectId ?? null,
    documentTitle:    doc.title,
    validationStatus: validation.validationStatus,
    validationErrors: validation.validationErrors,
  }).catch(() => {});

  return {
    validationStatus:   validation.validationStatus,
    validationErrors:   validation.validationErrors,
    validationWarnings: validation.validationWarnings,
  };
}
