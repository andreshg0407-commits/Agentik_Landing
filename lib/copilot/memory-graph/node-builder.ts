/**
 * lib/copilot/memory-graph/node-builder.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Node Factory
 *
 * Converts domain entities into GraphNode instances.
 * Deterministic. No AI. No DB. No server-only.
 */

import type { GraphNode, GraphNodeType } from "./memory-graph-types";
import { generateNodeId, generateQueryId } from "./graph-identity";
import { GRAPH_DEFAULT_WEIGHT } from "./memory-graph-types";

// ── Base factory ───────────────────────────────────────────────────────────────

export interface BuildNodeInput {
  orgSlug:   string;
  type:      GraphNodeType;
  label:     string;
  source:    string;
  metadata?: Record<string, unknown>;
  tags?:     string[];
  weight?:   number;
  id?:       string;            // override — use when entity has a stable ID
}

/**
 * buildNode — create a GraphNode from raw input.
 * Always org-scoped. Always has provenance (source).
 */
export function buildNode(input: BuildNodeInput): GraphNode {
  return {
    id:        input.id ?? generateNodeId(),
    orgSlug:   input.orgSlug,
    type:      input.type,
    label:     input.label,
    metadata:  input.metadata ?? {},
    source:    input.source,
    tags:      input.tags ?? [],
    createdAt: new Date().toISOString(),
    weight:    input.weight ?? GRAPH_DEFAULT_WEIGHT,
  };
}

// ── Domain-specific builders ───────────────────────────────────────────────────

/**
 * buildMemoryNode — create a MEMORY node from a raw memory entry.
 */
export function buildMemoryNode(orgSlug: string, memory: {
  id: string;
  title: string;
  type?: string;
  importance?: string;
  tags?: string[];
  source?: string;
  content?: string;
}): GraphNode {
  return buildNode({
    id:      `mgn_mem_${memory.id}`,
    orgSlug,
    type:    "MEMORY",
    label:   memory.title,
    source:  "memory-integration",
    weight:  _importanceToWeight(memory.importance),
    tags:    memory.tags ?? [],
    metadata: {
      memoryId:   memory.id,
      memoryType: memory.type,
      importance: memory.importance,
      content:    memory.content?.slice(0, 200),   // truncate — never store full content
    },
  });
}

/**
 * buildPlaybookNode — create a PLAYBOOK node.
 */
export function buildPlaybookNode(orgSlug: string, playbook: {
  id: string;
  title: string;
  category?: string;
  priority?: string;
  status?: string;
  tags?: string[];
}): GraphNode {
  return buildNode({
    id:      `mgn_pb_${playbook.id}`,
    orgSlug,
    type:    "PLAYBOOK",
    label:   playbook.title,
    source:  "playbook-integration",
    weight:  _priorityToWeight(playbook.priority),
    tags:    playbook.tags ?? [],
    metadata: {
      playbookId: playbook.id,
      category:   playbook.category,
      priority:   playbook.priority,
      status:     playbook.status,
    },
  });
}

/**
 * buildInsightNode — create an INSIGHT node.
 */
export function buildInsightNode(orgSlug: string, insight: {
  id: string;
  title?: string;
  type?: string;
  category?: string;
  executiveImpact?: string;
  confidence?: string;
}): GraphNode {
  return buildNode({
    id:      `mgn_ins_${insight.id}`,
    orgSlug,
    type:    "INSIGHT",
    label:   insight.title ?? `Insight ${insight.id}`,
    source:  "intelligence-integration",
    weight:  _impactToWeight(insight.executiveImpact),
    tags:    [insight.category ?? "", insight.executiveImpact ?? ""].filter(Boolean),
    metadata: {
      insightId:       insight.id,
      insightType:     insight.type,
      category:        insight.category,
      executiveImpact: insight.executiveImpact,
      confidence:      insight.confidence,
    },
  });
}

/**
 * buildEventNode — create an EVENT node.
 */
export function buildEventNode(orgSlug: string, event: {
  id?: string;
  label: string;
  eventType?: string;
  source?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}): GraphNode {
  return buildNode({
    id:      event.id ? `mgn_evt_${event.id}` : generateNodeId(),
    orgSlug,
    type:    "EVENT",
    label:   event.label,
    source:  event.source ?? "event-integration",
    weight:  GRAPH_DEFAULT_WEIGHT,
    metadata: {
      eventType: event.eventType,
      timestamp: event.timestamp,
      ...event.metadata,
    },
  });
}

/**
 * buildAlertNode — create an ALERT node.
 */
export function buildAlertNode(orgSlug: string, alert: {
  id?: string;
  label: string;
  severity?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}): GraphNode {
  return buildNode({
    id:      alert.id ? `mgn_alrt_${alert.id}` : generateNodeId(),
    orgSlug,
    type:    "ALERT",
    label:   alert.label,
    source:  alert.source ?? "alert-integration",
    weight:  _severityToWeight(alert.severity),
    tags:    [alert.severity ?? ""].filter(Boolean),
    metadata: {
      severity: alert.severity,
      ...alert.metadata,
    },
  });
}

/**
 * buildAnomalyNode — create an ANOMALY node.
 */
export function buildAnomalyNode(orgSlug: string, anomaly: {
  id?: string;
  label: string;
  severity?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}): GraphNode {
  return buildNode({
    id:      anomaly.id ? `mgn_anom_${anomaly.id}` : generateNodeId(),
    orgSlug,
    type:    "ANOMALY",
    label:   anomaly.label,
    source:  anomaly.source ?? "anomaly-integration",
    weight:  _severityToWeight(anomaly.severity),
    tags:    [anomaly.severity ?? ""].filter(Boolean),
    metadata: {
      severity: anomaly.severity,
      ...anomaly.metadata,
    },
  });
}

/**
 * buildDecisionNode — create a DECISION node.
 */
export function buildDecisionNode(orgSlug: string, decision: {
  id?: string;
  label: string;
  outcome?: string;
  confidence?: number;
  source?: string;
  metadata?: Record<string, unknown>;
}): GraphNode {
  return buildNode({
    id:      decision.id ? `mgn_dec_${decision.id}` : generateNodeId(),
    orgSlug,
    type:    "DECISION",
    label:   decision.label,
    source:  decision.source ?? "decision-builder",
    weight:  typeof decision.confidence === "number" ? decision.confidence / 100 : GRAPH_DEFAULT_WEIGHT,
    tags:    [decision.outcome ?? ""].filter(Boolean),
    metadata: {
      outcome:    decision.outcome,
      confidence: decision.confidence,
      ...decision.metadata,
    },
  });
}

// ── Generic entity builders ────────────────────────────────────────────────────

export function buildClientNode(orgSlug: string, id: string, label: string, metadata?: Record<string, unknown>): GraphNode {
  return buildNode({ id: `mgn_cli_${id}`, orgSlug, type: "CLIENT", label, source: "entity-builder", metadata: { entityId: id, ...metadata } });
}

export function buildProductNode(orgSlug: string, id: string, label: string, metadata?: Record<string, unknown>): GraphNode {
  return buildNode({ id: `mgn_prd_${id}`, orgSlug, type: "PRODUCT", label, source: "entity-builder", metadata: { entityId: id, ...metadata } });
}

export function buildOrderNode(orgSlug: string, id: string, label: string, metadata?: Record<string, unknown>): GraphNode {
  return buildNode({ id: `mgn_ord_${id}`, orgSlug, type: "ORDER", label, source: "entity-builder", metadata: { entityId: id, ...metadata } });
}

export function buildCampaignNode(orgSlug: string, id: string, label: string, metadata?: Record<string, unknown>): GraphNode {
  return buildNode({ id: `mgn_cam_${id}`, orgSlug, type: "CAMPAIGN", label, source: "entity-builder", metadata: { entityId: id, ...metadata } });
}

export function buildTaskNode(orgSlug: string, id: string, label: string, metadata?: Record<string, unknown>): GraphNode {
  return buildNode({ id: `mgn_tsk_${id}`, orgSlug, type: "TASK", label, source: "entity-builder", metadata: { entityId: id, ...metadata } });
}

export function buildAgentNode(orgSlug: string, id: string, label: string, metadata?: Record<string, unknown>): GraphNode {
  return buildNode({ id: `mgn_agt_${id}`, orgSlug, type: "AGENT", label, source: "entity-builder", metadata: { agentId: id, ...metadata } });
}

export function buildDocumentNode(orgSlug: string, id: string, label: string, metadata?: Record<string, unknown>): GraphNode {
  return buildNode({ id: `mgn_doc_${id}`, orgSlug, type: "DOCUMENT", label, source: "entity-builder", metadata: { documentId: id, ...metadata } });
}

export function buildReportNode(orgSlug: string, id: string, label: string, metadata?: Record<string, unknown>): GraphNode {
  return buildNode({ id: `mgn_rpt_${id}`, orgSlug, type: "REPORT", label, source: "entity-builder", metadata: { reportId: id, ...metadata } });
}

// ── Weight helpers ─────────────────────────────────────────────────────────────

function _importanceToWeight(importance?: string): number {
  switch (importance) {
    case "CRITICAL": return 1.0;
    case "HIGH":     return 0.8;
    case "MEDIUM":   return 0.5;
    case "LOW":      return 0.3;
    default:         return GRAPH_DEFAULT_WEIGHT;
  }
}

function _priorityToWeight(priority?: string): number {
  switch (priority) {
    case "CRITICAL": return 1.0;
    case "HIGH":     return 0.8;
    case "MEDIUM":   return 0.5;
    case "LOW":      return 0.3;
    default:         return GRAPH_DEFAULT_WEIGHT;
  }
}

function _impactToWeight(impact?: string): number {
  switch (impact) {
    case "CRITICAL": return 1.0;
    case "HIGH":     return 0.8;
    case "MEDIUM":   return 0.5;
    case "LOW":      return 0.3;
    default:         return GRAPH_DEFAULT_WEIGHT;
  }
}

function _severityToWeight(severity?: string): number {
  switch (severity) {
    case "CRITICAL": return 1.0;
    case "HIGH":     return 0.8;
    case "MEDIUM":   return 0.5;
    case "LOW":      return 0.3;
    default:         return GRAPH_DEFAULT_WEIGHT;
  }
}

// Re-export for convenience
export { generateQueryId };
