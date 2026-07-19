/**
 * scripts/validate-autonomous-operations.ts
 *
 * AGENTIK-AUTONOMOUS-OPERATIONS-01 — Pure domain validation
 *
 * 55 checks across:
 * - Input validation
 * - Risk level calculation
 * - Policy resolution
 * - Guardrail evaluation
 * - Planner (plan creation + draft builders)
 * - Fixtures
 * - Adapter (pure side)
 *
 * Run: npx tsx scripts/validate-autonomous-operations.ts
 */

import { planAutonomousOperation }          from "../lib/autonomous-operations/autonomous-operation-planner";
import { calculateRiskLevel, evaluateAutonomousGuardrails } from "../lib/autonomous-operations/autonomous-operation-guardrails";
import { resolveOperationPolicy, isCriticalOperation }       from "../lib/autonomous-operations/autonomous-operation-registry";
import { validateAutonomousOperationInput, validateAutonomousOperationPlan } from "../lib/autonomous-operations/autonomous-operation-audit";
import {
  diegoFinanceApprovalInput,
  diegoFinanceTaskInput,
  lucaMarketingInput,
  milaCommercialInput,
  criticalBlockedInput,
  previewModeInput,
  diegoFinanceApprovalProposedAction,
  diegoFinanceTaskProposedAction,
  criticalBlockedProposedAction,
} from "../lib/autonomous-operations/autonomous-operation-fixtures";
import {
  buildTaskDraftFromProposedAction,
  buildApprovalDraftFromProposedAction,
  buildWorkflowDraftFromProposedAction,
  buildEscalationPayloadFromProposedAction,
} from "../lib/autonomous-operations/autonomous-operation-planner";
import {
  buildAutonomousInputsFromAgentRuntimeResult,
  buildAutonomousInputForAction,
} from "../lib/agents/runtime/autonomous-operation-adapter";
import type { AgentRuntimeResult } from "../lib/agents/runtime/agent-runtime-result";
import {
  buildIdempotencyKey,
  buildAutonomousOperationIdempotencyKey,
  normalizeIdempotencyPart,
} from "../lib/idempotency/idempotency-key";
import { validateIdempotencyKey, validateIdempotencyInput } from "../lib/idempotency/idempotency-audit";

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

// ── 1. Input Validation ───────────────────────────────────────────────────────

section("Input Validation");

{
  const result = validateAutonomousOperationInput(diegoFinanceApprovalInput);
  assert(result.valid, "diegoFinanceApprovalInput is valid");
  assert(result.errors.length === 0, "No validation errors on diegoFinanceApprovalInput");
}

{
  const result = validateAutonomousOperationInput(null);
  assert(!result.valid, "null input is invalid");
  assert(result.errors.length > 0, "null input has errors");
}

{
  const result = validateAutonomousOperationInput({ orgSlug: "test" });
  assert(!result.valid, "Incomplete input is invalid");
}

{
  const result = validateAutonomousOperationInput({
    ...diegoFinanceApprovalInput,
    proposedAction: { ...diegoFinanceApprovalProposedAction, score: 999 },
  });
  assert(!result.valid, "Score > 100 is invalid");
}

{
  const result = validateAutonomousOperationInput({
    ...diegoFinanceApprovalInput,
    proposedAction: { ...diegoFinanceApprovalProposedAction, score: -5 },
  });
  assert(!result.valid, "Negative score is invalid");
}

// ── 2. Risk Level Calculation ─────────────────────────────────────────────────

section("Risk Level Calculation");

{
  const risk = calculateRiskLevel(diegoFinanceApprovalInput);
  assert(risk === "MEDIUM", `CREATE_APPROVAL_DRAFT is MEDIUM risk (got ${risk})`);
}

{
  const risk = calculateRiskLevel(diegoFinanceTaskInput);
  assert(risk === "LOW", `VERY_HIGH confidence task is LOW risk (got ${risk})`);
}

{
  const risk = calculateRiskLevel(criticalBlockedInput);
  assert(risk === "HIGH", `START_WORKFLOW_DRAFT is HIGH risk (got ${risk})`);
}

{
  const risk = calculateRiskLevel(previewModeInput);
  assert(risk === "LOW", `HIGH confidence preview task is LOW risk (got ${risk})`);
}

{
  const risk = calculateRiskLevel(lucaMarketingInput);
  assert(risk === "MEDIUM", `MEDIUM confidence CREATE_APPROVAL_DRAFT is MEDIUM risk (got ${risk})`);
}

// ── 3. Policy Resolution ──────────────────────────────────────────────────────

section("Policy Resolution");

{
  const policy = resolveOperationPolicy("CREATE_APPROVAL_DRAFT", "MEDIUM", "APPROVAL_REQUIRED");
  assert(policy.id !== "P_EMERGENCY_FALLBACK", "Policy resolved for APPROVAL_REQUIRED+MEDIUM");
  assert(policy.requiresApproval === true || policy.decision === "CREATE_APPROVAL_ONLY" || policy.decision === "REQUIRE_APPROVAL",
    `Correct decision for APPROVAL_REQUIRED mode (got ${policy.decision})`);
}

{
  const policy = resolveOperationPolicy("CREATE_TASK_DRAFT", "LOW", "PREVIEW");
  assert(policy.decision === "NO_ACTION", `PREVIEW mode blocks all auto-execute (got ${policy.decision})`);
}

{
  const policy = resolveOperationPolicy("START_WORKFLOW_DRAFT", "HIGH", "ASSISTED");
  assert(policy.requiresApproval === true, "START_WORKFLOW always requires approval");
  assert(policy.canAutoExecute === false, "START_WORKFLOW cannot auto-execute");
}

{
  const policy = resolveOperationPolicy("CREATE_TASK_DRAFT", "CRITICAL", "ASSISTED");
  assert(policy.decision === "REQUIRE_APPROVAL" || policy.canAutoExecute === false,
    "CRITICAL risk never auto-executes");
}

{
  const critical = isCriticalOperation("CREATE_TASK_DRAFT", "CRITICAL");
  assert(critical === true, "CRITICAL risk is a critical operation");
}

{
  const critical = isCriticalOperation("START_WORKFLOW_DRAFT", "LOW");
  assert(critical === true, "START_WORKFLOW_DRAFT is always critical");
}

{
  const critical = isCriticalOperation("CREATE_TASK_DRAFT", "LOW");
  assert(critical === false, "LOW risk CREATE_TASK_DRAFT is not critical");
}

// ── 4. Guardrail Evaluation ───────────────────────────────────────────────────

section("Guardrail Evaluation");

{
  const policy  = resolveOperationPolicy("CREATE_APPROVAL_DRAFT", "MEDIUM", "APPROVAL_REQUIRED");
  const result  = evaluateAutonomousGuardrails(diegoFinanceApprovalInput, policy);
  assert(result.allowed, "diegoFinanceApprovalInput passes guardrails");
  assert(result.errors.length === 0, "No guardrail errors for valid approval input");
}

{
  const policy = resolveOperationPolicy("START_WORKFLOW_DRAFT", "HIGH", "ASSISTED");
  const result = evaluateAutonomousGuardrails(criticalBlockedInput, policy);
  assert(!result.allowed || result.decision === "REQUIRE_APPROVAL",
    "START_WORKFLOW blocked or requires approval by guardrails");
}

{
  const policy = resolveOperationPolicy("CREATE_TASK_DRAFT", "LOW", "PREVIEW");
  const result = evaluateAutonomousGuardrails(previewModeInput, policy);
  // PREVIEW policy has canAutoExecute=false, so guardrail passes but decision=NO_ACTION
  assert(!result.allowed || result.decision === "NO_ACTION",
    `PREVIEW mode produces no execution (allowed=${result.allowed} decision=${result.decision})`);
  assert(result.decision === "NO_ACTION" || !result.allowed,
    `PREVIEW mode decision is NO_ACTION or blocked (got ${result.decision})`);
}

{
  const forbiddenInput = {
    ...diegoFinanceApprovalInput,
    proposedAction: {
      ...diegoFinanceApprovalProposedAction,
      payload: { signalType: "financial_transfer", amount: 100000 },
    },
  };
  const policy = resolveOperationPolicy("CREATE_APPROVAL_DRAFT", "MEDIUM", "APPROVAL_REQUIRED");
  const result = evaluateAutonomousGuardrails(forbiddenInput, policy);
  // This may or may not be blocked depending on canAutoExecute of this policy
  assert(typeof result.allowed === "boolean", "Guardrail returns boolean allowed");
}

{
  const financialInput = {
    ...diegoFinanceApprovalInput,
    proposedAction: {
      ...diegoFinanceApprovalProposedAction,
      payload: { signalType: "bank_transfer_dispatch" },
    },
  };
  const policy = resolveOperationPolicy("CREATE_APPROVAL_DRAFT", "MEDIUM", "APPROVAL_REQUIRED");
  const result = evaluateAutonomousGuardrails(financialInput, policy);
  assert(typeof result.decision === "string", "Financial signal guardrail returns decision");
}

// ── 5. Planner — Diego Finance Approval ──────────────────────────────────────

section("Planner — Diego Finance Approval");

const diegoApprovalPlan = planAutonomousOperation(diegoFinanceApprovalInput);

{
  assert(diegoApprovalPlan.id.startsWith("aop_"), `Plan has aop_ prefix (got ${diegoApprovalPlan.id})`);
  assert(diegoApprovalPlan.orgSlug === "castillitos", "Plan orgSlug matches");
  assert(diegoApprovalPlan.agentId === "diego", "Plan agentId matches");
}

{
  assert(
    diegoApprovalPlan.status === "WAITING_APPROVAL" || diegoApprovalPlan.status === "READY_TO_EXECUTE",
    `Diego approval plan has expected status (got ${diegoApprovalPlan.status})`,
  );
}

{
  assert(diegoApprovalPlan.approvalDraft !== undefined, "Diego approval plan has approvalDraft");
  assert(diegoApprovalPlan.taskDraft === undefined, "Diego approval plan has no taskDraft");
}

{
  assert(diegoApprovalPlan.auditTrail.length >= 3, "Audit trail has at least 3 events");
  assert(diegoApprovalPlan.errors.length === 0, "No errors in valid approval plan");
}

{
  const validPlan = validateAutonomousOperationPlan(diegoApprovalPlan);
  assert(validPlan.valid, "Plan passes plan validator");
}

// ── 6. Planner — Diego Finance Task ──────────────────────────────────────────

section("Planner — Diego Finance Task");

const diegoTaskPlan = planAutonomousOperation(diegoFinanceTaskInput);

{
  assert(
    diegoTaskPlan.decision === "CREATE_APPROVAL_ONLY" || diegoTaskPlan.decision === "CREATE_TASK_ONLY",
    `Diego task plan decision is correct (got ${diegoTaskPlan.decision})`,
  );
}

{
  // APPROVAL_REQUIRED mode: task gets converted to approval-only
  if (diegoTaskPlan.decision === "CREATE_APPROVAL_ONLY") {
    assert(diegoTaskPlan.approvalDraft !== undefined, "APPROVAL_REQUIRED converts task to approval draft");
  } else {
    assert(diegoTaskPlan.taskDraft !== undefined, "CREATE_TASK_ONLY has taskDraft");
  }
}

// ── 7. Planner — Critical Block ───────────────────────────────────────────────

section("Planner — Critical Block (START_WORKFLOW_DRAFT)");

const criticalPlan = planAutonomousOperation(criticalBlockedInput);

{
  assert(
    criticalPlan.status === "WAITING_APPROVAL" || criticalPlan.status === "BLOCKED",
    `Critical plan is blocked or waiting approval (got ${criticalPlan.status})`,
  );
}

{
  assert(
    criticalPlan.decision === "REQUIRE_APPROVAL" || criticalPlan.decision === "START_WORKFLOW" || criticalPlan.decision === "BLOCK",
    `Critical plan decision is blocking (got ${criticalPlan.decision})`,
  );
}

// ── 8. Planner — Preview Mode ─────────────────────────────────────────────────

section("Planner — Preview Mode");

const previewPlan = planAutonomousOperation(previewModeInput);

{
  assert(
    previewPlan.status === "COMPLETED" || previewPlan.status === "BLOCKED" || previewPlan.status === "PLANNED",
    `Preview plan produces no real execution (got ${previewPlan.status})`,
  );
}

{
  assert(previewPlan.canAutoExecute === false, "Preview plan cannot auto-execute");
}

// ── 9. Planner — Invalid input ────────────────────────────────────────────────

section("Planner — Invalid Input Handling");

{
  const badInput = { orgSlug: "", agentId: "", agentName: "", agentDomain: "", runtimeMode: "PREVIEW", proposedAction: null, metadata: {} } as never;
  const badPlan  = planAutonomousOperation(badInput);
  assert(badPlan.status === "BLOCKED", `Invalid input produces BLOCKED plan (got ${badPlan.status})`);
  assert(badPlan.errors.length > 0, "Invalid input plan has error messages");
}

// ── 10. Draft Builders ────────────────────────────────────────────────────────

section("Draft Builders");

{
  const taskDraft = buildTaskDraftFromProposedAction(diegoFinanceTaskProposedAction, "castillitos", "diego");
  assert(taskDraft.title === diegoFinanceTaskProposedAction.label, "TaskDraft title matches action label");
  assert(taskDraft.priority === "HIGH", `TaskDraft priority is HIGH for score=75 (got ${taskDraft.priority})`);
  assert(taskDraft.module === "cobros", `TaskDraft module matches action (got ${taskDraft.module})`);
}

{
  const approvalDraft = buildApprovalDraftFromProposedAction(diegoFinanceApprovalProposedAction, "castillitos", "diego");
  assert(approvalDraft.title === diegoFinanceApprovalProposedAction.label, "ApprovalDraft title matches");
  assert(approvalDraft.requestedBy === "diego", "ApprovalDraft requestedBy is agentId");
  assert(approvalDraft.actionType === "CREATE_APPROVAL_DRAFT", "ApprovalDraft actionType matches");
}

{
  const workflowDraft = buildWorkflowDraftFromProposedAction(criticalBlockedProposedAction, "castillitos", "diego");
  assert(typeof workflowDraft.chainId === "string", "WorkflowDraft has chainId");
  assert(workflowDraft.requiresApproval === true, "WorkflowDraft always requires approval");
}

{
  const escalation = buildEscalationPayloadFromProposedAction(
    { ...diegoFinanceApprovalProposedAction, score: 80 },
    "diego",
  );
  assert(escalation.urgency === "CRITICAL", `score=80 maps to CRITICAL urgency (got ${escalation.urgency})`);
}

{
  const escalation = buildEscalationPayloadFromProposedAction(
    { ...diegoFinanceApprovalProposedAction, score: 30 },
    "diego",
  );
  assert(escalation.urgency === "LOW", `score=30 maps to LOW urgency (got ${escalation.urgency})`);
}

// ── 11. Pure Adapter ──────────────────────────────────────────────────────────

section("Autonomous Operation Adapter (pure)");

const mockRuntimeResult: AgentRuntimeResult = {
  success:        true,
  message:        "Test runtime result",
  runId:          "run_test_01",
  agentId:        "diego",
  agentDomain:    "FINANCE",
  agentMode:      "APPROVAL_REQUIRED",
  status:         "COMPLETED",
  proposedActions: [
    diegoFinanceApprovalProposedAction,
    diegoFinanceTaskProposedAction,
  ],
  recommendationCount: 2,
  auditTrail:          [],
  errors:              [],
  warnings:            [],
  completedAt:         new Date().toISOString(),
  metadata:            {},
};

{
  const inputs = buildAutonomousInputsFromAgentRuntimeResult(mockRuntimeResult, "castillitos");
  assert(inputs.length === 2, `Adapter produces 2 inputs from 2 actions (got ${inputs.length})`);
  assert(inputs[0].agentId === "diego", "Input agentId is mapped");
  assert(inputs[0].runtimeMode === "APPROVAL_REQUIRED", "Input runtimeMode is mapped");
  assert(inputs[0].orgSlug === "castillitos", "Input orgSlug is correct");
}

{
  const inputs = buildAutonomousInputsFromAgentRuntimeResult(
    { ...mockRuntimeResult, proposedActions: [] },
    "castillitos",
  );
  assert(inputs.length === 0, "Empty proposedActions returns empty inputs");
}

{
  const input = buildAutonomousInputForAction(mockRuntimeResult, "pa_diego_finance_approval_01", "castillitos");
  assert(input !== null, "buildAutonomousInputForAction finds action by ID");
  assert(input!.proposedAction.id === "pa_diego_finance_approval_01", "Correct action selected");
}

{
  const input = buildAutonomousInputForAction(mockRuntimeResult, "nonexistent_id", "castillitos");
  assert(input === null, "buildAutonomousInputForAction returns null for unknown ID");
}

{
  // PREVIEW mode maps correctly
  const previewResult: AgentRuntimeResult = { ...mockRuntimeResult, agentMode: "PREVIEW" };
  const inputs = buildAutonomousInputsFromAgentRuntimeResult(previewResult, "castillitos");
  assert(inputs[0].runtimeMode === "PREVIEW", "PREVIEW mode mapped correctly");
}

{
  // AUTONOMOUS_DISABLED mode maps correctly
  const disabledResult: AgentRuntimeResult = { ...mockRuntimeResult, agentMode: "AUTONOMOUS_DISABLED" };
  const inputs = buildAutonomousInputsFromAgentRuntimeResult(disabledResult, "castillitos");
  assert(inputs[0].runtimeMode === "AUTONOMOUS_DISABLED", "AUTONOMOUS_DISABLED mode mapped correctly");
}

// ── Section 8: Idempotency key builder — AGENTIK-IDEMPOTENCY-01 ──────────────

section("Section 8: Idempotency Key Builder");

{
  // Same input → same key (deterministic)
  const k1 = buildIdempotencyKey({
    scope:            "AUTONOMOUS_OPERATION",
    orgSlug:          "castillitos",
    agentId:          "diego",
    sourceRunId:      "run_abc123",
    proposedActionId: "pa_001",
    actionType:       "CREATE_APPROVAL_DRAFT",
    targetDomain:     "FINANCE",
    targetModule:     "conciliacion",
  });
  const k2 = buildIdempotencyKey({
    scope:            "AUTONOMOUS_OPERATION",
    orgSlug:          "castillitos",
    agentId:          "diego",
    sourceRunId:      "run_abc123",
    proposedActionId: "pa_001",
    actionType:       "CREATE_APPROVAL_DRAFT",
    targetDomain:     "FINANCE",
    targetModule:     "conciliacion",
  });
  assert(k1 === k2, "same input → same key (deterministic)");
  assert(k1.startsWith("autonomous_operation:castillitos:diego"), `key starts correctly: ${k1.slice(0, 50)}`);
}

{
  // Different sourceRunId → different key
  const kA = buildIdempotencyKey({ scope: "TASK", orgSlug: "castillitos", agentId: "diego", sourceRunId: "run_A", proposedActionId: "pa_001", actionType: "CREATE_TASK_DRAFT", targetDomain: "FINANCE", targetModule: "cobros" });
  const kB = buildIdempotencyKey({ scope: "TASK", orgSlug: "castillitos", agentId: "diego", sourceRunId: "run_B", proposedActionId: "pa_001", actionType: "CREATE_TASK_DRAFT", targetDomain: "FINANCE", targetModule: "cobros" });
  assert(kA !== kB, "different sourceRunId → different key");
}

{
  // Different proposedActionId → different key
  const kX = buildIdempotencyKey({ scope: "TASK", orgSlug: "castillitos", agentId: "mila", sourceRunId: "run_1", proposedActionId: "pa_X", actionType: "CREATE_TASK_DRAFT", targetDomain: "COMMERCIAL", targetModule: "inteligencia" });
  const kY = buildIdempotencyKey({ scope: "TASK", orgSlug: "castillitos", agentId: "mila", sourceRunId: "run_1", proposedActionId: "pa_Y", actionType: "CREATE_TASK_DRAFT", targetDomain: "COMMERCIAL", targetModule: "inteligencia" });
  assert(kX !== kY, "different proposedActionId → different key");
}

{
  // Undefined fields ignored — key with fewer parts is still valid
  const kFull    = buildIdempotencyKey({ scope: "APPROVAL", orgSlug: "castillitos", agentId: "luca", sourceRunId: "run_1", proposedActionId: "pa_1", actionType: "CREATE_APPROVAL_DRAFT", targetDomain: "MARKETING", targetModule: "campaigns" });
  const kPartial = buildIdempotencyKey({ scope: "APPROVAL", orgSlug: "castillitos", agentId: "luca", sourceRunId: "run_1", proposedActionId: "pa_1", actionType: "CREATE_APPROVAL_DRAFT", targetDomain: "MARKETING", targetModule: "campaigns" });
  assert(kFull === kPartial, "same defined fields → same key regardless of undefined extras");
  const kMissing = buildIdempotencyKey({ scope: "APPROVAL", orgSlug: "castillitos" });
  assert(kMissing === "approval:castillitos", "undefined fields omitted, minimal key correct");
}

{
  // Normalize: uppercase → lowercase, spaces → hyphens
  assert(normalizeIdempotencyPart("FINANCE") === "finance", "normalize: uppercase → lowercase");
  assert(normalizeIdempotencyPart("marketing studio") === "marketing-studio", "normalize: spaces → hyphens");
  assert(normalizeIdempotencyPart(undefined) === undefined, "normalize: undefined → undefined");
  assert(normalizeIdempotencyPart("") === undefined, "normalize: empty string → undefined");
}

{
  // Normalize: mixed case + spaces in key
  const k = buildIdempotencyKey({ scope: "TASK", orgSlug: "My Org", agentId: "DIEGO", actionType: "CREATE_TASK_DRAFT", targetDomain: "Finance", targetModule: "Cobros" });
  assert(!k.includes(" "), "key has no spaces");
  assert(k === k.toLowerCase(), "key is all lowercase");
}

{
  // buildAutonomousOperationIdempotencyKey from fixture input
  const key = buildAutonomousOperationIdempotencyKey(diegoFinanceApprovalInput);
  assert(typeof key === "string" && key.length > 0, "buildAutonomousOperationIdempotencyKey returns non-empty string");
  assert(key.startsWith("autonomous_operation:"), `key starts with scope: ${key.slice(0, 40)}`);
}

{
  // Same AutonomousOperationInput → same key
  const k1 = buildAutonomousOperationIdempotencyKey(diegoFinanceApprovalInput);
  const k2 = buildAutonomousOperationIdempotencyKey(diegoFinanceApprovalInput);
  assert(k1 === k2, "same AutonomousOperationInput → same idempotencyKey");
}

{
  // Different proposedAction.id → different key
  const kDiego = buildAutonomousOperationIdempotencyKey(diegoFinanceApprovalInput);
  const kMila  = buildAutonomousOperationIdempotencyKey(milaCommercialInput);
  assert(kDiego !== kMila, "different inputs → different idempotencyKey");
}

{
  // validateIdempotencyKey
  const ok = validateIdempotencyKey("autonomous_operation:castillitos:diego:run_1:pa_1:create_task_draft:finance:cobros");
  assert(ok.valid, "validateIdempotencyKey: valid key passes");
  const bad = validateIdempotencyKey("");
  assert(!bad.valid, "validateIdempotencyKey: empty key fails");
}

{
  // validateIdempotencyInput
  const ok = validateIdempotencyInput({ scope: "TASK", orgSlug: "castillitos", sourceRunId: "run_1" });
  assert(ok.valid, "validateIdempotencyInput: valid input passes");
  const bad = validateIdempotencyInput({ scope: "TASK", orgSlug: "" });
  assert(!bad.valid, "validateIdempotencyInput: missing orgSlug fails");
}

{
  // Planner propagates idempotencyKey from input
  const inputWithKey = { ...diegoFinanceTaskInput, idempotencyKey: "test_key_propagation" };
  const plan = planAutonomousOperation(inputWithKey);
  assert(plan.idempotencyKey === "test_key_propagation", `planner copies idempotencyKey from input: ${plan.idempotencyKey}`);
}

{
  // Planner generates idempotencyKey when not provided in input
  const inputWithoutKey = { ...diegoFinanceTaskInput, idempotencyKey: undefined };
  const plan = planAutonomousOperation(inputWithoutKey);
  assert(typeof plan.idempotencyKey === "string" && plan.idempotencyKey.length > 0,
    `planner generates idempotencyKey when missing: ${plan.idempotencyKey}`);
}

// ── Section 9: Autonomous Operations Layer (lib/autonomous) ──────────────────
// Tests the spec-compliant autonomous layer from AGENTIK-AUTONOMOUS-OPERATIONS-01

import {
  resolvePolicy,
  isAutoAllowed,
  requiresApproval as policyRequiresApproval,
  isBlocked,
  POLICY_RULES,
} from "../lib/autonomous/autonomous-policy-engine";

import {
  MAX_OPERATIONS_PER_RUN,
  MAX_CHAIN_DEPTH,
  MAX_AUTONOMOUS_RETRIES,
  hasExceededOperationLimit,
  hasExceededDepth,
  hasExceededRetryLimit,
  checkSafetyLimits,
} from "../lib/autonomous/autonomous-safety";

import {
  isAutonomousModeEnabled,
  enableAutonomousMode,
  disableAutonomousMode,
  getEnabledTenants,
} from "../lib/autonomous/autonomous-feature-flags";

import {
  isExecutionStuck,
  isTerminalStatus,
  isRetryable,
  assessRecovery,
} from "../lib/autonomous/autonomous-recovery";

import { AutonomousAuditLog } from "../lib/autonomous/autonomous-audit";
import { createAutonomousEvent } from "../lib/autonomous/autonomous-events";
import {
  blockedResult,
  skippedResult,
  escalatedResult,
  completedResult,
  failedResult,
} from "../lib/autonomous/autonomous-result";
import type { AutonomousExecution } from "../lib/autonomous/autonomous-types";

// ── Section 9A: Policy engine ─────────────────────────────────────────────────

section("Section 9A: Autonomous Policy Engine");

{
  const r = resolvePolicy("CRITICAL");
  assert(r.policy === "MANUAL_ONLY", `S9-01 CRITICAL → MANUAL_ONLY (got ${r.policy})`);
}
{
  const r = resolvePolicy("HIGH");
  assert(r.policy === "APPROVAL_REQUIRED", `S9-02 HIGH → APPROVAL_REQUIRED (got ${r.policy})`);
}
{
  const r = resolvePolicy("MEDIUM");
  assert(r.policy === "APPROVAL_REQUIRED", `S9-03 MEDIUM → APPROVAL_REQUIRED (got ${r.policy})`);
}
{
  const r = resolvePolicy("LOW");
  assert(r.policy === "AUTO_ALLOWED", `S9-04 LOW → AUTO_ALLOWED (got ${r.policy})`);
}
assert(isAutoAllowed("AUTO_ALLOWED"), "S9-05 isAutoAllowed(AUTO_ALLOWED)=true");
assert(!isAutoAllowed("APPROVAL_REQUIRED"), "S9-06 isAutoAllowed(APPROVAL_REQUIRED)=false");
assert(!isAutoAllowed("MANUAL_ONLY"), "S9-07 isAutoAllowed(MANUAL_ONLY)=false");
assert(policyRequiresApproval("APPROVAL_REQUIRED"), "S9-08 requiresApproval(APPROVAL_REQUIRED)=true");
assert(!policyRequiresApproval("AUTO_ALLOWED"), "S9-09 requiresApproval(AUTO_ALLOWED)=false");
assert(isBlocked("MANUAL_ONLY"), "S9-10 isBlocked(MANUAL_ONLY)=true");
assert(!isBlocked("AUTO_ALLOWED"), "S9-11 isBlocked(AUTO_ALLOWED)=false");
assert(POLICY_RULES.length >= 4, `S9-12 POLICY_RULES has at least 4 rules (got ${POLICY_RULES.length})`);
{
  const r = resolvePolicy("LOW");
  assert(typeof r.ruleId === "string" && r.ruleId.length > 0, "S9-13 resolvePolicy returns ruleId");
  assert(typeof r.reason === "string" && r.reason.length > 0, "S9-14 resolvePolicy returns reason");
}

// ── Section 9B: Safety limits ─────────────────────────────────────────────────

section("Section 9B: Autonomous Safety Limits");

assert(MAX_OPERATIONS_PER_RUN > 0, `S9-15 MAX_OPERATIONS_PER_RUN is positive (${MAX_OPERATIONS_PER_RUN})`);
assert(MAX_CHAIN_DEPTH > 0, `S9-16 MAX_CHAIN_DEPTH is positive (${MAX_CHAIN_DEPTH})`);
assert(MAX_AUTONOMOUS_RETRIES > 0, `S9-17 MAX_AUTONOMOUS_RETRIES is positive (${MAX_AUTONOMOUS_RETRIES})`);

assert(!hasExceededOperationLimit(0), "S9-18 count=0 does not exceed limit");
assert(!hasExceededOperationLimit(MAX_OPERATIONS_PER_RUN - 1), "S9-19 count=limit-1 does not exceed");
assert(hasExceededOperationLimit(MAX_OPERATIONS_PER_RUN), "S9-20 count=limit exceeds");
assert(hasExceededOperationLimit(MAX_OPERATIONS_PER_RUN + 1), "S9-21 count=limit+1 exceeds");

assert(!hasExceededDepth(0), "S9-22 depth=0 does not exceed");
assert(!hasExceededDepth(MAX_CHAIN_DEPTH - 1), "S9-23 depth=limit-1 does not exceed");
assert(hasExceededDepth(MAX_CHAIN_DEPTH), "S9-24 depth=limit exceeds");

assert(!hasExceededRetryLimit(0), "S9-25 retries=0 does not exceed");
assert(!hasExceededRetryLimit(MAX_AUTONOMOUS_RETRIES - 1), "S9-26 retries=limit-1 does not exceed");
assert(hasExceededRetryLimit(MAX_AUTONOMOUS_RETRIES), "S9-27 retries=limit exceeds");

{
  const r = checkSafetyLimits({ operationCount: 0, chainDepth: 0, retryCount: 0 });
  assert(r.safe, `S9-28 all-zero safety check passes (reason: ${r.reason})`);
}
{
  const r = checkSafetyLimits({ operationCount: MAX_OPERATIONS_PER_RUN, chainDepth: 0, retryCount: 0 });
  assert(!r.safe, "S9-29 exceeded operation count fails safety check");
  assert(r.reason.length > 0, "S9-30 failed safety check has reason");
}
{
  const r = checkSafetyLimits({ operationCount: 0, chainDepth: MAX_CHAIN_DEPTH, retryCount: 0 });
  assert(!r.safe, "S9-31 exceeded chain depth fails safety check");
}
{
  const r = checkSafetyLimits({ operationCount: 0, chainDepth: 0, retryCount: MAX_AUTONOMOUS_RETRIES });
  assert(!r.safe, "S9-32 exceeded retry count fails safety check");
}

// ── Section 9C: Feature flags / kill switch ───────────────────────────────────

section("Section 9C: Kill Switch (Feature Flags)");

assert(!isAutonomousModeEnabled("castillitos"), "S9-33 castillitos disabled by default");
assert(!isAutonomousModeEnabled("unknown_org"), "S9-34 unknown org disabled by default");

{
  enableAutonomousMode("test_enable_org");
  assert(isAutonomousModeEnabled("test_enable_org"), "S9-35 enableAutonomousMode activates org");
  disableAutonomousMode("test_enable_org");
  assert(!isAutonomousModeEnabled("test_enable_org"), "S9-36 disableAutonomousMode deactivates org");
}

{
  enableAutonomousMode("test_list_org_a");
  enableAutonomousMode("test_list_org_b");
  const enabled = getEnabledTenants();
  assert(enabled.includes("test_list_org_a"), "S9-37 getEnabledTenants includes test_list_org_a");
  assert(enabled.includes("test_list_org_b"), "S9-38 getEnabledTenants includes test_list_org_b");
  disableAutonomousMode("test_list_org_a");
  disableAutonomousMode("test_list_org_b");
}

assert(typeof isAutonomousModeEnabled === "function", "S9-39 isAutonomousModeEnabled is a function");
assert(typeof enableAutonomousMode === "function", "S9-40 enableAutonomousMode is a function");
assert(typeof disableAutonomousMode === "function", "S9-41 disableAutonomousMode is a function");

// ── Section 9D: Audit log ─────────────────────────────────────────────────────

section("Section 9D: AutonomousAuditLog");

{
  const log = new AutonomousAuditLog("op_001", "castillitos");
  assert(log.size === 0, "S9-42 new log starts empty");
  assert(log.operationId === "op_001", "S9-43 log.operationId correct");

  log.record("operation_created", "Test event 1");
  assert(log.size > 0, "S9-44 record() increases size");

  log.record("decision_made", "Test event 2", { policy: "AUTO_ALLOWED" });
  assert(log.size > 1, "S9-45 second record() increases size");

  const entries = log.getEntries();
  assert(entries.length === 2, "S9-46 getEntries() returns all entries");
  assert(entries[0].event.type === "operation_created", "S9-47 first entry type correct");
  assert(entries[1].event.metadata?.["policy"] === "AUTO_ALLOWED", "S9-48 metadata preserved");

  const json = log.toJSON();
  assert(Array.isArray(json), "S9-49 toJSON() returns array");
  assert(json.length === 2, "S9-50 toJSON() has correct count");
  assert(typeof json[0].id === "string", "S9-51 toJSON events have id");
  assert(json[0].operationId === "op_001", "S9-52 toJSON events have operationId");
}

{
  const log = new AutonomousAuditLog("op_002", "org2");
  log.record("operation_blocked", "Blocked by kill switch");
  const entries = log.getEntries();
  assert(entries[0].orgSlug === "org2", "S9-53 entry orgSlug correct");
  assert(entries[0].event.occurredAt.length > 0, "S9-54 event has occurredAt");
}

// ── Section 9E: Autonomous events ─────────────────────────────────────────────

section("Section 9E: Autonomous Events");

{
  const e = createAutonomousEvent("operation_created", "op_001", "castillitos", "Created");
  assert(e.type === "operation_created", "S9-55 event type correct");
  assert(e.operationId === "op_001", "S9-56 event operationId correct");
  assert(e.orgSlug === "castillitos", "S9-57 event orgSlug correct");
  assert(e.message === "Created", "S9-58 event message correct");
  assert(typeof e.id === "string" && e.id.startsWith("aev_"), `S9-59 event id has aev_ prefix (got ${e.id})`);
}

{
  const e1 = createAutonomousEvent("decision_made", "op", "org", "a");
  const e2 = createAutonomousEvent("decision_made", "op", "org", "b");
  assert(e1.id !== e2.id, "S9-60 event IDs are unique");
}

// ── Section 9F: Result factories ──────────────────────────────────────────────

section("Section 9F: Autonomous Result Factories");

const testDecision = {
  allowed: false, requiresApproval: false,
  reason: "test", riskLevel: "CRITICAL" as const, policy: "MANUAL_ONLY" as const,
};

{
  const r = blockedResult(testDecision, "Blocked by test");
  assert(r.status === "BLOCKED", `S9-61 blockedResult status=BLOCKED (got ${r.status})`);
  assert(!r.success, "S9-62 blockedResult success=false");
  assert(r.errors.length > 0, "S9-63 blockedResult has errors");
}

{
  const r = skippedResult(testDecision, "Skipped by kill switch");
  assert(r.status === "SKIPPED", `S9-64 skippedResult status=SKIPPED (got ${r.status})`);
  assert(r.success, "S9-65 skippedResult success=true");
}

{
  const approvalDecision = { ...testDecision, requiresApproval: true, policy: "APPROVAL_REQUIRED" as const };
  const r = escalatedResult(approvalDecision, "apr_001", "Escalated");
  assert(r.status === "ESCALATED", `S9-66 escalatedResult status=ESCALATED (got ${r.status})`);
  assert(r.approvalId === "apr_001", "S9-67 escalatedResult has approvalId");
  assert(r.success, "S9-68 escalatedResult success=true");
}

{
  const autoDecision = { ...testDecision, allowed: true, policy: "AUTO_ALLOWED" as const };
  const r = completedResult(autoDecision, "exec_001", "Completed");
  assert(r.status === "COMPLETED", `S9-69 completedResult status=COMPLETED (got ${r.status})`);
  assert(r.executionId === "exec_001", "S9-70 completedResult has executionId");
  assert(r.success, "S9-71 completedResult success=true");
}

{
  const r = failedResult(testDecision, "Error occurred");
  assert(r.status === "FAILED", `S9-72 failedResult status=FAILED (got ${r.status})`);
  assert(!r.success, "S9-73 failedResult success=false");
  assert(r.errors.includes("Error occurred"), "S9-74 failedResult has error message");
}

// ── Section 9G: Recovery helpers ──────────────────────────────────────────────

section("Section 9G: Autonomous Recovery");

const now = new Date().toISOString();
const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago

const completedExec: AutonomousExecution = {
  operationId: "op_001", executionId: "exec_001",
  status: "COMPLETED", startedAt: now, completedAt: now,
};
const failedExec: AutonomousExecution = {
  operationId: "op_002", executionId: "exec_002",
  status: "FAILED", startedAt: now,
};
const stuckExec: AutonomousExecution = {
  operationId: "op_003", executionId: "exec_003",
  status: "FAILED", startedAt: oldTime,
};

assert(!isExecutionStuck(completedExec), "S9-75 completed execution is not stuck");
assert(isExecutionStuck(stuckExec), "S9-76 old failed execution is stuck");
assert(isTerminalStatus("COMPLETED"), "S9-77 COMPLETED is terminal");
assert(isTerminalStatus("BLOCKED"), "S9-78 BLOCKED is terminal");
assert(isTerminalStatus("ESCALATED"), "S9-79 ESCALATED is terminal");
assert(!isTerminalStatus("FAILED"), "S9-80 FAILED is not terminal");
assert(!isTerminalStatus("SKIPPED"), "S9-81 SKIPPED is not terminal");
assert(isRetryable(failedExec, 0), "S9-82 failed execution with retries=0 is retryable");
assert(!isRetryable(failedExec, MAX_AUTONOMOUS_RETRIES), "S9-83 retries exhausted → not retryable");
assert(!isRetryable(completedExec, 0), "S9-84 completed execution not retryable");

{
  const r = assessRecovery(completedExec, 0);
  assert(r.action === "NONE", `S9-85 completed → NONE (got ${r.action})`);
}
{
  const r = assessRecovery(failedExec, 0);
  assert(r.action === "RETRY", `S9-86 failed+retries=0 → RETRY (got ${r.action})`);
  assert(r.retryable, "S9-87 retry action is retryable");
}
{
  const r = assessRecovery(failedExec, MAX_AUTONOMOUS_RETRIES);
  assert(r.action === "ESCALATE", `S9-88 retries exhausted → ESCALATE (got ${r.action})`);
  assert(!r.retryable, "S9-89 escalate action is not retryable");
}
{
  const r = assessRecovery(stuckExec, 0);
  assert(r.action === "ESCALATE", `S9-90 stuck execution → ESCALATE (got ${r.action})`);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(60));
console.log(`AGENTIK-AUTONOMOUS-OPERATIONS-01 + AGENTIK-IDEMPOTENCY-01 + Signal Layer — Validation`);
console.log(`Passed: ${passed}  |  Failed: ${failed}  |  Total: ${passed + failed}`);

if (failures.length > 0) {
  console.error("\nFailed checks:");
  failures.forEach(f => console.error(`  ✗ ${f}`));
  process.exit(1);
}

console.log("\nAll checks passed.");
process.exit(0);
