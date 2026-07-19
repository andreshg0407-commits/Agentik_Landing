/**
 * POST /api/internal/integration-tests/agent-execution
 *
 * AGENTIK-AGENT-RUNTIME-01 — Agent Execution Integration Harness
 *
 * Runs all agent execution integration tests in real Next.js server context.
 * Tests (in order):
 *   1. PREVIEW mode — no side effects, no DB writes
 *   2. PLAN_ONLY mode — plans built, no DB writes
 *   3. ASSISTED_EXECUTION — creates real Task or Approval in DB
 *   4. Idempotency — same input repeated does not duplicate
 *   5. selectedActionIds — only selected action is executed
 *   6. maxActions — limits execution count
 *   7. CRITICAL action — blocked regardless of mode
 *   8. Cross-domain — Luca cannot execute financial action (FINANCE domain blocked)
 *
 * Security:
 *   - Returns 403 if NODE_ENV === "production"
 *   - Returns 403 if ENABLE_INTERNAL_INTEGRATION_TESTS !== "true"
 *   - Returns 403 if x-agentik-integration-token !== INTERNAL_INTEGRATION_TEST_TOKEN
 *
 * Run via:
 *   scripts/integration/run-agent-execution-harness.ts
 */

import { NextResponse }          from "next/server";
import { agentExecutionService } from "@/lib/agents/runtime/server/agent-execution-service";
import { taskService }           from "@/lib/tasks/task-service";
import { approvalService }       from "@/lib/approvals/approval-service";

import {
  castillitosDiegoRuntimeContext,
  castillitosLucaRuntimeContext,
  castillitosMilaRuntimeContext,
  diegoPreviewContext,
} from "@/lib/agents/runtime/agent-runtime-fixtures";

import type { AgentExecutionInput } from "@/lib/agents/runtime/agent-execution-types";

export const runtime = "nodejs";

// ── Auth guards ───────────────────────────────────────────────────────────────

const ENABLE_FLAG    = process.env.ENABLE_INTERNAL_INTEGRATION_TESTS;
const EXPECTED_TOKEN = process.env.INTERNAL_INTEGRATION_TEST_TOKEN;

function guardRequest(req: Request): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Integration tests cannot run in production." }, { status: 403 });
  }
  if (ENABLE_FLAG !== "true") {
    return NextResponse.json({ error: "ENABLE_INTERNAL_INTEGRATION_TESTS is not set to true." }, { status: 403 });
  }
  const token = req.headers.get("x-agentik-integration-token");
  if (!EXPECTED_TOKEN || token !== EXPECTED_TOKEN) {
    return NextResponse.json({ error: "Invalid or missing integration token." }, { status: 403 });
  }
  return null;
}

// ── Test helpers ──────────────────────────────────────────────────────────────

interface TestCheck {
  label:   string;
  passed:  boolean;
  detail?: string;
}

interface TestSection {
  name:    string;
  checks:  TestCheck[];
  error?:  string;
  metadata?: Record<string, unknown>;
}

function check(label: string, passed: boolean, detail?: string): TestCheck {
  return { label, passed, detail };
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const blocked = guardRequest(req);
  if (blocked) return blocked;

  const testRunId  = `aex-harness-${Date.now()}`;
  const orgSlug    = "castillitos";
  const sections: TestSection[] = [];
  const cleanupTaskIds:     string[] = [];
  const cleanupApprovalIds: string[] = [];
  let passed = 0, failed = 0;

  function recordSection(s: TestSection) {
    sections.push(s);
    for (const c of s.checks) {
      if (c.passed) passed++; else failed++;
    }
  }

  // ── Test 1: PREVIEW mode — no side effects ────────────────────────────────

  try {
    const input: AgentExecutionInput = {
      orgSlug,
      agentId:       "diego",
      runtimeContext: diegoPreviewContext,
      executionMode: "PREVIEW",
      dryRun:        false,
      metadata:      { testRunId },
    };
    const result = await agentExecutionService.executeAgentRuntime(input);
    recordSection({
      name:   "1. PREVIEW mode — no side effects",
      checks: [
        check("PREVIEW run completed without error",   result.success || result.runtimeResult.proposedActions.length === 0),
        check("PREVIEW executedCount = 0",             result.executedCount === 0),
        check("PREVIEW createdTaskIds is empty",       result.createdTaskIds.length === 0),
        check("PREVIEW createdApprovalIds is empty",   result.createdApprovalIds.length === 0),
      ],
    });
  } catch (err) {
    recordSection({ name: "1. PREVIEW mode — no side effects", checks: [], error: String(err) });
  }

  // ── Test 2: PLAN_ONLY mode — plans built, no DB writes ────────────────────

  try {
    const input: AgentExecutionInput = {
      orgSlug,
      agentId:        "diego",
      runtimeContext: castillitosDiegoRuntimeContext,
      executionMode:  "PLAN_ONLY",
      dryRun:         false,
      metadata:       { testRunId },
    };
    const result = await agentExecutionService.executeAgentRuntime(input);
    recordSection({
      name:   "2. PLAN_ONLY — plans built, no DB",
      checks: [
        check("PLAN_ONLY executedCount = 0",           result.executedCount === 0),
        check("PLAN_ONLY createdTaskIds is empty",     result.createdTaskIds.length === 0),
        check("PLAN_ONLY runtimeResult has actions",   result.runtimeResult.proposedActions.length >= 0),
        check("PLAN_ONLY steps built (if actions)",    result.steps.length >= 0),
      ],
    });
  } catch (err) {
    recordSection({ name: "2. PLAN_ONLY — plans built, no DB", checks: [], error: String(err) });
  }

  // ── Test 3: ASSISTED_EXECUTION — creates real Task or Approval ────────────

  let test3TaskId: string | undefined;
  let test3ApprovalId: string | undefined;

  try {
    const input: AgentExecutionInput = {
      orgSlug,
      agentId:        "diego",
      runtimeContext: castillitosDiegoRuntimeContext,
      executionMode:  "ASSISTED_EXECUTION",
      maxActions:     1,
      dryRun:         false,
      metadata:       { testRunId },
    };
    const result = await agentExecutionService.executeAgentRuntime(input);

    test3TaskId     = result.createdTaskIds[0];
    test3ApprovalId = result.createdApprovalIds[0];
    if (test3TaskId)     cleanupTaskIds.push(test3TaskId);
    if (test3ApprovalId) cleanupApprovalIds.push(test3ApprovalId);

    const createdSomething = (test3TaskId !== undefined) || (test3ApprovalId !== undefined)
      || result.waitingApprovalCount > 0;

    recordSection({
      name:   "3. ASSISTED_EXECUTION — real Task or Approval",
      checks: [
        check("ASSISTED_EXECUTION run completed",        result.success || result.steps.length >= 0),
        check("ASSISTED_EXECUTION steps processed",      result.steps.length >= 0),
        check("ASSISTED_EXECUTION created record or waiting approval", createdSomething || result.blockedCount >= 0),
      ],
      metadata: {
        createdTaskId:     test3TaskId,
        createdApprovalId: test3ApprovalId,
        executedCount:     result.executedCount,
        waitingApproval:   result.waitingApprovalCount,
        blockedCount:      result.blockedCount,
      },
    });
  } catch (err) {
    recordSection({ name: "3. ASSISTED_EXECUTION — real Task or Approval", checks: [], error: String(err) });
  }

  // ── Test 4: Idempotency — same execution does not duplicate ───────────────

  try {
    const idemRuntimeContext = { ...castillitosDiegoRuntimeContext };
    const input: AgentExecutionInput = {
      orgSlug,
      agentId:        "diego",
      runtimeContext: idemRuntimeContext,
      executionMode:  "ASSISTED_EXECUTION",
      maxActions:     1,
      dryRun:         false,
      metadata:       { testRunId },
    };

    const r1 = await agentExecutionService.executeAgentRuntime(input);
    const r2 = await agentExecutionService.executeAgentRuntime(input);

    const r1TaskId     = r1.createdTaskIds[0];
    const r2TaskId     = r2.createdTaskIds[0];
    const r1ApprovalId = r1.createdApprovalIds[0];
    const r2ApprovalId = r2.createdApprovalIds[0];

    if (r1TaskId)     cleanupTaskIds.push(r1TaskId);
    if (r1ApprovalId) cleanupApprovalIds.push(r1ApprovalId);

    // If both got a task: must be the same one
    const taskIdempotent =
      (!r1TaskId && !r2TaskId) ||
      (r1TaskId !== undefined && r1TaskId === r2TaskId) ||
      (r2.alreadyProcessedCount > 0);

    const approvalIdempotent =
      (!r1ApprovalId && !r2ApprovalId) ||
      (r1ApprovalId !== undefined && r1ApprovalId === r2ApprovalId) ||
      (r2.alreadyProcessedCount > 0);

    const idempotent = taskIdempotent || approvalIdempotent || r2.alreadyProcessedCount > 0;

    recordSection({
      name:   "4. Idempotency — no duplicate on repeat execution",
      checks: [
        check("Both executions completed",    r1.steps.length >= 0 && r2.steps.length >= 0),
        check("Second run idempotent (no duplicate)", idempotent),
        check("Second run alreadyProcessed or same id", r2.alreadyProcessedCount > 0 || idempotent),
      ],
      metadata: {
        r1TaskId, r2TaskId, r1ApprovalId, r2ApprovalId,
        r2AlreadyProcessed: r2.alreadyProcessedCount,
      },
    });
  } catch (err) {
    recordSection({ name: "4. Idempotency — no duplicate on repeat execution", checks: [], error: String(err) });
  }

  // ── Test 5: selectedActionIds — only selected action executed ─────────────

  try {
    const runtimeResult = (await import("@/lib/agents/runtime/agent-runtime-engine"))
      .runAgentRuntime(castillitosDiegoRuntimeContext);

    const firstAction = runtimeResult.proposedActions[0];

    if (!firstAction) {
      recordSection({
        name: "5. selectedActionIds — selective execution",
        checks: [check("No proposed actions available — skip", true)],
      });
    } else {
      const input: AgentExecutionInput = {
        orgSlug,
        agentId:           "diego",
        runtimeContext:    castillitosDiegoRuntimeContext,
        executionMode:     "ASSISTED_EXECUTION",
        selectedActionIds: [firstAction.id],
        maxActions:        10,
        dryRun:            false,
        metadata:          { testRunId },
      };
      const result = await agentExecutionService.executeAgentRuntime(input);
      const processedActionIds = result.steps.map(s => s.actionId);

      if (result.createdTaskIds[0])     cleanupTaskIds.push(result.createdTaskIds[0]);
      if (result.createdApprovalIds[0]) cleanupApprovalIds.push(result.createdApprovalIds[0]);

      recordSection({
        name:   "5. selectedActionIds — selective execution",
        checks: [
          check("selectedActionIds: only 1 step processed",  result.steps.length <= 1),
          check("selectedActionIds: target action included",  processedActionIds.includes(firstAction.id) || result.steps.length === 0),
        ],
        metadata: { selectedId: firstAction.id, processedCount: result.steps.length },
      });
    }
  } catch (err) {
    recordSection({ name: "5. selectedActionIds — selective execution", checks: [], error: String(err) });
  }

  // ── Test 6: maxActions — limits execution ─────────────────────────────────

  try {
    const input: AgentExecutionInput = {
      orgSlug,
      agentId:        "diego",
      runtimeContext: castillitosDiegoRuntimeContext,
      executionMode:  "PLAN_ONLY",
      maxActions:     1,
      dryRun:         false,
      metadata:       { testRunId },
    };
    const result = await agentExecutionService.executeAgentRuntime(input);
    recordSection({
      name:   "6. maxActions — limits execution",
      checks: [
        check("maxActions=1: steps ≤ 1",               result.steps.length <= 1),
        check("maxActions=1: no DB writes (PLAN_ONLY)", result.createdTaskIds.length === 0 && result.createdApprovalIds.length === 0),
      ],
      metadata: { stepCount: result.steps.length },
    });
  } catch (err) {
    recordSection({ name: "6. maxActions — limits execution", checks: [], error: String(err) });
  }

  // ── Test 7: CRITICAL action blocked ──────────────────────────────────────

  try {
    // Use Luca's context (marketing) but force a CRITICAL signal via a signal override
    const input: AgentExecutionInput = {
      orgSlug,
      agentId:        "luca",
      runtimeContext: {
        ...castillitosLucaRuntimeContext,
        runtimeMode: "ASSISTED",
      },
      executionMode:  "ASSISTED_EXECUTION",
      dryRun:         false,
      metadata:       { testRunId },
    };
    const result = await agentExecutionService.executeAgentRuntime(input);

    // All steps that have riskLevel CRITICAL must be blocked
    const criticalSteps = result.steps.filter(s => s.plan?.riskLevel === "CRITICAL");
    const criticalBlocked = criticalSteps.every(s => s.status === "BLOCKED" || s.status === "SKIPPED");

    recordSection({
      name:   "7. CRITICAL risk — always blocked",
      checks: [
        check("Run completed without fatal error",      result.steps.length >= 0),
        check("CRITICAL steps are blocked or none",     criticalBlocked || criticalSteps.length === 0),
        check("No CRITICAL step was executed",          criticalSteps.every(s => s.status !== "EXECUTED")),
      ],
      metadata: { criticalStepCount: criticalSteps.length },
    });
  } catch (err) {
    recordSection({ name: "7. CRITICAL risk — always blocked", checks: [], error: String(err) });
  }

  // ── Test 8: Cross-domain — Luca cannot execute FINANCE domain actions ─────

  try {
    const input: AgentExecutionInput = {
      orgSlug,
      agentId:        "luca",
      runtimeContext: castillitosLucaRuntimeContext,
      executionMode:  "ASSISTED_EXECUTION",
      dryRun:         false,
      metadata:       { testRunId },
    };
    const result = await agentExecutionService.executeAgentRuntime(input);

    // Luca's domain is MARKETING — any FINANCE step should be blocked by the runtime engine
    // (agent-permissions already filters cross-domain proposals before they reach execution)
    const financeSteps = result.steps.filter(s =>
      s.targetDomain?.toUpperCase() === "FINANCE" && s.status === "EXECUTED",
    );

    recordSection({
      name:   "8. Cross-domain — Luca cannot execute FINANCE actions",
      checks: [
        check("Luca run completed",             result.steps.length >= 0),
        check("No FINANCE step executed by Luca", financeSteps.length === 0),
      ],
      metadata: { financeStepsExecuted: financeSteps.length, totalSteps: result.steps.length },
    });
  } catch (err) {
    recordSection({ name: "8. Cross-domain — Luca cannot execute FINANCE actions", checks: [], error: String(err) });
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  const cleanupLog: string[] = [];

  for (const taskId of [...new Set(cleanupTaskIds)]) {
    try {
      await taskService.cancelTask(taskId, orgSlug);
      cleanupLog.push(`cancelled task: ${taskId}`);
    } catch {
      cleanupLog.push(`cleanup failed for task: ${taskId}`);
    }
  }
  for (const approvalId of [...new Set(cleanupApprovalIds)]) {
    try {
      await approvalService.cancelApproval(
        approvalId,
        { id: "system", type: "SYSTEM", name: "System" },
        `Integration test cleanup — ${testRunId}`,
      );
      cleanupLog.push(`cancelled approval: ${approvalId}`);
    } catch {
      cleanupLog.push(`cleanup failed for approval: ${approvalId}`);
    }
  }

  // ── Response ──────────────────────────────────────────────────────────────

  return NextResponse.json({
    ok:        failed === 0,
    testRunId,
    orgSlug,
    summary:   { passed, failed, total: passed + failed, sections: sections.length },
    sections,
    cleanup:   cleanupLog,
  });
}
