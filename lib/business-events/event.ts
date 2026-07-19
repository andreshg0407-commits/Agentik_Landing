/**
 * event.ts
 *
 * BUSINESS-EVENT-ENGINE-01
 * The Business Event — represents that a relevant transition occurred.
 *
 * A Signal = a condition exists.
 * An Event = a transition happened.
 *
 * Events are the bridge between operational state changes and
 * downstream consumers (Rule Engine, Action Engine, Executive Intelligence,
 * David, Copilot, notifications, automatizations).
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { BusinessEventType, EventEntityRef } from "./event-types";
import type { EventCategory } from "./event-category";
import type { EventSource } from "./event-source";
import type { EventSeverity } from "./event-severity";
import type { EventPriority } from "./event-priority";
import type { EventStatus } from "./event-lifecycle";
import type { EventPayload } from "./event-payload";
import type { EventCorrelation } from "./event-correlation";
import type { EventTrace } from "./event-trace";

// -- Business Event ---------------------------------------------------------

/**
 * The Business Event.
 *
 * Core contract of the Operational Event Engine.
 * Every relevant business transition is represented as a BusinessEvent.
 *
 * Events are:
 *   - Typed (eventType identifies the transition)
 *   - Categorized (category identifies the domain)
 *   - Traceable (trace explains provenance)
 *   - Correlated (correlation links related events)
 *   - Payload-rich (payload captures state transitions)
 *   - Lifecycle-tracked (status tracks processing)
 *   - Deduplicable (dedupKey prevents duplicates)
 */
export interface BusinessEvent {
  /** Unique event ID. */
  eventId: string;
  /** Organization this event belongs to. */
  organizationId: string;
  /** Type of business transition. */
  eventType: BusinessEventType;
  /** Business domain category. */
  category: EventCategory;
  /** System layer that produced this event. */
  source: EventSource;
  /** Severity of the transition. */
  severity: EventSeverity;
  /** Processing priority (independent of severity). */
  priority: EventPriority;
  /** Lifecycle status of this event. */
  status: EventStatus;
  /** ISO timestamp when the transition occurred in the real world. */
  occurredAt: string;
  /** ISO timestamp when the system detected the transition. */
  detectedAt: string;
  /** Primary entity this event relates to. */
  entity: EventEntityRef;
  /** Other entities affected by or involved in this event. */
  relatedEntities: EventEntityRef[];
  /** Event payload — state transitions, metrics, amounts, etc. */
  payload: EventPayload;
  /** Correlation and causation metadata. */
  correlation: EventCorrelation;
  /** Traceability — provenance chain. */
  trace: EventTrace;
  /** Confidence in this event (0-100). */
  confidence: number;
  /** Deduplication key — events with the same key are equivalent. */
  dedupKey: string;
  /** Arbitrary domain-specific metadata. */
  metadata: Record<string, unknown>;
  /** ISO timestamp when the event was created. */
  createdAt: string;
  /** ISO timestamp when the event was last updated. */
  updatedAt: string;
}
