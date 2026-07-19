// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Learning ↔ Memory Graph integration adapter

import type { LearningEvent, LearningPattern, LearningDomain } from "../learning-types";
import { buildLearningEvent } from "../learning-event-builder";

// Lightweight GraphNode/Edge shapes — avoid importing full memory-graph module
interface GraphNodeRef {
  readonly id: string;
  readonly orgSlug: string;
  readonly label: string;
  readonly type?: string;
  readonly confidence?: number;
}

interface GraphEdgeRef {
  readonly id: string;
  readonly orgSlug: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly relationshipType?: string;
  readonly weight?: number;
}

function graphTypeToLearningDomain(type?: string): LearningDomain {
  switch ((type ?? "").toUpperCase()) {
    case "FINANCE":
    case "FINANCIAL":
      return "FINANCE";
    case "COMMERCIAL":
      return "COMMERCIAL";
    case "MARKETING":
      return "MARKETING";
    case "EXECUTIVE":
      return "EXECUTIVE";
    case "COMPLIANCE":
      return "COMPLIANCE";
    default:
      return "CROSS_MODULE";
  }
}

export function graphNodeToLearningEvent(
  orgSlug: string,
  node: GraphNodeRef
): LearningEvent {
  if (node.orgSlug !== orgSlug) {
    throw new Error(
      `Tenant isolation: graph node belongs to "${node.orgSlug}", not "${orgSlug}"`
    );
  }

  const domain = graphTypeToLearningDomain(node.type);
  const confidence = node.confidence ?? 0.6;

  return buildLearningEvent({
    orgSlug,
    type: "PATTERN_REINFORCED",
    source: "MEMORY_GRAPH",
    domain,
    referenceId: node.id,
    referenceType: "PATTERN",
    confidence: confidence >= 0.75 ? "HIGH" : "MEDIUM",
    confidenceScore: confidence,
    metadata: {
      graphNodeLabel: node.label,
      graphNodeType: node.type,
    },
  });
}

export function graphEdgeToLearningEvent(
  orgSlug: string,
  edge: GraphEdgeRef
): LearningEvent {
  if (edge.orgSlug !== orgSlug) {
    throw new Error(
      `Tenant isolation: graph edge belongs to "${edge.orgSlug}", not "${orgSlug}"`
    );
  }

  const weight = edge.weight ?? 0.5;

  return buildLearningEvent({
    orgSlug,
    type: weight >= 0.6 ? "PATTERN_REINFORCED" : "PATTERN_WEAKENED",
    source: "MEMORY_GRAPH",
    domain: "CROSS_MODULE",
    referenceId: edge.id,
    referenceType: "PATTERN",
    confidence: "MEDIUM",
    confidenceScore: weight,
    metadata: {
      graphEdgeSource: edge.sourceId,
      graphEdgeTarget: edge.targetId,
      relationshipType: edge.relationshipType,
    },
  });
}

export function buildGraphLearningEvents(
  orgSlug: string,
  nodes: GraphNodeRef[],
  edges: GraphEdgeRef[]
): LearningEvent[] {
  const nodeEvents = nodes
    .filter((n) => n.orgSlug === orgSlug)
    .map((n) => graphNodeToLearningEvent(orgSlug, n));

  const edgeEvents = edges
    .filter((e) => e.orgSlug === orgSlug)
    .map((e) => graphEdgeToLearningEvent(orgSlug, e));

  return [...nodeEvents, ...edgeEvents];
}
