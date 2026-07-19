/**
 * lib/agents/runtime/agent-plan-executor.ts
 *
 * Agentik — Universal Agent Runtime — Plan Executor
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Executes an AgentPlan step by step:
 *   - validates capabilities per step
 *   - delegates dispatch to AgentActionDispatcherPort (interface-based)
 *   - records results in AgentAuditLog
 *   - handles errors, stops or continues based on step.optional
 *   - returns AgentResult
 *
 * Pure domain. Receives dispatcher as a dependency (no direct imports of server-only code).
 * No Prisma. No React. No LLM.
 */

import type {
  AgentDefinition,
  AgentPlan,
  AgentPlanStep,
  AgentResult,
  AgentAuditEntry,
  AgentExecutionContext,
  AgentResultStatus,
} from "./agent-types";
import { assertCapability }  from "./agent-capability-guard";
import { AgentAuditLog }     from "./agent-runtime-log";

// ── Dispatcher port ───────────────────────────────────────────────────────────

export interface StepDispatchResult {
  success:  boolean;
  output:   Record<string, unknown>;
  error?:   string;
}

/**
 * Interface that the executor calls per step.
 * Implemented by agent-action-dispatcher.ts (server-only).
 * This file stays pure by depending only on the interface.
 */
export interface AgentActionDispatcherPort {
  dispatch(
    step:    AgentPlanStep,
    agent:   AgentDefinition,
    context: AgentExecutionContext,
  ): Promise<StepDispatchResult>;
}

// ── Step execution ────────────────────────────────────────────────────────────

async function executeStep(
  step:       AgentPlanStep,
  agent:      AgentDefinition,
  context:    AgentExecutionContext,
  dispatcher: AgentActionDispatcherPort,
  audit:      AgentAuditLog,
): Promise<{ result: StepDispatchResult; skipped: boolean }> {
  // Validate capability
  try {
    assertCapability(agent, step.action);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    audit.record({
      agentId:    agent.id,
      event:      "step_capability_denied",
      stepId:     step.id,
      message:    msg,
      metadata:   { action: step.action },
    });
    if (step.optional) {
      return { result: { success: false, output: {}, error: msg }, skipped: true };
    }
    return { result: { success: false, output: {}, error: msg }, skipped: false };
  }

  audit.record({
    agentId:  agent.id,
    event:    "step_started",
    stepId:   step.id,
    message:  `Ejecutando step "${step.label}" (action=${step.action})`,
    metadata: { action: step.action, params: step.params },
  });

  try {
    const result = await dispatcher.dispatch(step, agent, context);

    audit.record({
      agentId:  agent.id,
      event:    result.success ? "step_completed" : "step_failed",
      stepId:   step.id,
      message:  result.success
        ? `Step "${step.label}" completado.`
        : `Step "${step.label}" falló: ${result.error ?? "unknown"}`,
      metadata: { output: result.output, error: result.error },
    });

    return { result, skipped: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    audit.record({
      agentId:  agent.id,
      event:    "step_error",
      stepId:   step.id,
      message:  `Error inesperado en step "${step.label}": ${msg}`,
      metadata: { error: msg },
    });
    return { result: { success: false, output: {}, error: msg }, skipped: false };
  }
}

// ── Plan executor ─────────────────────────────────────────────────────────────

export interface PlanExecutionOptions {
  /** If true, stops on first non-optional step failure. Default: true. */
  stopOnFailure?: boolean;
}

export async function executePlan(
  plan:       AgentPlan,
  agent:      AgentDefinition,
  context:    AgentExecutionContext,
  dispatcher: AgentActionDispatcherPort,
  audit:      AgentAuditLog,
  options:    PlanExecutionOptions = {},
): Promise<AgentResult> {
  const { stopOnFailure = true } = options;
  const startedAt = new Date().toISOString();

  audit.record({
    agentId:  agent.id,
    event:    "plan_started",
    message:  `Plan "${plan.id}" iniciado (${plan.steps.length} steps).`,
    metadata: { planId: plan.id, goalType: plan.goal.type },
  });

  let executedSteps = 0;
  let failedSteps   = 0;
  let skippedSteps  = 0;
  const output: Record<string, unknown> = {};
  const errors: string[] = [];
  let finalStatus: AgentResultStatus = "completed";

  for (const step of plan.steps) {
    const { result, skipped } = await executeStep(step, agent, context, dispatcher, audit);

    if (skipped) {
      skippedSteps++;
      continue;
    }

    if (result.success) {
      executedSteps++;
      Object.assign(output, { [step.id]: result.output });
    } else {
      failedSteps++;
      errors.push(result.error ?? `Step "${step.id}" failed`);

      if (!step.optional && stopOnFailure) {
        finalStatus = "partial";
        audit.record({
          agentId:  agent.id,
          event:    "plan_stopped",
          message:  `Plan detenido en step "${step.label}" (stopOnFailure=true).`,
          metadata: { stepId: step.id, error: result.error },
        });
        break;
      }
    }
  }

  if (failedSteps > 0 && executedSteps === 0) finalStatus = "failed";
  else if (failedSteps === 0 && executedSteps > 0) finalStatus = "completed";
  else if (failedSteps > 0) finalStatus = "partial";

  const completedAt = new Date().toISOString();

  audit.record({
    agentId:  agent.id,
    event:    "plan_completed",
    message:  `Plan "${plan.id}" finalizado. Status=${finalStatus}. Executed=${executedSteps}, Failed=${failedSteps}, Skipped=${skippedSteps}.`,
    metadata: { planId: plan.id, finalStatus, executedSteps, failedSteps, skippedSteps },
  });

  return {
    agentId:       agent.id,
    goal:          plan.goal,
    plan,
    status:        finalStatus,
    executedSteps,
    failedSteps,
    skippedSteps,
    output,
    errors,
    auditTrail:    audit.getEntries(),
    startedAt,
    completedAt,
    metadata:      { planId: plan.id },
  };
}
