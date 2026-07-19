/**
 * lib/ai-billing/ai-pricing-types.ts
 *
 * Agentik — AI Billing Foundation — Pricing Model Types
 * Sprint: AGENTIK-AI-BILLING-FOUNDATION-01
 *
 * Defines credit rates per usage kind and plan allowances.
 * No real plans yet — types only.
 *
 * Pure domain. No Prisma. No React. No server-only.
 * Client-safe.
 */

import type { AiUsageKind } from "./ai-billing-types";

// ── Credit rate ───────────────────────────────────────────────────────────────

/**
 * How many Agentik credits correspond to each unit of provider usage.
 *
 * Rates are per usage kind, optionally scoped to a provider+model pair.
 * The billing calculator uses these rates to convert token/image/video
 * counts into credit amounts.
 */
export interface AiCreditRate {
  /** Which usage kind this rate applies to. */
  usageKind: AiUsageKind;

  /** Optional: rate only applies to this provider. Null = all providers. */
  provider?: string;

  /** Optional: rate only applies to this model. Null = all models. */
  model?: string;

  /** Credits charged per input token. */
  creditsPerInputToken: number;

  /** Credits charged per output token. */
  creditsPerOutputToken: number;

  /** Credits charged per image unit generated. */
  creditsPerImageUnit: number;

  /** Credits charged per second of video generated. */
  creditsPerVideoSecond: number;

  /** Credits charged per second of audio processed. */
  creditsPerAudioSecond: number;

  /**
   * Minimum credits for any single call of this kind.
   * Prevents undercharging for very short/cheap operations.
   */
  minimumCredits: number;

  /**
   * Agentik markup multiplier applied on top of raw cost.
   * E.g. 1.5 = 50% margin. Applied before minimum credit floor.
   */
  markupMultiplier: number;

  /** Whether this rate is currently active. */
  isActive: boolean;
}

// ── Plan credit allowance ─────────────────────────────────────────────────────

/**
 * How many credits are included in a given plan.
 * This is a type scaffold — real plans will be defined in AGENTIK-BILLING-PLANS-01.
 */
export interface AiPlanCreditAllowance {
  /** Plan identifier: "starter" | "professional" | "enterprise" | etc. */
  planId: string;

  /** Monthly credits included in this plan. */
  includedMonthlyCredits: number;

  /** Whether unused credits roll over to the next billing period. */
  rolloverAllowed: boolean;

  /** Whether the tenant can consume credits beyond the monthly allowance. */
  overageEnabled: boolean;

  /**
   * Price per additional credit in USD when overageEnabled=true.
   * 0 if overages are not allowed or are free.
   */
  overageCreditPriceUsd: number;

  /**
   * If true, usage is hard-blocked when the balance reaches 0.
   * If false, usage continues and the overage is recorded as debt.
   */
  hardLimitEnabled: boolean;
}

// ── Default credit rates (initial values) ─────────────────────────────────────

/**
 * Baseline credit rates for all usage kinds.
 * These are conservative initial values — review before production pricing.
 *
 * Rule: clients see credits only. USD costs are internal.
 */
export const DEFAULT_CREDIT_RATES: Readonly<Record<AiUsageKind, Pick<AiCreditRate, "minimumCredits" | "markupMultiplier">>> = {
  TEXT_GENERATION:   { minimumCredits: 1,   markupMultiplier: 1.5 },
  JSON_REASONING:    { minimumCredits: 2,   markupMultiplier: 1.5 },
  CLASSIFICATION:    { minimumCredits: 1,   markupMultiplier: 1.3 },
  DOCUMENT_ANALYSIS: { minimumCredits: 5,   markupMultiplier: 1.5 },
  IMAGE_GENERATION:  { minimumCredits: 100, markupMultiplier: 1.4 },
  VIDEO_GENERATION:  { minimumCredits: 500, markupMultiplier: 1.4 },
  EMBEDDING:         { minimumCredits: 1,   markupMultiplier: 1.2 },
  TRANSCRIPTION:     { minimumCredits: 2,   markupMultiplier: 1.3 },
  VISION_ANALYSIS:   { minimumCredits: 10,  markupMultiplier: 1.4 },
  TOOL_CALL:         { minimumCredits: 1,   markupMultiplier: 1.2 },
};
