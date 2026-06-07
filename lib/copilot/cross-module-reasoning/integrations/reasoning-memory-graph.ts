/**
 * lib/copilot/cross-module-reasoning/integrations/reasoning-memory-graph.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Memory Graph Adapter — consumes Memory Graph for reasoning context.
 * No DB. No server-only.
 */

import type { GraphNode, GraphEdge, GraphSubgraph } from "@/lib/copilot/memory-graph";
import type { ReasoningEvidence, ReasoningSignal } from "../cross-module-types";
import { generateCmrId } from "../cross-module-types";

// ── Graph node → Evidence ─────────────────────────────────────────────────────

export function graphNodeToEvidence(
  orgSlug: string,
  node: GraphNode,
): ReasoningEvidence {
  const domainFromType: Record<string, ReasoningEvidence["domain"]> = {
    INSIGHT:  "EXECUTIVE",
    ALERT:    "EXECUTIVE",
    ANOMALY:  "EXECUTIVE",
    CLIENT:   "COMMERCIAL",
    ORDER:    "COMMERCIAL",
    CAMPAIGN: "MARKETING",
    PRODUCT:  "COMMERCIAL",
    TASK:     "EXECUTIVE",
    DOCUMENT: "EXECUTIVE",
    REPORT:   "EXECUTIVE",
    EVENT:    "EXECUTIVE",
    DECISION: "EXECUTIVE",
    MEMORY:   "MEMORY",
    AGENT:    "EXECUTIVE",
    USER:     "EXECUTIVE",
    PLAYBOOK: "PLAYBOOKS",
  };

  return {
    id:          generateCmrId("ev"),
    orgSlug,
    type:        "GRAPH_RELATIONSHIP",
    domain:      domainFromType[node.type] ?? "GRAPH",
    label:       node.label,
    description: `Graph node: ${node.label} (type: ${node.type})`,
    strength:    node.weight,
    reliability: 0.7,  // graph relationships are reliable but not ground truth
    sourceRef:   node.id,
    sourceType:  "graph_node",
    metadata:    {
      nodeId:   node.id,
      nodeType: node.type,
      tags:     node.tags,
    },
    collectedAt: new Date().toISOString(),
  };
}

// ── Graph edge → Evidence ─────────────────────────────────────────────────────

export function graphEdgeToEvidence(
  orgSlug: string,
  edge: GraphEdge,
): ReasoningEvidence {
  return {
    id:          generateCmrId("ev"),
    orgSlug,
    type:        "GRAPH_RELATIONSHIP",
    domain:      "GRAPH",
    label:       edge.label ?? `${edge.type} relationship`,
    description: edge.reasoning ?? `Graph edge: ${edge.type} (${edge.sourceNodeId} → ${edge.targetNodeId})`,
    strength:    edge.weight,
    reliability: 0.75,
    sourceRef:   edge.id,
    sourceType:  "graph_edge",
    metadata:    {
      edgeId:       edge.id,
      edgeType:     edge.type,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
    },
    collectedAt: new Date().toISOString(),
  };
}

// ── Subgraph → Evidence set ───────────────────────────────────────────────────

export function subgraphToEvidence(
  orgSlug: string,
  subgraph: GraphSubgraph,
): ReasoningEvidence[] {
  const nodeEvidence = subgraph.nodes
    .filter(n => n.orgSlug === orgSlug)
    .map(n => graphNodeToEvidence(orgSlug, n));

  const edgeEvidence = subgraph.edges
    .filter(e => e.orgSlug === orgSlug)
    .map(e => graphEdgeToEvidence(orgSlug, e));

  return [...nodeEvidence, ...edgeEvidence];
}

// ── Graph node → Signal ───────────────────────────────────────────────────────

export function graphAlertNodeToSignal(
  orgSlug: string,
  node: GraphNode,
): ReasoningSignal | null {
  if (node.type !== "ALERT" && node.type !== "ANOMALY") return null;

  return {
    id:          generateCmrId("sig"),
    orgSlug,
    type:        node.type === "ALERT" ? "ALERT" : "ANOMALY",
    domain:      "GRAPH",
    label:       node.label,
    description: `Graph ${node.type.toLowerCase()}: ${node.label}`,
    severity:    node.weight >= 0.8 ? "CRITICAL" : node.weight >= 0.5 ? "HIGH" : "MEDIUM",
    confidence:  node.weight,
    source:      "memory-graph",
    metadata:    { nodeId: node.id, nodeType: node.type, tags: node.tags },
    detectedAt:  new Date().toISOString(),
  };
}

// ── Get reasoning context from graph ─────────────────────────────────────────

export interface GraphReasoningContext {
  orgSlug:   string;
  evidence:  ReasoningEvidence[];
  signals:   ReasoningSignal[];
  nodeCount: number;
  edgeCount: number;
}

export function buildGraphReasoningContext(
  orgSlug: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
): GraphReasoningContext {
  const scopedNodes = nodes.filter(n => n.orgSlug === orgSlug);
  const scopedEdges = edges.filter(e => e.orgSlug === orgSlug);

  const evidence = [
    ...scopedNodes.map(n => graphNodeToEvidence(orgSlug, n)),
    ...scopedEdges.map(e => graphEdgeToEvidence(orgSlug, e)),
  ];

  const signals = scopedNodes
    .map(n => graphAlertNodeToSignal(orgSlug, n))
    .filter((s): s is ReasoningSignal => s !== null);

  return {
    orgSlug,
    evidence,
    signals,
    nodeCount: scopedNodes.length,
    edgeCount: scopedEdges.length,
  };
}
