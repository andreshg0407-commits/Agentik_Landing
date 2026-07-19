/**
 * production-operations-service.ts
 *
 * PRODUCTION-OPERATIONS-WORKSPACE-HARDENING-01 — Service Layer.
 *
 * Builds ProductionOperationsSnapshot by consuming V2 universal models:
 *   - loadProductionTimelineSnapshot() from production-timeline
 *   - activateProductionStagesBatch() from production-stages
 *
 * HARDENING-01 changes:
 * - Config resolved via resolveProductionOperationsConfig() (no hardcoded SAG imports)
 * - Default temporal filter: last 365 days (avoids historical OP noise)
 * - Quantity fields: quantityOrdered (from OP), quantityCompleted (from ET)
 * - lastEventDate + daysSinceLastEvent computed per row
 * - Urgency score rewritten: recency-weighted, not days-elapsed-dominated
 * - Alerts: removed gap_bloqueado (redundant), improved thresholds
 * - Data quality: last event dates per type (OP/CN/ET)
 *
 * server-only — uses Prisma via timeline loader.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  loadProductionTimelineSnapshot,
} from "@/lib/production-timeline/production-timeline-loader";
import type {
  ProductionTimeline,
  ProductionTimelineSnapshot,
} from "@/lib/production-timeline/production-timeline-types";
import {
  activateProductionStagesBatch,
} from "@/lib/production-stages/production-stage-engine";
import { getStageDefinition } from "@/lib/production-stages/production-stage-catalog";
import type {
  ProductionStageActivation,
  ProductionStageSnapshot,
} from "@/lib/production-stages/production-stage-types";
import { resolveProductionOperationsConfig } from "./production-operations-config";
import type {
  ProductionOperationsSnapshot,
  ProductionOperationsKpi,
  ProductionOrderOperationalRow,
  ProductionOperationalAlert,
  ProductionDataQualityIndicators,
  ProductionStageAggregate,
} from "./production-operations-types";

// ── Main Entry ──────────────────────────────────────────────────────────────

export interface BuildSnapshotOptions {
  /** Override default date range. Null = no filter (all time). */
  sinceDate?: Date | null;
}

export async function buildProductionOperationsSnapshot(
  organizationId: string,
  orgSlug: string,
  options?: BuildSnapshotOptions,
): Promise<ProductionOperationsSnapshot> {
  const config = resolveProductionOperationsConfig(orgSlug);

  // Default: last N days (from config). Override with sinceDate or null for all time.
  const sinceDate = options?.sinceDate !== undefined
    ? (options.sinceDate ?? undefined)
    : new Date(Date.now() - config.defaultRangeDays * 24 * 60 * 60 * 1000);

  // Load V2 universal timeline snapshot
  const [timelineSnapshot, lastSync] = await Promise.all([
    loadProductionTimelineSnapshot({
      organizationId,
      groupBy: "productionOrderRef",
      sourceConfig: config.sourceConfig,
      stageConfig: config.stageConfig,
      sinceDate,
    }),
    loadLastSync(organizationId, config.connectorSource),
  ]);

  // Activate stages for all timelines
  const stageSnapshot = activateProductionStagesBatch({
    timelines: timelineSnapshot.timelines,
    organizationId,
    profileId: config.profileId,
  });

  // Build activation lookup (groupKey -> activation)
  const activationMap = new Map<string, ProductionStageActivation>();
  for (const a of stageSnapshot.activations) {
    activationMap.set(a.groupKey, a);
  }

  // Build order rows
  const orders = buildOrderRows(timelineSnapshot.timelines, activationMap);

  // Build all snapshot sections
  const kpis = buildKpis(orders, timelineSnapshot);
  const alerts = buildAlerts(orders);
  const dataQuality = buildDataQuality(timelineSnapshot, lastSync);
  const stageMetrics = buildStageAggregate(stageSnapshot);

  return {
    computedAt: new Date().toISOString(),
    kpis,
    orders,
    alerts,
    dataQuality,
    stageMetrics,
  };
}

// ── Order Row Builder ───────────────────────────────────────────────────────

function buildOrderRows(
  timelines: ProductionTimeline[],
  activationMap: Map<string, ProductionStageActivation>,
): ProductionOrderOperationalRow[] {
  const rows: ProductionOrderOperationalRow[] = [];
  const now = Date.now();

  for (const tl of timelines) {
    const activation = activationMap.get(tl.groupKey);
    const { summary, quality, profitability } = tl;

    // Current stage from activation (last stage with evidence)
    let currentStage: ProductionOrderOperationalRow["currentStage"] = null;
    let currentStageLabel: string | null = null;
    let currentStageStatus: ProductionOrderOperationalRow["currentStageStatus"] = null;

    if (activation) {
      const activeOrCompleted = activation.stages.filter(
        s => s.status === "ACTIVE" || s.status === "COMPLETED",
      );
      const lastActive = activeOrCompleted[activeOrCompleted.length - 1];
      if (lastActive) {
        currentStage = lastActive.code;
        // Use catalog label (Spanish) instead of activation label
        currentStageLabel = getStageDefinition(lastActive.code)?.label ?? lastActive.label;
        currentStageStatus = lastActive.status;
      }
    }

    // Classification
    const classification = activation?.classification.type ?? "partial";
    const classificationLabel = activation?.classification.label ?? "Parcial";
    const isCompleted = classification === "full_flow" || classification === "completed";

    // First event reference and description
    const firstEvent = tl.events[0];
    const referenceCode = firstEvent?.referenceCode ?? null;
    const description = firstEvent?.description ?? null;

    // Quantities: OP = ordered, ET = completed
    const opQuantity = tl.events
      .filter(e => e.sourceDocumentType === "OP")
      .reduce((s, e) => s + e.quantity, 0);
    const etQuantity = tl.events
      .filter(e => e.sourceDocumentType === "ET")
      .reduce((s, e) => s + e.quantity, 0);

    // OP quantity is 0 when lines aren't loaded — treat as null
    const quantityOrdered = opQuantity > 0 ? opQuantity : null;
    const quantityCompleted = etQuantity;
    const completionPct = quantityOrdered && quantityOrdered > 0
      ? Math.min(100, Math.round((quantityCompleted / quantityOrdered) * 100))
      : null;

    // Last event date (most recent across all event types)
    const lastEvent = tl.events[tl.events.length - 1];
    const lastEventDate = lastEvent?.eventDate ?? null;
    const daysSinceLastEvent = lastEventDate
      ? Math.max(0, Math.floor((now - new Date(lastEventDate).getTime()) / (1000 * 60 * 60 * 24)))
      : null;

    // Urgency score: recency-weighted
    const urgencyScore = computeUrgencyScore(tl, activation, daysSinceLastEvent);

    rows.push({
      id: tl.groupKey,
      opNumber: tl.groupKey,
      referenceCode,
      description,
      quantityOrdered,
      quantityCompleted,
      completionPct,
      materialCost: profitability.totalMaterialCost,
      classification,
      classificationLabel,
      quality: quality.level,
      currentStage,
      currentStageLabel,
      currentStageStatus,
      stageCompletionPct: activation?.progress.completionPct ?? 0,
      startDate: summary.startDate,
      lastEventDate,
      completionDate: summary.completionDate,
      daysElapsed: summary.daysElapsed,
      daysSinceLastEvent,
      cycleDays: summary.daysOpToEt,
      eventCount: summary.eventCount,
      cnCount: summary.cnCount,
      etCount: summary.etCount,
      gapLevel: activation?.gap.level ?? "BLOCKED",
      urgencyScore,
      isCompleted,
    });
  }

  // Sort: completed at end, then by urgency score descending
  rows.sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    return b.urgencyScore - a.urgencyScore;
  });

  return rows;
}

// ── Urgency Score (HARDENING-01: recency-weighted) ──────────────────────────

function computeUrgencyScore(
  tl: ProductionTimeline,
  activation: ProductionStageActivation | undefined,
  daysSinceLastEvent: number | null,
): number {
  let score = 0;
  const { summary, quality } = tl;
  const isCompleted = quality.hasOp && quality.hasEt;

  if (isCompleted) return 0;

  // Days since last event is the primary signal (not total age)
  const inactiveDays = daysSinceLastEvent ?? summary.daysElapsed;

  if (inactiveDays > 90) score += 40;
  else if (inactiveDays > 60) score += 30;
  else if (inactiveDays > 30) score += 20;
  else if (inactiveDays > 14) score += 10;

  // No consumption events = stalled at start
  if (summary.opCount > 0 && summary.cnCount === 0) score += 25;

  // Has consumption but no completion (stuck mid-flow)
  if (summary.cnCount > 0 && summary.etCount === 0) {
    score += 15;
    // Extra penalty if stuck a long time after consuming
    if (inactiveDays > 45) score += 10;
  }

  // Gap blocked
  if (activation?.gap.level === "BLOCKED") score += 5;

  return score;
}

// ── KPIs ────────────────────────────────────────────────────────────────────

function buildKpis(
  orders: ProductionOrderOperationalRow[],
  snapshot: ProductionTimelineSnapshot,
): ProductionOperationsKpi {
  const active = orders.filter(o => !o.isCompleted);
  const { metrics } = snapshot;

  // Detenidas: no event in 30+ days AND not completed
  const opDetenidas = active.filter(o =>
    o.daysSinceLastEvent !== null && o.daysSinceLastEvent > 30,
  ).length;

  const costoMaterialActivas = active.reduce((s, o) => s + o.materialCost, 0);

  return {
    opActivas: active.length,
    opCompletas: orders.filter(o => o.isCompleted).length,
    opParciales: orders.filter(o => o.classification === "materials_consumed").length,
    opSinConsumo: orders.filter(o => o.classification === "order_only").length,
    opDetenidas,
    costoMaterialActivas,
    costoMaterialTotal: metrics.totalMaterialCost,
    diasPromedioProduccion: metrics.avgDaysOpToEt,
  };
}

// ── Alerts (HARDENING-01: removed gap_bloqueado, improved signals) ──────────

function buildAlerts(
  orders: ProductionOrderOperationalRow[],
): ProductionOperationalAlert[] {
  const alerts: ProductionOperationalAlert[] = [];
  const active = orders.filter(o => !o.isCompleted);

  // Detenidas: no activity in 60+ days
  for (const o of active.filter(o =>
    o.daysSinceLastEvent !== null && o.daysSinceLastEvent > 60,
  )) {
    alerts.push({
      type: "op_detenida",
      severity: "critical",
      title: `OP ${o.opNumber} sin actividad`,
      description: `${o.daysSinceLastEvent} dias sin movimiento. Ultimo evento: ${formatDateShort(o.lastEventDate)}`,
      opNumber: o.opNumber,
      referenceCode: o.referenceCode,
      metric: o.daysSinceLastEvent!,
    });
  }

  // Sin consumo: order created 14+ days ago, no CN events
  for (const o of active.filter(o =>
    o.classification === "order_only" &&
    o.daysElapsed > 14 &&
    (o.daysSinceLastEvent === null || o.daysSinceLastEvent <= 60),
  )) {
    alerts.push({
      type: "op_sin_consumo",
      severity: "warning",
      title: `OP ${o.opNumber} sin consumo de materiales`,
      description: `Orden creada hace ${o.daysElapsed} dias sin registro de retiro de materiales`,
      opNumber: o.opNumber,
      referenceCode: o.referenceCode,
      metric: o.daysElapsed,
    });
  }

  // Ciclo largo: materials consumed but no completion in 60+ days
  for (const o of active.filter(o =>
    o.classification === "materials_consumed" &&
    o.daysSinceLastEvent !== null &&
    o.daysSinceLastEvent > 60,
  )) {
    alerts.push({
      type: "ciclo_largo",
      severity: "warning",
      title: `OP ${o.opNumber} ciclo prolongado`,
      description: `Materiales consumidos pero sin entrada de producto terminado. ${o.daysSinceLastEvent} dias sin actividad`,
      opNumber: o.opNumber,
      referenceCode: o.referenceCode,
      metric: o.daysSinceLastEvent!,
    });
  }

  // Sort: critical first
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

  return alerts;
}

// ── Data Quality ────────────────────────────────────────────────────────────

function buildDataQuality(
  snapshot: ProductionTimelineSnapshot,
  lastSync: string | null,
): ProductionDataQualityIndicators {
  const { metrics, timelines } = snapshot;
  const warnings: string[] = [];

  if (metrics.totalTimelines === 0) {
    warnings.push("Sin ordenes de produccion en el periodo seleccionado.");
  }

  // Find last event dates by type
  let lastOpDate: string | null = null;
  let lastCnDate: string | null = null;
  let lastEtDate: string | null = null;

  for (const tl of timelines) {
    for (const ev of tl.events) {
      if (ev.sourceDocumentType === "OP" && (!lastOpDate || ev.eventDate > lastOpDate)) {
        lastOpDate = ev.eventDate;
      }
      if (ev.sourceDocumentType === "CN" && (!lastCnDate || ev.eventDate > lastCnDate)) {
        lastCnDate = ev.eventDate;
      }
      if (ev.sourceDocumentType === "ET" && (!lastEtDate || ev.eventDate > lastEtDate)) {
        lastEtDate = ev.eventDate;
      }
    }
  }

  // Chronological consistency
  const consistent = timelines.filter(t => t.quality.isChronologicallyConsistent).length;
  const chronoPct = timelines.length > 0 ? Math.round((consistent / timelines.length) * 100) : 100;

  // Cost coverage
  const withCost = timelines.filter(t => t.profitability.hasCostData).length;
  const costPct = timelines.length > 0 ? Math.round((withCost / timelines.length) * 100) : 0;

  return {
    lastSync,
    totalEvents: metrics.totalEvents,
    totalTimelines: metrics.totalTimelines,
    costCoveragePct: costPct,
    chronologicalConsistencyPct: chronoPct,
    lastOpDate,
    lastCnDate,
    lastEtDate,
    warnings,
  };
}

// ── Stage Aggregate ─────────────────────────────────────────────────────────

function buildStageAggregate(
  stageSnapshot: ProductionStageSnapshot,
): ProductionStageAggregate {
  return {
    avgCompletionPct: stageSnapshot.metrics.avgCompletionPct,
    avgCoverageRatio: stageSnapshot.metrics.avgCoverageRatio,
    classificationDistribution: stageSnapshot.metrics.classificationDistribution,
    gapDistribution: stageSnapshot.metrics.gapDistribution,
    stageDistribution: stageSnapshot.metrics.stageDistribution,
  };
}

// ── Last Sync Helper ────────────────────────────────────────────────────────

async function loadLastSync(
  organizationId: string,
  connectorSource: string,
): Promise<string | null> {
  if (!connectorSource) return null;
  const db = prisma as any;
  try {
    const lastRun = await db.connectorRun.findFirst({
      where: {
        connector: { organizationId, source: connectorSource },
        module: "production",
        status: "SUCCESS",
      },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    });
    return lastRun?.completedAt?.toISOString() ?? null;
  } catch {
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDateShort(iso: string | null): string {
  if (!iso) return "\u2014";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "\u2014";
  }
}
