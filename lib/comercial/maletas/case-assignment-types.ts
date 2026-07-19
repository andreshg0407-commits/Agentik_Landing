/**
 * lib/comercial/maletas/case-assignment-types.ts
 *
 * CommercialCaseAssignment — tracks what each sales rep carries in their case
 * (maleta) and the current quantity state.
 *
 * Phase 4: Replaces the Excel cuadro where the coordinator records which product
 * each vendor has, how many, and what's missing.
 *
 * V1: Derived from CaseItem.assignedToSalesReps (context bridge).
 * V2: Stored in Prisma CommercialCaseAssignment model, editable via UI.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-FUNCTIONAL-REALIGNMENT-01
 */

import type { CommercialCaseLine, MaletasOperationalContext } from "./maletas-types";

// ─── Assignment status ─────────────────────────────────────────────────────────

export type CaseAssignmentStatus =
  | "active"        // ref present in case, above minimum
  | "low"           // below minimum but not depleted
  | "depleted"      // currentQty = 0, needs replenishment or production
  | "paused"        // coordinator manually paused (no sell signal)
  | "replenishing"; // replenishment in transit

// ─── Core assignment model ────────────────────────────────────────────────────

export interface CommercialCaseAssignment {
  id:                 string;                // "{salesRepId}_{line}_{reference}"
  organizationId:     string;
  salesRepId:         string;
  reference:          string;
  description:        string;
  line:               CommercialCaseLine;
  size?:              string;                // V2: from SAG ref catalogue
  color?:             string;                // V2: from SAG ref catalogue
  initialQty:         number;                // V2: set when case is assembled
  currentQty:         number;                // from SAG disponible
  minimumCaseQty:     number;                // from ReplenishmentRule (derrotero)
  availableToReplenish: number;              // warehouse available (from SAG)
  status:             CaseAssignmentStatus;
  productionInProcess: boolean;
  productionBatchLabel: string | null;
  lastUpdatedAt:      string;
}

// ─── Sales rep alert ──────────────────────────────────────────────────────────

export type SalesRepCaseAction =
  | "vender"              // ref is OK, can sell
  | "reponer"             // depleted but warehouse has stock — replenish now
  | "esperar_produccion"  // no warehouse stock, production batch in process or pending
  | "pausar";             // no stock, no batch, no production alert — pause selling

export interface SalesRepCaseAlert {
  reference:            string;
  description:          string;
  line:                 CommercialCaseLine;
  size?:                string;
  color?:               string;
  action:               SalesRepCaseAction;
  reason:               string;              // human-readable causal explanation
  availableToReplenish: number;
}

// ─── Sales rep full case status ───────────────────────────────────────────────

export interface SalesRepCaseStatus {
  salesRepId:           string;
  salesRepName:         string;
  line:                 CommercialCaseLine;
  totalAssignments:     number;
  activeAssignments:    number;
  lowAssignments:       number;
  depletedAssignments:  number;
  pausedAssignments:    number;
  canReplenishNow:      string[];            // reference IDs with warehouse stock
  mustWaitProduction:   string[];            // reference IDs waiting on production
  blockedLines:         CommercialCaseLine[]; // fully depleted lines with no path
  pressureScore:        number;              // 0–100: % depleted/paused refs
  alerts:               SalesRepCaseAlert[];
}

// ─── Context bridge (Phase 4 — V1) ────────────────────────────────────────────
//
// Derives CommercialCaseAssignment[] from MaletasOperationalContext.
// Until Prisma CommercialCaseAssignment model is seeded, this bridge
// reconstructs assignment state from the engine output.

export function deriveAssignmentsFromContext(
  context: MaletasOperationalContext,
): CommercialCaseAssignment[] {
  const assignments: CommercialCaseAssignment[] = [];

  for (const item of context.items) {
    for (const repId of item.assignedToSalesReps) {
      const status: CaseAssignmentStatus =
        item.currentUnits <= 0
          ? item.productionInProcess
            ? "replenishing"
            : "depleted"
          : item.currentUnits < item.minimumRequired
            ? "low"
            : "active";

      assignments.push({
        id:                   `${repId}_${item.line}_${item.reference}`,
        organizationId:       context.orgId,
        salesRepId:           repId,
        reference:            item.reference,
        description:          item.description,
        line:                 item.line,
        initialQty:           item.minimumRequired, // best available proxy in V1
        currentQty:           Math.max(0, item.currentUnits),
        minimumCaseQty:       item.minimumRequired,
        availableToReplenish: item.availableToReplenish,
        status,
        productionInProcess:  item.productionInProcess,
        productionBatchLabel: item.productionBatchLabel,
        lastUpdatedAt:        context.generatedAt,
      });
    }
  }

  return assignments;
}
