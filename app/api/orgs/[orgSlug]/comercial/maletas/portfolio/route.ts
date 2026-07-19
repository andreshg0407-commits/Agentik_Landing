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
import { requireOrgAccess } from "@/lib/auth/org-access";
import { getActiveInventoryForSalesPortfolio } from "@/lib/inventory/inventory-portfolio-loader";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
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
