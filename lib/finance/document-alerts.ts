import { AlertSeverity, AlertStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ── Alert type constants ───────────────────────────────────────────────────────

export const ALERT_TYPE_INCOMPLETE       = "finance.document.incomplete";
export const ALERT_TYPE_REVIEW_REQUIRED  = "finance.document.review_required";

const VALIDATION_ALERT_TYPES = [ALERT_TYPE_INCOMPLETE, ALERT_TYPE_REVIEW_REQUIRED] as const;

// ── upsertDocumentValidationAlert ─────────────────────────────────────────────

/**
 * Creates or replaces the validation alert for a financial document.
 *
 * - INCOMPLETE      → CRITICAL alert  (finance.document.incomplete)
 * - REVIEW_REQUIRED → WARNING  alert  (finance.document.review_required)
 * - VALID           → resolves any existing open validation alerts, no new alert
 *
 * Idempotent: always closes previous open validation alerts before creating a
 * new one, so reprocessing never stacks duplicate alerts.
 */
export async function upsertDocumentValidationAlert(params: {
  documentId:       string;
  organizationId:   string;
  projectId:        string | null;
  documentTitle:    string;
  validationStatus: string;
  validationErrors: string[];
  runId?:           string | null;
}): Promise<void> {
  const now = new Date();

  // Always close any existing open validation alerts for this document first.
  await prisma.alert.updateMany({
    where: {
      organizationId: params.organizationId,
      status:         { not: AlertStatus.RESOLVED },
      type:           { in: [...VALIDATION_ALERT_TYPES] },
      metadataJson:   { path: ["documentId"], equals: params.documentId },
    },
    data: {
      status:     AlertStatus.RESOLVED,
      resolvedAt: now,
      updatedAt:  now,
    },
  });

  // VALID → nothing more to do.
  if (params.validationStatus === "VALID") return;

  const isIncomplete = params.validationStatus === "INCOMPLETE";

  await prisma.alert.create({
    data: {
      organizationId: params.organizationId,
      projectId:      params.projectId,
      type:           isIncomplete ? ALERT_TYPE_INCOMPLETE : ALERT_TYPE_REVIEW_REQUIRED,
      title:          isIncomplete
        ? `Document incomplete: ${params.documentTitle}`
        : `Review required: ${params.documentTitle}`,
      message:        params.validationErrors.length > 0
        ? params.validationErrors.join("; ")
        : isIncomplete
          ? "One or more required fields are missing."
          : "Document data needs manual review.",
      severity:       isIncomplete ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
      status:         AlertStatus.OPEN,
      sourceType:     "system",
      sourceId:       params.runId ?? null,
      metadataJson:   {
        documentId:       params.documentId,
        validationStatus: params.validationStatus,
      },
    },
  });
}

// ── resolveDocumentValidationAlerts ───────────────────────────────────────────

/**
 * Resolves only the validation alerts (incomplete / review_required) for a
 * document. Used when a document becomes VALID via overrides, without touching
 * unrelated alerts (e.g. processing-failed).
 */
export async function resolveDocumentValidationAlerts(
  documentId:    string,
  organizationId: string
): Promise<number> {
  const now = new Date();
  const result = await prisma.alert.updateMany({
    where: {
      organizationId,
      status:       { not: AlertStatus.RESOLVED },
      type:         { in: [...VALIDATION_ALERT_TYPES] },
      metadataJson: { path: ["documentId"], equals: documentId },
    },
    data: { status: AlertStatus.RESOLVED, resolvedAt: now, updatedAt: now },
  });
  return result.count;
}
