/**
 * dashboard-utils.ts
 *
 * EXECUTIVE-OPERATIONAL-DASHBOARD-04
 * Utility functions for the Executive Control Center.
 *
 * No Prisma. No React. No server-only. Pure domain types.
 */

import type { ExecutiveDashboardState, ExecutiveTimelineEntry } from "./dashboard-types";

// -- Filters ------------------------------------------------------------------

/** Get timeline entries for a specific type. */
export function timelineByType(
  state: ExecutiveDashboardState,
  type: ExecutiveTimelineEntry["entryType"],
): ExecutiveTimelineEntry[] {
  return state.timeline.filter(t => t.entryType === type);
}

/** Get timeline entries at or above a severity. */
export function timelineBySeverity(
  state: ExecutiveDashboardState,
  minSeverity: "info" | "low" | "medium" | "high" | "critical",
): ExecutiveTimelineEntry[] {
  const rank: Record<string, number> = {
    info: 0, low: 1, medium: 2, high: 3, critical: 4,
  };
  const min = rank[minSeverity];
  return state.timeline.filter(t => rank[t.severity] >= min);
}

// -- Counts -------------------------------------------------------------------

/** Count total active signals across all categories. */
export function totalActiveSignals(state: ExecutiveDashboardState): number {
  return state.signals.reduce((s, c) => s + c.total, 0);
}

/** Count critical signals. */
export function totalCriticalSignals(state: ExecutiveDashboardState): number {
  return state.signals.reduce((s, c) => s + c.bySeverity.critical, 0);
}

/** Count actions pending approval. */
export function actionsPendingApproval(state: ExecutiveDashboardState): number {
  return state.actions.filter(a => a.requiresApproval && a.approvalStatus === "pending").length;
}

// -- Summary ------------------------------------------------------------------

/** One-line health summary. */
export function healthSummary(state: ExecutiveDashboardState): string {
  const h = state.health;
  return `Salud: ${h.level} (${h.score}/100) | Riesgo: ${h.riskLevel} | Confianza: ${h.confidence}%`;
}

/** Check if dashboard has actionable items. */
export function hasActionableItems(state: ExecutiveDashboardState): boolean {
  return (
    state.decisions.length > 0 ||
    state.actions.some(a => a.requiresApproval && a.approvalStatus === "pending") ||
    state.signals.some(s => s.bySeverity.critical > 0)
  );
}
