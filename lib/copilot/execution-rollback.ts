/**
 * lib/copilot/execution-rollback.ts
 *
 * Agentik Copilot — Execution Rollback Engine V3
 *
 * Phase 4 of Sprint AGENTIK-EXECUTION-LAYER-V3-CONTROLLED-OPS-01
 *
 * V3: Rollback lifecycle and audit simulation.
 *     No real rollback yet — architecture is real, reversal is simulated.
 * V4: Full rollback against Prisma state + external system undo calls.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type RollbackState =
  | "not_started"     // Default — rollback not yet attempted
  | "available"       // Rollback is supported and can be triggered
  | "in_progress"     // Rollback is being executed
  | "completed"       // Rollback successfully completed
  | "not_supported"   // This operation cannot be rolled back
  | "failed";         // Rollback attempt failed

export interface RollbackOperation {
  executionId:    string;
  reversible:     boolean;
  rollbackReason: string;
  rollbackState:  RollbackState;
  createdAt:      string;          // ISO string
  // V4: rollback steps, Prisma revert plan, external undo call list
}

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Builds a rollback operation record for a given execution.
 */
export function buildRollbackOperation(
  executionId:    string,
  reversible:     boolean,
  rollbackReason: string = "Operación revertida por solicitud del operador",
): RollbackOperation {
  return {
    executionId,
    reversible,
    rollbackReason,
    rollbackState: reversible ? "available" : "not_supported",
    createdAt:     new Date().toISOString(),
  };
}

/**
 * Determines whether a given execution can be rolled back.
 * V3: Based on action type and bundle metadata — no real state query.
 */
export function canRollbackExecution(rollback: RollbackOperation): boolean {
  return (
    rollback.reversible &&
    rollback.rollbackState !== "not_supported" &&
    rollback.rollbackState !== "failed" &&
    rollback.rollbackState !== "completed"
  );
}

/**
 * Returns a human-readable summary of rollback capability for UI.
 */
export function summarizeRollbackCapability(
  rollback: RollbackOperation | null,
): string {
  if (!rollback)                                        return "Estado de reversión desconocido";
  if (rollback.rollbackState === "not_supported")       return "Reversión no disponible para esta operación";
  if (rollback.rollbackState === "available")           return "Reversión disponible — pendiente de solicitud";
  if (rollback.rollbackState === "in_progress")        return "Reversión en curso…";
  if (rollback.rollbackState === "completed")           return "Operación revertida correctamente";
  if (rollback.rollbackState === "failed")              return "Error en reversión — intervención manual requerida";
  return "Reversión no iniciada";
}

/**
 * Simulates transitioning a rollback to in_progress state.
 * V3: Lifecycle simulation only — no real undo.
 */
export function triggerRollback(rollback: RollbackOperation): RollbackOperation {
  if (!canRollbackExecution(rollback)) return rollback;
  return { ...rollback, rollbackState: "in_progress" };
}
