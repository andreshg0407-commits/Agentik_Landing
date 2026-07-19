/**
 * POST /api/internal/integration-tests/autonomous-operations
 *
 * AGENTIK-INTEGRATION-HARNESS-01 — Server-side integration test runner
 *
 * Executes the full Agentik autonomous operations chain in real Next.js
 * server context (Prisma, server-only, all services available).
 *
 * Tests (in order):
 *   1. CREATE_TASK_ONLY → real Task (DB read-back)
 *   2. CREATE_APPROVAL_ONLY → real Approval (DB read-back)
 *   3. CRITICAL guardrail → no side effects
 *   4. PREVIEW mode → no side effects
 *   5. NO_ACTION → completed, no side effects
 *   6. ESCALATE_TO_USER → structured response, no DB records
 *   7. Idempotency → duplicate input produces a second record (documents current behavior)
 *
 * Security:
 *   - Returns 403 if NODE_ENV === "production"
 *   - Returns 403 if ENABLE_INTERNAL_INTEGRATION_TESTS !== "true"
 *   - Returns 403 if x-agentik-integration-token !== INTERNAL_INTEGRATION_TEST_TOKEN
 *
 * Run via:
 *   scripts/integration/run-autonomous-operations-harness.ts
 */

import { NextResponse } from "next/server";
import { autonomousOperationService } from "@/lib/autonomous-operations/server/autonomous-operation-service";
import { taskService }     from "@/lib/tasks/task-service";
import { approvalService } from "@/lib/approvals/approval-service";
import type { AutonomousOperationInput } from "@/lib/autonomous-operations/autonomous-operation-types";

export const runtime = "nodejs";

// ── Auth guards ───────────────────────────────────────────────────────────────

const ENABLE_FLAG   = process.env.ENABLE_INTERNAL_INTEGRATION_TESTS;
const EXPECTED_TOKEN = process.env.INTERNAL_INTEGRATION_TEST_TOKEN;

function guardRequest(req: Request): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Integration tests cannot run in production." },
      { status: 403 },
    );
  }
  if (ENABLE_FLAG !== "true") {
    return NextResponse.json(
      { error: "ENABLE_INTERNAL_INTEGRATION_TESTS is not set to true." },
      { status: 403 },
    );
  }
  if (!EXPECTED_TOKEN) {
    return NextResponse.json(
      { error: "INTERNAL_INTEGRATION_TEST_TOKEN is not configured." },
      { status: 403 },
    );
  }
  const token = req.headers.get("x-agentik-integration-token");
  if (token !== EXPECTED_TOKEN) {
    return NextResponse.json(
      { error: "Invalid or missing x-agentik-integration-token." },
      { status: 403 },
    );
  }
  return null;
}

// ── Test harness ──────────────────────────────────────────────────────────────

interface TestCheck {
  label:  string;
  passed: boolean;
  detail?: string;
}

interface TestSection {
  name:   string;
  checks: TestCheck[];
  error?: string;
}

function check(
  checks: TestCheck[],
  condition: boolean,
  label: string,
  detail?: string,
): void {
  checks.push({ label, passed: condition, detail });
}

// ── Cleanup helpers ───────────────────────────────────────────────────────────

async function cancelTask(id: string, orgSlug: string): Promise<void> {
  try {
    await taskService.cancelTask(id, orgSlug);
  } catch {
    // best-effort
  }
}

async function cancelApproval(id: string): Promise<void> {
  try {
    const actor = {
      id:   "integration-harness-cleanup",
      type: "SYSTEM" as const,
      name: "Integration Harness Cleanup",
    };
    await approvalService.cancelApproval(id, actor, "Integration harness cleanup");
  } catch {
    // best-effort
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const guard = guardRequest(req);
  if (guard) return guard;

  const testRunId  = `harness_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const orgSlug    = "castillitos";
  const sections:    TestSection[]  = [];
  const cleanupTaskIds:     string[] = [];
  const cleanupApprovalIds: string[] = [];

  const meta = {
    integrationTest: true,
    testRunId,
    createdBy: "AGENTIK-INTEGRATION-HARNESS-01",
  };

  // ── Shared inputs ──────────────────────────────────────────────────────────

  const taskInput: AutonomousOperationInput = {
    orgSlug,
    agentId:     "diego",
    agentName:   "Diego",
    agentDomain: "FINANCE",
    runtimeMode: "SAFE_AUTOMATION",
    proposedAction: {
      id:                     `pa_harness_task_${testRunId}`,
      type:                   "CREATE_TASK_DRAFT",
      label:                  "[Integration Harness] Revisar cobros vencidos",
      description:            "Harness task: revisar cartera vencida.",
      targetDomain:           "FINANCE",
      targetModule:           "cobros",
      requiresApproval:       false,
      sourceRecommendationId: `rec_harness_task_${testRunId}`,
      confidence:             "VERY_HIGH",
      score:                  75,
      navigationTarget:       "/castillitos/finanzas/torre-control/cobros-hoy",
      payload: { signalId: `sig_harness_task_${testRunId}`, signalType: "overdue_receivable", ...meta },
      metadata: meta,
    },
    metadata: meta,
  };

  const approvalInput: AutonomousOperationInput = {
    orgSlug,
    agentId:     "diego",
    agentName:   "Diego",
    agentDomain: "FINANCE",
    runtimeMode: "APPROVAL_REQUIRED",
    proposedAction: {
      id:                     `pa_harness_approval_${testRunId}`,
      type:                   "CREATE_APPROVAL_DRAFT",
      label:                  "[Integration Harness] Aprobación conciliación",
      description:            "Harness approval: conciliación de cuenta test.",
      targetDomain:           "FINANCE",
      targetModule:           "conciliacion",
      requiresApproval:       true,
      sourceRecommendationId: `rec_harness_approval_${testRunId}`,
      confidence:             "HIGH",
      score:                  70,
      navigationTarget:       "/castillitos/finanzas/conciliacion",
      payload: { signalId: `sig_harness_approval_${testRunId}`, signalType: "reconciliation_exception", ...meta },
      metadata: meta,
    },
    metadata: meta,
  };

  const criticalInput: AutonomousOperationInput = {
    orgSlug,
    agentId:     "diego",
    agentName:   "Diego",
    agentDomain: "OPERATIONS",
    runtimeMode: "ASSISTED",
    proposedAction: {
      id:                     `pa_harness_critical_${testRunId}`,
      type:                   "START_WORKFLOW_DRAFT",
      label:                  "[Integration Harness] Workflow bloqueado",
      description:            "Harness: critical guardrail test.",
      targetDomain:           "OPERATIONS",
      targetModule:           "inventario",
      requiresApproval:       true,
      sourceRecommendationId: `rec_harness_critical_${testRunId}`,
      confidence:             "MEDIUM",
      score:                  60,
      payload: { signalId: `sig_harness_critical_${testRunId}`, signalType: "inventory_transfer", workflowId: "wf_test", ...meta },
      metadata: meta,
    },
    metadata: meta,
  };

  const previewInput: AutonomousOperationInput = {
    orgSlug,
    agentId:     "diego",
    agentName:   "Diego",
    agentDomain: "FINANCE",
    runtimeMode: "PREVIEW",
    proposedAction: {
      id:                     `pa_harness_preview_${testRunId}`,
      type:                   "CREATE_TASK_DRAFT",
      label:                  "[Integration Harness] Preview task",
      description:            "Harness: preview mode test.",
      targetDomain:           "FINANCE",
      targetModule:           "conciliacion",
      requiresApproval:       false,
      sourceRecommendationId: `rec_harness_preview_${testRunId}`,
      confidence:             "HIGH",
      score:                  65,
      payload: { signalId: `sig_harness_preview_${testRunId}`, ...meta },
      metadata: meta,
    },
    metadata: meta,
  };

  const noActionInput: AutonomousOperationInput = {
    orgSlug,
    agentId:     "system",
    agentName:   "System",
    agentDomain: "SYSTEM",
    runtimeMode: "PREVIEW",
    proposedAction: {
      id:                     `pa_harness_noop_${testRunId}`,
      type:                   "NO_ACTION",
      label:                  "[Integration Harness] Sin acción",
      description:            "Harness: no-op test.",
      targetDomain:           "SYSTEM",
      targetModule:           "sistema",
      requiresApproval:       false,
      sourceRecommendationId: `rec_harness_noop_${testRunId}`,
      confidence:             "HIGH",
      score:                  50,
      payload: { signalId: `sig_harness_noop_${testRunId}`, ...meta },
      metadata: meta,
    },
    metadata: meta,
  };

  const escalateInput: AutonomousOperationInput = {
    orgSlug,
    agentId:     "diego",
    agentName:   "Diego",
    agentDomain: "FINANCE",
    runtimeMode: "AUTONOMOUS_DISABLED",
    proposedAction: {
      id:                     `pa_harness_escalate_${testRunId}`,
      type:                   "ESCALATE_TO_USER",
      label:                  "[Integration Harness] Escalación",
      description:            "Harness: escalation test.",
      targetDomain:           "FINANCE",
      targetModule:           "conciliacion",
      requiresApproval:       false,
      sourceRecommendationId: `rec_harness_escalate_${testRunId}`,
      confidence:             "HIGH",
      score:                  60,
      payload: { signalId: `sig_harness_escalate_${testRunId}`, ...meta },
      metadata: meta,
    },
    metadata: meta,
  };

  // ── Test 1: CREATE_TASK_ONLY → real Task ───────────────────────────────────

  {
    const s: TestSection = { name: "Test 1: CREATE_TASK_ONLY → Real Task (DB)", checks: [] };
    try {
      const result = await autonomousOperationService.planAndMaybeExecute(taskInput);

      check(s.checks, result.success === true, "success=true");
      check(s.checks, result.status === "COMPLETED", `status COMPLETED (got ${result.status})`);
      check(s.checks, result.createdTaskId !== undefined, "createdTaskId is set");

      if (result.createdTaskId) {
        cleanupTaskIds.push(result.createdTaskId);
        const read = await taskService.getTask(result.createdTaskId, orgSlug);
        check(s.checks, read.success, "task read-back succeeded");
        check(s.checks, read.task !== null && read.task !== undefined, "task exists in DB");
        if (read.task) {
          check(s.checks, read.task.draft.title.includes("[Integration Harness]"), "task title correct");
          check(s.checks, read.task.draft.status === "open", `task status open (got ${read.task.draft.status})`);
          s.checks.push({ label: `DB task id=${read.task.id}`, passed: true });
        }
      }
    } catch (err) {
      s.error = (err as Error).message;
    }
    sections.push(s);
  }

  // ── Test 2: CREATE_APPROVAL_ONLY → real Approval ──────────────────────────

  {
    const s: TestSection = { name: "Test 2: CREATE_APPROVAL_ONLY → Real Approval (DB)", checks: [] };
    try {
      const result = await autonomousOperationService.planAndMaybeExecute(approvalInput);

      check(s.checks, result.success === true, "success=true");
      check(s.checks,
        result.status === "WAITING_APPROVAL" || result.status === "COMPLETED",
        `status WAITING_APPROVAL or COMPLETED (got ${result.status})`);
      check(s.checks, result.createdApprovalId !== undefined, "createdApprovalId is set");

      if (result.createdApprovalId) {
        cleanupApprovalIds.push(result.createdApprovalId);
        const read = await approvalService.getApproval(result.createdApprovalId);
        check(s.checks, read.success, "approval read-back succeeded");
        check(s.checks, read.approval !== null && read.approval !== undefined, "approval exists in DB");
        if (read.approval) {
          check(s.checks, read.approval.status === "PENDING", `approval status PENDING (got ${read.approval.status})`);
          check(s.checks, read.approval.title.includes("[Integration Harness]"), "approval title correct");
          check(s.checks, read.approval.source === "AGENT", `approval source AGENT (got ${read.approval.source})`);
          s.checks.push({ label: `DB approval id=${read.approval.id}`, passed: true });
        }
      }
    } catch (err) {
      s.error = (err as Error).message;
    }
    sections.push(s);
  }

  // ── Test 3: Critical guardrail — no side effects ───────────────────────────

  {
    const s: TestSection = { name: "Test 3: Critical guardrail — no task/approval created", checks: [] };
    try {
      const result = await autonomousOperationService.planAndMaybeExecute(criticalInput);

      check(s.checks,
        result.status === "WAITING_APPROVAL" || result.status === "BLOCKED",
        `status blocked/waiting (got ${result.status})`);
      check(s.checks, result.createdTaskId === undefined, "no task created");
      check(s.checks, result.createdApprovalId === undefined, "no auto-completed approval created");
    } catch (err) {
      s.error = (err as Error).message;
    }
    sections.push(s);
  }

  // ── Test 4: PREVIEW mode — no side effects ─────────────────────────────────

  {
    const s: TestSection = { name: "Test 4: PREVIEW mode — no side effects", checks: [] };
    try {
      const result = await autonomousOperationService.planAndMaybeExecute(previewInput);

      check(s.checks,
        result.status === "COMPLETED" || result.status === "BLOCKED" || result.status === "PLANNED",
        `status non-executable (got ${result.status})`);
      check(s.checks, result.createdTaskId === undefined, "no task created");
      check(s.checks, result.createdApprovalId === undefined, "no approval created");
    } catch (err) {
      s.error = (err as Error).message;
    }
    sections.push(s);
  }

  // ── Test 5: NO_ACTION — no side effects ───────────────────────────────────

  {
    const s: TestSection = { name: "Test 5: NO_ACTION — no side effects", checks: [] };
    try {
      const result = await autonomousOperationService.planAndMaybeExecute(noActionInput);

      check(s.checks, result.status === "COMPLETED", `status COMPLETED (got ${result.status})`);
      check(s.checks, result.createdTaskId === undefined, "no task created");
      check(s.checks, result.createdApprovalId === undefined, "no approval created");
      check(s.checks, result.success === true, "success=true");
    } catch (err) {
      s.error = (err as Error).message;
    }
    sections.push(s);
  }

  // ── Test 6: ESCALATE_TO_USER — no DB records ───────────────────────────────

  {
    const s: TestSection = { name: "Test 6: ESCALATE_TO_USER — no DB records, structured response", checks: [] };
    try {
      const result = await autonomousOperationService.planAndMaybeExecute(escalateInput);

      check(s.checks, result.createdTaskId === undefined, "no task created");
      check(s.checks, result.createdApprovalId === undefined, "no approval created");
      check(s.checks, typeof result.message === "string", "result has message");
      check(s.checks, Array.isArray(result.auditTrail), "result has auditTrail");
    } catch (err) {
      s.error = (err as Error).message;
    }
    sections.push(s);
  }

  // ── Test 7: Idempotency — duplicate input prevented ───────────────────────

  {
    const s: TestSection = { name: "Test 7: Idempotency — duplicate task NOT created (AGENTIK-IDEMPOTENCY-01)", checks: [] };
    try {
      const idempotencyRunId = `idem_${testRunId}`;
      const actionId         = `pa_harness_idem_${testRunId}`;

      const idempotentInput: AutonomousOperationInput = {
        orgSlug,
        agentId:        "mila",
        agentName:      "Mila",
        agentDomain:    "COMMERCIAL",
        runtimeMode:    "ASSISTED",
        sourceRunId:    idempotencyRunId,
        proposedAction: {
          id:                     actionId,
          type:                   "CREATE_TASK_DRAFT",
          label:                  "[Integration Harness] Idempotency task",
          description:            "Harness idempotency check — same input submitted twice.",
          targetDomain:           "COMMERCIAL",
          targetModule:           "inteligencia",
          requiresApproval:       false,
          sourceRecommendationId: `rec_harness_idem_${testRunId}`,
          confidence:             "HIGH",
          score:                  60,
          payload: { signalId: `sig_harness_idem_${testRunId}`, signalType: "margin_alert", ...meta },
          metadata: meta,
        },
        metadata: { ...meta, sourceRunId: idempotencyRunId },
      };

      // First call — creates the task
      const r1 = await autonomousOperationService.planAndMaybeExecute(idempotentInput);
      // Second call — same input, must reuse
      const r2 = await autonomousOperationService.planAndMaybeExecute(idempotentInput);

      check(s.checks, r1.success === true, "first call: success=true");
      check(s.checks, r2.success === true, "second call: success=true");
      check(s.checks, r1.createdTaskId !== undefined, "first call: task created");
      check(s.checks, r2.createdTaskId !== undefined, "second call: task id returned");
      check(s.checks,
        r1.createdTaskId === r2.createdTaskId,
        `idempotency: same task returned both calls (id=${r1.createdTaskId})`);
      check(s.checks, r2.alreadyProcessed === true, "second call: alreadyProcessed=true");
      check(s.checks, r1.idempotencyKey !== undefined, `idempotencyKey present: ${r1.idempotencyKey}`);

      // Only register the task once for cleanup
      if (r1.createdTaskId) cleanupTaskIds.push(r1.createdTaskId);

      s.checks.push({
        label:  `idempotencyKey: ${r1.idempotencyKey ?? "n/a"}`,
        passed: true,
      });
    } catch (err) {
      s.error = (err as Error).message;
    }
    sections.push(s);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  const cleanupResults: string[] = [];
  for (const id of cleanupTaskIds) {
    await cancelTask(id, orgSlug);
    cleanupResults.push(`task:${id} cancelled`);
  }
  for (const id of cleanupApprovalIds) {
    await cancelApproval(id);
    cleanupResults.push(`approval:${id} cancelled`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  const allChecks  = sections.flatMap(s => s.checks);
  const passed     = allChecks.filter(c => c.passed).length;
  const failed     = allChecks.filter(c => !c.passed).length;
  const hasErrors  = sections.some(s => s.error !== undefined);

  return NextResponse.json({
    ok:       failed === 0 && !hasErrors,
    testRunId,
    orgSlug,
    summary:  { passed, failed, total: passed + failed, sections: sections.length },
    sections,
    cleanup:  cleanupResults,
  }, { status: failed === 0 && !hasErrors ? 200 : 500 });
}
