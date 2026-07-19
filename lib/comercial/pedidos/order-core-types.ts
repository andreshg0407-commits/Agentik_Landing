/**
 * lib/comercial/pedidos/order-core-types.ts
 *
 * Core architectural types for Pedidos as the commercial operations nucleus.
 *
 * Pedido → SAG sync → Invoice → Match → Fulfillment → Intelligence
 *
 * No Prisma — runs on client and server.
 *
 * Sprint: COMERCIAL-PEDIDOS-CORE-ARCHITECTURE-04
 * Sprint: COMERCIAL-PEDIDOS-HIBRIDO-SAG-AGENTIK
 * Sprint: COMERCIAL-PEDIDOS-ENTERPRISE-05
 */

// ── Fulfillment status ───────────────────────────────────────────────────────

export type OrderFulfillmentStatus =
  | "sin_factura"
  | "facturado_completo"
  | "facturado_parcial"
  | "facturado_con_diferencias"
  | "cancelado"
  | "pendiente_revision";

// ── Commercial order lifecycle ───────────────────────────────────────────────
// The full lifecycle of a commercial order from capture to intelligence.

export interface CommercialOrderLifecycle {
  orderId:            string;
  consecutivo:        number;
  externalSyncKey:    string;
  /** Agentik capture */
  capturedAt:         string;
  capturedBy:         string;
  /** SAG sync */
  sentToSagAt:        string | null;
  sagOrderId:         string | null;
  sagResponseAt:      string | null;
  /** Invoice binding */
  sagInvoiceIds:      string[];
  invoiceLinkedAt:    string | null;
  /** Fulfillment */
  fulfillmentStatus:  OrderFulfillmentStatus;
  fulfillmentPercent: number;        // 0–100
  fulfillmentCheckedAt: string | null;
  /** Operational */
  customerCode:       string;
  sellerName:         string;
  sourceWarehouseCode: string | null;
  totalOrderValue:    number;
  totalInvoicedValue: number;
}

// ── Order identity (Phase 2) ─────────────────────────────────────────────────
// Fields that extend OrderDraft for cross-system traceability.

export interface OrderIdentity {
  /** Agentik internal UUID */
  id:                  string;
  /** Agentik consecutive number */
  consecutivo:         number;
  /** Idempotent key for SAG sync — prevents duplicate orders */
  externalSyncKey:     string;
  /** SAG order ID — set after successful sync */
  sagOrderId:          string | null;
  /** SAG invoice IDs linked to this order */
  sagInvoiceIds:       string[];
  /** SAG customer code */
  customerCode:        string;
  /** Seller identifier */
  sellerCode:          string;
  sellerName:          string;
  /** Source warehouse for fulfillment */
  sourceWarehouseCode: string | null;
  createdAt:           string;
  updatedAt:           string;
}

// ── Operational signal ───────────────────────────────────────────────────────
// A traceable signal emitted by an order for other modules.

export type OrderSignalTarget =
  | "inventario"
  | "produccion"
  | "tiendas"
  | "finanzas"
  | "facturacion"
  | "cobranza"
  | "inteligencia_comercial";

export type OrderSignalSeverity = "info" | "warning" | "action_required";

export interface OrderOperationalSignal {
  orderId:    string;
  target:     OrderSignalTarget;
  severity:   OrderSignalSeverity;
  message:    string;
  data:       Record<string, unknown>;
  createdAt:  string;
}

// ── Order to invoice match ───────────────────────────────────────────────────

export interface OrderToInvoiceMatch {
  orderId:            string;
  invoiceId:          string;
  invoiceNumber:      string;
  matchedAt:          string;
  fulfillmentStatus:  OrderFulfillmentStatus;
  fulfillmentPercent: number;
  comparison:         OrderInvoiceComparison;
}

// ── Invoice comparison ───────────────────────────────────────────────────────

export interface OrderInvoiceComparison {
  orderTotalUnits:    number;
  invoiceTotalUnits:  number;
  orderTotalValue:    number;
  invoiceTotalValue:  number;
  unitsDifference:    number;
  valueDifference:    number;
  linesMatched:       number;
  linesMissing:       number;    // in order but not in invoice
  linesExtra:         number;    // in invoice but not in order
  linesWithDifferences: number;
  lineDetails:        OrderFulfillmentLine[];
}

// ── Fulfillment per line ─────────────────────────────────────────────────────

export type LineFulfillmentStatus =
  | "matched"
  | "quantity_difference"
  | "price_difference"
  | "missing_in_invoice"
  | "extra_in_invoice";

export interface OrderFulfillmentLine {
  referenceCode:       string;
  size:                string;
  color:               string;
  /** Order side */
  orderQuantity:       number;
  orderUnitPrice:      number;
  orderLineTotal:      number;
  /** Invoice side — null if missing */
  invoiceQuantity:     number | null;
  invoiceUnitPrice:    number | null;
  invoiceLineTotal:    number | null;
  /** Computed */
  quantityDifference:  number;
  priceDifference:     number;
  status:              LineFulfillmentStatus;
}

// ── Seller fulfillment KPI ───────────────────────────────────────────────────

export interface SellerFulfillmentKpi {
  sellerName:               string;
  sellerCode:               string;
  /** Volume */
  totalOrders:              number;
  totalOrderValue:          number;
  totalInvoicedValue:       number;
  /** Fulfillment */
  fulfillmentPercent:       number;
  ordersFullyInvoiced:      number;
  ordersPartiallyInvoiced:  number;
  ordersWithDifferences:    number;
  ordersWithoutInvoice:     number;
  /** Timing */
  avgDaysToInvoice:         number | null;
  /** Breadth */
  uniqueCustomers:          number;
  avgTicketValue:           number;
  /** Product intelligence */
  topReferences:            { referenceCode: string; quantity: number }[];
  worstFulfillmentRefs:     { referenceCode: string; fulfillmentPercent: number }[];
}

// ── Customer order insight ───────────────────────────────────────────────────

export interface CustomerOrderInsight {
  customerCode:        string;
  customerName:        string;
  totalOrders:         number;
  totalOrderValue:     number;
  totalInvoicedValue:  number;
  fulfillmentPercent:  number;
  lastOrderDate:       string | null;
  /** Products this customer buys but hasn't reordered recently */
  reorderOpportunities: string[];
  /** Products frequently partially fulfilled */
  partialFulfillmentRefs: string[];
}

// ── Product fulfillment insight ──────────────────────────────────────────────

export interface ProductFulfillmentInsight {
  referenceCode:        string;
  productName:          string;
  totalOrdered:         number;
  totalInvoiced:        number;
  fulfillmentPercent:   number;
  /** How many orders included this product */
  orderCount:           number;
  /** How many times it was partially fulfilled */
  partialCount:         number;
  /** Indicates production/inventory bottleneck */
  isBottleneck:         boolean;
}

// ── Commercial Journey ID (ENTERPRISE-05) ───────────────────────────────────
// Permanent identifier linking every artifact in a commercial order's lifecycle.
// Created once at order creation. Never changes. Never reused.

export interface CommercialOrderIdentity {
  /** Permanent journey ID — links order, invoices, PDFs, events, KPIs */
  commercialJourneyId: string;
  /** Agentik internal order ID */
  orderId:             string;
  /** Consecutive number for human display */
  consecutivo:         number;
  /** Idempotent key for SAG sync */
  externalSyncKey:     string;
  /** Origin system */
  origin:              string;
  /** Creation timestamp — immutable */
  createdAt:           string;
}

// ── Pedido ≠ Documento SAG (ENTERPRISE-05) ──────────────────────────────────
// A commercial order can be linked to zero, one, or many SAG documents.
// Never assume 1:1.

export type SagDocumentType =
  | "factura"
  | "nota_credito"
  | "nota_debito"
  | "remision"
  | "pedido_sag";

export interface SagDocumentReference {
  /** SAG document ID */
  documentId:          string;
  /** SAG document number (human-readable) */
  documentNumber:      string;
  /** Document type */
  documentType:        SagDocumentType;
  /** Date of the document */
  date:                string;
  /** Total value */
  totalValue:          number;
  /** When linked to this order */
  linkedAt:            string;
  /** How the link was established */
  linkMethod:          string;
}

export interface OrderLinkedDocuments {
  /** The commercial journey this belongs to */
  commercialJourneyId: string;
  /** All SAG documents linked to this order */
  documents:           SagDocumentReference[];
  /** Quick counts */
  invoiceCount:        number;
  creditNoteCount:     number;
  debitNoteCount:      number;
  remissionCount:      number;
}

// ── Versionado (ENTERPRISE-05) ──────────────────────────────────────────────
// Every important modification creates a version snapshot.
// Makes it possible to reconstruct the original order at any point.

export interface OrderVersion {
  versionNumber:   number;
  createdAt:       string;
  createdBy:       string;
  reason:          string;
  /** Optional: what changed (field-level diff) */
  diff:            OrderVersionDiff | null;
}

export interface OrderVersionDiff {
  /** Fields that changed */
  changedFields:   string[];
  /** Line changes */
  linesAdded:      number;
  linesRemoved:    number;
  linesModified:   number;
  /** Value delta */
  previousTotal:   number;
  newTotal:        number;
}

// ── Commercial Memory contracts (ENTERPRISE-05) ─────────────────────────────
// Infrastructure for David to consume. No AI yet — pure data.

export interface CustomerCommercialMemory {
  customerCode:          string;
  customerName:          string;
  /** Frequency */
  totalOrders:           number;
  avgOrdersPerMonth:     number;
  daysBetweenOrders:     number | null;
  daysSinceLastOrder:    number | null;
  /** Value */
  totalLifetimeValue:    number;
  avgTicketValue:        number;
  /** Preferences */
  topReferences:         CommercialFrequencyItem[];
  topSizes:              CommercialFrequencyItem[];
  topColors:             CommercialFrequencyItem[];
  topCategories:         CommercialFrequencyItem[];
  /** Behavior */
  reorderCandidates:     string[];   // refs bought >1 time, not ordered recently
  oneTimeBuys:           string[];   // refs bought exactly once
  /** Fulfillment */
  fulfillmentPercent:    number;
  avgDaysToInvoice:      number | null;
}

export interface SellerCommercialMemory {
  sellerName:            string;
  sellerCode:            string;
  /** Activity */
  totalOrders:           number;
  activeCustomers:       number;
  avgOrdersPerMonth:     number;
  /** Value */
  totalSalesValue:       number;
  avgTicketValue:        number;
  /** Product mix */
  topReferences:         CommercialFrequencyItem[];
  /** Performance */
  fulfillmentPercent:    number;
  avgDaysToInvoice:      number | null;
  conflictRate:          number;    // % of orders with conflicts
}

export interface ProductCommercialMemory {
  referenceCode:         string;
  productName:           string;
  /** Demand */
  totalOrdered:          number;
  totalInvoiced:         number;
  orderCount:            number;
  uniqueCustomers:       number;
  /** Reorder */
  reorderRate:           number;    // % of customers who ordered >1 time
  avgReorderDays:        number | null;
  /** Trend */
  lastOrderDate:         string | null;
  isGrowing:             boolean;  // recent orders > historical average
  isShrinking:           boolean;
}

export interface CommercialFrequencyItem {
  value:      string;
  count:      number;
  lastSeen:   string;
  /** Share of total */
  percent:    number;
}

// ── David commercial signal contracts (ENTERPRISE-05) ───────────────────────
// What David can say about an order, customer, or seller.
// No AI — just structured insight templates.

export type DavidCommercialInsightType =
  | "customer_frequency"
  | "customer_reorder"
  | "customer_preference"
  | "customer_dormant"
  | "seller_performance"
  | "seller_trend"
  | "product_demand"
  | "product_reorder"
  | "fulfillment_alert"
  | "value_opportunity";

export interface DavidCommercialInsight {
  type:        DavidCommercialInsightType;
  message:     string;
  confidence:  number;   // 0–100
  data:        Record<string, unknown>;
  /** Which memory source was used */
  source:      "customer" | "seller" | "product";
}

// ── Order timeline event (HIBRIDO-SAG-AGENTIK) ──────────────────────────────
// Each order carries a timeline: an ordered list of lifecycle events.
// The timeline is the single source of truth for "what happened to this order."

export type OrderTimelineEventType =
  | "created_in_agentik"
  | "imported_from_sag"
  | "migrated"
  | "edited"
  | "line_added"
  | "line_removed"
  | "line_updated"
  | "pdf_generated"
  | "shared_whatsapp"
  | "shared_email"
  | "submitted"
  | "sent_to_sag"
  | "sag_response_received"
  | "synced_with_sag"
  | "sync_conflict"
  | "invoice_detected"
  | "invoice_linked"
  | "comparison_executed"
  | "difference_detected"
  | "fulfillment_updated"
  | "cancelled"
  | "returned_to_draft"
  | "dedup_matched"
  | "dedup_merged"
  | "version_created"
  | "document_linked";

export interface OrderTimelineEvent {
  eventType:  OrderTimelineEventType;
  timestamp:  string;
  actor:      string;   // "system" | "usuario" | seller name | "sag_sync"
  message:    string;   // human-readable description
  data:       Record<string, unknown>;
}

// ── Deduplication (HIBRIDO-SAG-AGENTIK) ──────────────────────────────────────

export type DedupMatchMethod =
  | "external_sync_key"
  | "sag_order_id"
  | "cross_reference"
  | "strong_match";   // customer + date + seller + lines similarity

export type DedupConfidence = "exact" | "high" | "medium" | "low";

export interface DedupMatchResult {
  matched:         boolean;
  existingOrderId: string | null;
  method:          DedupMatchMethod | null;
  confidence:      DedupConfidence | null;
  score:           number;     // 0–100
  reasons:         string[];   // human-readable match reasons
}

// ── SAG import result ────────────────────────────────────────────────────────

export type SagImportAction = "created" | "merged" | "skipped";

export interface SagOrderImportResult {
  sagOrderId:    string;
  action:        SagImportAction;
  orderId:       string | null;   // Agentik order ID (created or existing)
  dedupResult:   DedupMatchResult;
  importedAt:    string;
  message:       string;
}

// ── Audit event types ────────────────────────────────────────────────────────

export type OrderAuditEventType =
  | "order_created"
  | "order_imported_from_sag"
  | "order_migrated"
  | "order_dedup_matched"
  | "order_dedup_merged"
  | "pdf_generated"
  | "shared_whatsapp"
  | "shared_email"
  | "sent_to_sag"
  | "sag_response_received"
  | "invoice_detected"
  | "invoice_linked"
  | "comparison_executed"
  | "difference_detected"
  | "fulfillment_updated";

export interface OrderAuditEvent {
  orderId:    string;
  eventType:  OrderAuditEventType;
  timestamp:  string;
  actor:      string;
  data:       Record<string, unknown>;
}
