/**
 * lib/ai-pricing/persistence/ai-pricing-repository.ts
 *
 * Agentik — AI Pricing Engine — Repository Interface
 * Sprint: AGENTIK-AI-PRICING-ENGINE-01
 *
 * Defines the persistence contract for AI pricing data.
 * Implementations: ai-pricing-prisma-repository.ts
 */

import type { AiProviderDefinition } from "../ai-provider-types";
import type { AiModelRate } from "../ai-model-rate-types";
import type { AiProviderFilters, AiModelRateFilters } from "../ai-pricing-types";

export interface AiPricingRepository {
  // ── Providers ─────────────────────────────────────────────────────────────

  /** Insert or update a provider record. */
  upsertProvider(provider: AiProviderDefinition): Promise<AiProviderDefinition>;

  /** List providers, optionally filtered. */
  listProviders(filters?: AiProviderFilters): Promise<AiProviderDefinition[]>;

  /** Get a single provider by id. Returns null if not found. */
  getProvider(providerId: string): Promise<AiProviderDefinition | null>;

  // ── Model rates ────────────────────────────────────────────────────────────

  /** Insert or update a model rate. */
  upsertModelRate(rate: AiModelRate): Promise<AiModelRate>;

  /** List rates, optionally filtered. */
  listModelRates(filters?: AiModelRateFilters): Promise<AiModelRate[]>;

  /**
   * Get the active exact rate for provider+model+usageKind at a given time.
   * Returns null if no active rate exists.
   */
  getActiveRate(
    providerId: string,
    modelId:    string,
    usageKind:  string,
    at?:        string,
  ): Promise<AiModelRate | null>;

  /**
   * Get the provider default rate (modelId = "default") for a usageKind.
   * Returns null if not found.
   */
  getProviderDefaultRate(
    providerId: string,
    usageKind:  string,
    at?:        string,
  ): Promise<AiModelRate | null>;

  /**
   * Get the global usageKind fallback rate (providerId = "global").
   * Returns null if not found.
   */
  getUsageKindFallbackRate(
    usageKind: string,
    at?:       string,
  ): Promise<AiModelRate | null>;
}
