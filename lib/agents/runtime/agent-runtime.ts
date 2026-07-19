/**
 * lib/agents/runtime/agent-runtime.ts
 *
 * Agentik — Universal Agent Runtime — Main Engine
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Entry point for server-side agent execution.
 * Orchestrates: resolve → validate → plan → execute → return result.
 *
 * SERVER-ONLY — imports dispatcher (Prisma) transitively.
 * Call this from API routes and Server Actions only.
 */
import "server-only";

import type { AgentId, AgentExecutionContext, AgentResult } from "./agent-types";
import { resolveAgent }         from "./agent-resolver";
import { assertAgentEnabled }   from "./agent-capability-guard";
import { planGoal }             from "./agent-planner";
import { executePlan }          from "./agent-plan-executor";
import { AgentAuditLog }        from "./agent-runtime-log";
import { agentActionDispatcher } from "./agent-action-dispatcher";

// ── Runtime options ───────────────────────────────────────────────────────────

export interface AgentRuntimeOptions {
  /** Stop on first non-optional step failure. Default: true. */
  stopOnFailure?: boolean;
}

// ── Runtime result envelope ───────────────────────────────────────────────────

export interface AgentRuntimeResult {
  success:  boolean;
  result?:  AgentResult;
  error?:   string;
}

// ── executeGoal ───────────────────────────────────────────────────────────────

/**
 * Execute a goal for a given agent in a given org context.
 *
 * Flow:
 *   1. Resolve agent from registry by semantic ID ("finance_agent", etc.)
 *   2. Assert agent is enabled
 *   3. Create audit log
 *   4. Generate deterministic plan (rule-based, no LLM)
 *   5. Execute plan step by step via agentActionDispatcher (real integrations)
 *   6. Return AgentRuntimeResult envelope — never throws to callers
 *
 * @param agentId  Semantic agent ID — never a display name.
 * @param context  Execution context: orgSlug, actor, goal, memory.
 * @param options  Runtime behavior options.
 */
export async function executeGoal(
  agentId:  AgentId,
  context:  AgentExecutionContext,
  options:  AgentRuntimeOptions = {},
): Promise<AgentRuntimeResult> {
  // 1. Resolve agent
  const agent = resolveAgent(agentId);
  if (!agent) {
    return {
      success: false,
      error:   `Agent "${agentId}" not found in registry.`,
    };
  }

  // 2. Assert enabled
  try {
    assertAgentEnabled(agent);
  } catch (err: unknown) {
    return {
      success: false,
      error:   err instanceof Error ? err.message : String(err),
    };
  }

  // 3. Audit log
  const audit = new AgentAuditLog();

  audit.record({
    agentId:  agent.id,
    event:    "runtime_started",
    message:  `Runtime iniciado para agente "${agent.displayName}" (${agent.id}) en org "${context.orgSlug}".`,
    metadata: {
      orgSlug:   context.orgSlug,
      goalType:  context.goal.type,
      priority:  context.goal.priority,
      actorId:   context.actor.id,
      actorType: context.actor.type,
    },
  });

  // 4. Plan
  let plan;
  try {
    plan = planGoal(agent, context.goal);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    audit.record({
      agentId:  agent.id,
      event:    "plan_error",
      message:  `Error generando plan: ${msg}`,
      metadata: { goalType: context.goal.type, error: msg },
    });
    return { success: false, error: `Planning failed: ${msg}` };
  }

  // 5. Execute
  let result: AgentResult;
  try {
    result = await executePlan(
      plan,
      agent,
      context,
      agentActionDispatcher,
      audit,
      { stopOnFailure: options.stopOnFailure ?? true },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    audit.record({
      agentId:  agent.id,
      event:    "runtime_error",
      message:  `Error inesperado en ejecución: ${msg}`,
      metadata: { error: msg },
    });
    return { success: false, error: `Execution failed: ${msg}` };
  }

  // 6. Return
  const succeeded = result.status === "completed" || result.status === "partial";
  return { success: succeeded, result };
}
