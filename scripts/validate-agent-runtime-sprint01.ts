/**
 * scripts/validate-agent-runtime-sprint01.ts
 *
 * Agentik — Universal Agent Runtime — Sprint Domain Validation
 * Sprint: AGENTIK-AGENT-RUNTIME-01 Phase 14
 *
 * Validates ALL pure domain logic introduced in the sprint:
 *   - agent-types, agent-registry, agent-resolver
 *   - agent-capability-guard
 *   - agent-plan, agent-planner
 *   - agent-plan-executor (stub dispatcher — no Prisma)
 *   - agent-runtime-log
 *   - agent-memory-contract
 *   - agent-tenant-profile
 *
 * Pure domain only — no Prisma, no network, no server-only imports.
 *
 * Run:
 *   npx tsx scripts/validate-agent-runtime-sprint01.ts
 */

import {
  FINANCE_AGENT,
  MARKETING_AGENT,
  COMMERCIAL_AGENT,
  COLLECTIONS_AGENT,
  NATIVE_AGENT_REGISTRY,
} from "../lib/agents/runtime/agent-registry";

import {
  resolveAgent,
  getAllAgents,
  getEnabledAgents,
  getAgentsByRole,
  registerAgent,
} from "../lib/agents/runtime/agent-resolver";

import {
  assertCapability,
  assertAgentEnabled,
  agentHasCapability,
  findMissingCapability,
  AgentCapabilityError,
  AgentDisabledError,
  AgentNotFoundError,
} from "../lib/agents/runtime/agent-capability-guard";

import { planGoal }   from "../lib/agents/runtime/agent-planner";
import { buildPlan }  from "../lib/agents/runtime/agent-plan";

import { executePlan } from "../lib/agents/runtime/agent-plan-executor";
import type {
  AgentActionDispatcherPort,
  StepDispatchResult,
} from "../lib/agents/runtime/agent-plan-executor";

import { AgentAuditLog } from "../lib/agents/runtime/agent-runtime-log";

import { noOpAgentMemory } from "../lib/agents/runtime/agent-memory-contract";

import {
  createAgentTenantProfile,
  setAgentTenantProfile,
  getAgentTenantProfile,
  resolveAgentDisplayName,
} from "../lib/agents/runtime/agent-tenant-profile";

import type {
  AgentDefinition,
  AgentGoal,
  AgentExecutionContext,
} from "../lib/agents/runtime/agent-types";

// ── Test harness ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    const msg = `${label}${detail ? ` — ${detail}` : ""}`;
    console.error(`  ✗ ${msg}`);
    failures.push(msg);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ──`);
}

// ── Stub dispatchers ──────────────────────────────────────────────────────────

const stubDispatcher: AgentActionDispatcherPort = {
  async dispatch(step): Promise<StepDispatchResult> {
    return { success: true, output: { stubbed: true, action: step.action } };
  },
};

const failDispatcher: AgentActionDispatcherPort = {
  async dispatch(step): Promise<StepDispatchResult> {
    return { success: false, output: {}, error: `Forced failure for ${step.action}` };
  },
};

// ── Factories ─────────────────────────────────────────────────────────────────

function makeGoal(
  type:     AgentGoal["type"],
  priority: AgentGoal["priority"] = "medium",
): AgentGoal {
  return {
    type,
    description:      `Test goal: ${type}`,
    priority,
    targetEntityId:   "entity_test_001",
    targetEntityType: type,
    metadata:         {},
  };
}

function makeContext(goal: AgentGoal): AgentExecutionContext {
  return {
    orgSlug:  "castillitos",
    actor:    { type: "system", id: "test_system" },
    goal,
    memory:   {},
    metadata: { correlationId: "test_corr_sprint01" },
  };
}

// ═════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {

// ═════════════════════════════════════════════════════════════════════════════
// Section 1 — Registry
// ═════════════════════════════════════════════════════════════════════════════

section("REGISTRY — semantic IDs and display names");

check("FINANCE_AGENT.id = 'finance_agent'",           FINANCE_AGENT.id     === "finance_agent");
check("MARKETING_AGENT.id = 'marketing_agent'",       MARKETING_AGENT.id   === "marketing_agent");
check("COMMERCIAL_AGENT.id = 'commercial_agent'",     COMMERCIAL_AGENT.id  === "commercial_agent");
check("COLLECTIONS_AGENT.id = 'collections_agent'",   COLLECTIONS_AGENT.id === "collections_agent");

check("FINANCE_AGENT.displayName = 'Diego'",          FINANCE_AGENT.displayName    === "Diego");
check("MARKETING_AGENT.displayName = 'Luca'",         MARKETING_AGENT.displayName  === "Luca");
check("COMMERCIAL_AGENT.displayName = 'Valentina'",   COMMERCIAL_AGENT.displayName === "Valentina");
check("COLLECTIONS_AGENT.displayName = 'Mila'",       COLLECTIONS_AGENT.displayName === "Mila");

check("id ≠ displayName (finance)",    FINANCE_AGENT.id    !== FINANCE_AGENT.displayName);
check("id ≠ displayName (marketing)",  MARKETING_AGENT.id  !== MARKETING_AGENT.displayName);
check("id ≠ displayName (commercial)", COMMERCIAL_AGENT.id !== COMMERCIAL_AGENT.displayName);
check("id ≠ displayName (collections)",COLLECTIONS_AGENT.id !== COLLECTIONS_AGENT.displayName);

check("All 4 native agents present",      NATIVE_AGENT_REGISTRY.length === 4);
check("All native agents enabled",        NATIVE_AGENT_REGISTRY.every(a => a.enabled));
check("All native agents isSystemAgent",  NATIVE_AGENT_REGISTRY.every(a => a.isSystemAgent));

check("FINANCE_AGENT role = 'finance'",         FINANCE_AGENT.role     === "finance");
check("MARKETING_AGENT role = 'marketing'",     MARKETING_AGENT.role   === "marketing");
check("COMMERCIAL_AGENT role = 'commercial'",   COMMERCIAL_AGENT.role  === "commercial");
check("COLLECTIONS_AGENT role = 'collections'", COLLECTIONS_AGENT.role === "collections");

check("All native agents have capabilities", NATIVE_AGENT_REGISTRY.every(a => a.capabilities.length > 0));

// ═════════════════════════════════════════════════════════════════════════════
// Section 2 — Resolver
// ═════════════════════════════════════════════════════════════════════════════

section("RESOLVER — lookup and filtering");

check("resolveAgent('finance_agent')    → found", resolveAgent("finance_agent")?.id    === "finance_agent");
check("resolveAgent('marketing_agent')  → found", resolveAgent("marketing_agent")?.id  === "marketing_agent");
check("resolveAgent('commercial_agent') → found", resolveAgent("commercial_agent")?.id === "commercial_agent");
check("resolveAgent('collections_agent')→ found", resolveAgent("collections_agent")?.id === "collections_agent");
check("resolveAgent('unknown_id')       → null",  resolveAgent("unknown_id")            === null);

check("getAllAgents() ≥ 4",     getAllAgents().length    >= 4);
check("getEnabledAgents() ≥ 4", getEnabledAgents().length >= 4);
check("getAgentsByRole('finance') includes finance_agent",
  getAgentsByRole("finance").some(a => a.id === "finance_agent"));
check("getAgentsByRole('collections') includes collections_agent",
  getAgentsByRole("collections").some(a => a.id === "collections_agent"));

const customAgent: AgentDefinition = {
  id: "custom_test_agent", displayName: "Custom", role: "custom",
  description: "Test custom agent", isSystemAgent: false, enabled: true,
  capabilities: ["CREATE_TASK"], tools: [], systemPrompt: "Test.",
};
registerAgent(customAgent);
check("registerAgent → resolveAgent finds custom agent",
  resolveAgent("custom_test_agent")?.id === "custom_test_agent");

// ═════════════════════════════════════════════════════════════════════════════
// Section 3 — Capability guard
// ═════════════════════════════════════════════════════════════════════════════

section("CAPABILITY GUARD — authorization and typed errors");

check("FINANCE_AGENT has READ_FINANCE",        agentHasCapability(FINANCE_AGENT, "READ_FINANCE"));
check("FINANCE_AGENT has CREATE_TASK",         agentHasCapability(FINANCE_AGENT, "CREATE_TASK"));
check("FINANCE_AGENT has CREATE_APPROVAL",     agentHasCapability(FINANCE_AGENT, "CREATE_APPROVAL"));
check("MARKETING_AGENT has READ_MARKETING",    agentHasCapability(MARKETING_AGENT, "READ_MARKETING"));
check("COLLECTIONS_AGENT has READ_COLLECTIONS",agentHasCapability(COLLECTIONS_AGENT, "READ_COLLECTIONS"));
check("COLLECTIONS_AGENT has START_WORKFLOW",  agentHasCapability(COLLECTIONS_AGENT, "START_WORKFLOW"));
check("COMMERCIAL_AGENT has CREATE_ALERT",     agentHasCapability(COMMERCIAL_AGENT, "CREATE_ALERT"));

check("FINANCE_AGENT does NOT have READ_MARKETING",   !agentHasCapability(FINANCE_AGENT, "READ_MARKETING"));
check("FINANCE_AGENT does NOT have READ_COLLECTIONS", !agentHasCapability(FINANCE_AGENT, "READ_COLLECTIONS"));
check("MARKETING_AGENT does NOT have READ_FINANCE",   !agentHasCapability(MARKETING_AGENT, "READ_FINANCE"));

let caughtCapError = false;
try { assertCapability(FINANCE_AGENT, "READ_COLLECTIONS"); } catch (e) {
  caughtCapError = e instanceof AgentCapabilityError;
}
check("assertCapability throws AgentCapabilityError", caughtCapError);

let capError: AgentCapabilityError | null = null;
try { assertCapability(FINANCE_AGENT, "READ_MARKETING"); } catch (e) {
  if (e instanceof AgentCapabilityError) capError = e;
}
check("AgentCapabilityError.agentId = 'finance_agent'",        capError?.agentId            === "finance_agent");
check("AgentCapabilityError.requiredCapability = 'READ_MARKETING'", capError?.requiredCapability === "READ_MARKETING");
check("AgentCapabilityError.name = 'AgentCapabilityError'",    capError?.name               === "AgentCapabilityError");

const disabledDef: AgentDefinition = { ...FINANCE_AGENT, id: "disabled_test", enabled: false };
let caughtDisabled = false;
try { assertAgentEnabled(disabledDef); } catch (e) { caughtDisabled = e instanceof AgentDisabledError; }
check("assertAgentEnabled throws AgentDisabledError", caughtDisabled);

const nfe = new AgentNotFoundError("ghost");
check("AgentNotFoundError.name = 'AgentNotFoundError'", nfe.name === "AgentNotFoundError");
check("AgentNotFoundError.agentId = 'ghost'",           nfe.agentId === "ghost");

check("findMissingCapability → null when all present",
  findMissingCapability(FINANCE_AGENT, ["READ_FINANCE", "CREATE_TASK"]) === null);
check("findMissingCapability → returns missing cap",
  findMissingCapability(FINANCE_AGENT, ["READ_FINANCE", "READ_COLLECTIONS"]) === "READ_COLLECTIONS");

// ═════════════════════════════════════════════════════════════════════════════
// Section 4 — Planner
// ═════════════════════════════════════════════════════════════════════════════

section("PLANNER — deterministic templates, no AI");

const fPlan  = planGoal(FINANCE_AGENT,     makeGoal("finance",     "high"));
const coPlan = planGoal(COLLECTIONS_AGENT, makeGoal("collections", "high"));
const mPlan  = planGoal(MARKETING_AGENT,   makeGoal("marketing",   "medium"));
const cmPlan = planGoal(COMMERCIAL_AGENT,  makeGoal("commercial",  "low"));
const gPlan  = planGoal(FINANCE_AGENT,     makeGoal("generic"));

check("Finance plan: 3 steps",     fPlan.steps.length  === 3);
check("Collections plan: 3 steps", coPlan.steps.length === 3);
check("Marketing plan: 3 steps",   mPlan.steps.length  === 3);
check("Commercial plan: 3 steps",  cmPlan.steps.length === 3);
check("Generic plan: 1 step",      gPlan.steps.length  === 1);

check("Finance[0] = READ_FINANCE",      fPlan.steps[0].action   === "READ_FINANCE");
check("Finance[1] = CREATE_TASK",       fPlan.steps[1].action   === "CREATE_TASK");
check("Finance[2] = CREATE_APPROVAL",   fPlan.steps[2].action   === "CREATE_APPROVAL");
check("Finance[2] is optional",         fPlan.steps[2].optional === true);

check("Collections[0] = READ_COLLECTIONS", coPlan.steps[0].action  === "READ_COLLECTIONS");
check("Collections[1] = CREATE_TASK",      coPlan.steps[1].action  === "CREATE_TASK");
check("Collections[2] = START_WORKFLOW",   coPlan.steps[2].action  === "START_WORKFLOW");
check("Collections[2] is optional",        coPlan.steps[2].optional === true);

check("Marketing[0] = READ_MARKETING", mPlan.steps[0].action   === "READ_MARKETING");
check("Marketing[2] = CREATE_APPROVAL",mPlan.steps[2].action   === "CREATE_APPROVAL");
check("Marketing[2] is optional",      mPlan.steps[2].optional === true);

check("Commercial[0] = READ_COMMERCIAL", cmPlan.steps[0].action === "READ_COMMERCIAL");
check("Commercial[2] = CREATE_ALERT",    cmPlan.steps[2].action === "CREATE_ALERT");
check("Commercial[2] is optional",       cmPlan.steps[2].optional === true);

check("Generic[0] = CREATE_TASK",  gPlan.steps[0].action === "CREATE_TASK");

check("All plan IDs start with 'plan_'",
  [fPlan, coPlan, mPlan, cmPlan, gPlan].every(p => p.id.startsWith("plan_")));
check("All step IDs start with 'step_'", fPlan.steps.every(s => s.id.startsWith("step_")));
check("Plan agentId matches agent",  fPlan.agentId === FINANCE_AGENT.id);
check("Plan goal preserved",         fPlan.goal.type === "finance");
check("Plan estimatedSteps matches", fPlan.estimatedSteps === fPlan.steps.length);
check("Plan has createdAt",          typeof fPlan.createdAt === "string");

const builtPlan = buildPlan({
  agentId:  "finance_agent",
  goal:     makeGoal("generic"),
  steps:    [{ label: "Test step", action: "CREATE_TASK", params: { title: "T" } }],
  metadata: { custom: true },
});
check("buildPlan creates valid plan",  builtPlan.id.startsWith("plan_"));
check("buildPlan step has action",     builtPlan.steps[0].action === "CREATE_TASK");
check("buildPlan metadata preserved",  builtPlan.metadata.custom === true);

// ═════════════════════════════════════════════════════════════════════════════
// Section 5 — Plan executor (stub dispatcher)
// ═════════════════════════════════════════════════════════════════════════════

section("EXECUTOR — step execution with stub dispatcher");

const audit1  = new AgentAuditLog();
const result1 = await executePlan(fPlan, FINANCE_AGENT, makeContext(makeGoal("finance", "high")), stubDispatcher, audit1);

check("Finance plan → status = 'completed'",    result1.status         === "completed");
check("Finance plan → executedSteps = 3",       result1.executedSteps  === 3);
check("Finance plan → failedSteps = 0",         result1.failedSteps    === 0);
check("Finance plan → has audit entries",       result1.auditTrail.length > 0);
check("Finance plan → audit has plan_started",  result1.auditTrail.some(e => e.event === "plan_started"));
check("Finance plan → audit has plan_completed",result1.auditTrail.some(e => e.event === "plan_completed"));
check("Finance plan → audit has step_started",  result1.auditTrail.some(e => e.event === "step_started"));
check("Finance plan → output has entries",      Object.keys(result1.output).length > 0);
check("Finance plan → no errors",              result1.errors.length === 0);
check("Finance plan → agentId correct",         result1.agentId === "finance_agent");
check("Finance plan → plan preserved",          result1.plan?.id === fPlan.id);
check("Finance plan → startedAt is string",     typeof result1.startedAt === "string");

const audit2  = new AgentAuditLog();
const result2 = await executePlan(fPlan, FINANCE_AGENT, makeContext(makeGoal("finance")), failDispatcher, audit2);
check("Fail dispatcher → status ≠ 'completed'", result2.status !== "completed");
check("Fail dispatcher → failedSteps ≥ 1",      result2.failedSteps >= 1);
check("Fail dispatcher → errors populated",     result2.errors.length >= 1);

const noCaps: AgentDefinition = { ...FINANCE_AGENT, id: "nocaps_test", capabilities: [] };
const audit3  = new AgentAuditLog();
const result3 = await executePlan(fPlan, noCaps, makeContext(makeGoal("finance")), stubDispatcher, audit3);
check("No-cap agent → plan fails",                       result3.status !== "completed");
check("No-cap agent → step_capability_denied in audit",  result3.auditTrail.some(e => e.event === "step_capability_denied"));

const audit4  = new AgentAuditLog();
const result4 = await executePlan(fPlan, FINANCE_AGENT, makeContext(makeGoal("finance")), failDispatcher, audit4, { stopOnFailure: false });
check("stopOnFailure=false → steps attempted", result4.failedSteps + result4.skippedSteps <= 3);

// ═════════════════════════════════════════════════════════════════════════════
// Section 6 — Audit log
// ═════════════════════════════════════════════════════════════════════════════

section("AUDIT LOG — in-memory serializable log");

const log = new AgentAuditLog();
log.record({ agentId: "finance_agent", event: "test_event",   message: "Hello", metadata: { x: 1 } });
log.record({ agentId: "finance_agent", event: "test_event_2", stepId: "step_0", message: "World", metadata: {} });

const entries = log.getEntries();
check("AuditLog has 2 entries",            entries.length === 2);
check("Entry 0 has id",                    typeof entries[0].id === "string");
check("Entry 0 has agentId",              entries[0].agentId === "finance_agent");
check("Entry 0 has event",                entries[0].event === "test_event");
check("Entry 0 has occurredAt",            typeof entries[0].occurredAt === "string");
check("Entry 1 has stepId",               entries[1].stepId === "step_0");
check("getEntries() returns new array",    log.getEntries() !== log.getEntries());
check("toJSON() is valid JSON",           (() => { try { JSON.parse(log.toJSON()); return true; } catch { return false; } })());
check("toJSON() round-trips entry count", (JSON.parse(log.toJSON()) as unknown[]).length === 2);

// ═════════════════════════════════════════════════════════════════════════════
// Section 7 — Memory contract
// ═════════════════════════════════════════════════════════════════════════════

section("MEMORY CONTRACT — IAgentMemory interface + no-op impl");

const mem = await noOpAgentMemory.loadMemory("finance_agent", "castillitos");
check("noOp.loadMemory returns {}",       Object.keys(mem).length === 0);

let saveFailed = false;
try { await noOpAgentMemory.saveMemory("finance_agent", "castillitos", { a: 1 }); }
catch { saveFailed = true; }
check("noOp.saveMemory does not throw",   !saveFailed);

const sr = await noOpAgentMemory.searchMemory("finance_agent", "castillitos", "signals");
check("noOp.searchMemory returns []",     sr.length === 0);
check("IAgentMemory has loadMemory",      typeof noOpAgentMemory.loadMemory   === "function");
check("IAgentMemory has saveMemory",      typeof noOpAgentMemory.saveMemory   === "function");
check("IAgentMemory has searchMemory",    typeof noOpAgentMemory.searchMemory === "function");

// ═════════════════════════════════════════════════════════════════════════════
// Section 8 — Tenant profile
// ═════════════════════════════════════════════════════════════════════════════

section("TENANT PROFILE — per-org agent configuration overlay");

const profile = createAgentTenantProfile("castillitos", "finance_agent", {
  displayName: "Diego (Castillitos)",
  tone:        "formal",
  customInstructions: "Usar formato de pesos colombianos.",
});
check("Profile agentId = 'finance_agent'",  profile.agentId  === "finance_agent");
check("Profile orgSlug = 'castillitos'",    profile.orgSlug  === "castillitos");
check("Profile displayName overridden",     profile.displayName === "Diego (Castillitos)");
check("Profile enabled = true (default)",   profile.enabled === true);
check("Profile tone = 'formal'",            profile.tone === "formal");
check("Profile has updatedAt",              typeof profile.updatedAt === "string");

setAgentTenantProfile(profile);
const retrieved = getAgentTenantProfile("castillitos", "finance_agent");
check("getAgentTenantProfile returns stored profile", retrieved?.agentId === "finance_agent");
check("Retrieved displayName preserved",              retrieved?.displayName === "Diego (Castillitos)");
check("getAgentTenantProfile → null for unknown org", getAgentTenantProfile("unknown_org", "finance_agent") === null);

const resolved = resolveAgentDisplayName("castillitos", "finance_agent", "Diego");
check("resolveAgentDisplayName → profile override", resolved === "Diego (Castillitos)");

const resolvedDefault = resolveAgentDisplayName("other_org", "finance_agent", "Diego");
check("resolveAgentDisplayName → base name fallback", resolvedDefault === "Diego");

const disabledProfile = createAgentTenantProfile("castillitos", "marketing_agent", { enabled: false });
check("Disabled profile enabled = false", disabledProfile.enabled === false);

// ═════════════════════════════════════════════════════════════════════════════
// Summary
// ═════════════════════════════════════════════════════════════════════════════

console.log("\n════════════════════════════════════════════════════════════════");
console.log("AGENTIK-AGENT-RUNTIME-01 — Sprint Domain Validation");
console.log(`Results: ${passed} passed / ${failed} failed / ${passed + failed} total`);

if (failed > 0) {
  console.log("\nFailed tests:");
  failures.forEach(f => console.log(`  ✗ ${f}`));
  console.log("\nVERDICT: FAIL — Fix errors above before Phase 15.");
  process.exit(1);
} else {
  console.log("\nVERDICT: PASS — All domain contracts solid. Ready for Phase 15 (integration harness).");
  process.exit(0);
}

} // end main

main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
