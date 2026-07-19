/**
 * app/api/orgs/[orgSlug]/marketing-studio/execution/health/route.ts
 *
 * MS-13 — Execution Runtime: Destination health endpoint
 *
 * GET  /api/orgs/[orgSlug]/marketing-studio/execution/health
 *   → Returns latest persisted health snapshots per destination
 *
 * POST /api/orgs/[orgSlug]/marketing-studio/execution/health
 *   → Recomputes and persists health for all destinations
 *   Body: { webhookBacklog?: number }
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   Session required. No tokens or credentials in response.
 */

import { NextRequest, NextResponse }         from "next/server";
import { requireOrgAccess }                  from "@/lib/auth/org-access";
import { canAccessMarketingStudio }          from "@/lib/auth/module-access";
import {
  getLatestDestinationHealth,
  recordAllDestinationHealth,
}                                            from "@/lib/marketing-studio/execution/execution-health";

export async function GET(
  req:     NextRequest,
  context: { params: { orgSlug: string } },
) {
  try {
    const { orgSlug }                  = context.params;
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const snapshots = await getLatestDestinationHealth(organization.id);
    return NextResponse.json({ snapshots });

  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req:     NextRequest,
  context: { params: { orgSlug: string } },
) {
  try {
    const { orgSlug }                  = context.params;
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({})) as { webhookBacklog?: number };
    const snapshots = await recordAllDestinationHealth(organization.id, body.webhookBacklog);

    return NextResponse.json({ snapshots, refreshedAt: new Date().toISOString() });

  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
