/**
 * app/api/orgs/[orgSlug]/marketing-studio/operators/health/route.ts
 *
 * MS-19 — Operator Health: GET /api/orgs/[orgSlug]/marketing-studio/operators/health
 *
 * Returns system-wide operator health across all channels.
 * Platform-admin only.
 */

import { NextRequest, NextResponse }          from "next/server";
import { requireOrgAccess }                   from "@/lib/auth/org-access";
import { isInternalRole }                     from "@/lib/auth/module-access";
import { computeOperatorSystemHealth }        from "@/lib/marketing-studio/operators/operator-health";

export async function GET(
  _req:    NextRequest,
  context: { params: { orgSlug: string } },
) {
  try {
    const { orgSlug }                        = context.params;
    const { membership, organization }       = await requireOrgAccess(orgSlug);

    if (!isInternalRole(membership.role)) {
      return NextResponse.json({ error: "Forbidden — platform-admin only" }, { status: 403 });
    }

    const systemHealth = await computeOperatorSystemHealth(organization.id);

    return NextResponse.json(systemHealth);

  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
