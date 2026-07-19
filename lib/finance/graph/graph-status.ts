/**
 * lib/finance/graph/graph-status.ts
 *
 * AGENTIK-FINANCIAL-GRAPH-01 — Node/edge status helpers.
 *
 * Provides:
 * - Status computation rules
 * - Status aggregation across node sets
 * - Status display metadata
 */

import type { NodeResolutionStatus, FinancialNode, FinancialEdge } from "./graph-types";

// ─────────────────────────────────────────────────────────────────────────────
// STATUS DISPLAY METADATA
// ─────────────────────────────────────────────────────────────────────────────

export interface StatusMeta {
  label:       string;
  description: string;
  severity:    "ok" | "warning" | "critical" | "pending" | "neutral";
}

export const STATUS_META: Record<NodeResolutionStatus, StatusMeta> = {
  REAL: {
    label:       "REAL",
    description: "Dato verificado desde fuente autoritativa.",
    severity:    "ok",
  },
  PARTIAL: {
    label:       "PARCIAL",
    description: "Dato presente pero incompleto — falta monto, NIT o contrapartida.",
    severity:    "warning",
  },
  UNRESOLVED: {
    label:       "NO RESUELTO",
    description: "No se pudo establecer la relación esperada.",
    severity:    "warning",
  },
  ORPHAN: {
    label:       "HUÉRFANO",
    description: "Existe en un sistema sin contrapartida en ningún otro.",
    severity:    "critical",
  },
  INVALID: {
    label:       "INVÁLIDO",
    description: "Contradicción de datos detectada (duplicado, negativo, desviación).",
    severity:    "critical",
  },
  SYNC_PENDING: {
    label:       "PENDIENTE SYNC",
    description: "Esperando sincronización externa (banco, DIAN, etc.).",
    severity:    "pending",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STATUS COMPUTATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive node resolution status from its data completeness.
 * Used by builders when creating nodes from partial data.
 */
export function computeNodeStatus(opts: {
  hasAmount:     boolean;
  hasDate:       boolean;
  hasEntityId:   boolean;
  hasReference:  boolean;
  isBankRelated: boolean;
}): NodeResolutionStatus {
  if (opts.isBankRelated) return "SYNC_PENDING";
  if (!opts.hasAmount || !opts.hasDate) return "PARTIAL";
  if (!opts.hasEntityId && !opts.hasReference) return "PARTIAL";
  return "REAL";
}

/**
 * Derive edge status from the match quality.
 */
export function computeEdgeStatus(confidence: number, matchFieldCount: number): NodeResolutionStatus {
  if (confidence >= 0.9 && matchFieldCount >= 2) return "REAL";
  if (confidence >= 0.6 && matchFieldCount >= 1) return "PARTIAL";
  if (confidence > 0)                             return "UNRESOLVED";
  return "UNRESOLVED";
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS AGGREGATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute status counts across a set of nodes.
 */
export function aggregateNodeStatus(
  nodes: FinancialNode[],
): Record<NodeResolutionStatus, number> {
  const counts: Record<NodeResolutionStatus, number> = {
    REAL:         0,
    PARTIAL:      0,
    UNRESOLVED:   0,
    ORPHAN:       0,
    INVALID:      0,
    SYNC_PENDING: 0,
  };
  for (const n of nodes) {
    counts[n.status]++;
  }
  return counts;
}

/**
 * Compute status counts across a set of edges.
 */
export function aggregateEdgeStatus(
  edges: FinancialEdge[],
): Record<NodeResolutionStatus, number> {
  const counts: Record<NodeResolutionStatus, number> = {
    REAL:         0,
    PARTIAL:      0,
    UNRESOLVED:   0,
    ORPHAN:       0,
    INVALID:      0,
    SYNC_PENDING: 0,
  };
  for (const e of edges) {
    counts[e.status]++;
  }
  return counts;
}

/**
 * Overall graph health: % of REAL nodes out of all non-SYNC_PENDING nodes.
 */
export function computeGraphHealth(nodes: FinancialNode[]): number {
  const eligible = nodes.filter(n => n.status !== "SYNC_PENDING");
  if (eligible.length === 0) return 0;
  const real = eligible.filter(n => n.status === "REAL").length;
  return Math.round((real / eligible.length) * 100);
}
