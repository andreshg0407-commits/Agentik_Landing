// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 21: Memory Graph Integration
// CRITICAL: uses sourceNodeId/targetNodeId NOT sourceId/targetId

export interface GovernanceGraphContext {
  readonly orgSlug:       string;
  readonly nodeCount:     number;
  readonly edgeCount:     number;
  readonly graphBoost:    number; // 0–1
  readonly hasGraph:      boolean;
}

export interface GraphNode {
  readonly id:    string;
  readonly type?: string;
  readonly label?: string;
}

export interface GraphEdge {
  readonly sourceNodeId: string; // NOTE: sourceNodeId not sourceId
  readonly targetNodeId: string; // NOTE: targetNodeId not targetId
  readonly type?:        string;
}

export function buildGovernanceGraphContext(
  orgSlug: string,
  nodes?: GraphNode[],
  edges?: GraphEdge[]
): GovernanceGraphContext {
  try {
    const nodeCount = (nodes ?? []).length;
    const edgeCount = (edges ?? []).length;
    const boost     = Math.min(0.08, nodeCount * 0.01 + edgeCount * 0.005);
    return {
      orgSlug,
      nodeCount,
      edgeCount,
      graphBoost: boost,
      hasGraph:   nodeCount > 0,
    };
  } catch {
    return { orgSlug, nodeCount: 0, edgeCount: 0, graphBoost: 0, hasGraph: false };
  }
}

export function getGovernanceRelatedNodes(
  nodes: GraphNode[],
  type: string
): GraphNode[] {
  try {
    return nodes.filter((n) => n.type === type);
  } catch {
    return [];
  }
}
