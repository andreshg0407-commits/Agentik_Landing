/**
 * lib/comercial/importaciones/import-policy-pack-config.ts
 *
 * FASE 8 — All configurable values for Import Policy Pack.
 * Never hardcoded in evaluators.
 *
 * Sprint: IMPORT-POLICY-PACK-01
 */

// ── Low rotation ────────────────────────────────────────────────────────────

export interface LowRotationConfig {
  /** Months without a new entry to consider low rotation */
  monthsThreshold: number;
  /** Equivalent days threshold (monthsThreshold * 30) */
  daysThreshold: number;
}

export const CASTILLITOS_LOW_ROTATION: LowRotationConfig = {
  monthsThreshold: 8,
  daysThreshold: 240,
};

// ── Repurchase ──────────────────────────────────────────────────────────────

export interface RepurchaseWeights {
  salesVolume: number;
  inventoryLevel: number;
  rotation: number;
  timeSinceEntry: number;
  trend: number;
}

export interface RepurchaseConfig {
  weights: RepurchaseWeights;
  /** Score threshold for REBUY */
  rebuyThreshold: number;
  /** Score threshold for WATCH (below this = DO_NOT_REBUY) */
  watchThreshold: number;
  /** Minimum sales to consider data sufficient */
  minimumSalesRequired: number;
}

export const CASTILLITOS_REPURCHASE: RepurchaseConfig = {
  weights: {
    salesVolume: 0.25,
    inventoryLevel: 0.25,
    rotation: 0.20,
    timeSinceEntry: 0.15,
    trend: 0.15,
  },
  rebuyThreshold: 65,
  watchThreshold: 35,
  minimumSalesRequired: 1,
};

// ── Next container ──────────────────────────────────────────────────────────

export interface NextContainerConfig {
  /** Maximum items in recommendation */
  maxItems: number;
  /** Minimum priority score for HIGH */
  highPriorityThreshold: number;
  /** Minimum priority score for MEDIUM (below = LOW) */
  mediumPriorityThreshold: number;
}

export const CASTILLITOS_NEXT_CONTAINER: NextContainerConfig = {
  maxItems: 50,
  highPriorityThreshold: 70,
  mediumPriorityThreshold: 40,
};

// ── Inventory aging ─────────────────────────────────────────────────────────

export interface InventoryAgingConfig {
  /** Days for NEW status */
  newDaysMax: number;
  /** Days for NORMAL status */
  normalDaysMax: number;
  /** Days for AGING status */
  agingDaysMax: number;
  /** Days for LOW_ROTATION (beyond this = OBSOLETE_CANDIDATE) */
  lowRotationDaysMax: number;
}

export const CASTILLITOS_INVENTORY_AGING: InventoryAgingConfig = {
  newDaysMax: 90,
  normalDaysMax: 180,
  agingDaysMax: 240,
  lowRotationDaysMax: 365,
};

// ── Alerts ──────────────────────────────────────────────────────────────────

export interface ImportAlertConfig {
  defaultSeverity: "info" | "warning" | "critical";
  lowRotationSeverity: "warning" | "critical";
  rebuySeverity: "info" | "warning";
  agingSeverity: "info" | "warning" | "critical";
  dataQualitySeverity: "info" | "warning";
}

export const CASTILLITOS_IMPORT_ALERTS: ImportAlertConfig = {
  defaultSeverity: "info",
  lowRotationSeverity: "warning",
  rebuySeverity: "info",
  agingSeverity: "warning",
  dataQualitySeverity: "info",
};

// ── Full config ─────────────────────────────────────────────────────────────

export interface ImportPolicyPackConfig {
  tenantId: string;
  version: string;
  lowRotation: LowRotationConfig;
  repurchase: RepurchaseConfig;
  nextContainer: NextContainerConfig;
  inventoryAging: InventoryAgingConfig;
  alerts: ImportAlertConfig;
}

export const CASTILLITOS_IMPORT_POLICY_PACK_CONFIG: ImportPolicyPackConfig = {
  tenantId: "castillitos",
  version: "1.0.0",
  lowRotation: CASTILLITOS_LOW_ROTATION,
  repurchase: CASTILLITOS_REPURCHASE,
  nextContainer: CASTILLITOS_NEXT_CONTAINER,
  inventoryAging: CASTILLITOS_INVENTORY_AGING,
  alerts: CASTILLITOS_IMPORT_ALERTS,
};
