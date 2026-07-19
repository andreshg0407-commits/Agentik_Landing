/**
 * app/api/internal/integration-tests/workflow-hardening/route.ts
 *
 * Agentik — Workflow Hardening Integration Harness
 * Sprint: AGENTIK-WORKFLOW-HARDENING-01 — Phase 18
 *
 * SERVER-ONLY integration harness for workflow hardening.
 * Tests idempotency, concurrency locks, deduplication guards, and recovery.
 *
 * Protected: NODE_ENV !== production, ENABLE_INTERNAL_INTEGRATION_TESTS=true,
 *            x-agentik-integration-token header.
 *
 * POST /api/internal/integration-tests/workflow-hardening
 */
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { randomUUID }                from "crypto";
import { prisma }                    from "@/lib/prisma";
import {
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
} from "@/lib/work/chaining/workflow-chain-hardening";
import {
  buildWorkflowRunIdempotencyKey,
  buildWorkflowContinuationIdempotencyKey,
} from "@/lib/work/chaining/workflow-chain-idempotency";
import type { WorkflowChainRun }            from "@/lib/work/chaining/workflow-chain-types";
import { workflowChainService }             from "@/lib/work/chaining/workflow-chain-service";
import { findApprovalByWorkflowStep }       from "@/lib/approvals/persistence/approval-prisma-repository";
import { workExecutionRepository }          from "@/lib/work/live/persistence/work-execution-repository";

// ── Auth guard ─────────────────────────────────────────────────────────────────

const INTEGRATION_TOKEN = process.env.AGENTIK_INTEGRATION_TEST_TOKEN ?? "agentik-dev-test-token";

function guardRequest(req: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }
  if (process.env.ENABLE_INTERNAL_INTEGRATION_TESTS !== "true") {
    return NextResponse.json({ error: "Integration tests disabled" }, { status: 403 });
  }
  const token = req.headers.get("x-agentik-integration-token");
  if (token !== INTEGRATION_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeRun(overrides: Partial<WorkflowChainRun> = {}): WorkflowChainRun {
  const now = new Date().toISOString();
  return {
    id:                 `run_test_${randomUUID()}`,
    chainId:            "TEST_CHAIN",
    chainName:          "Test Chain",
    orgSlug:            "castillitos",
    status:             "RUNNING",
    triggerExecutionId: `exec_${randomUUID()}`,
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

// ── Test runner ────────────────────────────────────────────────────────────────

interface TestResult {
  name:    string;
  passed:  boolean;
  message: string;
}

function runTest(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true, message: "ok" };
  } catch (err: unknown) {
    return { name, passed: false, message: err instanceof Error ? err.message : String(err) };
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

// ── Tests ──────────────────────────────────────────────────────────────────────

async function runAllTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: Processing lock — acquire + release cycle
  results.push(runTest("Processing lock acquire → release cycle", () => {
    const run      = makeRun();
    const locked   = acquireLock(run, "exec_001");
    const released = releaseLock(locked, "exec_001");
    assert(isAlreadyProcessed(released, "exec_001"),    "should be processed after release");
    assert(!isCurrentlyProcessing(released, "exec_001"), "should not be processing after release");
  }));

  // Test 2: Concurrent duplicate blocked by isCurrentlyProcessing
  results.push(runTest("Concurrent duplicate blocked by isCurrentlyProcessing", () => {
    const run    = makeRun();
    const locked = acquireLock(run, "exec_concurrent");
    assert(isCurrentlyProcessing(locked, "exec_concurrent"), "concurrent call blocked");
    // abort (simulates worker crash)
    const aborted = abortLock(locked, "exec_concurrent");
    assert(!isCurrentlyProcessing(aborted, "exec_concurrent"), "aborted — no longer processing");
    assert(!isAlreadyProcessed(aborted, "exec_concurrent"),    "aborted — not in processed set");
  }));

  // Test 3: Safety limits — approval count ceiling
  results.push(runTest("Safety limit: approval count ceiling at MAX_APPROVALS", () => {
    let run = makeRun();
    for (let i = 0; i < SAFETY_LIMITS.MAX_APPROVALS; i++) run = incrementApprovalCount(run);
    assert(hasExceededApprovalLimit(run), `exceeded after ${SAFETY_LIMITS.MAX_APPROVALS} approvals`);
  }));

  // Test 4: Safety limits — dispatch count ceiling
  results.push(runTest("Safety limit: dispatch count ceiling at MAX_AUTO_DISPATCHES", () => {
    let run = makeRun();
    for (let i = 0; i < SAFETY_LIMITS.MAX_AUTO_DISPATCHES; i++) run = incrementDispatchCount(run);
    assert(hasExceededDispatchLimit(run), `exceeded after ${SAFETY_LIMITS.MAX_AUTO_DISPATCHES} dispatches`);
  }));

  // Test 5: buildWorkflowRunIdempotencyKey determinism
  results.push(runTest("buildWorkflowRunIdempotencyKey is deterministic and well-formed", () => {
    const k1 = buildWorkflowRunIdempotencyKey("castillitos", "CHAIN_FINANCE", "exec_001");
    const k2 = buildWorkflowRunIdempotencyKey("castillitos", "CHAIN_FINANCE", "exec_001");
    assertEqual(k1, k2, "determinism");
    assert(k1.startsWith("workflow_run:"), `prefix — got ${k1}`);
    assert(k1.includes("castillitos"),     "contains orgSlug");
  }));

  // Test 6: buildWorkflowContinuationIdempotencyKey
  results.push(runTest("buildWorkflowContinuationIdempotencyKey is well-formed", () => {
    const key = buildWorkflowContinuationIdempotencyKey("castillitos", "run_001", "exec_001");
    assert(key.startsWith("workflow_continuation:"), `prefix — got ${key}`);
    const k2  = buildWorkflowContinuationIdempotencyKey("castillitos", "run_001", "exec_002");
    assert(key !== k2, "different executionId → different key");
  }));

  // Test 7: Stuck run detection
  results.push(runTest("isRunStuck detects stale RUNNING run", () => {
    const oldDate = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const run     = makeRun({ status: "RUNNING", updatedAt: oldDate });
    const { stuck, recommendedAction } = isRunStuck(run);
    assert(stuck, "should be stuck");
    assertEqual(recommendedAction, "retry_current_step", "recommendedAction");
  }));

  // Test 8: buildFailureAuditEvent — dead-letter event shape
  results.push(runTest("buildFailureAuditEvent produces valid dead-letter event", () => {
    const err   = new Error("Prisma timeout");
    const event = buildFailureAuditEvent("run_live_001", "exec_live_001", err);
    assert(typeof event.id === "string" && event.id.length > 0, "event.id present");
    assertEqual(event.event, "chain_continuation_failed", "event.event");
    assert(event.message.includes("Prisma timeout"),         "error message included");
  }));

  // Test 9: DB — WorkflowRun idempotencyKey constraint enforced live
  {
    const orgId          = await getOrgId("castillitos");
    const idemKey        = `wh_test_${randomUUID()}`;
    const runId1         = `wh_run_${randomUUID()}`;
    const triggerExecId  = `exec_wh_${randomUUID()}`;

    const baseData = {
      id:                 runId1,
      idempotencyKey:     idemKey,
      organizationId:     orgId,
      chainId:            "TEST_CHAIN",
      chainName:          "Hardening Test",
      status:             "PENDING",
      triggerExecutionId: triggerExecId,
      triggerApprovalId:  null,
      currentStepId:      null,
      stepsJson:          [] as object,
      auditTrailJson:     [] as object,
      metadataJson:       {} as object,
      createdAt:          new Date(),
    };

    let createdId: string | null = null;

    results.push(await (async (): Promise<TestResult> => {
      try {
        const row = await (prisma as any).workflowRun.create({ data: baseData });
        createdId = row.id;
        return { name: "DB: createRunIdempotent first call succeeds", passed: true, message: `runId=${createdId?.slice(0, 12)}...` };
      } catch (err: unknown) {
        return { name: "DB: createRunIdempotent first call succeeds", passed: false, message: err instanceof Error ? err.message : String(err) };
      }
    })());

    results.push(await (async (): Promise<TestResult> => {
      try {
        await (prisma as any).workflowRun.create({
          data: { ...baseData, id: `wh_run_dup_${randomUUID()}` },
        });
        return { name: "DB: duplicate idempotencyKey throws P2002", passed: false, message: "no error thrown" };
      } catch (err: unknown) {
        const code = (err as any)?.code;
        return {
          name:    "DB: duplicate idempotencyKey throws P2002",
          passed:  code === "P2002",
          message: code === "P2002" ? "P2002 enforced" : `got code=${code}`,
        };
      }
    })());

    // Cleanup
    if (createdId) {
      await (prisma as any).workflowRun.deleteMany({ where: { id: createdId } }).catch(() => null);
    }
  }

  // ── Test 11: recoverStuckRuns — live DB test ──────────────────────────────
  {
    const orgId       = await getOrgId("castillitos");
    const stuckRunId  = `wh_stuck_${randomUUID()}`;
    let   cleanupId:  string | null = null;

    // Create WorkflowRun with status RUNNING
    try {
      await (prisma as any).workflowRun.create({
        data: {
          id:                 stuckRunId,
          organizationId:     orgId,
          chainId:            "TEST_STUCK_CHAIN",
          chainName:          "Test Stuck Run",
          status:             "RUNNING",
          triggerExecutionId: `exec_stuck_${randomUUID()}`,
          triggerApprovalId:  null,
          currentStepId:      "step_1",
          stepsJson:          [] as object,
          auditTrailJson:     [] as object,
          metadataJson:       {} as object,
          createdAt:          new Date(),
        },
      });
      cleanupId = stuckRunId;

      // Backdate updatedAt to 20 minutes ago so listStuckRuns picks it up
      await prisma.$executeRaw`
        UPDATE "WorkflowRun"
        SET    "updatedAt" = NOW() - INTERVAL '20 minutes'
        WHERE  id = ${stuckRunId}
      `;
    } catch (err: unknown) {
      results.push({
        name:    "recoverStuckRuns: setup — create stale RUNNING run",
        passed:  false,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    if (cleanupId) {
      // Call recoverStuckRuns
      results.push(await (async (): Promise<TestResult> => {
        try {
          const reports = await workflowChainService.recoverStuckRuns("castillitos");
          const found   = reports.find(r => r.runId === stuckRunId);
          if (!found) {
            return { name: "recoverStuckRuns: stale run appears in report", passed: false, message: "run not found in report" };
          }
          return { name: "recoverStuckRuns: stale run appears in report", passed: true, message: `staleSinceMin=${Math.round(found.staleSinceMs / 60_000)}, action=${found.recommendedAction}` };
        } catch (err: unknown) {
          return { name: "recoverStuckRuns: stale run appears in report", passed: false, message: err instanceof Error ? err.message : String(err) };
        }
      })());

      // Assert READ-ONLY: run status must still be RUNNING
      results.push(await (async (): Promise<TestResult> => {
        try {
          const row = await (prisma as any).workflowRun.findUnique({
            where:  { id: stuckRunId },
            select: { status: true },
          });
          if (row?.status !== "RUNNING") {
            return { name: "recoverStuckRuns: run not mutated (status unchanged)", passed: false, message: `status changed to ${row?.status}` };
          }
          return { name: "recoverStuckRuns: run not mutated (status unchanged)", passed: true, message: "status=RUNNING confirmed" };
        } catch (err: unknown) {
          return { name: "recoverStuckRuns: run not mutated (status unchanged)", passed: false, message: err instanceof Error ? err.message : String(err) };
        }
      })());

      // Cleanup
      await (prisma as any).workflowRun.deleteMany({ where: { id: stuckRunId } }).catch(() => null);
    }
  }

  // ── Test 12: Approval dedup guard — findApprovalByWorkflowStep ───────────
  {
    const orgId       = await getOrgId("castillitos");
    const deupRunId   = `wh_dedup_run_${randomUUID()}`;
    const deupStepId  = `step_dedup_${randomUUID().slice(0, 8)}`;
    const deupApprId  = `wh_dedup_appr_${randomUUID()}`;
    let   createdApprId: string | null = null;

    // Create minimal Approval record with workflow step metadata
    try {
      await (prisma as any).approval.create({
        data: {
          id:               deupApprId,
          organizationId:   orgId,
          title:            "Test Dedup Approval",
          status:           "PENDING",
          priority:         "HIGH",
          category:         "OPERATIONS",
          source:           "SYSTEM",
          requestorType:    "SYSTEM",
          approverType:     "USER",
          entityType:       "workflow_step",
          entityId:         deupStepId,
          businessContextJson: {
            metadata: {
              workflowRunId: deupRunId,
              stepId:        deupStepId,
              chainId:       "TEST_CHAIN",
            },
          } as object,
        },
      });
      createdApprId = deupApprId;
    } catch (err: unknown) {
      results.push({
        name:    "Approval dedup guard: setup — create test approval",
        passed:  false,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    if (createdApprId) {
      // First call — should find the existing approval
      results.push(await (async (): Promise<TestResult> => {
        try {
          const found = await findApprovalByWorkflowStep(deupRunId, deupStepId);
          if (!found) {
            return { name: "Approval dedup guard: first call finds existing approval", passed: false, message: "returned null" };
          }
          return { name: "Approval dedup guard: first call finds existing approval", passed: true, message: `approvalId=${found.id.slice(0, 12)}...` };
        } catch (err: unknown) {
          return { name: "Approval dedup guard: first call finds existing approval", passed: false, message: err instanceof Error ? err.message : String(err) };
        }
      })());

      // Second call — must return same approval (dedup guard is idempotent)
      results.push(await (async (): Promise<TestResult> => {
        try {
          const first  = await findApprovalByWorkflowStep(deupRunId, deupStepId);
          const second = await findApprovalByWorkflowStep(deupRunId, deupStepId);
          if (!first || !second) {
            return { name: "Approval dedup guard: second call returns same approval (idempotent)", passed: false, message: "null returned" };
          }
          if (first.id !== second.id) {
            return { name: "Approval dedup guard: second call returns same approval (idempotent)", passed: false, message: `id mismatch: ${first.id} vs ${second.id}` };
          }
          return { name: "Approval dedup guard: second call returns same approval (idempotent)", passed: true, message: "same approvalId on both calls" };
        } catch (err: unknown) {
          return { name: "Approval dedup guard: second call returns same approval (idempotent)", passed: false, message: err instanceof Error ? err.message : String(err) };
        }
      })());

      // Cleanup
      await (prisma as any).approval.deleteMany({ where: { id: deupApprId } }).catch(() => null);
    }
  }

  // ── Test 13: Execution dedup guard — findByWorkflowStep ──────────────────
  {
    const orgId        = await getOrgId("castillitos");
    const dedupExecRunId  = `wh_dedup_wfrun_${randomUUID()}`;
    const dedupExecStepId = `step_exec_dedup_${randomUUID().slice(0, 8)}`;
    const dedupExecId     = `wh_dedup_exec_${randomUUID()}`;
    let   createdExecId: string | null = null;

    // Create WorkExecution with payload metadata identifying workflowRunId + stepId
    try {
      await (prisma as any).workExecution.create({
        data: {
          id:             dedupExecId,
          organizationId: orgId,
          approvalId:     `fake_approval_${randomUUID()}`,
          executorType:   "TASK_ASSIGNMENT",
          trigger:        "APPROVAL_APPROVED",
          status:         "PENDING",
          payloadJson:    {
            metadata: {
              workflowRunId:       dedupExecRunId,
              chainId:             "TEST_CHAIN",
              stepId:              dedupExecStepId,
              isChainStep:         true,
              previousExecutionId: "exec_prev_test",
            },
          } as object,
        },
      });
      createdExecId = dedupExecId;
    } catch (err: unknown) {
      results.push({
        name:    "Execution dedup guard: setup — create test WorkExecution",
        passed:  false,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    if (createdExecId) {
      // First call — should find the existing execution
      results.push(await (async (): Promise<TestResult> => {
        try {
          const found = await workExecutionRepository.findByWorkflowStep(dedupExecRunId, dedupExecStepId);
          if (!found) {
            return { name: "Execution dedup guard: first call finds existing execution", passed: false, message: "returned null" };
          }
          return { name: "Execution dedup guard: first call finds existing execution", passed: true, message: `executionId=${found.id.slice(0, 12)}...` };
        } catch (err: unknown) {
          return { name: "Execution dedup guard: first call finds existing execution", passed: false, message: err instanceof Error ? err.message : String(err) };
        }
      })());

      // Second call — must return same execution (dedup guard is idempotent)
      results.push(await (async (): Promise<TestResult> => {
        try {
          const first  = await workExecutionRepository.findByWorkflowStep(dedupExecRunId, dedupExecStepId);
          const second = await workExecutionRepository.findByWorkflowStep(dedupExecRunId, dedupExecStepId);
          if (!first || !second) {
            return { name: "Execution dedup guard: second call returns same execution (idempotent)", passed: false, message: "null returned" };
          }
          if (first.id !== second.id) {
            return { name: "Execution dedup guard: second call returns same execution (idempotent)", passed: false, message: `id mismatch` };
          }
          return { name: "Execution dedup guard: second call returns same execution (idempotent)", passed: true, message: "same executionId on both calls" };
        } catch (err: unknown) {
          return { name: "Execution dedup guard: second call returns same execution (idempotent)", passed: false, message: err instanceof Error ? err.message : String(err) };
        }
      })());

      // Cleanup
      await (prisma as any).workExecution.deleteMany({ where: { id: dedupExecId } }).catch(() => null);
    }
  }

  return results;
}

async function getOrgId(slug: string): Promise<string> {
  const org = await (prisma as any).organization.findFirst({
    where:  { slug },
    select: { id: true },
  });
  if (!org) throw new Error(`Organization not found: ${slug}`);
  return org.id;
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = guardRequest(req);
  if (guard) return guard;

  try {
    const results = await runAllTests();

    const passed  = results.filter(r => r.passed).length;
    const failed  = results.filter(r => !r.passed).length;
    const allPass = failed === 0;

    return NextResponse.json({
      sprint:  "AGENTIK-WORKFLOW-HARDENING-CLOSEOUT-01",
      phase:   "CLOSEOUT Integration Harness (13 tests)",
      passed,
      failed,
      total:   results.length,
      success: allPass,
      results,
    }, { status: allPass ? 200 : 422 });

  } catch (err: unknown) {
    return NextResponse.json({
      error:   "Integration harness error",
      message: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
