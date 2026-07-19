/**
 * production-types.ts
 *
 * PRODUCTION-SYNC-01A — Domain types for the Production Order read model.
 * These types represent the normalized OP snapshot that lives in Agentik,
 * NOT SAG's raw data model.
 */

// ── Status ────────────────────────────────────────────────────────────────────

export type ProductionOrderStatus = "open" | "closed" | "unknown";

// ── Snapshots ─────────────────────────────────────────────────────────────────

/** Normalized OP header ready for persistence. */
export interface ProductionOrderSnapshot {
  erpMovId: number;
  documentNumber: string;
  sourceCode: string;
  sourceName: string;
  status: ProductionOrderStatus;
  isClosed: boolean;
  documentDate: Date;
  createdBy: string | null;
  remisionRef: string | null;
  warehouseCode: string | null;
  warehouseName: string | null;
  rawJson: Record<string, unknown>;
  lines: ProductionOrderLineSnapshot[];
}

/** Normalized OP line item ready for persistence. */
export interface ProductionOrderLineSnapshot {
  erpItemId: number;
  referenceCode: string;
  productName: string | null;
  size: string | null;
  color: string | null;
  quantityOrdered: number;
  unitCost: number | null;
  lineTotal: number | null;
  rawJson: Record<string, unknown>;
}

// ── Sync result ───────────────────────────────────────────────────────────────

export interface ProductionSyncMetrics {
  ordersRead: number;
  ordersCreated: number;
  ordersUpdated: number;
  ordersSkipped: number;
  linesRead: number;
  linesCreated: number;
  linesUpdated: number;
  linesSkipped: number;
  errors: ProductionSyncError[];
  durationMs: number;
}

export interface ProductionSyncError {
  erpMovId?: number;
  erpItemId?: number;
  documentNumber?: string;
  message: string;
}

export interface ProductionSyncResult {
  success: boolean;
  dryRun: boolean;
  metrics: ProductionSyncMetrics;
  /** Date range that was synced (null = full sync). */
  sinceDate: Date | null;
}
