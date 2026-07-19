/**
 * event-builder.ts
 *
 * BUSINESS-EVENT-ENGINE-01
 * Builder functions for constructing Business Events.
 *
 * Provides safe construction with validation of required fields.
 * Domain-specific builders delegate to buildEvent().
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { BusinessEvent } from "./event";
import type { BusinessEventType, EventEntityRef } from "./event-types";
import type { EventCategory } from "./event-category";
import type { EventSource } from "./event-source";
import type { EventSeverity } from "./event-severity";
import type { EventPriority } from "./event-priority";
import type { EventStatus } from "./event-lifecycle";
import type { EventPayload } from "./event-payload";
import type { EventCorrelation } from "./event-correlation";
import type { EventTrace } from "./event-trace";
import type { BusinessSignal, SignalStatus } from "@/lib/business-signals";
import { nextEventId } from "./event-types";
import { buildEventPayload, emptyEventPayload } from "./event-payload";
import { buildEventCorrelation } from "./event-correlation";
import { buildEventTrace, buildSignalTrace } from "./event-trace";

// -- Core Builder -----------------------------------------------------------

/** Options for building a business event. */
export interface BuildEventOptions {
  organizationId: string;
  eventType: BusinessEventType;
  category: EventCategory;
  source: EventSource;
  entity: EventEntityRef;
  severity?: EventSeverity;
  priority?: EventPriority;
  status?: EventStatus;
  occurredAt?: string;
  relatedEntities?: EventEntityRef[];
  payload?: EventPayload;
  correlation?: EventCorrelation;
  trace?: EventTrace;
  confidence?: number;
  dedupKey?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Build a BusinessEvent from options.
 *
 * This is the primary entry point for creating events.
 * All domain-specific builders should delegate to this function.
 */
export function buildEvent(opts: BuildEventOptions): BusinessEvent {
  const now = new Date().toISOString();
  const eventId = nextEventId("evt");

  const dedupKey = opts.dedupKey
    ?? `${opts.organizationId}:${opts.entity.entityId}:${opts.eventType}:${opts.occurredAt ?? now}`;

  return {
    eventId,
    organizationId: opts.organizationId,
    eventType: opts.eventType,
    category: opts.category,
    source: opts.source,
    severity: opts.severity ?? "info",
    priority: opts.priority ?? "normal",
    status: opts.status ?? "created",
    occurredAt: opts.occurredAt ?? now,
    detectedAt: now,
    entity: opts.entity,
    relatedEntities: opts.relatedEntities ?? [],
    payload: opts.payload ?? emptyEventPayload(opts.eventType),
    correlation: opts.correlation ?? buildEventCorrelation(),
    trace: opts.trace ?? buildEventTrace({ origin: opts.source, createdBy: opts.source }),
    confidence: opts.confidence ?? 100,
    dedupKey,
    metadata: opts.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };
}

// -- Signal-Originated Builders ---------------------------------------------

/**
 * Build an event from a Business Signal.
 *
 * Used when a signal's existence is itself a noteworthy event
 * (e.g., signal_created, signal_activated).
 */
export function eventFromSignal(
  signal: BusinessSignal,
  eventType: BusinessEventType,
  opts?: {
    severity?: EventSeverity;
    priority?: EventPriority;
    category?: EventCategory;
    metadata?: Record<string, unknown>;
  },
): BusinessEvent {
  return buildEvent({
    organizationId: signal.organizationId,
    eventType,
    category: opts?.category ?? (signal.category as unknown as EventCategory),
    source: "signal_engine",
    entity: {
      entityId: signal.entityId,
      entityType: signal.entityType as EventEntityRef["entityType"],
      label: signal.context.primaryEntity.label,
    },
    severity: opts?.severity ?? (signal.severity as unknown as EventSeverity),
    priority: opts?.priority ?? (signal.priority as unknown as EventPriority),
    payload: buildEventPayload({
      summary: signal.title,
      metadata: {
        signalId: signal.signalId,
        signalType: signal.type,
        signalDescription: signal.description,
      },
    }),
    correlation: buildEventCorrelation({
      relatedSignalIds: [signal.signalId],
      relatedEntityIds: [signal.entityId],
    }),
    trace: buildSignalTrace(signal.signalId, signal.evidence.observationIds),
    confidence: signal.confidence,
    metadata: opts?.metadata ?? {},
  });
}

/**
 * Build an event from a Signal status transition.
 *
 * Used when a signal changes lifecycle state (e.g., new → active,
 * active → resolved, active → expired).
 */
export function eventFromSignalTransition(
  signal: BusinessSignal,
  fromStatus: SignalStatus,
  toStatus: SignalStatus,
  opts?: {
    severity?: EventSeverity;
    metadata?: Record<string, unknown>;
  },
): BusinessEvent {
  const eventTypeMap: Record<string, BusinessEventType> = {
    "new→active": "signal_activated",
    "active→resolved": "signal_resolved",
    "active→expired": "signal_expired",
    "active→ignored": "signal_ignored",
    "new→resolved": "signal_resolved",
    "new→ignored": "signal_ignored",
  };

  const key = `${fromStatus}→${toStatus}`;
  const eventType = eventTypeMap[key] ?? "signal_created";

  return buildEvent({
    organizationId: signal.organizationId,
    eventType,
    category: signal.category as unknown as EventCategory,
    source: "signal_engine",
    entity: {
      entityId: signal.entityId,
      entityType: signal.entityType as EventEntityRef["entityType"],
      label: signal.context.primaryEntity.label,
    },
    severity: opts?.severity ?? (signal.severity as unknown as EventSeverity),
    payload: buildEventPayload({
      summary: `Signal ${signal.signalId}: ${fromStatus} → ${toStatus}`,
      before: { status: fromStatus },
      after: { status: toStatus },
      delta: { status: { from: fromStatus, to: toStatus } },
    }),
    correlation: buildEventCorrelation({
      relatedSignalIds: [signal.signalId],
      relatedEntityIds: [signal.entityId],
    }),
    trace: buildSignalTrace(signal.signalId, signal.evidence.observationIds),
    confidence: signal.confidence,
    metadata: opts?.metadata ?? {},
  });
}

// -- Workflow-Originated Builders -------------------------------------------

/** Build an event from a workflow stage transition. */
export function eventFromWorkflowTransition(opts: {
  organizationId: string;
  workflowInstanceId: string;
  entity: EventEntityRef;
  fromStage: string | null;
  toStage: string;
  eventType?: BusinessEventType;
  severity?: EventSeverity;
  metadata?: Record<string, unknown>;
}): BusinessEvent {
  const eventType = opts.eventType
    ?? (opts.fromStage === null ? "workflow_started" : "workflow_stage_entered");

  return buildEvent({
    organizationId: opts.organizationId,
    eventType,
    category: "workflow",
    source: "workflow_engine",
    entity: opts.entity,
    severity: opts.severity ?? "info",
    payload: buildEventPayload({
      summary: opts.fromStage
        ? `${opts.fromStage} → ${opts.toStage}`
        : `Started at ${opts.toStage}`,
      before: opts.fromStage ? { stage: opts.fromStage } : null,
      after: { stage: opts.toStage },
    }),
    correlation: buildEventCorrelation({
      relatedWorkflowInstanceId: opts.workflowInstanceId,
      relatedEntityIds: [opts.entity.entityId],
    }),
    trace: buildEventTrace({
      origin: `Workflow ${opts.workflowInstanceId}`,
      sourceWorkflowInstanceId: opts.workflowInstanceId,
      createdBy: "workflow_engine",
    }),
    metadata: opts.metadata ?? {},
  });
}

// -- Entity Change Builder --------------------------------------------------

/** Build an event from an entity state change. */
export function eventFromEntityChange(opts: {
  organizationId: string;
  entity: EventEntityRef;
  eventType: BusinessEventType;
  category: EventCategory;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  source?: EventSource;
  severity?: EventSeverity;
  metadata?: Record<string, unknown>;
}): BusinessEvent {
  const delta: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(opts.before), ...Object.keys(opts.after)])) {
    if (opts.before[key] !== opts.after[key]) {
      delta[key] = { from: opts.before[key], to: opts.after[key] };
    }
  }

  return buildEvent({
    organizationId: opts.organizationId,
    eventType: opts.eventType,
    category: opts.category,
    source: opts.source ?? "system",
    entity: opts.entity,
    severity: opts.severity ?? "info",
    payload: buildEventPayload({
      summary: `${opts.entity.label}: state change`,
      before: opts.before,
      after: opts.after,
      delta,
    }),
    correlation: buildEventCorrelation({
      relatedEntityIds: [opts.entity.entityId],
    }),
    trace: buildEventTrace({
      origin: `Entity change: ${opts.entity.entityId}`,
      createdBy: opts.source ?? "system",
    }),
    metadata: opts.metadata ?? {},
  });
}

// -- Sync Result Builder ----------------------------------------------------

/** Build an event from a sync completion. */
export function eventFromSyncResult(opts: {
  organizationId: string;
  syncRunId: string;
  success: boolean;
  entity: EventEntityRef;
  recordsProcessed?: number;
  recordsFailed?: number;
  metadata?: Record<string, unknown>;
}): BusinessEvent {
  return buildEvent({
    organizationId: opts.organizationId,
    eventType: opts.success ? "sync_completed" : "sync_failed",
    category: "system",
    source: "sync_engine",
    entity: opts.entity,
    severity: opts.success ? "info" : "high",
    payload: buildEventPayload({
      summary: opts.success
        ? `Sync completed: ${opts.recordsProcessed ?? 0} records`
        : `Sync failed: ${opts.recordsFailed ?? 0} errors`,
      metrics: [
        ...(opts.recordsProcessed != null
          ? [{ key: "records_processed", value: opts.recordsProcessed, unit: "count", previousValue: null }]
          : []),
        ...(opts.recordsFailed != null
          ? [{ key: "records_failed", value: opts.recordsFailed, unit: "count", previousValue: null }]
          : []),
      ],
    }),
    correlation: buildEventCorrelation({
      relatedEntityIds: [opts.entity.entityId],
    }),
    trace: buildEventTrace({
      origin: `Sync run ${opts.syncRunId}`,
      sourceSyncRunId: opts.syncRunId,
      createdBy: "sync_engine",
    }),
    metadata: opts.metadata ?? {},
  });
}

// -- Deduplication Key Builder ----------------------------------------------

/** Build a deterministic deduplication key for an event. */
export function eventDedupKey(
  organizationId: string,
  entityId: string,
  eventType: string,
  occurredAt: string,
): string {
  return `${organizationId}:${entityId}:${eventType}:${occurredAt}`;
}
