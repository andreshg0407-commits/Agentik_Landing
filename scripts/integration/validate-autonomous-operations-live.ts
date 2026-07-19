/**
 * scripts/integration/validate-autonomous-operations-live.ts
 *
 * AGENTIK-INTEGRATION-TESTS-01 — Full chain integration tests
 *
 * Tests the complete Agentik chain:
 *   AgentRuntimeResult → ProposedAction → AutonomousOperationInput
 *   → AutonomousOperationPlan → AutonomousOperationService
 *   → TaskService / ApprovalService → real persistence → read-back
 *
 * SAFE operations only:
 *   ✓ CREATE_TASK_DRAFT
 *   ✓ CREATE_APPROVAL_DRAFT
 *   ✓ ESCALATE_TO_USER
 *   ✓ NO_ACTION
 *
 * NOT tested here (by design):
 *   ✗ START_WORKFLOW (critical — requires human)
 *   ✗ Financial transfers
 *   ✗ Marketing publishing
 *   ✗ Inventory moves
 *   ✗ Customer messages
 *
 * Run:
 *   NODE_OPTIONS="-r ./scripts/integration/patch-server-only.cjs" \
 *   npx dotenv-cli -e .env -- npx tsx scripts/integration/validate-autonomous-operations-live.ts
 */

import {
  assertIntegrationEnv,
  resolveTestOrganization,
  makeIntegrationInputs,
  makeSafeProposedActions,
  cleanupCreatedTask,
  cleanupCreatedApproval,
} from "./test-helpers";

import { planAutonomousOperation }     from "../../lib/autonomous-operations/autonomous-operation-planner";
import { autonomousOperationService }  from "../../lib/autonomous-operations/server/autonomous-operation-service";
import {
  criticalBlockedInput,
  previewModeInput,
} from "../../lib/autonomous-operations/autonomous-operation-fixtures";

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

// ── Cleanup registry ──────────────────────────────────────────────────────────

const createdTaskIds:     { id: string; orgSlug: string }[] = [];
const createdApprovalIds: { id: string; orgSlug: string }[] = [];

async function main(): Promise<void> {

  // ── Phase 1: Environment assertion ─────────────────────────────────────────

  const env = assertIntegrationEnv();
  const { orgSlug, testRunId } = env;

  // ── Phase 2: Organization resolution ──────────────────────────────────────

  section("Organization Resolution");

  const org = await resolveTestOrganization(orgSlug);
  assert(!!org, `Organization "${orgSlug}" found in database`);
  assert(org.slug === orgSlug, `Organization slug matches "${orgSlug}"`);
  console.log(`  → id=${org.id} name=${org.name}`);

  // ── Build integration inputs ────────────────────────────────────────────────

  const inputs = makeIntegrationInputs(testRunId, orgSlug);
  const actions = makeSafeProposedActions(testRunId);

  // ── Test 1: Planner — pure domain (no DB) ──────────────────────────────────

  section("Test 1: Operation Planner (pure domain)");

  for (const [name, input] of Object.entries(inputs)) {
    const plan = planAutonomousOperation(input);
    assert(plan.id.startsWith("aop_"), `${name}: plan has valid ID`);
    assert(typeof plan.status === "string", `${name}: plan has status`);
    assert(typeof plan.decision === "string", `${name}: plan has decision`);
    assert(Array.isArray(plan.auditTrail), `${name}: plan has audit trail`);
    assert(plan.orgSlug === orgSlug, `${name}: plan orgSlug matches`);
    console.log(`  → ${name}: decision=${plan.decision} status=${plan.status} risk=${plan.riskLevel}`);
  }

  // ── Test 2: CREATE_TASK_DRAFT guardrails (safe inputs pass) ────────────────

  section("Test 2: Planner — safe task inputs pass guardrails");

  {
    const plan = planAutonomousOperation(inputs.diegoTaskInput);
    assert(plan.errors.length === 0, "diegoTask: no guardrail errors");
    assert(plan.status === "READY_TO_EXECUTE", `diegoTask: plan is ready to execute (status=${plan.status})`);
    assert(plan.decision === "CREATE_TASK_ONLY", `diegoTask: decision is CREATE_TASK_ONLY (got ${plan.decision})`);
    assert(plan.taskDraft !== undefined, "diegoTask: plan has taskDraft");
  }

  {
    const plan = planAutonomousOperation(inputs.milaTaskInput);
    assert(plan.errors.length === 0, "milaTask: no guardrail errors");
    assert(
      plan.status === "READY_TO_EXECUTE",
      `milaTask: plan is ready to execute (status=${plan.status})`,
    );
    assert(
      plan.decision === "CREATE_TASK_ONLY",
      `milaTask: decision is CREATE_TASK_ONLY (got ${plan.decision})`,
    );
  }

  // ── Test 3: CREATE_TASK_ONLY → real task creation ──────────────────────────

  section("Test 3: CREATE_TASK_ONLY → Real Task (DB)");

  {
    console.log(`  Creating task via diegoTaskInput (SAFE_AUTOMATION mode)...`);
    const result = await autonomousOperationService.planAndMaybeExecute(inputs.diegoTaskInput);

    console.log(`  → success=${result.success} status=${result.status} taskId=${result.createdTaskId ?? "none"}`);

    assert(result.success === true, "diegoTask: service returned success=true");
    assert(result.status === "COMPLETED", `diegoTask: result status is COMPLETED (got ${result.status})`);
    assert(result.createdTaskId !== undefined, "diegoTask: createdTaskId is set");

    if (result.createdTaskId) {
      createdTaskIds.push({ id: result.createdTaskId, orgSlug });

      // Read back the task to verify persistence
      const { taskService } = await import("../../lib/tasks/task-service");
      const readResult = await taskService.getTask(result.createdTaskId, orgSlug);

      assert(readResult.success, `diegoTask: task read-back succeeded`);
      assert(readResult.task !== null && readResult.task !== undefined, "diegoTask: task exists in DB");

      if (readResult.task) {
        assert(readResult.task.draft.title.includes("[Integration Test]"), "diegoTask: task title is correct");
        assert(readResult.task.draft.status === "open", `diegoTask: task status is open (got ${readResult.task.draft.status})`);
        assert(readResult.task.draft.source === "system", `diegoTask: task source is system (got ${readResult.task.draft.source})`);
        console.log(`  → DB task id=${readResult.task.id} title="${readResult.task.draft.title}"`);
      }
    }
  }

  {
    console.log(`  Creating task via milaTaskInput (ASSISTED mode)...`);
    const result = await autonomousOperationService.planAndMaybeExecute(inputs.milaTaskInput);

    console.log(`  → success=${result.success} status=${result.status} taskId=${result.createdTaskId ?? "none"}`);

    assert(result.success === true, "milaTask: service returned success=true");
    assert(result.createdTaskId !== undefined, "milaTask: createdTaskId is set");

    if (result.createdTaskId) {
      createdTaskIds.push({ id: result.createdTaskId, orgSlug });
    }
  }

  // ── Test 4: CREATE_APPROVAL_ONLY → real approval creation ─────────────────

  section("Test 4: CREATE_APPROVAL_ONLY → Real Approval (DB)");

  {
    console.log(`  Creating approval via diegoApprovalInput (APPROVAL_REQUIRED mode)...`);
    const result = await autonomousOperationService.planAndMaybeExecute(inputs.diegoApprovalInput);

    console.log(`  → success=${result.success} status=${result.status} approvalId=${result.createdApprovalId ?? "none"}`);

    assert(result.success === true, "diegoApproval: service returned success=true");
    assert(
      result.status === "WAITING_APPROVAL" || result.status === "COMPLETED",
      `diegoApproval: result status is WAITING_APPROVAL or COMPLETED (got ${result.status})`,
    );
    assert(result.createdApprovalId !== undefined, "diegoApproval: createdApprovalId is set");

    if (result.createdApprovalId) {
      createdApprovalIds.push({ id: result.createdApprovalId, orgSlug });

      // Read back the approval
      const { approvalService } = await import("../../lib/approvals/approval-service");
      const readResult = await approvalService.getApproval(result.createdApprovalId);

      assert(readResult.success, "diegoApproval: approval read-back succeeded");
      assert(readResult.approval !== null && readResult.approval !== undefined, "diegoApproval: approval exists in DB");

      if (readResult.approval) {
        assert(readResult.approval.status === "PENDING", `diegoApproval: approval status is PENDING (got ${readResult.approval.status})`);
        assert(readResult.approval.title.includes("[Integration Test]"), "diegoApproval: approval title is correct");
        assert(readResult.approval.source === "AGENT", `diegoApproval: approval source is AGENT (got ${readResult.approval.source})`);
        console.log(`  → DB approval id=${readResult.approval.id} status=${readResult.approval.status}`);
      }
    }
  }

  {
    console.log(`  Creating approval via lucaApprovalInput (ASSISTED mode)...`);
    const result = await autonomousOperationService.planAndMaybeExecute(inputs.lucaApprovalInput);

    console.log(`  → success=${result.success} status=${result.status} approvalId=${result.createdApprovalId ?? "none"}`);

    assert(result.success === true, "lucaApproval: service returned success=true");
    assert(result.createdApprovalId !== undefined, "lucaApproval: createdApprovalId is set");

    if (result.createdApprovalId) {
      createdApprovalIds.push({ id: result.createdApprovalId, orgSlug });
    }
  }

  // ── Test 5: Critical guardrail — no side effects ───────────────────────────

  section("Test 5: Critical guardrail — no task/approval created");

  {
    const result = await autonomousOperationService.planAndMaybeExecute(criticalBlockedInput);

    assert(
      result.status === "WAITING_APPROVAL" || result.status === "BLOCKED",
      `critical: result is blocked/waiting (got ${result.status})`,
    );
    assert(result.createdTaskId === undefined, "critical: no task created");
    assert(result.createdApprovalId === undefined,
      "critical: no auto-completed approval created");
    console.log(`  → success=${result.success} status=${result.status} decision=${result.plan.decision}`);
  }

  // ── Test 6: PREVIEW mode — no side effects ─────────────────────────────────

  section("Test 6: PREVIEW mode — no side effects");

  {
    const result = await autonomousOperationService.planAndMaybeExecute(previewModeInput);

    assert(
      result.status === "COMPLETED" || result.status === "BLOCKED" || result.status === "PLANNED",
      `preview: result is non-executable (got ${result.status})`,
    );
    assert(result.createdTaskId === undefined, "preview: no task created");
    assert(result.createdApprovalId === undefined, "preview: no approval created");
    console.log(`  → success=${result.success} status=${result.status}`);
  }

  // ── Test 7: NO_ACTION — no side effects ───────────────────────────────────

  section("Test 7: NO_ACTION — no side effects");

  {
    const result = await autonomousOperationService.planAndMaybeExecute(inputs.systemNoActionInput);

    assert(
      result.status === "COMPLETED",
      `systemNoAction: result is COMPLETED (got ${result.status})`,
    );
    assert(result.createdTaskId === undefined, "systemNoAction: no task created");
    assert(result.createdApprovalId === undefined, "systemNoAction: no approval created");
    assert(result.success === true, "systemNoAction: success=true (no-op is valid)");
    console.log(`  → success=${result.success} status=${result.status}`);
  }

  // ── Test 8: ESCALATE_TO_USER — no DB records ──────────────────────────────

  section("Test 8: ESCALATE_TO_USER — no DB records, structured response");

  {
    const escalationInput = {
      ...inputs.diegoApprovalInput,
      runtimeMode: "AUTONOMOUS_DISABLED" as const,
      proposedAction: {
        ...actions.diegoApproval,
        type: "ESCALATE_TO_USER" as const,
      },
    };

    const result = await autonomousOperationService.planAndMaybeExecute(escalationInput);

    assert(result.createdTaskId === undefined, "escalation: no task created");
    assert(result.createdApprovalId === undefined, "escalation: no approval created");
    assert(typeof result.message === "string", "escalation: result has message");
    assert(Array.isArray(result.auditTrail), "escalation: result has auditTrail");
    console.log(`  → success=${result.success} status=${result.status} message="${result.message}"`);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  section("Cleanup");

  if (createdTaskIds.length === 0 && createdApprovalIds.length === 0) {
    console.log("  No records to clean up.");
  }

  for (const { id, orgSlug: slug } of createdTaskIds) {
    await cleanupCreatedTask(id, slug);
  }
  for (const { id, orgSlug: slug } of createdApprovalIds) {
    await cleanupCreatedApproval(id, slug);
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log("\n" + "═".repeat(60));
  console.log("AGENTIK-INTEGRATION-TESTS-01 — Live Integration Summary");
  console.log(`testRunId:          ${testRunId}`);
  console.log(`orgSlug:            ${orgSlug}`);
  console.log(`Tasks created:      ${createdTaskIds.map(t => t.id).join(", ") || "none"}`);
  console.log(`Approvals created:  ${createdApprovalIds.map(a => a.id).join(", ") || "none"}`);
  console.log(`Passed: ${passed}  |  Failed: ${failed}  |  Total: ${passed + failed}`);

  if (failures.length > 0) {
    console.error("\nFailed checks:");
    failures.forEach(f => console.error(`  ✗ ${f}`));
    process.exit(1);
  }

  console.log("\nAll checks passed. No critical operations executed.");
  process.exit(0);
}

main().catch(err => {
  console.error("\nUnexpected error during integration tests:", err);
  process.exit(1);
});
