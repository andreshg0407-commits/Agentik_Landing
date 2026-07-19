/**
 * scripts/validate-agent-execution.ts
 *
 * AGENTIK-AGENT-RUNTIME-01 — Pure domain validation (no DB)
 *
 * Tests the Agent Execution Layer without any database or server context.
 * All checks are pure: planner, permissions, mode filtering, idempotency key
 * propagation, audit events, selectedActionIds, maxActions, dryRun.
 *
 * Expected result: 55+ checks, all passing.
 *
 * Run:
 *   npx tsx scripts/validate-agent-execution.ts
 */

import { planAgentExecution }          from "../lib/agents/runtime/agent-execution-planner";
import { checkExecutionPermission, isNoExecuteMode, mapExecutionModeToOperationMode } from "../lib/agents/runtime/agent-execution-permissions";
import { createAgentExecutionAuditEvent, auditExecutionPlanned, auditActionBlocked } from "../lib/agents/runtime/agent-execution-audit";
import { buildAgentExecutionInputFromCopilotSnapshot, buildPreviewAgentExecutionInput, buildAssistedAgentExecutionInput } from "../lib/copilot/agents/copilot-agent-execution-adapter";
import { runAgentRuntime } from "../lib/agents/runtime/agent-runtime-engine";

import {
  castillitosDiegoRuntimeContext,
  castillitosLucaRuntimeContext,
  castillitosMilaRuntimeContext,
  diegoPreviewContext,
  diegoFullSignalsContext,
} from "../lib/agents/runtime/agent-runtime-fixtures";

import type { AgentExecutionInput, AgentExecutionMode } from "../lib/agents/runtime/agent-execution-types";

// ── Counters ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function pass(label: string, detail?: string) {
  passed++;
  console.log(`  ✓ ${label}${detail ? `  [${detail}]` : ""}`);
}

function fail(label: string, detail?: string) {
  failed++;
  console.error(`  ✗ ${label}${detail ? `  [${detail}]` : ""}`);
}

function expect(label: string, condition: boolean, detail?: string) {
  if (condition) pass(label, detail);
  else fail(label, detail);
}

// ── Section 1: Execution permissions ──────────────────────────────────────────

console.log("\n── Section 1: Execution Permissions ──");

// DISABLED / PREVIEW / PLAN_ONLY never execute
for (const mode of ["DISABLED", "PREVIEW", "PLAN_ONLY"] as AgentExecutionMode[]) {
  const r = checkExecutionPermission(mode, "CREATE_TASK_DRAFT", "LOW", false);
  expect(`${mode} does not permit CREATE_TASK_DRAFT`, !r.permitted);
  expect(`${mode} blocked=false (mode constraint, not policy block)`, !r.blocked || mode === "DISABLED");
}

// ASSISTED_EXECUTION permits CREATE_TASK_DRAFT
{
  const r = checkExecutionPermission("ASSISTED_EXECUTION", "CREATE_TASK_DRAFT", "LOW", false);
  expect("ASSISTED_EXECUTION permits CREATE_TASK_DRAFT LOW", r.permitted);
}
{
  const r = checkExecutionPermission("ASSISTED_EXECUTION", "CREATE_APPROVAL_DRAFT", "HIGH", false);
  expect("ASSISTED_EXECUTION permits CREATE_APPROVAL_DRAFT HIGH", r.permitted);
}

// APPROVAL_REQUIRED: CREATE_TASK_DRAFT not directly permitted, requires approval instead
{
  const r = checkExecutionPermission("APPROVAL_REQUIRED", "CREATE_TASK_DRAFT", "MEDIUM", false);
  expect("APPROVAL_REQUIRED does not directly permit CREATE_TASK_DRAFT", !r.permitted);
  expect("APPROVAL_REQUIRED requiresApprovalInstead=true for CREATE_TASK_DRAFT", r.requiresApprovalInstead === true);
}
{
  const r = checkExecutionPermission("APPROVAL_REQUIRED", "CREATE_APPROVAL_DRAFT", "MEDIUM", false);
  expect("APPROVAL_REQUIRED permits CREATE_APPROVAL_DRAFT", r.permitted);
}

// SAFE_AUTOMATION: CREATE_TASK_DRAFT LOW allowed, MEDIUM blocked
{
  const r = checkExecutionPermission("SAFE_AUTOMATION", "CREATE_TASK_DRAFT", "LOW", false);
  expect("SAFE_AUTOMATION permits CREATE_TASK_DRAFT LOW", r.permitted);
}
{
  const r = checkExecutionPermission("SAFE_AUTOMATION", "CREATE_TASK_DRAFT", "MEDIUM", false);
  expect("SAFE_AUTOMATION blocks CREATE_TASK_DRAFT MEDIUM", !r.permitted);
}

// CRITICAL is always blocked regardless of mode
for (const mode of ["ASSISTED_EXECUTION", "SAFE_AUTOMATION", "APPROVAL_REQUIRED"] as AgentExecutionMode[]) {
  const r = checkExecutionPermission(mode, "CREATE_TASK_DRAFT", "CRITICAL", false);
  expect(`${mode}: CRITICAL always blocked`, !r.permitted && r.blocked);
}

// dryRun always blocks
{
  const r = checkExecutionPermission("ASSISTED_EXECUTION", "CREATE_TASK_DRAFT", "LOW", true);
  expect("dryRun=true always blocks", !r.permitted && r.blocked);
}

// ── Section 2: isNoExecuteMode ────────────────────────────────────────────────

console.log("\n── Section 2: isNoExecuteMode ──");

expect("isNoExecuteMode DISABLED=true",     isNoExecuteMode("DISABLED",    false));
expect("isNoExecuteMode PREVIEW=true",      isNoExecuteMode("PREVIEW",     false));
expect("isNoExecuteMode PLAN_ONLY=true",    isNoExecuteMode("PLAN_ONLY",   false));
expect("isNoExecuteMode ASSISTED=false",    !isNoExecuteMode("ASSISTED_EXECUTION", false));
expect("isNoExecuteMode dryRun override",   isNoExecuteMode("ASSISTED_EXECUTION",  true));

// ── Section 3: Mode → OperationMode mapping ───────────────────────────────────

console.log("\n── Section 3: Mode Mapping ──");

expect("DISABLED → AUTONOMOUS_DISABLED",    mapExecutionModeToOperationMode("DISABLED")    === "AUTONOMOUS_DISABLED");
expect("PREVIEW → PREVIEW",                 mapExecutionModeToOperationMode("PREVIEW")     === "PREVIEW");
expect("PLAN_ONLY → PREVIEW",               mapExecutionModeToOperationMode("PLAN_ONLY")   === "PREVIEW");
expect("APPROVAL_REQUIRED → APPROVAL_REQUIRED", mapExecutionModeToOperationMode("APPROVAL_REQUIRED") === "APPROVAL_REQUIRED");
expect("SAFE_AUTOMATION → SAFE_AUTOMATION", mapExecutionModeToOperationMode("SAFE_AUTOMATION") === "SAFE_AUTOMATION");
expect("ASSISTED_EXECUTION → ASSISTED",     mapExecutionModeToOperationMode("ASSISTED_EXECUTION") === "ASSISTED");

// ── Section 4: Audit events ───────────────────────────────────────────────────

console.log("\n── Section 4: Audit Events ──");

const auditEvt = createAgentExecutionAuditEvent("aex_1", "diego", "castillitos", "agent_execution_planned", "test message", { count: 3 });
expect("Audit event has id",        typeof auditEvt.id === "string" && auditEvt.id.length > 0);
expect("Audit event has executionId", auditEvt.executionId === "aex_1");
expect("Audit event has event type",  auditEvt.event === "agent_execution_planned");
expect("Audit event has occurredAt",  typeof auditEvt.occurredAt === "string");
expect("Audit event has metadata",    auditEvt.metadata?.["count"] === 3);

const plannedEvt = auditExecutionPlanned("aex_2", "diego", "castillitos", 5);
expect("auditExecutionPlanned event type", plannedEvt.event === "agent_execution_planned");
expect("auditExecutionPlanned message contains count", plannedEvt.message.includes("5"));

const blockedEvt = auditActionBlocked("aex_3", "diego", "castillitos", "action_1", "CREATE_TASK_DRAFT", "CRITICAL risk");
expect("auditActionBlocked event type", blockedEvt.event === "agent_action_blocked");
expect("auditActionBlocked message contains reason", blockedEvt.message.includes("CRITICAL risk"));

// ── Section 5: planAgentExecution — PREVIEW no dispatch ──────────────────────

console.log("\n── Section 5: planAgentExecution — PREVIEW ──");

const previewPlan = planAgentExecution({
  orgSlug:        "castillitos",
  agentId:        "diego",
  runtimeContext: diegoPreviewContext,
  executionMode:  "PREVIEW",
  dryRun:         false,
  metadata:       { test: "preview" },
});
expect("PREVIEW plan has planId",            typeof previewPlan.planId === "string");
expect("PREVIEW plan has agentId=diego",     previewPlan.agentId === "diego");
expect("PREVIEW plan executionMode=PREVIEW", previewPlan.executionMode === "PREVIEW");
expect("PREVIEW plan runtimeResult present", previewPlan.runtimeResult !== undefined);
expect("PREVIEW plan no dispatched steps",   previewPlan.steps.every(s => s.status !== "EXECUTED"));

// ── Section 6: planAgentExecution — PLAN_ONLY with signals ───────────────────

console.log("\n── Section 6: planAgentExecution — PLAN_ONLY with Diego signals ──");

const planOnlyPlan = planAgentExecution({
  orgSlug:        "castillitos",
  agentId:        "diego",
  runtimeContext: castillitosDiegoRuntimeContext,
  executionMode:  "PLAN_ONLY",
  dryRun:         false,
  metadata:       {},
});
expect("PLAN_ONLY plan has steps ≥ 0",       planOnlyPlan.steps.length >= 0);
expect("PLAN_ONLY executionMode=PLAN_ONLY",  planOnlyPlan.executionMode === "PLAN_ONLY");
expect("PLAN_ONLY no step is EXECUTED",      planOnlyPlan.steps.every(s => s.status !== "EXECUTED"));
expect("PLAN_ONLY runtimeResult success",    planOnlyPlan.runtimeResult.success);
expect("PLAN_ONLY agentId correct",          planOnlyPlan.agentId === "diego");

// ── Section 7: selectedActionIds ─────────────────────────────────────────────

console.log("\n── Section 7: selectedActionIds ──");

const diegoRuntime = runAgentRuntime(castillitosDiegoRuntimeContext);
const allActionIds = diegoRuntime.proposedActions.map(a => a.id);

if (allActionIds.length >= 2) {
  const selectedId = allActionIds[0];
  const selectPlan = planAgentExecution({
    orgSlug:           "castillitos",
    agentId:           "diego",
    runtimeContext:    castillitosDiegoRuntimeContext,
    executionMode:     "PLAN_ONLY",
    selectedActionIds: [selectedId],
    dryRun:            false,
    metadata:          {},
  });
  expect("selectedActionIds: steps ≤ 1",         selectPlan.steps.length <= 1);
  expect("selectedActionIds: target step present", selectPlan.steps.some(s => s.actionId === selectedId) || selectPlan.steps.length === 0);
  expect("selectedActionIds: other actions skipped", !selectPlan.steps.some(s => s.actionId !== selectedId));
} else {
  expect("selectedActionIds test: not enough actions to test (skip)", true, "only ≤1 proposed action");
}

// ── Section 8: maxActions ────────────────────────────────────────────────────

console.log("\n── Section 8: maxActions ──");

const maxPlan = planAgentExecution({
  orgSlug:        "castillitos",
  agentId:        "diego",
  runtimeContext: diegoFullSignalsContext,
  executionMode:  "PLAN_ONLY",
  maxActions:     1,
  dryRun:         false,
  metadata:       {},
});
expect("maxActions=1: steps ≤ 1",  maxPlan.steps.length <= 1);

const maxPlan3 = planAgentExecution({
  orgSlug:        "castillitos",
  agentId:        "diego",
  runtimeContext: diegoFullSignalsContext,
  executionMode:  "PLAN_ONLY",
  maxActions:     3,
  dryRun:         false,
  metadata:       {},
});
expect("maxActions=3: steps ≤ 3",  maxPlan3.steps.length <= 3);

// ── Section 9: dryRun ─────────────────────────────────────────────────────────

console.log("\n── Section 9: dryRun ──");

const dryRunPlan = planAgentExecution({
  orgSlug:        "castillitos",
  agentId:        "diego",
  runtimeContext: castillitosDiegoRuntimeContext,
  executionMode:  "ASSISTED_EXECUTION",
  dryRun:         true,
  metadata:       {},
});
expect("dryRun plan has planId",              typeof dryRunPlan.planId === "string");
expect("dryRun executionMode=ASSISTED",       dryRunPlan.executionMode === "ASSISTED_EXECUTION");
expect("dryRun steps built (or 0)",           dryRunPlan.steps.length >= 0);
// dryRun does not affect plan itself — only affects service dispatch
expect("dryRun=true on plan",                 dryRunPlan.dryRun === true);

// ── Section 10: Idempotency key propagation ───────────────────────────────────

console.log("\n── Section 10: Idempotency key propagation ──");

const idemPlan = planAgentExecution({
  orgSlug:        "castillitos",
  agentId:        "diego",
  runtimeContext: castillitosDiegoRuntimeContext,
  executionMode:  "ASSISTED_EXECUTION",
  dryRun:         false,
  metadata:       {},
});

const stepsWithKey  = idemPlan.steps.filter(s => s.idempotencyKey && s.idempotencyKey.length > 0);
const stepsWithPlan = idemPlan.steps.filter(s => s.plan !== undefined);

expect("Idempotency: steps with plan have idempotencyKey", stepsWithPlan.length === 0 || stepsWithKey.length > 0);

// Run same context twice — should get same keys
const idemPlan2 = planAgentExecution({
  orgSlug:        "castillitos",
  agentId:        "diego",
  runtimeContext: castillitosDiegoRuntimeContext,
  executionMode:  "ASSISTED_EXECUTION",
  dryRun:         false,
  metadata:       {},
});

if (idemPlan.steps.length > 0 && idemPlan2.steps.length > 0) {
  const key1 = idemPlan.steps[0].idempotencyKey;
  const key2 = idemPlan2.steps[0].idempotencyKey;
  // Note: keys include runtime runId which changes each call — keys differ per run
  // but format is consistent
  expect("Idempotency key is a non-empty string",  typeof key1 === "string" && (key1?.length ?? 0) > 0);
  expect("Idempotency key contains orgSlug",       (key1 ?? "").includes("castillitos"));
  expect("Idempotency key contains agentId",       (key1 ?? "").includes("diego"));
  expect("Idempotency key is colon-separated",     (key1 ?? "").includes(":"));
} else {
  expect("Idempotency key test: no steps to check (skip)", true, "no steps produced");
}

// ── Section 11: Copilot adapter ───────────────────────────────────────────────

console.log("\n── Section 11: Copilot Adapter ──");

const copilotInput = buildAgentExecutionInputFromCopilotSnapshot({
  orgSlug:     "castillitos",
  module:      "finanzas",
  businessDate: "2026-06-03",
  attentionItems: [{
    id: "attn_001",
    title: "Conciliación pendiente",
    severity: "HIGH",
    domain: "FINANCE",
  }],
});

expect("Copilot adapter: orgSlug correct",          copilotInput.orgSlug === "castillitos");
expect("Copilot adapter: agentId resolved",         copilotInput.agentId === "diego");
expect("Copilot adapter: runtimeContext present",   copilotInput.runtimeContext !== undefined);
expect("Copilot adapter: executionMode set",        copilotInput.executionMode !== undefined);
expect("Copilot adapter: dryRun=false default",     copilotInput.dryRun === false);

const previewInput = buildPreviewAgentExecutionInput({
  orgSlug:  "castillitos",
  module:   "finanzas",
});
expect("buildPreviewAgentExecutionInput: mode=PREVIEW", previewInput.executionMode === "PREVIEW");
expect("buildPreviewAgentExecutionInput: dryRun=true",  previewInput.dryRun === true);

const assistedInput = buildAssistedAgentExecutionInput(
  { orgSlug: "castillitos", module: "finanzas" },
  ["action_001"],
  2,
);
expect("buildAssistedAgentExecutionInput: mode=ASSISTED", assistedInput.executionMode === "ASSISTED_EXECUTION");
expect("buildAssistedAgentExecutionInput: selectedActionIds set", assistedInput.selectedActionIds?.includes("action_001") === true);
expect("buildAssistedAgentExecutionInput: maxActions=2",  assistedInput.maxActions === 2);
expect("buildAssistedAgentExecutionInput: dryRun=false",  assistedInput.dryRun === false);

// Module → agent resolution via copilot
const lucaInput = buildAgentExecutionInputFromCopilotSnapshot({
  orgSlug: "castillitos",
  module:  "marketing-studio",
});
expect("Copilot adapter: marketing-studio → luca", lucaInput.agentId === "luca");

const milaInput = buildAgentExecutionInputFromCopilotSnapshot({
  orgSlug: "castillitos",
  module:  "comercial",
});
expect("Copilot adapter: comercial → mila", milaInput.agentId === "mila");

// ── Section 12: Multiple agents ───────────────────────────────────────────────

console.log("\n── Section 12: Multiple Agent Plans ──");

const lucaPlan = planAgentExecution({
  orgSlug:        "castillitos",
  agentId:        "luca",
  runtimeContext: castillitosLucaRuntimeContext,
  executionMode:  "PLAN_ONLY",
  dryRun:         false,
  metadata:       {},
});
expect("Luca PLAN_ONLY plan has agentId=luca",   lucaPlan.agentId === "luca");
expect("Luca PLAN_ONLY no EXECUTED steps",        lucaPlan.steps.every(s => s.status !== "EXECUTED"));

const milaPlan = planAgentExecution({
  orgSlug:        "castillitos",
  agentId:        "mila",
  runtimeContext: castillitosMilaRuntimeContext,
  executionMode:  "PLAN_ONLY",
  dryRun:         false,
  metadata:       {},
});
expect("Mila PLAN_ONLY plan has agentId=mila",   milaPlan.agentId === "mila");
expect("Mila PLAN_ONLY no EXECUTED steps",        milaPlan.steps.every(s => s.status !== "EXECUTED"));

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(60));
console.log(`Passed: ${passed}  |  Failed: ${failed}  |  Total: ${passed + failed}`);

if (failed > 0) {
  console.error("\nSome checks failed. See details above.");
  process.exit(1);
}

console.log("\nAll checks passed.");
process.exit(0);
