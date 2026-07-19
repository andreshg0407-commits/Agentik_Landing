/**
 * production-event-utils.ts
 *
 * PRODUCTION-EVENT-MODEL-01 — Phase 13: Utilities.
 *
 * Classification and inspection helpers for production events.
 * Used by engines, loaders, and intelligence layers to categorize events
 * without hard-coding event type checks everywhere.
 *
 * No React. No Prisma. No server-only. Pure domain logic.
 */

import type { ProductionEventType, ProductionEventConfidence } from "./production-event-types";
import {
  COMPLETION_EVENTS,
  MATERIAL_EVENTS,
  STAGE_MOVEMENT_EVENTS,
  EXTERNAL_SERVICE_EVENTS,
  INVENTORY_AFFECTING_EVENTS,
} from "./production-event-types";

// ── Event Classification ────────────────────────────────────────────────────

/** Is this a production completion event (partial, full, or goods received)? */
export function isCompletionEvent(eventType: ProductionEventType): boolean {
  return (COMPLETION_EVENTS as readonly string[]).includes(eventType);
}

/** Is this a material-related event (reserved or consumed)? */
export function isMaterialEvent(eventType: ProductionEventType): boolean {
  return (MATERIAL_EVENTS as readonly string[]).includes(eventType);
}

/** Is this a stage movement event (started, moved, external service)? */
export function isStageMovementEvent(eventType: ProductionEventType): boolean {
  return (STAGE_MOVEMENT_EVENTS as readonly string[]).includes(eventType);
}

/** Is this an external service event (sent to or received from third party)? */
export function isExternalServiceEvent(eventType: ProductionEventType): boolean {
  return (EXTERNAL_SERVICE_EVENTS as readonly string[]).includes(eventType);
}

/** Is this an event that receives inventory into commercial stock? */
export function isInventoryReceivingEvent(eventType: ProductionEventType): boolean {
  return eventType === "FINISHED_GOODS_RECEIVED" || eventType === "PRODUCTION_COMPLETED";
}

/** Does this event type affect inventory levels? */
export function eventAffectsInventory(eventType: ProductionEventType): boolean {
  return (INVENTORY_AFFECTING_EVENTS as readonly string[]).includes(eventType);
}

/** Does this event type affect production stage tracking? */
export function eventAffectsProductionStage(eventType: ProductionEventType): boolean {
  return (
    (STAGE_MOVEMENT_EVENTS as readonly string[]).includes(eventType) ||
    (COMPLETION_EVENTS as readonly string[]).includes(eventType) ||
    eventType === "MATERIAL_CONSUMED" ||
    eventType === "PRODUCTION_ORDER_CREATED"
  );
}

// ── Confidence Helpers ──────────────────────────────────────────────────────

/** Human-readable label for a confidence level. */
export function eventConfidenceLabel(confidence: ProductionEventConfidence): string {
  switch (confidence) {
    case "confirmed":
      return "Confirmado — validado con datos reales";
    case "inferred":
      return "Inferido — basado en mapping conocido";
    case "provisional":
      return "Provisional — pendiente validacion con datos reales";
    case "unknown":
      return "Desconocido — no se pudo determinar el tipo de evento";
  }
}

/** Numeric score (0-100) for a confidence level. */
export function eventConfidenceScore(confidence: ProductionEventConfidence): number {
  switch (confidence) {
    case "confirmed": return 95;
    case "inferred": return 75;
    case "provisional": return 50;
    case "unknown": return 10;
  }
}
