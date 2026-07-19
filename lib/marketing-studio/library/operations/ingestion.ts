/**
 * lib/marketing-studio/library/operations/ingestion.ts
 *
 * MARKETING-STUDIO-LIBRARY-OPS — Sprint MS-02
 *
 * Asset ingestion pipeline — how assets enter the Biblioteca.
 *
 * ── RULE ──────────────────────────────────────────────────────────────────────
 *
 *   "Every asset that enters the Biblioteca must pass through the ingestion
 *    pipeline — regardless of source."
 *
 *   No direct Prisma writes to MarketingAsset from external systems.
 *   All writes go through: IngestionRequest → pipeline → MarketingAsset record.
 *
 * ── INGESTION SOURCES ─────────────────────────────────────────────────────────
 *
 *   foto_estudio       — output of the FotoEstudioWizard AI generation run
 *   manual_upload      — operator uploads a file directly through the Biblioteca UI
 *   shopify_import     — assets pulled from an existing Shopify store
 *   crm_import         — assets from Mila / WhatsApp conversation history
 *   batch_generation   — bulk AI generation via BatchGenerationJob
 *   external_provider  — stock photography, design agency, supplier catalog
 *
 * ── PIPELINE STAGES ───────────────────────────────────────────────────────────
 *
 *   1. VALIDATE     — required fields present, file accessible, size within limits
 *   2. DEDUPLICATE  — perceptual hash lookup → skip if match above threshold
 *   3. CLASSIFY     — infer assetType, channels, tags from source metadata
 *   4. NORMALIZE    — standard naming, metadata merging, relation attachment
 *   5. PERSIST      — write MarketingAsset record (sprint MS-API / MS-DB)
 *   6. INDEX        — update search index and relation graph
 *
 * ── MULTI-TENANT ─────────────────────────────────────────────────────────────
 *
 *   Every ingestion request is scoped to one tenantId.
 *   Tenant isolation is enforced at the pipeline level — not just at query time.
 *   Cross-tenant ingestion is PROHIBITED.
 */

import type { AssetType, AssetChannel, AssetOrigin, AssetRelation } from "../types";
import type { AssetStatus }                                           from "../types";

// ── Ingestion source ───────────────────────────────────────────────────────────

/**
 * IngestionSource — where the asset originated.
 */
export type IngestionSource =
  | "foto_estudio"       // FotoEstudio wizard AI generation
  | "manual_upload"      // direct operator upload through Biblioteca UI
  | "shopify_import"     // imported from Shopify product images
  | "crm_import"         // imported from Mila / CRM asset library
  | "batch_generation"   // bulk AI generation via BatchGenerationJob
  | "external_provider"; // external stock / agency / supplier

// ── Source metadata per type ───────────────────────────────────────────────────

/**
 * FotoEstudioIngestionMeta — metadata specific to Foto Estudio ingestion.
 * Carries the full session context for traceability.
 */
export interface FotoEstudioIngestionMeta {
  source:           "foto_estudio";
  sessionId:        string;
  generatedAssetId: string;
  presetId?:        string;
  promptEngine?:    string;
  generationIntent: string;
  batchJobId?:      string;
  sourceImages?:    string[];
}

/**
 * ManualUploadIngestionMeta — metadata for direct uploads.
 */
export interface ManualUploadIngestionMeta {
  source:         "manual_upload";
  /** Original file name from the upload. */
  originalName:   string;
  /** MIME type reported by the browser/client. */
  mimeType:       string;
  /** File size in bytes. */
  fileSize:       number;
  /** Upload session or request ID for traceability. */
  uploadSessionId?: string;
}

/**
 * ShopifyImportIngestionMeta — metadata for Shopify-sourced assets.
 */
export interface ShopifyImportIngestionMeta {
  source:             "shopify_import";
  shopifyProductId:   string;
  shopifyVariantId?:  string;
  shopifyImageId:     string;
  shopifyProductTitle: string;
  shopifyHandle?:     string;
  position?:          number;   // image position in Shopify product gallery
}

/**
 * CrmImportIngestionMeta — metadata for Mila / CRM sourced assets.
 */
export interface CrmImportIngestionMeta {
  source:            "crm_import";
  crmConversationId?: string;
  crmMessageId?:     string;
  contactId?:        string;
  importedFrom:      "whatsapp" | "email" | "crm_gallery";
}

/**
 * BatchGenerationIngestionMeta — metadata for batch-generated assets.
 */
export interface BatchGenerationIngestionMeta {
  source:           "batch_generation";
  batchJobId:       string;
  batchItemId:      string;
  sessionId?:       string;
  presetId?:        string;
  productRef?:      string;
}

/**
 * ExternalProviderIngestionMeta — metadata for external / agency assets.
 */
export interface ExternalProviderIngestionMeta {
  source:           "external_provider";
  providerName:     string;
  providerAssetId?: string;
  licenseType?:     "royalty_free" | "editorial" | "exclusive" | "creative_commons";
  licenseExpiry?:   string;
  attribution?:     string;
}

/**
 * IngestionSourceMeta — discriminated union of all source-specific metadata.
 */
export type IngestionSourceMeta =
  | FotoEstudioIngestionMeta
  | ManualUploadIngestionMeta
  | ShopifyImportIngestionMeta
  | CrmImportIngestionMeta
  | BatchGenerationIngestionMeta
  | ExternalProviderIngestionMeta;

// ── Ingestion request ─────────────────────────────────────────────────────────

/**
 * IngestionRequest — the input to the asset ingestion pipeline.
 *
 * Everything needed to create a MarketingAsset record in the Biblioteca.
 * Submitted by the API layer (Foto Estudio wizard, manual upload endpoint, batch pipeline).
 */
export interface IngestionRequest {
  /** Tenant isolation — required. */
  tenantId:         string;
  /** UserId of the operator or system submitting this asset. */
  submittedBy:      string;
  /** ISO timestamp of submission. */
  submittedAt:      string;

  // ── Asset content ──────────────────────────────────────────────────────────

  /** Public URL or CDN URL of the asset file. */
  fileUrl:          string;
  /** MIME type of the file. */
  mimeType:         string;
  /** File size in bytes. */
  fileSize?:        number;
  /** Width in pixels (for images/video). */
  width?:           number;
  /** Height in pixels (for images/video). */
  height?:          number;
  /** Duration in seconds (for video). */
  duration?:        number;
  /** Thumbnail URL (for video assets). */
  thumbnailUrl?:    string;

  // ── Asset classification ───────────────────────────────────────────────────

  /**
   * Explicit asset type override.
   * If not provided, the pipeline will attempt to infer from source metadata.
   */
  assetType?:       AssetType;
  /**
   * Channels this asset is pre-cleared for.
   * If not provided, channels will be inferred from the source and preset.
   */
  channels?:        AssetChannel[];
  /**
   * Tags to attach at ingestion time.
   * The pipeline may add additional AI-inferred tags.
   */
  tags?:            string[];
  /** Asset name override. If not set, buildAssetDisplayName() will generate one. */
  name?:            string;

  // ── Commercial context ─────────────────────────────────────────────────────

  productId?:       string;
  sku?:             string;
  productName?:     string;
  brandLine?:       string;
  businessLine?:    string;
  seasonTag?:       string;
  taxonomy?:        string[];

  // ── Source attribution ─────────────────────────────────────────────────────

  /** Source-specific metadata (discriminated union). */
  sourceMeta:       IngestionSourceMeta;
  /** Pre-built relations to attach immediately. */
  relations?:       AssetRelation[];

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Desired initial lifecycle status.
   * Pipeline may override (e.g. auto-approve preset → "approved").
   */
  desiredStatus?:   AssetStatus;

  // ── Pipeline control ──────────────────────────────────────────────────────

  /**
   * Skip deduplication check.
   * Use when the caller already knows this asset is unique (e.g. re-ingestion after file replace).
   */
  skipDeduplication?: boolean;
  /**
   * Skip AI classification.
   * Use when assetType, channels, and tags are fully provided by the caller.
   */
  skipClassification?: boolean;
}

// ── Ingestion result ──────────────────────────────────────────────────────────

/**
 * IngestionResult — the outcome of an ingestion pipeline run.
 *
 * Returned to the API layer after persistence.
 */
export interface IngestionResult {
  success:           boolean;
  /** The ID of the created or referenced MarketingAsset. */
  assetId?:          string;
  /** The final lifecycle status assigned to the asset. */
  finalStatus?:      AssetStatus;
  /**
   * Whether the asset was deduplicated — a matching asset already exists.
   * When true, assetId points to the existing asset.
   */
  deduplicated:      boolean;
  /** ID of the existing asset if deduplication was triggered. */
  duplicateOf?:      string;
  /** Deduplication confidence (0–1). Only set when deduplicated = true. */
  duplicateScore?:   number;
  /** Whether auto-approve was applied. */
  autoApproved:      boolean;
  /** Pipeline stages that were skipped. */
  skippedStages?:    IngestionStage[];
  /** Warnings from any pipeline stage. */
  warnings?:         string[];
  /** Error message if success = false. */
  error?:            string;
  /** ISO timestamp when ingestion completed. */
  completedAt:       string;
}

// ── Pipeline stage types ──────────────────────────────────────────────────────

/**
 * IngestionStage — the pipeline stages in order.
 */
export type IngestionStage =
  | "validate"
  | "deduplicate"
  | "classify"
  | "normalize"
  | "persist"
  | "index";

/**
 * IngestionStageResult — the outcome of a single pipeline stage.
 */
export interface IngestionStageResult {
  stage:     IngestionStage;
  success:   boolean;
  skipped:   boolean;
  durationMs?: number;
  warnings?: string[];
  error?:    string;
}

/**
 * IngestionPipelineTrace — full execution trace for a pipeline run.
 *
 * Used for debugging and audit — stored alongside the ingestion record.
 */
export interface IngestionPipelineTrace {
  requestId:   string;
  tenantId:    string;
  source:      IngestionSource;
  stages:      IngestionStageResult[];
  totalMs:     number;
  completedAt: string;
}

// ── Bulk ingestion ────────────────────────────────────────────────────────────

/**
 * BulkIngestionRequest — submit multiple assets in one call.
 *
 * Used by batch generation pipeline and Shopify import.
 * Each item is processed independently — partial success is allowed.
 */
export interface BulkIngestionRequest {
  tenantId:    string;
  submittedBy: string;
  items:       IngestionRequest[];
  /**
   * When true, abort the whole batch if any item fails validation.
   * When false (default), continue and report per-item errors.
   */
  abortOnError?: boolean;
}

/**
 * BulkIngestionResult — summary of a bulk ingestion run.
 */
export interface BulkIngestionResult {
  total:       number;
  succeeded:   number;
  deduplicated: number;
  failed:      number;
  autoApproved: number;
  results:     Array<{
    index:       number;   // position in original items array
    fileUrl:     string;
    result:      IngestionResult;
  }>;
  completedAt: string;
}

// ── Deduplication ─────────────────────────────────────────────────────────────

/**
 * DeduplicationResult — outcome of the deduplication check.
 *
 * The pipeline uses a perceptual hash (pHash) to detect near-duplicate images.
 * Threshold: score >= 0.95 = confirmed duplicate.
 */
export interface DeduplicationResult {
  isDuplicate:   boolean;
  existingId?:   string;
  score?:        number;     // 0–1, higher = more similar
  method:        "phash" | "url_exact" | "filename_exact" | "none";
}

// ── Classification ────────────────────────────────────────────────────────────

/**
 * ClassificationResult — inferred attributes from the asset file + source metadata.
 *
 * Produced by the classify stage.
 * Future: AI image classifier (clip, blip-2) for tag inference.
 */
export interface ClassificationResult {
  assetType:    AssetType;
  channels:     AssetChannel[];
  /** Inferred tags (AI or rule-based). */
  inferredTags: string[];
  /** Confidence score for assetType inference (0–1). */
  confidence?:  number;
  /** The origin mapped from source type. */
  origin:       AssetOrigin;
}

// ── Source → origin map ────────────────────────────────────────────────────────

/**
 * INGESTION_SOURCE_TO_ORIGIN — maps IngestionSource to AssetOrigin.
 * Used during the classify stage to set asset.origin.
 */
export const INGESTION_SOURCE_TO_ORIGIN: Record<IngestionSource, AssetOrigin> = {
  foto_estudio:      "ai_generated",
  manual_upload:     "manual_upload",
  shopify_import:    "shopify_import",
  crm_import:        "crm_import",
  batch_generation:  "ai_generated",
  external_provider: "external",
};

// ── Ingestion validation ───────────────────────────────────────────────────────

/**
 * IngestionValidationResult — outcome of the validate stage.
 */
export interface IngestionValidationResult {
  valid:     boolean;
  blockers:  string[];
  warnings:  string[];
}

/**
 * validateIngestionRequest — stage 1 validation.
 *
 * Checks the minimum required fields are present and within limits.
 * Does NOT fetch the file (that is done at the API/compiler layer).
 */
export function validateIngestionRequest(
  req: IngestionRequest,
): IngestionValidationResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!req.tenantId || req.tenantId.trim().length === 0) {
    blockers.push("tenantId es requerido.");
  }
  if (!req.submittedBy || req.submittedBy.trim().length === 0) {
    blockers.push("submittedBy es requerido.");
  }
  if (!req.fileUrl || req.fileUrl.trim().length === 0) {
    blockers.push("fileUrl es requerido.");
  }
  if (!req.mimeType || req.mimeType.trim().length === 0) {
    blockers.push("mimeType es requerido.");
  }
  if (!req.sourceMeta || !req.sourceMeta.source) {
    blockers.push("sourceMeta.source es requerido.");
  }
  if (req.fileSize !== undefined && req.fileSize > 200 * 1024 * 1024) {
    blockers.push("El archivo supera el límite máximo de 200 MB.");
  }
  if (!req.assetType && req.skipClassification) {
    warnings.push("skipClassification=true pero assetType no fue provisto. Se usará 'product_photo' como fallback.");
  }

  return { valid: blockers.length === 0, blockers, warnings };
}

// ── Ingestion request builders ─────────────────────────────────────────────────

/**
 * buildFotoEstudioIngestionRequest — convenience builder for Foto Estudio output.
 *
 * Called by the foto-estudio generate route after asset generation completes.
 */
export function buildFotoEstudioIngestionRequest(params: {
  tenantId:         string;
  submittedBy:      string;
  fileUrl:          string;
  mimeType:         string;
  sessionId:        string;
  generatedAssetId: string;
  generationIntent: string;
  presetId?:        string;
  promptEngine?:    string;
  batchJobId?:      string;
  sourceImages?:    string[];
  assetType?:       AssetType;
  channels?:        AssetChannel[];
  sku?:             string;
  productName?:     string;
  tags?:            string[];
  desiredStatus?:   AssetStatus;
}): IngestionRequest {
  return {
    tenantId:      params.tenantId,
    submittedBy:   params.submittedBy,
    submittedAt:   new Date().toISOString(),
    fileUrl:       params.fileUrl,
    mimeType:      params.mimeType,
    assetType:     params.assetType,
    channels:      params.channels,
    tags:          params.tags,
    sku:           params.sku,
    productName:   params.productName,
    desiredStatus: params.desiredStatus,
    sourceMeta: {
      source:           "foto_estudio",
      sessionId:        params.sessionId,
      generatedAssetId: params.generatedAssetId,
      generationIntent: params.generationIntent,
      presetId:         params.presetId,
      promptEngine:     params.promptEngine,
      batchJobId:       params.batchJobId,
      sourceImages:     params.sourceImages,
    },
  };
}

/**
 * buildManualUploadIngestionRequest — convenience builder for manual uploads.
 */
export function buildManualUploadIngestionRequest(params: {
  tenantId:       string;
  submittedBy:    string;
  fileUrl:        string;
  mimeType:       string;
  fileSize:       number;
  originalName:   string;
  assetType?:     AssetType;
  channels?:      AssetChannel[];
  tags?:          string[];
  name?:          string;
  uploadSessionId?: string;
}): IngestionRequest {
  return {
    tenantId:    params.tenantId,
    submittedBy: params.submittedBy,
    submittedAt: new Date().toISOString(),
    fileUrl:     params.fileUrl,
    mimeType:    params.mimeType,
    fileSize:    params.fileSize,
    assetType:   params.assetType,
    channels:    params.channels,
    tags:        params.tags,
    name:        params.name,
    sourceMeta: {
      source:         "manual_upload",
      originalName:   params.originalName,
      mimeType:       params.mimeType,
      fileSize:       params.fileSize,
      uploadSessionId: params.uploadSessionId,
    },
  };
}
