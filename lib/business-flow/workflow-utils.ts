/**
 * workflow-utils.ts
 *
 * PRODUCTION-WORKFLOW-01
 * Shared utilities for the Business Flow Engine.
 *
 * No Prisma. No React. Pure domain helpers.
 */

import type { WorkflowDefinition } from "./workflow-definition";
import type { WorkflowInstance } from "./workflow-instance";
import type { WorkflowStatus } from "./workflow-types";

// ── Status Checks ────────────────────────────────────────────────────────────

/** Whether the workflow is in a terminal state. */
export function isTerminal(status: WorkflowStatus): boolean {
  return status === "completed" || status === "cancelled" || status === "failed";
}

/** Whether the workflow can be advanced. */
export function isAdvanceable(status: WorkflowStatus): boolean {
  return status === "running";
}

/** Whether the workflow can be paused. */
export function isPauseable(status: WorkflowStatus): boolean {
  return status === "running";
}

/** Whether the workflow can be resumed. */
export function isResumable(status: WorkflowStatus): boolean {
  return status === "paused" || status === "blocked";
}

// ── Stage Navigation ─────────────────────────────────────────────────────────

/** Get the next available stage codes from the current stage. */
export function getNextStageCodes(
  definition: WorkflowDefinition,
  currentStageCode: string,
): string[] {
  return definition.transitions
    .filter(t => t.sourceStageCode === currentStageCode)
    .sort((a, b) => a.priority - b.priority)
    .map(t => t.targetStageCode);
}

/** Get the default next stage code (highest priority transition). */
export function getDefaultNextStage(
  definition: WorkflowDefinition,
  currentStageCode: string,
): string | null {
  const defaultT = definition.transitions.find(
    t => t.sourceStageCode === currentStageCode && t.isDefault,
  );
  if (defaultT) return defaultT.targetStageCode;

  const sorted = definition.transitions
    .filter(t => t.sourceStageCode === currentStageCode)
    .sort((a, b) => a.priority - b.priority);

  return sorted.length > 0 ? sorted[0].targetStageCode : null;
}

// ── Progress Estimation ──────────────────────────────────────────────────────

/** Estimate completion percentage from stage order. */
export function estimateCompletion(
  definition: WorkflowDefinition,
  currentStageCode: string,
): number {
  const stages = [...definition.stages].sort((a, b) => a.order - b.order);
  const currentIdx = stages.findIndex(s => s.code === currentStageCode);
  if (currentIdx < 0) return 0;
  return Math.round(((currentIdx + 1) / stages.length) * 100);
}

// ── SLA ──────────────────────────────────────────────────────────────────────

/** Check if a stage has breached its SLA. */
export function isSlaBreached(
  slaHours: number | null,
  enteredAt: string | null,
): boolean {
  if (!slaHours || !enteredAt) return false;
  const elapsed = (Date.now() - new Date(enteredAt).getTime()) / (1000 * 60 * 60);
  return elapsed > slaHours;
}

/** Get remaining SLA time in hours (negative = breached). */
export function slaRemainingHours(
  slaHours: number | null,
  enteredAt: string | null,
): number | null {
  if (!slaHours || !enteredAt) return null;
  const elapsed = (Date.now() - new Date(enteredAt).getTime()) / (1000 * 60 * 60);
  return Math.round((slaHours - elapsed) * 10) / 10;
}
