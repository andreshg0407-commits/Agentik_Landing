// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 24: Memory Graph Integration

import type { GraphNode, GraphEdge } from "../../memory-graph/memory-graph-types";

export interface GraphCouncilContext {
  readonly relevantNodeCount:   number;
  readonly decisionNodeCount:   number;
  readonly insightNodeCount:    number;
  readonly relationshipCount:   number;
  readonly graphBoost:          number;
}

export function buildGraphCouncilContext(
  orgSlug: string,
  nodes:   GraphNode[],
  edges:   GraphEdge[]
): GraphCouncilContext {
  try {
    const scopedNodes     = nodes.filter((n) => n.orgSlug === orgSlug);
    const decisionNodes   = scopedNodes.filter((n) => n.type === "DECISION");
    const insightNodes    = scopedNodes.filter((n) => n.type === "INSIGHT");
    const scopedEdges     = edges.filter((e) =>
      scopedNodes.some((n) => n.id === e.sourceNodeId || n.id === e.targetNodeId)
    );

    const graphBoost = Math.min(
      0.08,
      (decisionNodes.length > 0 ? 0.04 : 0) + (insightNodes.length > 0 ? 0.04 : 0)
    );

    return {
      relevantNodeCount: scopedNodes.length,
      decisionNodeCount: decisionNodes.length,
      insightNodeCount:  insightNodes.length,
      relationshipCount: scopedEdges.length,
      graphBoost,
    };
  } catch {
    return { relevantNodeCount: 0, decisionNodeCount: 0, insightNodeCount: 0, relationshipCount: 0, graphBoost: 0 };
  }
}

export function getDecisionNodeLabels(
  orgSlug: string,
  nodes:   GraphNode[],
  limit = 3
): string[] {
  return nodes
    .filter((n) => n.orgSlug === orgSlug && n.type === "DECISION")
    .slice(0, limit)
    .map((n) => n.label);
}

export function getStrongGraphRelationships(
  orgSlug:   string,
  nodes:     GraphNode[],
  edges:     GraphEdge[],
  threshold = 0.7
): GraphEdge[] {
  const nodeIds = new Set(nodes.filter((n) => n.orgSlug === orgSlug).map((n) => n.id));
  return edges.filter((e) =>
    (nodeIds.has(e.sourceNodeId) || nodeIds.has(e.targetNodeId)) &&
    (e.weight ?? 0) >= threshold
  );
}
