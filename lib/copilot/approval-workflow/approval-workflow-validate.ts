/**
 * lib/copilot/approval-workflow/approval-workflow-validate.ts
 *
 * AGENTIK-APPROVAL-WORKFLOW-01 — Smoke tests for the approval workflow service.
 * SERVER ONLY — no React, no domain-specific code.
 * @server-only
 *
 * 12 smoke checks:
 *   1.  getPendingApprovals — returns empty list from noop store
 *   2.  getApprovalDetail — returns null for unknown id
 *   3.  approveApprovalRequest — fails gracefully when record missing
 *   4.  rejectApprovalRequest — fails gracefully when record missing
 *   5.  cancelApprovalRequest — fails gracefully when record missing
 *   6.  expireApprovalRequest — fails gracefully when record missing
 *   7.  _resolve validation — fails with INVALID_INPUT for missing approvalId
 *   8.  _resolve validation — fails with INVALID_INPUT for missing tenantId
 *   9.  _resolve validation — fails with INVALID_INPUT for missing resolvedBy
 *   10. buildResumePlan — returns canResume=false when approval not found
 *   11. buildResumePlan — returns canResume=false when approval not approved
 *   12. resumeExecutionFromApproval — returns not_implemented_yet stub
 *
 * Happy-path tests (13–15) use a MockExecutionStore that injects data:
 *   13. approveApprovalRequest — succeeds with mock pending approval
 *   14. rejectApprovalRequest  — succeeds with mock pending approval
 *   15. buildResumePlan        — returns canResume=true with mocked data
 */
import "server-only";

import type {
  ExecutionStore,
  ExecutionRecord,
  ExecutionStepRecord,
  ExecutionEventRecord,
  ApprovalRequestRecord,
  ExecutionStoreCreateInput,
  ExecutionStoreUpdateInput,
  ExecutionStoreStepInput,
  ExecutionStoreEventInput,
  ApprovalRequestCreateInput,
  ApprovalRequestUpdateInput,
  ResolveApprovalRequestInput,
  ExecutionStoreQuery,
  IdempotencyCheckResult,
} from "@/lib/copilot/execution-store/execution-store-types";

import { noopExecutionStore } from "@/lib/copilot/execution-store";

import { createApprovalWorkflowService } from "./approval-workflow-service";

// ── Smoke check result type ────────────────────────────────────────────────────

export interface ApprovalWorkflowSmokeCheck {
  check:   string;
  passed:  boolean;
  detail?: string;
}

export interface ApprovalWorkflowValidateResult {
  passed:  number;
  failed:  number;
  total:   number;
  checks:  ApprovalWorkflowSmokeCheck[];
  ok:      boolean;
}

// ── MockExecutionStore ────────────────────────────────────────────────────────
//
// Minimal in-memory store for happy-path tests.
// Only the methods used by ApprovalWorkflowService are overridden.

function makeTestRecord(): ApprovalRequestRecord {
  const now = new Date();
  return {
    id:              "approval-mock-01",
    executionId:     "exec-mock-01",
    tenantId:        "tenant-mock",
    stepId:          "step-001",
    actionId:        "send_email",
    domain:          "marketing",
    requestedBy:     "user@acme.com",
    approvalStatus:  "pending",
    policyDecision:  "require_approval",
    policyReasons:   ["High-risk operation"],
    reason:          "Requires human review",
    requestedAt:     now,
    resolvedAt:      undefined,
    resolvedBy:      undefined,
    resolutionNote:  undefined,
    metadata:        undefined,
    createdAt:       now,
    updatedAt:       now,
  };
}

function makeTestExecution(approvalRecord: ApprovalRequestRecord): ExecutionRecord {
  const now = new Date();
  const planSnapshot = {
    steps: [
      {
        stepId:             "step-001",
        actionId:           "send_email",
        domain:             "marketing",
        displayName:        "Send email",
        order:              1,
        parameters:         { to: "test@example.com" },
        requiresApproval:   true,
        automationEligible: false,
      },
      {
        stepId:             "step-002",
        actionId:           "log_send",
        domain:             "marketing",
        displayName:        "Log send result",
        order:              2,
        parameters:         {},
        requiresApproval:   false,
        automationEligible: true,
      },
    ],
  };
  return {
    id:               "exec-mock-row-01",
    executionId:      approvalRecord.executionId,
    correlationId:    "corr-mock-01",
    tenantId:         approvalRecord.tenantId,
    userId:           approvalRecord.requestedBy,
    status:           "awaiting_approval",
    source:           "copilot",
    executionMode:    "supervised",
    planId:           "plan-mock-01",
    planTitle:        "Test plan",
    planSummary:      "A mock plan for testing",
    idempotencyKey:   undefined,
    startedAt:        now,
    finishedAt:       undefined,
    durationMs:       undefined,
    totalSteps:       2,
    completedSteps:   0,
    failedSteps:      0,
    skippedSteps:     0,
    blockedSteps:     1,
    approvalRequired: true,
    deniedByPolicy:   0,
    inputSnapshot:    undefined,
    planSnapshot,
    reportSnapshot:   undefined,
    metadata:         undefined,
    createdAt:        now,
    updatedAt:        now,
  };
}

class MockExecutionStore implements ExecutionStore {
  private _approvals: Map<string, ApprovalRequestRecord> = new Map();
  private _executions: Map<string, ExecutionRecord>      = new Map();
  public  resolved: ResolveApprovalRequestInput[]        = [];

  addApproval(r: ApprovalRequestRecord):  void { this._approvals.set(r.id, r); }
  addExecution(r: ExecutionRecord):       void { this._executions.set(r.executionId, r); }

  async createExecution(input: ExecutionStoreCreateInput): Promise<ExecutionRecord> {
    return noopExecutionStore.createExecution(input);
  }
  async updateExecution(_id: string, _t: string, _i: ExecutionStoreUpdateInput): Promise<void> {}
  async recordStep(input: ExecutionStoreStepInput): Promise<ExecutionStepRecord> {
    return noopExecutionStore.recordStep(input);
  }
  async recordEvent(_input: ExecutionStoreEventInput): Promise<void> {}
  async createApprovalRequest(input: ApprovalRequestCreateInput): Promise<ApprovalRequestRecord> {
    return noopExecutionStore.createApprovalRequest(input);
  }
  async updateApprovalRequest(_id: string, _input: ApprovalRequestUpdateInput): Promise<void> {}
  async getExecutionById(_execId: string, _tenantId: string): Promise<ExecutionRecord | null> {
    return null;
  }
  async listExecutions(_query: ExecutionStoreQuery): Promise<ExecutionRecord[]> { return []; }
  async getPendingApprovals(tenantId: string): Promise<ApprovalRequestRecord[]> {
    return [...this._approvals.values()].filter(a => a.tenantId === tenantId && a.approvalStatus === "pending");
  }
  async checkIdempotency(_t: string, _k: string): Promise<IdempotencyCheckResult> {
    return { outcome: "proceed" };
  }
  async getApprovalRequestById(tenantId: string, approvalId: string): Promise<ApprovalRequestRecord | null> {
    const r = this._approvals.get(approvalId);
    if (!r || r.tenantId !== tenantId) return null;
    return r;
  }
  async resolveApprovalRequest(input: ResolveApprovalRequestInput): Promise<void> {
    this.resolved.push(input);
    const r = this._approvals.get(input.approvalId);
    if (r) {
      this._approvals.set(input.approvalId, {
        ...r,
        approvalStatus: input.nextStatus,
        resolvedBy:     input.resolvedBy,
        resolvedAt:     input.resolvedAt,
        resolutionNote: input.resolutionNote,
        updatedAt:      input.resolvedAt,
      });
    }
  }
  async getExecutionSteps(_tenantId: string, _executionId: string): Promise<ExecutionStepRecord[]> {
    return [];
  }
  async getExecutionEvents(_tenantId: string, _executionId: string): Promise<ExecutionEventRecord[]> {
    return [];
  }
  async getExecutionSnapshot(tenantId: string, executionId: string): Promise<ExecutionRecord | null> {
    const r = this._executions.get(executionId);
    if (!r || r.tenantId !== tenantId) return null;
    return r;
  }
}

// ── Runner ────────────────────────────────────────────────────────────────────

function pass(check: string, detail?: string): ApprovalWorkflowSmokeCheck {
  return { check, passed: true, detail };
}

function fail(check: string, detail?: string): ApprovalWorkflowSmokeCheck {
  return { check, passed: false, detail };
}

async function runCheck(
  check: string,
  fn: () => Promise<ApprovalWorkflowSmokeCheck>,
): Promise<ApprovalWorkflowSmokeCheck> {
  try {
    return await fn();
  } catch (err) {
    return fail(check, `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Smoke checks ──────────────────────────────────────────────────────────────

export async function runApprovalWorkflowSmokeCheck(): Promise<ApprovalWorkflowValidateResult> {
  const svc     = createApprovalWorkflowService(noopExecutionStore);
  const tenant  = "tenant-smoke";
  const checks: ApprovalWorkflowSmokeCheck[] = [];

  // ── Check 1: getPendingApprovals — noop returns empty ──────────────────────
  checks.push(await runCheck("getPendingApprovals returns empty list", async () => {
    const list = await svc.getPendingApprovals(tenant);
    if (!Array.isArray(list)) return fail("getPendingApprovals returns empty list", "Result is not an array");
    if (list.length !== 0)    return fail("getPendingApprovals returns empty list", `Expected 0, got ${list.length}`);
    return pass("getPendingApprovals returns empty list");
  }));

  // ── Check 2: getApprovalDetail — returns null from noop ───────────────────
  checks.push(await runCheck("getApprovalDetail returns null for unknown id", async () => {
    const r = await svc.getApprovalDetail(tenant, "approval-unknown");
    if (r !== null) return fail("getApprovalDetail returns null for unknown id", "Expected null");
    return pass("getApprovalDetail returns null for unknown id");
  }));

  // ── Check 3: approveApprovalRequest — graceful failure when missing ────────
  checks.push(await runCheck("approveApprovalRequest fails gracefully when record missing", async () => {
    const r = await svc.approveApprovalRequest({ approvalId: "x", tenantId: tenant, resolvedBy: "admin" });
    if (r.ok)                             return fail("approveApprovalRequest fails gracefully when record missing", "Expected ok=false");
    if (r.errorCode !== "APPROVAL_NOT_FOUND") return fail("approveApprovalRequest fails gracefully when record missing", `Got ${r.errorCode}`);
    return pass("approveApprovalRequest fails gracefully when record missing");
  }));

  // ── Check 4: rejectApprovalRequest — graceful failure when missing ─────────
  checks.push(await runCheck("rejectApprovalRequest fails gracefully when record missing", async () => {
    const r = await svc.rejectApprovalRequest({ approvalId: "x", tenantId: tenant, resolvedBy: "admin" });
    if (r.ok)                                 return fail("rejectApprovalRequest fails gracefully when record missing", "Expected ok=false");
    if (r.errorCode !== "APPROVAL_NOT_FOUND") return fail("rejectApprovalRequest fails gracefully when record missing", `Got ${r.errorCode}`);
    return pass("rejectApprovalRequest fails gracefully when record missing");
  }));

  // ── Check 5: cancelApprovalRequest — graceful failure when missing ─────────
  checks.push(await runCheck("cancelApprovalRequest fails gracefully when record missing", async () => {
    const r = await svc.cancelApprovalRequest({ approvalId: "x", tenantId: tenant, resolvedBy: "admin" });
    if (r.ok)                                 return fail("cancelApprovalRequest fails gracefully when record missing", "Expected ok=false");
    if (r.errorCode !== "APPROVAL_NOT_FOUND") return fail("cancelApprovalRequest fails gracefully when record missing", `Got ${r.errorCode}`);
    return pass("cancelApprovalRequest fails gracefully when record missing");
  }));

  // ── Check 6: expireApprovalRequest — graceful failure when missing ─────────
  checks.push(await runCheck("expireApprovalRequest fails gracefully when record missing", async () => {
    const r = await svc.expireApprovalRequest({ approvalId: "x", tenantId: tenant, resolvedBy: "system" });
    if (r.ok)                                 return fail("expireApprovalRequest fails gracefully when record missing", "Expected ok=false");
    if (r.errorCode !== "APPROVAL_NOT_FOUND") return fail("expireApprovalRequest fails gracefully when record missing", `Got ${r.errorCode}`);
    return pass("expireApprovalRequest fails gracefully when record missing");
  }));

  // ── Check 7: INVALID_INPUT — missing approvalId ────────────────────────────
  checks.push(await runCheck("_resolve fails with INVALID_INPUT for missing approvalId", async () => {
    const r = await svc.approveApprovalRequest({ approvalId: "", tenantId: tenant, resolvedBy: "admin" });
    if (r.ok)                           return fail("_resolve fails with INVALID_INPUT for missing approvalId", "Expected ok=false");
    if (r.errorCode !== "INVALID_INPUT") return fail("_resolve fails with INVALID_INPUT for missing approvalId", `Got ${r.errorCode}`);
    return pass("_resolve fails with INVALID_INPUT for missing approvalId");
  }));

  // ── Check 8: INVALID_INPUT — missing tenantId ─────────────────────────────
  checks.push(await runCheck("_resolve fails with INVALID_INPUT for missing tenantId", async () => {
    const r = await svc.approveApprovalRequest({ approvalId: "x", tenantId: "", resolvedBy: "admin" });
    if (r.ok)                            return fail("_resolve fails with INVALID_INPUT for missing tenantId", "Expected ok=false");
    if (r.errorCode !== "INVALID_INPUT") return fail("_resolve fails with INVALID_INPUT for missing tenantId", `Got ${r.errorCode}`);
    return pass("_resolve fails with INVALID_INPUT for missing tenantId");
  }));

  // ── Check 9: INVALID_INPUT — missing resolvedBy ───────────────────────────
  checks.push(await runCheck("_resolve fails with INVALID_INPUT for missing resolvedBy", async () => {
    const r = await svc.approveApprovalRequest({ approvalId: "x", tenantId: tenant, resolvedBy: "" });
    if (r.ok)                            return fail("_resolve fails with INVALID_INPUT for missing resolvedBy", "Expected ok=false");
    if (r.errorCode !== "INVALID_INPUT") return fail("_resolve fails with INVALID_INPUT for missing resolvedBy", `Got ${r.errorCode}`);
    return pass("_resolve fails with INVALID_INPUT for missing resolvedBy");
  }));

  // ── Check 10: buildResumePlan — canResume=false when approval not found ────
  checks.push(await runCheck("buildResumePlan canResume=false when approval not found", async () => {
    const r = await svc.buildResumePlan({ tenantId: tenant, approvalId: "missing", requestedBy: "admin" });
    if (r.canResume) return fail("buildResumePlan canResume=false when approval not found", "Expected canResume=false");
    return pass("buildResumePlan canResume=false when approval not found", r.reason);
  }));

  // ── Check 11: buildResumePlan — canResume=false when approval not approved ─
  checks.push(await runCheck("buildResumePlan canResume=false when approval not approved", async () => {
    const mock = new MockExecutionStore();
    const record = makeTestRecord(); // status = "pending", not "approved"
    mock.addApproval(record);
    const mockSvc = createApprovalWorkflowService(mock);
    const r = await mockSvc.buildResumePlan({ tenantId: record.tenantId, approvalId: record.id, requestedBy: "admin" });
    if (r.canResume) return fail("buildResumePlan canResume=false when approval not approved", "Expected canResume=false");
    return pass("buildResumePlan canResume=false when approval not approved", r.reason);
  }));

  // ── Check 12: resumeExecutionFromApproval — not_implemented_yet stub ───────
  checks.push(await runCheck("resumeExecutionFromApproval returns not_implemented_yet", async () => {
    const stubPlan = { canResume: false, reason: "stub", executionId: "", correlationId: "", tenantId: tenant, approvedApprovalId: "any", resumeFromStepId: "", stepsToRun: [], completedStepIds: [], blockedStepIds: [], skippedStepIds: [], warnings: [] };
    const r = await svc.resumeExecutionFromApproval({ tenantId: tenant, approvalId: "any", resumePlan: stubPlan, resumedBy: "admin" });
    if (r.status !== "not_implemented_yet") return fail("resumeExecutionFromApproval returns not_implemented_yet", `Got ${r.status}`);
    return pass("resumeExecutionFromApproval returns not_implemented_yet");
  }));

  // ── Check 13 (happy path): approveApprovalRequest succeeds ────────────────
  checks.push(await runCheck("approveApprovalRequest succeeds with mock pending approval", async () => {
    const mock   = new MockExecutionStore();
    const record = makeTestRecord();
    mock.addApproval(record);
    const mockSvc = createApprovalWorkflowService(mock);
    const r = await mockSvc.approveApprovalRequest({
      approvalId:     record.id,
      tenantId:       record.tenantId,
      resolvedBy:     "admin@acme.com",
      resolutionNote: "Looks good",
    });
    if (!r.ok)                             return fail("approveApprovalRequest succeeds with mock pending approval", `error: ${r.error}`);
    if (!r.resolution)                     return fail("approveApprovalRequest succeeds with mock pending approval", "No resolution");
    if (r.resolution.nextStatus !== "approved") return fail("approveApprovalRequest succeeds with mock pending approval", `nextStatus=${r.resolution.nextStatus}`);
    if (mock.resolved.length !== 1)        return fail("approveApprovalRequest succeeds with mock pending approval", "resolveApprovalRequest not called");
    return pass("approveApprovalRequest succeeds with mock pending approval");
  }));

  // ── Check 14 (happy path): rejectApprovalRequest succeeds ────────────────
  checks.push(await runCheck("rejectApprovalRequest succeeds with mock pending approval", async () => {
    const mock   = new MockExecutionStore();
    const record = makeTestRecord();
    mock.addApproval(record);
    const mockSvc = createApprovalWorkflowService(mock);
    const r = await mockSvc.rejectApprovalRequest({
      approvalId: record.id,
      tenantId:   record.tenantId,
      resolvedBy: "admin@acme.com",
    });
    if (!r.ok)                              return fail("rejectApprovalRequest succeeds with mock pending approval", `error: ${r.error}`);
    if (r.resolution?.nextStatus !== "rejected") return fail("rejectApprovalRequest succeeds with mock pending approval", `nextStatus=${r.resolution?.nextStatus}`);
    return pass("rejectApprovalRequest succeeds with mock pending approval");
  }));

  // ── Check 15 (happy path): buildResumePlan returns canResume=true ─────────
  checks.push(await runCheck("buildResumePlan returns canResume=true with approved approval + planSnapshot", async () => {
    const mock   = new MockExecutionStore();
    const record = makeTestRecord();
    // Transition to approved manually for the fixture
    const approvedRecord: ApprovalRequestRecord = {
      ...record,
      approvalStatus: "approved",
      resolvedBy:     "admin@acme.com",
      resolvedAt:     new Date(),
    };
    mock.addApproval(approvedRecord);
    mock.addExecution(makeTestExecution(approvedRecord));
    const mockSvc = createApprovalWorkflowService(mock);
    const r = await mockSvc.buildResumePlan({
      tenantId:    record.tenantId,
      approvalId:  record.id,
      requestedBy: "admin@acme.com",
    });
    if (!r.canResume)          return fail("buildResumePlan returns canResume=true with approved approval + planSnapshot", `canResume=false: ${r.reason}`);
    if (r.stepsToRun.length === 0) return fail("buildResumePlan returns canResume=true with approved approval + planSnapshot", "No stepsToRun");
    if (r.resumeFromStepId !== "step-001") return fail("buildResumePlan returns canResume=true with approved approval + planSnapshot", `resumeFrom=${r.resumeFromStepId}`);
    return pass("buildResumePlan returns canResume=true with approved approval + planSnapshot", `stepsToRun: ${r.stepsToRun.length}`);
  }));

  // ── Totals ────────────────────────────────────────────────────────────────

  const passed = checks.filter(c => c.passed).length;
  const failed = checks.filter(c => !c.passed).length;

  return {
    passed,
    failed,
    total: checks.length,
    checks,
    ok: failed === 0,
  };
}
