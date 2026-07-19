/**
 * lib/finance/root-cause-engine.ts
 *
 * FASE 3 — Root Cause Engine
 *
 * Detects root causes of financial issues using the relationship graph
 * and traversal engine. Deterministic — no AI inference, no heuristics
 * beyond structural graph analysis.
 *
 * A "root cause" is a node that:
 *   1. Has CRITICAL or UNRESOLVED health, AND
 *   2. Has no upstream nodes that are also CRITICAL/UNRESOLVED
 *      (i.e., it is not a downstream effect of another broken node)
 *
 * Sprint: AGENTIK-FINANCIAL-RELATIONSHIP-GRAPH-01
 */

import type { FinancialRelationshipGraph, FinancialNode } from "./relationship-graph";
import {
  traceUpstream,
  findUnresolvedPropagation,
  getAllUnresolvedNodes,
  type UnresolvedPropagation,
} from "./graph-traversal";

// ── Result types ───────────────────────────────────────────────────────────────

export type RootCauseCategory =
  | "UNCROSSED_PAYMENT"      // Payment with no matching receivable
  | "UNMATCHED_BANK_MOVEMENT" // Bank movement with no reconciliation
  | "OVERDUE_RECEIVABLE"      // Receivable >60 days overdue
  | "BROKEN_ALLOCATION"       // Allocation references missing nodes
  | "ORPHANED_NODE"           // Node with no upstream and no downstream
  | "CASCADE_BREAK";          // Node broken because upstream is broken

export interface RootCause {
  id:           string;
  node:         FinancialNode;
  category:     RootCauseCategory;
  /** Human-readable explanation of why this is a root cause */
  explanation:  string;
  /** Downstream nodes impacted by this root cause */
  propagation:  UnresolvedPropagation | null;
  /** Number of downstream nodes affected */
  impactCount:  number;
  /** Severity: primary = root cause; secondary = downstream effect */
  role:         "primary" | "secondary";
}

export interface RootCauseAnalysis {
  organizationId: string;
  analyzedAt:     Date;
  rootCauses:     RootCause[];
  /** Total number of unresolved/critical nodes in graph */
  totalUnresolved: number;
  /** Nodes that are effects (downstream of a root cause), not root causes */
  cascadeEffects:  FinancialNode[];
  summary:         string;
}

// ── Category detector ──────────────────────────────────────────────────────────

function categorizeRootCause(
  node: FinancialRelationshipGraph["nodes"] extends Map<string, infer T> ? T : never,
  graph: FinancialRelationshipGraph,
): RootCauseCategory {
  const hasOutgoing = (graph.outgoing.get(node.id) ?? []).length > 0;
  const hasIncoming = (graph.incoming.get(node.id) ?? []).length > 0;

  if (!hasOutgoing && !hasIncoming) return "ORPHANED_NODE";

  if (node.type === "PAYMENT" && node.health === "UNRESOLVED") {
    return "UNCROSSED_PAYMENT";
  }

  if (node.type === "BANK_MOVEMENT" && node.health === "UNRESOLVED") {
    return "UNMATCHED_BANK_MOVEMENT";
  }

  if (node.type === "RECEIVABLE" && node.health === "CRITICAL") {
    return "OVERDUE_RECEIVABLE";
  }

  return "BROKEN_ALLOCATION";
}

// ── Explanation builder ────────────────────────────────────────────────────────

function buildExplanation(node: FinancialNode, category: RootCauseCategory): string {
  const amount = node.metadata?.amount
    ? ` de $${Number(node.metadata.amount).toLocaleString("es-CO")}`
    : "";

  switch (category) {
    case "UNCROSSED_PAYMENT":
      return `Recaudo${amount} sin aplicar a ninguna cuenta por cobrar`;
    case "UNMATCHED_BANK_MOVEMENT":
      return `Movimiento bancario${amount} sin correspondencia en sistema`;
    case "OVERDUE_RECEIVABLE": {
      const days = node.metadata?.daysOverdue;
      return `CxC${amount} con ${days ?? "más de 60"} días de vencimiento`;
    }
    case "ORPHANED_NODE":
      return `Nodo aislado sin relaciones — posible registro huérfano`;
    case "CASCADE_BREAK":
      return `Nodo afectado por ruptura en nodo origen`;
    case "BROKEN_ALLOCATION":
    default:
      return `Inconsistencia en relaciones financieras del nodo`;
  }
}

// ── Main engine ────────────────────────────────────────────────────────────────

export function detectFinancialRootCauses(
  graph: FinancialRelationshipGraph,
): RootCauseAnalysis {
  const analyzedAt    = new Date();
  const allUnresolved = getAllUnresolvedNodes(graph);

  if (allUnresolved.length === 0) {
    return {
      organizationId: graph.organizationId,
      analyzedAt,
      rootCauses:      [],
      totalUnresolved: 0,
      cascadeEffects:  [],
      summary:         "Sin causas raíz detectadas — grafo financiero estable",
    };
  }

  // For each unresolved node: check if any upstream is also unresolved.
  // If yes → cascade effect (secondary). If no → root cause (primary).
  const cascadeIds = new Set<string>();
  const rootCauses: RootCause[] = [];

  for (const node of allUnresolved) {
    const upstream = traceUpstream(graph, node.id);

    // Check if any upstream node is also unresolved/critical
    const hasUnresolvedAncestor = upstream.nodeIds.some(id => {
      const n = graph.nodes.get(id);
      return n && (n.health === "UNRESOLVED" || n.health === "CRITICAL");
    });

    if (hasUnresolvedAncestor) {
      cascadeIds.add(node.id);
      continue;
    }

    // This is a primary root cause
    const propagation = findUnresolvedPropagation(graph, node.id);
    const category    = categorizeRootCause(node, graph);

    rootCauses.push({
      id:          `rc:${node.id}`,
      node,
      category,
      explanation:  buildExplanation(node, category),
      propagation,
      impactCount:  propagation?.totalImpactCount ?? 0,
      role:         "primary",
    });
  }

  // Sort by impact count descending — highest impact first
  rootCauses.sort((a, b) => b.impactCount - a.impactCount);

  const cascadeEffects: FinancialNode[] = [];
  for (const id of cascadeIds) {
    const n = graph.nodes.get(id);
    if (n) cascadeEffects.push(n);
  }

  // Summary
  const primaryCount = rootCauses.length;
  const categories   = [...new Set(rootCauses.map(r => r.category))];
  const summary =
    primaryCount === 0
      ? "Sin causas raíz primarias — todos los problemas son efectos en cascada"
      : primaryCount === 1
        ? `1 causa raíz: ${buildExplanation(rootCauses[0].node, rootCauses[0].category)}`
        : `${primaryCount} causas raíz · tipos: ${categories.map(c => c.toLowerCase().replace(/_/g, " ")).join(", ")}`;

  return {
    organizationId: graph.organizationId,
    analyzedAt,
    rootCauses,
    totalUnresolved: allUnresolved.length,
    cascadeEffects,
    summary,
  };
}
