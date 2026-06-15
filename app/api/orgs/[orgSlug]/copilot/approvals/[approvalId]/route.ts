/**
 * GET /api/orgs/:orgSlug/copilot/approvals/:approvalId
 *
 * Returns a single CopilotApprovalRequest for the org, tenant-scoped.
 * Returns 404 if not found or if it belongs to a different tenant.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { createPrismaExecutionStore } from "@/lib/copilot/execution-store";
import { createApprovalWorkflowService } from "@/lib/copilot/approval-workflow";

interface Params { params: { orgSlug: string; approvalId: string } }

export async function GET(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { orgSlug, approvalId } = params;

  let tenantId: string;
  try {
    const access = await requireOrgAccess(orgSlug);
    tenantId = access.organization.id;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const svc    = createApprovalWorkflowService(createPrismaExecutionStore());
    const record = await svc.getApprovalDetail(tenantId, approvalId);

    if (!record) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }

    return NextResponse.json({ approval: record });
  } catch (err) {
    console.error("[copilot/approvals/:approvalId] GET error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
