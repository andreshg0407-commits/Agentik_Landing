/**
 * POST /api/orgs/:orgSlug/copilot/approvals/:approvalId/resume-plan
 *
 * Builds a deterministic resume plan for an APPROVED CopilotApprovalRequest.
 *
 * This route does NOT execute anything. It returns the plan that the caller
 * can then hand off to executeExecutionPlan() or display for human review.
 *
 * Returns:
 *   200 { canResume: true,  plan: ApprovalResumePlan }
 *   200 { canResume: false, reason: string }
 *   401 Unauthorized
 *   500 Internal server error
 */
import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { createPrismaExecutionStore } from "@/lib/copilot/execution-store";
import { createApprovalWorkflowService } from "@/lib/copilot/approval-workflow";

interface Params { params: { orgSlug: string; approvalId: string } }

export async function POST(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { orgSlug, approvalId } = params;

  let tenantId: string;
  let requestedBy: string;
  try {
    const access = await requireOrgAccess(orgSlug);
    tenantId    = access.organization.id;
    requestedBy = access.user.email ?? access.user.id;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const svc  = createApprovalWorkflowService(createPrismaExecutionStore());
    const plan = await svc.buildResumePlan({ tenantId, approvalId, requestedBy });

    return NextResponse.json({ canResume: plan.canResume, plan });
  } catch (err) {
    console.error("[copilot/approvals/:approvalId/resume-plan] POST error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
