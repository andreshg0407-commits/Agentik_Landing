/**
 * lib/comercial/maletas/case-status-engine.ts
 *
 * Sales Rep Case Status Engine — determines what each vendor can sell,
 * must pause, needs to replenish, or must wait on production.
 *
 * Phase 7: buildSalesRepCaseStatus()
 *
 * Decision logic per assignment:
 *   depleted + warehouse has stock → reponer now
 *   depleted + no warehouse stock + production alert → esperar_produccion
 *   depleted + no warehouse stock + no production path → pausar
 *   below minimum + warehouse has stock → reponer (lower priority)
 *   ok → vender (no alert)
 *
 * A line is "blocked" when ALL refs in that line for a vendor are depleted
 * with no immediate replenishment path. The vendor should pause that line
 * commercially until production completes.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-FUNCTIONAL-REALIGNMENT-01
 */

import type { CommercialCaseLine, SalesRep } from "./maletas-types";
import type {
  CommercialCaseAssignment,
  SalesRepCaseStatus,
  SalesRepCaseAlert,
  SalesRepCaseAction,
} from "./case-assignment-types";
import type { SagInventoryItem } from "./sag-inventory-adapter";
import type { ProductionAlert } from "./production-alert-engine";
import { buildInventoryMap } from "./sag-inventory-adapter";
import { buildAlertsByRef } from "./production-alert-engine";

// ─── Engine ────────────────────────────────────────────────────────────────────

/**
 * Compute full case status for every active sales rep × line combination.
 *
 * @param assignments     CommercialCaseAssignment[] — from deriveAssignmentsFromContext()
 * @param inventory       SagInventoryItem[] — live SAG view
 * @param productionAlerts ProductionAlert[] — from buildProductionAlertsFromRules()
 * @param salesReps       SalesRep[] — for name lookup
 */
export function buildSalesRepCaseStatus(
  assignments:      CommercialCaseAssignment[],
  inventory:        SagInventoryItem[],
  productionAlerts: ProductionAlert[],
  salesReps:        SalesRep[],
): SalesRepCaseStatus[] {
  const invMap    = buildInventoryMap(inventory);
  const alertMap  = buildAlertsByRef(productionAlerts);
  const results:  SalesRepCaseStatus[] = [];

  // Group assignments by salesRepId × line
  type GroupKey = string;
  const groups = new Map<GroupKey, CommercialCaseAssignment[]>();

  for (const assignment of assignments) {
    const key: GroupKey = `${assignment.salesRepId}:${assignment.line}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(assignment);
  }

  for (const [key, repAssignments] of groups) {
    const [repId, line] = key.split(":") as [string, CommercialCaseLine];
    const rep = salesReps.find(r => r.id === repId);
    if (!rep) continue;

    const caseAlerts:         SalesRepCaseAlert[] = [];
    const canReplenishNow:    string[] = [];
    const mustWaitProduction: string[] = [];
    let activeCount    = 0;
    let lowCount       = 0;
    let depletedCount  = 0;
    let pausedCount    = 0;

    for (const assignment of repAssignments) {
      const refKey  = assignment.reference.toUpperCase();
      const invItem = invMap.get(refKey);
      const alert   = alertMap.get(refKey);

      // Case depletion: based on the case's currentQty (vendor has run out)
      // Warehouse availability: separate check — can we replenish the case?
      const caseIsDepleted    = assignment.currentQty <= 0;
      const warehouseAvailable = invItem?.availableForCases ?? 0;
      const isLow              = !caseIsDepleted && assignment.currentQty < assignment.minimumCaseQty;

      let action: SalesRepCaseAction;
      let reason: string;

      if (caseIsDepleted) {
        depletedCount++;
        // Check replenishment path
        if (warehouseAvailable > 0) {
          action = "reponer";
          reason = `Agotado en maleta. ${warehouseAvailable} uds disponibles en bodega para reposición inmediata.`;
          canReplenishNow.push(assignment.reference);
        } else if (alert || assignment.productionInProcess) {
          action = "esperar_produccion";
          const batchInfo = assignment.productionBatchLabel
            ? ` Lote "${assignment.productionBatchLabel}" en proceso.`
            : "";
          reason = `Sin stock en bodega.${batchInfo} Aguardar producción antes de reactivar ventas.`;
          mustWaitProduction.push(assignment.reference);
        } else {
          action = "pausar";
          reason = `Sin stock en bodega y sin producción programada. Pausar venta de esta referencia temporalmente.`;
          pausedCount++;
        }
      } else if (isLow) {
        lowCount++;
        action = warehouseAvailable > 0 ? "reponer" : "vender";
        if (action === "reponer") {
          reason = `Bajo mínimo (${assignment.currentQty}/${assignment.minimumCaseQty}). Reponer ${assignment.minimumCaseQty - assignment.currentQty} uds de bodega.`;
          canReplenishNow.push(assignment.reference);
        } else {
          reason = `Bajo mínimo pero sin stock adicional en bodega. Continuar vendiendo con precaución.`;
        }
      } else {
        activeCount++;
        action = "vender";
        reason = "";
      }

      if (action !== "vender") {
        caseAlerts.push({
          reference:            assignment.reference,
          description:          assignment.description,
          line:                 assignment.line as CommercialCaseLine,
          size:                 assignment.size,
          color:                assignment.color,
          action,
          reason,
          availableToReplenish: assignment.availableToReplenish,
        });
      }
    }

    // A line is blocked when every assignment needs to pause
    const blockedLines: CommercialCaseLine[] =
      pausedCount > 0 && pausedCount + (mustWaitProduction.length) === repAssignments.length
        ? [line as CommercialCaseLine]
        : [];

    const pressureScore = repAssignments.length > 0
      ? Math.min(100, Math.round(((depletedCount + pausedCount) / repAssignments.length) * 100))
      : 0;

    results.push({
      salesRepId:          repId,
      salesRepName:        rep.name,
      line:                line as CommercialCaseLine,
      totalAssignments:    repAssignments.length,
      activeAssignments:   activeCount,
      lowAssignments:      lowCount,
      depletedAssignments: depletedCount,
      pausedAssignments:   pausedCount,
      canReplenishNow,
      mustWaitProduction,
      blockedLines,
      pressureScore,
      alerts:              caseAlerts,
    });
  }

  // Sort: highest pressure first
  return results.sort((a, b) => b.pressureScore - a.pressureScore);
}

/**
 * Build a map: UPPERCASE repId → SalesRepCaseStatus[] (one per line).
 */
export function buildCaseStatusByRep(
  statuses: SalesRepCaseStatus[],
): Map<string, SalesRepCaseStatus[]> {
  const map = new Map<string, SalesRepCaseStatus[]>();
  for (const status of statuses) {
    const key = status.salesRepId;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(status);
  }
  return map;
}
