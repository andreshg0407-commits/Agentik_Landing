/**
 * lib/comercial/produccion/production-planning-config.ts
 *
 * FASE 8 — All configurable values for Production Planning Policy Pack.
 * Never hardcoded in evaluators.
 *
 * Sprint: PRODUCTION-PLANNING-POLICY-PACK-01
 */

// ── Textile reorder ─────────────────────────────────────────────────────────

export interface TextileReorderConfig {
  /** Tenant-specific thresholds per brand */
  brandThresholds: Record<string, number>;
  /** Default threshold if brand not found */
  defaultThreshold: number;
}

export const CASTILLITOS_TEXTILE_REORDER: TextileReorderConfig = {
  brandThresholds: {
    CASTILLITOS: 100,
    "LATIN KIDS": 200,
  },
  defaultThreshold: 100,
};

// ── Priority scoring ────────────────────────────────────────────────────────

export interface PriorityWeights {
  inventoryDeficit: number;
  salesVolume: number;
  coverage: number;
  pendingOrders: number;
  maletas: number;
  tiendas: number;
}

export interface PriorityConfig {
  weights: PriorityWeights;
  criticalThreshold: number;
  highThreshold: number;
  mediumThreshold: number;
}

export const CASTILLITOS_PRIORITY: PriorityConfig = {
  weights: {
    inventoryDeficit: 0.30,
    salesVolume: 0.20,
    coverage: 0.15,
    pendingOrders: 0.15,
    maletas: 0.10,
    tiendas: 0.10,
  },
  criticalThreshold: 80,
  highThreshold: 60,
  mediumThreshold: 35,
};

// ── Shortage detection ──────────────────────────────────────────────────────

export interface ShortageConfig {
  /** Percentage below threshold to consider critical */
  criticalPct: number;
  /** Percentage below threshold to consider shortage */
  shortagePct: number;
}

export const CASTILLITOS_SHORTAGE: ShortageConfig = {
  criticalPct: 50,
  shortagePct: 80,
};

// ── Production health ───────────────────────────────────────────────────────

export interface ProductionHealthConfig {
  /** % of subgroups needing production to be CRITICAL */
  criticalPct: number;
  /** % of subgroups needing production to be AT_RISK */
  atRiskPct: number;
}

export const CASTILLITOS_PRODUCTION_HEALTH: ProductionHealthConfig = {
  criticalPct: 30,
  atRiskPct: 20,
};

// ── Alerts ──────────────────────────────────────────────────────────────────

export interface ProductionAlertConfig {
  productionRequiredSeverity: "warning" | "critical";
  waitOPSeverity: "info" | "warning";
  lowStockSeverity: "warning" | "critical";
  criticalShortageSeverity: "critical";
  dataQualitySeverity: "info" | "warning";
}

export const CASTILLITOS_PRODUCTION_ALERTS: ProductionAlertConfig = {
  productionRequiredSeverity: "warning",
  waitOPSeverity: "info",
  lowStockSeverity: "warning",
  criticalShortageSeverity: "critical",
  dataQualitySeverity: "info",
};

// ── Production Queue ────────────────────────────────────────────────────────

export interface ProductionQueueConfig {
  maxItems: number;
}

export const CASTILLITOS_PRODUCTION_QUEUE: ProductionQueueConfig = {
  maxItems: 100,
};

// ── Full config ─────────────────────────────────────────────────────────────

export interface ProductionPlanningConfig {
  tenantId: string;
  version: string;
  reorder: TextileReorderConfig;
  priority: PriorityConfig;
  shortage: ShortageConfig;
  health: ProductionHealthConfig;
  alerts: ProductionAlertConfig;
  queue: ProductionQueueConfig;
}

export const CASTILLITOS_PRODUCTION_PLANNING_CONFIG: ProductionPlanningConfig = {
  tenantId: "castillitos",
  version: "1.0.0",
  reorder: CASTILLITOS_TEXTILE_REORDER,
  priority: CASTILLITOS_PRIORITY,
  shortage: CASTILLITOS_SHORTAGE,
  health: CASTILLITOS_PRODUCTION_HEALTH,
  alerts: CASTILLITOS_PRODUCTION_ALERTS,
  queue: CASTILLITOS_PRODUCTION_QUEUE,
};
