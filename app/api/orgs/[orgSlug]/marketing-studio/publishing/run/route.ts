/**
 * POST /api/orgs/[orgSlug]/marketing-studio/publishing/run
 *
 * MS-17 — Execute a PublishingPlan or a single PublishingPlanStep.
 *
 * Body: { planId: string, stepId?: string }
 */

import { NextRequest, NextResponse }         from "next/server";
import { requireOrgAccess }                  from "@/lib/auth/org-access";
import { getPublishingPlan }                 from "@/lib/marketing-studio/publishing/publishing-repository";
import {
  runPublishingOrchestrator,
  executePublishingStep,
} from "@/lib/marketing-studio/publishing/publishing-orchestrator";

export async function POST(
  req: NextRequest,
  ctx: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(ctx.params.orgSlug);
    const body             = await req.json() as { planId: string; stepId?: string };

    if (!body.planId) {
      return NextResponse.json({ error: "planId required" }, { status: 400 });
    }

    const plan = await getPublishingPlan(body.planId, organization.id);
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    if (body.stepId) {
      // Execute single step
      const step = plan.steps.find(s => s.id === body.stepId);
      if (!step) {
        return NextResponse.json({ error: "Step not found" }, { status: 404 });
      }
      const result = await executePublishingStep(step, organization.id);
      return NextResponse.json({ results: [result] });
    }

    // Execute full plan
    const results = await runPublishingOrchestrator(plan, organization.id);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[publishing/run]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
