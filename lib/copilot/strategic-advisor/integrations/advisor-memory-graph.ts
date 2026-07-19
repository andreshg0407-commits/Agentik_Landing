// AGENTIK-STRATEGIC-ADVISOR-01 — Phase 18: Memory Graph Integration

import type { GraphNode, GraphEdge } from "../../memory-graph/memory-graph-types";
import type { StrategicDomain } from "../strategic-advisor-types";

export interface AdvisorGraphContext {
  readonly keyNodes:           GraphNode[];
  readonly strategicRelations: GraphEdge[];
  readonly dominantDomains:    StrategicDomain[];
  readonly graphDensity:       number;
}

export function buildAdvisorGraphContext(
  orgSlug: string,
  nodes: GraphNode[],
  edges: GraphEdge[]
): AdvisorGraphContext {
  const scoped     = nodes.filter((n) => n.orgSlug === orgSlug);
  const keyNodes   = scoped.filter((n) => (n.weight ?? 0) >= 0.6).slice(0, 20);
  const keyNodeIds = new Set(keyNodes.map((n) => n.id));
  const strategic  = edges.filter((e) => keyNodeIds.has(e.sourceNodeId) || keyNodeIds.has(e.targetNodeId));

  // Infer domains from node tags
  const domainFreq: Record<string, number> = {};
  for (const node of scoped) {
    for (const tag of (node.tags ?? [])) {
      if (_isStrategicDomain(tag)) {
        domainFreq[tag] = (domainFreq[tag] ?? 0) + 1;
      }
    }
  }
  const dominantDomains = Object.entries(domainFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([d]) => d as StrategicDomain);

  return {
    keyNodes,
    strategicRelations: strategic.slice(0, 30),
    dominantDomains,
    graphDensity: Math.min(scoped.length / 50, 1),
  };
}

export function getStrategicAdvisorRelationships(orgSlug: string, nodes: GraphNode[], edges: GraphEdge[]): GraphEdge[] {
  const nodeIds = new Set(nodes.filter((n) => n.orgSlug === orgSlug).map((n) => n.id));
  return edges.filter((e) => nodeIds.has(e.sourceNodeId) && nodeIds.has(e.targetNodeId)).slice(0, 20);
}

function _isStrategicDomain(tag: string): boolean {
  return ["FINANCE", "COMMERCIAL", "MARKETING", "OPERATIONS", "EXECUTIVE", "COMPLIANCE", "TECHNOLOGY", "PEOPLE", "CROSS_DOMAIN"].includes(tag);
}
