/**
 * action-context.ts
 *
 * BUSINESS-ACTION-ENGINE-01
 * Action context — all information the Action Engine needs.
 *
 * Action Engine does NOT query modules directly.
 * All information must arrive as context.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { BusinessDecision } from "@/lib/business-decisions";
import type { BusinessPlan } from "@/lib/business-planning";
import type { DecisionOption } from "@/lib/business-decisions/decision-option";
import type { BusinessEvent } from "@/lib/business-events";
import type { BusinessSignal } from "@/lib/business-signals";
import type { ActionEntityRef, ExecutionMode } from "./action-types";
import type { ActionPolicy } from "./action-policy";

// -- Entity Snapshot ----------------------------------------------------------

/** A snapshot of entity state at action time. */
export interface ActionEntitySnapshot {
  entity: ActionEntityRef;
  state: Record<string, unknown>;
  snapshotAt: string;
}

// -- Action Context -----------------------------------------------------------

/**
 * Complete context for building and executing actions.
 *
 * The caller assembles this from upstream engines.
 * The Action Engine only reads — never queries modules.
 */
export interface ActionContext {
  /** Organization ID. */
  organizationId: string;
  /** Decision that led to this action context. */
  decision: BusinessDecision | null;
  /** Plan that led to this context. */
  plan: BusinessPlan | null;
  /** Selected option from the decision. */
  selectedOption: DecisionOption | null;
  /** Policy governing execution. */
  policy: ActionPolicy | null;
  /** Execution mode override. */
  executionMode: ExecutionMode;
  /** Relevant business events. */
  events: BusinessEvent[];
  /** Relevant business signals. */
  signals: BusinessSignal[];
  /** Entity snapshots. */
  entitySnapshots: ActionEntitySnapshot[];
  /** Arbitrary metadata. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build an action context. */
export function buildActionContext(opts: {
  organizationId: string;
  decision?: BusinessDecision | null;
  plan?: BusinessPlan | null;
  selectedOption?: DecisionOption | null;
  policy?: ActionPolicy | null;
  executionMode?: ExecutionMode;
  events?: BusinessEvent[];
  signals?: BusinessSignal[];
  entitySnapshots?: ActionEntitySnapshot[];
  metadata?: Record<string, unknown>;
}): ActionContext {
  return {
    organizationId: opts.organizationId,
    decision: opts.decision ?? null,
    plan: opts.plan ?? null,
    selectedOption: opts.selectedOption ?? null,
    policy: opts.policy ?? null,
    executionMode: opts.executionMode ?? "dry_run",
    events: opts.events ?? [],
    signals: opts.signals ?? [],
    entitySnapshots: opts.entitySnapshots ?? [],
    metadata: opts.metadata ?? {},
  };
}
