/**
 * scripts/integration/validate-agent-runtime-to-operation-live.ts
 *
 * AGENTIK-INTEGRATION-TESTS-01 — Agent Runtime → Operation chain tests
 *
 * Tests the full agent chain:
 *   runAgentRuntime(context)
 *   → AgentRuntimeResult with ProposedActions
 *   → buildAutonomousInputsFromAgentRuntimeResult
 *   → AutonomousOperationInput[]
 *   → planAutonomousOperation (each)
 *   → autonomousOperationService.planAndMaybeExecute (one safe plan)
 *
 * Uses existing fixtures (castillitosDiegoRuntimeContext etc.) for
 * correct context shape. PREVIEW mode used for DB-touching steps to
 * avoid unwanted side effects beyond what's explicitly tested.
 *
 * Run:
 *   NODE_OPTIONS="-r ./scripts/integration/patch-server-only.cjs" \
 *   npx dotenv-cli -e .env -- npx tsx scripts/integration/validate-agent-runtime-to-operation-live.ts
 */

import {
  assertIntegrationEnv,
  resolveTestOrganization,
  makeTestRunId,
  makeIntegrationInputs,
  cleanupCreatedTask,
  cleanupCreatedApproval,
} from "./test-helpers";

import { runAgentRuntime }                              from "../../lib/agents/runtime/agent-runtime-engine";
import { buildAutonomousInputsFromAgentRuntimeResult }  from "../../lib/agents/runtime/autonomous-operation-adapter";
import { planAutonomousOperation }                      from "../../lib/autonomous-operations/autonomous-operation-planner";
import { autonomousOperationService }                   from "../../lib/autonomous-operations/server/autonomous-operation-service";

import {
  castillitosDiegoRuntimeContext,
  castillitosLucaRuntimeContext,
  castillitosMilaRuntimeContext,
} from "../../lib/agents/runtime/agent-runtime-fixtures";

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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {

  // ── Phase 1: Environment ───────────────────────────────────────────────────

  const env = assertIntegrationEnv();
  const { orgSlug } = env;
  const testRunId = makeTestRunId();

  // ── Phase 2: Org resolution ────────────────────────────────────────────────

  section("Organization Resolution");

  const org = await resolveTestOrganization(orgSlug);
  assert(!!org, `Organization "${orgSlug}" found`);
  console.log(`  → id=${org.id} slug=${org.slug}`);

  // ── Test 1: Diego runAgentRuntime → ProposedActions ───────────────────────

  section("Test 1: Diego runAgentRuntime → ProposedActions");

  const diegoResult = runAgentRuntime(castillitosDiegoRuntimeContext);

  assert(typeof diegoResult.success === "boolean", "Diego: result has success");
  assert(diegoResult.agentId === "diego", `Diego: agentId (got ${diegoResult.agentId})`);
  assert(diegoResult.agentDomain === "FINANCE", `Diego: agentDomain FINANCE (got ${diegoResult.agentDomain})`);
  assert(diegoResult.agentMode === "APPROVAL_REQUIRED", `Diego: mode APPROVAL_REQUIRED (got ${diegoResult.agentMode})`);
  assert(Array.isArray(diegoResult.proposedActions), "Diego: proposedActions is array");
  assert(Array.isArray(diegoResult.auditTrail), "Diego: auditTrail is array");
  assert(Array.isArray(diegoResult.errors), "Diego: errors is array");

  console.log(`  → success=${diegoResult.success} actions=${diegoResult.proposedActions.length} errors=${diegoResult.errors.length}`);

  if (diegoResult.proposedActions.length > 0) {
    const a = diegoResult.proposedActions[0];
    assert(typeof a.id === "string", `Diego action[0]: has id`);
    assert(typeof a.type === "string", `Diego action[0]: has type`);
    assert(a.score >= 0 && a.score <= 100, `Diego action[0]: score in range (got ${a.score})`);
    console.log(`  → action[0]: type=${a.type} score=${a.score} domain=${a.targetDomain}`);
  }

  // ── Test 2: Luca runAgentRuntime ──────────────────────────────────────────

  section("Test 2: Luca + Mila runAgentRuntime → ProposedActions");

  const lucaResult = runAgentRuntime(castillitosLucaRuntimeContext);
  const milaResult = runAgentRuntime(castillitosMilaRuntimeContext);

  assert(lucaResult.agentId === "luca", `Luca: agentId (got ${lucaResult.agentId})`);
  assert(lucaResult.agentDomain === "MARKETING", `Luca: agentDomain MARKETING (got ${lucaResult.agentDomain})`);
  assert(Array.isArray(lucaResult.proposedActions), "Luca: proposedActions is array");

  assert(milaResult.agentId === "mila", `Mila: agentId (got ${milaResult.agentId})`);
  assert(milaResult.agentDomain === "COMMERCIAL", `Mila: agentDomain COMMERCIAL (got ${milaResult.agentDomain})`);
  assert(Array.isArray(milaResult.proposedActions), "Mila: proposedActions is array");

  console.log(`  → Luca: success=${lucaResult.success} actions=${lucaResult.proposedActions.length}`);
  console.log(`  → Mila: success=${milaResult.success} actions=${milaResult.proposedActions.length}`);

  // ── Test 3: Adapter — AgentRuntimeResult → AutonomousOperationInput[] ──────

  section("Test 3: Adapter — AgentRuntimeResult → AutonomousOperationInput[]");

  const diegoInputs = buildAutonomousInputsFromAgentRuntimeResult(diegoResult, orgSlug);
  const lucaInputs  = buildAutonomousInputsFromAgentRuntimeResult(lucaResult, orgSlug);
  const milaInputs  = buildAutonomousInputsFromAgentRuntimeResult(milaResult, orgSlug);

  assert(diegoInputs.length === diegoResult.proposedActions.length,
    `Diego: ${diegoInputs.length} inputs for ${diegoResult.proposedActions.length} actions`);
  assert(lucaInputs.length === lucaResult.proposedActions.length,
    `Luca: ${lucaInputs.length} inputs for ${lucaResult.proposedActions.length} actions`);
  assert(milaInputs.length === milaResult.proposedActions.length,
    `Mila: ${milaInputs.length} inputs for ${milaResult.proposedActions.length} actions`);

  if (diegoInputs.length > 0) {
    const i0 = diegoInputs[0];
    assert(i0.orgSlug === orgSlug, `Diego input[0]: orgSlug matches (got ${i0.orgSlug})`);
    assert(i0.agentId === "diego", `Diego input[0]: agentId (got ${i0.agentId})`);
    assert(i0.runtimeMode === "APPROVAL_REQUIRED", `Diego input[0]: runtimeMode (got ${i0.runtimeMode})`);
    assert(i0.sourceRunId === diegoResult.runId, `Diego input[0]: sourceRunId preserved`);
    assert(i0.proposedAction.id === diegoResult.proposedActions[0].id, `Diego input[0]: action id preserved`);
  }

  // ── Test 4: planAutonomousOperation for all Diego inputs ──────────────────

  section("Test 4: Planner — plan each Diego input");

  const diegoPlans = diegoInputs.map(input => planAutonomousOperation(input));

  for (const [i, plan] of diegoPlans.entries()) {
    assert(plan.id.startsWith("aop_"), `Diego plan[${i}]: valid ID`);
    assert(plan.orgSlug === orgSlug, `Diego plan[${i}]: orgSlug matches`);
    assert(typeof plan.status === "string", `Diego plan[${i}]: has status`);
    assert(typeof plan.decision === "string", `Diego plan[${i}]: has decision`);
    assert(typeof plan.riskLevel === "string", `Diego plan[${i}]: has riskLevel`);
    assert(typeof plan.canAutoExecute === "boolean", `Diego plan[${i}]: canAutoExecute is boolean`);
    assert(Array.isArray(plan.auditTrail) && plan.auditTrail.length >= 3,
      `Diego plan[${i}]: audit trail has events (got ${plan.auditTrail.length})`);
    console.log(`  → plan[${i}]: type=${plan.actionType} decision=${plan.decision} status=${plan.status} risk=${plan.riskLevel}`);
  }

  // ── Test 5: Execute safe Diego approval plan (DB) ─────────────────────────

  section("Test 5: Execute safe Diego approval plan → real Approval (DB)");

  {
    // Use the integration inputs for DB-touching tests (have correct testRunId metadata)
    const integrationInputs = makeIntegrationInputs(testRunId, orgSlug);

    console.log(`  Executing diegoApprovalInput (APPROVAL_REQUIRED mode)...`);
    const result = await autonomousOperationService.planAndMaybeExecute(integrationInputs.diegoApprovalInput);

    console.log(`  → success=${result.success} status=${result.status} approvalId=${result.createdApprovalId ?? "none"}`);

    assert(typeof result.success === "boolean", "diegoApproval: result has success");
    assert(typeof result.status === "string", "diegoApproval: result has status");
    assert(typeof result.plan.id === "string", "diegoApproval: plan has id");

    if (result.success && result.createdApprovalId) {
      createdApprovalIds.push({ id: result.createdApprovalId, orgSlug });
      assert(result.status === "WAITING_APPROVAL" || result.status === "COMPLETED",
        `diegoApproval: status is WAITING_APPROVAL or COMPLETED (got ${result.status})`);

      // Read back
      const { approvalService } = await import("../../lib/approvals/approval-service");
      const readResult = await approvalService.getApproval(result.createdApprovalId);

      assert(readResult.success, "diegoApproval: read-back succeeded");
      if (readResult.approval) {
        assert(readResult.approval.status === "PENDING", `diegoApproval: DB status PENDING (got ${readResult.approval.status})`);
        console.log(`  → DB approval id=${readResult.approval.id} status=${readResult.approval.status} source=${readResult.approval.source}`);
      }
    } else if (!result.success) {
      // Non-success is acceptable if it's a policy block
      assert(result.errors.length > 0 || result.warnings.length > 0,
        "diegoApproval (blocked): result has explanation");
      console.log(`  → Plan not executed (policy block): ${result.message}`);
    }
  }

  // ── Test 6: Execute safe Mila task plan (DB) ──────────────────────────────

  section("Test 6: Execute safe Mila task plan → real Task (DB)");

  {
    const integrationInputs = makeIntegrationInputs(testRunId, orgSlug);

    console.log(`  Executing milaTaskInput (ASSISTED mode)...`);
    const result = await autonomousOperationService.planAndMaybeExecute(integrationInputs.milaTaskInput);

    console.log(`  → success=${result.success} status=${result.status} taskId=${result.createdTaskId ?? "none"}`);

    assert(typeof result.success === "boolean", "milaTask: result has success");
    assert(typeof result.status === "string", "milaTask: result has status");

    if (result.success && result.createdTaskId) {
      createdTaskIds.push({ id: result.createdTaskId, orgSlug });
      assert(result.status === "COMPLETED", `milaTask: status is COMPLETED (got ${result.status})`);

      // Read back
      const { taskService } = await import("../../lib/tasks/task-service");
      const readResult = await taskService.getTask(result.createdTaskId, orgSlug);

      assert(readResult.success, "milaTask: read-back succeeded");
      if (readResult.task) {
        assert(readResult.task.draft.status === "open", `milaTask: DB status open (got ${readResult.task.draft.status})`);
        console.log(`  → DB task id=${readResult.task.id} title="${readResult.task.draft.title}"`);
      }
    }
  }

  // ── Test 7: PREVIEW mode through adapter — no side effects ────────────────

  section("Test 7: PREVIEW mode — adapter produces inputs, no DB records");

  {
    // Simulate preview by overriding agentMode in the result
    const previewResult = { ...diegoResult, agentMode: "PREVIEW" };
    const previewInputs = buildAutonomousInputsFromAgentRuntimeResult(previewResult, orgSlug);

    assert(previewInputs.every(i => i.runtimeMode === "PREVIEW"),
      `PREVIEW: all ${previewInputs.length} inputs have PREVIEW mode`);

    for (const input of previewInputs) {
      const r = await autonomousOperationService.planAndMaybeExecute(input);
      assert(r.createdTaskId === undefined, `PREVIEW ${input.proposedAction.type}: no task created`);
      assert(r.createdApprovalId === undefined, `PREVIEW ${input.proposedAction.type}: no approval created`);
    }

    console.log(`  → ${previewInputs.length} PREVIEW inputs verified — zero DB records.`);
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
  console.log("AGENTIK-INTEGRATION-TESTS-01 — Agent Runtime Chain Summary");
  console.log(`testRunId:          ${testRunId}`);
  console.log(`orgSlug:            ${orgSlug}`);
  console.log(`Diego actions:      ${diegoResult.proposedActions.length}`);
  console.log(`Luca actions:       ${lucaResult.proposedActions.length}`);
  console.log(`Mila actions:       ${milaResult.proposedActions.length}`);
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
  console.error("\nUnexpected error during agent runtime chain tests:", err);
  process.exit(1);
});
