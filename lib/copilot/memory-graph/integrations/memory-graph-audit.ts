/**
 * lib/copilot/memory-graph/integrations/memory-graph-audit.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Audit Integration
 *
 * Event log for graph operations. Serializable. Never throws.
 * No DB. No server-only.
 */

// ── Audit event types ──────────────────────────────────────────────────────────

export type GraphAuditEventType =
  | "NODE_CREATED"
  | "NODE_UPDATED"
  | "NODE_REMOVED"
  | "EDGE_CREATED"
  | "EDGE_REMOVED"
  | "GRAPH_TRAVERSED"
  | "GRAPH_QUERY_EXECUTED"
  | "GRAPH_SNAPSHOT_CREATED"
  | "GRAPH_SNAPSHOT_RESTORED"
  | "INTEGRITY_CHECK_COMPLETED"
  | "TENANT_ISOLATION_CHECKED";

export interface GraphAuditEvent {
  id:         string;
  orgSlug:    string;
  eventType:  GraphAuditEventType;
  entityId?:  string;               // nodeId or edgeId
  actor?:     string;               // system or user ID
  metadata:   Record<string, unknown>;
  timestamp:  string;               // ISO 8601
  durationMs?: number;
}

export interface GraphAuditLog {
  orgSlug:     string;
  queryId:     string;
  events:      GraphAuditEvent[];
  startedAt:   string;
  completedAt?: string;
}

// ── Audit log creation ─────────────────────────────────────────────────────────

let _auditCounter = 0;

function _auditId(): string {
  _auditCounter++;
  return `mgaud_${Date.now().toString(36)}_${_auditCounter}`;
}

export function createGraphAuditLog(orgSlug: string, queryId: string): GraphAuditLog {
  return {
    orgSlug,
    queryId,
    events:    [],
    startedAt: new Date().toISOString(),
  };
}

// ── Event appenders ────────────────────────────────────────────────────────────

function _append(log: GraphAuditLog, event: Omit<GraphAuditEvent, "id" | "timestamp">): GraphAuditLog {
  const newEvent: GraphAuditEvent = {
    id:        _auditId(),
    timestamp: new Date().toISOString(),
    ...event,
  };
  return { ...log, events: [...log.events, newEvent] };
}

export function auditNodeCreated(log: GraphAuditLog, nodeId: string, orgSlug: string): GraphAuditLog {
  return _append(log, { orgSlug, eventType: "NODE_CREATED", entityId: nodeId, metadata: { nodeId } });
}

export function auditNodeUpdated(log: GraphAuditLog, nodeId: string, orgSlug: string): GraphAuditLog {
  return _append(log, { orgSlug, eventType: "NODE_UPDATED", entityId: nodeId, metadata: { nodeId } });
}

export function auditNodeRemoved(log: GraphAuditLog, nodeId: string, orgSlug: string): GraphAuditLog {
  return _append(log, { orgSlug, eventType: "NODE_REMOVED", entityId: nodeId, metadata: { nodeId } });
}

export function auditEdgeCreated(log: GraphAuditLog, edgeId: string, orgSlug: string): GraphAuditLog {
  return _append(log, { orgSlug, eventType: "EDGE_CREATED", entityId: edgeId, metadata: { edgeId } });
}

export function auditEdgeRemoved(log: GraphAuditLog, edgeId: string, orgSlug: string): GraphAuditLog {
  return _append(log, { orgSlug, eventType: "EDGE_REMOVED", entityId: edgeId, metadata: { edgeId } });
}

export function auditGraphTraversed(
  log: GraphAuditLog,
  startNodeId: string,
  visitedCount: number,
  durationMs: number,
): GraphAuditLog {
  return _append(log, {
    orgSlug:   log.orgSlug,
    eventType: "GRAPH_TRAVERSED",
    entityId:  startNodeId,
    durationMs,
    metadata:  { startNodeId, visitedCount },
  });
}

export function auditGraphQueryExecuted(
  log: GraphAuditLog,
  queryId: string,
  resultCount: number,
  durationMs: number,
): GraphAuditLog {
  return _append(log, {
    orgSlug:   log.orgSlug,
    eventType: "GRAPH_QUERY_EXECUTED",
    entityId:  queryId,
    durationMs,
    metadata:  { queryId, resultCount },
  });
}

export function auditSnapshotCreated(log: GraphAuditLog, snapshotId: string): GraphAuditLog {
  return _append(log, {
    orgSlug:   log.orgSlug,
    eventType: "GRAPH_SNAPSHOT_CREATED",
    entityId:  snapshotId,
    metadata:  { snapshotId },
  });
}

export function auditIntegrityChecked(
  log: GraphAuditLog,
  errorCount: number,
  warningCount: number,
): GraphAuditLog {
  return _append(log, {
    orgSlug:   log.orgSlug,
    eventType: "INTEGRITY_CHECK_COMPLETED",
    metadata:  { errorCount, warningCount },
  });
}

export function auditTenantIsolationChecked(log: GraphAuditLog, clean: boolean): GraphAuditLog {
  return _append(log, {
    orgSlug:   log.orgSlug,
    eventType: "TENANT_ISOLATION_CHECKED",
    metadata:  { clean },
  });
}

// ── Audit summary ──────────────────────────────────────────────────────────────

export interface GraphAuditSummary {
  orgSlug:        string;
  totalEvents:    number;
  nodeCreated:    number;
  nodeRemoved:    number;
  edgeCreated:    number;
  edgeRemoved:    number;
  traversals:     number;
  queries:        number;
  hasViolations:  boolean;
}

export function getGraphAuditSummary(log: GraphAuditLog): GraphAuditSummary {
  const count = (type: GraphAuditEventType) => log.events.filter(e => e.eventType === type).length;
  return {
    orgSlug:       log.orgSlug,
    totalEvents:   log.events.length,
    nodeCreated:   count("NODE_CREATED"),
    nodeRemoved:   count("NODE_REMOVED"),
    edgeCreated:   count("EDGE_CREATED"),
    edgeRemoved:   count("EDGE_REMOVED"),
    traversals:    count("GRAPH_TRAVERSED"),
    queries:       count("GRAPH_QUERY_EXECUTED"),
    hasViolations: false,     // reserved for future compliance signals
  };
}
