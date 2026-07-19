/**
 * lib/ai-billing/ai-billing-calculator.ts
 *
 * Agentik — AI Billing Foundation — Pure Billing Calculator
 * Sprint: AGENTIK-AI-BILLING-FOUNDATION-01
 *
 * All functions are pure. No side effects. No I/O.
 * Client-safe.
 */

import type { AiUsageKind, AiCostMode } from "./ai-billing-types";
import { DEFAULT_CREDIT_RATES }          from "./ai-pricing-types";

// ── Token totals ──────────────────────────────────────────────────────────────

export interface TokenTotals {
  inputTokens:  number;
  outputTokens: number;
  totalTokens:  number;
}

/**
 * Compute safe token totals, clamping negatives to zero.
 */
export function calculateTokenTotals(
  inputTokens:  number,
  outputTokens: number,
): TokenTotals {
  const safe_in  = Math.max(0, Math.floor(inputTokens));
  const safe_out = Math.max(0, Math.floor(outputTokens));
  return {
    inputTokens:  safe_in,
    outputTokens: safe_out,
    totalTokens:  safe_in + safe_out,
  };
}

// ── Cost estimation ───────────────────────────────────────────────────────────

export interface EstimateCostParams {
  usageKind:    AiUsageKind;
  inputTokens:  number;
  outputTokens: number;
  imageUnits?:  number;
  videoSeconds?: number;
  audioSeconds?: number;
  /** Cost per 1K input tokens in USD. Defaults to 0.003 (conservative estimate). */
  costPerInputToken1k?:  number;
  /** Cost per 1K output tokens in USD. Defaults to 0.015 (conservative estimate). */
  costPerOutputToken1k?: number;
  /** Cost per image unit in USD. Defaults to 0.04. */
  costPerImageUnit?: number;
  /** Cost per video second in USD. Defaults to 0.25. */
  costPerVideoSecond?: number;
  /** Cost per audio second in USD. Defaults to 0.006. */
  costPerAudioSecond?: number;
}

/**
 * Estimate the provider cost in USD for a usage event.
 * Uses conservative defaults when rates are not provided.
 *
 * INTERNAL USE ONLY — never show USD costs to tenants.
 */
export function calculateEstimatedCostUsd(params: EstimateCostParams): number {
  const {
    inputTokens,
    outputTokens,
    imageUnits      = 0,
    videoSeconds    = 0,
    audioSeconds    = 0,
    costPerInputToken1k  = 0.003,
    costPerOutputToken1k = 0.015,
    costPerImageUnit     = 0.04,
    costPerVideoSecond   = 0.25,
    costPerAudioSecond   = 0.006,
  } = params;

  const tokenCost  = (inputTokens / 1000) * costPerInputToken1k
                   + (outputTokens / 1000) * costPerOutputToken1k;
  const imageCost  = imageUnits   * costPerImageUnit;
  const videoCost  = videoSeconds * costPerVideoSecond;
  const audioCost  = audioSeconds * costPerAudioSecond;

  return Math.max(0, tokenCost + imageCost + videoCost + audioCost);
}

// ── Credit calculation ────────────────────────────────────────────────────────

export interface CalculateCreditsParams {
  usageKind:    AiUsageKind;
  inputTokens:  number;
  outputTokens: number;
  imageUnits?:  number;
  videoSeconds?: number;
  audioSeconds?: number;
  /**
   * Credits per 1K input tokens. Defaults to 1.
   * Adjust per plan tier and provider.
   */
  creditsPerInputToken1k?:  number;
  /**
   * Credits per 1K output tokens. Defaults to 5.
   */
  creditsPerOutputToken1k?: number;
  /** Credits per image unit. Defaults per usage kind minimum. */
  creditsPerImageUnit?:   number;
  /** Credits per video second. */
  creditsPerVideoSecond?: number;
  /** Credits per audio second. */
  creditsPerAudioSecond?: number;
}

/**
 * Calculate Agentik credits consumed for a usage event.
 *
 * Enforces minimum credit floors per usage kind.
 * Returns an integer (credits are always whole numbers).
 */
export function calculateCreditsUsed(params: CalculateCreditsParams): number {
  const {
    usageKind,
    inputTokens,
    outputTokens,
    imageUnits    = 0,
    videoSeconds  = 0,
    audioSeconds  = 0,
    creditsPerInputToken1k  = 1,
    creditsPerOutputToken1k = 5,
    creditsPerImageUnit     = 0,
    creditsPerVideoSecond   = 0,
    creditsPerAudioSecond   = 0,
  } = params;

  const tokenCredits = (inputTokens  / 1000) * creditsPerInputToken1k
                     + (outputTokens / 1000) * creditsPerOutputToken1k;
  const imageCredits = imageUnits  * (creditsPerImageUnit  || DEFAULT_CREDIT_RATES[usageKind].minimumCredits);
  const videoCredits = videoSeconds * (creditsPerVideoSecond || 0);
  const audioCredits = audioSeconds * (creditsPerAudioSecond || 0);

  const raw     = tokenCredits + imageCredits + videoCredits + audioCredits;
  const minimum = DEFAULT_CREDIT_RATES[usageKind].minimumCredits;
  return Math.max(minimum, Math.ceil(raw));
}

// ── Gross margin ──────────────────────────────────────────────────────────────

export interface GrossMarginParams {
  creditsUsed:       number;
  creditPriceUsd:    number; // how much Agentik sells 1 credit for in USD
  providerCostUsd:   number; // what Agentik paid the provider
}

export interface GrossMarginResult {
  revenueUsd:      number;
  providerCostUsd: number;
  grossMarginUsd:  number;
  marginPct:       number; // 0–100
}

/**
 * Calculate gross margin for a usage event.
 * marginPct = (revenue - cost) / revenue * 100
 */
export function calculateGrossMargin(params: GrossMarginParams): GrossMarginResult {
  const revenueUsd     = params.creditsUsed * params.creditPriceUsd;
  const grossMarginUsd = revenueUsd - params.providerCostUsd;
  const marginPct      = revenueUsd > 0
    ? Math.round((grossMarginUsd / revenueUsd) * 10000) / 100
    : 0;

  return {
    revenueUsd:      Math.max(0, revenueUsd),
    providerCostUsd: Math.max(0, params.providerCostUsd),
    grossMarginUsd,
    marginPct,
  };
}

// ── Usage kind normalizer ─────────────────────────────────────────────────────

const USAGE_KIND_ALIASES: Record<string, AiUsageKind> = {
  "text":                  "TEXT_GENERATION",
  "text_gen":              "TEXT_GENERATION",
  "generation":            "TEXT_GENERATION",
  "reasoning":             "JSON_REASONING",
  "json":                  "JSON_REASONING",
  "classify":              "CLASSIFICATION",
  "classification":        "CLASSIFICATION",
  "document":              "DOCUMENT_ANALYSIS",
  "doc":                   "DOCUMENT_ANALYSIS",
  "image":                 "IMAGE_GENERATION",
  "img":                   "IMAGE_GENERATION",
  "video":                 "VIDEO_GENERATION",
  "embed":                 "EMBEDDING",
  "embedding":             "EMBEDDING",
  "transcribe":            "TRANSCRIPTION",
  "transcription":         "TRANSCRIPTION",
  "vision":                "VISION_ANALYSIS",
  "tool":                  "TOOL_CALL",
  "tool_call":             "TOOL_CALL",
};

const VALID_USAGE_KINDS = new Set<AiUsageKind>([
  "TEXT_GENERATION",
  "JSON_REASONING",
  "CLASSIFICATION",
  "DOCUMENT_ANALYSIS",
  "IMAGE_GENERATION",
  "VIDEO_GENERATION",
  "EMBEDDING",
  "TRANSCRIPTION",
  "VISION_ANALYSIS",
  "TOOL_CALL",
]);

/**
 * Normalize a raw string to a valid AiUsageKind.
 * Returns null if unrecognized.
 */
export function normalizeUsageKind(value: string): AiUsageKind | null {
  const upper = value.toUpperCase();
  if (VALID_USAGE_KINDS.has(upper as AiUsageKind)) return upper as AiUsageKind;
  const lower = value.toLowerCase();
  return USAGE_KIND_ALIASES[lower] ?? null;
}

// ── Cost mode helpers ─────────────────────────────────────────────────────────

export function determineCostMode(
  actualCostProvided: boolean,
  isReconciled: boolean,
): AiCostMode {
  if (isReconciled)       return "ACTUAL";
  if (actualCostProvided) return "ACTUAL";
  return "ESTIMATED";
}
