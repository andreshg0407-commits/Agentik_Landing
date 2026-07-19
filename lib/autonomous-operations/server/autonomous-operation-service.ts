/**
 * lib/autonomous-operations/server/autonomous-operation-service.ts
 *
 * Agentik — Autonomous Operations Service
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * Server-only orchestration layer.
 * Coordinates: plan → (optionally) dispatch → return result.
 *
 * SERVER-ONLY. Never import from client components.
 * Never throws — always returns structured AutonomousOperationResult.
 */
import "server-only";

import type { AutonomousOperationInput }  from "../autonomous-operation-types";
import type { AutonomousOperationPlan }   from "../autonomous-operation-types";
import type { AutonomousOperationResult } from "../autonomous-operation-result";
import { planAutonomousOperation }        from "../autonomous-operation-planner";
import { dispatchAutonomousOperationPlan } from "./autonomous-operation-dispatcher";

// ── Service ───────────────────────────────────────────────────────────────────

export const autonomousOperationService = {

  /**
   * Create a plan only — does NOT dispatch to services.
   * Use when you want to preview / audit the plan before execution.
   */
  createOperationPlan(
    input: AutonomousOperationInput,
  ): AutonomousOperationPlan {
    return planAutonomousOperation(input);
  },

  /**
   * Execute a pre-existing plan against real services.
   * The plan must already be in READY_TO_EXECUTE status.
   */
  async executeOperationPlan(
    plan: AutonomousOperationPlan,
  ): Promise<AutonomousOperationResult> {
    return dispatchAutonomousOperationPlan(plan);
  },

  /**
   * Full lifecycle: plan → dispatch.
   * Plans the operation and — if status is READY_TO_EXECUTE — dispatches it.
   * Non-executable plans (BLOCKED, WAITING_APPROVAL, PLANNED) are returned as-is.
   */
  async planAndMaybeExecute(
    input: AutonomousOperationInput,
  ): Promise<AutonomousOperationResult> {
    const plan = planAutonomousOperation(input);

    if (plan.status === "READY_TO_EXECUTE") {
      return dispatchAutonomousOperationPlan(plan);
    }

    // Non-executable: return the plan result without dispatching
    return {
      success:  plan.status !== "BLOCKED" && plan.status !== "FAILED",
      message:  planStatusMessage(plan.status, plan.decision),
      plan,
      status:   plan.status,
      errors:   plan.errors,
      warnings: plan.warnings,
      auditTrail: plan.auditTrail,
    };
  },

  /**
   * Batch: plan and maybe execute multiple inputs.
   * Returns one result per input. Runs sequentially to avoid rate-limiting
   * downstream services.
   */
  async processBatch(
    inputs: AutonomousOperationInput[],
  ): Promise<AutonomousOperationResult[]> {
    const results: AutonomousOperationResult[] = [];
    for (const input of inputs) {
      const result = await autonomousOperationService.planAndMaybeExecute(input);
      results.push(result);
    }
    return results;
  },

};

// ── Status message ────────────────────────────────────────────────────────────

function planStatusMessage(
  status: AutonomousOperationPlan["status"],
  decision: AutonomousOperationPlan["decision"],
): string {
  switch (status) {
    case "BLOCKED":          return `Operación bloqueada por política: ${decision}`;
    case "WAITING_APPROVAL": return `Operación en espera de aprobación.`;
    case "PLANNED":          return `Operación planificada — requiere acción manual.`;
    case "COMPLETED":        return `Operación completada sin acciones (NO_ACTION).`;
    default:                 return `Plan en estado: ${status}`;
  }
}
