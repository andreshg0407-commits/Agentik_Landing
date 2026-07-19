/**
 * _production-timeline-hardening-01.ts
 *
 * PRODUCTION-TIMELINE-HARDENING-01 — Phase 10: Multi-ERP Group Key Validation.
 *
 * Validates that:
 * - "exact" strategy preserves multi-segment IDs intact
 * - "sag-remision-dash-strip" correctly strips SAG sequence suffixes
 * - Default config uses "exact" (safe for unknown ERPs)
 *
 * No database required. Pure in-memory validation.
 *
 * Usage: npx tsx scripts/_production-timeline-hardening-01.ts
 */

import { buildProductionTimelines } from "@/lib/production-timeline/production-timeline-builder";
import { buildProductionTimelineSnapshot } from "@/lib/production-timeline/production-timeline-metrics";
import {
  SAG_PYA_SOURCE_CONFIG,
  CASTILLITOS_STAGE_CONFIG,
  DEFAULT_SOURCE_CONFIG,
  DEFAULT_STAGE_CONFIG,
} from "@/lib/production-timeline/production-timeline-types";
import type { ProductionEvent } from "@/lib/production-events/production-event";

// ── Test Data ──────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<ProductionEvent> & { id: string }): ProductionEvent {
  return {
    organizationId: "test-org",
    eventType: "MATERIAL_CONSUMED",
    sourceSystem: "CUSTOM",
    sourceDocumentType: "CN",
    source: {
      sourceSystem: "CUSTOM",
      sourceDocumentType: "CN",
      sourceDocumentId: overrides.id,
      sourceDocumentNumber: "",
      sourceRawCode: "",
      sourceRawName: "",
      sourceTimestamp: "2026-01-01T00:00:00.000Z",
      sourceMetadata: {},
    },
    productionOrderRef: null,
    referenceCode: null,
    description: null,
    lineCount: 0,
    line: null,
    subGroup: null,
    locationFrom: null,
    locationTo: null,
    stageFrom: null,
    stageTo: null,
    quantity: 0,
    eventDate: "2026-01-01T00:00:00.000Z",
    detectedAt: "2026-01-01T00:00:00.000Z",
    status: "active",
    confidence: "confirmed",
    evidence: {},
    metadata: {},
    lines: [],
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`    ✓ ${label}`);
    passed++;
  } else {
    console.log(`    ✗ FAIL: ${label}`);
    failed++;
  }
}

function main() {
  console.log("=".repeat(80));
  console.log("PRODUCTION-TIMELINE-HARDENING-01 — Multi-ERP Group Key Validation");
  console.log("=".repeat(80));
  console.log();

  // ── Test 1: "exact" strategy preserves multi-segment IDs ──────────────

  console.log("[1] Strategy: exact — multi-segment IDs preserved");

  const multiSegmentRefs = [
    "PO-2024-001",
    "MO-ABC-999",
    "ORD-PROD-10-25",
    "PROD-001-A-2",
    "12345",
  ];

  const exactEvents: ProductionEvent[] = multiSegmentRefs.flatMap(ref => [
    makeEvent({
      id: `op-${ref}`,
      eventType: "PRODUCTION_ORDER_CREATED",
      sourceDocumentType: "OP",
      productionOrderRef: ref,
      eventDate: "2026-01-01T00:00:00.000Z",
    }),
    makeEvent({
      id: `cn-${ref}`,
      eventType: "MATERIAL_CONSUMED",
      sourceDocumentType: "CN",
      productionOrderRef: ref,
      eventDate: "2026-01-15T00:00:00.000Z",
    }),
    makeEvent({
      id: `et-${ref}`,
      eventType: "PRODUCTION_COMPLETED",
      sourceDocumentType: "ET",
      productionOrderRef: ref,
      eventDate: "2026-02-01T00:00:00.000Z",
    }),
  ]);

  const exactTimelines = buildProductionTimelines({
    events: exactEvents,
    groupBy: "productionOrderRef",
    organizationId: "test-org",
    groupKeyStrategy: "exact",
  });

  assert(exactTimelines.length === multiSegmentRefs.length,
    `Expected ${multiSegmentRefs.length} timelines, got ${exactTimelines.length}`);

  const exactKeys = exactTimelines.map(t => t.groupKey).sort();
  const expectedKeys = [...multiSegmentRefs].sort();
  assert(JSON.stringify(exactKeys) === JSON.stringify(expectedKeys),
    `Group keys preserved: ${exactKeys.join(", ")}`);

  for (const tl of exactTimelines) {
    assert(tl.quality.level === "COMPLETE",
      `Timeline ${tl.groupKey}: COMPLETE (has OP+CN+ET)`);
  }

  // ── Test 2: "sag-remision-dash-strip" strips SAG sequences ───────────

  console.log();
  console.log("[2] Strategy: sag-remision-dash-strip — SAG sequences stripped");

  const sagEvents: ProductionEvent[] = [
    makeEvent({
      id: "op-100",
      eventType: "PRODUCTION_ORDER_CREATED",
      sourceDocumentType: "OP",
      productionOrderRef: "3380",
      eventDate: "2026-01-01T00:00:00.000Z",
    }),
    makeEvent({
      id: "cn-100-1",
      eventType: "MATERIAL_CONSUMED",
      sourceDocumentType: "CN",
      productionOrderRef: "3380-1",
      eventDate: "2026-01-10T00:00:00.000Z",
    }),
    makeEvent({
      id: "cn-100-2",
      eventType: "MATERIAL_CONSUMED",
      sourceDocumentType: "CN",
      productionOrderRef: "3380-2",
      eventDate: "2026-01-20T00:00:00.000Z",
    }),
    makeEvent({
      id: "et-100",
      eventType: "PRODUCTION_COMPLETED",
      sourceDocumentType: "ET",
      productionOrderRef: "3380-1",
      eventDate: "2026-02-15T00:00:00.000Z",
    }),
  ];

  const sagTimelines = buildProductionTimelines({
    events: sagEvents,
    groupBy: "productionOrderRef",
    organizationId: "test-org",
    groupKeyStrategy: "sag-remision-dash-strip",
  });

  assert(sagTimelines.length === 1,
    `Expected 1 merged timeline, got ${sagTimelines.length}`);
  assert(sagTimelines[0].groupKey === "3380",
    `Group key = "3380" (stripped from "3380-1", "3380-2")`);
  assert(sagTimelines[0].quality.level === "COMPLETE",
    `Quality = COMPLETE (OP+CN+ET merged)`);
  assert(sagTimelines[0].summary.eventCount === 4,
    `Event count = 4 (1 OP + 2 CN + 1 ET)`);

  // ── Test 3: "exact" does NOT strip dashes (contrast) ─────────────────

  console.log();
  console.log("[3] Strategy: exact — SAG-style refs kept separate");

  const exactSagTimelines = buildProductionTimelines({
    events: sagEvents,
    groupBy: "productionOrderRef",
    organizationId: "test-org",
    groupKeyStrategy: "exact",
  });

  assert(exactSagTimelines.length === 3,
    `Expected 3 separate timelines (exact), got ${exactSagTimelines.length}`);

  const exactSagKeys = exactSagTimelines.map(t => t.groupKey).sort();
  assert(exactSagKeys.includes("3380"),
    `"3380" is a separate key`);
  assert(exactSagKeys.includes("3380-1"),
    `"3380-1" is a separate key`);
  assert(exactSagKeys.includes("3380-2"),
    `"3380-2" is a separate key`);

  // ── Test 4: Default config uses "exact" ──────────────────────────────

  console.log();
  console.log("[4] Default config safety");

  assert(DEFAULT_SOURCE_CONFIG.groupKeyStrategy === "exact",
    `DEFAULT_SOURCE_CONFIG.groupKeyStrategy = "exact"`);
  assert(DEFAULT_SOURCE_CONFIG.sourceSystem === "CUSTOM",
    `DEFAULT_SOURCE_CONFIG.sourceSystem = "CUSTOM"`);
  assert(DEFAULT_STAGE_CONFIG.requiredStages.length === 0,
    `DEFAULT_STAGE_CONFIG.requiredStages = [] (no assumptions)`);

  // ── Test 5: SAG config preset ────────────────────────────────────────

  console.log();
  console.log("[5] SAG PYA config preset");

  assert(SAG_PYA_SOURCE_CONFIG.groupKeyStrategy === "sag-remision-dash-strip",
    `SAG_PYA_SOURCE_CONFIG.groupKeyStrategy = "sag-remision-dash-strip"`);
  assert(SAG_PYA_SOURCE_CONFIG.sourceSystem === "SAG",
    `SAG_PYA_SOURCE_CONFIG.sourceSystem = "SAG"`);
  assert(SAG_PYA_SOURCE_CONFIG.opSourceRawCode === "33",
    `SAG_PYA_SOURCE_CONFIG.opSourceRawCode = "33"`);

  // ── Test 6: Stage readiness with no config ───────────────────────────

  console.log();
  console.log("[6] Stage readiness — no config (default)");

  const snapshotDefault = buildProductionTimelineSnapshot(
    "test-org",
    exactTimelines,
    DEFAULT_STAGE_CONFIG,
  );

  assert(snapshotDefault.readiness.stages.missingStages.length === 0,
    `No missing stages with default config`);
  assert(snapshotDefault.readiness.stages.ready === false,
    `Ready = false (test events have no stage data — nothing to activate)`);

  // ── Test 7: Stage readiness with Castillitos config ──────────────────

  console.log();
  console.log("[7] Stage readiness — Castillitos config");

  const snapshotCastillitos = buildProductionTimelineSnapshot(
    "test-org",
    exactTimelines,
    CASTILLITOS_STAGE_CONFIG,
  );

  assert(snapshotCastillitos.readiness.stages.ready === false,
    `Ready = false (required stages not observed in test data)`);
  assert(snapshotCastillitos.readiness.stages.missingStages.length === 2,
    `Missing stages: ${snapshotCastillitos.readiness.stages.missingStages.join(", ")}`);

  // ── Summary ──────────────────────────────────────────────────────────

  console.log();
  console.log("=".repeat(80));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(80));

  if (failed > 0) {
    process.exit(1);
  }
}

main();
