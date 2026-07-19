/**
 * lib/copilot/operation-progress.ts
 *
 * Agentik Copilot — Operation Progress Engine V1
 *
 * Phase 1 of Sprint AGENTIK-COPILOT-ACCOUNTABILITY-01
 *
 * Derives a progress snapshot from the current state of a compound operation.
 * V1: deterministic from operation status + step states + runtime.
 * V2: driven by Prisma.CopilotStepLog with real timestamps.
 *
 * All time fields are pre-formatted strings (serializable for RSC props).
 */

import type { CompoundOperation } from "./compound-operations";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OperationProgressStatus =
  | "pending"
  | "active"
  | "progressing"
  | "stalled"
  | "blocked"
  | "completed";

export type OperationMomentum = "improving" | "stable" | "slowing" | "critical";

export interface OperationProgressSnapshot {
  operationId:     string;
  overallProgress: number;           // 0–100
  completedSteps:  number;
  activeSteps:     number;
  blockedSteps:    number;
  stalledSteps:    number;
  pendingSteps:    number;
  lastMovementAt:  string;           // Relative time string — serializable
  status:          OperationProgressStatus;
  momentum:        OperationMomentum;
}

// ── Progress derivation helpers ───────────────────────────────────────────────

const STATUS_PROGRESS: Record<string, { base: number; spread: number }> = {
  proposed:   { base: 15, spread: 10 },
  ready:      { base: 40, spread: 15 },
  blocked:    { base: 25, spread: 10 },
  monitoring: { base: 60, spread: 15 },
  completed:  { base: 100, spread: 0 },
};

const RUNTIME_ADJUSTMENT: Record<string, number> = {
  HEALTHY:  5,
  SYNCING:  0,
  STALE:   -10,
  DEGRADED: -15,
};

function deriveProgress(
  operation:    CompoundOperation,
  runtimeState: string,
): number {
  const base         = STATUS_PROGRESS[operation.status] ?? { base: 20, spread: 0 };
  const runtimeAdj   = RUNTIME_ADJUSTMENT[runtimeState] ?? 0;
  const stepProgress = operation.steps.filter(s => s.status === "done").length / Math.max(1, operation.steps.length);
  const stepBoost    = Math.round(stepProgress * 20);

  return Math.max(0, Math.min(100, base.base + stepBoost + runtimeAdj));
}

function deriveProgressStatus(
  operation:    CompoundOperation,
  runtimeState: string,
): OperationProgressStatus {
  if (operation.status === "completed")  return "completed";
  if (operation.status === "blocked")    return "blocked";

  const hasBlockedSteps = operation.steps.some(s => s.status === "blocked");
  if (hasBlockedSteps)                   return "stalled";

  if (runtimeState === "DEGRADED" || runtimeState === "STALE") return "stalled";

  const hasActiveSteps = operation.steps.some(s => s.status === "ready" || s.status === "pending");
  if (operation.status === "monitoring") return hasActiveSteps ? "progressing" : "active";
  if (operation.status === "proposed")   return "pending";

  return "active";
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Computes the progress snapshot for a compound operation.
 * Pure function — no I/O, deterministic from operation state.
 */
export function computeOperationProgress(
  operation:    CompoundOperation,
  runtimeState: string,
): OperationProgressSnapshot {
  const steps    = operation.steps;
  const done     = steps.filter(s => s.status === "done").length;
  const blocked  = steps.filter(s => s.status === "blocked").length;
  const ready    = steps.filter(s => s.status === "ready").length;
  const pending  = steps.filter(s => s.status === "pending").length;

  // V1 "stalled" = marked ready but runtime is degraded
  const stalled  = (runtimeState === "DEGRADED" || runtimeState === "STALE")
    ? ready
    : 0;
  const active   = stalled > 0 ? 0 : ready;

  const progress = deriveProgress(operation, runtimeState);
  const status   = deriveProgressStatus(operation, runtimeState);
  const momentum = resolveOperationMomentum(operation, runtimeState, progress);

  return {
    operationId:     operation.id,
    overallProgress: progress,
    completedSteps:  done,
    activeSteps:     active,
    blockedSteps:    blocked,
    stalledSteps:    stalled,
    pendingSteps:    pending,
    lastMovementAt:  operation.status === "completed" ? "completado"
                   : operation.status === "blocked"   ? "sin movimiento reciente"
                   : "esta sesión",
    status,
    momentum,
  };
}

/**
 * Resolves operational momentum — the directional quality of progress.
 */
export function resolveOperationMomentum(
  operation:    CompoundOperation,
  runtimeState: string,
  progress:     number,
): OperationMomentum {
  if (runtimeState === "DEGRADED" && operation.status === "blocked") return "critical";
  if (runtimeState === "DEGRADED" || operation.status === "blocked") return "slowing";
  if (runtimeState === "STALE")                                       return "slowing";
  if (operation.status === "completed")                               return "improving";
  if (operation.status === "monitoring" && progress >= 60)            return "improving";
  return "stable";
}

/**
 * Returns a single-line progress summary for rail display.
 */
export function summarizeOperationProgress(snapshot: OperationProgressSnapshot): string {
  if (snapshot.status === "completed")  return "Operación completada";
  if (snapshot.status === "blocked")    return `Bloqueada — ${snapshot.blockedSteps} paso${snapshot.blockedSteps > 1 ? "s" : ""} detenido${snapshot.blockedSteps > 1 ? "s" : ""}`;
  if (snapshot.status === "stalled")    return `Pausada — runtime degradado, ${snapshot.stalledSteps} paso${snapshot.stalledSteps > 1 ? "s" : ""} en espera`;
  if (snapshot.activeSteps > 0)        return `${snapshot.activeSteps} paso${snapshot.activeSteps > 1 ? "s" : ""} activo${snapshot.activeSteps > 1 ? "s" : ""}`;
  if (snapshot.pendingSteps > 0)       return `${snapshot.pendingSteps} paso${snapshot.pendingSteps > 1 ? "s" : ""} pendiente${snapshot.pendingSteps > 1 ? "s" : ""}`;
  return "En seguimiento";
}
