/**
 * lib/marketing-studio/publishing/publishing-state-machine.ts
 *
 * MS-17 — Unified Publishing OS: State machine
 *
 * Enforces valid transitions. No silent invalid state changes.
 * Pure functions. No Prisma. No async.
 */

import {
  PUBLISHING_STATUS,
  type PublishingStatus,
  type PublishingPlan,
  type PublishingPlanStep,
} from "./publishing-types";

// ── Valid transitions ─────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<PublishingStatus, PublishingStatus[]> = {
  [PUBLISHING_STATUS.DRAFT]:      ["planned", "cancelled"],
  [PUBLISHING_STATUS.PLANNED]:    ["queued", "blocked", "cancelled"],
  [PUBLISHING_STATUS.BLOCKED]:    ["planned", "queued", "cancelled"],
  [PUBLISHING_STATUS.QUEUED]:     ["preparing", "blocked", "cancelled"],
  [PUBLISHING_STATUS.PREPARING]:  ["publishing", "failed", "cancelled"],
  [PUBLISHING_STATUS.PUBLISHING]: ["published", "partial", "failed", "cancelled"],
  [PUBLISHING_STATUS.PUBLISHED]:  ["archived"],
  [PUBLISHING_STATUS.PARTIAL]:    ["publishing", "failed", "retrying", "archived"],
  [PUBLISHING_STATUS.FAILED]:     ["retrying", "cancelled", "archived"],
  [PUBLISHING_STATUS.RETRYING]:   ["queued", "failed", "cancelled"],
  [PUBLISHING_STATUS.CANCELLED]:  ["archived"],
  [PUBLISHING_STATUS.ARCHIVED]:   [],
};

// ── Transition validation ─────────────────────────────────────────────────────

export function assertValidPublishingTransition(
  from: PublishingStatus,
  to:   PublishingStatus,
): void {
  const allowed = VALID_TRANSITIONS[from] ?? [];
  if (!(allowed as string[]).includes(to)) {
    throw new Error(
      `Invalid publishing transition: ${from} → ${to}. Allowed: [${allowed.join(", ")}]`,
    );
  }
}

export function isValidPublishingTransition(
  from: PublishingStatus,
  to:   PublishingStatus,
): boolean {
  const allowed = VALID_TRANSITIONS[from] ?? [];
  return (allowed as string[]).includes(to);
}

export function transitionPublishingStatus(
  current: PublishingStatus,
  to:      PublishingStatus,
): PublishingStatus {
  assertValidPublishingTransition(current, to);
  return to;
}

// ── Progress computation ──────────────────────────────────────────────────────

export function computePlanProgress(steps: PublishingPlanStep[]): number {
  if (steps.length === 0) return 0;
  const terminal = steps.filter(s =>
    (["published", "archived", "cancelled"] as string[]).includes(s.status),
  );
  return Math.round((terminal.length / steps.length) * 100);
}

export function computeStepProgress(step: PublishingPlanStep): number {
  const depCount = step.dependencies.length;
  if (depCount === 0) return 100;
  const resolved = step.dependencies.filter(d => d.isResolved).length;
  return Math.round((resolved / depCount) * 100);
}

// ── Plan status derivation ────────────────────────────────────────────────────

export function derivePlanStatusFromSteps(steps: PublishingPlanStep[]): PublishingStatus {
  if (steps.length === 0) return PUBLISHING_STATUS.DRAFT;

  const statuses = steps.map(s => s.status);
  const allPublished  = statuses.every(s => s === "published" || s === "archived");
  const anyPublishing = statuses.some(s => s === "publishing" || s === "preparing");
  const anyBlocked    = statuses.some(s => s === "blocked");
  const anyFailed     = statuses.some(s => s === "failed");
  const anyRetrying   = statuses.some(s => s === "retrying");
  const somePublished = statuses.some(s => s === "published");

  if (allPublished)                        return PUBLISHING_STATUS.PUBLISHED;
  if (anyPublishing)                       return PUBLISHING_STATUS.PUBLISHING;
  if (anyBlocked && !anyPublishing)        return PUBLISHING_STATUS.BLOCKED;
  if (anyRetrying)                         return PUBLISHING_STATUS.RETRYING;
  if (anyFailed && somePublished)          return PUBLISHING_STATUS.PARTIAL;
  if (anyFailed)                           return PUBLISHING_STATUS.FAILED;
  return PUBLISHING_STATUS.QUEUED;
}

// ── Terminal state checks ─────────────────────────────────────────────────────

export function isPlanTerminal(plan: PublishingPlan): boolean {
  return (["published", "failed", "cancelled", "archived"] as string[]).includes(plan.status);
}

export function isStepExecutable(step: PublishingPlanStep): boolean {
  const executableStatuses: string[] = ["planned", "queued", "retrying"];
  return executableStatuses.includes(step.status) && step.canExecute;
}
