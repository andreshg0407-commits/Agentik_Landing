/**
 * production-types.ts
 *
 * CASTILLITOS-EXECUTIVE-REPORTS-01
 * Types for Production In Progress Intelligence.
 *
 * Production stage inference is configurable — NOT hardcoded.
 * If evidence is insufficient, stage = "indeterminada" with reduced confidence.
 *
 * No Prisma. No React. No server-only. Pure domain types.
 */

// ── SAG Production Input ─────────────────────────────────────────────────────

/** SAG document types relevant to production lifecycle. */
export type SagProductionDocType =
  | "OP"   // Orden de Produccion (fuente 33)
  | "CN"   // Consumo de Insumos y Telas (fuente 80)
  | "PC"   // Salida a Confeccionistas (fuente 99)
  | "EC"   // Entrada de Confeccionistas (fuente 100)
  | "ET"   // Entrada Producto Terminado (fuente 116)
  | "T1"   // Servicio T1 (fuente 129)
  | "T2"   // Servicio T2 (fuente 118)
  | "Y1";  // Servicio Y1 (fuente 119)

/** Raw SAG production movement record. */
export interface SagProductionRecord {
  /** SAG movimiento ID. */
  movimientoId: string;
  /** Document type. */
  docType: SagProductionDocType;
  /** SAG fuente number. */
  fuente: number;
  /** Reference code (product). */
  reference: string;
  /** Product description. */
  description: string;
  /** SubLinea (LATIN KIDS, CASTILLITOS, IMPORTACION). */
  subLinea: string;
  /** SubGrupo (product type). */
  subGrupo: string;
  /** Bodega code. */
  bodega: string;
  /** Quantity. */
  cantidad: number;
  /** Document date (ISO). */
  fechaDocumento: string;
  /** Whether the document is closed. */
  cerrado: boolean;
  /** OP number (parent production order). */
  opNumero?: string;
}

// ── Production Stage Inference ───────────────────────────────────────────────

/** A production stage definition (configurable). */
export interface ProductionStageDefinition {
  /** Unique stage ID (e.g. "corte", "confeccion"). */
  stageId: string;
  /** Display label. */
  label: string;
  /** Order in the production flow (lower = earlier). */
  order: number;
  /** SAG document types that indicate this stage is active or complete. */
  indicatorDocTypes: SagProductionDocType[];
  /** Description of what this stage means. */
  description: string;
}

/** Evidence supporting a stage inference. */
export interface ProductionStageEvidence {
  /** Which document type was found. */
  docType: SagProductionDocType;
  /** SAG fuente number. */
  fuente: number;
  /** Date of the evidence document. */
  date: string;
  /** Quantity in the document. */
  quantity: number;
  /** Whether the document is closed. */
  closed: boolean;
  /** Human-readable description of this evidence. */
  description: string;
}

/** Confidence assessment for a stage inference. */
export interface ProductionStageConfidence {
  /** Confidence score (0-100). */
  score: number;
  /** Human-readable reason. */
  reason: string;
  /** Number of evidence items. */
  evidenceCount: number;
  /** Whether the stage could be determined. */
  determined: boolean;
}

/** Inferred production stage for a reference. */
export interface ProductionStageInference {
  /** The inferred stage ID (or "indeterminada"). */
  stageId: string;
  /** Display label for the stage. */
  stageLabel: string;
  /** Stage order (for sorting). */
  stageOrder: number;
  /** Evidence items supporting this inference. */
  evidence: ProductionStageEvidence[];
  /** Confidence in this inference. */
  confidence: ProductionStageConfidence;
}

// ── Production Report ────────────────────────────────────────────────────────

/** Production status for a single reference. */
export type ProductionStatus =
  | "en_proceso"      // Active production
  | "completado"      // ET found — product entered Bodega 01
  | "detenido"        // No movement in extended period
  | "indeterminado";  // Insufficient evidence

/** A single reference in the production report. */
export interface ProductionRow {
  /** SAG reference code. */
  reference: string;
  /** Product description. */
  description: string;
  /** SubGrupo (product type). */
  subGrupo: string;
  /** SubLinea (commercial line). */
  subLinea: string;
  /** OP activation date (ISO). */
  fechaActivacionOP: string;
  /** Production status. */
  status: ProductionStatus;
  /** Inferred current stage. */
  etapaActual: ProductionStageInference;
  /** Days in production (from OP activation to now). */
  diasEnProduccion: number;
  /** Quantity in production. */
  cantidadEnProceso: number;
  /** Observations (auto-generated from evidence). */
  observaciones: string;
  /** OP number (if known). */
  opNumero: string;
}

/** Summary for a SubLinea. */
export interface ProductionSubLineaSummary {
  subLinea: string;
  totalReferences: number;
  enProcesoCount: number;
  completadoCount: number;
  detenidoCount: number;
  indeterminadoCount: number;
  avgDiasEnProduccion: number;
  rows: ProductionRow[];
}

/** Complete production in progress report. */
export interface ProductionInProgressReport {
  /** Organization ID. */
  orgSlug: string;
  /** When this report was computed. */
  computedAt: string;
  /** Source bodega for production inventory. */
  sourceBodega: string;
  /** Total unique references in production. */
  totalReferences: number;
  /** Counts by status. */
  enProcesoCount: number;
  completadoCount: number;
  detenidoCount: number;
  indeterminadoCount: number;
  /** Average days in production. */
  avgDiasEnProduccion: number;
  /** Breakdown by SubLinea. */
  subLineas: ProductionSubLineaSummary[];
  /** Flat rows (all references, sorted). */
  rows: ProductionRow[];
  /** Stage definitions used for inference. */
  stageDefinitions: ProductionStageDefinition[];
  /** Data confidence (0-100). */
  confidence: number;
  /** Reason for confidence level. */
  confidenceReason: string;
}
