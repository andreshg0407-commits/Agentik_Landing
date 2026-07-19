/**
 * DELETE /api/orgs/[orgSlug]/comercial/maletas/bags/[bagId]/ideal-route/[ruleId]
 *
 * Soft-delete: sets isActive = false. No physical deletion.
 *
 * Sprint: GO-LIVE-MALETAS-DERROTERO-HARDENING-01
 */

import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { deactivateIdealRouteRule } from "@/lib/comercial/maletas/vendor-bag-ideal-route-service";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: { orgSlug: string; bagId: string; ruleId: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const deactivated = await deactivateIdealRouteRule(organization.id, params.bagId, params.ruleId);
    if (!deactivated) {
      return NextResponse.json({ ok: false, error: "Rule not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "ORG_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
