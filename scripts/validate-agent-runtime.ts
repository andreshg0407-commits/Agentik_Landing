/**
 * scripts/validate-agent-runtime.ts
 *
 * Agentik — Agent Runtime Validation Script
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Pure domain validation — no Prisma, no network calls.
 * Tests the full Agent Runtime pipeline end-to-end.
 *
 * Run with: npx tsx scripts/validate-agent-runtime.ts
 */

import { runAgentRuntime }            from "../lib/agents/runtime/agent-runtime-engine";
import { getActiveAgents, getAgentProfileById, resolveAgentForModule, resolveAgentForDomain } from "../lib/agents/runtime/agent-runtime-registry";
import { getCapabilitiesForAgent }    from "../lib/agents/runtime/agent-capabilities";
import { isActionAllowedByMode, isActionPermitted, canAgentUseDomain } from "../lib/agents/runtime/agent-permissions";
import { createInitialAgentState, transitionAgentState, isTerminalAgentState, isValidTransition } from "../lib/agents/runtime/agent-state";
import { createEmptyAgentMemory, summarizeAgentMemoryForDecision } from "../lib/agents/runtime/agent-memory";
import { validateAgentRuntimeContext, validateAgentProfile, validateProposedAction } from "../lib/agents/runtime/agent-runtime-audit";
import {
  castillitosDiegoRuntimeContext,
  castillitosLucaRuntimeContext,
  castillitosMilaRuntimeContext,
  diegoPreviewContext,
  diegoFullSignalsContext,
} from "../lib/agents/runtime/agent-runtime-fixtures";
import {
  DIEGO_FINANCE_AGENT,
  LUCA_MARKETING_AGENT,
  MILA_COMMERCIAL_AGENT,
} from "../lib/agents/runtime/agent-profile";
import { buildAgentRuntimeContextFromCopilotSnapshot } from "../lib/copilot/agents/copilot-agent-runtime-adapter";
import {
  financeConciliationSignal,
  marketingCampaignReadySignal,
  commercialMarginDropSignal,
} from "../lib/decisions/decision-fixtures";

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

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ── Phase 1: Profile validation ───────────────────────────────────────────────

console.log("\nPhase 1 — Profile validation");

test("Diego profile is valid", () => {
  const r = validateAgentProfile(DIEGO_FINANCE_AGENT);
  assert(r.valid, `Diego profile invalid: ${r.errors.join(", ")}`);
});

test("Luca profile is valid", () => {
  const r = validateAgentProfile(LUCA_MARKETING_AGENT);
  assert(r.valid, `Luca profile invalid: ${r.errors.join(", ")}`);
});

test("Mila profile is valid", () => {
  const r = validateAgentProfile(MILA_COMMERCIAL_AGENT);
  assert(r.valid, `Mila profile invalid: ${r.errors.join(", ")}`);
});

test("All active agents have isActive=true", () => {
  const agents = getActiveAgents();
  assert(agents.length >= 3, "Should have at least 3 active agents");
  for (const a of agents) {
    assert(a.isActive, `Agent ${a.agentId} should be active`);
  }
});

test("getAgentProfileById returns Diego", () => {
  const profile = getAgentProfileById("diego");
  assert(!!profile, "Should find Diego profile");
  assertEqual(profile.agentId, "diego", "agentId");
  assertEqual(profile.domain,  "FINANCE", "domain");
});

test("getAgentProfileById returns undefined for unknown agent", () => {
  const profile = getAgentProfileById("nonexistent_agent");
  assert(profile === undefined, "Should return undefined for unknown agent");
});

// ── Phase 2: Registry resolution ─────────────────────────────────────────────

console.log("\nPhase 2 — Registry resolution");

test("resolveAgentForModule('finanzas') returns Diego", () => {
  const profile = resolveAgentForModule("finanzas");
  assertEqual(profile.agentId, "diego", "finanzas → diego");
});

test("resolveAgentForModule('marketing') returns Luca", () => {
  const profile = resolveAgentForModule("marketing");
  assertEqual(profile.agentId, "luca", "marketing → luca");
});

test("resolveAgentForModule('comercial') returns Mila", () => {
  const profile = resolveAgentForModule("comercial");
  assertEqual(profile.agentId, "mila", "comercial → mila");
});

test("resolveAgentForModule with unknown module returns System", () => {
  const profile = resolveAgentForModule("unknown-module-xyz");
  assertEqual(profile.agentId, "system", "unknown → system");
});

test("resolveAgentForDomain('FINANCE') returns Diego", () => {
  const profile = resolveAgentForDomain("FINANCE");
  assertEqual(profile.agentId, "diego", "FINANCE → diego");
});

test("resolveAgentForDomain('MARKETING') returns Luca", () => {
  const profile = resolveAgentForDomain("MARKETING");
  assertEqual(profile.agentId, "luca", "MARKETING → luca");
});

// ── Phase 3: Capabilities ─────────────────────────────────────────────────────

console.log("\nPhase 3 — Capabilities");

test("Diego has finance capabilities", () => {
  const caps = getCapabilitiesForAgent("diego");
  assert(caps.length > 0, "Diego should have capabilities");
  const hasFinance = caps.some(c => c.domain === "FINANCE");
  assert(hasFinance, "Diego should have FINANCE capabilities");
});

test("Luca has marketing capabilities", () => {
  const caps = getCapabilitiesForAgent("luca");
  assert(caps.length > 0, "Luca should have capabilities");
  const hasMarketing = caps.some(c => c.domain === "MARKETING");
  assert(hasMarketing, "Luca should have MARKETING capabilities");
});

test("All capabilities have required fields", () => {
  const caps = getCapabilitiesForAgent("diego");
  for (const cap of caps) {
    assert(typeof cap.id         === "string", `cap.id should be string`);
    assert(typeof cap.domain     === "string", `cap.domain should be string`);
    assert(typeof cap.actionType === "string", `cap.actionType should be string`);
    assert(typeof cap.isEnabled  === "boolean", `cap.isEnabled should be boolean`);
  }
});

// ── Phase 4: Permissions ──────────────────────────────────────────────────────

console.log("\nPhase 4 — Permissions");

test("PREVIEW mode allows ANALYZE_SIGNALS", () => {
  assert(isActionAllowedByMode("PREVIEW", "ANALYZE_SIGNALS"), "PREVIEW allows ANALYZE_SIGNALS");
});

test("PREVIEW mode does NOT allow CREATE_TASK_DRAFT", () => {
  assert(!isActionAllowedByMode("PREVIEW", "CREATE_TASK_DRAFT"), "PREVIEW blocks CREATE_TASK_DRAFT");
});

test("PREVIEW mode does NOT allow CREATE_APPROVAL_DRAFT", () => {
  assert(!isActionAllowedByMode("PREVIEW", "CREATE_APPROVAL_DRAFT"), "PREVIEW blocks CREATE_APPROVAL_DRAFT");
});

test("PREVIEW mode does NOT allow START_WORKFLOW_DRAFT", () => {
  assert(!isActionAllowedByMode("PREVIEW", "START_WORKFLOW_DRAFT"), "PREVIEW blocks START_WORKFLOW_DRAFT");
});

test("ASSISTED mode allows CREATE_TASK_DRAFT", () => {
  assert(isActionAllowedByMode("ASSISTED", "CREATE_TASK_DRAFT"), "ASSISTED allows CREATE_TASK_DRAFT");
});

test("ASSISTED mode allows CREATE_APPROVAL_DRAFT", () => {
  assert(isActionAllowedByMode("ASSISTED", "CREATE_APPROVAL_DRAFT"), "ASSISTED allows CREATE_APPROVAL_DRAFT");
});

test("ASSISTED mode allows START_WORKFLOW_DRAFT", () => {
  assert(isActionAllowedByMode("ASSISTED", "START_WORKFLOW_DRAFT"), "ASSISTED allows START_WORKFLOW_DRAFT");
});

test("APPROVAL_REQUIRED allows CREATE_APPROVAL_DRAFT but not START_WORKFLOW_DRAFT", () => {
  assert(isActionAllowedByMode("APPROVAL_REQUIRED", "CREATE_APPROVAL_DRAFT"),   "APPROVAL_REQUIRED allows approval draft");
  assert(!isActionAllowedByMode("APPROVAL_REQUIRED", "START_WORKFLOW_DRAFT"),    "APPROVAL_REQUIRED blocks workflow start");
});

test("AUTONOMOUS_DISABLED allows only analysis and recommendations", () => {
  assert(isActionAllowedByMode("AUTONOMOUS_DISABLED", "ANALYZE_SIGNALS"),       "AUTONOMOUS_DISABLED allows ANALYZE_SIGNALS");
  assert(!isActionAllowedByMode("AUTONOMOUS_DISABLED", "CREATE_TASK_DRAFT"),    "AUTONOMOUS_DISABLED blocks CREATE_TASK_DRAFT");
  assert(!isActionAllowedByMode("AUTONOMOUS_DISABLED", "CREATE_APPROVAL_DRAFT"),"AUTONOMOUS_DISABLED blocks CREATE_APPROVAL_DRAFT");
  assert(!isActionAllowedByMode("AUTONOMOUS_DISABLED", "START_WORKFLOW_DRAFT"), "AUTONOMOUS_DISABLED blocks START_WORKFLOW_DRAFT");
});

test("Diego cannot operate in MARKETING domain", () => {
  assert(!canAgentUseDomain(DIEGO_FINANCE_AGENT, "MARKETING"), "Diego blocked from MARKETING");
});

test("Luca cannot operate in FINANCE domain", () => {
  assert(!canAgentUseDomain(LUCA_MARKETING_AGENT, "FINANCE"), "Luca blocked from FINANCE");
});

test("isActionPermitted blocks out-of-domain actions", () => {
  const result = isActionPermitted(LUCA_MARKETING_AGENT, "ASSISTED", "CREATE_TASK_DRAFT", "FINANCE");
  assert(!result.permitted, "Luca should be blocked from FINANCE domain");
  assert(result.reason.includes("FINANCE"), `Reason should mention FINANCE, got: ${result.reason}`);
});

// ── Phase 5: Memory helpers ───────────────────────────────────────────────────

console.log("\nPhase 5 — Memory");

test("createEmptyAgentMemory returns valid structure", () => {
  const mem = createEmptyAgentMemory("diego");
  assertEqual(mem.agentId, "diego", "agentId");
  assertEqual(mem.shortTerm.length, 0,                 "shortTerm empty");
  assertEqual(mem.recentDecisions.length, 0,           "recentDecisions empty");
  assertEqual(mem.recentRecommendations.length, 0,     "recentRecommendations empty");
  assert(typeof mem.snapshotAt === "string",           "snapshotAt is string");
});

test("summarizeAgentMemoryForDecision returns string for empty memory", () => {
  const mem     = createEmptyAgentMemory("diego");
  const summary = summarizeAgentMemoryForDecision(mem);
  assert(typeof summary === "string", "Summary should be a string");
  assert(summary.length > 0,          "Summary should not be empty string");
});

// ── Phase 6: State machine ────────────────────────────────────────────────────

console.log("\nPhase 6 — State machine");

test("createInitialAgentState returns IDLE state", () => {
  const state = createInitialAgentState("diego");
  assertEqual(state.status, "IDLE", "initial state is IDLE");
  assertEqual(state.agentId, "diego", "agentId preserved");
  assert(state.currentRunId === null, "no currentRunId initially");
});

test("transitionAgentState does not mutate original", () => {
  const initial = createInitialAgentState("diego");
  const next    = transitionAgentState(initial, "ANALYZING");
  assertEqual(initial.status, "IDLE",      "original unchanged");
  assertEqual(next.status,    "ANALYZING", "new state updated");
});

test("isTerminalAgentState returns true for COMPLETED", () => {
  const state = createInitialAgentState("diego");
  const final = transitionAgentState(state, "COMPLETED");
  assert(isTerminalAgentState(final), "COMPLETED is terminal");
});

test("isTerminalAgentState returns false for ANALYZING", () => {
  const state = createInitialAgentState("diego");
  const next  = transitionAgentState(state, "ANALYZING");
  assert(!isTerminalAgentState(next), "ANALYZING is not terminal");
});

test("isValidTransition IDLE → ANALYZING is valid", () => {
  assert(isValidTransition("IDLE", "ANALYZING"), "IDLE→ANALYZING valid");
});

test("isValidTransition COMPLETED → ANALYZING is invalid", () => {
  assert(!isValidTransition("COMPLETED", "ANALYZING"), "COMPLETED→ANALYZING invalid");
});

// ── Phase 7: Diego runs Decision Engine with finance signals ──────────────────

console.log("\nPhase 7 — Diego finance runtime");

test("Diego runtime succeeds", () => {
  const result = runAgentRuntime(castillitosDiegoRuntimeContext);
  assert(result.success, `Diego runtime failed: ${result.errors.join(", ")}`);
  assertEqual(result.agentId, "diego", "agentId");
});

test("Diego generates ProposedActions for finance signals", () => {
  const result = runAgentRuntime(castillitosDiegoRuntimeContext);
  assert(result.proposedActions.length > 0, "Diego should produce proposed actions");
});

test("Diego generates CREATE_APPROVAL_DRAFT for HIGH conciliation exception", () => {
  const ctx    = { ...castillitosDiegoRuntimeContext, signals: [financeConciliationSignal] };
  const result = runAgentRuntime(ctx);
  const hasApproval = result.proposedActions.some(a => a.type === "CREATE_APPROVAL_DRAFT");
  assert(hasApproval, "Diego should propose CREATE_APPROVAL_DRAFT for HIGH conciliation");
});

test("Diego audit trail contains runtime_started and runtime_completed", () => {
  const result = runAgentRuntime(castillitosDiegoRuntimeContext);
  const started   = result.auditTrail.some(e => e.event === "runtime_started");
  const completed = result.auditTrail.some(e => e.event === "runtime_completed");
  assert(started,   "audit should contain runtime_started");
  assert(completed, "audit should contain runtime_completed");
});

test("Diego proposed actions are ordered by score descending", () => {
  const result = runAgentRuntime(diegoFullSignalsContext);
  const scores = result.proposedActions.map(a => a.score);
  for (let i = 0; i < scores.length - 1; i++) {
    assert((scores[i] ?? 0) >= (scores[i + 1] ?? 0), `Score at ${i} should be >= ${i + 1}`);
  }
});

// ── Phase 8: Luca runs with marketing signal ──────────────────────────────────

console.log("\nPhase 8 — Luca marketing runtime");

test("Luca runtime succeeds", () => {
  const result = runAgentRuntime(castillitosLucaRuntimeContext);
  assert(result.success, `Luca runtime failed: ${result.errors.join(", ")}`);
  assertEqual(result.agentId, "luca", "agentId");
});

test("Luca generates ProposedAction for campaign ready signal", () => {
  const ctx    = { ...castillitosLucaRuntimeContext, signals: [marketingCampaignReadySignal] };
  const result = runAgentRuntime(ctx);
  assert(result.proposedActions.length > 0, "Luca should propose actions for campaign ready signal");
});

test("Luca does NOT generate actions for FINANCE signals (out of domain)", () => {
  const ctx    = {
    ...castillitosLucaRuntimeContext,
    signals:         [financeConciliationSignal],
    decisionContext: {
      ...castillitosLucaRuntimeContext.decisionContext!,
      signals: [financeConciliationSignal],
    },
  };
  // Run engine — finance signals will match finance rules
  const result = runAgentRuntime(ctx);
  // All finance-domain actions should be filtered by permission guard
  const financeActions = result.proposedActions.filter(a => a.targetDomain === "FINANCE");
  assert(financeActions.length === 0, "Luca should not produce FINANCE domain actions");
});

// ── Phase 9: Mila runs with commercial signal ────────────────────────────────

console.log("\nPhase 9 — Mila commercial runtime");

test("Mila runtime succeeds", () => {
  const result = runAgentRuntime(castillitosMilaRuntimeContext);
  assert(result.success, `Mila runtime failed: ${result.errors.join(", ")}`);
  assertEqual(result.agentId, "mila", "agentId");
});

test("Mila generates ProposedAction for commercial margin drop", () => {
  const ctx    = { ...castillitosMilaRuntimeContext, signals: [commercialMarginDropSignal] };
  const result = runAgentRuntime(ctx);
  assert(result.proposedActions.length > 0, "Mila should propose actions for margin drop");
});

// ── Phase 10: Mode enforcement ────────────────────────────────────────────────

console.log("\nPhase 10 — Mode enforcement");

test("PREVIEW mode: no CREATE_TASK_DRAFT or CREATE_APPROVAL_DRAFT actions", () => {
  const result = runAgentRuntime(diegoPreviewContext);
  const hasDraft = result.proposedActions.some(a =>
    a.type === "CREATE_TASK_DRAFT" ||
    a.type === "CREATE_APPROVAL_DRAFT" ||
    a.type === "START_WORKFLOW_DRAFT",
  );
  assert(!hasDraft, "PREVIEW mode should produce no draft actions");
});

test("APPROVAL_REQUIRED mode: has approval drafts, no workflow starts", () => {
  const result = runAgentRuntime(castillitosDiegoRuntimeContext);
  // Diego in APPROVAL_REQUIRED — should have approval drafts (ok) but no workflow starts
  const hasWorkflowDraft = result.proposedActions.some(a => a.type === "START_WORKFLOW_DRAFT");
  assert(!hasWorkflowDraft, "APPROVAL_REQUIRED should block START_WORKFLOW_DRAFT");
});

test("ASSISTED mode: Luca can propose approval drafts", () => {
  const ctx    = { ...castillitosLucaRuntimeContext, signals: [marketingCampaignReadySignal] };
  const result = runAgentRuntime(ctx);
  const hasApproval = result.proposedActions.some(a => a.type === "CREATE_APPROVAL_DRAFT");
  assert(hasApproval, "Luca in ASSISTED mode should be able to propose approval drafts");
});

// ── Phase 11: No side effects ─────────────────────────────────────────────────

console.log("\nPhase 11 — No side effects");

test("runAgentRuntime does not mutate the context object", () => {
  const originalSignalCount = castillitosDiegoRuntimeContext.signals.length;
  runAgentRuntime(castillitosDiegoRuntimeContext);
  assertEqual(castillitosDiegoRuntimeContext.signals.length, originalSignalCount, "signals not mutated");
});

test("Multiple runs produce consistent results", () => {
  const r1 = runAgentRuntime(castillitosDiegoRuntimeContext);
  const r2 = runAgentRuntime(castillitosDiegoRuntimeContext);
  assertEqual(r1.proposedActions.length, r2.proposedActions.length, "same action count");
  assertEqual(r1.proposedActions[0]?.type,  r2.proposedActions[0]?.type,  "same top action type");
  assertEqual(r1.proposedActions[0]?.score, r2.proposedActions[0]?.score, "same top action score");
});

test("runAgentRuntime with empty signals completes successfully", () => {
  const ctx    = { ...castillitosDiegoRuntimeContext, signals: [], decisionContext: undefined };
  const result = runAgentRuntime(ctx);
  assert(result.success, "Should succeed even with empty signals");
  assertEqual(result.proposedActions.length, 0, "No actions for empty signals");
});

test("runAgentRuntime with invalid profile returns failure", () => {
  const ctx    = {
    ...castillitosDiegoRuntimeContext,
    agentProfile: { ...DIEGO_FINANCE_AGENT, isActive: false },
  };
  const result = runAgentRuntime(ctx);
  assert(!result.success, "Should fail with inactive agent");
});

// ── Phase 12: ProposedAction validation ──────────────────────────────────────

console.log("\nPhase 12 — ProposedAction validation");

test("All proposed actions pass validateProposedAction", () => {
  const result = runAgentRuntime(diegoFullSignalsContext);
  for (const action of result.proposedActions) {
    const v = validateProposedAction(action);
    assert(v.valid, `Action ${action.id} invalid: ${v.errors.join(", ")}`);
  }
});

test("All proposed actions have non-empty label and targetDomain", () => {
  const result = runAgentRuntime(diegoFullSignalsContext);
  for (const action of result.proposedActions) {
    assert(action.label.length > 0,        `action ${action.id}: label should not be empty`);
    assert(action.targetDomain.length > 0, `action ${action.id}: targetDomain should not be empty`);
  }
});

test("All proposed actions have score 0–100", () => {
  const result = runAgentRuntime(diegoFullSignalsContext);
  for (const action of result.proposedActions) {
    assert(action.score >= 0 && action.score <= 100, `action ${action.id}: score ${action.score} out of range`);
  }
});

// ── Phase 13: Copilot adapter ─────────────────────────────────────────────────

console.log("\nPhase 13 — Copilot agent runtime adapter");

test("buildAgentRuntimeContextFromCopilotSnapshot builds valid context", () => {
  const snapshot = {
    orgSlug:      "castillitos",
    module:       "finanzas",
    businessDate: "2026-06-03",
    leadAgent:    { agentId: "diego", agentName: "Diego" },
    extraSignals: [financeConciliationSignal],
    metadata:     {},
  };
  const ctx = buildAgentRuntimeContextFromCopilotSnapshot(snapshot);
  const v   = validateAgentRuntimeContext(ctx);
  assert(v.valid, `Adapter-produced context invalid: ${v.errors.join(", ")}`);
});

test("Adapter resolves correct agent for module", () => {
  const snapshot = { orgSlug: "castillitos", module: "marketing", extraSignals: [marketingCampaignReadySignal] };
  const ctx      = buildAgentRuntimeContextFromCopilotSnapshot(snapshot);
  assertEqual(ctx.agentProfile.agentId, "luca", "marketing module resolves Luca");
});

test("Adapter + runtime pipeline: snapshot → context → proposed actions", () => {
  const snapshot = {
    orgSlug:      "castillitos",
    module:       "finanzas",
    businessDate: "2026-06-03",
    extraSignals: [financeConciliationSignal, financeConciliationSignal],
  };
  const ctx    = buildAgentRuntimeContextFromCopilotSnapshot(snapshot);
  const result = runAgentRuntime(ctx);
  assert(result.success,                   "Full pipeline should succeed");
  assert(result.proposedActions.length > 0, "Should produce proposed actions");
});

test("Adapter uses runtimeMode override when provided", () => {
  const snapshot = {
    orgSlug:      "castillitos",
    module:       "finanzas",
    runtimeMode:  "PREVIEW" as const,
    extraSignals: [financeConciliationSignal],
  };
  const ctx = buildAgentRuntimeContextFromCopilotSnapshot(snapshot);
  assertEqual(ctx.runtimeMode, "PREVIEW", "runtimeMode should be overridden to PREVIEW");
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n─────────────────────────────────────────────────────────────────");
console.log("AGENTIK-AGENT-RUNTIME-01 — Validation Results");
console.log("─────────────────────────────────────────────────────────────────");
console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);

if (failed > 0) {
  console.log("\nFailed tests:");
  failures.forEach(f => console.log(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log("\nAll tests passed. Agent Runtime domain is structurally valid.");

  // Print sample output
  const result = runAgentRuntime(diegoFullSignalsContext);
  console.log(`\nDiego — Full signals run: ${result.proposedActions.length} proposed actions:`);
  result.proposedActions.slice(0, 5).forEach((a, i) => {
    const approvalFlag = a.requiresApproval ? " [requires approval]" : "";
    console.log(`  ${i + 1}. [${a.targetDomain}] ${a.type}${approvalFlag} — score=${a.score} — ${a.label.slice(0, 55)}`);
  });

  const lucaResult = runAgentRuntime(castillitosLucaRuntimeContext);
  console.log(`\nLuca — Marketing run: ${lucaResult.proposedActions.length} proposed actions:`);
  lucaResult.proposedActions.slice(0, 3).forEach((a, i) => {
    console.log(`  ${i + 1}. [${a.targetDomain}] ${a.type} — score=${a.score} — ${a.label.slice(0, 55)}`);
  });

  const milaResult = runAgentRuntime(castillitosMilaRuntimeContext);
  console.log(`\nMila — Commercial run: ${milaResult.proposedActions.length} proposed actions:`);
  milaResult.proposedActions.slice(0, 3).forEach((a, i) => {
    console.log(`  ${i + 1}. [${a.targetDomain}] ${a.type} — score=${a.score} — ${a.label.slice(0, 55)}`);
  });

  process.exit(0);
}
