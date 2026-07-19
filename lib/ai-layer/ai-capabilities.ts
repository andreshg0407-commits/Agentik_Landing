/**
 * lib/ai-layer/ai-capabilities.ts
 *
 * Agentik — AI Layer Foundation — Capability Registry
 * Sprint: AGENTIK-AI-LAYER-FOUNDATION-01
 *
 * Pure domain. No Prisma. No React. No server-only. Client-safe.
 *
 * Defines the full set of AI capabilities with metadata:
 * display labels, billing kind, and typical use cases.
 */

import type { AICapability } from "./ai-layer-types";

// ── Capability metadata ───────────────────────────────────────────────────────

export interface AICapabilityMeta {
  id: AICapability;
  label: string;
  description: string;
  /** AiUsageKind this capability maps to for pricing. */
  pricingUsageKind: string;
  /** Whether this capability generates tokens (vs. units). */
  isTokenBased: boolean;
}

export const AI_CAPABILITY_REGISTRY: Record<AICapability, AICapabilityMeta> = {
  TEXT_GENERATION: {
    id: "TEXT_GENERATION",
    label: "Text Generation",
    description: "Generate prose, summaries, and narrative text.",
    pricingUsageKind: "TEXT_GENERATION",
    isTokenBased: true,
  },
  JSON_OUTPUT: {
    id: "JSON_OUTPUT",
    label: "JSON Output",
    description: "Generate structured JSON responses with schema conformance.",
    pricingUsageKind: "JSON_REASONING",
    isTokenBased: true,
  },
  VISION: {
    id: "VISION",
    label: "Vision Analysis",
    description: "Analyze images and answer questions about visual content.",
    pricingUsageKind: "VISION_ANALYSIS",
    isTokenBased: true,
  },
  DOCUMENT_ANALYSIS: {
    id: "DOCUMENT_ANALYSIS",
    label: "Document Analysis",
    description: "Parse, extract, and reason over structured documents (PDFs, invoices, etc.).",
    pricingUsageKind: "DOCUMENT_ANALYSIS",
    isTokenBased: true,
  },
  FUNCTION_CALLING: {
    id: "FUNCTION_CALLING",
    label: "Function Calling",
    description: "Call structured tools and APIs from model reasoning.",
    pricingUsageKind: "TOOL_CALL",
    isTokenBased: true,
  },
  EMBEDDING: {
    id: "EMBEDDING",
    label: "Embedding",
    description: "Generate dense vector embeddings for semantic search.",
    pricingUsageKind: "EMBEDDING",
    isTokenBased: true,
  },
  IMAGE_GENERATION: {
    id: "IMAGE_GENERATION",
    label: "Image Generation",
    description: "Generate images from text prompts.",
    pricingUsageKind: "IMAGE_GENERATION",
    isTokenBased: false,
  },
  VIDEO_GENERATION: {
    id: "VIDEO_GENERATION",
    label: "Video Generation",
    description: "Generate video clips from text or image prompts.",
    pricingUsageKind: "VIDEO_GENERATION",
    isTokenBased: false,
  },
  AUDIO_TRANSCRIPTION: {
    id: "AUDIO_TRANSCRIPTION",
    label: "Audio Transcription",
    description: "Transcribe spoken audio to text.",
    pricingUsageKind: "TRANSCRIPTION",
    isTokenBased: false,
  },
  LONG_CONTEXT: {
    id: "LONG_CONTEXT",
    label: "Long Context",
    description: "Process very large documents or conversation histories (>32K tokens).",
    pricingUsageKind: "DOCUMENT_ANALYSIS",
    isTokenBased: true,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getCapabilityMeta(cap: AICapability): AICapabilityMeta {
  return AI_CAPABILITY_REGISTRY[cap];
}

export function getPricingUsageKind(cap: AICapability): string {
  return AI_CAPABILITY_REGISTRY[cap]?.pricingUsageKind ?? "TEXT_GENERATION";
}

/**
 * Given a set of required capabilities, pick the primary one for pricing.
 * Priority: most specific/expensive first.
 */
const CAPABILITY_PRIORITY: AICapability[] = [
  "VIDEO_GENERATION",
  "IMAGE_GENERATION",
  "AUDIO_TRANSCRIPTION",
  "EMBEDDING",
  "DOCUMENT_ANALYSIS",
  "FUNCTION_CALLING",
  "VISION",
  "LONG_CONTEXT",
  "JSON_OUTPUT",
  "TEXT_GENERATION",
];

export function primaryCapability(caps: AICapability[]): AICapability {
  for (const cap of CAPABILITY_PRIORITY) {
    if (caps.includes(cap)) return cap;
  }
  return "TEXT_GENERATION";
}

/**
 * Check if a model's capabilities satisfy all required capabilities.
 */
export function satisfiesCapabilities(
  modelCapabilities: AICapability[],
  required: AICapability[],
): boolean {
  return required.every(cap => modelCapabilities.includes(cap));
}
