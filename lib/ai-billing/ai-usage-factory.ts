/**
 * lib/ai-billing/ai-usage-factory.ts
 *
 * Agentik — AI Billing Foundation — Usage Record Factories
 * Sprint: AGENTIK-AI-BILLING-FOUNDATION-01
 *
 * Integration helpers for future AI Layer connections.
 * These are pure factories — they build AiUsageRecord objects
 * without persisting anything.
 *
 * Pure domain. No Prisma. No React. No server-only. Client-safe.
 */

import type { AiUsageRecord }     from "./ai-usage-types";
import type { AiUsageKind }       from "./ai-billing-types";
import { toAiUsageId }            from "./ai-billing-types";
import { calculateCreditsUsed, calculateEstimatedCostUsd, calculateTokenTotals } from "./ai-billing-calculator";

// ── Base factory ──────────────────────────────────────────────────────────────

function makeUsageId(): string {
  return `usage_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// ── Generic AI call ───────────────────────────────────────────────────────────

export interface AiCallParams {
  orgSlug:      string;
  featureKey:   string;
  usageKind:    AiUsageKind;
  provider:     string;
  model:        string;
  inputTokens:  number;
  outputTokens: number;
  imageUnits?:  number;
  videoSeconds?: number;
  audioSeconds?: number;
  moduleSlug?:  string;
  agentId?:     string;
  agentDisplayName?: string;
  metadata?:    Record<string, unknown>;
}

/**
 * Build an AiUsageRecord from a raw AI provider call result.
 * Called by the future AI Layer after each provider response.
 */
export function createUsageRecordFromAiCall(params: AiCallParams): AiUsageRecord {
  const { inputTokens, outputTokens } = calculateTokenTotals(params.inputTokens, params.outputTokens);
  const totalTokens = inputTokens + outputTokens;
  const costUsd     = calculateEstimatedCostUsd({ ...params, inputTokens, outputTokens });
  const creditsUsed = calculateCreditsUsed({ ...params, inputTokens, outputTokens });

  return {
    id:               toAiUsageId(makeUsageId()),
    orgSlug:          params.orgSlug,
    moduleSlug:       params.moduleSlug,
    agentId:          params.agentId,
    agentDisplayName: params.agentDisplayName,
    featureKey:       params.featureKey,
    provider:         params.provider,
    model:            params.model,
    usageKind:        params.usageKind,
    inputTokens,
    outputTokens,
    totalTokens,
    imageUnits:       params.imageUnits,
    videoSeconds:     params.videoSeconds,
    audioSeconds:     params.audioSeconds,
    requestCount:     1,
    costUsd,
    costMode:         "ESTIMATED",
    creditsUsed,
    status:           "RECORDED",
    metadata:         params.metadata,
    createdAt:        new Date().toISOString(),
  };
}

// ── Agent Runtime ─────────────────────────────────────────────────────────────

export interface AgentRuntimeUsageParams {
  orgSlug:       string;
  agentId:       string;
  agentDisplayName?: string;
  moduleSlug?:   string;
  featureKey:    string;
  usageKind?:    AiUsageKind;
  inputTokens?:  number;
  outputTokens?: number;
  metadata?:     Record<string, unknown>;
}

/**
 * Build an AiUsageRecord from an Agent Runtime execution.
 * Called after executeGoal() returns in the future AI Layer bridge.
 */
export function createUsageRecordFromAgentRuntime(params: AgentRuntimeUsageParams): AiUsageRecord {
  return createUsageRecordFromAiCall({
    orgSlug:          params.orgSlug,
    agentId:          params.agentId,
    agentDisplayName: params.agentDisplayName,
    moduleSlug:       params.moduleSlug,
    featureKey:       params.featureKey,
    usageKind:        params.usageKind ?? "TEXT_GENERATION",
    provider:         "mock",
    model:            "mock-v1",
    inputTokens:      params.inputTokens  ?? 0,
    outputTokens:     params.outputTokens ?? 0,
    metadata:         { ...params.metadata, source: "AGENT_RUNTIME" },
  });
}

// ── Copilot ───────────────────────────────────────────────────────────────────

export interface CopilotUsageParams {
  orgSlug:          string;
  agentId:          string;
  agentDisplayName?: string;
  copilotSessionId: string;
  featureKey:       string;
  inputTokens?:     number;
  outputTokens?:    number;
  metadata?:        Record<string, unknown>;
}

/**
 * Build an AiUsageRecord from a Copilot session.
 */
export function createUsageRecordFromCopilot(params: CopilotUsageParams): AiUsageRecord {
  const record = createUsageRecordFromAiCall({
    orgSlug:          params.orgSlug,
    agentId:          params.agentId,
    agentDisplayName: params.agentDisplayName,
    moduleSlug:       "copilot",
    featureKey:       params.featureKey,
    usageKind:        "TEXT_GENERATION",
    provider:         "mock",
    model:            "mock-v1",
    inputTokens:      params.inputTokens  ?? 0,
    outputTokens:     params.outputTokens ?? 0,
    metadata:         { ...params.metadata, source: "COPILOT" },
  });
  return { ...record, copilotSessionId: params.copilotSessionId };
}

// ── Marketing Studio ──────────────────────────────────────────────────────────

export interface MarketingStudioUsageParams {
  orgSlug:      string;
  agentId?:     string;
  featureKey:   string;
  usageKind:    AiUsageKind;
  inputTokens?: number;
  outputTokens?: number;
  imageUnits?:  number;
  videoSeconds?: number;
  metadata?:    Record<string, unknown>;
}

/**
 * Build an AiUsageRecord from a Marketing Studio operation.
 */
export function createUsageRecordFromMarketingStudio(params: MarketingStudioUsageParams): AiUsageRecord {
  return createUsageRecordFromAiCall({
    orgSlug:      params.orgSlug,
    agentId:      params.agentId,
    moduleSlug:   "marketing-studio",
    featureKey:   params.featureKey,
    usageKind:    params.usageKind,
    provider:     "mock",
    model:        "mock-v1",
    inputTokens:  params.inputTokens  ?? 0,
    outputTokens: params.outputTokens ?? 0,
    imageUnits:   params.imageUnits,
    videoSeconds: params.videoSeconds,
    metadata:     { ...params.metadata, source: "MARKETING_STUDIO" },
  });
}
