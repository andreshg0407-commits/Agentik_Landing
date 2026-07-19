/**
 * scripts/integration/test-helpers.ts
 *
 * AGENTIK-INTEGRATION-TESTS-01 — Shared test infrastructure
 *
 * Provides environment assertion, org resolution, test-run ID generation,
 * and safe proposed actions with full integration test metadata.
 *
 * SERVER-ONLY context (loaded after patch-server-only.cjs).
 * Pure domain helpers that don't touch the DB are also exported.
 */

import { prisma }          from "../../lib/prisma";
import type { ProposedAction } from "../../lib/agents/runtime/agent-runtime-result";
import type { AutonomousOperationInput } from "../../lib/autonomous-operations/autonomous-operation-types";

// ── Environment assertion ─────────────────────────────────────────────────────

export interface IntegrationEnv {
  orgSlug:    string;
  nodeEnv:    string;
  timestamp:  string;
  testRunId:  string;
}

/**
 * Validates the integration test environment.
 * Aborts with a clear error if:
 *   - NODE_ENV === "production"
 *   - DATABASE_URL is missing
 */
export function assertIntegrationEnv(): IntegrationEnv {
  if (process.env.NODE_ENV === "production") {
    console.error("ABORT: Integration tests CANNOT run in production.");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("ABORT: DATABASE_URL is not set. Set it in .env or pass via dotenv-cli.");
    process.exit(1);
  }

  const orgSlug   = process.env.ORG_SLUG ?? "castillitos";
  const nodeEnv   = process.env.NODE_ENV ?? "development";
  const timestamp = new Date().toISOString();
  const testRunId = makeTestRunId();

  console.log("━".repeat(60));
  console.log("AGENTIK Integration Test Environment");
  console.log(`  orgSlug:   ${orgSlug}`);
  console.log(`  nodeEnv:   ${nodeEnv}`);
  console.log(`  testRunId: ${testRunId}`);
  console.log(`  timestamp: ${timestamp}`);
  console.log("━".repeat(60));

  return { orgSlug, nodeEnv, timestamp, testRunId };
}

// ── Test run ID ───────────────────────────────────────────────────────────────

export function makeTestRunId(): string {
  return `itest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Organization resolver ─────────────────────────────────────────────────────

/**
 * Finds the organization by slug.
 * Does NOT create it — fails clearly if not found.
 */
export async function resolveTestOrganization(orgSlug: string) {
  const org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) {
    throw new Error(
      `[integration] Organization "${orgSlug}" not found in database. ` +
      "Cannot run integration tests without a valid tenant.",
    );
  }
  return org;
}

// ── Safe proposed actions (no forbidden keywords) ─────────────────────────────

/**
 * Build a set of safe ProposedActions tagged with integration test metadata.
 * These use only safe signal types — no financial/marketing/inventory/customer operations.
 */
export function makeSafeProposedActions(testRunId: string): {
  diegoTask:     ProposedAction;
  diegoApproval: ProposedAction;
  lucaApproval:  ProposedAction;
  milaTask:      ProposedAction;
  systemNoAction: ProposedAction;
} {
  const integrationMeta = {
    integrationTest: true,
    testRunId,
    createdBy: "AGENTIK-INTEGRATION-TESTS-01",
  };

  const diegoTask: ProposedAction = {
    id:                     `pa_int_diego_task_${testRunId}`,
    type:                   "CREATE_TASK_DRAFT",
    label:                  "[Integration Test] Revisar cobros vencidos",
    description:            "Integration test task: revisar cartera vencida de cliente test.",
    targetDomain:           "FINANCE",
    targetModule:           "cobros",
    requiresApproval:       false,
    sourceRecommendationId: `rec_int_diego_task_${testRunId}`,
    confidence:             "VERY_HIGH",
    score:                  75,
    navigationTarget:       "/castillitos/finanzas/torre-control/cobros-hoy",
    payload: {
      signalId:      `sig_int_task_${testRunId}`,
      signalType:    "overdue_receivable",
      reasoning:     "Integration test: safe task creation.",
      ...integrationMeta,
    },
    metadata: integrationMeta,
  };

  const diegoApproval: ProposedAction = {
    id:                     `pa_int_diego_approval_${testRunId}`,
    type:                   "CREATE_APPROVAL_DRAFT",
    label:                  "[Integration Test] Aprobación conciliación",
    description:            "Integration test approval: conciliación de cuenta para test.",
    targetDomain:           "FINANCE",
    targetModule:           "conciliacion",
    requiresApproval:       true,
    sourceRecommendationId: `rec_int_diego_approval_${testRunId}`,
    confidence:             "HIGH",
    score:                  70,
    navigationTarget:       "/castillitos/finanzas/conciliacion",
    payload: {
      signalId:      `sig_int_approval_${testRunId}`,
      signalType:    "reconciliation_exception",
      reasoning:     "Integration test: safe approval creation.",
      ...integrationMeta,
    },
    metadata: integrationMeta,
  };

  const lucaApproval: ProposedAction = {
    id:                     `pa_int_luca_approval_${testRunId}`,
    type:                   "CREATE_APPROVAL_DRAFT",
    label:                  "[Integration Test] Aprobación campaña test",
    description:            "Integration test approval: revisión de campaña para aprobación.",
    targetDomain:           "MARKETING",
    targetModule:           "campaigns",
    requiresApproval:       true,
    sourceRecommendationId: `rec_int_luca_approval_${testRunId}`,
    confidence:             "MEDIUM",
    score:                  55,
    navigationTarget:       "/castillitos/agentik/marketing-studio/campaigns",
    payload: {
      signalId:      `sig_int_luca_${testRunId}`,
      signalType:    "campaign_review_pending",
      reasoning:     "Integration test: safe marketing approval (review only, no publish).",
      ...integrationMeta,
    },
    metadata: integrationMeta,
  };

  const milaTask: ProposedAction = {
    id:                     `pa_int_mila_task_${testRunId}`,
    type:                   "CREATE_TASK_DRAFT",
    label:                  "[Integration Test] Revisar margen comercial",
    description:            "Integration test task: análisis de margen para producto test.",
    targetDomain:           "COMMERCIAL",
    targetModule:           "inteligencia",
    requiresApproval:       false,
    sourceRecommendationId: `rec_int_mila_task_${testRunId}`,
    confidence:             "HIGH",
    score:                  60,
    navigationTarget:       "/castillitos/comercial/inteligencia",
    payload: {
      signalId:      `sig_int_mila_${testRunId}`,
      signalType:    "margin_alert",
      reasoning:     "Integration test: safe commercial task creation.",
      ...integrationMeta,
    },
    metadata: integrationMeta,
  };

  const systemNoAction: ProposedAction = {
    id:                     `pa_int_system_noop_${testRunId}`,
    type:                   "NO_ACTION",
    label:                  "[Integration Test] Sin acción requerida",
    description:            "Integration test: NO_ACTION signal produces no side effects.",
    targetDomain:           "SYSTEM",
    targetModule:           "sistema",
    requiresApproval:       false,
    sourceRecommendationId: `rec_int_noop_${testRunId}`,
    confidence:             "HIGH",
    score:                  50,
    payload: {
      signalId:   `sig_int_noop_${testRunId}`,
      signalType: "no_action_required",
      ...integrationMeta,
    },
    metadata: integrationMeta,
  };

  return { diegoTask, diegoApproval, lucaApproval, milaTask, systemNoAction };
}

// ── Build operation inputs ─────────────────────────────────────────────────────

export function makeIntegrationInputs(
  testRunId: string,
  orgSlug:   string,
): {
  diegoTaskInput:     AutonomousOperationInput;
  diegoApprovalInput: AutonomousOperationInput;
  lucaApprovalInput:  AutonomousOperationInput;
  milaTaskInput:      AutonomousOperationInput;
  systemNoActionInput: AutonomousOperationInput;
} {
  const actions = makeSafeProposedActions(testRunId);
  const integrationMeta = {
    integrationTest: true,
    testRunId,
    createdBy: "AGENTIK-INTEGRATION-TESTS-01",
  };

  return {
    // SAFE_AUTOMATION + CREATE_TASK_DRAFT + LOW risk → CREATE_TASK_ONLY → READY_TO_EXECUTE
    diegoTaskInput: {
      orgSlug,
      agentId:        "diego",
      agentName:      "Diego",
      agentDomain:    "FINANCE",
      runtimeMode:    "SAFE_AUTOMATION",
      proposedAction: actions.diegoTask,
      metadata:       integrationMeta,
    },
    // APPROVAL_REQUIRED + CREATE_APPROVAL_DRAFT + MEDIUM risk → CREATE_APPROVAL_ONLY → READY_TO_EXECUTE
    diegoApprovalInput: {
      orgSlug,
      agentId:        "diego",
      agentName:      "Diego",
      agentDomain:    "FINANCE",
      runtimeMode:    "APPROVAL_REQUIRED",
      proposedAction: actions.diegoApproval,
      metadata:       integrationMeta,
    },
    // ASSISTED + CREATE_APPROVAL_DRAFT + MEDIUM risk → CREATE_APPROVAL_ONLY → READY_TO_EXECUTE
    lucaApprovalInput: {
      orgSlug,
      agentId:        "luca",
      agentName:      "Luca",
      agentDomain:    "MARKETING",
      runtimeMode:    "ASSISTED",
      proposedAction: actions.lucaApproval,
      metadata:       integrationMeta,
    },
    // ASSISTED + CREATE_TASK_DRAFT + LOW risk → CREATE_TASK_ONLY → READY_TO_EXECUTE
    milaTaskInput: {
      orgSlug,
      agentId:        "mila",
      agentName:      "Mila",
      agentDomain:    "COMMERCIAL",
      runtimeMode:    "ASSISTED",
      proposedAction: actions.milaTask,
      metadata:       integrationMeta,
    },
    // PREVIEW + NO_ACTION → NO_ACTION → COMPLETED (no side effects)
    systemNoActionInput: {
      orgSlug,
      agentId:        "system",
      agentName:      "System",
      agentDomain:    "SYSTEM",
      runtimeMode:    "PREVIEW",
      proposedAction: actions.systemNoAction,
      metadata:       integrationMeta,
    },
  };
}

// ── Cleanup helpers ────────────────────────────────────────────────────────────

export async function cleanupCreatedTask(
  taskId:  string,
  orgSlug: string,
): Promise<void> {
  try {
    const { taskService } = await import("../../lib/tasks/task-service");
    const result = await taskService.cancelTask(taskId, orgSlug);
    if (result.success) {
      console.log(`  [cleanup] Task ${taskId} cancelled.`);
    } else {
      console.warn(`  [cleanup] Could not cancel task ${taskId}: ${result.message}`);
    }
  } catch (err) {
    console.warn(`  [cleanup] Error cancelling task ${taskId}:`, err);
  }
}

export async function cleanupCreatedApproval(
  approvalId: string,
  orgSlug:    string,
): Promise<void> {
  try {
    const { approvalService } = await import("../../lib/approvals/approval-service");
    const actor = { id: "integration-test-cleanup", type: "SYSTEM" as const, name: "Integration Test Cleanup" };
    const result = await approvalService.cancelApproval(
      approvalId,
      actor,
      `Integration test cleanup — testRun for orgSlug=${orgSlug}`,
    );
    if (result.success) {
      console.log(`  [cleanup] Approval ${approvalId} cancelled.`);
    } else {
      console.warn(`  [cleanup] Could not cancel approval ${approvalId}: ${result.message}`);
    }
  } catch (err) {
    console.warn(`  [cleanup] Error cancelling approval ${approvalId}:`, err);
  }
}
