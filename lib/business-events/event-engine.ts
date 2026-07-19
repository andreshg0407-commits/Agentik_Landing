/**
 * event-engine.ts
 *
 * BUSINESS-EVENT-ENGINE-01
 * The Event Engine contract and in-memory implementation.
 *
 * Defines WHAT the Event Engine can do.
 * InMemoryEventEngine provides a testable implementation
 * with deduplication, correlation, filtering, and lifecycle.
 *
 * No Prisma. No React. No AI. No UI. Pure domain contracts.
 */

import type { BusinessEvent } from "./event";
import type { BusinessEventType, EventEntityRef } from "./event-types";
import type { EventCategory } from "./event-category";
import type { EventSource } from "./event-source";
import type { EventSeverity } from "./event-severity";
import type { EventPriority } from "./event-priority";
import type { EventStatus } from "./event-lifecycle";
import { isTerminalEventStatus } from "./event-lifecycle";

// -- Query Types ------------------------------------------------------------

/** Filter criteria for finding events. */
export interface EventFilter {
  organizationId: string;
  eventType?: BusinessEventType;
  eventTypes?: BusinessEventType[];
  entityId?: string;
  entityType?: string;
  categories?: EventCategory[];
  severities?: EventSeverity[];
  priorities?: EventPriority[];
  statuses?: EventStatus[];
  sources?: EventSource[];
  correlationId?: string;
  signalId?: string;
  minConfidence?: number;
  occurredAfter?: string;
  occurredBefore?: string;
  limit?: number;
}

/** Grouping key for event aggregation. */
export type EventGroupKey = "category" | "severity" | "priority" | "eventType" | "source" | "status";

/** A group of events sharing a common dimension value. */
export interface EventGroup {
  key: string;
  value: string;
  count: number;
  events: BusinessEvent[];
}

/** Result of event deduplication. */
export interface EventDeduplicationResult {
  unique: BusinessEvent[];
  duplicateCount: number;
  duplicateKeys: string[];
}

/** Timeline entry for entity event history. */
export interface EventTimelineEntry {
  eventId: string;
  eventType: BusinessEventType;
  category: EventCategory;
  severity: EventSeverity;
  summary: string;
  occurredAt: string;
  entity: EventEntityRef;
}

// -- Event Engine Contract --------------------------------------------------

/**
 * The Event Engine — central interface for all event operations.
 *
 * BUSINESS EVENT RULE: Modules do not call other modules directly.
 * Modules produce events. Engines consume events.
 */
export interface IEventEngine {
  // -- Publishing -----------------------------------------------------------

  /** Publish a new event. Returns the published event. */
  publish(event: BusinessEvent): Promise<BusinessEvent>;

  /** Publish multiple events atomically. */
  publishMany(events: BusinessEvent[]): Promise<BusinessEvent[]>;

  // -- Processing -----------------------------------------------------------

  /** Mark an event as processed. */
  markProcessed(eventId: string): Promise<BusinessEvent | null>;

  /** Mark an event as failed. */
  markFailed(eventId: string, reason?: string): Promise<BusinessEvent | null>;

  /** Ignore an event (skip processing). */
  ignore(eventId: string, reason?: string): Promise<BusinessEvent | null>;

  /** Supersede an event (replaced by a newer event). */
  supersede(eventId: string, supersededByEventId: string): Promise<BusinessEvent | null>;

  /** Expire old events. */
  expire(organizationId: string, olderThan: string): Promise<number>;

  // -- Queries --------------------------------------------------------------

  /** Find events matching a filter. */
  findEvents(filter: EventFilter): Promise<BusinessEvent[]>;

  /** Find events for a specific entity. */
  findByEntity(organizationId: string, entityId: string): Promise<BusinessEvent[]>;

  /** Find events related to a signal. */
  findBySignal(organizationId: string, signalId: string): Promise<BusinessEvent[]>;

  /** Find events in a correlation group. */
  findByCorrelation(correlationId: string): Promise<BusinessEvent[]>;

  /** Get a single event by ID. */
  getEvent(eventId: string): Promise<BusinessEvent | null>;

  // -- Aggregation ----------------------------------------------------------

  /** Group events by a dimension. */
  groupEvents(filter: EventFilter, groupBy: EventGroupKey): Promise<EventGroup[]>;

  // -- Deduplication --------------------------------------------------------

  /** Deduplicate a set of events. */
  deduplicate(events: BusinessEvent[]): EventDeduplicationResult;

  // -- Timeline -------------------------------------------------------------

  /** Build a timeline for an entity. */
  buildTimeline(organizationId: string, entityId: string, limit?: number): Promise<EventTimelineEntry[]>;
}

// -- In-Memory Implementation -----------------------------------------------

/**
 * In-memory event engine for testing and development.
 * Not for production use. No persistence, no concurrency control.
 */
export class InMemoryEventEngine implements IEventEngine {
  private events: Map<string, BusinessEvent> = new Map();
  private dedupIndex: Set<string> = new Set();

  async publish(event: BusinessEvent): Promise<BusinessEvent> {
    // Dedup check
    if (this.dedupIndex.has(event.dedupKey)) {
      const existing = Array.from(this.events.values()).find(e => e.dedupKey === event.dedupKey);
      if (existing) return existing;
    }

    const published = { ...event, status: "published" as const, updatedAt: new Date().toISOString() };
    this.events.set(published.eventId, published);
    this.dedupIndex.add(published.dedupKey);
    return published;
  }

  async publishMany(events: BusinessEvent[]): Promise<BusinessEvent[]> {
    const results: BusinessEvent[] = [];
    for (const e of events) {
      results.push(await this.publish(e));
    }
    return results;
  }

  async markProcessed(eventId: string): Promise<BusinessEvent | null> {
    return this._updateStatus(eventId, "processed");
  }

  async markFailed(eventId: string, _reason?: string): Promise<BusinessEvent | null> {
    return this._updateStatus(eventId, "failed");
  }

  async ignore(eventId: string, _reason?: string): Promise<BusinessEvent | null> {
    return this._updateStatus(eventId, "ignored");
  }

  async supersede(eventId: string, _supersededByEventId: string): Promise<BusinessEvent | null> {
    return this._updateStatus(eventId, "superseded");
  }

  async expire(organizationId: string, olderThan: string): Promise<number> {
    let count = 0;
    for (const [id, e] of this.events) {
      if (e.organizationId === organizationId && e.occurredAt < olderThan && !isTerminalEventStatus(e.status)) {
        this.events.set(id, { ...e, status: "expired", updatedAt: new Date().toISOString() });
        count++;
      }
    }
    return count;
  }

  async findEvents(filter: EventFilter): Promise<BusinessEvent[]> {
    let results = Array.from(this.events.values())
      .filter(e => e.organizationId === filter.organizationId);

    if (filter.eventType) results = results.filter(e => e.eventType === filter.eventType);
    if (filter.eventTypes?.length) results = results.filter(e => filter.eventTypes!.includes(e.eventType));
    if (filter.entityId) results = results.filter(e => e.entity.entityId === filter.entityId);
    if (filter.entityType) results = results.filter(e => e.entity.entityType === filter.entityType);
    if (filter.categories?.length) results = results.filter(e => filter.categories!.includes(e.category));
    if (filter.severities?.length) results = results.filter(e => filter.severities!.includes(e.severity));
    if (filter.priorities?.length) results = results.filter(e => filter.priorities!.includes(e.priority));
    if (filter.statuses?.length) results = results.filter(e => filter.statuses!.includes(e.status));
    if (filter.sources?.length) results = results.filter(e => filter.sources!.includes(e.source));
    if (filter.correlationId) results = results.filter(e => e.correlation.correlationId === filter.correlationId);
    if (filter.signalId) results = results.filter(e => e.correlation.relatedSignalIds.includes(filter.signalId!));
    if (filter.minConfidence != null) results = results.filter(e => e.confidence >= filter.minConfidence!);
    if (filter.occurredAfter) results = results.filter(e => e.occurredAt >= filter.occurredAfter!);
    if (filter.occurredBefore) results = results.filter(e => e.occurredAt <= filter.occurredBefore!);
    if (filter.limit) results = results.slice(0, filter.limit);

    return results;
  }

  async findByEntity(organizationId: string, entityId: string): Promise<BusinessEvent[]> {
    return this.findEvents({ organizationId, entityId });
  }

  async findBySignal(organizationId: string, signalId: string): Promise<BusinessEvent[]> {
    return this.findEvents({ organizationId, signalId });
  }

  async findByCorrelation(correlationId: string): Promise<BusinessEvent[]> {
    return Array.from(this.events.values())
      .filter(e => e.correlation.correlationId === correlationId);
  }

  async getEvent(eventId: string): Promise<BusinessEvent | null> {
    return this.events.get(eventId) ?? null;
  }

  async groupEvents(filter: EventFilter, groupBy: EventGroupKey): Promise<EventGroup[]> {
    const events = await this.findEvents(filter);
    const groups = new Map<string, BusinessEvent[]>();

    for (const e of events) {
      const value = e[groupBy] as string;
      const existing = groups.get(value) ?? [];
      existing.push(e);
      groups.set(value, existing);
    }

    return Array.from(groups.entries()).map(([value, evts]) => ({
      key: groupBy,
      value,
      count: evts.length,
      events: evts,
    }));
  }

  deduplicate(events: BusinessEvent[]): EventDeduplicationResult {
    const seen = new Map<string, BusinessEvent>();
    const duplicateKeys: string[] = [];

    for (const e of events) {
      if (seen.has(e.dedupKey)) {
        duplicateKeys.push(e.dedupKey);
      } else {
        seen.set(e.dedupKey, e);
      }
    }

    return {
      unique: Array.from(seen.values()),
      duplicateCount: duplicateKeys.length,
      duplicateKeys: [...new Set(duplicateKeys)],
    };
  }

  async buildTimeline(organizationId: string, entityId: string, limit?: number): Promise<EventTimelineEntry[]> {
    const events = await this.findByEntity(organizationId, entityId);
    const sorted = events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    const limited = limit ? sorted.slice(0, limit) : sorted;

    return limited.map(e => ({
      eventId: e.eventId,
      eventType: e.eventType,
      category: e.category,
      severity: e.severity,
      summary: e.payload.summary,
      occurredAt: e.occurredAt,
      entity: e.entity,
    }));
  }

  // -- Internal -------------------------------------------------------------

  private _updateStatus(eventId: string, status: EventStatus): BusinessEvent | null {
    const event = this.events.get(eventId);
    if (!event) return null;
    const updated = { ...event, status, updatedAt: new Date().toISOString() };
    this.events.set(eventId, updated);
    return updated;
  }
}
