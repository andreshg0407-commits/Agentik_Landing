/**
 * event-correlation.ts
 *
 * BUSINESS-EVENT-ENGINE-01
 * Correlation and causation tracking for business events.
 *
 * Correlation groups related events so downstream consumers
 * can understand chains of cause and effect.
 *
 * Example: inventory_out_of_stock_detected and commercial_order_blocked
 * share a correlationId because one caused the other.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import { nextEventId } from "./event-types";

// -- Event Correlation ------------------------------------------------------

/**
 * Correlation metadata linking related events.
 *
 * - correlationId: groups all events from the same business scenario.
 * - causationId: the event that directly caused this event.
 * - parentEventId: hierarchical parent (for nested event trees).
 * - rootEventId: the original event that started the chain.
 */
export interface EventCorrelation {
  /** Shared ID grouping related events. */
  correlationId: string;
  /** ID of the event that directly caused this one (null if root). */
  causationId: string | null;
  /** Parent event ID (for hierarchical event trees). */
  parentEventId: string | null;
  /** Root event ID (the original trigger). */
  rootEventId: string | null;
  /** Signal IDs related to this event chain. */
  relatedSignalIds: string[];
  /** Other event IDs in the same correlation group. */
  relatedEventIds: string[];
  /** Workflow instance ID (if workflow-triggered). */
  relatedWorkflowInstanceId: string | null;
  /** Reasoning chain ID (if reasoning-triggered). */
  relatedReasoningChainId: string | null;
  /** Entity IDs involved in the correlation. */
  relatedEntityIds: string[];
}

// -- Builders ---------------------------------------------------------------

/** Create a new correlation ID. */
export function createCorrelationId(): string {
  return nextEventId("cor");
}

/** Build an event correlation with defaults. */
export function buildEventCorrelation(opts?: {
  correlationId?: string;
  causationId?: string | null;
  parentEventId?: string | null;
  rootEventId?: string | null;
  relatedSignalIds?: string[];
  relatedEventIds?: string[];
  relatedWorkflowInstanceId?: string | null;
  relatedReasoningChainId?: string | null;
  relatedEntityIds?: string[];
}): EventCorrelation {
  return {
    correlationId: opts?.correlationId ?? createCorrelationId(),
    causationId: opts?.causationId ?? null,
    parentEventId: opts?.parentEventId ?? null,
    rootEventId: opts?.rootEventId ?? null,
    relatedSignalIds: opts?.relatedSignalIds ?? [],
    relatedEventIds: opts?.relatedEventIds ?? [],
    relatedWorkflowInstanceId: opts?.relatedWorkflowInstanceId ?? null,
    relatedReasoningChainId: opts?.relatedReasoningChainId ?? null,
    relatedEntityIds: opts?.relatedEntityIds ?? [],
  };
}

/** Link two events under the same correlation. */
export function linkEvents(
  parent: EventCorrelation,
  childEventId: string,
): EventCorrelation {
  return {
    ...parent,
    relatedEventIds: [...parent.relatedEventIds, childEventId],
  };
}

/** Build a child correlation from a parent event's correlation. */
export function buildChildCorrelation(
  parentCorrelation: EventCorrelation,
  parentEventId: string,
): EventCorrelation {
  return {
    correlationId: parentCorrelation.correlationId,
    causationId: parentEventId,
    parentEventId,
    rootEventId: parentCorrelation.rootEventId ?? parentEventId,
    relatedSignalIds: [...parentCorrelation.relatedSignalIds],
    relatedEventIds: [...parentCorrelation.relatedEventIds, parentEventId],
    relatedWorkflowInstanceId: parentCorrelation.relatedWorkflowInstanceId,
    relatedReasoningChainId: parentCorrelation.relatedReasoningChainId,
    relatedEntityIds: [...parentCorrelation.relatedEntityIds],
  };
}

/** Check if two correlations share the same correlation group. */
export function sameCorrelation(a: EventCorrelation, b: EventCorrelation): boolean {
  return a.correlationId === b.correlationId;
}
