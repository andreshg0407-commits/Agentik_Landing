/**
 * lib/copilot/memory-graph/integrations/memory-graph-intelligence.ts
 *
 * AGENTIK-INTELLIGENCE-MEMORY-GRAPH-01
 * Memory Graph — Intelligence (Reasoning) Integration Adapter
 *
 * Allows the Reasoning Engine (COPILOT-INTELLIGENCE-02) to consume the graph.
 * Converts GraphSubgraph → context signals, and ReasoningConclusion → graph nodes.
 * No DB. No server-only.
 */

import type { GraphNode, GraphEdge, GraphSubgraph } from "../memory-graph-types";
import type { ReasoningConclusion } from "@/lib/copilot/intelligence/reasoning";
import { buildInsightNode, buildAlertNode } from "../node-builder";
import { buildSupportsEdge, buildContradictsEdge } from "../edge-builder";

// ── ReasoningConclusion → GraphNodes ──────────────────────────────────────────

export interface IntelligenceGraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * reasoningConclusionToGraph — convert a ReasoningConclusion to graph nodes.
 * Insights become INSIGHT nodes. Contradictions become ALERT nodes.
 */
export function reasoningConclusionToGraph(
  orgSlug:    string,
  conclusion: ReasoningConclusion,
): IntelligenceGraphResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Convert insights to INSIGHT nodes
  const insightNodes: GraphNode[] = [];
  for (const insight of conclusion.insights) {
    const node = buildInsightNode(orgSlug, {
      id:              insight.id,
      title:           insight.title,
      type:            insight.type,
      category:        insight.category,
      executiveImpact: insight.executiveImpact,
      confidence:      insight.confidence,
    });
    nodes.push(node);
    insightNodes.push(node);
  }

  // Convert contradictions to ALERT nodes
  for (const c of conclusion.contradictions) {
    const node = buildAlertNode(orgSlug, {
      id:       c.id,
      label:    `Contradiction: ${c.severity}`,
      severity: c.severity,
      source:   "intelligence-integration",
      metadata: {
        contradictionId:  c.id,
        evidenceAId:      c.evidenceAId,
        evidenceBId:      c.evidenceBId,
        resolution:       c.resolution,
      },
    });
    nodes.push(node);
  }

  // Build SUPPORTS edges between insights that share category
  for (let i = 0; i < insightNodes.length; i++) {
    for (let j = i + 1; j < insightNodes.length; j++) {
      const a = insightNodes[i];
      const b = insightNodes[j];
      if (a.metadata.category === b.metadata.category) {
        try {
          edges.push(buildSupportsEdge(
            orgSlug, a.id, b.id,
            `Insights in the same category may support each other`,
            "intelligence-integration",
            0.4,
          ));
        } catch { /* skip */ }
      }
    }
  }

  return { nodes, edges };
}

// ── Graph → Intelligence context ──────────────────────────────────────────────

export interface GraphContextForReasoning {
  orgSlug:          string;
  nodeCount:        number;
  insightNodeIds:   string[];
  alertNodeIds:     string[];
  memoryNodeIds:    string[];
  playbookNodeIds:  string[];
  edgeCount:        number;
  summary:          string;
}

/**
 * subgraphToReasoningContext — summarize a GraphSubgraph for the Reasoning Engine.
 * Does NOT create ReasoningSignals (that's handled by the reasoning integration adapters).
 * This is a metadata summary only.
 */
export function subgraphToReasoningContext(subgraph: GraphSubgraph): GraphContextForReasoning {
  const insightNodeIds  = subgraph.nodes.filter(n => n.type === "INSIGHT").map(n => n.id);
  const alertNodeIds    = subgraph.nodes.filter(n => n.type === "ALERT").map(n => n.id);
  const memoryNodeIds   = subgraph.nodes.filter(n => n.type === "MEMORY").map(n => n.id);
  const playbookNodeIds = subgraph.nodes.filter(n => n.type === "PLAYBOOK").map(n => n.id);

  return {
    orgSlug:         subgraph.orgSlug,
    nodeCount:       subgraph.nodes.length,
    insightNodeIds,
    alertNodeIds,
    memoryNodeIds,
    playbookNodeIds,
    edgeCount:       subgraph.edges.length,
    summary: `Graph context: ${subgraph.nodes.length} nodes, ${subgraph.edges.length} edges. ` +
             `Insights: ${insightNodeIds.length}, Alerts: ${alertNodeIds.length}, ` +
             `Memories: ${memoryNodeIds.length}.`,
  };
}
