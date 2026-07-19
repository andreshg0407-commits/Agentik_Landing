/**
 * lib/agent-runtime/event-store.ts
 *
 * Agentik Runtime Event Store — Adapter + In-Memory V1
 *
 * Contract:
 *   appendRuntimeEvent        — persist single event
 *   appendRuntimeEvents       — persist batch
 *   getRuntimeEvent           — fetch by ID
 *   queryRuntimeEvents        — filtered query
 *   getEventsByCorrelation    — by correlationId
 *   getEventsByAction         — by actionId
 *   getEventsByDelegation     — by delegationId
 *   getEventsByPlan           — by planId
 *   getLatestRuntimeEvents    — most recent N events
 *   buildRuntimeEventTimeline — timeline projection
 *
 * V1: InMemory — process-scoped, reset on restart.
 * V2: Prisma-backed — swap adapter without changing API.
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-EVENT-STORE-01
 */

import type {
  RuntimeStoredEvent,
  EventStoreFilter,
  EventTimeline,
  EventTimelineEntry,
  EventStoreDiagnostics,
  EventCategory,
  EventSeverity,
} from "./event-store-types";
import { esid } from "./event-store-types";

// ── Adapter contract ──────────────────────────────────────────────────────────

export interface EventStoreAdapter {
  append(event: RuntimeStoredEvent): Promise<RuntimeStoredEvent>;
  appendBatch(events: RuntimeStoredEvent[]): Promise<RuntimeStoredEvent[]>;
  getById(eventId: string): Promise<RuntimeStoredEvent | null>;
  query(filter: EventStoreFilter): Promise<RuntimeStoredEvent[]>;
  diagnostics(orgId: string): Promise<EventStoreDiagnostics>;
}

// ── In-Memory V1 ──────────────────────────────────────────────────────────────

class InMemoryEventStore implements EventStoreAdapter {
  private events = new Map<string, RuntimeStoredEvent>();

  async append(event: RuntimeStoredEvent): Promise<RuntimeStoredEvent> {
    this.events.set(event.id, event);
    return event;
  }

  async appendBatch(events: RuntimeStoredEvent[]): Promise<RuntimeStoredEvent[]> {
    for (const e of events) this.events.set(e.id, e);
    return events;
  }

  async getById(eventId: string): Promise<RuntimeStoredEvent | null> {
    return this.events.get(eventId) ?? null;
  }

  async query(filter: EventStoreFilter): Promise<RuntimeStoredEvent[]> {
    let results = [...this.events.values()];

    if (filter.orgId) {
      results = results.filter(e => e.orgId === filter.orgId);
    }
    if (filter.category) {
      const cats = Array.isArray(filter.category) ? filter.category : [filter.category];
      results = results.filter(e => cats.includes(e.category));
    }
    if (filter.severity) {
      const sevs = Array.isArray(filter.severity) ? filter.severity : [filter.severity];
      results = results.filter(e => sevs.includes(e.severity));
    }
    if (filter.agentId)      results = results.filter(e => e.agentId === filter.agentId);
    if (filter.actionId)     results = results.filter(e => e.actionId === filter.actionId);
    if (filter.delegationId) results = results.filter(e => e.delegationId === filter.delegationId);
    if (filter.planId)       results = results.filter(e => e.planId === filter.planId);
    if (filter.correlationId)results = results.filter(e => e.correlationId === filter.correlationId);
    if (filter.since)        results = results.filter(e => e.occurredAt >= filter.since!);
    if (filter.until)        results = results.filter(e => e.occurredAt <= filter.until!);

    // Sort newest first
    results.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

    if (filter.limit && filter.limit > 0) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  async diagnostics(orgId: string): Promise<EventStoreDiagnostics> {
    const all = orgId
      ? [...this.events.values()].filter(e => e.orgId === orgId)
      : [...this.events.values()];

    const byCategory: Record<string, number> = {};
    const byAgent:    Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const correlations = new Set<string>();
    let orphanCount = 0;
    let latestAt:  string | null = null;
    let oldestAt:  string | null = null;

    for (const e of all) {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
      bySeverity[e.severity] = (bySeverity[e.severity] ?? 0) + 1;
      if (e.agentId) byAgent[e.agentId] = (byAgent[e.agentId] ?? 0) + 1;
      if (e.correlationId) {
        correlations.add(e.correlationId);
      } else {
        orphanCount++;
      }
      if (!latestAt || e.occurredAt > latestAt) latestAt = e.occurredAt;
      if (!oldestAt || e.occurredAt < oldestAt) oldestAt = e.occurredAt;
    }

    return {
      totalEvents:      all.length,
      byCategory:       byCategory as Record<EventCategory, number>,
      byAgent,
      bySeverity:       bySeverity as Record<EventSeverity, number>,
      correlationCount: correlations.size,
      orphanEvents:     orphanCount,
      latestEventAt:    latestAt,
      oldestEventAt:    oldestAt,
      storeType:        "InMemoryEventStore V1",
      schemaVersion:    1,
    };
  }
}

// ── Singleton store ───────────────────────────────────────────────────────────

let _store: EventStoreAdapter = new InMemoryEventStore();

export function setEventStoreAdapter(adapter: EventStoreAdapter): void {
  _store = adapter;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function appendRuntimeEvent(
  event: RuntimeStoredEvent,
): Promise<RuntimeStoredEvent> {
  return _store.append(event);
}

export async function appendRuntimeEvents(
  events: RuntimeStoredEvent[],
): Promise<RuntimeStoredEvent[]> {
  return _store.appendBatch(events);
}

export async function getRuntimeEvent(
  eventId: string,
): Promise<RuntimeStoredEvent | null> {
  return _store.getById(eventId);
}

export async function queryRuntimeEvents(
  filter: EventStoreFilter,
): Promise<RuntimeStoredEvent[]> {
  return _store.query(filter);
}

export async function getEventsByCorrelation(
  correlationId: string,
  orgId: string,
): Promise<RuntimeStoredEvent[]> {
  return _store.query({ correlationId, orgId });
}

export async function getEventsByAction(
  actionId: string,
  orgId: string,
): Promise<RuntimeStoredEvent[]> {
  return _store.query({ actionId, orgId });
}

export async function getEventsByDelegation(
  delegationId: string,
  orgId: string,
): Promise<RuntimeStoredEvent[]> {
  return _store.query({ delegationId, orgId });
}

export async function getEventsByPlan(
  planId: string,
  orgId: string,
): Promise<RuntimeStoredEvent[]> {
  return _store.query({ planId, orgId });
}

export async function getLatestRuntimeEvents(
  orgId:  string,
  limit:  number = 50,
  since?: string,
): Promise<RuntimeStoredEvent[]> {
  return _store.query({ orgId, since, limit });
}

export async function getEventStoreDiagnostics(
  orgId: string,
): Promise<EventStoreDiagnostics> {
  return _store.diagnostics(orgId);
}

// ── Timeline builder ──────────────────────────────────────────────────────────

function eventToTimelineEntry(e: RuntimeStoredEvent): EventTimelineEntry {
  return {
    id:            e.id,
    eventType:     e.eventType,
    category:      e.category,
    severity:      e.severity,
    agentId:       e.agentId,
    moduleKey:     e.moduleKey,
    actionId:      e.actionId,
    delegationId:  e.delegationId,
    correlationId: e.correlationId,
    summary:       buildEventSummary(e),
    occurredAt:    e.occurredAt,
  };
}

function buildEventSummary(e: RuntimeStoredEvent): string {
  const agent  = e.agentId ? `[${agentShort(e.agentId)}]` : "";
  const mod    = e.moduleKey ? ` @ ${e.moduleKey}` : "";
  const action = e.payload?.title ? ` "${String(e.payload.title).slice(0, 40)}"` : "";
  const type   = e.eventType.replace(/\./g, " → ");
  return `${agent} ${type}${action}${mod}`.trim();
}

function agentShort(id: string): string {
  const labels: Record<string, string> = {
    david_commercial: "David", diego_finance: "Diego",
    luca_marketing: "Luca", mila_collections: "Mila",
    agentik_copilot: "Copilot", system: "System",
  };
  return labels[id] ?? id;
}

export async function buildRuntimeEventTimeline(
  orgId:  string,
  filter: EventStoreFilter = {},
): Promise<EventTimeline> {
  const events  = await _store.query({ ...filter, orgId });
  const entries = events.map(eventToTimelineEntry);
  const since   = filter.since ?? (entries.at(-1)?.occurredAt ?? new Date().toISOString());

  return {
    entries,
    totalCount:  events.length,
    since,
    generatedAt: new Date().toISOString(),
  };
}

// ── Internal: create a stored event from raw parts ────────────────────────────
// Used by normalizer — not for direct external use.

export function createStoredEvent(
  partial: Omit<RuntimeStoredEvent, "id" | "recordedAt" | "schemaVersion">,
): RuntimeStoredEvent {
  return {
    ...partial,
    id:            esid(),
    recordedAt:    new Date().toISOString(),
    schemaVersion: 1,
  };
}
