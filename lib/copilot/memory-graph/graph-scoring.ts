/**
 * lib/copilot/memory-graph/graph-scoring.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Scoring Engine
 *
 * Calculate importance, centrality, and relationship strength.
 * Deterministic. No ML. No AI. No DB.
 */

import type { GraphNode, GraphEdge, GraphNodeScore } from "./memory-graph-types";
import { listNodes, listEdges, edgesFrom, edgesTo } from "./graph-registry";

// ── Node scoring ───────────────────────────────────────────────────────────────

/**
 * scoreNode — compute importance and centrality scores for a single node.
 */
export function scoreNode(orgSlug: string, nodeId: string): GraphNodeScore | null {
  try {
    const nodes      = listNodes(orgSlug);
    const allEdges   = listEdges(orgSlug);
    const nodeCount  = nodes.length;
    if (nodeCount === 0) return null;

    const outbound = edgesFrom(orgSlug, nodeId);
    const inbound  = edgesTo(orgSlug, nodeId);
    const allNodeEdges = [...outbound, ...inbound];

    const connectionCount  = new Set([
      ...outbound.map(e => e.targetNodeId),
      ...inbound.map(e => e.sourceNodeId),
    ]).size;

    // Degree centrality: connections / (max possible connections)
    const maxConnections = Math.max(nodeCount - 1, 1);
    const centrality     = Math.min(connectionCount / maxConnections, 1);

    // Importance: weighted average of edge weights + node's own weight
    const nodeObj = nodes.find(n => n.id === nodeId);
    const nodeWeight   = nodeObj?.weight ?? 0.5;
    const avgEdgeWeight = allNodeEdges.length > 0
      ? allNodeEdges.reduce((sum, e) => sum + e.weight, 0) / allNodeEdges.length
      : 0;

    const importance = Math.min((nodeWeight * 0.4 + avgEdgeWeight * 0.4 + centrality * 0.2), 1);

    return {
      nodeId,
      orgSlug,
      importance,
      centrality,
      connectionCount,
      inboundCount:       inbound.length,
      outboundCount:      outbound.length,
      averageEdgeWeight:  avgEdgeWeight,
    };
  } catch {
    return null;
  }
}

/**
 * scoreAllNodes — compute scores for all nodes in an org.
 */
export function scoreAllNodes(orgSlug: string): GraphNodeScore[] {
  try {
    const nodes = listNodes(orgSlug);
    return nodes.flatMap(n => {
      const score = scoreNode(orgSlug, n.id);
      return score ? [score] : [];
    });
  } catch {
    return [];
  }
}

/**
 * topNodesByImportance — return the top N most important nodes.
 */
export function topNodesByImportance(orgSlug: string, limit = 10): GraphNodeScore[] {
  return scoreAllNodes(orgSlug)
    .sort((a, b) => b.importance - a.importance)
    .slice(0, limit);
}

/**
 * topNodesByCentrality — return the top N most central nodes.
 */
export function topNodesByCentrality(orgSlug: string, limit = 10): GraphNodeScore[] {
  return scoreAllNodes(orgSlug)
    .sort((a, b) => b.centrality - a.centrality)
    .slice(0, limit);
}

// ── Edge scoring ───────────────────────────────────────────────────────────────

/**
 * edgeStrength — the weight of a specific edge.
 */
export function edgeStrength(edge: GraphEdge): number {
  return Math.min(Math.max(edge.weight, 0), 1);
}

/**
 * averageEdgeWeight — average edge weight across the entire org graph.
 */
export function averageEdgeWeight(orgSlug: string): number {
  try {
    const edges = listEdges(orgSlug);
    if (edges.length === 0) return 0;
    return edges.reduce((sum, e) => sum + e.weight, 0) / edges.length;
  } catch {
    return 0;
  }
}

// ── Graph-level metrics ────────────────────────────────────────────────────────

export interface GraphMetrics {
  orgSlug:              string;
  nodeCount:            number;
  edgeCount:            number;
  density:              number;     // edges / max_possible_edges
  averageEdgeWeight:    number;
  averageDegree:        number;     // avg edges per node
  maxDegree:            number;
  connectedComponents:  number;     // rough estimate
  computedAt:           string;
}

/**
 * computeGraphMetrics — overall graph health metrics.
 */
export function computeGraphMetrics(orgSlug: string): GraphMetrics {
  try {
    const nodes  = listNodes(orgSlug);
    const edges  = listEdges(orgSlug);
    const n      = nodes.length;
    const e      = edges.length;
    const maxE   = n > 1 ? n * (n - 1) : 1;

    const avgWeight = e > 0 ? edges.reduce((s, x) => s + x.weight, 0) / e : 0;
    const avgDegree = n > 0 ? (e * 2) / n : 0;

    // Degree per node
    const degrees = new Map<string, number>();
    for (const node of nodes) degrees.set(node.id, 0);
    for (const edge of edges) {
      degrees.set(edge.sourceNodeId, (degrees.get(edge.sourceNodeId) ?? 0) + 1);
      degrees.set(edge.targetNodeId, (degrees.get(edge.targetNodeId) ?? 0) + 1);
    }
    const maxDegree = Math.max(...degrees.values(), 0);

    // Rough connected component estimate (nodes with 0 connections = isolated)
    const isolatedCount = Array.from(degrees.values()).filter(d => d === 0).length;
    const components    = Math.max(1, isolatedCount > 0 ? isolatedCount + 1 : 1);

    return {
      orgSlug,
      nodeCount:           n,
      edgeCount:           e,
      density:             e / maxE,
      averageEdgeWeight:   avgWeight,
      averageDegree:       avgDegree,
      maxDegree,
      connectedComponents: components,
      computedAt:          new Date().toISOString(),
    };
  } catch {
    return {
      orgSlug, nodeCount: 0, edgeCount: 0, density: 0,
      averageEdgeWeight: 0, averageDegree: 0, maxDegree: 0,
      connectedComponents: 0, computedAt: new Date().toISOString(),
    };
  }
}
