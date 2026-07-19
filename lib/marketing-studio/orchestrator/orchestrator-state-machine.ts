/**
 * lib/marketing-studio/orchestrator/orchestrator-state-machine.ts
 *
 * MS-18 — Execution Actions: State transition engine
 *
 * Pure computation — no Prisma, no side effects.
 */

import type { OrchestratorStatus, OrchestratorStageStatus } from "./orchestrator-types";
import { InvalidTransitionError } from "./orchestrator-actions";

// ── Plan transition graph ─────────────────────────────────────────────────────

const VALID_PLAN_TRANSITIONS: Record<OrchestratorStatus, OrchestratorStatus[]> = {
  draft:               ["validating", "queued", "archived"],
  validating:          ["queued", "blocked", "failed"],
  blocked:             ["queued", "validating", "archived"],
  queued:              ["running", "paused", "archived"],
  running:             ["partially_completed", "completed", "failed", "paused"],
  partially_completed: ["running", "failed", "paused", "archived"],
  completed:           ["archived"],
  failed:              ["queued", "archived"],
  paused:              ["running", "queued", "archived"],
  archived:            [],   // terminal
};

// completed → running: FORBIDDEN
// archived → running:  FORBIDDEN
// cancelled → any:     FORBIDDEN (treat archived as final)

// ── Stage transition graph ────────────────────────────────────────────────────

const VALID_STAGE_TRANSITIONS: Record<OrchestratorStageStatus, OrchestratorStageStatus[]> = {
  pending:   ["ready", "blocked", "skipped"],
  ready:     ["running", "blocked", "skipped"],
  running:   ["completed", "failed"],
  completed: [],   // terminal
  blocked:   ["ready", "pending"],
  failed:    ["ready", "skipped"],
  skipped:   [],   // terminal
};

// ── Assertions ────────────────────────────────────────────────────────────────

export function assertValidPlanTransition(
  from: OrchestratorStatus,
  to:   OrchestratorStatus,
): void {
  const allowed = VALID_PLAN_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function assertValidStageTransition(
  from: OrchestratorStageStatus,
  to:   OrchestratorStageStatus,
): void {
  const allowed = VALID_STAGE_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidTransitionError(from, to);
  }
}

// ── Safe transition helpers ───────────────────────────────────────────────────
// Return false instead of throwing — useful for conditional logic

export function canTransitionPlan(from: OrchestratorStatus, to: OrchestratorStatus): boolean {
  return (VALID_PLAN_TRANSITIONS[from] ?? []).includes(to);
}

export function canTransitionStage(from: OrchestratorStageStatus, to: OrchestratorStageStatus): boolean {
  return (VALID_STAGE_TRANSITIONS[from] ?? []).includes(to);
}

// ── Status mappers: OrchestratorStatus ↔ PublishingStatus (DB strings) ────────

export function orchestratorStatusToPublishing(status: OrchestratorStatus): string {
  switch (status) {
    case "draft":               return "draft";
    case "validating":          return "preparing";
    case "blocked":             return "blocked";
    case "queued":              return "queued";
    case "running":             return "publishing";
    case "partially_completed": return "partial";
    case "completed":           return "published";
    case "failed":              return "failed";
    case "paused":              return "queued";   // closest in publishing schema
    case "archived":            return "archived";
  }
}

export function publishingStatusToOrchestrator(status: string): OrchestratorStatus {
  switch (status) {
    case "draft":      return "draft";
    case "preparing":  return "validating";
    case "planned":    return "queued";
    case "blocked":    return "blocked";
    case "queued":     return "queued";
    case "publishing": return "running";
    case "partial":    return "partially_completed";
    case "published":  return "completed";
    case "failed":     return "failed";
    case "retrying":   return "running";
    case "cancelled":  return "archived";
    case "archived":   return "archived";
    default:           return "draft";
  }
}

// ── Derive plan status from stage statuses ────────────────────────────────────

export function derivePlanStatusFromStages(
  stageStatuses: OrchestratorStageStatus[],
  current:        OrchestratorStatus,
): OrchestratorStatus {
  if (stageStatuses.length === 0) return current;

  const allDone    = stageStatuses.every(s => s === "completed" || s === "skipped");
  const anyRunning = stageStatuses.some(s => s === "running");
  const anyFailed  = stageStatuses.some(s => s === "failed");
  const anyBlocked = stageStatuses.some(s => s === "blocked");
  const someDone   = stageStatuses.some(s => s === "completed");

  if (allDone)                       return "completed";
  if (anyRunning)                    return "running";
  if (anyFailed && someDone)         return "partially_completed";
  if (anyFailed && !someDone)        return "failed";
  if (anyBlocked)                    return "blocked";
  return current;
}
