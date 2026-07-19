/**
 * lib/finance/graph/graph-snapshot.ts
 *
 * AGENTIK-FINANCIAL-GRAPH-INTEGRATION-01 — FASE 1
 *
 * getFinancialGraphSnapshot(orgId) — single read entry point for the entire
 * Financial Graph state. Wraps buildFinancialGraph() and augments with:
 *   - computed summary
 *   - KPI traces for all 6 supported IDs
 *   - banking health
 *   - unresolved relation catalog
 *   - per-source status
 *
 * All results are org-scoped. No cross-tenant reads possible.
 */

import { buildFinancialGraph }      from "./graph-runtime";
import { buildFinancialTrace }       from "./graph-trace";
import { computeBankBalances }       from "../banking/banking-balances";
import { computeBankingHealth }      from "../banking/banking-status";
import type {
  FinancialGraph,
  FinancialIntegrityIssue,
  FinancialTrace,
  FinancialNode,
} from "./graph-types";
import type { KpiTraceId }           from "./graph-trace";
import type { BankingHealthSummary } from "../banking/banking-status";

// ── Public types ──────────────────────────────────────────────────────────────

export interface FinancialGraphSummary {
  totalNodes:               number;
  totalEdges:               number;
  unresolvedNodes:          number;
  orphanNodes:              number;
  invalidNodes:             number;
  syncPendingNodes:         number;
  bankLinkedMovements:      number;   // BANK-source nodes with outEdges
  bankUnmatchedMovements:   number;   // BANK-source nodes with no edges
  collectionLinkedRecords:  number;   // SAG CollectionRecord nodes with edges
  receivableLinkedRecords:  number;   // PYA CustomerReceivable nodes with edges
  traceableKpis:            KpiTraceId[];
}

export type SourceHealthStatus = "REAL" | "PARTIAL" | "STALE" | "MISSING";

export interface FinancialSourceStatus {
  source:    string;
  status:    SourceHealthStatus;
  nodeCount: number;
  note:      string;
}

export interface FinancialGraphSnapshot {
  orgId:               string;
  builtAt:             Date;
  /** Full graph with nodes, edges, and raw stats. */
  graph:               FinancialGraph & { integrityIssues: FinancialIntegrityIssue[]; violationCount: number };
  /** Computed high-level summary. */
  summary:             FinancialGraphSummary;
  /** Flat integrity issue list (convenience alias for graph.integrityIssues). */
  integrityIssues:     FinancialIntegrityIssue[];
  /** KPI traces keyed by trace ID. */
  traces:              Partial<Record<KpiTraceId, FinancialTrace>>;
  /** Banking health summary. */
  bankingStatus:       BankingHealthSummary;
  /** Edge types that cannot be resolved yet (missing models). */
  unresolvedRelations: string[];
  /** Per-source health status. */
  sourceStatus:        FinancialSourceStatus[];
  /** Whether any critical integrity issues exist. */
  hasCriticalIssues:   boolean;
  /** Count of tenant isolation violations detected. */
  violationCount:      number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Relations that require models not yet implemented. */
const UNRESOLVED_RELATIONS = [
  "POS_TO_PAYMENT_METHOD — POS terminal model pending",
  "OBLIGATION_TO_EGRESO  — Obligation model pending",
  "DIAN_VALIDATION_TO_FACTURA — DIAN API not integrated",
];

const ALL_KPI_TRACE_IDS: KpiTraceId[] = [
  "recaudo_f1_hoy",
  "recaudo_f2_hoy",
  "consignaciones_pendientes",
  "cartera_vencida",
  "conciliacion_pendiente",
  "cierre_score",
];

// ── Summary builder ───────────────────────────────────────────────────────────

function buildSummary(
  nodes: FinancialNode[],
  edgeCount: number,
  stats: FinancialGraph["stats"],
  traces: Partial<Record<KpiTraceId, FinancialTrace>>,
): FinancialGraphSummary {
  const bankNodes      = nodes.filter((n) => n.sourceSystem === "BANK");
  const sagCollection  = nodes.filter((n) => n.sourceSystem === "SAG" && (n.docType === "RECIBO_CAJA" || n.docType === "CONSIGNACION" || n.docType === "ANTICIPO"));
  const pyaReceivable  = nodes.filter((n) => n.sourceSystem === "PYA");

  return {
    totalNodes:              nodes.length,
    totalEdges:              edgeCount,
    unresolvedNodes:         stats.unresolvedCount,
    orphanNodes:             stats.orphanCount,
    invalidNodes:            stats.byStatus?.INVALID ?? 0,
    syncPendingNodes:        stats.syncPendingCount,
    bankLinkedMovements:     bankNodes.filter((n) => n.outEdgeIds.length > 0 || n.inEdgeIds.length > 0).length,
    bankUnmatchedMovements:  bankNodes.filter((n) => n.outEdgeIds.length === 0 && n.inEdgeIds.length === 0).length,
    collectionLinkedRecords: sagCollection.filter((n) => n.outEdgeIds.length > 0 || n.inEdgeIds.length > 0).length,
    receivableLinkedRecords: pyaReceivable.filter((n) => n.inEdgeIds.length > 0).length,
    traceableKpis:           ALL_KPI_TRACE_IDS.filter((k) => (traces[k]?.sourceNodes.length ?? 0) > 0),
  };
}

// ── Source status builder ─────────────────────────────────────────────────────

function buildSourceStatus(nodes: FinancialNode[]): FinancialSourceStatus[] {
  const sagNodes  = nodes.filter((n) => n.sourceSystem === "SAG");
  const pyaNodes  = nodes.filter((n) => n.sourceSystem === "PYA");
  const dianNodes = nodes.filter((n) => n.sourceSystem === "DIAN");
  const bankNodes = nodes.filter((n) => n.sourceSystem === "BANK");

  const result: FinancialSourceStatus[] = [
    {
      source:    "SAG",
      status:    sagNodes.length > 0 ? "REAL" : "MISSING",
      nodeCount: sagNodes.length,
      note:      sagNodes.length > 0
        ? `${sagNodes.length} registros SAG en el grafo`
        : "Sin registros SAG en el período solicitado",
    },
    {
      source:    "PYA · CustomerReceivable",
      status:    pyaNodes.length > 0 ? "REAL" : "MISSING",
      nodeCount: pyaNodes.length,
      note:      pyaNodes.length > 0
        ? `${pyaNodes.length} cuentas por cobrar activas`
        : "Sin cartera activa en el período",
    },
    {
      source:    "DIAN",
      status:    dianNodes.length > 0 ? "PARTIAL" : "MISSING",
      nodeCount: dianNodes.length,
      note:      dianNodes.length > 0
        ? `${dianNodes.length} documentos DIAN — validación directa pendiente`
        : "Sin documentos DIAN cargados",
    },
    {
      source:    "BankAccount",
      status:    bankNodes.length > 0 ? "PARTIAL" : "MISSING",
      nodeCount: bankNodes.length,
      note:      bankNodes.length > 0
        ? `${bankNodes.length} movimientos bancarios (sin confirmación directa)`
        : "Sin cuenta bancaria configurada — integración pendiente",
    },
  ];

  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

const DEFAULT_WINDOW_DAYS = 90;

/**
 * Build the full Financial Graph Snapshot for an organization.
 *
 * This is the single source of financial truth for all Agentik modules.
 * Every KPI, every integrity check, every trace originates here.
 *
 * Multi-tenant: orgId is enforced at every layer (graph-runtime + banking).
 */
export async function getFinancialGraphSnapshot(
  orgId: string,
): Promise<FinancialGraphSnapshot> {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - DEFAULT_WINDOW_DAYS);

  // Phase 1: build graph (nodes + edges + integrity + stats)
  const graph = await buildFinancialGraph({
    orgId,
    fromDate,
    include: { saleRecords: true, collectionRecords: true, receivables: true, documents: true },
    skipIntegrity: false,
  });

  // Phase 2: build KPI traces against the graph nodes
  const traces: Partial<Record<KpiTraceId, FinancialTrace>> = {};
  for (const kpiId of ALL_KPI_TRACE_IDS) {
    traces[kpiId] = buildFinancialTrace(kpiId, orgId, graph.nodes);
  }

  // Phase 3: banking status (separate runtime — does not duplicate graph queries)
  const bankBalances  = await computeBankBalances(orgId).catch(() => null);
  const bankingStatus = computeBankingHealth(bankBalances);

  // Phase 4: derived summary
  const summary = buildSummary(graph.nodes, graph.edges.length, graph.stats, traces);

  // Phase 5: source status
  const sourceStatus = buildSourceStatus(graph.nodes);

  const hasCriticalIssues = graph.integrityIssues.some((i) => i.severity === "critical");

  // Tenant isolation warning
  if (graph.violationCount > 0) {
    console.error(
      `FINANCIAL_GRAPH_TENANT_ISOLATION_WARNING: ${graph.violationCount} node(s) from wrong orgId filtered for org ${orgId}`,
    );
  }

  return {
    orgId,
    builtAt:             graph.builtAt,
    graph,
    summary,
    integrityIssues:     graph.integrityIssues,
    traces,
    bankingStatus,
    unresolvedRelations: UNRESOLVED_RELATIONS,
    sourceStatus,
    hasCriticalIssues,
    violationCount:      graph.violationCount,
  };
}

/**
 * Lightweight graph health for Torre de Control and executive views.
 * Skips KPI traces and banking — faster than full snapshot.
 */
export async function getGraphHealthSummary(orgId: string): Promise<{
  orgId:            string;
  builtAt:          Date;
  totalNodes:       number;
  totalEdges:       number;
  unresolvedCount:  number;
  orphanCount:      number;
  criticalIssues:   number;
  warningIssues:    number;
  sourceStatus:     FinancialSourceStatus[];
  hasCriticalIssues: boolean;
  violationCount:   number;
}> {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - DEFAULT_WINDOW_DAYS);

  const graph = await buildFinancialGraph({
    orgId,
    fromDate,
    include: { saleRecords: true, collectionRecords: true, receivables: true, documents: false },
    skipIntegrity: false,
  });

  const criticalIssues = graph.integrityIssues.filter((i) => i.severity === "critical").length;
  const warningIssues  = graph.integrityIssues.filter((i) => i.severity === "warning").length;
  const sourceStatus   = buildSourceStatus(graph.nodes);

  if (graph.violationCount > 0) {
    console.error(
      `FINANCIAL_GRAPH_TENANT_ISOLATION_WARNING: ${graph.violationCount} node(s) from wrong orgId filtered for org ${orgId}`,
    );
  }

  return {
    orgId,
    builtAt:           graph.builtAt,
    totalNodes:        graph.stats.totalNodes,
    totalEdges:        graph.stats.totalEdges,
    unresolvedCount:   graph.stats.unresolvedCount,
    orphanCount:       graph.stats.orphanCount,
    criticalIssues,
    warningIssues,
    sourceStatus,
    hasCriticalIssues: criticalIssues > 0,
    violationCount:    graph.violationCount,
  };
}

/**
 * Extract real graph-derived blockers for Cierre Financiero.
 * These are critical/warning integrity issues translated to human-readable strings.
 */
export function extractGraphBlockers(
  integrityIssues: FinancialIntegrityIssue[],
): string[] {
  return integrityIssues
    .filter((i) => i.severity === "critical" || i.severity === "warning")
    .map((i) => i.message);
}
