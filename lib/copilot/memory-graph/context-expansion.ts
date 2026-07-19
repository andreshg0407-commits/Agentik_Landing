/**
 * lib/copilot/memory-graph/context-expansion.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Context Expansion Engine
 *
 * Critical for Copilot: given a question/intent, expand the initial
 * graph context to include related entities and evidence.
 *
 * Flow:
 *   Query → Root Nodes → Expand Relations → Enriched Context
 *
 * No AI. No embeddings. Deterministic.
 */

import type { GraphNode, GraphEdge, GraphSubgraph } from "./memory-graph-types";
import type { GraphNodeType } from "./memory-graph-types";
import { searchNodesTerm } from "./search-engine";
import { bfsTraversal } from "./traversal-engine";
import { listNodes, edgesFrom, edgesTo } from "./graph-registry";
import { generateQueryId } from "./graph-identity";

// ── Expansion result ───────────────────────────────────────────────────────────

export interface ExpandedContext {
  orgSlug:       string;
  queryId:       string;
  query:         string;
  rootNodes:     GraphNode[];
  expandedNodes: GraphNode[];
  expandedEdges: GraphEdge[];
  /** Total nodes in expanded context (root + neighbors). */
  totalNodes:    number;
  /** How many expansion hops were performed. */
  expandedDepth: number;
  expandedAt:    string;
}

// ── Core expansion ─────────────────────────────────────────────────────────────

/**
 * expandContext — given a text query, find root nodes and expand their neighborhood.
 * Core function for Copilot context enrichment.
 *
 * @param orgSlug    Tenant scoping
 * @param query      User's question or intent string
 * @param maxDepth   How many hops to expand (default 2)
 * @param maxNodes   Maximum nodes in result (default 50)
 */
export function expandContext(
  orgSlug:   string,
  query:     string,
  maxDepth   = 2,
  maxNodes   = 50,
): ExpandedContext {
  const queryId = generateQueryId();

  try {
    // Step 1: Find root nodes matching the query
    const rootNodes = searchNodesTerm(orgSlug, query, 10);

    if (rootNodes.length === 0) {
      return _emptyExpansion(orgSlug, queryId, query);
    }

    // Step 2: Expand from each root node
    const seenNodes = new Map<string, GraphNode>();
    const seenEdges = new Map<string, GraphEdge>();

    // Always include root nodes
    for (const root of rootNodes) {
      seenNodes.set(root.id, root);
    }

    for (const root of rootNodes) {
      if (seenNodes.size >= maxNodes) break;

      const traversal = bfsTraversal(orgSlug, root.id, maxDepth);
      for (const n of traversal.path.nodes) {
        if (seenNodes.size >= maxNodes) break;
        seenNodes.set(n.id, n);
      }
      for (const e of traversal.path.edges) {
        seenEdges.set(e.id, e);
      }
    }

    const expandedNodes = Array.from(seenNodes.values());
    const expandedEdges = Array.from(seenEdges.values());

    return {
      orgSlug,
      queryId,
      query,
      rootNodes,
      expandedNodes,
      expandedEdges,
      totalNodes:    expandedNodes.length,
      expandedDepth: maxDepth,
      expandedAt:    new Date().toISOString(),
    };
  } catch {
    return _emptyExpansion(orgSlug, queryId, query);
  }
}

/**
 * expandFromNodes — expand context from a known set of root node IDs.
 * Use when the caller already knows the starting entities.
 */
export function expandFromNodes(
  orgSlug:     string,
  rootNodeIds: string[],
  maxDepth     = 2,
  maxNodes     = 50,
): ExpandedContext {
  const queryId = generateQueryId();

  try {
    const rootNodes: GraphNode[] = [];
    const seenNodes = new Map<string, GraphNode>();
    const seenEdges = new Map<string, GraphEdge>();

    for (const id of rootNodeIds) {
      const traversal = bfsTraversal(orgSlug, id, 0);   // depth 0 = just the node
      if (traversal.path.nodes.length > 0) {
        const root = traversal.path.nodes[0];
        rootNodes.push(root);
        seenNodes.set(root.id, root);
      }
    }

    for (const root of rootNodes) {
      if (seenNodes.size >= maxNodes) break;
      const traversal = bfsTraversal(orgSlug, root.id, maxDepth);
      for (const n of traversal.path.nodes) {
        if (seenNodes.size >= maxNodes) break;
        seenNodes.set(n.id, n);
      }
      for (const e of traversal.path.edges) seenEdges.set(e.id, e);
    }

    const expandedNodes = Array.from(seenNodes.values());
    const expandedEdges = Array.from(seenEdges.values());

    return {
      orgSlug,
      queryId,
      query:         rootNodeIds.join(","),
      rootNodes,
      expandedNodes,
      expandedEdges,
      totalNodes:    expandedNodes.length,
      expandedDepth: maxDepth,
      expandedAt:    new Date().toISOString(),
    };
  } catch {
    return _emptyExpansion(orgSlug, queryId, "");
  }
}

/**
 * expandByType — expand from all nodes of a given type.
 */
export function expandByType(
  orgSlug:  string,
  nodeType: GraphNodeType,
  maxDepth: number = 1,
): ExpandedContext {
  const queryId   = generateQueryId();
  const rootNodes = listNodes(orgSlug).filter(n => n.type === nodeType);
  return expandFromNodes(orgSlug, rootNodes.map(n => n.id), maxDepth);
}

/**
 * summarizeExpansion — extract a compact summary from an ExpandedContext.
 */
export interface ExpansionSummary {
  orgSlug:       string;
  queryId:       string;
  query:         string;
  rootCount:     number;
  expandedCount: number;
  edgeCount:     number;
  nodeTypes:     string[];
}

export function summarizeExpansion(ctx: ExpandedContext): ExpansionSummary {
  const types = [...new Set(ctx.expandedNodes.map(n => n.type))];
  return {
    orgSlug:       ctx.orgSlug,
    queryId:       ctx.queryId,
    query:         ctx.query,
    rootCount:     ctx.rootNodes.length,
    expandedCount: ctx.expandedNodes.length,
    edgeCount:     ctx.expandedEdges.length,
    nodeTypes:     types,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _emptyExpansion(orgSlug: string, queryId: string, query: string): ExpandedContext {
  return {
    orgSlug, queryId, query,
    rootNodes: [], expandedNodes: [], expandedEdges: [],
    totalNodes: 0, expandedDepth: 0, expandedAt: new Date().toISOString(),
  };
}
