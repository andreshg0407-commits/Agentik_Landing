/**
 * _production-timebound-fix-validation.ts
 *
 * PRODUCTION-TIMELINE-TIMEBOUND-FIX-01 — Validation Script.
 * READ ONLY. Compares OP_BOUND vs EVENT_BOUND behavior.
 *
 * Replicates loader logic to avoid server-only import restriction.
 *
 * Usage: npx tsx scripts/_production-timebound-fix-validation.ts
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
import type { ProductionTimeline, ProductionTimelineSnapshot } from "@/lib/production-timeline/production-timeline-types";
import {
  activateProductionStagesBatch,
} from "@/lib/production-stages/production-stage-engine";
import type { ProductionStageActivation } from "@/lib/production-stages/production-stage-types";

const TENANT_SLUG = "castillitos";
const PROFILE_ID = "textile_full";
const RANGE_DAYS = 365;
const SOURCE_CONFIG = SAG_PYA_SOURCE_CONFIG;
const STAGE_CONFIG = CASTILLITOS_STAGE_CONFIG;

function fmt(n: number): string { return n.toLocaleString("es-CO"); }

function applyGroupKey(ref: string): string {
  const dashIdx = ref.indexOf("-");
  return dashIdx > 0 ? ref.substring(0, dashIdx) : ref;
}

interface SnapshotSummary {
  totalTimelines: number;
  complete: number;
  partial: number;
  incomplete: number;
  active: number;
  completed: number;
  detenidas: number;
  alertasCriticas: number;
  costoActivo: number;
  orphanPartials: number;
}

function summarize(
  timelines: ProductionTimeline[],
  activations: Map<string, ProductionStageActivation>,
): SnapshotSummary {
  const now = Date.now();
  let complete = 0, partial = 0, incomplete = 0;
  let active = 0, completed = 0, detenidas = 0, alertasCriticas = 0;
  let costoActivo = 0, orphanPartials = 0;

  for (const tl of timelines) {
    if (tl.quality.level === "COMPLETE") complete++;
    else if (tl.quality.level === "PARTIAL") partial++;
    else incomplete++;

    const activation = activations.get(tl.groupKey);
    const cls = activation?.classification.type ?? "partial";
    const isComp = cls === "full_flow" || cls === "completed";

    if (isComp) { completed++; continue; }

    active++;
    if (!tl.quality.hasOp) orphanPartials++;

    const lastEvent = tl.events[tl.events.length - 1];
    const lastEventDate = lastEvent?.eventDate ?? null;
    const daysSince = lastEventDate
      ? Math.floor((now - new Date(lastEventDate).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    if (daysSince > 30) detenidas++;
    if (daysSince > 60) alertasCriticas++;
    costoActivo += tl.profitability.totalMaterialCost;
  }

  return { totalTimelines: timelines.length, complete, partial, incomplete, active, completed, detenidas, alertasCriticas, costoActivo, orphanPartials };
}

async function loadSnapshot(
  orgId: string,
  sinceDate: Date,
  mode: "OP_BOUND" | "EVENT_BOUND",
): Promise<ProductionTimelineSnapshot> {
  const db = prisma as any;

  // Load OPs within date range
  const opWhere: Record<string, unknown> = { organizationId: orgId };
  if (sinceDate) opWhere.documentDate = { gte: sinceDate };
  const orders = await db.productionOrder.findMany({
    where: opWhere,
    select: { id: true, organizationId: true, erpMovId: true, documentNumber: true, status: true, isClosed: true, documentDate: true, warehouseCode: true, createdBy: true, syncedAt: true },
    orderBy: { documentDate: "asc" },
    take: 50000,
  });
  const opEvents: ProductionEvent[] = orders.map((o: any) => synthesizeOpEvent(o, SOURCE_CONFIG));

  // Load CN/ET events
  let productionEvents: ProductionEvent[];

  if (mode === "OP_BOUND") {
    // Build authorized keys from OPs
    const authorizedKeys = new Set<string>();
    for (const op of opEvents) {
      const ref = op.productionOrderRef;
      if (ref) authorizedKeys.add(applyGroupKey(ref));
    }

    // Load ALL CN/ET (no sinceDate)
    const allEvRows = await db.productionEvent.findMany({
      where: { organizationId: orgId },
      include: { lines: true },
      orderBy: { eventDate: "asc" },
      take: 50000,
    });
    const allEvents: ProductionEvent[] = allEvRows.map(prismaRowToProductionEvent);

    // Filter by authorized refs
    productionEvents = allEvents.filter((e: ProductionEvent) => {
      const ref = e.productionOrderRef;
      if (!ref) return false;
      return authorizedKeys.has(applyGroupKey(ref));
    });
  } else {
    // EVENT_BOUND: apply sinceDate to events independently
    const evWhere: Record<string, unknown> = { organizationId: orgId };
    if (sinceDate) evWhere.eventDate = { gte: sinceDate };
    const evRows = await db.productionEvent.findMany({
      where: evWhere,
      include: { lines: true },
      orderBy: { eventDate: "asc" },
      take: 50000,
    });
    productionEvents = evRows.map(prismaRowToProductionEvent);
  }

  const events = [...opEvents, ...productionEvents];
  const timelines = buildProductionTimelines({
    events,
    groupBy: "productionOrderRef",
    organizationId: orgId,
    groupKeyStrategy: SOURCE_CONFIG.groupKeyStrategy,
  });
  return buildProductionTimelineSnapshot(orgId, timelines, STAGE_CONFIG);
}

async function main() {
  const db = prisma as any;
  const org = await db.organization.findFirst({
    where: { slug: TENANT_SLUG },
    select: { id: true, name: true },
  });
  if (!org) { console.error("Organization not found"); process.exit(1); }

  const sinceDate = new Date(Date.now() - RANGE_DAYS * 24 * 60 * 60 * 1000);

  console.log("=".repeat(80));
  console.log("PRODUCTION-TIMELINE-TIMEBOUND-FIX-01 — Validation");
  console.log("=".repeat(80));
  console.log(`Organization: ${org.name}`);
  console.log(`sinceDate: ${sinceDate.toISOString().slice(0, 10)}`);

  // ── EVENT_BOUND (legacy) ──
  console.log("\n[1] Loading EVENT_BOUND (legacy)...");
  const eventBoundSnap = await loadSnapshot(org.id, sinceDate, "EVENT_BOUND");
  const eventBoundStages = activateProductionStagesBatch({
    timelines: eventBoundSnap.timelines, organizationId: org.id, profileId: PROFILE_ID as any,
  });
  const ebMap = new Map<string, ProductionStageActivation>();
  for (const a of eventBoundStages.activations) ebMap.set(a.groupKey, a);
  const before = summarize(eventBoundSnap.timelines, ebMap);

  // ── OP_BOUND (fix) ──
  console.log("[2] Loading OP_BOUND (fix)...");
  const opBoundSnap = await loadSnapshot(org.id, sinceDate, "OP_BOUND");
  const opBoundStages = activateProductionStagesBatch({
    timelines: opBoundSnap.timelines, organizationId: org.id, profileId: PROFILE_ID as any,
  });
  const obMap = new Map<string, ProductionStageActivation>();
  for (const a of opBoundStages.activations) obMap.set(a.groupKey, a);
  const after = summarize(opBoundSnap.timelines, obMap);

  // ── Comparison ──
  console.log("\n" + "=".repeat(80));
  console.log("COMPARISON: EVENT_BOUND (before) vs OP_BOUND (after)");
  console.log("=".repeat(80));

  const rows: [string, number | string, number | string, string][] = [
    ["Total timelines", before.totalTimelines, after.totalTimelines, ""],
    ["  COMPLETE", before.complete, after.complete, ""],
    ["  PARTIAL", before.partial, after.partial, ""],
    ["  INCOMPLETE", before.incomplete, after.incomplete, ""],
    ["Active", before.active, after.active, before.active !== after.active ? "FIXED" : ""],
    ["Completed", before.completed, after.completed, ""],
    ["Detenidas (>30d)", before.detenidas, after.detenidas, before.detenidas !== after.detenidas ? "FIXED" : ""],
    ["Alertas criticas (>60d)", before.alertasCriticas, after.alertasCriticas, before.alertasCriticas !== after.alertasCriticas ? "FIXED" : ""],
    ["Orphan partials", before.orphanPartials, after.orphanPartials, before.orphanPartials !== after.orphanPartials ? "FIXED" : ""],
    ["Costo activo", `$${fmt(Math.round(before.costoActivo / 1000))}K`, `$${fmt(Math.round(after.costoActivo / 1000))}K`, ""],
  ];

  console.log(`\n  ${"Metric".padEnd(28)} | ${"BEFORE".padStart(10)} | ${"AFTER".padStart(10)} | Status`);
  console.log(`  ${"-".repeat(28)}-+-${"-".repeat(10)}-+-${"-".repeat(10)}-+-------`);
  for (const [label, b, a, status] of rows) {
    console.log(`  ${label.padEnd(28)} | ${String(b).padStart(10)} | ${String(a).padStart(10)} | ${status}`);
  }

  // ── Audit targets ──
  console.log("\n" + "=".repeat(80));
  console.log("AUDIT TARGET COMPARISON");
  console.log("=".repeat(80));

  const targets: [string, number, number][] = [
    ["Activas", 46, after.active],
    ["Detenidas", 6, after.detenidas],
    ["Alertas criticas", 3, after.alertasCriticas],
    ["Completadas", 584, after.completed],
    ["Orphan partials", 0, after.orphanPartials],
  ];

  for (const [label, target, actual] of targets) {
    const match = target === actual ? "MATCH" : `DELTA ${actual - target}`;
    console.log(`  ${label.padEnd(20)} | Target: ${String(target).padStart(4)} | Actual: ${String(actual).padStart(4)} | ${match}`);
  }

  // ── Remaining orphans ──
  if (after.orphanPartials > 0) {
    console.log(`\n  NOTE: ${after.orphanPartials} orphan partials remain — events with no matching OP in the system.`);
    const orphans = opBoundSnap.timelines.filter(tl => {
      const act = obMap.get(tl.groupKey);
      const cls = act?.classification.type ?? "partial";
      return !(cls === "full_flow" || cls === "completed") && !tl.quality.hasOp;
    });
    for (const o of orphans.slice(0, 10)) {
      const types = o.events.map(e => e.sourceDocumentType).join(",");
      console.log(`    ${o.groupKey}: events=[${types}], quality=${o.quality.level}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("VALIDATION COMPLETE");
  console.log("=".repeat(80));

  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
