/**
 * scripts/validate-workflow-chaining.ts
 *
 * Agentik — Workflow Chaining Validation Script
 * Sprint: AGENTIK-WORKFLOW-CHAINING-01
 *
 * Run:  npx tsx scripts/validate-workflow-chaining.ts
 *
 * Validates all workflow chaining pure-domain logic:
 *   - Registry: 4 chains, all active, step counts correct
 *   - Router: first-step matching per module+actionType
 *   - Router: next-step resolution sequence
 *   - Router: approval step detection
 *   - Router: chain context extraction from payload
 *   - Audit: validateChainDefinition passes for all 4 chains
 *   - Factory: run creation, step result, audit event, advancement
 *
 * Does NOT test Prisma, service, or HTTP layer (those require the full Next.js
 * server context). Those are validated via manual E2E in Phase 18.
 */

import {
  WORKFLOW_CHAIN_REGISTRY,
  ACTIVE_WORKFLOW_CHAINS,
  getChainById,
  getChainsByCategory,
  matchChainForFirstStep,
  findStepById,
  resolveNextStep,
  extractChainContextFromPayload,
  isChainTerminal,
  hasExceededStepLimit,
  validateChainDefinition,
  validateAllChains,
  createWorkflowChainRun,
  createWorkflowStepResult,
  createWorkflowChainAuditEvent,
  createNextStepPayload,
  advanceRunToStep,
  completeRunStep,
  terminalizeRun,
} from "../lib/work/chaining/index";

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 60 - title.length - 4))}`);
}

// ── 1. Registry ────────────────────────────────────────────────────────────────

section("1. Registry");

check(
  "WORKFLOW_CHAIN_REGISTRY has 4 chains",
  Object.keys(WORKFLOW_CHAIN_REGISTRY).length === 4,
  `got ${Object.keys(WORKFLOW_CHAIN_REGISTRY).length}`,
);

check(
  "ACTIVE_WORKFLOW_CHAINS has 4 entries",
  ACTIVE_WORKFLOW_CHAINS.length === 4,
);

const chainIds = ACTIVE_WORKFLOW_CHAINS.map(c => c.id);
check("FINANCE_RECONCILIATION_CHAIN present",  chainIds.includes("FINANCE_RECONCILIATION_CHAIN"));
check("COMMERCIAL_PORTFOLIO_CHAIN present",    chainIds.includes("COMMERCIAL_PORTFOLIO_CHAIN"));
check("MARKETING_CAMPAIGN_CHAIN present",      chainIds.includes("MARKETING_CAMPAIGN_CHAIN"));
check("COLLECTIONS_FOLLOWUP_CHAIN present",    chainIds.includes("COLLECTIONS_FOLLOWUP_CHAIN"));

check("All chains are active",                 ACTIVE_WORKFLOW_CHAINS.every(c => c.isActive));
check("All chains have version set",           ACTIVE_WORKFLOW_CHAINS.every(c => !!c.version));

// Step counts
const recon   = getChainById("FINANCE_RECONCILIATION_CHAIN");
const portf   = getChainById("COMMERCIAL_PORTFOLIO_CHAIN");
const mktg    = getChainById("MARKETING_CAMPAIGN_CHAIN");
const collect = getChainById("COLLECTIONS_FOLLOWUP_CHAIN");

check("Finance chain has 3 steps",      (recon?.steps.length   ?? 0) === 3);
check("Commercial chain has 3 steps",   (portf?.steps.length   ?? 0) === 3);
check("Marketing chain has 3 steps",    (mktg?.steps.length    ?? 0) === 3);
check("Collections chain has 3 steps",  (collect?.steps.length ?? 0) === 3);

// getChainsByCategory
const finChains  = getChainsByCategory("FINANCE");
const mktChains  = getChainsByCategory("MARKETING");
const colChains  = getChainsByCategory("COLLECTIONS");
const comChains  = getChainsByCategory("COMMERCIAL");
check("getChainsByCategory(FINANCE) returns 1",     finChains.length === 1);
check("getChainsByCategory(MARKETING) returns 1",   mktChains.length === 1);
check("getChainsByCategory(COLLECTIONS) returns 1", colChains.length === 1);
check("getChainsByCategory(COMMERCIAL) returns 1",  comChains.length === 1);

// ── 2. Router — first-step matching ───────────────────────────────────────────

section("2. Router — first-step matching");

const reconMatch = matchChainForFirstStep("finanzas", "RECONCILIATION");
check("finanzas+RECONCILIATION → FINANCE_RECONCILIATION_CHAIN",
  reconMatch?.chain.id === "FINANCE_RECONCILIATION_CHAIN",
);
check("Matched step is step_recon_1",    reconMatch?.matchedStep.id === "step_recon_1");
check("step_recon_1 has no approval",    reconMatch?.matchedStep.requiresApproval === false);

const portfMatch = matchChainForFirstStep("comercial", "PORTFOLIO_TRANSFER");
check("comercial+PORTFOLIO_TRANSFER → COMMERCIAL_PORTFOLIO_CHAIN",
  portfMatch?.chain.id === "COMMERCIAL_PORTFOLIO_CHAIN",
);

const mktgMatch = matchChainForFirstStep("marketing", "GENERATE_ASSETS");
check("marketing+GENERATE_ASSETS → MARKETING_CAMPAIGN_CHAIN",
  mktgMatch?.chain.id === "MARKETING_CAMPAIGN_CHAIN",
);

const collMatch = matchChainForFirstStep("cobranza", "FOLLOW_UP");
check("cobranza+FOLLOW_UP → COLLECTIONS_FOLLOWUP_CHAIN",
  collMatch?.chain.id === "COLLECTIONS_FOLLOWUP_CHAIN",
);

// Non-matching cases
check("Unknown module returns null",             matchChainForFirstStep("unknown", "RECONCILIATION") === null);
check("Unknown actionType returns null",         matchChainForFirstStep("finanzas", "PUBLISH_CONTENT") === null);
check("null module returns null",                matchChainForFirstStep(null, "RECONCILIATION") === null);

// ── 3. Router — step sequence ─────────────────────────────────────────────────

section("3. Router — step sequence");

if (recon) {
  const next2 = resolveNextStep(recon, "step_recon_1", ["step_recon_1"]);
  check("After step_recon_1 → step_recon_2", next2?.nextStep.id === "step_recon_2");
  check("step_recon_2 requires approval (WAITING_APPROVAL)", next2?.nextStatus === "WAITING_APPROVAL");

  const next3 = resolveNextStep(recon, "step_recon_2", ["step_recon_1", "step_recon_2"]);
  check("After step_recon_2 → step_recon_3", next3?.nextStep.id === "step_recon_3");
  check("step_recon_3 is READY (no approval)", next3?.nextStatus === "READY");

  const noNext = resolveNextStep(recon, "step_recon_3", ["step_recon_1", "step_recon_2", "step_recon_3"]);
  check("After step_recon_3 → null (chain done)", noNext === null);
}

if (collect) {
  const next2c = resolveNextStep(collect, "step_collections_1", ["step_collections_1"]);
  check("Collections: step 2 requires approval", next2c?.nextStatus === "WAITING_APPROVAL");
}

// ── 4. Router — findStepById ──────────────────────────────────────────────────

section("4. Router — findStepById");

if (recon) {
  check("findStepById returns correct step", findStepById(recon, "step_recon_2")?.step.id === "step_recon_2");
  check("findStepById(unknown) returns null", findStepById(recon, "step_unknown") === null);
}

// ── 5. Router — chain context extraction ─────────────────────────────────────

section("5. Router — chain context extraction");

const chainPayload = {
  metadata: {
    workflowRunId: "wrun_test_001",
    chainId:       "FINANCE_RECONCILIATION_CHAIN",
    stepId:        "step_recon_2",
  },
};

const ctx = extractChainContextFromPayload(chainPayload);
check("Context extracted from payload",         ctx !== null);
check("workflowRunId matches",                  ctx?.workflowRunId === "wrun_test_001");
check("chainId matches",                        ctx?.chainId === "FINANCE_RECONCILIATION_CHAIN");
check("stepId matches",                         ctx?.stepId === "step_recon_2");

check("No metadata → null",   extractChainContextFromPayload({}) === null);
check("null → null",          extractChainContextFromPayload(null) === null);
check("Missing runId → null", extractChainContextFromPayload({ metadata: { chainId: "x", stepId: "y" } }) === null);

// ── 6. Router — terminal / step limit guards ──────────────────────────────────

section("6. Router — terminal / step limit guards");

if (recon) {
  const run = createWorkflowChainRun({
    chainId: recon.id, chainName: recon.name,
    orgSlug: "castillitos",
    triggerExecutionId: "wej_test",
    firstStepId: "step_recon_1",
  });

  check("Fresh run is not terminal",            !isChainTerminal(run));
  check("Fresh run has not exceeded limit",     !hasExceededStepLimit(run));

  const completedRun = terminalizeRun(run, "COMPLETED");
  check("COMPLETED run is terminal",            isChainTerminal(completedRun));

  const failedRun = terminalizeRun(run, "FAILED");
  check("FAILED run is terminal",               isChainTerminal(failedRun));

  const cancelledRun = terminalizeRun(run, "CANCELLED");
  check("CANCELLED run is terminal",            isChainTerminal(cancelledRun));
}

// ── 7. Audit — validateChainDefinition ────────────────────────────────────────

section("7. Audit — validateChainDefinition");

for (const chain of ACTIVE_WORKFLOW_CHAINS) {
  const report = validateChainDefinition(chain);
  check(`${chain.id} passes validation (0 errors)`, report.errors.length === 0, `errors: ${JSON.stringify(report.errors)}`);
  check(`${chain.id} is valid`,                      report.valid);
}

const allReport = validateAllChains(ACTIVE_WORKFLOW_CHAINS);
check("validateAllChains: all 4 chains valid", Object.values(allReport).every(r => r.valid));

// ── 8. Factory — run creation ─────────────────────────────────────────────────

section("8. Factory — run creation");

if (recon) {
  const run = createWorkflowChainRun({
    chainId: recon.id, chainName: recon.name,
    orgSlug: "castillitos",
    triggerExecutionId: "wej_factory_test",
    firstStepId: "step_recon_1",
  });

  check("Run has id starting with wcr_",           run.id.startsWith("wcr_"));
  check("Run chainId matches",                     run.chainId === recon.id);
  check("Run status is RUNNING",                   run.status === "RUNNING");
  check("Run currentStepId is step_recon_1",       run.currentStepId === "step_recon_1");
  check("Run stepResults is empty array",          Array.isArray(run.stepResults) && run.stepResults.length === 0);
  check("Run auditTrail is empty array",           Array.isArray(run.auditTrail) && run.auditTrail.length === 0);
  check("Run createdAt is ISO string",             typeof run.createdAt === "string");
  check("Run is serializable (JSON round-trip)",   (() => {
    try { JSON.parse(JSON.stringify(run)); return true; } catch { return false; }
  })());

  // completeRunStep
  const stepResult = createWorkflowStepResult({
    stepId:      "step_recon_1",
    status:      "COMPLETED",
    executionId: "wej_factory_test",
    message:     "Test step 1 complete.",
    completedAt: new Date().toISOString(),
  });

  check("StepResult stepId matches",              stepResult.stepId === "step_recon_1");
  check("StepResult status is COMPLETED",         stepResult.status === "COMPLETED");

  const advancedRun = completeRunStep(run, "step_recon_1", stepResult);
  check("completeRunStep adds to completedStepIds",   advancedRun.completedStepIds.includes("step_recon_1"));
  check("completeRunStep adds to stepResults",        advancedRun.stepResults.length === 1);

  // advanceRunToStep
  const runAt2 = advanceRunToStep(advancedRun, "step_recon_2", "RUNNING");
  check("advanceRunToStep sets currentStepId",        runAt2.currentStepId === "step_recon_2");
  check("advanceRunToStep sets status RUNNING",       runAt2.status === "RUNNING");

  // terminalizeRun
  const done = terminalizeRun(runAt2, "COMPLETED");
  check("terminalizeRun sets status COMPLETED",       done.status === "COMPLETED");
  check("terminalizeRun sets completedAt",            done.completedAt !== undefined);

  // createWorkflowChainAuditEvent
  const evt = createWorkflowChainAuditEvent({
    runId:   run.id,
    event:   "chain_started",
    message: "Test event",
  });
  check("AuditEvent has id starting with wca_",   evt.id.startsWith("wca_"));
  check("AuditEvent runId matches",               evt.runId === run.id);
  check("AuditEvent event matches",               evt.event === "chain_started");
  check("AuditEvent occurredAt is ISO string",    typeof evt.occurredAt === "string");

  // createNextStepPayload — returns a flat object (used as job.payload.params)
  const nextPayload = createNextStepPayload({
    chainId:             recon.id,
    workflowRunId:       run.id,
    stepId:              "step_recon_2",
    previousExecutionId: "wej_factory_test",
  });
  check("NextStepPayload.workflowRunId matches", nextPayload["workflowRunId"] === run.id);
  check("NextStepPayload.chainId matches",       nextPayload["chainId"]       === recon.id);
  check("NextStepPayload.stepId matches",        nextPayload["stepId"]        === "step_recon_2");
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(64));
console.log(`  WORKFLOW CHAINING VALIDATION: ${passed + failed} checks total`);
console.log(`  ✓ ${passed} passed   ✗ ${failed} failed`);
console.log("═".repeat(64));

if (failed > 0) {
  process.exit(1);
}
