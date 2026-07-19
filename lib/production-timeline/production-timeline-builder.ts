/**
 * production-timeline-builder.ts
 *
 * PRODUCTION-TIMELINE-01 — Phases 3, 4, 5, 6, 9: Timeline Builder.
 *
 * Transforms ProductionEvent[] into ProductionTimeline[].
 *
 * The builder:
 *   1. Normalizes each ProductionEvent into a ProductionTimelineEvent
 *   2. Groups events by productionOrderRef, referenceCode, or documentNumber
 *   3. Sorts events chronologically within each group
 *   4. Computes summary, quality, and profitability for each timeline
 *
 * This is a PROJECTION — no state mutation, no Prisma writes.
 *
 * No React. No Prisma. No server-only. Pure domain logic.
 */

import type {
  ProductionEvent,
} from "@/lib/production-events/production-event";
import type {
  ProductionTimeline,
  ProductionTimelineEvent,
  ProductionTimelineGroupBy,
  ProductionTimelineGroupKeyStrategy,
  ProductionTimelineSummary,
  ProductionTimelineQuality,
  ProductionTimelineQualityLevel,
  ProductionTimelineProfitability,
} from "./production-timeline-types";

// ── Event Normalization (Phase 3) ───────────────────────────────────────────

/**
 * Normalize a ProductionEvent into a ProductionTimelineEvent.
 *
 * Extracts only the fields needed for timeline analysis.
 * Material cost is derived from line-level metadata (CN events only).
 */
export function normalizeToTimelineEvent(
  event: ProductionEvent,
): ProductionTimelineEvent {
  // Sum material costs from CN line metadata
  let materialCost = 0;
  if (event.eventType === "MATERIAL_CONSUMED") {
    for (const line of event.lines) {
      const cost = (line.lineMetadata as Record<string, unknown>)?.cost;
      if (typeof cost === "number" && cost > 0) {
        materialCost += cost;
      }
    }
  }

  return {
    eventId: event.id,
    eventType: event.eventType,
    eventDate: event.eventDate,
    sourceDocumentType: event.sourceDocumentType,
    sourceDocumentNumber: event.source.sourceDocumentNumber,
    productionOrderRef: event.productionOrderRef,
    referenceCode: event.referenceCode,
    description: event.description,
    quantity: event.quantity,
    lineCount: event.lineCount,
    materialCost,
    stageFrom: event.stageFrom,
    stageTo: event.stageTo,
    locationFrom: event.locationFrom,
    locationTo: event.locationTo,
    confidence: event.confidence,
  };
}

// ── Timeline Builder (Phase 4) ──────────────────────────────────────────────

export interface BuildTimelinesInput {
  /** Raw ProductionEvent records. */
  events: ProductionEvent[];
  /** How to group events into timelines. */
  groupBy: ProductionTimelineGroupBy;
  /** Organization ID. */
  organizationId: string;
  /** Strategy for extracting group keys. Default: "exact". */
  groupKeyStrategy?: ProductionTimelineGroupKeyStrategy;
}

/**
 * Build production timelines from a set of ProductionEvent records.
 *
 * Groups events by the specified key, sorts chronologically,
 * and computes summary/quality/profitability for each group.
 */
export function buildProductionTimelines(
  input: BuildTimelinesInput,
): ProductionTimeline[] {
  const { events, groupBy, organizationId, groupKeyStrategy = "exact" } = input;

  // Normalize all events
  const timelineEvents = events.map(normalizeToTimelineEvent);

  // Group by key
  const groups = new Map<string, ProductionTimelineEvent[]>();
  for (const evt of timelineEvents) {
    const key = extractGroupKey(evt, groupBy, groupKeyStrategy);
    if (!key) continue; // Skip events without the grouping key
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(evt);
  }

  // Build timelines
  const timelines: ProductionTimeline[] = [];
  for (const [groupKey, groupEvents] of groups) {
    // Sort chronologically (earliest first)
    groupEvents.sort((a, b) => a.eventDate.localeCompare(b.eventDate));

    const summary = buildTimelineSummary(groupEvents);
    const quality = classifyTimelineQuality(groupEvents, summary);
    const profitability = buildTimelineProfitability(groupEvents);

    timelines.push({
      groupKey,
      groupBy,
      organizationId,
      events: groupEvents,
      summary,
      quality,
      profitability,
    });
  }

  // Sort timelines: COMPLETE first, then by start date descending
  timelines.sort((a, b) => {
    const qOrder: Record<ProductionTimelineQualityLevel, number> = {
      COMPLETE: 0,
      PARTIAL: 1,
      INCOMPLETE: 2,
    };
    const qDiff = qOrder[a.quality.level] - qOrder[b.quality.level];
    if (qDiff !== 0) return qDiff;
    // Within same quality, most recent first
    const aStart = a.summary.startDate ?? "";
    const bStart = b.summary.startDate ?? "";
    return bStart.localeCompare(aStart);
  });

  return timelines;
}

// ── Group Key Extraction (HARDENING-01) ─────────────────────────────────────

function extractGroupKey(
  evt: ProductionTimelineEvent,
  groupBy: ProductionTimelineGroupBy,
  strategy: ProductionTimelineGroupKeyStrategy,
): string | null {
  switch (groupBy) {
    case "productionOrderRef": {
      const ref = evt.productionOrderRef;
      if (!ref) return null;
      return applyGroupKeyStrategy(ref, strategy);
    }
    case "referenceCode":
      return evt.referenceCode || null;
    case "documentNumber":
      return evt.sourceDocumentNumber || null;
  }
}

/**
 * Apply group key strategy to a productionOrderRef.
 *
 * - "exact": return ref unchanged. Safe default for unknown ERPs.
 * - "sag-remision-dash-strip": strip dash suffix (e.g. "3380-1" → "3380").
 *   SAG PYA CN/ET documents use ss_remision format {OP#}-{sequence}.
 */
function applyGroupKeyStrategy(
  ref: string,
  strategy: ProductionTimelineGroupKeyStrategy,
): string {
  switch (strategy) {
    case "sag-remision-dash-strip": {
      const dashIdx = ref.indexOf("-");
      return dashIdx > 0 ? ref.substring(0, dashIdx) : ref;
    }
    case "exact":
    default:
      return ref;
  }
}

// ── Timeline Summary (Phase 5) ──────────────────────────────────────────────

function buildTimelineSummary(
  events: ProductionTimelineEvent[],
): ProductionTimelineSummary {
  const now = Date.now();

  // Classify events
  const opEvents = events.filter(e => e.eventType === "PRODUCTION_ORDER_CREATED");
  const cnEvents = events.filter(e => e.eventType === "MATERIAL_CONSUMED");
  const etEvents = events.filter(e => e.eventType === "PRODUCTION_COMPLETED");
  const otherEvents = events.filter(e =>
    e.eventType !== "PRODUCTION_ORDER_CREATED" &&
    e.eventType !== "MATERIAL_CONSUMED" &&
    e.eventType !== "PRODUCTION_COMPLETED"
  );

  // Date markers
  const startDate = events.length > 0 ? events[0].eventDate : null;
  const firstConsumptionDate = cnEvents.length > 0 ? cnEvents[0].eventDate : null;
  const lastConsumptionDate = cnEvents.length > 0 ? cnEvents[cnEvents.length - 1].eventDate : null;
  const completionDate = etEvents.length > 0 ? etEvents[0].eventDate : null;

  // Duration calculations
  const daysOpToCn = computeDaysBetween(
    opEvents.length > 0 ? opEvents[0].eventDate : null,
    firstConsumptionDate,
  );
  const daysCnSpan = computeDaysBetween(firstConsumptionDate, lastConsumptionDate);
  const daysCnToEt = computeDaysBetween(lastConsumptionDate, completionDate);
  const daysOpToEt = computeDaysBetween(
    opEvents.length > 0 ? opEvents[0].eventDate : null,
    completionDate,
  );

  const startMs = startDate ? new Date(startDate).getTime() : now;
  const daysElapsed = Math.max(0, Math.floor((now - startMs) / (1000 * 60 * 60 * 24)));

  return {
    eventCount: events.length,
    totalLineCount: events.reduce((s, e) => s + e.lineCount, 0),
    totalQuantity: events.reduce((s, e) => s + e.quantity, 0),
    startDate,
    firstConsumptionDate,
    lastConsumptionDate,
    completionDate,
    daysOpToCn,
    daysCnSpan,
    daysCnToEt,
    daysOpToEt,
    daysElapsed,
    opCount: opEvents.length,
    cnCount: cnEvents.length,
    etCount: etEvents.length,
    otherCount: otherEvents.length,
  };
}

// ── Timeline Quality (Phase 6) ──────────────────────────────────────────────

function classifyTimelineQuality(
  events: ProductionTimelineEvent[],
  summary: ProductionTimelineSummary,
): ProductionTimelineQuality {
  const hasOp = summary.opCount > 0;
  const hasCn = summary.cnCount > 0;
  const hasEt = summary.etCount > 0;

  // Chronological consistency: OP date <= CN date <= ET date
  let isChronologicallyConsistent = true;
  if (hasOp && hasCn && summary.startDate && summary.firstConsumptionDate) {
    if (summary.startDate > summary.firstConsumptionDate) {
      // OP after CN — still possible in real data (CN can precede OP date slightly)
      // Allow 7-day tolerance
      const diffDays = computeDaysBetween(summary.firstConsumptionDate, summary.startDate);
      if (diffDays !== null && diffDays > 7) {
        isChronologicallyConsistent = false;
      }
    }
  }
  if (hasCn && hasEt && summary.lastConsumptionDate && summary.completionDate) {
    if (summary.lastConsumptionDate > summary.completionDate) {
      isChronologicallyConsistent = false;
    }
  }

  let level: ProductionTimelineQualityLevel;
  let reason: string;
  let confidence: number;

  if (hasOp && hasCn && hasEt) {
    level = "COMPLETE";
    reason = "Ciclo completo: OP + CN + ET observados.";
    confidence = isChronologicallyConsistent ? 95 : 80;
  } else if (hasOp && hasCn) {
    level = "PARTIAL";
    reason = "OP + CN sin ET — produccion en progreso o ET aun no sincronizado.";
    confidence = 70;
  } else if (hasCn && hasEt) {
    level = "PARTIAL";
    reason = "CN + ET sin OP — OP puede haberse creado antes del rango de sync.";
    confidence = 65;
  } else if (hasOp && hasEt) {
    level = "PARTIAL";
    reason = "OP + ET sin CN — CN puede no haberse sincronizado o fue 0-line.";
    confidence = 60;
  } else {
    level = "INCOMPLETE";
    reason = `Solo ${[hasOp && "OP", hasCn && "CN", hasEt && "ET"].filter(Boolean).join(", ") || "eventos desconocidos"} observados.`;
    confidence = 40;
  }

  return {
    level,
    reason,
    hasOp,
    hasCn,
    hasEt,
    isChronologicallyConsistent,
    confidence,
  };
}

// ── Timeline Profitability (Phase 9) ────────────────────────────────────────

function buildTimelineProfitability(
  events: ProductionTimelineEvent[],
): ProductionTimelineProfitability {
  const cnEvents = events.filter(e => e.eventType === "MATERIAL_CONSUMED");
  const eventsWithCost = cnEvents.filter(e => e.materialCost > 0);
  const totalCost = eventsWithCost.reduce((s, e) => s + e.materialCost, 0);
  const totalLines = eventsWithCost.reduce((s, e) => s + e.lineCount, 0);

  return {
    totalMaterialCost: totalCost,
    cnEventsWithCost: eventsWithCost.length,
    cnLinesWithCost: totalLines,
    avgCostPerCnEvent: eventsWithCost.length > 0
      ? Math.round(totalCost / eventsWithCost.length)
      : 0,
    avgCostPerCnLine: totalLines > 0
      ? Math.round(totalCost / totalLines)
      : 0,
    hasCostData: totalCost > 0,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function computeDaysBetween(
  from: string | null,
  to: string | null,
): number | null {
  if (!from || !to) return null;
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (isNaN(fromMs) || isNaN(toMs)) return null;
  return Math.max(0, Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24)));
}
