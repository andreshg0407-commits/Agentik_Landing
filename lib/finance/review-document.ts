import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReviewResult {
  reviewedAt:      string;
  reviewedByEmail: string | null;
  reviewedByName:  string | null;
  alertsResolved:  number;
}

// ── resolveDocumentAlerts ─────────────────────────────────────────────────────

/**
 * Resolves all open alerts whose metadataJson contains { documentId }.
 * These are typically "finance.document_processing_failed" alerts created by
 * the process pipeline when a document errored or was flagged for review.
 */
export async function resolveDocumentAlerts(
  documentId:    string,
  organizationId: string,
  resolvedAt:    Date = new Date()
): Promise<number> {
  // Prisma supports JSON path filtering on PostgreSQL.
  const result = await prisma.alert.updateMany({
    where: {
      organizationId,
      status: { not: "RESOLVED" },
      metadataJson: {
        path: ["documentId"],
        equals: documentId,
      },
    },
    data: {
      status:     "RESOLVED",
      resolvedAt,
      updatedAt:  resolvedAt,
    },
  });
  return result.count;
}

// ── reviewDocument ────────────────────────────────────────────────────────────

/**
 * Marks a document as REVIEWED.
 *
 * Guard: document must have validationStatus = "VALID" in its extractedJson.
 * Storing reviewedAt / reviewedBy / reviewedByEmail into extractedJson keeps the
 * audit trail self-contained inside the document blob (no schema migration needed).
 *
 * Also auto-resolves any open alerts that reference this document.
 */
export async function reviewDocument(
  documentId:    string,
  organizationId: string,
  userId:        string
): Promise<ReviewResult> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, organizationId, deletedAt: null },
    select: { status: true, extractedJson: true },
  });

  if (!doc) throw new Error("DOCUMENT_NOT_FOUND");
  if (doc.status === "REVIEWED") throw new Error("ALREADY_REVIEWED");

  const ej = (doc.extractedJson ?? {}) as Record<string, unknown>;
  if (ej.validationStatus !== "VALID") throw new Error("NOT_VALID");

  // Fetch reviewer display info for the audit entry.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  const now            = new Date();
  const reviewedByEmail = user?.email ?? null;
  const reviewedByName  = user?.name  ?? null;

  const updatedEj: Record<string, unknown> = {
    ...ej,
    review: {
      reviewedBy:    userId,
      reviewedAt:    now.toISOString(),
      reviewedByEmail,
      reviewedByName,
    },
  };

  await prisma.document.update({
    where: { id: documentId },
    data: {
      status:        "REVIEWED",
      extractedJson: updatedEj as Prisma.InputJsonValue,
      updatedAt:     now,
    },
  });

  const alertsResolved = await resolveDocumentAlerts(documentId, organizationId, now);

  return { reviewedAt: now.toISOString(), reviewedByEmail, reviewedByName, alertsResolved };
}
