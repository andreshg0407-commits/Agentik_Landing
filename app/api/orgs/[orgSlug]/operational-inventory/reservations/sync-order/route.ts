/**
 * POST /api/orgs/[orgSlug]/operational-inventory/reservations/sync-order
 *
 * Syncs OperationalReservations from CRM order lines.
 *
 * Body:
 *   { sourceId?: string; dryRun?: boolean; batchAll?: boolean }
 *
 *   sourceId  — sync a specific CRM order by its CRM ID (order.sourceId)
 *   dryRun    — compute intent without persisting (default: false)
 *   batchAll  — sync all active CRM orders (default: false)
 *
 * If neither sourceId nor batchAll is provided, returns 400.
 *
 * ─── ARCHITECTURAL RULE ───────────────────────────────────────────────────────
 *   This route does NOT touch SAG.
 *   This route does NOT create fiscal documents.
 *   This route does NOT send orders to ERP.
 *   It only manages Agentik's operational pre-ERP soft-hold layer.
 *
 * Sprint: AGENTIK-CRM-ORDER-RESERVATION-BRIDGE-01
 */

import { NextResponse }           from "next/server";
import { requireOrgAccess }       from "@/lib/auth/org-access";
import { getCrmCommercialProvider }
                                  from "@/lib/operational-data/providers/crm-commercial-provider";
import { syncOrderReservations }  from "@/lib/operational-inventory/order-reservation-bridge";
import { syncReservationsForActiveCrmOrders }
                                  from "@/lib/operational-inventory/crm-order-reservation-sync";

export const runtime = "nodejs";

export async function POST(
  req:    Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const body = await req.json() as {
      sourceId?: string;
      dryRun?:   boolean;
      batchAll?: boolean;
    };

    const mode: "dry_run" | "commit" = body.dryRun ? "dry_run" : "commit";

    // ── Batch: sync all active CRM orders ────────────────────────────────────
    if (body.batchAll) {
      const batchResult = await syncReservationsForActiveCrmOrders(
        organization.id,
        { mode },
      );

      return NextResponse.json({
        ok:     true,
        mode,
        batch:  true,
        result: batchResult,
      }, { status: mode === "commit" ? 200 : 200 });
    }

    // ── Single order sync by sourceId ─────────────────────────────────────────
    if (!body.sourceId) {
      return NextResponse.json(
        { ok: false, error: "sourceId or batchAll is required" },
        { status: 400 },
      );
    }

    // Load the order from CRM provider
    const provider = getCrmCommercialProvider();
    const allOrders = await provider.getOrders(organization.id);
    const order     = allOrders.find(o => o.sourceId === body.sourceId);

    if (!order) {
      return NextResponse.json(
        { ok: false, error: `Order with sourceId '${body.sourceId}' not found` },
        { status: 404 },
      );
    }

    const result = await syncOrderReservations(order, {
      organizationId: organization.id,
      mode,
    });

    return NextResponse.json({
      ok:     true,
      mode,
      batch:  false,
      result,
    });
  } catch (err) {
    const msg    = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
