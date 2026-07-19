/**
 * lib/reconciliation/review/review-repository.ts
 *
 * AGENTIK-RECON-REVIEW-CENTER-01 — Phase 3
 * ReconReviewItem Repository
 *
 * Methods:
 *   createReviewItemsFromExecution() — batch-create items for a completed run
 *   listReviewItems()               — filtered, paginated list
 *   getReviewItem()                 — single item with explanationJson
 *   updateReviewItemStatus()        — lifecycle transition + audit
 *   resolveReviewItem()             — close with resolution + audit
 *   getReviewCenterSummary()        — counts by status and verdict
 *   listReviewAuditEvents()         — audit trail for one item
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import { prisma } from "@/lib/prisma";
import type {
  CreateReviewItemInput,
  ResolveReviewItemInput,
  ListReviewItemsOptions,
  ReconReviewItemRow,
  ReconReviewItemDetail,
  ReconReviewAuditEventRow,
  ReviewCenterSummary,
  ReviewItemStatus,
  ReviewAuditEventType,
} from "./review-types";

// ── Prisma select projection ───────────────────────────────────────────────────

const REVIEW_ITEM_SELECT = {
  id: true, organizationId: true, executionId: true, sessionId: true,
  sourceAType: true, sourceBType: true,
  recordAKey: true, recordBKey: true,
  score: true, verdict: true, verdictLabel: true, headline: true,
  status: true, assignedTo: true, reviewNote: true, resolution: true,
  createdAt: true, updatedAt: true,
} as const;

type PrismaRow = {
  id: string; organizationId: string; executionId: string; sessionId: string | null;
  sourceAType: string; sourceBType: string;
  recordAKey: string; recordBKey: string | null;
  score: number; verdict: string; verdictLabel: string; headline: string;
  status: string; assignedTo: string | null; reviewNote: string | null; resolution: string | null;
  createdAt: Date; updatedAt: Date;
};

function mapRow(r: PrismaRow): ReconReviewItemRow {
  return {
    id:             r.id,
    organizationId: r.organizationId,
    executionId:    r.executionId,
    sessionId:      r.sessionId,
    sourceAType:    r.sourceAType,
    sourceBType:    r.sourceBType,
    recordAKey:     r.recordAKey,
    recordBKey:     r.recordBKey,
    score:          r.score,
    verdict:        r.verdict,
    verdictLabel:   r.verdictLabel,
    headline:       r.headline,
    status:         r.status,
    assignedTo:     r.assignedTo,
    reviewNote:     r.reviewNote,
    resolution:     r.resolution,
    createdAt:      r.createdAt.toISOString(),
    updatedAt:      r.updatedAt.toISOString(),
  };
}

// ── Audit event emitter ───────────────────────────────────────────────────────

async function emitAudit(opts: {
  organizationId: string;
  reviewItemId:   string;
  actor:          string;
  eventType:      ReviewAuditEventType;
  previousStatus?: string | null;
  newStatus?:      string | null;
  resolution?:     string | null;
  note?:           string | null;
  metadataJson?:   object | null;
}): Promise<void> {
  await prisma.reconReviewAuditEvent.create({
    data: {
      organizationId: opts.organizationId,
      reviewItemId:   opts.reviewItemId,
      actor:          opts.actor,
      eventType:      opts.eventType,
      previousStatus: opts.previousStatus ?? null,
      newStatus:      opts.newStatus      ?? null,
      resolution:     opts.resolution     ?? null,
      note:           opts.note           ?? null,
      metadataJson:   opts.metadataJson   ?? undefined,
    },
  });
}

// ── Repository methods ────────────────────────────────────────────────────────

/**
 * Batch-create review items from a completed rule-engine execution.
 *
 * Called fire-and-forget from run/route.ts.
 * Only creates items for: partial, pending_review, mismatch, suspicious.
 * reconciled pairs are included only when score < LOW_CONFIDENCE_SCORE_THRESHOLD.
 *
 * Returns the count of items created.
 */
export async function createReviewItemsFromExecution(
  inputs: CreateReviewItemInput[],
): Promise<number> {
  if (inputs.length === 0) return 0;

  const result = await prisma.reconReviewItem.createMany({
    data: inputs.map(i => ({
      organizationId:  i.organizationId,
      executionId:     i.executionId,
      sessionId:       i.sessionId ?? null,
      sourceAType:     i.sourceAType,
      sourceBType:     i.sourceBType,
      recordAKey:      i.recordAKey,
      recordBKey:      i.recordBKey ?? null,
      score:           i.score,
      verdict:         i.verdict,
      verdictLabel:    i.verdictLabel,
      headline:        i.headline,
      explanationJson: i.explanationJson ?? undefined,
      status:          "open",
    })),
    skipDuplicates: true,
  });

  return result.count;
}

/**
 * List review items for an organization, newest first.
 * Supports filtering by executionId, status, verdict, source pair, score range.
 */
export async function listReviewItems(
  organizationId: string,
  opts:           ListReviewItemsOptions = {},
): Promise<ReconReviewItemRow[]> {
  const where: Record<string, unknown> = { organizationId };

  if (opts.executionId) where.executionId = opts.executionId;
  if (opts.sessionId)   where.sessionId   = opts.sessionId;
  if (opts.verdict)     where.verdict      = opts.verdict;
  if (opts.sourceAType) where.sourceAType  = opts.sourceAType;
  if (opts.sourceBType) where.sourceBType  = opts.sourceBType;

  if (opts.status) {
    where.status = Array.isArray(opts.status)
      ? { in: opts.status }
      : opts.status;
  }

  if (opts.minScore != null || opts.maxScore != null) {
    const scoreFilter: Record<string, number> = {};
    if (opts.minScore != null) scoreFilter.gte = opts.minScore;
    if (opts.maxScore != null) scoreFilter.lte = opts.maxScore;
    where.score = scoreFilter;
  }

  const rows = await prisma.reconReviewItem.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take:    opts.limit  ?? 50,
    skip:    opts.offset ?? 0,
    select:  REVIEW_ITEM_SELECT,
  });

  return rows.map(r => mapRow(r as unknown as PrismaRow));
}

/**
 * Get a single review item with full explanationJson.
 * Returns null if not found or wrong org.
 */
export async function getReviewItem(
  organizationId: string,
  itemId:         string,
): Promise<ReconReviewItemDetail | null> {
  const row = await prisma.reconReviewItem.findFirst({
    where:  { id: itemId, organizationId },
    select: { ...REVIEW_ITEM_SELECT, explanationJson: true },
  });
  if (!row) return null;
  return {
    ...mapRow(row as unknown as PrismaRow),
    explanationJson: row.explanationJson as object | null,
  };
}

/**
 * Transition a review item to a new status.
 * Emits an audit event.
 * Returns the updated row or null if not found.
 */
export async function updateReviewItemStatus(
  organizationId: string,
  itemId:         string,
  newStatus:      ReviewItemStatus,
  actor:          string,
  note?:          string,
): Promise<ReconReviewItemRow | null> {
  const existing = await prisma.reconReviewItem.findFirst({
    where:  { id: itemId, organizationId },
    select: { status: true },
  });
  if (!existing) return null;

  const previousStatus = existing.status;

  const updated = await prisma.reconReviewItem.update({
    where:  { id: itemId },
    data:   { status: newStatus, reviewNote: note ?? undefined },
    select: REVIEW_ITEM_SELECT,
  });

  await emitAudit({
    organizationId,
    reviewItemId:   itemId,
    actor,
    eventType:      "status_changed",
    previousStatus,
    newStatus,
    note,
  }).catch(() => { /* audit failure must not break the response */ });

  return mapRow(updated as unknown as PrismaRow);
}

/**
 * Resolve a review item with a resolution code.
 * Transitions status to "resolved" and emits audit event.
 */
export async function resolveReviewItem(
  organizationId: string,
  itemId:         string,
  input:          ResolveReviewItemInput,
): Promise<ReconReviewItemRow | null> {
  const existing = await prisma.reconReviewItem.findFirst({
    where:  { id: itemId, organizationId },
    select: { status: true },
  });
  if (!existing) return null;

  const previousStatus = existing.status;

  const updated = await prisma.reconReviewItem.update({
    where:  { id: itemId },
    data: {
      status:     "resolved",
      resolution: input.resolution,
      reviewNote: input.reviewNote ?? undefined,
    },
    select: REVIEW_ITEM_SELECT,
  });

  await emitAudit({
    organizationId,
    reviewItemId:   itemId,
    actor:          input.actor,
    eventType:      "resolved",
    previousStatus,
    newStatus:      "resolved",
    resolution:     input.resolution,
    note:           input.reviewNote,
  }).catch(() => { /* audit failure must not break the response */ });

  return mapRow(updated as unknown as PrismaRow);
}

/**
 * Aggregate counts by status and verdict for the Review Center header.
 */
export async function getReviewCenterSummary(
  organizationId: string,
  opts: { executionId?: string; sourceAType?: string; sourceBType?: string } = {},
): Promise<ReviewCenterSummary> {
  const where: Record<string, unknown> = { organizationId };
  if (opts.executionId)  where.executionId  = opts.executionId;
  if (opts.sourceAType)  where.sourceAType  = opts.sourceAType;
  if (opts.sourceBType)  where.sourceBType  = opts.sourceBType;

  const [statusGroups, verdictGroups] = await Promise.all([
    prisma.reconReviewItem.groupBy({
      by:    ["status"],
      where,
      _count: { id: true },
    }),
    prisma.reconReviewItem.groupBy({
      by:    ["verdict"],
      where,
      _count: { id: true },
    }),
  ]);

  const byStatus = Object.fromEntries(
    statusGroups.map(g => [g.status, g._count.id]),
  ) as Record<string, number>;

  const byVerdict = Object.fromEntries(
    verdictGroups.map(g => [g.verdict, g._count.id]),
  ) as Record<string, number>;

  const total = statusGroups.reduce((s, g) => s + g._count.id, 0);

  return {
    total,
    open:       byStatus["open"]       ?? 0,
    in_review:  byStatus["in_review"]  ?? 0,
    escalated:  byStatus["escalated"]  ?? 0,
    resolved:   byStatus["resolved"]   ?? 0,
    dismissed:  byStatus["dismissed"]  ?? 0,
    byVerdict: {
      partial:        byVerdict["partial"]        ?? 0,
      mismatch:       byVerdict["mismatch"]       ?? 0,
      suspicious:     byVerdict["suspicious"]     ?? 0,
      pending_review: byVerdict["pending_review"] ?? 0,
      no_candidate:   byVerdict["no_candidate"]   ?? 0,
    },
  };
}

/**
 * Audit trail for a single review item — newest first.
 */
export async function listReviewAuditEvents(
  organizationId: string,
  itemId:         string,
): Promise<ReconReviewAuditEventRow[]> {
  const rows = await prisma.reconReviewAuditEvent.findMany({
    where:   { reviewItemId: itemId, organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, reviewItemId: true, actor: true, eventType: true,
      previousStatus: true, newStatus: true, resolution: true, note: true,
      createdAt: true,
    },
  });

  return rows.map(r => ({
    id:             r.id,
    reviewItemId:   r.reviewItemId,
    actor:          r.actor,
    eventType:      r.eventType,
    previousStatus: r.previousStatus,
    newStatus:      r.newStatus,
    resolution:     r.resolution,
    note:           r.note,
    createdAt:      r.createdAt.toISOString(),
  }));
}
