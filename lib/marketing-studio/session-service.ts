/**
 * lib/marketing-studio/session-service.ts
 *
 * Persistence layer for StudioSession — DB operations only.
 * No business logic. No UI types. No provider calls.
 *
 * All functions are server-side only (Prisma).
 */

import { prisma }                from "@/lib/prisma";
import { StudioSessionDbStatus } from "@prisma/client";
import type { StudioStep, StudioSessionStatus, MinimumInputFields, ReviewItem, PublishResult } from "./guided-flow";
import type { N8nWebhookPayload } from "./execution-payload";

// ── Status mapping ────────────────────────────────────────────────────────────

const STATUS_MAP: Record<StudioSessionStatus, StudioSessionDbStatus> = {
  idle:           StudioSessionDbStatus.IDLE,
  in_progress:    StudioSessionDbStatus.IN_PROGRESS,
  pending_review: StudioSessionDbStatus.PENDING_REVIEW,
  approved:       StudioSessionDbStatus.APPROVED,
  rejected:       StudioSessionDbStatus.REJECTED,
  publishing:     StudioSessionDbStatus.PUBLISHING,
  published:      StudioSessionDbStatus.PUBLISHED,
  failed:         StudioSessionDbStatus.FAILED,
};

export function toDbStatus(status: StudioSessionStatus): StudioSessionDbStatus {
  return STATUS_MAP[status];
}

// ── Create ────────────────────────────────────────────────────────────────────

export interface CreateSessionInput {
  id:             string;   // client-generated ss_... ID
  organizationId: string;
  tenantId:       string;
}

export async function createDbSession(input: CreateSessionInput) {
  return prisma.studioSession.create({
    data: {
      id:             input.id,
      organizationId: input.organizationId,
      tenantId:       input.tenantId,
      step:           "upload_product",
      status:         StudioSessionDbStatus.IDLE,
    },
  });
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getDbSession(sessionId: string) {
  return prisma.studioSession.findUnique({
    where:   { id: sessionId },
    include: { assets: { orderBy: { createdAt: "asc" } } },
  });
}

export async function listDbSessions(organizationId: string, limit = 20) {
  return prisma.studioSession.findMany({
    where:   { organizationId },
    orderBy: { createdAt: "desc" },
    take:    limit,
    include: { assets: { select: { id: true, assetType: true, generationStatus: true, publishStatus: true } } },
  });
}

// ── Update ────────────────────────────────────────────────────────────────────

export interface UpdateSessionStateInput {
  step:   StudioStep;
  status: StudioSessionStatus;
}

export async function updateDbSessionState(
  sessionId: string,
  input: UpdateSessionStateInput,
) {
  return prisma.studioSession.update({
    where: { id: sessionId },
    data: {
      step:   input.step,
      status: toDbStatus(input.status),
    },
  });
}

export async function updateDbSessionProduct(
  sessionId: string,
  sku: string,
  imageUrl: string,
) {
  return prisma.studioSession.update({
    where: { id: sessionId },
    data: {
      productSku:     sku,
      productImageUrl: imageUrl,
      step:            "choose_objective",
      status:          StudioSessionDbStatus.IN_PROGRESS,
    },
  });
}

export async function updateDbSessionObjective(
  sessionId: string,
  objective: string,
) {
  return prisma.studioSession.update({
    where: { id: sessionId },
    data: { objective, step: "minimum_fields" },
  });
}

export async function updateDbSessionInputs(
  sessionId: string,
  inputs: Partial<MinimumInputFields>,
) {
  return prisma.studioSession.update({
    where: { id: sessionId },
    data: { inputsJson: inputs as object },
  });
}

export async function updateDbSessionReviewItems(
  sessionId: string,
  reviewItems: ReviewItem[],
) {
  return prisma.studioSession.update({
    where: { id: sessionId },
    data: {
      reviewItemsJson: reviewItems as unknown as object[],
      step:            "review_approve",
      status:          StudioSessionDbStatus.PENDING_REVIEW,
    },
  });
}

export async function updateDbSessionExecution(
  sessionId: string,
  jobId: string,
  payload: N8nWebhookPayload,
) {
  return prisma.studioSession.update({
    where: { id: sessionId },
    data: {
      executionJobId:       jobId,
      executionPayloadJson: payload as unknown as object,
      step:                 "publish_export",
      status:               StudioSessionDbStatus.PUBLISHING,
    },
  });
}

export async function updateDbSessionPublishResult(
  sessionId: string,
  result: PublishResult,
) {
  return prisma.studioSession.update({
    where: { id: sessionId },
    data: {
      publishResultJson: result as unknown as object,
      status:            StudioSessionDbStatus.PUBLISHED,
    },
  });
}

export async function updateDbSessionFailed(
  sessionId: string,
  reason: string,
) {
  console.error(`[session-service] session ${sessionId} failed:`, reason);
  return prisma.studioSession.update({
    where: { id: sessionId },
    data: { status: StudioSessionDbStatus.FAILED },
  });
}

/**
 * Called by the callback handler once all assets are READY.
 *
 * Reads the existing publishResultJson, fills `imageSlots[*].imageUrl` from the
 * READY GeneratedAsset rows, then saves back and sets status = PUBLISHED.
 *
 * Safe to call multiple times — subsequent calls are idempotent (already PUBLISHED).
 */
export async function resolveAndPublishSession(
  sessionId: string,
  assetUrlMap: Record<string, string>,   // assetId → CDN URL
): Promise<void> {
  const session = await prisma.studioSession.findUnique({ where: { id: sessionId } });
  if (!session) return;
  if (session.status === StudioSessionDbStatus.PUBLISHED) return; // idempotent

  // Patch imageSlots in the existing publishResultJson if present
  let publishResult = (session.publishResultJson ?? {}) as Record<string, unknown>;

  const draft = publishResult.shopifyDraft as {
    imageSlots?: Array<{ assetId: string; assetType: string; position: number; imageUrl?: string }>;
  } | undefined;

  if (draft?.imageSlots) {
    draft.imageSlots = draft.imageSlots.map(slot => ({
      ...slot,
      imageUrl: assetUrlMap[slot.assetId] ?? slot.imageUrl,
    }));
    publishResult = { ...publishResult, shopifyDraft: draft };
  }

  await prisma.studioSession.update({
    where: { id: sessionId },
    data: {
      publishResultJson: publishResult as object,
      status:            StudioSessionDbStatus.PUBLISHED,
    },
  });
}
