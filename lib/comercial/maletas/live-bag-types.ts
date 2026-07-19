/**
 * lib/comercial/maletas/live-bag-types.ts
 *
 * Live Bag Architecture — domain model for maleta-centric commercial coverage.
 *
 * Replaces the rule-centric model with a maleta-first model:
 *   maleta activa → referencias objetivo → vendedores asignados
 *   → inventario SAG → presión real
 *
 * Rules (CommercialCoverageRule) remain as fallback/support, not center.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-LIVE-BAG-ARCHITECTURE-01
 */

// ─── Status enumerations ────────────────────────────────────────────────────────

export type MaletaStatus =
  | "borrador"    // being configured, not yet active
  | "activa"      // live — driving coverage calculations
  | "pausada"     // temporarily inactive
  | "archivada";  // closed season, historical only

export type MaletaOperationalState =
  | "ok"          // all refs above target
  | "presion"     // some refs below min
  | "critico"     // refs at zero or below with PD pressure
  | "sin_datos";  // no inventory loaded yet

export type PressureUrgency =
  | "alta"        // produce urgently — zero stock or critical PD pressure
  | "media"       // attention needed — approaching minimum
  | "baja"        // monitor — below ideal but above minimum
  | "estable";    // no action needed

// ─── Core entities ──────────────────────────────────────────────────────────────

/**
 * A maleta template defines the commercial standard for a season/campaign.
 * One maleta → one or more assigned salesReps → reference targets.
 *
 * PERSISTENCE: V1 = local state + seed data.
 * V2 = Prisma MaletaTemplate model (migration pending).
 */
export interface MaletaTemplate {
  id:        string;
  orgId:     string;
  name:      string;    // "Maleta Junio 2026"
  season:    string;    // "Junio 2026" | "Escolar 2026" | etc.
  startDate: string | null;
  endDate:   string | null;
  status:    MaletaStatus;
  notes:     string | null;
}

/**
 * Assignment of a salesRep to a maleta template.
 * A salesRep can have at most one active maleta per season.
 */
export interface MaletaAssignment {
  id:           string;
  maletaId:     string;
  salesRepId:   string;
  salesRepName: string;
  active:       boolean;
}

/**
 * A reference target within a maleta.
 * Defines how many units of a reference the maleta should carry.
 * When targetQty is set, this overrides the fallback coverage rule.
 */
export interface MaletaReferenceTarget {
  id:          string;
  maletaId:    string;
  reference:   string;   // SAG ref code UPPERCASE
  description: string;
  line:        string;   // "LT" | "CS"
  category:    string;
  productType: string;
  targetQty:   number;   // ideal units in maleta
  minQty:      number;   // minimum before alert fires
  priority:    number;   // 1 = highest
  active:      boolean;
}

/**
 * Computed coverage state for a reference within a maleta.
 * Produced by maletas-live-bag-engine.ts.
 */
export interface MaletaCoverageState {
  maletaId:               string;
  reference:              string;
  availableQty:           number;
  pendingPDQty:           number;
  targetQty:              number;
  minQty:                 number;
  /** 0–100: availableQty / targetQty * 100, capped at 100 */
  coveragePct:            number;
  operationalState:       MaletaOperationalState;
  suggestedProductionQty: number;
  affectedSalesRepIds:    string[];
}

/**
 * An aggregated production pressure item — one row in Block 4.
 * Groups all maletas/vendedores affected by a single reference shortage.
 */
export interface MaletaOperationalPressure {
  reference:              string;
  description:            string;
  line:                   string;
  suggestedProductionQty: number;
  urgency:                PressureUrgency;
  affectedMaletaIds:      string[];
  affectedMaletaNames:    string[];
  affectedSalesRepIds:    string[];
  affectedSalesRepNames:  string[];
  availableQty:           number;
  pendingPDQty:           number;
  /** 0–100 */
  coveragePct:            number;
  reason:                 string;
  nextAction:             "preparar_produccion" | "monitorear" | "sin_accion";
}

// ─── Seed data (PLACEHOLDER — replace with Prisma queries when schema ready) ────
//
// These templates represent a realistic configuration for Castillitos
// for illustration and development purposes.
// They are NOT real data and must be replaced before production use.
// When the MaletaTemplate Prisma model is added, seed via prisma/seed.ts.

export function getMaletaTemplateSeed(orgId: string): MaletaTemplate[] {
  const now = new Date().toISOString();
  void now;
  return [
    {
      id:        "maleta_junio_2026",
      orgId,
      name:      "Maleta Junio 2026",
      season:    "Junio 2026",
      startDate: "2026-06-01",
      endDate:   "2026-06-30",
      status:    "activa",
      notes:     null,
    },
    {
      id:        "maleta_escolar_2026",
      orgId,
      name:      "Maleta Escolar 2026",
      season:    "Escolar 2026",
      startDate: "2026-06-15",
      endDate:   "2026-08-15",
      status:    "activa",
      notes:     null,
    },
    {
      id:        "maleta_bebe_2026",
      orgId,
      name:      "Maleta Bebé 2026",
      season:    "Bebé 2026",
      startDate: "2026-06-01",
      endDate:   "2026-07-31",
      status:    "activa",
      notes:     null,
    },
  ];
}

/** Seed assignments — PLACEHOLDER */
export function getMaletaAssignmentSeed(): MaletaAssignment[] {
  return [
    { id: "asgn_1", maletaId: "maleta_junio_2026",   salesRepId: "DAVID",  salesRepName: "David Ramírez", active: true },
    { id: "asgn_2", maletaId: "maleta_escolar_2026", salesRepId: "LAURA",  salesRepName: "Laura Torres",  active: true },
    { id: "asgn_3", maletaId: "maleta_bebe_2026",    salesRepId: "ANDRES", salesRepName: "Andrés Mejía",  active: true },
  ];
}
