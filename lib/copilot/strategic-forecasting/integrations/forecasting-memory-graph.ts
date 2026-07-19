// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 23: Memory Graph Integration
// CRITICAL: uses sourceNodeId/targetNodeId (NOT sourceId/targetId)

export interface GraphForecastContext {
  readonly orgSlug:      string;
  readonly nodeLabels:   string[];
  readonly edgeLabels:   string[];
  readonly graphBoost:   number; // 0–0.08
  readonly hasGraphData: boolean;
  readonly nodeCount:    number;
  readonly edgeCount:    number;
}

export interface GraphForecastNode {
  readonly id:    string;
  readonly label: string;
  readonly type:  string;
}

export interface GraphForecastEdge {
  readonly sourceNodeId: string; // CRITICAL: sourceNodeId not sourceId
  readonly targetNodeId: string; // CRITICAL: targetNodeId not targetId
  readonly type:         string;
}

export function buildGraphForecastContext(
  orgSlug: string,
  nodes: GraphForecastNode[],
  edges: GraphForecastEdge[]
): GraphForecastContext {
  try {
    if (!nodes || nodes.length === 0) {
      return buildEmptyGraphForecastContext(orgSlug);
    }

    const nodeLabels = nodes.slice(0, 8).map((n) => n.label);
    const edgeLabels = edges.slice(0, 6).map((e) => e.type);

    const graphBoost = Math.min(
      0.08,
      (nodes.length > 0 ? 0.03 : 0) +
      (edges.length > 0 ? 0.03 : 0) +
      Math.min(0.02, (nodes.length + edges.length) * 0.002)
    );

    return {
      orgSlug,
      nodeLabels,
      edgeLabels,
      graphBoost,
      hasGraphData: true,
      nodeCount:    nodes.length,
      edgeCount:    edges.length,
    };
  } catch {
    return buildEmptyGraphForecastContext(orgSlug);
  }
}

export function buildEmptyGraphForecastContext(orgSlug: string): GraphForecastContext {
  return {
    orgSlug,
    nodeLabels:   [],
    edgeLabels:   [],
    graphBoost:   0,
    hasGraphData: false,
    nodeCount:    0,
    edgeCount:    0,
  };
}

export function getGraphForecastNodeLabels(
  ctx: GraphForecastContext,
  limit = 3
): string[] {
  return ctx.nodeLabels.slice(0, limit);
}
