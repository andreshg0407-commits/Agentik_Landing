/**
 * lib/operational-inventory/operational-reconciliation-service.ts
 *
 * Operational Reconciliation Service — assembles inputs and runs the engine.
 *
 * ─── WHAT THIS DOES ───────────────────────────────────────────────────────────
 * 1. Loads the SAG inventory snapshot (via CommercialCoverageSnapshot + mapper)
 * 2. Loads active reservations from Prisma
 * 3. Optionally loads active CRM orders from CrmCommercialProvider
 * 4. Applies Agentik reservations to the raw snapshot
 * 5. Calls buildOperationalReconciliationReport() (pure)
 * 6. Calls buildReconciliationRepairPlan() (pure)
 * 7. Returns the full report + plan
 *
 * ─── IMPORTANT ────────────────────────────────────────────────────────────────
 * This service does NOT fix anything.
 * It does NOT write to SAG.
 * It does NOT create fiscal documents.
 *
 * Sprint: AGENTIK-OPERATIONAL-INVENTORY-RECONCILIATION-01
 */

import { prisma }                              from "@/lib/prisma";
import { getCrmCommercialProvider }            from "@/lib/operational-data/providers/crm-commercial-provider";
import { loadLatestCCSBatch }                  from "@/lib/commercial-intelligence/ccs-reader";
import { applyReservationsToInventory }        from "./operational-reservation-engine";
import { buildOperationalReconciliationReport, type ReconciliationEngineInput }
                                               from "./operational-reconciliation-engine";
import { buildReconciliationRepairPlan }       from "./operational-reconciliation-repair-planner";
import type { OperationalReservation }         from "./operational-reservation-types";
import type { OperationalInventoryItem }       from "./operational-inventory-types";
import { mapSagInventoryToOperational }        from "./sag-to-operational-mapper";
import type {
  OperationalReconciliationReport,
  OperationalReconciliationRepairPlan,
}                                              from "./operational-reconciliation-types";

// ─── Options & result ─────────────────────────────────────────────────────────

export interface ReconciliationServiceOptions {
  /** Include CRM order checks (5–8). Default: true */
  includeOrders?:         boolean;
  /** Include Sales Portfolio assignment checks (10). Default: false — requires maletas load */
  includeSalesPortfolio?: boolean;
  /** If true, skip persistence and return a read-only result. Default: true (always read-only in V1) */
  dryRun?:                boolean;
  /** Stale snapshot threshold in seconds. Default: 7200 */
  snapshotStaleSec?:      number;
}

export interface ReconciliationServiceResult {
  report: OperationalReconciliationReport;
  plan:   OperationalReconciliationRepairPlan;
}

// ─── Main service function ────────────────────────────────────────────────────

/**
 * Runs the full operational inventory reconciliation for an organization.
 *
 * @param organizationId  Agentik org ID (not slug)
 * @param options         What to include in the reconciliation
 */
export async function runOperationalInventoryReconciliation(
  organizationId: string,
  options:        ReconciliationServiceOptions = {},
): Promise<ReconciliationServiceResult> {
  const {
    includeOrders         = true,
    includeSalesPortfolio = false,
    snapshotStaleSec      = 7200,
  } = options;

  const now = new Date().toISOString();

  // ── 1. Load SAG inventory snapshot ──────────────────────────────────────────
  const batch = await loadLatestCCSBatch(organizationId);
  const snapshotAt = batch.snapshotAt ?? undefined;

  let rawSnapshot: OperationalInventoryItem[] = [];
  if (batch.rows.length > 0) {
    rawSnapshot = mapSagInventoryToOperational(
      batch.rows.map(r => ({
        reference:           r.refCode.toUpperCase(),
        description:         r.description,
        line:                r.line as "LT" | "CS",
        category:            "",
        productType:         "",
        initialWarehouseQty: r.disponible + (r.pendingOrdersQty ?? 0),
        reservedQty:         r.pendingOrdersQty ?? 0,
        availableForCases:   r.disponible,
        pendingPDQty:        r.pendingOrdersQty ?? 0,
        apCleanupQty:        0,
      })),
      "sag_excel_import",
      batch.snapshotAt ?? undefined,
    );
  }

  // ── 2. Load all reservations from Prisma ────────────────────────────────────
  const reservationRows = await prisma.operationalReservation.findMany({
    where: { organizationId },
  });

  const reservations: OperationalReservation[] = reservationRows.map(r => ({
    id:             r.id,
    organizationId: r.organizationId,
    sourceType:     r.sourceType as OperationalReservation["sourceType"],
    sourceId:       r.sourceId,
    salesRepId:     r.salesRepId ?? undefined,
    customerId:     r.customerId ?? undefined,
    reference:      r.reference,
    description:    r.description,
    qtyReserved:    r.qtyReserved,
    qtyReleased:    r.qtyReleased,
    qtyConsumed:    r.qtyConsumed,
    status:         r.status as OperationalReservation["status"],
    reason:         r.reason,
    expiresAt:      r.expiresAt?.toISOString(),
    createdAt:      r.createdAt.toISOString(),
    updatedAt:      r.updatedAt.toISOString(),
  }));

  // ── 3. Apply Agentik reservations to snapshot ────────────────────────────────
  // This gives us the same inventory view that operational consumers see.
  const activeReservations = reservations.filter(r => r.status === "active");
  const inventory: OperationalInventoryItem[] = applyReservationsToInventory(
    rawSnapshot as OperationalInventoryItem[],
    activeReservations,
  );

  // ── 4. Optionally load active CRM orders ────────────────────────────────────
  let activeOrders: OperationalReconciliationEngineInput["activeOrders"] = undefined;
  if (includeOrders) {
    try {
      const provider = getCrmCommercialProvider();
      const allOrders = await provider.getOrders(organizationId);
      activeOrders = allOrders.filter(o =>
        ["reserved", "confirmed", "processing", "cancelled", "fulfilled"].includes(o.status),
      );
    } catch {
      // Non-critical — orders checks will be skipped
    }
  }

  // ── 5. Optionally load Sales Portfolio items ─────────────────────────────────
  // V1: placeholder — load from VendorBag model in a future iteration
  // includeSalesPortfolio is accepted but portfolio items not loaded yet
  void includeSalesPortfolio;

  // ── 6. Build reconciliation input ────────────────────────────────────────────
  const engineInput: ReconciliationEngineInput = {
    organizationId,
    inventory,
    reservations,
    activeOrders,
    portfolioItems:   undefined, // V2: load from prisma.vendorBagItem
    snapshotAt,
    snapshotStaleSec,
    generatedAt:      now,
  };

  // ── 7. Run engine + repair planner ───────────────────────────────────────────
  const report = buildOperationalReconciliationReport(engineInput);
  const plan   = buildReconciliationRepairPlan(report);

  return { report, plan };
}

// Re-export for convenience
type OperationalReconciliationEngineInput = ReconciliationEngineInput;
