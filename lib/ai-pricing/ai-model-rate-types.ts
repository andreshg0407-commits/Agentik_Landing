/**
 * lib/ai-pricing/ai-model-rate-types.ts
 *
 * Agentik — AI Pricing Engine — Model Rate Type Definitions
 * Sprint: AGENTIK-AI-PRICING-ENGINE-01
 *
 * Defines the rate structure for each provider+model+usageKind combination,
 * and the resolved rate returned after fallback resolution.
 *
 * Pure domain. No Prisma. No React. No server-only. Client-safe.
 */

import type { AiUsageKind } from "./ai-pricing-types";
import type { AiProviderId } from "./ai-provider-types";

// ── Model rate status ──────────────────────────────────────────────────────────

export type AiModelRateStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "DEPRECATED"
  | "SUPERSEDED";

// ── Rate resolution source ────────────────────────────────────────────────────

/**
 * Describes which level of the fallback chain was used to resolve a rate.
 * EXACT_MODEL_RATE is the most specific; GLOBAL_FALLBACK is the safety net.
 */
export type AiRateResolutionSource =
  | "EXACT_MODEL_RATE"       // provider + model + usageKind exact match
  | "PROVIDER_DEFAULT"       // provider + usageKind, any model
  | "USAGE_KIND_DEFAULT"     // usageKind only, any provider
  | "GLOBAL_FALLBACK";       // last-resort global safety rate

// ── Model rate ────────────────────────────────────────────────────────────────

/**
 * Pricing rate for a specific provider+model+usageKind combination.
 *
 * All USD costs are internal — never expose these to tenants.
 * Tenants see credits only.
 */
export interface AiModelRate {
  /** Unique identifier (cuid or named slug for fixtures). */
  id: string;

  /** Provider this rate belongs to. */
  providerId: AiProviderId;

  /**
   * Model identifier, e.g. "gpt-4o", "claude-3-5-sonnet-20241022".
   * Use "default" for a provider-level default rate (any model).
   */
  modelId: string;

  /** Human-readable label. */
  displayName: string;

  /** Usage kind this rate applies to. */
  usageKind: AiUsageKind;

  /** Billing currency (always "USD"). */
  currency: string;

  // ── Token billing ────────────────────────────────────────────────────────

  /** Provider cost per 1 million input tokens in USD. */
  inputTokenCostPer1M?: number;

  /** Provider cost per 1 million output tokens in USD. */
  outputTokenCostPer1M?: number;

  // ── Unit billing ─────────────────────────────────────────────────────────

  /** Provider cost per image unit in USD. */
  imageUnitCost?: number;

  /** Provider cost per second of video generated in USD. */
  videoSecondCost?: number;

  /** Provider cost per second of audio processed in USD. */
  audioSecondCost?: number;

  /** Fixed cost per API request in USD (some providers charge per request). */
  requestCost?: number;

  // ── Floors and markup ────────────────────────────────────────────────────

  /** Minimum provider cost in USD — any call costs at least this much. */
  minimumProviderCostUsd?: number;

  /** Minimum Agentik credits charged per call. Always enforced. */
  minimumCredits: number;

  /**
   * Agentik markup multiplier applied on top of provider cost.
   * E.g. 1.5 = 50% margin. Must be ≥ 1.0.
   */
  creditMarkupMultiplier: number;

  // ── Validity window ───────────────────────────────────────────────────────

  /** ISO timestamp — this rate is active from this date. */
  effectiveFrom: string;

  /** ISO timestamp — this rate expires after this date. Null = never expires. */
  effectiveTo?: string;

  /** Rate status. */
  status: AiModelRateStatus;

  /** Arbitrary metadata. */
  metadata?: Record<string, unknown>;
}

// ── Resolved rate ─────────────────────────────────────────────────────────────

/**
 * The result of the pricing resolver for a specific usage event.
 * Contains the final cost and credit count after applying all rules.
 */
export interface AiResolvedRate {
  /** Provider that was resolved. */
  providerId: AiProviderId;

  /** Model that was resolved (may be "default" if a fallback was used). */
  modelId: string;

  /** Usage kind. */
  usageKind: AiUsageKind;

  /** Rate ID that was used. */
  rateId: string;

  /** Billing currency. */
  currency: string;

  /** Estimated provider cost in USD (internal only). */
  estimatedCostUsd: number;

  /** Agentik credits to charge. Always an integer ≥ minimumCredits. */
  creditsUsed: number;

  /** Markup multiplier that was applied. */
  markupMultiplier: number;

  /** Minimum credits floor that was applied. */
  minimumCredits: number;

  /** How this rate was resolved (for audit and debugging). */
  source: AiRateResolutionSource;
}
