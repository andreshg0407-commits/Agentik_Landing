/**
 * decision-context.ts
 *
 * BUSINESS-DECISION-ENGINE-01
 * Decision context — all information the Decision Engine needs.
 *
 * The Decision Engine does NOT query modules directly.
 * All information must arrive as context.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { BusinessPlan } from "@/lib/business-planning";
import type { RuleEvaluationResult } from "@/lib/business-rules";
import type { BusinessEvent } from "@/lib/business-events";
import type { BusinessSignal } from "@/lib/business-signals";
import type { DecisionEntityRef, DecisionPolicy } from "./decision-types";

// -- Entity Snapshot ----------------------------------------------------------

/** A snapshot of an entity's state at decision time. */
export interface DecisionEntitySnapshot {
  entity: DecisionEntityRef;
  state: Record<string, unknown>;
  snapshotAt: string;
}

// -- Decision Context ---------------------------------------------------------

/**
 * Complete context for making a business decision.
 *
 * The caller assembles this from various sources.
 * The Decision Engine only reads — never queries.
 */
export interface DecisionContext {
  /** Organization ID. */
  organizationId: string;
  /** The business plan to decide on. */
  plan: BusinessPlan | null;
  /** Rule evaluation results. */
  ruleResults: RuleEvaluationResult[];
  /** Reasoning context (free-form). */
  reasoningContext: Record<string, unknown>;
  /** Knowledge graph context (free-form). */
  knowledgeContext: Record<string, unknown>;
  /** Relevant business events. */
  events: BusinessEvent[];
  /** Relevant business signals. */
  signals: BusinessSignal[];
  /** Entity snapshots at decision time. */
  entitySnapshots: DecisionEntitySnapshot[];
  /** Operational metrics. */
  metrics: Record<string, number>;
  /** Known constraints. */
  constraints: Record<string, unknown>;
  /** Decision policy to apply. */
  policy: DecisionPolicy;
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build a decision context. */
export function buildDecisionContext(opts: {
  organizationId: string;
  plan?: BusinessPlan | null;
  ruleResults?: RuleEvaluationResult[];
  reasoningContext?: Record<string, unknown>;
  knowledgeContext?: Record<string, unknown>;
  events?: BusinessEvent[];
  signals?: BusinessSignal[];
  entitySnapshots?: DecisionEntitySnapshot[];
  metrics?: Record<string, number>;
  constraints?: Record<string, unknown>;
  policy?: DecisionPolicy;
  metadata?: Record<string, unknown>;
}): DecisionContext {
  return {
    organizationId: opts.organizationId,
    plan: opts.plan ?? null,
    ruleResults: opts.ruleResults ?? [],
    reasoningContext: opts.reasoningContext ?? {},
    knowledgeContext: opts.knowledgeContext ?? {},
    events: opts.events ?? [],
    signals: opts.signals ?? [],
    entitySnapshots: opts.entitySnapshots ?? [],
    metrics: opts.metrics ?? {},
    constraints: opts.constraints ?? {},
    policy: opts.policy ?? "balanced",
    metadata: opts.metadata ?? {},
  };
}
