/**
 * lib/copilot/memory-graph/graph-registry.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — In-Memory Registry
 *
 * Org-scoped, multi-tenant, fail-closed in-memory node/edge registry.
 * This is the runtime store. Persistence is handled by the repository layer.
 *
 * No server-only — this is shared registry state, can be used in tests.
 */

import type { GraphNode, GraphEdge } from "./memory-graph-types";

// ── Registry State ─────────────────────────────────────────────────────────────

/** Per-org node store: orgSlug → nodeId → GraphNode */
const _nodes = new Map<string, Map<string, GraphNode>>();

/** Per-org edge store: orgSlug → edgeId → GraphEdge */
const _edges = new Map<string, Map<string, GraphEdge>>();

// ── Internal helpers ───────────────────────────────────────────────────────────

function _orgNodes(orgSlug: string): Map<string, GraphNode> {
  if (!_nodes.has(orgSlug)) _nodes.set(orgSlug, new Map());
  return _nodes.get(orgSlug)!;
}

function _orgEdges(orgSlug: string): Map<string, GraphEdge> {
  if (!_edges.has(orgSlug)) _edges.set(orgSlug, new Map());
  return _edges.get(orgSlug)!;
}

// ── Node operations ────────────────────────────────────────────────────────────

/**
 * registerNode — add or overwrite a node in the registry.
 * Fail-closed: rejects cross-tenant nodes.
 */
export function registerNode(node: GraphNode): void {
  if (!node?.id || !node.orgSlug) return;
  _orgNodes(node.orgSlug).set(node.id, node);
}

/** removeNode — remove a node and all its edges. */
export function removeNode(orgSlug: string, nodeId: string): void {
  _orgNodes(orgSlug).delete(nodeId);
  // Remove all edges referencing this node
  const edgeStore = _orgEdges(orgSlug);
  for (const [edgeId, edge] of edgeStore) {
    if (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId) {
      edgeStore.delete(edgeId);
    }
  }
}

/** getNode — retrieve a node by ID. Returns undefined if not found or wrong org. */
export function getNode(orgSlug: string, nodeId: string): GraphNode | undefined {
  return _orgNodes(orgSlug).get(nodeId);
}

/** listNodes — all nodes for an org. */
export function listNodes(orgSlug: string): GraphNode[] {
  return Array.from(_orgNodes(orgSlug).values());
}

/** hasNode — true if the node exists in this org. */
export function hasNode(orgSlug: string, nodeId: string): boolean {
  return _orgNodes(orgSlug).has(nodeId);
}

// ── Edge operations ────────────────────────────────────────────────────────────

/**
 * registerEdge — add or overwrite an edge.
 * Fail-closed: rejects cross-tenant edges (source and target must be same org).
 */
export function registerEdge(edge: GraphEdge): void {
  if (!edge?.id || !edge.orgSlug) return;
  // Tenant isolation: both nodes must exist in the same org
  const sourceExists = hasNode(edge.orgSlug, edge.sourceNodeId);
  const targetExists = hasNode(edge.orgSlug, edge.targetNodeId);
  if (!sourceExists || !targetExists) return; // fail-closed — no dangling edges
  _orgEdges(edge.orgSlug).set(edge.id, edge);
}

/** removeEdge — remove a single edge. */
export function removeEdge(orgSlug: string, edgeId: string): void {
  _orgEdges(orgSlug).delete(edgeId);
}

/** getEdge — retrieve an edge by ID. */
export function getEdge(orgSlug: string, edgeId: string): GraphEdge | undefined {
  return _orgEdges(orgSlug).get(edgeId);
}

/** listEdges — all edges for an org. */
export function listEdges(orgSlug: string): GraphEdge[] {
  return Array.from(_orgEdges(orgSlug).values());
}

/** hasEdge — true if the edge exists in this org. */
export function hasEdge(orgSlug: string, edgeId: string): boolean {
  return _orgEdges(orgSlug).has(edgeId);
}

/**
 * edgesFrom — all edges where sourceNodeId matches.
 */
export function edgesFrom(orgSlug: string, nodeId: string): GraphEdge[] {
  return listEdges(orgSlug).filter(e => e.sourceNodeId === nodeId);
}

/**
 * edgesTo — all edges where targetNodeId matches.
 */
export function edgesTo(orgSlug: string, nodeId: string): GraphEdge[] {
  return listEdges(orgSlug).filter(e => e.targetNodeId === nodeId);
}

/**
 * edgesForNode — all edges touching a node (inbound + outbound).
 */
export function edgesForNode(orgSlug: string, nodeId: string): GraphEdge[] {
  return listEdges(orgSlug).filter(
    e => e.sourceNodeId === nodeId || e.targetNodeId === nodeId,
  );
}

// ── Registry stats ─────────────────────────────────────────────────────────────

export interface RegistryStats {
  orgSlug:    string;
  nodeCount:  number;
  edgeCount:  number;
  checkedAt:  string;
}

export function registryStats(orgSlug: string): RegistryStats {
  return {
    orgSlug,
    nodeCount:  _orgNodes(orgSlug).size,
    edgeCount:  _orgEdges(orgSlug).size,
    checkedAt:  new Date().toISOString(),
  };
}

// ── Clear (for tests only) ─────────────────────────────────────────────────────

/** clearRegistry — wipe all data for an org. Use in tests only. */
export function clearRegistry(orgSlug: string): void {
  _nodes.delete(orgSlug);
  _edges.delete(orgSlug);
}

/** clearAllRegistries — wipe everything. Use in tests only. */
export function clearAllRegistries(): void {
  _nodes.clear();
  _edges.clear();
}
