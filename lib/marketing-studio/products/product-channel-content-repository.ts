/**
 * lib/marketing-studio/products/product-channel-content-repository.ts
 *
 * MARKETING-STUDIO-PRODUCT-CHANNEL-CONTENT-01 — Persistence Layer
 *
 * SERVER ONLY — never import from client components.
 *
 * Handles all Prisma I/O for ProductChannelContent.
 * The `content` column is JSON TEXT — serialized on write, parsed on read.
 *
 * Uses `prisma as any` because the model is new and requires `prisma generate`
 * before TypeScript recognizes it on the generated client.
 */

import { prisma }   from "@/lib/prisma";
import type {
  ChannelType,
  ChannelContentStatus,
  ChannelContentRecord,
  ChannelContentUpsertInput,
  ChannelPayload,
  ChannelContentProjection,
} from "./product-channel-content-types";

// ── Row mapper ────────────────────────────────────────────────────────────────

function mapRow<P extends ChannelPayload>(row: Record<string, unknown>): ChannelContentRecord<P> {
  let content: P | null = null;
  if (typeof row.content === "string" && row.content) {
    try { content = JSON.parse(row.content) as P; } catch { content = null; }
  }
  return {
    id:             row.id             as string,
    productId:      row.productId      as string,
    organizationId: row.organizationId as string,
    channel:        row.channel        as ChannelType,
    content,
    status:         (row.status as ChannelContentStatus) ?? "draft",
    createdAt:      row.createdAt      as Date,
    updatedAt:      row.updatedAt      as Date,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch a single channel content record.
 * Returns null when no record exists for this (product, channel).
 */
export async function getChannelContent<P extends ChannelPayload>(
  organizationId: string,
  productId:       string,
  channel:         ChannelType,
): Promise<ChannelContentRecord<P> | null> {
  const row = await (prisma as any).productChannelContent.findUnique({
    where: { productId_channel: { productId, channel } },
  });
  if (!row || row.organizationId !== organizationId) return null;
  return mapRow<P>(row as Record<string, unknown>);
}

/**
 * Fetch all channel content records for one product.
 * Returns an empty array when none exist yet.
 */
export async function getAllChannelContent(
  organizationId: string,
  productId:       string,
): Promise<ChannelContentRecord[]> {
  const rows = await (prisma as any).productChannelContent.findMany({
    where: { productId, organizationId },
  }) as Record<string, unknown>[];
  return rows.map(r => mapRow(r));
}

/**
 * Upsert channel content for one product+channel pair.
 * Only the fields in `input.content` are stored; previous values are replaced.
 */
export async function upsertChannelContent<P extends ChannelPayload>(
  input: ChannelContentUpsertInput<P>,
): Promise<ChannelContentRecord<P>> {
  const data: Record<string, unknown> = {
    organizationId: input.organizationId,
    content:        JSON.stringify(input.content),
    updatedAt:      new Date(),
  };
  if (input.status) data.status = input.status;

  const row = await (prisma as any).productChannelContent.upsert({
    where:  { productId_channel: { productId: input.productId, channel: input.channel } },
    create: {
      ...data,
      productId: input.productId,
      channel:   input.channel,
      status:    input.status ?? "draft",
    },
    update: data,
  });

  return mapRow<P>(row as Record<string, unknown>);
}

/**
 * Lightweight projections for all channel records of a product.
 * Used in the UI to show per-channel status summary without loading full payloads.
 */
export async function getChannelProjections(
  organizationId: string,
  productId:       string,
): Promise<ChannelContentProjection[]> {
  const rows = await (prisma as any).productChannelContent.findMany({
    where:  { productId, organizationId },
    select: { channel: true, status: true, content: true },
  }) as { channel: string; status: string; content: string | null }[];

  return rows.map(r => {
    let overrideCount = 0;
    if (r.content) {
      try {
        const parsed = JSON.parse(r.content) as Record<string, unknown>;
        overrideCount = Object.values(parsed).filter(v => v !== null && v !== undefined).length;
      } catch { /* ignore */ }
    }
    return {
      channel:       r.channel       as ChannelType,
      status:        r.status        as ChannelContentStatus,
      hasOverrides:  overrideCount > 0,
      overrideCount,
    };
  });
}

/**
 * Batch fetch: get all channel records for multiple products.
 * Returns a Map keyed by productId → ChannelContentRecord[].
 */
export async function getChannelContentBatch(
  organizationId: string,
  productIds:      string[],
): Promise<Map<string, ChannelContentRecord[]>> {
  if (productIds.length === 0) return new Map();

  const rows = await (prisma as any).productChannelContent.findMany({
    where: { organizationId, productId: { in: productIds } },
  }) as Record<string, unknown>[];

  const result = new Map<string, ChannelContentRecord[]>();
  for (const row of rows) {
    const pid = row.productId as string;
    const bucket = result.get(pid) ?? [];
    bucket.push(mapRow(row));
    result.set(pid, bucket);
  }
  return result;
}
