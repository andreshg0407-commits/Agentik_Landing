/**
 * reasoning-context.ts
 *
 * BUSINESS-REASONING-FOUNDATION-01
 * The ReasoningContext — what David and Copilot actually consume.
 *
 * This is the complete intelligence package built from the reasoning chain.
 * David never reasons directly. David receives a ReasoningContext and
 * only generates conversational explanation on top of it.
 *
 * Other agents (Mila, Luca, Pablo) can reuse the exact same context.
 *
 * No Prisma. No React. No AI. Pure domain types.
 */

import type { EntityRef, ReasoningCategory } from "./reasoning-types";
import type { Observation } from "./observation";
import type { Finding } from "./finding";
import type { Insight } from "./insight";
import type { Risk } from "./risk";
import type { Opportunity } from "./opportunity";
import type { Decision } from "./decision";
import type { Recommendation } from "./recommendation";
import type { ReasoningChain } from "./reasoning-chain";
import type { ReasoningConfidence } from "./reasoning-confidence";
import type { DataFreshnessLevel } from "@/lib/business-entities/core";

// -- Reasoning Context -----------------------------------------------------

/**
 * The complete reasoning context for an entity or business situation.
 *
 * Consumed by:
 * - David (generates conversational explanation)
 * - Copilot (surfaces in right rail)
 * - Executive Dashboard (surfaces KPIs and risks)
 * - Informes Inteligentes (generates structured reports)
 * - Future agents (any agent can consume this context)
 *
 * This structure replaces direct entity/table queries by agents.
 */
export interface ReasoningContext {
  /** Unique context ID. */
  id: string;
  /** The primary entity this context is about. */
  primaryEntity: EntityRef;
  /** Business domain category. */
  category: ReasoningCategory;
  /** All observations. */
  observations: Observation[];
  /** All findings. */
  findings: Finding[];
  /** All insights. */
  insights: Insight[];
  /** All risks. */
  risks: Risk[];
  /** All opportunities. */
  opportunities: Opportunity[];
  /** All decisions. */
  decisions: Decision[];
  /** All recommendations. */
  recommendations: Recommendation[];
  /** The complete reasoning chain(s). */
  chains: ReasoningChain[];
  /** Overall confidence of the reasoning. */
  confidence: ReasoningConfidence;
  /** Data freshness of the context. */
  freshness: DataFreshnessLevel;
  /** Key facts extracted from the reasoning. */
  keyFacts: string[];
  /** Suggested questions a manager might ask. */
  suggestedQuestions: string[];
  /** ISO timestamp when this context was assembled. */
  assembledAt: string;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ---------------------------------------------------------------

export function buildReasoningContext(opts: {
  primaryEntity: EntityRef;
  category: ReasoningCategory;
  observations?: Observation[];
  findings?: Finding[];
  insights?: Insight[];
  risks?: Risk[];
  opportunities?: Opportunity[];
  decisions?: Decision[];
  recommendations?: Recommendation[];
  chains?: ReasoningChain[];
  confidence: ReasoningConfidence;
  freshness?: DataFreshnessLevel;
  keyFacts?: string[];
  suggestedQuestions?: string[];
  metadata?: Record<string, unknown>;
}): ReasoningContext {
  return {
    id: `rctx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    primaryEntity: opts.primaryEntity,
    category: opts.category,
    observations: opts.observations ?? [],
    findings: opts.findings ?? [],
    insights: opts.insights ?? [],
    risks: opts.risks ?? [],
    opportunities: opts.opportunities ?? [],
    decisions: opts.decisions ?? [],
    recommendations: opts.recommendations ?? [],
    chains: opts.chains ?? [],
    confidence: opts.confidence,
    freshness: opts.freshness ?? "unknown",
    keyFacts: opts.keyFacts ?? [],
    suggestedQuestions: opts.suggestedQuestions ?? [],
    assembledAt: new Date().toISOString(),
    metadata: opts.metadata ?? {},
  };
}

// -- Context Queries -------------------------------------------------------

/** Get the highest-severity risk from the context. */
export function topRisk(ctx: ReasoningContext): Risk | null {
  if (ctx.risks.length === 0) return null;
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  return [...ctx.risks].sort((a, b) =>
    (order[a.severity] ?? 5) - (order[b.severity] ?? 5),
  )[0];
}

/** Get the highest-priority recommendation from the context. */
export function topRecommendation(ctx: ReasoningContext): Recommendation | null {
  if (ctx.recommendations.length === 0) return null;
  return [...ctx.recommendations].sort((a, b) => a.priority - b.priority)[0];
}

/** Count elements in the context by type. */
export function contextCounts(ctx: ReasoningContext): Record<string, number> {
  return {
    observations: ctx.observations.length,
    findings: ctx.findings.length,
    insights: ctx.insights.length,
    risks: ctx.risks.length,
    opportunities: ctx.opportunities.length,
    decisions: ctx.decisions.length,
    recommendations: ctx.recommendations.length,
    chains: ctx.chains.length,
  };
}
