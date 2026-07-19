/**
 * lib/operational-inventory/operational-inventory-boundary.ts
 *
 * Operational Inventory Boundary — the single gateway for all inventory reads.
 *
 * ─── ARCHITECTURAL RULE ────────────────────────────────────────────────────
 * NO commercial module, no Sales Portfolio engine, no pressure engine may read
 * SAG inventory data directly. ALL reads must pass through this boundary.
 *
 * This ensures:
 *   1. SAG adapter can change without breaking business logic
 *   2. Source switching (ODBC → live API → cached) is transparent
 *   3. Operational formulae are applied consistently
 *   4. Staleness and trust levels are enforced uniformly
 *
 * Current implementation: V1 — delegates to the SAG Excel adapter.
 * Future: swap `getPhysicalInventoryFromSag` for ODBC/live queries.
 *
 * Sprint: AGENTIK-SAG-OPERATIONAL-CONTRACT-01
 * ───────────────────────────────────────────────────────────────────────────
 */

import type {
  OperationalInventorySnapshot,
  OperationalInventoryItem,
  OperationalAvailability,
  OperationalReservation,
  OperationalInventorySource,
} from "./operational-inventory-types";
import { applyReservationsToInventory } from "./operational-reservation-engine";

// ─── Boundary interface ───────────────────────────────────────────────────────

/**
 * The contract that all inventory consumers must use.
 * Implementations: SagExcelBoundary (V1), SagOdbcBoundary (V2), SagLiveBoundary (V3).
 */
export interface IOperationalInventoryBoundary {
  /**
   * Returns the physical inventory snapshot from SAG.
   * This is the raw physical count — NOT operational availability.
   * Agentik will subtract reservations and assignments before using it operationally.
   */
  getPhysicalInventory(
    organizationId: string,
    filters?:       InventoryFilters,
  ): Promise<OperationalInventorySnapshot>;

  /**
   * Returns the full operational inventory — physical snapshot combined with
   * Agentik's own reservations and Sales Portfolio assignments.
   *
   * This is the primary source for Sales Portfolio construction and pressure computation.
   * Use this — never the SAG snapshot directly.
   */
  getOperationalInventory(
    organizationId: string,
    options?:       OperationalInventoryOptions,
  ): Promise<OperationalInventoryItem[]>;

  /**
   * Returns inventory movements (kardex entries) from SAG for a time window.
   * Used for velocity computation and trend analysis.
   */
  getInventoryMovements(
    organizationId: string,
    from:           Date,
    to:             Date,
    reference?:     string,
  ): Promise<InventoryMovement[]>;

  /**
   * Returns pending SAG orders (PD — Pedidos) for the org.
   * Used to inform production pressure calculations.
   * Note: not all SAG configs deduct PD from disponible — always read PD separately.
   */
  getPendingOrders(
    organizationId: string,
    reference?:     string,
  ): Promise<PendingOrder[]>;

  /**
   * Returns the operational availability for a single reference.
   * This is the result of applying Agentik's formula:
   *   operationalAvailableQty = physicalQty - reservedQty - salesAssignedQty - pendingTransfersQty
   *
   * Use this for:
   *   - Validating new Sales Portfolio assignments
   *   - Checking order fulfillability
   *   - Production signal computation
   */
  getOperationalAvailability(
    organizationId: string,
    reference:      string,
  ): Promise<OperationalAvailability>;

  /**
   * Returns the source and freshness metadata for this boundary instance.
   */
  getSourceMetadata(): OperationalBoundaryMetadata;
}

// ─── Supporting types ─────────────────────────────────────────────────────────

export interface InventoryFilters {
  line?:        string;
  category?:    string;
  reference?:   string;
  /** Only return items with physicalQty > 0 */
  withStockOnly?: boolean;
}

export interface OperationalInventoryOptions {
  /** Include SAG's reported disponible for comparison (not for operational use) */
  includeSagReported?: boolean;
  /** Apply Agentik reservations to compute operationalAvailableQty */
  applyReservations?:  boolean;
  /** Apply Sales Portfolio assignments */
  applyPortfolios?:    boolean;
}

export interface InventoryMovement {
  reference:      string;
  movementType:   "entrada" | "salida" | "ajuste" | "transferencia" | "devolucion";
  qty:            number;
  /** Positive = stock increase, negative = decrease */
  netEffect:      number;
  documentRef:    string | null;  // F1/F2/NC reference
  movementAt:     string;         // ISO timestamp
  warehouseId:    string | null;
  source:         OperationalInventorySource;
}

export interface PendingOrder {
  reference:      string;
  orderRef:       string;         // SAG PD reference
  salesRepId:     string | null;
  qtyOrdered:     number;
  qtyPending:     number;
  /** ISO date */
  requestedAt:    string;
  /** Whether SAG has this deducted from available (parametric) */
  deductedInSag:  boolean | null; // null = unknown
  status:         "autorizado" | "pendiente" | "parcial" | "cancelado";
}

export interface OperationalBoundaryMetadata {
  source:          OperationalInventorySource;
  version:         string;
  /** True if the boundary can return live data */
  isLive:          boolean;
  /** Typical freshness in seconds */
  typicalFreshnessSec: number;
  description:     string;
}

// ─── V1 implementation — delegates to SAG Excel adapter ──────────────────────

/**
 * V1 Operational Inventory Boundary.
 * Reads from the SAG Excel/CSV import adapter.
 * Does NOT support live reads, movements, or pending orders yet.
 *
 * Replace with SagOdbcBoundary (V2) when ODBC access is confirmed.
 */
export class SagExcelOperationalBoundary implements IOperationalInventoryBoundary {
  private readonly organizationId: string;
  private readonly sagSnapshot: OperationalInventoryItem[];
  private readonly snapshotAt: string;
  /**
   * Active Agentik reservations deducted from operationalAvailableQty.
   * V1: passed at construction time (no live DB query).
   * V2: fetched from DB inside getOperationalInventory.
   */
  private readonly activeReservations: OperationalReservation[];

  constructor(
    organizationId:     string,
    sagSnapshot:        OperationalInventoryItem[],
    snapshotAt:         string,
    activeReservations: OperationalReservation[] = [],
  ) {
    this.organizationId    = organizationId;
    this.sagSnapshot       = sagSnapshot;
    this.snapshotAt        = snapshotAt;
    this.activeReservations = activeReservations;
  }

  async getPhysicalInventory(
    organizationId: string,
    _filters?:      InventoryFilters,
  ): Promise<OperationalInventorySnapshot> {
    void organizationId;
    return {
      organizationId:    this.organizationId,
      snapshotAt:        this.snapshotAt,
      source:            "sag_excel_import",
      isStale:           this._isStale(),
      staleThresholdSec: 3600,
      items:             this.sagSnapshot,
      warnings:          this._isStale()
        ? ["SAG snapshot is older than 1 hour — refresh before making critical assignments"]
        : [],
    };
  }

  async getOperationalInventory(
    _organizationId: string,
    options?:        OperationalInventoryOptions,
  ): Promise<OperationalInventoryItem[]> {
    const applyRes = options?.applyReservations !== false; // default: true
    if (applyRes && this.activeReservations.length > 0) {
      // Deduct Agentik's operational reservations from the snapshot
      return applyReservationsToInventory(this.sagSnapshot, this.activeReservations);
    }
    return this.sagSnapshot;
  }

  async getInventoryMovements(
    _organizationId: string,
    _from:           Date,
    _to:             Date,
    _reference?:     string,
  ): Promise<InventoryMovement[]> {
    // V1: not supported — requires ODBC/SAG API access
    return [];
  }

  async getPendingOrders(
    _organizationId: string,
    _reference?:     string,
  ): Promise<PendingOrder[]> {
    // V1: not supported
    return [];
  }

  async getOperationalAvailability(
    _organizationId: string,
    reference:       string,
  ): Promise<OperationalAvailability> {
    const refUpper = reference.toUpperCase();
    const item = this.sagSnapshot.find(i => i.reference.toUpperCase() === refUpper);
    const physicalQty = item?.physicalQty ?? 0;

    // Add Agentik's own active reservations on top of the SAG snapshot
    const agentikReserved = this.activeReservations
      .filter(r => r.status === "active" && r.reference.toUpperCase() === refUpper)
      .reduce((sum, r) => sum + (r.qtyReserved - r.qtyReleased - r.qtyConsumed), 0);

    const totalReservedQty     = (item?.reservedQty ?? 0) + agentikReserved;
    const salesAssignedQty     = item?.salesAssignedQty    ?? 0;
    const pendingTransfersQty  = item?.pendingTransfersQty ?? 0;
    const operationalAvailableQty = Math.max(
      0,
      physicalQty - totalReservedQty - salesAssignedQty - pendingTransfersQty,
    );

    return {
      reference:               refUpper,
      organizationId:          this.organizationId,
      physicalQty,
      salesAssignedQty,
      reservedQty:             totalReservedQty,
      pendingTransfersQty,
      operationalAvailableQty,
      hasActivePressure:       (item?.portfoliosUnderPressure ?? 0) > 0 || operationalAvailableQty === 0,
      computedAt:              new Date().toISOString(),
      source:                  "sag_excel_import",
    };
  }

  getSourceMetadata(): OperationalBoundaryMetadata {
    return {
      source:              "sag_excel_import",
      version:             "1.0",
      isLive:              false,
      typicalFreshnessSec: 3600,
      description:         "V1: SAG inventory read from Excel/CSV import. Not real-time.",
    };
  }

  private _isStale(): boolean {
    const ageMs = Date.now() - new Date(this.snapshotAt).getTime();
    return ageMs > 3600 * 1000;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Build the appropriate boundary for the current deployment context.
 *
 * V1: always returns SagExcelOperationalBoundary.
 * V2: check env flag → SagOdbcBoundary.
 * V3: check env flag → SagLiveBoundary.
 */
export function createOperationalInventoryBoundary(
  organizationId:     string,
  sagSnapshot:        OperationalInventoryItem[],
  snapshotAt:         string,
  activeReservations: OperationalReservation[] = [],
): IOperationalInventoryBoundary {
  // V1: only Excel adapter available
  // TODO V2: if (process.env.SAG_ODBC_DSN) return new SagOdbcBoundary(...)
  return new SagExcelOperationalBoundary(organizationId, sagSnapshot, snapshotAt, activeReservations);
}

// ─── Re-export types for convenience ─────────────────────────────────────────

export type { OperationalReservation };
