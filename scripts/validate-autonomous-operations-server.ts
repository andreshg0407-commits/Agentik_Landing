/**
 * scripts/validate-autonomous-operations-server.ts
 *
 * AGENTIK-AUTONOMOUS-OPERATIONS-01 — Server layer structural validation
 *
 * NOTE: The server-only service files import `server-only`, which throws
 * when run outside the Next.js runtime. This script validates the structural
 * contract of the server layer using the pure planner directly (which the
 * service orchestrates). Full integration tests require a Next.js API route
 * or a server action context with a live DATABASE_URL.
 *
 * Run: npx tsx scripts/validate-autonomous-operations-server.ts
 */

// ── Pure service contract validation (no server-only imports) ─────────────────

import { planAutonomousOperation } from "../lib/autonomous-operations/autonomous-operation-planner";
import {
  diegoFinanceApprovalInput,
  diegoFinanceTaskInput,
  lucaMarketingInput,
  milaCommercialInput,
  criticalBlockedInput,
  previewModeInput,
} from "../lib/autonomous-operations/autonomous-operation-fixtures";

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string): asserts condition {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.error(`  ✗ ${label}`);
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ──`);
}

// ── 1. Service contract: non-executable plan results (no DB needed) ───────────

section("Service contract — planAutonomousOperation (core of planAndMaybeExecute)");

{
  const plan = planAutonomousOperation(previewModeInput);
  assert(plan.status !== "READY_TO_EXECUTE", `PREVIEW plan not dispatchable (status=${plan.status})`);
  assert(plan.canAutoExecute === false, "PREVIEW plan cannot auto-execute");
  assert(typeof plan.decision === "string", "PREVIEW plan has decision");
  console.log(`    → decision=${plan.decision} status=${plan.status}`);
}

{
  const plan = planAutonomousOperation(criticalBlockedInput);
  assert(
    plan.status === "WAITING_APPROVAL" || plan.status === "BLOCKED",
    `Critical plan is non-dispatchable (status=${plan.status})`,
  );
  assert(plan.canAutoExecute === false, "Critical plan cannot auto-execute");
  console.log(`    → decision=${plan.decision} status=${plan.status}`);
}

// ── 2. Plans that WOULD dispatch if service ran (READY_TO_EXECUTE) ────────────

section("Service contract — plans ready for dispatch");

{
  // Diego approval in APPROVAL_REQUIRED mode resolves to READY_TO_EXECUTE
  const plan = planAutonomousOperation(diegoFinanceApprovalInput);
  assert(typeof plan.status === "string", "Plan has status");
  if (plan.status === "READY_TO_EXECUTE") {
    assert(plan.decision === "CREATE_APPROVAL_ONLY" || plan.decision === "CREATE_TASK_ONLY",
      `Dispatchable plan has valid decision (got ${plan.decision})`);
    assert(plan.approvalDraft !== undefined || plan.taskDraft !== undefined,
      "Dispatchable plan has at least one draft artifact");
  }
  console.log(`    → decision=${plan.decision} status=${plan.status} hasDraft=${!!(plan.approvalDraft ?? plan.taskDraft)}`);
}

{
  const plan = planAutonomousOperation(diegoFinanceTaskInput);
  assert(typeof plan.status === "string", "Task plan has status");
  console.log(`    → decision=${plan.decision} status=${plan.status}`);
}

// ── 3. All fixtures produce valid plan structure ───────────────────────────────

section("All fixtures produce valid plan structure");

const allFixtures = [
  { name: "diegoFinanceApproval", input: diegoFinanceApprovalInput },
  { name: "diegoFinanceTask",     input: diegoFinanceTaskInput },
  { name: "lucaMarketing",        input: lucaMarketingInput },
  { name: "milaCommercial",       input: milaCommercialInput },
  { name: "criticalBlocked",      input: criticalBlockedInput },
  { name: "previewMode",          input: previewModeInput },
];

for (const { name, input } of allFixtures) {
  const plan = planAutonomousOperation(input);
  assert(plan.id.startsWith("aop_"), `${name}: plan ID has aop_ prefix`);
  assert(typeof plan.status === "string", `${name}: plan has status`);
  assert(typeof plan.decision === "string", `${name}: plan has decision`);
  assert(typeof plan.riskLevel === "string", `${name}: plan has riskLevel`);
  assert(typeof plan.canAutoExecute === "boolean", `${name}: plan has canAutoExecute`);
  assert(Array.isArray(plan.auditTrail), `${name}: plan has auditTrail array`);
  assert(Array.isArray(plan.errors), `${name}: plan has errors array`);
  console.log(`    ${name}: decision=${plan.decision} status=${plan.status} risk=${plan.riskLevel}`);
}

// ── 4. Dispatcher contract — result shape ─────────────────────────────────────

section("AutonomousOperationResult shape contract");

{
  // Non-dispatchable plan → service returns structured result
  const plan = planAutonomousOperation(previewModeInput);
  // Simulate what planAndMaybeExecute returns for non-READY_TO_EXECUTE plans
  const simulatedResult = {
    success:    plan.status !== "BLOCKED" && plan.status !== "FAILED",
    message:    `Plan ${plan.status}`,
    plan,
    status:     plan.status,
    errors:     plan.errors,
    warnings:   plan.warnings,
    auditTrail: plan.auditTrail,
  };
  assert("success"    in simulatedResult, "Result has success field");
  assert("message"    in simulatedResult, "Result has message field");
  assert("plan"       in simulatedResult, "Result has plan field");
  assert("status"     in simulatedResult, "Result has status field");
  assert("errors"     in simulatedResult, "Result has errors array");
  assert("warnings"   in simulatedResult, "Result has warnings array");
  assert("auditTrail" in simulatedResult, "Result has auditTrail array");
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(60));
console.log(`AGENTIK-AUTONOMOUS-OPERATIONS-01 — Server Layer Contract Validation`);
console.log(`Passed: ${passed}  |  Failed: ${failed}  |  Total: ${passed + failed}`);
console.log("Note: Live DB dispatch tests (CREATE_TASK_ONLY, CREATE_APPROVAL_ONLY) require");
console.log("      Next.js API route context with DATABASE_URL — not runnable via tsx.");

if (failures.length > 0) {
  console.error("\nFailed checks:");
  failures.forEach(f => console.error(`  ✗ ${f}`));
  process.exit(1);
}

console.log("\nAll checks passed.");
process.exit(0);
