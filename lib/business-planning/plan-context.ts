/**
 * plan-context.ts
 *
 * BUSINESS-PLANNING-ENGINE-01
 * Planning context — all information the Planning Engine needs.
 *
 * The Planning Engine does NOT query modules directly.
 * All information must arrive as context.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { RuleEvaluationResult } from "@/lib/business-rules";
import type { BusinessEvent } from "@/lib/business-events";
import type { BusinessSignal } from "@/lib/business-signals";
import type { PlanEntityRef } from "./planning-types";

// -- Entity Snapshot ----------------------------------------------------------

/** A snapshot of an entity's state at planning time. */
export interface PlanningEntitySnapshot {
  /** Entity reference. */
  entity: PlanEntityRef;
  /** Key-value state at the time of planning. */
  state: Record<string, unknown>;
  /** When this snapshot was taken. */
  snapshotAt: string;
}

// -- Planning Context ---------------------------------------------------------

/**
 * Complete context for generating a business plan.
 *
 * The caller assembles this context from various sources.
 * The Planning Engine only reads — never queries.
 */
export interface PlanningContext {
  /** Organization ID. */
  organizationId: string;

  /** What triggered this planning request. */
  triggerDescription: string;

  /** Rule evaluation results that motivated this plan. */
  ruleResults: RuleEvaluationResult[];

  /** Relevant business events. */
  events: BusinessEvent[];

  /** Relevant business signals. */
  signals: BusinessSignal[];

  /** Reasoning context (free-form, from reasoning engine). */
  reasoningContext: Record<string, unknown>;

  /** Knowledge graph context (free-form, from KG engine). */
  knowledgeContext: Record<string, unknown>;

  /** Entity snapshots at planning time. */
  entitySnapshots: PlanningEntitySnapshot[];

  /** Workflow context (free-form). */
  workflowContext: Record<string, unknown>;

  /** Operational metrics available for evaluation. */
  metrics: Record<string, number>;

  /** Known constraints from the environment. */
  constraints: Record<string, unknown>;

  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build a planning context. */
export function buildPlanningContext(opts: {
  organizationId: string;
  triggerDescription: string;
  ruleResults?: RuleEvaluationResult[];
  events?: BusinessEvent[];
  signals?: BusinessSignal[];
  reasoningContext?: Record<string, unknown>;
  knowledgeContext?: Record<string, unknown>;
  entitySnapshots?: PlanningEntitySnapshot[];
  workflowContext?: Record<string, unknown>;
  metrics?: Record<string, number>;
  constraints?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): PlanningContext {
  return {
    organizationId: opts.organizationId,
    triggerDescription: opts.triggerDescription,
    ruleResults: opts.ruleResults ?? [],
    events: opts.events ?? [],
    signals: opts.signals ?? [],
    reasoningContext: opts.reasoningContext ?? {},
    knowledgeContext: opts.knowledgeContext ?? {},
    entitySnapshots: opts.entitySnapshots ?? [],
    workflowContext: opts.workflowContext ?? {},
    metrics: opts.metrics ?? {},
    constraints: opts.constraints ?? {},
    metadata: opts.metadata ?? {},
  };
}
