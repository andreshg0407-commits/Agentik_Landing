/**
 * /api/orgs/[orgSlug]/comercial/inventario/order-reservations
 *
 * GET — Fetch pending Agentik order reservations for a product reference.
 *
 * Query params:
 *   reference (required) — SAG product reference code
 *
 * Returns:
 *   - reservadoAgentikPendiente (total active units from pending orders)
 *   - orders (individual order details)
 *
 * Sprint: INVENTORY-DRAWER-ORDER-RESERVATION-04A6B
 */

import { NextResponse } from "next/server";
import { requireCommercialAccess } from "@/lib/auth/org-access";
import { loadOrderReservations } from "@/lib/inventory/order-reservation-loader";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireCommercialAccess(params.orgSlug);
    const { searchParams } = new URL(req.url);
    const reference = searchParams.get("reference");

    if (!reference) {
      return NextResponse.json(
        { ok: false, error: "Missing reference parameter" },
        { status: 400 },
      );
    }

    const result = await loadOrderReservations(organization.id, reference);
    return NextResponse.json({
      ok: result.loaded,
      reservadoAgentikPendiente: result.reservadoAgentikPendiente,
      orders: result.orders,
      error: result.error,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
