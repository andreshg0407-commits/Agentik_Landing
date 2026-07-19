/**
 * lib/ai-pricing/server/ai-pricing-service.ts
 *
 * Agentik — AI Pricing Engine — Server Service
 * Sprint: AGENTIK-AI-PRICING-ENGINE-01
 *
 * SERVER-ONLY — imports Prisma repository.
 * Never import from client components or client barrels.
 */
import "server-only";

import type { AiProviderDefinition } from "../ai-provider-types";
import type { AiModelRate } from "../ai-model-rate-types";
import type { AiPricingResolutionInput, AiModelRateFilters } from "../ai-pricing-types";
import type { AiPricingResult }        from "../ai-pricing-result";
import { failedPricingResult }         from "../ai-pricing-result";
import { aiPricingPrismaRepository }   from "../persistence/ai-pricing-prisma-repository";
import { resolvePricingFromRegistry }  from "../ai-pricing-resolver";
import { allProviderFixtures, allRateFixtures } from "../ai-pricing-fixtures";
import {
  createAiPricingAuditEvent,
  auditPricingResolution,
} from "../ai-pricing-audit";
import type { AiPricingAuditEvent } from "../ai-pricing-audit";

// ── Service ───────────────────────────────────────────────────────────────────

export const aiPricingService = {

  /**
   * Resolve pricing for a usage event.
   *
   * Pipeline:
   *   1. Load active rates from DB
   *   2. Walk fallback chain: exact → provider default → usageKind → global
   *   3. Calculate providerCostUsd and creditsUsed
   *   4. Return AiPricingResult
   *
   * Never throws. Returns failedPricingResult on error.
   */
  async resolvePricing(input: AiPricingResolutionInput): Promise<AiPricingResult> {
    try {
      // Load all active rates for the relevant provider + global fallbacks
      const [providerRates, globalRates] = await Promise.all([
        aiPricingPrismaRepository.listModelRates({
          providerId: input.providerId,
          status: "ACTIVE",
          at: input.at,
        }),
        aiPricingPrismaRepository.listModelRates({
          providerId: "global",
          status: "ACTIVE",
          at: input.at,
        }),
      ]);

      const registry: AiModelRate[] = [...providerRates, ...globalRates];

      if (registry.length === 0) {
        // Fall back to fixture registry if DB has no rates
        return resolvePricingFromRegistry(input, allRateFixtures);
      }

      return resolvePricingFromRegistry(input, registry);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unexpected error resolving pricing";
      return failedPricingResult(msg);
    }
  },

  /**
   * Seed default providers and rates into the DB.
   * Idempotent — safe to run multiple times.
   */
  async seedDefaultProvidersAndRates(): Promise<{
    providersSeeded: number;
    ratesSeeded:     number;
    errors:          string[];
  }> {
    const errors: string[] = [];
    let providersSeeded = 0;
    let ratesSeeded     = 0;

    for (const provider of allProviderFixtures) {
      try {
        await aiPricingPrismaRepository.upsertProvider(provider);
        providersSeeded++;
      } catch (err) {
        errors.push(`Provider ${provider.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Ensure "global" pseudo-provider exists
    try {
      await aiPricingPrismaRepository.upsertProvider({
        id:                  "global",
        name:                "Global Fallback",
        kind:                "INTERNAL",
        status:              "ACTIVE",
        defaultCurrency:     "USD",
        supportsTokenBilling: true,
        supportsUnitBilling:  true,
        supportsStreaming:    false,
        createdAt:            new Date().toISOString(),
        updatedAt:            new Date().toISOString(),
      });
    } catch {
      // global provider may already exist from migration
    }

    for (const rate of allRateFixtures) {
      try {
        await aiPricingPrismaRepository.upsertModelRate(rate);
        ratesSeeded++;
      } catch (err) {
        errors.push(`Rate ${rate.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { providersSeeded, ratesSeeded, errors };
  },

  /** Insert or update a provider. */
  async upsertProvider(provider: AiProviderDefinition): Promise<AiProviderDefinition> {
    return aiPricingPrismaRepository.upsertProvider(provider);
  },

  /** Insert or update a model rate. */
  async upsertModelRate(rate: AiModelRate): Promise<AiModelRate> {
    return aiPricingPrismaRepository.upsertModelRate(rate);
  },

  /** List all active rates. */
  async listActiveRates(): Promise<AiModelRate[]> {
    const filters: AiModelRateFilters = { status: "ACTIVE", at: new Date().toISOString() };
    return aiPricingPrismaRepository.listModelRates(filters);
  },

  /** Return an audit summary for the current pricing configuration. */
  async getPricingAuditSummary(): Promise<{
    providers: AiProviderDefinition[];
    rates:     AiModelRate[];
    events:    AiPricingAuditEvent[];
  }> {
    const [providers, rates] = await Promise.all([
      aiPricingPrismaRepository.listProviders(),
      this.listActiveRates(),
    ]);

    const events: AiPricingAuditEvent[] = [];

    // Warn about deprecated providers
    for (const p of providers) {
      if (p.status === "DEPRECATED") {
        events.push(createAiPricingAuditEvent(
          "provider_deprecated_used",
          `Provider "${p.id}" is DEPRECATED`,
          { providerId: p.id },
        ));
      }
    }

    // Warn about expired rates
    const now = new Date().toISOString();
    for (const r of rates) {
      if (r.effectiveTo && r.effectiveTo < now) {
        events.push(createAiPricingAuditEvent(
          "model_rate_expired",
          `Rate "${r.id}" expired at ${r.effectiveTo}`,
          { rateId: r.id, effectiveTo: r.effectiveTo },
        ));
      }
    }

    return { providers, rates, events };
  },
};
