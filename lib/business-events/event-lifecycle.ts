/**
 * event-lifecycle.ts
 *
 * BUSINESS-EVENT-ENGINE-01
 * Lifecycle states for business events.
 *
 * Event status tracks the EVENT's processing state,
 * NOT the business entity's state.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

/**
 * Lifecycle status of an event.
 *
 * - created: Event has been constructed but not published.
 * - published: Event has been published to the engine.
 * - processing: Event is being consumed by handlers.
 * - processed: All handlers completed successfully.
 * - failed: One or more handlers failed.
 * - ignored: Event was explicitly skipped (e.g., by a rule).
 * - superseded: A newer event replaced this one.
 * - expired: Event's validity window has passed.
 * - unknown: Status cannot be determined.
 */
export type EventStatus =
  | "created"
  | "published"
  | "processing"
  | "processed"
  | "failed"
  | "ignored"
  | "superseded"
  | "expired"
  | "unknown";

/** All valid event statuses. */
export const EVENT_STATUSES: readonly EventStatus[] = [
  "created",
  "published",
  "processing",
  "processed",
  "failed",
  "ignored",
  "superseded",
  "expired",
  "unknown",
] as const;

/** Terminal statuses — event processing is complete. */
export const TERMINAL_EVENT_STATUSES: readonly EventStatus[] = [
  "processed",
  "failed",
  "ignored",
  "superseded",
  "expired",
] as const;

/** Check if an event is in a terminal state. */
export function isTerminalEventStatus(status: EventStatus): boolean {
  return (TERMINAL_EVENT_STATUSES as readonly string[]).includes(status);
}

/** Check if an event can still be processed. */
export function isProcessableEventStatus(status: EventStatus): boolean {
  return status === "created" || status === "published";
}
