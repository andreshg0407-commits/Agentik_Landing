/**
 * GET /api/orgs/[orgSlug]/marketing-studio/publishing/health
 *
 * MS-17 — Return current PublishingHealthSummary.
 */

import { NextRequest, NextResponse }  from "next/server";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { listPublishingPlans }        from "@/lib/marketing-studio/publishing/publishing-repository";
import { computePublishingHealth }    from "@/lib/marketing-studio/publishing/publishing-health";
import { savePublishingHealthSnapshot } from "@/lib/marketing-studio/publishing/publishing-repository";

export async function GET(
  _req: NextRequest,
  ctx:  { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(ctx.params.orgSlug);
    const plans            = await listPublishingPlans(organization.id);
    const health           = computePublishingHealth(plans);

    // Persist snapshot (non-blocking)
    savePublishingHealthSnapshot({
      organizationId: organization.id,
      health:         health.level,
      summary:        health as unknown as Record<string, unknown>,
    }).catch(() => void 0);

    return NextResponse.json({ health });
  } catch (err) {
    console.error("[publishing/health]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
