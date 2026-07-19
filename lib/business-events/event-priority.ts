/**
 * event-priority.ts
 *
 * BUSINESS-EVENT-ENGINE-01
 * Priority levels for business events.
 *
 * Priority is INDEPENDENT of severity, same as in Signals.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

/** Event priority levels. */
export type EventPriority =
  | "lowest"
  | "low"
  | "normal"
  | "high"
  | "highest";

/** All valid event priorities. */
export const EVENT_PRIORITIES: readonly EventPriority[] = [
  "lowest", "low", "normal", "high", "highest",
] as const;

/** Numeric rank for priority comparisons. */
const PRIORITY_RANK: Record<EventPriority, number> = {
  lowest: 1, low: 2, normal: 3, high: 4, highest: 5,
};

/** Compare two event priorities. Returns positive if a > b. */
export function compareEventPriority(a: EventPriority, b: EventPriority): number {
  return PRIORITY_RANK[a] - PRIORITY_RANK[b];
}
