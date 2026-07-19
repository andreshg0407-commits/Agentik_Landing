/**
 * lib/ai-pricing/ai-pricing-fixtures.ts
 *
 * Agentik — AI Pricing Engine — Provider and Rate Fixtures
 * Sprint: AGENTIK-AI-PRICING-ENGINE-01
 *
 * These fixtures serve two purposes:
 *   1. Seed data for the DB (via seedDefaultProvidersAndRates)
 *   2. In-memory registry for unit tests and pure validation
 *
 * Rates are representative — not guaranteed to match exact provider pricing.
 * Update via seed script when providers change their pricing.
 *
 * Pure domain. No Prisma. No React. No server-only. Client-safe.
 */

import type { AiProviderDefinition } from "./ai-provider-types";
import type { AiModelRate } from "./ai-model-rate-types";

const NOW = "2026-01-01T00:00:00.000Z";

// ─────────────────────────────────────────────────────────────────────────────
// Provider Fixtures
// ─────────────────────────────────────────────────────────────────────────────

export const openaiProviderFixture: AiProviderDefinition = {
  id:                  "openai",
  name:                "OpenAI",
  kind:                "MULTIMODAL",
  status:              "ACTIVE",
  defaultCurrency:     "USD",
  supportsTokenBilling: true,
  supportsUnitBilling:  true,
  supportsStreaming:    true,
  metadata:            { website: "https://openai.com" },
  createdAt:           NOW,
  updatedAt:           NOW,
};

export const anthropicProviderFixture: AiProviderDefinition = {
  id:                  "anthropic",
  name:                "Anthropic",
  kind:                "LLM",
  status:              "ACTIVE",
  defaultCurrency:     "USD",
  supportsTokenBilling: true,
  supportsUnitBilling:  false,
  supportsStreaming:    true,
  metadata:            { website: "https://anthropic.com" },
  createdAt:           NOW,
  updatedAt:           NOW,
};

export const googleProviderFixture: AiProviderDefinition = {
  id:                  "google",
  name:                "Google (Gemini)",
  kind:                "MULTIMODAL",
  status:              "ACTIVE",
  defaultCurrency:     "USD",
  supportsTokenBilling: true,
  supportsUnitBilling:  true,
  supportsStreaming:    true,
  metadata:            { website: "https://deepmind.google" },
  createdAt:           NOW,
  updatedAt:           NOW,
};

export const runwayProviderFixture: AiProviderDefinition = {
  id:                  "runway",
  name:                "Runway ML",
  kind:                "VIDEO",
  status:              "ACTIVE",
  defaultCurrency:     "USD",
  supportsTokenBilling: false,
  supportsUnitBilling:  true,
  supportsStreaming:    false,
  metadata:            { website: "https://runwayml.com" },
  createdAt:           NOW,
  updatedAt:           NOW,
};

export const internalTestProviderFixture: AiProviderDefinition = {
  id:                  "internal_test",
  name:                "Internal Test Provider",
  kind:                "INTERNAL",
  status:              "TEST_ONLY",
  defaultCurrency:     "USD",
  supportsTokenBilling: true,
  supportsUnitBilling:  true,
  supportsStreaming:    false,
  metadata:            { note: "Zero-cost provider for integration tests" },
  createdAt:           NOW,
  updatedAt:           NOW,
};

export const allProviderFixtures: AiProviderDefinition[] = [
  openaiProviderFixture,
  anthropicProviderFixture,
  googleProviderFixture,
  runwayProviderFixture,
  internalTestProviderFixture,
];

// ─────────────────────────────────────────────────────────────────────────────
// Rate Fixtures
// ─────────────────────────────────────────────────────────────────────────────

// ── OpenAI: GPT-4o text generation ───────────────────────────────────────────

export const openaiTextReasoningRate: AiModelRate = {
  id:                    "rate_openai_gpt4o_text",
  providerId:            "openai",
  modelId:               "gpt-4o",
  displayName:           "OpenAI GPT-4o — Text/Reasoning",
  usageKind:             "TEXT_GENERATION",
  currency:              "USD",
  inputTokenCostPer1M:   5.00,   // $5 per 1M input tokens
  outputTokenCostPer1M:  15.00,  // $15 per 1M output tokens
  minimumProviderCostUsd: 0.0001,
  minimumCredits:        1,
  creditMarkupMultiplier: 1.5,
  effectiveFrom:         NOW,
  status:                "ACTIVE",
};

// OpenAI provider default for JSON_REASONING (covers all OpenAI models)
export const openaiJsonReasoningDefaultRate: AiModelRate = {
  id:                    "rate_openai_default_reasoning",
  providerId:            "openai",
  modelId:               "default",
  displayName:           "OpenAI — JSON Reasoning (provider default)",
  usageKind:             "JSON_REASONING",
  currency:              "USD",
  inputTokenCostPer1M:   5.00,
  outputTokenCostPer1M:  20.00,
  minimumProviderCostUsd: 0.0002,
  minimumCredits:        2,
  creditMarkupMultiplier: 1.5,
  effectiveFrom:         NOW,
  status:                "ACTIVE",
};

// ── Anthropic: Claude document analysis ──────────────────────────────────────

export const anthropicDocumentAnalysisRate: AiModelRate = {
  id:                    "rate_anthropic_claude35_document",
  providerId:            "anthropic",
  modelId:               "claude-3-5-sonnet-20241022",
  displayName:           "Anthropic Claude 3.5 Sonnet — Document Analysis",
  usageKind:             "DOCUMENT_ANALYSIS",
  currency:              "USD",
  inputTokenCostPer1M:   3.00,   // $3 per 1M input tokens
  outputTokenCostPer1M:  15.00,  // $15 per 1M output tokens
  minimumProviderCostUsd: 0.0005,
  minimumCredits:        5,
  creditMarkupMultiplier: 1.5,
  effectiveFrom:         NOW,
  status:                "ACTIVE",
};

// Anthropic provider default for TEXT_GENERATION
export const anthropicTextDefaultRate: AiModelRate = {
  id:                    "rate_anthropic_default_text",
  providerId:            "anthropic",
  modelId:               "default",
  displayName:           "Anthropic — Text Generation (provider default)",
  usageKind:             "TEXT_GENERATION",
  currency:              "USD",
  inputTokenCostPer1M:   3.00,
  outputTokenCostPer1M:  15.00,
  minimumProviderCostUsd: 0.0001,
  minimumCredits:        1,
  creditMarkupMultiplier: 1.5,
  effectiveFrom:         NOW,
  status:                "ACTIVE",
};

// ── Google: Gemini vision analysis ────────────────────────────────────────────

export const googleVisionAnalysisRate: AiModelRate = {
  id:                    "rate_google_gemini15_vision",
  providerId:            "google",
  modelId:               "gemini-1.5-pro",
  displayName:           "Google Gemini 1.5 Pro — Vision Analysis",
  usageKind:             "VISION_ANALYSIS",
  currency:              "USD",
  inputTokenCostPer1M:   3.50,
  outputTokenCostPer1M:  10.50,
  minimumProviderCostUsd: 0.001,
  minimumCredits:        10,
  creditMarkupMultiplier: 1.4,
  effectiveFrom:         NOW,
  status:                "ACTIVE",
};

// Google provider default for EMBEDDING
export const googleEmbeddingDefaultRate: AiModelRate = {
  id:                    "rate_google_default_embedding",
  providerId:            "google",
  modelId:               "default",
  displayName:           "Google — Embedding (provider default)",
  usageKind:             "EMBEDDING",
  currency:              "USD",
  inputTokenCostPer1M:   0.10,
  outputTokenCostPer1M:  0,
  minimumProviderCostUsd: 0.000001,
  minimumCredits:        1,
  creditMarkupMultiplier: 1.2,
  effectiveFrom:         NOW,
  status:                "ACTIVE",
};

// ── Runway: Video generation ───────────────────────────────────────────────────

export const runwayVideoGenerationRate: AiModelRate = {
  id:                    "rate_runway_gen3_video",
  providerId:            "runway",
  modelId:               "gen-3-alpha",
  displayName:           "Runway Gen-3 Alpha — Video Generation",
  usageKind:             "VIDEO_GENERATION",
  currency:              "USD",
  videoSecondCost:       0.05,  // $0.05 per second of video
  minimumProviderCostUsd: 0.25,
  minimumCredits:        500,
  creditMarkupMultiplier: 1.4,
  effectiveFrom:         NOW,
  status:                "ACTIVE",
};

// ── Internal test: zero-cost fallback ────────────────────────────────────────

export const internalTestFallbackRate: AiModelRate = {
  id:                    "rate_internal_test_fallback",
  providerId:            "internal_test",
  modelId:               "default",
  displayName:           "Internal Test — Zero-Cost Fallback",
  usageKind:             "TEXT_GENERATION",
  currency:              "USD",
  inputTokenCostPer1M:   0,
  outputTokenCostPer1M:  0,
  minimumProviderCostUsd: 0,
  minimumCredits:        1,
  creditMarkupMultiplier: 1.0,
  effectiveFrom:         NOW,
  status:                "ACTIVE",
};

// ── Global fallback rates (usageKind-level defaults) ─────────────────────────

export const globalTextFallbackRate: AiModelRate = {
  id:                    "rate_global_text_fallback",
  providerId:            "global",
  modelId:               "default",
  displayName:           "Global — Text Generation Fallback",
  usageKind:             "TEXT_GENERATION",
  currency:              "USD",
  inputTokenCostPer1M:   4.00,
  outputTokenCostPer1M:  12.00,
  minimumProviderCostUsd: 0.0001,
  minimumCredits:        1,
  creditMarkupMultiplier: 1.5,
  effectiveFrom:         NOW,
  status:                "ACTIVE",
};

export const globalImageFallbackRate: AiModelRate = {
  id:                    "rate_global_image_fallback",
  providerId:            "global",
  modelId:               "default",
  displayName:           "Global — Image Generation Fallback",
  usageKind:             "IMAGE_GENERATION",
  currency:              "USD",
  imageUnitCost:         0.04,   // $0.04 per image unit
  minimumProviderCostUsd: 0.04,
  minimumCredits:        100,
  creditMarkupMultiplier: 1.4,
  effectiveFrom:         NOW,
  status:                "ACTIVE",
};

export const globalVideoFallbackRate: AiModelRate = {
  id:                    "rate_global_video_fallback",
  providerId:            "global",
  modelId:               "default",
  displayName:           "Global — Video Generation Fallback",
  usageKind:             "VIDEO_GENERATION",
  currency:              "USD",
  videoSecondCost:       0.05,
  minimumProviderCostUsd: 0.25,
  minimumCredits:        500,
  creditMarkupMultiplier: 1.4,
  effectiveFrom:         NOW,
  status:                "ACTIVE",
};

export const globalDocumentFallbackRate: AiModelRate = {
  id:                    "rate_global_document_fallback",
  providerId:            "global",
  modelId:               "default",
  displayName:           "Global — Document Analysis Fallback",
  usageKind:             "DOCUMENT_ANALYSIS",
  currency:              "USD",
  inputTokenCostPer1M:   3.50,
  outputTokenCostPer1M:  10.50,
  minimumProviderCostUsd: 0.0005,
  minimumCredits:        5,
  creditMarkupMultiplier: 1.5,
  effectiveFrom:         NOW,
  status:                "ACTIVE",
};

export const globalVisionFallbackRate: AiModelRate = {
  id:                    "rate_global_vision_fallback",
  providerId:            "global",
  modelId:               "default",
  displayName:           "Global — Vision Analysis Fallback",
  usageKind:             "VISION_ANALYSIS",
  currency:              "USD",
  inputTokenCostPer1M:   3.50,
  outputTokenCostPer1M:  10.50,
  imageUnitCost:         0.003,
  minimumProviderCostUsd: 0.001,
  minimumCredits:        10,
  creditMarkupMultiplier: 1.4,
  effectiveFrom:         NOW,
  status:                "ACTIVE",
};

export const globalEmbeddingFallbackRate: AiModelRate = {
  id:                    "rate_global_embedding_fallback",
  providerId:            "global",
  modelId:               "default",
  displayName:           "Global — Embedding Fallback",
  usageKind:             "EMBEDDING",
  currency:              "USD",
  inputTokenCostPer1M:   0.10,
  outputTokenCostPer1M:  0,
  minimumProviderCostUsd: 0.000001,
  minimumCredits:        1,
  creditMarkupMultiplier: 1.2,
  effectiveFrom:         NOW,
  status:                "ACTIVE",
};

export const globalAudioFallbackRate: AiModelRate = {
  id:                    "rate_global_audio_fallback",
  providerId:            "global",
  modelId:               "default",
  displayName:           "Global — Transcription Fallback",
  usageKind:             "TRANSCRIPTION",
  currency:              "USD",
  audioSecondCost:       0.0001,
  minimumProviderCostUsd: 0.001,
  minimumCredits:        2,
  creditMarkupMultiplier: 1.3,
  effectiveFrom:         NOW,
  status:                "ACTIVE",
};

export const globalJsonReasoningFallbackRate: AiModelRate = {
  id:                    "rate_global_json_reasoning_fallback",
  providerId:            "global",
  modelId:               "default",
  displayName:           "Global — JSON Reasoning Fallback",
  usageKind:             "JSON_REASONING",
  currency:              "USD",
  inputTokenCostPer1M:   5.00,
  outputTokenCostPer1M:  20.00,
  minimumProviderCostUsd: 0.0002,
  minimumCredits:        2,
  creditMarkupMultiplier: 1.5,
  effectiveFrom:         NOW,
  status:                "ACTIVE",
};

export const globalToolCallFallbackRate: AiModelRate = {
  id:                    "rate_global_tool_call_fallback",
  providerId:            "global",
  modelId:               "default",
  displayName:           "Global — Tool Call Fallback",
  usageKind:             "TOOL_CALL",
  currency:              "USD",
  inputTokenCostPer1M:   2.00,
  outputTokenCostPer1M:  8.00,
  minimumProviderCostUsd: 0.00005,
  minimumCredits:        1,
  creditMarkupMultiplier: 1.2,
  effectiveFrom:         NOW,
  status:                "ACTIVE",
};

export const globalClassificationFallbackRate: AiModelRate = {
  id:                    "rate_global_classification_fallback",
  providerId:            "global",
  modelId:               "default",
  displayName:           "Global — Classification Fallback",
  usageKind:             "CLASSIFICATION",
  currency:              "USD",
  inputTokenCostPer1M:   1.00,
  outputTokenCostPer1M:  2.00,
  minimumProviderCostUsd: 0.00001,
  minimumCredits:        1,
  creditMarkupMultiplier: 1.3,
  effectiveFrom:         NOW,
  status:                "ACTIVE",
};

// ── All rate fixtures ─────────────────────────────────────────────────────────

export const allRateFixtures: AiModelRate[] = [
  // Provider-specific exact rates
  openaiTextReasoningRate,
  openaiJsonReasoningDefaultRate,
  anthropicDocumentAnalysisRate,
  anthropicTextDefaultRate,
  googleVisionAnalysisRate,
  googleEmbeddingDefaultRate,
  runwayVideoGenerationRate,
  internalTestFallbackRate,
  // Global fallback rates (one per usageKind)
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
];

/**
 * Default in-memory registry using all fixtures.
 * Used for pure tests and as the fallback when DB is unavailable.
 */
export const defaultRateRegistry = allRateFixtures;
