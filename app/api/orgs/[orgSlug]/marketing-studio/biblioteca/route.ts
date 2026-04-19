/**
 * GET /api/orgs/[orgSlug]/marketing-studio/biblioteca
 *
 * Returns all approved assets for the org, ordered by most recent.
 * Used by the Biblioteca Creativa page.
 */

import { NextRequest, NextResponse }    from "next/server";
import { requireOrgAccess }            from "@/lib/auth/org-access";
import { listOrgApprovedAssets }       from "@/lib/marketing-studio/asset-service";

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  try {
    const { orgSlug }      = await params;
    const { organization } = await requireOrgAccess(orgSlug);
    const assets           = await listOrgApprovedAssets(organization.id);
    return NextResponse.json({ assets });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
