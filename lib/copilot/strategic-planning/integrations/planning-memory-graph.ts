// AGENTIK-STRATEGIC-PLANNING-01 — Phase 19: Memory Graph Integration

import type { GraphNode, GraphEdge } from "../../memory-graph/memory-graph-types";
import type { StrategicDomain } from "../strategic-planning-types";

export interface PlanningGraphContext {
  readonly relevantNodeCount:    number;
  readonly insightNodeCount:     number;
  readonly playbookNodeCount:    number;
  readonly decisionNodeCount:    number;
  readonly relationshipCount:    number;
  readonly graphConfidenceBoost: number;
}

export function buildPlanningGraphContext(
  orgSlug: string,
  nodes:   GraphNode[],
  edges:   GraphEdge[]
): PlanningGraphContext {
  const scoped    = nodes.filter((n) => n.orgSlug === orgSlug);
  const insights  = scoped.filter((n) => n.type === "INSIGHT");
  const playbooks = scoped.filter((n) => n.type === "PLAYBOOK");
  const decisions = scoped.filter((n) => n.type === "DECISION");
  const rels      = edges.filter((e) => e.orgSlug === orgSlug);

  const boost = Math.min(0.10,
    Math.round((insights.length * 0.02 + decisions.length * 0.02) * 100) / 100
  );

  return {
    relevantNodeCount:    scoped.length,
    insightNodeCount:     insights.length,
    playbookNodeCount:    playbooks.length,
    decisionNodeCount:    decisions.length,
    relationshipCount:    rels.length,
    graphConfidenceBoost: boost,
  };
}

export function getRelevantInsightLabels(
  orgSlug: string,
  nodes:   GraphNode[],
  limit  = 4
): string[] {
  return nodes
    .filter((n) => n.orgSlug === orgSlug && n.type === "INSIGHT")
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((n) => n.label);
}

export function getRelatedDecisionLabels(
  orgSlug: string,
  nodes:   GraphNode[],
  limit  = 3
): string[] {
  return nodes
    .filter((n) => n.orgSlug === orgSlug && n.type === "DECISION")
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((n) => n.label);
}

export function getStrongRelationships(
  orgSlug:   string,
  edges:     GraphEdge[],
  threshold = 0.70
): GraphEdge[] {
  return edges
    .filter((e) => e.orgSlug === orgSlug && e.weight >= threshold)
    .sort((a, b) => b.weight - a.weight);
}
