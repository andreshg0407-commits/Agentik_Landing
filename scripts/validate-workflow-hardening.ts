/**
 * scripts/validate-workflow-hardening.ts
 *
 * Agentik — Workflow Hardening Validation Script
 * Sprint: AGENTIK-WORKFLOW-HARDENING-01
 *
 * Pure domain validation — no Prisma, no network calls.
 * Tests all pure helpers introduced in workflow-chain-hardening.ts,
 * the type extensions in workflow-chain-types.ts, and the factory
 * helpers used by the hardened service.
 *
 * Run with: npx tsx scripts/validate-workflow-hardening.ts
 */

import {
  buildIdempotencyKey,
  buildWorkflowStepIdempotencyKey,
  getHardeningMeta,
  setHardeningMeta,
  acquireLock,
  releaseLock,
  abortLock,
  isAlreadyProcessed,
  isCurrentlyProcessing,
  hasExceededApprovalLimit,
  hasExceededDispatchLimit,
  incrementApprovalCount,
  incrementDispatchCount,
  isRunStuck,
  buildFailureAuditEvent,
  SAFETY_LIMITS,
} from "../lib/work/chaining/workflow-chain-hardening";

import type {
  WorkflowChainRun,
  WorkflowChainAuditEvent,
  StuckRunReport,
} from "../lib/work/chaining/workflow-chain-types";

import {
  buildWorkflowRunIdempotencyKey,
  buildWorkflowStepIdempotencyKey  as buildWorkflowStepIdemKey2,
  buildWorkflowContinuationIdempotencyKey,
} from "../lib/work/chaining/workflow-chain-idempotency";

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

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRun(overrides: Partial<WorkflowChainRun> = {}): WorkflowChainRun {
  const now = new Date().toISOString();
  return {
    id:                 "run_test_001",
    chainId:            "CHAIN_FINANCE",
    chainName:          "Finance Chain",
    orgSlug:            "castillitos",
    status:             "RUNNING",
    triggerExecutionId: "exec_trigger_001",
    currentStepId:      "step_1",
    completedStepIds:   [],
    stepResults:        [],
    auditTrail:         [],
    createdAt:          now,
    updatedAt:          now,
    metadata:           {},
    ...overrides,
  };
}

// ── Phase 1: Idempotency key generation ───────────────────────────────────────

console.log("\nPhase 1 — Idempotency key generation");

test("buildIdempotencyKey returns correct format", () => {
  const key = buildIdempotencyKey("CHAIN_FINANCE", "exec_001");
  assertEqual(key, "workflow:CHAIN_FINANCE:exec_001", "key format");
});

test("buildIdempotencyKey is deterministic", () => {
  const k1 = buildIdempotencyKey("CHAIN_COMMERCIAL", "exec_abc");
  const k2 = buildIdempotencyKey("CHAIN_COMMERCIAL", "exec_abc");
  assertEqual(k1, k2, "same inputs produce same key");
});

test("buildIdempotencyKey distinguishes different chains", () => {
  const k1 = buildIdempotencyKey("CHAIN_FINANCE",    "exec_001");
  const k2 = buildIdempotencyKey("CHAIN_COMMERCIAL", "exec_001");
  assert(k1 !== k2, "different chainIds must produce different keys");
});

test("buildIdempotencyKey distinguishes different executions", () => {
  const k1 = buildIdempotencyKey("CHAIN_FINANCE", "exec_001");
  const k2 = buildIdempotencyKey("CHAIN_FINANCE", "exec_002");
  assert(k1 !== k2, "different executions must produce different keys");
});

test("buildWorkflowStepIdempotencyKey returns correct format", () => {
  const key = buildWorkflowStepIdempotencyKey("run_001", "step_2", "exec_prev_001");
  assertEqual(key, "workflow-step:run_001:step_2:exec_prev_001", "step key format");
});

test("buildWorkflowStepIdempotencyKey is deterministic", () => {
  const k1 = buildWorkflowStepIdempotencyKey("run_001", "step_2", "exec_prev_001");
  const k2 = buildWorkflowStepIdempotencyKey("run_001", "step_2", "exec_prev_001");
  assertEqual(k1, k2, "same inputs produce same step key");
});

// ── Phase 2: Hardening metadata — defaults ────────────────────────────────────

console.log("\nPhase 2 — Hardening metadata defaults");

test("getHardeningMeta returns zero defaults for empty metadata", () => {
  const run  = makeRun({ metadata: {} });
  const hard = getHardeningMeta(run);
  assertEqual(hard.processingExecutionIds.length, 0, "processingExecutionIds empty");
  assertEqual(hard.processedExecutionIds.length,  0, "processedExecutionIds empty");
  assertEqual(hard.approvalCount,     0, "approvalCount 0");
  assertEqual(hard.autoDispatchCount, 0, "autoDispatchCount 0");
});

test("getHardeningMeta reads stored values correctly", () => {
  const run = makeRun({
    metadata: {
      processingExecutionIds: ["exec_a"],
      processedExecutionIds:  ["exec_b", "exec_c"],
      approvalCount:          3,
      autoDispatchCount:      2,
    },
  });
  const hard = getHardeningMeta(run);
  assertEqual(hard.processingExecutionIds.length, 1, "processingExecutionIds length");
  assertEqual(hard.processedExecutionIds.length,  2, "processedExecutionIds length");
  assertEqual(hard.approvalCount,     3, "approvalCount");
  assertEqual(hard.autoDispatchCount, 2, "autoDispatchCount");
});

// ── Phase 3: Processing lock — acquire / release / abort ──────────────────────

console.log("\nPhase 3 — Processing lock transitions");

test("acquireLock adds executionId to processingExecutionIds", () => {
  const run    = makeRun();
  const locked = acquireLock(run, "exec_001");
  const hard   = getHardeningMeta(locked);
  assert(hard.processingExecutionIds.includes("exec_001"), "exec_001 in processingIds");
  assertEqual(hard.processedExecutionIds.length, 0, "processedIds still empty");
});

test("acquireLock is idempotent — does not double-add", () => {
  const run   = makeRun();
  const once  = acquireLock(run, "exec_001");
  const twice = acquireLock(once, "exec_001");
  const hard  = getHardeningMeta(twice);
  assertEqual(hard.processingExecutionIds.length, 1, "only one entry after double acquire");
});

test("releaseLock moves executionId from processing to processed", () => {
  const run      = makeRun();
  const locked   = acquireLock(run, "exec_001");
  const released = releaseLock(locked, "exec_001");
  const hard     = getHardeningMeta(released);
  assert(!hard.processingExecutionIds.includes("exec_001"), "no longer in processingIds");
  assert(hard.processedExecutionIds.includes("exec_001"),   "now in processedIds");
});

test("abortLock removes from processing without adding to processed", () => {
  const run     = makeRun();
  const locked  = acquireLock(run, "exec_001");
  const aborted = abortLock(locked, "exec_001");
  const hard    = getHardeningMeta(aborted);
  assert(!hard.processingExecutionIds.includes("exec_001"), "removed from processing");
  assert(!hard.processedExecutionIds.includes("exec_001"),  "not added to processed");
});

// ── Phase 4: isAlreadyProcessed / isCurrentlyProcessing ──────────────────────

console.log("\nPhase 4 — Duplicate detection guards");

test("isAlreadyProcessed returns false for fresh run", () => {
  const run = makeRun();
  assert(!isAlreadyProcessed(run, "exec_001"), "fresh run — not processed");
});

test("isAlreadyProcessed returns true after releaseLock", () => {
  const run      = makeRun();
  const locked   = acquireLock(run, "exec_001");
  const released = releaseLock(locked, "exec_001");
  assert(isAlreadyProcessed(released, "exec_001"), "processed after release");
});

test("isCurrentlyProcessing returns false for fresh run", () => {
  const run = makeRun();
  assert(!isCurrentlyProcessing(run, "exec_001"), "fresh run — not processing");
});

test("isCurrentlyProcessing returns true after acquireLock", () => {
  const run    = makeRun();
  const locked = acquireLock(run, "exec_001");
  assert(isCurrentlyProcessing(locked, "exec_001"), "currently processing after acquire");
});

test("isCurrentlyProcessing returns false after releaseLock", () => {
  const run      = makeRun();
  const locked   = acquireLock(run, "exec_001");
  const released = releaseLock(locked, "exec_001");
  assert(!isCurrentlyProcessing(released, "exec_001"), "not processing after release");
});

// ── Phase 5: Safety limits ────────────────────────────────────────────────────

console.log("\nPhase 5 — Safety limits");

test("SAFETY_LIMITS.MAX_APPROVALS is 10", () => {
  assertEqual(SAFETY_LIMITS.MAX_APPROVALS, 10, "MAX_APPROVALS");
});

test("SAFETY_LIMITS.MAX_AUTO_DISPATCHES is 10", () => {
  assertEqual(SAFETY_LIMITS.MAX_AUTO_DISPATCHES, 10, "MAX_AUTO_DISPATCHES");
});

test("SAFETY_LIMITS.MAX_STEP_RESULTS is 20", () => {
  assertEqual(SAFETY_LIMITS.MAX_STEP_RESULTS, 20, "MAX_STEP_RESULTS");
});

test("hasExceededApprovalLimit returns false below limit", () => {
  let run = makeRun();
  for (let i = 0; i < 9; i++) run = incrementApprovalCount(run);
  assert(!hasExceededApprovalLimit(run), "9 approvals: not exceeded");
});

test("hasExceededApprovalLimit returns true at limit", () => {
  let run = makeRun();
  for (let i = 0; i < 10; i++) run = incrementApprovalCount(run);
  assert(hasExceededApprovalLimit(run), "10 approvals: exceeded");
});

test("hasExceededDispatchLimit returns false below limit", () => {
  let run = makeRun();
  for (let i = 0; i < 9; i++) run = incrementDispatchCount(run);
  assert(!hasExceededDispatchLimit(run), "9 dispatches: not exceeded");
});

test("hasExceededDispatchLimit returns true at limit", () => {
  let run = makeRun();
  for (let i = 0; i < 10; i++) run = incrementDispatchCount(run);
  assert(hasExceededDispatchLimit(run), "10 dispatches: exceeded");
});

test("incrementApprovalCount accumulates correctly", () => {
  let run = makeRun();
  run = incrementApprovalCount(run);
  run = incrementApprovalCount(run);
  run = incrementApprovalCount(run);
  assertEqual(getHardeningMeta(run).approvalCount, 3, "3 approvals after 3 increments");
});

test("incrementDispatchCount accumulates correctly", () => {
  let run = makeRun();
  run = incrementDispatchCount(run);
  run = incrementDispatchCount(run);
  assertEqual(getHardeningMeta(run).autoDispatchCount, 2, "2 dispatches after 2 increments");
});

// ── Phase 6: Idempotency — double-process simulation ─────────────────────────

console.log("\nPhase 6 — Double-process simulation (idempotency)");

test("Second invocation on same executionId is blocked by isAlreadyProcessed", () => {
  let run = makeRun();
  run = acquireLock(run, "exec_001");
  run = releaseLock(run, "exec_001");
  const blocked = isAlreadyProcessed(run, "exec_001");
  assert(blocked, "second invocation must see isAlreadyProcessed=true");
});

test("Concurrent duplicate invocation is blocked by isCurrentlyProcessing", () => {
  let run = makeRun();
  run = acquireLock(run, "exec_001");
  const concurrent = isCurrentlyProcessing(run, "exec_001");
  assert(concurrent, "concurrent invocation must see isCurrentlyProcessing=true");
});

test("Different executionId on same run is not blocked", () => {
  let run = makeRun();
  run = acquireLock(run, "exec_001");
  run = releaseLock(run, "exec_001");
  assert(!isAlreadyProcessed(run, "exec_002"),     "exec_002 not in processedIds");
  assert(!isCurrentlyProcessing(run, "exec_002"),  "exec_002 not in processingIds");
});

// ── Phase 7: Stuck run detection ─────────────────────────────────────────────

console.log("\nPhase 7 — Stuck run detection");

test("isRunStuck returns stuck=false for COMPLETED run", () => {
  const run = makeRun({ status: "COMPLETED" });
  const { stuck } = isRunStuck(run);
  assert(!stuck, "COMPLETED run is not stuck");
});

test("isRunStuck returns stuck=false for fresh RUNNING run", () => {
  const run = makeRun({ status: "RUNNING", updatedAt: new Date().toISOString() });
  const { stuck } = isRunStuck(run);
  assert(!stuck, "RUNNING run updated now is not stuck");
});

test("isRunStuck returns stuck=true for stale RUNNING run (>15min)", () => {
  const oldDate = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const run = makeRun({ status: "RUNNING", updatedAt: oldDate });
  const { stuck, recommendedAction } = isRunStuck(run);
  assert(stuck, "RUNNING run 20min stale is stuck");
  assertEqual(recommendedAction, "retry_current_step", "recommendedAction for stuck RUNNING");
});

test("isRunStuck returns stuck=true for stale BLOCKED run (>5min)", () => {
  const oldDate = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const run = makeRun({ status: "BLOCKED", updatedAt: oldDate });
  const { stuck, recommendedAction } = isRunStuck(run);
  assert(stuck, "BLOCKED run 10min stale is stuck");
  assertEqual(recommendedAction, "manual_review", "recommendedAction for stuck BLOCKED");
});

test("isRunStuck returns stuck=false for fresh BLOCKED run (<5min)", () => {
  const recentDate = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const run = makeRun({ status: "BLOCKED", updatedAt: recentDate });
  const { stuck } = isRunStuck(run);
  assert(!stuck, "BLOCKED run 2min ago is not yet stuck");
});

// ── Phase 8: Dead-letter audit event ─────────────────────────────────────────

console.log("\nPhase 8 — Dead-letter audit event");

test("buildFailureAuditEvent returns well-formed event", () => {
  const err   = new Error("Prisma timeout");
  const event = buildFailureAuditEvent("run_001", "exec_001", err);
  assert(typeof event.id === "string" && event.id.length > 0, "event.id present");
  assertEqual(event.runId,       "run_001",                   "event.runId");
  assertEqual(event.event,       "chain_continuation_failed", "event.event type");
  assertEqual(event.executionId, "exec_001",                  "event.executionId");
  assert(typeof event.occurredAt === "string",                 "event.occurredAt is string");
  assert(event.message.includes("Prisma timeout"),             "error message included");
});

test("buildFailureAuditEvent truncates long error messages to 200 chars", () => {
  const longMsg = "x".repeat(500);
  const event   = buildFailureAuditEvent("run_001", "exec_001", new Error(longMsg));
  const meta    = event.metadata as Record<string, unknown>;
  assert((meta.safeErrorMessage as string).length <= 200, "safeErrorMessage truncated to ≤200 chars");
});

test("buildFailureAuditEvent handles non-Error objects gracefully", () => {
  const event = buildFailureAuditEvent("run_001", "exec_001", { weird: true });
  assert(typeof event.message === "string", "message is a string even for non-Error");
});

test("buildFailureAuditEvent IDs are unique across calls", () => {
  const e1 = buildFailureAuditEvent("run_001", "exec_001", new Error("a"));
  const e2 = buildFailureAuditEvent("run_001", "exec_002", new Error("b"));
  assert(e1.id !== e2.id, "unique IDs per event");
});

// ── Phase 9: StuckRunReport type shape ───────────────────────────────────────

console.log("\nPhase 9 — StuckRunReport type shape");

test("StuckRunReport type fields are assignable", () => {
  const report: StuckRunReport = {
    runId:             "run_001",
    chainId:           "CHAIN_FINANCE",
    chainName:         "Finance Chain",
    status:            "RUNNING",
    currentStepId:     "step_2",
    lastAuditEvent:    null,
    staleSinceMs:      900000,
    recommendedAction: "retry_current_step",
  };
  assert(report.runId === "run_001", "StuckRunReport is correctly typed");
});

// ── Phase 10: Metadata immutability ──────────────────────────────────────────

console.log("\nPhase 10 — Metadata immutability (pure functions)");

test("acquireLock does not mutate original run", () => {
  const run    = makeRun();
  const locked = acquireLock(run, "exec_001");
  const orig   = getHardeningMeta(run);
  assert(orig.processingExecutionIds.length === 0, "original run metadata unchanged after acquireLock");
  assert(locked !== run, "returns new run object");
});

test("releaseLock does not mutate locked run", () => {
  const run      = makeRun();
  const locked   = acquireLock(run, "exec_001");
  const released = releaseLock(locked, "exec_001");
  const lockHard = getHardeningMeta(locked);
  assert(lockHard.processingExecutionIds.includes("exec_001"), "locked run unchanged after releaseLock");
  assert(released !== locked, "returns new run object");
});

test("setHardeningMeta preserves other metadata fields", () => {
  const run  = makeRun({ metadata: { customField: "hello", approvalCount: 0 } });
  const next = setHardeningMeta(run, { approvalCount: 5 });
  const meta = next.metadata as Record<string, unknown>;
  assertEqual(meta.customField as string, "hello", "other metadata fields preserved");
  assertEqual(meta.approvalCount as number, 5,      "updated field applied");
});

// ── Phase 11: Safety limit edge cases ────────────────────────────────────────

console.log("\nPhase 11 — Safety limit edge cases");

test("hasExceededApprovalLimit is false at exactly MAX-1", () => {
  let run = makeRun();
  for (let i = 0; i < SAFETY_LIMITS.MAX_APPROVALS - 1; i++) run = incrementApprovalCount(run);
  assert(!hasExceededApprovalLimit(run), "MAX-1 approvals: not exceeded");
});

test("hasExceededApprovalLimit transitions correctly at MAX boundary", () => {
  let run = makeRun();
  for (let i = 0; i < SAFETY_LIMITS.MAX_APPROVALS; i++) run = incrementApprovalCount(run);
  assert(hasExceededApprovalLimit(run), "exactly MAX approvals: exceeded");
});

test("hasExceededDispatchLimit is false at exactly MAX-1", () => {
  let run = makeRun();
  for (let i = 0; i < SAFETY_LIMITS.MAX_AUTO_DISPATCHES - 1; i++) run = incrementDispatchCount(run);
  assert(!hasExceededDispatchLimit(run), "MAX-1 dispatches: not exceeded");
});

// ── Phase 12: Stuck thresholds ────────────────────────────────────────────────

console.log("\nPhase 12 — Stuck thresholds");

test("STUCK_RUNNING_MS is 15 minutes in ms", () => {
  assertEqual(SAFETY_LIMITS.STUCK_RUNNING_MS, 15 * 60 * 1000, "STUCK_RUNNING_MS = 15min");
});

test("STUCK_BLOCKED_MS is 5 minutes in ms", () => {
  assertEqual(SAFETY_LIMITS.STUCK_BLOCKED_MS, 5 * 60 * 1000, "STUCK_BLOCKED_MS = 5min");
});

test("Run updated at threshold minus 1s is NOT yet stuck", () => {
  const notYet = new Date(Date.now() - SAFETY_LIMITS.STUCK_RUNNING_MS + 1000).toISOString();
  const run = makeRun({ status: "RUNNING", updatedAt: notYet });
  const { stuck } = isRunStuck(run);
  assert(!stuck, "run at threshold minus 1s is not yet stuck");
});

// ── Phase 13: workflow-chain-idempotency.ts key builders ─────────────────────

console.log("\nPhase 13 — Workflow chain idempotency key builders");

test("buildWorkflowRunIdempotencyKey is deterministic", () => {
  const k1 = buildWorkflowRunIdempotencyKey("castillitos", "CHAIN_FINANCE", "exec_001");
  const k2 = buildWorkflowRunIdempotencyKey("castillitos", "CHAIN_FINANCE", "exec_001");
  assertEqual(k1, k2, "same inputs → same key");
});

test("buildWorkflowRunIdempotencyKey has workflow_run prefix", () => {
  const key = buildWorkflowRunIdempotencyKey("castillitos", "CHAIN_FINANCE", "exec_001");
  assert(key.startsWith("workflow_run:"), `key starts with workflow_run: — got ${key}`);
});

test("buildWorkflowRunIdempotencyKey contains orgSlug", () => {
  const key = buildWorkflowRunIdempotencyKey("castillitos", "CHAIN_FINANCE", "exec_001");
  assert(key.includes("castillitos"), "key contains orgSlug");
});

test("buildWorkflowRunIdempotencyKey distinguishes different triggerExecutionId", () => {
  const k1 = buildWorkflowRunIdempotencyKey("castillitos", "CHAIN_FINANCE", "exec_001");
  const k2 = buildWorkflowRunIdempotencyKey("castillitos", "CHAIN_FINANCE", "exec_002");
  assert(k1 !== k2, "different triggerExecutionId → different key");
});

test("buildWorkflowRunIdempotencyKey distinguishes different chainId", () => {
  const k1 = buildWorkflowRunIdempotencyKey("castillitos", "CHAIN_FINANCE",     "exec_001");
  const k2 = buildWorkflowRunIdempotencyKey("castillitos", "CHAIN_COMMERCIAL",  "exec_001");
  assert(k1 !== k2, "different chainId → different key");
});

test("buildWorkflowStepIdemKey2 is deterministic", () => {
  const k1 = buildWorkflowStepIdemKey2("castillitos", "run_001", "step_2", "exec_prev");
  const k2 = buildWorkflowStepIdemKey2("castillitos", "run_001", "step_2", "exec_prev");
  assertEqual(k1, k2, "same inputs → same step key");
});

test("buildWorkflowStepIdemKey2 has workflow_step prefix", () => {
  const key = buildWorkflowStepIdemKey2("castillitos", "run_001", "step_2", "exec_prev");
  assert(key.startsWith("workflow_step:"), `key starts with workflow_step: — got ${key}`);
});

test("buildWorkflowStepIdemKey2 distinguishes different previousExecutionId", () => {
  const k1 = buildWorkflowStepIdemKey2("castillitos", "run_001", "step_2", "exec_prev_a");
  const k2 = buildWorkflowStepIdemKey2("castillitos", "run_001", "step_2", "exec_prev_b");
  assert(k1 !== k2, "different previousExecutionId → different key");
});

test("buildWorkflowContinuationIdempotencyKey is deterministic", () => {
  const k1 = buildWorkflowContinuationIdempotencyKey("castillitos", "run_001", "exec_001");
  const k2 = buildWorkflowContinuationIdempotencyKey("castillitos", "run_001", "exec_001");
  assertEqual(k1, k2, "same inputs → same continuation key");
});

test("buildWorkflowContinuationIdempotencyKey has workflow_continuation prefix", () => {
  const key = buildWorkflowContinuationIdempotencyKey("castillitos", "run_001", "exec_001");
  assert(key.startsWith("workflow_continuation:"), `key starts with workflow_continuation: — got ${key}`);
});

test("buildWorkflowContinuationIdempotencyKey distinguishes different executionId", () => {
  const k1 = buildWorkflowContinuationIdempotencyKey("castillitos", "run_001", "exec_001");
  const k2 = buildWorkflowContinuationIdempotencyKey("castillitos", "run_001", "exec_002");
  assert(k1 !== k2, "different executionId → different continuation key");
});

// ── Phase 14: New audit event type assignability ──────────────────────────────

console.log("\nPhase 14 — New WorkflowChainEventType values");

test("processing_started is a valid WorkflowChainAuditEvent event type", () => {
  const event: WorkflowChainAuditEvent = {
    id:         "evt_001",
    runId:      "run_001",
    event:      "processing_started",
    message:    "Processing started",
    metadata:   {},
    occurredAt: new Date().toISOString(),
  };
  assertEqual(event.event, "processing_started", "processing_started assignable");
});

test("processing_completed is a valid WorkflowChainAuditEvent event type", () => {
  const event: WorkflowChainAuditEvent = {
    id:         "evt_002",
    runId:      "run_001",
    event:      "processing_completed",
    message:    "Processing completed",
    metadata:   {},
    occurredAt: new Date().toISOString(),
  };
  assertEqual(event.event, "processing_completed", "processing_completed assignable");
});

test("processing_released is a valid WorkflowChainAuditEvent event type", () => {
  const event: WorkflowChainAuditEvent = {
    id:         "evt_003",
    runId:      "run_001",
    event:      "processing_released",
    message:    "Processing lock released",
    metadata:   {},
    occurredAt: new Date().toISOString(),
  };
  assertEqual(event.event, "processing_released", "processing_released assignable");
});

test("dead_letter_recorded is a valid WorkflowChainAuditEvent event type", () => {
  const event: WorkflowChainAuditEvent = {
    id:         "evt_004",
    runId:      "run_001",
    event:      "dead_letter_recorded",
    message:    "Dead letter recorded",
    metadata:   {},
    occurredAt: new Date().toISOString(),
  };
  assertEqual(event.event, "dead_letter_recorded", "dead_letter_recorded assignable");
});

test("recovery_candidate_found is a valid WorkflowChainAuditEvent event type", () => {
  const event: WorkflowChainAuditEvent = {
    id:         "evt_005",
    runId:      "run_001",
    event:      "recovery_candidate_found",
    message:    "Recovery candidate found",
    metadata:   {},
    occurredAt: new Date().toISOString(),
  };
  assertEqual(event.event, "recovery_candidate_found", "recovery_candidate_found assignable");
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n─────────────────────────────────────────────────────────────────");
console.log("AGENTIK-WORKFLOW-HARDENING-01 — Validation Results");
console.log("─────────────────────────────────────────────────────────────────");
console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);

if (failures.length > 0) {
  console.log("\nFailed tests:");
  failures.forEach(f => console.log(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log("\nAll tests passed. Hardening domain layer is structurally valid.");
  process.exit(0);
}
