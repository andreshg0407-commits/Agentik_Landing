/**
 * production-event-mapping.ts
 *
 * PRODUCTION-EVENT-MODEL-01 — Phases 8 & 9: Universal Source Mapping + Castillitos SAG Mapping.
 *
 * Defines the contract for mapping source documents to universal ProductionEventTypes,
 * and provides the initial Castillitos SAG mapping for all discovered fuentes.
 *
 * No React. No Prisma. No server-only. Pure domain logic.
 */

import type {
  ProductionEventType,
  ProductionEventConfidence,
  ProductionSourceSystem,
} from "./production-event-types";

// ── Universal Source Mapping Contract ────────────────────────────────────────

/**
 * Maps a source system document type to a universal ProductionEventType.
 *
 * Each ERP integration provides a set of these mappings.
 * The mapping tells Agentik what a source document MEANS in universal terms.
 */
export interface ProductionEventSourceMapping {
  /** Which ERP system this mapping applies to. */
  sourceSystem: ProductionSourceSystem;
  /** The ERP's native document type code (e.g. "CN" for SAG). */
  sourceDocumentType: string;
  /** Universal Agentik event type. */
  eventType: ProductionEventType;
  /** How confident this mapping is. */
  confidence: ProductionEventConfidence;
  /** Human-readable explanation of what this document means. */
  businessMeaning: string;
  /** Does this document affect production tracking? */
  affectsProduction: boolean;
  /** Does this document affect inventory levels? */
  affectsInventory: boolean;
  /** Does this document indicate a production stage change? */
  affectsStage: boolean;
  /** Default stage BEFORE this event (if it indicates stage change). */
  defaultStageFrom: string | null;
  /** Default stage AFTER this event (if it indicates stage change). */
  defaultStageTo: string | null;
}

// ── Mapping Lookup ──────────────────────────────────────────────────────────

/**
 * Find the mapping for a source document type.
 *
 * Returns the first matching mapping, or undefined if no mapping exists.
 */
export function findSourceMapping(
  mappings: readonly ProductionEventSourceMapping[],
  sourceSystem: ProductionSourceSystem,
  sourceDocumentType: string,
): ProductionEventSourceMapping | undefined {
  return mappings.find(
    m => m.sourceSystem === sourceSystem && m.sourceDocumentType === sourceDocumentType,
  );
}

/**
 * Map a source document type to a universal ProductionEventType.
 *
 * Falls back to UNKNOWN_PRODUCTION_EVENT if no mapping exists.
 */
export function mapSourceDocumentToProductionEventType(
  mappings: readonly ProductionEventSourceMapping[],
  sourceSystem: ProductionSourceSystem,
  sourceDocumentType: string,
): ProductionEventType {
  const mapping = findSourceMapping(mappings, sourceSystem, sourceDocumentType);
  return mapping?.eventType ?? "UNKNOWN_PRODUCTION_EVENT";
}

// ── Castillitos SAG Mapping (Phase 9) ───────────────────────────────────────

/**
 * Initial SAG mapping for Castillitos.
 *
 * Maps all 17 discovered PRODUCCION fuentes to universal event types.
 * Confidence is "inferred" for synced fuentes (OP) and "provisional"
 * for fuentes not yet synced (CN, ET, PC, EC, T1, T2, Y1, MV, etc.).
 *
 * These mappings will be promoted to "confirmed" after real data validation.
 */
export const CASTILLITOS_SAG_MAPPINGS: readonly ProductionEventSourceMapping[] = [
  // ── Fuente 33 — OP (SYNCED, validated) ──────────────────────────────────
  {
    sourceSystem: "SAG",
    sourceDocumentType: "OP",
    eventType: "PRODUCTION_ORDER_CREATED",
    confidence: "confirmed",
    businessMeaning: "Orden de produccion activada en SAG. Inicia ciclo productivo. Fuente 33.",
    affectsProduction: true,
    affectsInventory: false,
    affectsStage: true,
    defaultStageFrom: null,
    defaultStageTo: "orden_produccion",
  },

  // ── Fuente 80 — CN (SYNCED, confirmed) ─────────────────────────────────
  {
    sourceSystem: "SAG",
    sourceDocumentType: "CN",
    eventType: "MATERIAL_CONSUMED",
    confidence: "confirmed",
    businessMeaning: "Consumo de insumos y materias primas para produccion. Retiro de materiales de Bodegas 14/15. Vinculado a OP via ss_remision. Fuente 80. 7,890 documentos, 81,367 lineas. Evidence: PRODUCTION-CN-EXECUTION-FORENSICS-01.",
    affectsProduction: true,
    affectsInventory: true,
    affectsStage: true,
    defaultStageFrom: "orden_produccion",
    defaultStageTo: "consumo_insumos",
  },

  // ── Fuente 116 — ET (SYNCED, confirmed) ────────────────────────────────
  {
    sourceSystem: "SAG",
    sourceDocumentType: "ET",
    eventType: "PRODUCTION_COMPLETED",
    confidence: "confirmed",
    businessMeaning: "Entrada producto terminado a Bodega 01. Produccion completada. Header-only (0 lineas). Fuente 116. 3,640 documentos. Evidence: PRODUCTION-ET-SYNC-01.",
    affectsProduction: true,
    affectsInventory: true,
    affectsStage: true,
    defaultStageFrom: "servicios",
    defaultStageTo: "entrada_producto",
  },

  // ── Fuente 99 — PC (NOT SYNCED, provisional) ──────────────────────────
  {
    sourceSystem: "SAG",
    sourceDocumentType: "PC",
    eventType: "EXTERNAL_SERVICE_STARTED",
    confidence: "provisional",
    businessMeaning: "Salida a confeccionistas externos. Material enviado para procesamiento externo. Fuente 99. 296 movimientos en SAG.",
    affectsProduction: true,
    affectsInventory: true,
    affectsStage: true,
    defaultStageFrom: "consumo_insumos",
    defaultStageTo: "confeccion_externa",
  },

  // ── Fuente 100 — EC (NOT SYNCED, provisional) ─────────────────────────
  {
    sourceSystem: "SAG",
    sourceDocumentType: "EC",
    eventType: "EXTERNAL_SERVICE_COMPLETED",
    confidence: "provisional",
    businessMeaning: "Entrada de confeccionistas. Material regresa de procesador externo. Fuente 100. 296 movimientos en SAG.",
    affectsProduction: true,
    affectsInventory: true,
    affectsStage: true,
    defaultStageFrom: "confeccion_externa",
    defaultStageTo: "servicios",
  },

  // ── Fuente 129 — T1 (NOT SYNCED, provisional) ─────────────────────────
  {
    sourceSystem: "SAG",
    sourceDocumentType: "T1",
    eventType: "PRODUCTION_MOVED_STAGE",
    confidence: "provisional",
    businessMeaning: "Gastos de terceros tipo T1 (estampacion, bordado). Fuente 129. 80 movimientos en SAG.",
    affectsProduction: true,
    affectsInventory: false,
    affectsStage: true,
    defaultStageFrom: "confeccion_externa",
    defaultStageTo: "servicios",
  },

  // ── Fuente 118 — T2 (NOT SYNCED, provisional) ─────────────────────────
  {
    sourceSystem: "SAG",
    sourceDocumentType: "T2",
    eventType: "PRODUCTION_MOVED_STAGE",
    confidence: "provisional",
    businessMeaning: "Gastos de terceros tipo T2 (segundo acabado). Fuente 118. 9,596 movimientos en SAG.",
    affectsProduction: true,
    affectsInventory: false,
    affectsStage: true,
    defaultStageFrom: "confeccion_externa",
    defaultStageTo: "servicios",
  },

  // ── Fuente 119 — Y1 (NOT SYNCED, provisional) ─────────────────────────
  {
    sourceSystem: "SAG",
    sourceDocumentType: "Y1",
    eventType: "PRODUCTION_MOVED_STAGE",
    confidence: "provisional",
    businessMeaning: "Causacion de servicios de terceros. Mayor volumen de lineas (137,446). Fuente 119. 8,521 movimientos en SAG.",
    affectsProduction: true,
    affectsInventory: false,
    affectsStage: true,
    defaultStageFrom: "confeccion_externa",
    defaultStageTo: "servicios",
  },

  // ── Fuente 115 — MV (NOT SYNCED, provisional) ─────────────────────────
  {
    sourceSystem: "SAG",
    sourceDocumentType: "MV",
    eventType: "PRODUCTION_TRANSFERRED",
    confidence: "provisional",
    businessMeaning: "Traslado de movimientos PDN. Transferencia interna de produccion. Fuente 115. 8,320 movimientos en SAG (0 lineas — investigar).",
    affectsProduction: true,
    affectsInventory: true,
    affectsStage: false,
    defaultStageFrom: null,
    defaultStageTo: null,
  },

  // ── Fuente 81 — PT (INACTIVE — 0 movements in SAG) ────────────────────
  {
    sourceSystem: "SAG",
    sourceDocumentType: "PT",
    eventType: "FINISHED_GOODS_RECEIVED",
    confidence: "provisional",
    businessMeaning: "Entrada PT. Fuente 81. 0 movimientos en SAG — fuente inactiva.",
    affectsProduction: true,
    affectsInventory: true,
    affectsStage: true,
    defaultStageFrom: "servicios",
    defaultStageTo: "entrada_producto",
  },

  // ── Fuente 114 — 04 (NOT SYNCED, provisional) ─────────────────────────
  {
    sourceSystem: "SAG",
    sourceDocumentType: "04",
    eventType: "PRODUCTION_STARTED",
    confidence: "provisional",
    businessMeaning: "Producto en proceso. Fuente 114. 1 movimiento, 248 lineas en SAG.",
    affectsProduction: true,
    affectsInventory: false,
    affectsStage: false,
    defaultStageFrom: null,
    defaultStageTo: null,
  },

  // ── Fuente 117 — CM (INACTIVE — 0 movements in SAG) ───────────────────
  {
    sourceSystem: "SAG",
    sourceDocumentType: "CM",
    eventType: "MATERIAL_CONSUMED",
    confidence: "provisional",
    businessMeaning: "Consumo de muestras. Fuente 117. 0 movimientos en SAG — fuente inactiva.",
    affectsProduction: false,
    affectsInventory: true,
    affectsStage: false,
    defaultStageFrom: null,
    defaultStageTo: null,
  },

  // ── Fuente 126 — AD (NOT SYNCED, provisional) ─────────────────────────
  {
    sourceSystem: "SAG",
    sourceDocumentType: "AD",
    eventType: "UNKNOWN_PRODUCTION_EVENT",
    confidence: "provisional",
    businessMeaning: "Adiciones y faltantes. Ajustes de produccion. Fuente 126. 92 movimientos en SAG.",
    affectsProduction: false,
    affectsInventory: true,
    affectsStage: false,
    defaultStageFrom: null,
    defaultStageTo: null,
  },

  // ── Fuente 127 — CV (NOT SYNCED, provisional) ─────────────────────────
  {
    sourceSystem: "SAG",
    sourceDocumentType: "CV",
    eventType: "MATERIAL_CONSUMED",
    confidence: "provisional",
    businessMeaning: "Consumo de muestras y varios. Fuente 127. 411 movimientos, 15,489 lineas en SAG.",
    affectsProduction: false,
    affectsInventory: true,
    affectsStage: false,
    defaultStageFrom: null,
    defaultStageTo: null,
  },

  // ── Fuente 133 — M2 (NOT SYNCED, provisional) ─────────────────────────
  {
    sourceSystem: "SAG",
    sourceDocumentType: "M2",
    eventType: "FINISHED_GOODS_RECEIVED",
    confidence: "provisional",
    businessMeaning: "Entrada de muestras. Fuente 133. 83 movimientos, 2,916 lineas en SAG.",
    affectsProduction: false,
    affectsInventory: true,
    affectsStage: false,
    defaultStageFrom: null,
    defaultStageTo: null,
  },

  // ── Fuente 140 — SR (NOT SYNCED, provisional) ─────────────────────────
  {
    sourceSystem: "SAG",
    sourceDocumentType: "SR",
    eventType: "UNKNOWN_PRODUCTION_EVENT",
    confidence: "provisional",
    businessMeaning: "Saldo inicial retazos. Fuente 140. 2 movimientos, 106 lineas en SAG.",
    affectsProduction: false,
    affectsInventory: true,
    affectsStage: false,
    defaultStageFrom: null,
    defaultStageTo: null,
  },
] as const;
