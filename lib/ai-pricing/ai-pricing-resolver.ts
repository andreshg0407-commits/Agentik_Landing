/**
 * lib/ai-pricing/ai-pricing-resolver.ts
 *
 * Agentik — AI Pricing Engine — Rate Resolver
 * Sprint: AGENTIK-AI-PRICING-ENGINE-01
 *
 * Resolves AiModelRate from a registry via 4-level fallback chain.
 * Never throws — always returns a structured result.
 *
 * Fallback chain:
 *   1. provider + model + usageKind (EXACT_MODEL_RATE)
 *   2. provider + "default" + usageKind (PROVIDER_DEFAULT)
 *   3. "global" + "default" + usageKind (USAGE_KIND_DEFAULT)
 *   4. "global" + "default" + "TEXT_GENERATION" (GLOBAL_FALLBACK)
 *
 * Pure domain. No Prisma. No React. No server-only. Client-safe.
 */

import type { AiUsageKind } from "./ai-pricing-types";
import type { AiProviderId } from "./ai-provider-types";
import type { AiModelRate, AiRateResolutionSource } from "./ai-model-rate-types";
import type { AiPricingResolutionInput } from "./ai-pricing-types";
import type { AiPricingResult } from "./ai-pricing-result";
import { successPricingResult, failedPricingResult } from "./ai-pricing-result";
import { calculateResolvedPricing } from "./ai-pricing-calculator";

// ── Registry type ─────────────────────────────────────────────────────────────

/**
 * A flat list of AiModelRate objects used as an in-memory registry.
 * In production, this is populated from the DB by the server service.
 */
export type AiRateRegistry = AiModelRate[];

// ── Lookup helpers ────────────────────────────────────────────────────────────

function isActive(rate: AiModelRate, at: string): boolean {
  if (rate.status !== "ACTIVE") return false;
  if (rate.effectiveFrom > at) return false;
  if (rate.effectiveTo != null && rate.effectiveTo < at) return false;
  return true;
}

function findRate(
  registry: AiRateRegistry,
  providerId: string,
  modelId: string,
  usageKind: string,
  at: string,
): AiModelRate | undefined {
  return registry.find(
    r => r.providerId === providerId &&
         r.modelId   === modelId   &&
         r.usageKind === usageKind &&
         isActive(r, at),
  );
}

// ── Resolver ──────────────────────────────────────────────────────────────────

export interface ResolveModelRateInput {
  registry:  AiRateRegistry;
  providerId: AiProviderId;
  modelId:    string;
  usageKind:  AiUsageKind;
  at?:        string;
}

export interface ResolveModelRateResult {
  rate?:   AiModelRate;
  source?: AiRateResolutionSource;
  error?:  string;
}

/**
 * Resolve the best available rate for a provider+model+usageKind combination.
 * Walks the 4-level fallback chain. Never throws.
 */
export function resolveModelRate(input: ResolveModelRateInput): ResolveModelRateResult {
  const { registry, providerId, modelId, usageKind } = input;
  const at = input.at ?? new Date().toISOString();

  // Level 1: exact match
  const exact = findRate(registry, providerId, modelId, usageKind, at);
  if (exact) return { rate: exact, source: "EXACT_MODEL_RATE" };

  // Level 2: provider default (any model for this usageKind)
  const providerDefault = findRate(registry, providerId, "default", usageKind, at);
  if (providerDefault) return { rate: providerDefault, source: "PROVIDER_DEFAULT" };

  // Level 3: global usageKind default (any provider, any model)
  const usageKindDefault = findRate(registry, "global", "default", usageKind, at);
  if (usageKindDefault) return { rate: usageKindDefault, source: "USAGE_KIND_DEFAULT" };

  // Level 4: global fallback (the safety net TEXT_GENERATION rate)
  const globalFallback = findRate(registry, "global", "default", "TEXT_GENERATION", at);
  if (globalFallback) return { rate: globalFallback, source: "GLOBAL_FALLBACK" };

  return { error: `No rate found for ${providerId}/${modelId}/${usageKind} at ${at}` };
}

// ── Full resolution pipeline ──────────────────────────────────────────────────

/**
 * Resolve pricing for a usage event using a rate registry.
 * Returns AiPricingResult with resolved rate + calculated cost/credits.
 */
export function resolvePricingFromRegistry(
  input:    AiPricingResolutionInput,
  registry: AiRateRegistry,
  creditsPerUsd = 1000,
): AiPricingResult {
  const warnings: string[] = [];
  const at = input.at ?? new Date().toISOString();

  const { rate, source, error } = resolveModelRate({
    registry,
    providerId: input.providerId,
    modelId:    input.modelId,
    usageKind:  input.usageKind,
    at,
  });

  if (!rate || !source) {
    return failedPricingResult(
      error ?? `No rate found for ${input.providerId}/${input.modelId}/${input.usageKind}`,
    );
  }

  // Warn about fallbacks
  if (source === "PROVIDER_DEFAULT") {
    warnings.push(`No exact model rate for ${input.modelId}. Using provider default.`);
  } else if (source === "USAGE_KIND_DEFAULT") {
    warnings.push(`No provider rate for ${input.providerId}. Using usage kind default.`);
  } else if (source === "GLOBAL_FALLBACK") {
    warnings.push(`No specific rate found. Using global fallback rate.`);
  }

  // Warn about deprecated providers (caller checks provider list separately)
  if (rate.status === "DEPRECATED") {
    warnings.push(`Rate ${rate.id} is DEPRECATED. Update to a current rate.`);
  }

  const pricing = calculateResolvedPricing({
    rate,
    inputTokens:  input.inputTokens,
    outputTokens: input.outputTokens,
    imageUnits:   input.imageUnits,
    videoSeconds: input.videoSeconds,
    audioSeconds: input.audioSeconds,
    requestCount: input.requestCount,
    creditsPerUsd,
  });

  return successPricingResult(
    `Resolved ${input.usageKind} via ${source}: ${pricing.creditsUsed} credits, $${pricing.providerCostUsd.toFixed(6)} USD.`,
    {
      providerId:        rate.providerId,
      modelId:           rate.modelId,
      usageKind:         input.usageKind,
      rateId:            rate.id,
      currency:          rate.currency,
      estimatedCostUsd:  pricing.providerCostUsd,
      creditsUsed:       pricing.creditsUsed,
      markupMultiplier:  pricing.markupMultiplier,
      minimumCredits:    pricing.minimumCredits,
      source,
    },
    warnings,
  );
}
