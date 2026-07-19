/**
 * production-timeline-loader.ts
 *
 * PRODUCTION-TIMELINE-01 — Phase 10: Server-side loader.
 *
 * Queries Prisma for:
 *   - ProductionEvent + ProductionEventLine (CN, ET events)
 *   - ProductionOrder + ProductionOrderLine (OP events)
 *
 * ProductionOrder records are synthesized into ProductionEvent objects
 * so the timeline builder can process all three document types uniformly.
 *
 * This is the only file in production-timeline that touches Prisma.
 *
 * server-only — uses Prisma directly.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type { ProductionEvent } from "@/lib/production-events/production-event";
import type {
  ProductionTimelineGroupBy,
  ProductionTimelineSnapshot,
  ProductionTimelineSourceConfig,
  ProductionTimelineStageConfig,
  ProductionTimeboundMode,
} from "./production-timeline-types";
import { DEFAULT_SOURCE_CONFIG, DEFAULT_STAGE_CONFIG } from "./production-timeline-types";
import { buildProductionTimelines } from "./production-timeline-builder";
import { buildProductionTimelineSnapshot } from "./production-timeline-metrics";
import { synthesizeOpEvent, prismaRowToProductionEvent } from "./production-order-synthesis";

// ── Main Loader ─────────────────────────────────────────────────────────────

export interface LoadTimelineOptions {
  organizationId: string;
  /** How to group events into timelines. Default: "productionOrderRef". */
  groupBy?: ProductionTimelineGroupBy;
  /** Only include events with eventDate >= sinceDate (EVENT_BOUND) or OPs with documentDate >= sinceDate (OP_BOUND). */
  sinceDate?: Date;
  /** Only include specific event types (OP, CN, ET). */
  sourceDocumentTypes?: string[];
  /** Max events to load. Default: 50000. */
  limit?: number;
  /** Source config for OP synthesis. Default: safe CUSTOM config. */
  sourceConfig?: ProductionTimelineSourceConfig;
  /** Stage config for readiness assessment. Default: no expected stages. */
  stageConfig?: ProductionTimelineStageConfig;
  /**
   * Timebound mode. Default: "OP_BOUND".
   *
   * OP_BOUND: sinceDate filters OPs by documentDate. All CN/ET events for those OPs
   * are included regardless of eventDate. Prevents orphan timelines at filter boundary.
   *
   * EVENT_BOUND: sinceDate filters OPs and events independently (legacy behavior).
   */
  timeboundMode?: ProductionTimeboundMode;
}

/** Load production timeline snapshot from Prisma. */
export async function loadProductionTimelineSnapshot(
  opts: LoadTimelineOptions,
): Promise<ProductionTimelineSnapshot> {
  const {
    organizationId,
    groupBy = "productionOrderRef",
    sinceDate,
    sourceDocumentTypes,
    limit = 50000,
    sourceConfig = DEFAULT_SOURCE_CONFIG,
    stageConfig = DEFAULT_STAGE_CONFIG,
    timeboundMode = "OP_BOUND",
  } = opts;

  const includeOP = !sourceDocumentTypes || sourceDocumentTypes.includes("OP");
  const includeCNET = !sourceDocumentTypes ||
    sourceDocumentTypes.some(t => t !== "OP");

  let opEvents: ProductionEvent[] = [];
  let productionEvents: ProductionEvent[] = [];

  if (timeboundMode === "OP_BOUND" && sinceDate && groupBy === "productionOrderRef") {
    // ── OP_BOUND: OPs define the period. Events follow their OPs. ──────
    //
    // 1. Load OPs within the date range
    // 2. Build set of authorized group keys
    // 3. Load ALL CN/ET events (no sinceDate), filter by authorized refs

    if (includeOP) {
      opEvents = await loadProductionOrdersAsEvents({
        organizationId, sinceDate, limit, sourceConfig,
      });
    }

    // Build authorized group keys from loaded OPs
    const authorizedKeys = new Set<string>();
    for (const op of opEvents) {
      const ref = op.productionOrderRef;
      if (ref) {
        authorizedKeys.add(applyGroupKeyStrategyLocal(ref, sourceConfig.groupKeyStrategy));
      }
    }

    if (includeCNET) {
      // Load CN/ET without sinceDate — include all events for authorized OPs
      const allEvents = await loadProductionEvents({
        organizationId, sinceDate: undefined, sourceDocumentTypes, limit,
      });

      // Filter: only events whose stripped ref matches an authorized OP
      productionEvents = allEvents.filter(e => {
        const ref = e.productionOrderRef;
        if (!ref) return false;
        const key = applyGroupKeyStrategyLocal(ref, sourceConfig.groupKeyStrategy);
        return authorizedKeys.has(key);
      });
    }
  } else {
    // ── EVENT_BOUND (legacy): independent sinceDate on OPs and events ──
    [productionEvents, opEvents] = await Promise.all([
      includeCNET
        ? loadProductionEvents({ organizationId, sinceDate, sourceDocumentTypes, limit })
        : [],
      includeOP
        ? loadProductionOrdersAsEvents({ organizationId, sinceDate, limit, sourceConfig })
        : [],
    ]);
  }

  const events = [...opEvents, ...productionEvents];

  // Build timelines with configured group key strategy
  const timelines = buildProductionTimelines({
    events,
    groupBy,
    organizationId,
    groupKeyStrategy: sourceConfig.groupKeyStrategy,
  });

  // Build snapshot with configured stage readiness
  return buildProductionTimelineSnapshot(organizationId, timelines, stageConfig);
}

// ── Group Key Strategy (local copy to avoid circular import from builder) ────

function applyGroupKeyStrategyLocal(
  ref: string,
  strategy: import("./production-timeline-types").ProductionTimelineGroupKeyStrategy,
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

// ── ProductionEvent Loader ──────────────────────────────────────────────────

interface LoadEventsOptions {
  organizationId: string;
  sinceDate?: Date;
  sourceDocumentTypes?: string[];
  limit: number;
}

async function loadProductionEvents(
  opts: LoadEventsOptions,
): Promise<ProductionEvent[]> {
  const db = prisma as any;

  const where: Record<string, unknown> = {
    organizationId: opts.organizationId,
  };

  if (opts.sinceDate) {
    where.eventDate = { gte: opts.sinceDate };
  }

  if (opts.sourceDocumentTypes && opts.sourceDocumentTypes.length > 0) {
    // Filter out "OP" since those come from ProductionOrder
    const filtered = opts.sourceDocumentTypes.filter(t => t !== "OP");
    if (filtered.length > 0) {
      where.sourceDocumentType = { in: filtered };
    }
  }

  const rows = await db.productionEvent.findMany({
    where,
    include: { lines: true },
    orderBy: { eventDate: "asc" },
    take: opts.limit,
  });

  return rows.map(prismaRowToProductionEvent);
}

// ── ProductionOrder → Synthetic ProductionEvent ─────────────────────────────

async function loadProductionOrdersAsEvents(
  opts: { organizationId: string; sinceDate?: Date; limit: number; sourceConfig: ProductionTimelineSourceConfig },
): Promise<ProductionEvent[]> {
  const db = prisma as any;

  const where: Record<string, unknown> = {
    organizationId: opts.organizationId,
  };

  if (opts.sinceDate) {
    where.documentDate = { gte: opts.sinceDate };
  }

  // No lines — OP lines are 56K+ and cause timeout on Neon free tier.
  // Timeline only needs OP header as a date/order marker.
  const orders = await db.productionOrder.findMany({
    where,
    select: {
      id: true,
      organizationId: true,
      erpMovId: true,
      documentNumber: true,
      status: true,
      isClosed: true,
      documentDate: true,
      warehouseCode: true,
      createdBy: true,
      syncedAt: true,
    },
    orderBy: { documentDate: "asc" },
    take: opts.limit,
  });

  return orders.map((o: any) => synthesizeOpEvent(o, opts.sourceConfig));
}

// ── Prisma → Domain Mapping (delegated to shared module) ────────────────────

// Re-exported from production-order-synthesis.ts to eliminate duplication.
