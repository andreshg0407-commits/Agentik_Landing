// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 23: Memory Graph Integration

import type { GraphNode, GraphEdge } from "../../memory-graph/memory-graph-types";

export interface GraphBoardContext {
  readonly orgSlug:       string;
  readonly nodes:         GraphNode[];
  readonly edges:         GraphEdge[];
  readonly graphBoost:    number;
  readonly nodeCount:     number;
  readonly edgeCount:     number;
  readonly hasRichGraph:  boolean;
}

export function buildGraphBoardContext(
  orgSlug: string,
  nodes:   GraphNode[],
  edges:   GraphEdge[]
): GraphBoardContext {
  try {
    const scopedNodes = nodes.filter((n) => n.orgSlug === orgSlug);
    const scopedEdges = edges.filter((e) =>
      scopedNodes.some((n) => n.id === e.sourceNodeId || n.id === e.targetNodeId)
    );
    const hasRichGraph = scopedNodes.length >= 5 && scopedEdges.length >= 3;
    const graphBoost   = Math.min(0.08, hasRichGraph ? 0.08 : scopedNodes.length > 0 ? 0.04 : 0);

    return {
      orgSlug,
      nodes:    scopedNodes,
      edges:    scopedEdges,
      graphBoost,
      nodeCount:   scopedNodes.length,
      edgeCount:   scopedEdges.length,
      hasRichGraph,
    };
  } catch {
    return buildEmptyGraphBoardContext(orgSlug);
  }
}

export function buildEmptyGraphBoardContext(orgSlug: string): GraphBoardContext {
  return {
    orgSlug,
    nodes:    [],
    edges:    [],
    graphBoost: 0,
    nodeCount:   0,
    edgeCount:   0,
    hasRichGraph: false,
  };
}

export function getConnectedBoardNodeLabels(ctx: GraphBoardContext, limit = 5): string[] {
  return ctx.nodes
    .slice(0, limit)
    .map((n) => n.label ?? n.id);
}
