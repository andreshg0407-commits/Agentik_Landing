/**
 * business-entity-health.ts
 *
 * BUSINESS-ENTITIES-CORE-01
 * Multi-dimensional health model for Digital Business Entities.
 *
 * A single entity can have good commercial health but degraded
 * inventory health. This model captures that nuance.
 *
 * No Prisma. No React. Pure domain types.
 */

// ── Health Dimension Level ───────────────────────────────────────────────────

/** Health level for a single dimension. */
export type HealthDimensionLevel =
  | "healthy"
  | "degraded"
  | "critical"
  | "unavailable"
  | "unknown";

// ── Health Dimension ─────────────────────────────────────────────────────────

/** A single health dimension with its level and optional detail. */
export interface HealthDimension {
  level: HealthDimensionLevel;
  /** Human-readable detail about this dimension's state. */
  detail: string | null;
  /** ISO timestamp of last evaluation. */
  evaluatedAt: string;
}

// ── Business Entity Health ───────────────────────────────────────────────────

/**
 * Multi-dimensional health assessment of a business entity.
 *
 * Not all dimensions apply to every entity type:
 * - LiveVendor uses: overall, commercial, inventory, operational
 * - LiveProduct uses: overall, commercial, inventory, production
 * - LiveStore uses: overall, commercial, inventory, operational
 * - LiveProductionOrder uses: overall, production, operational
 *
 * Unused dimensions should be set to { level: "unavailable", detail: null }.
 */
export interface BusinessEntityHealth {
  /** Composite overall health. */
  overall: HealthDimension;
  /** Commercial performance health. */
  commercial: HealthDimension;
  /** Inventory/stock health. */
  inventory: HealthDimension;
  /** Production health. */
  production: HealthDimension;
  /** Financial health (receivables, payables, cash flow). */
  financial: HealthDimension;
  /** General operational health. */
  operational: HealthDimension;
  /** Data sync health. */
  sync: HealthDimension;
  /** AI analysis health (is copilot context fresh?). */
  ai: HealthDimension;
}

// ── Health Helpers ───────────────────────────────────────────────────────────

const HEALTH_ORDER: Record<HealthDimensionLevel, number> = {
  critical: 0,
  degraded: 1,
  healthy: 2,
  unknown: 3,
  unavailable: 4,
};

/** Create a dimension marked as unavailable (not applicable to this entity). */
export function unavailableDimension(): HealthDimension {
  return { level: "unavailable", detail: null, evaluatedAt: new Date().toISOString() };
}

/** Create a dimension with a specific level. */
export function buildDimension(
  level: HealthDimensionLevel,
  detail?: string | null,
): HealthDimension {
  return { level, detail: detail ?? null, evaluatedAt: new Date().toISOString() };
}

/** Compute overall health from individual dimensions (ignoring unavailable). */
export function computeOverallHealth(
  dimensions: HealthDimension[],
): HealthDimensionLevel {
  const applicable = dimensions.filter(d => d.level !== "unavailable");
  if (applicable.length === 0) return "unknown";

  return applicable.reduce<HealthDimensionLevel>((worst, d) =>
    HEALTH_ORDER[d.level] < HEALTH_ORDER[worst] ? d.level : worst,
    "healthy",
  );
}

/** Build a default health object with all dimensions unavailable. */
export function emptyHealth(): BusinessEntityHealth {
  const ua = unavailableDimension;
  return {
    overall: ua(),
    commercial: ua(),
    inventory: ua(),
    production: ua(),
    financial: ua(),
    operational: ua(),
    sync: ua(),
    ai: ua(),
  };
}
