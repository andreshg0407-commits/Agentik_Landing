/**
 * vendor-performance.ts
 *
 * COMERCIAL-VENDEDORES-LIVE-01
 * Fulfillment + active case snapshot for a vendor.
 *
 * Reuses seller-fulfillment-service.ts — does NOT duplicate fulfillment logic.
 * SERVER ONLY.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { computeSellerFulfillmentKpi } from "@/lib/comercial/pedidos/seller-fulfillment-service";
import type { VendorFulfillment, VendorActiveCaseSnapshot } from "./vendor-types";

// ── Fulfillment ──────────────────────────────────────────────────────────────

export async function computeVendorFulfillment(
  orgId: string,
  vendorName: string,
): Promise<VendorFulfillment> {
  const kpi = await computeSellerFulfillmentKpi(orgId, vendorName);

  return {
    fulfillmentRate: kpi.fulfillmentPercent,
    totalOrders: kpi.totalOrders,
    fullyInvoiced: kpi.ordersFullyInvoiced,
    partiallyInvoiced: kpi.ordersPartiallyInvoiced,
    withoutInvoice: kpi.ordersWithoutInvoice,
    withDifferences: kpi.ordersWithDifferences,
  };
}

// ── Active Case (Maleta) ─────────────────────────────────────────────────────

export async function computeVendorActiveCaseSnapshot(
  orgId: string,
  vendorId: string,
): Promise<VendorActiveCaseSnapshot> {
  const empty: VendorActiveCaseSnapshot = {
    caseId: null,
    caseName: null,
    lastSyncedAt: null,
    totalReferences: 0,
    depletedReferences: 0,
    criticalReferences: 0,
    portfolioValue: 0,
    health: "empty",
  };

  try {
    // Try VendorCommercialBag first (V2 model)
    const bag = await (prisma as any).vendorCommercialBag.findFirst({
      where: {
        organizationId: orgId,
        salesRepId: vendorId,
        status: "activa",
      },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    }).catch(() => null);

    if (bag) {
      const items = (bag.items ?? []) as Array<{
        status: string;
        assignedQty: number;
        availableToSellQty: number;
        unitCost?: number;
      }>;

      const totalReferences = items.length;
      const depletedReferences = items.filter(i => i.availableToSellQty <= 0).length;
      const criticalReferences = items.filter(i =>
        i.availableToSellQty > 0 && i.status === "bajo_minimo"
      ).length;
      const portfolioValue = items.reduce((s, i) =>
        s + (i.assignedQty * (i.unitCost ?? 0)), 0
      );

      let health: VendorActiveCaseSnapshot["health"] = "healthy";
      if (totalReferences === 0) health = "empty";
      else if (depletedReferences / totalReferences > 0.3) health = "critical";
      else if (depletedReferences > 0 || criticalReferences > 0) health = "warning";

      return {
        caseId: bag.id,
        caseName: bag.season ?? null,
        lastSyncedAt: bag.updatedAt?.toISOString() ?? null,
        totalReferences,
        depletedReferences,
        criticalReferences,
        portfolioValue: Math.round(portfolioValue),
        health,
      };
    }

    // Fallback: CommercialCase (V1 model — snapshot, no items relation)
    const cases = await prisma.commercialCase.findMany({
      where: {
        organizationId: orgId,
        salesRepId: vendorId,
      },
      orderBy: { snapshotAt: "desc" },
      take: 1,
    });

    if (cases.length === 0) return empty;

    const c = cases[0];
    const totalReferences = c.refsTotal;
    const depletedReferences = c.refsAgotadas;
    const criticalReferences = c.refsBajoMinimo;

    let health: VendorActiveCaseSnapshot["health"] = "healthy";
    if (totalReferences === 0) health = "empty";
    else if (depletedReferences / totalReferences > 0.3) health = "critical";
    else if (depletedReferences > 0 || criticalReferences > 0) health = "warning";

    return {
      caseId: c.id,
      caseName: c.line ?? null,
      lastSyncedAt: c.snapshotAt?.toISOString() ?? null,
      totalReferences,
      depletedReferences,
      criticalReferences,
      portfolioValue: 0, // V1 model doesn't track value
      health,
    };
  } catch {
    return empty;
  }
}
