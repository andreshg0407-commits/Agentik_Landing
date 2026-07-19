/**
 * lib/operational-intelligence/operational-intelligence-types.ts
 *
 * Operational Intelligence — unified snapshot type system.
 *
 * ─── PHILOSOPHY ───────────────────────────────────────────────────────────────
 * This is NOT analytics. It is operational explainability.
 * Every number has a "why". Every alert points to a cause and a fix.
 * Every suggestion is derived from real signals, not heuristics.
 *
 * ─── SERIALIZATION ────────────────────────────────────────────────────────────
 * All types are JSON-serializable (no Date, Set, Map).
 * Designed to cross the RSC→client boundary as props.
 *
 * Sprint: AGENTIK-OPERATIONAL-INTELLIGENCE-DASHBOARD-01
 */

// ─── Core enumerations ────────────────────────────────────────────────────────

export type OperationalAlertSeverity =
  | "critical"  // action required now
  | "warning"   // review soon
  | "info";     // informational

export type OperationalReferenceStatus =
  | "critical"      // negative availability or over-reserved
  | "pressure"      // active demand approaching available
  | "warning"       // signals present, not yet critical
  | "stable"        // normal operational state
  | "dead_stock";   // high physical qty, zero demand

export type OperationalSuggestionType =
  | "production"    // produce more units
  | "transfer"      // move stock between vendors/warehouses
  | "reserve"       // create missing reservation
  | "release"       // free stale/orphan reservation
  | "review"        // human review required
  | "sync";         // re-run data sync

// ─── Reference-level explainability ──────────────────────────────────────────

/**
 * An entity impacted by a reference's operational state.
 * Could be a vendor, an order, a production queue, or a portfolio.
 */
export interface OperationalImpact {
  type:        "vendor" | "order" | "production" | "portfolio" | "reservation" | "warehouse";
  id?:         string;
  name:        string;
  description: string;
}

/**
 * A concrete suggestion for a reference.
 */
export interface OperationalReferenceSuggestion {
  type:        OperationalSuggestionType;
  label:       string;
  urgency:     "alta" | "media" | "baja";
  qtyImpact?:  number;
  reason:      string;
}

/**
 * Full operational intelligence for a single product reference.
 *
 * The explainability layer: every status is explained in human language.
 * Consumers (David, Copilot, coordinators) read this to understand "why".
 */
export interface OperationalIntelligenceReference {
  reference:                string;
  description:              string;
  line:                     string;
  // Core quantities
  physicalQty:              number;
  reservedQty:              number;
  salesAssignedQty:         number;
  operationalAvailableQty:  number;
  // Status
  status:                   OperationalReferenceStatus;
  urgency:                  "alta" | "media" | "baja" | "ninguna";
  // Explainability
  why:                      string[];                       // human-readable causes
  impacts:                  OperationalImpact[];            // who/what is affected
  suggestions:              OperationalReferenceSuggestion[]; // what to do
  // Related entities
  relatedOrders:            string[];   // order sourceIds
  relatedVendors:           string[];   // salesRepId slugs
  relatedReservations:      string[];   // reservation IDs
  // Aggregates
  activeOrderCount:         number;
  activeReservationCount:   number;
  signalTypes:              string[];   // demand signal types present
}

// ─── Hot reference ────────────────────────────────────────────────────────────

/**
 * A reference that appears in multiple active orders or demand signals.
 * Signals cross-vendor contention.
 */
export interface OperationalHotReference {
  reference:      string;
  description:    string;
  line:           string;
  orderCount:     number;
  vendorCount:    number;
  totalDemandQty: number;
  availableQty:   number;
  urgency:        "alta" | "media" | "baja";
}

// ─── Vendor impact ────────────────────────────────────────────────────────────

/**
 * Aggregated operational impact for a single sales rep / vendor.
 */
export interface OperationalVendorImpact {
  salesRepId:           string;
  salesRepName:         string;
  depletedRefs:         number;
  pressureRefs:         number;
  activeOrders:         number;
  activeReservations:   number;
  totalQtyReserved:     number;
  commercialRisk:       "alto" | "medio" | "bajo";
}

// ─── Warehouse pressure ───────────────────────────────────────────────────────

/**
 * Demand concentration in a specific warehouse/bodega.
 */
export interface OperationalWarehousePressure {
  warehouseId:      string;
  warehouseName:    string;
  refs:             number;
  totalQtyDemanded: number;
  urgency:          "alta" | "media" | "baja";
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

/**
 * An operational alert surfaced to coordinators, David, and Copilot.
 */
export interface OperationalIntelligenceAlert {
  id:          string;
  severity:    OperationalAlertSeverity;
  title:       string;
  body:        string;
  reference?:  string;
  sourceType?: string;
  sourceId?:   string;
  actionLabel?: string;
  actionHref?:  string;
  createdAt:   string;
}

// ─── Suggestions ─────────────────────────────────────────────────────────────

/**
 * A global operational suggestion (not scoped to one reference).
 */
export interface OperationalIntelligenceSuggestion {
  id:          string;
  type:        OperationalSuggestionType;
  urgency:     "alta" | "media" | "baja";
  title:       string;
  reason:      string;
  refs:        string[];
  affectedVendors: string[];
  qtyImpact?:  number;
}

// ─── Conflicts ────────────────────────────────────────────────────────────────

/**
 * An operational conflict detected by the reconciliation engine.
 */
export interface OperationalConflict {
  id:          string;
  type:        string;
  severity:    OperationalAlertSeverity;
  reference?:  string;
  message:     string;
  fixLabel:    string;
}

// ─── Pressure summary ─────────────────────────────────────────────────────────

export interface OperationalPressureSummary {
  refsUnderPressure:    number;
  refsDepleted:         number;
  refsOverReserved:     number;
  refsWithDeadStock:    number;
  refsWithMissingReservation: number;
}

// ─── Health ───────────────────────────────────────────────────────────────────

export interface OperationalIntelligenceHealth {
  score:           number;   // 0–100
  label:           string;   // human-readable status
  isHealthy:       boolean;
  criticalCount:   number;
  warningCount:    number;
  infoCount:       number;
}

// ─── Master snapshot ─────────────────────────────────────────────────────────

/**
 * The complete Operational Intelligence Snapshot.
 *
 * Built by buildOperationalIntelligenceSnapshot().
 * Serializable: all fields are JSON-safe.
 * Designed to be passed as a prop from RSC → Client Component.
 */
export interface OperationalIntelligenceSnapshot {
  organizationId:       string;
  generatedAt:          string;
  health:               OperationalIntelligenceHealth;
  pressureSummary:      OperationalPressureSummary;
  /** Top references sorted by urgency — full explainability per ref */
  references:           OperationalIntelligenceReference[];
  /** Refs in multiple active orders — cross-vendor contention */
  hotReferences:        OperationalHotReference[];
  /** Active operational alerts */
  alerts:               OperationalIntelligenceAlert[];
  /** Global suggestions (production + transfer) */
  suggestions:          OperationalIntelligenceSuggestion[];
  /** Reconciliation conflicts */
  conflicts:            OperationalConflict[];
  /** Per-vendor commercial impact */
  vendorImpact:         OperationalVendorImpact[];
  /** Per-warehouse demand concentration */
  warehousePressure:    OperationalWarehousePressure[];
  /** Reconciliation summary from the reconciliation engine */
  reconciliationSummary: {
    totalIssues:  number;
    critical:     number;
    warnings:     number;
    info:         number;
    isHealthy:    boolean;
    healthScore:  number;
  };
  /** Aggregates for the hero strip */
  totals: {
    activeReservations:  number;
    activeOrders:        number;
    totalQtyReserved:    number;
    refsMonitored:       number;
  };
}
