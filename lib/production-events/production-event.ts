/**
 * production-event.ts
 *
 * PRODUCTION-EVENT-MODEL-01 — Phase 5: Production Event Domain Model.
 *
 * The universal production event. Any ERP document — SAG OP, CN, ET,
 * Siigo production receipt, Odoo manufacturing order — normalizes into
 * this single structure.
 *
 * ProductionOrder = the OP document (existing model, stays).
 * ProductionEvent = any lifecycle event within a production cycle.
 *
 * Relation: ProductionOrder → ProductionEvent[] → ProductionEventLine[]
 *
 * No React. No Prisma. No server-only. Pure domain types.
 */

import type {
  ProductionEventType,
  ProductionEventStatus,
  ProductionEventConfidence,
  ProductionSourceSystem,
} from "./production-event-types";
import type { ProductionEventSource } from "./production-event-source";

// ── Production Event ────────────────────────────────────────────────────────

/**
 * A universal production lifecycle event.
 *
 * Represents something that HAPPENED in the production process:
 * material consumed, stage changed, goods finished, etc.
 */
export interface ProductionEvent {
  /** Unique Agentik ID. */
  id: string;
  /** Tenant boundary. */
  organizationId: string;
  /** Universal event type (ERP-agnostic). */
  eventType: ProductionEventType;
  /** Source system that generated this event. */
  sourceSystem: ProductionSourceSystem;
  /** ERP-native document type code. */
  sourceDocumentType: string;
  /** Full source origin metadata. */
  source: ProductionEventSource;
  /** Reference to the parent production order (OP number or equivalent). */
  productionOrderRef: string | null;
  /**
   * Primary product reference code — null for multi-line documents
   * (CN, ET, T2, Y1) that span many references. When set, this is the
   * first or most representative reference. Full detail in lines[].
   */
  referenceCode: string | null;
  /**
   * Primary description — null for multi-line or status-only events.
   * Full detail in lines[].
   */
  description: string | null;
  /** Number of line items. Quick hint for consumers. */
  lineCount: number;
  /** Commercial line (LATIN KIDS, CASTILLITOS, etc.). */
  line: string | null;
  /** Product sub-group (BOLSO, BILLETERA, etc.). */
  subGroup: string | null;
  /** Origin location (bodega, warehouse, external processor). */
  locationFrom: string | null;
  /** Destination location. */
  locationTo: string | null;
  /** Production stage before this event. */
  stageFrom: string | null;
  /** Production stage after this event. */
  stageTo: string | null;
  /** Quantity affected by this event. */
  quantity: number;
  /** Business date of the event (from ERP). */
  eventDate: string;
  /** When Agentik detected/synced this event. */
  detectedAt: string;
  /** Current processing status. */
  status: ProductionEventStatus;
  /** Confidence in the event type mapping. */
  confidence: ProductionEventConfidence;
  /** Structured evidence supporting this event. */
  evidence: Record<string, unknown>;
  /** Additional metadata (costs, cross-references, etc.). */
  metadata: Record<string, unknown>;
  /** Line items for this event. */
  lines: ProductionEventLine[];
}

// ── Production Event Line ───────────────────────────────────────────────────

/**
 * A line item within a production event.
 *
 * Captures variant-level detail: specific size, color, quantity.
 */
export interface ProductionEventLine {
  /** Unique Agentik ID. */
  id: string;
  /** Parent event ID. */
  productionEventId: string;
  /** Product reference code. */
  referenceCode: string;
  /** Product description. */
  description: string | null;
  /** Size variant. */
  size: string | null;
  /** Color variant. */
  color: string | null;
  /** Quantity for this variant. */
  quantity: number;
  /** Unit of measure. */
  unit: string;
  /** Link to Agentik ProductVariant (if resolved). */
  variantId: string | null;
  /** Link to Agentik ProductEntity (if resolved). */
  productId: string | null;
  /** Additional line-level metadata. */
  lineMetadata: Record<string, unknown>;
  /** Line-level evidence. */
  evidence: Record<string, unknown>;
}
