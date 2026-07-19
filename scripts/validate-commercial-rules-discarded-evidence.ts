/**
 * scripts/validate-commercial-rules-discarded-evidence.ts
 *
 * Sprint validation for COMMERCIAL-RULES-DISCARDED-EVIDENCE-01.
 *
 * Usage: npx tsx scripts/validate-commercial-rules-discarded-evidence.ts
 */

import { evaluateCoverage } from "../lib/comercial/rules/coverage";
import type { CommercialCoverageInput } from "../lib/comercial/rules/coverage";
import type { StorePolicyRule } from "../lib/comercial/tiendas/store-policy-types";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean): void {
  if (ok) { console.log(`  PASS  ${label}`); passed++; }
  else    { console.log(`  FAIL  ${label}`); failed++; }
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const ruleA: StorePolicyRule = {
  id: "rule-A", storeId: "s1", scope: "class_size", productClass: "accessory",
  sizeClass: "medium", minQty: 4, idealQty: 6, maxQty: 8,
  allowReplacement: false, allowProductionSignal: false,
  allowMainWarehouseTransfer: true, priority: 10, active: true, coverageStrategy: "SIZE",
};

const ruleB: StorePolicyRule = {
  id: "rule-B", storeId: "s1", scope: "productClass", productClass: "accessory",
  minQty: 2, idealQty: 3, maxQty: 5,
  allowReplacement: false, allowProductionSignal: false,
  allowMainWarehouseTransfer: true, priority: 5, active: true, coverageStrategy: "SIZE",
};

const ruleC: StorePolicyRule = {
  id: "rule-C", storeId: "s2", scope: "class_size", productClass: "accessory",
  sizeClass: "medium", minQty: 3, idealQty: 5, maxQty: 7,
  allowReplacement: false, allowProductionSignal: false,
  allowMainWarehouseTransfer: true, priority: 10, active: true, coverageStrategy: "SIZE",
};

const ruleD: StorePolicyRule = {
  id: "rule-D", storeId: "s1", scope: "line_subgroup", productClass: "textile",
  line: "castillitos", subgroup: "pijama ll", minQty: 2, idealQty: 4, maxQty: 6,
  allowReplacement: false, allowProductionSignal: false,
  allowMainWarehouseTransfer: true, priority: 10, active: true, coverageStrategy: "SUBGROUP",
};

const ruleInactive: StorePolicyRule = {
  id: "rule-inactive", storeId: "s1", scope: "class_size", productClass: "accessory",
  sizeClass: "medium", minQty: 10, idealQty: 12, maxQty: 15,
  allowReplacement: false, allowProductionSignal: false,
  allowMainWarehouseTransfer: true, priority: 20, active: false, coverageStrategy: "SIZE",
};

const allRules = [ruleA, ruleB, ruleC, ruleD, ruleInactive];

function makeInput(overrides: Partial<CommercialCoverageInput>): CommercialCoverageInput {
  return {
    tenantId: "castillitos", organizationId: "org-01",
    storeId: "s1", storeName: "Tienda Centro",
    referenceCode: "REF-001", productName: "Producto Test",
    productClass: "accessory", businessLine: "accesorios_importacion",
    sizeClass: "medium", currentUnits: 2, sourceAvailableUnits: 20,
    activeRules: allRules,
    ...overrides,
  };
}

console.log("\n=== COMMERCIAL-RULES-DISCARDED-EVIDENCE-01 Validation ===\n");

// ── 1. Discarded rules present in evidence ──────────────────────────────────

const r1 = evaluateCoverage(makeInput({}));
const ruleEv = r1.evidence.items.find(e => e.type === "RULE");
const ruleData = ruleEv?.data as Record<string, unknown>;

check("1. Rule evidence has discardedRules array", Array.isArray(ruleData?.discardedRules));
const discarded = ruleData?.discardedRules as Array<Record<string, unknown>> ?? [];
check("1. At least 1 discarded rule", discarded.length >= 1);

// ── 2. Discarded rule structure is complete ─────────────────────────────────

if (discarded.length > 0) {
  const d0 = discarded[0];
  check("2. Discarded has ruleId", typeof d0.ruleId === "string" && d0.ruleId.length > 0);
  check("2. Discarded has scope", typeof d0.scope === "string");
  check("2. Discarded has priority", typeof d0.priority === "number");
  check("2. Discarded has strategy", typeof d0.strategy === "string");
  check("2. Discarded has matched boolean", typeof d0.matched === "boolean");
  check("2. Discarded has rejectionReason", typeof d0.rejectionReason === "string" && d0.rejectionReason.length > 0);
  check("2. Discarded has specificityRank", typeof d0.specificityRank === "number" && (d0.specificityRank as number) >= 1);
  check("2. Discarded has storeSpecific boolean", typeof d0.storeSpecific === "boolean");
  check("2. Discarded has candidateValues", typeof d0.candidateValues === "object" && d0.candidateValues !== null);
  const cv = d0.candidateValues as Record<string, unknown>;
  check("2. CandidateValues has min/ideal/max", typeof cv.min === "number" && typeof cv.ideal === "number" && typeof cv.max === "number");
}

// ── 3. Rejection reasons are typed ──────────────────────────────────────────

const validReasons = ["LOWER_PRIORITY", "LESS_SPECIFIC", "STORE_MISMATCH", "STRATEGY_MISMATCH", "LINE_MISMATCH", "SUBGROUP_MISMATCH", "SIZE_MISMATCH", "INACTIVE", "OUTSIDE_EFFECTIVE_DATE", "DUPLICATE", "INVALID_RULE"];
const allReasonsValid = discarded.every(d => validReasons.includes(d.rejectionReason as string));
check("3. All rejection reasons are from typed enum", allReasonsValid);

// ── 4. Store mismatch detected ──────────────────────────────────────────────

const storeMismatch = discarded.find(d => d.ruleId === "rule-C");
check("4. Rule-C (different store) is discarded", !!storeMismatch);
check("4. Rule-C rejection = STORE_MISMATCH", storeMismatch?.rejectionReason === "STORE_MISMATCH");

// ── 5. Inactive rule detected ───────────────────────────────────────────────

const inactiveDisc = discarded.find(d => d.ruleId === "rule-inactive");
check("5. Inactive rule is discarded", !!inactiveDisc);
check("5. Inactive rejection = INACTIVE", inactiveDisc?.rejectionReason === "INACTIVE");

// ── 6. Less specific rule detected ─────────────────────────────────────────

const lessSpec = discarded.find(d => d.ruleId === "rule-B");
check("6. Rule-B (productClass scope) is discarded", !!lessSpec);
check("6. Rule-B rejection = LESS_SPECIFIC or LOWER_PRIORITY", lessSpec?.rejectionReason === "LESS_SPECIFIC" || lessSpec?.rejectionReason === "LOWER_PRIORITY");

// ── 7. Decision trace exists ────────────────────────────────────────────────

check("7. Evidence has decisionTrace array", Array.isArray(r1.evidence.decisionTrace));
check("7. Decision trace has 8 steps", r1.evidence.decisionTrace.length === 8);

// ── 8. Decision trace steps are correct ─────────────────────────────────────

const steps = r1.evidence.decisionTrace.map(s => s.step);
check("8. Step 1 = BUSINESS_LINE_RESOLVED", steps[0] === "BUSINESS_LINE_RESOLVED");
check("8. Step 2 = STRATEGY_RESOLVED", steps[1] === "STRATEGY_RESOLVED");
check("8. Step 3 = RULES_EVALUATED", steps[2] === "RULES_EVALUATED");
check("8. Step 4 = RULE_SELECTED", steps[3] === "RULE_SELECTED");
check("8. Step 5 = INVENTORY_EVALUATED", steps[4] === "INVENTORY_EVALUATED");
check("8. Step 6 = SUGGESTION_CALCULATED", steps[5] === "SUGGESTION_CALCULATED");
check("8. Step 7 = SOURCE_CONSTRAINT_APPLIED", steps[6] === "SOURCE_CONSTRAINT_APPLIED");
check("8. Step 8 = RESULT_FINALIZED", steps[7] === "RESULT_FINALIZED");

// ── 9. Decision trace step structure ────────────────────────────────────────

const step0 = r1.evidence.decisionTrace[0];
check("9. Step has status", typeof step0.status === "string");
check("9. Step has summary", typeof step0.summary === "string" && step0.summary.length > 0);
check("9. Step status is valid", ["OK", "WARNING", "DEGRADED", "SKIPPED"].includes(step0.status));

// ── 10. Trace reflects pipeline state correctly ─────────────────────────────

const ruleStep = r1.evidence.decisionTrace.find(s => s.step === "RULE_SELECTED")!;
check("10. RULE_SELECTED status = OK (rule found, no conflict)", ruleStep.status === "OK");

const sourceStep = r1.evidence.decisionTrace.find(s => s.step === "SOURCE_CONSTRAINT_APPLIED")!;
check("10. SOURCE_CONSTRAINT status = OK (enough stock)", sourceStep.status === "OK");

// Test with no rule found
const r2 = evaluateCoverage(makeInput({ subgroup: "desconocido", businessLine: "castillitos", productClass: "textile", sizeClass: undefined }));
const ruleStep2 = r2.evidence.decisionTrace.find(s => s.step === "RULE_SELECTED")!;
check("10. RULE_SELECTED status = DEGRADED (no rule)", ruleStep2.status === "DEGRADED");

// Test with source constraint
const r3 = evaluateCoverage(makeInput({ sourceAvailableUnits: 1 }));
const sourceStep3 = r3.evidence.decisionTrace.find(s => s.step === "SOURCE_CONSTRAINT_APPLIED")!;
check("10. SOURCE_CONSTRAINT status = WARNING (constrained)", sourceStep3.status === "WARNING");

// ── 11. Suggestions unchanged (functional regression) ───────────────────────

check("11. r1 suggestion action = CRITICAL_REPLENISH", r1.suggestion.action === "CRITICAL_REPLENISH");
check("11. r1 finalSuggestedQty = 4 (gap to ideal)", r1.suggestion.finalSuggestedQty === 4);
check("11. r1 sourceConstrained = false", r1.suggestion.sourceConstrained === false);
check("11. r3 sourceConstrained = true", r3.suggestion.sourceConstrained === true);
check("11. r3 finalSuggestedQty = 1 (capped by source)", r3.suggestion.finalSuggestedQty === 1);

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("HOTFIX VALIDATION FAILED.\n");
  process.exit(1);
} else {
  console.log("HOTFIX VALIDATION PASSED — COMMERCIAL-RULES-DISCARDED-EVIDENCE-01 complete.\n");
}
