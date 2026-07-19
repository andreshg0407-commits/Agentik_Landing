/**
 * lib/ai-layer/ai-layer-types.ts
 *
 * Agentik — AI Layer Foundation — Core Domain Types
 * Sprint: AGENTIK-AI-LAYER-FOUNDATION-01
 *
 * Pure domain. No Prisma. No React. No server-only. Client-safe.
 *
 * All AI calls in Agentik must go through the AI Layer.
 * Modules NEVER call provider SDKs directly.
 */

// ── Provider IDs ──────────────────────────────────────────────────────────────

export type AIProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "runway"
  | "internal_mock"
  | (string & {});

// ── Model IDs ─────────────────────────────────────────────────────────────────

export type AIModelId =
  | "gpt-4.5"
  | "gpt-4o-mini"
  | "claude-sonnet-4-6"
  | "claude-opus-4-6"
  | "gemini-2.0-flash"
  | "gemini-1.5-pro"
  | "runway-gen4"
  | "mock-text"
  | "mock-vision"
  | "mock-embedding"
  | (string & {});

// ── AI Capabilities ───────────────────────────────────────────────────────────

/**
 * A discrete capability that a model can provide.
 * Routing decisions are made based on required capabilities.
 */
export type AICapability =
  | "TEXT_GENERATION"
  | "JSON_OUTPUT"
  | "VISION"
  | "DOCUMENT_ANALYSIS"
  | "FUNCTION_CALLING"
  | "EMBEDDING"
  | "IMAGE_GENERATION"
  | "VIDEO_GENERATION"
  | "AUDIO_TRANSCRIPTION"
  | "LONG_CONTEXT";

// ── Routing strategy ──────────────────────────────────────────────────────────

export type AIRoutingStrategy =
  | "CHEAPEST"       // minimize credit cost
  | "FASTEST"        // minimize latency (mock: always fastest available)
  | "BEST_QUALITY"   // maximize capability match
  | "TENANT_PINNED"  // use tenant's preferred provider/model
  | "ROUND_ROBIN";   // distribute across capable models

// ── AI Request ────────────────────────────────────────────────────────────────

export interface AIRequest {
  /** Caller module identifier — for audit and billing attribution. */
  callerModule: string;

  /** Organization slug for tenant billing and preferences. */
  orgSlug: string;

  /** Required capabilities for this request. */
  requiredCapabilities: AICapability[];

  /** Optional hint — prefer a specific provider. */
  preferredProviderId?: AIProviderId;

  /** Optional hint — prefer a specific model. */
  preferredModelId?: AIModelId;

  /** Routing strategy. Default: BEST_QUALITY. */
  routingStrategy?: AIRoutingStrategy;

  // ── Prompt ────────────────────────────────────────────────────────────────

  /** System prompt / instructions. */
  systemPrompt?: string;

  /** User prompt / main input. */
  userPrompt: string;

  /** Additional messages for multi-turn (not used in mock). */
  messages?: AIMessage[];

  // ── Output constraints ────────────────────────────────────────────────────

  /** Maximum output tokens. */
  maxOutputTokens?: number;

  /** Temperature (0-1). Default: 0 for determinism. */
  temperature?: number;

  /** Whether to force JSON output. */
  jsonMode?: boolean;

  // ── Context ───────────────────────────────────────────────────────────────

  /** Idempotency key for deduplication (optional). */
  idempotencyKey?: string;

  /** Arbitrary metadata for audit. */
  metadata?: Record<string, unknown>;
}

// ── Messages ──────────────────────────────────────────────────────────────────

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ── AI Response ───────────────────────────────────────────────────────────────

export interface AIResponse {
  /** Whether the request succeeded. */
  success: boolean;

  /**
   * Request ID for correlation with audit logs and billing records.
   * Always present — set even on failure.
   */
  requestId?: string;

  /** Generated text content. */
  content?: string;

  /** Parsed JSON content (only if jsonMode=true and parsing succeeded). */
  parsedJson?: unknown;

  /** Usage statistics for billing. */
  usage?: AIUsage;

  /** Execution metadata (model used, routing decision, timing). */
  executionMetadata?: AIExecutionMetadata;

  /** Error if success=false. */
  error?: string;

  /** Non-fatal warnings. */
  warnings?: string[];
}

// ── AI Usage ─────────────────────────────────────────────────────────────────

export interface AIUsage {
  /** Input tokens consumed (for LLM calls). */
  inputTokens: number;

  /** Output tokens generated (for LLM calls). */
  outputTokens: number;

  /** Image units generated (for image generation). */
  imageUnits?: number;

  /** Video seconds generated (for video generation). */
  videoSeconds?: number;

  /** Audio seconds transcribed (for transcription). */
  audioSeconds?: number;

  /** Number of API requests (for per-request billing). */
  requestCount: number;
}

// ── AI Execution Metadata ─────────────────────────────────────────────────────

export interface AIExecutionMetadata {
  /** Provider that was used. */
  providerId: AIProviderId;

  /** Model that was used. */
  modelId: AIModelId;

  /** Routing strategy applied. */
  routingStrategy: AIRoutingStrategy;

  /** Reason the selected model was chosen. */
  routingReason: string;

  /** Credits charged to the tenant. */
  creditsCharged: number;

  /** Estimated provider cost in USD (internal only, never expose to tenants). */
  estimatedCostUsd: number;

  /** Wall-clock execution time in ms (simulated for mocks). */
  durationMs: number;

  /** Whether the adapter was a mock (no real provider call). */
  isMock: boolean;

  /** Caller module for audit trail. */
  callerModule: string;

  /** ISO timestamp of execution. */
  executedAt: string;

  // ── Billing bridge fields ─────────────────────────────────────────────────
  // These fields enable recordAiUsageWithResolvedPricing() to connect
  // without redesigning AIExecutionMetadata. Required for AGENTIK-AI-LAYER-BILLING-BRIDGE-01.

  /**
   * Primary usage kind resolved for this call (maps to AiUsageKind in ai-pricing).
   * Derived from requiredCapabilities via primaryCapability() + getPricingUsageKind().
   */
  usageKind?: string;

  /**
   * Source of the credit estimate used for this call.
   * MOCK_ESTIMATE = no pricing engine available, used hardcoded table.
   * ENGINE        = pricing engine resolved a rate successfully.
   * FALLBACK      = pricing engine failed, used mock estimate as fallback.
   */
  pricingSource?: "MOCK_ESTIMATE" | "ENGINE" | "FALLBACK";

  /**
   * Rate ID from the pricing engine (AiModelRate.id).
   * Only present when pricingSource = "ENGINE".
   */
  pricingRateId?: string;
}

// ── Model capability map ──────────────────────────────────────────────────────

export interface AIModelDefinition {
  /** Unique model identifier. */
  id: AIModelId;

  /** Human-readable label. */
  displayName: string;

  /** Provider this model belongs to. */
  providerId: AIProviderId;

  /** Capabilities this model supports. */
  capabilities: AICapability[];

  /** Context window in tokens. */
  contextWindowTokens: number;

  /** Max output tokens. */
  maxOutputTokens: number;

  /** Relative quality score (1-10). Used for BEST_QUALITY routing. */
  qualityScore: number;

  /** Relative latency score (1-10, higher = faster). Used for FASTEST routing. */
  latencyScore: number;

  /** Whether this model is available for routing. */
  available: boolean;

  /** Whether this is a mock adapter (no real provider call). */
  isMock: boolean;

  /**
   * AiUsageKind for pricing resolution.
   * Must match ai-pricing/ai-pricing-types.ts AiUsageKind exactly.
   */
  defaultUsageKind: string;
}

// ── Routing candidate ─────────────────────────────────────────────────────────

export interface AIRoutingCandidate {
  model: AIModelDefinition;
  /** Estimated credits for this call (from pricing engine or mock). */
  estimatedCredits: number;
}

// ── Tenant AI preferences ─────────────────────────────────────────────────────

export interface AITenantPreferences {
  orgSlug: string;

  /** Preferred provider override. Null = no preference. */
  preferredProviderId?: AIProviderId;

  /** Preferred model override. Null = no preference. */
  preferredModelId?: AIModelId;

  /** Max credits per single AI call. 0 = no limit. */
  maxCreditsPerCall?: number;

  /**
   * Provider allowlist. Empty = all providers allowed.
   * Any provider NOT in this list is excluded from routing.
   */
  allowedProviderIds?: AIProviderId[];

  /**
   * Provider blocklist. Takes precedence over allowedProviderIds.
   * Any provider in this list is always excluded, even if also in allowedProviderIds.
   */
  blockedProviderIds?: AIProviderId[];

  /**
   * Model blocklist. Any model in this list is always excluded from routing.
   */
  blockedModelIds?: AIModelId[];

  /** Whether to use mock adapters only (useful for testing environments). */
  forceMockAdapters?: boolean;
}
