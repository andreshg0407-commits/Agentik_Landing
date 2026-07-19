/**
 * GET /api/orgs/[orgSlug]/comercial/operational-inventory
 *
 * Operational inventory for the Sales Portfolio builder.
 *
 * ─── DATA PIPELINE ────────────────────────────────────────────────────────────
 * CommercialCoverageSnapshot (Prisma, latest batch per ref)
 *   → SagInventoryItem[] with inferred category/productType
 *   → OperationalInventoryItem[] (via mapSagInventoryToOperational)
 *   → Apply active Agentik reservations (applyReservationsToInventory)
 *   → Return items[]
 *
 * ─── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * The MaletasOperationalContext pipeline derives inventory from CommercialCaseItem
 * rows (case assignments). When no assignments exist, context.items = [] and the
 * search returns nothing — even when coverage snapshot has real data.
 *
 * This endpoint reads CommercialCoverageSnapshot directly, bypassing the case
 * assignment layer entirely. It is the V2 inventory source for BagPortfolioBuilder.
 *
 * ─── READ-ONLY ────────────────────────────────────────────────────────────────
 * No side effects. Safe to call on every search interaction.
 *
 * Sprint: AGENTIK-SALES-PORTFOLIO-REFERENCE-SOURCE-01
 */

import { NextResponse }                  from "next/server";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import { prisma }                        from "@/lib/prisma";
import { mapSagInventoryToOperational }  from "@/lib/operational-inventory/sag-to-operational-mapper";
import { applyReservationsToInventory }  from "@/lib/operational-inventory/operational-reservation-engine";
import type { OperationalReservation }   from "@/lib/operational-inventory/operational-reservation-types";
import type { OperationalInventoryItem } from "@/lib/operational-inventory/operational-inventory-types";
import {
  inferCategory,
  inferProductType,
}                                        from "@/lib/comercial/maletas/sag-inventory-adapter";

export const runtime = "nodejs";

export async function GET(
  _req:   Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const orgId = organization.id;

    // ── 1. Load latest coverage snapshot ─────────────────────────────────────
    let items: OperationalInventoryItem[] = [];
    let snapshotAt: string | null = null;
    let refCount = 0;

    try {
      // Find the most recent snapshot timestamp for this org
      const latest = await prisma.commercialCoverageSnapshot.findFirst({
        where:   { organizationId: orgId },
        orderBy: { snapshotAt: "desc" },
        select:  { snapshotAt: true },
      });

      if (latest) {
        snapshotAt = latest.snapshotAt.toISOString();

        // Load all rows from that snapshot batch
        const rows = await prisma.commercialCoverageSnapshot.findMany({
          where: { organizationId: orgId, snapshotAt: latest.snapshotAt },
        });

        refCount = rows.length;

        // Map to SagInventoryItem shape with inferred category/productType
        const sagItems = rows.map(r => ({
          reference:           r.refCode.toUpperCase(),
          description:         r.description,
          line:                r.line as "LT" | "CS",
          category:            inferCategory(r.description),
          productType:         inferProductType(r.description),
          initialWarehouseQty: r.disponible + (r.pendingOrdersQty ?? 0),
          reservedQty:         r.pendingOrdersQty ?? 0,
          availableForCases:   Math.max(0, r.disponible),
          pendingPDQty:        r.pendingOrdersQty ?? 0,
          apCleanupQty:        0,
        }));

        items = mapSagInventoryToOperational(sagItems, "sag_excel_import", snapshotAt);
      }
    } catch {
      // Non-critical — returns empty array with appropriate source
    }

    // ── 2. Apply active Agentik reservations ──────────────────────────────────
    if (items.length > 0) {
      try {
        const reservationRows = await prisma.operationalReservation.findMany({
          where: { organizationId: orgId, status: "active" },
        });

        if (reservationRows.length > 0) {
          const activeReservations: OperationalReservation[] = reservationRows.map(r => ({
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
            status:         "active",
            reason:         r.reason,
            expiresAt:      r.expiresAt?.toISOString(),
            createdAt:      r.createdAt.toISOString(),
            updatedAt:      r.updatedAt.toISOString(),
          }));

          items = applyReservationsToInventory(items, activeReservations);
        }
      } catch {
        // Non-critical — serve snapshot without reservation deduction
      }
    }

    return NextResponse.json({
      ok:         true,
      items,
      snapshotAt,
      refCount,
      hasSnapshot: snapshotAt !== null,
    });
  } catch (err) {
    const msg    = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
