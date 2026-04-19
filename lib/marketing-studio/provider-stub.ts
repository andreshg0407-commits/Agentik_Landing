/**
 * lib/marketing-studio/provider-stub.ts
 *
 * Clear provider interfaces for generation and publishing.
 *
 * ── Purpose ───────────────────────────────────────────────────────────────────
 *
 *   These interfaces define the boundary between Agentik's orchestration layer
 *   and the external generation/publishing providers (Replicate, Runway, Shopify,
 *   TikTok, Instagram, etc.).
 *
 *   All providers here are STUBBED — they do NOT make real API calls.
 *   Real implementations live in future provider adapters keyed by OutputAssetType.
 *
 * ── Swap path ────────────────────────────────────────────────────────────────
 *
 *   Create a new class implementing GenerationProvider or PublishProvider,
 *   then register it in getGenerationProvider() / getPublishProvider() below.
 */

import type { OutputAssetType } from "./guided-flow";

// ── Generation provider ───────────────────────────────────────────────────────

export interface GenerationRequest {
  assetId:   string;
  assetType: OutputAssetType;
  prompt:    string;
  sessionId: string;
  tenantId:  string;
}

export interface GenerationResult {
  /** Opaque job ID for polling / callback correlation */
  jobId:    string;
  stubbed:  boolean;
}

/**
 * Contract for a visual/text asset generation provider.
 * Called per-asset by the executor — NOT by n8n directly.
 */
export interface GenerationProvider {
  readonly name: string;
  /**
   * Enqueue a generation job.
   * Returns immediately with a job ID; asset is ready when callback fires.
   */
  requestGeneration(req: GenerationRequest): Promise<GenerationResult>;
}

// ── Publish provider ──────────────────────────────────────────────────────────

export interface PublishRequest {
  assetId:      string;
  assetType:    OutputAssetType;
  assetUrl?:    string;
  content?:     string;
  sessionId:    string;
  tenantId:     string;
  /** Target channel — tiktok | instagram | shopify | catalog */
  channel:      string;
}

export interface PublishResult {
  /** External platform reference — Shopify draft ID, Luca job ID, etc. */
  externalRef: string;
  stubbed:     boolean;
}

/**
 * Contract for publishing a ready asset to an external platform.
 */
export interface PublishProvider {
  readonly name: string;
  publishAsset(req: PublishRequest): Promise<PublishResult>;
}

// ── Stub implementations ──────────────────────────────────────────────────────

export class StubGenerationProvider implements GenerationProvider {
  readonly name = "stub-generation";

  async requestGeneration(req: GenerationRequest): Promise<GenerationResult> {
    const jobId = `gen_stub_${req.assetId}_${Date.now().toString(36)}`;
    console.info("[StubGenerationProvider] requestGeneration", {
      assetId:   req.assetId,
      assetType: req.assetType,
      sessionId: req.sessionId,
      jobId,
    });
    return { jobId, stubbed: true };
  }
}

export class StubPublishProvider implements PublishProvider {
  readonly name = "stub-publish";

  async publishAsset(req: PublishRequest): Promise<PublishResult> {
    const externalRef = `${req.channel}_stub_${req.assetId}_${Date.now().toString(36)}`;
    console.info("[StubPublishProvider] publishAsset", {
      assetId:     req.assetId,
      channel:     req.channel,
      sessionId:   req.sessionId,
      externalRef,
    });
    return { externalRef, stubbed: true };
  }
}

// ── Provider factories ────────────────────────────────────────────────────────

/**
 * Returns the generation provider for a given asset type.
 * All return the stub until real adapters are wired.
 */
export function getGenerationProvider(
  _assetType: OutputAssetType,
): GenerationProvider {
  // TODO(sprint-providers): switch on assetType to return real adapters
  // e.g. "product_photo" | "social_image" | "social_video" → Replicate/Runway adapter
  return new StubGenerationProvider();
}

/**
 * Returns the publish provider for a given channel.
 */
export function getPublishProvider(
  _channel: string,
): PublishProvider {
  // TODO(sprint-providers): switch on channel to return real adapters
  // e.g. "shopify" → ShopifyPublishProvider, "tiktok" → LucaPublishProvider
  return new StubPublishProvider();
}
