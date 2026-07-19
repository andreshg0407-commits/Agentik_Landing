/**
 * lib/runtime/agent-workload.ts
 *
 * Agentik — Agent Workload Tracker V1
 *
 * Block A of Sprint AGENTIK-RUNTIME-ORCHESTRATION-GATEWAY-OBSERVABILITY-01
 *
 * Models per-agent operational load: active operations, pending approvals,
 * blocked actions. Used to surface overload risk and route executions.
 *
 * V1: deterministic from context snapshot — no DB, no real scheduling.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type WorkloadLevel =
  | "idle"        // No active operations
  | "light"       // 1–2 ops
  | "active"      // 3–5 ops (normal)
  | "heavy"       // 6–8 ops (watch)
  | "overloaded"; // > 8 ops (intervention may be needed)

export interface AgentWorkload {
  agentId:           string;
  activeOperations:  number;
  pendingApprovals:  number;
  blockedActions:    number;
  workloadLevel:     WorkloadLevel;
  workloadSummary:   string;
}

// ── Workload computation ───────────────────────────────────────────────────────

function deriveWorkloadLevel(active: number): WorkloadLevel {
  if (active === 0)  return "idle";
  if (active <= 2)   return "light";
  if (active <= 5)   return "active";
  if (active <= 8)   return "heavy";
  return "overloaded";
}

/**
 * Builds a workload snapshot for an agent given current context signals.
 * V1: derives load from signals, collaborations, and operations.
 */
export function buildAgentWorkload(
  agentId:          string,
  activeOps:        number,
  pendingApprovals: number,
  blockedActions:   number,
): AgentWorkload {
  const level   = deriveWorkloadLevel(activeOps + pendingApprovals);
  const agentName = agentId.charAt(0).toUpperCase() + agentId.slice(1);

  const workloadSummary =
    level === "idle"       ? `${agentName}: sin operaciones activas`  :
    level === "light"      ? `${agentName}: carga ligera`             :
    level === "active"     ? `${agentName}: operando normalmente`     :
    level === "heavy"      ? `${agentName}: carga alta — monitoreo`   :
    `${agentName}: sobrecargado — intervención recomendada`;

  return {
    agentId,
    activeOperations:  activeOps,
    pendingApprovals,
    blockedActions,
    workloadLevel:     level,
    workloadSummary,
  };
}

/**
 * Builds workloads for all 4 active agents from operational context.
 * V1: Diego is primary owner of most ops; others derive from collaboration signals.
 */
export function buildAllAgentWorkloads(params: {
  primaryAgentId:    string;
  primaryOps:        number;
  pendingApprovals:  number;
  collaborationCount: number;
  runtimeState:      string;
}): AgentWorkload[] {
  const { primaryAgentId, primaryOps, pendingApprovals, collaborationCount, runtimeState } = params;

  // Distribute load: primary agent has most ops, collaborators have lighter load
  const degradedBoost = runtimeState === "DEGRADED" ? 2 : 0;

  const workloads: AgentWorkload[] = [
    buildAgentWorkload(
      primaryAgentId,
      primaryOps + degradedBoost,
      pendingApprovals,
      runtimeState === "DEGRADED" ? 1 : 0,
    ),
  ];

  // Add collaborator workloads (lighter)
  const collaboratorIds = ["diego", "luca", "sofi", "mila"].filter(
    id => id !== primaryAgentId
  );

  for (const id of collaboratorIds.slice(0, 3)) {
    workloads.push(
      buildAgentWorkload(
        id,
        Math.min(collaborationCount, 2),
        0,
        0,
      )
    );
  }

  return workloads;
}

/**
 * Returns a compact summary of all agent workloads.
 */
export function summarizeAgentWorkloads(workloads: AgentWorkload[]): string {
  const overloaded = workloads.filter(w => w.workloadLevel === "overloaded");
  const heavy      = workloads.filter(w => w.workloadLevel === "heavy");
  const active     = workloads.filter(w => w.workloadLevel === "active" || w.workloadLevel === "light");

  if (overloaded.length > 0) return `${overloaded.length} agente${overloaded.length > 1 ? "s" : ""} sobrecargado${overloaded.length > 1 ? "s" : ""}`;
  if (heavy.length > 0)      return `${heavy.length} agente${heavy.length > 1 ? "s" : ""} con carga alta`;
  if (active.length > 0)     return `${active.length} agente${active.length > 1 ? "s" : ""} operando`;
  return "Todos los agentes en reposo";
}
