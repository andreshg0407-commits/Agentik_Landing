/**
 * lib/finance/graph/index.ts
 *
 * AGENTIK-FINANCIAL-GRAPH-01 — Public API barrel.
 *
 * Consumers should import from this file only.
 * Internal files (builders, resolvers) are not exported — implementation detail.
 *
 * Supported relations:
 *   FACTURA_TO_RECAUDO        — Invoice ↔ Collection receipt (NIT + amount + ref)
 *   RECIBO_TO_CONSIGNACION    — Cash receipt ↔ Bank deposit (bankReference)
 *   NOTA_CREDITO_TO_FACTURA   — Credit note ↔ Invoice (NIT + amount proximity)
 *   CRUCE_TO_CARTERA          — Cross/netting ↔ Receivable (NIT + amount)
 *   ANTICIPO_TO_FACTURA       — Advance ↔ Invoice (NIT + amount constraint)
 *
 * Banking relations (resolved by lib/finance/banking — requires BankAccount data):
 *   BANK_TO_CONSIGNACION — BankMovement (credit) ↔ consignación node
 *   BANK_TO_RECEIPT      — BankMovement (credit) ↔ recibo de caja
 *   BANK_TO_EGRESO       — BankMovement (debit)  ↔ egreso/gasto
 *   BANK_TO_FACTURA      — BankMovement (credit) ↔ factura (direct payment)
 *   BANK_TO_PAYMENT      — BankMovement (credit) ↔ anticipo
 *
 * Remaining blockers (model/API not yet available):
 *   POS_TO_PAYMENT_METHOD      — POS terminal ↔ payment method (POS model needed)
 *   OBLIGATION_TO_EGRESO       — Committed obligation ↔ egress (Obligation model needed)
 *   DIAN_VALIDATION_TO_FACTURA — DIAN e-invoice response ↔ SAG invoice (DIAN API needed)
 */

// ── Core types ───────────────────────────────────────────────────────────────
export type {
  FinancialDocumentType,
  FinancialSourceSystem,
  NodeResolutionStatus,
  FinancialNode,
  FinancialEdge,
  FinancialEdgeType,
  FinancialGraph,
  FinancialGraphStats,
  FinancialTrace,
  FinancialTraceStep,
  FinancialIntegrityIssue,
  IntegrityIssueType,
  BankAccountShape,
  BankMovementShape,
  GraphBuildOptions,
} from "./graph-types";

export {
  COMPROBANTE_TO_DOC_TYPE,
  resolveDocType,
} from "./graph-types";

// ── Status ───────────────────────────────────────────────────────────────────
export type { StatusMeta } from "./graph-status";
export {
  STATUS_META,
  computeNodeStatus,
  computeEdgeStatus,
  aggregateNodeStatus,
  aggregateEdgeStatus,
  computeGraphHealth,
} from "./graph-status";

// ── Runtime ──────────────────────────────────────────────────────────────────
export {
  buildFinancialGraph,
  buildTreasuryGraph,
  buildCarteraGraph,
} from "./graph-runtime";

// ── Relations ────────────────────────────────────────────────────────────────
export { buildAllRelations } from "./graph-relations";

// ── Traceability ─────────────────────────────────────────────────────────────
export type { KpiTraceId } from "./graph-trace";
export { buildFinancialTrace } from "./graph-trace";

// ── Snapshot ──────────────────────────────────────────────────────────────────
export type {
  FinancialGraphSummary,
  SourceHealthStatus,
  FinancialSourceStatus,
  FinancialGraphSnapshot,
} from "./graph-snapshot";
export {
  getFinancialGraphSnapshot,
  getGraphHealthSummary,
  extractGraphBlockers,
} from "./graph-snapshot";

// ── KPI Trace ─────────────────────────────────────────────────────────────────
export type { KpiTraceKey, KpiTraceResult } from "./graph-kpi-trace";
export { getKpiTrace, getAllKpiTraces }      from "./graph-kpi-trace";

// ── Integrity ────────────────────────────────────────────────────────────────
export {
  runIntegrityChecks,
  detectOrphanDocuments,
  detectDuplicateReceipts,
  detectInvoicesWithoutPayment,
  detectPaymentsWithoutInvoice,
  detectInvalidCrosses,
  detectMissingBankSync,
} from "./graph-integrity/integrity-engine";
