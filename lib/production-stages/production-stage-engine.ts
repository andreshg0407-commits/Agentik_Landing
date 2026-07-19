/**
 * production-stage-engine.ts
 *
 * PRODUCTION-STAGE-ACTIVATION-01 + HARDENING-01: Stage Activation Engine.
 *
 * Transforms ProductionTimeline → ProductionStageActivation.
 *
 * HARDENING-01 changes:
 * - INFERRED status for non-observable stages with evidence before AND after
 * - SKIPPED reserved for optional stages deliberately not executed
 * - Gap detection uses profile requiredStages/optionalStages
 * - Rules with requiresStageTo=true are skipped (engine-level stageTo mapping TBD)
 * - computeProgress includes inferred count
 * - computeCoverage includes inferredStages
 *
 * No React. No Prisma. No server-only. Pure domain logic.
 */

import type {
  ProductionTimeline,
  ProductionTimelineEvent,
} from "@/lib/production-timeline/production-timeline-types";

import type {
  ProductionStageCode,
  ProductionStageActivation,
  ProductionActivatedStage,
  ProductionStageEvidence,
  ProductionStageStatus,
  ProductionStageProgress,
  ProductionStageCoverage,
  ProductionStageGap,
  ProductionStageGapLevel,
  ProductionOrderClassification,
  ProductionOrderClassificationType,
  ProductionProfileId,
  ProductionProfile,
  ProductionStageActivationRule,
  ProductionStageSnapshot,
  ProductionStageMetrics,
} from "./production-stage-types";

import {
  getProductionProfile,
  getStageDefinition,
  DEFAULT_ACTIVATION_RULES,
} from "./production-stage-catalog";

// ── Main Entry Point ─────────────────────────────────────────────────────────

export interface ActivateStagesInput {
  /** The timeline to activate stages for. */
  timeline: ProductionTimeline;
  /** Profile to use. Default: "textile_full". */
  profileId?: ProductionProfileId;
  /** Custom activation rules (merged with defaults). */
  additionalRules?: readonly ProductionStageActivationRule[];
}

/**
 * Activate production stages from a single production timeline.
 *
 * Input: ProductionTimeline (projection of ProductionEvent[]).
 * Output: ProductionStageActivation (stages with evidence, progress, coverage, gaps).
 */
export function activateProductionStages(
  input: ActivateStagesInput,
): ProductionStageActivation {
  const { timeline, profileId = "textile_full", additionalRules = [] } = input;
  const profile = getProductionProfile(profileId);
  const rules = [...DEFAULT_ACTIVATION_RULES, ...additionalRules];

  // Step 1: Map timeline events to stage evidence
  const evidenceMap = mapEventsToStages(timeline.events, rules, profile.stages);

  // Step 2: Build activated stages with status (HARDENING-01: profile-aware)
  const stages = buildActivatedStages(profile, evidenceMap);

  // Step 3: Compute progress (HARDENING-01: includes inferred)
  const progress = computeProgress(stages);

  // Step 4: Compute coverage (HARDENING-01: includes inferredStages)
  const coverage = computeCoverage(stages, profile.observableStages);

  // Step 5: Detect gaps (HARDENING-01: profile-aware required/optional)
  const gap = detectGaps(stages, profile);

  // Step 6: Classify OP
  const classification = classifyOrder(timeline);

  return {
    groupKey: timeline.groupKey,
    organizationId: timeline.organizationId,
    profileId,
    stages,
    progress,
    coverage,
    gap,
    classification,
    computedAt: new Date().toISOString(),
  };
}

// ── Batch Activation ─────────────────────────────────────────────────────────

export interface ActivateBatchInput {
  /** Timelines to process. */
  timelines: ProductionTimeline[];
  /** Organization ID. */
  organizationId: string;
  /** Profile to use. Default: "textile_full". */
  profileId?: ProductionProfileId;
  /** Custom activation rules. */
  additionalRules?: readonly ProductionStageActivationRule[];
}

/**
 * Activate stages for multiple timelines and build an executive snapshot.
 */
export function activateProductionStagesBatch(
  input: ActivateBatchInput,
): ProductionStageSnapshot {
  const { timelines, organizationId, profileId = "textile_full", additionalRules } = input;

  const activations = timelines.map(timeline =>
    activateProductionStages({ timeline, profileId, additionalRules }),
  );

  const metrics = computeStageMetrics(activations, profileId);

  return {
    organizationId,
    profileId,
    activations,
    metrics,
    computedAt: new Date().toISOString(),
  };
}

// ── Step 1: Event → Stage Mapping ────────────────────────────────────────────

function mapEventsToStages(
  events: ProductionTimelineEvent[],
  rules: readonly ProductionStageActivationRule[],
  profileStages: readonly ProductionStageCode[],
): Map<ProductionStageCode, ProductionStageEvidence[]> {
  const evidenceMap = new Map<ProductionStageCode, ProductionStageEvidence[]>();

  // Initialize all profile stages with empty evidence
  for (const code of profileStages) {
    evidenceMap.set(code, []);
  }

  // Apply rules to each event
  for (const evt of events) {
    for (const rule of rules) {
      // HARDENING-01: Skip rules that require stageTo metadata
      // (engine-level stageTo mapping is a future enhancement)
      if (rule.requiresStageTo) continue;

      // Check event type match
      if (rule.eventType !== evt.eventType) continue;

      // Check source document type filter
      if (rule.sourceDocumentType !== null && rule.sourceDocumentType !== evt.sourceDocumentType) {
        continue;
      }

      // Check the activated stage is in the profile
      if (!profileStages.includes(rule.activatesStage)) continue;

      const evidence: ProductionStageEvidence = {
        eventId: evt.eventId,
        eventType: evt.eventType,
        sourceDocumentType: evt.sourceDocumentType,
        eventDate: evt.eventDate,
        rule: rule.ruleName,
      };

      const existing = evidenceMap.get(rule.activatesStage);
      if (existing) {
        existing.push(evidence);
      } else {
        evidenceMap.set(rule.activatesStage, [evidence]);
      }
    }
  }

  return evidenceMap;
}

// ── Step 2: Build Activated Stages (HARDENING-01: profile-aware) ─────────────

function buildActivatedStages(
  profile: ProductionProfile,
  evidenceMap: Map<ProductionStageCode, ProductionStageEvidence[]>,
): ProductionActivatedStage[] {
  const { stages: profileStages, observableStages, optionalStages } = profile;
  const activatedStages: ProductionActivatedStage[] = [];

  for (let i = 0; i < profileStages.length; i++) {
    const code = profileStages[i];
    const def = getStageDefinition(code);
    const evidence = evidenceMap.get(code) ?? [];
    const isObservable = observableStages.includes(code);
    const isOptional = optionalStages.includes(code);
    const hasEvidence = evidence.length > 0;

    // Determine status (HARDENING-01: INFERRED vs SKIPPED distinction)
    const status = determineStatus(
      code, hasEvidence, isObservable, isOptional,
      profileStages, evidenceMap,
    );

    // Date range from evidence
    const dates = evidence.map(e => e.eventDate).sort();
    const firstSeen = dates.length > 0 ? dates[0] : null;
    const lastSeen = dates.length > 0 ? dates[dates.length - 1] : null;

    let durationDays: number | null = null;
    if (firstSeen && lastSeen) {
      const ms = new Date(lastSeen).getTime() - new Date(firstSeen).getTime();
      durationDays = Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
    }

    activatedStages.push({
      code,
      category: def?.category ?? "PLANNING",
      label: def?.label ?? code,
      status,
      order: i,
      erpObservable: isObservable,
      evidence,
      firstSeen,
      lastSeen,
      durationDays,
    });
  }

  return activatedStages;
}

// ── Step 2b: Status Determination (HARDENING-01) ────────────────────────────

/**
 * Determine the status of a stage based on evidence and profile position.
 *
 * HARDENING-01 semantics:
 * - COMPLETED: has evidence AND a successor stage has evidence
 * - ACTIVE: has evidence AND no successor stage has evidence
 * - INFERRED: no evidence, non-observable, but evidence before AND after in the flow
 * - SKIPPED: no evidence, optional stage, evidence of advancement past this stage
 * - NOT_STARTED: observable stage with no evidence
 * - UNKNOWN: cannot determine (non-observable, no surrounding evidence)
 */
function determineStatus(
  code: ProductionStageCode,
  hasEvidence: boolean,
  isObservable: boolean,
  isOptional: boolean,
  profileStages: readonly ProductionStageCode[],
  evidenceMap: Map<ProductionStageCode, ProductionStageEvidence[]>,
): ProductionStageStatus {
  if (hasEvidence) {
    // Check if a successor stage has evidence → this stage is COMPLETED
    const stageIndex = profileStages.indexOf(code);
    const hasSuccessorEvidence = profileStages
      .slice(stageIndex + 1)
      .some(s => (evidenceMap.get(s)?.length ?? 0) > 0);

    return hasSuccessorEvidence ? "COMPLETED" : "ACTIVE";
  }

  // No evidence — check surrounding stages
  const stageIndex = profileStages.indexOf(code);
  const hasPredecessor = profileStages
    .slice(0, stageIndex)
    .some(s => (evidenceMap.get(s)?.length ?? 0) > 0);
  const hasSuccessor = profileStages
    .slice(stageIndex + 1)
    .some(s => (evidenceMap.get(s)?.length ?? 0) > 0);

  if (!isObservable && hasPredecessor && hasSuccessor) {
    // Non-observable stage with evidence before AND after — probably traversed
    return "INFERRED";
  }

  if (isOptional && hasPredecessor && hasSuccessor) {
    // Optional stage with advancement past it — deliberately skipped
    return "SKIPPED";
  }

  if (isObservable) {
    // Observable stage with no evidence
    return "NOT_STARTED";
  }

  return "UNKNOWN";
}

// ── Step 3: Progress (HARDENING-01: includes inferred) ──────────────────────

function computeProgress(stages: ProductionActivatedStage[]): ProductionStageProgress {
  const total = stages.length;
  const completed = stages.filter(s => s.status === "COMPLETED").length;
  const active = stages.filter(s => s.status === "ACTIVE").length;
  const notStarted = stages.filter(s => s.status === "NOT_STARTED").length;
  const inferred = stages.filter(s => s.status === "INFERRED").length;
  const skipped = stages.filter(s => s.status === "SKIPPED").length;
  const unknown = stages.filter(s => s.status === "UNKNOWN").length;

  const observableStages = stages.filter(s => s.erpObservable);
  const observableWithEvidence = observableStages.filter(s => s.evidence.length > 0);

  return {
    total,
    completed,
    active,
    notStarted,
    inferred,
    skipped,
    unknown,
    completionPct: total > 0 ? Math.round((completed / total) * 100) : 0,
    observableCoveragePct: observableStages.length > 0
      ? Math.round((observableWithEvidence.length / observableStages.length) * 100)
      : 0,
  };
}

// ── Step 4: Coverage (HARDENING-01: includes inferredStages) ────────────────

function computeCoverage(
  stages: ProductionActivatedStage[],
  observableStageCodes: readonly ProductionStageCode[],
): ProductionStageCoverage {
  const observableStages = observableStageCodes.slice();
  const observedStages = stages
    .filter(s => s.erpObservable && s.evidence.length > 0)
    .map(s => s.code);
  const unobservedStages = stages
    .filter(s => s.erpObservable && s.evidence.length === 0)
    .map(s => s.code);
  const nonObservableStages = stages
    .filter(s => !s.erpObservable)
    .map(s => s.code);
  const inferredStages = stages
    .filter(s => s.status === "INFERRED")
    .map(s => s.code);

  return {
    observableStages,
    observedStages,
    unobservedStages,
    nonObservableStages,
    inferredStages,
    coverageRatio: observableStages.length > 0
      ? observedStages.length / observableStages.length
      : 0,
  };
}

// ── Step 5: Gap Detection (HARDENING-01: profile-aware) ─────────────────────

function detectGaps(
  stages: ProductionActivatedStage[],
  profile: ProductionProfile,
): ProductionStageGap {
  const { requiredStages, optionalStages, observableStages: observableStageCodes } = profile;

  // Missing required stages: required but no evidence and not inferred
  const missingRequiredStages = stages
    .filter(s =>
      requiredStages.includes(s.code) &&
      s.evidence.length === 0 &&
      s.status !== "INFERRED",
    )
    .map(s => s.code);

  // Missing optional stages: optional but no evidence and not inferred/skipped
  const missingOptionalStages = stages
    .filter(s =>
      optionalStages.includes(s.code) &&
      s.evidence.length === 0 &&
      s.status !== "INFERRED" &&
      s.status !== "SKIPPED",
    )
    .map(s => s.code);

  // Inferred stages
  const inferredStages = stages
    .filter(s => s.status === "INFERRED")
    .map(s => s.code);

  // Skipped stages
  const skippedStages = stages
    .filter(s => s.status === "SKIPPED")
    .map(s => s.code);

  // First/last observable stage presence
  const observableStages = stages.filter(s => observableStageCodes.includes(s.code));
  const firstObservable = observableStages[0];
  const lastObservable = observableStages[observableStages.length - 1];
  const hasFirstStage = firstObservable ? firstObservable.evidence.length > 0 : false;
  const hasLastStage = lastObservable ? lastObservable.evidence.length > 0 : false;

  // Gap level determination (HARDENING-01: based on required stages)
  let level: ProductionStageGapLevel;
  let reason: string;

  if (missingRequiredStages.length === 0) {
    level = "READY";
    reason = "Todas las etapas requeridas tienen evidencia o fueron inferidas.";
  } else if (!hasFirstStage || !hasLastStage) {
    level = "BLOCKED";
    const missing: string[] = [];
    if (!hasFirstStage && firstObservable) missing.push(`primera (${firstObservable.code})`);
    if (!hasLastStage && lastObservable) missing.push(`ultima (${lastObservable.code})`);
    reason = `Etapas criticas sin evidencia: ${missing.join(", ")}. Requeridas faltantes: ${missingRequiredStages.join(", ")}.`;
  } else {
    level = "PARTIAL";
    reason = `${missingRequiredStages.length} etapa(s) requerida(s) sin evidencia: ${missingRequiredStages.join(", ")}.`;
  }

  // Deprecated missingStages (backward compat): all observable stages without evidence
  const missingStages = observableStages
    .filter(s => s.evidence.length === 0)
    .map(s => s.code);

  return {
    level,
    reason,
    missingRequiredStages,
    missingOptionalStages,
    inferredStages,
    skippedStages,
    hasFirstStage,
    hasLastStage,
    missingStages,
  };
}

// ── Step 6: OP Classification ────────────────────────────────────────────────

function classifyOrder(timeline: ProductionTimeline): ProductionOrderClassification {
  const { hasOp, hasCn, hasEt } = timeline.quality;

  let type: ProductionOrderClassificationType;
  let label: string;
  let reason: string;

  if (hasOp && hasCn && hasEt) {
    type = "full_flow";
    label = "Flujo Completo";
    reason = "OP + CN + ET observados. Ciclo productivo completo.";
  } else if (hasOp && hasEt) {
    type = "completed";
    label = "Completada";
    reason = "OP + ET observados. Produccion completada (CN no observado).";
  } else if (hasOp && hasCn) {
    type = "materials_consumed";
    label = "Materiales Consumidos";
    reason = "OP + CN observados. Produccion en proceso, sin entrada de producto terminado.";
  } else if (hasOp) {
    type = "order_only";
    label = "Solo Orden";
    reason = "Solo OP observado. Orden creada pero sin actividad productiva registrada.";
  } else {
    type = "partial";
    label = "Parcial";
    const observed = [hasCn && "CN", hasEt && "ET"].filter(Boolean).join(", ");
    reason = `Eventos parciales (${observed || "desconocidos"}) sin OP.`;
  }

  return { type, label, reason };
}

// ── Step 10: Executive Metrics ───────────────────────────────────────────────

function computeStageMetrics(
  activations: ProductionStageActivation[],
  profileId: ProductionProfileId,
): ProductionStageMetrics {
  const total = activations.length;
  if (total === 0) {
    return emptyMetrics();
  }

  // Classification distribution
  const classificationDistribution: Record<ProductionOrderClassificationType, number> = {
    order_only: 0,
    materials_consumed: 0,
    completed: 0,
    full_flow: 0,
    partial: 0,
  };
  for (const a of activations) {
    classificationDistribution[a.classification.type]++;
  }

  const classificationPcts: Record<ProductionOrderClassificationType, number> = {
    order_only: 0,
    materials_consumed: 0,
    completed: 0,
    full_flow: 0,
    partial: 0,
  };
  for (const key of Object.keys(classificationDistribution) as ProductionOrderClassificationType[]) {
    classificationPcts[key] = Math.round((classificationDistribution[key] / total) * 100);
  }

  // Gap distribution
  const gapDistribution: Record<ProductionStageGapLevel, number> = {
    READY: 0,
    PARTIAL: 0,
    BLOCKED: 0,
  };
  for (const a of activations) {
    gapDistribution[a.gap.level]++;
  }

  // Average completion and coverage
  const avgCompletionPct = Math.round(
    activations.reduce((s, a) => s + a.progress.completionPct, 0) / total,
  );
  const avgCoverageRatio = activations.reduce((s, a) => s + a.coverage.coverageRatio, 0) / total;

  // Per-stage distribution
  const profile = getProductionProfile(profileId);
  const stageDistribution: Record<string, number> = {};
  const stagePcts: Record<string, number> = {};
  for (const code of profile.stages) {
    const count = activations.filter(a =>
      a.stages.some(s => s.code === code && s.evidence.length > 0),
    ).length;
    stageDistribution[code] = count;
    stagePcts[code] = Math.round((count / total) * 100);
  }

  return {
    totalOrders: total,
    classificationDistribution,
    classificationPcts,
    avgCompletionPct,
    avgCoverageRatio: Math.round(avgCoverageRatio * 100) / 100,
    gapDistribution,
    stageDistribution,
    stagePcts,
  };
}

function emptyMetrics(): ProductionStageMetrics {
  return {
    totalOrders: 0,
    classificationDistribution: {
      order_only: 0,
      materials_consumed: 0,
      completed: 0,
      full_flow: 0,
      partial: 0,
    },
    classificationPcts: {
      order_only: 0,
      materials_consumed: 0,
      completed: 0,
      full_flow: 0,
      partial: 0,
    },
    avgCompletionPct: 0,
    avgCoverageRatio: 0,
    gapDistribution: { READY: 0, PARTIAL: 0, BLOCKED: 0 },
    stageDistribution: {},
    stagePcts: {},
  };
}
