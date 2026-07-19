/**
 * lib/copilot/execution-confirmation.ts
 *
 * Agentik Copilot — Execution Confirmation Layer V3
 *
 * Phase 5 of Sprint AGENTIK-EXECUTION-LAYER-V3-CONTROLLED-OPS-01
 *
 * Models the human-in-the-loop confirmation gate for supervised operations.
 * Every supervised execution MUST pass through this confirmation layer.
 *
 * V3: confirmation lifecycle real, no external persistence yet.
 * V4: backed by Prisma.CopilotExecutionConfirmation with operator notifications.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type ConfirmationState =
  | "pending"     // Waiting for human decision
  | "approved"    // Human approved execution
  | "denied"      // Human denied execution
  | "expired";    // Confirmation window expired

export interface ExecutionConfirmation {
  executionId:           string;
  requestedByAgent:      string;
  requiresHumanApproval: boolean;
  confirmationState:     ConfirmationState;
  confirmationMessage:   string;       // Human-readable status message
  requestedAt:           string;       // ISO string
  expiresAt?:            string;       // ISO string — optional TTL
  denialReason?:         string;       // Populated when denied
}

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Builds an execution confirmation record for a supervised execution.
 */
export function buildExecutionConfirmation(params: {
  executionId:           string;
  requestedByAgent:      string;
  requiresHumanApproval: boolean;
  operationTitle?:       string;
  ttlMinutes?:           number;       // Default: 30 minutes
}): ExecutionConfirmation {
  const ttl        = params.ttlMinutes ?? 30;
  const requestedAt = new Date();
  const expiresAt   = new Date(requestedAt.getTime() + ttl * 60_000);

  const message = params.requiresHumanApproval
    ? `Confirmación requerida para "${params.operationTitle ?? params.executionId}"`
    : `Operación en modo draft — no requiere confirmación humana`;

  return {
    executionId:           params.executionId,
    requestedByAgent:      params.requestedByAgent,
    requiresHumanApproval: params.requiresHumanApproval,
    confirmationState:     params.requiresHumanApproval ? "pending" : "approved",
    confirmationMessage:   message,
    requestedAt:           requestedAt.toISOString(),
    expiresAt:             params.requiresHumanApproval ? expiresAt.toISOString() : undefined,
  };
}

/**
 * Resolves the effective confirmation state, accounting for expiry.
 */
export function resolveExecutionConfirmation(
  confirmation: ExecutionConfirmation,
): ExecutionConfirmation {
  // Already finalized
  if (
    confirmation.confirmationState === "approved" ||
    confirmation.confirmationState === "denied"
  ) {
    return confirmation;
  }

  // Check expiry
  if (
    confirmation.expiresAt &&
    new Date() > new Date(confirmation.expiresAt)
  ) {
    return {
      ...confirmation,
      confirmationState:   "expired",
      confirmationMessage: "Confirmación expirada — solicitud cancelada automáticamente",
    };
  }

  return confirmation;
}

/**
 * Returns a 1-line confirmation status summary for rail display.
 */
export function summarizeExecutionConfirmation(
  confirmation: ExecutionConfirmation | null,
): string {
  if (!confirmation) return "Sin confirmación activa";

  const LABELS: Record<ConfirmationState, string> = {
    pending:  "Confirmación pendiente — esperando aprobación",
    approved: "Aprobado — listo para ejecución",
    denied:   "Denegado — operación cancelada",
    expired:  "Confirmación expirada — reiniciar operación",
  };

  return LABELS[confirmation.confirmationState] ?? confirmation.confirmationMessage;
}

/**
 * Returns true if the execution is allowed to proceed.
 */
export function isConfirmedForExecution(confirmation: ExecutionConfirmation): boolean {
  return resolveExecutionConfirmation(confirmation).confirmationState === "approved";
}
