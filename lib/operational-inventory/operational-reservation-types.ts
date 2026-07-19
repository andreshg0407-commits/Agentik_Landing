/**
 * lib/operational-inventory/operational-reservation-types.ts
 *
 * Operational Reservation System — full type contract.
 *
 * ─── WHAT THIS IS ───────────────────────────────────────────────────────────
 * An OperationalReservation is Agentik's soft hold on inventory units.
 * It exists BEFORE an order reaches SAG. It lives entirely in Agentik.
 *
 * SAG does not know about reservations until a confirmed order is sent as PD.
 * Until then, Agentik owns the operational availability math.
 *
 * ─── LIFECYCLE ───────────────────────────────────────────────────────────────
 *   active   → released   (order cancelled — units returned to pool)
 *   active   → consumed   (order confirmed — sent to SAG as PD)
 *   active   → expired    (reservation TTL elapsed without action)
 *   active   → cancelled  (manual coordinator action)
 *
 * ─── FORMULA IMPACT ──────────────────────────────────────────────────────────
 *   operationalAvailableQty =
 *       physicalQty
 *     - reservedQty          ← THIS layer (sum of active OperationalReservation.qtyReserved)
 *     - salesAssignedQty
 *     - pendingTransfersQty
 *
 * Sprint: AGENTIK-OPERATIONAL-RESERVATION-ENGINE-01
 */

// ─── Source type ──────────────────────────────────────────────────────────────

/**
 * What triggered this reservation.
 *
 *   order      — a vendor-initiated order in Agentik's order lifecycle
 *   portfolio  — a Sales Portfolio assignment locked units for a vendor season
 *   manual     — coordinator manually reserved units (e.g. exhibition, show)
 *   transfer   — inter-vendor or inter-warehouse transfer in progress
 */
export type OperationalReservationSourceType =
  | "order"
  | "portfolio"
  | "manual"
  | "transfer";

// ─── Status ───────────────────────────────────────────────────────────────────

/**
 * Lifecycle state of an operational reservation.
 *
 *   active    — units are held, deducted from operationalAvailableQty
 *   released  — units returned to pool (order cancelled or reservation freed)
 *   consumed  — units were committed (order confirmed → SAG PD sent)
 *   expired   — TTL elapsed without action — units returned automatically
 *   cancelled — manually voided by coordinator
 */
export type OperationalReservationStatus =
  | "active"
  | "released"
  | "consumed"
  | "expired"
  | "cancelled";

// ─── Core reservation ─────────────────────────────────────────────────────────

/**
 * An Agentik operational reservation.
 *
 * Tracks units held for a pending order/assignment BEFORE they reach SAG.
 * Immutable once consumed — any change produces a new event.
 *
 * Naming note:
 *   qtyReserved  = units locked at reservation creation time
 *   qtyReleased  = units freed (partial release or full cancellation)
 *   qtyConsumed  = units that advanced to SAG (PD sent)
 *
 * At any point: qtyReserved = qtyReleased + qtyConsumed + qtyStillActive
 *   where qtyStillActive = qtyReserved - qtyReleased - qtyConsumed
 */
export interface OperationalReservation {
  id:             string;
  organizationId: string;
  sourceType:     OperationalReservationSourceType;
  /** The Agentik entity that owns this reservation (orderId / portfolioId / etc.) */
  sourceId:       string;
  salesRepId?:    string;
  customerId?:    string;
  /** SAG reference code — UPPERCASE */
  reference:      string;
  description:    string;
  /** Units originally reserved */
  qtyReserved:    number;
  /** Units freed back to the pool */
  qtyReleased:    number;
  /** Units that advanced to SAG PD */
  qtyConsumed:    number;
  status:         OperationalReservationStatus;
  /** Human-readable reason for the reservation */
  reason:         string;
  /** ISO timestamp: if status is still active past this → expires automatically */
  expiresAt?:     string;
  createdAt:      string;
  updatedAt:      string;
}

// ─── Reservation line (input) ─────────────────────────────────────────────────

/**
 * A single reference line within a multi-line reservation request.
 * Used as input to createReservation().
 */
export interface OperationalReservationLine {
  reference:    string;
  qty:          number;
  salesRepId?:  string;
  portfolioId?: string;
  orderId?:     string;
}

// ─── Impact ───────────────────────────────────────────────────────────────────

/**
 * The computed impact of a reservation action on a single reference.
 *
 * Returned by createReservation / releaseReservation so callers know
 * exactly how availability changed and whether pressure was triggered.
 */
export interface ReservationImpact {
  reference:                  string;
  /** Physical qty from SAG snapshot (unchanged by reservation) */
  physicalQty:                number;
  /** Total active reservedQty AFTER this action */
  reservedQty:                number;
  /** Units committed to Sales Portfolios (unchanged by reservation) */
  salesAssignedQty:           number;
  /** operationalAvailableQty BEFORE this action */
  operationalAvailableBefore: number;
  /** operationalAvailableQty AFTER this action */
  operationalAvailableAfter:  number;
  /** True if this action caused pressure (below minimum or depleted) */
  pressureTriggered:          boolean;
  pressureLevel:              "alta" | "media" | "baja" | "ninguna";
}

// ─── Pressure signal ──────────────────────────────────────────────────────────

/**
 * Emitted when a reservation causes a reference to drop below threshold.
 *
 * Prepared for: David (comercial), Sales Portfolio, Production Suggestions.
 * NOT yet wired to the runtime — Sprint AGENTIK-PRESSURE-RUNTIME-01.
 */
export interface ReservationPressureSignal {
  organizationId:       string;
  reference:            string;
  description:          string;
  /** Reservation that triggered this signal */
  triggeredByReservationId: string;
  triggerType:          "below_minimum" | "depleted" | "overcommitted";
  availableAfter:       number;
  reservedQty:          number;
  physicalQty:          number;
  pressureLevel:        "alta" | "media" | "baja";
  /** Sales rep who placed the triggering reservation (if applicable) */
  salesRepId?:          string;
  emittedAt:            string;
}

// ─── Event types ──────────────────────────────────────────────────────────────

/**
 * Taxonomy of reservation lifecycle events.
 * Every state change produces an immutable event record.
 */
export type OperationalReservationEventType =
  | "reservation.created"
  | "reservation.released"
  | "reservation.consumed"
  | "reservation.expired"
  | "reservation.cancelled"
  | "reservation.pressure_triggered";

/**
 * An immutable record of a reservation lifecycle event.
 * Full audit trail: who, what, when, impact.
 */
export interface OperationalReservationEvent {
  id:             string;
  organizationId: string;
  reservationId:  string;
  type:           OperationalReservationEventType;
  /** Serializable payload describing the event context */
  payload:        Record<string, unknown>;
  createdAt:      string;
}

// ─── Reservation summary ──────────────────────────────────────────────────────

/**
 * Aggregate summary of active reservations for diagnostics and dashboards.
 */
export interface ReservationSummary {
  organizationId:    string;
  totalActive:       number;
  totalUnitsReserved: number;
  refsUnderPressure: number;
  expiredCount:      number;
  bySourceType: Record<OperationalReservationSourceType, number>;
  computedAt:        string;
}
