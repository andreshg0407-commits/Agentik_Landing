/**
 * lib/marketing-studio/library/operations/studio-session.ts
 *
 * MARKETING-STUDIO-LIBRARY-OPS — Sprint MS-02
 *
 * Bridge between Foto Estudio (generation layer) and Biblioteca (asset layer).
 *
 * ── FLOW ──────────────────────────────────────────────────────────────────────
 *
 *   FotoEstudioWizard
 *     → StudioSession (DB: guided-flow.ts)
 *     → GeneratedAsset[] (DB: asset-service.ts)
 *     → [operator reviews in wizard]
 *     → approved assets promoted to Biblioteca (LibraryAsset — sprint MS-DB)
 *
 * ── RULE ──────────────────────────────────────────────────────────────────────
 *
 *   GeneratedAsset ≠ LibraryAsset.
 *
 *   GeneratedAsset is the raw output of a generation run.
 *   LibraryAsset is the curated, approved, channel-ready record in the Biblioteca.
 *
 *   The promotion step (GeneratedAsset → LibraryAsset) is where:
 *     - metadata is validated
 *     - channels are assigned
 *     - lifecycle begins at "generated" or "approved" (auto-approve presets)
 *     - session attribution is recorded
 *
 * ── TRACEABILITY ──────────────────────────────────────────────────────────────
 *
 *   Every MarketingAsset in the Biblioteca carries a StudioSessionReference
 *   so operators can always trace back:
 *     asset → session → original photos → tenant → batch (if applicable)
 */

import type { MarketingAsset, AssetType, AssetChannel } from "../types";
import type { AssetStatus }                              from "../types";

// ── Session reference ──────────────────────────────────────────────────────────

/**
 * StudioSessionReference — attribution record stored in every library asset
 * that originated from the Foto Estudio wizard.
 *
 * Stored in MarketingAsset.metadata.sessionRef.
 */
export interface StudioSessionReference {
  /** StudioSession.id from the wizard run. */
  sessionId:        string;
  /**
   * GenerationIntent that produced this asset.
   * "product_photo" | "social_photo" | "social_video" | "creative_template"
   */
  generationIntent: string;
  /** userId of the operator who ran the session. */
  createdBy:        string;
  /** ISO timestamp when the session was created. */
  createdAt:        string;
  /** BatchGenerationJob.id — set when this session was part of a batch. */
  batchJobId?:      string;
  /** CDN URLs of the source product images used as generation input. */
  sourceImages?:    string[];
  /** IDs of all GeneratedAsset rows produced in this session. */
  outputs:          string[];
  /** The preset ID used for this generation run. */
  presetId?:        string;
  /** PromptEngine key that built the AI prompt: "kids_product" | "fashion_adult" | "generic" */
  promptEngine?:    string;
}

// ── Session context snapshot ───────────────────────────────────────────────────

/**
 * SessionContext — the visual / commercial settings snapshot at generation time.
 *
 * Stored alongside StudioSessionReference so operators can reproduce or understand
 * why the AI made the choices it did.
 *
 * Mirrors the fields of FotoEstudioSettings that are relevant for library audit.
 */
export interface SessionContext {
  visualStyle?:         string;
  background?:          string;
  brandLine?:           string;
  productCategory?:     string;
  garmentType?:         string;
  sku?:                 string;
  aspectRatio?:         string;
  visualQuality?:       string;
  framingType?:         string;
  // Kids profile (Castillitos)
  kidsModelType?:       string;
  kidsAgeRange?:        string;
  kidsVisualStyle?:     string;
  // Social context
  socialChannel?:       string;
  socialPubType?:       string;
  // Video context
  videoDuration?:       string;
  videoType?:           string;
  // Template context
  pieceType?:           string;
}

// ── Promotion record ───────────────────────────────────────────────────────────

/**
 * AssetPromotionRequest — the input to promote a GeneratedAsset into the Biblioteca.
 *
 * Called when an operator clicks "Guardar en Biblioteca" from the wizard result step.
 * One request per approved GeneratedAsset.
 *
 * Future: called automatically by batch approval flow (sprint MS-04).
 */
export interface AssetPromotionRequest {
  /** GeneratedAsset.id from the Foto Estudio run. */
  generatedAssetId: string;
  /** Full session reference for attribution. */
  sessionRef:       StudioSessionReference;
  /** Settings snapshot at generation time. */
  sessionContext?:  SessionContext;
  /** Which channels this asset should be cleared for in the Biblioteca. */
  channels:         AssetChannel[];
  /** Override asset type — defaults to inferred from generatedAsset.assetType. */
  assetType?:       AssetType;
  /** Override name — defaults to buildAssetDisplayName() result. */
  name?:            string;
  /** Tags to pre-populate (operator can add more in Biblioteca later). */
  tags?:            string[];
  /**
   * The initial lifecycle status for the promoted asset.
   * "generated"  → requires operator review in Biblioteca
   * "approved"   → preset is in auto-approve list, skips review
   */
  initialStatus?:   AssetStatus;
}

/**
 * AssetPromotionResult — the outcome of a promotion request.
 */
export interface AssetPromotionResult {
  /** Whether the promotion succeeded. */
  success:      boolean;
  /**
   * The ID of the new LibraryAsset (future Prisma model).
   * Matches the promoted GeneratedAsset.id for now (pre-MS-DB migration).
   */
  assetId?:     string;
  /** Whether the asset was deduplicated — a matching asset already exists. */
  deduplicated: boolean;
  /** ID of the existing asset if deduplication was triggered. */
  duplicateOf?: string;
  error?:       string;
  warnings?:    string[];
}

// ── Batch session summary ──────────────────────────────────────────────────────

/**
 * BatchSessionSummary — aggregate view of all sessions in a batch job.
 *
 * Used by the batch review UI (sprint MS-04) to show progress and
 * allow bulk approval of all generated assets.
 */
export interface BatchSessionSummary {
  batchJobId:       string;
  tenantId:         string;
  totalSessions:    number;
  completedSessions: number;
  failedSessions:   number;
  pendingReview:    number;
  approvedCount:    number;
  promotedAssets:   string[];   // LibraryAsset IDs already in Biblioteca
  createdAt:        string;
  completedAt?:     string;
}

// ── Helper: infer asset type from generation output ───────────────────────────

const GENERATION_ASSET_TYPE_MAP: Record<string, AssetType> = {
  front_clean:   "product_photo",
  back_clean:    "product_photo",
  product_photo: "product_photo",
  social_image:  "lifestyle_photo",
  social_video:  "short_video",
};

/**
 * inferAssetType — maps a GeneratedAsset.assetType string to the Biblioteca AssetType.
 * Falls back to "product_photo" for unknown types.
 */
export function inferAssetType(generatedAssetType: string): AssetType {
  return GENERATION_ASSET_TYPE_MAP[generatedAssetType] ?? "product_photo";
}

/**
 * buildSessionReference — constructs a StudioSessionReference from raw wizard data.
 */
export function buildSessionReference(params: {
  sessionId:        string;
  generationIntent: string;
  createdBy:        string;
  createdAt:        string;
  assetIds:         string[];
  batchJobId?:      string;
  sourceImages?:    string[];
  presetId?:        string;
  promptEngine?:    string;
}): StudioSessionReference {
  return {
    sessionId:        params.sessionId,
    generationIntent: params.generationIntent,
    createdBy:        params.createdBy,
    createdAt:        params.createdAt,
    outputs:          params.assetIds,
    batchJobId:       params.batchJobId,
    sourceImages:     params.sourceImages,
    presetId:         params.presetId,
    promptEngine:     params.promptEngine,
  };
}
