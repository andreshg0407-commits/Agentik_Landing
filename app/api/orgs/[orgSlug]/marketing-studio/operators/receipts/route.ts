/**
 * app/api/orgs/[orgSlug]/marketing-studio/operators/receipts/route.ts
 *
 * MS-19 — Operator Receipts: GET /api/orgs/[orgSlug]/marketing-studio/operators/receipts
 *
 * Query params: channel?, planId?, limit?
 * Platform-admin only.
 */

import { NextRequest, NextResponse }    from "next/server";
import { requireOrgAccess }             from "@/lib/auth/org-access";
import { isInternalRole }               from "@/lib/auth/module-access";
import { listOperatorReceipts }         from "@/lib/marketing-studio/operators/operator-receipts";
import type { OperatorChannel }         from "@/lib/marketing-studio/operators/operator-types";

export async function GET(
  req:     NextRequest,
  context: { params: { orgSlug: string } },
) {
  try {
    const { orgSlug }                        = context.params;
    const { membership, organization }       = await requireOrgAccess(orgSlug);

    if (!isInternalRole(membership.role)) {
      return NextResponse.json({ error: "Forbidden — platform-admin only" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const channel  = searchParams.get("channel") as OperatorChannel | null;
    const planId   = searchParams.get("planId")  ?? undefined;
    const limit    = parseInt(searchParams.get("limit") ?? "50", 10);

    const receipts = await listOperatorReceipts({
      organizationId: organization.id,
      channel:        channel ?? undefined,
      planId,
      limit:          Math.min(limit, 200),
    });

    return NextResponse.json({ receipts });

  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
