/**
 * lib/copilot/supervised-execution.ts
 *
 * Agentik Copilot — Supervised Execution Engine V3
 *
 * Phase 2 of Sprint AGENTIK-EXECUTION-LAYER-V3-CONTROLLED-OPS-01
 *
 * Orchestrates the full lifecycle of a supervised execution session.
 * A supervised execution is a bundle of controlled actions that requires
 * human confirmation before any steps are taken.
 *
 * V3: Execution lifecycle is real; individual action execution is simulated.
 *     Architecture: prepare → confirm → approve → execute → complete/rollback.
 * V4: Actions will invoke Prisma, n8n, WhatsApp, and other external systems.
 *
 * Governance rules (Phase 11):
 *   - Runtime DEGRADED → supervised only, never automatic
 *   - High risk → mandatory human approval
 *   - Multi-module → elevated governance
 *   - Rollback unsupported → cannot execute automatically
 */

import type { ExecutionActionContract }  from "./execution-actions";
import type { ExecutionBundle }          from "./execution-bundles";
import type { CompoundOperation }        from "./compound-operations";
import {
  getPrimaryExecutionAction,
  getActionsForAgent,
  validateExecutionAction,
}                                        from "./execution-actions";
import {
  buildRollbackOperation,
  canRollbackExecution,
}                                        from "./execution-rollback";
import type { RollbackOperation }        from "./execution-rollback";

// ── Types ──────────────────────────────────────────────────────────────────────

export type SupervisedExecutionStatus =
  | "prepared"               // Draft prepared, awaiting confirmation request
  | "awaiting_confirmation"  // Sent to human for review
  | "approved"               // Human approved — ready to execute
  | "executing"              // Currently executing (in V3: simulated)
  | "completed"              // All actions completed successfully
  | "failed"                 // One or more actions failed
  | "rolled_back";           // Operation was reversed

export interface SupervisedExecution {
  id:                 string;
  bundleId:           string;
  agentId:            string;
  orgSlug:            string;
  actions:            ExecutionActionContract[];
  status:             SupervisedExecutionStatus;
  approvedByHuman:    boolean;
  executedAt?:        string;              // ISO string
  completedAt?:       string;             // ISO string
  rollbackAvailable:  boolean;
  rollback?:          RollbackOperation;
  executionSummary:   string;
  governanceSummary:  string;             // Why this execution mode was chosen
  readinessLabel:     string;             // Human-readable readiness phrase
  requiresApproval:   boolean;
  executionMode:      "draft" | "supervised";
  estimatedRisk:      string;
  preparedAt:         string;             // ISO string
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function buildGovernanceSummary(
  runtimeState: string,
  actions:      ExecutionActionContract[],
): string {
  if (runtimeState === "DEGRADED") {
    return "Runtime degradado — modo supervisado obligatorio, automático prohibido";
  }
  const highRisk = actions.some(a => a.estimatedRisk === "high");
  if (highRisk) {
    return "Acciones de riesgo alto — aprobación humana requerida antes de ejecución";
  }
  const multiModule = new Set(actions.map(a => a.targetModule)).size >= 2;
  if (multiModule) {
    return "Bundle multi-módulo — gobernanza elevada activa";
  }
  return "Modo supervisado — operación bajo supervisión humana";
}

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Prepares a supervised execution from an execution bundle + compound operation.
 * Selects the most appropriate action for the current context.
 * V3: No external calls — lifecycle simulation only.
 */
export function prepareSupervisedExecution(params: {
  bundle:         ExecutionBundle;
  operation:      CompoundOperation;
  agentId:        string;
  orgSlug:        string;
  runtimeState:   string;
  tenantState:    string;
  pendingApprovals: number;
}): SupervisedExecution {
  const { bundle, operation, agentId, orgSlug, runtimeState } = params;

  // Determine execution mode: DEGRADED → supervised; draft otherwise for low risk
  const executionMode: "draft" | "supervised" =
    runtimeState === "DEGRADED" || bundle.estimatedRisk !== "low"
      ? "supervised"
      : bundle.executionMode === "supervised" ? "supervised" : "draft";

  // Gather actions for this agent in this context
  const rawActions = getActionsForAgent(agentId, [executionMode]);
  const primaryAction = getPrimaryExecutionAction(agentId, operation.involvedModules[0] ?? "executive");

  const actions: ExecutionActionContract[] = [
    ...(primaryAction ? [primaryAction] : []),
    ...rawActions.filter(a => primaryAction ? a.id !== primaryAction.id : true).slice(0, 2),
  ];

  // Validate each action
  const validActions = actions.filter(a => {
    const v = validateExecutionAction(a, runtimeState);
    return v.valid;
  });

  const requiresApproval =
    validActions.some(a => a.requiresApproval) ||
    bundle.requiresApproval ||
    runtimeState === "DEGRADED";

  const rollbackAvailable = validActions.every(a => a.rollbackSupported);
  const rollback = buildRollbackOperation(bundle.id, rollbackAvailable);

  const status: SupervisedExecutionStatus = requiresApproval
    ? "awaiting_confirmation"
    : "prepared";

  const estimatedRisk = bundle.estimatedRisk;

  const readinessLabel =
    status === "awaiting_confirmation"
      ? "Esperando confirmación del operador"
      : "Listo para ejecución supervisada";

  return {
    id:                crypto.randomUUID(),
    bundleId:          bundle.id,
    agentId,
    orgSlug,
    actions:           validActions.length > 0 ? validActions : actions.slice(0, 1),
    status,
    approvedByHuman:   false,
    rollbackAvailable: canRollbackExecution(rollback),
    rollback,
    executionSummary:  `${validActions.length} acción${validActions.length !== 1 ? "es" : ""} preparada${validActions.length !== 1 ? "s" : ""} en modo ${executionMode}`,
    governanceSummary: buildGovernanceSummary(runtimeState, validActions),
    readinessLabel,
    requiresApproval,
    executionMode,
    estimatedRisk,
    preparedAt:        new Date().toISOString(),
  };
}

/**
 * Simulates advancing a supervised execution to approved state.
 * V3: lifecycle simulation — no real operator confirmation yet.
 */
export function approveExecutionDraft(
  execution: SupervisedExecution,
): SupervisedExecution {
  if (execution.status !== "awaiting_confirmation" && execution.status !== "prepared") {
    return execution;
  }
  return {
    ...execution,
    status:          "approved",
    approvedByHuman: true,
    readinessLabel:  "Aprobado — listo para ejecución supervisada",
  };
}

/**
 * Returns a 1-line summary for rail and timeline display.
 */
export function summarizeSupervisedExecution(
  execution: SupervisedExecution | null,
): string {
  if (!execution) return "Sin operación supervisada activa";

  const STATUS_LABEL: Record<SupervisedExecutionStatus, string> = {
    prepared:              "Borrador preparado",
    awaiting_confirmation: "Confirmación requerida",
    approved:              "Aprobado — listo",
    executing:             "Ejecutando…",
    completed:             "Completado correctamente",
    failed:                "Error en ejecución",
    rolled_back:           "Revertido",
  };

  const label = STATUS_LABEL[execution.status] ?? execution.status;
  const risk   = execution.estimatedRisk !== "low" ? ` · riesgo ${execution.estimatedRisk}` : "";
  return `${label}${risk}`;
}
