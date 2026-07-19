/**
 * lib/ai-pricing/persistence/ai-pricing-prisma-repository.ts
 *
 * Agentik — AI Pricing Engine — Prisma Persistence
 * Sprint: AGENTIK-AI-PRICING-ENGINE-01
 *
 * SERVER-ONLY — imports Prisma.
 * Never import from client components or client barrels.
 */
import "server-only";

import { prisma }           from "../../prisma";
import type { AiPricingRepository } from "./ai-pricing-repository";
import type { AiProviderDefinition } from "../ai-provider-types";
import type { AiModelRate } from "../ai-model-rate-types";
import type { AiProviderFilters, AiModelRateFilters } from "../ai-pricing-types";
import {
  mapDbProviderToDefinition,
  mapDefinitionToDbCreate,
  mapDbRateToModelRate,
  mapModelRateToDbCreate,
} from "./ai-pricing-mapper";

// Prisma client does not know about AiProvider/AiModelRate until
// `prisma generate` is run. Use (prisma as any) to avoid type errors
// while keeping runtime correctness. The actual DB schema guarantees safety.
const db = prisma as unknown as {
  aiProvider:  { findUnique: Function; findMany: Function; upsert: Function };
  aiModelRate: { findUnique: Function; findMany: Function; upsert: Function };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function activeAtClause(at?: string) {
  const atDate = at ? new Date(at) : new Date();
  return {
    effectiveFrom: { lte: atDate },
    OR: [
      { effectiveTo: null },
      { effectiveTo: { gte: atDate } },
    ],
  };
}

// ── Repository implementation ─────────────────────────────────────────────────

export const aiPricingPrismaRepository: AiPricingRepository = {

  async upsertProvider(provider: AiProviderDefinition): Promise<AiProviderDefinition> {
    const data = mapDefinitionToDbCreate(provider);
    const row = await db.aiProvider.upsert({
      where:  { id: provider.id },
      create: data,
      update: {
        name:                 data.name,
        kind:                 data.kind,
        status:               data.status,
        defaultCurrency:      data.defaultCurrency,
        supportsTokenBilling: data.supportsTokenBilling,
        supportsUnitBilling:  data.supportsUnitBilling,
        supportsStreaming:    data.supportsStreaming,
        metadataJson:         data.metadataJson,
      },
    });
    return mapDbProviderToDefinition(row);
  },

  async listProviders(filters?: AiProviderFilters): Promise<AiProviderDefinition[]> {
    const where: Record<string, unknown> = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.kind)   where.kind   = filters.kind;
    const rows = await db.aiProvider.findMany({ where, orderBy: { name: "asc" } });
    return rows.map(mapDbProviderToDefinition);
  },

  async getProvider(providerId: string): Promise<AiProviderDefinition | null> {
    const row = await db.aiProvider.findUnique({ where: { id: providerId } });
    return row ? mapDbProviderToDefinition(row) : null;
  },

  async upsertModelRate(rate: AiModelRate): Promise<AiModelRate> {
    const data = mapModelRateToDbCreate(rate);
    const row = await db.aiModelRate.upsert({
      where:  { id: rate.id },
      create: data,
      update: {
        displayName:             data.displayName,
        usageKind:               data.usageKind,
        currency:                data.currency,
        inputTokenCostPer1M:     data.inputTokenCostPer1M,
        outputTokenCostPer1M:    data.outputTokenCostPer1M,
        imageUnitCost:           data.imageUnitCost,
        videoSecondCost:         data.videoSecondCost,
        audioSecondCost:         data.audioSecondCost,
        requestCost:             data.requestCost,
        minimumProviderCostUsd:  data.minimumProviderCostUsd,
        minimumCredits:          data.minimumCredits,
        creditMarkupMultiplier:  data.creditMarkupMultiplier,
        effectiveFrom:           data.effectiveFrom,
        effectiveTo:             data.effectiveTo,
        status:                  data.status,
        metadataJson:            data.metadataJson,
      },
    });
    return mapDbRateToModelRate(row);
  },

  async listModelRates(filters?: AiModelRateFilters): Promise<AiModelRate[]> {
    const where: Record<string, unknown> = {};
    if (filters?.providerId) where.providerId = filters.providerId;
    if (filters?.modelId)    where.modelId    = filters.modelId;
    if (filters?.usageKind)  where.usageKind  = filters.usageKind;
    if (filters?.status)     where.status     = filters.status;
    if (filters?.at) {
      Object.assign(where, activeAtClause(filters.at));
    }
    const rows = await db.aiModelRate.findMany({ where, orderBy: { effectiveFrom: "desc" } });
    return rows.map(mapDbRateToModelRate);
  },

  async getActiveRate(
    providerId: string,
    modelId:    string,
    usageKind:  string,
    at?:        string,
  ): Promise<AiModelRate | null> {
    const row = await db.aiModelRate.findMany({
      where: {
        providerId,
        modelId,
        usageKind,
        status:  "ACTIVE",
        ...activeAtClause(at),
      },
      orderBy: { effectiveFrom: "desc" },
    });
    return row[0] ? mapDbRateToModelRate(row[0]) : null;
  },

  async getProviderDefaultRate(
    providerId: string,
    usageKind:  string,
    at?:        string,
  ): Promise<AiModelRate | null> {
    return this.getActiveRate(providerId, "default", usageKind, at);
  },

  async getUsageKindFallbackRate(
    usageKind: string,
    at?:       string,
  ): Promise<AiModelRate | null> {
    return this.getActiveRate("global", "default", usageKind, at);
  },
};
