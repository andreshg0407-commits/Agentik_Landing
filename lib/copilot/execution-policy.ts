/**
 * lib/copilot/execution-policy.ts
 *
 * Agentik Copilot — Execution Policy Engine V1
 *
 * Decides whether a Copilot action can execute given the current:
 *   - user role,
 *   - runtime state,
 *   - action risk level,
 *   - confirmation/approval requirements.
 *
 * Pure function — deterministic, no I/O, no side effects.
 * All security decisions go through here before any action is surfaced in the UI.
 *
 * Sprint: AGENTIK-COPILOT-EXECUTION-LAYER-01
 */

import type { Role } from "@prisma/client";
import type { CopilotExecutableAction, ExecutionStatus } from "./execution-registry";
import type { CopilotRuntimeState } from "./types";

// ── Policy result ──────────────────────────────────────────────────────────────

export interface ExecutionPolicyResult {
  allowed:              boolean;
  status:               ExecutionStatus;
  reason?:              string;   // Short reason for blocked/approval states
  requiresConfirmation: boolean;
  requiresApproval:     boolean;
  safetyMessage?:       string;   // Shown in the inline confirm component
}

// ── Role classification ────────────────────────────────────────────────────────

/** Roles with full execution authority — can approve and execute any action */
const ADMIN_ROLES: Role[] = ["SUPER_ADMIN", "AGENTIK_ADMIN", "ORG_ADMIN"];

/** Roles with operator-level authority — can confirm but not approve */
const OPERATOR_ROLES: Role[] = ["MANAGER", "OPERATOR"];

function isAdminRole(role: Role): boolean {
  return (ADMIN_ROLES as string[]).includes(role);
}

function isOperatorRole(role: Role): boolean {
  return (OPERATOR_ROLES as string[]).includes(role);
}

function canExecuteWithoutApproval(role: Role): boolean {
  return isAdminRole(role) || isOperatorRole(role);
}

// ── Safety messages by risk ────────────────────────────────────────────────────

const SAFETY_MESSAGE: Record<CopilotExecutableAction["risk"], string> = {
  low:      "Esta acción es de solo lectura y no modifica datos.",
  medium:   "Esta acción crea un borrador. Podrás revisarlo antes de confirmar.",
  high:     "Esta acción requiere tu confirmación — no es reversible.",
  critical: "Acción crítica con impacto financiero. Requiere aprobación de administrador.",
};

// ── Policy rules ───────────────────────────────────────────────────────────────

/**
 * Evaluates whether a Copilot action can execute in the current context.
 *
 * Rule priority (first matching rule wins):
 *  1. DEGRADED/STALE runtime blocks high+critical risk actions
 *  2. critical risk → always requires_approval if non-admin
 *  3. high risk → requires_confirmation for all; requires_approval if viewer/billing
 *  4. action.requiresApproval && non-admin → requires_approval
 *  5. action.requiresConfirmation → requires_confirmation
 *  6. Default → ready
 */
export function evaluateExecutionPolicy(
  action:       CopilotExecutableAction,
  role:         Role,
  runtimeState: CopilotRuntimeState,
): ExecutionPolicyResult {
  // ── Rule 1: Degraded runtime blocks high-risk actions ──────────────────────
  if (
    (runtimeState === "DEGRADED" || runtimeState === "STALE") &&
    (action.risk === "high" || action.risk === "critical")
  ) {
    return {
      allowed:              false,
      status:               "blocked",
      reason:               "Datos desactualizados",
      requiresConfirmation: false,
      requiresApproval:     false,
      safetyMessage:        "El contexto operacional está degradado. Sincroniza los datos antes de ejecutar esta acción.",
    };
  }

  // ── Rule 2: Critical risk — always requires approval from non-admin ─────────
  if (action.risk === "critical") {
    if (!isAdminRole(role)) {
      return {
        allowed:              false,
        status:               "requires_approval",
        reason:               "Requiere aprobación",
        requiresConfirmation: true,
        requiresApproval:     true,
        safetyMessage:        SAFETY_MESSAGE.critical,
      };
    }
    // Admin can confirm
    return {
      allowed:              true,
      status:               "requires_confirmation",
      requiresConfirmation: true,
      requiresApproval:     false,
      safetyMessage:        SAFETY_MESSAGE.critical,
    };
  }

  // ── Rule 3: High risk ───────────────────────────────────────────────────────
  if (action.risk === "high") {
    if (!canExecuteWithoutApproval(role)) {
      return {
        allowed:              false,
        status:               "requires_approval",
        reason:               "Permiso insuficiente",
        requiresConfirmation: true,
        requiresApproval:     true,
        safetyMessage:        SAFETY_MESSAGE.high,
      };
    }
    return {
      allowed:              true,
      status:               "requires_confirmation",
      requiresConfirmation: true,
      requiresApproval:     false,
      safetyMessage:        SAFETY_MESSAGE.high,
    };
  }

  // ── Rule 4: Action explicitly requires approval and role lacks it ───────────
  if (action.requiresApproval && !isAdminRole(role)) {
    return {
      allowed:              false,
      status:               "requires_approval",
      reason:               "Requiere aprobación",
      requiresConfirmation: true,
      requiresApproval:     true,
      safetyMessage:        SAFETY_MESSAGE[action.risk],
    };
  }

  // ── Rule 5: Requires confirmation ──────────────────────────────────────────
  if (action.requiresConfirmation) {
    return {
      allowed:              true,
      status:               "requires_confirmation",
      requiresConfirmation: true,
      requiresApproval:     false,
      safetyMessage:        SAFETY_MESSAGE[action.risk],
    };
  }

  // ── Rule 6: Ready ───────────────────────────────────────────────────────────
  return {
    allowed:              true,
    status:               "ready",
    requiresConfirmation: false,
    requiresApproval:     false,
  };
}

/**
 * Batch-evaluates policies for multiple actions.
 * Returns a map from actionId → ExecutionPolicyResult.
 */
export function evaluatePolicies(
  actions:      CopilotExecutableAction[],
  role:         Role,
  runtimeState: CopilotRuntimeState,
): Map<string, ExecutionPolicyResult> {
  const results = new Map<string, ExecutionPolicyResult>();
  for (const action of actions) {
    results.set(action.id, evaluateExecutionPolicy(action, role, runtimeState));
  }
  return results;
}
