/**
 * lib/copilot/memory-graph/integrations/memory-graph-executive-brain.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Executive Brain Integration Adapter
 *
 * Converts ExecutiveSignal / ExecutiveInsight / ExecutiveContext into graph nodes.
 * Enables navigating executive relationships in the graph.
 * No DB. No server-only.
 */

import type { GraphNode, GraphEdge } from "../memory-graph-types";
import type {
  ExecutiveContext,
  ExecutiveSignal,
  ExecutiveInsight,
} from "@/lib/copilot/executive-brain/executive-brain-types";
import { buildNode } from "../node-builder";
import { buildAffectsEdge, buildGeneratedByEdge } from "../edge-builder";
import { GRAPH_DEFAULT_WEIGHT } from "../memory-graph-types";

// ── Signal → Node ──────────────────────────────────────────────────────────────

export function executiveSignalToNode(orgSlug: string, signal: ExecutiveSignal): GraphNode {
  return buildNode({
    id:      `mgn_exsig_${signal.id}`,
    orgSlug,
    type:    "EVENT",
    label:   signal.title ?? `Signal ${signal.id}`,
    source:  "executive-brain-integration",
    weight:  _severityToWeight(signal.severity),
    tags:    [signal.category ?? "", signal.severity ?? ""].filter(Boolean),
    metadata: {
      signalId:    signal.id,
      category:    signal.category,
      severity:    signal.severity,
      direction:   signal.direction,
      confidence:  signal.confidence,
      description: signal.description,
    },
  });
}

export function executiveInsightToNode(orgSlug: string, insight: ExecutiveInsight): GraphNode {
  const primaryCategory = insight.categories?.[0] ?? "";
  return buildNode({
    id:      `mgn_exins_${insight.id}`,
    orgSlug,
    type:    "INSIGHT",
    label:   insight.title ?? `Executive Insight ${insight.id}`,
    source:  "executive-brain-integration",
    weight:  _impactToWeight(insight.priority),
    tags:    [primaryCategory, insight.priority ?? ""].filter(Boolean),
    metadata: {
      insightId:  insight.id,
      categories: insight.categories,
      priority:   insight.priority,
      summary:    insight.summary?.slice(0, 200),    // truncate — never store full content
    },
  });
}

// ── Context → Nodes + Edges ────────────────────────────────────────────────────

export interface ExecutiveBrainGraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * executiveContextToGraph — convert ExecutiveContext to graph nodes and edges.
 */
export function executiveContextToGraph(ctx: ExecutiveContext): ExecutiveBrainGraphResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Convert signals
  const signalNodes = ctx.signals.map(s => executiveSignalToNode(ctx.orgSlug, s));
  nodes.push(...signalNodes);

  // Convert insights
  const insightNodes = ctx.insights.map(i => executiveInsightToNode(ctx.orgSlug, i));
  nodes.push(...insightNodes);

  // Build AFFECTS edges: high-severity signals affect insights
  for (const sigNode of signalNodes) {
    for (const insNode of insightNodes) {
      const sigCategory  = String(sigNode.metadata.category ?? "");
      const insCategories = (insNode.metadata.categories as string[]) ?? [];
      if (sigCategory && insCategories.includes(sigCategory)) {
        try {
          edges.push(buildAffectsEdge(
            ctx.orgSlug, sigNode.id, insNode.id,
            `Signal in ${sigCategory} affects insight in that category`,
            "executive-brain-integration",
            sigNode.weight,
          ));
        } catch { /* skip */ }
      }
    }
  }

  return { nodes, edges };
}

// ── Weight helpers ─────────────────────────────────────────────────────────────

function _severityToWeight(severity?: string): number {
  switch (severity) {
    case "CRITICAL": return 1.0;
    case "HIGH":     return 0.8;
    case "MEDIUM":   return 0.5;
    case "LOW":      return 0.3;
    default:         return GRAPH_DEFAULT_WEIGHT;
  }
}

function _impactToWeight(impact?: string): number {
  switch (impact) {
    case "CRITICAL": return 1.0;
    case "HIGH":     return 0.8;
    case "MEDIUM":   return 0.5;
    case "LOW":      return 0.3;
    default:         return GRAPH_DEFAULT_WEIGHT;
  }
}
