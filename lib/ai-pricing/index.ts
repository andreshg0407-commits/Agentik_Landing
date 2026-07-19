/**
 * lib/ai-pricing/index.ts
 *
 * Agentik — AI Pricing Engine — Client-Safe Barrel
 * Sprint: AGENTIK-AI-PRICING-ENGINE-01
 *
 * CLIENT-SAFE: exports only pure domain symbols.
 * No Prisma. No server-only. No React.
 *
 * Server-side service:
 *   import { aiPricingService } from "@/lib/ai-pricing/server";
 */

// ── Provider types ────────────────────────────────────────────────────────────
export type {
  AiProviderId,
  AiProviderStatus,
  AiProviderKind,
  AiProviderDefinition,
} from "./ai-provider-types";

// ── Model rate types ──────────────────────────────────────────────────────────
export type {
  AiModelRateStatus,
  AiRateResolutionSource,
  AiModelRate,
  AiResolvedRate,
} from "./ai-model-rate-types";

// ── Pricing types (inputs / filters) ─────────────────────────────────────────
export type {
  AiUsageKind,
  AiPricingResolutionInput,
  AiProviderFilters,
  AiModelRateFilters,
} from "./ai-pricing-types";

// ── Pricing result ────────────────────────────────────────────────────────────
export type { AiPricingResult } from "./ai-pricing-result";
export { successPricingResult, failedPricingResult } from "./ai-pricing-result";

// ── Calculator ────────────────────────────────────────────────────────────────
export type {
  ProviderCostParams,
  CreditsFromCostParams,
  ApplyMinimumCreditsParams,
  ApplyMarkupParams,
  ResolvedPricingParams,
  ResolvedPricingOutput,
} from "./ai-pricing-calculator";
export {
  calculateProviderCostUsd,
  calculateCreditsFromCost,
  applyMinimumCredits,
  applyMarkup,
  calculateResolvedPricing,
} from "./ai-pricing-calculator";

// ── Resolver ──────────────────────────────────────────────────────────────────
export type {
  AiRateRegistry,
  ResolveModelRateInput,
  ResolveModelRateResult,
} from "./ai-pricing-resolver";
export {
  resolveModelRate,
  resolvePricingFromRegistry,
} from "./ai-pricing-resolver";

// ── Audit ─────────────────────────────────────────────────────────────────────
export type {
  AiPricingAuditEventType,
  AiPricingAuditEvent,
  PricingValidationResult,
  PricingResolutionAuditResult,
} from "./ai-pricing-audit";
export {
  createAiPricingAuditEvent,
  validateAiProviderDefinition,
  validateAiModelRate,
  auditPricingResolution,
} from "./ai-pricing-audit";

// ── Fixtures ──────────────────────────────────────────────────────────────────
export {
  openaiProviderFixture,
  anthropicProviderFixture,
  googleProviderFixture,
  runwayProviderFixture,
  internalTestProviderFixture,
  allProviderFixtures,
  openaiTextReasoningRate,
  openaiJsonReasoningDefaultRate,
  anthropicDocumentAnalysisRate,
  anthropicTextDefaultRate,
  googleVisionAnalysisRate,
  googleEmbeddingDefaultRate,
  runwayVideoGenerationRate,
  internalTestFallbackRate,
  globalTextFallbackRate,
  globalImageFallbackRate,
  globalVideoFallbackRate,
  globalDocumentFallbackRate,
  globalVisionFallbackRate,
  globalEmbeddingFallbackRate,
  globalAudioFallbackRate,
  globalJsonReasoningFallbackRate,
  globalToolCallFallbackRate,
  globalClassificationFallbackRate,
  allRateFixtures,
  defaultRateRegistry,
} from "./ai-pricing-fixtures";
