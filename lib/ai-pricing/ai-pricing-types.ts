/**
 * lib/ai-pricing/ai-pricing-types.ts
 *
 * Agentik — AI Pricing Engine — Core Pricing Types
 * Sprint: AGENTIK-AI-PRICING-ENGINE-01
 *
 * Shared input/filter types for pricing resolution.
 * Pure domain. No Prisma. No React. No server-only. Client-safe.
 */

import type { AiProviderId } from "./ai-provider-types";
import type { AiModelRateStatus } from "./ai-model-rate-types";

// ── AiUsageKind (defined here to keep ai-pricing independent of ai-billing) ───
//
// These values must match ai-billing/ai-billing-types.ts AiUsageKind exactly.
// TypeScript structural typing ensures compatibility without an import cycle.

/**
 * The type of AI work being performed.
 * Determines pricing tier and credit cost.
 *
 * NOTE: This is intentionally duplicated from ai-billing/ai-billing-types.ts
 * to keep ai-pricing as an independent domain that ai-billing can consume
 * without creating a circular dependency.
 */
export type AiUsageKind =
  | "TEXT_GENERATION"
  | "JSON_REASONING"
  | "CLASSIFICATION"
  | "DOCUMENT_ANALYSIS"
  | "IMAGE_GENERATION"
  | "VIDEO_GENERATION"
  | "EMBEDDING"
  | "TRANSCRIPTION"
  | "VISION_ANALYSIS"
  | "TOOL_CALL";

// ── Pricing resolution input ──────────────────────────────────────────────────

/**
 * Input for resolving a pricing rate for a usage event.
 * The resolver walks through the fallback chain to find the best rate.
 */
export interface AiPricingResolutionInput {
  /** Provider identifier (e.g. "openai"). */
  providerId: AiProviderId;

  /** Model identifier (e.g. "gpt-4o"). */
  modelId: string;

  /** Usage kind (determines rate lookup dimension). */
  usageKind: AiUsageKind;

  // ── Usage amounts ─────────────────────────────────────────────────────────

  /** Input tokens consumed. */
  inputTokens?: number;

  /** Output tokens consumed. */
  outputTokens?: number;

  /** Image units generated. */
  imageUnits?: number;

  /** Video seconds generated. */
  videoSeconds?: number;

  /** Audio seconds processed. */
  audioSeconds?: number;

  /** Number of API requests (for per-request billing). */
  requestCount?: number;

  /** Date to use for rate validity check. Defaults to now. */
  at?: string;
}

// ── Provider list filters ─────────────────────────────────────────────────────

export interface AiProviderFilters {
  status?: string;
  kind?:   string;
}

// ── Model rate list filters ───────────────────────────────────────────────────

export interface AiModelRateFilters {
  providerId?: AiProviderId;
  modelId?:    string;
  usageKind?:  AiUsageKind;
  status?:     AiModelRateStatus;
  at?:         string; // only active at this ISO timestamp
}
