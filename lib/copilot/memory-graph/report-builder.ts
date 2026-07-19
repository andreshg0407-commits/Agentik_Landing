/**
 * lib/copilot/memory-graph/report-builder.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Report Builder
 *
 * Generate structured reports about graph state, relationships, and health.
 * Pure domain — no DB, no server-only.
 */

import type { GraphNode, GraphEdge } from "./memory-graph-types";
import { listNodes, listEdges } from "./graph-registry";
import { computeGraphMetrics } from "./graph-scoring";
import { runIntegrityCheck } from "./graph-integrity";
import type { GraphMetrics } from "./graph-scoring";
import type { IntegrityReport } from "./graph-integrity";

// ── Report types ───────────────────────────────────────────────────────────────

export interface GraphSummaryReport {
  orgSlug:        string;
  nodeCount:      number;
  edgeCount:      number;
  nodeTypeBreakdown: Record<string, number>;
  edgeTypeBreakdown: Record<string, number>;
  metrics:        GraphMetrics;
  generatedAt:    string;
}

export interface RelationshipReport {
  orgSlug:          string;
  totalRelationships: number;
  byType:           Record<string, number>;
  strongestEdges:   GraphEdge[];     // top 5 by weight
  weakestEdges:     GraphEdge[];     // bottom 5 by weight
  generatedAt:      string;
}

export interface KnowledgeReport {
  orgSlug:          string;
  totalNodes:       number;
  highImportance:   GraphNode[];     // weight >= 0.8
  isolatedNodes:    GraphNode[];     // no connections
  mostConnected:    GraphNode[];     // top 5 by degree
  generatedAt:      string;
}

export interface ConnectivityReport {
  orgSlug:            string;
  density:            number;
  averageDegree:      number;
  maxDegree:          number;
  connectedComponents: number;
  isolatedCount:      number;
  integrityReport:    IntegrityReport;
  generatedAt:        string;
}

// ── Report builders ────────────────────────────────────────────────────────────

/**
 * buildGraphSummary — overall graph statistics.
 */
export function buildGraphSummary(orgSlug: string): GraphSummaryReport {
  const nodes   = listNodes(orgSlug);
  const edges   = listEdges(orgSlug);
  const metrics = computeGraphMetrics(orgSlug);

  const nodeTypeBreakdown: Record<string, number> = {};
  for (const n of nodes) {
    nodeTypeBreakdown[n.type] = (nodeTypeBreakdown[n.type] ?? 0) + 1;
  }

  const edgeTypeBreakdown: Record<string, number> = {};
  for (const e of edges) {
    edgeTypeBreakdown[e.type] = (edgeTypeBreakdown[e.type] ?? 0) + 1;
  }

  return {
    orgSlug,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodeTypeBreakdown,
    edgeTypeBreakdown,
    metrics,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * buildRelationshipReport — relationship analysis.
 */
export function buildRelationshipReport(orgSlug: string): RelationshipReport {
  const edges = listEdges(orgSlug);

  const byType: Record<string, number> = {};
  for (const e of edges) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
  }

  const sorted = [...edges].sort((a, b) => b.weight - a.weight);

  return {
    orgSlug,
    totalRelationships: edges.length,
    byType,
    strongestEdges: sorted.slice(0, 5),
    weakestEdges:   sorted.slice(-5).reverse(),
    generatedAt:    new Date().toISOString(),
  };
}

/**
 * buildKnowledgeReport — node importance and connectivity analysis.
 */
export function buildKnowledgeReport(orgSlug: string): KnowledgeReport {
  const nodes = listNodes(orgSlug);
  const edges = listEdges(orgSlug);

  const degreeMap = new Map<string, number>();
  for (const n of nodes) degreeMap.set(n.id, 0);
  for (const e of edges) {
    degreeMap.set(e.sourceNodeId, (degreeMap.get(e.sourceNodeId) ?? 0) + 1);
    degreeMap.set(e.targetNodeId, (degreeMap.get(e.targetNodeId) ?? 0) + 1);
  }

  const highImportance  = nodes.filter(n => n.weight >= 0.8);
  const isolatedNodes   = nodes.filter(n => (degreeMap.get(n.id) ?? 0) === 0);
  const mostConnected   = [...nodes]
    .sort((a, b) => (degreeMap.get(b.id) ?? 0) - (degreeMap.get(a.id) ?? 0))
    .slice(0, 5);

  return {
    orgSlug,
    totalNodes: nodes.length,
    highImportance,
    isolatedNodes,
    mostConnected,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * buildConnectivityReport — graph connectivity analysis with integrity check.
 */
export function buildConnectivityReport(orgSlug: string): ConnectivityReport {
  const metrics   = computeGraphMetrics(orgSlug);
  const integrity = runIntegrityCheck(orgSlug);

  return {
    orgSlug,
    density:             metrics.density,
    averageDegree:       metrics.averageDegree,
    maxDegree:           metrics.maxDegree,
    connectedComponents: metrics.connectedComponents,
    isolatedCount:       integrity.orphanNodes.length,
    integrityReport:     integrity,
    generatedAt:         new Date().toISOString(),
  };
}
