/**
 * domains/inventory/inventory-snapshot.ts
 *
 * Point-in-time snapshots of inventory state.
 * Snapshots are immutable records of what inventory looked like at a moment.
 * Used for trend comparison, audit, and evidence chains.
 *
 * Sprint: INVENTORY-DOMAIN-01
 */

import type { InventoryPositionState, InventoryLocationType } from "./inventory-entities";

// -- Snapshot ---------------------------------------------------------------

export interface InventorySnapshot {
  /** Snapshot identifier (tenant + timestamp + sequence) */
  readonly snapshotId: string;
  /** Tenant scope */
  readonly tenantId: string;
  /** When this snapshot was captured */
  readonly capturedAt: Date;
  /** Source of the snapshot (sync run, manual, scheduled) */
  readonly captureSource: SnapshotCaptureSource;
  /** Correlation ID linking to the sync run that produced it */
  readonly correlationId: string;

  /** Aggregated totals at capture time */
  readonly summary: SnapshotSummary;

  /** Individual position records in this snapshot */
  readonly positions: SnapshotPosition[];
}

// -- Snapshot Summary -------------------------------------------------------

export interface SnapshotSummary {
  /** Total distinct references */
  readonly totalReferences: number;
  /** Total physical units across all locations */
  readonly totalPhysicalUnits: number;
  /** Total available units across all locations */
  readonly totalAvailableUnits: number;
  /** Total reserved units */
  readonly totalReservedUnits: number;
  /** Number of distinct locations with inventory */
  readonly locationCount: number;
  /** Number of references with zero availability */
  readonly exhaustedCount: number;
}

// -- Snapshot Position (lightweight record) ---------------------------------

export interface SnapshotPosition {
  /** Product reference code */
  readonly referenceCode: string;
  /** Location code */
  readonly locationCode: string;
  /** Location type */
  readonly locationType: InventoryLocationType;
  /** Position state */
  readonly state: InventoryPositionState;
  /** Physical quantity */
  readonly physicalQty: number;
  /** Available quantity */
  readonly availableQty: number;
  /** Reserved quantity */
  readonly reservedQty: number;
  /** Variant detail (null if product-level) */
  readonly sizeCode: string | null;
  readonly colorCode: string | null;
}

// -- Capture Source ---------------------------------------------------------

export type SnapshotCaptureSource =
  | "SYNC_RUN"
  | "MANUAL_UPLOAD"
  | "SCHEDULED"
  | "ON_DEMAND";

// -- Snapshot Comparison (for engines to use) --------------------------------

export interface SnapshotDelta {
  readonly referenceCode: string;
  readonly locationCode: string;
  readonly previousQty: number;
  readonly currentQty: number;
  readonly delta: number;
  readonly direction: "INCREASE" | "DECREASE" | "UNCHANGED";
  readonly previousSnapshotId: string;
  readonly currentSnapshotId: string;
}

export function computeSnapshotDelta(
  previous: SnapshotPosition,
  current: SnapshotPosition,
  previousSnapshotId: string,
  currentSnapshotId: string
): SnapshotDelta {
  const delta = current.availableQty - previous.availableQty;
  return {
    referenceCode: current.referenceCode,
    locationCode: current.locationCode,
    previousQty: previous.availableQty,
    currentQty: current.availableQty,
    delta,
    direction: delta > 0 ? "INCREASE" : delta < 0 ? "DECREASE" : "UNCHANGED",
    previousSnapshotId,
    currentSnapshotId,
  };
}
