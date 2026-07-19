/**
 * lib/ai-pricing/ai-pricing-calculator.ts
 *
 * Agentik — AI Pricing Engine — Pure Pricing Calculator
 * Sprint: AGENTIK-AI-PRICING-ENGINE-01
 *
 * All functions are pure. No side effects. No I/O.
 * Client-safe. No Prisma. No server-only.
 *
 * Key difference from ai-billing-calculator:
 *   - Token rates are per 1M (industry standard), not per 1K.
 *   - Cost is always calculated from a concrete AiModelRate, never from hardcoded defaults.
 *   - creditsUsed is always Math.ceil (never rounded down).
 */

import type { AiModelRate } from "./ai-model-rate-types";

// ── Safety helpers ────────────────────────────────────────────────────────────

/**
 * Coerce any numeric input to a safe finite number.
 * NaN, Infinity, -Infinity → fallback (default 0).
 * Prevents NaN/Infinity from propagating through pricing calculations.
 */
function safeNum(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

// ── Provider cost calculation ─────────────────────────────────────────────────

export interface ProviderCostParams {
  rate:         AiModelRate;
  inputTokens:  number;
  outputTokens: number;
  imageUnits?:  number;
  videoSeconds?: number;
  audioSeconds?: number;
  requestCount?: number;
}

/**
 * Calculate the raw provider cost in USD for a usage event.
 * Uses the rate's per-1M-token costs, per-unit costs, and request cost.
 * Applies minimumProviderCostUsd floor if set on the rate.
 *
 * INTERNAL — never expose USD to tenants.
 */
export function calculateProviderCostUsd(params: ProviderCostParams): number {
  const {
    rate,
    inputTokens  = 0,
    outputTokens = 0,
    imageUnits   = 0,
    videoSeconds = 0,
    audioSeconds = 0,
    requestCount = 1,
  } = params;

  // Normalize all numeric inputs — NaN/Infinity → 0 (or 1 for requestCount)
  const safeIn   = Math.max(0, safeNum(inputTokens));
  const safeOut  = Math.max(0, safeNum(outputTokens));
  const safeImg  = Math.max(0, safeNum(imageUnits));
  const safeVid  = Math.max(0, safeNum(videoSeconds));
  const safeAud  = Math.max(0, safeNum(audioSeconds));
  const safeReq  = Math.max(1, safeNum(requestCount, 1));

  // Normalize rate cost fields
  const inCost1M  = safeNum(rate.inputTokenCostPer1M  ?? 0);
  const outCost1M = safeNum(rate.outputTokenCostPer1M ?? 0);
  const imgCost   = safeNum(rate.imageUnitCost   ?? 0);
  const vidCost   = safeNum(rate.videoSecondCost ?? 0);
  const audCost   = safeNum(rate.audioSecondCost ?? 0);
  const reqCost   = safeNum(rate.requestCost     ?? 0);
  const minFloor  = rate.minimumProviderCostUsd != null ? safeNum(rate.minimumProviderCostUsd) : null;

  const tokenCost = (inCost1M * safeIn / 1_000_000) + (outCost1M * safeOut / 1_000_000);
  const imageCost = imgCost * safeImg;
  const videoCost = vidCost * safeVid;
  const audioCost = audCost * safeAud;
  const rCost     = reqCost * safeReq;

  const raw       = tokenCost + imageCost + videoCost + audioCost + rCost;
  const withFloor = minFloor != null ? Math.max(minFloor, raw) : raw;

  return Math.max(0, safeNum(withFloor));
}

// ── Credits from cost ─────────────────────────────────────────────────────────

export interface CreditsFromCostParams {
  /**
   * Provider cost in USD (output of calculateProviderCostUsd).
   * Used as the base for markup → credits conversion.
   */
  providerCostUsd: number;

  /**
   * Agentik markup multiplier. Must be ≥ 1.0.
   * Applied to providerCostUsd to get the marked-up cost.
   */
  markupMultiplier: number;

  /**
   * USD-to-credit conversion rate: how many credits per 1 USD of cost.
   * Defaults to 1000 (i.e. $0.001 = 1 credit).
   */
  creditsPerUsd?: number;
}

/**
 * Convert a provider USD cost to Agentik credits.
 * Applies markup multiplier first, then converts at the credit rate.
 * Always returns a non-negative float (ceiling applied separately).
 */
export function calculateCreditsFromCost(params: CreditsFromCostParams): number {
  const safeCost    = safeNum(params.providerCostUsd, 0);
  const safeMarkup  = Math.max(1, safeNum(params.markupMultiplier, 1));
  const safeRate    = Math.max(1, safeNum(params.creditsPerUsd ?? 1000, 1000));
  return safeNum(safeCost * safeMarkup * safeRate, 0);
}

// ── Minimum credits floor ─────────────────────────────────────────────────────

export interface ApplyMinimumCreditsParams {
  /** Raw credits before minimum is applied. */
  rawCredits: number;
  /** Minimum credits floor from the rate. */
  minimumCredits: number;
}

/**
 * Apply the minimum credits floor and ceil to integer.
 * Returns at least minimumCredits, always an integer.
 */
export function applyMinimumCredits(params: ApplyMinimumCreditsParams): number {
  const safeRaw = safeNum(params.rawCredits, 0);
  const safeMin = Math.max(1, safeNum(params.minimumCredits, 1));
  return Math.max(safeMin, Math.ceil(safeRaw));
}

// ── Markup application ────────────────────────────────────────────────────────

export interface ApplyMarkupParams {
  /** Provider cost in USD. */
  providerCostUsd: number;
  /** Markup multiplier (≥ 1.0). */
  markupMultiplier: number;
}

/**
 * Apply markup to a provider cost.
 * Returns the marked-up USD cost.
 */
export function applyMarkup(params: ApplyMarkupParams): number {
  const safeCost   = safeNum(params.providerCostUsd, 0);
  const safeMarkup = Math.max(1, safeNum(params.markupMultiplier, 1));
  return safeNum(safeCost * safeMarkup, 0);
}

// ── Full pricing calculation ──────────────────────────────────────────────────

export interface ResolvedPricingParams {
  rate:          AiModelRate;
  inputTokens?:  number;
  outputTokens?: number;
  imageUnits?:   number;
  videoSeconds?: number;
  audioSeconds?: number;
  requestCount?: number;
  /** Credits per USD for conversion. Default: 1000. */
  creditsPerUsd?: number;
}

export interface ResolvedPricingOutput {
  providerCostUsd:   number;
  markedUpCostUsd:   number;
  rawCredits:        number;
  creditsUsed:       number; // integer, ≥ minimumCredits
  markupMultiplier:  number;
  minimumCredits:    number;
}

/**
 * Full pricing calculation from a resolved rate.
 * Pipeline: providerCost → markup → credits → minimum floor → ceil.
 */
export function calculateResolvedPricing(params: ResolvedPricingParams): ResolvedPricingOutput {
  const { rate, creditsPerUsd = 1000 } = params;

  const providerCostUsd = calculateProviderCostUsd({
    rate,
    inputTokens:  params.inputTokens  ?? 0,
    outputTokens: params.outputTokens ?? 0,
    imageUnits:   params.imageUnits   ?? 0,
    videoSeconds: params.videoSeconds ?? 0,
    audioSeconds: params.audioSeconds ?? 0,
    requestCount: params.requestCount ?? 1,
  });

  const markedUpCostUsd = applyMarkup({
    providerCostUsd,
    markupMultiplier: rate.creditMarkupMultiplier,
  });

  const rawCredits = calculateCreditsFromCost({
    providerCostUsd,
    markupMultiplier: rate.creditMarkupMultiplier,
    creditsPerUsd,
  });

  const creditsUsed = applyMinimumCredits({
    rawCredits,
    minimumCredits: rate.minimumCredits,
  });

  return {
    providerCostUsd,
    markedUpCostUsd,
    rawCredits,
    creditsUsed,
    markupMultiplier: rate.creditMarkupMultiplier,
    minimumCredits:   rate.minimumCredits,
  };
}
