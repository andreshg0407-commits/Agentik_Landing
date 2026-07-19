/**
 * POST /api/orgs/[orgSlug]/marketing-studio/publishing/retry
 *
 * MS-17 — Retry a failed PublishingPlanStep.
 *
 * Body: { planId: string, stepId: string }
 */

import { NextRequest, NextResponse }       from "next/server";
import { requireOrgAccess }                from "@/lib/auth/org-access";
import { getPublishingPlan, updatePublishingStepStatus } from "@/lib/marketing-studio/publishing/publishing-repository";
import { executePublishingStep }           from "@/lib/marketing-studio/publishing/publishing-orchestrator";
import { PUBLISHING_STATUS }               from "@/lib/marketing-studio/publishing/publishing-types";

export async function POST(
  req: NextRequest,
  ctx: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(ctx.params.orgSlug);
    const body             = await req.json() as { planId: string; stepId: string };

    if (!body.planId || !body.stepId) {
      return NextResponse.json({ error: "planId and stepId required" }, { status: 400 });
    }

    const plan = await getPublishingPlan(body.planId, organization.id);
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    const step = plan.steps.find(s => s.id === body.stepId);
    if (!step) return NextResponse.json({ error: "Step not found" }, { status: 404 });

    if (!["failed", "blocked"].includes(step.status)) {
      return NextResponse.json(
        { error: `Cannot retry step with status: ${step.status}` },
        { status: 400 },
      );
    }

    // Reset to queued before retrying
    await updatePublishingStepStatus(step.id, organization.id, PUBLISHING_STATUS.QUEUED, {
      lastError: null,
    });

    const retryableStep = { ...step, status: PUBLISHING_STATUS.QUEUED, canExecute: true };
    const result        = await executePublishingStep(retryableStep, organization.id);
    return NextResponse.json({ result });
  } catch (err) {
    console.error("[publishing/retry]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
