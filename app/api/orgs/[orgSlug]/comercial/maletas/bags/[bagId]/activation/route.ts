/**
 * POST /api/orgs/[orgSlug]/comercial/maletas/bags/[bagId]/activation
 *
 * Toggles vendor maleta activation state.
 * Body: { active: boolean }
 *
 * Sprint: MALLETS-GO-LIVE-COMPLETION-01
 */

import { NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { setVendorActivation } from "@/lib/comercial/maletas/vendor-bag-ideal-route-service";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string; bagId: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const body = await req.json();
    const active = Boolean(body.active);

    await setVendorActivation(organization.id, params.bagId, active);

    return NextResponse.json({ vendorId: params.bagId, active });
  } catch (err: any) {
    console.error("[ACTIVATION]", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal error" },
      { status: err?.message?.includes("Unauthorized") ? 403 : 500 },
    );
  }
}
