/**
 * lib/ai-pricing/persistence/ai-pricing-mapper.ts
 *
 * Agentik — AI Pricing Engine — DB ↔ Domain Mapper
 * Sprint: AGENTIK-AI-PRICING-ENGINE-01
 *
 * Converts between raw DB rows and domain objects.
 * No Prisma import here — receives plain row objects.
 */

import type { AiProviderDefinition } from "../ai-provider-types";
import type { AiModelRate, AiModelRateStatus } from "../ai-model-rate-types";

// ── DB row types ──────────────────────────────────────────────────────────────

export interface DbAiProviderRow {
  id:                   string;
  name:                 string;
  kind:                 string;
  status:               string;
  defaultCurrency:      string;
  supportsTokenBilling: boolean;
  supportsUnitBilling:  boolean;
  supportsStreaming:    boolean;
  metadataJson:         unknown;
  createdAt:            Date;
  updatedAt:            Date;
}

export interface DbAiModelRateRow {
  id:                     string;
  providerId:             string;
  modelId:                string;
  displayName:            string;
  usageKind:              string;
  currency:               string;
  inputTokenCostPer1M:    unknown; // Decimal | null
  outputTokenCostPer1M:   unknown;
  imageUnitCost:          unknown;
  videoSecondCost:        unknown;
  audioSecondCost:        unknown;
  requestCost:            unknown;
  minimumProviderCostUsd: unknown;
  minimumCredits:         number;
  creditMarkupMultiplier: unknown; // Decimal
  effectiveFrom:          Date;
  effectiveTo:            Date | null;
  status:                 string;
  metadataJson:           unknown;
  createdAt:              Date;
  updatedAt:              Date;
}

// ── Decimal helper ────────────────────────────────────────────────────────────

function toNumber(val: unknown): number | undefined {
  if (val == null) return undefined;
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

function toNumberRequired(val: unknown, fallback: number): number {
  const n = toNumber(val);
  return n ?? fallback;
}

// ── Provider mapper ───────────────────────────────────────────────────────────

export function mapDbProviderToDefinition(row: DbAiProviderRow): AiProviderDefinition {
  return {
    id:                   row.id as AiProviderDefinition["id"],
    name:                 row.name,
    kind:                 row.kind as AiProviderDefinition["kind"],
    status:               row.status as AiProviderDefinition["status"],
    defaultCurrency:      row.defaultCurrency,
    supportsTokenBilling: row.supportsTokenBilling,
    supportsUnitBilling:  row.supportsUnitBilling,
    supportsStreaming:    row.supportsStreaming,
    metadata:             (row.metadataJson as Record<string, unknown>) ?? undefined,
    createdAt:            row.createdAt.toISOString(),
    updatedAt:            row.updatedAt.toISOString(),
  };
}

export function mapDefinitionToDbCreate(provider: AiProviderDefinition): Record<string, unknown> {
  return {
    id:                   provider.id,
    name:                 provider.name,
    kind:                 provider.kind,
    status:               provider.status,
    defaultCurrency:      provider.defaultCurrency,
    supportsTokenBilling: provider.supportsTokenBilling,
    supportsUnitBilling:  provider.supportsUnitBilling,
    supportsStreaming:    provider.supportsStreaming,
    metadataJson:         provider.metadata ?? null,
  };
}

// ── Model rate mapper ─────────────────────────────────────────────────────────

export function mapDbRateToModelRate(row: DbAiModelRateRow): AiModelRate {
  return {
    id:                     row.id,
    providerId:              row.providerId,
    modelId:                 row.modelId,
    displayName:             row.displayName,
    usageKind:               row.usageKind as AiModelRate["usageKind"],
    currency:                row.currency,
    inputTokenCostPer1M:     toNumber(row.inputTokenCostPer1M),
    outputTokenCostPer1M:    toNumber(row.outputTokenCostPer1M),
    imageUnitCost:           toNumber(row.imageUnitCost),
    videoSecondCost:         toNumber(row.videoSecondCost),
    audioSecondCost:         toNumber(row.audioSecondCost),
    requestCost:             toNumber(row.requestCost),
    minimumProviderCostUsd:  toNumber(row.minimumProviderCostUsd),
    minimumCredits:          row.minimumCredits,
    creditMarkupMultiplier:  toNumberRequired(row.creditMarkupMultiplier, 1.0),
    effectiveFrom:           row.effectiveFrom.toISOString(),
    effectiveTo:             row.effectiveTo?.toISOString(),
    status:                  row.status as AiModelRateStatus,
    metadata:                (row.metadataJson as Record<string, unknown>) ?? undefined,
  };
}

export function mapModelRateToDbCreate(rate: AiModelRate): Record<string, unknown> {
  return {
    id:                     rate.id,
    providerId:              rate.providerId,
    modelId:                 rate.modelId,
    displayName:             rate.displayName,
    usageKind:               rate.usageKind,
    currency:                rate.currency,
    inputTokenCostPer1M:     rate.inputTokenCostPer1M ?? null,
    outputTokenCostPer1M:    rate.outputTokenCostPer1M ?? null,
    imageUnitCost:           rate.imageUnitCost ?? null,
    videoSecondCost:         rate.videoSecondCost ?? null,
    audioSecondCost:         rate.audioSecondCost ?? null,
    requestCost:             rate.requestCost ?? null,
    minimumProviderCostUsd:  rate.minimumProviderCostUsd ?? null,
    minimumCredits:          rate.minimumCredits,
    creditMarkupMultiplier:  rate.creditMarkupMultiplier,
    effectiveFrom:           new Date(rate.effectiveFrom),
    effectiveTo:             rate.effectiveTo ? new Date(rate.effectiveTo) : null,
    status:                  rate.status,
    metadataJson:            rate.metadata ?? null,
  };
}
