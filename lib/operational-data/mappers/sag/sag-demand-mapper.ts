/**
 * lib/operational-data/mappers/sag/sag-demand-mapper.ts
 *
 * Maps SAG-originated demand signals to OperationalDemandSignal.
 *
 * SAG contributes to demand through:
 *   - CoverageSnapshot (coverage pressure per reference)
 *   - CommercialProductionSignal (multi-vendor depletion from the bag engine)
 *
 * Sprint: AGENTIK-OPERATIONAL-DATA-LAYER-01
 */

import type { OperationalDemandSignal } from "../../operational-entities";

// ─── CommercialCoverageSnapshot → OperationalDemandSignal ────────────────────

/**
 * Shape expected from the CommercialCoverageSnapshot Prisma model.
 * Only the fields needed for demand signal mapping.
 */
export interface SagCoverageSnapshotRow {
  organizationId:   string;
  refCode:          string;
  description:      string;
  line:             string;
  disponible:       number;
  dailyVelocity:    number | null;
  coverageDays:     number | null;
  status:           string;
  affectedRepIds?:  string[];
  pendingOrdersQty?: number;
}

export function mapSagCoverageToOperationalDemand(
  row:            SagCoverageSnapshotRow,
  computedAt:     string,
): OperationalDemandSignal | null {
  // Only emit demand signals for critical/high-pressure states
  const isSignal = ["ruptura_inminente", "cobertura_baja", "sin_stock"].includes(row.status);
  if (!isSignal) return null;

  const urgency: OperationalDemandSignal["urgency"] =
    row.status === "sin_stock"         ? "alta" :
    row.status === "ruptura_inminente" ? "alta" :
    row.status === "cobertura_baja"    ? "media" : "baja";

  const qtyNeeded = row.status === "sin_stock"
    ? (row.pendingOrdersQty ?? 0)
    : Math.max(0, Math.ceil((row.dailyVelocity ?? 0) * 30) - row.disponible);

  return {
    organizationId:        row.organizationId,
    reference:             row.refCode.toUpperCase(),
    description:           row.description,
    line:                  row.line,
    signalType:            "inventory_pressure",
    urgency,
    qtyNeeded,
    velocityPerDay:        row.dailyVelocity,
    coverageDaysEstimate:  row.coverageDays,
    sourcePressures: [{
      source:     "sag",
      signalType: "coverage_snapshot",
      weight:     0.85,
    }],
    affectedSalesReps:        row.affectedRepIds ?? [],
    openOpportunityCount:     0,   // CRM layer adds this in Phase 3
    computedAt,
    escalatedToProduction:    false,
  };
}

// ─── CommercialProductionSignal → OperationalDemandSignal ────────────────────

/**
 * Shape expected from the CommercialProductionSignal Prisma model.
 */
export interface SagProductionSignalRow {
  organizationId:       string;
  reference:            string;
  description:          string;
  line:                 string;
  urgency:              string;
  totalMissing:         number;
  suggestedQty:         number;
  affectedSalesRepCount: number;
  coverageDaysRemaining?: number | null;
}

export function mapSagProductionSignalToOperationalDemand(
  row:        SagProductionSignalRow,
  computedAt: string,
): OperationalDemandSignal {
  const urgency: OperationalDemandSignal["urgency"] =
    row.urgency === "critica" || row.urgency === "urgente" ? "alta" :
    row.urgency === "alta"    ? "media" : "baja";

  return {
    organizationId:        row.organizationId,
    reference:             row.reference.toUpperCase(),
    description:           row.description,
    line:                  row.line,
    signalType:            "inventory_pressure",
    urgency,
    qtyNeeded:             row.suggestedQty,
    velocityPerDay:        null,
    coverageDaysEstimate:  row.coverageDaysRemaining ?? null,
    sourcePressures: [{
      source:     "sag",
      signalType: "production_signal",
      weight:     0.90,
    }],
    affectedSalesReps:        [],
    openOpportunityCount:     0,
    computedAt,
    escalatedToProduction:    urgency === "alta",
  };
}
