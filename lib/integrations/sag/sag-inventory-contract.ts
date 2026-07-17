/**
 * lib/integrations/sag/sag-inventory-contract.ts
 *
 * SAG Inventory Snapshot Contract Types.
 *
 * Defines the V1 manual-upload format and the normalized structures
 * that flow into CommercialCoverageSnapshot.
 *
 * ─── VERSION ROADMAP ──────────────────────────────────────────────────────────
 * V1 — Manual upload: POST rows[] directly to sync-inventory API (this file)
 * V2 — ODBC: SELECT * FROM INVENTARIO via sag-pya-soap query-catalog
 * V3 — Event push: SAG emits inventory events to Agentik webhook
 *
 * ─── DATA FLOW ────────────────────────────────────────────────────────────────
 * SagInventoryInputRow (V1 raw upload)
 *   → normalize (sag-inventory-normalizer.ts)
 *   → SagInventoryNormalizedRow (deduplicated, validated)
 *   → persist (sag-inventory-storage.ts)
 *   → CommercialCoverageSnapshot (Prisma)
 *
 * Sprint: AGENTIK-SAG-INVENTORY-SNAPSHOT-SYNC-01
 */

// ─── V1 raw input row ─────────────────────────────────────────────────────────

/**
 * A single SAG inventory row as received from a manual upload.
 *
 * This is the loosest form — all fields are optional so the normalizer
 * can produce precise validation errors rather than crashing on bad input.
 *
 * Required to produce a valid output row:
 *   refCode, description, disponible (or warehouseQty).
 */
export interface SagInventoryInputRow {
  /** SAG reference/product code */
  refCode?:          string;
  /** Product description */
  description?:      string;
  /** Commercial line — "LT" (Lencería/Tela) or "CS" (Confección/Sport) */
  line?:             string;
  /** SAG disponible — available after reservations */
  disponible?:       number;
  /** SAG bodega total (disponible + pedidos). Derived if not provided */
  warehouseQty?:     number;
  /** SAG pedidos/reservas — pending orders consuming stock */
  pendingOrdersQty?: number;
  /** Warehouse/bodega identifier (for V2 multi-bodega support) */
  bodega?:           string;
}

// ─── Normalized row ───────────────────────────────────────────────────────────

/**
 * Validated, normalized inventory row ready for persistence.
 * All fields are required — normalizer guarantees this shape.
 */
export interface SagInventoryNormalizedRow {
  /** UPPERCASE trimmed reference code */
  refCode:          string;
  description:      string;
  /** "LT" | "CS" | "OTRO" — resolved from SAG line code; "OTRO" when unresolvable */
  line:             "LT" | "CS" | "OTRO";
  /** Operational disponible — non-negative */
  disponible:       number;
  /** Total warehouse qty = disponible + pendingOrdersQty */
  warehouseQty:     number;
  /** Pending orders consuming stock */
  pendingOrdersQty: number;
  /** Inferred category from description heuristic */
  category:         string;
  /** Inferred product type from description heuristic */
  productType:      string;
  /** Source bodega label (for diagnostics) */
  bodega:           string;
  /** B01+B04 gross stock before deductions (INVENTORY-CRM-RESERVATION-LAYER-01) */
  physicalQty?:     number;
  /** CRM DRAFT reserved qty — PRODUCTO EN PROCESO only (INVENTORY-CRM-RESERVATION-LAYER-01) */
  crmReservedQty?:  number;
  /** SAG subgroup FK (CATALOG-SAG-SUBGROUP-ENRICHMENT-01) */
  subgrupoId?:      number;
  /** SAG subgroup resolved name (CATALOG-SAG-SUBGROUP-ENRICHMENT-01) */
  subgrupoSag?:     string;
}

// ─── Sync result ──────────────────────────────────────────────────────────────

export type SagInventorySyncStatus =
  | "success"
  | "partial"    // Some rows were invalid but at least one was persisted
  | "dry_run"    // Validation only — nothing persisted
  | "empty"      // Input was empty or all rows were invalid
  | "error";     // Unrecoverable error

/**
 * Full result of a SAG inventory sync operation.
 * Returned by the sync engine and the API endpoint.
 */
export interface SagInventorySyncResult {
  status:          SagInventorySyncStatus;
  /** ISO timestamp of the snapshot batch written */
  snapshotAt:      string | null;
  /** Number of valid references persisted (or would be if dryRun) */
  refsWritten:     number;
  /** Number of rows that failed validation */
  invalidRows:     number;
  /** Number of duplicate refCodes collapsed by deduplication */
  duplicateRows:   number;
  /** Warehouses present in input */
  warehouses:      string[];
  /** Elapsed time in milliseconds */
  durationMs:      number;
  /** Summary of validation errors (up to 20) */
  validationErrors: SagInventoryValidationError[];
  /** Whether this was a dry run (nothing persisted) */
  dryRun:          boolean;
  /** Error message if status === "error" */
  error?:          string;
}

export interface SagInventoryValidationError {
  /** Row index (0-based) */
  rowIndex:  number;
  /** Raw refCode from input (may be undefined) */
  refCode:   string | undefined;
  /** Human-readable reason */
  reason:    string;
}

// ─── Snapshot metadata ────────────────────────────────────────────────────────

/**
 * Metadata about the current CommercialCoverageSnapshot for an org.
 * Used by the diagnostics panel and the search debug strip.
 */
export interface SagInventorySnapshotMeta {
  /** Whether any snapshot exists */
  hasSnapshot:  boolean;
  /** ISO timestamp of the latest snapshot batch */
  snapshotAt:   string | null;
  /** Number of references in the snapshot */
  refCount:     number;
  /** Warehouses present in the snapshot (V2+) */
  warehouses:   string[];
  /** Age of snapshot in hours (null if no snapshot) */
  ageHours:     number | null;
  /** Whether snapshot is considered stale (>24h old) */
  isStale:      boolean;
}
