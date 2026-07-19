/**
 * lib/copilot/copilot-agent-executor.ts
 *
 * Agentik — Copilot Intelligence — Agent Executor
 * Sprint: AGENTIK-COPILOT-INTELLIGENCE-01
 *
 * Executes a CopilotExecutionPlan against the Agent Runtime.
 *
 * Execution modes:
 *   - parallelizable = true  → Promise.all (agents run concurrently)
 *   - parallelizable = false → sequential (single agent)
 *
 * Delegates entirely to executeGoal() from the Agent Runtime.
 * NEVER calls AI providers directly.
 * NEVER calls AI Layer directly.
 *
 * SERVER-ONLY — executeGoal imports Prisma transitively.
 */
import "server-only";

import type { AgentId, AgentExecutionContext, GoalType } from "@/lib/agents/runtime/agent-types";
import { executeGoal }                from "@/lib/agents/runtime/server";
import type { AgentRuntimeResult }    from "@/lib/agents/runtime/agent-runtime";
import { resolveAgent }               from "@/lib/agents/runtime/agent-resolver";
import { resolveAgentDisplayName }    from "@/lib/agents/runtime/agent-tenant-profile";
import type { CopilotAgentResult, CopilotExecutionPlan, CopilotRequest } from "./copilot-types";

// ── Goal type mapping ─────────────────────────────────────────────────────────

const AGENT_GOAL_TYPE: Record<AgentId, GoalType> = {
  finance_agent:    "finance",
  marketing_agent:  "marketing",
  commercial_agent: "commercial",
  collections_agent:"collections",
};

// ── Per-agent execution ───────────────────────────────────────────────────────

async function executeOneAgent(
  agentId: AgentId,
  request: CopilotRequest,
): Promise<CopilotAgentResult> {
  const agentDef  = resolveAgent(agentId);
  const baseName  = agentDef?.displayName ?? agentId;
  const display   = resolveAgentDisplayName(request.orgSlug, agentId, baseName);
  const goalType  = AGENT_GOAL_TYPE[agentId] ?? "generic";

  const context: AgentExecutionContext = {
    orgSlug: request.orgSlug,
    actor:   {
      type:  request.actor.type,
      id:    request.actor.id,
      label: request.actor.label,
    },
    goal: {
      type:        goalType,
      description: request.userMessage,
      priority:    "medium",
      metadata:    {
        copilotRequest: true,
        sourceIntent:   request.metadata?.intent ?? "unknown",
        requestId:      request.id,
      },
    },
    metadata: {
      copilotRequest: true,
      requestId:      request.id,
    },
  };

  let runtimeResult: AgentRuntimeResult;
  try {
    runtimeResult = await executeGoal(agentId, context, { stopOnFailure: false });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      agentId,
      displayName:   display,
      success:       false,
      summary:       buildErrorSummary(display, msg),
      error:         msg,
      executedSteps: 0,
      metadata:      { agentId, goalType },
    };
  }

  const result   = runtimeResult.result;
  const steps    = result?.executedSteps ?? 0;
  const status   = result?.status ?? "failed";

  return {
    agentId,
    displayName:   display,
    success:       runtimeResult.success,
    summary:       buildSuccessSummary(display, steps, status, runtimeResult),
    error:         runtimeResult.error,
    executedSteps: steps,
    metadata:      {
      agentId,
      goalType,
      status,
      failedSteps:   result?.failedSteps ?? 0,
      skippedSteps:  result?.skippedSteps ?? 0,
      errors:        result?.errors ?? [],
    },
  };
}

// ── Summary builders ──────────────────────────────────────────────────────────

function buildSuccessSummary(
  display:       string,
  steps:         number,
  status:        string,
  runtimeResult: AgentRuntimeResult,
): string {
  if (!runtimeResult.success) {
    return `${display}: ${runtimeResult.error ?? "No se pudo completar la ejecución."}`;
  }
  const statusLabel: Record<string, string> = {
    completed: "completado",
    partial:   "completado parcialmente",
    failed:    "falló",
    blocked:   "bloqueado",
    deferred:  "diferido",
  };
  const label = statusLabel[status] ?? status;
  return `${display}: ${steps} paso(s) ${label}.`;
}

function buildErrorSummary(display: string, error: string): string {
  return `${display}: Error inesperado — ${error}`;
}

// ── Plan executor ─────────────────────────────────────────────────────────────

/**
 * Execute all agents in the plan.
 *
 * Parallel if plan.parallelizable = true (Promise.all).
 * Sequential if plan.parallelizable = false.
 *
 * Never throws — returns CopilotAgentResult[] with error fields set for failures.
 */
export async function executeCopilotPlan(
  plan:    CopilotExecutionPlan,
  request: CopilotRequest,
): Promise<CopilotAgentResult[]> {
  if (plan.agents.length === 0) return [];

  if (plan.parallelizable) {
    // All agents run concurrently
    return Promise.all(
      plan.agents.map(agentId => executeOneAgent(agentId, request)),
    );
  }

  // Single agent (or forced sequential)
  const results: CopilotAgentResult[] = [];
  for (const agentId of plan.agents) {
    results.push(await executeOneAgent(agentId, request));
  }
  return results;
}
