/**
 * lib/tasks/task-status.ts
 *
 * Agentik — Task Status Helpers
 * Sprint: AGENTIK-TASK-SYSTEM-FOUNDATION-01
 *
 * Pure functions for working with TaskStatus values.
 * Includes allowed transition rules.
 * No imports from React, Prisma, or Copilot.
 */

import type { TaskStatus } from "./task-types";

// ── Labels ────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<TaskStatus, string> = {
  open:        "Abierta",
  in_progress: "En proceso",
  waiting:     "En espera",
  blocked:     "Bloqueada",
  completed:   "Completada",
  cancelled:   "Cancelada",
};

// ── Tones ─────────────────────────────────────────────────────────────────────

export type TaskStatusTone = "neutral" | "info" | "warning" | "danger" | "success" | "muted";

const STATUS_TONES: Record<TaskStatus, TaskStatusTone> = {
  open:        "neutral",
  in_progress: "info",
  waiting:     "warning",
  blocked:     "danger",
  completed:   "success",
  cancelled:   "muted",
};

// ── Transition map ────────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  open:        ["in_progress", "waiting", "blocked", "cancelled"],
  in_progress: ["waiting", "blocked", "completed", "cancelled"],
  waiting:     ["in_progress", "blocked", "cancelled"],
  blocked:     ["in_progress", "waiting", "cancelled"],
  completed:   [],
  cancelled:   [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalize a raw string to a valid TaskStatus.
 * Falls back to "open" for unrecognized values.
 */
export function normalizeTaskStatus(raw: string): TaskStatus {
  const valid: TaskStatus[] = ["open", "in_progress", "waiting", "blocked", "completed", "cancelled"];
  return (valid as string[]).includes(raw) ? raw as TaskStatus : "open";
}

/**
 * Returns true if the task is in an open/actionable state.
 */
export function isTaskOpen(status: TaskStatus): boolean {
  return status === "open";
}

/**
 * Returns true if the task is in a terminal state (completed or cancelled).
 */
export function isTaskClosed(status: TaskStatus): boolean {
  return status === "completed" || status === "cancelled";
}

/**
 * Returns true if the task can receive work right now.
 * open and in_progress are actionable. waiting/blocked are not.
 */
export function isTaskActionable(status: TaskStatus): boolean {
  return status === "open" || status === "in_progress";
}

/**
 * Returns the Spanish business label for a status.
 */
export function getTaskStatusLabel(status: TaskStatus): string {
  return STATUS_LABELS[status];
}

/**
 * Returns the UI tone for a status.
 */
export function getTaskStatusTone(status: TaskStatus): TaskStatusTone {
  return STATUS_TONES[status];
}

/**
 * Returns the list of statuses that `current` can legally transition to.
 */
export function allowedTaskStatusTransitions(current: TaskStatus): TaskStatus[] {
  return ALLOWED_TRANSITIONS[current];
}

/**
 * Returns true if the transition from `current` to `next` is allowed.
 */
export function canTransitionTaskStatus(current: TaskStatus, next: TaskStatus): boolean {
  return ALLOWED_TRANSITIONS[current].includes(next);
}
