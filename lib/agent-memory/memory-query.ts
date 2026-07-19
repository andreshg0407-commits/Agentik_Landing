/**
 * lib/agent-memory/memory-query.ts
 *
 * Agentik Agent Runtime — Operational Memory Query Helpers
 *
 * High-level query functions for the memory graph.
 * These compose the low-level store queries into meaningful operational views.
 *
 * Sprint: AGENTIK-AGENT-CONTEXT-MEMORY-GRAPH-01
 */

import type {
  RuntimeMemoryNode,
  RuntimeMemoryEdge,
  AgentObservation,
  MemoryQueryResult,
} from "./runtime-memory-types";
import {
  queryMemory,
  queryByAction,
  queryByAgent,
  queryByModule,
  queryRelatedActions,
  queryObservations,
} from "./runtime-memory-store";

// ── Operational context query ─────────────────────────────────────────────────

export interface OperationalContext {
  recentNodes:     RuntimeMemoryNode[];
  recentObs:       AgentObservation[];
  pendingActions:  RuntimeMemoryNode[];
  failedActions:   RuntimeMemoryNode[];
  criticalSignals: RuntimeMemoryNode[];
}

/**
 * Returns the most recent operational context for an org.
 * Used to seed agent context windows before reasoning.
 */
export async function getRecentOperationalContext(
  orgId:      string,
  windowMins  = 60,
  limit       = 20,
): Promise<OperationalContext> {
  const since = new Date(Date.now() - windowMins * 60_000).toISOString();

  const [recentNodes, recentObs, pendingActions, failedActions, criticalSignals] =
    await Promise.all([
      queryMemory({ orgId, since, limit }),
      queryObservations({ orgId, since, limit }),
      queryMemory({ orgId, nodeType: ["action_proposed"], since, limit: 10 }),
      queryMemory({ orgId, nodeType: ["action_failed"], since, limit: 10 }),
      queryMemory({ orgId, severity: ["critical", "high"], since, limit: 10 }),
    ]);

  return { recentNodes, recentObs, pendingActions, failedActions, criticalSignals };
}

// ── Module history ────────────────────────────────────────────────────────────

export interface ModuleOperationalHistory {
  moduleId:   string;
  nodes:      RuntimeMemoryNode[];
  obs:        AgentObservation[];
  nodeCount:  number;
  obsCount:   number;
}

/**
 * Returns the full operational history for a module.
 * Includes all memory nodes + observations within the optional time window.
 */
export async function getModuleOperationalHistory(
  moduleId:   string,
  orgId:      string,
  windowMins?: number,
  limit = 50,
): Promise<ModuleOperationalHistory> {
  const since = windowMins
    ? new Date(Date.now() - windowMins * 60_000).toISOString()
    : undefined;

  const [nodes, obs] = await Promise.all([
    queryByModule(moduleId, orgId, limit),
    queryObservations({ moduleId, orgId, since, limit }),
  ]);

  return {
    moduleId,
    nodes,
    obs,
    nodeCount: nodes.length,
    obsCount:  obs.length,
  };
}

// ── Action chain query ────────────────────────────────────────────────────────

export interface ActionChain {
  actionId:      string;
  primaryNodes:  RuntimeMemoryNode[];
  relatedNodes:  RuntimeMemoryNode[];
  allNodeCount:  number;
}

/**
 * Returns the full action chain — all nodes directly associated with
 * an actionId, plus their related nodes via edges.
 */
export async function getRelatedActionChain(
  actionId: string,
  orgId?:   string,
): Promise<ActionChain> {
  const [primaryNodes, relatedNodes] = await Promise.all([
    queryByAction(actionId, orgId),
    queryRelatedActions(actionId),
  ]);

  // Deduplicate: relatedNodes may overlap with primaryNodes
  const primaryIds = new Set(primaryNodes.map(n => n.id));
  const deduped    = relatedNodes.filter(n => !primaryIds.has(n.id));

  return {
    actionId,
    primaryNodes,
    relatedNodes: deduped,
    allNodeCount: primaryNodes.length + deduped.length,
  };
}

// ── Agent decision trail ──────────────────────────────────────────────────────

export interface AgentDecisionTrail {
  agentId:    string;
  decisions:  RuntimeMemoryNode[];
  proposals:  RuntimeMemoryNode[];
  failures:   RuntimeMemoryNode[];
  total:      number;
}

/**
 * Returns the decision trail for a specific agent — proposed actions,
 * approved/rejected decisions, and failures — within a time window.
 */
export async function getAgentDecisionTrail(
  agentId:     string,
  orgId:       string,
  windowMins = 480,
  limit = 30,
): Promise<AgentDecisionTrail> {
  const since = new Date(Date.now() - windowMins * 60_000).toISOString();

  const [allNodes] = await Promise.all([
    queryByAgent(agentId, orgId, limit),
  ]);

  const filtered = since ? allNodes.filter(n => n.timestamp >= since) : allNodes;

  const decisions = filtered.filter(n =>
    n.nodeType === "decision_point" ||
    n.nodeType === "action_approved" ||
    n.nodeType === "action_rejected",
  );
  const proposals = filtered.filter(n => n.nodeType === "action_proposed");
  const failures  = filtered.filter(n => n.nodeType === "action_failed");

  return { agentId, decisions, proposals, failures, total: filtered.length };
}

// ── Multi-agent context ───────────────────────────────────────────────────────

export interface MultiAgentOperationalView {
  orgId:   string;
  byAgent: Record<string, {
    agentId:   string;
    nodeCount: number;
    pending:   number;
    failures:  number;
    lastSeen:  string | null;
  }>;
  summary: {
    totalNodes:    number;
    totalPending:  number;
    totalFailures: number;
    activeAgents:  number;
  };
}

/**
 * Returns a multi-agent operational snapshot for an org.
 * Aggregates per-agent node counts and status breakdowns.
 */
export async function getMultiAgentOperationalView(
  orgId:      string,
  windowMins = 240,
): Promise<MultiAgentOperationalView> {
  const since = new Date(Date.now() - windowMins * 60_000).toISOString();
  const nodes = await queryMemory({ orgId, since, limit: 200 });

  const byAgent: MultiAgentOperationalView["byAgent"] = {};

  for (const node of nodes) {
    const aid = String(node.agentId);
    if (!byAgent[aid]) {
      byAgent[aid] = { agentId: aid, nodeCount: 0, pending: 0, failures: 0, lastSeen: null };
    }
    const bucket = byAgent[aid]!;
    bucket.nodeCount++;
    if (node.nodeType === "action_proposed") bucket.pending++;
    if (node.nodeType === "action_failed")   bucket.failures++;
    if (!bucket.lastSeen || node.timestamp > bucket.lastSeen) {
      bucket.lastSeen = node.timestamp;
    }
  }

  const totalPending  = nodes.filter(n => n.nodeType === "action_proposed").length;
  const totalFailures = nodes.filter(n => n.nodeType === "action_failed").length;

  return {
    orgId,
    byAgent,
    summary: {
      totalNodes:   nodes.length,
      totalPending,
      totalFailures,
      activeAgents: Object.keys(byAgent).length,
    },
  };
}

// ── Simple query result wrapper ───────────────────────────────────────────────

export async function queryToResult(
  nodes: RuntimeMemoryNode[],
  meta:  Record<string, unknown> = {},
): Promise<MemoryQueryResult> {
  return {
    nodes,
    edges: [],
    total: nodes.length,
    queryMeta: meta,
  };
}
