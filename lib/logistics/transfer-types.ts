/**
 * transfer-types.ts
 *
 * CASTILLITOS-LOGISTICS-SYNC-01 — Domain types for the Inventory Transfer read model.
 * Covers fuente 34 (TR = Traslado entre Bodegas) and fuente 206 (TM = Traslado de Maletas).
 *
 * These types represent the normalized transfer snapshot that lives in Agentik,
 * NOT SAG's raw data model.
 */

// ── Transfer Type ────────────────────────────────────────────────────────────

/** TR = inter-warehouse transfer, TM = seller maleta transfer */
export type TransferType = "TR" | "TM";

/** open | closed | unknown — derived from sc_dcto_cerrado */
export type TransferStatus = "open" | "closed" | "unknown";

// ── Snapshots ────────────────────────────────────────────────────────────────

/** Normalized transfer header ready for persistence. */
export interface TransferSnapshot {
  erpMovId: number;
  documentNumber: string;
  transferType: TransferType;
  sourceCode: string;
  sourceName: string;
  status: TransferStatus;
  isClosed: boolean;
  documentDate: Date;
  createdBy: string | null;
  remisionRef: string | null;
  /** ka_nl_bodega — origin warehouse code */
  originWarehouseCode: string | null;
  /** Resolved origin warehouse name */
  originWarehouseName: string | null;
  /** ka_nl_bodega_destino_wms — destination warehouse code (from MOVIMIENTOS_ITEMS) */
  destinationWarehouseCode: string | null;
  /** Resolved destination warehouse name */
  destinationWarehouseName: string | null;
  rawJson: Record<string, unknown>;
  lines: TransferLineSnapshot[];
}

/** Normalized transfer line item ready for persistence. */
export interface TransferLineSnapshot {
  erpItemId: number;
  referenceCode: string;
  productName: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  unitCost: number | null;
  lineTotal: number | null;
  /** ka_nl_bodega_destino — per-line destination warehouse (from movimientos_traslados) */
  destinationWarehouseCode: string | null;
  rawJson: Record<string, unknown>;
}

// ── Sync result ──────────────────────────────────────────────────────────────

export interface TransferSyncMetrics {
  transfersRead: number;
  transfersCreated: number;
  transfersUpdated: number;
  transfersSkipped: number;
  linesRead: number;
  linesCreated: number;
  linesUpdated: number;
  linesSkipped: number;
  errors: TransferSyncError[];
  durationMs: number;
}

export interface TransferSyncError {
  erpMovId?: number;
  erpItemId?: number;
  documentNumber?: string;
  message: string;
}

export interface TransferSyncResult {
  success: boolean;
  dryRun: boolean;
  metrics: TransferSyncMetrics;
  /** Which transfer types were synced */
  transferTypes: TransferType[];
  /** Date range that was synced (null = full sync). */
  sinceDate: Date | null;
}
