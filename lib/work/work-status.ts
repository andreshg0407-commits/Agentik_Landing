/**
 * lib/work/work-status.ts
 *
 * Agentik — Work Status Helpers
 * Sprint: AGENTIK-WORK-EXECUTION-FOUNDATION-01
 *
 * Pure functions for WorkStatus. Includes transition rules.
 * No React, no Prisma, no Copilot.
 */

import type { WorkStatus } from "./work-types";

// ── Labels ────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<WorkStatus, string> = {
  PENDING:   "Pendiente",
  RUNNING:   "En ejecución",
  WAITING:   "En espera",
  COMPLETED: "Completado",
  FAILED:    "Fallido",
  CANCELLED: "Cancelado",
};

// ── Tones ─────────────────────────────────────────────────────────────────────

export type WorkStatusTone = "neutral" | "info" | "warning" | "success" | "danger" | "muted";

const STATUS_TONES: Record<WorkStatus, WorkStatusTone> = {
  PENDING:   "neutral",
  RUNNING:   "info",
  WAITING:   "warning",
  COMPLETED: "success",
  FAILED:    "danger",
  CANCELLED: "muted",
};

// ── Transition rules ──────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<WorkStatus, WorkStatus[]> = {
  PENDING:   ["RUNNING", "CANCELLED"],
  RUNNING:   ["WAITING", "COMPLETED", "FAILED", "CANCELLED"],
  WAITING:   ["RUNNING", "CANCELLED"],
  COMPLETED: [],
  FAILED:    ["PENDING"],   // allow retry via re-queue
  CANCELLED: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function normalizeWorkStatus(raw: string): WorkStatus {
  const valid: WorkStatus[] = ["PENDING", "RUNNING", "WAITING", "COMPLETED", "FAILED", "CANCELLED"];
  return (valid as string[]).includes(raw) ? raw as WorkStatus : "PENDING";
}

export function isWorkCompleted(status: WorkStatus): boolean {
  return status === "COMPLETED";
}

export function isWorkFailed(status: WorkStatus): boolean {
  return status === "FAILED";
}

export function isWorkRunning(status: WorkStatus): boolean {
  return status === "RUNNING";
}

export function isWorkTerminal(status: WorkStatus): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

export function canTransitionWorkStatus(current: WorkStatus, next: WorkStatus): boolean {
  return ALLOWED_TRANSITIONS[current].includes(next);
}

export function allowedWorkTransitions(current: WorkStatus): WorkStatus[] {
  return ALLOWED_TRANSITIONS[current];
}

export function getWorkStatusLabel(status: WorkStatus): string {
  return STATUS_LABELS[status];
}

export function getWorkStatusTone(status: WorkStatus): WorkStatusTone {
  return STATUS_TONES[status];
}
