/**
 * POST /api/orgs/:orgSlug/copilot/approvals/:approvalId/approve
 *
 * Transitions a pending CopilotApprovalRequest to APPROVED.
 * The resolvedBy identity comes from the authenticated user, NOT from the request body.
 *
 * Body (optional): { resolutionNote?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { createPrismaExecutionStore } from "@/lib/copilot/execution-store";
import { createApprovalWorkflowService } from "@/lib/copilot/approval-workflow";

interface Params { params: { orgSlug: string; approvalId: string } }

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { orgSlug, approvalId } = params;

  let tenantId: string;
  let resolvedBy: string;
  try {
    const access = await requireOrgAccess(orgSlug);
    tenantId  = access.organization.id;
    resolvedBy = access.user.email ?? access.user.id;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let resolutionNote: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.resolutionNote === "string") resolutionNote = body.resolutionNote;
  } catch {
    // body is optional — ignore parse errors
  }

  try {
    const svc    = createApprovalWorkflowService(createPrismaExecutionStore());
    const result = await svc.approveApprovalRequest({
      approvalId,
      tenantId,
      resolvedBy,
      resolutionNote,
    });

    if (!result.ok) {
      const status = result.errorCode === "APPROVAL_NOT_FOUND" ? 404
                   : result.errorCode === "ALREADY_RESOLVED"   ? 409
                   : result.errorCode === "TENANT_MISMATCH"    ? 403
                   : 400;
      return NextResponse.json({ error: result.error, errorCode: result.errorCode }, { status });
    }

    return NextResponse.json({ ok: true, resolution: result.resolution });
  } catch (err) {
    console.error("[copilot/approvals/:approvalId/approve] POST error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
