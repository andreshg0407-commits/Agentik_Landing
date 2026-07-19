/**
 * lib/connectors/adapters/sag-pya-soap/catalog/sag-variants-types.ts
 *
 * Type contracts for SAG variant model.
 *
 * Variant model (confirmed via forensics 2026-06-23):
 *   - No dedicated variant/inventory balance table exists
 *   - Variants live in MOVIMIENTOS_ITEMS: ka_nl_articulo + ss_talla + ss_color + ka_nl_bodega
 *   - Stock = SUM(signed n_cantidad) from MOVIMIENTOS_ITEMS + MOVIMIENTOS + FUENTES
 *   - Sign comes from FUENTES.sc_signo_inventario ('+' or '-')
 *   - Only non-anulado movements count (MOVIMIENTOS.sc_anulado = 'N')
 *   - Each variant has a ka_nl_sku (64,254 distinct values)
 *
 * Sprint: SAG-VARIANTS-01
 */

// ── Raw row from computed inventory query ───────────────────────────────────

export interface SagVariantRawRow {
  /** Article code (from ARTICULOS.k_sc_codigo_articulo via JOIN) */
  k_sc_codigo_articulo?: unknown;
  /** Article name */
  sc_detalle_articulo?: unknown;
  /** Size code (from MOVIMIENTOS_ITEMS.ss_talla) — e.g. "6-9", "12-18", "T2", "XS" */
  ss_talla?: unknown;
  /** Color code (from MOVIMIENTOS_ITEMS.ss_color) — e.g. "BL1", "AZ1", "RO1" */
  ss_color?: unknown;
  /** Warehouse PK (from MOVIMIENTOS_ITEMS.ka_nl_bodega) */
  ka_nl_bodega?: unknown;
  /** Computed stock balance: SUM(signed n_cantidad) */
  saldo?: unknown;
  /** SKU PK from MOVIMIENTOS_ITEMS.ka_nl_sku */
  ka_nl_sku?: unknown;
  /** Catch-all */
  [key: string]: unknown;
}

// ── Normalized variant ──────────────────────────────────────────────────────

export interface SagVariantNormalized {
  /** ARTICULOS.k_sc_codigo_articulo (uppercase, trimmed) */
  productCode:    string;
  /** Same as productCode — no separate reference code in SAG */
  referenceCode:  string;
  /** MOVIMIENTOS_ITEMS.ka_nl_sku — numeric PK for this variant */
  skuId:          number;
  /** Size code from ss_talla (e.g. "6-9", "T2") */
  sizeCode:       string;
  /** Size resolved name from TALLAS lookup (e.g. "6-9" → "6-9") */
  sizeName:       string;
  /** Color code from ss_color (e.g. "BL1") */
  colorCode:      string;
  /** Color resolved name from COLORES lookup (e.g. "BL1" → "BLANCO") */
  colorName:      string;
  /** Warehouse numeric PK */
  warehouseId:    number;
  /** Warehouse code from BODEGAS lookup */
  warehouseCode:  string;
  /** Warehouse name from BODEGAS lookup */
  warehouseName:  string;
  /** Computed stock balance (can be negative for tracking discrepancies) */
  available:      number;
}

// ── Aggregated variant inventory (across warehouses) ────────────────────────

export interface SagVariantInventory {
  productCode:    string;
  sizeCode:       string;
  sizeName:       string;
  colorCode:      string;
  colorName:      string;
  /** Total stock across all warehouses */
  totalAvailable: number;
  /** Breakdown per warehouse */
  warehouses:     SagVariantWarehouseInventory[];
}

export interface SagVariantWarehouseInventory {
  warehouseId:    number;
  warehouseCode:  string;
  warehouseName:  string;
  available:      number;
}

// ── Sync result ─────────────────────────────────────────────────────────────

export interface SagVariantSyncResult {
  /** Total raw variant rows from computed query */
  totalRows:          number;
  /** Distinct products with variant data */
  distinctProducts:   number;
  /** Distinct variant combinations (product × talla × color) */
  distinctVariants:   number;
  /** Distinct warehouses with stock */
  distinctWarehouses: number;
  /** Normalized variant entries */
  variants:           SagVariantNormalized[];
  /** Aggregated inventory per variant (across warehouses) */
  inventory:          SagVariantInventory[];
  /** Elapsed time */
  durationMs:         number;
  /** Whether this was a dry run */
  dryRun:             boolean;
  /** Errors during normalization */
  errors:             number;
}

// ── Inventory computation query ─────────────────────────────────────────────

/**
 * The SQL query that computes current stock from MOVIMIENTOS_ITEMS.
 *
 * This is the definitive inventory computation pattern for SAG PYA.
 * There is NO dedicated inventory balance table — stock must be computed
 * from the sum of signed transaction quantities.
 */
export const SAG_VARIANT_INVENTORY_QUERY = `
SELECT
  A.k_sc_codigo_articulo,
  A.sc_detalle_articulo,
  MI.ss_talla,
  MI.ss_color,
  MI.ka_nl_bodega,
  MI.ka_nl_sku,
  SUM(CASE WHEN F.sc_signo_inventario = '+' THEN MI.n_cantidad ELSE -MI.n_cantidad END) AS saldo
FROM MOVIMIENTOS_ITEMS MI
INNER JOIN MOVIMIENTOS M ON MI.ka_nl_movimiento = M.ka_nl_movimiento
INNER JOIN FUENTES F ON M.ka_ni_fuente = F.ka_ni_fuente
INNER JOIN ARTICULOS A ON MI.ka_nl_articulo = A.ka_nl_articulo
WHERE F.sc_afecta_inventario = 'S'
  AND M.sc_anulado = 'N'
  AND A.sc_activo = 'S'
  AND A.sc_bloqueado = 'N'
  AND A.n_valor_venta_normal > 0
  AND A.sc_maneja_kardex = 'S'
GROUP BY A.k_sc_codigo_articulo, A.sc_detalle_articulo, MI.ss_talla, MI.ss_color, MI.ka_nl_bodega, MI.ka_nl_sku
HAVING SUM(CASE WHEN F.sc_signo_inventario = '+' THEN MI.n_cantidad ELSE -MI.n_cantidad END) <> 0
ORDER BY A.k_sc_codigo_articulo, MI.ss_talla, MI.ss_color, MI.ka_nl_bodega
`.trim();
