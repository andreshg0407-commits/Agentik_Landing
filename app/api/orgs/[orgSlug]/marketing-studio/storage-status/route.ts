/**
 * app/api/orgs/[orgSlug]/marketing-studio/storage-status/route.ts
 *
 * MARKETING-R4A-SECURITY-CLOSEOUT-R1 — Storage Verification Status
 *
 * GET — Returns the 3-state storage verification status.
 *   { state, uploadsAllowed, reason }
 *
 * SECURITY:
 *   - requireOrgAccess enforces tenant membership.
 *   - canAccessMarketingStudio enforces module access.
 *   - No credentials, bucket names, or config details exposed.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { canAccessMarketingStudio }  from "@/lib/auth/module-access";
import { getStorageVerificationStatus } from "@/lib/storage/storage-verification-status";

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { orgSlug }                  = await ctx.params;
    const { membership } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "ACCESS_DENIED" }, { status: 403 });
    }

    const status = getStorageVerificationStatus();

    return NextResponse.json({
      state:          status.state,
      uploadsAllowed: status.uploadsAllowed,
      reason:         status.reason,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: "Error checking storage status" }, { status: 500 });
  }
}
