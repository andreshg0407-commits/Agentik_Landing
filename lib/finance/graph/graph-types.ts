/**
 * lib/finance/graph/graph-types.ts
 *
 * AGENTIK-FINANCIAL-GRAPH-01 — Core type definitions for the Financial Graph.
 *
 * The Financial Graph is a directed graph where:
 *   - Nodes = financial documents/movements (invoices, receipts, collections, etc.)
 *   - Edges = verifiable relations between documents (payment → invoice, etc.)
 *
 * Design constraints:
 *   - Every node is organization-scoped (orgId mandatory).
 *   - Relations that cannot be proven are marked UNRESOLVED / ORPHAN — never invented.
 *   - Resolution status reflects data quality, not business logic opinions.
 */

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT TYPE NORMALIZATION
// Maps SAG comprobante codes + PYA doc types to a canonical financial taxonomy.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical financial document type.
 * Derived from SAG comprobanteCode / PYA docType at graph build time.
 */
export type FinancialDocumentType =
  | "FACTURA"         // FV, FA, F1, F2 — commercial invoice
  | "POS"             // PV, NV — point-of-sale ticket
  | "RECIBO_CAJA"     // R1, R2, RS, RC, RG, RA — cash receipt
  | "EGRESO"          // EG, C1, G1, C2, G2 — outflow / egress
  | "NOTA_CREDITO"    // NC — credit note
  | "NOTA_DEBITO"     // ND — debit note
  | "CRUCE"           // CR, CRUCE — cross / netting operation
  | "CONSIGNACION"    // CN — bank deposit / consignación
  | "ANTICIPO"        // A1, A2, AN, SI — advance / anticipation
  | "DESCONOCIDO";    // Unclassified — safe fallback

/**
 * Comprobante code → FinancialDocumentType lookup table.
 * Based on SAG MOVIMIENTOS documentation and Castillitos import schema.
 */
export const COMPROBANTE_TO_DOC_TYPE: Record<string, FinancialDocumentType> = {
  // Facturas
  FV: "FACTURA",  FA: "FACTURA",  F1: "FACTURA",  F2: "FACTURA",
  // POS
  PV: "POS",  NV: "POS",
  // Recibos de caja
  R1: "RECIBO_CAJA",  R2: "RECIBO_CAJA",  RS: "RECIBO_CAJA",
  RC: "RECIBO_CAJA",  RG: "RECIBO_CAJA",  RA: "RECIBO_CAJA",
  // Egresos
  EG: "EGRESO",  C1: "EGRESO",  G1: "EGRESO",  C2: "EGRESO",  G2: "EGRESO",
  // Notas
  NC: "NOTA_CREDITO",  ND: "NOTA_DEBITO",
  // Cruces
  CR: "CRUCE",  CRU: "CRUCE",
  // Consignaciones
  CN: "CONSIGNACION",
  // Anticipos
  A1: "ANTICIPO",  A2: "ANTICIPO",  AN: "ANTICIPO",  SI: "ANTICIPO",
};

export function resolveDocType(code: string | null | undefined): FinancialDocumentType {
  if (!code) return "DESCONOCIDO";
  return COMPROBANTE_TO_DOC_TYPE[code.toUpperCase()] ?? "DESCONOCIDO";
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

export type FinancialSourceSystem =
  | "SAG"       // SAG ERP (PYA) — SaleRecord, CollectionRecord
  | "PYA"       // PYA system — CustomerReceivable, ERP data
  | "DIAN"      // Colombian tax authority — e-invoices, validated docs
  | "BANK"      // Bank account / statement (SYNC_PENDING — no model yet)
  | "POS"       // Point of sale terminal data
  | "INTERNAL"; // Agentik-internal computed records

// ─────────────────────────────────────────────────────────────────────────────
// NODE RESOLUTION STATUS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The resolution confidence of a node or edge.
 * This reflects DATA QUALITY, never a business opinion.
 */
export type NodeResolutionStatus =
  | "REAL"          // Fully verified — from authoritative source, complete data
  | "PARTIAL"       // Present but incomplete — missing amount, NIT, or counterpart
  | "UNRESOLVED"    // Cannot establish the expected relation
  | "ORPHAN"        // Exists in one system with no counterpart in any other
  | "INVALID"       // Data contradiction detected (duplicate, negative, mismatch)
  | "SYNC_PENDING"; // Awaiting external sync (bank statement, DIAN response, etc.)

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIAL NODE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single financial document/movement in the graph.
 * Created by graph-builders from Prisma query results.
 */
export interface FinancialNode {
  /** Stable graph-level id: `${sourceSystem}:${sourceId}` */
  id:             string;
  /** Tenant isolation — mandatory, never null. */
  orgId:          string;
  /** Canonical document type derived from comprobante code. */
  docType:        FinancialDocumentType;
  /** Origin system. */
  sourceSystem:   FinancialSourceSystem;
  /** ID in the originating system (Prisma id, ERP id, etc.). */
  sourceId:       string;
  /** SAG comprobante number or document reference. */
  referenceCode?: string;
  /** Customer NIT. */
  entityNit?:     string;
  /** Customer name. */
  entityName?:    string;
  /** Document amount in COP. */
  amount:         number;
  currency:       string;
  /** Document date (normalized to local midnight). */
  date:           Date;
  period: {
    year:  number;
    month: number; // 1-indexed
  };
  /** Resolution confidence for this node. */
  status:  NodeResolutionStatus;
  /** Free-form provenance metadata. */
  metadata: Record<string, unknown>;
  /** IDs of edges that end at this node (this node is the target). */
  inEdgeIds:  string[];
  /** IDs of edges that start from this node. */
  outEdgeIds: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIAL EDGE (RELATION)
// ─────────────────────────────────────────────────────────────────────────────

export type FinancialEdgeType =
  | "FACTURA_TO_RECAUDO"         // Invoice matched to collection receipt
  | "RECAUDO_TO_RECIBO"          // Collection matched to cash receipt
  | "RECIBO_TO_CONSIGNACION"     // Cash receipt linked to bank deposit
  | "NOTA_CREDITO_TO_FACTURA"    // Credit note applied to invoice
  | "CRUCE_TO_CARTERA"           // Cross/netting applied to receivable
  | "POS_TO_MEDIO_PAGO"          // POS ticket linked to payment method
  | "DOCUMENTO_TO_CONCILIACION"  // Document in reconciliation cycle
  | "MOVIMIENTO_TO_TESORERIA"    // Movement feeding treasury position
  | "ANTICIPO_TO_FACTURA"        // Advance applied to invoice
  // ── Banking edges (resolved once BankMovement data exists) ─────────────────
  | "BANK_TO_CONSIGNACION"       // BankMovement (credit) ↔ consignación node
  | "BANK_TO_RECEIPT"            // BankMovement (credit) ↔ recibo de caja
  | "BANK_TO_EGRESO"             // BankMovement (debit)  ↔ egreso/gasto
  | "BANK_TO_FACTURA"            // BankMovement (credit) ↔ factura (direct payment)
  | "BANK_TO_PAYMENT";           // BankMovement (credit) ↔ anticipo

/**
 * A directed relation between two FinancialNodes.
 */
export interface FinancialEdge {
  /** Stable graph-level id: `${type}:${fromNodeId}:${toNodeId}` */
  id:           string;
  orgId:        string;
  type:         FinancialEdgeType;
  fromNodeId:   string;
  toNodeId:     string;
  /** Match confidence 0–1. < 0.5 = speculative, ≥ 0.9 = high confidence. */
  confidence:   number;
  status:       NodeResolutionStatus;
  /** Document fields that established the match. */
  matchFields:  string[];
  metadata:     Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIAL GRAPH
// ─────────────────────────────────────────────────────────────────────────────

export interface FinancialGraphStats {
  totalNodes:      number;
  totalEdges:      number;
  byStatus:        Record<NodeResolutionStatus, number>;
  byDocType:       Partial<Record<FinancialDocumentType, number>>;
  orphanCount:     number;
  unresolvedCount: number;
  syncPendingCount: number;
}

/**
 * The complete financial graph for one organization.
 * All nodes and edges are org-scoped.
 */
export interface FinancialGraph {
  orgId:   string;
  builtAt: Date;
  nodes:   FinancialNode[];
  edges:   FinancialEdge[];
  stats:   FinancialGraphStats;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRACEABILITY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One step in a KPI traceability chain.
 * Answers: "which documents built this number?"
 */
export interface FinancialTraceStep {
  /** Human-readable layer label (e.g. "Tesorería", "SAG v_pagosnew"). */
  layer:    string;
  /** Short description of what this step contributes. */
  label:    string;
  /** Node IDs at this layer. */
  nodeIds:  string[];
  /** Runtime function that computed this layer. */
  runtime:  string;
  hasData:  boolean;
}

/**
 * Full traceability chain for a financial KPI.
 */
export interface FinancialTrace {
  /** KPI identifier (e.g. "recaudo_f1_hoy", "conciliacion_pendiente"). */
  kpiId:       string;
  kpiLabel:    string;
  orgId:       string;
  builtAt:     Date;
  /** Ordered chain from KPI surface → source data. */
  chain:       FinancialTraceStep[];
  /** All leaf nodes (source documents) that built this KPI. */
  sourceNodes: FinancialNode[];
  /** Reasons the trace is incomplete or uncertain. */
  blockers:    string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRITY
// ─────────────────────────────────────────────────────────────────────────────

export type IntegrityIssueType =
  | "ORPHAN_DOCUMENT"           // Document with no counterpart in any system
  | "DUPLICATE_RECEIPT"         // Same reference code appears in multiple receipts
  | "UNRESOLVED_POS"            // POS ticket with no linked payment method
  | "NEGATIVE_BALANCE"          // Amount < 0 in a context where it shouldn't be
  | "INVOICE_WITHOUT_PAYMENT"   // Overdue receivable with no collection record
  | "PAYMENT_WITHOUT_INVOICE"   // Collection with appliedFacts empty + no receivable
  | "INVALID_CROSS"             // Cross/netting where amounts do not balance
  | "RECONCILIATION_MISMATCH"   // Document status contradicts collection status
  | "MISSING_BANK_SYNC"         // Consignación node with no bank counterpart
  | "AMOUNT_DISCREPANCY";       // Amount differs > tolerance between matched documents

export interface FinancialIntegrityIssue {
  id:         string;
  orgId:      string;
  type:       IntegrityIssueType;
  severity:   "critical" | "warning" | "info";
  /** IDs of the nodes involved in this issue. */
  nodeIds:    string[];
  message:    string;
  detectedAt: Date;
  metadata:   Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// BANKING PREPARATION (no Prisma model yet — shape only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interface shape for future BankAccount model.
 * Used by graph-resolvers/bank-resolver.ts as SYNC_PENDING placeholder.
 */
export interface BankAccountShape {
  id:            string;
  orgId:         string;
  bankName:      string;
  accountNumber: string; // masked
  currency:      string;
  lastSyncAt:    Date | null;
  balanceSAG:    number | null; // balance from SAG consignaciones
  balanceDirect: number | null; // balance from direct bank API (future)
}

/**
 * Interface shape for future BankMovement model.
 */
export interface BankMovementShape {
  id:          string;
  orgId:       string;
  accountId:   string;
  date:        Date;
  description: string;
  amount:      number;
  currency:    string;
  reference?:  string;
  matched:     boolean; // matched to a ConsignacionNode
}

// ─────────────────────────────────────────────────────────────────────────────
// GRAPH BUILD OPTIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface GraphBuildOptions {
  orgId:          string;
  /** Optional date window for node fetching. Defaults to current period. */
  fromDate?:      Date;
  toDate?:        Date;
  /** Modules to include. Defaults to all. */
  include?: {
    saleRecords?:       boolean;
    collectionRecords?: boolean;
    receivables?:       boolean;
    documents?:         boolean;
  };
  /** Skip integrity checks (faster, for display-only). */
  skipIntegrity?: boolean;
}
