/**
 * production-operations-types.ts
 *
 * PRODUCTION-OPERATIONS-WORKSPACE-HARDENING-01 — Domain Types.
 *
 * Snapshot model for the Production Operations Workspace.
 * Consumes V2 universal models: ProductionTimeline + ProductionStageActivation.
 *
 * HARDENING-01 changes:
 * - Removed dead fields: orgSlug, totalQuantity, totalOrders
 * - Added: quantityOrdered, quantityCompleted, completionPct, lastEventDate, daysSinceLastEvent
 * - Removed dead alert type: op_antigua (never generated)
 * - Removed dead alert type: gap_bloqueado (redundant noise)
 * - Simplified DataQuality: removed completeTimelines/partialTimelines/incompleteTimelines
 * - Added lastSync rendering support
 *
 * No Prisma. No React. No server-only. Pure domain types.
 */

import type {
  ProductionOrderClassificationType,
  ProductionStageGapLevel,
  ProductionStageStatus,
  ProductionStageCode,
} from "@/lib/production-stages/production-stage-types";

import type {
  ProductionTimelineQualityLevel,
} from "@/lib/production-timeline/production-timeline-types";

// ── Operations Snapshot ──────────────────────────────────────────────────────

export interface ProductionOperationsSnapshot {
  /** When this snapshot was computed (ISO). */
  computedAt: string;

  /** KPI strip metrics. */
  kpis: ProductionOperationsKpi;
  /** All OP rows for the main table. */
  orders: ProductionOrderOperationalRow[];
  /** Operational alerts. */
  alerts: ProductionOperationalAlert[];
  /** Data quality indicators. */
  dataQuality: ProductionDataQualityIndicators;
  /** Stage activation aggregate (from V2 engine). */
  stageMetrics: ProductionStageAggregate;
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

export interface ProductionOperationsKpi {
  /** Active OPs (incomplete timelines). */
  opActivas: number;
  /** Completed OPs (full_flow or completed classification). */
  opCompletas: number;
  /** OPs with materials consumed but no completion. */
  opParciales: number;
  /** OPs with no consumption events (order_only). */
  opSinConsumo: number;
  /** OPs with no recent activity (>30 days since last event, not completed). */
  opDetenidas: number;
  /** Total material cost across active OPs (COP). */
  costoMaterialActivas: number;
  /** Total material cost across all OPs (COP). */
  costoMaterialTotal: number;
  /** Average production cycle in days (OP to ET, completed only). */
  diasPromedioProduccion: number | null;
}

// ── Order Row ────────────────────────────────────────────────────────────────

export interface ProductionOrderOperationalRow {
  /** Unique ID (groupKey). */
  id: string;
  /** OP number (from timeline groupKey). */
  opNumber: string;
  /** Product reference code. */
  referenceCode: string | null;
  /** Description from first event. */
  description: string | null;

  // ── Quantities ──────────────────────────────────────────────────────────

  /** Quantity ordered (from OP lines). Null if not available. */
  quantityOrdered: number | null;
  /** Quantity completed (sum of ET event quantities). */
  quantityCompleted: number;
  /** Completion percentage. Null if quantityOrdered unavailable or 0. */
  completionPct: number | null;

  // ── Cost ────────────────────────────────────────────────────────────────

  /** Total material cost (from CN events). */
  materialCost: number;

  // ── Classification ──────────────────────────────────────────────────────

  /** OP classification (full_flow, materials_consumed, order_only, etc). */
  classification: ProductionOrderClassificationType;
  /** Classification label (Spanish). */
  classificationLabel: string;
  /** Timeline quality level (COMPLETE, PARTIAL, INCOMPLETE). */
  quality: ProductionTimelineQualityLevel;

  // ── Stage ───────────────────────────────────────────────────────────────

  /** Current stage code inferred from activation engine. */
  currentStage: ProductionStageCode | null;
  /** Current stage label (Spanish, from catalog). */
  currentStageLabel: string | null;
  /** Current stage status (ACTIVE, COMPLETED, etc). */
  currentStageStatus: ProductionStageStatus | null;
  /** Stage completion percentage from activation engine. */
  stageCompletionPct: number;

  // ── Timing ──────────────────────────────────────────────────────────────

  /** Start date (earliest event — usually OP). ISO string. */
  startDate: string | null;
  /** Last event date (most recent event across all types). ISO string. */
  lastEventDate: string | null;
  /** Completion date (ET date, null if not completed). ISO string. */
  completionDate: string | null;
  /** Days elapsed since start. */
  daysElapsed: number;
  /** Days since last event (any type). Null if no events. */
  daysSinceLastEvent: number | null;
  /** Full cycle duration in days (OP to ET, null if incomplete). */
  cycleDays: number | null;

  // ── Events ──────────────────────────────────────────────────────────────

  /** Event count. */
  eventCount: number;
  /** CN event count. */
  cnCount: number;
  /** ET event count. */
  etCount: number;

  // ── Derived ─────────────────────────────────────────────────────────────

  /** Stage gap level from activation engine. */
  gapLevel: ProductionStageGapLevel;
  /** Operational urgency score (higher = needs attention). */
  urgencyScore: number;
  /** Is this OP completed? */
  isCompleted: boolean;
}

// ── Alerts ───────────────────────────────────────────────────────────────────

export type ProductionOperationalAlertType =
  | "op_detenida"
  | "op_sin_consumo"
  | "ciclo_largo"
  | "calidad_datos";

export type ProductionOperationalAlertSeverity = "info" | "warning" | "critical";

export interface ProductionOperationalAlert {
  type: ProductionOperationalAlertType;
  severity: ProductionOperationalAlertSeverity;
  title: string;
  description: string;
  opNumber: string | null;
  referenceCode: string | null;
  metric: number | null;
}

// ── Data Quality ─────────────────────────────────────────────────────────────

export interface ProductionDataQualityIndicators {
  /** Last successful sync (ISO). */
  lastSync: string | null;
  /** Total production events. */
  totalEvents: number;
  /** Total timelines (orders) built. */
  totalTimelines: number;
  /** Cost coverage — percentage of timelines with cost data. */
  costCoveragePct: number;
  /** Chronological consistency percentage. */
  chronologicalConsistencyPct: number;
  /** Last OP event date (ISO). */
  lastOpDate: string | null;
  /** Last CN event date (ISO). */
  lastCnDate: string | null;
  /** Last ET event date (ISO). */
  lastEtDate: string | null;
  /** Warnings (operational only, no technical). */
  warnings: string[];
}

// ── Stage Aggregate ──────────────────────────────────────────────────────────

export interface ProductionStageAggregate {
  /** Average completion percentage across all activations. */
  avgCompletionPct: number;
  /** Average observable coverage ratio. */
  avgCoverageRatio: number;
  /** Classification distribution. */
  classificationDistribution: Record<ProductionOrderClassificationType, number>;
  /** Gap level distribution. */
  gapDistribution: Record<ProductionStageGapLevel, number>;
  /** Per-stage distribution (how many OPs have evidence for each stage). */
  stageDistribution: Record<string, number>;
}

// ── Filter Keys ──────────────────────────────────────────────────────────────

export type ProductionOperationsFilter =
  | "todas"
  | "activas"
  | "completas"
  | "parciales"
  | "sin_consumo"
  | "detenidas"
  | "alto_costo"
  | "con_alerta";
