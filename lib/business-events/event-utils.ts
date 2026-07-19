/**
 * event-utils.ts
 *
 * BUSINESS-EVENT-ENGINE-01
 * Utility functions for working with Business Events.
 *
 * Pure functions, no side effects, no persistence.
 *
 * No Prisma. No React. No AI. No UI. Pure domain utilities.
 */

import type { BusinessEvent } from "./event";
import type { EventCategory } from "./event-category";
import type { EventSeverity } from "./event-severity";
import { isTerminalEventStatus, isProcessableEventStatus } from "./event-lifecycle";
import { compareEventSeverity, meetsEventSeverityThreshold } from "./event-severity";
import { compareEventPriority } from "./event-priority";

// -- Filtering --------------------------------------------------------------

/** Filter events by minimum severity. */
export function filterEventsBySeverity(events: BusinessEvent[], minSeverity: EventSeverity): BusinessEvent[] {
  return events.filter(e => meetsEventSeverityThreshold(e.severity, minSeverity));
}

/** Filter events by category. */
export function filterEventsByCategory(events: BusinessEvent[], category: EventCategory): BusinessEvent[] {
  return events.filter(e => e.category === category);
}

/** Get only processable events (created or published). */
export function processableEvents(events: BusinessEvent[]): BusinessEvent[] {
  return events.filter(e => isProcessableEventStatus(e.status));
}

/** Get only terminal events. */
export function terminalEvents(events: BusinessEvent[]): BusinessEvent[] {
  return events.filter(e => isTerminalEventStatus(e.status));
}

/** Get events for a specific entity. */
export function eventsForEntity(events: BusinessEvent[], entityId: string): BusinessEvent[] {
  return events.filter(e => e.entity.entityId === entityId);
}

/** Get events in a correlation group. */
export function eventsInCorrelation(events: BusinessEvent[], correlationId: string): BusinessEvent[] {
  return events.filter(e => e.correlation.correlationId === correlationId);
}

// -- Sorting ----------------------------------------------------------------

/** Sort events by severity (highest first). */
export function sortEventsBySeverity(events: BusinessEvent[]): BusinessEvent[] {
  return [...events].sort((a, b) => compareEventSeverity(b.severity, a.severity));
}

/** Sort events by priority (highest first). */
export function sortEventsByPriority(events: BusinessEvent[]): BusinessEvent[] {
  return [...events].sort((a, b) => compareEventPriority(b.priority, a.priority));
}

/** Sort events by occurrence time (newest first). */
export function sortEventsByNewest(events: BusinessEvent[]): BusinessEvent[] {
  return [...events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/** Sort events by occurrence time (oldest first). */
export function sortEventsByOldest(events: BusinessEvent[]): BusinessEvent[] {
  return [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

// -- Aggregation ------------------------------------------------------------

/** Count events by category. */
export function countEventsByCategory(events: BusinessEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.category] = (counts[e.category] ?? 0) + 1;
  return counts;
}

/** Count events by severity. */
export function countEventsBySeverity(events: BusinessEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.severity] = (counts[e.severity] ?? 0) + 1;
  return counts;
}

/** Count events by type. */
export function countEventsByType(events: BusinessEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.eventType] = (counts[e.eventType] ?? 0) + 1;
  return counts;
}

/** Count events by status. */
export function countEventsByStatus(events: BusinessEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.status] = (counts[e.status] ?? 0) + 1;
  return counts;
}

// -- Analysis ---------------------------------------------------------------

/** Check if any event meets a severity threshold. */
export function hasEventAtSeverity(events: BusinessEvent[], threshold: EventSeverity): boolean {
  return events.some(e => meetsEventSeverityThreshold(e.severity, threshold));
}

/** Get the highest severity among events. */
export function highestEventSeverity(events: BusinessEvent[]): EventSeverity | null {
  if (events.length === 0) return null;
  return sortEventsBySeverity(events)[0].severity;
}

/** Get unique entity IDs referenced by events. */
export function uniqueEventEntities(events: BusinessEvent[]): string[] {
  return [...new Set(events.map(e => e.entity.entityId))];
}

/** Get unique correlation IDs. */
export function uniqueCorrelations(events: BusinessEvent[]): string[] {
  return [...new Set(events.map(e => e.correlation.correlationId))];
}

/** Get unique event types present. */
export function uniqueEventTypes(events: BusinessEvent[]): string[] {
  return [...new Set(events.map(e => e.eventType))];
}

// -- Correlation Analysis ---------------------------------------------------

/** Group events by correlation ID. */
export function groupByCorrelation(events: BusinessEvent[]): Map<string, BusinessEvent[]> {
  const groups = new Map<string, BusinessEvent[]>();
  for (const e of events) {
    const id = e.correlation.correlationId;
    const existing = groups.get(id) ?? [];
    existing.push(e);
    groups.set(id, existing);
  }
  return groups;
}

/** Find the root event in a correlation chain. */
export function findRootEvent(events: BusinessEvent[]): BusinessEvent | null {
  return events.find(e => e.correlation.rootEventId === null && e.correlation.causationId === null) ?? null;
}

/** Build a causation chain from root to leaf. */
export function buildCausationChain(events: BusinessEvent[]): BusinessEvent[] {
  const byId = new Map(events.map(e => [e.eventId, e]));
  const root = findRootEvent(events);
  if (!root) return events;

  const chain: BusinessEvent[] = [root];
  const visited = new Set<string>([root.eventId]);

  let current = root;
  while (true) {
    const next = events.find(
      e => e.correlation.causationId === current.eventId && !visited.has(e.eventId),
    );
    if (!next) break;
    chain.push(next);
    visited.add(next.eventId);
    current = next;
  }

  return chain;
}

// -- Summary ----------------------------------------------------------------

/** Build a one-line summary of an event set. */
export function eventSetSummary(events: BusinessEvent[]): string {
  const processable = processableEvents(events);
  const counts = countEventsBySeverity(processable);
  const parts: string[] = [];

  if (counts["critical"]) parts.push(`${counts["critical"]} critical`);
  if (counts["high"]) parts.push(`${counts["high"]} high`);
  if (counts["medium"]) parts.push(`${counts["medium"]} medium`);
  if (counts["low"]) parts.push(`${counts["low"]} low`);
  if (counts["info"]) parts.push(`${counts["info"]} info`);

  if (parts.length === 0) return "No processable events";
  return `${processable.length} events: ${parts.join(", ")}`;
}
