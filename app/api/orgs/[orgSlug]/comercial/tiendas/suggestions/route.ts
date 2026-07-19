/**
 * POST /api/orgs/[orgSlug]/comercial/tiendas/suggestions
 *
 * Actions: load
 *
 * Sprint: TIENDAS-REPLENISHMENT-SUGGESTIONS-01
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadStoreSuggestions } from "@/lib/comercial/tiendas/store-suggestions-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  const body = await req.json();
  const action = body.action as string;

  switch (action) {
    case "load": {
      const result = await loadStoreSuggestions(orgId);
      return NextResponse.json(result);
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
