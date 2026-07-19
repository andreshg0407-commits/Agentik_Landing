/**
 * POST /api/internal/publishing-worker
 *
 * MS-17 — Internal worker: processes pending publishing plans.
 * Requires INTERNAL_CRON_SECRET header.
 * Ready for Vercel Cron.
 */

import { NextRequest, NextResponse }         from "next/server";
import { prisma }                            from "@/lib/prisma";
import { orchestrateScheduledPublishing }    from "@/lib/marketing-studio/publishing/publishing-orchestrator";
import { computePublishingHealth }           from "@/lib/marketing-studio/publishing/publishing-health";
import { listPublishingPlans, savePublishingHealthSnapshot } from "@/lib/marketing-studio/publishing/publishing-repository";

const CRON_SECRET = process.env.INTERNAL_CRON_SECRET;

export async function POST(req: NextRequest) {
  // Auth check
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find all active orgs with plans to process
    const activeOrgs = await prisma.publishingPlan.groupBy({
      by:     ["organizationId"],
      where:  { status: { in: ["planned", "queued", "retrying"] } },
      _count: { id: true },
    });

    const summary: Array<{ orgId: string; dispatched: number; errors: number }> = [];

    for (const org of activeOrgs) {
      const orgId = org.organizationId;
      try {
        const results   = await orchestrateScheduledPublishing(orgId);
        const plans     = await listPublishingPlans(orgId);
        const health    = computePublishingHealth(plans);

        // Persist health snapshot
        await savePublishingHealthSnapshot({
          organizationId: orgId,
          health:         health.level,
          summary:        health as unknown as Record<string, unknown>,
        }).catch(() => void 0);

        summary.push({
          orgId,
          dispatched: results.filter(r => r.success || r.isPendingExternal).length,
          errors:     results.filter(r => !r.success && !r.isPendingExternal).length,
        });
      } catch (err) {
        summary.push({ orgId, dispatched: 0, errors: 1 });
      }
    }

    const totalDispatched = summary.reduce((s, r) => s + r.dispatched, 0);
    const totalErrors     = summary.reduce((s, r) => s + r.errors, 0);

    return NextResponse.json({
      processed: activeOrgs.length,
      dispatched: totalDispatched,
      errors:     totalErrors,
      summary,
      at:         new Date().toISOString(),
    });
  } catch (err) {
    console.error("[publishing-worker]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
