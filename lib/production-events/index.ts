/**
 * production-events/index.ts
 *
 * PRODUCTION-EVENT-MODEL-01 — Public barrel export.
 *
 * Universal production event domain model for Agentik.
 * ERP-agnostic: any source system normalizes into these types.
 *
 * No React. No Prisma. No server-only. Pure domain types.
 */

// Types
export type {
  ProductionEventType,
  ProductionEventStatus,
  ProductionEventConfidence,
  ProductionSourceSystem,
} from "./production-event-types";
export {
  COMPLETION_EVENTS,
  MATERIAL_EVENTS,
  STAGE_MOVEMENT_EVENTS,
  EXTERNAL_SERVICE_EVENTS,
  INVENTORY_AFFECTING_EVENTS,
} from "./production-event-types";

// Source model
export type {
  ProductionEventSource,
  ProductionEventSourceNormalizer,
} from "./production-event-source";

// Event model
export type {
  ProductionEvent,
  ProductionEventLine,
} from "./production-event";

// Mapping
export type { ProductionEventSourceMapping } from "./production-event-mapping";
export {
  findSourceMapping,
  mapSourceDocumentToProductionEventType,
  CASTILLITOS_SAG_MAPPINGS,
} from "./production-event-mapping";

// Builders
export type {
  BuildProductionEventInput,
  BuildProductionEventLineInput,
  BuildFromSourceInput,
} from "./production-event-builders";
export {
  buildProductionEvent,
  buildProductionEventLine,
  buildProductionEventFromSource,
} from "./production-event-builders";

// Utils
export {
  isCompletionEvent,
  isMaterialEvent,
  isStageMovementEvent,
  isExternalServiceEvent,
  isInventoryReceivingEvent,
  eventAffectsInventory,
  eventAffectsProductionStage,
  eventConfidenceLabel,
  eventConfidenceScore,
} from "./production-event-utils";
