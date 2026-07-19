/**
 * lib/agent-runtime/event-store-types.ts
 *
 * Agentik Runtime Event Store — Type Definitions
 *
 * Defines the persistent, structured event record for all runtime events.
 * Every meaningful state transition in the multiagent runtime produces
 * a RuntimeStoredEvent that can be queried, replayed, and analyzed.
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-EVENT-STORE-01
 */

// ── Event categories ──────────────────────────────────────────────────────────

export type EventCategory =
  | "action"       // Action lifecycle: suggested → approved → rejected → executed
  | "delegation"   // Delegation lifecycle: proposed → approved → completed
  | "plan"         // Planning events: plan created, blocked, ready, completed
  | "memory"       // Memory graph write events
  | "intelligence" // Runtime intelligence report events
  | "tool"         // Tool invocations
  | "workflow"     // Workflow step transitions
  | "system";      // System-level events: health checks, snapshots

// ── Event severity ────────────────────────────────────────────────────────────

export type EventSeverity =
  | "debug"    // Low-level trace, filtered in production
  | "info"     // Normal operational flow
  | "notice"   // Noteworthy event (approval, delegation, plan creation)
  | "warning"  // Potential issue (stale action, missing owner)
  | "critical"; // Requires immediate attention

// ── Core persistent event record ─────────────────────────────────────────────

export interface RuntimeStoredEvent {
  // Identity
  id:            string;   // Unique event ID (esid_...)
  orgId:         string;
  schemaVersion: number;   // V1 = 1

  // Classification
  eventType:  string;       // e.g. "action.approved", "delegation.proposed"
  category:   EventCategory;
  severity:   EventSeverity;

  // Contextual references (null if not applicable)
  agentId:      string | null;
  moduleKey:    string | null;
  actionId:     string | null;
  delegationId: string | null;
  planId:       string | null;

  // Correlation / causation chain
  correlationId: string | null; // Groups related events in one operation
  causationId:   string | null; // ID of the event that caused this one
  parentEventId: string | null; // Direct parent in the event chain

  // Event payload (serializable)
  payload:  Record<string, unknown>;
  metadata: Record<string, unknown>;

  // Timing
  occurredAt: string;  // ISO — when the event happened
  recordedAt: string;  // ISO — when it was persisted to the store
}

// ── Event store filters ────────────────────────────────────────────────────────

export interface EventStoreFilter {
  orgId?:        string;
  category?:     EventCategory | EventCategory[];
  severity?:     EventSeverity | EventSeverity[];
  agentId?:      string;
  actionId?:     string;
  delegationId?: string;
  planId?:       string;
  correlationId?: string;
  since?:        string;  // ISO
  until?:        string;  // ISO
  limit?:        number;
}

// ── Timeline shape ────────────────────────────────────────────────────────────

export interface EventTimelineEntry {
  id:            string;
  eventType:     string;
  category:      EventCategory;
  severity:      EventSeverity;
  agentId:       string | null;
  moduleKey:     string | null;
  actionId:      string | null;
  delegationId:  string | null;
  correlationId: string | null;
  summary:       string;   // Human-readable one-liner
  occurredAt:    string;
}

export interface EventTimeline {
  entries:     EventTimelineEntry[];
  totalCount:  number;
  since:       string;
  generatedAt: string;
}

// ── Event store diagnostics ───────────────────────────────────────────────────

export interface EventStoreDiagnostics {
  totalEvents:       number;
  byCategory:        Record<EventCategory, number>;
  byAgent:           Record<string, number>;
  bySeverity:        Record<EventSeverity, number>;
  correlationCount:  number;
  orphanEvents:      number;   // Events without correlationId
  latestEventAt:     string | null;
  oldestEventAt:     string | null;
  storeType:         string;
  schemaVersion:     number;
}

// ── ID generator ─────────────────────────────────────────────────────────────

let _seq = 0;
export function esid(): string { return `esid_${Date.now()}_${++_seq}`; }
export function escorrid(base: string): string {
  // Stable correlation ID from a base (actionId/delegationId/orgId)
  // Not cryptographic — just consistent for grouping
  const hash = base.split("").reduce((acc, c) => ((acc << 5) - acc) + c.charCodeAt(0), 0);
  return `escorr_${Math.abs(hash).toString(36)}`;
}
