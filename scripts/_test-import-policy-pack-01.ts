/**
 * scripts/_test-import-policy-pack-01.ts
 *
 * FASE 12 — QA tests for Import Policy Pack.
 * Run: npx tsx scripts/_test-import-policy-pack-01.ts
 *
 * Sprint: IMPORT-POLICY-PACK-01
 */

import {
  evaluateLowRotation,
  evaluateRepurchase,
  buildNextContainerRecommendations,
  evaluateInventoryAging,
  evaluateImportHealth,
} from "../lib/comercial/importaciones/import-decision-engine";

import {
  buildLowRotationAlert,
  buildRebuyCandidateAlert,
  buildNoRepurchaseAlert,
  buildAgingAlert,
  buildImportDataQualityAlert,
  buildAllImportAlerts,
} from "../lib/comercial/importaciones/import-alerts";

import {
  bridgeToCommercialEvidence,
  validateImportEvidence,
  validateAllImportEvidence,
  getImportSagDiscoveryGaps,
} from "../lib/comercial/importaciones/import-evidence";

import {
  registerCastillitosImportPolicyPack,
  getCastillitosImportPolicies,
  CASTILLITOS_IMPORT_POLICY_COUNT,
} from "../lib/comercial/importaciones/import-policy-pack";

import { CASTILLITOS_IMPORT_POLICY_PACK_CONFIG } from "../lib/comercial/importaciones/import-policy-pack-config";

import type {
  ImportPolicyContext,
  ImportReferenceInput,
  ImportEvidenceItem,
} from "../lib/comercial/importaciones/import-policy-types";

// ── Helpers ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function section(title: string) {
  const pad = Math.max(0, 60 - title.length);
  console.log(`\n${"─".repeat(pad)} ${title} ${"─".repeat(pad)}`);
}

function assert(label: string, condition: boolean) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${label}`);
  }
}

// ── Test data ──────────────────────────────────────────────────────────────

const CTX: ImportPolicyContext = { tenantId: "castillitos" };
const CONFIG = CASTILLITOS_IMPORT_POLICY_PACK_CONFIG;

function makeRef(overrides: Partial<ImportReferenceInput> = {}): ImportReferenceInput {
  return {
    reference: "C6-24-129",
    description: "Accesorio Importado A",
    group: "IMPORTACION",
    subgroup: null,
    size: null,
    currentInventory: 30,
    totalSold: 100,
    sales6m: 25,
    sales6mMonthly: [5, 4, 3, 4, 5, 4],
    lastEntryDate: new Date(Date.now() - 150 * 86400000).toISOString(),
    daysSinceLastEntry: 150,
    batchCount: 2,
    percentSold: 70,
    pricePV3: 15000,
    pricePV4: 12000,
    dominantChannel: "detal",
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════

section("1: Policy Pack Registration");
{
  const result = registerCastillitosImportPolicyPack();
  assert("Registration succeeds", result.success);
  assert(`Registers ${CASTILLITOS_IMPORT_POLICY_COUNT} policies`, result.registered === CASTILLITOS_IMPORT_POLICY_COUNT);
  assert("No errors", result.errors.length === 0 || result.errors[0] === "Already registered");

  const policies = getCastillitosImportPolicies();
  assert("Returns 5 policies", policies.length === 5);
  assert("All tenantId=castillitos", policies.every(p => p.tenantId === "castillitos"));
  assert("All ACTIVE", policies.every(p => p.status === "ACTIVE"));
}

section("2: Low Rotation — 9 Months (Over Threshold)");
{
  const ref = makeRef({ daysSinceLastEntry: 270, lastEntryDate: new Date(Date.now() - 270 * 86400000).toISOString(), currentInventory: 50 });
  const results = evaluateLowRotation(CTX, [ref], CONFIG);
  assert("1 result", results.length === 1);
  assert("Is low rotation", results[0].isLowRotation);
  assert("Months ~9", results[0].monthsSinceLastEntry !== null && results[0].monthsSinceLastEntry >= 8.5);
  assert("Has evidence", results[0].evidence.policyType === "LOW_ROTATION");
  assert("High confidence (0.9)", results[0].confidence === 0.9);
}

section("3: Low Rotation — 8 Months Exactly (240 days)");
{
  const ref = makeRef({ daysSinceLastEntry: 240, currentInventory: 20 });
  const results = evaluateLowRotation(CTX, [ref], CONFIG);
  assert("240 days = NOT low rotation (strictly greater than)", !results[0].isLowRotation);
}

section("4: Low Rotation — 241 Days (Just Over)");
{
  const ref = makeRef({ daysSinceLastEntry: 241, currentInventory: 20 });
  const results = evaluateLowRotation(CTX, [ref], CONFIG);
  assert("241 days = low rotation", results[0].isLowRotation);
}

section("5: Low Rotation — 7 Months (Under Threshold)");
{
  const ref = makeRef({ daysSinceLastEntry: 210, currentInventory: 30 });
  const results = evaluateLowRotation(CTX, [ref], CONFIG);
  assert("7 months = NOT low rotation", !results[0].isLowRotation);
}

section("6: Low Rotation — No Inventory");
{
  const ref = makeRef({ daysSinceLastEntry: 300, currentInventory: 0 });
  const results = evaluateLowRotation(CTX, [ref], CONFIG);
  assert("No inventory = NOT low rotation (must have inventory)", !results[0].isLowRotation);
}

section("7: Low Rotation — No Entry Date");
{
  const ref = makeRef({ daysSinceLastEntry: null, lastEntryDate: null, currentInventory: 50 });
  const results = evaluateLowRotation(CTX, [ref], CONFIG);
  assert("No date = NOT low rotation", !results[0].isLowRotation);
  assert("Low confidence (0.3)", results[0].confidence === 0.3);
  assert("Missing data includes daysSinceLastEntry", results[0].evidence.missingData.includes("daysSinceLastEntry"));
}

section("8: Repurchase — High Score (REBUY)");
{
  const ref = makeRef({ sales6m: 60, currentInventory: 5, percentSold: 85, daysSinceLastEntry: 300, sales6mMonthly: [8, 9, 10, 10, 11, 12] });
  const result = evaluateRepurchase(CTX, ref, CONFIG);
  assert("Decision = REBUY", result.decision === "REBUY");
  assert("Score >= 65", result.totalScore >= 65);
  assert("Has suggestedQty", result.suggestedQty !== null && result.suggestedQty > 0);
  assert("Trend = accelerating", result.trend === "accelerating");
  assert("Has 5 factors", result.factors.length === 5);
}

section("9: Repurchase — Low Score (DO_NOT_REBUY)");
{
  const ref = makeRef({ sales6m: 1, currentInventory: 200, percentSold: 10, daysSinceLastEntry: 30, sales6mMonthly: [1, 0, 0, 0, 0, 0] });
  const result = evaluateRepurchase(CTX, ref, CONFIG);
  assert("Decision = DO_NOT_REBUY", result.decision === "DO_NOT_REBUY");
  assert("Score < 35", result.totalScore < 35);
  assert("No suggestedQty", result.suggestedQty === null);
}

section("10: Repurchase — Medium Score (WATCH)");
{
  const ref = makeRef({ sales6m: 15, currentInventory: 40, percentSold: 50, daysSinceLastEntry: 200, sales6mMonthly: [3, 2, 3, 2, 3, 2] });
  const result = evaluateRepurchase(CTX, ref, CONFIG);
  assert("Decision = WATCH", result.decision === "WATCH");
  assert("Score between 35 and 65", result.totalScore >= 35 && result.totalScore < 65);
}

section("11: Repurchase — Insufficient Data");
{
  const ref = makeRef({ totalSold: 0, sales6m: 0, sales6mMonthly: [0, 0, 0, 0, 0, 0] });
  const result = evaluateRepurchase(CTX, ref, CONFIG);
  assert("Decision = INSUFFICIENT_DATA", result.decision === "INSUFFICIENT_DATA");
  assert("Low confidence (0.2)", result.confidence === 0.2);
}

section("12: Next Container Recommendations");
{
  const items = [
    makeRef({ reference: "NC-1", sales6m: 60, currentInventory: 5, percentSold: 85, daysSinceLastEntry: 300, sales6mMonthly: [8, 9, 10, 10, 11, 12] }),
    makeRef({ reference: "NC-2", sales6m: 15, currentInventory: 40, percentSold: 50, daysSinceLastEntry: 200, sales6mMonthly: [3, 2, 3, 2, 3, 2] }),
    makeRef({ reference: "NC-3", totalSold: 0, sales6m: 0, sales6mMonthly: [0, 0, 0, 0, 0, 0] }),
    makeRef({ reference: "NC-4", sales6m: 1, currentInventory: 200, percentSold: 10, daysSinceLastEntry: 30, sales6mMonthly: [1, 0, 0, 0, 0, 0] }),
  ];
  const repurchases = items.map(i => evaluateRepurchase(CTX, i, CONFIG));
  const rec = buildNextContainerRecommendations(CTX, items, repurchases, CONFIG);

  assert("Excludes INSUFFICIENT_DATA and DO_NOT_REBUY", rec.totalItems === 2);
  assert("Has HIGH priority items", rec.highPriorityCount >= 1);
  assert("Items sorted by score desc", rec.items[0].priorityScore >= rec.items[1].priorityScore);
  assert("tenantId present", rec.tenantId === "castillitos");
}

section("13: Inventory Aging — NEW (60 days)");
{
  const ref = makeRef({ daysSinceLastEntry: 60 });
  const results = evaluateInventoryAging(CTX, [ref], CONFIG);
  assert("60 days = NEW", results[0].agingStatus === "NEW");
}

section("14: Inventory Aging — NORMAL (150 days)");
{
  const ref = makeRef({ daysSinceLastEntry: 150 });
  const results = evaluateInventoryAging(CTX, [ref], CONFIG);
  assert("150 days = NORMAL", results[0].agingStatus === "NORMAL");
}

section("15: Inventory Aging — AGING (220 days)");
{
  const ref = makeRef({ daysSinceLastEntry: 220 });
  const results = evaluateInventoryAging(CTX, [ref], CONFIG);
  assert("220 days = AGING", results[0].agingStatus === "AGING");
}

section("16: Inventory Aging — LOW_ROTATION (300 days)");
{
  const ref = makeRef({ daysSinceLastEntry: 300 });
  const results = evaluateInventoryAging(CTX, [ref], CONFIG);
  assert("300 days = LOW_ROTATION", results[0].agingStatus === "LOW_ROTATION");
}

section("17: Inventory Aging — OBSOLETE_CANDIDATE (400 days)");
{
  const ref = makeRef({ daysSinceLastEntry: 400 });
  const results = evaluateInventoryAging(CTX, [ref], CONFIG);
  assert("400 days = OBSOLETE_CANDIDATE", results[0].agingStatus === "OBSOLETE_CANDIDATE");
  assert("Severity = high", results[0].evidence.severity === "high");
}

section("18: Inventory Aging — No Date With Inventory");
{
  const ref = makeRef({ daysSinceLastEntry: null, lastEntryDate: null, currentInventory: 50 });
  const results = evaluateInventoryAging(CTX, [ref], CONFIG);
  assert("No date + inventory = LOW_ROTATION", results[0].agingStatus === "LOW_ROTATION");
  assert("Low confidence (0.3)", results[0].confidence === 0.3);
}

section("19: Inventory Aging — No Date No Inventory");
{
  const ref = makeRef({ daysSinceLastEntry: null, lastEntryDate: null, currentInventory: 0 });
  const results = evaluateInventoryAging(CTX, [ref], CONFIG);
  assert("No date + no inventory = NORMAL", results[0].agingStatus === "NORMAL");
}

section("20: Import Health — Healthy Portfolio");
{
  const refs = [
    makeRef({ reference: "H1", daysSinceLastEntry: 30 }),
    makeRef({ reference: "H2", daysSinceLastEntry: 60 }),
    makeRef({ reference: "H3", daysSinceLastEntry: 90 }),
    makeRef({ reference: "H4", daysSinceLastEntry: 120 }),
    makeRef({ reference: "H5", daysSinceLastEntry: 150 }),
  ];
  const lowRot = evaluateLowRotation(CTX, refs, CONFIG);
  const repurchases = refs.map(r => evaluateRepurchase(CTX, r, CONFIG));
  const aging = evaluateInventoryAging(CTX, refs, CONFIG);
  const health = evaluateImportHealth(CTX, lowRot, repurchases, aging);

  assert("Overall = HEALTHY", health.overallHealth === "HEALTHY");
  assert("Total = 5", health.totalReferences === 5);
  assert("Healthy count > 0", health.healthyCount > 0);
}

section("21: Import Health — Critical Portfolio");
{
  const refs = [
    makeRef({ reference: "C1", daysSinceLastEntry: 300, currentInventory: 50 }),
    makeRef({ reference: "C2", daysSinceLastEntry: 350, currentInventory: 30 }),
    makeRef({ reference: "C3", daysSinceLastEntry: 400, currentInventory: 20 }),
    makeRef({ reference: "C4", daysSinceLastEntry: 100, currentInventory: 10 }),
  ];
  const lowRot = evaluateLowRotation(CTX, refs, CONFIG);
  const repurchases = refs.map(r => evaluateRepurchase(CTX, r, CONFIG));
  const aging = evaluateInventoryAging(CTX, refs, CONFIG);
  const health = evaluateImportHealth(CTX, lowRot, repurchases, aging);

  assert("Overall = CRITICAL or AT_RISK", health.overallHealth === "CRITICAL" || health.overallHealth === "AT_RISK");
  assert("Low rotation count > 0", health.lowRotationCount > 0);
  assert("Has aging breakdown", Object.keys(health.agingBreakdown).length > 0);
}

section("22: Import Health — No Data");
{
  const health = evaluateImportHealth(CTX, [], [], []);
  assert("Empty = NO_DATA", health.overallHealth === "NO_DATA");
  assert("Total = 0", health.totalReferences === 0);
}

section("23: Low Rotation Alert");
{
  const ref = makeRef({ daysSinceLastEntry: 270, currentInventory: 50 });
  const results = evaluateLowRotation(CTX, [ref], CONFIG);
  const alert = buildLowRotationAlert(CTX, results[0], CONFIG);
  assert("Alert generated for low rotation", alert !== null);
  assert("Alert type = LOW_ROTATION", alert!.type === "LOW_ROTATION");
  assert("Has deduplicationKey", alert!.deduplicationKey.length > 0);
}

section("24: Low Rotation Alert — Not Triggered");
{
  const ref = makeRef({ daysSinceLastEntry: 100, currentInventory: 50 });
  const results = evaluateLowRotation(CTX, [ref], CONFIG);
  const alert = buildLowRotationAlert(CTX, results[0], CONFIG);
  assert("No alert for non-low-rotation", alert === null);
}

section("25: Rebuy Candidate Alert");
{
  const ref = makeRef({ sales6m: 60, currentInventory: 5, percentSold: 85, daysSinceLastEntry: 300, sales6mMonthly: [8, 9, 10, 10, 11, 12] });
  const result = evaluateRepurchase(CTX, ref, CONFIG);
  const alert = buildRebuyCandidateAlert(CTX, result, CONFIG);
  assert("Alert for REBUY", alert !== null);
  assert("Alert type = REBUY_CANDIDATE", alert!.type === "REBUY_CANDIDATE");
}

section("26: No Repurchase Alert");
{
  const ref = makeRef({ sales6m: 1, currentInventory: 200, percentSold: 10, daysSinceLastEntry: 30, sales6mMonthly: [1, 0, 0, 0, 0, 0] });
  const result = evaluateRepurchase(CTX, ref, CONFIG);
  const alert = buildNoRepurchaseAlert(CTX, result, CONFIG);
  assert("Alert for DO_NOT_REBUY", alert !== null);
  assert("Alert type = NO_REPURCHASE", alert!.type === "NO_REPURCHASE");
}

section("27: Aging Inventory Alert");
{
  const ref = makeRef({ daysSinceLastEntry: 400 });
  const aging = evaluateInventoryAging(CTX, [ref], CONFIG);
  const alert = buildAgingAlert(CTX, aging[0], CONFIG);
  assert("Alert for OBSOLETE_CANDIDATE", alert !== null);
  assert("Severity = critical", alert!.severity === "critical");
}

section("28: Aging Alert — NEW = No Alert");
{
  const ref = makeRef({ daysSinceLastEntry: 30 });
  const aging = evaluateInventoryAging(CTX, [ref], CONFIG);
  const alert = buildAgingAlert(CTX, aging[0], CONFIG);
  assert("No alert for NEW", alert === null);
}

section("29: Data Quality Alert");
{
  const evidence: ImportEvidenceItem = {
    policyType: "LOW_ROTATION", policyId: "test", policyName: "Test",
    activationReason: "test", dataUsed: { test: true },
    recommendedAction: "test", actionRationale: "test",
    confidence: 0.3, severity: "info", missingData: ["lastEntryDate"],
    evaluatedAt: new Date().toISOString(), traceId: "test-001",
  };
  const alert = buildImportDataQualityAlert(CTX, "REF-1", "Producto X", ["lastEntryDate", "unitCost"], evidence, CONFIG);
  assert("Data quality alert generated", alert !== null);
  assert("Alert type = DATA_QUALITY", alert!.type === "DATA_QUALITY");
}

section("30: Batch Alert Builder");
{
  const refs = [
    makeRef({ reference: "BA-1", daysSinceLastEntry: 270, currentInventory: 50 }),
    makeRef({ reference: "BA-2", sales6m: 60, currentInventory: 5, percentSold: 85, daysSinceLastEntry: 300, sales6mMonthly: [8, 9, 10, 10, 11, 12] }),
    makeRef({ reference: "BA-3", daysSinceLastEntry: 400 }),
  ];
  const lowRot = evaluateLowRotation(CTX, refs, CONFIG);
  const repurchases = refs.map(r => evaluateRepurchase(CTX, r, CONFIG));
  const aging = evaluateInventoryAging(CTX, refs, CONFIG);
  const alerts = buildAllImportAlerts({ ctx: CTX, lowRotationResults: lowRot, repurchaseResults: repurchases, agingResults: aging, config: CONFIG });

  assert("Batch generates multiple alerts", alerts.length >= 3);
  assert("All alerts have tenantId", alerts.every(a => a.tenantId === "castillitos"));
  assert("All alerts have deduplicationKey", alerts.every(a => a.deduplicationKey.length > 0));
}

section("31: Evidence Bridge");
{
  const ref = makeRef({ daysSinceLastEntry: 270, currentInventory: 50 });
  const results = evaluateLowRotation(CTX, [ref], CONFIG);
  const commercial = bridgeToCommercialEvidence("castillitos", results[0].evidence, "reference", "C6-24-129");
  assert("Domain = IMPORT", commercial.domain === "IMPORT");
  assert("EntityType = reference", commercial.entityType === "reference");
  assert("Has traceId", commercial.traceId.length > 0);
}

section("32: Evidence Validation — Valid");
{
  const ref = makeRef({ daysSinceLastEntry: 270, currentInventory: 50 });
  const results = evaluateLowRotation(CTX, [ref], CONFIG);
  const result = validateImportEvidence(results[0].evidence);
  assert("Engine-produced evidence is valid", result.valid);
  assert("No issues", result.issues.length === 0);
}

section("33: Evidence Validation — Invalid");
{
  const badEvidence: ImportEvidenceItem = {
    policyType: "LOW_ROTATION", policyId: "", policyName: "",
    activationReason: "", dataUsed: {}, recommendedAction: "", actionRationale: "",
    confidence: 1.5, severity: "info", missingData: [],
    evaluatedAt: "", traceId: "",
  };
  const result = validateImportEvidence(badEvidence);
  assert("Bad evidence is invalid", !result.valid);
  assert("Multiple issues", result.issues.length >= 5);
}

section("34: Batch Evidence Validation");
{
  const refs = [
    makeRef({ reference: "EV-1", daysSinceLastEntry: 270, currentInventory: 50 }),
    makeRef({ reference: "EV-2", daysSinceLastEntry: 100 }),
  ];
  const results = evaluateLowRotation(CTX, refs, CONFIG);
  const allEv = results.map(r => r.evidence);
  const result = validateAllImportEvidence(allEv);
  assert("All engine evidence valid", result.invalidCount === 0);
  assert("Checked count matches", result.totalChecked === allEv.length);
}

section("35: Evidence Four-Question Rule");
{
  const ref = makeRef({ daysSinceLastEntry: 270, currentInventory: 50 });
  const results = evaluateLowRotation(CTX, [ref], CONFIG);
  const ev = results[0].evidence;
  assert("Q1: Why? (activationReason)", ev.activationReason.length > 0);
  assert("Q2: What data? (dataUsed)", Object.keys(ev.dataUsed).length > 0);
  assert("Q3: What action? (recommendedAction)", ev.recommendedAction.length > 0);
  assert("Q3b: Why? (actionRationale)", ev.actionRationale.length > 0);
  assert("Q4: What missing? (missingData array)", Array.isArray(ev.missingData));
  assert("Confidence in range", ev.confidence >= 0 && ev.confidence <= 1);
}

section("36: SAG Discovery Gaps");
{
  const gaps = getImportSagDiscoveryGaps();
  assert("Has gaps", gaps.length >= 5);
  assert("lastEntryDate is AVAILABLE", gaps.find(g => g.field === "lastEntryDate")?.currentStatus === "AVAILABLE");
  assert("unitCost is NOT_AVAILABLE", gaps.find(g => g.field === "unitCost")?.currentStatus === "NOT_AVAILABLE");
  assert("containerNumber is NOT_AVAILABLE", gaps.find(g => g.field === "containerNumber")?.currentStatus === "NOT_AVAILABLE");
  assert("All gaps have priority", gaps.every(g => ["HIGH", "MEDIUM", "LOW"].includes(g.priority)));
}

section("37: Config Values — Not Hardcoded");
{
  assert("monthsThreshold = 8", CONFIG.lowRotation.monthsThreshold === 8);
  assert("daysThreshold = 240", CONFIG.lowRotation.daysThreshold === 240);
  assert("rebuyThreshold = 65", CONFIG.repurchase.rebuyThreshold === 65);
  assert("watchThreshold = 35", CONFIG.repurchase.watchThreshold === 35);
  assert("newDaysMax = 90", CONFIG.inventoryAging.newDaysMax === 90);
  assert("normalDaysMax = 180", CONFIG.inventoryAging.normalDaysMax === 180);
  assert("agingDaysMax = 240", CONFIG.inventoryAging.agingDaysMax === 240);
  assert("lowRotationDaysMax = 365", CONFIG.inventoryAging.lowRotationDaysMax === 365);
  assert("Weights sum ~1.0", Math.abs(Object.values(CONFIG.repurchase.weights).reduce((s, v) => s + v, 0) - 1.0) < 0.01);
}

section("38: Immutability");
{
  const ref = makeRef();
  const before = JSON.stringify(ref);
  evaluateLowRotation(CTX, [ref], CONFIG);
  evaluateRepurchase(CTX, ref, CONFIG);
  evaluateInventoryAging(CTX, [ref], CONFIG);
  assert("Input not mutated", before === JSON.stringify(ref));
}

section("39: Multi-Tenant Isolation");
{
  const ctxA: ImportPolicyContext = { tenantId: "tenant_a" };
  const ctxB: ImportPolicyContext = { tenantId: "tenant_b" };
  const ref = makeRef({ daysSinceLastEntry: 270, currentInventory: 50 });
  const resA = evaluateLowRotation(ctxA, [ref], CONFIG);
  const resB = evaluateLowRotation(ctxB, [ref], CONFIG);
  assert("Trace IDs are different", resA[0].evidence.traceId !== resB[0].evidence.traceId);
}

section("40: Repurchase — suggestedQty Never Negative");
{
  const ref = makeRef({ sales6m: 2, currentInventory: 200, percentSold: 90, daysSinceLastEntry: 300, sales6mMonthly: [1, 0, 0, 0, 0, 1] });
  const result = evaluateRepurchase(CTX, ref, CONFIG);
  if (result.suggestedQty !== null) {
    assert("suggestedQty >= 0", result.suggestedQty >= 0);
  } else {
    assert("suggestedQty is null (not REBUY)", result.decision !== "REBUY");
  }
}

// ══════════════════════════════════════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════════════════════════════════════

console.log(`\n${"═".repeat(60)}`);
console.log(`IMPORT-POLICY-PACK-01 QA Results: ${passed}/${passed + failed} passed`);
if (failed > 0) {
  console.log(`❌ ${failed} FAILED`);
  process.exit(1);
} else {
  console.log(`✅ ALL PASSED`);
}
