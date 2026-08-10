/**
 * GET /api/orgs/[orgSlug]/comercial/seller-financial/commissions?year=2026&month=7
 *
 * AGENTIK-SELLER-COMMISSION-V1-IMPLEMENTATION-01
 *
 * Returns the seller commission statement for a given year/month.
 *
 * Authorization:
 *   - requireOrgAccess with allowProvisionedSeller (Seller App consumers)
 *   - Seller identity resolved server-side via resolveCurrentSeller
 *   - sellerTerceroId from identity — NEVER from query params
 *   - Manager/admin: optional ?sellerTerceroId= to view any seller
 *   - Seller-scoped: only own commissions (sellerTerceroId from identity)
 *
 * Query params:
 *   year: number (required, 2020-2099)
 *   month: number (required, 1-12)
 *   sellerTerceroId: number (optional, admin-only override)
 *   sellerSlug: string (optional, admin-only — resolved to sellerTerceroId)
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { resolveCurrentSeller, deriveSellerScope } from "@/lib/comercial/frontline/seller-user-mapping";
import { lookupSellerTerceroId } from "@/lib/comercial/frontline/seller-tercero-mapping";
import { computeSellerCommissionStatement } from "@/lib/comercial/frontline/seller-commission-service";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { user, organization } = await requireOrgAccess(orgSlug, { allowProvisionedSeller: true });

  const url = new URL(req.url);
  const yearParam = url.searchParams.get("year");
  const monthParam = url.searchParams.get("month");

  if (!yearParam || !monthParam) {
    return NextResponse.json({ error: "year and month required" }, { status: 400 });
  }

  const year = parseInt(yearParam, 10);
  const month = parseInt(monthParam, 10);

  if (!Number.isInteger(year) || year < 2020 || year > 2099 ||
      !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "invalid year or month" }, { status: 400 });
  }

  // Resolve seller identity (server-side — never from client)
  const sellerIdentity = await resolveCurrentSeller({
    organizationId: organization.id,
    userId: user.id,
  });
  const scope = deriveSellerScope(sellerIdentity);

  // Determine target sellerTerceroId
  let targetTerceroId: number | null = null;

  if (scope.canAccessAllSellers) {
    // Admin/manager: can view any seller via query param, or own if mapped
    const overrideParam = url.searchParams.get("sellerTerceroId");
    const slugParam = url.searchParams.get("sellerSlug");
    if (overrideParam) {
      const parsed = parseInt(overrideParam, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return NextResponse.json({ error: "invalid sellerTerceroId" }, { status: 400 });
      }
      targetTerceroId = parsed;
    } else if (slugParam) {
      const resolved = await lookupSellerTerceroId(organization.id, slugParam);
      targetTerceroId = resolved ? parseInt(resolved, 10) || null : null;
    } else if (sellerIdentity.sagSellerCode) {
      targetTerceroId = parseInt(sellerIdentity.sagSellerCode, 10) || null;
    }
  } else {
    // Seller-scoped: own identity only
    if (sellerIdentity.sagSellerCode) {
      targetTerceroId = parseInt(sellerIdentity.sagSellerCode, 10) || null;
    }
  }

  if (!targetTerceroId) {
    return NextResponse.json({
      sellerTerceroId: null,
      year,
      month,
      periodStart: `${year}-${String(month).padStart(2, "0")}-01`,
      periodEndExclusive: "",
      totalApplications: 0,
      totalCollected: 0,
      totalCommission: 0,
      bandSummary: [],
      entries: [],
      truthState: "IDENTITY_UNRESOLVED",
      computedAt: new Date().toISOString(),
    });
  }

  const statement = await computeSellerCommissionStatement(targetTerceroId, year, month);

  return NextResponse.json(statement);
}
