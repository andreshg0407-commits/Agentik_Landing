/**
 * lib/copilot/memory-graph/memory-graph-dashboard-contract.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Dashboard Contract
 *
 * Pure domain — no server-only. Safe for client consumption.
 * Produces serializable dashboard payloads from graph state.
 */

import { listNodes, listEdges } from "./graph-registry";
import { computeGraphMetrics } from "./graph-scoring";
import { runIntegrityCheck } from "./graph-integrity";

// ── Dashboard payload ──────────────────────────────────────────────────────────

export interface DomainNodeMetric {
  nodeType:   string;
  count:      number;
  avgWeight:  number;
}

export interface MemoryGraphDashboardPayload {
  orgSlug:              string;
  nodes:                number;
  edges:                number;
  connectedComponents:  number;
  relationshipStrength: number;       // average edge weight 0–1
  orphanNodes:          number;
  graphHealth:          "HEALTHY" | "DEGRADED" | "CRITICAL";
  nodesByType:          DomainNodeMetric[];
  edgesByType:          Record<string, number>;
  density:              number;
  generatedAt:          string;
}

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * buildMemoryGraphDashboard — compute dashboard payload for an org.
 * Never throws. Returns empty payload on error.
 */
export function buildMemoryGraphDashboard(orgSlug: string): MemoryGraphDashboardPayload {
  try {
    const nodes     = listNodes(orgSlug);
    const edges     = listEdges(orgSlug);
    const metrics   = computeGraphMetrics(orgSlug);
    const integrity = runIntegrityCheck(orgSlug);

    // Node type breakdown with avg weights
    const typeMap = new Map<string, { count: number; totalWeight: number }>();
    for (const n of nodes) {
      const entry = typeMap.get(n.type) ?? { count: 0, totalWeight: 0 };
      entry.count++;
      entry.totalWeight += n.weight;
      typeMap.set(n.type, entry);
    }
    const nodesByType: DomainNodeMetric[] = Array.from(typeMap.entries()).map(
      ([nodeType, { count, totalWeight }]) => ({
        nodeType,
        count,
        avgWeight: count > 0 ? totalWeight / count : 0,
      }),
    );

    // Edge type breakdown
    const edgesByType: Record<string, number> = {};
    for (const e of edges) {
      edgesByType[e.type] = (edgesByType[e.type] ?? 0) + 1;
    }

    // Health assessment
    const graphHealth: MemoryGraphDashboardPayload["graphHealth"] =
      integrity.errorCount > 0 ? "CRITICAL" :
      integrity.warningCount > 5 ? "DEGRADED" :
      "HEALTHY";

    return {
      orgSlug,
      nodes:                nodes.length,
      edges:                edges.length,
      connectedComponents:  metrics.connectedComponents,
      relationshipStrength: metrics.averageEdgeWeight,
      orphanNodes:          integrity.orphanNodes.length,
      graphHealth,
      nodesByType,
      edgesByType,
      density:              metrics.density,
      generatedAt:          new Date().toISOString(),
    };
  } catch {
    return buildEmptyMemoryGraphDashboard(orgSlug);
  }
}

/**
 * buildEmptyMemoryGraphDashboard — empty payload for zero-state.
 */
export function buildEmptyMemoryGraphDashboard(orgSlug: string): MemoryGraphDashboardPayload {
  return {
    orgSlug,
    nodes: 0, edges: 0, connectedComponents: 0,
    relationshipStrength: 0, orphanNodes: 0,
    graphHealth: "HEALTHY",
    nodesByType: [], edgesByType: {}, density: 0,
    generatedAt: new Date().toISOString(),
  };
}
