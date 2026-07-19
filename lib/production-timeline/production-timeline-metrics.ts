/**
 * production-timeline-metrics.ts
 *
 * PRODUCTION-TIMELINE-01 — Phase 8: Executive Metrics + Phase 10: Snapshot.
 *
 * Aggregates timeline-level data into executive metrics:
 *   - Average production durations (OP→CN, CN→ET, OP→ET)
 *   - Quality distribution (COMPLETE/PARTIAL/INCOMPLETE percentages)
 *   - Material cost totals
 *   - Readiness assessments (Phases 11-12)
 *
 * No React. No Prisma. No server-only. Pure domain logic.
 */

import type {
  ProductionTimeline,
  ProductionTimelineMetrics,
  ProductionTimelineSnapshot,
  ProductionTimelineReadiness,
  ProductionTimelineStageReadiness,
  ProductionTimelineStageConfig,
  ProductionTimelineProfitabilityReadiness,
} from "./production-timeline-types";
import { DEFAULT_STAGE_CONFIG } from "./production-timeline-types";

// ── Snapshot Builder (Phase 10) ─────────────────────────────────────────────

/** Build a complete timeline snapshot from timelines. */
export function buildProductionTimelineSnapshot(
  organizationId: string,
  timelines: ProductionTimeline[],
  stageConfig?: ProductionTimelineStageConfig,
): ProductionTimelineSnapshot {
  const metrics = buildTimelineMetrics(timelines);
  const readiness = assessReadiness(timelines, metrics, stageConfig);

  return {
    organizationId,
    computedAt: new Date().toISOString(),
    timelines,
    metrics,
    readiness,
  };
}

// ── Executive Metrics (Phase 8) ─────────────────────────────────────────────

export function buildTimelineMetrics(
  timelines: ProductionTimeline[],
): ProductionTimelineMetrics {
  const total = timelines.length;
  const complete = timelines.filter(t => t.quality.level === "COMPLETE");
  const partial = timelines.filter(t => t.quality.level === "PARTIAL");
  const incomplete = timelines.filter(t => t.quality.level === "INCOMPLETE");

  // Duration averages — only from COMPLETE timelines
  const opToCnValues = nonNullValues(complete.map(t => t.summary.daysOpToCn));
  const cnSpanValues = nonNullValues(complete.map(t => t.summary.daysCnSpan));
  const cnToEtValues = nonNullValues(complete.map(t => t.summary.daysCnToEt));
  const opToEtValues = nonNullValues(complete.map(t => t.summary.daysOpToEt));

  // Volume metrics
  const totalEvents = timelines.reduce((s, t) => s + t.summary.eventCount, 0);
  const totalLines = timelines.reduce((s, t) => s + t.summary.totalLineCount, 0);
  const totalMaterialCost = timelines.reduce(
    (s, t) => s + t.profitability.totalMaterialCost,
    0,
  );
  const completeCosts = complete
    .filter(t => t.profitability.hasCostData)
    .map(t => t.profitability.totalMaterialCost);

  return {
    totalTimelines: total,
    completeCount: complete.length,
    partialCount: partial.length,
    incompleteCount: incomplete.length,
    completePct: total > 0 ? Math.round((complete.length / total) * 100) : 0,
    partialPct: total > 0 ? Math.round((partial.length / total) * 100) : 0,
    incompletePct: total > 0 ? Math.round((incomplete.length / total) * 100) : 0,

    avgDaysOpToCn: avg(opToCnValues),
    avgDaysCnSpan: avg(cnSpanValues),
    avgDaysCnToEt: avg(cnToEtValues),
    avgDaysOpToEt: avg(opToEtValues),
    medianDaysOpToEt: median(opToEtValues),
    minDaysOpToEt: opToEtValues.length > 0 ? Math.min(...opToEtValues) : null,
    maxDaysOpToEt: opToEtValues.length > 0 ? Math.max(...opToEtValues) : null,

    totalEvents,
    totalLines,
    totalMaterialCost,
    avgMaterialCostPerTimeline:
      completeCosts.length > 0 ? avg(completeCosts) : null,
  };
}

// ── Readiness Assessments (Phases 11-12) ────────────────────────────────────

function assessReadiness(
  timelines: ProductionTimeline[],
  metrics: ProductionTimelineMetrics,
  stageConfig?: ProductionTimelineStageConfig,
): ProductionTimelineReadiness {
  return {
    stages: assessStageReadiness(timelines, metrics, stageConfig),
    profitability: assessProfitabilityReadiness(timelines, metrics),
  };
}

/** Phase 11: Stage activation readiness (HARDENING-01: config-driven). */
function assessStageReadiness(
  timelines: ProductionTimeline[],
  metrics: ProductionTimelineMetrics,
  stageConfig?: ProductionTimelineStageConfig,
): ProductionTimelineStageReadiness {
  const config = stageConfig ?? DEFAULT_STAGE_CONFIG;
  const evidence: string[] = [];
  const blockers: string[] = [];

  // Collect all observed stage transitions
  const observedStages = new Set<string>();
  for (const t of timelines) {
    for (const e of t.events) {
      if (e.stageFrom) observedStages.add(e.stageFrom);
      if (e.stageTo) observedStages.add(e.stageTo);
    }
  }

  const availableStages = Array.from(observedStages).sort();

  // Evidence from observed stages
  if (availableStages.length > 0) {
    evidence.push(`Etapas observadas: ${availableStages.join(", ")}.`);
  }

  if (metrics.completeCount > 0) {
    evidence.push(`${metrics.completeCount} timelines COMPLETE con ciclo OP->CN->ET validado.`);
  }

  // Check required stages from config
  const missingStages: string[] = [];
  for (const stage of config.requiredStages) {
    if (!observedStages.has(stage)) {
      missingStages.push(stage);
      blockers.push(`Etapa requerida "${stage}" no observada en datos sincronizados.`);
    }
  }

  // Check optional stages (informational, not blocking)
  for (const stage of config.optionalStages) {
    if (!observedStages.has(stage)) {
      evidence.push(`Etapa opcional "${stage}" aun no observada.`);
    }
  }

  // No config = no stage requirements → readiness depends only on observed data
  const hasObservedStages = availableStages.length > 0;
  const ready = config.requiredStages.length > 0
    ? missingStages.length === 0 && hasObservedStages
    : hasObservedStages;

  if (!ready && missingStages.length === 0) {
    blockers.push("No se observan transiciones de etapa en los datos sincronizados.");
  }

  return {
    ready,
    evidence,
    blockers,
    availableStages,
    missingStages,
  };
}

/** Phase 12: Profitability readiness. */
function assessProfitabilityReadiness(
  timelines: ProductionTimeline[],
  metrics: ProductionTimelineMetrics,
): ProductionTimelineProfitabilityReadiness {
  const evidence: string[] = [];
  const blockers: string[] = [];

  const timelinesWithCost = timelines.filter(t => t.profitability.hasCostData);
  const costCoveragePct = timelines.length > 0
    ? Math.round((timelinesWithCost.length / timelines.length) * 100)
    : 0;

  if (timelinesWithCost.length > 0) {
    evidence.push(
      `${timelinesWithCost.length}/${timelines.length} timelines tienen datos de costo (${costCoveragePct}%).`,
    );
  }
  if (metrics.totalMaterialCost > 0) {
    evidence.push(
      `Costo total de materiales: $${metrics.totalMaterialCost.toLocaleString("es-CO")}.`,
    );
  }
  if (metrics.avgMaterialCostPerTimeline !== null) {
    evidence.push(
      `Costo promedio por timeline COMPLETE: $${metrics.avgMaterialCostPerTimeline.toLocaleString("es-CO")}.`,
    );
  }

  // Revenue data check — not yet available
  const hasRevenueData = false;
  if (!hasRevenueData) {
    blockers.push("Datos de ingresos/ventas no disponibles — no se puede calcular margen de ganancia.");
  }
  if (costCoveragePct < 50) {
    blockers.push(
      `Cobertura de costos insuficiente: ${costCoveragePct}% (se requiere >= 50%).`,
    );
  }

  const ready = costCoveragePct >= 50 && hasRevenueData;

  return {
    ready,
    evidence,
    blockers,
    costCoveragePct,
    hasRevenueData,
  };
}

// ── Math Helpers ────────────────────────────────────────────────────────────

function nonNullValues(values: (number | null)[]): number[] {
  return values.filter((v): v is number => v !== null);
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}
