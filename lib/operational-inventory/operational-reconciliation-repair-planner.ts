/**
 * lib/operational-inventory/operational-reconciliation-repair-planner.ts
 *
 * Operational Reconciliation Repair Planner — pure planning, NO execution.
 *
 * ─── V1 RULE ──────────────────────────────────────────────────────────────────
 * This module NEVER applies fixes. It only produces a plan.
 * Critical issues require human approval before any action.
 * Execution layer is a future sprint (AGENTIK-RECONCILIATION-RUNTIME-01).
 *
 * ─── FUTURE INTEGRATION ───────────────────────────────────────────────────────
 * When the runtime approval center is ready, this plan will generate:
 *   - ActionTask entries for coordinator review
 *   - runtime event: inventory.reconciliation_issue_detected
 *   - runtime event: reservation.repair_suggested
 *   - Copilot alert surfaced to the coordinator workspace
 *   - David insight: "X issues detected in operational inventory — review needed"
 *   - Production pressure suppression for refs with critical data inconsistency
 *
 * Sprint: AGENTIK-OPERATIONAL-INVENTORY-RECONCILIATION-01
 */

import type {
  OperationalReconciliationReport,
  OperationalReconciliationIssue,
  OperationalReconciliationRepairPlan,
  OperationalReconciliationRepairAction,
  OperationalReconciliationFixSuggestion,
  OperationalReconciliationFixType,
}                from "./operational-reconciliation-types";

// ─── Main planner ─────────────────────────────────────────────────────────────

/**
 * Converts a reconciliation report into a repair plan.
 * Pure function — no DB access, no side effects.
 *
 * Rules:
 *   - Critical issues → requiresApproval=true, safeToAutoApply=false (always)
 *   - Stale reservations → safeToAutoApply=true (low risk)
 *   - Missing reservation → flagged, no auto-apply
 *   - Duplicate reservation → no auto-apply (human must choose canonical)
 *   - no_auto_fix → always requiresApproval=true
 */
export function buildReconciliationRepairPlan(
  report: OperationalReconciliationReport,
): OperationalReconciliationRepairPlan {
  const now     = new Date().toISOString();
  const actions: OperationalReconciliationRepairAction[] = [];

  for (const issue of report.issues) {
    // Skip info issues with no actionable fix
    if (issue.suggestedFix.fixType === "no_auto_fix" && issue.severity === "info") continue;

    const action = _planIssue(report.id, report.organizationId, issue, now);
    if (action) actions.push(action);
  }

  const autoApplicable   = actions.filter(a => a.safeToAutoApply).length;
  const requiresApproval = actions.filter(a => a.requiresApproval).length;
  const noAutoFix        = actions.filter(a => a.fixType === "no_auto_fix").length;

  return {
    reportId:         report.id,
    organizationId:   report.organizationId,
    totalActions:     actions.length,
    autoApplicable,
    requiresApproval,
    noAutoFix,
    actions,
    plannedAt:        now,
  };
}

// ─── Internal ─────────────────────────────────────────────────────────────────

let _actionSeq = 0;

function _planIssue(
  reportId:       string,
  organizationId: string,
  issue:          OperationalReconciliationIssue,
  now:            string,
): OperationalReconciliationRepairAction | null {
  const fix = issue.suggestedFix;

  // V1 safety rule: critical issues are NEVER auto-applied
  const safeToAutoApply =
    issue.severity === "critical" ? false : fix.safeToAutoApply;

  const requiresApproval =
    issue.severity === "critical" ? true : fix.requiresApproval;

  // Derive a meaningful targetType and targetId from issue context
  const targetType = fix.targetType ?? _deriveTargetType(issue);
  const targetId   = fix.targetId   ?? _deriveTargetId(issue);

  if (!targetType || !targetId) return null; // can't plan without a target

  return {
    id:               `repair_${reportId}_${++_actionSeq}`,
    issueId:          issue.id,
    organizationId,
    fixType:          fix.fixType as OperationalReconciliationFixType,
    safeToAutoApply,
    requiresApproval,
    targetType,
    targetId,
    proposedPayload:  fix.proposedPayload ?? _buildDefaultPayload(issue),
    reason:           fix.reason,
    severity:         issue.severity,
    plannedAt:        now,
  };
}

function _deriveTargetType(issue: OperationalReconciliationIssue): string {
  if (issue.reservationId) return "reservation";
  if (issue.orderId)       return "order";
  if (issue.reference)     return "reference";
  return "unknown";
}

function _deriveTargetId(issue: OperationalReconciliationIssue): string {
  return issue.reservationId
    ?? issue.orderId
    ?? issue.sourceId
    ?? issue.reference
    ?? "";
}

function _buildDefaultPayload(
  issue: OperationalReconciliationIssue,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { issueType: issue.type };
  if (issue.reference)     payload.reference     = issue.reference;
  if (issue.sourceType)    payload.sourceType     = issue.sourceType;
  if (issue.sourceId)      payload.sourceId       = issue.sourceId;
  if (issue.reservationId) payload.reservationId  = issue.reservationId;
  if (issue.orderId)       payload.orderId        = issue.orderId;
  if (issue.expected !== undefined) payload.expected = issue.expected;
  if (issue.actual   !== undefined) payload.actual   = issue.actual;
  if (issue.delta    !== undefined) payload.delta    = issue.delta;
  return payload;
}
