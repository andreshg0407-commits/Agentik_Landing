/**
 * lib/comercial/inventory/inventory-types.ts
 *
 * Domain types for Agentik's enterprise inventory layer.
 *
 * Represents the current stock snapshot: product → variant → warehouse → available.
 * Source-agnostic — works with SAG, Shopify, or any future ERP.
 *
 * Sprint: SAG-INVENTORY-SYNC-01
 */

// ── Warehouse snapshot ──────────────────────────────────────────────────────

export interface InventoryWarehouseSnapshot {
  warehouseId:   string;
  warehouseCode: string;
  warehouseName: string;
  available:     number;
  reserved:      number;
  syncedAt:      Date;
}

// ── Variant snapshot ────────────────────────────────────────────────────────

export interface InventoryVariantSnapshot {
  variantId:       string;  // Prisma ProductVariant.id
  productCode:     string;
  sizeCode:        string;
  sizeName:        string;
  colorCode:       string;
  colorName:       string;
  /** Total available across all warehouses */
  totalAvailable:  number;
  /** Total reserved across all warehouses */
  totalReserved:   number;
  /** Per-warehouse breakdown */
  warehouses:      InventoryWarehouseSnapshot[];
}

// ── Product-level inventory snapshot ────────────────────────────────────────

export interface InventorySnapshot {
  productId:       string;  // Prisma ProductEntity.id
  productCode:     string;
  productName:     string;
  /** Total available across all variants and warehouses */
  totalAvailable:  number;
  /** Total reserved across all variants and warehouses */
  totalReserved:   number;
  /** Number of variants with stock > 0 */
  variantsInStock: number;
  /** Total variants (including out of stock) */
  variantsTotal:   number;
  /** Per-variant breakdown */
  variants:        InventoryVariantSnapshot[];
}

// ── Sync result ─────────────────────────────────────────────────────────────

export interface InventorySyncResult {
  status:              "success" | "partial" | "error" | "dry_run" | "empty";
  /** Products processed */
  productsProcessed:   number;
  /** Products not found in ProductEntity (skipped) */
  productsNotFound:    number;
  /** ProductVariant records created */
  variantsCreated:     number;
  /** ProductVariant records updated */
  variantsUpdated:     number;
  /** ProductInventoryLevel records created */
  levelsCreated:       number;
  /** ProductInventoryLevel records updated */
  levelsUpdated:       number;
  /** ProductInventoryLevel records zeroed (stock became 0) */
  levelsZeroed:        number;
  /** Distinct warehouses in the sync */
  warehousesSynced:    number;
  /** Errors during sync */
  errors:              number;
  /** Duration */
  durationMs:          number;
  /** Whether this was a dry run */
  dryRun:              boolean;
  /** Error message if status = "error" */
  error?:              string;
}

// ── Coverage indicators ─────────────────────────────────────────────────────

export interface InventoryCoverageIndicators {
  /** Products with at least one variant in stock */
  productsWithStock:      number;
  /** Products with zero stock across all variants */
  productsOutOfStock:     number;
  /** Total commercial products */
  productsTotal:          number;
  /** Variants with stock > 0 */
  variantsInStock:        number;
  /** Variants with stock = 0 */
  variantsOutOfStock:     number;
  /** Total variants */
  variantsTotal:          number;
  /** Warehouses with at least one variant in stock */
  warehousesWithStock:    number;
  /** Total warehouses */
  warehousesTotal:        number;
  /** Total snapshot records (ProductInventoryLevel rows) */
  snapshotRecords:        number;
  /** Coverage ratio: productsWithStock / productsTotal */
  coverageRatio:          number;
  /** Computed at */
  computedAt:             Date;
}

// ── Query params ────────────────────────────────────────────────────────────

export interface InventorySearchParams {
  orgId:          string;
  /** Filter by product code (exact) */
  productCode?:   string;
  /** Filter by warehouse ID */
  warehouseId?:   string;
  /** Filter by size code */
  sizeCode?:      string;
  /** Filter by color code */
  colorCode?:     string;
  /** Only show variants with stock > 0 */
  inStockOnly?:   boolean;
  /** Limit */
  limit?:         number;
  /** Offset */
  offset?:        number;
}
