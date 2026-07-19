/**
 * lib/integrations/shopify/shopify-content-resolver.ts
 *
 * MARKETING-STUDIO-SHOPIFY-PUBLISHING-01 — Content-Aware Payload Resolver
 *
 * SERVER ONLY — never import from client components.
 *
 * Resolves the complete Shopify product payload by consuming the full
 * Agentik content stack in priority order:
 *
 *   ProductChannelContent (shopify overrides)
 *     → ProductContent (master copy)
 *       → ProductEntity (identity fields)
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────
 *   The existing shopify-publisher.ts uses ProductConsoleItem (basic identity:
 *   name, SKU, category, images). It predates ProductContent and
 *   ProductChannelContent. This resolver enriches the payload with the full
 *   content stack without modifying the existing pipeline.
 *
 * ── ARCHITECTURE ──────────────────────────────────────────────────────────────
 *   resolveShopifyPayload()
 *     ├─ reads ProductEntity (name, sku, category, price, variants, assets)
 *     ├─ reads ProductContent (master: commercialTitle, longDescription, SEO, benefits)
 *     ├─ reads ProductChannelContent[shopify] (overrides: shopifyTitle, body, SEO, tags, handle)
 *     ├─ resolves each field: channel override → master fallback → entity field
 *     └─ returns ShopifyAdminProductCreatePayload + ShopifyMetafieldPayload[]
 *
 * ── FALLBACK CHAIN PER FIELD ──────────────────────────────────────────────────
 *   title:       shopifyTitle          → commercialTitle     → name
 *   body_html:   shopifyDescription    → longDescription     → description
 *   seo title:   shopifySeoTitle       → seoTitle            → title
 *   seo desc:    shopifySeoDescription → seoDescription      → shortDescription
 *   tags:        shopifyTags           → searchKeywords       → category
 *   handle:      shopifyHandle         → slug(commercialTitle) → slug(name)
 *
 * ── METAFIELDS ────────────────────────────────────────────────────────────────
 *   ProductContent fields mapped to Shopify metafields (namespace: "agentik"):
 *     agentik.materials, agentik.dimensions, agentik.weight,
 *     agentik.key_benefits, agentik.key_features,
 *     agentik.care_instructions, agentik.faq, agentik.recommended_age
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   No access tokens here. No API calls. Pure data resolution.
 *   resolveShopifyPayload() is a pure async function — fetches DB, returns DTO.
 */

import { prisma }                   from "@/lib/prisma";
import { getProductContent }        from "@/lib/marketing-studio/products/product-content-repository";
import { getChannelContent }        from "@/lib/marketing-studio/products/product-channel-content-repository";
import { checkImageReadiness, buildShopifyImagePayload } from "./shopify-images";
import { transformAgentikVariantsToShopify }             from "./shopify-variants";
import type { ShopifyAdminProductCreatePayload }         from "./shopify-types";
import type { ShopifyChannelPayload }                    from "@/lib/marketing-studio/products/product-channel-content-types";

// ── Metafield payload ─────────────────────────────────────────────────────────

export interface ShopifyMetafieldPayload {
  namespace: string;
  key:       string;
  value:     string;
  type:      "single_line_text_field" | "multi_line_text_field" | "json";
}

// ── Resolved payload ──────────────────────────────────────────────────────────

export interface ShopifyResolvedPayload {
  /** Ready for POST/PUT /admin/api/{version}/products.json */
  productPayload:  ShopifyAdminProductCreatePayload;
  /** Metafields to upsert after product creation/update */
  metafields:      ShopifyMetafieldPayload[];
  /** Safe readiness summary — never contains tokens */
  readiness: {
    isPublishable:   boolean;
    missingRequired: string[];
    warnings:        string[];
    contentScore:    number;
    hasShopifyOverrides: boolean;
  };
}

// ── Slug helper ───────────────────────────────────────────────────────────────

function toHandle(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 255);
}

// ── Metafield builder ─────────────────────────────────────────────────────────

function buildMetafields(
  content: {
    materials?:        string | null;
    dimensions?:       string | null;
    weight?:           string | null;
    keyBenefits?:      string[];
    keyFeatures?:      string[];
    careInstructions?: string | null;
    faq?:              unknown[];
    recommendedAge?:   string | null;
    shortDescription?: string | null;
  } | null,
  shopifyMeta: Record<string, string> | undefined | null,
): ShopifyMetafieldPayload[] {
  if (!content) return [];

  const mf: ShopifyMetafieldPayload[] = [];
  const add = (key: string, value: string | null | undefined, type: ShopifyMetafieldPayload["type"] = "single_line_text_field") => {
    if (value && value.trim()) mf.push({ namespace: "agentik", key, value: value.trim(), type });
  };

  add("materials",          content.materials);
  add("dimensions",         content.dimensions);
  add("weight",             content.weight);
  add("care_instructions",  content.careInstructions);
  add("recommended_age",    content.recommendedAge);
  add("short_description",  content.shortDescription);

  if (content.keyBenefits && content.keyBenefits.length > 0) {
    mf.push({ namespace: "agentik", key: "key_benefits", value: JSON.stringify(content.keyBenefits), type: "json" });
  }
  if (content.keyFeatures && content.keyFeatures.length > 0) {
    mf.push({ namespace: "agentik", key: "key_features", value: JSON.stringify(content.keyFeatures), type: "json" });
  }
  if (content.faq && (content.faq as unknown[]).length > 0) {
    mf.push({ namespace: "agentik", key: "faq", value: JSON.stringify(content.faq), type: "json" });
  }

  // Operator-specified metafields from ShopifyChannelPayload
  if (shopifyMeta) {
    for (const [dotKey, value] of Object.entries(shopifyMeta)) {
      if (!value) continue;
      const parts = dotKey.split(".");
      const ns    = parts.length >= 2 ? parts[0] : "agentik";
      const k     = parts.length >= 2 ? parts.slice(1).join(".") : dotKey;
      mf.push({ namespace: ns, key: k, value, type: "single_line_text_field" });
    }
  }

  return mf;
}

// ── Core resolver ─────────────────────────────────────────────────────────────

/**
 * Resolve the complete Shopify product payload from the Agentik content stack.
 *
 * Priority per field: shopify channel override → ProductContent master → ProductEntity field.
 * This is the ONLY function that should build Shopify payloads for new publications.
 */
export async function resolveShopifyPayload(
  organizationId: string,
  productId:       string,
): Promise<ShopifyResolvedPayload> {
  const warnings: string[]       = [];
  const missingRequired: string[] = [];

  // ── 1. Load ProductEntity with variants + assets ───────────────────────────
  const entity = await prisma.productEntity.findFirst({
    where: { id: productId, organizationId },
    include: {
      variants: {
        where:  { status: "active" },
        select: { id: true, name: true, sku: true, status: true, attributes: true },
      },
      assetLinks: {
        select:  { assetId: true, role: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!entity) throw new Error(`product_not_found:${productId}`);

  // ── 2. Load ProductContent + ProductChannelContent[shopify] ───────────────
  const [master, channelRecord] = await Promise.all([
    getProductContent(organizationId, productId),
    getChannelContent<ShopifyChannelPayload>(organizationId, productId, "shopify"),
  ]);

  const ch = channelRecord?.content ?? null;
  const hasShopifyOverrides = !!(ch && Object.values(ch).some(v => v !== null && v !== undefined));

  // ── 3. Resolve each field via fallback chain ───────────────────────────────
  function pick(...candidates: (string | null | undefined)[]): string {
    for (const c of candidates) {
      if (c && c.trim()) return c.trim();
    }
    return "";
  }

  const title     = pick(ch?.shopifyTitle,          master?.commercialTitle,    entity.name);
  const bodyHtml  = pick(ch?.shopifyDescription,    master?.longDescription,    master?.shortDescription, entity.description);
  const seoTitle  = pick(ch?.shopifySeoTitle,       master?.seoTitle,           title);
  const seoDesc   = pick(ch?.shopifySeoDescription, master?.seoDescription,     master?.shortDescription);
  const handle    = pick(ch?.shopifyHandle,
    master?.commercialTitle ? toHandle(master.commercialTitle) : null,
    toHandle(entity.name),
  );

  // Tags: channel overrides + master keywords + category fallback
  const tagSources = [
    ...(ch?.shopifyTags ?? []),
    ...(master?.searchKeywords ?? []),
  ];
  if (tagSources.length === 0 && entity.category) {
    tagSources.push(entity.category.toLowerCase().replace(/\s+/g, "-"));
  }
  const tags = [...new Set(tagSources)];

  // Collections from channel content
  const collections = ch?.shopifyCollections ?? [];

  // ── 4. Validate required fields ───────────────────────────────────────────
  if (!title)    missingRequired.push("Título");
  if (!bodyHtml) warnings.push("Sin descripción — se publicará con descripción vacía");

  // ── 5. Load assets ────────────────────────────────────────────────────────
  const assetIds = entity.assetLinks.map(l => l.assetId);
  const generatedAssets = assetIds.length > 0
    ? await prisma.generatedAsset.findMany({
        where:  { id: { in: assetIds }, assetUrl: { not: null } },
        select: { id: true, assetUrl: true },
      })
    : [];

  const assetMap   = new Map(generatedAssets.map(a => [a.id, a.assetUrl as string]));
  const heroIds    = entity.assetLinks.filter(l => l.role === "hero").map(l => l.assetId);
  const galleryIds = entity.assetLinks.filter(l => l.role !== "hero").map(l => l.assetId);
  const imageUrls  = [
    ...heroIds.filter(id => assetMap.has(id)).map(id => assetMap.get(id)!),
    ...galleryIds.filter(id => assetMap.has(id)).map(id => assetMap.get(id)!),
  ];

  const imageReadiness = checkImageReadiness(imageUrls);
  if (!imageReadiness.isReady) {
    warnings.push(imageReadiness.blockerReason ?? "Sin imágenes válidas para publicación");
  }
  if (imageReadiness.invalidImages.length > 0) {
    warnings.push(`${imageReadiness.invalidImages.length} imagen(es) omitidas: ${imageReadiness.invalidImages.map(i => i.reason).join("; ")}`);
  }

  const images = buildShopifyImagePayload(imageReadiness.validImages, title || entity.name);

  if (images.length === 0) missingRequired.push("Imagen principal");

  // ── 6. Build variants ─────────────────────────────────────────────────────
  const defaultPrice = entity.price != null ? String(entity.price) : "0.00";
  const variantInput = entity.variants.map(v => ({
    id:         v.id,
    name:       v.name,
    sku:        v.sku,
    status:     v.status,
    attributes: v.attributes as Record<string, string> | null,
  }));

  const variantResult = transformAgentikVariantsToShopify(variantInput, defaultPrice);
  warnings.push(...variantResult.warnings);

  // ── 7. Determine Shopify status ───────────────────────────────────────────
  const shopifyStatus = ch?.shopifyStatus ?? "draft";

  // ── 8. Build final payload ────────────────────────────────────────────────
  const productPayload: ShopifyAdminProductCreatePayload = {
    product: {
      title:        title  || entity.name,
      body_html:    bodyHtml,
      vendor:       organizationId,   // org as vendor — can be overridden via metafield
      product_type: entity.category ?? "",
      tags:         tags.join(", "),
      status:       shopifyStatus,
      handle:       handle || undefined,
      options:      variantResult.options,
      variants:     variantResult.variants,
      images,
    } as ShopifyAdminProductCreatePayload["product"],
  };

  // SEO metafield (Shopify SEO is set via metafields in REST API)
  const seoMetafields: ShopifyMetafieldPayload[] = [];
  if (seoTitle)  seoMetafields.push({ namespace: "global", key: "title_tag",       value: seoTitle,  type: "single_line_text_field" });
  if (seoDesc)   seoMetafields.push({ namespace: "global", key: "description_tag", value: seoDesc,   type: "multi_line_text_field"  });

  // Collections metafield (for publishing side)
  if (collections.length > 0) {
    seoMetafields.push({ namespace: "agentik", key: "collections", value: JSON.stringify(collections), type: "json" });
  }

  const contentMetafields = buildMetafields(master, ch?.shopifyMetafields);
  const metafields = [...seoMetafields, ...contentMetafields];

  // ── 9. Content score ─────────────────────────────────────────────────────
  let contentScore = 0;
  if (title)    contentScore += 25;
  if (bodyHtml) contentScore += 25;
  if (seoTitle) contentScore += 15;
  if (seoDesc)  contentScore += 15;
  if (images.length > 0) contentScore += 20;

  return {
    productPayload,
    metafields,
    readiness: {
      isPublishable:       missingRequired.length === 0,
      missingRequired,
      warnings,
      contentScore,
      hasShopifyOverrides,
    },
  };
}

// ── Readiness-only check (no full payload build) ──────────────────────────────

export async function checkShopifyReadiness(
  organizationId: string,
  productId:       string,
): Promise<{
  score:           number;
  isPublishable:   boolean;
  missingRequired: string[];
  warnings:        string[];
  hasShopifyOverrides: boolean;
  lastPublishedAt:  Date | null;
  externalProductId: string | null;
  shopifyHandle:     string | null;
  publicationStatus: string;
}> {
  const [resolved, pubState] = await Promise.all([
    resolveShopifyPayload(organizationId, productId).catch(() => null),
    prisma.productPublicationState.findUnique({
      where:  { productId_channel: { productId, channel: "shopify" } },
      select: {
        publicationStatus:     true,
        externalPublicationId: true,
        shopifyHandle:         true,
        publishedAt:           true,
        lastSyncAt:            true,
        errorMessage:          true,
      },
    }),
  ]);

  return {
    score:             resolved?.readiness.contentScore  ?? 0,
    isPublishable:     resolved?.readiness.isPublishable ?? false,
    missingRequired:   resolved?.readiness.missingRequired ?? [],
    warnings:          resolved?.readiness.warnings ?? [],
    hasShopifyOverrides: resolved?.readiness.hasShopifyOverrides ?? false,
    lastPublishedAt:   pubState?.publishedAt   ?? null,
    externalProductId: pubState?.externalPublicationId ?? null,
    shopifyHandle:     pubState?.shopifyHandle ?? null,
    publicationStatus: pubState?.publicationStatus ?? "unpublished",
  };
}
