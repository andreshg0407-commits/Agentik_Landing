/**
 * production-order-synthesis.ts
 *
 * PRODUCTION-TIMELINE-HARDENING-01: Shared OP → ProductionEvent synthesis.
 *
 * Extracts the ProductionOrder → synthetic ProductionEvent conversion
 * into a pure function usable by both the server-only loader and
 * validation scripts.
 *
 * No React. No Prisma. No server-only. Pure domain logic.
 */

import type { ProductionEvent } from "@/lib/production-events/production-event";
import type { ProductionTimelineSourceConfig } from "./production-timeline-types";

/**
 * Raw ProductionOrder fields needed for OP synthesis.
 * Matches the `select` clause used in loader and scripts.
 */
export interface ProductionOrderRow {
  id: string;
  organizationId: string;
  erpMovId: number | string;
  documentNumber: number | string;
  status: string | null;
  isClosed: boolean;
  documentDate: Date | string;
  warehouseCode: string | null;
  createdBy: string | null;
  syncedAt: Date | string | null;
}

/**
 * Synthesize a ProductionOrder row into a ProductionEvent.
 *
 * Uses the provided source config to avoid hardcoding SAG-specific values.
 */
export function synthesizeOpEvent(
  order: ProductionOrderRow,
  config: ProductionTimelineSourceConfig,
): ProductionEvent {
  const docDate = order.documentDate instanceof Date
    ? order.documentDate.toISOString()
    : String(order.documentDate);

  const opNumber = String(order.documentNumber);

  return {
    id: `op-${order.id}`,
    organizationId: order.organizationId,
    eventType: "PRODUCTION_ORDER_CREATED",
    sourceSystem: config.sourceSystem,
    sourceDocumentType: config.opSourceDocumentType,
    source: {
      sourceSystem: config.sourceSystem,
      sourceDocumentType: config.opSourceDocumentType,
      sourceDocumentId: String(order.erpMovId),
      sourceDocumentNumber: opNumber,
      sourceRawCode: config.opSourceRawCode,
      sourceRawName: config.opSourceRawName,
      sourceTimestamp: docDate,
      sourceMetadata: {},
    },
    productionOrderRef: opNumber,
    referenceCode: null,
    description: null,
    lineCount: 0,
    line: null,
    subGroup: null,
    locationFrom: null,
    locationTo: order.warehouseCode ?? null,
    stageFrom: null,
    stageTo: config.opStageTo,
    quantity: 0,
    eventDate: docDate,
    detectedAt: order.syncedAt instanceof Date
      ? order.syncedAt.toISOString()
      : new Date().toISOString(),
    status: order.isClosed ? "historical" : "active",
    confidence: "confirmed",
    evidence: { synthesizedFromProductionOrder: true },
    metadata: {
      isClosed: order.isClosed,
      warehouseCode: order.warehouseCode,
      createdBy: order.createdBy,
    },
    lines: [],
  };
}

/**
 * Map a raw Prisma ProductionEvent row to domain ProductionEvent.
 *
 * Shared between loader and scripts to avoid duplication.
 */
export function prismaRowToProductionEvent(row: any): ProductionEvent {
  return {
    id: row.id,
    organizationId: row.organizationId,
    eventType: row.eventType,
    sourceSystem: row.sourceSystem,
    sourceDocumentType: row.sourceDocumentType,
    source: {
      sourceSystem: row.sourceSystem,
      sourceDocumentType: row.sourceDocumentType,
      sourceDocumentId: row.sourceDocumentId,
      sourceDocumentNumber: row.sourceDocumentNumber ?? "",
      sourceRawCode: row.sourceRawCode ?? "",
      sourceRawName: row.sourceRawName ?? "",
      sourceTimestamp: row.eventDate instanceof Date
        ? row.eventDate.toISOString()
        : String(row.eventDate),
      sourceMetadata: {},
    },
    productionOrderRef: row.productionOrderRef,
    referenceCode: row.referenceCode,
    description: row.description,
    lineCount: row.lineCount ?? 0,
    line: row.line,
    subGroup: row.subGroup,
    locationFrom: row.locationFrom,
    locationTo: row.locationTo,
    stageFrom: row.stageFrom,
    stageTo: row.stageTo,
    quantity: row.quantity ?? 0,
    eventDate: row.eventDate instanceof Date
      ? row.eventDate.toISOString()
      : String(row.eventDate),
    detectedAt: row.syncedAt instanceof Date
      ? row.syncedAt.toISOString()
      : new Date().toISOString(),
    status: row.status ?? "active",
    confidence: row.confidence ?? "unknown",
    evidence: (row.evidence as Record<string, unknown>) ?? {},
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    lines: (row.lines ?? []).map((line: any) => ({
      id: line.id,
      productionEventId: line.productionEventId,
      referenceCode: line.referenceCode ?? "",
      description: line.description,
      size: line.size,
      color: line.color,
      quantity: line.quantity ?? 0,
      unit: line.unit ?? "unidades",
      variantId: null,
      productId: null,
      lineMetadata: (line.lineMetadata as Record<string, unknown>) ?? {},
      evidence: (line.evidence as Record<string, unknown>) ?? {},
    })),
  };
}
