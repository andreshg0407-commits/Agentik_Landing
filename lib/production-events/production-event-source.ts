/**
 * production-event-source.ts
 *
 * PRODUCTION-EVENT-MODEL-01 — Phase 4: Source Model.
 *
 * Captures the external origin of a production event.
 * Every ProductionEvent carries a source that tells us WHERE
 * the event came from — without coupling the domain model to any ERP.
 *
 * No React. No Prisma. No server-only. Pure domain types.
 */

import type { ProductionSourceSystem } from "./production-event-types";

// ── Production Event Source ─────────────────────────────────────────────────

/**
 * Origin metadata for a production event.
 *
 * Captures all ERP-specific identifiers so the universal event model
 * can be traced back to its source document.
 */
export interface ProductionEventSource {
  /** Which ERP system generated this event (SAG, SIIGO, ODOO, etc.). */
  sourceSystem: ProductionSourceSystem;
  /** The ERP's native document type code (e.g. "CN", "ET", "OP" for SAG). */
  sourceDocumentType: string;
  /** Stable unique ID from the ERP (e.g. SAG ka_nl_movimiento as string). */
  sourceDocumentId: string;
  /** Human-readable document number (NOT unique across fuentes). */
  sourceDocumentNumber: string;
  /** Raw ERP code for the document type (e.g. SAG fuente number "80"). */
  sourceRawCode: string;
  /** Human-readable name from the ERP (e.g. "Consumos Insumos y Telas"). */
  sourceRawName: string;
  /** Timestamp from the source system. */
  sourceTimestamp: string;
  /**
   * Additional ERP-specific metadata (warehouse codes, cross-references,
   * remisionRef, createdBy, isClosed, rawJson, etc.).
   * Use this for any ERP-specific field that doesn't map to a universal field.
   */
  sourceMetadata: Record<string, unknown>;
}

// ── Source Normalization Contract ────────────────────────────────────────────

/**
 * Contract for normalizing a source document into ProductionEvent fields.
 *
 * Each ERP adapter implements this: SAG adapter, Siigo adapter, etc.
 * The adapter reads source rows and produces ProductionEventSource objects.
 */
export interface ProductionEventSourceNormalizer {
  /** Which source system this normalizer handles. */
  sourceSystem: ProductionSourceSystem;
  /** Extract source metadata from a raw ERP row. */
  extractSource(raw: Record<string, unknown>): ProductionEventSource;
}
