/**
 * lib/marketing-studio/execution-payload.ts
 *
 * Canonical execution payload schema for the Marketing Studio → n8n contract.
 *
 * ── Boundary rule ─────────────────────────────────────────────────────────────
 *
 *   This file defines WHAT we send to n8n (or any future executor).
 *   It does NOT know HOW n8n processes it.
 *   It does NOT know which external provider (Replicate, Runway, Shopify) runs the job.
 *
 * ── Payload flow ──────────────────────────────────────────────────────────────
 *
 *   StudioSession (DB) + ResolvedWorkflow
 *     → buildExecutionPayload()           (this file)
 *     → N8nWebhookPayload
 *     → n8n-executor.ts → POST to n8n webhook (stubbed)
 *     → GeneratedAsset rows updated by inbound callback
 */

import type {
  GarmentFingerprint,
  GarmentDetailLocks,
  PhotoPreset,
  FidelityMode,
  SocialPlatform,
  ContentObjective,
  ContentTone,
} from "./types";
import type { UserObjective, OutputAssetType, ResolvedWorkflow } from "./guided-flow";

// ── Per-asset generation spec ─────────────────────────────────────────────────

/**
 * Describes a single asset to generate within an execution run.
 * The executor resolves the right provider per assetType.
 */
export interface AssetGenerationRequest {
  /** Matches GeneratedAsset.id — correlates callback to DB row */
  assetId:   string;
  assetType: OutputAssetType;
  /**
   * Free-form prompt / spec forwarded verbatim to the generation provider.
   * Built by buildGenerativePrompt() for visual assets; text spec for copy/hashtags.
   */
  prompt?:   string;
  /**
   * Negative prompt forwarded to the generation provider when supported.
   * Used to suppress mannequins, isolated products, fake legs, etc.
   */
  negativePrompt?: string;
  /**
   * Hint for n8n about which Replicate model to use for this specific asset.
   * n8n workflow should prefer this over its default when present.
   * Examples: "black-forest-labs/flux-kontext-pro", "cuuupid/idm-vton"
   */
  replicateModelId?: string;
  /**
   * Per-asset fidelity requirement.
   * "strict"   → catalog outputs (front_clean, back_clean, product_photo):
   *              maximum garment preservation, high guidance_scale, zero hallucination.
   * "standard" → social outputs (social_image, social_video):
   *              more creative freedom, lower guidance_scale, lifestyle energy.
   * n8n uses this to adjust Replicate parameters (guidance_scale, strength, steps).
   */
  fidelityMode?: "strict" | "standard";
  /** Pre-rendered copy body — skips generation for text assets where we already have the value */
  content?:  string;
  /**
   * Reference image URL for img2img generation (front or back source photo).
   * Set for front_clean (frontImageUrl) and back_clean (backImageUrl) assets.
   * Used in standard mode (single-image flux-kontext-pro).
   */
  sourceImageUrl?: string;
  /**
   * Multi-reference image URLs for strict catalog mode.
   * Passed as `input_images` array to flux-kontext-apps/multi-image-list.
   * Order: [front, back, detail1, detail2] — empty strings excluded.
   * When present, takes precedence over sourceImageUrl.
   */
  sourceImages?: string[];
  /** Angle hint for the generation provider — "front" or "back" */
  angle?: "front" | "back";
}

// ── Core execution payload ────────────────────────────────────────────────────

/**
 * Fully self-contained payload describing a Marketing Studio generation run.
 * Consumed by the executor (n8n or future alternative) — no DB access needed on the executor side.
 */
export interface StudioExecutionPayload {
  // ── Identity ──────────────────────────────────────────────────────────────
  sessionId:     string;
  organizationId: string;
  tenantId:      string;
  requestId:     string;   // newRequestId() from intake-schema

  // ── Workflow plan (guided_workflow path only) ─────────────────────────────
  /** Required when mode="guided_workflow". Absent for mode="foto_estudio". */
  objective?:         UserObjective;
  /** Required when mode="guided_workflow". Absent for mode="foto_estudio". */
  workflow?:          ResolvedWorkflow;

  // ── Garment context (guided_workflow path only) ───────────────────────────
  /** Required when mode="guided_workflow". Absent for mode="foto_estudio". */
  garment?:           GarmentFingerprint;
  /** Defaults to "standard" for foto_estudio. */
  fidelityMode?:      FidelityMode;

  // ── Preset (guided_workflow path only) ────────────────────────────────────
  /** Required when mode="guided_workflow". Absent for mode="foto_estudio". */
  preset?:            PhotoPreset;

  // ── Content config ────────────────────────────────────────────────────────
  targetPlatforms?:   SocialPlatform[];
  contentObjective?:  ContentObjective;
  contentTone?:       ContentTone;
  locale:             string;

  // ── Foto Estudio settings (foto_estudio path only) ────────────────────────
  selectedOutputs?:        string[];
  visualStyle?:            string;
  background?:             string;
  aspectRatio?:            string;
  quantity?:               number;
  /** Type of garment: jean, short, falda, body, top, chaqueta, vestido, otro */
  garmentType?:            string;
  /** Brand line: luxury (curvy latina, levanta cola) | casual (urban, relaxed) */
  brandLine?:              string;
  /** For social_photo: feed | reel | story — drives framing and composition */
  socialPublicationType?:  string;
  /** Reference image URL for custom_template — style is matched from this */
  referenceImageUrl?:      string;
  /** Optional model reference photo URL — used when modelType = "personalizada" */
  modelReferenceUrl?:      string;
  /** Model ethnicity/look profile: latina_rubia | latina_morena | ... */
  modelType?:              string;
  /** Model body shape: slim | curvy | voluptuosa | atletica | plus_size | petite | personalizada */
  bodyType?:               string;
  /** Output resolution tier: standard_hd | full_hd | 2k_editorial | 4k_premium */
  visualQuality?:          string;
  /** Shot framing: frontal_catalogo | americano | full_body_editorial | ... */
  framingType?:            string;

  // ── Mode discriminator ────────────────────────────────────────────────────
  /**
   * Identifies the entry path that produced this payload.
   * "guided_workflow" = full 5-step wizard (Do Jeans / multi-tenant).
   * "foto_estudio"    = simplified 4-step photo studio wizard.
   * n8n uses this to decide which branch of the workflow to execute.
   */
  mode:               "guided_workflow" | "foto_estudio";

  // ── Source image references ───────────────────────────────────────────────
  /**
   * Operator-supplied front reference image URL.
   * Required for front_clean asset generation.
   */
  frontImageUrl?:     string;
  /**
   * Operator-supplied back reference image URL.
   * When absent, back_clean asset row is created but generation is skipped.
   */
  backImageUrl?:      string;
  /** Additional product detail angle (3rd image). Foto Estudio only. */
  detail1Url?:        string;
  /** Additional product detail angle (4th image). Foto Estudio only. */
  detail2Url?:        string;

  // ── Strict jeans detail locks ──────────────────────────────────────────────
  /**
   * Non-negotiable garment attributes forwarded verbatim to the generator.
   * Present for tenantId="do-jeans" + fidelityMode="strict" + category="jeans".
   */
  detailLocks?:       GarmentDetailLocks;

  // ── Visual format (Castillitos catalog) ───────────────────────────────────
  /**
   * Canvas specification for Castillitos retail catalog generation.
   * When present the generate route injects canvas/composition instructions
   * into the prompt and n8n can apply pixel-exact output sizing.
   * Absent for non-retail tenants (Do Jeans uses aspectRatio instead).
   */
  visualFormat?: import("./visual-format-types").VisualFormat;

  // ── Shopify draft flag ─────────────────────────────────────────────────────
  /**
   * When true the executor should deliver a Shopify-ready product draft alongside
   * the generated assets.  Set by buildShopifyDraft() in shopify-draft-builder.ts.
   */
  draftShopify:       boolean;

  // ── Assets to generate ────────────────────────────────────────────────────
  /** One entry per GeneratedAsset row created before the payload is dispatched */
  assets:             AssetGenerationRequest[];

  // ── Callback URL ──────────────────────────────────────────────────────────
  /**
   * POST target for the executor to send per-asset status updates.
   * Format: POST /api/orgs/{orgSlug}/marketing-studio/sessions/{sessionId}/callback
   * Body: { assetId, status, assetUrl?, content?, externalRef? }
   */
  callbackUrl:        string;

  // ── Metadata ──────────────────────────────────────────────────────────────
  schemaVersion:      "1.0";
  createdAt:          string;  // ISO
}

// ── n8n webhook wrapper ───────────────────────────────────────────────────────

/**
 * Envelope sent to the n8n webhook endpoint.
 *
 * n8n receives this at its trigger node; the workflow reads `payload` to fan out
 * per-asset generation branches.
 *
 * Authentication: Bearer token from STUDIO_N8N_WEBHOOK_SECRET env var.
 * NOT hardcoded here — the executor reads it at call time.
 */
export interface N8nWebhookPayload {
  /** Agentik routing — tells n8n which workflow template to load */
  workflowKey:   "marketing-studio-v1";
  /** Full execution payload — forwarded verbatim to generation branches */
  payload:       StudioExecutionPayload;
  /** ISO timestamp — n8n uses this for idempotency dedup */
  sentAt:        string;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Assembles the N8nWebhookPayload from the resolved session state.
 *
 * @param core        - StudioExecutionPayload without the envelope
 * @returns           - Ready-to-dispatch N8nWebhookPayload
 */
export function buildN8nWebhookPayload(
  core: StudioExecutionPayload,
): N8nWebhookPayload {
  return {
    workflowKey: "marketing-studio-v1",
    payload:     core,
    sentAt:      new Date().toISOString(),
  };
}

/**
 * Constructs the per-asset AssetGenerationRequest list from DB asset IDs.
 * Text assets (copy_caption, hashtags) may carry pre-built content to skip generation.
 */
export function buildAssetRequests(
  assets: Array<{
    id:                string;
    assetType:         OutputAssetType;
    prompt?:           string;
    negativePrompt?:   string;
    replicateModelId?: string;
    content?:          string;
    sourceImageUrl?:   string;
    sourceImages?:     string[];
    angle?:            "front" | "back";
  }>,
): AssetGenerationRequest[] {
  return assets.map(({ id, assetType, prompt, negativePrompt, replicateModelId, content, sourceImageUrl, sourceImages, angle }) => ({
    assetId: id,
    assetType,
    prompt,
    negativePrompt,
    replicateModelId,
    content,
    sourceImageUrl,
    sourceImages,
    angle,
  }));
}
