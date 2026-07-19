/**
 * production-timeline-types.ts
 *
 * PRODUCTION-TIMELINE-01 — Phases 2, 5, 6, 8, 9: Domain Model.
 *
 * The Production Timeline is a PROJECTION — it transforms isolated
 * ProductionEvent records into a comprehensible chronological production
 * history per production order or reference code.
 *
 * Timeline is derived, not stored. It never duplicates ProductionEvent data.
 * It never infers state that doesn't exist in the source events.
 *
 * No React. No Prisma. No server-only. Pure domain types.
 */

import type {
  ProductionEventType,
  ProductionEventConfidence,
} from "@/lib/production-events/production-event-types";

// ── Timeline Event ──────────────────────────────────────────────────────────

/**
 * A single event within a production timeline.
 *
 * Normalized from ProductionEvent — carries only the fields needed
 * for chronological analysis. Does NOT duplicate the full event.
 */
export interface ProductionTimelineEvent {
  /** ProductionEvent ID (for traceability). */
  eventId: string;
  /** Universal event type. */
  eventType: ProductionEventType;
  /** Business date (ISO). */
  eventDate: string;
  /** Source document type (OP, CN, ET). */
  sourceDocumentType: string;
  /** Source document number. */
  sourceDocumentNumber: string;
  /** Production order reference (ERP-specific format, normalized via group key strategy). */
  productionOrderRef: string | null;
  /** Product reference code. */
  referenceCode: string | null;
  /** Description. */
  description: string | null;
  /** Quantity affected. */
  quantity: number;
  /** Number of lines in the source event. */
  lineCount: number;
  /** Total material cost (sum of line costs, CN only). */
  materialCost: number;
  /** Stage transition (from mapping). */
  stageFrom: string | null;
  /** Stage transition (from mapping). */
  stageTo: string | null;
  /** Location origin. */
  locationFrom: string | null;
  /** Location destination. */
  locationTo: string | null;
  /** Confidence in event type mapping. */
  confidence: ProductionEventConfidence;
}

// ── Production Timeline ─────────────────────────────────────────────────────

/**
 * A complete production timeline for a single production order or reference.
 *
 * Groups all related events chronologically and computes derived metrics.
 */
export interface ProductionTimeline {
  /** Grouping key (OP number, reference code, or document number). */
  groupKey: string;
  /** How this timeline was grouped. */
  groupBy: ProductionTimelineGroupBy;
  /** Organization ID. */
  organizationId: string;
  /** All events in chronological order. */
  events: ProductionTimelineEvent[];
  /** Computed summary metrics. */
  summary: ProductionTimelineSummary;
  /** Quality classification. */
  quality: ProductionTimelineQuality;
  /** Material cost breakdown (Phase 9). */
  profitability: ProductionTimelineProfitability;
}

export type ProductionTimelineGroupBy =
  | "productionOrderRef"
  | "referenceCode"
  | "documentNumber";

// ── Timeline Summary (Phase 5) ──────────────────────────────────────────────

/** Computed summary metrics for a single timeline. */
export interface ProductionTimelineSummary {
  /** Total events in this timeline. */
  eventCount: number;
  /** Total lines across all events. */
  totalLineCount: number;
  /** Total quantity across all events. */
  totalQuantity: number;

  // ── Date markers ─────────────────────────────────────────────────────────

  /** Earliest event date (usually OP). */
  startDate: string | null;
  /** Date of first MATERIAL_CONSUMED event. */
  firstConsumptionDate: string | null;
  /** Date of last MATERIAL_CONSUMED event. */
  lastConsumptionDate: string | null;
  /** Date of first PRODUCTION_COMPLETED event (ET). */
  completionDate: string | null;

  // ── Duration metrics (days) ──────────────────────────────────────────────

  /** Days from OP to first CN. Null if either is missing. */
  daysOpToCn: number | null;
  /** Days from first CN to last CN. Null if fewer than 2 CN events. */
  daysCnSpan: number | null;
  /** Days from last CN to ET. Null if either is missing. */
  daysCnToEt: number | null;
  /** Days from OP to ET (full production cycle). Null if either is missing. */
  daysOpToEt: number | null;
  /** Days from start to today (for incomplete timelines). */
  daysElapsed: number;

  // ── Event type counts ────────────────────────────────────────────────────

  /** Number of OP events. */
  opCount: number;
  /** Number of CN events. */
  cnCount: number;
  /** Number of ET events. */
  etCount: number;
  /** Number of other event types. */
  otherCount: number;
}

// ── Timeline Quality (Phase 6) ──────────────────────────────────────────────

/**
 * Quality classification for a timeline.
 *
 * COMPLETE: has OP + CN + ET (full lifecycle observed)
 * PARTIAL: has OP + CN but no ET (production in progress)
 * INCOMPLETE: missing OP or CN (limited visibility)
 */
export type ProductionTimelineQualityLevel =
  | "COMPLETE"
  | "PARTIAL"
  | "INCOMPLETE";

export interface ProductionTimelineQuality {
  /** Quality classification. */
  level: ProductionTimelineQualityLevel;
  /** Reason for classification. */
  reason: string;
  /** Has at least one OP event? */
  hasOp: boolean;
  /** Has at least one CN event? */
  hasCn: boolean;
  /** Has at least one ET event? */
  hasEt: boolean;
  /** Is the timeline chronologically consistent? (OP before CN before ET) */
  isChronologicallyConsistent: boolean;
  /** Confidence score (0-100). */
  confidence: number;
}

// ── Timeline Profitability (Phase 9) ────────────────────────────────────────

/** Material cost breakdown for a single timeline. */
export interface ProductionTimelineProfitability {
  /** Total raw material cost (sum of CN line costs). */
  totalMaterialCost: number;
  /** Number of CN events contributing to cost. */
  cnEventsWithCost: number;
  /** Number of CN lines contributing to cost. */
  cnLinesWithCost: number;
  /** Average cost per CN event. */
  avgCostPerCnEvent: number;
  /** Average cost per CN line. */
  avgCostPerCnLine: number;
  /** Has any cost data? */
  hasCostData: boolean;
}

// ── Timeline Snapshot (Phase 10) ────────────────────────────────────────────

/** Complete timeline snapshot for an organization. */
export interface ProductionTimelineSnapshot {
  /** Organization ID. */
  organizationId: string;
  /** When this snapshot was computed. */
  computedAt: string;
  /** All timelines. */
  timelines: ProductionTimeline[];
  /** Executive-level metrics. */
  metrics: ProductionTimelineMetrics;
  /** Readiness assessments. */
  readiness: ProductionTimelineReadiness;
}

// ── Executive Metrics (Phase 8) ─────────────────────────────────────────────

/** Executive-level metrics across all timelines. */
export interface ProductionTimelineMetrics {
  /** Total timelines computed. */
  totalTimelines: number;
  /** Timelines by quality level. */
  completeCount: number;
  partialCount: number;
  incompleteCount: number;
  /** Percentage complete. */
  completePct: number;
  /** Percentage partial. */
  partialPct: number;
  /** Percentage incomplete. */
  incompletePct: number;

  // ── Duration averages (across COMPLETE timelines only) ─────────────────

  /** Average days from OP to first CN. */
  avgDaysOpToCn: number | null;
  /** Average days from first CN to last CN. */
  avgDaysCnSpan: number | null;
  /** Average days from last CN to ET. */
  avgDaysCnToEt: number | null;
  /** Average days from OP to ET (full production cycle). */
  avgDaysOpToEt: number | null;
  /** Median days OP to ET. */
  medianDaysOpToEt: number | null;
  /** Min/Max days OP to ET. */
  minDaysOpToEt: number | null;
  maxDaysOpToEt: number | null;

  // ── Volume metrics ────────────────────────────────────────────────────────

  /** Total events across all timelines. */
  totalEvents: number;
  /** Total lines across all timelines. */
  totalLines: number;
  /** Total material cost across all timelines. */
  totalMaterialCost: number;
  /** Average material cost per COMPLETE timeline. */
  avgMaterialCostPerTimeline: number | null;
}

// ── Readiness Assessments (Phases 11-12) ────────────────────────────────────

export interface ProductionTimelineReadiness {
  /** Stage activation readiness. */
  stages: ProductionTimelineStageReadiness;
  /** Profitability readiness. */
  profitability: ProductionTimelineProfitabilityReadiness;
}

export interface ProductionTimelineStageReadiness {
  /** Is stage activation ready? */
  ready: boolean;
  /** Evidence supporting readiness. */
  evidence: string[];
  /** Blockers if not ready. */
  blockers: string[];
  /** Available stage transitions from synced data. */
  availableStages: string[];
  /** Missing stage transitions (provisional fuentes). */
  missingStages: string[];
}

export interface ProductionTimelineProfitabilityReadiness {
  /** Is profitability analysis ready? */
  ready: boolean;
  /** Evidence supporting readiness. */
  evidence: string[];
  /** Blockers if not ready. */
  blockers: string[];
  /** Cost coverage percentage. */
  costCoveragePct: number;
  /** Revenue data available? */
  hasRevenueData: boolean;
}

// ── Timebound Mode (TIMEBOUND-FIX-01) ──────────────────────────────────────

/**
 * Controls how sinceDate filters relate OPs to their events.
 *
 * - "OP_BOUND": The OP's documentDate defines period membership.
 *   All events for authorized OPs are included regardless of eventDate.
 *   This prevents orphan timelines at the filter boundary.
 *
 * - "EVENT_BOUND": Any event within the period is included independently.
 *   May produce orphan timelines when OP falls outside the window
 *   but its CN/ET events fall inside.
 */
export type ProductionTimeboundMode = "OP_BOUND" | "EVENT_BOUND";

// ── Configuration (HARDENING-01) ────────────────────────────────────────────

/**
 * Source configuration for OP synthesis.
 *
 * Controls how ProductionOrder records are synthesized into ProductionEvent
 * objects. Without this, the loader would hardcode SAG-specific values.
 */
export interface ProductionTimelineSourceConfig {
  /** ERP source system identifier. */
  sourceSystem: import("@/lib/production-events/production-event-types").ProductionSourceSystem;
  /** Source document type code for production orders. */
  opSourceDocumentType: string;
  /** ERP-native raw document code (e.g. "33" for SAG fuente 33). */
  opSourceRawCode: string;
  /** Human-readable document type name. */
  opSourceRawName: string;
  /** Stage assigned to synthesized OP events. */
  opStageTo: string;
  /** Strategy for extracting group keys from productionOrderRef. */
  groupKeyStrategy: ProductionTimelineGroupKeyStrategy;
}

/**
 * Strategy for extracting timeline group keys from productionOrderRef.
 *
 * - "exact": Use the ref as-is. Safe default for unknown ERPs.
 * - "sag-remision-dash-strip": Strip dash suffix (e.g. "3380-1" → "3380").
 *   SAG PYA uses ss_remision format {OP#}-{sequence} for CN/ET documents.
 */
export type ProductionTimelineGroupKeyStrategy =
  | "exact"
  | "sag-remision-dash-strip";

/**
 * Stage configuration for readiness assessment.
 *
 * Controls which stages are expected/optional for a given tenant
 * or production profile. Without this, assessStageReadiness would
 * hardcode Castillitos-specific stages.
 */
export interface ProductionTimelineStageConfig {
  /** Stages required for readiness = true. Empty array = no stage requirement. */
  requiredStages: string[];
  /** Stages that are expected but not blocking. */
  optionalStages: string[];
}

// ── Preset Configs (HARDENING-01) ───────────────────────────────────────────

/** SAG PYA source config for Castillitos. */
export const SAG_PYA_SOURCE_CONFIG: ProductionTimelineSourceConfig = {
  sourceSystem: "SAG",
  opSourceDocumentType: "OP",
  opSourceRawCode: "33",
  opSourceRawName: "Orden de Produccion",
  opStageTo: "orden_produccion",
  groupKeyStrategy: "sag-remision-dash-strip",
};

/** Castillitos stage config — confeccion_externa required but not yet synced. */
export const CASTILLITOS_STAGE_CONFIG: ProductionTimelineStageConfig = {
  requiredStages: ["confeccion_externa", "servicios"],
  optionalStages: [],
};

/** Safe defaults for unknown ERPs — no assumptions. */
export const DEFAULT_SOURCE_CONFIG: ProductionTimelineSourceConfig = {
  sourceSystem: "CUSTOM",
  opSourceDocumentType: "OP",
  opSourceRawCode: "",
  opSourceRawName: "Production Order",
  opStageTo: "production_order",
  groupKeyStrategy: "exact",
};

/** Safe default stage config — no expected stages. */
export const DEFAULT_STAGE_CONFIG: ProductionTimelineStageConfig = {
  requiredStages: [],
  optionalStages: [],
};
