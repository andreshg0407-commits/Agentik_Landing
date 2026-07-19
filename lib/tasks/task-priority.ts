/**
 * lib/tasks/task-priority.ts
 *
 * Agentik — Task Priority Helpers
 * Sprint: AGENTIK-TASK-SYSTEM-FOUNDATION-01
 *
 * Pure functions for working with TaskPriority values.
 * No imports from React, Prisma, or Copilot.
 */

import type { TaskPriority } from "./task-types";

// ── Weight map ────────────────────────────────────────────────────────────────

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  low:      1,
  medium:   2,
  high:     3,
  critical: 4,
};

// ── Labels ────────────────────────────────────────────────────────────────────

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low:      "Baja",
  medium:   "Media",
  high:     "Alta",
  critical: "Crítica",
};

// ── Tones ─────────────────────────────────────────────────────────────────────

export type TaskPriorityTone = "neutral" | "info" | "warning" | "danger";

const PRIORITY_TONES: Record<TaskPriority, TaskPriorityTone> = {
  low:      "neutral",
  medium:   "info",
  high:     "warning",
  critical: "danger",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalize a raw string to a valid TaskPriority.
 * Falls back to "medium" for unrecognized values.
 */
export function normalizeTaskPriority(raw: string): TaskPriority {
  if (raw === "low" || raw === "medium" || raw === "high" || raw === "critical") {
    return raw;
  }
  return "medium";
}

/**
 * Compare two priorities.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareTaskPriority(a: TaskPriority, b: TaskPriority): number {
  return PRIORITY_WEIGHT[a] - PRIORITY_WEIGHT[b];
}

/**
 * Returns true if the task priority is high or critical.
 */
export function isHighPriorityTask(priority: TaskPriority): boolean {
  return priority === "high" || priority === "critical";
}

/**
 * Returns true if the task priority is critical.
 */
export function isCriticalTask(priority: TaskPriority): boolean {
  return priority === "critical";
}

/**
 * Returns the numeric weight of a priority (1–4).
 */
export function getTaskPriorityWeight(priority: TaskPriority): number {
  return PRIORITY_WEIGHT[priority];
}

/**
 * Returns the Spanish business label for a priority.
 */
export function getTaskPriorityLabel(priority: TaskPriority): string {
  return PRIORITY_LABELS[priority];
}

/**
 * Returns the UI tone for a priority.
 */
export function getTaskPriorityTone(priority: TaskPriority): TaskPriorityTone {
  return PRIORITY_TONES[priority];
}
