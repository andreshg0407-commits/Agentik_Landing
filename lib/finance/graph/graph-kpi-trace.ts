/**
 * lib/finance/graph/graph-kpi-trace.ts
 *
 * AGENTIK-FINANCIAL-GRAPH-INTEGRATION-01 — FASE 7
 *
 * getKpiTrace(orgId, kpiKey) — enriched KPI trace with:
 *   - source model list
 *   - document + edge counts
 *   - integrity warnings affecting the KPI
 *   - data confidence (0–1)
 *   - last sync timestamp
 *   - status
 *
 * Supported KPI keys (8):
 *   recaudo_f1_hoy, recaudo_f2_hoy, consignaciones_pendientes,
 *   cartera_vencida, conciliacion_pendiente, cierre_score,
 *   saldos_bancarios, disponible_tesoreria
 */

import { buildFinancialGraph }   from "./graph-runtime";
import { buildFinancialTrace }   from "./graph-trace";
import { computeBankBalances }   from "../banking/banking-balances";
import type { KpiTraceId }       from "./graph-trace";
import type { FinancialIntegrityIssue, FinancialNode } from "./graph-types";

// ── Public types ──────────────────────────────────────────────────────────────

export type KpiTraceKey = KpiTraceId | "saldos_bancarios" | "disponible_tesoreria";

export interface KpiTraceResult {
  kpiKey:             KpiTraceKey;
  kpiLabel:           string;
  sourceModels:       string[];
  sourceViews:        string[];
  documentCount:      number;
  edgeCount:          number;
  integrityWarnings:  string[];
  lastSyncAt:         Date | null;
  confidence:         number;  // 0–1
  status:             "REAL" | "PARTIAL" | "STALE" | "MISSING";
}

// ── Metadata catalog ──────────────────────────────────────────────────────────

const KPI_META: Record<KpiTraceKey, { label: string; models: string[]; views: string[] }> = {
  recaudo_f1_hoy: {
    label:  "Recaudo F1 Hoy",
    models: ["SaleRecord"],
    views:  ["getCashKpis()", "Tesorería Operativa"],
  },
  recaudo_f2_hoy: {
    label:  "Recaudo F2 Hoy",
    models: ["SaleRecord"],
    views:  ["getCashKpis()", "Tesorería Operativa"],
  },
  consignaciones_pendientes: {
    label:  "Consignaciones Pendientes",
    models: ["CollectionRecord", "BankMovement"],
    views:  ["getCashKpis()", "Tesorería Operativa", "Conciliación"],
  },
  cartera_vencida: {
    label:  "Cartera Vencida",
    models: ["CustomerReceivable"],
    views:  ["getFpaCashFlow()", "Cierre Financiero", "Planeación"],
  },
  conciliacion_pendiente: {
    label:  "Conciliación Pendiente",
    models: ["CustomerReceivable", "CollectionRecord"],
    views:  ["getReconciliationSummary()", "Conciliación Inteligente"],
  },
  cierre_score: {
    label:  "Score de Cierre",
    models: ["FinancialDocument", "CustomerReceivable", "SaleRecord", "Budget"],
    views:  ["computeCloseScore()", "Cierre Financiero"],
  },
  saldos_bancarios: {
    label:  "Saldos Bancarios",
    models: ["BankAccount", "BankMovement"],
    views:  ["computeBankBalances()", "Tesorería Operativa"],
  },
  disponible_tesoreria: {
    label:  "Disponible Tesorería",
    models: ["BankAccount", "SaleRecord", "CollectionRecord"],
    views:  ["getCashKpis()", "computeBankBalances()", "Tesorería Operativa"],
  },
};

// ── Confidence computation ────────────────────────────────────────────────────

function computeConfidence(
  nodes:            FinancialNode[],
  issueCount:       number,
  hasBankData:      boolean,
  kpiKey:           KpiTraceKey,
): number {
  if (nodes.length === 0) return 0;

  let base = 0.8;

  // Penalty for integrity issues
  base -= Math.min(issueCount * 0.05, 0.3);

  // Banking KPIs require bank data
  if ((kpiKey === "saldos_bancarios" || kpiKey === "disponible_tesoreria") && !hasBankData) {
    return 0.1;
  }

  // Penalty for unresolved nodes
  const unresolvedRatio = nodes.filter((n) => n.status === "UNRESOLVED" || n.status === "ORPHAN").length / nodes.length;
  base -= unresolvedRatio * 0.2;

  return Math.max(0, Math.min(1, base));
}

function computeStatus(confidence: number, nodeCount: number): "REAL" | "PARTIAL" | "STALE" | "MISSING" {
  if (nodeCount === 0) return "MISSING";
  if (confidence >= 0.7) return "REAL";
  if (confidence >= 0.4) return "PARTIAL";
  return "STALE";
}

// ── Banking KPI traces (no graph equivalent) ──────────────────────────────────

async function traceSaldosBancarios(orgId: string): Promise<KpiTraceResult> {
  const balances     = await computeBankBalances(orgId).catch(() => null);
  const hasRealData  = balances?.hasRealData ?? false;
  const accountCount = balances?.accounts.length ?? 0;

  return {
    kpiKey:            "saldos_bancarios",
    kpiLabel:          "Saldos Bancarios",
    sourceModels:      ["BankAccount", "BankMovement"],
    sourceViews:       ["computeBankBalances()", "Tesorería Operativa"],
    documentCount:     accountCount,
    edgeCount:         0,
    integrityWarnings: hasRealData ? [] : ["BankAccount sin configurar — saldos no disponibles"],
    lastSyncAt:        balances?.accounts.reduce<Date | null>((best, a) => {
      if (!a.lastSyncAt) return best;
      if (!best) return a.lastSyncAt;
      return a.lastSyncAt > best ? a.lastSyncAt : best;
    }, null) ?? null,
    confidence:        hasRealData ? 0.85 : 0.05,
    status:            hasRealData ? "REAL" : "MISSING",
  };
}

async function traceDisponibleTesoreria(orgId: string): Promise<KpiTraceResult> {
  const balances = await computeBankBalances(orgId).catch(() => null);
  const hasBank  = balances?.hasRealData ?? false;

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 30);
  const graph = await buildFinancialGraph({
    orgId,
    fromDate,
    include: { saleRecords: true, collectionRecords: true, receivables: false, documents: false },
    skipIntegrity: true,
  });

  const cashNodes = graph.nodes.filter((n) =>
    n.sourceSystem === "SAG" && (n.docType === "RECIBO_CAJA" || n.docType === "ANTICIPO"),
  );

  const confidence = hasBank ? 0.80 : 0.45; // bank data required for full confidence

  return {
    kpiKey:            "disponible_tesoreria",
    kpiLabel:          "Disponible Tesorería",
    sourceModels:      ["BankAccount", "SaleRecord", "CollectionRecord"],
    sourceViews:       ["getCashKpis()", "computeBankBalances()", "Tesorería Operativa"],
    documentCount:     cashNodes.length + (balances?.accounts.length ?? 0),
    edgeCount:         graph.edges.length,
    integrityWarnings: hasBank ? [] : ["BankAccount pendiente — disponible estimado solo desde SAG"],
    lastSyncAt:        cashNodes.reduce<Date | null>((best, n) => {
      if (!best) return n.date;
      return n.date > best ? n.date : best;
    }, null),
    confidence,
    status:   confidence >= 0.7 ? "REAL" : "PARTIAL",
  };
}

// ── Main graph-based KPI trace ────────────────────────────────────────────────

async function traceFromGraph(
  orgId:  string,
  kpiKey: KpiTraceId,
): Promise<KpiTraceResult> {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 90);

  const graph = await buildFinancialGraph({
    orgId,
    fromDate,
    include: { saleRecords: true, collectionRecords: true, receivables: true, documents: true },
    skipIntegrity: false,
  });

  const trace        = buildFinancialTrace(kpiKey, orgId, graph.nodes);
  const hasBankData  = graph.nodes.some((n) => n.sourceSystem === "BANK");
  const relatedIssues = graph.integrityIssues.filter((issue) =>
    issue.nodeIds.some((nid) => trace.sourceNodes.some((n) => n.id === nid)),
  );

  // Edge count: edges that involve any source node
  const sourceNodeIds = new Set(trace.sourceNodes.map((n) => n.id));
  const relatedEdges  = graph.edges.filter(
    (e) => sourceNodeIds.has(e.fromNodeId) || sourceNodeIds.has(e.toNodeId),
  );

  const lastSyncAt = trace.sourceNodes.reduce<Date | null>((best, n) => {
    if (!best) return n.date;
    return n.date > best ? n.date : best;
  }, null);

  const meta       = KPI_META[kpiKey];
  const confidence = computeConfidence(trace.sourceNodes, relatedIssues.length, hasBankData, kpiKey);

  return {
    kpiKey,
    kpiLabel:          trace.kpiLabel,
    sourceModels:      meta.models,
    sourceViews:       meta.views,
    documentCount:     trace.sourceNodes.length,
    edgeCount:         relatedEdges.length,
    integrityWarnings: [
      ...trace.blockers,
      ...relatedIssues.map((i) => i.message),
    ],
    lastSyncAt,
    confidence,
    status:            computeStatus(confidence, trace.sourceNodes.length),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get enriched KPI trace for a single KPI key.
 * Answers: "Can I trust this number? Where does it come from?"
 */
export async function getKpiTrace(
  orgId:  string,
  kpiKey: KpiTraceKey,
): Promise<KpiTraceResult> {
  if (kpiKey === "saldos_bancarios") {
    return traceSaldosBancarios(orgId);
  }
  if (kpiKey === "disponible_tesoreria") {
    return traceDisponibleTesoreria(orgId);
  }
  return traceFromGraph(orgId, kpiKey);
}

/**
 * Get all KPI traces for an org (batch version).
 * Used by snapshot and executive context.
 */
export async function getAllKpiTraces(
  orgId:   string,
  keys?:   KpiTraceKey[],
): Promise<Partial<Record<KpiTraceKey, KpiTraceResult>>> {
  const allKeys: KpiTraceKey[] = keys ?? [
    "recaudo_f1_hoy",
    "recaudo_f2_hoy",
    "consignaciones_pendientes",
    "cartera_vencida",
    "conciliacion_pendiente",
    "cierre_score",
    "saldos_bancarios",
    "disponible_tesoreria",
  ];

  const results = await Promise.allSettled(
    allKeys.map((k) => getKpiTrace(orgId, k)),
  );

  const out: Partial<Record<KpiTraceKey, KpiTraceResult>> = {};
  for (let i = 0; i < allKeys.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      out[allKeys[i]] = r.value;
    }
  }
  return out;
}
