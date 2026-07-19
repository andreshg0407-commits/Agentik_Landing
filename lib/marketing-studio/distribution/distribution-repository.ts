/**
 * lib/marketing-studio/distribution/distribution-repository.ts
 *
 * MS-14 — Distribution Runtime: Data access layer
 *
 * All DB reads/writes for DistributionVariant, DistributionPipeline,
 * DistributionSchedule models.
 *
 * SERVER ONLY — never import in client components.
 */

import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import type {
  DistributionVariantDTO,
  DistributionPipelineDTO,
  DistributionScheduleDTO,
  PipelineStage,
} from "./distribution-types";

// ── Mappers ────────────────────────────────────────────────────────────────────

function mapVariant(r: {
  id:             string;
  organizationId: string;
  productId:      string | null;
  assetId:        string | null;
  purpose:        string;
  channel:        string;
  ratio:          string | null;
  width:          number | null;
  height:         number | null;
  isReady:        boolean;
  sourceAssetUrl: string | null;
  notes:          string | null;
  createdAt:      Date;
  updatedAt:      Date;
}): DistributionVariantDTO {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function mapPipeline(r: {
  id:             string;
  organizationId: string;
  name:           string;
  pipelineType:   string;
  status:         string;
  channels:       unknown;
  stages:         unknown;
  productIds:     unknown;
  catalogId:      string | null;
  scheduledAt:    Date | null;
  startedAt:      Date | null;
  completedAt:    Date | null;
  lastError:      string | null;
  createdAt:      Date;
  updatedAt:      Date;
}): DistributionPipelineDTO {
  return {
    id:             r.id,
    organizationId: r.organizationId,
    name:           r.name,
    pipelineType:   r.pipelineType,
    status:         r.status,
    channels:       (r.channels as string[]) ?? [],
    stages:         (r.stages  as PipelineStage[]) ?? [],
    productIds:     (r.productIds as string[]) ?? [],
    catalogId:      r.catalogId,
    scheduledAt:    r.scheduledAt?.toISOString() ?? null,
    startedAt:      r.startedAt?.toISOString()   ?? null,
    completedAt:    r.completedAt?.toISOString()  ?? null,
    lastError:      r.lastError,
    createdAt:      r.createdAt.toISOString(),
    updatedAt:      r.updatedAt.toISOString(),
  };
}

function mapSchedule(r: {
  id:             string;
  organizationId: string;
  label:          string;
  slotType:       string;
  channel:        string;
  timezone:       string;
  scheduledAt:    Date | null;
  productIds:     unknown;
  pipelineId:     string | null;
  status:         string;
  notes:          string | null;
  createdAt:      Date;
  updatedAt:      Date;
}): DistributionScheduleDTO {
  return {
    id:             r.id,
    organizationId: r.organizationId,
    label:          r.label,
    slotType:       r.slotType,
    channel:        r.channel,
    timezone:       r.timezone,
    scheduledAt:    r.scheduledAt?.toISOString() ?? null,
    productIds:     (r.productIds as string[]) ?? [],
    pipelineId:     r.pipelineId,
    status:         r.status,
    notes:          r.notes,
    createdAt:      r.createdAt.toISOString(),
    updatedAt:      r.updatedAt.toISOString(),
  };
}

// ── Variant queries ────────────────────────────────────────────────────────────

export async function listDistributionVariants(
  organizationId: string,
): Promise<DistributionVariantDTO[]> {
  const rows = await prisma.distributionVariant.findMany({
    where:   { organizationId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapVariant);
}

export async function listVariantsByProduct(
  organizationId: string,
  productId:       string,
): Promise<DistributionVariantDTO[]> {
  const rows = await prisma.distributionVariant.findMany({
    where:   { organizationId, productId },
    orderBy: { channel: "asc" },
  });
  return rows.map(mapVariant);
}

export async function listVariantsByChannel(
  organizationId: string,
  channel:         string,
): Promise<DistributionVariantDTO[]> {
  const rows = await prisma.distributionVariant.findMany({
    where:   { organizationId, channel },
    orderBy: { purpose: "asc" },
  });
  return rows.map(mapVariant);
}

export async function upsertDistributionVariant(opts: {
  organizationId:  string;
  productId:       string | null;
  assetId:         string | null;
  purpose:         string;
  channel:         string;
  ratio?:          string | null;
  width?:          number | null;
  height?:         number | null;
  isReady?:        boolean;
  sourceAssetUrl?: string | null;
  notes?:          string | null;
}): Promise<DistributionVariantDTO> {
  const existing = await prisma.distributionVariant.findFirst({
    where: {
      organizationId: opts.organizationId,
      productId:      opts.productId ?? undefined,
      purpose:        opts.purpose,
      channel:        opts.channel,
    },
  });

  if (existing) {
    const row = await prisma.distributionVariant.update({
      where: { id: existing.id },
      data: {
        assetId:        opts.assetId        ?? existing.assetId,
        ratio:          opts.ratio          ?? existing.ratio,
        width:          opts.width          ?? existing.width,
        height:         opts.height         ?? existing.height,
        isReady:        opts.isReady        ?? existing.isReady,
        sourceAssetUrl: opts.sourceAssetUrl ?? existing.sourceAssetUrl,
        notes:          opts.notes          ?? existing.notes,
        updatedAt:      new Date(),
      },
    });
    return mapVariant(row);
  }

  const row = await prisma.distributionVariant.create({
    data: {
      id:             randomUUID(),
      organizationId: opts.organizationId,
      productId:      opts.productId      ?? null,
      assetId:        opts.assetId        ?? null,
      purpose:        opts.purpose,
      channel:        opts.channel,
      ratio:          opts.ratio          ?? null,
      width:          opts.width          ?? null,
      height:         opts.height         ?? null,
      isReady:        opts.isReady        ?? false,
      sourceAssetUrl: opts.sourceAssetUrl ?? null,
      notes:          opts.notes          ?? null,
    },
  });
  return mapVariant(row);
}

export async function markVariantReady(
  variantId:      string,
  organizationId: string,
): Promise<void> {
  await prisma.distributionVariant.updateMany({
    where: { id: variantId, organizationId },
    data:  { isReady: true, updatedAt: new Date() },
  });
}

// ── Pipeline queries ───────────────────────────────────────────────────────────

export async function listDistributionPipelines(
  organizationId: string,
  statusFilter?:  string[],
): Promise<DistributionPipelineDTO[]> {
  const rows = await prisma.distributionPipeline.findMany({
    where: {
      organizationId,
      ...(statusFilter ? { status: { in: statusFilter } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take:    100,
  });
  return rows.map(mapPipeline);
}

export async function getDistributionPipeline(
  id:             string,
  organizationId: string,
): Promise<DistributionPipelineDTO | null> {
  const row = await prisma.distributionPipeline.findFirst({
    where: { id, organizationId },
  });
  return row ? mapPipeline(row) : null;
}

export async function createDistributionPipeline(opts: {
  organizationId: string;
  name:           string;
  pipelineType:   string;
  channels:       string[];
  productIds:     string[];
  stages:         PipelineStage[];
  catalogId?:     string | null;
  scheduledAt?:   string | null;
}): Promise<DistributionPipelineDTO> {
  const row = await prisma.distributionPipeline.create({
    data: {
      id:             randomUUID(),
      organizationId: opts.organizationId,
      name:           opts.name,
      pipelineType:   opts.pipelineType,
      status:         "draft",
      channels:       opts.channels,
      stages:         opts.stages as object[],
      productIds:     opts.productIds,
      catalogId:      opts.catalogId   ?? null,
      scheduledAt:    opts.scheduledAt ? new Date(opts.scheduledAt) : null,
    },
  });
  return mapPipeline(row);
}

export async function updatePipelineStatus(
  id:             string,
  organizationId: string,
  status:         string,
  extra?: {
    startedAt?:   Date | null;
    completedAt?: Date | null;
    lastError?:   string | null;
    stages?:      PipelineStage[];
  },
): Promise<void> {
  await prisma.distributionPipeline.updateMany({
    where: { id, organizationId },
    data: {
      status,
      startedAt:   extra?.startedAt   ?? undefined,
      completedAt: extra?.completedAt ?? undefined,
      lastError:   extra?.lastError   ?? undefined,
      stages:      extra?.stages      ? (extra.stages as object[]) : undefined,
      updatedAt:   new Date(),
    },
  });
}

// ── Schedule queries ───────────────────────────────────────────────────────────

export async function listDistributionSchedules(
  organizationId: string,
  statusFilter?:  string[],
): Promise<DistributionScheduleDTO[]> {
  const rows = await prisma.distributionSchedule.findMany({
    where: {
      organizationId,
      ...(statusFilter ? { status: { in: statusFilter } } : {}),
    },
    orderBy: { scheduledAt: "asc" },
    take:    100,
  });
  return rows.map(mapSchedule);
}

export async function createDistributionSchedule(opts: {
  organizationId: string;
  label:          string;
  slotType:       string;
  channel:        string;
  timezone:       string;
  scheduledAt?:   string | null;
  productIds:     string[];
  pipelineId?:    string | null;
  notes?:         string | null;
}): Promise<DistributionScheduleDTO> {
  const row = await prisma.distributionSchedule.create({
    data: {
      id:             randomUUID(),
      organizationId: opts.organizationId,
      label:          opts.label,
      slotType:       opts.slotType,
      channel:        opts.channel,
      timezone:       opts.timezone,
      scheduledAt:    opts.scheduledAt ? new Date(opts.scheduledAt) : null,
      productIds:     opts.productIds,
      pipelineId:     opts.pipelineId ?? null,
      status:         "pending",
      notes:          opts.notes      ?? null,
    },
  });
  return mapSchedule(row);
}

export async function updateScheduleStatus(
  id:             string,
  organizationId: string,
  status:         string,
): Promise<void> {
  await prisma.distributionSchedule.updateMany({
    where: { id, organizationId },
    data:  { status, updatedAt: new Date() },
  });
}
