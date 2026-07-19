/**
 * lib/copilot/operation-readiness.ts
 *
 * Agentik Copilot — Operation Readiness Engine V1
 *
 * Phase 3 of Sprint AGENTIK-COPILOT-COMPOUND-OPERATIONS-01
 *
 * Evaluates whether a compound operation can be executed given current
 * system state. Readiness is a function of runtime health, pending approvals,
 * unresolved intents, and integration gaps.
 *
 * V1: deterministic, no DB, pure function evaluation.
 */

import type { CompoundOperation } from "./compound-operations";

// ── Readiness types ───────────────────────────────────────────────────────────

export type ExecutionReadiness = "ready" | "partial" | "blocked";

export interface OperationBlocker {
  reason:   string;
  severity: "warning" | "critical";
  module:   string;
}

export interface OperationReadinessResult {
  readiness: ExecutionReadiness;
  blockers:  OperationBlocker[];
  score:     number;   // 0–100 — higher = more ready
  summary:   string;
}

// ── Readiness evaluation ───────────────────────────────────────────────────────

/**
 * Computes execution readiness for a compound operation.
 * Rules fire in priority order — most severe blockers reduce the score most.
 */
export function computeExecutionReadiness(
  operation:        CompoundOperation,
  runtimeState:     "HEALTHY" | "SYNCING" | "STALE" | "DEGRADED",
  pendingApprovals: number,
): OperationReadinessResult {
  const blockers = resolveOperationBlockers(operation, runtimeState, pendingApprovals);

  // Base score — reduced by blockers
  let score = 100;
  for (const b of blockers) {
    score -= b.severity === "critical" ? 35 : 15;
  }
  score = Math.max(0, Math.min(100, score));

  // Minimum thresholds for each readiness level
  const readiness: ExecutionReadiness =
    score >= 75 && blockers.every(b => b.severity === "warning") ? "ready"   :
    score >= 40                                                    ? "partial" :
    "blocked";

  // Propagate back to operation (mutation-free — caller stores result)
  return {
    readiness,
    blockers,
    score,
    summary: summarizeOperationRisk(operation, { readiness, blockers, score }),
  };
}

/**
 * Resolves blockers for an operation based on system state.
 */
export function resolveOperationBlockers(
  operation:        CompoundOperation,
  runtimeState:     "HEALTHY" | "SYNCING" | "STALE" | "DEGRADED",
  pendingApprovals: number = 0,
): OperationBlocker[] {
  const blockers: OperationBlocker[] = [];

  // Runtime degradation — reduces confidence in all operations
  if (runtimeState === "DEGRADED") {
    blockers.push({
      reason:   "Motor de señales en estado DEGRADED — datos pueden ser imprecisos",
      severity: "critical",
      module:   "integrations",
    });
  } else if (runtimeState === "STALE") {
    blockers.push({
      reason:   "Datos desactualizados — sincronización pendiente",
      severity: "warning",
      module:   "integrations",
    });
  }

  // Steps requiring approval with no approver available
  const approvalSteps = operation.steps.filter(s => s.requiresApproval);
  if (approvalSteps.length > 0 && pendingApprovals === 0) {
    blockers.push({
      reason:   `${approvalSteps.length} paso${approvalSteps.length > 1 ? "s" : ""} requieren aprobación`,
      severity: "warning",
      module:   approvalSteps[0]?.module ?? "executive",
    });
  }

  // Operation already explicitly marked blocked
  if (operation.status === "blocked") {
    blockers.push({
      reason:   "Operación bloqueada por dependencias sin resolver",
      severity: "critical",
      module:   operation.involvedModules[0] ?? "executive",
    });
  }

  // High-risk operations in degraded environments
  if (operation.riskLevel === "critical" && runtimeState !== "HEALTHY") {
    blockers.push({
      reason:   "Operación de riesgo crítico requiere runtime HEALTHY",
      severity: "critical",
      module:   "integrations",
    });
  }

  return blockers;
}

/**
 * Produces a single-line risk summary for rail display.
 */
export function summarizeOperationRisk(
  operation: CompoundOperation,
  result:    Omit<OperationReadinessResult, "summary">,
): string {
  const { readiness, blockers, score } = result;

  if (readiness === "blocked") {
    const critical = blockers.find(b => b.severity === "critical");
    return critical ? `Bloqueado — ${critical.reason.toLowerCase()}` : "Bloqueado — revisar dependencias";
  }

  if (readiness === "partial") {
    const warning = blockers.find(b => b.severity === "warning");
    return warning
      ? `Ejecución parcial — ${warning.reason.toLowerCase()}`
      : `Listo parcial — ${score}% de pasos preparados`;
  }

  const stepCount = operation.steps.length;
  return `Listo — ${stepCount} paso${stepCount > 1 ? "s" : ""} preparado${stepCount > 1 ? "s" : ""}`;
}
