/**
 * _production-timeline-01.ts
 *
 * PRODUCTION-TIMELINE-01 + HARDENING-01 — Validation Script.
 *
 * Loads all ProductionEvent data for Castillitos, builds timelines
 * grouped by productionOrderRef, and validates:
 *   - Timeline construction (25+ orders, 25+ references)
 *   - Quality classification (COMPLETE/PARTIAL/INCOMPLETE)
 *   - Duration metrics (OP→CN, CN→ET, OP→ET)
 *   - Material cost aggregation
 *   - Chronological consistency
 *   - Executive metrics
 *   - Readiness assessments
 *
 * HARDENING-01: Uses SAG_PYA_SOURCE_CONFIG and CASTILLITOS_STAGE_CONFIG
 * instead of hardcoded SAG values. OP synthesis via shared synthesizeOpEvent().
 *
 * Usage: npx tsx scripts/_production-timeline-01.ts
 */

import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { buildProductionTimelines } from "@/lib/production-timeline/production-timeline-builder";
import { buildProductionTimelineSnapshot } from "@/lib/production-timeline/production-timeline-metrics";
import {
  synthesizeOpEvent,
  prismaRowToProductionEvent,
} from "@/lib/production-timeline/production-order-synthesis";
import {
  SAG_PYA_SOURCE_CONFIG,
  CASTILLITOS_STAGE_CONFIG,
} from "@/lib/production-timeline/production-timeline-types";
import type { ProductionEvent } from "@/lib/production-events/production-event";
import type {
  ProductionTimelineSnapshot,
} from "@/lib/production-timeline/production-timeline-types";

// ── Config ─────────────────────────────────────────────────────────────────

const TENANT_SLUG = "castillitos";
const SOURCE_CONFIG = SAG_PYA_SOURCE_CONFIG;
const STAGE_CONFIG = CASTILLITOS_STAGE_CONFIG;

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("es-CO");
}

function fmtPct(n: number): string {
  return `${n}%`;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(80));
  console.log("PRODUCTION-TIMELINE-01 + HARDENING-01 — Validation Script");
  console.log("=".repeat(80));
  console.log();
  console.log(`    Source config: ${SOURCE_CONFIG.sourceSystem} (${SOURCE_CONFIG.opSourceRawName})`);
  console.log(`    Group key strategy: ${SOURCE_CONFIG.groupKeyStrategy}`);
  console.log(`    Required stages: ${STAGE_CONFIG.requiredStages.join(", ") || "—"}`);
  console.log();

  // 1. Resolve organization
  const db = prisma as any;
  const org = await db.organization.findFirst({
    where: { slug: TENANT_SLUG },
    select: { id: true, slug: true, name: true },
  });
  if (!org) {
    console.error(`[FATAL] Organization '${TENANT_SLUG}' not found.`);
    process.exit(1);
  }
  console.log(`[1] Organization: ${org.name} (${org.id})`);

  // 2. Load ProductionEvent (CN, ET) + ProductionOrder (OP)
  console.log("[2] Loading ProductionEvent + ProductionOrder records...");

  const [rawEvents, rawOrders] = await Promise.all([
    db.productionEvent.findMany({
      where: { organizationId: org.id },
      include: { lines: true },
      orderBy: { eventDate: "asc" },
    }),
    db.productionOrder.findMany({
      where: { organizationId: org.id },
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
    }),
  ]);

  console.log(`    ProductionEvent records: ${rawEvents.length}`);
  console.log(`    ProductionOrder records: ${rawOrders.length}`);

  // Map using shared functions (HARDENING-01: no duplicated logic)
  const cnEtEvents: ProductionEvent[] = rawEvents.map(prismaRowToProductionEvent);
  const opEvents: ProductionEvent[] = rawOrders.map((o: any) =>
    synthesizeOpEvent(o, SOURCE_CONFIG),
  );

  const events: ProductionEvent[] = [...opEvents, ...cnEtEvents];

  // Count by type
  const byType = new Map<string, number>();
  for (const e of events) {
    byType.set(e.sourceDocumentType, (byType.get(e.sourceDocumentType) ?? 0) + 1);
  }
  console.log("    By document type:");
  for (const [type, count] of byType) {
    console.log(`      ${type}: ${fmt(count)}`);
  }

  const totalLines = events.reduce((s, e) => s + e.lines.length, 0);
  console.log(`    Total lines: ${fmt(totalLines)}`);

  // 3. Build timelines by productionOrderRef (with configured strategy)
  console.log();
  console.log("[3] Building timelines by productionOrderRef...");
  const timelinesOP = buildProductionTimelines({
    events,
    groupBy: "productionOrderRef",
    organizationId: org.id,
    groupKeyStrategy: SOURCE_CONFIG.groupKeyStrategy,
  });
  console.log(`    Timelines built: ${timelinesOP.length}`);

  const snapshotOP = buildProductionTimelineSnapshot(org.id, timelinesOP, STAGE_CONFIG);
  printSnapshotReport(snapshotOP, "productionOrderRef");

  // 4. Build timelines by referenceCode
  console.log();
  console.log("[4] Building timelines by referenceCode...");
  const timelinesRef = buildProductionTimelines({
    events,
    groupBy: "referenceCode",
    organizationId: org.id,
    groupKeyStrategy: SOURCE_CONFIG.groupKeyStrategy,
  });
  console.log(`    Timelines built: ${timelinesRef.length}`);

  const snapshotRef = buildProductionTimelineSnapshot(org.id, timelinesRef, STAGE_CONFIG);
  printSnapshotReport(snapshotRef, "referenceCode");

  // 5. Sample validation — 25 COMPLETE timelines
  console.log();
  console.log("[5] Sample Validation — 25 COMPLETE Timelines (by productionOrderRef)");
  console.log("-".repeat(80));

  const completeTLs = timelinesOP.filter(t => t.quality.level === "COMPLETE");
  const sample = completeTLs.slice(0, 25);

  console.log(`    COMPLETE timelines available: ${completeTLs.length}`);
  console.log(`    Sample size: ${sample.length}`);
  console.log();

  if (sample.length > 0) {
    console.log(
      "    OP# | Events | Lines | OP Date | CN First | CN Last | ET Date | Days OP→ET | Cost | Quality"
    );
    console.log("    " + "-".repeat(105));

    for (const tl of sample) {
      const s = tl.summary;
      console.log(
        `    ${tl.groupKey.padEnd(6)} | ${String(s.eventCount).padStart(6)} | ` +
        `${String(s.totalLineCount).padStart(5)} | ` +
        `${(s.startDate ?? "—").substring(0, 10)} | ` +
        `${(s.firstConsumptionDate ?? "—").substring(0, 10)} | ` +
        `${(s.lastConsumptionDate ?? "—").substring(0, 10)} | ` +
        `${(s.completionDate ?? "—").substring(0, 10)} | ` +
        `${String(s.daysOpToEt ?? "—").padStart(10)} | ` +
        `${fmt(tl.profitability.totalMaterialCost).padStart(10)} | ` +
        `${tl.quality.level}`
      );
    }
  }

  // 6. Chronological consistency check
  console.log();
  console.log("[6] Chronological Consistency Check");
  console.log("-".repeat(80));

  const inconsistent = timelinesOP.filter(t => !t.quality.isChronologicallyConsistent);
  console.log(`    Chronologically consistent: ${timelinesOP.length - inconsistent.length}/${timelinesOP.length}`);
  console.log(`    Inconsistent: ${inconsistent.length}`);

  if (inconsistent.length > 0 && inconsistent.length <= 10) {
    for (const tl of inconsistent) {
      console.log(`      OP ${tl.groupKey}: ${tl.quality.reason}`);
    }
  }

  // 7. Profitability validation
  console.log();
  console.log("[7] Profitability Foundation");
  console.log("-".repeat(80));

  const withCost = timelinesOP.filter(t => t.profitability.hasCostData);
  console.log(`    Timelines with cost data: ${withCost.length}/${timelinesOP.length} (${timelinesOP.length > 0 ? Math.round(withCost.length / timelinesOP.length * 100) : 0}%)`);
  console.log(`    Total material cost: $${fmt(snapshotOP.metrics.totalMaterialCost)}`);
  console.log(`    Avg cost per COMPLETE timeline: $${fmt(snapshotOP.metrics.avgMaterialCostPerTimeline)}`);

  // Top 10 most expensive timelines
  const topCost = [...timelinesOP]
    .filter(t => t.profitability.hasCostData)
    .sort((a, b) => b.profitability.totalMaterialCost - a.profitability.totalMaterialCost)
    .slice(0, 10);

  if (topCost.length > 0) {
    console.log();
    console.log("    Top 10 most expensive production orders:");
    for (const tl of topCost) {
      console.log(
        `      OP ${tl.groupKey}: $${fmt(tl.profitability.totalMaterialCost)} ` +
        `(${tl.profitability.cnEventsWithCost} CN events, ${tl.profitability.cnLinesWithCost} lines)`
      );
    }
  }

  // 8. Readiness
  console.log();
  console.log("[8] Readiness Assessments");
  console.log("-".repeat(80));
  console.log();
  console.log("    STAGE ACTIVATION:");
  console.log(`      Ready: ${snapshotOP.readiness.stages.ready ? "YES" : "NO"}`);
  console.log(`      Available stages: ${snapshotOP.readiness.stages.availableStages.join(", ") || "—"}`);
  console.log(`      Missing stages: ${snapshotOP.readiness.stages.missingStages.join(", ") || "—"}`);
  for (const e of snapshotOP.readiness.stages.evidence) {
    console.log(`      [evidence] ${e}`);
  }
  for (const b of snapshotOP.readiness.stages.blockers) {
    console.log(`      [blocker] ${b}`);
  }

  console.log();
  console.log("    PROFITABILITY:");
  console.log(`      Ready: ${snapshotOP.readiness.profitability.ready ? "YES" : "NO"}`);
  console.log(`      Cost coverage: ${fmtPct(snapshotOP.readiness.profitability.costCoveragePct)}`);
  console.log(`      Revenue data: ${snapshotOP.readiness.profitability.hasRevenueData ? "YES" : "NO"}`);
  for (const e of snapshotOP.readiness.profitability.evidence) {
    console.log(`      [evidence] ${e}`);
  }
  for (const b of snapshotOP.readiness.profitability.blockers) {
    console.log(`      [blocker] ${b}`);
  }

  // 9. TSC check
  console.log();
  console.log("[9] Validation Complete");
  console.log("=".repeat(80));
  console.log();

  await (prisma as any).$disconnect();
}

// ── Report Printer ─────────────────────────────────────────────────────────

function printSnapshotReport(
  snapshot: ProductionTimelineSnapshot,
  label: string,
) {
  const m = snapshot.metrics;
  console.log();
  console.log(`    --- Metrics (groupBy: ${label}) ---`);
  console.log(`    Total timelines: ${fmt(m.totalTimelines)}`);
  console.log(`    COMPLETE: ${fmt(m.completeCount)} (${fmtPct(m.completePct)})`);
  console.log(`    PARTIAL: ${fmt(m.partialCount)} (${fmtPct(m.partialPct)})`);
  console.log(`    INCOMPLETE: ${fmt(m.incompleteCount)} (${fmtPct(m.incompletePct)})`);
  console.log();
  console.log(`    Avg OP→CN: ${fmt(m.avgDaysOpToCn)} days`);
  console.log(`    Avg CN span: ${fmt(m.avgDaysCnSpan)} days`);
  console.log(`    Avg CN→ET: ${fmt(m.avgDaysCnToEt)} days`);
  console.log(`    Avg OP→ET: ${fmt(m.avgDaysOpToEt)} days`);
  console.log(`    Median OP→ET: ${fmt(m.medianDaysOpToEt)} days`);
  console.log(`    Min/Max OP→ET: ${fmt(m.minDaysOpToEt)} / ${fmt(m.maxDaysOpToEt)} days`);
  console.log();
  console.log(`    Total events: ${fmt(m.totalEvents)}`);
  console.log(`    Total lines: ${fmt(m.totalLines)}`);
  console.log(`    Total material cost: $${fmt(m.totalMaterialCost)}`);
  console.log(`    Avg cost/COMPLETE timeline: $${fmt(m.avgMaterialCostPerTimeline)}`);
}

// ── Run ──────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
