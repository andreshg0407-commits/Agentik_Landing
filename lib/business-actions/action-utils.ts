/**
 * action-utils.ts
 *
 * BUSINESS-ACTION-ENGINE-01
 * Utility functions for working with actions and action plans.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { BusinessAction } from "./action";
import type { ActionPlan } from "./action-plan";
import type { ActionExecutionResult, SuggestedEvent } from "./action-result";
import type { ActionStatus, ActionType } from "./action-types";

// -- Action Queries -----------------------------------------------------------

/** Get actions by status. */
export function actionsByStatus(actions: BusinessAction[], status: ActionStatus): BusinessAction[] {
  return actions.filter(a => a.status === status);
}

/** Get actions by type. */
export function actionsByType(actions: BusinessAction[], actionType: ActionType): BusinessAction[] {
  return actions.filter(a => a.actionType === actionType);
}

/** Get actions requiring approval. */
export function actionsPendingApproval(actions: BusinessAction[]): BusinessAction[] {
  return actions.filter(a => a.approval.required && a.approval.status === "pending");
}

/** Count actions by status. */
export function countActionsByStatus(actions: BusinessAction[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of actions) {
    counts[a.status] = (counts[a.status] ?? 0) + 1;
  }
  return counts;
}

/** Count actions by type. */
export function countActionsByType(actions: BusinessAction[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of actions) {
    counts[a.actionType] = (counts[a.actionType] ?? 0) + 1;
  }
  return counts;
}

// -- Plan Queries -------------------------------------------------------------

/** Get all actions from a plan. */
export function planActions(plan: ActionPlan): BusinessAction[] {
  return plan.actions;
}

/** Check if all actions in a plan are completed. */
export function isPlanComplete(plan: ActionPlan): boolean {
  return plan.actions.length > 0 && plan.actions.every(a => a.status === "completed");
}

/** Check if any action in a plan failed. */
export function hasPlanFailure(plan: ActionPlan): boolean {
  return plan.actions.some(a => a.status === "failed");
}

/** Check if plan has pending approvals. */
export function hasPendingApprovals(plan: ActionPlan): boolean {
  return plan.actions.some(a => a.approval.required && a.approval.status === "pending");
}

// -- Result Queries -----------------------------------------------------------

/** Get all suggested events from multiple results. */
export function allSuggestedEvents(results: ActionExecutionResult[]): SuggestedEvent[] {
  return results.flatMap(r => r.eventsToEmit);
}

/** Count successful results. */
export function successCount(results: ActionExecutionResult[]): number {
  return results.filter(r => r.success).length;
}

/** Count failed results. */
export function failureCount(results: ActionExecutionResult[]): number {
  return results.filter(r => !r.success && r.status === "failed").length;
}

/** Count dry-run results. */
export function dryRunCount(results: ActionExecutionResult[]): number {
  return results.filter(r => r.status === "dry_run_completed").length;
}

// -- Summary ------------------------------------------------------------------

/** Human-readable summary of an action plan execution. */
export function actionPlanSummary(plan: ActionPlan, results: ActionExecutionResult[]): string {
  const parts: string[] = [
    `"${plan.title}"`,
    `${plan.actions.length} accion(es)`,
    `modo: ${plan.executionMode}`,
  ];
  if (results.length > 0) {
    parts.push(`${successCount(results)} exitosa(s)`);
    parts.push(`${dryRunCount(results)} dry-run`);
    const fails = failureCount(results);
    if (fails > 0) parts.push(`${fails} fallida(s)`);
  }
  return parts.join(" | ");
}

/** Human-readable summary of a single action. */
export function actionSummary(action: BusinessAction): string {
  const parts: string[] = [
    `"${action.title}"`,
    `tipo: ${action.actionType}`,
    `estado: ${action.status}`,
  ];
  if (action.approval.required) {
    parts.push(`aprobacion: ${action.approval.status}`);
  }
  return parts.join(" | ");
}
