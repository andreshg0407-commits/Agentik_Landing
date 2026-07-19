/**
 * production-event-builders.ts
 *
 * PRODUCTION-EVENT-MODEL-01 — Phase 12: Builders.
 *
 * Factory functions for creating ProductionEvent and ProductionEventLine objects.
 * Used by sync adapters to normalize source documents into universal events.
 *
 * Not connected to any sync yet — these are domain construction primitives.
 *
 * No React. No Prisma. No server-only. Pure domain logic.
 */

import type {
  ProductionEventType,
  ProductionEventStatus,
  ProductionEventConfidence,
} from "./production-event-types";
import type { ProductionEventSource } from "./production-event-source";
import type { ProductionEvent, ProductionEventLine } from "./production-event";
import type { ProductionEventSourceMapping } from "./production-event-mapping";
import { findSourceMapping, mapSourceDocumentToProductionEventType } from "./production-event-mapping";

// ── Event Builder ───────────────────────────────────────────────────────────

export interface BuildProductionEventInput {
  id: string;
  organizationId: string;
  source: ProductionEventSource;
  eventType?: ProductionEventType;
  productionOrderRef?: string | null;
  /** Primary reference — null for multi-line docs. */
  referenceCode?: string | null;
  /** Primary description — null for multi-line or status-only events. */
  description?: string | null;
  line?: string | null;
  subGroup?: string | null;
  locationFrom?: string | null;
  locationTo?: string | null;
  stageFrom?: string | null;
  stageTo?: string | null;
  /** Total quantity (sum of lines). Defaults to 0 for status events. */
  quantity?: number;
  eventDate: string;
  detectedAt?: string;
  status?: ProductionEventStatus;
  confidence?: ProductionEventConfidence;
  evidence?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  lines?: ProductionEventLine[];
}

/** Build a ProductionEvent from explicit inputs. */
export function buildProductionEvent(input: BuildProductionEventInput): ProductionEvent {
  const lines = input.lines ?? [];
  return {
    id: input.id,
    organizationId: input.organizationId,
    eventType: input.eventType ?? "UNKNOWN_PRODUCTION_EVENT",
    sourceSystem: input.source.sourceSystem,
    sourceDocumentType: input.source.sourceDocumentType,
    source: input.source,
    productionOrderRef: input.productionOrderRef ?? null,
    referenceCode: input.referenceCode ?? null,
    description: input.description ?? null,
    lineCount: lines.length,
    line: input.line ?? null,
    subGroup: input.subGroup ?? null,
    locationFrom: input.locationFrom ?? null,
    locationTo: input.locationTo ?? null,
    stageFrom: input.stageFrom ?? null,
    stageTo: input.stageTo ?? null,
    quantity: input.quantity ?? 0,
    eventDate: input.eventDate,
    detectedAt: input.detectedAt ?? new Date().toISOString(),
    status: input.status ?? "active",
    confidence: input.confidence ?? "unknown",
    evidence: input.evidence ?? {},
    metadata: input.metadata ?? {},
    lines,
  };
}

// ── Line Builder ────────────────────────────────────────────────────────────

export interface BuildProductionEventLineInput {
  id: string;
  productionEventId: string;
  referenceCode: string;
  description?: string | null;
  size?: string | null;
  color?: string | null;
  quantity: number;
  unit?: string;
  variantId?: string | null;
  productId?: string | null;
  lineMetadata?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
}

/** Build a ProductionEventLine from explicit inputs. */
export function buildProductionEventLine(input: BuildProductionEventLineInput): ProductionEventLine {
  return {
    id: input.id,
    productionEventId: input.productionEventId,
    referenceCode: input.referenceCode,
    description: input.description ?? null,
    size: input.size ?? null,
    color: input.color ?? null,
    quantity: input.quantity,
    unit: input.unit ?? "unidades",
    variantId: input.variantId ?? null,
    productId: input.productId ?? null,
    lineMetadata: input.lineMetadata ?? {},
    evidence: input.evidence ?? {},
  };
}

// ── Source-Aware Builder ────────────────────────────────────────────────────

export interface BuildFromSourceInput {
  id: string;
  organizationId: string;
  source: ProductionEventSource;
  mappings: readonly ProductionEventSourceMapping[];
  /** Primary reference — null for multi-line documents. */
  referenceCode?: string | null;
  /** Primary description — null for multi-line or status-only events. */
  description?: string | null;
  /** Total quantity (sum of lines). Defaults to 0. */
  quantity?: number;
  eventDate: string;
  productionOrderRef?: string | null;
  line?: string | null;
  subGroup?: string | null;
  locationFrom?: string | null;
  locationTo?: string | null;
  metadata?: Record<string, unknown>;
  lines?: ProductionEventLine[];
}

/**
 * Build a ProductionEvent from a source document using registered mappings.
 *
 * Automatically resolves:
 * - eventType from source mapping
 * - confidence from mapping confidence
 * - stageFrom/stageTo from mapping defaults
 * - evidence with mapping business meaning
 */
export function buildProductionEventFromSource(input: BuildFromSourceInput): ProductionEvent {
  const { source, mappings } = input;

  const eventType = mapSourceDocumentToProductionEventType(
    mappings,
    source.sourceSystem,
    source.sourceDocumentType,
  );

  const mapping = findSourceMapping(mappings, source.sourceSystem, source.sourceDocumentType);

  return buildProductionEvent({
    id: input.id,
    organizationId: input.organizationId,
    source,
    eventType,
    productionOrderRef: input.productionOrderRef,
    referenceCode: input.referenceCode ?? null,
    description: input.description ?? null,
    line: input.line,
    subGroup: input.subGroup,
    locationFrom: input.locationFrom,
    locationTo: input.locationTo,
    stageFrom: mapping?.defaultStageFrom ?? null,
    stageTo: mapping?.defaultStageTo ?? null,
    quantity: input.quantity ?? 0,
    eventDate: input.eventDate,
    status: "active",
    confidence: mapping?.confidence ?? "unknown",
    evidence: mapping
      ? { mappingBusinessMeaning: mapping.businessMeaning, affectsStage: mapping.affectsStage }
      : {},
    metadata: input.metadata ?? {},
    lines: input.lines ?? [],
  });
}
