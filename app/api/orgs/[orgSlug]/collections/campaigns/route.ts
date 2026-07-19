/**
 * app/api/orgs/[orgSlug]/collections/campaigns/route.ts
 *
 * GET  — list all campaigns with aggregated stats.
 * POST — launch a new cohort campaign (requires MANAGER+).
 *
 * POST body:
 *   {
 *     campaignName: string;
 *     filter: {
 *       dpd_bucket:     "0_30" | "31_60" | "61_90" | "91_180" | "181_plus";
 *       min_overdue?:   number;
 *       max_customers?: number;
 *       seller_filter?: string;
 *     }
 *   }
 *
 * Response GET:  { campaigns: CampaignSummary[] }
 * Response POST: { ok: true; campaignId: string; tasksCreated: number }
 *             |  { error: string }
 */

import { NextRequest, NextResponse }             from "next/server";
import { requireOrgAccess }                      from "@/lib/auth/org-access";
import { canManageCampaigns }                    from "@/lib/auth/module-access";
import { launchCampaign, getActiveCampaigns }    from "@/lib/collections/campaigns";
import type { DpdBucket, CampaignFilter }        from "@/lib/collections/campaigns";

const VALID_BUCKETS: DpdBucket[] = ["0_30", "31_60", "61_90", "91_180", "181_plus"];

// ── GET — list campaigns ──────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
): Promise<NextResponse> {
  try {
    const { orgSlug }       = await params;
    const { organization }  = await requireOrgAccess(orgSlug);

    const campaigns = await getActiveCampaigns(organization.id);
    return NextResponse.json({ campaigns });
  } catch (err: any) {
    console.error("[campaigns/GET] error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}

// ── POST — launch campaign ────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
): Promise<NextResponse> {
  try {
    const { orgSlug }                 = await params;
    const { user, organization, membership } = await requireOrgAccess(orgSlug);

    // Role gate — only MANAGER, ORG_ADMIN, SUPER_ADMIN
    if (!canManageCampaigns(membership.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions. Requires MANAGER role or higher." },
        { status: 403 },
      );
    }

    const body = await req.json() as {
      campaignName?: string;
      filter?:       Partial<CampaignFilter>;
    };

    if (!body.campaignName?.trim()) {
      return NextResponse.json({ error: "campaignName is required" }, { status: 400 });
    }

    const bucket = body.filter?.dpd_bucket;
    if (!bucket || !VALID_BUCKETS.includes(bucket)) {
      return NextResponse.json(
        { error: `filter.dpd_bucket must be one of: ${VALID_BUCKETS.join(", ")}` },
        { status: 400 },
      );
    }

    const filter: CampaignFilter = {
      dpd_bucket:    bucket,
      min_overdue:   body.filter?.min_overdue   ?? 0,
      max_customers: body.filter?.max_customers ?? 200,
      seller_filter: body.filter?.seller_filter,
    };

    const { campaignId, tasksCreated } = await launchCampaign({
      orgId:        organization.id,
      createdBy:    user.email ?? user.name ?? "system",
      campaignName: body.campaignName.trim(),
      filter,
    });

    if (tasksCreated === 0) {
      return NextResponse.json(
        { error: "No customers matched the campaign filter. No tasks were created." },
        { status: 422 },
      );
    }

    return NextResponse.json({ ok: true, campaignId, tasksCreated });
  } catch (err: any) {
    console.error("[campaigns/POST] error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
