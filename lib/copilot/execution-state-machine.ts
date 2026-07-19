/**
 * lib/copilot/execution-state-machine.ts
 *
 * Agentik Copilot — Execution State Machine V1
 *
 * Phase 4 of Sprint AGENTIK-EXECUTION-LAYER-V2-FOUNDATION-01
 *
 * Controls the lifecycle of an execution bundle from draft through
 * completion or rollback. Transitions are deterministic and validated.
 *
 * V1: simulation only — no side effects, no persistence.
 * V2: Prisma.CopilotExecutionState + real transition events.
 *
 * Phase 11 strategy: all V1/V2 bundles use "draft" or "supervised" mode.
 * "automatic" mode is reserved for V3/V4 after trust is established.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type ExecutionState =
  | "draft"             // Bundle created, not yet submitted for approval
  | "awaiting_approval" // Waiting for human to review and approve
  | "approved"          // Approved by authorized user — ready to queue
  | "queued"            // In the execution queue — waiting for runner
  | "executing"         // Runner is actively dispatching steps
  | "paused"            // Execution suspended mid-run (human intervention)
  | "blocked"           // Execution cannot proceed — dependency unresolved
  | "completed"         // All steps completed successfully
  | "failed"            // One or more steps failed
  | "rolled_back";      // Execution was reversed after failure or cancellation

export type ExecutionModeV2 =
  | "draft"       // Preparation only — no execution intent
  | "supervised"  // Human confirms every step — DEFAULT for V1/V2
  | "assisted"    // AI executes parts, human approves critical steps
  | "automatic";  // Fully autonomous — RESERVED for V3/V4

// ── Valid transition map ───────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<ExecutionState, ExecutionState[]> = {
  draft:             ["awaiting_approval", "blocked"],
  awaiting_approval: ["approved", "blocked", "draft"],    // draft = send back for revision
  approved:          ["queued", "blocked"],
  queued:            ["executing", "paused", "blocked"],
  executing:         ["paused", "completed", "failed", "blocked"],
  paused:            ["executing", "blocked", "rolled_back"],
  blocked:           ["draft", "rolled_back"],             // Must return to draft to fix
  completed:         [],                                   // Terminal
  failed:            ["rolled_back", "draft"],
  rolled_back:       [],                                   // Terminal
};

// ── State labels ───────────────────────────────────────────────────────────────

const STATE_LABEL: Record<ExecutionState, string> = {
  draft:             "Borrador",
  awaiting_approval: "Esperando aprobación",
  approved:          "Aprobado",
  queued:            "En cola",
  executing:         "Ejecutando",
  paused:            "Pausado",
  blocked:           "Bloqueado",
  completed:         "Completado",
  failed:            "Fallido",
  rolled_back:       "Revertido",
};

const STATE_SEVERITY: Record<ExecutionState, "critical" | "elevated" | "normal"> = {
  draft:             "normal",
  awaiting_approval: "elevated",
  approved:          "normal",
  queued:            "normal",
  executing:         "elevated",
  paused:            "elevated",
  blocked:           "critical",
  completed:         "normal",
  failed:            "critical",
  rolled_back:       "elevated",
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Resolves the current execution state from bundle properties.
 * Pure function — derives state from approval level, blockers, and readiness.
 */
export function resolveExecutionState(params: {
  hasBlockers:      boolean;
  approvalLevel:    string;   // "none" | "low" | "medium" | "high" | "critical"
  readiness:        string;   // "ready" | "partial" | "blocked"
  pendingApprovals: number;
}): ExecutionState {
  const { hasBlockers, approvalLevel, readiness, pendingApprovals } = params;

  // Hard blocked
  if (hasBlockers || readiness === "blocked") return "blocked";

  // Needs approval and none queued → awaiting
  if (approvalLevel !== "none" && pendingApprovals === 0) return "awaiting_approval";

  // Approved (approvals queued) → ready to queue
  if (approvalLevel !== "none" && pendingApprovals > 0) return "approved";

  // Low/no approval needed and partial readiness → draft
  if (readiness === "partial") return "draft";

  // Ready and no approval needed → still draft until human acts
  return "draft";
}

/**
 * Validates if a state transition is allowed.
 */
export function canTransitionExecutionState(
  from: ExecutionState,
  to:   ExecutionState,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Returns a human-readable state summary for rail display.
 */
export function summarizeExecutionState(state: ExecutionState): {
  label:    string;
  severity: "critical" | "elevated" | "normal";
} {
  return {
    label:    STATE_LABEL[state] ?? state,
    severity: STATE_SEVERITY[state] ?? "normal",
  };
}

/**
 * Returns the appropriate execution mode for V1/V2 bundles.
 * Phase 11 strategy: everything is "draft" or "supervised" in V1/V2.
 */
export function resolveExecutionMode(params: {
  approvalLevel: string;
  runtimeState:  string;
  hasBlockers:   boolean;
}): ExecutionModeV2 {
  const { approvalLevel, runtimeState, hasBlockers } = params;

  // Blocked or degraded → draft only
  if (hasBlockers || runtimeState === "DEGRADED") return "draft";

  // Critical/high approval → supervised (human confirms each step)
  if (approvalLevel === "critical" || approvalLevel === "high") return "supervised";

  // Medium approval → supervised
  if (approvalLevel === "medium") return "supervised";

  // Low/none → draft (still not automatic in V1/V2)
  return "draft";
}
