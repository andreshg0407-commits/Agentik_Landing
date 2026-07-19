/**
 * lib/marketing-studio/library/types.ts
 *
 * MARKETING-STUDIO-LIBRARY-CORE — Sprint MS-01
 *
 * The Biblioteca / Asset Hub is the visual and commercial nervous system of Agentik.
 * Every asset generated, uploaded, or imported flows through this system before
 * reaching any destination (Shopify, social media, Pauta IA, WhatsApp, catalogs, CRM).
 *
 * ── ARCHITECTURAL RULE ────────────────────────────────────────────────────────
 *
 *   "Foto Estudio does not publish. Foto Estudio generates.
 *    La Biblioteca decides where assets go."
 *
 * ── WHAT THIS FILE CONTAINS ───────────────────────────────────────────────────
 *
 *   Core type system for the Asset Hub:
 *     AssetType, AssetStatus, AssetOrigin, AssetChannel
 *     AssetRelation, AssetVariant
 *     MarketingAsset  — the primary entity (maps to Prisma LibraryAsset, sprint MS-02)
 *     BatchGenerationJob  — multi-product generation queue
 *     CatalogQuery        — dynamic catalog filter spec
 *     LibrarySearchFilter — asset hub search/filter
 *     AssetStorageProfile — R2 lifecycle hint structure
 *     AssetDuplicateRecord — duplicate/variant tracking
 *
 * ── WHAT THIS FILE DOES NOT CONTAIN ──────────────────────────────────────────
 *
 *   - Prisma schema (sprint MS-02)
 *   - UI components (sprint MS-02+)
 *   - Shopify / Meta / TikTok API calls (future sprints)
 *   - Real batch runner (sprint MS-04)
 *   - Real catalog PDF generation (sprint MS-05+)
 *   - R2 real connection (sprint MS-02+)
 *   - Vector/semantic search (future sprints)
 *
 * ── FEEDS ─────────────────────────────────────────────────────────────────────
 *
 *   Biblioteca → Shopify OS
 *   Biblioteca → Redes Sociales
 *   Biblioteca → Pauta IA (Luca)
 *   Biblioteca → Mila / WhatsApp
 *   Biblioteca → Dynamic Catalogs
 *   Biblioteca → CRM (future)
 *   Biblioteca → ERP (future)
 *   Biblioteca → Landing pages
 *   Biblioteca → Campaign automation
 */

import type { GarmentType, ProductCategory }            from "../foto-estudio-types";
import type { MarketingBusinessLine, RetailSeason }      from "../types";

// ── Asset classification ───────────────────────────────────────────────────────

/**
 * AssetType — what kind of creative this asset is.
 * Determines which channels it can be sent to and what operations are valid.
 */
export type AssetType =
  | "product_photo"    // clean product photo — e-commerce / catalog
  | "lifestyle_photo"  // model or context shot — social / lookbook
  | "banner"           // promotional banner — web / ads / WhatsApp
  | "hero"             // hero image / landing section
  | "short_video"      // 8–30s vertical clip — Reels / TikTok
  | "catalog_page"     // composed catalog page (multi-product layout)
  | "template"         // reusable brand template
  | "ad_creative"      // paid ads creative — Meta / TikTok / Google
  | "landing_asset"    // visual for a landing or campaign page
  | "whatsapp_asset";  // optimized for WhatsApp / Mila status format

/**
 * AssetStatus — lifecycle state of an asset inside the Biblioteca.
 * Full lifecycle: draft → generated → review_pending → approved → published → archived
 *
 * RULE: approved ≠ published.
 *   approved  → validated, ready to use, can be scheduled
 *   published → has been dispatched to a channel
 *
 * rejected is a terminal state; only AGENTIK_ADMIN can reset to draft.
 * archived is a soft-delete; asset is retained for analytics.
 */
export type AssetStatus =
  | "draft"           // raw or incomplete — not ready for review
  | "generated"       // AI generation complete — awaiting operator review
  | "review_pending"  // submitted for approval — approval workflow active
  | "approved"        // content validated — ready to publish or schedule
  | "published"       // dispatched to at least one channel
  | "archived"        // retired — no longer active, kept for history
  | "rejected";       // rejected in review — terminal (admin can reset)

/**
 * AssetOrigin — where this asset came from.
 * Drives audit trail and attribution in the Biblioteca.
 */
export type AssetOrigin =
  | "ai_generated"    // produced by Foto Estudio + AI pipeline
  | "manual_upload"   // uploaded directly by operator
  | "shopify_import"  // imported from an existing Shopify product
  | "crm_import"      // imported from CRM contact / campaign
  | "external";       // any other external source (partner, agency, etc.)

/**
 * AssetChannel — destination channels this asset can be published to.
 * A single asset can target multiple channels (e.g. "shopify" + "instagram").
 * Channel compatibility is enforced at publish time, not here.
 */
export type AssetChannel =
  | "shopify"         // Shopify product page / collection
  | "instagram"       // Instagram feed, reels, stories
  | "facebook"        // Facebook feed, stories, ads
  | "tiktok"          // TikTok feed / ads
  | "youtube"         // YouTube thumbnail / short
  | "whatsapp"        // WhatsApp status / Mila broadcast
  | "catalog"         // print / digital catalog (PDF / web)
  | "crm"             // CRM visual (Mila, email, campaign brief)
  | "erp"             // ERP product image (internal catalog sync)
  | "ads";            // generic paid ads (Google / Meta / TikTok)

// ── Asset relations ────────────────────────────────────────────────────────────

/**
 * AssetRelation — links an asset to another entity in the system.
 * Used for traceability: which product, campaign, or workflow produced this asset.
 */
export interface AssetRelation {
  /**
   * type identifies the kind of entity being referenced.
   *   product          → internal product record (future ERP integration)
   *   campaign         → marketing campaign (Pauta IA)
   *   catalog          → a catalog compilation job
   *   shopify_product  → a Shopify product ID
   *   workflow         → an n8n workflow execution
   *   agent            → the Agentik agent that produced this (Diego/Luca/Mila/Sofi)
   */
  type:        "product" | "campaign" | "catalog" | "shopify_product" | "workflow" | "agent";
  referenceId: string;
  /** Human-readable label for display in Biblioteca UI (e.g. product title). */
  label?:      string;
}

// ── Asset variants ─────────────────────────────────────────────────────────────

/**
 * AssetVariant — a channel-specific or size-specific derivative of a master asset.
 *
 * A master asset (e.g. 4K product photo) can have variants:
 *   - 1:1 version for Instagram feed
 *   - 9:16 version for Reels / TikTok
 *   - 800x600 optimized WebP for Shopify
 *   - thumbnail for Biblioteca grid
 *
 * Variants are generated from the master; the master is never deleted while
 * active variants reference it.
 */
export interface AssetVariant {
  id:       string;
  /** Human label: "Instagram 1:1", "Shopify optimized", "Thumbnail 240px" */
  label:    string;
  /** CDN URL for this variant. Optional if not yet generated. */
  url?:     string;
  width?:   number;
  height?:  number;
  /** "jpeg" | "png" | "webp" | "mp4" | "avif" */
  format?:  string;
  channel?: AssetChannel;
  /** File size in bytes — used for storage cost reporting. */
  sizeBytes?: number;
}

// ── Core asset entity ──────────────────────────────────────────────────────────

/**
 * MarketingAsset — the primary entity of the Biblioteca / Asset Hub.
 *
 * This is the canonical in-memory representation.
 * The Prisma model LibraryAsset (sprint MS-02) maps 1:1 to this interface.
 *
 * Multi-tenant: every asset belongs to exactly one tenant.
 * The organizationId (Prisma) is the tenant boundary; tenantId here is the slug.
 */
export interface MarketingAsset {
  // ── Identity ───────────────────────────────────────────────────────────────
  id:           string;
  name:         string;
  description?: string;

  // ── Classification ─────────────────────────────────────────────────────────
  assetType:    AssetType;
  status:       AssetStatus;
  origin:       AssetOrigin;

  // ── Tenant ─────────────────────────────────────────────────────────────────
  tenantId:     string;
  /** MarketingBusinessLine — "castillitos" | "latin_kids" | "importacion" | "pets" */
  businessLine?: MarketingBusinessLine;

  // ── Product taxonomy (MS-00 split) ─────────────────────────────────────────
  /** Retail path — Castillitos. Mutually exclusive with garmentType. */
  productCategory?: ProductCategory;
  /** Fashion path — Do Jeans. Mutually exclusive with productCategory. */
  garmentType?:     GarmentType;

  // ── Product reference ──────────────────────────────────────────────────────
  /** Internal SKU — links asset to a product in the ERP/catalog. */
  sku?:             string;

  // ── Campaign context ───────────────────────────────────────────────────────
  /** Retail season this asset was created for. Drives campaign calendar. */
  retailSeason?:    RetailSeason;

  // ── Discovery ──────────────────────────────────────────────────────────────
  /** Free-form tags for search, filtering, and AI retrieval. */
  tags:             string[];

  // ── Channel routing ────────────────────────────────────────────────────────
  /** Which channels this asset is cleared for. Empty = not yet cleared. */
  channels:         AssetChannel[];

  // ── Relations ──────────────────────────────────────────────────────────────
  relations?:       AssetRelation[];

  // ── Variants ───────────────────────────────────────────────────────────────
  variants?:        AssetVariant[];

  // ── Source ─────────────────────────────────────────────────────────────────
  /** Primary CDN URL — the master/original file. */
  url?:             string;
  /** MIME type of the master file. */
  mimeType?:        string;
  /** File size of the master in bytes. */
  sizeBytes?:       number;

  // ── Attribution ────────────────────────────────────────────────────────────
  /** Agent or system that generated this (e.g. "foto-estudio-wizard", "luca-v2"). */
  generatedBy?:     string;
  /** Session ID from StudioSession — traces back to the Foto Estudio run. */
  sessionId?:       string;

  // ── Approval ───────────────────────────────────────────────────────────────
  approvedAt?:      string;   // ISO
  approvedBy?:      string;   // operator userId

  // ── Timestamps ─────────────────────────────────────────────────────────────
  createdAt:        string;   // ISO
  updatedAt:        string;   // ISO

  // ── Analytics ──────────────────────────────────────────────────────────────
  /** How many times this asset has been published to any channel. */
  usageCount?:      number;
  /** The last channel this was published to, with ISO timestamp. */
  lastPublishedAt?: string;
  lastPublishedTo?: AssetChannel;

  // ── Duplicate / derivative tracking ───────────────────────────────────────
  /** ID of the master asset this was derived from (e.g. a resized variant promoted to asset). */
  duplicateOf?:     string;

  // ── Extensible metadata ────────────────────────────────────────────────────
  /** Structured metadata — typed by AssetContextualMetadata in metadata.ts. */
  metadata?:        Record<string, unknown>;
}

// ── Batch generation foundations ───────────────────────────────────────────────
// Sprint MS-04 will build the full runner. These types define the conceptual schema.

/**
 * BatchGenerationJob — a multi-product generation queue.
 *
 * Castillitos operates with catalog batches: multiple products per season.
 * Each item in a batch runs through the Foto Estudio pipeline independently,
 * but they share preset, season, channel, and businessLine context.
 *
 * Arquitectura:
 *   BatchGenerationJob
 *     items: BatchJobItem[]  (each = one StudioSession child)
 *     → generates: MarketingAsset[]  (all tagged with the batch's context)
 *     → lands in: Biblioteca filtered by (retailSeason + businessLine + channel)
 */
export interface BatchJobItem {
  /** Internal item ID within the batch. */
  id:            string;
  /** SKU of the product in this slot. */
  sku?:          string;
  /** Front reference image URL already uploaded to R2. */
  frontImageUrl: string;
  backImageUrl?: string;
  /** Per-item overrides. When absent, batch defaults apply. */
  productCategory?: ProductCategory;
  garmentType?:     GarmentType;
  /** Item-level notes for the AI prompt. */
  promptNotes?:     string;
  /** Execution state of this individual item. */
  state:         "pending" | "running" | "done" | "failed" | "skipped";
  /** ID of the GeneratedAsset (or future LibraryAsset) produced for this item. */
  assetId?:      string;
  error?:        string;
}

export type BatchJobStatus =
  | "building"     // user is adding items to the queue
  | "queued"       // submitted, waiting for execution slot
  | "running"      // generation in progress
  | "review"       // all items generated, awaiting batch approval
  | "approved"     // batch approved, assets in Biblioteca
  | "partial"      // some items failed, others succeeded
  | "failed"       // entire batch failed
  | "archived";    // batch retired

export interface BatchGenerationJob {
  id:           string;
  tenantId:     string;
  /** Human name for this batch: e.g. "Regreso a Clases 2026 — Latin Kids" */
  name:         string;
  status:       BatchJobStatus;

  // ── Shared context (applied to all items unless overridden) ────────────────
  businessLine:  MarketingBusinessLine;
  retailSeason:  RetailSeason;
  /** Which channels these assets are cleared for across the batch. */
  channels:      AssetChannel[];
  /** Global preset ID from the preset registry. */
  presetId:      string;
  /** Brand line default for the batch. */
  brandLine:     string;

  // ── Items ──────────────────────────────────────────────────────────────────
  items:         BatchJobItem[];

  // ── Stats ─────────────────────────────────────────────────────────────────
  totalItems:    number;
  doneItems:     number;
  failedItems:   number;

  // ── Timestamps ─────────────────────────────────────────────────────────────
  createdAt:     string;   // ISO
  updatedAt:     string;   // ISO
  completedAt?:  string;   // ISO
}

// ── Catalog query foundations ──────────────────────────────────────────────────
// Sprint MS-05+ will build the catalog compiler. This defines the query contract.

/**
 * CatalogQuery — specification for building a dynamic catalog from Biblioteca assets.
 *
 * A catalog query selects a subset of approved MarketingAssets and composes
 * them into an ordered catalog document (PDF, web page, or channel export).
 *
 * Future examples:
 *   { productCategory: "ropa_nino", retailSeason: "regreso_clases", channels: ["catalog"] }
 *   → builds a back-to-school kids clothing catalog
 *
 *   { businessLine: "latin_kids", status: "approved", channels: ["shopify"] }
 *   → builds a Shopify upload queue for Latin Kids
 */
export interface CatalogQuery {
  id?:             string;
  tenantId:        string;
  /** Human name for this catalog: "Mayoristas Q3 2026", "Regreso a Clases niño" */
  name:            string;

  // ── Filters ────────────────────────────────────────────────────────────────
  assetTypes?:     AssetType[];
  status?:         AssetStatus;   // default: "approved"
  businessLine?:   MarketingBusinessLine;
  productCategory?: ProductCategory;
  garmentType?:    GarmentType;
  retailSeason?:   RetailSeason;
  channels?:       AssetChannel[];
  tags?:           string[];
  skus?:           string[];

  // ── Ordering ───────────────────────────────────────────────────────────────
  sortBy?:         "createdAt" | "approvedAt" | "sku" | "usageCount";
  sortDir?:        "asc" | "desc";
  limit?:          number;

  // ── Output spec ────────────────────────────────────────────────────────────
  /** Target format for the compiled catalog. "json" = raw asset list. */
  outputFormat?:   "json" | "pdf" | "html" | "shopify_batch" | "csv";
  /** Number of products per page in PDF/HTML output. */
  itemsPerPage?:   number;
}

// ── Search / filter foundations ────────────────────────────────────────────────

/**
 * LibrarySearchFilter — parameters for querying the Biblioteca asset index.
 *
 * Used by the Biblioteca UI, Pauta IA agent, and catalog compiler.
 * All fields are optional — an empty filter returns all assets for the tenant.
 */
export interface LibrarySearchFilter {
  tenantId?:        string;

  // ── Text search ────────────────────────────────────────────────────────────
  /** Full-text query against name, description, tags, and SKU. */
  q?:               string;

  // ── Type filters ───────────────────────────────────────────────────────────
  assetTypes?:      AssetType[];
  statuses?:        AssetStatus[];
  origins?:         AssetOrigin[];

  // ── Taxonomy ───────────────────────────────────────────────────────────────
  productCategories?: ProductCategory[];
  garmentTypes?:      GarmentType[];
  businessLines?:     MarketingBusinessLine[];
  retailSeasons?:     RetailSeason[];

  // ── Product reference ──────────────────────────────────────────────────────
  sku?:             string;
  skus?:            string[];
  tags?:            string[];

  // ── Channel routing ────────────────────────────────────────────────────────
  channels?:        AssetChannel[];

  // ── Approval window ────────────────────────────────────────────────────────
  approvedAfter?:   string;   // ISO
  approvedBefore?:  string;   // ISO
  createdAfter?:    string;   // ISO
  createdBefore?:   string;   // ISO

  // ── Pagination ─────────────────────────────────────────────────────────────
  limit?:           number;
  offset?:          number;
  sortBy?:          "createdAt" | "approvedAt" | "usageCount" | "name";
  sortDir?:         "asc" | "desc";
}

/**
 * LibrarySearchResult — paginated result from a Biblioteca query.
 */
export interface LibrarySearchResult {
  assets:     MarketingAsset[];
  total:      number;
  limit:      number;
  offset:     number;
  hasMore:    boolean;
}

// ── Duplicate / derivative strategy ───────────────────────────────────────────

/**
 * AssetDuplicateRecord — tracks derivation and duplication relationships.
 *
 * When an asset is resized, recomposed, or re-exported for a different channel,
 * the resulting asset records this as a derivative of the source.
 *
 * Future sprint will add AI-based perceptual hash comparison for automatic
 * duplicate detection across batches.
 */
export type DuplicateRelationType =
  | "variant"       // same content, different dimensions/format
  | "derivative"    // new composition based on source
  | "manual_copy"   // operator explicitly duplicated for another channel
  | "ai_candidate"; // AI flagged as visually similar (not yet confirmed)

export interface AssetDuplicateRecord {
  id:             string;
  sourceAssetId:  string;
  derivedAssetId: string;
  relation:       DuplicateRelationType;
  /** Confidence score when relation = "ai_candidate" (0–1). */
  confidence?:    number;
  /** ISO timestamp of when this relation was established. */
  detectedAt:     string;
  /** Operator who confirmed the relation (for manual_copy / confirmed duplicates). */
  confirmedBy?:   string;
}

// ── Storage profile (R2 lifecycle hints) ──────────────────────────────────────

/**
 * AssetStorageProfile — R2 lifecycle management structure.
 *
 * Defines how the original file, optimized versions, variants, and thumbnails
 * are organized in the R2 bucket, and when they should be cleaned up.
 *
 * Naming convention:
 *   {tenantId}/assets/{assetId}/original.{ext}
 *   {tenantId}/assets/{assetId}/optimized.webp
 *   {tenantId}/assets/{assetId}/variants/{variantId}.{ext}
 *   {tenantId}/assets/{assetId}/thumb_240.webp
 *
 * Lifecycle rules (future R2 lifecycle policy):
 *   - drafts older than 30 days → delete
 *   - rejected assets → delete after 90 days
 *   - archived assets → move to cold storage after 180 days
 *   - active approved assets → no expiry, CDN-cached
 */
export interface AssetStorageSlot {
  /** R2 object key for this storage slot. */
  key:       string;
  /** CDN URL (Cloudflare R2 public URL or signed URL). */
  url?:      string;
  /** Purpose of this slot. */
  purpose:   "original" | "optimized" | "variant" | "thumbnail";
  format:    string;
  sizeBytes?: number;
}

export interface AssetStorageProfile {
  assetId:  string;
  tenantId: string;
  slots:    AssetStorageSlot[];
  /** Total storage used across all slots in bytes. */
  totalBytes: number;
  /** ISO timestamp of last storage profile update. */
  updatedAt:  string;
}
