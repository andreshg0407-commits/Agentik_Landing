/**
 * lib/control-center/execution-monitor.ts
 *
 * Agentik — Execution Monitor
 *
 * Sprint: AGENTIK-TENANT-INTEGRATION-MANAGER-AND-CONTROL-CENTER-01 — Block C3
 *
 * Monitors supervised executions, blocked dispatches, pending approvals,
 * rollback availability, and replay integrity for the control center.
 *
 * V1: derived from existing execution + replay pipeline signals.
 * V4: persisted execution records from Prisma.CopilotExecution.
 */

// ── Execution pressure ────────────────────────────────────────────────────────

export type ExecutionPressure =
  | "clear"     // No issues — all executions proceeding
  | "pending"   // Approvals pending or executions queued
  | "elevated"  // Blocked dispatches or failing executions
  | "critical"; // Hard blocks requiring immediate intervention

// ── Execution entry ───────────────────────────────────────────────────────────

export interface ExecutionEntry {
  id:               string;
  orgSlug:          string;
  title:            string;
  status:           string;    // SupervisedExecutionStatus
  executionMode:    string;
  requiresApproval: boolean;
  approvedByHuman:  boolean;
  rollbackAvailable: boolean;
  replayIntegrity:  string;    // "intact"|"partial"|"incomplete"|"corrupt"
  blockReason?:     string;
}

// ── Execution monitor state ───────────────────────────────────────────────────

export interface ExecutionMonitor {
  orgSlug:             string;
  pressure:            ExecutionPressure;
  supervisedCount:     number;    // Total supervised executions tracked
  activeCount:         number;    // Currently executing
  blockedCount:        number;    // Blocked by dispatch/governance
  pendingApprovalCount: number;   // Awaiting human sign-off
  rollbackAvailableCount: number; // Can be rolled back
  replayIntact:        boolean;   // True if all tracked traces are intact
  entries:             ExecutionEntry[];
  healthSummary:       string;
  evaluatedAt:         string;
}

// ── Build params ──────────────────────────────────────────────────────────────

export interface BuildExecutionMonitorParams {
  orgSlug:          string;
  supervisedExecution?: {
    id:               string;
    bundleId:         string;
    status:           string;
    executionMode:    string;
    requiresApproval: boolean;
    approvedByHuman:  boolean;
    rollbackAvailable: boolean;
    actions:          Array<{ title: string }>;
  };
  blockedDispatchCount:  number;
  pendingApprovals:      number;
  replayIntegrity:       string;
}

// ── Core: build execution monitor ────────────────────────────────────────────

/**
 * Builds the execution monitor snapshot from current execution pipeline state.
 */
export function buildExecutionMonitor(
  params: BuildExecutionMonitorParams,
): ExecutionMonitor {
  const {
    orgSlug, supervisedExecution, blockedDispatchCount,
    pendingApprovals, replayIntegrity,
  } = params;

  const entries: ExecutionEntry[] = [];

  if (supervisedExecution) {
    entries.push({
      id:               supervisedExecution.id,
      orgSlug,
      title:            supervisedExecution.actions[0]?.title ?? "Ejecución supervisada",
      status:           supervisedExecution.status,
      executionMode:    supervisedExecution.executionMode,
      requiresApproval: supervisedExecution.requiresApproval,
      approvedByHuman:  supervisedExecution.approvedByHuman,
      rollbackAvailable: supervisedExecution.rollbackAvailable,
      replayIntegrity,
    });
  }

  const activeCount    = entries.filter(e => e.status === "executing").length;
  const blockedCount   = blockedDispatchCount;
  const rollbackCount  = entries.filter(e => e.rollbackAvailable).length;
  const replayIntact   = replayIntegrity === "intact" || replayIntegrity === "partial";

  const pressure = resolveExecutionPressure({
    activeCount,
    blockedCount,
    pendingApprovals,
    replayIntact,
    hasCriticalExecution: entries.some(e => e.status === "blocked"),
  });

  const healthSummary = summarizeExecutionHealth({
    pressure, activeCount, blockedCount, pendingApprovals, rollbackCount,
  });

  return {
    orgSlug,
    pressure,
    supervisedCount:      entries.length,
    activeCount,
    blockedCount,
    pendingApprovalCount: pendingApprovals,
    rollbackAvailableCount: rollbackCount,
    replayIntact,
    entries,
    healthSummary,
    evaluatedAt: new Date().toISOString(),
  };
}

// ── Resolve execution pressure ────────────────────────────────────────────────

/**
 * Resolves the execution pressure level.
 */
export function resolveExecutionPressure(p: {
  activeCount:          number;
  blockedCount:         number;
  pendingApprovals:     number;
  replayIntact:         boolean;
  hasCriticalExecution: boolean;
}): ExecutionPressure {
  if (p.hasCriticalExecution || p.blockedCount > 2) return "critical";
  if (p.blockedCount > 0 || p.pendingApprovals > 3) return "elevated";
  if (p.pendingApprovals > 0 || !p.replayIntact)    return "pending";
  return "clear";
}

// ── Summarize execution health ────────────────────────────────────────────────

/**
 * Returns a 1-line execution health summary.
 */
export function summarizeExecutionHealth(p: {
  pressure:         ExecutionPressure;
  activeCount:      number;
  blockedCount:     number;
  pendingApprovals: number;
  rollbackCount:    number;
}): string {
  if (p.pressure === "critical") {
    return p.blockedCount > 0
      ? `${p.blockedCount} ejecución${p.blockedCount > 1 ? "es" : ""} bloqueada${p.blockedCount > 1 ? "s" : ""} — intervención requerida`
      : "Presión crítica de ejecución — revisar sistema";
  }
  if (p.pressure === "elevated") {
    return p.blockedCount > 0
      ? `${p.blockedCount} dispatch${p.blockedCount > 1 ? "es" : ""} bloqueado${p.blockedCount > 1 ? "s" : ""} — atención requerida`
      : `${p.pendingApprovals} aprobación${p.pendingApprovals > 1 ? "es" : ""} pendiente${p.pendingApprovals > 1 ? "s" : ""}`;
  }
  if (p.pressure === "pending") {
    return p.pendingApprovals > 0
      ? `${p.pendingApprovals} aprobación${p.pendingApprovals > 1 ? "es" : ""} esperando revisión humana`
      : "Ejecuciones en cola — procesando";
  }
  return p.activeCount > 0
    ? `${p.activeCount} ejecución${p.activeCount > 1 ? "es" : ""} activa${p.activeCount > 1 ? "s" : ""} — todo nominal`
    : "Sin ejecuciones activas — sistema libre";
}
