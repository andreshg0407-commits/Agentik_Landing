/**
 * lib/copilot/memory-graph/subgraph-builder.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Subgraph Builder
 *
 * Build bounded, tenant-scoped partial views of the full graph.
 * No AI. Deterministic. Never throws.
 */

import type { GraphNode, GraphEdge, GraphSubgraph } from "./memory-graph-types";
import type { GraphNodeType, GraphEdgeType } from "./memory-graph-types";
import { listNodes, listEdges, getNode, edgesFrom, edgesTo } from "./graph-registry";
import { bfsTraversal } from "./traversal-engine";
import { generateQueryId } from "./graph-identity";
import { GRAPH_MAX_DEPTH } from "./memory-graph-types";

// ── Core builder ───────────────────────────────────────────────────────────────

/**
 * buildSubgraph — extract a subgraph starting from a root node.
 * BFS up to maxDepth, always org-scoped.
 */
export function buildSubgraph(
  orgSlug:    string,
  rootNodeId: string,
  maxDepth:   number = 2,
): GraphSubgraph {
  try {
    const traversal = bfsTraversal(orgSlug, rootNodeId, maxDepth);
    return {
      orgSlug,
      nodes:      traversal.path.nodes,
      edges:      traversal.path.edges,
      rootNodeId,
      queryId:    generateQueryId(),
      createdAt:  new Date().toISOString(),
    };
  } catch {
    return _emptySubgraph(orgSlug);
  }
}

/**
 * buildSubgraphByType — extract all nodes of a given type and their immediate neighbors.
 */
export function buildSubgraphByType(
  orgSlug:  string,
  nodeType: GraphNodeType,
  maxDepth: number = 1,
): GraphSubgraph {
  try {
    const allNodes = listNodes(orgSlug).filter(n => n.type === nodeType);
    const seenNodes = new Map<string, GraphNode>();
    const seenEdges = new Map<string, GraphEdge>();

    for (const node of allNodes) {
      seenNodes.set(node.id, node);
      const traversal = bfsTraversal(orgSlug, node.id, maxDepth);
      for (const n of traversal.path.nodes) seenNodes.set(n.id, n);
      for (const e of traversal.path.edges) seenEdges.set(e.id, e);
    }

    return {
      orgSlug,
      nodes:     Array.from(seenNodes.values()),
      edges:     Array.from(seenEdges.values()),
      queryId:   generateQueryId(),
      createdAt: new Date().toISOString(),
    };
  } catch {
    return _emptySubgraph(orgSlug);
  }
}

/**
 * buildClientSubgraph — canonical: Client → Orders → Products → Campaigns → Insights
 */
export function buildClientSubgraph(orgSlug: string, clientNodeId: string): GraphSubgraph {
  return buildSubgraph(orgSlug, clientNodeId, 3);
}

/**
 * buildInsightSubgraph — all supporting nodes for an insight (evidence chain).
 */
export function buildInsightSubgraph(orgSlug: string, insightNodeId: string): GraphSubgraph {
  return buildSubgraph(orgSlug, insightNodeId, 2);
}

/**
 * buildAlertSubgraph — alert → anomaly → affected entities.
 */
export function buildAlertSubgraph(orgSlug: string, alertNodeId: string): GraphSubgraph {
  return buildSubgraph(orgSlug, alertNodeId, 2);
}

// ── Filter-based builders ──────────────────────────────────────────────────────

/**
 * buildSubgraphByEdgeType — extract only edges of a specific type and their nodes.
 */
export function buildSubgraphByEdgeType(
  orgSlug:  string,
  edgeType: GraphEdgeType,
): GraphSubgraph {
  try {
    const edges = listEdges(orgSlug).filter(e => e.type === edgeType);
    const nodeIds = new Set<string>();
    for (const e of edges) {
      nodeIds.add(e.sourceNodeId);
      nodeIds.add(e.targetNodeId);
    }

    const nodes = Array.from(nodeIds).flatMap(id => {
      const n = getNode(orgSlug, id);
      return n ? [n] : [];
    });

    return {
      orgSlug,
      nodes,
      edges,
      queryId:   generateQueryId(),
      createdAt: new Date().toISOString(),
    };
  } catch {
    return _emptySubgraph(orgSlug);
  }
}

/**
 * buildSubgraphByTag — extract nodes matching a tag.
 */
export function buildSubgraphByTag(orgSlug: string, tag: string): GraphSubgraph {
  try {
    const nodes = listNodes(orgSlug).filter(n => n.tags.includes(tag));
    const seenEdges = new Map<string, GraphEdge>();

    for (const node of nodes) {
      const outbound = edgesFrom(orgSlug, node.id);
      const inbound  = edgesTo(orgSlug, node.id);
      for (const e of [...outbound, ...inbound]) seenEdges.set(e.id, e);
    }

    return {
      orgSlug,
      nodes,
      edges:     Array.from(seenEdges.values()),
      queryId:   generateQueryId(),
      createdAt: new Date().toISOString(),
    };
  } catch {
    return _emptySubgraph(orgSlug);
  }
}

/**
 * mergeSubgraphs — combine two subgraphs from the same org.
 * Fails with empty subgraph if orgs differ (tenant isolation).
 */
export function mergeSubgraphs(a: GraphSubgraph, b: GraphSubgraph): GraphSubgraph {
  if (a.orgSlug !== b.orgSlug) {
    return _emptySubgraph(a.orgSlug);
  }

  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();

  for (const n of [...a.nodes, ...b.nodes]) nodeMap.set(n.id, n);
  for (const e of [...a.edges, ...b.edges]) edgeMap.set(e.id, e);

  return {
    orgSlug:   a.orgSlug,
    nodes:     Array.from(nodeMap.values()),
    edges:     Array.from(edgeMap.values()),
    queryId:   generateQueryId(),
    createdAt: new Date().toISOString(),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _emptySubgraph(orgSlug: string): GraphSubgraph {
  return {
    orgSlug,
    nodes:     [],
    edges:     [],
    queryId:   generateQueryId(),
    createdAt: new Date().toISOString(),
  };
}
