/**
 * lib/comercial/maletas/coverage-ownership-types.ts
 *
 * Commercial Coverage Ownership — foundation types for linking coverage
 * to real people (vendedores) and preparing the RRHH 360 integration.
 *
 * These types establish the ownership layer above maleta templates,
 * enabling future connections to:
 *   RRHH → Comercial → Producción → Finanzas → IA
 *
 * V1: Derived from Excel / seed data.
 * V2: Linked to HR system via employeeId.
 *
 * Sprint: AGENTIK-COMMERCIAL-COVERAGE-01
 */

// ─── Owner identity ─────────────────────────────────────────────────────────────

/**
 * A real person who owns one or more coverage configurations.
 * The employeeId field is the future link to the RRHH module.
 */
export interface CommercialCoverageOwner {
  /** Agentik internal ID — matches SalesRep.id */
  salesRepId:   string;
  /** Future HR system employee identifier */
  employeeId:   string | null;
  name:         string;
  role:         "vendedor" | "coordinador" | "gerente";
  active:       boolean;
  /** Assigned territory or region — V2 */
  territory:    string | null;
  /** Future: direct link to HR system record */
  hrSystemId:   string | null;
}

// ─── Coverage assignment ────────────────────────────────────────────────────────

/**
 * A live coverage configuration assigned to an owner.
 * A single owner can have at most one active assignment per season.
 */
export interface CoverageAssignment {
  id:           string;
  ownerId:      string;    // CommercialCoverageOwner.salesRepId
  maletaId:     string;    // MaletaTemplate.id
  season:       string;
  startDate:    string | null;
  endDate:      string | null;
  lines:        string[];  // ["LT", "CS"] or specific category names
  status:       "activa" | "pausada" | "borrador" | "archivada";
  createdAt:    string;
  updatedAt:    string;
}

// ─── Coverage pressure ──────────────────────────────────────────────────────────

/**
 * Aggregated operational pressure for an owner.
 * Computed from inventory, PD, and rules — not persisted.
 */
export interface CoveragePressure {
  ownerId:                string;
  /** 0–100: composite pressure signal */
  pressureScore:          number;
  criticalRefs:           number;
  urgentRefs:             number;
  suggestedProductionQty: number;
  riskLevel:              "bajo" | "medio" | "alto" | "critico";
  /** ISO timestamp of last computation */
  lastComputedAt:         string;
}

// ─── Coverage health ────────────────────────────────────────────────────────────

/**
 * Health snapshot for an owner's active coverage.
 * Produced on demand — not persisted in V1.
 */
export interface CoverageHealth {
  ownerId:       string;
  /** 0–100: % of active refs above minimum */
  coveragePct:   number;
  activeRefs:    number;
  criticalRefs:  number;
  totalRefs:     number;
  lines:         string[];
  healthStatus:  "saludable" | "riesgo" | "critico" | "sin_datos";
  /** ISO timestamp when this snapshot was computed */
  snapshot:      string;
}

// ─── Coverage timeline ──────────────────────────────────────────────────────────

/**
 * Immutable event record in an owner's coverage history.
 * Future: persisted in Prisma for audit and ML signal extraction.
 */
export interface CoverageTimeline {
  id:          string;
  ownerId:     string;
  eventType:
    | "coverage_drop"
    | "ref_added"
    | "ref_removed"
    | "pressure_spike"
    | "production_requested"
    | "rule_change"
    | "assignment_activated"
    | "assignment_paused";
  description: string;
  severity:    "info" | "warning" | "critical";
  timestamp:   string;
  /** Optional: which reference triggered this event */
  refCode?:    string;
  /** Optional: which commercial line */
  lineName?:   string;
  /** Optional: numeric context (e.g. new coverage %, units) */
  value?:      number;
}

// ─── Aggregated view ────────────────────────────────────────────────────────────

/**
 * Full operational view of an owner's commercial coverage.
 * This is the primary data shape consumed by the UI (VendorCoverageCard).
 * Computed from: CoverageAssignment + SAG inventory + rules + pressure engine.
 */
export interface CommercialCoverageView {
  owner:      CommercialCoverageOwner;
  assignment: CoverageAssignment | null;
  health:     CoverageHealth;
  pressure:   CoveragePressure;
  timeline:   CoverageTimeline[];
}
