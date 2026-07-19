/**
 * lib/comercial/demand/demand-types.ts
 *
 * Core type system for the SAG PD Demand Layer.
 *
 * PD (Pedidos) represents commercial demand that has NOT yet been invoiced.
 * It is a signal of future revenue, future production need, and commercial pressure.
 *
 * Key distinctions (confirmed by Castillitos administration):
 *   PD ≠ venta (not invoiced)
 *   PD ≠ caja (no cash effect until invoiced)
 *   PD ≠ inventario (does not reduce stock — but reserved qty does)
 *   PD = demanda activa → presiona producción y cobertura
 *
 * AP (Limpieza de pedidos) is a cleanup operation.
 * It MUST NOT affect demand, production, coverage, revenue, or cash.
 *
 * Sprint: AGENTIK-SAG-PD-DEMAND-LAYER-01
 */

import type { CommercialCaseLine } from "../maletas/maletas-types";

// ─── Conversion status ────────────────────────────────────────────────────────

/**
 * Lifecycle status of a PD order as it moves toward invoicing.
 *
 * pending            → order placed, not yet invoiced at all
 * partially_invoiced → some units invoiced, some still pending
 * invoiced           → all ordered units were invoiced
 * cancelled          → order was cleaned via AP (limpieza de pedidos)
 * unknown            → no documentary match found (unresolved)
 */
export type ConversionStatus =
  | "pending"
  | "partially_invoiced"
  | "invoiced"
  | "cancelled"
  | "unknown";

/**
 * Confidence level of the PD → Invoice match.
 * Matching is deterministic — no AI.
 */
export type ConversionConfidence =
  | "exact"      // matched by document number or exact ref+customer+vendor+date
  | "probable"   // matched by ref+customer+vendor within date range (±7d)
  | "unresolved"; // no match found in invoice records

// ─── Demand order signal ─────────────────────────────────────────────────────

/**
 * A single PD (pedido) demand signal.
 * Represents a pending commercial order that has not yet been converted to invoice.
 *
 * In V1 (Excel/availability snapshot): derived from RawAvailabilityRecord.pedidos.
 * In V2 (SAG Prisma): one record per SaleRecord with sagSourceType = "PD".
 */
export interface DemandOrderSignal {
  organizationId:   string;
  reference:        string;           // product ref code (uppercase)
  productName:      string;
  line:             CommercialCaseLine;
  salesRepId?:      string;           // null in V1 (not known from availability)
  customerId?:      string;           // null in V1
  orderDocument?:   string;           // SAG document number (null in V1)
  orderDate?:       string;           // ISO date (null in V1)
  sourceCode:       "PD";             // always PD — AP never generates demand

  orderedQty:       number;           // total units ordered (from PD)
  pendingQty:       number;           // not yet invoiced
  convertedQty:     number;           // already invoiced (matched to OFICIAL/REMISION)

  conversionStatus: ConversionStatus;
  conversionConfidence: ConversionConfidence;

  // Impact flags (invariant)
  affectsProduction: true;            // always true — pending orders demand production
  affectsCoverage:   true;            // always true — pending orders consume coverage
  affectsRevenue:    false;           // false until invoiced (PD is not revenue)
  affectsCash:       false;           // false until invoiced (PD is not cash)
  canConvertToInvoice: true;          // true — PD → OFICIAL/REMISION is the expected lifecycle
}

// ─── Demand pressure signal ────────────────────────────────────────────────────

/**
 * Aggregated demand pressure for a single reference.
 * Combines PD pending orders + availability for a commercial pressure score.
 */
export interface DemandPressureSignal {
  reference:          string;
  productName:        string;
  line:               CommercialCaseLine;
  totalPendingOrders: number;         // sum of PD pendingQty for this ref
  availableForCases:  number;         // disponible = bodega - reservas
  coverageStatus:     string;         // CoverageStatus value
  demandPressureScore: number;        // 0–100 (higher = more urgent)
  orderConversionPct: number | null;  // null in V1 (no historical invoice data)
}

// ─── Order-invoice conversion summary ────────────────────────────────────────

/**
 * Summary of how well PD orders are converting to invoices.
 * Answers: "what % of what was ordered actually got invoiced?"
 */
export interface OrderInvoiceConversionSummary {
  organizationId:        string;
  computedAt:            string;              // ISO timestamp
  windowDays:            number;              // analysis window

  // Global totals
  totalPedidoQty:        number;              // total units from PD
  totalFacturadoQty:     number;              // total units from OFICIAL + REMISION
  conversionPct:         number;              // totalFacturadoQty / totalPedidoQty × 100
  pendingQty:            number;              // totalPedidoQty - matched converted qty
  unconvertedQty:        number;              // PD that has no invoice match at all
  partiallyInvoicedQty:  number;              // PD partially matched

  // Breakdown by reference
  byReference: OrderInvoiceConversionByRef[];

  // Breakdown by sales rep (when available)
  bySalesRep: OrderInvoiceConversionByRep[];

  // Breakdown by line
  byLine: Record<CommercialCaseLine, {
    pedidoQty:   number;
    facturadoQty: number;
    conversionPct: number;
  }>;

  // Invoices without any PD match
  invoicesWithoutOrder: string[];             // refCodes
}

export interface OrderInvoiceConversionByRef {
  reference:          string;
  productName:        string;
  line:               CommercialCaseLine;
  pedidoQty:          number;
  facturadoQty:       number;
  conversionPct:      number;
  pendingQty:         number;
  conversionStatus:   ConversionStatus;
  conversionConfidence: ConversionConfidence;
}

export interface OrderInvoiceConversionByRep {
  salesRepId:    string;
  salesRepName:  string;
  pedidoQty:     number;
  facturadoQty:  number;
  conversionPct: number;
  pendingQty:    number;
}

// ─── Production pressure signal ───────────────────────────────────────────────

/**
 * Combined production pressure signal per reference.
 * Merges PD pending demand + availability + coverage + batch status.
 */
export interface ProductionPressureSignal {
  reference:          string;
  productName:        string;
  line:               CommercialCaseLine;

  // Demand input
  pendingOrdersQty:   number;         // SAG PD total for this ref
  availableForCases:  number;         // disponible = bodega - reservas

  // Coverage state
  coverageStatus:     string;         // CoverageStatus string
  coverageDays:       number | null;
  productionInProcess: boolean;

  // Computed pressure
  pressureScore:      number;         // 0–100 (higher = more urgent)

  // Recommended action
  recommendedAction:
    | "producir"          // no stock, has pending orders, no batch
    | "reponer"           // stock available elsewhere, move to maleta
    | "esperar_lote"      // batch in process, will cover demand
    | "revisar_pedido"    // orders exist but coverage seems sufficient — review
    | "sin_accion";       // no pressure, no pending orders
}
