/**
 * lib/comercial/orders/operational-order-lifecycle.ts
 *
 * Operational Order Lifecycle — Agentik's own order state machine.
 *
 * ─── BOUNDARY DEFINITION ────────────────────────────────────────────────────
 * Agentik controls the operational lifecycle of an order.
 * SAG legalizes the order (F1/F2/PD/NC) after Agentik sends it downstream.
 *
 * Agentik does NOT replace SAG invoicing.
 * Agentik does NOT issue fiscal documents.
 * Agentik DOES own the operational state and intelligence layer.
 *
 * Lifecycle flow:
 *
 *   draft
 *     ↓ (vendor confirms items and quantities)
 *   reserved          ← Agentik places operational reservation
 *     ↓ (coordinator approves)
 *   confirmed
 *     ↓ (sent downstream)
 *   sent_to_sag       ← SAG receives as PD (Pedido)
 *     ↓ (SAG processes)
 *   processing        ← SAG is preparing dispatch
 *     ↓ (SAG invoices)
 *   fulfilled         ← F1/F2 issued by SAG → Agentik marks fulfilled
 *
 *   Any state → cancelled  (with reason)
 *   fulfilled → returned   (via NC — credit note from SAG)
 *
 * ─── RESERVATION CONTRACT ────────────────────────────────────────────────────
 * Sprint AGENTIK-OPERATIONAL-RESERVATION-ENGINE-01 adds:
 *
 *   draft → reserved:
 *     MUST call POST /api/orgs/.../operational-inventory/reservations
 *     with sourceType: "order", sourceId: orderId, lines: order.lines
 *     to create OperationalReservation records that deduct from availability.
 *
 *   reserved → cancelled:
 *     MUST call PATCH /api/orgs/.../reservations/[reservationId] { action: "release" }
 *     to free units back to the operational pool.
 *
 *   confirmed → sent_to_sag:
 *     MUST call PATCH /api/orgs/.../reservations/[reservationId] { action: "consume" }
 *     units are now committed to SAG PD — reservation is consumed.
 *
 *   fulfilled (SAG F1/F2 received):
 *     Reservation already consumed at sent_to_sag.
 *     Physical inventory will update on next SAG snapshot import.
 *
 *   Full order intake: AGENTIK-SALES-PORTFOLIO-PERSISTENCE-01
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Sprint: AGENTIK-SAG-OPERATIONAL-CONTRACT-01
 * ───────────────────────────────────────────────────────────────────────────
 */

// ─── Order status ─────────────────────────────────────────────────────────────

/**
 * The operational lifecycle state of an Agentik order.
 *
 * This state is owned by Agentik. It is NOT the same as SAG document status,
 * but SAG events trigger transitions (e.g. invoice received → fulfilled).
 */
export type OperationalOrderStatus =
  | "draft"        // Being built by vendor — no reservation yet
  | "reserved"     // Agentik has placed an operational reservation
  | "confirmed"    // Coordinator approved — ready to send to SAG
  | "sent_to_sag"  // PD sent to SAG — awaiting SAG acknowledgment
  | "processing"   // SAG is processing the PD — dispatch in progress
  | "fulfilled"    // F1/F2 issued by SAG — operational cycle complete
  | "cancelled"    // Cancelled at any stage — reservation released
  | "returned";    // Returned via NC — units back in operational pool

// ─── SAG document mapping ─────────────────────────────────────────────────────

/**
 * Conceptual mapping between Agentik order states and SAG document types.
 *
 * This is not a technical integration spec — it describes intent.
 * Actual field mapping lives in lib/integrations/sag/sag-sync-types.ts.
 */
export const SAG_DOCUMENT_MAP: Record<
  OperationalOrderStatus,
  { sagDocType: string | null; description: string }
> = {
  draft: {
    sagDocType:  null,
    description: "Order exists only in Agentik — no SAG document yet",
  },
  reserved: {
    sagDocType:  null,
    description: "Agentik operational reservation — not yet in SAG",
  },
  confirmed: {
    sagDocType:  null,
    description: "Agentik-approved — queued for SAG sync",
  },
  sent_to_sag: {
    sagDocType:  "PD",
    description: "Pedido created in SAG",
  },
  processing: {
    sagDocType:  "PD",
    description: "SAG PD authorized — dispatch in progress",
  },
  fulfilled: {
    sagDocType:  "F1/F2",
    description: "SAG invoice issued — Agentik marks as fulfilled",
  },
  cancelled: {
    sagDocType:  null,
    description: "Cancelled — SAG PD voided if already sent",
  },
  returned: {
    sagDocType:  "NC",
    description: "Nota Crédito issued in SAG — units returned to Agentik pool",
  },
};

// ─── Allowed transitions ──────────────────────────────────────────────────────

/**
 * Valid state machine transitions for the operational order lifecycle.
 * Any transition not in this map is illegal and must be rejected.
 */
export const ORDER_TRANSITIONS: Record<OperationalOrderStatus, OperationalOrderStatus[]> = {
  draft:       ["reserved", "cancelled"],
  reserved:    ["confirmed", "cancelled"],
  confirmed:   ["sent_to_sag", "cancelled"],
  sent_to_sag: ["processing", "cancelled"],
  processing:  ["fulfilled", "cancelled"],
  fulfilled:   ["returned"],
  cancelled:   [],
  returned:    [],
};

/**
 * Returns true if the transition from `from` → `to` is valid.
 */
export function isValidOrderTransition(
  from: OperationalOrderStatus,
  to:   OperationalOrderStatus,
): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

// ─── Order line ───────────────────────────────────────────────────────────────

/**
 * A single reference line within an operational order.
 * Multiple lines belong to one OperationalOrder.
 *
 * Line-level status may differ from order-level status
 * (e.g. partial fulfillment — some lines fulfilled, others processing).
 */
export interface OperationalOrderLine {
  id:             string;
  orderId:        string;
  reference:      string;
  description:    string;
  line:           string;       // product line: "LT" | "CS"
  qtyOrdered:     number;
  qtyReserved:    number;
  qtyFulfilled:   number;
  qtyCancelled:   number;
  /** Line-level operational status */
  status:         OperationalOrderStatus;
  /** Unit price at time of order — NOT fiscal price (SAG owns that) */
  unitPriceRef:   number | null;
  /** SAG PD line reference — populated when sent_to_sag */
  sagPdLineRef:   string | null;
  /** SAG invoice line reference — populated when fulfilled */
  sagInvoiceRef:  string | null;
}

// ─── Operational order ────────────────────────────────────────────────────────

/**
 * An Agentik operational order.
 *
 * This is NOT a SAG document. It is Agentik's own operational record.
 * When confirmed, it is sent to SAG as a PD. SAG then owns the fiscal lifecycle.
 *
 * Agentik retains the operational state and uses it for:
 *   - Coverage tracking
 *   - Pressure computation
 *   - Agent reasoning
 *   - Transfer/production signals
 */
export interface OperationalOrder {
  id:             string;
  organizationId: string;
  salesRepId:     string;
  /** Active Sales Portfolio at time of order */
  portfolioId:    string | null;
  status:         OperationalOrderStatus;
  lines:          OperationalOrderLine[];
  /** External reference assigned after SAG PD creation */
  sagPdRef:       string | null;
  /** External invoice reference after SAG F1/F2 */
  sagInvoiceRef:  string | null;
  createdAt:      string;
  updatedAt:      string;
  confirmedAt:    string | null;
  sentToSagAt:    string | null;
  fulfilledAt:    string | null;
  cancelledAt:    string | null;
  /** Reason for cancellation */
  cancelReason:   string | null;
}

// ─── Cancellation reasons ─────────────────────────────────────────────────────

export type OrderCancelReason =
  | "vendor_request"     // Vendor asked to cancel
  | "inventory_depleted" // No stock available
  | "coordinator_reject" // Coordinator rejected
  | "sag_rejection"      // SAG rejected the PD
  | "expired"            // Reservation expired without confirmation
  | "duplicate"          // Duplicate order detected
  | "other";             // Manual with description

// ─── Reservation integration contract ────────────────────────────────────────
// Sprint: AGENTIK-OPERATIONAL-RESERVATION-ENGINE-01
// Full implementation: AGENTIK-SALES-PORTFOLIO-PERSISTENCE-01

/**
 * What the order intake layer must create when a draft order moves to reserved.
 * Passed to POST /api/orgs/.../operational-inventory/reservations.
 */
export interface OrderReservationRequest {
  orderId:    string;
  salesRepId: string;
  lines: Array<{
    reference:  string;
    qty:        number;
    portfolioId?: string;
  }>;
  reason:     string;
  /** Expiry in seconds. Default 3600 (1 hour). */
  ttlSec?:    number;
}

/**
 * When an order is cancelled, pass reservationId to:
 *   PATCH /api/orgs/.../reservations/[reservationId] { action: "release" }
 */
export interface OrderReservationRelease {
  reservationId: string;
  orderId:       string;
  reason:        OrderCancelReason;
}

/**
 * When an order is confirmed and sent to SAG, pass reservationId to:
 *   PATCH /api/orgs/.../reservations/[reservationId] { action: "consume" }
 */
export interface OrderReservationConsume {
  reservationId: string;
  orderId:       string;
  sagPdRef:      string;
}
