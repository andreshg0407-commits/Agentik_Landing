/**
 * lib/ai-billing/ai-usage-types.ts
 *
 * Agentik — AI Billing Foundation — Usage Record Types
 * Sprint: AGENTIK-AI-BILLING-FOUNDATION-01
 *
 * Pure domain. No Prisma. No React. No server-only.
 * Client-safe.
 */

import type {
  AiUsageId,
  AiBillingStatus,
  AiUsageKind,
  AiCostMode,
} from "./ai-billing-types";

// ── Usage record ──────────────────────────────────────────────────────────────

/**
 * One unit of AI usage attributed to a specific tenant/module/agent/feature.
 *
 * creditsUsed — the commercial unit Agentik charges the tenant.
 * costUsd     — the internal provider cost in USD (NEVER shown to tenants).
 */
export interface AiUsageRecord {
  /** Unique identifier for this usage record. */
  id: AiUsageId;

  /** Internal organization DB id (resolved at persistence time). */
  organizationId?: string;

  /** Tenant slug — primary attribution key. */
  orgSlug: string;

  /** Alternative tenant identifier if different from organizationId. */
  tenantId?: string;

  /** Which module generated this usage (e.g. "finanzas", "marketing-studio"). */
  moduleSlug?: string;

  /** Agent that performed the work. */
  agentId?: string;

  /** Human-readable agent name for display. */
  agentDisplayName?: string;

  /**
   * Fine-grained feature key within the module.
   * E.g. "reconciliation:auto_match", "copilot:explain", "foto_studio:generate"
   */
  featureKey: string;

  /** If triggered by a workflow run. */
  workflowRunId?: string;

  /** If triggered by a WorkExecution. */
  workExecutionId?: string;

  /** If triggered by an autonomous operation. */
  autonomousOperationId?: string;

  /** If triggered by a copilot session. */
  copilotSessionId?: string;

  /** Provider slug: "anthropic" | "openai" | "gemini" | "stability" | "mock". */
  provider?: string;

  /** Model identifier: "claude-sonnet-4-6" | "gpt-4o" | "mock". */
  model?: string;

  /** Type of AI work performed. */
  usageKind: AiUsageKind;

  /** Input tokens consumed (text/reasoning workloads). */
  inputTokens: number;

  /** Output tokens generated (text/reasoning workloads). */
  outputTokens: number;

  /** Total tokens = inputTokens + outputTokens. */
  totalTokens: number;

  /** For image workloads: number of images generated. */
  imageUnits?: number;

  /** For video workloads: seconds of video generated. */
  videoSeconds?: number;

  /** For audio/transcription workloads: seconds of audio processed. */
  audioSeconds?: number;

  /** Number of API requests made. Usually 1, can be >1 for retries. */
  requestCount: number;

  /**
   * Provider cost in USD.
   * Internal only — NEVER exposed to tenants as the pricing basis.
   */
  costUsd: number;

  /** Whether costUsd is estimated, actual, or manually set. */
  costMode: AiCostMode;

  /**
   * Credits consumed — the commercial unit Agentik charges.
   * Tenants only see credits, not USD or tokens.
   */
  creditsUsed: number;

  /** Lifecycle status of this record. */
  status: AiBillingStatus;

  /** Arbitrary additional metadata. */
  metadata?: Record<string, unknown>;

  /** ISO timestamp when the usage occurred. */
  createdAt: string;
}

// ── Usage filters ─────────────────────────────────────────────────────────────

export interface AiUsageFilters {
  moduleSlug?: string;
  agentId?:    string;
  featureKey?: string;
  usageKind?:  AiUsageKind;
  status?:     AiBillingStatus;
  fromDate?:   string;
  toDate?:     string;
}

// ── Usage summary ─────────────────────────────────────────────────────────────

export interface AiUsageSummary {
  orgSlug:               string;
  totalCreditsUsed:      number;
  totalCostUsd:          number;
  totalInputTokens:      number;
  totalOutputTokens:     number;
  totalRequests:         number;
  grossMarginUsd?:       number;
  estimatedRevenueUsd?:  number;
  recordCount:           number;
  fromDate?:             string;
  toDate?:               string;
}

// ── Aggregated bucket ─────────────────────────────────────────────────────────

export interface AiUsageBucket {
  key:              string; // tenant / module / agent / feature slug
  totalCreditsUsed: number;
  totalCostUsd:     number;
  totalTokens:      number;
  totalRequests:    number;
  recordCount:      number;
}
