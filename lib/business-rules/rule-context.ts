/**
 * rule-context.ts
 *
 * BUSINESS-RULE-ENGINE-01
 * The evaluation context provided when a rule is triggered.
 *
 * Contains flattened data from the triggering event/signal,
 * entity state, and any enrichment data the caller provides.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { RuleTriggerType } from "./rule-trigger";
import type { ScopeMatchContext } from "./rule-scope";

// -- Rule Evaluation Context --------------------------------------------------

/**
 * Context provided to the rule engine for evaluation.
 *
 * The caller is responsible for flattening relevant data
 * into the `data` map. The rule engine does NOT query databases.
 */
export interface RuleEvaluationContext {
  /** What triggered this evaluation. */
  triggerType: RuleTriggerType;
  /** Trigger-specific identifiers. */
  triggerEventType?: string;
  triggerSignalCategory?: string;
  triggerSignalType?: string;
  triggerEntityType?: string;
  triggerWorkflowEventType?: string;

  /** Scope context for matching rules to this evaluation. */
  scopeContext: ScopeMatchContext;

  /**
   * Flattened data map for condition evaluation.
   *
   * Keys are field names referenced by rule conditions.
   * Values come from the triggering event/signal payload,
   * entity state, or enrichment queries.
   *
   * Example: { "inventory_available": 0, "status": "active", "order_count": 5 }
   */
  data: Record<string, unknown>;

  /** ID of the triggering event (if event-triggered). */
  eventId?: string;
  /** ID of the triggering signal (if signal-triggered). */
  signalId?: string;
  /** Correlation ID from the triggering event chain. */
  correlationId?: string;

  /** Who/what initiated this evaluation. */
  initiatedBy: string;
  /** Evaluation timestamp. */
  evaluatedAt: string;

  /** Arbitrary metadata from the caller. */
  metadata: Record<string, unknown>;
}

// -- Builder ------------------------------------------------------------------

/** Build a rule evaluation context. */
export function buildRuleEvaluationContext(opts: {
  triggerType: RuleTriggerType;
  scopeContext: ScopeMatchContext;
  data: Record<string, unknown>;
  triggerEventType?: string;
  triggerSignalCategory?: string;
  triggerSignalType?: string;
  triggerEntityType?: string;
  triggerWorkflowEventType?: string;
  eventId?: string;
  signalId?: string;
  correlationId?: string;
  initiatedBy?: string;
  metadata?: Record<string, unknown>;
}): RuleEvaluationContext {
  return {
    triggerType: opts.triggerType,
    triggerEventType: opts.triggerEventType,
    triggerSignalCategory: opts.triggerSignalCategory,
    triggerSignalType: opts.triggerSignalType,
    triggerEntityType: opts.triggerEntityType,
    triggerWorkflowEventType: opts.triggerWorkflowEventType,
    scopeContext: opts.scopeContext,
    data: opts.data,
    eventId: opts.eventId,
    signalId: opts.signalId,
    correlationId: opts.correlationId,
    initiatedBy: opts.initiatedBy ?? "system",
    evaluatedAt: new Date().toISOString(),
    metadata: opts.metadata ?? {},
  };
}
