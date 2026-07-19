/**
 * lib/marketing-studio/products/product-channel-content-service.ts
 *
 * MARKETING-STUDIO-PRODUCT-CHANNEL-CONTENT-01 — Service + Resolver Engine
 *
 * SERVER ONLY — never import from client components.
 *
 * ── RESOLVER ENGINE ───────────────────────────────────────────────────────────
 *   resolveChannelContent() is the central resolver.
 *   It applies inheritance: channel override → master fallback → missing.
 *   Every consumer (API, catalog, publishing, social) MUST use this function.
 *   Never read ProductChannelContent.content directly in a consumer.
 *
 * ── INHERITANCE RULES PER CHANNEL ────────────────────────────────────────────
 *   shopify:
 *     shopifyTitle        → master.commercialTitle
 *     shopifyDescription  → master.longDescription
 *     shopifySeoTitle     → master.seoTitle
 *     shopifySeoDescription → master.seoDescription
 *   whatsapp:
 *     whatsAppShortPitch  → master.shortDescription
 *     whatsAppSalesMessage → master.longDescription
 *   instagram:
 *     instagramCaption    → master.shortDescription
 *   facebook:
 *     facebookCaption     → master.shortDescription
 *     facebookDescription → master.longDescription
 *   tiktok:
 *     tiktokCaption       → master.shortDescription
 *   marketplace:
 *     marketplaceTitle    → master.commercialTitle
 *     marketplaceDescription → master.longDescription
 *   pdf:
 *     pdfShortDescription → master.shortDescription
 *     pdfHighlightBenefits → master.keyBenefits
 *
 * ── EXTENSION POINTS ──────────────────────────────────────────────────────────
 *   AI_GENERATION_SLOT: pass `aiDraft` as third arg to resolveChannelContent
 *     to inject AI-generated values at lower priority than channel overrides
 *     but higher than master fallbacks.
 *
 *   PUBLISHING_INTEGRATION_SLOTS (future sprints):
 *     SHOPIFY_PUBLISHING_SLOT:     consume resolveChannelContent("shopify") result
 *     SOCIAL_PUBLISHING_SLOT:      consume resolveChannelContent("instagram"|"facebook"|"tiktok")
 *     MARKETPLACE_PUBLISHING_SLOT: consume resolveChannelContent("marketplace")
 *     WHATSAPP_AUTOMATION_SLOT:    consume resolveChannelContent("whatsapp")
 */

import {
  getChannelContent,
  getAllChannelContent,
  upsertChannelContent,
  getChannelProjections,
} from "./product-channel-content-repository";
import { getProductContent } from "./product-content-repository";
import type {
  ChannelType,
  ChannelPayload,
  ChannelContentRecord,
  ChannelContentUpsertInput,
  ResolvedChannelContent,
  ResolvedField,
  FieldSource,
  ChannelReadinessResult,
  ProductChannelReadiness,
  ChannelContentProjection,
  ShopifyChannelPayload,
  WhatsAppChannelPayload,
  InstagramChannelPayload,
  FacebookChannelPayload,
  TikTokChannelPayload,
  MarketplaceChannelPayload,
  PdfChannelPayload,
} from "./product-channel-content-types";
import { ALL_CHANNELS } from "./product-channel-content-types";
import type { ProductContentRecord } from "./product-content-types";

// ── Resolver helpers ──────────────────────────────────────────────────────────

function resolved(value: string | string[] | null | undefined, source: FieldSource): ResolvedField {
  const v = (value === undefined ? null : value) as string | string[] | null;
  return { value: v, source: v !== null && (Array.isArray(v) ? v.length > 0 : v !== "") ? source : "missing" };
}

function pick(
  override: string | null | undefined,
  fallback: string | null | undefined,
): ResolvedField {
  if (override !== null && override !== undefined && override !== "") {
    return { value: override, source: "channel" };
  }
  if (fallback !== null && fallback !== undefined && fallback !== "") {
    return { value: fallback, source: "master" };
  }
  return { value: null, source: "missing" };
}

function pickArr(
  override: string[] | null | undefined,
  fallback: string[] | null | undefined,
): ResolvedField {
  if (override && override.length > 0) return { value: override, source: "channel" };
  if (fallback && fallback.length > 0) return { value: fallback, source: "master" };
  return { value: [], source: "missing" };
}

// ── Per-channel resolvers ─────────────────────────────────────────────────────

function resolveShopify(
  p: ShopifyChannelPayload | null,
  m: ProductContentRecord | null,
): Record<string, ResolvedField> {
  return {
    shopifyTitle:          pick(p?.shopifyTitle,          m?.commercialTitle),
    shopifyDescription:    pick(p?.shopifyDescription,    m?.longDescription),
    shopifySeoTitle:       pick(p?.shopifySeoTitle,       m?.seoTitle),
    shopifySeoDescription: pick(p?.shopifySeoDescription, m?.seoDescription),
    shopifyTags:           pickArr(p?.shopifyTags,           m?.searchKeywords),
    shopifyCollections:    pickArr(p?.shopifyCollections,    null),
    shopifyHandle:         resolved(p?.shopifyHandle, "channel"),
    shopifyStatus:         resolved(p?.shopifyStatus ?? "draft", "channel"),
    // SHOPIFY_PUBLISHING_SLOT: publishedAt, channelVisibility
  };
}

function resolveWhatsApp(
  p: WhatsAppChannelPayload | null,
  m: ProductContentRecord | null,
): Record<string, ResolvedField> {
  return {
    whatsAppShortPitch:      pick(p?.whatsAppShortPitch,      m?.shortDescription),
    whatsAppSalesMessage:    pick(p?.whatsAppSalesMessage,    m?.longDescription),
    whatsAppFollowUpMessage: resolved(p?.whatsAppFollowUpMessage, "channel"),
    whatsAppKeywords:        pickArr(p?.whatsAppKeywords,     m?.searchKeywords),
    // WHATSAPP_AUTOMATION_SLOT: templateId
  };
}

function resolveInstagram(
  p: InstagramChannelPayload | null,
  m: ProductContentRecord | null,
): Record<string, ResolvedField> {
  return {
    instagramCaption:      pick(p?.instagramCaption,      m?.shortDescription),
    instagramHashtags:     pickArr(p?.instagramHashtags,  m?.searchKeywords),
    instagramHook:         resolved(p?.instagramHook,     "channel"),
    instagramCallToAction: resolved(p?.instagramCallToAction, "channel"),
    // SOCIAL_PUBLISHING_SLOT: scheduledAt
  };
}

function resolveFacebook(
  p: FacebookChannelPayload | null,
  m: ProductContentRecord | null,
): Record<string, ResolvedField> {
  return {
    facebookCaption:      pick(p?.facebookCaption,      m?.shortDescription),
    facebookCallToAction: resolved(p?.facebookCallToAction, "channel"),
    facebookDescription:  pick(p?.facebookDescription,  m?.longDescription),
    // SOCIAL_PUBLISHING_SLOT: pageId
  };
}

function resolveTikTok(
  p: TikTokChannelPayload | null,
  m: ProductContentRecord | null,
): Record<string, ResolvedField> {
  return {
    tiktokCaption:      pick(p?.tiktokCaption,      m?.shortDescription),
    tiktokHook:         resolved(p?.tiktokHook,     "channel"),
    tiktokKeywords:     pickArr(p?.tiktokKeywords,  m?.searchKeywords),
    tiktokCallToAction: resolved(p?.tiktokCallToAction, "channel"),
    // SOCIAL_PUBLISHING_SLOT: creatorId
  };
}

function resolveMarketplace(
  p: MarketplaceChannelPayload | null,
  m: ProductContentRecord | null,
): Record<string, ResolvedField> {
  return {
    marketplaceTitle:        pick(p?.marketplaceTitle,       m?.commercialTitle),
    marketplaceDescription:  pick(p?.marketplaceDescription, m?.longDescription),
    marketplaceCategory:     resolved(p?.marketplaceCategory, "channel"),
    marketplaceBulletPoints: pickArr(p?.marketplaceBulletPoints, m?.keyBenefits),
    marketplaceKeywords:     pickArr(p?.marketplaceKeywords,  m?.searchKeywords),
    marketplaceGtin:         resolved(p?.marketplaceGtin,    "channel"),
    marketplacePlatform:     resolved(p?.marketplacePlatform,"channel"),
    // MARKETPLACE_PUBLISHING_SLOT: listingId
  };
}

function resolvePdf(
  p: PdfChannelPayload | null,
  m: ProductContentRecord | null,
): Record<string, ResolvedField> {
  return {
    pdfShortDescription:  pick(p?.pdfShortDescription,     m?.shortDescription),
    pdfHighlightBenefits: pickArr(p?.pdfHighlightBenefits, m?.keyBenefits),
    pdfCommercialNotes:   resolved(p?.pdfCommercialNotes,  "channel"),
    // CATALOG_INTELLIGENCE_SLOT: templateId
  };
}

// ── Readiness thresholds per channel ─────────────────────────────────────────

const CHANNEL_REQUIRED_FIELDS: Record<ChannelType, string[]> = {
  shopify:     ["shopifyTitle", "shopifyDescription"],
  whatsapp:    ["whatsAppShortPitch"],
  instagram:   ["instagramCaption"],
  facebook:    ["facebookCaption"],
  tiktok:      ["tiktokCaption"],
  marketplace: ["marketplaceTitle", "marketplaceDescription"],
  pdf:         ["pdfShortDescription"],
};

const CHANNEL_FIELD_LABELS: Record<string, string> = {
  shopifyTitle:          "Título Shopify",
  shopifyDescription:    "Descripción Shopify",
  whatsAppShortPitch:    "Mensaje corto WhatsApp",
  instagramCaption:      "Caption Instagram",
  facebookCaption:       "Caption Facebook",
  tiktokCaption:         "Caption TikTok",
  marketplaceTitle:      "Título marketplace",
  marketplaceDescription:"Descripción marketplace",
  pdfShortDescription:   "Descripción PDF",
};

function scoreReadiness(fields: Record<string, ResolvedField>, channel: ChannelType): ChannelReadinessResult {
  const values    = Object.values(fields);
  const overrides = values.filter(f => f.source === "channel");
  const fallbacks = values.filter(f => f.source === "master");
  const missing   = values.filter(f => f.source === "missing");

  const required     = CHANNEL_REQUIRED_FIELDS[channel] ?? [];
  const missingReq   = required.filter(key => fields[key]?.source === "missing");
  const missingLabels = missingReq.map(k => CHANNEL_FIELD_LABELS[k] ?? k);

  // Score: 40 pts for required fields covered + 60 pts for override completeness
  const reqCoverage    = required.length > 0 ? (required.length - missingReq.length) / required.length : 1;
  const overridePct    = values.length > 0 ? overrides.length / values.length : 0;
  const score          = Math.round(reqCoverage * 40 + overridePct * 60);

  return {
    channel,
    score,
    ready:           missingReq.length === 0,
    overrideCount:   overrides.length,
    fallbackCount:   fallbacks.length,
    missingCount:    missing.length,
    missingRequired: missingLabels,
  };
}

// ── Core resolver ─────────────────────────────────────────────────────────────

function resolveFields(
  channel: ChannelType,
  channelRecord: ChannelContentRecord | null,
  master: ProductContentRecord | null,
): Record<string, ResolvedField> {
  const payload = channelRecord?.content ?? null;
  switch (channel) {
    case "shopify":     return resolveShopify(payload as ShopifyChannelPayload | null, master);
    case "whatsapp":    return resolveWhatsApp(payload as WhatsAppChannelPayload | null, master);
    case "instagram":   return resolveInstagram(payload as InstagramChannelPayload | null, master);
    case "facebook":    return resolveFacebook(payload as FacebookChannelPayload | null, master);
    case "tiktok":      return resolveTikTok(payload as TikTokChannelPayload | null, master);
    case "marketplace": return resolveMarketplace(payload as MarketplaceChannelPayload | null, master);
    case "pdf":         return resolvePdf(payload as PdfChannelPayload | null, master);
  }
}

function buildEffective(fields: Record<string, ResolvedField>): Record<string, string | string[] | null> {
  const effective: Record<string, string | string[] | null> = {};
  for (const [key, field] of Object.entries(fields)) {
    effective[key] = field.source === "missing" ? null : field.value;
  }
  return effective;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve the effective content for one channel.
 * Applies inheritance: channel override → master fallback → missing.
 * This is the ONLY function consumers should use to get channel content.
 */
export async function resolveChannelContent(
  organizationId: string,
  productId:       string,
  channel:         ChannelType,
): Promise<ResolvedChannelContent> {
  const [channelRecord, master] = await Promise.all([
    getChannelContent(organizationId, productId, channel),
    getProductContent(organizationId, productId),
  ]);

  const fields    = resolveFields(channel, channelRecord, master);
  const effective = buildEffective(fields);

  return { productId, channel, fields, effective };
}

/**
 * Resolve all channels for one product.
 * Returns one ResolvedChannelContent per channel.
 */
export async function resolveAllChannels(
  organizationId: string,
  productId:       string,
): Promise<ResolvedChannelContent[]> {
  const [allChannelRecords, master] = await Promise.all([
    getAllChannelContent(organizationId, productId),
    getProductContent(organizationId, productId),
  ]);

  const recordMap = new Map(allChannelRecords.map(r => [r.channel, r]));

  return ALL_CHANNELS.map(channel => {
    const channelRecord = recordMap.get(channel) ?? null;
    const fields        = resolveFields(channel, channelRecord, master);
    const effective     = buildEffective(fields);
    return { productId, channel, fields, effective };
  });
}

/**
 * Compute readiness for all channels for one product.
 */
export async function computeChannelReadiness(
  organizationId: string,
  productId:       string,
): Promise<ProductChannelReadiness> {
  const resolved = await resolveAllChannels(organizationId, productId);
  const channels = resolved.map(r => scoreReadiness(r.fields, r.channel));
  return { productId, channels, computedAt: new Date() };
}

/**
 * Save channel content for one channel.
 * Enforces org boundary.
 */
export async function saveChannelContent<P extends ChannelPayload>(
  organizationId: string,
  input: ChannelContentUpsertInput<P>,
): Promise<ResolvedChannelContent> {
  if (input.organizationId !== organizationId) {
    throw new Error("org_boundary_violation");
  }

  await upsertChannelContent(input);
  return resolveChannelContent(organizationId, input.productId, input.channel);
}

/**
 * Lightweight projections for all channels of a product.
 * Used by the UI to show per-channel status without loading full payloads.
 */
export async function getChannelSummary(
  organizationId: string,
  productId:       string,
): Promise<ChannelContentProjection[]> {
  return getChannelProjections(organizationId, productId);
}

/**
 * Fetch resolved content + readiness for one channel.
 * Convenience wrapper used by the GET API route.
 */
export async function getChannelContentWithReadiness(
  organizationId: string,
  productId:       string,
  channel:         ChannelType,
): Promise<{ resolved: ResolvedChannelContent; readiness: ChannelReadinessResult }> {
  const resolved  = await resolveChannelContent(organizationId, productId, channel);
  const readiness = scoreReadiness(resolved.fields, channel);
  return { resolved, readiness };
}
