/**
 * lib/copilot/memory-graph/query-engine.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Query Engine
 *
 * Structured queries against the in-memory graph registry.
 * All queries are orgSlug-scoped. Never throws.
 */

import type {
  GraphNode, GraphEdge, GraphSubgraph, GraphQueryResult, GraphQuery,
} from "./memory-graph-types";
import type { GraphNodeType, GraphEdgeType } from "./memory-graph-types";
import { listNodes, listEdges, getNode, edgesFrom, edgesTo } from "./graph-registry";
import { bfsTraversal } from "./traversal-engine";
import { generateQueryId } from "./graph-identity";

// ── Core query functions ───────────────────────────────────────────────────────

/**
 * findNode — find a node by ID, scoped to orgSlug.
 */
export function findNode(orgSlug: string, nodeId: string): GraphNode | undefined {
  return getNode(orgSlug, nodeId);
}

/**
 * findNodesByType — find all nodes of a given type.
 */
export function findNodesByType(orgSlug: string, type: GraphNodeType): GraphNode[] {
  return listNodes(orgSlug).filter(n => n.type === type);
}

/**
 * findNodesByTag — find nodes matching a tag.
 */
export function findNodesByTag(orgSlug: string, tag: string): GraphNode[] {
  return listNodes(orgSlug).filter(n => n.tags.includes(tag));
}

/**
 * findRelated — all nodes directly connected to a node (1 hop).
 */
export function findRelated(orgSlug: string, nodeId: string): GraphNode[] {
  const outIds = edgesFrom(orgSlug, nodeId).map(e => e.targetNodeId);
  const inIds  = edgesTo(orgSlug, nodeId).map(e => e.sourceNodeId);
  const allIds = [...new Set([...outIds, ...inIds])];
  return allIds.flatMap(id => {
    const n = getNode(orgSlug, id);
    return n ? [n] : [];
  });
}

/**
 * findConnected — all nodes reachable from nodeId within maxDepth hops.
 */
export function findConnected(orgSlug: string, nodeId: string, maxDepth = 2): GraphNode[] {
  const traversal = bfsTraversal(orgSlug, nodeId, maxDepth);
  return traversal.path.nodes;
}

/**
 * findSubgraph — build a bounded subgraph from a root node.
 */
export function findSubgraph(orgSlug: string, nodeId: string, maxDepth = 2): GraphSubgraph {
  const traversal = bfsTraversal(orgSlug, nodeId, maxDepth);
  return {
    orgSlug,
    nodes:      traversal.path.nodes,
    edges:      traversal.path.edges,
    rootNodeId: nodeId,
    queryId:    generateQueryId(),
    createdAt:  new Date().toISOString(),
  };
}

/**
 * findEdgesByType — find all edges of a given type.
 */
export function findEdgesByType(orgSlug: string, type: GraphEdgeType): GraphEdge[] {
  return listEdges(orgSlug).filter(e => e.type === type);
}

/**
 * findEdgesBetween — find edges between two specific nodes.
 */
export function findEdgesBetween(orgSlug: string, nodeA: string, nodeB: string): GraphEdge[] {
  return listEdges(orgSlug).filter(e =>
    (e.sourceNodeId === nodeA && e.targetNodeId === nodeB) ||
    (e.sourceNodeId === nodeB && e.targetNodeId === nodeA),
  );
}

// ── Structured query ───────────────────────────────────────────────────────────

/**
 * searchGraph — execute a structured GraphQuery and return a GraphQueryResult.
 */
export function searchGraph(query: GraphQuery): GraphQueryResult {
  try {
    let nodes = listNodes(query.orgSlug);
    let edges = listEdges(query.orgSlug);

    if (query.nodeType)  nodes = nodes.filter(n => n.type === query.nodeType);
    if (query.tags?.length) {
      nodes = nodes.filter(n => query.tags!.some(t => n.tags.includes(t)));
    }
    if (query.label) {
      const lower = query.label.toLowerCase();
      nodes = nodes.filter(n => n.label.toLowerCase().includes(lower));
    }
    if (query.minWeight !== undefined) {
      nodes = nodes.filter(n => n.weight >= query.minWeight!);
    }
    if (query.edgeType) edges = edges.filter(e => e.type === query.edgeType);

    // Apply limit to nodes
    const limited = query.limit ? nodes.slice(0, query.limit) : nodes;

    return {
      orgSlug:    query.orgSlug,
      queryId:    query.queryId,
      nodes:      limited,
      edges,
      totalNodes: nodes.length,
      totalEdges: edges.length,
      executedAt: new Date().toISOString(),
    };
  } catch {
    return {
      orgSlug:    query.orgSlug,
      queryId:    query.queryId,
      nodes:      [],
      edges:      [],
      totalNodes: 0,
      totalEdges: 0,
      executedAt: new Date().toISOString(),
    };
  }
}

// ── High-level query helpers ───────────────────────────────────────────────────

/**
 * getHighImportanceNodes — nodes with weight above a threshold.
 */
export function getHighImportanceNodes(orgSlug: string, minWeight = 0.7): GraphNode[] {
  return listNodes(orgSlug).filter(n => n.weight >= minWeight);
}

/**
 * getNodeEdgeCount — how many edges a specific node has.
 */
export function getNodeEdgeCount(orgSlug: string, nodeId: string): number {
  return edgesFrom(orgSlug, nodeId).length + edgesTo(orgSlug, nodeId).length;
}

/**
 * getIsolatedNodes — nodes with zero connections.
 */
export function getIsolatedNodes(orgSlug: string): GraphNode[] {
  return listNodes(orgSlug).filter(n => getNodeEdgeCount(orgSlug, n.id) === 0);
}
