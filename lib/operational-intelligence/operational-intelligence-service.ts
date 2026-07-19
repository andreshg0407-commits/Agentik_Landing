/**
 * lib/operational-intelligence/operational-intelligence-service.ts
 *
 * Operational Intelligence Service — assembles all inputs and builds the snapshot.
 *
 * ─── DATA PIPELINE ────────────────────────────────────────────────────────────
 * 1. SAG inventory snapshot (via order-reservation-bridge loader)
 * 2. Agentik reservations (Prisma)
 * 3. CRM active orders (CrmCommercialProvider)
 * 4. Reconciliation report (runOperationalInventoryReconciliation)
 * 5. Commercial demand signals (computeCommercialDemandSignals)
 * 6. Sales portfolio items (Prisma — VendorBagItem)
 * 7. Transfer + production suggestions (V1: none — V2: from maletas engine)
 *
 * ─── IMPORTANT ────────────────────────────────────────────────────────────────
 * This service is read-only.
 * It does NOT modify reservations, inventory, or CRM data.
 * It does NOT produce fiscal documents.
 *
 * Sprint: AGENTIK-OPERATIONAL-INTELLIGENCE-DASHBOARD-01
 */

import { prisma }                               from "@/lib/prisma";
import { getCrmCommercialProvider }             from "@/lib/operational-data/providers/crm-commercial-provider";
import { computeCommercialDemandSignals }       from "@/lib/operational-data/engines/commercial-demand-signals";
import { _loadInventorySnapshot }               from "@/lib/operational-inventory/order-reservation-bridge";
import { applyReservationsToInventory }         from "@/lib/operational-inventory/operational-reservation-engine";
import { runOperationalInventoryReconciliation } from "@/lib/operational-inventory/operational-reconciliation-service";
import { buildOperationalIntelligenceSnapshot } from "./operational-intelligence-engine";
import type { OperationalReservation }          from "@/lib/operational-inventory/operational-reservation-types";
import type { OperationalInventoryItem }        from "@/lib/operational-inventory/operational-inventory-types";
import type { OperationalIntelligenceSnapshot } from "./operational-intelligence-types";

// ─── Options ──────────────────────────────────────────────────────────────────

export interface OperationalIntelligenceServiceOptions {
  /** Include reconciliation report (adds latency — skippable for quick reads). Default: true */
  includeReconciliation?: boolean;
  /** Include CRM orders + demand signals. Default: true */
  includeCommercialData?: boolean;
  /** Include Sales Portfolio items for context. Default: true */
  includePortfolioItems?: boolean;
}

// ─── Main service function ────────────────────────────────────────────────────

/**
 * Builds the full Operational Intelligence Snapshot for an organization.
 *
 * @param organizationId  Agentik org ID (not slug)
 * @param options         What to include in the snapshot
 */
export async function getOperationalIntelligenceSnapshot(
  organizationId: string,
  options:        OperationalIntelligenceServiceOptions = {},
): Promise<OperationalIntelligenceSnapshot> {
  const {
    includeReconciliation = true,
    includeCommercialData = true,
    includePortfolioItems = true,
  } = options;

  const now = new Date().toISOString();

  // ── 1. Load SAG inventory snapshot ──────────────────────────────────────────
  const rawInventory = await _loadInventorySnapshot(organizationId);

  // ── 2. Load all Agentik reservations from Prisma ────────────────────────────
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

  // ── 3. Apply Agentik reservations to produce operational inventory view ──────
  const activeReservations = reservations.filter(r => r.status === "active");
  const inventory: OperationalInventoryItem[] = applyReservationsToInventory(
    rawInventory as OperationalInventoryItem[],
    activeReservations,
  );

  // ── 4. Load CRM active orders ────────────────────────────────────────────────
  let activeOrders: Awaited<ReturnType<ReturnType<typeof getCrmCommercialProvider>["getOrders"]>> = [];
  let demandSignals: Awaited<ReturnType<typeof computeCommercialDemandSignals>> = [];

  if (includeCommercialData) {
    try {
      const provider = getCrmCommercialProvider();
      const allOrders = await provider.getOrders(organizationId);
      activeOrders = allOrders.filter(o =>
        ["reserved", "confirmed", "processing", "sent_to_erp"].includes(o.status),
      );

      // ── 5. Compute demand signals ────────────────────────────────────────────
      demandSignals = computeCommercialDemandSignals({
        organizationId,
        inventory,
        activeOrders,
        opportunities: [], // V1: not loaded — avoid extra CRM roundtrip
      });
    } catch {
      // Non-critical — snapshot still builds from inventory + reservations
    }
  }

  // ── 6. Load reconciliation report ────────────────────────────────────────────
  let reconciliationReport: Awaited<
    ReturnType<typeof runOperationalInventoryReconciliation>
  >["report"] | undefined;

  if (includeReconciliation) {
    try {
      const { report } = await runOperationalInventoryReconciliation(organizationId, {
        includeOrders:         includeCommercialData,
        includeSalesPortfolio: false,
      });
      reconciliationReport = report;
    } catch {
      // Non-critical — snapshot builds without reconciliation
    }
  }

  // ── 7. Load Sales Portfolio items ────────────────────────────────────────────
  // V1: map to minimal shape expected by engine (reference + assignedQty context only)
  let portfolioItems: Array<{
    reference:      string;
    description:    string;
    line:           string;
    category:       string;
    productType:    string;
    assignedQty:    number;
    minQty:         number;
    idealQty:       number;
    soldQty:        number;
    availableToSellQty: number;
    status:         string;
    salesRepId:     string;
    salesRepName:   string;
    bagId:          string;
    organizationId: string;
    updatedAt:      string;
    // required by VendorBagItem
    id:             string;
    productId?:     string;
    bagName?:       string;
    bagStatus?:     string;
  }> = [];

  if (includePortfolioItems) {
    try {
      const rows = await prisma.vendorBagItem.findMany({
        where: { organizationId },
        include: { bag: { select: { salesRepId: true, status: true } } },
      });
      portfolioItems = rows.map(r => ({
        id:                 r.id,
        organizationId:     r.organizationId,
        bagId:              r.bagId,
        reference:          r.reference,
        description:        r.description,
        line:               r.line,
        category:           r.category,
        productType:        r.productType,
        assignedQty:        r.assignedQty,
        minQty:             r.minQty,
        idealQty:           r.idealQty,
        soldQty:            r.soldQty,
        availableToSellQty: r.availableToSellQty,
        status:             r.status,
        salesRepId:         r.bag?.salesRepId ?? "",
        salesRepName:       "",  // VendorCommercialBag has no salesRepName — resolved via CRM in V2
        bagStatus:          r.bag?.status,
        updatedAt:          r.updatedAt.toISOString(),
      }));
    } catch {
      // Non-critical
    }
  }

  // ── 8. Build snapshot ─────────────────────────────────────────────────────────
  return buildOperationalIntelligenceSnapshot({
    organizationId,
    inventory,
    reservations,
    activeOrders:         activeOrders.length > 0 ? activeOrders : undefined,
    demandSignals:        demandSignals.length > 0 ? demandSignals : undefined,
    reconciliationReport,
    portfolioItems:       portfolioItems as never, // type cast — VendorBagItem compat shape
    transferSuggestions:  undefined,               // V2: from maletas transfer engine
    productionSuggestions: undefined,              // V2: from maletas production engine
    generatedAt:          now,
  });
}
