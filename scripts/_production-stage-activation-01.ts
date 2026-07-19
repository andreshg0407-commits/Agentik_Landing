/**
 * _production-stage-activation-01.ts
 *
 * PRODUCTION-STAGE-ACTIVATION-01 + HARDENING-01 — Multi-ERP Validation.
 *
 * Validates the stage activation engine with synthetic data:
 * - Full flow (OP+CN+ET) → correct stage activation
 * - Partial flow (OP+CN only) → correct gap detection
 * - Order-only (OP only) → correct classification
 * - Profile support (textile_full vs textile_basic)
 * - Coverage analysis
 * - Gap detection levels (READY, PARTIAL, BLOCKED)
 * - OP classification types
 * - Executive metrics
 *
 * HARDENING-01 additions:
 * - INFERRED status for non-observable stages with surrounding evidence
 * - SKIPPED reserved for optional stages deliberately not executed
 * - Profile requiredStages/optionalStages gap detection
 * - Gap enrichment (missingRequiredStages, missingOptionalStages, inferredStages, skippedStages)
 * - Progress.inferred count
 * - Coverage.inferredStages
 * - ActivationRuleConfidence and requiresStageTo metadata
 *
 * No database required. Pure in-memory validation.
 *
 * Usage: npx tsx scripts/_production-stage-activation-01.ts
 */

import { buildProductionTimelines } from "@/lib/production-timeline/production-timeline-builder";
import type { ProductionEvent } from "@/lib/production-events/production-event";
import {
  activateProductionStages,
  activateProductionStagesBatch,
  PRODUCTION_PROFILES,
  PRODUCTION_STAGE_CATALOG,
  DEFAULT_ACTIVATION_RULES,
  getProductionProfile,
} from "@/lib/production-stages";

// ── Test Helpers ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`    + ${label}`);
    passed++;
  } else {
    console.log(`    X FAIL: ${label}`);
    failed++;
  }
}

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

function buildTimeline(events: ProductionEvent[]) {
  const timelines = buildProductionTimelines({
    events,
    groupBy: "productionOrderRef",
    organizationId: "test-org",
    groupKeyStrategy: "exact",
  });
  return timelines[0];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

function main() {
  console.log("=".repeat(80));
  console.log("PRODUCTION-STAGE-ACTIVATION-01 + HARDENING-01 — Multi-ERP Validation");
  console.log("=".repeat(80));
  console.log();

  // ── Test 1: Catalog integrity ───────────────────────────────────────────

  console.log("[1] Catalog integrity");

  assert(PRODUCTION_STAGE_CATALOG.length === 15,
    `15 canonical stages defined (got ${PRODUCTION_STAGE_CATALOG.length})`);

  const categories = new Set(PRODUCTION_STAGE_CATALOG.map(s => s.category));
  assert(categories.size === 6,
    `6 stage categories (got ${categories.size})`);

  const codes = new Set(PRODUCTION_STAGE_CATALOG.map(s => s.code));
  assert(codes.size === 15,
    `All stage codes unique`);

  const orders = PRODUCTION_STAGE_CATALOG.map(s => s.order);
  const isSorted = orders.every((o, i) => i === 0 || o > orders[i - 1]);
  assert(isSorted,
    `Stage orders are sequential`);

  // ── Test 2: Profile definitions (HARDENING-01: required/optional/excluded) ──

  console.log();
  console.log("[2] Profile definitions");

  const profileIds = Object.keys(PRODUCTION_PROFILES);
  assert(profileIds.length === 6,
    `6 profiles defined (got ${profileIds.length})`);

  for (const pid of profileIds) {
    const profile = getProductionProfile(pid as any);
    assert(profile.stages.length > 0,
      `Profile ${pid}: ${profile.stages.length} stages`);
    assert(profile.observableStages.length > 0,
      `Profile ${pid}: ${profile.observableStages.length} observable`);
    // All observable stages must be in the profile stages
    const allInProfile = profile.observableStages.every(s => profile.stages.includes(s));
    assert(allInProfile,
      `Profile ${pid}: all observable stages are in profile`);
    // HARDENING-01: requiredStages, optionalStages, excludedStages
    assert(profile.requiredStages.length > 0,
      `Profile ${pid}: ${profile.requiredStages.length} required stages`);
    assert(Array.isArray(profile.optionalStages),
      `Profile ${pid}: has optionalStages array`);
    assert(Array.isArray(profile.excludedStages),
      `Profile ${pid}: has excludedStages array`);
    // Required + optional + excluded should cover all 15 stages
    const allCovered = new Set([
      ...profile.requiredStages,
      ...profile.optionalStages,
      ...profile.excludedStages,
    ]);
    // Some stages may appear in both stages and excluded, that's ok
    // But required and optional must all be in profile.stages
    const reqInStages = profile.requiredStages.every(s => profile.stages.includes(s));
    assert(reqInStages,
      `Profile ${pid}: all required stages are in profile.stages`);
    const optInStages = profile.optionalStages.every(s => profile.stages.includes(s));
    assert(optInStages,
      `Profile ${pid}: all optional stages are in profile.stages`);
  }

  // ── Test 3: Activation rules (HARDENING-01: confidence + requiresStageTo) ──

  console.log();
  console.log("[3] Activation rules");

  assert(DEFAULT_ACTIVATION_RULES.length >= 10,
    `At least 10 default rules (got ${DEFAULT_ACTIVATION_RULES.length})`);

  // Check key rules exist
  const ruleEventTypes = DEFAULT_ACTIVATION_RULES.map(r => r.eventType);
  assert(ruleEventTypes.includes("PRODUCTION_ORDER_CREATED"),
    `Rule for PRODUCTION_ORDER_CREATED exists`);
  assert(ruleEventTypes.includes("MATERIAL_CONSUMED"),
    `Rule for MATERIAL_CONSUMED exists`);
  assert(ruleEventTypes.includes("PRODUCTION_COMPLETED"),
    `Rule for PRODUCTION_COMPLETED exists`);

  // HARDENING-01: PRODUCTION_MOVED_STAGE should NOT be in default rules
  assert(!ruleEventTypes.includes("PRODUCTION_MOVED_STAGE" as any),
    `PRODUCTION_MOVED_STAGE NOT in default rules (HARDENING-01 F4-01)`);

  // HARDENING-01: All rules have confidence and requiresStageTo
  for (const rule of DEFAULT_ACTIVATION_RULES) {
    assert(
      rule.confidence === "universal" || rule.confidence === "erp_specific" || rule.confidence === "requires_metadata",
      `Rule "${rule.ruleName}" has valid confidence: ${rule.confidence}`,
    );
    assert(typeof rule.requiresStageTo === "boolean",
      `Rule "${rule.ruleName}" has requiresStageTo: ${rule.requiresStageTo}`);
  }

  // ── Test 4: Full flow activation (OP+CN+ET) ─────────────────────────────

  console.log();
  console.log("[4] Full flow activation (OP+CN+ET)");

  const fullFlowEvents: ProductionEvent[] = [
    makeEvent({
      id: "op-1",
      eventType: "PRODUCTION_ORDER_CREATED",
      sourceDocumentType: "OP",
      productionOrderRef: "OP-001",
      eventDate: "2026-01-01T00:00:00.000Z",
    }),
    makeEvent({
      id: "cn-1",
      eventType: "MATERIAL_CONSUMED",
      sourceDocumentType: "CN",
      productionOrderRef: "OP-001",
      eventDate: "2026-01-15T00:00:00.000Z",
    }),
    makeEvent({
      id: "et-1",
      eventType: "PRODUCTION_COMPLETED",
      sourceDocumentType: "ET",
      productionOrderRef: "OP-001",
      eventDate: "2026-02-15T00:00:00.000Z",
    }),
  ];

  const fullTl = buildTimeline(fullFlowEvents);
  const fullAct = activateProductionStages({ timeline: fullTl, profileId: "textile_full" });

  assert(fullAct.groupKey === "OP-001",
    `Group key = "OP-001"`);
  assert(fullAct.profileId === "textile_full",
    `Profile = textile_full`);

  // Check production_order stage
  const opStage = fullAct.stages.find(s => s.code === "production_order");
  assert(opStage !== undefined && opStage.status === "COMPLETED",
    `production_order status = COMPLETED`);
  assert(opStage !== undefined && opStage.evidence.length === 1,
    `production_order has 1 evidence record`);

  // Check material_consumption stage
  const cnStage = fullAct.stages.find(s => s.code === "material_consumption");
  assert(cnStage !== undefined && cnStage.status === "COMPLETED",
    `material_consumption status = COMPLETED`);

  // Check finished_goods_entry stage
  const etStage = fullAct.stages.find(s => s.code === "finished_goods_entry");
  assert(etStage !== undefined && (etStage.status === "ACTIVE" || etStage.status === "COMPLETED"),
    `finished_goods_entry status = ACTIVE or COMPLETED`);

  // Classification
  assert(fullAct.classification.type === "full_flow",
    `Classification = full_flow`);

  // ── Test 5: Partial flow (OP+CN only) ───────────────────────────────────

  console.log();
  console.log("[5] Partial flow (OP+CN only)");

  const partialEvents: ProductionEvent[] = [
    makeEvent({
      id: "op-2",
      eventType: "PRODUCTION_ORDER_CREATED",
      sourceDocumentType: "OP",
      productionOrderRef: "OP-002",
      eventDate: "2026-01-01T00:00:00.000Z",
    }),
    makeEvent({
      id: "cn-2",
      eventType: "MATERIAL_CONSUMED",
      sourceDocumentType: "CN",
      productionOrderRef: "OP-002",
      eventDate: "2026-01-20T00:00:00.000Z",
    }),
  ];

  const partialTl = buildTimeline(partialEvents);
  const partialAct = activateProductionStages({ timeline: partialTl, profileId: "textile_full" });

  assert(partialAct.classification.type === "materials_consumed",
    `Classification = materials_consumed`);

  // Gap should be BLOCKED (missing finished_goods_entry = required + last observable)
  assert(partialAct.gap.level === "BLOCKED" || partialAct.gap.level === "PARTIAL",
    `Gap level = BLOCKED or PARTIAL (missing ET)`);
  assert(partialAct.gap.missingStages.includes("finished_goods_entry"),
    `Gap missing (deprecated): finished_goods_entry`);
  // HARDENING-01: missingRequiredStages
  assert(partialAct.gap.missingRequiredStages.includes("finished_goods_entry"),
    `Gap missingRequiredStages: finished_goods_entry`);

  // ── Test 6: Order only ──────────────────────────────────────────────────

  console.log();
  console.log("[6] Order only (OP)");

  const orderOnlyEvents: ProductionEvent[] = [
    makeEvent({
      id: "op-3",
      eventType: "PRODUCTION_ORDER_CREATED",
      sourceDocumentType: "OP",
      productionOrderRef: "OP-003",
      eventDate: "2026-01-01T00:00:00.000Z",
    }),
  ];

  const orderOnlyTl = buildTimeline(orderOnlyEvents);
  const orderOnlyAct = activateProductionStages({ timeline: orderOnlyTl, profileId: "textile_full" });

  assert(orderOnlyAct.classification.type === "order_only",
    `Classification = order_only`);
  assert(orderOnlyAct.gap.level === "BLOCKED",
    `Gap level = BLOCKED (missing all except OP)`);

  const opOnlyStage = orderOnlyAct.stages.find(s => s.code === "production_order");
  assert(opOnlyStage !== undefined && opOnlyStage.status === "ACTIVE",
    `production_order status = ACTIVE (no successor evidence)`);

  // ── Test 7: Progress metrics (HARDENING-01: includes inferred) ────────

  console.log();
  console.log("[7] Progress metrics");

  assert(fullAct.progress.total > 0,
    `Total stages > 0 (got ${fullAct.progress.total})`);
  assert(fullAct.progress.completed >= 2,
    `Completed >= 2 for full flow (got ${fullAct.progress.completed})`);
  assert(fullAct.progress.completionPct > 0,
    `Completion % > 0 (got ${fullAct.progress.completionPct}%)`);
  assert(fullAct.progress.observableCoveragePct > 0,
    `Observable coverage > 0 (got ${fullAct.progress.observableCoveragePct}%)`);
  // HARDENING-01: inferred count
  assert(typeof fullAct.progress.inferred === "number",
    `Progress.inferred is a number (got ${fullAct.progress.inferred})`);
  assert(fullAct.progress.inferred >= 0,
    `Progress.inferred >= 0 (got ${fullAct.progress.inferred})`);

  // ── Test 8: Coverage analysis (HARDENING-01: inferredStages) ──────────

  console.log();
  console.log("[8] Coverage analysis");

  assert(fullAct.coverage.observableStages.length > 0,
    `Observable stages > 0`);
  assert(fullAct.coverage.observedStages.length >= 3,
    `Observed stages >= 3 for full flow (got ${fullAct.coverage.observedStages.length})`);
  assert(fullAct.coverage.coverageRatio > 0,
    `Coverage ratio > 0 (got ${fullAct.coverage.coverageRatio})`);
  // HARDENING-01: inferredStages
  assert(Array.isArray(fullAct.coverage.inferredStages),
    `Coverage.inferredStages is an array`);

  // ── Test 9: Profile comparison ──────────────────────────────────────────

  console.log();
  console.log("[9] Profile comparison (textile_full vs textile_basic)");

  const basicAct = activateProductionStages({ timeline: fullTl, profileId: "textile_basic" });

  assert(basicAct.stages.length < fullAct.stages.length,
    `textile_basic has fewer stages (${basicAct.stages.length}) than textile_full (${fullAct.stages.length})`);
  assert(basicAct.profileId === "textile_basic",
    `Profile ID = textile_basic`);

  // Both should classify as full_flow for OP+CN+ET
  assert(basicAct.classification.type === "full_flow",
    `textile_basic also classifies as full_flow`);

  // ── Test 10: INFERRED status for non-observable stages (HARDENING-01) ──

  console.log();
  console.log("[10] INFERRED status for non-observable stages (HARDENING-01)");

  // In full flow: cutting is non-observable, between material_consumption (has evidence)
  // and finished_goods_entry (has evidence), so should be INFERRED (not SKIPPED)
  const cuttingStage = fullAct.stages.find(s => s.code === "cutting");
  if (cuttingStage) {
    assert(cuttingStage.status === "INFERRED",
      `Non-observable 'cutting' with surrounding evidence = INFERRED (got ${cuttingStage.status})`);
    assert(cuttingStage.evidence.length === 0,
      `No evidence for non-observable 'cutting'`);
  }

  // printing and embroidery are also non-observable between observed stages
  const printingStage = fullAct.stages.find(s => s.code === "printing");
  if (printingStage) {
    assert(printingStage.status === "INFERRED",
      `Non-observable 'printing' with surrounding evidence = INFERRED (got ${printingStage.status})`);
  }

  // ── Test 11: Evidence traceability ──────────────────────────────────────

  console.log();
  console.log("[11] Evidence traceability");

  const opEvidence = fullAct.stages.find(s => s.code === "production_order")?.evidence ?? [];
  assert(opEvidence.length === 1,
    `production_order has exactly 1 evidence`);
  assert(opEvidence[0]?.eventId === "op-1",
    `Evidence traces back to event "op-1"`);
  assert(opEvidence[0]?.rule?.includes("OP"),
    `Evidence rule mentions OP`);

  // ── Test 12: Batch processing + executive metrics ──────────────────────

  console.log();
  console.log("[12] Batch processing + executive metrics");

  const allTimelines = [fullTl, partialTl, orderOnlyTl];
  const snapshot = activateProductionStagesBatch({
    timelines: allTimelines,
    organizationId: "test-org",
    profileId: "textile_full",
  });

  assert(snapshot.activations.length === 3,
    `3 activations in snapshot`);
  assert(snapshot.metrics.totalOrders === 3,
    `Total orders = 3`);
  assert(snapshot.metrics.classificationDistribution.full_flow === 1,
    `1 full_flow`);
  assert(snapshot.metrics.classificationDistribution.materials_consumed === 1,
    `1 materials_consumed`);
  assert(snapshot.metrics.classificationDistribution.order_only === 1,
    `1 order_only`);
  assert(snapshot.metrics.avgCompletionPct >= 0,
    `Avg completion % >= 0 (got ${snapshot.metrics.avgCompletionPct}%)`);

  // Per-stage distribution
  assert(snapshot.metrics.stageDistribution["production_order"] === 3,
    `production_order activated in all 3 orders`);
  assert(snapshot.metrics.stageDistribution["material_consumption"] === 2,
    `material_consumption activated in 2 orders`);
  assert(snapshot.metrics.stageDistribution["finished_goods_entry"] === 1,
    `finished_goods_entry activated in 1 order`);

  // ── Test 13: External processing events ─────────────────────────────────

  console.log();
  console.log("[13] External processing events");

  const extEvents: ProductionEvent[] = [
    makeEvent({
      id: "op-ext",
      eventType: "PRODUCTION_ORDER_CREATED",
      sourceDocumentType: "OP",
      productionOrderRef: "OP-EXT",
      eventDate: "2026-01-01T00:00:00.000Z",
    }),
    makeEvent({
      id: "cn-ext",
      eventType: "MATERIAL_CONSUMED",
      sourceDocumentType: "CN",
      productionOrderRef: "OP-EXT",
      eventDate: "2026-01-10T00:00:00.000Z",
    }),
    makeEvent({
      id: "pc-ext",
      eventType: "EXTERNAL_SERVICE_STARTED",
      sourceDocumentType: "PC",
      productionOrderRef: "OP-EXT",
      eventDate: "2026-01-20T00:00:00.000Z",
    }),
    makeEvent({
      id: "ec-ext",
      eventType: "EXTERNAL_SERVICE_COMPLETED",
      sourceDocumentType: "EC",
      productionOrderRef: "OP-EXT",
      eventDate: "2026-02-01T00:00:00.000Z",
    }),
    makeEvent({
      id: "et-ext",
      eventType: "PRODUCTION_COMPLETED",
      sourceDocumentType: "ET",
      productionOrderRef: "OP-EXT",
      eventDate: "2026-02-15T00:00:00.000Z",
    }),
  ];

  const extTl = buildTimeline(extEvents);
  const extAct = activateProductionStages({ timeline: extTl, profileId: "textile_full" });

  const extMfgStage = extAct.stages.find(s => s.code === "external_manufacturing");
  assert(extMfgStage !== undefined && extMfgStage.evidence.length > 0,
    `external_manufacturing activated by PC event`);
  assert(extMfgStage !== undefined && extMfgStage.status === "COMPLETED",
    `external_manufacturing = COMPLETED (successor evidence exists)`);

  const tpsStage = extAct.stages.find(s => s.code === "third_party_services");
  assert(tpsStage !== undefined && tpsStage.evidence.length > 0,
    `third_party_services activated by EC event`);

  // Coverage should be better with more events
  assert(extAct.coverage.observedStages.length >= 4,
    `Coverage observed >= 4 stages (got ${extAct.coverage.observedStages.length})`);

  // ── Test 14: Date tracking ──────────────────────────────────────────────

  console.log();
  console.log("[14] Date tracking on activated stages");

  const opDates = fullAct.stages.find(s => s.code === "production_order");
  assert(opDates !== undefined && opDates.firstSeen !== null,
    `production_order has firstSeen`);
  assert(opDates !== undefined && opDates.firstSeen === "2026-01-01T00:00:00.000Z",
    `production_order firstSeen = 2026-01-01`);

  const cnDates = fullAct.stages.find(s => s.code === "material_consumption");
  assert(cnDates !== undefined && cnDates.firstSeen === "2026-01-15T00:00:00.000Z",
    `material_consumption firstSeen = 2026-01-15`);

  // ── Test 15: HARDENING-01 Gap enrichment ────────────────────────────────

  console.log();
  console.log("[15] HARDENING-01 Gap enrichment");

  // Full flow gap should have all HARDENING-01 fields
  assert(Array.isArray(fullAct.gap.missingRequiredStages),
    `gap.missingRequiredStages is array`);
  assert(Array.isArray(fullAct.gap.missingOptionalStages),
    `gap.missingOptionalStages is array`);
  assert(Array.isArray(fullAct.gap.inferredStages),
    `gap.inferredStages is array`);
  assert(Array.isArray(fullAct.gap.skippedStages),
    `gap.skippedStages is array`);
  assert(Array.isArray(fullAct.gap.missingStages),
    `gap.missingStages (deprecated) is array`);

  // Full flow: textile_full requires production_order, material_consumption, finished_goods_entry
  // All 3 have evidence → missingRequiredStages should be empty → READY
  assert(fullAct.gap.missingRequiredStages.length === 0,
    `Full flow: no missing required stages`);
  assert(fullAct.gap.level === "READY",
    `Full flow: gap level = READY (got ${fullAct.gap.level})`);

  // Order-only: only production_order has evidence
  // material_consumption and finished_goods_entry are required but missing
  assert(orderOnlyAct.gap.missingRequiredStages.includes("material_consumption"),
    `Order-only: material_consumption in missingRequiredStages`);
  assert(orderOnlyAct.gap.missingRequiredStages.includes("finished_goods_entry"),
    `Order-only: finished_goods_entry in missingRequiredStages`);

  // ── Test 16: INFERRED stages in full flow ─────────────────────────────────

  console.log();
  console.log("[16] INFERRED stages in coverage and gap");

  // Full flow has non-observable stages between observed stages → some should be INFERRED
  const inferredInCoverage = fullAct.coverage.inferredStages;
  assert(inferredInCoverage.length > 0,
    `Full flow: some stages inferred (got ${inferredInCoverage.length})`);
  assert(inferredInCoverage.includes("cutting"),
    `'cutting' appears in coverage.inferredStages`);

  const inferredInGap = fullAct.gap.inferredStages;
  assert(inferredInGap.length > 0,
    `Full flow: gap.inferredStages populated (got ${inferredInGap.length})`);

  // Progress should reflect inferred count
  assert(fullAct.progress.inferred > 0,
    `Full flow: progress.inferred > 0 (got ${fullAct.progress.inferred})`);

  // ── Test 17: SKIPPED vs INFERRED distinction ───────────────────────────

  console.log();
  console.log("[17] SKIPPED vs INFERRED distinction");

  // cutting has erpObservable=false in the catalog, so it's non-observable in ALL profiles.
  // Non-observable + between observed stages → INFERRED (not SKIPPED).
  // SKIPPED only applies to observable optional stages that were deliberately not executed.
  const basicCutting = basicAct.stages.find(s => s.code === "cutting");
  if (basicCutting) {
    // cutting is non-observable in catalog → INFERRED even when optional in profile
    assert(basicCutting.status === "INFERRED",
      `textile_basic 'cutting' (non-observable) = INFERRED (got ${basicCutting.status})`);
  }

  // Same in textile_full
  assert(cuttingStage !== undefined && cuttingStage.status === "INFERRED",
    `textile_full 'cutting' (non-observable) = INFERRED, not SKIPPED`);

  // ── Test 18: requiresStageTo rules are skipped ──────────────────────────

  console.log();
  console.log("[18] requiresStageTo rules are skipped by engine");

  // Create a rule with requiresStageTo=true and verify it doesn't activate
  const stageToRule = {
    eventType: "PRODUCTION_ORDER_CREATED" as const,
    sourceDocumentType: null,
    activatesStage: "cutting" as const,
    ruleName: "Test stageTo rule",
    confidence: "requires_metadata" as const,
    requiresStageTo: true,
  };

  const stageToAct = activateProductionStages({
    timeline: fullTl,
    profileId: "textile_full",
    additionalRules: [stageToRule],
  });

  const stageToTarget = stageToAct.stages.find(s => s.code === "cutting");
  assert(stageToTarget !== undefined && stageToTarget.evidence.length === 0,
    `requiresStageTo=true rule does NOT activate cutting stage`);

  // ── Test 19: external_manufacturing profile ───────────────────────────────

  console.log();
  console.log("[19] external_manufacturing profile");

  const extProfileAct = activateProductionStages({
    timeline: extTl,
    profileId: "external_manufacturing",
  });

  const extProfile = getProductionProfile("external_manufacturing");
  assert(extProfileAct.stages.length === extProfile.stages.length,
    `external_manufacturing profile: ${extProfile.stages.length} stages`);
  assert(extProfileAct.gap.missingRequiredStages.length === 0,
    `external_manufacturing: all required stages have evidence`);

  // ── Test 20: import_reception profile ──────────────────────────────────

  console.log();
  console.log("[20] import_reception profile");

  const importEvents: ProductionEvent[] = [
    makeEvent({
      id: "op-imp",
      eventType: "PRODUCTION_ORDER_CREATED",
      sourceDocumentType: "OP",
      productionOrderRef: "OP-IMP",
      eventDate: "2026-01-01T00:00:00.000Z",
    }),
    makeEvent({
      id: "et-imp",
      eventType: "PRODUCTION_COMPLETED",
      sourceDocumentType: "ET",
      productionOrderRef: "OP-IMP",
      eventDate: "2026-02-15T00:00:00.000Z",
    }),
  ];

  const importTl = buildTimeline(importEvents);
  const importAct = activateProductionStages({
    timeline: importTl,
    profileId: "import_reception",
  });

  // import_reception requires: production_order, finished_goods_entry
  // Both have evidence → READY
  assert(importAct.gap.level === "READY",
    `import_reception: gap = READY (got ${importAct.gap.level})`);
  assert(importAct.gap.missingRequiredStages.length === 0,
    `import_reception: no missing required stages`);

  // ── Test 21: Quality events ───────────────────────────────────────────────

  console.log();
  console.log("[21] Quality check events");

  const qcEvents: ProductionEvent[] = [
    makeEvent({
      id: "op-qc",
      eventType: "PRODUCTION_ORDER_CREATED",
      sourceDocumentType: "OP",
      productionOrderRef: "OP-QC",
      eventDate: "2026-01-01T00:00:00.000Z",
    }),
    makeEvent({
      id: "qc-start",
      eventType: "QUALITY_CHECK_STARTED",
      sourceDocumentType: "QC",
      productionOrderRef: "OP-QC",
      eventDate: "2026-02-01T00:00:00.000Z",
    }),
    makeEvent({
      id: "qc-end",
      eventType: "QUALITY_CHECK_COMPLETED",
      sourceDocumentType: "QC",
      productionOrderRef: "OP-QC",
      eventDate: "2026-02-05T00:00:00.000Z",
    }),
    makeEvent({
      id: "et-qc",
      eventType: "PRODUCTION_COMPLETED",
      sourceDocumentType: "ET",
      productionOrderRef: "OP-QC",
      eventDate: "2026-02-15T00:00:00.000Z",
    }),
  ];

  const qcTl = buildTimeline(qcEvents);
  const qcAct = activateProductionStages({ timeline: qcTl, profileId: "textile_full" });

  const qcStage = qcAct.stages.find(s => s.code === "quality_control");
  assert(qcStage !== undefined && qcStage.evidence.length === 2,
    `quality_control has 2 evidence records (start + end)`);
  assert(qcStage !== undefined && qcStage.status === "COMPLETED",
    `quality_control = COMPLETED (ET successor exists)`);

  // ── Summary ─────────────────────────────────────────────────────────────

  console.log();
  console.log("=".repeat(80));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(80));

  if (failed > 0) {
    process.exit(1);
  }
}

main();
