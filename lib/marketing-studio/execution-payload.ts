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
  /** Pre-rendered copy body — skips generation for text assets where we already have the value */
  content?:  string;
  /**
   * Reference image URL for img2img generation (front or back source photo).
   * Set for front_clean (frontImageUrl) and back_clean (backImageUrl) assets.
   */
  sourceImageUrl?: string;
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
  selectedOutputs?:   string[];
  visualStyle?:       string;
  background?:        string;
  aspectRatio?:       string;
  quantity?:          number;

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
    id:              string;
    assetType:       OutputAssetType;
    prompt?:         string;
    content?:        string;
    sourceImageUrl?: string;
    angle?:          "front" | "back";
  }>,
): AssetGenerationRequest[] {
  return assets.map(({ id, assetType, prompt, content, sourceImageUrl, angle }) => ({
    assetId: id,
    assetType,
    prompt,
    content,
    sourceImageUrl,
    angle,
  }));
}
