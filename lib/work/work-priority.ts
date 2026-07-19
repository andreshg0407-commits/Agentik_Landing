/**
 * lib/work/work-priority.ts
 *
 * Agentik — Work Priority Helpers
 * Sprint: AGENTIK-WORK-EXECUTION-FOUNDATION-01
 *
 * Pure functions for WorkPriority.
 * No React, no Prisma, no Copilot.
 */

import type { WorkPriority } from "./work-types";

// ── Weight map ────────────────────────────────────────────────────────────────

const PRIORITY_WEIGHT: Record<WorkPriority, number> = {
  LOW:      1,
  MEDIUM:   2,
  HIGH:     3,
  CRITICAL: 4,
};

// ── Labels ────────────────────────────────────────────────────────────────────

const PRIORITY_LABELS: Record<WorkPriority, string> = {
  LOW:      "Baja",
  MEDIUM:   "Media",
  HIGH:     "Alta",
  CRITICAL: "Crítica",
};

// ── Tones ─────────────────────────────────────────────────────────────────────

export type WorkPriorityTone = "neutral" | "info" | "warning" | "danger";

const PRIORITY_TONES: Record<WorkPriority, WorkPriorityTone> = {
  LOW:      "neutral",
  MEDIUM:   "info",
  HIGH:     "warning",
  CRITICAL: "danger",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function normalizeWorkPriority(raw: string): WorkPriority {
  const valid: WorkPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  return (valid as string[]).includes(raw) ? raw as WorkPriority : "MEDIUM";
}

export function compareWorkPriority(a: WorkPriority, b: WorkPriority): number {
  return PRIORITY_WEIGHT[a] - PRIORITY_WEIGHT[b];
}

export function isHighWorkPriority(priority: WorkPriority): boolean {
  return priority === "HIGH" || priority === "CRITICAL";
}

export function isCriticalWork(priority: WorkPriority): boolean {
  return priority === "CRITICAL";
}

export function getWorkPriorityWeight(priority: WorkPriority): number {
  return PRIORITY_WEIGHT[priority];
}

export function getWorkPriorityLabel(priority: WorkPriority): string {
  return PRIORITY_LABELS[priority];
}

export function getWorkPriorityTone(priority: WorkPriority): WorkPriorityTone {
  return PRIORITY_TONES[priority];
}
