/**
 * sag-cn-normalizer.ts
 *
 * PRODUCTION-CN-SYNC-01 — Transforms raw SAG MOVIMIENTOS + MOVIMIENTOS_ITEMS
 * rows (fuente 80 = Consumos Insumos y Materias Primas) into universal
 * ProductionEvent domain objects via the builders from production-events.
 *
 * CN represents MATERIAL_CONSUMED — the withdrawal of raw materials
 * (fabrics, labels, trims, bags) from supply warehouses (Bodegas 14/15)
 * for use in production. Every CN is linked 1:1 to a Production Order
 * via ss_remision.
 *
 * Evidence: PRODUCTION-CN-EXECUTION-FORENSICS-01.
 *
 * Key structural findings:
 *   - CN articles are RAW MATERIALS (0% overlap with OP product refs)
 *   - CN lines have NO ss_talla / ss_color — size/color embedded in description
 *   - CN headers have NO ka_nl_bodega — bodega is per-line only (14/15)
 *   - sv_observaciones carries the product reference code (DA-xxxx, L-xxxx)
 *   - 100% of CN headers have ss_remision linking to OP
 *   - 99.9% of lines have cost data (n_valor, n_costo_promedio, n_ultimo_costo)
 *
 * CN is NOT a domain entity. CN is a SAG source document.
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

/** Build a ProductionEventSource from a raw SAG MOVIMIENTOS row (fuente 80). */
export function buildCNSource(row: SagRow): ProductionEventSource {
  return {
    sourceSystem: "SAG",
    sourceDocumentType: "CN",
    sourceDocumentId: String(toNumber(row.ka_nl_movimiento)),
    sourceDocumentNumber: toStr(row.n_numero_documento),
    sourceRawCode: "80",
    sourceRawName: "Consumos Insumos y Materias Primas",
    sourceTimestamp: toDateStr(row.d_fecha_documento),
    sourceMetadata: {
      fuente: 80,
      ka_nl_movimiento: toNumber(row.ka_nl_movimiento),
      isClosed: toStr(row.sc_dcto_cerrado).toUpperCase() === "S",
      remisionRef: toNullableStr(row.ss_remision),
      // sv_observaciones carries the product reference code (DA-xxxx, L-xxxx, CJ-xxxx)
      observaciones: toNullableStr(row.sv_observaciones),
      supplier: toNullableStr(row.sc_beneficiario),
      supplierId: toNullableStr(row.ka_nl_tercero),
      costCenter: toNullableStr(row.ka_ni_centro_costo),
      createdBy: toNullableStr(row.ss_usuario_new),
      rawJson: row,
    },
  };
}

// ── Line Normalizer ───────────────────────────────────────────────────────────

/**
 * Normalize a single CN line item from MOVIMIENTOS_ITEMS into a ProductionEventLine.
 *
 * CN lines represent raw material consumption. Key differences from ET/OP lines:
 * - referenceCode = raw material article code (VALERIA/003, RIB2.5, BL.1), NOT product ref
 * - No ss_talla / ss_color columns — size/color embedded in description
 * - Has cost data (n_valor, n_costo_promedio, n_ultimo_costo) — preserved in lineMetadata
 * - Has per-line bodega (ka_nl_bodega) — typically 14 or 15
 */
export function normalizeCNLine(
  row: SagRow,
  productionEventId: string,
): ProductionEventLine {
  return buildProductionEventLine({
    id: `cn-line-${toNumber(row.ka_nl_movimiento_item)}`,
    productionEventId,
    referenceCode: toStr(row.k_sc_codigo_articulo || row.ka_nl_articulo),
    description: toNullableStr(row.sc_detalle_articulo),
    // CN lines do NOT have ss_talla / ss_color columns
    size: null,
    color: null,
    quantity: toNumber(row.n_cantidad),
    unit: "unidades",
    lineMetadata: {
      sourceLineId: toNumber(row.ka_nl_movimiento_item),
      // Per-line warehouse (CN headers have no bodega)
      warehouseCode: toNullableStr(row.ka_nl_bodega),
      // Cost preservation — CN is the best source of real production costs
      cost: toNumber(row.n_valor),
      lastCost: toNumber(row.n_ultimo_costo),
      avgCost: toNumber(row.n_costo_promedio),
      costCenter: toNullableStr(row.ka_ni_centro_costo),
    },
  });
}

// ── Event Builder ─────────────────────────────────────────────────────────────

/** Build a universal ProductionEvent from a SAG CN header + its lines. */
export function buildCNProductionEvent(
  header: SagRow,
  itemRows: SagRow[],
): ProductionEvent {
  const source = buildCNSource(header);
  const eventId = `cn-${source.sourceDocumentId}`;
  const lines = itemRows.map((row) => normalizeCNLine(row, eventId));

  const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);
  const totalCost = lines.reduce((sum, l) => sum + toNumber((l.lineMetadata as any)?.cost), 0);

  // Derive primary bodega from lines (most frequent)
  const bodegaCounts = new Map<string, number>();
  for (const line of lines) {
    const b = (line.lineMetadata as any)?.warehouseCode;
    if (b) bodegaCounts.set(b, (bodegaCounts.get(b) ?? 0) + 1);
  }
  let primaryBodega: string | null = null;
  let maxCount = 0;
  for (const [b, count] of bodegaCounts) {
    if (count > maxCount) { primaryBodega = b; maxCount = count; }
  }

  return buildProductionEventFromSource({
    id: eventId,
    organizationId: "", // Set by sync engine
    source,
    mappings: CASTILLITOS_SAG_MAPPINGS,
    // sv_observaciones carries the product reference code
    referenceCode: toNullableStr(header.sv_observaciones),
    description: null,
    quantity: totalQuantity,
    eventDate: toDateStr(header.d_fecha_documento),
    productionOrderRef: toNullableStr(header.ss_remision),
    locationFrom: primaryBodega, // Raw material warehouse (14/15)
    locationTo: null,            // Materials consumed, not transferred
    metadata: {
      isClosed: toStr(header.sc_dcto_cerrado).toUpperCase() === "S",
      supplier: toNullableStr(header.sc_beneficiario),
      totalCost,
      observaciones: toNullableStr(header.sv_observaciones),
    },
    lines,
  });
}

// ── Batch Builder ─────────────────────────────────────────────────────────────

/**
 * Group CN headers with their line items into complete ProductionEvent objects.
 *
 * @param headers — raw SAG MOVIMIENTOS rows (fuente 80)
 * @param items   — raw SAG MOVIMIENTOS_ITEMS rows for those headers
 * @returns normalized ProductionEvent[]
 */
export function buildCNProductionEvents(
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
    return buildCNProductionEvent(hdr, movItems);
  });
}
