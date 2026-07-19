/**
 * lib/runtime/execution-queue.ts
 *
 * Agentik — Execution Queue V1
 *
 * Block A of Sprint AGENTIK-RUNTIME-ORCHESTRATION-GATEWAY-OBSERVABILITY-01
 *
 * Models the queue of pending supervised executions.
 * Tracks priority, status, and blockage state of each queued operation.
 *
 * V1: in-memory, deterministic from copilot execution state.
 * V2: backed by Prisma.ExecutionQueueEntry with real scheduling.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type QueueEntryPriority = "low" | "normal" | "high" | "urgent";

export type QueueEntryStatus =
  | "queued"      // Waiting for execution slot
  | "executing"   // Currently executing
  | "paused"      // Paused by human operator
  | "blocked"     // Blocked by dependency or governance
  | "completed"   // Successfully completed
  | "failed";     // Failed — needs retry or intervention

export interface ExecutionQueueEntry {
  id:           string;
  executionId:  string;
  agentId:      string;
  priority:     QueueEntryPriority;
  status:       QueueEntryStatus;
  description:  string;
  queuedAt:     string;   // ISO string
  blockedBy?:   string;   // Why it's blocked
}

export interface ExecutionQueue {
  orgSlug:      string;
  entries:      ExecutionQueueEntry[];
  totalQueued:  number;
  activeCount:  number;
  blockedCount: number;
  pausedCount:  number;
  queueSummary: string;
}

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * Builds an execution queue from the current supervised execution state.
 * V1: single-entry queue based on active supervised execution.
 */
export function buildExecutionQueue(params: {
  orgSlug:      string;
  executionId?: string;
  agentId?:     string;
  status?:      string;   // SupervisedExecutionStatus
  requiresApproval?: boolean;
  runtimeState?: string;
}): ExecutionQueue {
  const { orgSlug, executionId, agentId, status, requiresApproval, runtimeState } = params;

  if (!executionId || !agentId) {
    return {
      orgSlug,
      entries:      [],
      totalQueued:  0,
      activeCount:  0,
      blockedCount: 0,
      pausedCount:  0,
      queueSummary: "Cola vacía — sin operaciones pendientes",
    };
  }

  // Map supervised execution status → queue status
  const queueStatus: QueueEntryStatus =
    status === "executing"             ? "executing" :
    status === "completed"             ? "completed" :
    status === "failed"                ? "failed"    :
    status === "awaiting_confirmation" ? "paused"    :
    runtimeState === "DEGRADED"        ? "blocked"   :
    "queued";

  const priority: QueueEntryPriority = requiresApproval ? "high" : "normal";

  const entry: ExecutionQueueEntry = {
    id:          `queue-${executionId.slice(0, 8)}`,
    executionId,
    agentId,
    priority,
    status:      queueStatus,
    description: `Ejecución supervisada — modo ${status === "awaiting_confirmation" ? "confirmación pendiente" : "preparada"}`,
    queuedAt:    new Date().toISOString(),
    blockedBy:   queueStatus === "blocked" ? "Runtime degradado" : undefined,
  };

  const entries    = [entry];
  const totalQueued  = entries.filter(e => e.status === "queued" || e.status === "paused").length;
  const activeCount  = entries.filter(e => e.status === "executing").length;
  const blockedCount = entries.filter(e => e.status === "blocked").length;
  const pausedCount  = entries.filter(e => e.status === "paused").length;

  const queueSummary =
    blockedCount > 0 ? `${blockedCount} operación${blockedCount !== 1 ? "es" : ""} bloqueada${blockedCount !== 1 ? "s" : ""}` :
    activeCount  > 0 ? "Ejecución en progreso"                  :
    pausedCount  > 0 ? "Esperando confirmación del operador"    :
    totalQueued  > 0 ? `${totalQueued} en cola — lista para despacho` :
    "Cola operativa vacía";

  return { orgSlug, entries, totalQueued, activeCount, blockedCount, pausedCount, queueSummary };
}

/**
 * Returns the primary queued entry (highest priority non-completed).
 */
export function getPrimaryQueueEntry(
  queue: ExecutionQueue,
): ExecutionQueueEntry | null {
  const PRIORITY_SCORE: Record<QueueEntryPriority, number> = {
    urgent: 4, high: 3, normal: 2, low: 1,
  };
  const active = queue.entries.filter(
    e => e.status !== "completed" && e.status !== "failed"
  );
  if (active.length === 0) return null;
  return active.sort(
    (a, b) => PRIORITY_SCORE[b.priority] - PRIORITY_SCORE[a.priority]
  )[0] ?? null;
}
