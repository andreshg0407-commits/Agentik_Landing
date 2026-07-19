/**
 * lib/ai-pricing/ai-provider-types.ts
 *
 * Agentik — AI Pricing Engine — Provider Type Definitions
 * Sprint: AGENTIK-AI-PRICING-ENGINE-01
 *
 * Pure domain. No Prisma. No React. No server-only. Client-safe.
 */

// ── Provider identifiers ───────────────────────────────────────────────────────

export type AiProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "runway"
  | "internal_test"
  | (string & {});

// ── Provider status ───────────────────────────────────────────────────────────

export type AiProviderStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "DEPRECATED"
  | "TEST_ONLY";

// ── Provider kind ─────────────────────────────────────────────────────────────

export type AiProviderKind =
  | "LLM"
  | "IMAGE"
  | "VIDEO"
  | "AUDIO"
  | "EMBEDDING"
  | "MULTIMODAL"
  | "ROUTER"
  | "INTERNAL";

// ── Provider definition ───────────────────────────────────────────────────────

/**
 * Describes an AI provider in the Agentik pricing engine.
 * This is a pure domain object — it has no API credentials.
 * Credentials live in the vault; this is pricing metadata only.
 */
export interface AiProviderDefinition {
  /** Unique identifier, e.g. "openai", "anthropic", "google". */
  id: AiProviderId;

  /** Human-readable display name. */
  name: string;

  /** Primary capability kind. */
  kind: AiProviderKind;

  /** Operational status. */
  status: AiProviderStatus;

  /** Currency for rates (always "USD" for now). */
  defaultCurrency: string;

  /** Whether provider charges per token. */
  supportsTokenBilling: boolean;

  /** Whether provider charges per unit (image, video second, etc.). */
  supportsUnitBilling: boolean;

  /** Whether provider supports streaming responses. */
  supportsStreaming: boolean;

  /** Arbitrary metadata. */
  metadata?: Record<string, unknown>;

  /** ISO timestamp. */
  createdAt: string;

  /** ISO timestamp. */
  updatedAt: string;
}
