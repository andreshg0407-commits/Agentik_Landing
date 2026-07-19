/**
 * sag-et-normalizer.ts
 *
 * PRODUCTION-ET-SYNC-01 — Transforms raw SAG MOVIMIENTOS + MOVIMIENTOS_ITEMS
 * rows (fuente 116 = Entrada Producto Terminado) into universal ProductionEvent
 * domain objects via the builders from production-events.
 *
 * ET is NOT a domain entity. ET is a SAG source document.
 * The output is always ProductionEvent + ProductionEventLine.
 *
 * READ-ONLY: never writes to SAG.
 * No React. No Prisma. Server-side only (uses SAG row types).
 */

import type { SagRow } from "@/lib/connectors/pya/types";
import type { ProductionEventSource } from "@/lib/production-events/production-event-source";
import type { ProductionEvent, ProductionEventLine } from "@/lib/production-events/production-event";
import {
  buildProductionEventFromSource,
  buildProductionEventLine,
} from "@/lib/production-events/production-event-builders";
import { CASTILLITOS_SAG_MAPPINGS } from "@/lib/production-events/production-event-mapping";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
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

function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date(0).toISOString();
}

// ── Source Builder ─────────────────────────────────────────────────────────────

/** Build a ProductionEventSource from a raw SAG MOVIMIENTOS row (fuente 116). */
export function buildETSource(row: SagRow): ProductionEventSource {
  return {
    sourceSystem: "SAG",
    sourceDocumentType: "ET",
    sourceDocumentId: String(toNumber(row.ka_nl_movimiento)),
    sourceDocumentNumber: toStr(row.n_numero_documento),
    sourceRawCode: "116",
    sourceRawName: "Entrada Producto Terminado",
    sourceTimestamp: toDateStr(row.d_fecha_documento),
    sourceMetadata: {
      fuente: 116,
      ka_nl_movimiento: toNumber(row.ka_nl_movimiento),
      isClosed: toStr(row.sc_dcto_cerrado).toUpperCase() === "S",
      remisionRef: toNullableStr(row.ss_remision),
      warehouseCode: toNullableStr(row.ka_nl_bodega),
      warehouseName: toNullableStr(row.sc_detalle_bodega),
      createdBy: toNullableStr(row.sc_beneficiario),
      rawJson: row,
    },
  };
}

// ── Line Normalizer ───────────────────────────────────────────────────────────

/** Normalize a single ET line item from MOVIMIENTOS_ITEMS into a ProductionEventLine. */
export function normalizeETLine(
  row: SagRow,
  productionEventId: string,
): ProductionEventLine {
  return buildProductionEventLine({
    id: `et-line-${toNumber(row.ka_nl_movimiento_item)}`,
    productionEventId,
    referenceCode: toStr(row.k_sc_codigo_articulo || row.ka_nl_articulo),
    description: toNullableStr(row.sc_detalle_articulo),
    size: toNullableStr(row.ss_talla),
    color: toNullableStr(row.ss_color),
    quantity: toNumber(row.n_cantidad),
    unit: "unidades",
    lineMetadata: {
      sourceLineId: toNumber(row.ka_nl_movimiento_item),
      warehouseCode: toNullableStr(row.ka_nl_bodega),
      rawJson: row,
    },
  });
}

// ── Event Builder ─────────────────────────────────────────────────────────────

/** Build a universal ProductionEvent from a SAG ET header + its lines. */
export function buildETProductionEvent(
  header: SagRow,
  itemRows: SagRow[],
): ProductionEvent {
  const source = buildETSource(header);
  const eventId = `et-${source.sourceDocumentId}`;
  const lines = itemRows.map((row) => normalizeETLine(row, eventId));

  // Derive header-level fields from lines
  const firstLine = lines[0] ?? null;
  const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);

  return buildProductionEventFromSource({
    id: eventId,
    organizationId: "", // Set by sync engine
    source,
    mappings: CASTILLITOS_SAG_MAPPINGS,
    referenceCode: lines.length === 1 ? firstLine?.referenceCode ?? null : null,
    description: lines.length === 1 ? firstLine?.description ?? null : null,
    quantity: totalQuantity,
    eventDate: toDateStr(header.d_fecha_documento),
    productionOrderRef: toNullableStr(header.ss_remision),
    locationFrom: "04", // WIP bodega (production)
    locationTo: "01",   // Finished goods bodega
    metadata: {
      isClosed: toStr(header.sc_dcto_cerrado).toUpperCase() === "S",
      warehouseCode: toNullableStr(header.ka_nl_bodega),
    },
    lines,
  });
}

// ── Batch Builder ─────────────────────────────────────────────────────────────

/**
 * Group ET headers with their line items into complete ProductionEvent objects.
 *
 * @param headers — raw SAG MOVIMIENTOS rows (fuente 116)
 * @param items   — raw SAG MOVIMIENTOS_ITEMS rows for those headers
 * @returns normalized ProductionEvent[]
 */
export function buildETProductionEvents(
  headers: SagRow[],
  items: SagRow[],
): ProductionEvent[] {
  // Index items by ka_nl_movimiento
  const itemsByMov = new Map<number, SagRow[]>();
  for (const item of items) {
    const movId = toNumber(item.ka_nl_movimiento);
    if (!itemsByMov.has(movId)) itemsByMov.set(movId, []);
    itemsByMov.get(movId)!.push(item);
  }

  return headers.map((hdr) => {
    const movId = toNumber(hdr.ka_nl_movimiento);
    const movItems = itemsByMov.get(movId) || [];
    return buildETProductionEvent(hdr, movItems);
  });
}
