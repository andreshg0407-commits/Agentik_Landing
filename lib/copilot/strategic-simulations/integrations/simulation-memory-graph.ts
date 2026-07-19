// AGENTIK-STRATEGIC-SIMULATIONS-01
// Phase 17 — Memory Graph Integration

import type { GraphNode, GraphEdge } from "../../memory-graph/memory-graph-types";
import type { StrategicDomain } from "../../strategic-advisor/strategic-advisor-types";

export interface SimulationGraphContext {
  readonly keyNodeCount:    number;
  readonly relationCount:   number;
  readonly graphDensity:    number;
  readonly dominantDomains: StrategicDomain[];
}

export function buildSimulationGraphContext(
  orgSlug: string,
  nodes:   GraphNode[],
  edges:   GraphEdge[]
): SimulationGraphContext {
  const scoped   = nodes.filter((n) => n.orgSlug === orgSlug);
  const keyNodes = scoped.filter((n) => (n.weight ?? 0) >= 0.6);
  const keyIds   = new Set(keyNodes.map((n) => n.id));
  const relations = edges.filter((e) => keyIds.has(e.sourceNodeId) || keyIds.has(e.targetNodeId));

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
    keyNodeCount:    keyNodes.length,
    relationCount:   relations.length,
    graphDensity:    Math.min(scoped.length / 50, 1),
    dominantDomains,
  };
}

export function getSimulationGraphConfidenceBoost(ctx: SimulationGraphContext): number {
  return Math.min(0.15, ctx.graphDensity * 0.15);
}

function _isStrategicDomain(tag: string): boolean {
  return ["FINANCE", "COMMERCIAL", "MARKETING", "OPERATIONS", "EXECUTIVE", "COMPLIANCE", "TECHNOLOGY", "PEOPLE", "CROSS_DOMAIN"].includes(tag);
}
