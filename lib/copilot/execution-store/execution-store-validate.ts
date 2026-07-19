/**
 * lib/copilot/execution-store/execution-store-validate.ts
 *
 * AGENTIK-EXECUTION-PERSISTENCE-01 — Smoke checks for the execution store layer.
 * SERVER ONLY — no React, no AI, no external calls.
 * @server-only
 *
 * All tests are synchronous-equivalent (awaited async against NoopExecutionStore).
 * Safe to run at startup or in integration test endpoints.
 * Never throws — returns a structured report.
 */
import "server-only";

import { NoopExecutionStore }          from "./noop-execution-store";
import { sanitizeExecutionPayload }    from "./execution-store-sanitizer";
import type { ExecutionStoreCreateInput } from "./execution-store-types";

// ── Report type ────────────────────────────────────────────────────────────────

export interface ExecutionStoreValidateResult {
  ok:       boolean;
  passed:   number;
  failed:   number;
  total:    number;
  errors:   string[];
  warnings: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeCreateInput(): ExecutionStoreCreateInput {
  return {
    executionId:   "test-exec-001",
    correlationId: "test-corr-001",
    tenantId:      "castillitos",
    userId:        "user-abc",
    status:        "running",
    source:        "copilot",
    executionMode: "copilot",
    planId:        "plan-001",
    planTitle:     "Test Plan",
    planSummary:   "Smoke test",
    startedAt:     new Date("2026-01-01T00:00:00Z"),
    totalSteps:    2,
  };
}

// ── Runner ─────────────────────────────────────────────────────────────────────

/**
 * Run all execution-store smoke checks.
 * Returns a structured report. Never throws.
 */
export async function runExecutionStoreSmokeCheck(): Promise<ExecutionStoreValidateResult> {
  const errors:   string[] = [];
  const warnings: string[] = [];
  let passed = 0;
  let total  = 0;

  function pass()                   { passed++; total++; }
  function fail(msg: string)        { errors.push(msg); total++; }
  function warn(msg: string)        { warnings.push(msg); }

  const store = new NoopExecutionStore();

  // ── 1. createExecution returns a valid record ────────────────────────────
  try {
    const record = await store.createExecution(makeCreateInput());
    if (!record.executionId || record.executionId !== "test-exec-001") {
      fail("[1] createExecution — executionId mismatch");
    } else if (!record.tenantId || record.tenantId !== "castillitos") {
      fail("[1] createExecution — tenantId mismatch");
    } else if (record.totalSteps !== 2) {
      fail("[1] createExecution — totalSteps mismatch");
    } else {
      pass();
    }
  } catch (err) {
    fail(`[1] createExecution threw: ${String(err)}`);
  }

  // ── 2. updateExecution does not throw ───────────────────────────────────
  try {
    await store.updateExecution("test-exec-001", "castillitos", {
      status:         "completed",
      finishedAt:     new Date(),
      completedSteps: 2,
    });
    pass();
  } catch (err) {
    fail(`[2] updateExecution threw: ${String(err)}`);
  }

  // ── 3. recordStep returns a valid step record ────────────────────────────
  try {
    const step = await store.recordStep({
      executionId:    "test-exec-001",
      tenantId:       "castillitos",
      stepId:         "step-1",
      actionId:       "catalog.publishPendingProducts",
      domain:         "shopify",
      displayName:    "Publish Products",
      status:         "completed",
      approvalStatus: "not_required",
      policyDecision: "allow",
      deniedByPolicy: false,
      startedAt:      new Date(),
      finishedAt:     new Date(),
      durationMs:     120,
      warnings:       [],
    });
    if (!step.stepId || step.stepId !== "step-1") {
      fail("[3] recordStep — stepId mismatch");
    } else if (step.status !== "completed") {
      fail("[3] recordStep — status mismatch");
    } else {
      pass();
    }
  } catch (err) {
    fail(`[3] recordStep threw: ${String(err)}`);
  }

  // ── 4. recordEvent does not throw ───────────────────────────────────────
  try {
    await store.recordEvent({
      executionId: "test-exec-001",
      tenantId:    "castillitos",
      eventType:   "execution_started",
      message:     "Smoke test event",
    });
    pass();
  } catch (err) {
    fail(`[4] recordEvent threw: ${String(err)}`);
  }

  // ── 5. createApprovalRequest returns a pending record ───────────────────
  try {
    const req = await store.createApprovalRequest({
      executionId:    "test-exec-001",
      tenantId:       "castillitos",
      stepId:         "step-1",
      actionId:       "catalog.publishPendingProducts",
      domain:         "shopify",
      requestedBy:    "user-abc",
      policyDecision: "require_approval",
      reason:         "Step requires human approval.",
      requestedAt:    new Date(),
    });
    if (req.approvalStatus !== "pending") {
      fail("[5] createApprovalRequest — status should be pending");
    } else if (req.executionId !== "test-exec-001") {
      fail("[5] createApprovalRequest — executionId mismatch");
    } else {
      pass();
    }
  } catch (err) {
    fail(`[5] createApprovalRequest threw: ${String(err)}`);
  }

  // ── 6. getPendingApprovals returns empty for NoopStore ───────────────────
  try {
    const approvals = await store.getPendingApprovals("castillitos");
    if (!Array.isArray(approvals)) {
      fail("[6] getPendingApprovals — not an array");
    } else {
      pass();
    }
  } catch (err) {
    fail(`[6] getPendingApprovals threw: ${String(err)}`);
  }

  // ── 7. getExecutionById returns null for NoopStore ───────────────────────
  try {
    const record = await store.getExecutionById("test-exec-001", "castillitos");
    if (record !== null) {
      fail("[7] getExecutionById — NoopStore should return null");
    } else {
      pass();
    }
  } catch (err) {
    fail(`[7] getExecutionById threw: ${String(err)}`);
  }

  // ── 8. checkIdempotency returns proceed for NoopStore ───────────────────
  try {
    const result = await store.checkIdempotency("castillitos", "idem-key-abc");
    if (result.outcome !== "proceed") {
      fail("[8] checkIdempotency — NoopStore should return proceed");
    } else {
      pass();
    }
  } catch (err) {
    fail(`[8] checkIdempotency threw: ${String(err)}`);
  }

  // ── 9. Sanitizer removes sensitive keys ──────────────────────────────────
  try {
    const input = {
      productId:   "prod-123",
      accessToken: "shpat_secret",
      apiKey:      "sk-1234",
      nested: {
        password: "hunter2",
        name:     "test",
      },
    };
    const output = sanitizeExecutionPayload(input) as Record<string, unknown>;

    if (output["accessToken"] !== "[REDACTED]") {
      fail("[9] sanitizer — accessToken not redacted");
    } else if (output["apiKey"] !== "[REDACTED]") {
      fail("[9] sanitizer — apiKey not redacted");
    } else if ((output["nested"] as Record<string, unknown>)["password"] !== "[REDACTED]") {
      fail("[9] sanitizer — nested password not redacted");
    } else if (output["productId"] !== "prod-123") {
      fail("[9] sanitizer — productId should be preserved");
    } else if ((output["nested"] as Record<string, unknown>)["name"] !== "test") {
      fail("[9] sanitizer — nested name should be preserved");
    } else {
      pass();
    }
  } catch (err) {
    fail(`[9] sanitizer threw: ${String(err)}`);
  }

  // ── 10. Sanitizer is safe on null / undefined / primitives ──────────────
  try {
    const a = sanitizeExecutionPayload(null);
    const b = sanitizeExecutionPayload(undefined);
    const c = sanitizeExecutionPayload(42);
    const d = sanitizeExecutionPayload("hello");
    const e = sanitizeExecutionPayload(true);

    if (a !== null || b !== undefined || c !== 42 || d !== "hello" || e !== true) {
      fail("[10] sanitizer — primitive passthrough failed");
    } else {
      pass();
    }
  } catch (err) {
    fail(`[10] sanitizer primitive threw: ${String(err)}`);
  }

  // ── 11. Sanitizer handles arrays ─────────────────────────────────────────
  try {
    const arr = [{ token: "secret", value: 1 }, { name: "ok" }];
    const out = sanitizeExecutionPayload(arr) as Record<string, unknown>[];

    if (out[0]["token"] !== "[REDACTED]") {
      fail("[11] sanitizer array — token not redacted");
    } else if (out[0]["value"] !== 1) {
      fail("[11] sanitizer array — value should be preserved");
    } else if (out[1]["name"] !== "ok") {
      fail("[11] sanitizer array — name should be preserved");
    } else {
      pass();
    }
  } catch (err) {
    fail(`[11] sanitizer array threw: ${String(err)}`);
  }

  // ── 12. listExecutions returns empty array for NoopStore ─────────────────
  try {
    const list = await store.listExecutions({ tenantId: "castillitos", limit: 10 });
    if (!Array.isArray(list) || list.length !== 0) {
      fail("[12] listExecutions — NoopStore should return empty array");
    } else {
      pass();
    }
  } catch (err) {
    fail(`[12] listExecutions threw: ${String(err)}`);
  }

  // ── Structural check: NoopExecutionStore implements ExecutionStore fully ─
  const expectedMethods = [
    "createExecution", "updateExecution", "recordStep", "recordEvent",
    "createApprovalRequest", "updateApprovalRequest", "getExecutionById",
    "listExecutions", "getPendingApprovals", "checkIdempotency",
  ];
  for (const method of expectedMethods) {
    if (typeof (store as unknown as Record<string, unknown>)[method] !== "function") {
      fail(`[structure] NoopExecutionStore is missing method "${method}"`);
    }
  }
  warn("PrismaExecutionStore requires a live DB — not checked in smoke tests.");

  return {
    ok:      errors.length === 0,
    passed,
    failed:  errors.length,
    total,
    errors,
    warnings,
  };
}
