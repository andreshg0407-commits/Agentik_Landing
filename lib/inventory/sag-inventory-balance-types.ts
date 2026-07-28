/**
 * lib/inventory/sag-inventory-balance-types.ts
 *
 * AGENTIK-INVENTORY-SAG-VIEW-CERTIFICATION-AND-SHADOW-INTEGRATION-01
 *
 * Canonical types for SAG inventory balances from vw_agentik_inventario.
 *
 * Granularity: REFERENCIA + BODEGA (not variant-level).
 * Source: SAG SQL view with 7 CTEs. Certified 210/210 MATCH against base tables.
 *
 * Identity: PROVISIONAL — uses CODIGO_PRODUCTO (referenceCode) as key.
 *   ka_nl_articulo is NOT exposed by the view.
 *   1:1 mapping confirmed via identity resolution test.
 *
 * No Prisma. No React. No server-only. Pure types + pure functions.
 */

// ── SAG View Row (raw shape from vw_agentik_inventario) ──────────────────

export interface SagInventoryViewRow {
  /** k_sc_codigo_articulo — reference code (e.g., "L-1234") */
  CODIGO_PRODUCTO: string;
  /** sc_detalle_articulo — product name */
  PRODUCTO: string | null;
  /** ss_linea — commercial line (e.g., "LATIN KIDS") */
  LINEA: string | null;
  /** sc_detalle_grupo — category (e.g., "LT NINA KIDS") */
  CATEGORIA: string | null;
  /** ss_linea — same as LINEA, aliased as MARCA */
  MARCA: string | null;
  /** Always NULL in current view */
  SUCURSAL: null;
  /** Format: "ss_codigo + ' - ' + ss_nombre" (e.g., "01 - BODEGA PRINCIPAL") */
  BODEGA: string;
  /** ISNULL(saldos_articulos.n_saldo_actual, 0) — positive-only balance */
  EXISTENCIA: number;
  /** ISNULL(saldos_pedidos SUM, 0) — reserved from open orders */
  RESERVADO: number;
  /** Always NULL in current view */
  TRANSITO: null;
  /** EXISTENCIA - RESERVADO — can be negative */
  DISPONIBLE: number;
  /** ISNULL(n_costo_promedio, 0) — weighted average cost per warehouse */
  COSTO_PROMEDIO: number;
  /** MAX(d_fecha_documento) across 3 movement sources */
  FECHA_ULTIMO_MOVIMIENTO: string | null;
}

// ── Canonical Warehouse Balance ──────────────────────────────────────────

export interface CanonicalWarehouseBalance {
  /** Reference code (e.g., "L-1234") — natural key part 1 */
  referenceCode: string;
  /** SAG business code extracted from BODEGA field (e.g., "01") — natural key part 2 */
  warehouseCode: string;
  /** ka_nl_bodega resolved via warehouse-master (e.g., "10") */
  warehousePk: string | null;
  /** Human name (e.g., "BODEGA PRINCIPAL") */
  warehouseName: string;
  /** Positive-only balance from saldos_articulos (VIEW.EXISTENCIA) */
  existencia: number;
  /** Reserved from open orders via saldos_pedidos (VIEW.RESERVADO) */
  reservado: number;
  /** existencia - reservado (can be negative) */
  disponible: number;
  /** Weighted average cost for this warehouse */
  costoPromedio: number;
  /** Most recent inventory-affecting movement date */
  lastMovementAt: Date | null;
  /** Product name from SAG */
  productName: string | null;
  /** Commercial line (e.g., "LATIN KIDS") */
  line: string | null;
  /** Category (e.g., "LT NINA KIDS") */
  category: string | null;
}

// ── Canonical Variant Balance (future: when variant-level view exists) ───

export interface CanonicalVariantBalance {
  /** Reference code (e.g., "L-1234") */
  referenceCode: string;
  /** SAG business code (e.g., "01") */
  warehouseCode: string;
  /** ka_nl_bodega */
  warehousePk: string | null;
  /** Size (e.g., "4", "6") — NULL if view doesn't expose variants */
  size: string | null;
  /** Color code (e.g., "RO") — NULL if view doesn't expose variants */
  colorCode: string | null;
  /** Quantity at this variant-warehouse intersection */
  quantity: number;
}

// ── Aggregated Reference Balance (across all warehouses) ─────────────────

export interface CanonicalReferenceTotal {
  /** Reference code */
  referenceCode: string;
  /** Sum of existencia across all warehouses */
  totalExistencia: number;
  /** Sum of reservado across all warehouses */
  totalReservado: number;
  /** Sum of disponible across all warehouses */
  totalDisponible: number;
  /** Number of warehouses with balance */
  warehouseCount: number;
  /** Per-warehouse breakdown */
  warehouses: CanonicalWarehouseBalance[];
}

// ── Shadow Comparison Result ─────────────────────────────────────────────

export type ComparisonVerdict =
  | "MATCH"
  | "MISMATCH_QUANTITY"
  | "VIEW_ONLY"
  | "PIL_ONLY"
  | "BOTH_ZERO";

export interface ShadowComparisonRecord {
  referenceCode: string;
  warehouseCode: string;
  warehousePk: string | null;
  /** From vw_agentik_inventario */
  viewExistencia: number;
  viewReservado: number;
  viewDisponible: number;
  /** From ProductInventoryLevel (SUM(GREATEST(0, quantity))) */
  pilPositiveOnly: number;
  /** From ProductInventoryLevel (SUM(quantity)) */
  pilNet: number;
  /** Difference: viewExistencia - pilPositiveOnly */
  diffExistencia: number;
  /** Difference: viewExistencia - pilNet */
  diffNet: number;
  verdict: ComparisonVerdict;
}

export interface ShadowComparisonResult {
  /** Organization ID */
  organizationId: string;
  /** When the comparison was computed */
  computedAt: string;
  /** SAG view period (e.g., "202607") */
  viewPeriod: string | null;
  /** Per-reference-warehouse records */
  records: ShadowComparisonRecord[];
  /** Summary statistics */
  stats: {
    totalRecords: number;
    matches: number;
    mismatches: number;
    viewOnly: number;
    pilOnly: number;
    bothZero: number;
  };
}

// ── Pure Functions ───────────────────────────────────────────────────────

/**
 * Parse the BODEGA field "ss_codigo + ' - ' + ss_nombre" into code and name.
 * Returns { code, name } or null if format is unexpected.
 */
export function parseViewBodega(bodega: string): { code: string; name: string } | null {
  if (!bodega) return null;
  const idx = bodega.indexOf(" - ");
  if (idx < 0) return null;
  return {
    code: bodega.substring(0, idx).trim(),
    name: bodega.substring(idx + 3).trim(),
  };
}

/**
 * Map a raw SAG view row to a CanonicalWarehouseBalance.
 * Requires a warehousePk resolver (code → ka_nl_bodega).
 */
export function mapViewRowToBalance(
  row: SagInventoryViewRow,
  resolveWarehousePk: (code: string) => string | null,
): CanonicalWarehouseBalance | null {
  const parsed = parseViewBodega(row.BODEGA);
  if (!parsed) return null;

  return {
    referenceCode: row.CODIGO_PRODUCTO,
    warehouseCode: parsed.code,
    warehousePk: resolveWarehousePk(parsed.code),
    warehouseName: parsed.name,
    existencia: row.EXISTENCIA ?? 0,
    reservado: row.RESERVADO ?? 0,
    disponible: row.DISPONIBLE ?? 0,
    costoPromedio: row.COSTO_PROMEDIO ?? 0,
    lastMovementAt: row.FECHA_ULTIMO_MOVIMIENTO
      ? new Date(row.FECHA_ULTIMO_MOVIMIENTO)
      : null,
    productName: row.PRODUCTO ?? null,
    line: row.LINEA ?? null,
    category: row.CATEGORIA ?? null,
  };
}

/**
 * Build aggregated reference totals from a list of warehouse balances.
 * Groups by referenceCode, sums across warehouses.
 */
export function buildReferenceTotals(
  balances: CanonicalWarehouseBalance[],
): CanonicalReferenceTotal[] {
  const groups = new Map<string, CanonicalWarehouseBalance[]>();
  for (const b of balances) {
    const list = groups.get(b.referenceCode) ?? [];
    list.push(b);
    groups.set(b.referenceCode, list);
  }

  const totals: CanonicalReferenceTotal[] = [];
  for (const [ref, whs] of groups) {
    totals.push({
      referenceCode: ref,
      totalExistencia: whs.reduce((s, w) => s + w.existencia, 0),
      totalReservado: whs.reduce((s, w) => s + w.reservado, 0),
      totalDisponible: whs.reduce((s, w) => s + w.disponible, 0),
      warehouseCount: whs.length,
      warehouses: whs,
    });
  }

  return totals;
}

/**
 * Compute a shadow comparison verdict between VIEW and PIL quantities.
 */
export function computeComparisonVerdict(
  viewExistencia: number,
  pilPositiveOnly: number,
  tolerance: number = 0.01,
): ComparisonVerdict {
  if (viewExistencia === 0 && pilPositiveOnly === 0) return "BOTH_ZERO";
  if (viewExistencia > 0 && pilPositiveOnly === 0) return "VIEW_ONLY";
  if (viewExistencia === 0 && pilPositiveOnly > 0) return "PIL_ONLY";
  if (Math.abs(viewExistencia - pilPositiveOnly) < tolerance) return "MATCH";
  return "MISMATCH_QUANTITY";
}
