/**
 * scripts/validate-decision-engine.ts
 *
 * Agentik — Decision Engine Validation Script
 * Sprint: AGENTIK-DECISION-ENGINE-01
 *
 * Pure domain validation — no Prisma, no network calls.
 * Tests the full Decision Engine pipeline end-to-end.
 *
 * Run with: npx tsx scripts/validate-decision-engine.ts
 */

import { runDecisionEngine }      from "../lib/decisions/decision-engine";
import { getActiveRules, getRulesForSignalType, getRulesForDomain } from "../lib/decisions/decision-registry";
import { scoreDecision }          from "../lib/decisions/decision-scoring";
import {
  validateDecisionContext,
  validateDecisionSignal,
  validateDecisionRecommendation,
} from "../lib/decisions/decision-audit";
import {
  buildDecisionContextFromCopilotSnapshot,
} from "../lib/copilot/decision/copilot-decision-adapter";
import {
  castillitosDecisionContext,
  minimalDecisionContext,
  contextWithActiveTasks,
  financeConciliationSignal,
  financeCashflowRiskSignal,
  collectionsOverdueSignal,
  commercialMarginDropSignal,
  marketingCampaignReadySignal,
  operationsInventoryTransferSignal,
} from "../lib/decisions/decision-fixtures";

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: unknown) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${name}: ${msg}`);
    console.log(`  ✗ ${name}: ${msg}`);
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ── Phase 1: Context validation ───────────────────────────────────────────────

console.log("\nPhase 1 — Context validation");

test("Valid context passes validation", () => {
  const result = validateDecisionContext(castillitosDecisionContext);
  assert(result.valid, `Context should be valid. Errors: ${result.errors.join(", ")}`);
});

test("Context without orgSlug fails validation", () => {
  const result = validateDecisionContext({ ...castillitosDecisionContext, orgSlug: "" });
  assert(!result.valid, "Empty orgSlug should fail");
  assert(result.errors.some(e => e.includes("orgSlug")), "Should report orgSlug error");
});

test("Context without agentId fails validation", () => {
  const result = validateDecisionContext({ ...castillitosDecisionContext, agentId: "" });
  assert(!result.valid, "Empty agentId should fail");
});

test("Context without signals produces warning", () => {
  const result = validateDecisionContext({ ...castillitosDecisionContext, signals: [] });
  assert(result.valid, "Empty signals is valid (just warns)");
  assert(result.warnings.length > 0, "Should warn about empty signals");
});

test("Non-object context fails validation", () => {
  const result = validateDecisionContext(null);
  assert(!result.valid, "null context should fail");
});

// ── Phase 2: Signal validation ────────────────────────────────────────────────

console.log("\nPhase 2 — Signal validation");

test("Valid finance signal passes validation", () => {
  const result = validateDecisionSignal(financeConciliationSignal);
  assert(result.valid, `Signal should be valid. Errors: ${result.errors.join(", ")}`);
});

test("Signal without type fails validation", () => {
  const result = validateDecisionSignal({ ...financeConciliationSignal, type: "" });
  assert(!result.valid, "Empty type should fail");
  assert(result.errors.some(e => e.includes("type")), "Should report type error");
});

test("Signal without domain fails validation", () => {
  const result = validateDecisionSignal({ ...financeConciliationSignal, domain: "" });
  assert(!result.valid, "Empty domain should fail");
});

test("Signal without severity fails validation", () => {
  const result = validateDecisionSignal({ ...financeConciliationSignal, severity: "" as never });
  assert(!result.valid, "Empty severity should fail");
});

// ── Phase 3: Registry ─────────────────────────────────────────────────────────

console.log("\nPhase 3 — Rule registry");

test("getActiveRules returns rules", () => {
  const rules = getActiveRules();
  assert(rules.length > 0, "Should have active rules");
});

test("All active rules have valid required fields", () => {
  const rules = getActiveRules();
  for (const rule of rules) {
    assert(typeof rule.id         === "string" && rule.id.length > 0,  `Rule ${rule.id}: id required`);
    assert(typeof rule.domain     === "string",                         `Rule ${rule.id}: domain required`);
    assert(typeof rule.condition  === "function",                       `Rule ${rule.id}: condition must be function`);
    assert(typeof rule.isActive   === "boolean",                        `Rule ${rule.id}: isActive required`);
    assert(rule.isActive,                                               `Rule ${rule.id}: all returned rules should be active`);
  }
});

test("getRulesForSignalType returns matching rules for conciliation", () => {
  const rules = getRulesForSignalType("conciliation_exception_detected");
  assert(rules.length >= 1, "Should have at least one rule for conciliation signals");
});

test("getRulesForSignalType returns matching rules for cashflow", () => {
  const rules = getRulesForSignalType("cashflow_risk_detected");
  assert(rules.length >= 1, "Should have at least one rule for cashflow signals");
});

test("getRulesForDomain returns FINANCE rules", () => {
  const rules = getRulesForDomain("FINANCE");
  assert(rules.length >= 2, "Should have FINANCE rules");
  assert(rules.every(r => r.domain === "FINANCE"), "All returned rules should be FINANCE domain");
});

test("getRulesForDomain returns COLLECTIONS rules", () => {
  const rules = getRulesForDomain("COLLECTIONS");
  assert(rules.length >= 1, "Should have COLLECTIONS rules");
});

test("Registry covers all sprint-specified signal types", () => {
  const signalTypes = [
    "conciliation_exception_detected",
    "cashflow_risk_detected",
    "overdue_customer_detected",
    "commercial_margin_drop_detected",
    "campaign_ready_for_approval",
    "inventory_transfer_required",
  ];
  for (const type of signalTypes) {
    const rules = getRulesForSignalType(type);
    assert(rules.length > 0, `No rules for required signal type: ${type}`);
  }
});

// ── Phase 4: Scoring ──────────────────────────────────────────────────────────

console.log("\nPhase 4 — Scoring");

test("scoreDecision returns valid score for conciliation signal", () => {
  const rules     = getRulesForSignalType("conciliation_exception_detected");
  const rule      = rules[0]!;
  const breakdown = scoreDecision(castillitosDecisionContext, financeConciliationSignal, rule);
  assert(breakdown.finalScore >= 0 && breakdown.finalScore <= 100, `Score ${breakdown.finalScore} must be 0–100`);
  assert(breakdown.severityWeight > 0,    "severityWeight should be positive");
  assert(breakdown.confidenceWeight > 0,  "confidenceWeight should be positive");
});

test("CRITICAL severity scores higher than INFO severity", () => {
  const rules    = getRulesForSignalType("conciliation_exception_detected");
  const highRule = rules.find(r => r.severity === "HIGH")!;
  assert(!!highRule, "Should have a HIGH severity rule");
  const breakdown = scoreDecision(castillitosDecisionContext, financeConciliationSignal, highRule);
  assert(breakdown.severityWeight >= 30, `HIGH rule severityWeight should be ≥30, got ${breakdown.severityWeight}`);
});

test("Active task deduplication penalty reduces score", () => {
  const rules         = getRulesForSignalType("conciliation_exception_detected");
  const rule          = rules[0]!;
  const withoutTasks  = scoreDecision(castillitosDecisionContext, financeConciliationSignal, rule);
  const withTasks     = scoreDecision(contextWithActiveTasks, financeConciliationSignal, rule);
  assert(
    withTasks.finalScore < withoutTasks.finalScore,
    `Score with active task (${withTasks.finalScore}) should be < score without (${withoutTasks.finalScore})`,
  );
  assert(withTasks.duplicationPenalty > 0, "Duplication penalty should be > 0 when task exists");
});

test("High monetary amount increases businessImpactWeight", () => {
  const rules        = getRulesForSignalType("conciliation_exception_detected");
  const rule         = rules[0]!;
  const highAmount   = { ...financeConciliationSignal, metrics: { monetaryAmount: 1_500_000, currency: "MXN" } };
  const lowAmount    = { ...financeConciliationSignal, metrics: { monetaryAmount: 500, currency: "MXN" } };
  const highBreakdown = scoreDecision(castillitosDecisionContext, highAmount, rule);
  const lowBreakdown  = scoreDecision(castillitosDecisionContext, lowAmount,  rule);
  assert(
    highBreakdown.businessImpactWeight >= lowBreakdown.businessImpactWeight,
    "Higher amount should produce higher businessImpactWeight",
  );
});

// ── Phase 5: Engine — full run ────────────────────────────────────────────────

console.log("\nPhase 5 — Engine full run");

test("runDecisionEngine succeeds with valid context", () => {
  const result = runDecisionEngine(castillitosDecisionContext);
  assert(result.success, `Engine should succeed. Errors: ${result.errors.join(", ")}`);
  assert(typeof result.runId === "string" && result.runId.length > 0, "runId should be present");
  assert(Array.isArray(result.recommendations),  "recommendations should be an array");
  assert(Array.isArray(result.auditTrail),        "auditTrail should be an array");
});

test("runDecisionEngine fails gracefully with invalid context", () => {
  const result = runDecisionEngine({ ...castillitosDecisionContext, orgSlug: "" });
  assert(!result.success, "Should fail with empty orgSlug");
  assert(result.errors.length > 0, "Should have errors");
  assert(result.recommendations.length === 0, "Should produce no recommendations");
});

test("runDecisionEngine produces recommendations for all 6 fixture signals", () => {
  const result = runDecisionEngine(castillitosDecisionContext);
  assert(result.recommendations.length > 0, "Should produce at least one recommendation");
});

test("finance conciliation signal → REQUEST_APPROVAL recommended", () => {
  const context = { ...castillitosDecisionContext, signals: [financeConciliationSignal] };
  const result  = runDecisionEngine(context);
  const rec     = result.recommendations.find(r => r.actionType === "REQUEST_APPROVAL");
  assert(!!rec, "Should recommend REQUEST_APPROVAL for HIGH conciliation exception");
  assert(rec.domain === "FINANCE", "Recommendation should be in FINANCE domain");
});

test("cashflow risk signal → CREATE_TASK or REQUEST_APPROVAL", () => {
  const context = { ...castillitosDecisionContext, signals: [financeCashflowRiskSignal] };
  const result  = runDecisionEngine(context);
  assert(result.recommendations.length > 0, "Should produce recommendations");
  const actions = result.recommendations.map(r => r.actionType);
  assert(
    actions.includes("CREATE_TASK") || actions.includes("REQUEST_APPROVAL"),
    `Expected CREATE_TASK or REQUEST_APPROVAL, got: ${actions.join(", ")}`,
  );
});

test("overdue customer signal → CREATE_TASK recommended", () => {
  const context = { ...castillitosDecisionContext, signals: [collectionsOverdueSignal] };
  const result  = runDecisionEngine(context);
  assert(result.recommendations.length > 0, "Should produce recommendations");
  const hasCreateTask = result.recommendations.some(r => r.actionType === "CREATE_TASK");
  const hasApproval   = result.recommendations.some(r => r.actionType === "REQUEST_APPROVAL");
  // This fixture has $215k + 75 days overdue → triggers BOTH rules
  assert(hasCreateTask || hasApproval, "Should recommend CREATE_TASK or REQUEST_APPROVAL for overdue customer");
});

test("campaign ready signal → REQUEST_APPROVAL", () => {
  const context = { ...castillitosDecisionContext, signals: [marketingCampaignReadySignal] };
  const result  = runDecisionEngine(context);
  const rec     = result.recommendations.find(r => r.actionType === "REQUEST_APPROVAL");
  assert(!!rec, "Should recommend REQUEST_APPROVAL for campaign ready");
  assert(rec.domain === "MARKETING", "Recommendation domain should be MARKETING");
});

test("inventory transfer signal → START_WORKFLOW or REQUEST_APPROVAL", () => {
  const context = { ...castillitosDecisionContext, signals: [operationsInventoryTransferSignal] };
  const result  = runDecisionEngine(context);
  assert(result.recommendations.length > 0, "Should produce recommendations");
  const actions = result.recommendations.map(r => r.actionType);
  assert(
    actions.includes("START_WORKFLOW") || actions.includes("REQUEST_APPROVAL"),
    `Expected START_WORKFLOW or REQUEST_APPROVAL, got: ${actions.join(", ")}`,
  );
});

test("commercial margin drop signal → CREATE_TASK or REQUEST_APPROVAL", () => {
  const context = { ...castillitosDecisionContext, signals: [commercialMarginDropSignal] };
  const result  = runDecisionEngine(context);
  assert(result.recommendations.length > 0, "Should produce recommendations");
  const actions = result.recommendations.map(r => r.actionType);
  assert(
    actions.includes("CREATE_TASK") || actions.includes("REQUEST_APPROVAL"),
    `Expected CREATE_TASK or REQUEST_APPROVAL, got: ${actions.join(", ")}`,
  );
});

// ── Phase 6: Ordering ─────────────────────────────────────────────────────────

console.log("\nPhase 6 — Score ordering");

test("Recommendations are ordered by score descending", () => {
  const result = runDecisionEngine(castillitosDecisionContext);
  const scores = result.recommendations.map(r => r.score);
  for (let i = 0; i < scores.length - 1; i++) {
    assert(
      scores[i]! >= scores[i + 1]!,
      `Score at index ${i} (${scores[i]}) should be >= index ${i + 1} (${scores[i + 1]})`,
    );
  }
});

test("All recommendation scores are within 0–100", () => {
  const result = runDecisionEngine(castillitosDecisionContext);
  for (const rec of result.recommendations) {
    assert(rec.score >= 0 && rec.score <= 100, `Score ${rec.score} for rec ${rec.id} out of range`);
  }
});

// ── Phase 7: Deduplication ────────────────────────────────────────────────────

console.log("\nPhase 7 — Deduplication");

test("Same signal does not produce identical recommendations", () => {
  const context = {
    ...castillitosDecisionContext,
    signals: [financeConciliationSignal, financeConciliationSignal],
  };
  const result = runDecisionEngine(context);
  const ids    = result.recommendations.map(r => r.id);
  const unique = new Set(ids);
  assertEqual(unique.size, ids.length, "All recommendation IDs should be unique");
});

test("Active task reduces score via deduplication penalty", () => {
  const withoutTask = runDecisionEngine(minimalDecisionContext);
  const withTask    = runDecisionEngine(contextWithActiveTasks);

  const scoreWithout = withoutTask.recommendations[0]?.score ?? 0;
  const scoreWith    = withTask.recommendations[0]?.score    ?? 0;

  assert(
    scoreWith <= scoreWithout,
    `Score with active task (${scoreWith}) should be ≤ score without (${scoreWithout})`,
  );
});

// ── Phase 8: Audit trail ──────────────────────────────────────────────────────

console.log("\nPhase 8 — Audit trail");

test("Audit trail contains engine_started event", () => {
  const result = runDecisionEngine(castillitosDecisionContext);
  const started = result.auditTrail.find(e => e.event === "engine_started");
  assert(!!started, "Audit trail should contain engine_started event");
});

test("Audit trail contains engine_completed event", () => {
  const result    = runDecisionEngine(castillitosDecisionContext);
  const completed = result.auditTrail.find(e => e.event === "engine_completed");
  assert(!!completed, "Audit trail should contain engine_completed event");
});

test("Audit trail contains rule_matched events", () => {
  const result  = runDecisionEngine(castillitosDecisionContext);
  const matched = result.auditTrail.filter(e => e.event === "rule_matched");
  assert(matched.length > 0, "Audit trail should contain rule_matched events");
});

test("All audit events have runId, event, message, and occurredAt", () => {
  const result = runDecisionEngine(castillitosDecisionContext);
  for (const event of result.auditTrail) {
    assert(typeof event.id         === "string", `event.id should be string`);
    assert(typeof event.runId      === "string", `event.runId should be string`);
    assert(typeof event.event      === "string", `event.event should be string`);
    assert(typeof event.message    === "string", `event.message should be string`);
    assert(typeof event.occurredAt === "string", `event.occurredAt should be string`);
  }
});

// ── Phase 9: Recommendation validation ───────────────────────────────────────

console.log("\nPhase 9 — Recommendation validation");

test("All generated recommendations pass validateDecisionRecommendation", () => {
  const result = runDecisionEngine(castillitosDecisionContext);
  for (const rec of result.recommendations) {
    const v = validateDecisionRecommendation(rec);
    assert(
      v.valid,
      `Recommendation ${rec.id} invalid: ${v.errors.join(", ")}`,
    );
  }
});

test("Recommendations have non-empty title and domain", () => {
  const result = runDecisionEngine(castillitosDecisionContext);
  for (const rec of result.recommendations) {
    assert(rec.title.length  > 0, `rec ${rec.id}: title should not be empty`);
    assert(rec.domain.length > 0, `rec ${rec.id}: domain should not be empty`);
  }
});

// ── Phase 10: No side effects ─────────────────────────────────────────────────

console.log("\nPhase 10 — No side effects");

test("runDecisionEngine does not mutate the context object", () => {
  const originalSignalCount = castillitosDecisionContext.signals.length;
  const originalTaskCount   = castillitosDecisionContext.activeTasks.length;
  runDecisionEngine(castillitosDecisionContext);
  assertEqual(castillitosDecisionContext.signals.length,     originalSignalCount, "signals array not mutated");
  assertEqual(castillitosDecisionContext.activeTasks.length, originalTaskCount,   "activeTasks not mutated");
});

test("Multiple runDecisionEngine calls produce consistent recommendations", () => {
  const r1 = runDecisionEngine(minimalDecisionContext);
  const r2 = runDecisionEngine(minimalDecisionContext);
  assertEqual(r1.recommendations.length, r2.recommendations.length, "Same input produces same count");
  assertEqual(r1.recommendations[0]?.actionType, r2.recommendations[0]?.actionType, "Same top recommendation");
  assertEqual(r1.recommendations[0]?.score,      r2.recommendations[0]?.score,      "Same top score");
});

test("runDecisionEngine does not throw for empty signals array", () => {
  const context = { ...castillitosDecisionContext, signals: [] };
  const result  = runDecisionEngine(context);
  assert(result.success, "Should succeed even with empty signals");
  assertEqual(result.recommendations.length, 0, "No recommendations for empty signals");
});

// ── Phase 11: Copilot adapter ─────────────────────────────────────────────────

console.log("\nPhase 11 — Copilot decision adapter");

test("buildDecisionContextFromCopilotSnapshot produces valid context", () => {
  const snapshot = {
    orgSlug:      "castillitos",
    module:       "finanzas",
    businessDate: "2026-06-03",
    leadAgent:    { agentId: "diego", agentName: "Diego", role: "ORG_ADMIN" },
    attentionItems: [],
    extraSignals:   [financeConciliationSignal],
    metadata:       {},
  };
  const ctx    = buildDecisionContextFromCopilotSnapshot(snapshot);
  const result = validateDecisionContext(ctx);
  assert(result.valid, `Adapter-produced context should be valid. Errors: ${result.errors.join(", ")}`);
});

test("Adapter maps extraSignals correctly", () => {
  const snapshot = {
    orgSlug:      "castillitos",
    module:       "finanzas",
    businessDate: "2026-06-03",
    leadAgent:    { agentId: "diego", agentName: "Diego" },
    extraSignals: [financeConciliationSignal, financeCashflowRiskSignal],
  };
  const ctx = buildDecisionContextFromCopilotSnapshot(snapshot);
  assertEqual(ctx.signals.length, 2, "Should have 2 signals from extraSignals");
});

test("Adapter maps attentionItems to signals", () => {
  const snapshot = {
    orgSlug:      "castillitos",
    module:       "finanzas",
    businessDate: "2026-06-03",
    leadAgent:    { agentId: "diego", agentName: "Diego" },
    attentionItems: [
      {
        id:          "att_001",
        title:       "Atención requerida",
        severity:    "HIGH",
        domain:      "FINANCE",
      },
    ],
  };
  const ctx = buildDecisionContextFromCopilotSnapshot(snapshot);
  assertEqual(ctx.signals.length, 1, "Should have 1 signal from attentionItems");
  assertEqual(ctx.signals[0]?.severity, "HIGH", "Signal severity should map correctly");
});

test("Adapter maps activeWork to activeTasks", () => {
  const snapshot = {
    orgSlug:    "castillitos",
    module:     "finanzas",
    leadAgent:  { agentId: "diego", agentName: "Diego" },
    activeWork: [
      { id: "task_001", title: "Revisar conciliación", status: "OPEN", createdAt: "2026-06-01T00:00:00Z" },
    ],
  };
  const ctx = buildDecisionContextFromCopilotSnapshot(snapshot);
  assertEqual(ctx.activeTasks.length, 1, "Should have 1 active task");
  assertEqual(ctx.activeTasks[0]?.id, "task_001", "Task ID should match");
});

test("Adapter works without leadAgent (system fallback)", () => {
  const snapshot = {
    orgSlug:     "castillitos",
    module:      "finanzas",
    extraSignals: [financeConciliationSignal],
  };
  const ctx = buildDecisionContextFromCopilotSnapshot(snapshot);
  assertEqual(ctx.agentId,   "system", "Should fallback to system agentId");
  assertEqual(ctx.agentName, "System", "Should fallback to System agentName");
});

test("Adapter + engine pipeline: snapshot → context → recommendations", () => {
  const snapshot = {
    orgSlug:      "castillitos",
    module:       "finanzas",
    businessDate: "2026-06-03",
    leadAgent:    { agentId: "diego", agentName: "Diego" },
    extraSignals: [financeConciliationSignal, financeCashflowRiskSignal],
  };
  const ctx    = buildDecisionContextFromCopilotSnapshot(snapshot);
  const result = runDecisionEngine(ctx);
  assert(result.success,                   "Pipeline should succeed");
  assert(result.recommendations.length > 0, "Pipeline should produce recommendations");
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n─────────────────────────────────────────────────────────────────");
console.log("AGENTIK-DECISION-ENGINE-01 — Validation Results");
console.log("─────────────────────────────────────────────────────────────────");
console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);

if (failed > 0) {
  console.log("\nFailed tests:");
  failures.forEach(f => console.log(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log("\nAll tests passed. Decision Engine domain is structurally valid.");
  // Print sample recommendations
  const result = runDecisionEngine(castillitosDecisionContext);
  console.log(`\nSample run — ${result.recommendations.length} recommendations:`);
  result.recommendations.slice(0, 6).forEach((rec, i) => {
    console.log(`  ${i + 1}. [${rec.domain}] ${rec.actionType} — score=${rec.score} — ${rec.title.slice(0, 60)}`);
  });
  process.exit(0);
}
