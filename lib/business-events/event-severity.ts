/**
 * event-severity.ts
 *
 * BUSINESS-EVENT-ENGINE-01
 * Severity levels for business events.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

/** Event severity levels. */
export type EventSeverity =
  | "info"
  | "low"
  | "medium"
  | "high"
  | "critical"
  | "unknown";

/** All valid event severities. */
export const EVENT_SEVERITIES: readonly EventSeverity[] = [
  "info", "low", "medium", "high", "critical", "unknown",
] as const;

/** Numeric rank for severity comparisons. Higher = more severe. */
const SEVERITY_RANK: Record<EventSeverity, number> = {
  unknown: 0, info: 1, low: 2, medium: 3, high: 4, critical: 5,
};

/** Compare two event severities. Returns positive if a > b. */
export function compareEventSeverity(a: EventSeverity, b: EventSeverity): number {
  return SEVERITY_RANK[a] - SEVERITY_RANK[b];
}

/** Check if severity meets or exceeds a threshold. */
export function meetsEventSeverityThreshold(severity: EventSeverity, threshold: EventSeverity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[threshold];
}
