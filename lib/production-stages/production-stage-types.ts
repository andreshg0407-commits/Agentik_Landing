/**
 * production-stage-types.ts
 *
 * PRODUCTION-STAGE-ACTIVATION-01 + HARDENING-01: Stage Domain Types.
 *
 * Canonical production stage vocabulary. ERP-independent, tenant-configurable.
 *
 * Architecture rule: ProductionEvent → ProductionTimeline → ProductionStageActivation.
 * Stages are ACTIVATED from timeline evidence, never directly from SAG/ERP.
 *
 * No React. No Prisma. No server-only. Pure domain types.
 */

import type { ProductionEventType } from "@/lib/production-events/production-event-types";

// ── Canonical Stage Codes ────────────────────────────────────────────────────

/**
 * 15 canonical production stages in 6 categories.
 *
 * These are ERP-agnostic. Every ERP maps its native documents
 * to a subset of these canonical stages.
 */
export type ProductionStageCode =
  // PLANNING
  | "production_order"
  | "material_allocation"
  // TRANSFORMATION
  | "material_consumption"
  | "cutting"
  | "printing"
  | "embroidery"
  // EXTERNAL
  | "external_manufacturing"
  | "assembly"
  | "third_party_services"
  // CONTROL
  | "finishing"
  | "quality_control"
  // LOGISTICS
  | "packaging"
  | "finished_goods_entry"
  | "warehouse_transfer"
  // COMMERCIAL
  | "commercially_available";

/** The 6 stage categories. */
export type ProductionStageCategory =
  | "PLANNING"
  | "TRANSFORMATION"
  | "EXTERNAL"
  | "CONTROL"
  | "LOGISTICS"
  | "COMMERCIAL";

// ── Stage Status (HARDENING-01: added INFERRED) ─────────────────────────────

/**
 * Status of a stage within a production timeline.
 *
 * - NOT_STARTED: stage exists in the profile but no evidence observed (observable stage)
 * - ACTIVE: evidence of stage entry but no completion signal
 * - COMPLETED: evidence of stage exit or successor stage observed
 * - INFERRED: stage not directly observed, but evidence exists before AND after
 *   in the production flow — the stage was probably traversed (HARDENING-01)
 * - SKIPPED: stage is optional in the profile AND was deliberately not executed
 *   (there is evidence of advancement past this stage without it occurring)
 * - UNKNOWN: cannot determine status from available evidence
 */
export type ProductionStageStatus =
  | "NOT_STARTED"
  | "ACTIVE"
  | "COMPLETED"
  | "INFERRED"
  | "SKIPPED"
  | "UNKNOWN";

// ── Stage Definition ──────────────────────────────────────────────────────────

/** Static definition of a canonical stage. */
export interface ProductionStageDefinition {
  /** Canonical stage code. */
  code: ProductionStageCode;
  /** Category this stage belongs to. */
  category: ProductionStageCategory;
  /** Human-readable stage name (Spanish). */
  label: string;
  /** Stage description. */
  description: string;
  /** Order in the canonical sequence (0-based). */
  order: number;
  /** Is this stage typically observable from ERP data? */
  erpObservable: boolean;
}

// ── Activated Stage ───────────────────────────────────────────────────────────

/**
 * A stage that has been activated (or not) based on timeline evidence.
 *
 * This is the output of the activation engine — each stage in the profile
 * gets an ActivatedStage record describing what was observed.
 */
export interface ProductionActivatedStage {
  /** Canonical stage code. */
  code: ProductionStageCode;
  /** Category. */
  category: ProductionStageCategory;
  /** Human-readable label. */
  label: string;
  /** Current status based on evidence. */
  status: ProductionStageStatus;
  /** Order in the profile sequence. */
  order: number;
  /** Is this stage ERP-observable? */
  erpObservable: boolean;
  /** Evidence that activated this stage. */
  evidence: ProductionStageEvidence[];
  /** First event date for this stage (ISO). Null if not activated. */
  firstSeen: string | null;
  /** Last event date for this stage (ISO). Null if not activated. */
  lastSeen: string | null;
  /** Duration in days from firstSeen to lastSeen. Null if not enough data. */
  durationDays: number | null;
}

/** A piece of evidence linking a timeline event to a stage activation. */
export interface ProductionStageEvidence {
  /** Which timeline event triggered this evidence. */
  eventId: string;
  /** Event type that was mapped. */
  eventType: ProductionEventType;
  /** Source document type (OP, CN, ET, etc.). */
  sourceDocumentType: string;
  /** Event date (ISO). */
  eventDate: string;
  /** Activation rule that matched. */
  rule: string;
}

// ── Stage Activation Result ──────────────────────────────────────────────────

/**
 * Complete stage activation result for a single production timeline.
 *
 * This is the main output — a timeline's events mapped to canonical stages.
 */
export interface ProductionStageActivation {
  /** Timeline group key (OP number). */
  groupKey: string;
  /** Organization ID. */
  organizationId: string;
  /** Profile used for activation. */
  profileId: ProductionProfileId;
  /** All stages in the profile, with their activation status. */
  stages: ProductionActivatedStage[];
  /** Summary progress metrics. */
  progress: ProductionStageProgress;
  /** Coverage analysis. */
  coverage: ProductionStageCoverage;
  /** Gap detection result. */
  gap: ProductionStageGap;
  /** OP classification based on observed stages. */
  classification: ProductionOrderClassification;
  /** When this activation was computed (ISO). */
  computedAt: string;
}

// ── Stage Progress (HARDENING-01: added inferred) ────────────────────────────

/** Progress metrics across all stages in a profile. */
export interface ProductionStageProgress {
  /** Total stages in the profile. */
  total: number;
  /** Stages with status COMPLETED. */
  completed: number;
  /** Stages with status ACTIVE. */
  active: number;
  /** Stages with status NOT_STARTED. */
  notStarted: number;
  /** Stages with status INFERRED (HARDENING-01). */
  inferred: number;
  /** Stages with status SKIPPED. */
  skipped: number;
  /** Stages with status UNKNOWN. */
  unknown: number;
  /** Completion percentage (completed / total * 100). */
  completionPct: number;
  /** Observable stages with evidence / total observable stages * 100. */
  observableCoveragePct: number;
}

// ── Stage Coverage ───────────────────────────────────────────────────────────

/** Coverage analysis: which stages are observable vs non-observable. */
export interface ProductionStageCoverage {
  /** Stages flagged as ERP-observable in the profile. */
  observableStages: ProductionStageCode[];
  /** Observable stages with at least one evidence record. */
  observedStages: ProductionStageCode[];
  /** Observable stages with zero evidence. */
  unobservedStages: ProductionStageCode[];
  /** Stages NOT flagged as ERP-observable. */
  nonObservableStages: ProductionStageCode[];
  /** Stages inferred from surrounding evidence (HARDENING-01). */
  inferredStages: ProductionStageCode[];
  /** Ratio: observedStages.length / observableStages.length. */
  coverageRatio: number;
}

// ── Stage Gap Detection (HARDENING-01: enriched) ─────────────────────────────

/**
 * Gap detection result.
 *
 * - READY: all required stages have evidence or are inferred
 * - PARTIAL: some required stages lack evidence
 * - BLOCKED: critical stages (first or last required) lack evidence
 */
export type ProductionStageGapLevel =
  | "READY"
  | "PARTIAL"
  | "BLOCKED";

export interface ProductionStageGap {
  /** Gap classification. */
  level: ProductionStageGapLevel;
  /** Explanation. */
  reason: string;
  /** Required stages missing evidence (HARDENING-01). */
  missingRequiredStages: ProductionStageCode[];
  /** Optional stages missing evidence (HARDENING-01). */
  missingOptionalStages: ProductionStageCode[];
  /** Stages that were inferred (HARDENING-01). */
  inferredStages: ProductionStageCode[];
  /** Stages deliberately skipped (HARDENING-01). */
  skippedStages: ProductionStageCode[];
  /** Are the first and last observable stages present? */
  hasFirstStage: boolean;
  hasLastStage: boolean;
  /** @deprecated Use missingRequiredStages. Kept for backward compat. */
  missingStages: ProductionStageCode[];
}

// ── OP Classification ────────────────────────────────────────────────────────

/**
 * Classification of a production order based on observed stage progression.
 *
 * - order_only: Only OP observed, no material or completion evidence
 * - materials_consumed: OP + CN observed, but no completion
 * - completed: OP + ET observed (with or without CN)
 * - full_flow: OP + CN + ET all observed
 * - partial: Some events but cannot classify into the above
 */
export type ProductionOrderClassificationType =
  | "order_only"
  | "materials_consumed"
  | "completed"
  | "full_flow"
  | "partial";

export interface ProductionOrderClassification {
  /** Classification type. */
  type: ProductionOrderClassificationType;
  /** Human-readable label. */
  label: string;
  /** Classification reasoning. */
  reason: string;
}

// ── Production Profiles (HARDENING-01: added required/optional/excluded) ─────

/** Known production profile IDs. */
export type ProductionProfileId =
  | "textile_full"
  | "textile_basic"
  | "external_manufacturing"
  | "import_reception"
  | "contract_manufacturing"
  | "custom";

/** A production profile defines which stages apply to a tenant/product line. */
export interface ProductionProfile {
  /** Profile identifier. */
  id: ProductionProfileId;
  /** Human-readable name. */
  name: string;
  /** Description. */
  description: string;
  /** Ordered list of stages in this profile. */
  stages: ProductionStageCode[];
  /** Stages that are ERP-observable in this profile. */
  observableStages: ProductionStageCode[];
  /** Stages that MUST be observed or inferred for the flow to be valid (HARDENING-01). */
  requiredStages: ProductionStageCode[];
  /** Stages that MAY occur but are not blocking if absent (HARDENING-01). */
  optionalStages: ProductionStageCode[];
  /** Stages explicitly excluded from this profile (HARDENING-01). */
  excludedStages: ProductionStageCode[];
}

// ── Stage Activation Mapping Rule (HARDENING-01: added confidence) ──────────

/**
 * Confidence level for an activation rule.
 *
 * - universal: rule applies to any ERP without qualification
 * - erp_specific: rule is correct only for a specific ERP or source document type
 * - requires_metadata: rule needs stageFrom/stageTo or other metadata to be safe
 */
export type ActivationRuleConfidence =
  | "universal"
  | "erp_specific"
  | "requires_metadata";

/**
 * A rule that maps a ProductionEventType to a canonical stage.
 *
 * The activation engine uses these rules to determine which stage
 * a timeline event activates.
 */
export interface ProductionStageActivationRule {
  /** Event type that triggers this rule. */
  eventType: ProductionEventType;
  /** Source document type filter (optional — null matches any). */
  sourceDocumentType: string | null;
  /** Stage this event activates. */
  activatesStage: ProductionStageCode;
  /** Human-readable rule name. */
  ruleName: string;
  /** Confidence level (HARDENING-01). Default: "universal". */
  confidence: ActivationRuleConfidence;
  /** Does this rule require stageTo metadata to be safe? (HARDENING-01). */
  requiresStageTo: boolean;
}

// ── Executive Snapshot ───────────────────────────────────────────────────────

/** Executive-level stage metrics across all timelines in an org. */
export interface ProductionStageSnapshot {
  /** Organization ID. */
  organizationId: string;
  /** Profile used. */
  profileId: ProductionProfileId;
  /** All individual activations. */
  activations: ProductionStageActivation[];
  /** Aggregate metrics. */
  metrics: ProductionStageMetrics;
  /** When computed (ISO). */
  computedAt: string;
}

/** Aggregate stage metrics across all activations. */
export interface ProductionStageMetrics {
  /** Total production orders analyzed. */
  totalOrders: number;
  /** Orders per classification type. */
  classificationDistribution: Record<ProductionOrderClassificationType, number>;
  /** Orders per classification type as percentage. */
  classificationPcts: Record<ProductionOrderClassificationType, number>;
  /** Average completion percentage across all activations. */
  avgCompletionPct: number;
  /** Average observable coverage ratio. */
  avgCoverageRatio: number;
  /** Gap level distribution. */
  gapDistribution: Record<ProductionStageGapLevel, number>;
  /** Per-stage statistics: how many orders have each stage activated. */
  stageDistribution: Record<string, number>;
  /** Per-stage percentage. */
  stagePcts: Record<string, number>;
}
