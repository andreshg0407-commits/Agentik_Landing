/**
 * lib/comercial/pedidos/order-types.ts
 *
 * Domain model for the Pedidos (Orders) module.
 * Agentik captures orders → SAG processes them.
 *
 * Sprint: COMERCIAL-PEDIDOS-CREATOR-01
 * Sprint: COMERCIAL-PEDIDOS-CORE-ARCHITECTURE-04
 * Sprint: COMERCIAL-PEDIDOS-HIBRIDO-SAG-AGENTIK
 * Sprint: COMERCIAL-PEDIDOS-ENTERPRISE-05
 * Sprint: ORDER-CREATION-POLISH-01
 * Sprint: PEDIDOS-VARIANT-ENRICHMENT-01
 */

import type {
  OrderFulfillmentStatus,
  OrderTimelineEvent,
  OrderVersion,
  SagDocumentReference,
} from "./order-core-types";

// ── Order status lifecycle ────────────────────────────────────────────────────

export type OrderStatus =
  | "borrador"
  | "listo_para_enviar"
  | "pendiente_sag"
  | "sincronizado"
  | "conflicto"
  | "cancelado";

// ── Order origin ─────────────────────────────────────────────────────────────

export type OrderOrigin =
  | "agentik"
  | "sag"
  | "sag_customer_order"
  | "importado"
  | "migrado";

// ── Sync state (ENTERPRISE-05 dual state pattern) ─────────────────────────────

export type OrderSyncState =
  | "nunca_sincronizado"
  | "sincronizado"
  | "error_sincronizacion";

// ── Order line ───────────────────────────────────────────────────────────────

export interface OrderLine {
  id:             string;
  referenceCode:  string;
  productName:    string;
  size:           string;
  color:          string;
  quantity:       number;
  availableUnits: number | null; // null = not synced yet, show "—"
  unitPrice:      number;
  lineTotal:      number;
  removed:        boolean;
  comment:        string;
  thumbnailUrl?:  string | null;
  // ── Variant enrichment (PEDIDOS-VARIANT-ENRICHMENT-01) ──
  colorName?:     string | null;  // Resolved color name (e.g., "AZUL OSCURO" for code "AZ3")
  subgrupoSag?:   string | null;  // SAG subgroup (e.g., "PIJAMA LL 2-8")
  productLine?:   string | null;  // SAG product line (e.g., "1")
}

// ── Delivery mode ────────────────────────────────────────────────────────────

export type DeliveryMode = "immediate" | "scheduled";

// ── Delivery scope (WIZARD-IMPROVEMENTS-01) ─────────────────────────────────

export type DeliveryScope = "full" | "partial";

// ── Discount type ────────────────────────────────────────────────────────────

export type DiscountType = "percentage" | "fixed";

// ── Order header ─────────────────────────────────────────────────────────────

export interface OrderHeader {
  customerId:     string;
  customerName:   string;
  customerCode:   string; // SAG customer code
  sellerId:       string;
  sellerName:     string;
  channel:        string;
  notes:          string;
  // Commercial conditions (ORDER-CREATION-POLISH-01)
  deliveryMode?:    DeliveryMode;
  deliveryDate?:    string | null;
  discountType?:    DiscountType;
  discountValue?:   number;
  customerNotes?:   string;
  internalNotes?:   string;
  // Delivery scope (WIZARD-IMPROVEMENTS-01)
  deliveryScope?:   DeliveryScope;
  // Customer address (WIZARD-IMPROVEMENTS-01) — read-only display, set from canonical service
  customerAddress?: string;
  customerCity?:    string;
  // Business date for SAG (SAG-WRITE-ADAPTER-01)
  // Semantics: the commercial date of the order (not the technical creation timestamp).
  // Initialized to tenant's current date on draft creation. FECHA = orderDate in SAG XML.
  orderDate?:       string;
}

// ── Order summary ─────────────────────────────────────────────────────────────

export interface OrderSummary {
  totalLines:       number;
  activeLines:      number;
  totalUnits:       number;
  totalValue:       number;
  uniqueReferences: number;
  // Discount (ORDER-CREATION-POLISH-01)
  discountAmount?:  number;
  totalFinal?:      number;
}

// ── Order draft (full order being created/edited) ─────────────────────────────

export interface OrderDraft {
  id:             string;
  organizationId: string;
  consecutivo:    number;
  header:         OrderHeader;
  lines:          OrderLine[];
  status:         OrderStatus;
  origin:         OrderOrigin;
  syncState:      OrderSyncState;
  summary:        OrderSummary;
  createdBy:      string;
  createdAt:      string;
  updatedAt:      string;
  lastSyncAt:     string | null;
  sagOrderId:     string | null; // SAG's order ID after sync
  sagError:       string | null;
  // ── Seller resolution (PEDIDOS-VENDEDOR-RESOLUTION-01) ─────────────────
  sellerSource?:     string | null;  // "sag_movimientos" | "crm_quote_history" | null
  sellerConfidence?: string | null;  // "high" | "medium" | "low" | "unknown" | null
  // ── Identity fields (CORE-ARCHITECTURE-04) ──────────────────────────────
  /** Idempotent key for SAG sync — prevents duplicate orders */
  externalSyncKey:     string;
  /** SAG invoice IDs linked to this order */
  sagInvoiceIds:       string[];
  /** Source warehouse for fulfillment */
  sourceWarehouseCode: string | null;
  /** Fulfillment state — derived from invoice comparison */
  fulfillmentStatus:   OrderFulfillmentStatus;
  fulfillmentPercent:  number;
  // ── Timeline (HIBRIDO-SAG-AGENTIK) ────────────────────────────────────
  /** Ordered list of lifecycle events */
  timeline:            OrderTimelineEvent[];
  // ── Enterprise identity (ENTERPRISE-05) ───────────────────────────────
  /** Permanent journey ID — never changes, never reused */
  commercialJourneyId: string;
  /** Version history */
  versions:            OrderVersion[];
  /** SAG documents linked to this order (invoices, credit notes, etc.) */
  linkedDocuments:     SagDocumentReference[];
}

// ── Order card (for list view) ────────────────────────────────────────────────

export interface OrderCard {
  id:              string;
  consecutivo:     number;
  customerName:    string;
  sellerName:      string;
  totalReferences: number;
  totalUnits:      number;
  totalValue:      number;
  status:          OrderStatus;
  origin:          OrderOrigin;
  syncState:       OrderSyncState;
  createdAt:       string;
  lastSyncAt:      string | null;
}

// ── Duplicate check ───────────────────────────────────────────────────────────

export interface OrderDuplicateCheck {
  hasDuplicate:  boolean;
  existingOrder: OrderCard | null;
  matchReason:   string | null;
}

// ── Validation ────────────────────────────────────────────────────────────────

export type OrderValidationSeverity = "error" | "warning" | "info";

export interface OrderValidationIssue {
  field:    string;
  message:  string;
  severity: OrderValidationSeverity;
}

export interface OrderValidationResult {
  valid:     boolean;
  issues:    OrderValidationIssue[];
  canSubmit: boolean; // true if no errors (warnings allowed)
}

// ── Copilot signals (David) ───────────────────────────────────────────────────

export interface OrderCopilotSignal {
  message:  string;
  type:     "inventory_warning" | "duplicate_warning" | "validation_ok" | "general";
  priority: number;
}
