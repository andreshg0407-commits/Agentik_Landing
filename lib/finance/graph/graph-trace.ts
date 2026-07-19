/**
 * lib/finance/graph/graph-trace.ts
 *
 * AGENTIK-FINANCIAL-GRAPH-01 — Traceability Engine.
 *
 * buildFinancialTrace() answers:
 *   "Where did this KPI number come from?"
 *   "Which documents built this value?"
 *   "What runtime computed it?"
 *   "What relations affect it?"
 *
 * Supports the following KPI trace IDs:
 *   - "recaudo_f1_hoy"        → SaleRecord R1/A1/AN today
 *   - "recaudo_f2_hoy"        → SaleRecord R2/A2 today
 *   - "anticipos_por_aplicar" → SaleRecord A1/A2/AN
 *   - "consignaciones_pendientes" → CollectionRecord with bankReference
 *   - "conciliacion_pendiente" → CustomerReceivable OPEN + CollectionRecord
 *   - "tesoreria_disponible"  → CashKpis aggregate today
 *   - "cartera_vencida"       → CustomerReceivable overdue
 *   - "cierre_score"          → computeCloseScore inputs
 */

import type { FinancialNode, FinancialTrace, FinancialTraceStep } from "./graph-types";

// ─────────────────────────────────────────────────────────────────────────────
// TRACE STEP BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

function step(
  layer:   string,
  label:   string,
  runtime: string,
  nodes:   FinancialNode[],
): FinancialTraceStep {
  return {
    layer,
    label,
    nodeIds: nodes.map(n => n.id),
    runtime,
    hasData: nodes.length > 0,
  };
}

function noDataStep(
  layer:   string,
  label:   string,
  runtime: string,
): FinancialTraceStep {
  return { layer, label, nodeIds: [], runtime, hasData: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI TRACE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

const TOMORROW = new Date(TODAY.getTime() + 24 * 60 * 60 * 1000);

/**
 * Trace for "recaudo_f1_hoy":
 * getCashKpis() → SaleRecord[R1, A1, AN] where saleDate = today
 */
function traceRecaudoF1Hoy(orgId: string, nodes: FinancialNode[]): FinancialTrace {
  const F1_CODES = new Set(["R1", "A1", "AN"]);
  const f1Today = nodes.filter(n =>
    n.sourceSystem === "SAG" &&
    (n.docType === "RECIBO_CAJA" || n.docType === "ANTICIPO") &&
    F1_CODES.has((n.metadata.comprobanteCode as string) ?? "") &&
    n.date >= TODAY && n.date < TOMORROW,
  );

  return {
    kpiId:    "recaudo_f1_hoy",
    kpiLabel: "Recaudo F1 Hoy",
    orgId,
    builtAt:  new Date(),
    chain: [
      step("Tesorería — KPI Surface", "getCashKpis() → cajaRecibidaHoy + recaudoF1Hoy", "getCashKpis(organizationId)", f1Today),
      step("SAG · SaleRecord",        "Comprobantes R1, A1, AN con saleDate = hoy",      "prisma.saleRecord.aggregate()", f1Today),
      noDataStep("SAG · v_pagosnew",  "Fuente original de recibos (no consultada directamente)", "—"),
    ],
    sourceNodes: f1Today,
    blockers:    f1Today.length === 0 ? ["Sin registros R1/A1/AN para hoy en SaleRecord"] : [],
  };
}

/**
 * Trace for "recaudo_f2_hoy":
 * getCashKpis() → SaleRecord[R2, A2] where saleDate = today
 */
function traceRecaudoF2Hoy(orgId: string, nodes: FinancialNode[]): FinancialTrace {
  const F2_CODES = new Set(["R2", "A2"]);
  const f2Today = nodes.filter(n =>
    n.sourceSystem === "SAG" &&
    (n.docType === "RECIBO_CAJA" || n.docType === "ANTICIPO") &&
    F2_CODES.has((n.metadata.comprobanteCode as string) ?? "") &&
    n.date >= TODAY && n.date < TOMORROW,
  );

  return {
    kpiId:    "recaudo_f2_hoy",
    kpiLabel: "Recaudo F2 Hoy",
    orgId,
    builtAt:  new Date(),
    chain: [
      step("Tesorería — KPI Surface", "getCashKpis() → recaudoF2Hoy", "getCashKpis(organizationId)", f2Today),
      step("SAG · SaleRecord",        "Comprobantes R2, A2 con saleDate = hoy",           "prisma.saleRecord.aggregate()", f2Today),
    ],
    sourceNodes: f2Today,
    blockers:    f2Today.length === 0 ? ["Sin registros R2/A2 para hoy en SaleRecord"] : [],
  };
}

/**
 * Trace for "consignaciones_pendientes":
 * getCashKpis() → CollectionRecord with bankReference and AVAILABLE status
 */
function traceConsignacionesPendientes(orgId: string, nodes: FinancialNode[]): FinancialTrace {
  const consig = nodes.filter(n =>
    n.sourceSystem === "SAG" &&
    n.docType === "CONSIGNACION" &&
    n.metadata.appliedStatus === "AVAILABLE",
  );
  const bankPending = nodes.filter(n =>
    n.sourceSystem === "BANK" && n.docType === "CONSIGNACION",
  );

  return {
    kpiId:    "consignaciones_pendientes",
    kpiLabel: "Consignaciones Pendientes",
    orgId,
    builtAt:  new Date(),
    chain: [
      step("Tesorería — KPI Surface", "getCashKpis() → consignacionesPendientes", "getCashKpis(organizationId)", consig),
      step("SAG · CollectionRecord",  "Registros con bankReference ≠ null y AVAILABLE", "prisma.collectionRecord.findMany()", consig),
      { layer: "Banco", label: "Confirmación bancaria directa pendiente (BankAccount no integrado)", nodeIds: bankPending.map(n => n.id), runtime: "resolveBankNodes()", hasData: false },
    ],
    sourceNodes: [...consig, ...bankPending],
    blockers:    [
      ...(consig.length === 0 ? ["Sin consignaciones con bankReference en CollectionRecord"] : []),
      "BankAccount model no integrado — confirmación bancaria directa no disponible",
    ],
  };
}

/**
 * Trace for "cartera_vencida":
 * getFpaCashFlow() → CustomerReceivable OPEN past dueDate
 */
function traceCarteraVencida(orgId: string, nodes: FinancialNode[]): FinancialTrace {
  const overdueReceivables = nodes.filter(n =>
    n.sourceSystem === "PYA" &&
    n.docType === "FACTURA" &&
    ((n.metadata.daysOverdue as number) ?? 0) > 0,
  );

  return {
    kpiId:    "cartera_vencida",
    kpiLabel: "Cartera Vencida",
    orgId,
    builtAt:  new Date(),
    chain: [
      step("FPA / Tesorería — KPI Surface", "getFpaCashFlow() → totalOverdue",          "getFpaCashFlow(organizationId)", overdueReceivables),
      step("PYA · CustomerReceivable",      "status IN [OPEN, PARTIAL] AND daysOverdue > 0", "prisma.customerReceivable.findMany()", overdueReceivables),
    ],
    sourceNodes: overdueReceivables,
    blockers:    overdueReceivables.length === 0 ? ["Sin cartera vencida activa"] : [],
  };
}

/**
 * Trace for "conciliacion_pendiente":
 * getReconciliationSummary() → Documents ↔ CustomerReceivable UNMATCHED
 */
function traceConciliacionPendiente(orgId: string, nodes: FinancialNode[]): FinancialTrace {
  const openReceivables = nodes.filter(n =>
    n.sourceSystem === "PYA" &&
    n.docType === "FACTURA" &&
    n.inEdgeIds.length === 0 &&
    n.metadata.receivableStatus === "OPEN",
  );
  const unappliedRecibos = nodes.filter(n =>
    n.sourceSystem === "SAG" &&
    (n.docType === "RECIBO_CAJA" || n.docType === "ANTICIPO") &&
    n.outEdgeIds.length === 0,
  );

  return {
    kpiId:    "conciliacion_pendiente",
    kpiLabel: "Conciliación Pendiente",
    orgId,
    builtAt:  new Date(),
    chain: [
      step("Conciliación — KPI Surface", "getReconciliationSummary() → pendiente",  "getReconciliationSummary(organizationId)", openReceivables),
      step("PYA · CustomerReceivable",   "Facturas OPEN sin CollectionRecord match", "prisma.customerReceivable.findMany()",     openReceivables),
      step("SAG · CollectionRecord",     "Recibos sin factura asociada",             "prisma.collectionRecord.findMany()",       unappliedRecibos),
    ],
    sourceNodes: [...openReceivables, ...unappliedRecibos],
    blockers:    [
      ...(openReceivables.length === 0 && unappliedRecibos.length === 0
        ? ["Sin documentos pendientes de conciliación"] : []),
    ],
  };
}

/**
 * Trace for "cierre_score":
 * computeCloseScore() inputs — all 5 data sources
 */
function traceCierreScore(orgId: string, nodes: FinancialNode[]): FinancialTrace {
  const documents       = nodes.filter(n => n.sourceSystem === "DIAN");
  const receivables     = nodes.filter(n => n.sourceSystem === "PYA");
  const collectionNodes = nodes.filter(n => n.sourceSystem === "SAG" &&
    (n.docType === "RECIBO_CAJA" || n.docType === "ANTICIPO"));

  return {
    kpiId:    "cierre_score",
    kpiLabel: "Score de Cierre",
    orgId,
    builtAt:  new Date(),
    chain: [
      step("Cierre — KPI Surface",     "computeCloseScore(fiscal, recon, accounting, validationCounts, cashFlow)", "computeCloseScore()", []),
      { layer: "DIAN · getDianFiscalSummary",           label: "Estado fiscal DIAN del período",         nodeIds: documents.map(n => n.id),       runtime: "getDianFiscalSummary(orgId)",         hasData: documents.length > 0       },
      { layer: "Conciliación · getReconciliationSummary", label: "Matches FinancialDoc ↔ CustomerReceivable", nodeIds: receivables.map(n => n.id),  runtime: "getReconciliationSummary(orgId)",     hasData: receivables.length > 0     },
      { layer: "SAG · getAccountingClassifications",   label: "Clasificación contable de documentos",   nodeIds: [],                             runtime: "getAccountingClassifications(orgId)", hasData: false                      },
      { layer: "SAG · getValidationStatusCounts",      label: "Conteo de validaciones operacionales",   nodeIds: [],                             runtime: "getValidationStatusCounts(orgId)",    hasData: false                      },
      { layer: "FPA · getFpaCashFlow",                 label: "Flujo de caja proyectado",               nodeIds: collectionNodes.map(n => n.id), runtime: "getFpaCashFlow(orgId)",               hasData: collectionNodes.length > 0 },
    ],
    sourceNodes: [...documents, ...receivables, ...collectionNodes],
    blockers:    [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/** All supported KPI trace IDs. */
export type KpiTraceId =
  | "recaudo_f1_hoy"
  | "recaudo_f2_hoy"
  | "consignaciones_pendientes"
  | "cartera_vencida"
  | "conciliacion_pendiente"
  | "cierre_score";

/**
 * Build a traceability chain for a financial KPI.
 *
 * @param kpiId   One of the supported KpiTraceId values.
 * @param orgId   Organization ID (tenant isolation).
 * @param nodes   All nodes in the graph for this org.
 */
export function buildFinancialTrace(
  kpiId:  KpiTraceId,
  orgId:  string,
  nodes:  FinancialNode[],
): FinancialTrace {
  // Tenant isolation — filter to orgId nodes only
  const orgNodes = nodes.filter(n => n.orgId === orgId);

  switch (kpiId) {
    case "recaudo_f1_hoy":           return traceRecaudoF1Hoy(orgId, orgNodes);
    case "recaudo_f2_hoy":           return traceRecaudoF2Hoy(orgId, orgNodes);
    case "consignaciones_pendientes": return traceConsignacionesPendientes(orgId, orgNodes);
    case "cartera_vencida":          return traceCarteraVencida(orgId, orgNodes);
    case "conciliacion_pendiente":   return traceConciliacionPendiente(orgId, orgNodes);
    case "cierre_score":             return traceCierreScore(orgId, orgNodes);
  }
}
