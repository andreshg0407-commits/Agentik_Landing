/**
 * lib/agent-runtime/execution-graph/execution-graph-query.ts
 *
 * Agentik Execution Graph — Query Layer
 *
 * Pure, deterministic traversal functions over an ExecutionGraph.
 * No I/O, no side effects.
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-EXECUTION-GRAPH-01
 */

import type {
  ExecutionGraph,
  ExecutionGraphNode,
  ExecutionGraphEdge,
  NodeType,
} from "./execution-graph-types";

// ── Direct lookups ────────────────────────────────────────────────────────────

/** Find a node by its original entity refId and optional nodeType. */
export function getNodeByRef(
  graph:    ExecutionGraph,
  refId:    string,
  nodeType?: NodeType,
): ExecutionGraphNode | null {
  for (const node of Object.values(graph.nodes)) {
    if (node.refId !== refId) continue;
    if (nodeType && node.nodeType !== nodeType) continue;
    return node;
  }
  return null;
}

/** Get a node by its graph node ID. */
export function getNodeById(
  graph:  ExecutionGraph,
  nodeId: string,
): ExecutionGraphNode | null {
  return graph.nodes[nodeId] ?? null;
}

// ── Adjacency helpers ─────────────────────────────────────────────────────────

/** Outgoing edges from a node. */
export function getOutgoingEdges(
  graph:  ExecutionGraph,
  nodeId: string,
): ExecutionGraphEdge[] {
  return graph.edges.filter(e => e.sourceNodeId === nodeId);
}

/** Incoming edges to a node. */
export function getIncomingEdges(
  graph:  ExecutionGraph,
  nodeId: string,
): ExecutionGraphEdge[] {
  return graph.edges.filter(e => e.targetNodeId === nodeId);
}

/** Direct children (nodes this node has outgoing edges to). */
export function getChildren(
  graph:  ExecutionGraph,
  nodeId: string,
): ExecutionGraphNode[] {
  return getOutgoingEdges(graph, nodeId)
    .map(e => graph.nodes[e.targetNodeId])
    .filter((n): n is ExecutionGraphNode => !!n);
}

/** Direct parents (nodes with outgoing edges to this node). */
export function getParents(
  graph:  ExecutionGraph,
  nodeId: string,
): ExecutionGraphNode[] {
  return getIncomingEdges(graph, nodeId)
    .map(e => graph.nodes[e.sourceNodeId])
    .filter((n): n is ExecutionGraphNode => !!n);
}

// ── Tree traversal ────────────────────────────────────────────────────────────

/** All ancestors of a node (DFS, cycle-safe). */
export function getAncestors(
  graph:   ExecutionGraph,
  nodeId:  string,
  visited: Set<string> = new Set(),
): ExecutionGraphNode[] {
  if (visited.has(nodeId)) return [];
  visited.add(nodeId);
  const parents = getParents(graph, nodeId);
  const result: ExecutionGraphNode[] = [...parents];
  for (const p of parents) {
    result.push(...getAncestors(graph, p.id, visited));
  }
  return dedupe(result);
}

/** All descendants of a node (DFS, cycle-safe). */
export function getDescendants(
  graph:   ExecutionGraph,
  nodeId:  string,
  visited: Set<string> = new Set(),
): ExecutionGraphNode[] {
  if (visited.has(nodeId)) return [];
  visited.add(nodeId);
  const children = getChildren(graph, nodeId);
  const result: ExecutionGraphNode[] = [...children];
  for (const c of children) {
    result.push(...getDescendants(graph, c.id, visited));
  }
  return dedupe(result);
}

// ── Domain chains ─────────────────────────────────────────────────────────────

/**
 * Full execution chain for an action:
 *   action → execution session → attempts
 */
export function getExecutionChain(
  graph:    ExecutionGraph,
  actionId: string,
): { action: ExecutionGraphNode | null; sessions: ExecutionGraphNode[]; attempts: ExecutionGraphNode[] } {
  const action = getNodeByRef(graph, actionId, "action");
  if (!action) return { action: null, sessions: [], attempts: [] };

  const sessions = getChildren(graph, action.id)
    .filter(n => n.nodeType === "execution_session");

  const attempts: ExecutionGraphNode[] = [];
  for (const sess of sessions) {
    attempts.push(
      ...getChildren(graph, sess.id).filter(n => n.nodeType === "execution_attempt"),
    );
  }

  return { action, sessions, attempts };
}

/**
 * Delegation chain from an action:
 *   action → delegation(s) → child delegations (recursive)
 */
export function getDelegationChain(
  graph:    ExecutionGraph,
  actionId: string,
): ExecutionGraphNode[] {
  const action = getNodeByRef(graph, actionId, "action");
  if (!action) return [];

  function collectDelegations(nodeId: string, visited: Set<string>): ExecutionGraphNode[] {
    if (visited.has(nodeId)) return [];
    visited.add(nodeId);
    const dels = getChildren(graph, nodeId)
      .filter(n => n.nodeType === "delegation");
    const result: ExecutionGraphNode[] = [...dels];
    for (const d of dels) result.push(...collectDelegations(d.id, visited));
    return result;
  }

  return dedupe(collectDelegations(action.id, new Set()));
}

/**
 * Plan chain from an action:
 *   action → plan(s)
 */
export function getPlanChain(
  graph:    ExecutionGraph,
  actionId: string,
): ExecutionGraphNode[] {
  const action = getNodeByRef(graph, actionId, "action");
  if (!action) return [];
  return getDescendants(graph, action.id).filter(n => n.nodeType === "plan");
}

/**
 * All nodes in the failed execution chain for an action.
 */
export function getFailedChain(
  graph:    ExecutionGraph,
  actionId: string,
): ExecutionGraphNode[] {
  const { sessions, attempts } = getExecutionChain(graph, actionId);
  return [...sessions, ...attempts].filter(n =>
    n.status === "failed" || n.status === "timed_out",
  );
}

/**
 * All nodes that are blocking the given action.
 */
export function getBlockedChain(
  graph:    ExecutionGraph,
  actionId: string,
): ExecutionGraphNode[] {
  const action = getNodeByRef(graph, actionId, "action");
  if (!action) return [];
  const descendants = getDescendants(graph, action.id);
  return descendants.filter(n =>
    n.status === "blocked" || n.status === "pending_approval" || n.status === "waiting_for",
  );
}

// ── Root cause / terminal node analysis ───────────────────────────────────────

/**
 * Root causes = nodes with no parents AND in a failed/blocked/timed_out state.
 */
export function getRootCauses(graph: ExecutionGraph): ExecutionGraphNode[] {
  const TERMINAL_BAD = new Set(["failed", "timed_out", "blocked", "rejected"]);
  const hasIncoming  = new Set(graph.edges.map(e => e.targetNodeId));
  return Object.values(graph.nodes).filter(n =>
    !hasIncoming.has(n.id) && TERMINAL_BAD.has(n.status),
  );
}

/** Terminal nodes: nodes with no outgoing edges. */
export function getTerminalNodes(graph: ExecutionGraph): ExecutionGraphNode[] {
  const hasOutgoing = new Set(graph.edges.map(e => e.sourceNodeId));
  return Object.values(graph.nodes).filter(n => !hasOutgoing.has(n.id));
}

/** Orphan nodes: nodes with NO edges at all. */
export function getOrphanNodes(graph: ExecutionGraph): ExecutionGraphNode[] {
  const connected = new Set<string>();
  for (const e of graph.edges) {
    connected.add(e.sourceNodeId);
    connected.add(e.targetNodeId);
  }
  return Object.values(graph.nodes).filter(n => !connected.has(n.id));
}

// ── Subgraph extraction ────────────────────────────────────────────────────────

/**
 * Extract all nodes + edges reachable from a given nodeId (bidirectional BFS).
 */
export function getConnectedSubgraph(
  graph:  ExecutionGraph,
  nodeId: string,
  maxDepth: number = 8,
): ExecutionGraph {
  const reachable = new Set<string>();
  const queue: Array<[string, number]> = [[nodeId, 0]];

  while (queue.length > 0) {
    const [current, depth] = queue.shift()!;
    if (reachable.has(current) || depth > maxDepth) continue;
    reachable.add(current);

    for (const e of graph.edges) {
      if (e.sourceNodeId === current && !reachable.has(e.targetNodeId)) {
        queue.push([e.targetNodeId, depth + 1]);
      }
      if (e.targetNodeId === current && !reachable.has(e.sourceNodeId)) {
        queue.push([e.sourceNodeId, depth + 1]);
      }
    }
  }

  const nodes: Record<string, ExecutionGraphNode> = {};
  for (const id of reachable) {
    if (graph.nodes[id]) nodes[id] = graph.nodes[id]!;
  }
  const edges = graph.edges.filter(
    e => reachable.has(e.sourceNodeId) && reachable.has(e.targetNodeId),
  );

  return {
    ...graph,
    nodes,
    edges,
    rootNodeIds: graph.rootNodeIds.filter(id => reachable.has(id)),
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function dedupe(nodes: ExecutionGraphNode[]): ExecutionGraphNode[] {
  const seen = new Set<string>();
  return nodes.filter(n => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });
}
