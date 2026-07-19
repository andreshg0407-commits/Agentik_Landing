/**
 * lib/ai-layer/ai-cost-estimator.ts
 *
 * Agentik — AI Layer Foundation — Cost Estimator
 * Sprint: AGENTIK-AI-LAYER-FOUNDATION-01
 *
 * SERVER-ONLY — imports ai-pricing/server.
 * Used by the AI Layer service to estimate credits before routing.
 *
 * Falls back to a simple mock estimate if pricing engine returns no rate.
 */

import "server-only";

import type { AIModelDefinition, AIRequest, AIRoutingCandidate } from "./ai-layer-types";
import { aiModelRegistry } from "./ai-model-registry";
import { primaryCapability, getPricingUsageKind } from "./ai-capabilities";
import type { AICapability } from "./ai-layer-types";

// Lazy import to avoid loading pricing at module level during tests
// The pricing service is injected via the estimateCredits function parameter
// to keep this module testable without a live DB.

// ── Mock fallback costs (credits per call) ─────────────────────────────────────

const MOCK_CREDIT_ESTIMATES: Record<string, number> = {
  TEXT_GENERATION:    10,
  JSON_REASONING:     12,
  CLASSIFICATION:      5,
  DOCUMENT_ANALYSIS:  20,
  IMAGE_GENERATION:   50,
  VIDEO_GENERATION:  200,
  EMBEDDING:           2,
  TRANSCRIPTION:      15,
  VISION_ANALYSIS:    18,
  TOOL_CALL:          10,
};

function mockCredits(usageKind: string): number {
  return MOCK_CREDIT_ESTIMATES[usageKind] ?? 10;
}

// ── Estimator ─────────────────────────────────────────────────────────────────

export interface CostEstimatorInput {
  request: AIRequest;
  models: AIModelDefinition[];
}

export interface CostEstimatorResult {
  candidates: AIRoutingCandidate[];
  /** True if pricing engine was used (vs. mock estimates). */
  pricingEngineUsed: boolean;
}

/**
 * Estimate credit costs for each candidate model.
 *
 * Uses the ai-pricing engine to resolve rates. Falls back to mock
 * estimates per usageKind if pricing engine is unavailable or returns
 * no rate for a model.
 *
 * @param input  - Request and candidate models
 * @param resolvePricing - Injected pricing function (from aiPricingService)
 */
export async function estimateCandidateCosts(
  input: CostEstimatorInput,
  resolvePricing?: (params: {
    providerId: string;
    modelId: string;
    usageKind: string;
    inputTokens: number;
    outputTokens: number;
  }) => Promise<{ success: boolean; resolvedRate?: { creditsUsed: number } }>,
): Promise<CostEstimatorResult> {
  const primaryCap = primaryCapability(input.request.requiredCapabilities as AICapability[]);
  const usageKind = getPricingUsageKind(primaryCap);

  // Rough token estimate for pricing: 500 input, 500 output (conservative)
  const estimatedInputTokens  = 500;
  const estimatedOutputTokens = Math.min(input.request.maxOutputTokens ?? 500, 500);

  const candidates: AIRoutingCandidate[] = [];
  let pricingEngineUsed = false;

  for (const model of input.models) {
    let estimatedCredits = mockCredits(usageKind);

    if (resolvePricing) {
      try {
        const result = await resolvePricing({
          providerId:   model.providerId,
          modelId:      model.id,
          usageKind,
          inputTokens:  estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
        });

        if (result.success && result.resolvedRate) {
          estimatedCredits  = result.resolvedRate.creditsUsed;
          pricingEngineUsed = true;
        }
      } catch {
        // Pricing engine unavailable — use mock estimate (already set above)
      }
    }

    candidates.push({ model, estimatedCredits });
  }

  return { candidates, pricingEngineUsed };
}

/**
 * Build the full candidate list from the model registry for a set of capabilities.
 */
export function buildCandidateModels(
  requiredCapabilities: AICapability[],
  forceMock?: boolean,
): AIModelDefinition[] {
  const capable = aiModelRegistry.getCapable(requiredCapabilities);
  if (forceMock) return capable.filter(m => m.isMock);
  return capable;
}
