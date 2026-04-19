/**
 * lib/marketing-studio/asset-service.ts
 *
 * Persistence layer for GeneratedAsset — DB operations only.
 * No business logic. No provider calls. No UI types.
 *
 * All functions are server-side only (Prisma).
 */

import { prisma }                                         from "@/lib/prisma";
import { AssetGenerationStatus, AssetPublishStatus }      from "@prisma/client";
import type { OutputAssetType }                           from "./guided-flow";

// ── Create ────────────────────────────────────────────────────────────────────

export interface CreateAssetInput {
  sessionId:  string;
  assetType:  OutputAssetType;
  /** Pre-built text content (copy_caption, hashtags) — skips generation step */
  content?:   string;
  /** AI prompt to send to the visual generation provider */
  prompt?:    string;
}

export async function createDbAsset(input: CreateAssetInput) {
  return prisma.generatedAsset.create({
    data: {
      sessionId:        input.sessionId,
      assetType:        input.assetType,
      generationStatus: input.content
        ? AssetGenerationStatus.READY   // text assets with pre-built content skip generation
        : AssetGenerationStatus.PENDING,
      content:          input.content,
      providerMeta:     input.prompt ? { prompt: input.prompt } : undefined,
    },
  });
}

export async function createDbAssetsForSession(
  sessionId: string,
  assets: CreateAssetInput[],
) {
  return prisma.$transaction(
    assets.map((a) =>
      prisma.generatedAsset.create({
        data: {
          sessionId:        a.sessionId,
          assetType:        a.assetType,
          generationStatus: a.content
            ? AssetGenerationStatus.READY
            : AssetGenerationStatus.PENDING,
          content:          a.content,
          providerMeta:     a.prompt ? { prompt: a.prompt } : undefined,
        },
      }),
    ),
  );
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getDbAsset(assetId: string) {
  return prisma.generatedAsset.findUnique({ where: { id: assetId } });
}

export async function listDbAssets(sessionId: string) {
  return prisma.generatedAsset.findMany({
    where:   { sessionId },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Returns true when every GeneratedAsset for the session has left PENDING state.
 * Distinguishes all-READY (success path) from any-FAILED (failure path).
 */
export async function checkAllAssetsSettled(sessionId: string): Promise<{
  settled: boolean;
  allReady: boolean;
  anyFailed: boolean;
}> {
  const assets = await prisma.generatedAsset.findMany({
    where:  { sessionId },
    select: { generationStatus: true, assetType: true },
  });

  const pending   = assets.filter(a => a.generationStatus === AssetGenerationStatus.PENDING);
  const failed    = assets.filter(a => a.generationStatus === AssetGenerationStatus.FAILED);
  const settled   = pending.length === 0;
  const allReady  = settled && failed.length === 0;
  const anyFailed = failed.length > 0;

  return { settled, allReady, anyFailed };
}

// ── Status updates ────────────────────────────────────────────────────────────

export async function updateAssetGenerationReady(
  assetId:  string,
  assetUrl: string,
  jobId?:   string,
) {
  return prisma.generatedAsset.update({
    where: { id: assetId },
    data: {
      generationStatus: AssetGenerationStatus.READY,
      assetUrl,
      generationJobId:  jobId,
    },
  });
}

export async function updateAssetGenerationFailed(assetId: string) {
  return prisma.generatedAsset.update({
    where: { id: assetId },
    data: { generationStatus: AssetGenerationStatus.FAILED },
  });
}

export async function updateAssetReviewStatus(
  assetId:      string,
  reviewStatus: "approved" | "rejected",
) {
  return prisma.generatedAsset.update({
    where: { id: assetId },
    data: { reviewStatus },
  });
}

export async function updateAssetPublished(
  assetId:     string,
  externalRef: string,
) {
  return prisma.generatedAsset.update({
    where: { id: assetId },
    data: {
      publishStatus: AssetPublishStatus.PUBLISHED,
      externalRef,
    },
  });
}

export async function updateAssetPublishFailed(assetId: string) {
  return prisma.generatedAsset.update({
    where: { id: assetId },
    data: { publishStatus: AssetPublishStatus.FAILED },
  });
}

// ── Biblioteca (approved assets) ──────────────────────────────────────────────

export interface BibliotecaAsset {
  id:              string;
  assetType:       string;
  assetUrl:        string;
  content:         string | null;
  generationJobId: string | null;
  providerMeta:    unknown;
  reviewStatus:    string;
  createdAt:       Date;
  session: {
    id:          string;
    tenantId:    string;
    productSku:  string | null;
    objective:   string | null;
  };
}

export async function listOrgApprovedAssets(
  organizationId: string,
  limit  = 50,
  offset = 0,
): Promise<BibliotecaAsset[]> {
  const assets = await prisma.generatedAsset.findMany({
    where: {
      reviewStatus: "approved",
      assetUrl:     { not: null },
      session:      { organizationId },
    },
    include: {
      session: {
        select: { id: true, tenantId: true, productSku: true, objective: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take:    limit,
    skip:    offset,
  });
  // filter TS-safe: assetUrl is not null after the where clause
  return assets.filter(a => a.assetUrl != null) as BibliotecaAsset[];
}
