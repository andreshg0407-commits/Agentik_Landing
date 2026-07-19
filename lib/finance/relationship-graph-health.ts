/**
 * lib/finance/relationship-graph-health.ts
 *
 * FASE 7 — Relationship Graph Health Engine
 *
 * Computes a health summary over a FinancialRelationshipGraph.
 * Distinct from lib/finance/graph/ (document integrity graph health).
 * This is the CAUSAL relationship graph health.
 *
 * Used by: Diego causal intelligence, runtime event enrichment.
 *
 * Sprint: AGENTIK-FINANCIAL-RELATIONSHIP-GRAPH-01
 */

import type { FinancialRelationshipGraph, FinancialNode } from "./relationship-graph";
import { detectFinancialRootCauses }                      from "./root-cause-engine";
import { findHighestImpactNodes }                         from "./impact-analysis";

// ── Result types ───────────────────────────────────────────────────────────────

export type RelationshipGraphHealthLevel =
  | "HEALTHY"
  | "DEGRADED"
  | "CRITICAL"
  | "EMPTY";

export interface RelationshipGraphHealth {
  organizationId:    string;
  computedAt:        Date;
  level:             RelationshipGraphHealthLevel;
  totalNodes:        number;
  totalEdges:        number;
  healthyNodes:      number;
  warningNodes:      number;
  criticalNodes:     number;
  unresolvedNodes:   number;
  /** % of nodes that are healthy */
  healthRatio:       number;
  rootCauseCount:    number;
  cascadeCount:      number;
  highImpactCount:   number;
  /** Top-level operational message */
  headline:          string;
  /** Structured summary for Diego */
  diegoSummary:      string;
  /** Most affected operational areas */
  topAffectedAreas:  string[];
}

// ── Health level from ratio ────────────────────────────────────────────────────

function computeLevel(
  healthRatio:  number,
  criticalCount: number,
  rootCauseCount: number,
): RelationshipGraphHealthLevel {
  if (criticalCount > 0 || rootCauseCount > 5)  return "CRITICAL";
  if (healthRatio < 0.7 || rootCauseCount > 0)  return "DEGRADED";
  return "HEALTHY";
}

// ── Headline builder ───────────────────────────────────────────────────────────

function buildHeadline(
  level:         RelationshipGraphHealthLevel,
  rootCauses:    number,
  unresolved:    number,
  totalNodes:    number,
): string {
  if (totalNodes === 0) return "Grafo relacional sin datos";

  switch (level) {
    case "CRITICAL":
      return `${rootCauses} causa${rootCauses !== 1 ? "s" : ""} raíz crítica${rootCauses !== 1 ? "s" : ""} · ${unresolved} nodos sin resolver`;
    case "DEGRADED":
      return `Grafo degradado · ${unresolved} nodos sin resolver · ${rootCauses} causa${rootCauses !== 1 ? "s" : ""} raíz`;
    case "HEALTHY":
      return `Grafo relacional estable · ${totalNodes} nodos`;
    case "EMPTY":
    default:
      return "Grafo relacional vacío";
  }
}

// ── Main compute function ──────────────────────────────────────────────────────

export function computeRelationshipGraphHealth(
  graph: FinancialRelationshipGraph,
): RelationshipGraphHealth {
  const computedAt  = new Date();
  const totalNodes  = graph.nodes.size;
  const totalEdges  = graph.edges.length;

  if (totalNodes === 0) {
    return {
      organizationId:   graph.organizationId,
      computedAt,
      level:            "EMPTY",
      totalNodes:       0,
      totalEdges:       0,
      healthyNodes:     0,
      warningNodes:     0,
      criticalNodes:    0,
      unresolvedNodes:  0,
      healthRatio:      0,
      rootCauseCount:   0,
      cascadeCount:     0,
      highImpactCount:  0,
      headline:         "Grafo relacional vacío",
      diegoSummary:     "Sin datos relacionales disponibles",
      topAffectedAreas: [],
    };
  }

  // Count by health
  let healthy = 0, warning = 0, critical = 0, unresolved = 0;
  for (const node of graph.nodes.values()) {
    switch (node.health) {
      case "HEALTHY":   healthy++;   break;
      case "WARNING":   warning++;   break;
      case "CRITICAL":  critical++;  break;
      case "UNRESOLVED": unresolved++; break;
    }
  }

  const healthRatio = totalNodes > 0 ? healthy / totalNodes : 0;

  // Root cause analysis
  const rcAnalysis   = detectFinancialRootCauses(graph);
  const rootCauseCount  = rcAnalysis.rootCauses.length;
  const cascadeCount    = rcAnalysis.cascadeEffects.length;

  // High impact nodes
  const highImpactNodes = findHighestImpactNodes(graph, 5);
  const highImpactCount = highImpactNodes.filter(n =>
    n.severity === "HIGH" || n.severity === "CRITICAL"
  ).length;

  // Top affected areas from high-impact nodes
  const areaFreq = new Map<string, number>();
  for (const n of highImpactNodes) {
    for (const area of n.operationalAreas) {
      areaFreq.set(area, (areaFreq.get(area) ?? 0) + 1);
    }
  }
  const topAffectedAreas = [...areaFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([area]) => area);

  const level   = computeLevel(healthRatio, critical, rootCauseCount);
  const headline = buildHeadline(level, rootCauseCount, unresolved + critical, totalNodes);

  // Diego summary: operational causal language
  const diegoParts: string[] = [];
  if (rootCauseCount > 0) {
    diegoParts.push(`${rootCauseCount} causa${rootCauseCount !== 1 ? "s" : ""} raíz identificada${rootCauseCount !== 1 ? "s" : ""}`);
  }
  if (unresolved > 0) {
    diegoParts.push(`${unresolved} recaudo${unresolved !== 1 ? "s" : ""} sin aplicar`);
  }
  if (critical > 0) {
    diegoParts.push(`${critical} nodo${critical !== 1 ? "s" : ""} crítico${critical !== 1 ? "s" : ""}`);
  }
  if (cascadeCount > 0) {
    diegoParts.push(`${cascadeCount} efecto${cascadeCount !== 1 ? "s" : ""} en cascada`);
  }
  if (topAffectedAreas.length > 0) {
    diegoParts.push(`áreas: ${topAffectedAreas.join(", ")}`);
  }
  const diegoSummary = diegoParts.length > 0
    ? diegoParts.join(" · ")
    : `Grafo estable · ${totalNodes} nodos · ${Math.round(healthRatio * 100)}% saludables`;

  return {
    organizationId:   graph.organizationId,
    computedAt,
    level,
    totalNodes,
    totalEdges,
    healthyNodes:     healthy,
    warningNodes:     warning,
    criticalNodes:    critical,
    unresolvedNodes:  unresolved,
    healthRatio,
    rootCauseCount,
    cascadeCount,
    highImpactCount,
    headline,
    diegoSummary,
    topAffectedAreas,
  };
}
