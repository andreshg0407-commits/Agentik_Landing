/**
 * lib/operational-inventory/operational-reconciliation-engine.ts
 *
 * Operational Inventory Reconciliation Engine — pure functional.
 *
 * ─── DESIGN ───────────────────────────────────────────────────────────────────
 * Pure function — no Prisma, no side effects, no mutations.
 * Callers assemble all inputs and call buildOperationalReconciliationReport().
 *
 * ─── CHECKS ───────────────────────────────────────────────────────────────────
 *   1.  Inventory formula consistency
 *   2.  Negative operational availability
 *   3.  Over-reserved references
 *   4.  Missing inventory reference for reservations
 *   5.  Cancelled orders still holding active reservations
 *   6.  Confirmed/reserved orders without any reservation
 *   7.  Order line qty vs reservation qty mismatch
 *   8.  Duplicate active reservations (same sourceId + reference)
 *   9.  Stale active reservations (expiresAt elapsed)
 *   10. Sales Portfolio assignment exceeds physical inventory
 *   11. Stale inventory snapshot
 *
 * Sprint: AGENTIK-OPERATIONAL-INVENTORY-RECONCILIATION-01
 */

import type { OperationalInventoryItem } from "./operational-inventory-types";
import type { OperationalReservation }    from "./operational-reservation-types";
import type { OperationalOrder }          from "@/lib/operational-data/operational-entities";
import type { VendorBagItem }             from "@/lib/comercial/maletas/vendor-bag-types";
import type {
  OperationalReconciliationReport,
  OperationalReconciliationIssue,
  OperationalReconciliationSummary,
  OperationalReconciliationIssueType,
  OperationalReconciliationFixSuggestion,
  OperationalReconciliationSeverity,
}                                          from "./operational-reconciliation-types";

// ─── Input ────────────────────────────────────────────────────────────────────

export interface ReconciliationEngineInput {
  organizationId:   string;
  /** Current operational inventory snapshot (after applyReservationsToInventory if desired) */
  inventory:        OperationalInventoryItem[];
  /** ALL reservations (active + terminal) for this org */
  reservations:     OperationalReservation[];
  /** Active CRM-sourced orders. If omitted, order-specific checks are skipped. */
  activeOrders?:    OperationalOrder[];
  /** Sales Portfolio items. If omitted, portfolio checks are skipped. */
  portfolioItems?:  VendorBagItem[];
  /** ISO timestamp when the SAG snapshot was last refreshed */
  snapshotAt?:      string;
  /** Stale threshold for inventory snapshot in seconds. Default: 7200 (2 h) */
  snapshotStaleSec?: number;
  generatedAt?:     string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FORMULA_TOLERANCE = 1;   // allow ±1 unit rounding difference
const HEALTH_WEIGHTS: Record<OperationalReconciliationSeverity, number> = {
  critical: 15,
  warning:   5,
  info:      1,
};
const SNAPSHOT_STALE_DEFAULT_SEC = 7200; // 2 hours

// ─── Main engine ──────────────────────────────────────────────────────────────

/**
 * Builds a full OperationalReconciliationReport from the provided inputs.
 * Pure function — no DB access, no side effects.
 */
export function buildOperationalReconciliationReport(
  input: ReconciliationEngineInput,
): OperationalReconciliationReport {
  const now         = input.generatedAt ?? new Date().toISOString();
  const reportId    = `recon_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const issues:      OperationalReconciliationIssue[] = [];

  const activeReservations = input.reservations.filter(r => r.status === "active");

  // ── Check 1: Inventory formula consistency ──────────────────────────────────
  for (const item of input.inventory) {
    const computed = item.physicalQty - item.reservedQty - item.salesAssignedQty - item.pendingTransfersQty;
    const delta    = item.operationalAvailableQty - computed;
    if (Math.abs(delta) > FORMULA_TOLERANCE) {
      issues.push(_issue(reportId, input.organizationId, now, {
        type:      "inventory_formula_mismatch",
        severity:  "warning",
        reference: item.reference,
        expected:  computed,
        actual:    item.operationalAvailableQty,
        delta,
        message:   `Reference ${item.reference}: formula gives ${computed} but operationalAvailableQty is ${item.operationalAvailableQty} (Δ${delta > 0 ? "+" : ""}${delta})`,
        suggestedFix: {
          fixType:          "review_inventory_source",
          safeToAutoApply:  false,
          requiresApproval: true,
          reason:           "Snapshot may be stale or reservation math drifted. Refresh SAG snapshot.",
          targetType:       "inventory_snapshot",
        },
      }));
    }
  }

  // ── Check 2: Negative operational availability ──────────────────────────────
  for (const item of input.inventory) {
    if (item.operationalAvailableQty < 0) {
      issues.push(_issue(reportId, input.organizationId, now, {
        type:      "negative_operational_available",
        severity:  "critical",
        reference: item.reference,
        expected:  0,
        actual:    item.operationalAvailableQty,
        delta:     item.operationalAvailableQty,
        message:   `Reference ${item.reference} has negative operationalAvailableQty (${item.operationalAvailableQty}). Reservations or assignments exceed physical stock.`,
        suggestedFix: {
          fixType:          "no_auto_fix",
          safeToAutoApply:  false,
          requiresApproval: true,
          reason:           "Critical: review all active reservations and portfolio assignments for this reference.",
          targetType:       "reference",
          targetId:         item.reference,
        },
      }));
    }
  }

  // ── Check 3: Over-reserved references ──────────────────────────────────────
  const agentikReservedByRef = new Map<string, number>();
  for (const r of activeReservations) {
    const key = r.reference.toUpperCase();
    const active = r.qtyReserved - r.qtyReleased - r.qtyConsumed;
    if (active > 0) agentikReservedByRef.set(key, (agentikReservedByRef.get(key) ?? 0) + active);
  }
  for (const [ref, totalReserved] of agentikReservedByRef) {
    const item = input.inventory.find(i => i.reference.toUpperCase() === ref);
    if (!item) continue; // caught by check 4
    const usable = item.physicalQty - item.salesAssignedQty;
    if (totalReserved > usable) {
      issues.push(_issue(reportId, input.organizationId, now, {
        type:      "over_reserved_reference",
        severity:  "critical",
        reference: ref,
        expected:  usable,
        actual:    totalReserved,
        delta:     totalReserved - usable,
        message:   `Reference ${ref} is over-reserved: ${totalReserved} reserved vs ${usable} usable (physical ${item.physicalQty} − assigned ${item.salesAssignedQty}).`,
        suggestedFix: {
          fixType:          "no_auto_fix",
          safeToAutoApply:  false,
          requiresApproval: true,
          reason:           "Critical: manually review which reservations to release or which orders to split.",
          targetType:       "reference",
          targetId:         ref,
        },
      }));
    }
  }

  // ── Check 4: Missing inventory reference ────────────────────────────────────
  const inventoryRefSet = new Set(input.inventory.map(i => i.reference.toUpperCase()));
  for (const r of activeReservations) {
    const ref = r.reference.toUpperCase();
    if (!inventoryRefSet.has(ref)) {
      issues.push(_issue(reportId, input.organizationId, now, {
        type:          "missing_inventory_reference",
        severity:      "warning",
        reference:     ref,
        reservationId: r.id,
        sourceType:    r.sourceType,
        sourceId:      r.sourceId,
        message:       `Active reservation ${r.id} references ${ref} which is not in the inventory snapshot. Reference may be discontinued or snapshot is stale.`,
        suggestedFix: {
          fixType:          "review_inventory_source",
          safeToAutoApply:  false,
          requiresApproval: false,
          reason:           "Refresh SAG snapshot. If reference is truly discontinued, release this reservation.",
          targetType:       "reservation",
          targetId:         r.id,
        },
      }));
    }
  }

  // ── Checks 5–8: Order-specific (skipped if no orders provided) ──────────────
  if (input.activeOrders && input.activeOrders.length > 0) {
    const orderSourceIds = new Set(input.activeOrders.map(o => o.sourceId));

    // Check 5: Cancelled orders still holding active reservations
    for (const order of input.activeOrders) {
      if (order.status !== "cancelled") continue;
      const activeForOrder = activeReservations.filter(
        r => r.sourceType === "order" && r.sourceId === order.sourceId,
      );
      for (const r of activeForOrder) {
        issues.push(_issue(reportId, input.organizationId, now, {
          type:          "cancelled_order_still_reserved",
          severity:      "critical",
          reference:     r.reference,
          reservationId: r.id,
          sourceType:    "order",
          sourceId:      order.sourceId,
          orderId:       order.id,
          message:       `Order ${order.sourceId} is cancelled but reservation ${r.id} for ${r.reference} is still active (${r.qtyReserved} units).`,
          suggestedFix: {
            fixType:          "release_reservation",
            safeToAutoApply:  false,  // critical — requires confirmation
            requiresApproval: true,
            reason:           "Release this reservation to free units back to the operational pool.",
            targetType:       "reservation",
            targetId:         r.id,
            proposedPayload:  { reservationId: r.id, reason: `Order ${order.sourceId} is cancelled` },
          },
        }));
      }
    }

    // Check 6: Confirmed/reserved orders without any reservation
    const reservableStatuses = new Set<string>(["reserved", "confirmed", "processing"]);
    for (const order of input.activeOrders) {
      if (!reservableStatuses.has(order.status)) continue;
      if (order.lines.length === 0) continue; // no lines → bridge will warn separately
      const hasReservation = activeReservations.some(
        r => r.sourceType === "order" && r.sourceId === order.sourceId,
      );
      if (!hasReservation) {
        issues.push(_issue(reportId, input.organizationId, now, {
          type:       "confirmed_order_without_reservation",
          severity:   "warning",
          sourceType: "order",
          sourceId:   order.sourceId,
          orderId:    order.id,
          message:    `Order ${order.sourceId} is ${order.status} with ${order.lines.length} lines but has no active reservations.`,
          suggestedFix: {
            fixType:          "create_missing_reservation",
            safeToAutoApply:  false,
            requiresApproval: false,
            reason:           "Run syncOrderReservations() for this order to create missing reservations.",
            targetType:       "order",
            targetId:         order.id,
            proposedPayload:  { sourceId: order.sourceId },
          },
        }));
      }
    }

    // Check 7: Order line qty vs reservation qty mismatch
    for (const order of input.activeOrders) {
      if (!reservableStatuses.has(order.status)) continue;
      if (order.lines.length === 0) continue;

      // Aggregate expected qty per reference from order lines
      const expectedByRef = new Map<string, number>();
      for (const line of order.lines) {
        const ref = line.reference.toUpperCase();
        const net = Math.max(0, line.qtyOrdered - (line.qtyCancelled ?? 0));
        expectedByRef.set(ref, (expectedByRef.get(ref) ?? 0) + net);
      }

      // Aggregate actual reserved qty per reference for this order
      const actualByRef = new Map<string, number>();
      for (const r of activeReservations) {
        if (r.sourceType !== "order" || r.sourceId !== order.sourceId) continue;
        const ref    = r.reference.toUpperCase();
        const active = r.qtyReserved - r.qtyReleased - r.qtyConsumed;
        actualByRef.set(ref, (actualByRef.get(ref) ?? 0) + active);
      }

      for (const [ref, expected] of expectedByRef) {
        const actual = actualByRef.get(ref) ?? 0;
        const delta  = actual - Math.round(expected);
        if (Math.abs(delta) > FORMULA_TOLERANCE) {
          const rId = activeReservations.find(
            r => r.sourceType === "order" && r.sourceId === order.sourceId && r.reference.toUpperCase() === ref,
          )?.id;
          issues.push(_issue(reportId, input.organizationId, now, {
            type:          "order_line_qty_mismatch",
            severity:      "warning",
            reference:     ref,
            sourceType:    "order",
            sourceId:      order.sourceId,
            orderId:       order.id,
            reservationId: rId,
            expected:      Math.round(expected),
            actual,
            delta,
            message:       `Order ${order.sourceId} ref ${ref}: line qty ${Math.round(expected)} vs reserved ${actual} (Δ${delta > 0 ? "+" : ""}${delta}).`,
            suggestedFix: {
              fixType:          "update_reservation_qty",
              safeToAutoApply:  false,
              requiresApproval: false,
              reason:           "Re-run syncOrderReservations() — bridge will upsert to correct qty.",
              targetType:       "reservation",
              targetId:         rId ?? order.id,
              proposedPayload:  { sourceId: order.sourceId, reference: ref, expectedQty: Math.round(expected) },
            },
          }));
        }
      }
    }

    // Check 8: Orphan reservations (sourceId not in any known order)
    for (const r of activeReservations) {
      if (r.sourceType !== "order") continue;
      if (!orderSourceIds.has(r.sourceId)) {
        issues.push(_issue(reportId, input.organizationId, now, {
          type:          "orphan_reservation",
          severity:      "warning",
          reference:     r.reference,
          reservationId: r.id,
          sourceType:    "order",
          sourceId:      r.sourceId,
          message:       `Reservation ${r.id} for ${r.reference} references order ${r.sourceId} which is not in the active order set. Order may have been deleted or synced out.`,
          suggestedFix: {
            fixType:          "release_reservation",
            safeToAutoApply:  false,
            requiresApproval: false,
            reason:           "If the originating order no longer exists, release this reservation to free units.",
            targetType:       "reservation",
            targetId:         r.id,
          },
        }));
      }
    }
  }

  // ── Check 9: Stale active reservations ──────────────────────────────────────
  const nowDate = new Date(now);
  for (const r of activeReservations) {
    if (!r.expiresAt) continue;
    if (new Date(r.expiresAt) < nowDate) {
      issues.push(_issue(reportId, input.organizationId, now, {
        type:          "stale_reservation",
        severity:      "info",
        reference:     r.reference,
        reservationId: r.id,
        sourceType:    r.sourceType,
        sourceId:      r.sourceId,
        message:       `Reservation ${r.id} for ${r.reference} expired at ${r.expiresAt} but is still active.`,
        suggestedFix: {
          fixType:          "expire_reservation",
          safeToAutoApply:  true,
          requiresApproval: false,
          reason:           "Call expireReservations() to clean up overdue reservations.",
          targetType:       "reservation",
          targetId:         r.id,
        },
      }));
    }
  }

  // ── Check 9b: Duplicate active reservations ──────────────────────────────────
  const seenKeys = new Map<string, string[]>(); // key → reservationIds
  for (const r of activeReservations) {
    const key = `${r.sourceType}:${r.sourceId}:${r.reference.toUpperCase()}`;
    const ids  = seenKeys.get(key) ?? [];
    ids.push(r.id);
    seenKeys.set(key, ids);
  }
  for (const [key, ids] of seenKeys) {
    if (ids.length < 2) continue;
    const [sourceType, sourceId, reference] = key.split(":");
    issues.push(_issue(reportId, input.organizationId, now, {
      type:       "duplicate_reservation",
      severity:   "critical",
      reference,
      sourceType,
      sourceId,
      expected:   1,
      actual:     ids.length,
      delta:      ids.length - 1,
      message:    `${ids.length} active reservations for ${sourceType}:${sourceId}:${reference}. Expected at most 1. IDs: ${ids.join(", ")}`,
      suggestedFix: {
        fixType:          "no_auto_fix",
        safeToAutoApply:  false,
        requiresApproval: true,
        reason:           "Critical: manually identify the canonical reservation and release the extras.",
        targetType:       "reference",
        targetId:         reference,
        proposedPayload:  { duplicateIds: ids },
      },
    }));
  }

  // ── Check 10: Sales assignment exceeds inventory ─────────────────────────────
  if (input.portfolioItems && input.portfolioItems.length > 0) {
    const assignedByRef = new Map<string, number>();
    for (const item of input.portfolioItems) {
      const ref = item.reference.toUpperCase();
      assignedByRef.set(ref, (assignedByRef.get(ref) ?? 0) + item.assignedQty);
    }
    for (const [ref, totalAssigned] of assignedByRef) {
      const inv = input.inventory.find(i => i.reference.toUpperCase() === ref);
      if (!inv) continue;
      if (totalAssigned > inv.physicalQty) {
        issues.push(_issue(reportId, input.organizationId, now, {
          type:      "sales_assignment_exceeds_inventory",
          severity:  "critical",
          reference: ref,
          expected:  inv.physicalQty,
          actual:    totalAssigned,
          delta:     totalAssigned - inv.physicalQty,
          message:   `Reference ${ref}: total portfolio assignment (${totalAssigned}) exceeds physical inventory (${inv.physicalQty}).`,
          suggestedFix: {
            fixType:          "review_sales_assignment",
            safeToAutoApply:  false,
            requiresApproval: true,
            reason:           "Critical: review Sales Portfolio assignments and reduce to match available physical stock.",
            targetType:       "reference",
            targetId:         ref,
          },
        }));
      }
    }
  }

  // ── Check 11: Stale inventory snapshot ──────────────────────────────────────
  if (input.snapshotAt) {
    const staleSec    = input.snapshotStaleSec ?? SNAPSHOT_STALE_DEFAULT_SEC;
    const snapshotAge = (nowDate.getTime() - new Date(input.snapshotAt).getTime()) / 1000;
    if (snapshotAge > staleSec) {
      issues.push(_issue(reportId, input.organizationId, now, {
        type:     "stale_inventory_snapshot",
        severity: "warning",
        expected: `<${staleSec}s`,
        actual:   `${Math.round(snapshotAge)}s`,
        delta:    Math.round(snapshotAge - staleSec),
        message:  `Inventory snapshot is ${Math.round(snapshotAge / 60)} min old (threshold: ${staleSec / 60} min). Operational availability may be inaccurate.`,
        suggestedFix: {
          fixType:          "review_inventory_source",
          safeToAutoApply:  false,
          requiresApproval: false,
          reason:           "Trigger a new SAG inventory sync to refresh the snapshot.",
          targetType:       "inventory_snapshot",
        },
      }));
    }
  }

  // ── Build summary ─────────────────────────────────────────────────────────
  const summary = _buildSummary(issues);

  return {
    id:             reportId,
    organizationId: input.organizationId,
    generatedAt:    now,
    summary,
    issues,
    inputSummary: {
      inventoryItems:    input.inventory.length,
      reservations:      input.reservations.length,
      activeOrders:      input.activeOrders?.length ?? 0,
      portfolioItems:    input.portfolioItems?.length ?? 0,
      snapshotAgeSeconds: input.snapshotAt
        ? Math.round((nowDate.getTime() - new Date(input.snapshotAt).getTime()) / 1000)
        : undefined,
    },
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

let _issueSeq = 0;

function _issue(
  reportId:       string,
  organizationId: string,
  now:            string,
  fields: Omit<OperationalReconciliationIssue, "id" | "organizationId" | "createdAt">,
): OperationalReconciliationIssue {
  return {
    id:             `issue_${reportId}_${++_issueSeq}`,
    organizationId,
    createdAt:      now,
    ...fields,
  };
}

function _buildSummary(issues: OperationalReconciliationIssue[]): OperationalReconciliationSummary {
  const byType: OperationalReconciliationSummary["byType"] = {};
  let critical = 0, warnings = 0, info = 0, penaltyTotal = 0;

  for (const issue of issues) {
    byType[issue.type] = (byType[issue.type] ?? 0) + 1;
    if (issue.severity === "critical") critical++;
    else if (issue.severity === "warning") warnings++;
    else info++;
    penaltyTotal += HEALTH_WEIGHTS[issue.severity];
  }

  return {
    totalIssues: issues.length,
    critical,
    warnings,
    info,
    byType,
    isHealthy:   critical === 0,
    healthScore: Math.max(0, 100 - penaltyTotal),
  };
}
