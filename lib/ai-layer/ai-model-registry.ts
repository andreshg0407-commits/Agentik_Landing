/**
 * lib/ai-layer/ai-model-registry.ts
 *
 * Agentik — AI Layer Foundation — Model Registry
 * Sprint: AGENTIK-AI-LAYER-FOUNDATION-01
 *
 * Pure domain. No Prisma. No React. No server-only. Client-safe.
 *
 * Catalog of all AI models available to the routing engine.
 * This is a static registry — no DB calls. Model availability
 * is toggled via the `available` field.
 */

import type { AIModelDefinition, AIModelId, AIProviderId, AICapability } from "./ai-layer-types";

// ── Model definitions ─────────────────────────────────────────────────────────

const AI_MODEL_CATALOG: AIModelDefinition[] = [
  // ── OpenAI ──────────────────────────────────────────────────────────────────
  {
    id: "gpt-4.5",
    displayName: "GPT-4.5",
    providerId: "openai",
    capabilities: [
      "TEXT_GENERATION",
      "JSON_OUTPUT",
      "VISION",
      "DOCUMENT_ANALYSIS",
      "FUNCTION_CALLING",
      "LONG_CONTEXT",
    ],
    contextWindowTokens: 128_000,
    maxOutputTokens: 16_384,
    qualityScore: 9,
    latencyScore: 6,
    available: true,
    isMock: true,
    defaultUsageKind: "TEXT_GENERATION",
  },
  {
    id: "gpt-4o-mini",
    displayName: "GPT-4o Mini",
    providerId: "openai",
    capabilities: [
      "TEXT_GENERATION",
      "JSON_OUTPUT",
      "VISION",
      "FUNCTION_CALLING",
    ],
    contextWindowTokens: 128_000,
    maxOutputTokens: 16_384,
    qualityScore: 6,
    latencyScore: 9,
    available: true,
    isMock: true,
    defaultUsageKind: "TEXT_GENERATION",
  },

  // ── Anthropic ────────────────────────────────────────────────────────────────
  {
    id: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    providerId: "anthropic",
    capabilities: [
      "TEXT_GENERATION",
      "JSON_OUTPUT",
      "VISION",
      "DOCUMENT_ANALYSIS",
      "FUNCTION_CALLING",
      "LONG_CONTEXT",
    ],
    contextWindowTokens: 200_000,
    maxOutputTokens: 8_192,
    qualityScore: 9,
    latencyScore: 7,
    available: true,
    isMock: true,
    defaultUsageKind: "TEXT_GENERATION",
  },
  {
    id: "claude-opus-4-6",
    displayName: "Claude Opus 4.6",
    providerId: "anthropic",
    capabilities: [
      "TEXT_GENERATION",
      "JSON_OUTPUT",
      "VISION",
      "DOCUMENT_ANALYSIS",
      "FUNCTION_CALLING",
      "LONG_CONTEXT",
    ],
    contextWindowTokens: 200_000,
    maxOutputTokens: 8_192,
    qualityScore: 10,
    latencyScore: 5,
    available: true,
    isMock: true,
    defaultUsageKind: "TEXT_GENERATION",
  },

  // ── Google ───────────────────────────────────────────────────────────────────
  {
    id: "gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash",
    providerId: "google",
    capabilities: [
      "TEXT_GENERATION",
      "JSON_OUTPUT",
      "VISION",
      "DOCUMENT_ANALYSIS",
      "FUNCTION_CALLING",
      "LONG_CONTEXT",
    ],
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 8_192,
    qualityScore: 8,
    latencyScore: 10,
    available: true,
    isMock: true,
    defaultUsageKind: "TEXT_GENERATION",
  },
  {
    id: "gemini-1.5-pro",
    displayName: "Gemini 1.5 Pro",
    providerId: "google",
    capabilities: [
      "TEXT_GENERATION",
      "JSON_OUTPUT",
      "VISION",
      "DOCUMENT_ANALYSIS",
      "FUNCTION_CALLING",
      "LONG_CONTEXT",
      "AUDIO_TRANSCRIPTION",
    ],
    contextWindowTokens: 2_000_000,
    maxOutputTokens: 8_192,
    qualityScore: 8,
    latencyScore: 6,
    available: true,
    isMock: true,
    defaultUsageKind: "TEXT_GENERATION",
  },

  // ── Runway ───────────────────────────────────────────────────────────────────
  {
    id: "runway-gen4",
    displayName: "Runway Gen-4",
    providerId: "runway",
    capabilities: ["VIDEO_GENERATION"],
    contextWindowTokens: 0,
    maxOutputTokens: 0,
    qualityScore: 9,
    latencyScore: 4,
    available: true,
    isMock: true,
    defaultUsageKind: "VIDEO_GENERATION",
  },

  // ── Internal mock ─────────────────────────────────────────────────────────────
  {
    id: "mock-text",
    displayName: "Mock Text (Internal)",
    providerId: "internal_mock",
    capabilities: ["TEXT_GENERATION", "JSON_OUTPUT"],
    contextWindowTokens: 128_000,
    maxOutputTokens: 8_192,
    qualityScore: 1,
    latencyScore: 10,
    available: true,
    isMock: true,
    defaultUsageKind: "TEXT_GENERATION",
  },
  {
    id: "mock-vision",
    displayName: "Mock Vision (Internal)",
    providerId: "internal_mock",
    capabilities: ["VISION", "DOCUMENT_ANALYSIS"],
    contextWindowTokens: 128_000,
    maxOutputTokens: 8_192,
    qualityScore: 1,
    latencyScore: 10,
    available: true,
    isMock: true,
    defaultUsageKind: "VISION_ANALYSIS",
  },
  {
    id: "mock-embedding",
    displayName: "Mock Embedding (Internal)",
    providerId: "internal_mock",
    capabilities: ["EMBEDDING"],
    contextWindowTokens: 8_192,
    maxOutputTokens: 0,
    qualityScore: 1,
    latencyScore: 10,
    available: true,
    isMock: true,
    defaultUsageKind: "EMBEDDING",
  },
];

// ── Registry interface ────────────────────────────────────────────────────────

export const aiModelRegistry = {
  /**
   * Get all available model definitions.
   */
  getAll(): AIModelDefinition[] {
    return AI_MODEL_CATALOG;
  },

  /**
   * Get available models only (available=true).
   */
  getAvailable(): AIModelDefinition[] {
    return AI_MODEL_CATALOG.filter(m => m.available);
  },

  /**
   * Find a model by ID.
   */
  getById(id: AIModelId): AIModelDefinition | undefined {
    return AI_MODEL_CATALOG.find(m => m.id === id);
  },

  /**
   * Get all models for a provider.
   */
  getByProvider(providerId: AIProviderId): AIModelDefinition[] {
    return AI_MODEL_CATALOG.filter(m => m.providerId === providerId && m.available);
  },

  /**
   * Get all models that support all required capabilities.
   */
  getCapable(required: AICapability[]): AIModelDefinition[] {
    return AI_MODEL_CATALOG.filter(
      m => m.available && required.every(cap => m.capabilities.includes(cap)),
    );
  },

  /**
   * Get all non-mock models (real provider adapters).
   */
  getRealModels(): AIModelDefinition[] {
    return AI_MODEL_CATALOG.filter(m => m.available && !m.isMock);
  },

  /**
   * Get all mock models.
   */
  getMockModels(): AIModelDefinition[] {
    return AI_MODEL_CATALOG.filter(m => m.available && m.isMock);
  },
};
