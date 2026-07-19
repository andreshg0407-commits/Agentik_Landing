// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 27: Memory Graph Integration
// CRITICAL: uses sourceNodeId/targetNodeId NOT sourceId/targetId

export interface DirectionGraphContext {
  readonly orgSlug:        string;
  readonly nodeCount:      number;
  readonly edgeCount:      number;
  readonly graphBoost:     number; // 0–0.08
  readonly hasGraphData:   boolean;
}

export function buildDirectionGraphContext(
  orgSlug: string,
  nodes: Array<{ id: string; type?: string }> = [],
  edges: Array<{ sourceNodeId: string; targetNodeId: string }> = [] // sourceNodeId/targetNodeId
): DirectionGraphContext {
  try {
    const nodeCount  = nodes.length;
    const edgeCount  = edges.length;
    const graphBoost = Math.min(0.08, (nodeCount + edgeCount) * 0.005);
    return {
      orgSlug,
      nodeCount,
      edgeCount,
      graphBoost,
      hasGraphData: nodeCount > 0,
    };
  } catch {
    return { orgSlug, nodeCount: 0, edgeCount: 0, graphBoost: 0, hasGraphData: false };
  }
}

export function countDirectionEdges(
  edges: Array<{ sourceNodeId: string; targetNodeId: string }>
): number {
  try {
    return edges.length;
  } catch {
    return 0;
  }
}
