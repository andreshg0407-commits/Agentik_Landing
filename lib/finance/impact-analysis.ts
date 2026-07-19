/**
 * lib/finance/impact-analysis.ts
 *
 * FASE 4 — Impact Analysis
 *
 * Given a financial node ID, computes the financial and operational
 * impact of that node's current health state.
 *
 * All deterministic. No AI inference. Uses real graph data only.
 *
 * Sprint: AGENTIK-FINANCIAL-RELATIONSHIP-GRAPH-01
 */

import type { FinancialRelationshipGraph, FinancialNode, FinancialNodeType } from "./relationship-graph";
import { findAffectedEntities, traceDownstream } from "./graph-traversal";

// ── Result types ───────────────────────────────────────────────────────────────

export type ImpactSeverity = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface NodeImpact {
  node:             FinancialNode;
  /** Monetary exposure if available (from node metadata) */
  monetaryExposure: number | null;
  /** Count of directly affected downstream nodes */
  directImpact:     number;
  /** Count of all affected nodes (transitive) */
  totalImpact:      number;
  severity:         ImpactSeverity;
  /** Node types that are downstream and affected */
  affectedTypes:    FinancialNodeType[];
  /** Operational areas impacted */
  operationalAreas: OperationalArea[];
  /** Human-readable impact statement */
  statement:        string;
}

export type OperationalArea =
  | "conciliacion"
  | "cobranza"
  | "tesoreria"
  | "cierre"
  | "planeacion"
  | "integridad";

// ── Node type → operational area ──────────────────────────────────────────────

const TYPE_TO_AREA: Partial<Record<FinancialNodeType, OperationalArea>> = {
  RECONCILIATION:  "conciliacion",
  BANK_MOVEMENT:   "conciliacion",
  RECEIVABLE:      "cobranza",
  PAYMENT:         "tesoreria",
  BUDGET:          "planeacion",
  CLOSE_BLOCKER:   "cierre",
  EXECUTION:       "planeacion",
  DIAN_DOCUMENT:   "cierre",
  RUNTIME_EVENT:   "integridad",
  CUSTOMER:        "cobranza",
  INVOICE:         "cobranza",
};

// ── Severity from counts ───────────────────────────────────────────────────────

function computeSeverity(
  node:       FinancialNode,
  totalNodes: number,
  exposure:   number | null,
): ImpactSeverity {
  if (node.health === "HEALTHY") return "NONE";

  // Critical conditions
  if (node.health === "CRITICAL")                           return "CRITICAL";
  if (node.type === "CLOSE_BLOCKER")                        return "CRITICAL";
  if (exposure !== null && exposure > 10_000_000)          return "CRITICAL";

  // High conditions
  if (totalNodes > 10)                                     return "HIGH";
  if (exposure !== null && exposure > 1_000_000)           return "HIGH";
  if (node.type === "BANK_MOVEMENT" && totalNodes > 5)     return "HIGH";

  // Medium conditions
  if (totalNodes > 3)                                      return "MEDIUM";
  if (exposure !== null && exposure > 100_000)             return "MEDIUM";

  // Low
  if (totalNodes > 0 || exposure !== null)                 return "LOW";

  return "NONE";
}

// ── Impact statement builder ───────────────────────────────────────────────────

function buildImpactStatement(
  node:     FinancialNode,
  impact:   number,
  exposure: number | null,
  areas:    OperationalArea[],
): string {
  const expStr = exposure !== null
    ? ` · $${exposure.toLocaleString("es-CO")} en exposición`
    : "";
  const areaStr = areas.length > 0
    ? ` · afecta: ${areas.join(", ")}`
    : "";

  if (impact === 0) {
    return `${node.label} sin impacto en cascada${expStr}`;
  }

  return `${node.label}${expStr} · ${impact} nodo${impact !== 1 ? "s" : ""} afectado${impact !== 1 ? "s" : ""}${areaStr}`;
}

// ── Main function ──────────────────────────────────────────────────────────────

export function analyzeFinancialImpact(
  graph:  FinancialRelationshipGraph,
  nodeId: string,
): NodeImpact | null {
  const node = graph.nodes.get(nodeId);
  if (!node) return null;

  const affected      = findAffectedEntities(graph, nodeId);
  const downstream    = traceDownstream(graph, nodeId);

  // Direct impact: nodes one hop away
  const directEdges   = graph.outgoing.get(nodeId) ?? [];
  const directIds     = new Set(directEdges.map(e => e.to));
  const directImpact  = directIds.size;
  const totalImpact   = affected.downstream.length;

  // Monetary exposure from node metadata
  const rawAmount = node.metadata?.amount ?? node.metadata?.balanceDue ?? null;
  const monetaryExposure = rawAmount !== null ? Number(rawAmount) : null;

  // Affected node types (downstream only)
  const affectedTypes = [...new Set(affected.downstream.map(n => n.type))];

  // Operational areas
  const areaSet = new Set<OperationalArea>();
  // Include origin node's own area
  const ownArea = TYPE_TO_AREA[node.type];
  if (ownArea) areaSet.add(ownArea);
  // Add downstream areas
  for (const dn of affected.downstream) {
    const area = TYPE_TO_AREA[dn.type];
    if (area) areaSet.add(area);
  }
  const operationalAreas = Array.from(areaSet);

  const severity = computeSeverity(node, totalImpact, monetaryExposure);

  return {
    node,
    monetaryExposure,
    directImpact,
    totalImpact,
    severity,
    affectedTypes,
    operationalAreas,
    statement: buildImpactStatement(node, totalImpact, monetaryExposure, operationalAreas),
  };
}

// ── Batch: top N highest impact nodes ─────────────────────────────────────────

export function findHighestImpactNodes(
  graph:  FinancialRelationshipGraph,
  topN:   number = 10,
): NodeImpact[] {
  const results: NodeImpact[] = [];

  for (const node of graph.nodes.values()) {
    if (node.health === "HEALTHY") continue;
    const impact = analyzeFinancialImpact(graph, node.id);
    if (impact && impact.severity !== "NONE") results.push(impact);
  }

  // Sort by totalImpact desc, then monetaryExposure desc
  results.sort((a, b) => {
    if (b.totalImpact !== a.totalImpact) return b.totalImpact - a.totalImpact;
    return (b.monetaryExposure ?? 0) - (a.monetaryExposure ?? 0);
  });

  return results.slice(0, topN);
}
