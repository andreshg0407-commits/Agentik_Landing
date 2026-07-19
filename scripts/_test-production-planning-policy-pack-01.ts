/**
 * scripts/_test-production-planning-policy-pack-01.ts
 *
 * QA tests for PRODUCTION-PLANNING-POLICY-PACK-01.
 * Run: npx tsx scripts/_test-production-planning-policy-pack-01.ts
 */

import {
  registerCastillitosProductionPlanningPack,
  getCastillitosProductionPlanningPolicies,
  CASTILLITOS_PRODUCTION_PLANNING_POLICY_COUNT,
  CASTILLITOS_PRODUCTION_PLANNING_CONFIG,
  evaluateProductionNeed,
  evaluateExistingOP,
  evaluatePriority,
  evaluateShortage,
  evaluateProductionHealth,
  buildProductionQueue,
  buildProductionRequiredAlert,
  buildWaitOPAlert,
  buildLowStockAlert,
  buildCriticalShortageAlert,
  buildProductionDataQualityAlert,
  buildAllProductionAlerts,
  bridgeToCommercialEvidence,
  validateProductionEvidence,
  validateAllProductionEvidence,
  getProductionSagDiscoveryGaps,
  buildProductionPlanningState,
  buildBusinessDecision,
  buildAllBusinessDecisions,
} from "@/lib/comercial/produccion";

import type {
  ProductionPlanningContext,
  SubgroupInput,
  ActiveOPInfo,
} from "@/lib/comercial/produccion";

let passed = 0;
let failed = 0;
let section = 0;

function header(title: string) {
  section++;
  console.log(`\n${"─".repeat(20)} ${section}: ${title} ${"─".repeat(20)}`);
}

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const ctx: ProductionPlanningContext = { tenantId: "castillitos" };
const config = CASTILLITOS_PRODUCTION_PLANNING_CONFIG;

function makeItem(overrides: Partial<SubgroupInput> & { subgroup: string; brand: string }): SubgroupInput {
  return {
    availableInventory: 150,
    sales6m: 30,
    sales6mMonthly: [5, 5, 5, 5, 5, 5],
    pendingOrders: 2,
    maletasCount: 3,
    tiendasCount: 1,
    coverageDays: 30,
    activeOPs: [],
    ...overrides,
  };
}

function makeOP(overrides: Partial<ActiveOPInfo> = {}): ActiveOPInfo {
  return {
    documentNumber: "OP-001",
    status: "open",
    quantity: 200,
    documentDate: "2026-06-01",
    warehouseCode: "B14",
    ...overrides,
  };
}

// ── 1: Policy Pack Registration ─────────────────────────────────────────────

header("Policy Pack Registration");

const regResult = registerCastillitosProductionPlanningPack();
check("Registration succeeds", regResult.success);
check(`Registers ${CASTILLITOS_PRODUCTION_PLANNING_POLICY_COUNT} policies`, regResult.registered === CASTILLITOS_PRODUCTION_PLANNING_POLICY_COUNT);
check("No errors", regResult.errors.length === 0, regResult.errors.join("; "));

const policies = getCastillitosProductionPlanningPolicies();
check("Returns 5 policies", policies.length === 5);
check("All tenantId=castillitos", policies.every(p => p.tenantId === "castillitos"));
check("All ACTIVE", policies.every(p => p.status === "ACTIVE"));

// ── 2: Castillitos 99 units (below 100 threshold) ──────────────────────────

header("Castillitos 99 units — PRODUCE");

const items99 = [makeItem({ subgroup: "PIJAMA NINA BB", brand: "CASTILLITOS", availableInventory: 99 })];
const need99 = evaluateProductionNeed(ctx, items99, config);
check("Decision = PRODUCE", need99[0].decision === "PRODUCE");
check("Threshold = 100", need99[0].threshold === 100);
check("Deficit = 1", need99[0].deficit === 1);

// ── 3: Castillitos 100 units (exactly at threshold) ────────────────────────

header("Castillitos 100 units — SUFFICIENT_STOCK");

const items100 = [makeItem({ subgroup: "PIJAMA NINA BB", brand: "CASTILLITOS", availableInventory: 100 })];
const need100 = evaluateProductionNeed(ctx, items100, config);
check("Decision = SUFFICIENT_STOCK", need100[0].decision === "SUFFICIENT_STOCK");
check("Deficit = 0", need100[0].deficit === 0);

// ── 4: Castillitos 101 units (above threshold) ─────────────────────────────

header("Castillitos 101 units — SUFFICIENT_STOCK");

const items101 = [makeItem({ subgroup: "PIJAMA NINA BB", brand: "CASTILLITOS", availableInventory: 101 })];
const need101 = evaluateProductionNeed(ctx, items101, config);
check("Decision = SUFFICIENT_STOCK", need101[0].decision === "SUFFICIENT_STOCK");

// ── 5: Latin Kids 199 units (below 200 threshold) ──────────────────────────

header("Latin Kids 199 units — PRODUCE");

const lk199 = [makeItem({ subgroup: "CONJUNTO NINO KIDS", brand: "LATIN KIDS", availableInventory: 199 })];
const needLK199 = evaluateProductionNeed(ctx, lk199, config);
check("Decision = PRODUCE", needLK199[0].decision === "PRODUCE");
check("Threshold = 200", needLK199[0].threshold === 200);
check("Deficit = 1", needLK199[0].deficit === 1);

// ── 6: Latin Kids 200 units (at threshold) ──────────────────────────────────

header("Latin Kids 200 units — SUFFICIENT_STOCK");

const lk200 = [makeItem({ subgroup: "CONJUNTO NINO KIDS", brand: "LATIN KIDS", availableInventory: 200 })];
const needLK200 = evaluateProductionNeed(ctx, lk200, config);
check("Decision = SUFFICIENT_STOCK", needLK200[0].decision === "SUFFICIENT_STOCK");

// ── 7: Latin Kids 201 units ─────────────────────────────────────────────────

header("Latin Kids 201 units — SUFFICIENT_STOCK");

const lk201 = [makeItem({ subgroup: "CONJUNTO NINO KIDS", brand: "LATIN KIDS", availableInventory: 201 })];
const needLK201 = evaluateProductionNeed(ctx, lk201, config);
check("Decision = SUFFICIENT_STOCK", needLK201[0].decision === "SUFFICIENT_STOCK");

// ── 8: Below threshold WITH active OP ───────────────────────────────────────

header("Below threshold WITH active OP — WAIT_EXISTING_OP");

const withOP = [makeItem({ subgroup: "BODY BB", brand: "CASTILLITOS", availableInventory: 50, activeOPs: [makeOP()] })];
const needOP = evaluateProductionNeed(ctx, withOP, config);
check("Decision = WAIT_EXISTING_OP", needOP[0].decision === "WAIT_EXISTING_OP");
check("Has active OP", needOP[0].hasActiveOP === true);
check("Active OP count = 1", needOP[0].activeOPCount === 1);
check("Active OP quantity = 200", needOP[0].activeOPQuantity === 200);

// ── 9: Below threshold with CLOSED OP ───────────────────────────────────────

header("Below threshold with CLOSED OP — PRODUCE");

const closedOP = [makeItem({ subgroup: "BODY BB", brand: "CASTILLITOS", availableInventory: 50, activeOPs: [makeOP({ status: "closed" })] })];
const needClosed = evaluateProductionNeed(ctx, closedOP, config);
check("Decision = PRODUCE (closed OP ignored)", needClosed[0].decision === "PRODUCE");
check("No active OP", needClosed[0].hasActiveOP === false);

// ── 10: Evaluate existing OP ────────────────────────────────────────────────

header("Evaluate Existing OP");

const itemWithOPs = makeItem({ subgroup: "PIJAMA NINA BB", brand: "CASTILLITOS", activeOPs: [makeOP(), makeOP({ documentNumber: "OP-002", quantity: 100 })] });
const opResult = evaluateExistingOP(ctx, itemWithOPs, config);
check("Has active OP", opResult.hasActiveOP);
check("2 active OPs", opResult.activeOPs.length === 2);
check("Total quantity = 300", opResult.totalActiveQuantity === 300);
check("Decision = WAIT_EXISTING_OP", opResult.decision === "WAIT_EXISTING_OP");

// ── 11: Evaluate existing OP — no OPs ───────────────────────────────────────

header("Evaluate Existing OP — No OPs");

const itemNoOPs = makeItem({ subgroup: "BLUSA NINA BB", brand: "CASTILLITOS", activeOPs: [] });
const opNone = evaluateExistingOP(ctx, itemNoOPs, config);
check("No active OP", !opNone.hasActiveOP);
check("Decision = NO_ACTIVE_OP", opNone.decision === "NO_ACTIVE_OP");

// ── 12: Priority — CRITICAL ────────────────────────────────────────────────

header("Priority — CRITICAL");

const criticalItem = makeItem({
  subgroup: "PIJAMA NINA BB", brand: "CASTILLITOS",
  availableInventory: 0, sales6m: 150, pendingOrders: 25, maletasCount: 12, tiendasCount: 6, coverageDays: 3,
});
const priCritical = evaluatePriority(ctx, criticalItem, config);
check("Priority = CRITICAL", priCritical.priority === "CRITICAL");
check("Score >= 80", priCritical.totalScore >= 80);
check("Has 6 factors", priCritical.factors.length === 6);

// ── 13: Priority — LOW ─────────────────────────────────────────────────────

header("Priority — LOW");

const lowItem = makeItem({
  subgroup: "ACCESORIO X", brand: "CASTILLITOS",
  availableInventory: 95, sales6m: 2, pendingOrders: 0, maletasCount: 0, tiendasCount: 0, coverageDays: 90,
});
const priLow = evaluatePriority(ctx, lowItem, config);
check("Priority = LOW", priLow.priority === "LOW");
check("Score < 35", priLow.totalScore < 35);

// ── 14: Shortage detection ──────────────────────────────────────────────────

header("Shortage Detection");

const shortageItems = [
  makeItem({ subgroup: "PIJAMA NINA BB", brand: "CASTILLITOS", availableInventory: 30 }), // 30% of 100 → critical (<=50%)
  makeItem({ subgroup: "BODY BB", brand: "CASTILLITOS", availableInventory: 70 }), // 70% of 100 → high (<=80%)
  makeItem({ subgroup: "BLUSA NINA BB", brand: "CASTILLITOS", availableInventory: 150 }), // above threshold → excluded
];
const shortages = evaluateShortage(ctx, shortageItems, config);
check("2 shortages (excludes above threshold)", shortages.length === 2);
check("First = CRITICAL (30 und)", shortages[0].priority === "CRITICAL");
check("Second = HIGH (70 und)", shortages[1].priority === "HIGH");
check("First deficit = 70", shortages[0].deficit === 70);

// ── 15: Shortage — exact threshold boundaries ──────────────────────────────

header("Shortage — Exact Threshold Boundaries");

const boundaryItems = [
  makeItem({ subgroup: "SG-A", brand: "CASTILLITOS", availableInventory: 50 }), // 50% = boundary of criticalPct
  makeItem({ subgroup: "SG-B", brand: "CASTILLITOS", availableInventory: 80 }), // 80% = boundary of shortagePct
];
const boundaryShortages = evaluateShortage(ctx, boundaryItems, config);
check("50 und = CRITICAL (50% <= criticalPct 50%)", boundaryShortages[0].priority === "CRITICAL");
check("80 und = HIGH (80% <= shortagePct 80%)", boundaryShortages[1].priority === "HIGH");

// ── 16: Production Health — Healthy ─────────────────────────────────────────

header("Production Health — Healthy");

const healthyNeeds = evaluateProductionNeed(ctx, [
  makeItem({ subgroup: "A", brand: "CASTILLITOS", availableInventory: 150 }),
  makeItem({ subgroup: "B", brand: "CASTILLITOS", availableInventory: 120 }),
  makeItem({ subgroup: "C", brand: "CASTILLITOS", availableInventory: 200 }),
  makeItem({ subgroup: "D", brand: "CASTILLITOS", availableInventory: 180 }),
  makeItem({ subgroup: "E", brand: "CASTILLITOS", availableInventory: 130 }),
], config);
const healthyPriorities = healthyNeeds.map(n => evaluatePriority(ctx, makeItem({ subgroup: n.subgroup, brand: n.brand, availableInventory: n.availableInventory }), config));
const healthResult = evaluateProductionHealth(ctx, healthyNeeds, healthyPriorities, [], config);
check("Overall = HEALTHY", healthResult.overallHealth === "HEALTHY");
check("Total = 5", healthResult.totalSubgroups === 5);
check("Needs production = 0", healthResult.needsProductionCount === 0);

// ── 17: Production Health — Critical ────────────────────────────────────────

header("Production Health — Critical");

const criticalNeeds = evaluateProductionNeed(ctx, [
  makeItem({ subgroup: "A", brand: "CASTILLITOS", availableInventory: 10 }),
  makeItem({ subgroup: "B", brand: "CASTILLITOS", availableInventory: 20 }),
  makeItem({ subgroup: "C", brand: "CASTILLITOS", availableInventory: 30 }),
  makeItem({ subgroup: "D", brand: "CASTILLITOS", availableInventory: 150 }),
], config);
const critPriorities = criticalNeeds.map(n => evaluatePriority(ctx, makeItem({ subgroup: n.subgroup, brand: n.brand, availableInventory: n.availableInventory }), config));
const critShortages = evaluateShortage(ctx, [
  makeItem({ subgroup: "A", brand: "CASTILLITOS", availableInventory: 10 }),
], config);
const critHealth = evaluateProductionHealth(ctx, criticalNeeds, critPriorities, critShortages, config);
check("Overall = CRITICAL or AT_RISK", critHealth.overallHealth === "CRITICAL" || critHealth.overallHealth === "AT_RISK");
check("Needs production > 0", critHealth.needsProductionCount > 0);

// ── 18: Production Health — No Data ─────────────────────────────────────────

header("Production Health — No Data");

const noDataHealth = evaluateProductionHealth(ctx, [], [], [], config);
check("Overall = NO_DATA", noDataHealth.overallHealth === "NO_DATA");
check("Total = 0", noDataHealth.totalSubgroups === 0);

// ── 19: Production Required Alert ───────────────────────────────────────────

header("Production Required Alert");

const produceResult = evaluateProductionNeed(ctx, [makeItem({ subgroup: "SG-1", brand: "CASTILLITOS", availableInventory: 50 })], config)[0];
const prodAlert = buildProductionRequiredAlert(ctx, produceResult, config);
check("Alert generated", prodAlert !== null);
check("Type = PRODUCTION_REQUIRED", prodAlert?.type === "PRODUCTION_REQUIRED");
check("Has deduplicationKey", !!prodAlert?.deduplicationKey);

// ── 20: Wait OP Alert ───────────────────────────────────────────────────────

header("Wait OP Alert");

const waitResult = evaluateProductionNeed(ctx, [makeItem({ subgroup: "SG-2", brand: "CASTILLITOS", availableInventory: 50, activeOPs: [makeOP()] })], config)[0];
const waitAlert = buildWaitOPAlert(ctx, waitResult, config);
check("Alert generated", waitAlert !== null);
check("Type = WAIT_EXISTING_OP", waitAlert?.type === "WAIT_EXISTING_OP");

// ── 21: Wait OP Alert — not triggered for PRODUCE ──────────────────────────

header("Wait OP Alert — Not triggered for PRODUCE");

const waitNope = buildWaitOPAlert(ctx, produceResult, config);
check("No alert for PRODUCE decision", waitNope === null);

// ── 22: Low Stock Alert ─────────────────────────────────────────────────────

header("Low Stock Alert");

const lowShortage = evaluateShortage(ctx, [makeItem({ subgroup: "SG-3", brand: "CASTILLITOS", availableInventory: 70 })], config)[0]; // 70% → HIGH
const lowAlert = buildLowStockAlert(ctx, lowShortage, config);
check("Alert generated for HIGH shortage", lowAlert !== null);
check("Type = LOW_STOCK", lowAlert?.type === "LOW_STOCK");

// ── 23: Critical Shortage Alert ─────────────────────────────────────────────

header("Critical Shortage Alert");

const critShortage = evaluateShortage(ctx, [makeItem({ subgroup: "SG-4", brand: "CASTILLITOS", availableInventory: 10 })], config)[0]; // 10% → CRITICAL
const critAlert = buildCriticalShortageAlert(ctx, critShortage, config);
check("Alert generated for CRITICAL shortage", critAlert !== null);
check("Type = CRITICAL_SHORTAGE", critAlert?.type === "CRITICAL_SHORTAGE");
check("Severity = critical", critAlert?.severity === "critical");

// ── 24: Critical Shortage NOT for non-critical ──────────────────────────────

header("Critical Shortage — NOT for non-critical");

const noCritAlert = buildCriticalShortageAlert(ctx, lowShortage, config);
check("No alert for HIGH shortage", noCritAlert === null);

// ── 25: Low Stock NOT for CRITICAL ──────────────────────────────────────────

header("Low Stock — NOT for CRITICAL");

const noLowAlert = buildLowStockAlert(ctx, critShortage, config);
check("No LOW_STOCK alert for CRITICAL shortage", noLowAlert === null);

// ── 26: Data Quality Alert ──────────────────────────────────────────────────

header("Data Quality Alert");

const dqAlert = buildProductionDataQualityAlert(ctx, "SG-5", "CASTILLITOS", ["coverageDays", "sales6m"], produceResult.evidence, config);
check("Alert generated", dqAlert !== null);
check("Type = DATA_QUALITY", dqAlert?.type === "DATA_QUALITY");

// ── 27: Data Quality Alert — empty fields ───────────────────────────────────

header("Data Quality Alert — Empty fields");

const noDqAlert = buildProductionDataQualityAlert(ctx, "SG-6", "CASTILLITOS", [], produceResult.evidence, config);
check("No alert for empty missingFields", noDqAlert === null);

// ── 28: Batch Alert Builder ─────────────────────────────────────────────────

header("Batch Alert Builder");

const batchAlerts = buildAllProductionAlerts({
  ctx,
  needResults: [produceResult, waitResult],
  shortageResults: [critShortage, lowShortage],
  config,
});
check("Batch generates multiple alerts", batchAlerts.length >= 3);
check("All alerts have tenantId", batchAlerts.every(a => a.tenantId === "castillitos"));
check("All alerts have deduplicationKey", batchAlerts.every(a => !!a.deduplicationKey));

// ── 29: Evidence Bridge ─────────────────────────────────────────────────────

header("Evidence Bridge");

const evidence = bridgeToCommercialEvidence("castillitos", produceResult.evidence, "subgroup", "PIJAMA-BB");
check("Domain = PRODUCTION", evidence.domain === "PRODUCTION");
check("EntityType = subgroup", evidence.entityType === "subgroup");
check("Has traceId", !!evidence.traceId);

// ── 30: Evidence Validation — Valid ─────────────────────────────────────────

header("Evidence Validation — Valid");

const validResult = validateProductionEvidence(produceResult.evidence);
check("Engine-produced evidence is valid", validResult.valid);
check("No issues", validResult.issues.length === 0);

// ── 31: Evidence Validation — Invalid ───────────────────────────────────────

header("Evidence Validation — Invalid");

const badEvidence = { ...produceResult.evidence, policyType: "" as any, policyId: "", traceId: "" };
const invalidResult = validateProductionEvidence(badEvidence);
check("Bad evidence is invalid", !invalidResult.valid);
check("Multiple issues", invalidResult.issues.length >= 2);

// ── 32: Batch Evidence Validation ───────────────────────────────────────────

header("Batch Evidence Validation");

const allEvidence = [produceResult.evidence, waitResult.evidence];
const batchEv = validateAllProductionEvidence(allEvidence);
check("All engine evidence valid", batchEv.invalidCount === 0);
check("Checked count matches", batchEv.totalChecked === 2);

// ── 33: Evidence Four-Question Rule ─────────────────────────────────────────

header("Evidence Four-Question Rule");

const ev = produceResult.evidence;
check("Q1: Why? (activationReason)", !!ev.activationReason);
check("Q2: What data? (dataUsed)", !!ev.dataUsed && Object.keys(ev.dataUsed).length > 0);
check("Q3: What action? (recommendedAction)", !!ev.recommendedAction);
check("Q3b: Why? (actionRationale)", !!ev.actionRationale);
check("Q4: What missing? (missingData array)", Array.isArray(ev.missingData));
check("Confidence in range", ev.confidence >= 0 && ev.confidence <= 1);

// ── 34: SAG Discovery Gaps ──────────────────────────────────────────────────

header("SAG Discovery Gaps");

const gaps = getProductionSagDiscoveryGaps();
check("Has gaps", gaps.length > 0);
check("opDocumentNumber is AVAILABLE", gaps.some(g => g.field === "opDocumentNumber" && g.currentStatus === "AVAILABLE"));
check("opStatus is AVAILABLE", gaps.some(g => g.field === "opStatus" && g.currentStatus === "AVAILABLE"));
check("opPriority is NOT_AVAILABLE", gaps.some(g => g.field === "opPriority" && g.currentStatus === "NOT_AVAILABLE"));
check("All gaps have priority", gaps.every(g => ["HIGH", "MEDIUM", "LOW"].includes(g.priority)));

// ── 35: Config Values ───────────────────────────────────────────────────────

header("Config Values — Not Hardcoded");

check("Castillitos threshold = 100", config.reorder.brandThresholds.CASTILLITOS === 100);
check("Latin Kids threshold = 200", config.reorder.brandThresholds["LATIN KIDS"] === 200);
check("Default threshold = 100", config.reorder.defaultThreshold === 100);
check("Critical threshold = 80", config.priority.criticalThreshold === 80);
check("High threshold = 60", config.priority.highThreshold === 60);
check("Medium threshold = 35", config.priority.mediumThreshold === 35);
check("Weights sum ~1.0", Math.abs(Object.values(config.priority.weights).reduce((s, v) => s + v, 0) - 1.0) < 0.001);

// ── 36: Immutability ────────────────────────────────────────────────────────

header("Immutability");

const origItem = makeItem({ subgroup: "IMMUT", brand: "CASTILLITOS", availableInventory: 50 });
const origInventory = origItem.availableInventory;
evaluateProductionNeed(ctx, [origItem], config);
check("Input not mutated", origItem.availableInventory === origInventory);

// ── 37: Multi-Tenant Isolation ──────────────────────────────────────────────

header("Multi-Tenant Isolation");

const ctxA: ProductionPlanningContext = { tenantId: "tenant-a" };
const ctxB: ProductionPlanningContext = { tenantId: "tenant-b" };
const needA = evaluateProductionNeed(ctxA, [makeItem({ subgroup: "SG", brand: "CASTILLITOS", availableInventory: 50 })], config);
const needB = evaluateProductionNeed(ctxB, [makeItem({ subgroup: "SG", brand: "CASTILLITOS", availableInventory: 50 })], config);
check("Trace IDs are different", needA[0].evidence.traceId !== needB[0].evidence.traceId);

// ── 38: Production Queue ────────────────────────────────────────────────────

header("Production Queue");

const queueItems = [
  makeItem({ subgroup: "SG-Q1", brand: "CASTILLITOS", availableInventory: 10 }),
  makeItem({ subgroup: "SG-Q2", brand: "CASTILLITOS", availableInventory: 50 }),
  makeItem({ subgroup: "SG-Q3", brand: "CASTILLITOS", availableInventory: 80, activeOPs: [makeOP()] }),
  makeItem({ subgroup: "SG-Q4", brand: "CASTILLITOS", availableInventory: 150 }), // sufficient
];
const queueNeeds = evaluateProductionNeed(ctx, queueItems, config);
const queuePriorities = queueItems.map(i => evaluatePriority(ctx, i, config));
const queue = buildProductionQueue(ctx, queueNeeds, queuePriorities, config);

check("Queue has items", queue.totalItems >= 2);
check("Queue excludes sufficient stock", !queue.items.some(i => i.decision === "SUFFICIENT_STOCK"));
check("PRODUCE items before WAIT items", queue.items.length < 2 || queue.items[0].decision === "PRODUCE");
check("Has waitingOPCount", queue.waitingOPCount >= 1);
check("Has tenantId", queue.tenantId === "castillitos");

// ── 39: BusinessDecision Contract ───────────────────────────────────────────

header("BusinessDecision Contract");

const bd = buildBusinessDecision(produceResult, "HIGH", "castillitos");
check("Has decisionId", !!bd.decisionId);
check("Engine = ProductionPlanningPack", bd.engine === "ProductionPlanningPack");
check("Status = pending", bd.status === "pending");
check("Has evidence", !!bd.evidence);
check("Has generatedAt", !!bd.generatedAt);
check("expiresAt is null", bd.expiresAt === null);

// ── 40: Batch BusinessDecisions ─────────────────────────────────────────────

header("Batch BusinessDecisions");

const bds = buildAllBusinessDecisions(queueNeeds, queuePriorities, "castillitos");
check("Excludes SUFFICIENT_STOCK", !bds.some(d => d.title.includes("Stock suficiente")));
check("All have decisionId", bds.every(d => !!d.decisionId));
check("All have engine", bds.every(d => d.engine === "ProductionPlanningPack"));

// ── 41: Production Planning State ───────────────────────────────────────────

header("Production Planning State");

const state = buildProductionPlanningState(
  ctx, queueNeeds, queuePriorities,
  evaluateShortage(ctx, queueItems, config),
  evaluateProductionHealth(ctx, queueNeeds, queuePriorities, evaluateShortage(ctx, queueItems, config), config),
  buildAllProductionAlerts({ ctx, needResults: queueNeeds, shortageResults: evaluateShortage(ctx, queueItems, config), config }),
  queue,
);
check("Has tenantId", state.tenantId === "castillitos");
check("Has productionNeeds", state.productionNeeds.length > 0);
check("Has priorities", state.priorities.length > 0);
check("Has health", !!state.health);
check("Has queue", !!state.queue);
check("Has generatedAt", !!state.generatedAt);

// ── 42: Unknown brand uses default threshold ────────────────────────────────

header("Unknown Brand — Default Threshold");

const unknownBrand = [makeItem({ subgroup: "SG-UNK", brand: "NUEVA_MARCA", availableInventory: 99 })];
const needUnknown = evaluateProductionNeed(ctx, unknownBrand, config);
check("Uses default threshold 100", needUnknown[0].threshold === 100);
check("Decision = PRODUCE (99 < 100)", needUnknown[0].decision === "PRODUCE");

// ══════════════════════════════════════════════════════════════════════════

console.log(`\n${"═".repeat(60)}`);
console.log(`PRODUCTION-PLANNING-POLICY-PACK-01 QA Results: ${passed}/${passed + failed} passed`);
if (failed === 0) {
  console.log("✅ ALL PASSED");
} else {
  console.log(`❌ ${failed} FAILED`);
}
process.exit(failed > 0 ? 1 : 0);
