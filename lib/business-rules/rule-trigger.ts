/**
 * rule-trigger.ts
 *
 * BUSINESS-RULE-ENGINE-01
 * Trigger definitions for when a rule should be evaluated.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { BusinessEventType } from "@/lib/business-events";
import type { SignalCategory } from "@/lib/business-signals";

// -- Trigger Type -----------------------------------------------------------

/** What kind of event triggers rule evaluation. */
export type RuleTriggerType =
  | "business_event"
  | "business_signal"
  | "workflow_transition"
  | "entity_state_change"
  | "manual_evaluation"
  | "scheduled_evaluation"
  | "reasoning_finding";

// -- Rule Trigger -----------------------------------------------------------

/**
 * Defines when a rule should be evaluated.
 *
 * A rule can have multiple triggers. Any matching trigger activates evaluation.
 */
export interface RuleTrigger {
  /** Type of trigger. */
  triggerType: RuleTriggerType;
  /** Event types that activate this trigger (for business_event triggers). */
  eventTypes: BusinessEventType[] | null;
  /** Signal categories that activate this trigger (for business_signal triggers). */
  signalCategories: SignalCategory[] | null;
  /** Signal types (signal.type field) that activate this trigger. */
  signalTypes: string[] | null;
  /** Entity types that activate this trigger. */
  entityTypes: string[] | null;
  /** Workflow event types (for workflow_transition triggers). */
  workflowEventTypes: string[] | null;
  /** Arbitrary metadata for custom trigger matching. */
  metadata: Record<string, unknown>;
}

// -- Builder ----------------------------------------------------------------

/** Build a rule trigger. */
export function buildRuleTrigger(opts: {
  triggerType: RuleTriggerType;
  eventTypes?: BusinessEventType[] | null;
  signalCategories?: SignalCategory[] | null;
  signalTypes?: string[] | null;
  entityTypes?: string[] | null;
  workflowEventTypes?: string[] | null;
  metadata?: Record<string, unknown>;
}): RuleTrigger {
  return {
    triggerType: opts.triggerType,
    eventTypes: opts.eventTypes ?? null,
    signalCategories: opts.signalCategories ?? null,
    signalTypes: opts.signalTypes ?? null,
    entityTypes: opts.entityTypes ?? null,
    workflowEventTypes: opts.workflowEventTypes ?? null,
    metadata: opts.metadata ?? {},
  };
}

/** Build an event-based trigger. */
export function eventTrigger(...eventTypes: BusinessEventType[]): RuleTrigger {
  return buildRuleTrigger({ triggerType: "business_event", eventTypes });
}

/** Build a signal-based trigger. */
export function signalTrigger(categories?: SignalCategory[], types?: string[]): RuleTrigger {
  return buildRuleTrigger({
    triggerType: "business_signal",
    signalCategories: categories ?? null,
    signalTypes: types ?? null,
  });
}

/** Build a workflow transition trigger. */
export function workflowTrigger(...workflowEventTypes: string[]): RuleTrigger {
  return buildRuleTrigger({ triggerType: "workflow_transition", workflowEventTypes });
}

/** Build a manual evaluation trigger. */
export function manualTrigger(): RuleTrigger {
  return buildRuleTrigger({ triggerType: "manual_evaluation" });
}

// -- Matching ---------------------------------------------------------------

/** Context for checking if a trigger matches an incoming event/signal. */
export interface TriggerMatchContext {
  triggerType: RuleTriggerType;
  eventType?: string;
  signalCategory?: string;
  signalType?: string;
  entityType?: string;
  workflowEventType?: string;
}

/** Check if a trigger matches an incoming context. */
export function matchesTrigger(trigger: RuleTrigger, ctx: TriggerMatchContext): boolean {
  if (trigger.triggerType !== ctx.triggerType) return false;

  if (trigger.eventTypes && ctx.eventType && !trigger.eventTypes.includes(ctx.eventType as any)) return false;
  if (trigger.signalCategories && ctx.signalCategory && !trigger.signalCategories.includes(ctx.signalCategory as any)) return false;
  if (trigger.signalTypes && ctx.signalType && !trigger.signalTypes.includes(ctx.signalType)) return false;
  if (trigger.entityTypes && ctx.entityType && !trigger.entityTypes.includes(ctx.entityType)) return false;
  if (trigger.workflowEventTypes && ctx.workflowEventType && !trigger.workflowEventTypes.includes(ctx.workflowEventType)) return false;

  return true;
}
