/**
 * lib/finance/graph-traversal.ts
 *
 * FASE 2 — Graph Traversal Engine
 *
 * Pure traversal functions over a FinancialRelationshipGraph.
 * All functions are synchronous — graph must already be built.
 * No Prisma. No side effects. No inference.
 *
 * Sprint: AGENTIK-FINANCIAL-RELATIONSHIP-GRAPH-01
 */

import type {
  FinancialRelationshipGraph,
  FinancialNode,
  FinancialEdge,
} from "./relationship-graph";

// ── Result types ───────────────────────────────────────────────────────────────

export interface TraversalPath {
  nodeIds:    string[];
  edges:      FinancialEdge[];
  depth:      number;
}

export interface ConnectedSubgraph {
  nodes: FinancialNode[];
  edges: FinancialEdge[];
}

export interface DependencyChain {
  root:   FinancialNode;
  chain:  Array<{ node: FinancialNode; edge: FinancialEdge; depth: number }>;
  /** IDs of nodes that are UNRESOLVED or CRITICAL anywhere in the chain */
  issues: string[];
}

export interface UnresolvedPropagation {
  /** The unresolved node that is the source of concern */
  origin:    FinancialNode;
  /** All downstream nodes that may be affected */
  affected:  Array<{ node: FinancialNode; depth: number; via: string }>;
  totalImpactCount: number;
}

export interface AffectedEntities {
  nodeId:    string;
  upstream:  FinancialNode[];
  downstream: FinancialNode[];
  total:     number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_DEPTH    = 10;
const MAX_VISITED  = 500;

// ── traceUpstream ──────────────────────────────────────────────────────────────
// Walk incoming edges to find all ancestors of a node.

export function traceUpstream(
  graph:  FinancialRelationshipGraph,
  nodeId: string,
  maxDepth: number = MAX_DEPTH,
): TraversalPath {
  const visited = new Set<string>();
  const nodeIds: string[] = [];
  const edges:   FinancialEdge[] = [];
  let   depth = 0;

  function visit(id: string, currentDepth: number): void {
    if (visited.has(id) || currentDepth > maxDepth || visited.size >= MAX_VISITED) return;
    visited.add(id);
    if (id !== nodeId) nodeIds.push(id);

    const incoming = graph.incoming.get(id) ?? [];
    for (const edge of incoming) {
      if (!visited.has(edge.from)) {
        edges.push(edge);
        depth = Math.max(depth, currentDepth + 1);
        visit(edge.from, currentDepth + 1);
      }
    }
  }

  visit(nodeId, 0);
  return { nodeIds, edges, depth };
}

// ── traceDownstream ────────────────────────────────────────────────────────────
// Walk outgoing edges to find all descendants of a node.

export function traceDownstream(
  graph:  FinancialRelationshipGraph,
  nodeId: string,
  maxDepth: number = MAX_DEPTH,
): TraversalPath {
  const visited = new Set<string>();
  const nodeIds: string[] = [];
  const edges:   FinancialEdge[] = [];
  let   depth = 0;

  function visit(id: string, currentDepth: number): void {
    if (visited.has(id) || currentDepth > maxDepth || visited.size >= MAX_VISITED) return;
    visited.add(id);
    if (id !== nodeId) nodeIds.push(id);

    const outgoing = graph.outgoing.get(id) ?? [];
    for (const edge of outgoing) {
      if (!visited.has(edge.to)) {
        edges.push(edge);
        depth = Math.max(depth, currentDepth + 1);
        visit(edge.to, currentDepth + 1);
      }
    }
  }

  visit(nodeId, 0);
  return { nodeIds, edges, depth };
}

// ── findConnectedNodes ─────────────────────────────────────────────────────────
// Undirected BFS — all nodes reachable from nodeId in either direction.

export function findConnectedNodes(
  graph:  FinancialRelationshipGraph,
  nodeId: string,
): ConnectedSubgraph {
  const visited = new Set<string>();
  const resultEdges = new Map<string, FinancialEdge>(); // by edge ID
  const queue = [nodeId];

  while (queue.length > 0 && visited.size < MAX_VISITED) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    for (const edge of (graph.outgoing.get(id) ?? [])) {
      resultEdges.set(edge.id, edge);
      if (!visited.has(edge.to)) queue.push(edge.to);
    }
    for (const edge of (graph.incoming.get(id) ?? [])) {
      resultEdges.set(edge.id, edge);
      if (!visited.has(edge.from)) queue.push(edge.from);
    }
  }

  const nodes: FinancialNode[] = [];
  for (const id of visited) {
    const node = graph.nodes.get(id);
    if (node) nodes.push(node);
  }

  return { nodes, edges: Array.from(resultEdges.values()) };
}

// ── findDependencyChain ────────────────────────────────────────────────────────
// Follows DEPENDS_ON / BLOCKS / PAYS edges downstream to build a dependency chain.

const DEPENDENCY_RELS = new Set(["DEPENDS_ON", "BLOCKS", "PAYS"]);

export function findDependencyChain(
  graph:  FinancialRelationshipGraph,
  nodeId: string,
): DependencyChain | null {
  const root = graph.nodes.get(nodeId);
  if (!root) return null;

  const chain: DependencyChain["chain"] = [];
  const issues: string[] = [];
  const visited = new Set<string>([nodeId]);

  function walk(id: string, depth: number): void {
    if (depth > MAX_DEPTH || visited.size >= MAX_VISITED) return;
    const outgoing = graph.outgoing.get(id) ?? [];
    for (const edge of outgoing) {
      if (!DEPENDENCY_RELS.has(edge.relationship)) continue;
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      const node = graph.nodes.get(edge.to);
      if (!node) continue;
      chain.push({ node, edge, depth });
      if (node.health === "UNRESOLVED" || node.health === "CRITICAL") {
        issues.push(node.id);
      }
      walk(edge.to, depth + 1);
    }
  }

  // Also check root health
  if (root.health === "UNRESOLVED" || root.health === "CRITICAL") {
    issues.push(root.id);
  }

  walk(nodeId, 1);
  return { root, chain, issues };
}

// ── findUnresolvedPropagation ──────────────────────────────────────────────────
// From an UNRESOLVED or CRITICAL node, find all downstream nodes it may affect.

export function findUnresolvedPropagation(
  graph:  FinancialRelationshipGraph,
  nodeId: string,
): UnresolvedPropagation | null {
  const origin = graph.nodes.get(nodeId);
  if (!origin) return null;
  if (origin.health !== "UNRESOLVED" && origin.health !== "CRITICAL") return null;

  const affected: UnresolvedPropagation["affected"] = [];
  const visited = new Set<string>([nodeId]);

  function walk(id: string, depth: number, via: string): void {
    if (depth > MAX_DEPTH || visited.size >= MAX_VISITED) return;
    const outgoing = graph.outgoing.get(id) ?? [];
    for (const edge of outgoing) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      const node = graph.nodes.get(edge.to);
      if (!node) continue;
      affected.push({ node, depth, via: edge.relationship });
      walk(edge.to, depth + 1, edge.relationship);
    }
  }

  walk(nodeId, 1, "ROOT");

  return { origin, affected, totalImpactCount: affected.length };
}

// ── findAffectedEntities ───────────────────────────────────────────────────────
// Returns all upstream and downstream nodes for a given node.

export function findAffectedEntities(
  graph:  FinancialRelationshipGraph,
  nodeId: string,
): AffectedEntities {
  const upPath   = traceUpstream(graph, nodeId);
  const downPath = traceDownstream(graph, nodeId);

  const upNodes: FinancialNode[] = [];
  for (const id of upPath.nodeIds) {
    const node = graph.nodes.get(id);
    if (node) upNodes.push(node);
  }

  const downNodes: FinancialNode[] = [];
  for (const id of downPath.nodeIds) {
    const node = graph.nodes.get(id);
    if (node) downNodes.push(node);
  }

  return {
    nodeId,
    upstream:   upNodes,
    downstream: downNodes,
    total:      upNodes.length + downNodes.length,
  };
}

// ── Convenience: all UNRESOLVED nodes in graph ────────────────────────────────

export function getAllUnresolvedNodes(
  graph: FinancialRelationshipGraph,
): FinancialNode[] {
  const result: FinancialNode[] = [];
  for (const node of graph.nodes.values()) {
    if (node.health === "UNRESOLVED" || node.health === "CRITICAL") {
      result.push(node);
    }
  }
  return result;
}
