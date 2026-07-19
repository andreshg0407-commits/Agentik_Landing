/**
 * GET /api/orgs/[orgSlug]/operational-intelligence
 *
 * Returns the full Operational Intelligence Snapshot for the org.
 *
 * Query params:
 *   reconciliation=true|false   (default: true)
 *   commercial=true|false        (default: true)
 *   portfolio=true|false         (default: true)
 *
 * ─── READ-ONLY ────────────────────────────────────────────────────────────────
 * This endpoint produces no side effects.
 * Safe to call for dashboard refreshes and Copilot context building.
 *
 * Sprint: AGENTIK-OPERATIONAL-INTELLIGENCE-DASHBOARD-01
 */

import { NextResponse }                          from "next/server";
import { requireOrgAccess }                      from "@/lib/auth/org-access";
import { getOperationalIntelligenceSnapshot }    from "@/lib/operational-intelligence/operational-intelligence-service";

export const runtime = "nodejs";

export async function GET(
  req:     Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);

    const url            = new URL(req.url);
    const reconciliation = url.searchParams.get("reconciliation") !== "false";
    const commercial     = url.searchParams.get("commercial")     !== "false";
    const portfolio      = url.searchParams.get("portfolio")      !== "false";

    const snapshot = await getOperationalIntelligenceSnapshot(organization.id, {
      includeReconciliation: reconciliation,
      includeCommercialData: commercial,
      includePortfolioItems: portfolio,
    });

    return NextResponse.json({ ok: true, snapshot });
  } catch (err) {
    const msg    = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
