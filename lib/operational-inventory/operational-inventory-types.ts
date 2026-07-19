/**
 * lib/operational-inventory/operational-inventory-types.ts
 *
 * Operational Inventory — Agentik's own inventory layer.
 *
 * CRITICAL ARCHITECTURAL NOTE:
 * ─────────────────────────────────────────────────────────────────────────────
 * Agentik does NOT use SAG's "disponible" as operational truth.
 *
 * SAG finding (confirmed by SAG team):
 *   "El disponible SAG depende de parametrización por empresa.
 *    Algunas descuentan PD autorizados. Otras no.
 *    No existe una vista operacional consolidada única."
 *
 * Therefore: Agentik computes its own operational availability from:
 *   1. Physical qty (snapshot from SAG physical ledger — trusted)
 *   2. Agentik reservations (owned by Agentik)
 *   3. Sales Portfolio assignments (owned by Agentik)
 *   4. Pending transfers (owned by Agentik)
 *
 * Formula:
 *   operationalAvailableQty =
 *       physicalQty
 *     - reservedQty
 *     - salesAssignedQty
 *     - pendingTransfersQty
 *
 * SAG is: source of truth for physical/fiscal/legal.
 * Agentik is: Operational Intelligence System on top of SAG.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Sprint: AGENTIK-SAG-OPERATIONAL-CONTRACT-01
 */

// ─── Source enumeration ──────────────────────────────────────────────────────

/**
 * Where the inventory data came from.
 * Determines trust level and freshness guarantees.
 */
export type OperationalInventorySource =
  | "sag_odbc_live"      // Real-time ODBC read from SAG (V2+)
  | "sag_excel_import"   // Excel/CSV exported from SAG (V1 — current)
  | "sag_webhook"        // SAG push event (V3+)
  | "agentik_computed"   // Derived entirely from Agentik's own records
  | "manual_override"    // Coordinator manually adjusted
  | "mock";              // Test/placeholder data

// ─── Core snapshot ───────────────────────────────────────────────────────────

/**
 * A point-in-time snapshot of operational inventory for one org.
 * Contains all items and the metadata describing where the data came from.
 *
 * This is the root object of the operational inventory system.
 * It is NOT the SAG inventory record — it is Agentik's interpretation of it.
 */
export interface OperationalInventorySnapshot {
  /** Agentik org identifier */
  organizationId:  string;
  /** ISO timestamp of when this snapshot was computed */
  snapshotAt:      string;
  /** Data origin — determines trust level */
  source:          OperationalInventorySource;
  /** Staleness warning: true if snapshot is older than configured threshold */
  isStale:         boolean;
  /** Max age in seconds before isStale fires */
  staleThresholdSec: number;
  /** Items in this snapshot */
  items:           OperationalInventoryItem[];
  /** Any warnings about data quality or completeness */
  warnings:        string[];
}

// ─── Per-reference item ──────────────────────────────────────────────────────

/**
 * Operational availability of a single reference (SKU/product code).
 *
 * Key distinction:
 *   physicalQty         — what SAG says is physically in the warehouse
 *   salesAssignedQty    — what Agentik has committed to Sales Portfolios
 *   reservedQty         — what Agentik has reserved for confirmed orders
 *   operationalAvailableQty — what is actually free for new assignments
 *
 * Agentik does NOT trust SAG's "disponible" field because:
 *   - Some SAG configs deduct PD (pending orders), others don't
 *   - Parametrization varies per company
 *   - There is no universal SAG "operational available" view
 */
export interface OperationalInventoryItem {
  /** SAG reference code — UPPERCASE */
  reference:               string;
  description:             string;
  line:                    string;    // "LT" | "CS"
  category:                string;
  productType:             string;

  // ── Physical layer (from SAG) ──────────────────────────────────────────
  /** Units physically present in warehouse per SAG ledger */
  physicalQty:             number;
  /** SAG's own "disponible" — stored for reference but NOT used as operational truth */
  sagReportedAvailableQty: number | null;
  /** SAG pending orders (PD) affecting this ref — informational */
  sagPendingOrdersQty:     number;

  // ── Agentik operational layer ─────────────────────────────────────────
  /** Units committed to active Sales Portfolios (VendorCommercialBag items) */
  salesAssignedQty:        number;
  /** Units reserved for confirmed Agentik orders not yet sent to SAG */
  reservedQty:             number;
  /** Units in pending internal transfers between portfolios */
  pendingTransfersQty:     number;

  // ── Computed availability (Agentik formula) ───────────────────────────
  /**
   * operationalAvailableQty = physicalQty - reservedQty - salesAssignedQty - pendingTransfersQty
   *
   * This is the number Agentik uses for new Sales Portfolio assignments
   * and order availability checks. It is owned by Agentik, not SAG.
   */
  operationalAvailableQty: number;

  // ── Pressure indicators ───────────────────────────────────────────────
  /** Units needed across all active portfolios where items are below minQty */
  productionPressureQty:   number;
  /** Number of active portfolios where this ref is below minimum */
  portfoliosUnderPressure: number;
  /** Number of active portfolios where this ref is fully depleted */
  portfoliosDepleted:      number;

  // ── Metadata ─────────────────────────────────────────────────────────
  /** Source of physicalQty (may differ from snapshot source if blended) */
  physicalSource:          OperationalInventorySource;
  /** ISO timestamp of physical data */
  physicalSnapshotAt:      string | null;
}

// ─── Operational reservation ─────────────────────────────────────────────────
// Full type lives in operational-reservation-types.ts.
// Re-exported here for convenience so consumers can import from one place.

export type {
  OperationalReservation,
  OperationalReservationStatus,
  OperationalReservationSourceType,
  OperationalReservationLine,
  ReservationImpact,
  ReservationPressureSignal,
  OperationalReservationEvent,
  OperationalReservationEventType,
  ReservationSummary,
} from "./operational-reservation-types";

// ─── Operational pressure ────────────────────────────────────────────────────

/**
 * Computed operational pressure for a reference.
 * This is an Agentik concept — it does not exist in SAG.
 *
 * Pressure = the combined signal that production or reallocation is needed
 * before stock reaches zero across active Sales Portfolios.
 *
 * Urgency levels:
 *   alta   — immediate action required (zero stock or near-zero across 2+ vendors)
 *   media  — attention needed this week
 *   baja   — monitor — approaching minimum but not critical
 *   ninguna — no pressure
 */
export interface OperationalPressure {
  organizationId:         string;
  reference:              string;
  description:            string;
  line:                   string;
  /** 0–100: composite pressure score */
  pressureScore:          number;
  urgency:                "alta" | "media" | "baja" | "ninguna";
  /** Units needed to bring all depleted portfolios back to minQty */
  totalUnitsNeeded:       number;
  /** Units suggested for production based on velocity and coverage gaps */
  productionSuggestionQty: number;
  /** Portfolio items that are below minimum */
  portfoliosAffected:     string[];
  /** Sales reps affected */
  salesRepsAffected:      string[];
  /** ISO timestamp of last computation */
  computedAt:             string;
  /** Whether this pressure was propagated to a production signal */
  signalEmitted:          boolean;
}

// ─── Operational availability (single reference query result) ─────────────────

/**
 * Result of querying operational availability for a specific reference.
 * Returned by OperationalInventoryBoundary.getOperationalAvailability().
 *
 * Use this — not SAG's disponible — for:
 *   - Sales Portfolio construction (can I assign X units to this vendor?)
 *   - Order validation (is this order fulfillable?)
 *   - Production signal computation (do I need to produce more?)
 */
export interface OperationalAvailability {
  reference:               string;
  organizationId:          string;
  physicalQty:             number;
  salesAssignedQty:        number;
  reservedQty:             number;
  pendingTransfersQty:     number;
  operationalAvailableQty: number;
  /** True if operationalAvailableQty < any portfolio's minQty for this ref */
  hasActivePressure:       boolean;
  computedAt:              string;
  source:                  OperationalInventorySource;
}
