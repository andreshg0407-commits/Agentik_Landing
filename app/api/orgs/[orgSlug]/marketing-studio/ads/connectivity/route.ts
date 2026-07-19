/**
 * app/api/orgs/[orgSlug]/marketing-studio/ads/connectivity/route.ts
 *
 * MARKETING-ADS-CONNECTORS-01 — Ads Connectivity API Route
 *
 * GET /api/orgs/[orgSlug]/marketing-studio/ads/connectivity
 *
 * Returns a safe connectivity diagnostic for all configured Ads platforms.
 * No credentials are returned — only status, account summaries, and messages.
 *
 * Used by: AnunciosDashboard connectivity block (non-blocking secondary panel).
 */

import { NextResponse }            from "next/server";
import { requireOrgAccess }        from "@/lib/auth/org-access";
import { canAccessMarketingStudio } from "@/lib/auth/module-access";
import { getAdsConnectivityStatus } from "@/lib/marketing-studio/ads/ads-connectivity-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug }              = await params;
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    // organizationId used for future Vault tenant-scoped credential lookup
    const status = await getAdsConnectivityStatus(organization.id);

    return NextResponse.json(status);
  } catch (err) {
    console.error("[ads/connectivity] error:", err);
    return NextResponse.json(
      { error: "Error al verificar conectividad de plataformas." },
      { status: 500 },
    );
  }
}
