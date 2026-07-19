/**
 * lib/marketing-studio/products/product-content-repository.ts
 *
 * MARKETING-STUDIO-PRODUCT-CONTENT-01 — Persistence Layer
 *
 * SERVER ONLY — never import from client components.
 *
 * Handles all Prisma I/O for ProductContent.
 * JSON columns (keyBenefits, keyFeatures, faq, searchKeywords) are serialized
 * on write and parsed on read here — callers always see typed arrays.
 *
 * Uses `prisma as any` because ProductContent is a new model that requires
 * `prisma generate` before TypeScript recognizes it on the Prisma client.
 */

import { prisma }        from "@/lib/prisma";
import type {
  ProductContentRecord,
  ProductContentUpsertInput,
  ProductContentStatus,
  FaqItem,
} from "./product-content-types";

// ── JSON helpers ──────────────────────────────────────────────────────────────

function serializeStringArray(arr: string[] | undefined | null): string | null {
  if (!arr || arr.length === 0) return null;
  return JSON.stringify(arr);
}

function parseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

function serializeFaq(items: FaqItem[] | undefined | null): string | null {
  if (!items || items.length === 0) return null;
  return JSON.stringify(items);
}

function parseFaq(raw: string | null): FaqItem[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as FaqItem[]; } catch { return []; }
}

// ── Row → domain mapper ───────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): ProductContentRecord {
  return {
    id:             row.id             as string,
    productId:      row.productId      as string,
    organizationId: row.organizationId as string,

    commercialTitle:  (row.commercialTitle  as string | null) ?? null,
    subtitle:         (row.subtitle         as string | null) ?? null,
    shortDescription: (row.shortDescription as string | null) ?? null,
    longDescription:  (row.longDescription  as string | null) ?? null,

    keyBenefits: parseStringArray(row.keyBenefits as string | null),
    keyFeatures: parseStringArray(row.keyFeatures as string | null),

    materials:  (row.materials  as string | null) ?? null,
    dimensions: (row.dimensions as string | null) ?? null,
    weight:     (row.weight     as string | null) ?? null,

    careInstructions:  (row.careInstructions  as string | null) ?? null,
    usageInstructions: (row.usageInstructions as string | null) ?? null,
    recommendedAge:    (row.recommendedAge    as string | null) ?? null,

    faq: parseFaq(row.faq as string | null),

    seoTitle:       (row.seoTitle       as string | null) ?? null,
    seoDescription: (row.seoDescription as string | null) ?? null,
    searchKeywords: parseStringArray(row.searchKeywords as string | null),

    status:    (row.status    as ProductContentStatus) ?? "draft",
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch the content record for a product.
 * Returns null if none exists yet — callers treat null as "no content".
 */
export async function getProductContent(
  organizationId: string,
  productId:       string,
): Promise<ProductContentRecord | null> {
  const row = await (prisma as any).productContent.findUnique({
    where: { productId },
  });
  if (!row || row.organizationId !== organizationId) return null;
  return mapRow(row as Record<string, unknown>);
}

/**
 * Upsert (create-or-update) the content record for a product.
 * Only provided fields are written; omitted fields keep their current values.
 */
export async function upsertProductContent(
  input: ProductContentUpsertInput,
): Promise<ProductContentRecord> {
  const data: Record<string, unknown> = {
    organizationId: input.organizationId,
    updatedAt:      new Date(),
  };

  if (input.commercialTitle  !== undefined) data.commercialTitle  = input.commercialTitle;
  if (input.subtitle         !== undefined) data.subtitle         = input.subtitle;
  if (input.shortDescription !== undefined) data.shortDescription = input.shortDescription;
  if (input.longDescription  !== undefined) data.longDescription  = input.longDescription;
  if (input.keyBenefits      !== undefined) data.keyBenefits      = serializeStringArray(input.keyBenefits);
  if (input.keyFeatures      !== undefined) data.keyFeatures      = serializeStringArray(input.keyFeatures);
  if (input.materials        !== undefined) data.materials        = input.materials;
  if (input.dimensions       !== undefined) data.dimensions       = input.dimensions;
  if (input.weight           !== undefined) data.weight           = input.weight;
  if (input.careInstructions  !== undefined) data.careInstructions  = input.careInstructions;
  if (input.usageInstructions !== undefined) data.usageInstructions = input.usageInstructions;
  if (input.recommendedAge   !== undefined) data.recommendedAge   = input.recommendedAge;
  if (input.faq              !== undefined) data.faq              = serializeFaq(input.faq);
  if (input.seoTitle         !== undefined) data.seoTitle         = input.seoTitle;
  if (input.seoDescription   !== undefined) data.seoDescription   = input.seoDescription;
  if (input.searchKeywords   !== undefined) data.searchKeywords   = serializeStringArray(input.searchKeywords);
  if (input.status           !== undefined) data.status           = input.status;

  const row = await (prisma as any).productContent.upsert({
    where:  { productId: input.productId },
    create: { ...data, productId: input.productId },
    update: data,
  });

  return mapRow(row as Record<string, unknown>);
}

/**
 * Minimal projection used by the catalog query service.
 * Returns only the fields needed to enrich CatalogProductItem.
 */
export async function getContentProjections(
  organizationId: string,
  productIds:      string[],
): Promise<Map<string, { commercialTitle: string | null; shortDescription: string | null }>> {
  if (productIds.length === 0) return new Map();

  const rows = await (prisma as any).productContent.findMany({
    where: {
      organizationId,
      productId: { in: productIds },
    },
    select: {
      productId:        true,
      commercialTitle:  true,
      shortDescription: true,
    },
  }) as { productId: string; commercialTitle: string | null; shortDescription: string | null }[];

  return new Map(rows.map(r => [r.productId, {
    commercialTitle:  r.commercialTitle  ?? null,
    shortDescription: r.shortDescription ?? null,
  }]));
}
