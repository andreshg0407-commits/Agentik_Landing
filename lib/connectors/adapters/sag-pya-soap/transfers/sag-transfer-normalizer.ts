/**
 * sag-transfer-normalizer.ts
 *
 * CASTILLITOS-LOGISTICS-SYNC-01 + INVENTORY-F34-TRANSFER-SYNC-01
 *
 * Transforms raw SAG MOVIMIENTOS + movimientos_traslados rows for fuente 34 (TR)
 * and fuente 206 (TM) into TransferSnapshot objects.
 *
 * Key discovery: Transfer lines live in movimientos_traslados (NOT MOVIMIENTOS_ITEMS).
 * This table has per-line ka_nl_bodega_origen and ka_nl_bodega_destino.
 *
 * READ-ONLY: never writes to SAG.
 */

import type { SagRow } from "@/lib/connectors/pya/types";
import type {
  TransferSnapshot,
  TransferLineSnapshot,
  TransferType,
  TransferStatus,
} from "@/lib/logistics/transfer-types";
import { internalToExternal, bodegaName } from "@/lib/logistics/catalogs/castillitos-bodega-mapping";

// ── SAG fuente codes ─────────────────────────────────────────────────────────

const FUENTE_TR = 34;
const FUENTE_TM = 206;

const FUENTE_MAP: Record<number, { type: TransferType; name: string }> = {
  [FUENTE_TR]: { type: "TR", name: "Traslado entre Bodegas" },
  [FUENTE_TM]: { type: "TM", name: "Traslado de Maletas" },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  return new Date(0);
}

function deriveStatus(row: SagRow): TransferStatus {
  const cerrado = toStr(row.sc_dcto_cerrado).toUpperCase();
  if (cerrado === "S") return "closed";
  if (cerrado === "N") return "open";
  return "unknown";
}

// ── Normalizer ───────────────────────────────────────────────────────────────

/** Normalize a single transfer header row from MOVIMIENTOS. */
export function normalizeTransferHeader(row: SagRow): Omit<TransferSnapshot, "lines"> {
  const status = deriveStatus(row);
  const fuenteId = toNumber(row.ka_ni_fuente);
  const fuente = FUENTE_MAP[fuenteId] ?? { type: "TR" as TransferType, name: `Fuente ${fuenteId}` };

  return {
    erpMovId: toNumber(row.ka_nl_movimiento),
    documentNumber: toStr(row.n_numero_documento),
    transferType: fuente.type,
    sourceCode: fuente.type,
    sourceName: fuente.name,
    status,
    isClosed: status === "closed",
    documentDate: toDate(row.d_fecha_documento),
    createdBy: toNullableStr(row.sc_beneficiario),
    remisionRef: toNullableStr(row.ss_remision),
    originWarehouseCode: internalToExternal(row.ka_nl_bodega as number | null) ?? toNullableStr(row.ka_nl_bodega),
    originWarehouseName: bodegaName(row.ka_nl_bodega as number | null) ?? toNullableStr(row.sc_detalle_bodega),
    // Destination is populated from lines (header may not have it)
    destinationWarehouseCode: internalToExternal(row.ka_nl_bodega_destino_wms as number | null) ?? toNullableStr(row.ka_nl_bodega_destino_wms),
    destinationWarehouseName: null,
    rawJson: row as Record<string, unknown>,
  };
}

/**
 * Normalize a single transfer line item row from movimientos_traslados.
 *
 * INVENTORY-F34-TRANSFER-SYNC-01: Transfer lines live in movimientos_traslados
 * (NOT MOVIMIENTOS_ITEMS). Column mapping:
 *   ka_nl_movimiento_traslado → erpItemId (PK)
 *   nd_cantidad               → quantity
 *   nd_valor                  → unitCost (per-unit cost)
 *   ka_nl_bodega_origen       → originWarehouseCode
 *   ka_nl_bodega_destino      → destinationWarehouseCode
 *   ss_talla / ss_color       → size / color
 */
export function normalizeTransferLine(row: SagRow): TransferLineSnapshot {
  const qty = toNumber(row.nd_cantidad);
  const unitCost = toNullableNumber(row.nd_valor);
  return {
    erpItemId: toNumber(row.ka_nl_movimiento_traslado),
    referenceCode: toStr(row.k_sc_codigo_articulo || row.ka_nl_articulo),
    productName: toNullableStr(row.sc_detalle_articulo),
    size: toNullableStr(row.ss_talla),
    color: toNullableStr(row.ss_color),
    quantity: qty,
    unitCost,
    lineTotal: unitCost !== null ? qty * unitCost : null,
    destinationWarehouseCode: internalToExternal(row.ka_nl_bodega_destino as number | null) ?? toNullableStr(row.ka_nl_bodega_destino),
    rawJson: row as Record<string, unknown>,
  };
}

/**
 * Group transfer headers with their line items into complete snapshots.
 * Also promotes the most common destination warehouse from lines to the header.
 */
export function buildTransferSnapshots(
  headers: SagRow[],
  items: SagRow[],
): TransferSnapshot[] {
  // Index items by ka_nl_movimiento
  const itemsByMov = new Map<number, SagRow[]>();
  for (const item of items) {
    const movId = toNumber(item.ka_nl_movimiento);
    if (!itemsByMov.has(movId)) itemsByMov.set(movId, []);
    itemsByMov.get(movId)!.push(item);
  }

  return headers.map((hdr) => {
    const base = normalizeTransferHeader(hdr);
    const movItems = itemsByMov.get(base.erpMovId) || [];
    const lines = movItems.map(normalizeTransferLine);

    // INVENTORY-F34-TRANSFER-SYNC-01: Promote origin and destination from lines.
    // MOVIMIENTOS header does NOT have ka_nl_bodega for transfers — it's per-line
    // in movimientos_traslados (ka_nl_bodega_origen / ka_nl_bodega_destino).
    if (lines.length > 0) {
      const mostFrequent = (arr: string[]): string | null => {
        if (arr.length === 0) return null;
        const freq = new Map<string, number>();
        for (const c of arr) freq.set(c, (freq.get(c) ?? 0) + 1);
        let best = arr[0];
        let bestCount = 0;
        for (const [code, count] of freq) {
          if (count > bestCount) { best = code; bestCount = count; }
        }
        return best;
      };

      if (!base.originWarehouseCode) {
        const originCodes = lines
          .map((l) => {
            const raw = (l.rawJson as Record<string, unknown>)?.ka_nl_bodega_origen;
            return internalToExternal(raw as number | string | null) ?? toNullableStr(raw);
          })
          .filter((c): c is string => c !== null);
        base.originWarehouseCode = mostFrequent(originCodes);
      }

      if (!base.destinationWarehouseCode) {
        const destCodes = lines
          .map((l) => l.destinationWarehouseCode)
          .filter((c): c is string => c !== null);
        base.destinationWarehouseCode = mostFrequent(destCodes);
      }
    }

    return { ...base, lines };
  });
}
