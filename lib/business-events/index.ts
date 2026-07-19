/**
 * lib/business-events/index.ts
 *
 * BUSINESS-EVENT-ENGINE-01
 * Barrel export for the Operational Event Engine.
 *
 * Client-safe: no Prisma, no server-only, no React, no AI.
 * Import from "@/lib/business-events" for all event contracts.
 */

// -- Core Types & ID Generation ---------------------------------------------
export type { EventEntityRef, BusinessEventType } from "./event-types";
export { nextEventId } from "./event-types";

// -- Category ---------------------------------------------------------------
export type { EventCategory } from "./event-category";
export { EVENT_CATEGORIES, isEventCategory } from "./event-category";

// -- Source -----------------------------------------------------------------
export type { EventSource } from "./event-source";
export { EVENT_SOURCES } from "./event-source";

// -- Severity ---------------------------------------------------------------
export type { EventSeverity } from "./event-severity";
export { EVENT_SEVERITIES, compareEventSeverity, meetsEventSeverityThreshold } from "./event-severity";

// -- Priority ---------------------------------------------------------------
export type { EventPriority } from "./event-priority";
export { EVENT_PRIORITIES, compareEventPriority } from "./event-priority";

// -- Lifecycle --------------------------------------------------------------
export type { EventStatus } from "./event-lifecycle";
export {
  EVENT_STATUSES,
  TERMINAL_EVENT_STATUSES,
  isTerminalEventStatus,
  isProcessableEventStatus,
} from "./event-lifecycle";

// -- Payload ----------------------------------------------------------------
export type {
  EventPayload,
  EventPayloadMetric,
  EventPayloadDocument,
  EventPayloadReference,
  EventPayloadAmount,
  EventPayloadQuantity,
  EventPayloadDate,
} from "./event-payload";
export {
  buildEventPayload,
  buildStateChangePayload,
  emptyEventPayload,
} from "./event-payload";

// -- Correlation ------------------------------------------------------------
export type { EventCorrelation } from "./event-correlation";
export {
  createCorrelationId,
  buildEventCorrelation,
  linkEvents,
  buildChildCorrelation,
  sameCorrelation,
} from "./event-correlation";

// -- Trace ------------------------------------------------------------------
export type { EventTrace, TraceEvidenceItem } from "./event-trace";
export {
  buildEventTrace,
  buildSignalTrace,
  buildWorkflowTrace,
  buildSyncTrace,
  buildManualTrace,
} from "./event-trace";

// -- Event ------------------------------------------------------------------
export type { BusinessEvent } from "./event";

// -- Builder ----------------------------------------------------------------
export type { BuildEventOptions } from "./event-builder";
export {
  buildEvent,
  eventFromSignal,
  eventFromSignalTransition,
  eventFromWorkflowTransition,
  eventFromEntityChange,
  eventFromSyncResult,
  eventDedupKey,
} from "./event-builder";

// -- Engine -----------------------------------------------------------------
export type {
  EventFilter,
  EventGroupKey,
  EventGroup,
  EventDeduplicationResult,
  EventTimelineEntry,
  IEventEngine,
} from "./event-engine";
export { InMemoryEventEngine } from "./event-engine";

// -- Utils ------------------------------------------------------------------
export {
  filterEventsBySeverity,
  filterEventsByCategory,
  processableEvents,
  terminalEvents,
  eventsForEntity,
  eventsInCorrelation,
  sortEventsBySeverity,
  sortEventsByPriority,
  sortEventsByNewest,
  sortEventsByOldest,
  countEventsByCategory,
  countEventsBySeverity,
  countEventsByType,
  countEventsByStatus,
  hasEventAtSeverity,
  highestEventSeverity,
  uniqueEventEntities,
  uniqueCorrelations,
  uniqueEventTypes,
  groupByCorrelation,
  findRootEvent,
  buildCausationChain,
  eventSetSummary,
} from "./event-utils";
