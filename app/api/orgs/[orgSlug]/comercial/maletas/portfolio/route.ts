/**
 * /api/orgs/[orgSlug]/comercial/maletas/portfolio
 *
 * GET — Returns canonical inventory eligible for sales portfolio (maleta) construction.
 *
 * Consumers: Maletas builder UI.
 * Source: buildInventoryControlSnapshot → isEligibleForSalesPortfolio filter.
 *
 * Does NOT call SAG SOAP.
 * Does NOT include OUT_OF_STOCK, NO_DATA, or SIN_CLASIFICAR.
 *
 * Sprint: COMERCIAL-MALETAS-CANONICAL-INVENTORY-INTEGRATION-01
 */

import { NextResponse } from "next/server";
import { requireCommercialAccess } from "@/lib/auth/org-access";
import { getActiveInventoryForSalesPortfolio } from "@/lib/inventory/inventory-portfolio-loader";
import { resolveCurrentSeller, deriveSellerScope } from "@/lib/comercial/frontline/seller-user-mapping";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { user, organization } = await requireCommercialAccess(params.orgSlug);

    // Portfolio inventory construction is admin-only
    const sellerIdentity = await resolveCurrentSeller({ organizationId: organization.id, userId: user.id });
    const scope = deriveSellerScope(sellerIdentity);
    if (scope.level === "seller") {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });
    }
    const result = await getActiveInventoryForSalesPortfolio(
      organization.id,
      params.orgSlug,
    );

    return NextResponse.json({
      ok: true,
      items: result.items,
      dataQuality: result.dataQuality,
      computedAt: result.computedAt,
      totalBeforeFilter: result.totalBeforeFilter,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status =
      msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
