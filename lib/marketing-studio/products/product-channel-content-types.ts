/**
 * lib/marketing-studio/products/product-channel-content-types.ts
 *
 * MARKETING-STUDIO-PRODUCT-CHANNEL-CONTENT-01 — Channel Content Domain Types
 *
 * Omnichannel content adaptation layer.
 *
 * ── ARCHITECTURE ──────────────────────────────────────────────────────────────
 *   ProductEntity
 *     └─ ProductContent            ← source of truth (master)
 *          └─ ProductChannelContent[]  ← channel adaptations (this layer)
 *               ├─ shopify
 *               ├─ whatsapp
 *               ├─ instagram
 *               ├─ facebook
 *               ├─ tiktok
 *               ├─ marketplace
 *               └─ pdf
 *
 * ── PRINCIPLE ─────────────────────────────────────────────────────────────────
 *   ProductContent is the source of truth.
 *   ProductChannelContent is an adaptation. Never the reverse.
 *
 *   When a channel field is null → resolver falls back to ProductContent master.
 *   When a channel field has a value → resolver uses that override.
 *
 * ── RULES ─────────────────────────────────────────────────────────────────────
 *   - No `any` types
 *   - No business logic
 *   - No Prisma imports
 *   - Channel payload shapes are typed per channel in this file
 *
 * ── EXTENSION POINTS ──────────────────────────────────────────────────────────
 *   AI_GENERATION_SLOT per channel:
 *     SHOPIFY_AI_SLOT:      generate shopifyTitle / shopifyDescription from master
 *     WHATSAPP_AI_SLOT:     generate whatsAppSalesMessage from keyBenefits
 *     INSTAGRAM_AI_SLOT:    generate instagramCaption + hashtags from shortDescription
 *     TIKTOK_AI_SLOT:       generate tiktokHook from product name + benefit
 *     MARKETPLACE_AI_SLOT:  generate marketplace description from longDescription
 *
 *   PUBLISHING_INTEGRATION_SLOTS (future sprints — do NOT implement here):
 *     SHOPIFY_PUBLISHING_SLOT:     connect to Shopify Publishing sprint
 *     SOCIAL_PUBLISHING_SLOT:      connect to Social Publishing sprint
 *     MARKETPLACE_PUBLISHING_SLOT: connect to Marketplace Publishing sprint
 *     WHATSAPP_AUTOMATION_SLOT:    connect to WhatsApp Automation sprint
 *     CATALOG_INTELLIGENCE_SLOT:   feed into Catalog Intelligence sprint
 */

// ── Channel type ───────────────────────────────────────────────────────────────

export type ChannelType =
  | "shopify"
  | "whatsapp"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "marketplace"
  | "pdf";

export const ALL_CHANNELS: ChannelType[] = [
  "shopify", "whatsapp", "instagram", "facebook", "tiktok", "marketplace", "pdf",
];

export const CHANNEL_LABELS: Record<ChannelType, string> = {
  shopify:     "Shopify",
  whatsapp:    "WhatsApp",
  instagram:   "Instagram",
  facebook:    "Facebook",
  tiktok:      "TikTok",
  marketplace: "Marketplace",
  pdf:         "Catálogo PDF",
};

// ── Channel status ────────────────────────────────────────────────────────────

export type ChannelContentStatus = "draft" | "ready" | "approved";

export const CHANNEL_STATUS_LABELS: Record<ChannelContentStatus, string> = {
  draft:    "Borrador",
  ready:    "Listo",
  approved: "Aprobado",
};

// ── Per-channel payload types ─────────────────────────────────────────────────
// Each channel has its own typed payload shape.
// Null values signal "use master fallback" — the resolver applies them.

export interface ShopifyChannelPayload {
  shopifyTitle?:          string | null;
  shopifyDescription?:    string | null;
  shopifySeoTitle?:       string | null;
  shopifySeoDescription?: string | null;
  shopifyTags?:           string[];       // comma-separated tags
  shopifyCollections?:    string[];       // collection handles
  shopifyMetafields?:     Record<string, string>;   // namespace.key → value
  shopifyHandle?:         string | null;  // URL handle (auto-computed if null)
  shopifyStatus?:         "active" | "draft" | "archived";
  // SHOPIFY_PUBLISHING_SLOT: publishedAt, channelVisibility, marketIds
}

export interface WhatsAppChannelPayload {
  whatsAppShortPitch?:      string | null;  // ≤80 chars — first message hook
  whatsAppSalesMessage?:    string | null;  // full sales pitch paragraph
  whatsAppFollowUpMessage?: string | null;  // re-engagement message
  whatsAppKeywords?:        string[];       // for contact classification
  // WHATSAPP_AUTOMATION_SLOT: templateId, catalogItemId
}

export interface InstagramChannelPayload {
  instagramCaption?:      string | null;
  instagramHashtags?:     string[];         // without the # prefix
  instagramHook?:         string | null;    // first line / hook sentence
  instagramCallToAction?: string | null;
  // SOCIAL_PUBLISHING_SLOT: scheduledAt, boostBudget
}

export interface FacebookChannelPayload {
  facebookCaption?:      string | null;
  facebookCallToAction?: string | null;
  facebookDescription?:  string | null;
  // SOCIAL_PUBLISHING_SLOT: pageId, adSetId
}

export interface TikTokChannelPayload {
  tiktokCaption?:      string | null;
  tiktokHook?:         string | null;  // first 3 seconds text
  tiktokKeywords?:     string[];
  tiktokCallToAction?: string | null;
  // SOCIAL_PUBLISHING_SLOT: creatorId, duetEnabled
}

export interface MarketplaceChannelPayload {
  marketplaceTitle?:       string | null;
  marketplaceDescription?: string | null;
  marketplaceCategory?:    string | null;    // marketplace category path
  marketplaceBulletPoints?: string[];        // 3–5 bullet points (Amazon style)
  marketplaceKeywords?:    string[];
  marketplaceGtin?:        string | null;    // EAN / UPC
  marketplacePlatform?:    string | null;    // "amazon" | "mercadolibre" | "falabella" | "linio" | other
  // MARKETPLACE_PUBLISHING_SLOT: listingId, syncEnabled
}

export interface PdfChannelPayload {
  pdfShortDescription?:     string | null;
  pdfHighlightBenefits?:    string[];        // concise bullet list for print
  pdfCommercialNotes?:      string | null;   // internal notes for layout designer
  // CATALOG_INTELLIGENCE_SLOT: templateId, printConfig
}

// ── Discriminated union ────────────────────────────────────────────────────────

export type ChannelPayload =
  | ShopifyChannelPayload
  | WhatsAppChannelPayload
  | InstagramChannelPayload
  | FacebookChannelPayload
  | TikTokChannelPayload
  | MarketplaceChannelPayload
  | PdfChannelPayload;

// ── DB record ─────────────────────────────────────────────────────────────────

export interface ChannelContentRecord<P extends ChannelPayload = ChannelPayload> {
  id:             string;
  productId:      string;
  organizationId: string;
  channel:        ChannelType;
  content:        P | null;   // null = record exists but no overrides set yet
  status:         ChannelContentStatus;
  createdAt:      Date;
  updatedAt:      Date;
}

// ── Upsert input ──────────────────────────────────────────────────────────────

export interface ChannelContentUpsertInput<P extends ChannelPayload = ChannelPayload> {
  productId:      string;
  organizationId: string;
  channel:        ChannelType;
  content:        P;
  status?:        ChannelContentStatus;
}

// ── Resolver types ────────────────────────────────────────────────────────────

/**
 * Source tag for each resolved field.
 * "channel" = came from ProductChannelContent (override).
 * "master"  = fell back to ProductContent.
 * "missing" = neither source had a value.
 */
export type FieldSource = "channel" | "master" | "missing";

/**
 * A single resolved field with its effective value and source.
 */
export interface ResolvedField {
  value:  string | string[] | null;
  source: FieldSource;
}

/**
 * The fully resolved content for one channel.
 * Every key maps to a ResolvedField so the UI can show where each value came from.
 */
export interface ResolvedChannelContent {
  productId: string;
  channel:   ChannelType;
  fields:    Record<string, ResolvedField>;
  /** Flat "effective" view — what the integration layer would actually send */
  effective: Record<string, string | string[] | null>;
}

// ── Readiness per channel ─────────────────────────────────────────────────────

export interface ChannelReadinessResult {
  channel:          ChannelType;
  score:            number;   // 0–100
  ready:            boolean;  // score >= threshold
  overrideCount:    number;   // fields with channel-specific override
  fallbackCount:    number;   // fields resolved from master
  missingCount:     number;   // fields with no value at all
  missingRequired:  string[]; // labels of required fields that are missing
}

export interface ProductChannelReadiness {
  productId: string;
  channels:  ChannelReadinessResult[];
  computedAt: Date;
}

// ── Projection (for list views) ───────────────────────────────────────────────

export interface ChannelContentProjection {
  channel:       ChannelType;
  status:        ChannelContentStatus;
  hasOverrides:  boolean;
  overrideCount: number;
}
