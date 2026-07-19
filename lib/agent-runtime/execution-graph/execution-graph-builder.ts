/**
 * lib/agent-runtime/execution-graph/execution-graph-builder.ts
 *
 * Agentik Execution Graph — Graph Builder
 *
 * Builds an ExecutionGraph from raw runtime sources.
 * Pure function — no I/O, no side effects.
 *
 * Entry point:
 *   buildExecutionGraph(sources) → ExecutionGraph
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-EXECUTION-GRAPH-01
 */

import type { ActionEnvelope }     from "@/lib/agent-runtime/action-envelope";
import type { ExecutionSession }   from "@/lib/agent-runtime/execution-lifecycle-types";
import type { AgentDelegation }    from "@/lib/agent-orchestration/delegation-types";
import type { OperationalPlan }    from "@/lib/agent-planning/planning-types";
import type { RuntimeStoredEvent } from "@/lib/agent-runtime/event-store-types";
import type { RuntimeMemoryNode }  from "@/lib/agent-memory/runtime-memory-types";
import type {
  ExecutionGraphNode,
  ExecutionGraphEdge,
  ExecutionGraph,
  ExecutionGraphSummary,
  NodeType,
  RelationType,
} from "./execution-graph-types";
import { nodeId, edgeId } from "./execution-graph-types";

// ── Source data container ─────────────────────────────────────────────────────

export interface GraphSources {
  orgId:       string;
  envelopes:   ActionEnvelope[];
  sessions:    ExecutionSession[];
  delegations: AgentDelegation[];
  plans:       OperationalPlan[];
  events:      RuntimeStoredEvent[];
  memoryNodes: RuntimeMemoryNode[];
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildExecutionGraph(sources: GraphSources): ExecutionGraph {
  const now   = new Date().toISOString();
  const nodes: Record<string, ExecutionGraphNode> = {};
  const edges: ExecutionGraphEdge[] = [];

  // ── Build nodes ─────────────────────────────────────────────────────────────
  buildActionNodes(sources.orgId, sources.envelopes, nodes);
  buildExecutionNodes(sources.orgId, sources.sessions, nodes);
  buildAttemptNodes(sources.orgId, sources.sessions, nodes);
  buildDelegationNodes(sources.orgId, sources.delegations, nodes);
  buildPlanNodes(sources.orgId, sources.plans, nodes);
  buildEventNodes(sources.orgId, sources.events, nodes);
  buildMemoryNodes(sources.orgId, sources.memoryNodes, nodes);

  // ── Build edges ─────────────────────────────────────────────────────────────
  buildEdgesFromSessions(sources.orgId, sources.sessions, sources.envelopes, nodes, edges);
  buildEdgesFromAttempts(sources.orgId, sources.sessions, nodes, edges);
  buildEdgesFromDelegations(sources.orgId, sources.delegations, nodes, edges);
  buildEdgesFromPlans(sources.orgId, sources.plans, nodes, edges);
  buildEdgesFromEvents(sources.orgId, sources.events, nodes, edges);
  buildEdgesFromMemory(sources.orgId, sources.memoryNodes, nodes, edges);
  buildEdgesFromCorrelation(sources.orgId, sources.sessions, sources.events, nodes, edges);
  buildEdgesFromCausation(sources.orgId, sources.sessions, nodes, edges);

  // ── Compute summary ─────────────────────────────────────────────────────────
  const summary = computeSummary(nodes, edges);
  const rootNodeIds = computeRootNodes(nodes, edges);

  return { orgId: sources.orgId, rootNodeIds, nodes, edges, generatedAt: now, summary };
}

// ── Node builders ─────────────────────────────────────────────────────────────

export function buildActionNodes(
  orgId:     string,
  envelopes: ActionEnvelope[],
  out:       Record<string, ExecutionGraphNode>,
): void {
  for (const env of envelopes) {
    const nid = nodeId("action", env.id);
    out[nid] = {
      id:        nid,
      orgId,
      nodeType:  "action",
      refId:     env.id,
      label:     env.title,
      summary:   `${env.type} · ${env.agentStatus}`,
      status:    env.agentStatus,
      agentId:   String(env.sourceAgentId),
      moduleKey: env.moduleKey,
      createdAt: env.createdAt,
      updatedAt: env.updatedAt,
      metadata: {
        type:             env.type,
        priority:         env.priority,
        requiresApproval: env.requiresApproval,
        approvedBy:       env.approvedBy,
        rejectedBy:       env.rejectedBy,
        proposedBy:       env.proposedBy,
      },
    };
  }
}

export function buildExecutionNodes(
  orgId:    string,
  sessions: ExecutionSession[],
  out:      Record<string, ExecutionGraphNode>,
): void {
  for (const s of sessions) {
    const nid = nodeId("execution_session", s.id);
    out[nid] = {
      id:        nid,
      orgId,
      nodeType:  "execution_session",
      refId:     s.id,
      label:     `exec:${s.toolId}`,
      summary:   `${s.toolId} · ${s.status} · attempt ${s.attempt}/${s.maxAttempts}`,
      status:    s.status,
      agentId:   s.agentId,
      moduleKey: s.moduleKey,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      metadata: {
        toolId:         s.toolId,
        actionId:       s.actionId,
        attempt:        s.attempt,
        maxAttempts:    s.maxAttempts,
        durationMs:     s.durationMs,
        correlationId:  s.correlationId,
        causationId:    s.causationId,
        idempotencyKey: s.idempotencyKey,
        error:          s.error,
      },
    };
  }
}

export function buildAttemptNodes(
  orgId:    string,
  sessions: ExecutionSession[],
  out:      Record<string, ExecutionGraphNode>,
): void {
  for (const s of sessions) {
    for (const att of s.attempts) {
      const nid = nodeId("execution_attempt", att.id);
      out[nid] = {
        id:        nid,
        orgId,
        nodeType:  "execution_attempt",
        refId:     att.id,
        label:     `attempt #${att.attemptNumber}`,
        summary:   `attempt ${att.attemptNumber} of ${s.toolId} · ${att.status}`,
        status:    att.status,
        agentId:   s.agentId,
        moduleKey: s.moduleKey,
        createdAt: att.startedAt ?? s.createdAt,
        updatedAt: att.completedAt ?? s.updatedAt,
        metadata: {
          sessionId:       s.id,
          attemptNumber:   att.attemptNumber,
          durationMs:      att.durationMs,
          retryable:       att.retryable,
          retryReason:     att.retryReason,
          parentAttemptId: att.parentAttemptId,
          error:           att.error,
        },
      };
    }
  }
}

export function buildDelegationNodes(
  orgId:       string,
  delegations: AgentDelegation[],
  out:         Record<string, ExecutionGraphNode>,
): void {
  for (const d of delegations) {
    const nid = nodeId("delegation", d.id);
    out[nid] = {
      id:        nid,
      orgId,
      nodeType:  "delegation",
      refId:     d.id,
      label:     `${d.sourceAgentId} → ${d.targetAgentId}`,
      summary:   `${d.reason} · ${d.status}`,
      status:    d.status,
      agentId:   d.sourceAgentId,
      moduleKey: d.sourceModuleId,
      createdAt: d.createdAt,
      updatedAt: d.completedAt ?? d.failedAt ?? d.createdAt,
      metadata: {
        reason:           d.reason,
        targetAgentId:    d.targetAgentId,
        targetModuleId:   d.targetModuleId,
        parentActionId:   d.parentActionId,
        correlationId:    d.correlationId,
        causationId:      d.causationId,
        requiresApproval: d.requiresApproval,
      },
    };
  }
}

export function buildPlanNodes(
  orgId:  string,
  plans:  OperationalPlan[],
  out:    Record<string, ExecutionGraphNode>,
): void {
  for (const p of plans) {
    const nid = nodeId("plan", p.id);
    out[nid] = {
      id:        nid,
      orgId,
      nodeType:  "plan",
      refId:     p.id,
      label:     p.title,
      summary:   `${p.status} · ${p.steps.length} steps · priority ${p.priority}`,
      status:    p.status,
      agentId:   p.agentsInvolved[0] ?? null,
      moduleKey: p.modulesAffected[0] ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      metadata: {
        rootActionId:    p.rootActionId,
        priority:        p.priority,
        stepCount:       p.steps.length,
        blockerCount:    p.blockers.length,
        conflictCount:   p.conflicts.length,
        confidence:      p.confidence,
        agentsInvolved:  p.agentsInvolved,
        modulesAffected: p.modulesAffected,
      },
    };
  }
}

export function buildEventNodes(
  orgId:  string,
  events: RuntimeStoredEvent[],
  out:    Record<string, ExecutionGraphNode>,
): void {
  for (const e of events) {
    const nid = nodeId("event", e.id);
    out[nid] = {
      id:        nid,
      orgId,
      nodeType:  "event",
      refId:     e.id,
      label:     e.eventType,
      summary:   `${e.category}:${e.eventType} · ${e.severity}`,
      status:    e.severity,
      agentId:   e.agentId,
      moduleKey: e.moduleKey,
      createdAt: e.occurredAt,
      updatedAt: e.recordedAt,
      metadata: {
        category:      e.category,
        severity:      e.severity,
        actionId:      e.actionId,
        delegationId:  e.delegationId,
        planId:        e.planId,
        correlationId: e.correlationId,
        causationId:   e.causationId,
        parentEventId: e.parentEventId,
      },
    };
  }
}

export function buildMemoryNodes(
  orgId:       string,
  memoryNodes: RuntimeMemoryNode[],
  out:         Record<string, ExecutionGraphNode>,
): void {
  for (const m of memoryNodes) {
    const nid = nodeId("memory_node", m.id);
    out[nid] = {
      id:        nid,
      orgId,
      nodeType:  "memory_node",
      refId:     m.id,
      label:     m.nodeType,
      summary:   m.summary.slice(0, 120),
      status:    m.lifecycleState,
      agentId:   String(m.agentId),
      moduleKey: m.moduleId,
      createdAt: m.timestamp,
      updatedAt: m.timestamp,
      metadata: {
        nodeType:  m.nodeType,
        severity:  m.severity,
        actionId:  m.actionId,
        actorId:   m.actorId,
      },
    };
  }
}

// ── Edge builders ─────────────────────────────────────────────────────────────

/** Action → ExecutionSession (execution_of) */
export function buildEdgesFromSessions(
  orgId:     string,
  sessions:  ExecutionSession[],
  envelopes: ActionEnvelope[],
  nodes:     Record<string, ExecutionGraphNode>,
  out:       ExecutionGraphEdge[],
): void {
  const actionRefIds = new Set(envelopes.map(e => e.id));

  for (const s of sessions) {
    const sessNid = nodeId("execution_session", s.id);
    if (!nodes[sessNid]) continue;

    // Connect to action node if found
    if (s.actionId) {
      const actionNid = nodeId("action", s.actionId);
      if (nodes[actionNid]) {
        addEdge(out, orgId, actionNid, sessNid, "triggers", "triggered execution", s.createdAt);
        addEdge(out, orgId, sessNid, actionNid, "execution_of", "execution of action", s.createdAt);
      }
    }

    // Tool node (synthetic — link session to tool)
    const toolNid = nodeId("tool", `${orgId}_${s.toolId}`);
    if (!nodes[toolNid]) {
      nodes[toolNid] = makeToolNode(orgId, s.toolId, s);
    }
    addEdge(out, orgId, sessNid, toolNid, "uses_tool", `uses ${s.toolId}`, s.createdAt);
  }
  void actionRefIds;
}

/** ExecutionSession → ExecutionAttempt (attempt_of) */
export function buildEdgesFromAttempts(
  orgId:    string,
  sessions: ExecutionSession[],
  nodes:    Record<string, ExecutionGraphNode>,
  out:      ExecutionGraphEdge[],
): void {
  for (const s of sessions) {
    const sessNid = nodeId("execution_session", s.id);
    if (!nodes[sessNid]) continue;

    for (const att of s.attempts) {
      const attNid = nodeId("execution_attempt", att.id);
      if (!nodes[attNid]) continue;

      addEdge(out, orgId, attNid, sessNid, "attempt_of", `attempt #${att.attemptNumber}`, att.startedAt ?? s.createdAt);

      // Retry lineage: this attempt retried a previous attempt
      if (att.parentAttemptId) {
        const parentNid = nodeId("execution_attempt", att.parentAttemptId);
        if (nodes[parentNid]) {
          addEdge(out, orgId, attNid, parentNid, "retry_of", att.retryReason ?? "retry", att.startedAt ?? s.createdAt);
        }
      }
    }
  }
}

/** Delegation edges: action → delegation, delegation → target agent */
export function buildEdgesFromDelegations(
  orgId:       string,
  delegations: AgentDelegation[],
  nodes:       Record<string, ExecutionGraphNode>,
  out:         ExecutionGraphEdge[],
): void {
  for (const d of delegations) {
    const delNid = nodeId("delegation", d.id);
    if (!nodes[delNid]) continue;

    // Parent action → delegation
    if (d.parentActionId) {
      const actionNid = nodeId("action", d.parentActionId);
      if (nodes[actionNid]) {
        addEdge(out, orgId, actionNid, delNid, "delegated_to", d.reason, d.createdAt);
        addEdge(out, orgId, delNid, actionNid, "caused_by", "parent action", d.createdAt);
      }
    }

    // Delegation blocking status
    if (d.status === "blocked" || d.status === "pending_approval") {
      if (d.parentActionId) {
        const actionNid = nodeId("action", d.parentActionId);
        if (nodes[actionNid]) {
          addEdge(out, orgId, delNid, actionNid, "blocks", "pending delegation blocks action", d.createdAt);
        }
      }
    }

    // Causation chain: this delegation caused by another
    if (d.causationId) {
      // causationId can be another delegation ID or action ID
      const causeDel  = nodeId("delegation", d.causationId);
      const causeAct  = nodeId("action",     d.causationId);
      const causeNode = nodes[causeDel] ?? nodes[causeAct];
      if (causeNode) {
        addEdge(out, orgId, delNid, causeNode.id, "caused_by", "causation chain", d.createdAt);
      }
    }
  }
}

/** Plan → Action/Delegation (belongs_to_plan) */
export function buildEdgesFromPlans(
  orgId:  string,
  plans:  OperationalPlan[],
  nodes:  Record<string, ExecutionGraphNode>,
  out:    ExecutionGraphEdge[],
): void {
  for (const p of plans) {
    const planNid = nodeId("plan", p.id);
    if (!nodes[planNid]) continue;

    // Root action → plan
    if (p.rootActionId) {
      const actionNid = nodeId("action", p.rootActionId);
      if (nodes[actionNid]) {
        addEdge(out, orgId, actionNid, planNid, "belongs_to_plan", "root action", p.createdAt);
        addEdge(out, orgId, planNid, actionNid, "caused_by", "triggered by action", p.createdAt);
      }
    }

    // Plan steps → referenced actions/delegations
    for (const step of p.steps) {
      if (step.actionId) {
        const stepActionNid = nodeId("action", step.actionId);
        if (nodes[stepActionNid]) {
          addEdge(out, orgId, stepActionNid, planNid, "belongs_to_plan", `step: ${step.title}`, p.createdAt);
        }
      }
      if (step.delegationId) {
        const stepDelNid = nodeId("delegation", step.delegationId);
        if (nodes[stepDelNid]) {
          addEdge(out, orgId, stepDelNid, planNid, "belongs_to_plan", `step: ${step.title}`, p.createdAt);
        }
      }
    }
  }
}

/** Event → Action/Execution/Delegation (emitted_event) */
export function buildEdgesFromEvents(
  orgId:  string,
  events: RuntimeStoredEvent[],
  nodes:  Record<string, ExecutionGraphNode>,
  out:    ExecutionGraphEdge[],
): void {
  for (const e of events) {
    const eventNid = nodeId("event", e.id);
    if (!nodes[eventNid]) continue;

    if (e.actionId) {
      const actionNid = nodeId("action", e.actionId);
      if (nodes[actionNid]) {
        addEdge(out, orgId, actionNid, eventNid, "emitted_event", e.eventType, e.occurredAt);
        addEdge(out, orgId, eventNid, actionNid, "caused_by", "action event", e.occurredAt);
      }
    }

    if (e.delegationId) {
      const delNid = nodeId("delegation", e.delegationId);
      if (nodes[delNid]) {
        addEdge(out, orgId, delNid, eventNid, "emitted_event", e.eventType, e.occurredAt);
      }
    }

    if (e.planId) {
      const planNid = nodeId("plan", e.planId);
      if (nodes[planNid]) {
        addEdge(out, orgId, planNid, eventNid, "emitted_event", e.eventType, e.occurredAt);
      }
    }

    // Parent event causation chain
    if (e.parentEventId) {
      const parentEventNid = nodeId("event", e.parentEventId);
      if (nodes[parentEventNid]) {
        addEdge(out, orgId, eventNid, parentEventNid, "caused_by", "parent event", e.occurredAt);
      }
    }
  }
}

/** Memory node → Action/Session (references_memory) */
export function buildEdgesFromMemory(
  orgId:       string,
  memoryNodes: RuntimeMemoryNode[],
  nodes:       Record<string, ExecutionGraphNode>,
  out:         ExecutionGraphEdge[],
): void {
  for (const m of memoryNodes) {
    const memNid = nodeId("memory_node", m.id);
    if (!nodes[memNid]) continue;

    if (m.actionId) {
      const actionNid = nodeId("action", m.actionId);
      if (nodes[actionNid]) {
        addEdge(out, orgId, actionNid, memNid, "references_memory", "memory context", m.timestamp);
        addEdge(out, orgId, memNid, actionNid, "caused_by", "action context", m.timestamp);
      }
    }
  }
}

/** CorrelationId connects execution sessions and events in the same chain */
export function buildEdgesFromCorrelation(
  orgId:    string,
  sessions: ExecutionSession[],
  events:   RuntimeStoredEvent[],
  nodes:    Record<string, ExecutionGraphNode>,
  out:      ExecutionGraphEdge[],
): void {
  // Build correlationId → sessionIds index
  const byCorr = new Map<string, string[]>();
  for (const s of sessions) {
    if (!s.correlationId) continue;
    const arr = byCorr.get(s.correlationId) ?? [];
    arr.push(nodeId("execution_session", s.id));
    byCorr.set(s.correlationId, arr);
  }

  // Connect sessions sharing a correlationId with "follows" edges (by createdAt)
  for (const [, nids] of byCorr) {
    if (nids.length < 2) continue;
    const present = nids.filter(n => !!nodes[n]).sort((a, b) => {
      const na = nodes[a];
      const nb = nodes[b];
      return (na?.createdAt ?? "").localeCompare(nb?.createdAt ?? "");
    });
    for (let i = 1; i < present.length; i++) {
      const prev = present[i - 1]!;
      const curr = present[i]!;
      if (nodes[prev] && nodes[curr]) {
        addEdge(out, orgId, curr, prev, "follows", "correlated chain", nodes[curr]!.createdAt);
      }
    }
  }
}

/** CausationId chains: session caused by another session */
export function buildEdgesFromCausation(
  orgId:    string,
  sessions: ExecutionSession[],
  nodes:    Record<string, ExecutionGraphNode>,
  out:      ExecutionGraphEdge[],
): void {
  for (const s of sessions) {
    if (!s.causationId) continue;
    const childNid  = nodeId("execution_session", s.id);
    // causationId may reference another session or an action
    const parentSess = nodeId("execution_session", s.causationId);
    const parentAct  = nodeId("action",             s.causationId);
    const parentNode = nodes[parentSess] ?? nodes[parentAct];
    if (parentNode && nodes[childNid]) {
      addEdge(out, orgId, childNid, parentNode.id, "caused_by", "causation chain", s.createdAt);
    }
  }
}

// ── Summary computation ───────────────────────────────────────────────────────

function computeSummary(
  nodes: Record<string, ExecutionGraphNode>,
  edges: ExecutionGraphEdge[],
): ExecutionGraphSummary {
  const nodeList = Object.values(nodes);
  const actionCount      = nodeList.filter(n => n.nodeType === "action").length;
  const executionCount   = nodeList.filter(n => n.nodeType === "execution_session").length;
  const attemptCount     = nodeList.filter(n => n.nodeType === "execution_attempt").length;
  const delegationCount  = nodeList.filter(n => n.nodeType === "delegation").length;
  const planCount        = nodeList.filter(n => n.nodeType === "plan").length;
  const eventCount       = nodeList.filter(n => n.nodeType === "event").length;
  const memoryNodeCount  = nodeList.filter(n => n.nodeType === "memory_node").length;

  const unresolvedBlocks = nodeList.filter(n =>
    (n.nodeType === "delegation" && (n.status === "blocked" || n.status === "pending_approval")) ||
    (n.nodeType === "execution_session" && n.status === "timed_out")
  ).length;

  const failedChains = nodeList.filter(n =>
    (n.nodeType === "execution_session" && n.status === "failed") ||
    (n.nodeType === "delegation"        && n.status === "failed")
  ).length;

  // Orphan: node with no edges
  const connectedNodeIds = new Set<string>();
  for (const e of edges) {
    connectedNodeIds.add(e.sourceNodeId);
    connectedNodeIds.add(e.targetNodeId);
  }
  const orphanNodes = nodeList.filter(n => !connectedNodeIds.has(n.id)).length;

  // Depth via BFS from root nodes
  const targetIds = new Set(edges.map(e => e.targetNodeId));
  const rootIds   = Object.keys(nodes).filter(id => !targetIds.has(id));
  const maxDepth  = computeMaxDepth(rootIds, edges);

  // Cycle detection: simple DFS
  const cyclesDetected = detectCycleCount(nodes, edges);

  return {
    nodeCount: nodeList.length,
    edgeCount: edges.length,
    actionCount,
    executionCount,
    attemptCount,
    delegationCount,
    planCount,
    eventCount,
    memoryNodeCount,
    unresolvedBlocks,
    failedChains,
    orphanNodes,
    maxDepth,
    cyclesDetected,
  };
}

function computeRootNodes(
  nodes: Record<string, ExecutionGraphNode>,
  edges: ExecutionGraphEdge[],
): string[] {
  const hasIncoming = new Set(edges.map(e => e.targetNodeId));
  return Object.keys(nodes).filter(id => !hasIncoming.has(id));
}

function computeMaxDepth(rootIds: string[], edges: ExecutionGraphEdge[]): number {
  // Adjacency: sourceNodeId → targetNodeIds
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const arr = adj.get(e.sourceNodeId) ?? [];
    arr.push(e.targetNodeId);
    adj.set(e.sourceNodeId, arr);
  }

  let maxDepth = 0;
  const visited = new Set<string>();

  function dfs(id: string, depth: number): void {
    if (visited.has(id)) return;  // Cycle guard
    visited.add(id);
    if (depth > maxDepth) maxDepth = depth;
    for (const next of (adj.get(id) ?? [])) {
      dfs(next, depth + 1);
    }
    visited.delete(id);
  }

  for (const root of rootIds) dfs(root, 0);
  return maxDepth;
}

function detectCycleCount(
  nodes: Record<string, ExecutionGraphNode>,
  edges: ExecutionGraphEdge[],
): number {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const arr = adj.get(e.sourceNodeId) ?? [];
    arr.push(e.targetNodeId);
    adj.set(e.sourceNodeId, arr);
  }

  let cycles = 0;
  const white = new Set(Object.keys(nodes));
  const gray  = new Set<string>();
  const black = new Set<string>();

  function dfs(id: string): boolean {
    if (gray.has(id))  { cycles++; return true; }
    if (black.has(id)) return false;
    gray.add(id);
    white.delete(id);
    for (const next of (adj.get(id) ?? [])) {
      if (dfs(next)) {
        // Don't increment twice for same cycle; just mark
      }
    }
    gray.delete(id);
    black.add(id);
    return false;
  }

  for (const id of [...white]) dfs(id);
  return cycles;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function addEdge(
  out:          ExecutionGraphEdge[],
  orgId:        string,
  sourceNodeId: string,
  targetNodeId: string,
  relationType: RelationType,
  label:        string,
  createdAt:    string,
  meta:         Record<string, unknown> = {},
): void {
  out.push({
    id:           edgeId(),
    orgId,
    sourceNodeId,
    targetNodeId,
    relationType,
    label,
    createdAt,
    metadata: meta,
  });
}

function makeToolNode(
  orgId:  string,
  toolId: string,
  s:      ExecutionSession,
): ExecutionGraphNode {
  const nid = nodeId("tool", `${orgId}_${toolId}`);
  return {
    id:        nid,
    orgId,
    nodeType:  "tool",
    refId:     toolId,
    label:     toolId,
    summary:   `Tool: ${toolId}`,
    status:    "active",
    agentId:   s.agentId,
    moduleKey: s.moduleKey,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    metadata:  { toolId },
  };
}
