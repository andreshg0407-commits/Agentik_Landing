/**
 * lib/runtime/orchestration-state.ts
 *
 * Agentik — Orchestration State V1
 *
 * Block A of Sprint AGENTIK-RUNTIME-ORCHESTRATION-GATEWAY-OBSERVABILITY-01
 *
 * Aggregates runtime health, execution queue, and agent workloads
 * into a single orchestration snapshot used by the Copilot pipeline.
 */

import type { RuntimeState, RuntimeHealthState } from "./runtime-state";
import type { ExecutionQueue }                    from "./execution-queue";
import type { AgentWorkload }                     from "./agent-workload";

// ── Types ──────────────────────────────────────────────────────────────────────

export type OrchestrationMode =
  | "normal"       // Everything operational
  | "supervised"   // Human-in-the-loop required for all operations
  | "restricted"   // Reduced capability set
  | "maintenance"  // Maintenance window
  | "recovery";    // Active recovery from degradation

export interface OrchestrationState {
  orgSlug:              string;
  runtimeState:         RuntimeHealthState;
  orchestrationMode:    OrchestrationMode;
  pendingExecutions:    number;
  blockedExecutions:    number;
  activeWorkloads:      number;
  queueDepth:           number;
  canDispatch:          boolean;        // Can queue new executions?
  canAutoDispatch:      boolean;        // Can dispatch without human approval? (V3: always false)
  connectorReadiness:   number;         // 0–100% of connectors healthy
  summary:              string;
}

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * Builds the orchestration state from runtime + queue + workload snapshots.
 */
export function buildOrchestrationState(
  runtime:   RuntimeState,
  queue:     ExecutionQueue,
  workloads: AgentWorkload[],
): OrchestrationState {
  const { state } = runtime;

  const orchestrationMode: OrchestrationMode =
    state === "blocked"    ? "restricted"  :
    state === "degraded"   ? "supervised"  :
    state === "recovering" ? "recovery"    :
    state === "stale"      ? "supervised"  :
    "normal";

  const canDispatch     = state !== "blocked";
  const canAutoDispatch = false; // V3 hard constraint

  const totalConnectors = Math.max(1, runtime.connectors.length);
  const healthyConnectors = runtime.connectors.filter(
    c => c.state === "healthy" || c.state === "syncing"
  ).length;
  const connectorReadiness = Math.round((healthyConnectors / totalConnectors) * 100);

  const activeWorkloads = workloads.reduce(
    (sum, w) => sum + w.activeOperations, 0
  );

  const summary =
    orchestrationMode === "restricted"  ? "Orquestación restringida — modo recuperación"   :
    orchestrationMode === "supervised"  ? "Supervisión activa — aprobación humana requerida" :
    orchestrationMode === "recovery"    ? "Recuperación en curso — capacidades reducidas"   :
    queue.totalQueued > 0               ? `${queue.totalQueued} ejecución${queue.totalQueued !== 1 ? "es" : ""} en cola` :
    "Orquestación nominal — sistema listo";

  return {
    orgSlug:           runtime.orgSlug,
    runtimeState:      state,
    orchestrationMode,
    pendingExecutions: queue.totalQueued,
    blockedExecutions: queue.blockedCount,
    activeWorkloads,
    queueDepth:        queue.totalQueued,
    canDispatch,
    canAutoDispatch,
    connectorReadiness,
    summary,
  };
}

/**
 * Returns a short mode label for UI display.
 */
export function getOrchestrationModeLabel(mode: OrchestrationMode): string {
  const MAP: Record<OrchestrationMode, string> = {
    normal:      "Nominal",
    supervised:  "Supervisado",
    restricted:  "Restringido",
    maintenance: "Mantenimiento",
    recovery:    "Recuperación",
  };
  return MAP[mode];
}
