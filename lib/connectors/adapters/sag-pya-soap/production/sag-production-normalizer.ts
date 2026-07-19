/**
 * sag-production-normalizer.ts
 *
 * PRODUCTION-SYNC-01A — Transforms raw SAG MOVIMIENTOS + MOVIMIENTOS_ITEMS
 * rows (fuente 33 = Orden de Produccion) into ProductionOrderSnapshot objects.
 *
 * READ-ONLY: never writes to SAG.
 */

import type { SagRow } from "@/lib/connectors/pya/types";
import type {
  ProductionOrderSnapshot,
  ProductionOrderLineSnapshot,
  ProductionOrderStatus,
} from "@/lib/production/production-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function toNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function toNullableStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(0); // fallback: epoch
}

function deriveStatus(row: SagRow): ProductionOrderStatus {
  const cerrado = toStr(row.sc_dcto_cerrado).toUpperCase();
  if (cerrado === "S") return "closed";
  if (cerrado === "N") return "open";
  return "unknown";
}

// ── Normalizer ────────────────────────────────────────────────────────────────

/** Normalize a single OP header row from MOVIMIENTOS. */
export function normalizeOpHeader(row: SagRow): Omit<ProductionOrderSnapshot, "lines"> {
  const status = deriveStatus(row);
  return {
    erpMovId: toNumber(row.ka_nl_movimiento),
    documentNumber: toStr(row.n_numero_documento),
    sourceCode: "OP",
    sourceName: "Orden de Produccion",
    status,
    isClosed: status === "closed",
    documentDate: toDate(row.d_fecha_documento),
    createdBy: toNullableStr(row.sc_beneficiario),
    remisionRef: toNullableStr(row.ss_remision),
    warehouseCode: toNullableStr(row.ka_nl_bodega),
    warehouseName: toNullableStr(row.sc_detalle_bodega),
    rawJson: row as Record<string, unknown>,
  };
}

/** Normalize a single OP line item row from MOVIMIENTOS_ITEMS. */
export function normalizeOpLine(row: SagRow): ProductionOrderLineSnapshot {
  const qty = toNumber(row.n_cantidad);
  const unitCost = toNullableNumber(row.n_valor_unitario);
  return {
    erpItemId: toNumber(row.ka_nl_movimiento_item),
    referenceCode: toStr(row.k_sc_codigo_articulo || row.ka_nl_articulo),
    productName: toNullableStr(row.sc_detalle_articulo),
    size: toNullableStr(row.ss_talla),
    color: toNullableStr(row.ss_color),
    quantityOrdered: qty,
    unitCost,
    lineTotal: unitCost !== null ? qty * unitCost : null,
    rawJson: row as Record<string, unknown>,
  };
}

/**
 * Group OP headers with their line items into complete snapshots.
 *
 * @param headers — raw SAG MOVIMIENTOS rows (fuente 33)
 * @param items   — raw SAG MOVIMIENTOS_ITEMS rows for those headers
 * @returns normalized ProductionOrderSnapshot[]
 */
export function buildProductionSnapshots(
  headers: SagRow[],
  items: SagRow[],
): ProductionOrderSnapshot[] {
  // Index items by ka_nl_movimiento
  const itemsByMov = new Map<number, SagRow[]>();
  for (const item of items) {
    const movId = toNumber(item.ka_nl_movimiento);
    if (!itemsByMov.has(movId)) itemsByMov.set(movId, []);
    itemsByMov.get(movId)!.push(item);
  }

  return headers.map((hdr) => {
    const base = normalizeOpHeader(hdr);
    const movItems = itemsByMov.get(base.erpMovId) || [];
    return {
      ...base,
      lines: movItems.map(normalizeOpLine),
    };
  });
}
