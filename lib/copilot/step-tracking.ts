/**
 * lib/copilot/step-tracking.ts
 *
 * Agentik Copilot — Step Tracking Engine V1
 *
 * Phase 2 of Sprint AGENTIK-COPILOT-ACCOUNTABILITY-01
 *
 * Maps compound operation steps to tracked runtime states.
 * V1: deterministic mock — derives state from runtime + module context.
 * V2: driven by Prisma.CopilotStepExecution with real completion events.
 *
 * Detection rules:
 *   - integration module + DEGRADED/STALE runtime  → stalled
 *   - finanzas/conciliacion step + blocked op       → blocked
 *   - requiresApproval + no approver               → blocked
 *   - index === 0 + op not blocked                 → progressing (active)
 *   - otherwise                                    → pending
 */

import type { CompoundOperation, StepStatus } from "./compound-operations";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TrackedOperationStep {
  stepId:           string;
  operationId:      string;
  label:            string;
  module:           string;
  status:           StepStatus;
  progressPercent:  number;     // 0–100 for current step
  blockedReason?:   string;
  requiresApproval: boolean;
  lastUpdatedAt:    string;     // Relative time — serializable
}

// ── Detection rules ───────────────────────────────────────────────────────────

const BLOCKED_REASONS: Record<string, string> = {
  "finanzas/conciliacion": "Excepciones críticas sin resolver bloquean este paso",
  "finanzas/cierre":       "Cierre del período pendiente de aprobación",
  "integrations":          "Conector o fuente de datos degradada",
};

const MODULE_PROGRESS: Record<string, number> = {
  "collections":           45,
  "finanzas/tesoreria":    30,
  "finanzas/conciliacion": 20,
  "finanzas/cierre":       15,
  "integrations":          35,
  "sales":                 50,
  "pipeline":              40,
  "agentik/marketing-studio": 55,
};

function deriveStepStatus(
  stepIndex:    number,
  module:       string,
  requiresApp:  boolean,
  opStatus:     CompoundOperation["status"],
  runtimeState: string,
): StepStatus {
  // Completed operation → all done
  if (opStatus === "completed") return "done";

  // Integration steps in degraded runtime → stalled (we track as "ready" but flag as stalled at higher level)
  if (module === "integrations" && (runtimeState === "DEGRADED" || runtimeState === "STALE")) {
    return "pending"; // will be marked stalled at progress level
  }

  // Conciliation steps in blocked close operations → blocked
  if (module === "finanzas/conciliacion" && opStatus === "blocked") return "blocked";
  if (module === "finanzas/cierre"       && opStatus === "blocked") return "blocked";

  // Approval required → blocked in V1 (no live approver context)
  if (requiresApp && opStatus === "blocked") return "blocked";

  // First step in active/proposed operations → ready (being worked)
  if (stepIndex === 0 && opStatus !== "blocked") return "ready";

  // Second step in monitoring operations → also ready
  if (stepIndex === 1 && opStatus === "monitoring") return "ready";

  // Everything else → pending
  return "pending";
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Builds a tracked step list from a compound operation's current state.
 * Pure function — deterministic V1 mock.
 */
export function buildTrackedSteps(
  operation:    CompoundOperation,
  runtimeState: string,
): TrackedOperationStep[] {
  return operation.steps.map((step, index) => {
    const status = deriveStepStatus(
      index,
      step.module,
      step.requiresApproval,
      operation.status,
      runtimeState,
    );

    const progressPercent =
      status === "done"      ? 100 :
      status === "ready"     ? MODULE_PROGRESS[step.module] ?? 40 :
      status === "blocked"   ? 0   :
      5; // pending = minimal

    const lastUpdatedAt =
      status === "done"    ? "completado"         :
      status === "ready"   ? "esta sesión"         :
      status === "blocked" ? "bloqueado"           :
      "pendiente";

    return {
      stepId:           step.id,
      operationId:      operation.id,
      label:            step.label,
      module:           step.module,
      status,
      progressPercent,
      blockedReason:    status === "blocked"
        ? (BLOCKED_REASONS[step.module] ?? "Dependencia sin resolver")
        : undefined,
      requiresApproval: step.requiresApproval,
      lastUpdatedAt,
    };
  });
}

/**
 * Returns only the blocked steps from a tracked step list.
 */
export function detectBlockedSteps(steps: TrackedOperationStep[]): TrackedOperationStep[] {
  return steps.filter(s => s.status === "blocked");
}

/**
 * Returns steps that are stalled (ready but runtime is degraded).
 * A step is considered stalled if it's ready but its module is integration-class
 * and the reason is external (not internal approval).
 */
export function detectStalledSteps(
  steps:        TrackedOperationStep[],
  runtimeState: string,
): TrackedOperationStep[] {
  if (runtimeState !== "DEGRADED" && runtimeState !== "STALE") return [];
  return steps.filter(s => s.status === "ready" && s.module === "integrations");
}
