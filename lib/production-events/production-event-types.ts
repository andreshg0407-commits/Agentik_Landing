/**
 * production-event-types.ts
 *
 * PRODUCTION-EVENT-MODEL-01 — Phase 3: Universal Event Types.
 *
 * These types represent universal production lifecycle events that
 * ANY ERP system (SAG, Siigo, Alegra, Odoo, SAP, Custom) can normalize into.
 *
 * Agentik speaks universal production language.
 * ERP-specific document codes (CN, ET, PC, etc.) are source metadata,
 * never domain-level identifiers.
 *
 * No React. No Prisma. No server-only. Pure domain types.
 */

// ── Universal Production Event Types ────────────────────────────────────────

/**
 * All recognized production event types in Agentik.
 *
 * These are ERP-agnostic. Any source system normalizes into one of these.
 * Order matters: earlier events precede later events in a typical lifecycle.
 */
export type ProductionEventType =
  // Order lifecycle
  | "PRODUCTION_ORDER_CREATED"
  | "PRODUCTION_ORDER_UPDATED"
  | "PRODUCTION_ORDER_CANCELLED"
  // Material lifecycle
  | "MATERIAL_RESERVED"
  | "MATERIAL_CONSUMED"
  // Production progress
  | "PRODUCTION_STARTED"
  | "PRODUCTION_MOVED_STAGE"
  // External processing
  | "EXTERNAL_SERVICE_STARTED"
  | "EXTERNAL_SERVICE_COMPLETED"
  // Completion
  | "PRODUCTION_PARTIALLY_COMPLETED"
  | "PRODUCTION_COMPLETED"
  | "FINISHED_GOODS_RECEIVED"
  // Quality
  | "QUALITY_CHECK_STARTED"
  | "QUALITY_CHECK_COMPLETED"
  // Logistics
  | "PRODUCTION_TRANSFERRED"
  // Anomalies
  | "PRODUCTION_DELAY_DETECTED"
  // Catch-all
  | "UNKNOWN_PRODUCTION_EVENT";

// ── Event Status ────────────────────────────────────────────────────────────

/** Processing status of a production event. */
export type ProductionEventStatus =
  | "active"        // Event is current and relevant
  | "superseded"    // A newer event replaced this one
  | "cancelled"     // Event was reverted or voided
  | "historical";   // Old event, kept for audit trail

// ── Confidence Level ────────────────────────────────────────────────────────

/**
 * How confident we are in the event type mapping.
 *
 * - confirmed: the source system explicitly declares this event type
 * - inferred: we mapped from a source document type with known semantics
 * - provisional: mapping is probable but not validated with real data
 * - unknown: could not determine the correct mapping
 */
export type ProductionEventConfidence =
  | "confirmed"
  | "inferred"
  | "provisional"
  | "unknown";

// ── Source System ───────────────────────────────────────────────────────────

/**
 * Known ERP/source systems that can feed production events.
 *
 * Extensible. New systems are added as tenants onboard.
 */
export type ProductionSourceSystem =
  | "SAG"
  | "SIIGO"
  | "ALEGRA"
  | "ODOO"
  | "SAP"
  | "BUSINESS_CENTRAL"
  | "CUSTOM";

// ── Event Classification Helpers ────────────────────────────────────────────

/** All event types that signal production completion. */
export const COMPLETION_EVENTS: readonly ProductionEventType[] = [
  "PRODUCTION_PARTIALLY_COMPLETED",
  "PRODUCTION_COMPLETED",
  "FINISHED_GOODS_RECEIVED",
] as const;

/** All event types related to material consumption. */
export const MATERIAL_EVENTS: readonly ProductionEventType[] = [
  "MATERIAL_RESERVED",
  "MATERIAL_CONSUMED",
] as const;

/** All event types that indicate stage movement. */
export const STAGE_MOVEMENT_EVENTS: readonly ProductionEventType[] = [
  "PRODUCTION_STARTED",
  "PRODUCTION_MOVED_STAGE",
  "EXTERNAL_SERVICE_STARTED",
  "EXTERNAL_SERVICE_COMPLETED",
] as const;

/** All event types related to external services. */
export const EXTERNAL_SERVICE_EVENTS: readonly ProductionEventType[] = [
  "EXTERNAL_SERVICE_STARTED",
  "EXTERNAL_SERVICE_COMPLETED",
] as const;

/** All event types that affect inventory levels. */
export const INVENTORY_AFFECTING_EVENTS: readonly ProductionEventType[] = [
  "MATERIAL_CONSUMED",
  "PRODUCTION_COMPLETED",
  "FINISHED_GOODS_RECEIVED",
  "PRODUCTION_TRANSFERRED",
] as const;
