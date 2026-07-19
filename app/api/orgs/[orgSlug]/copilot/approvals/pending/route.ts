/**
 * app/api/orgs/[orgSlug]/copilot/approvals/pending/route.ts
 *
 * AGENTIK-EXECUTION-PERSISTENCE-01 — Pending approvals API.
 * SERVER ONLY.
 *
 * GET /api/orgs/:orgSlug/copilot/approvals/pending
 *
 * Returns all CopilotApprovalRequests with status=PENDING for the tenant.
 * Used by the Copilot rail and future approval inbox.
 *
 * Future: POST to approve/reject will be added in a dedicated sprint.
 */
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { createPrismaExecutionStore }  from "@/lib/copilot/execution-store/prisma-execution-store";

const store = createPrismaExecutionStore();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;

  try { await requireOrgAccess(orgSlug); }
  catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  try {
    const approvals = await store.getPendingApprovals(orgSlug);

    return NextResponse.json({
      tenantId: orgSlug,
      total:    approvals.length,
      approvals: approvals.map(a => ({
        id:              a.id,
        executionId:     a.executionId,
        stepId:          a.stepId,
        actionId:        a.actionId,
        domain:          a.domain,
        requestedBy:     a.requestedBy,
        approvalStatus:  a.approvalStatus,
        policyDecision:  a.policyDecision,
        reason:          a.reason,
        requestedAt:     a.requestedAt,
        // policyReasons and metadata are intentionally omitted from list view
      })),
    });
  } catch (err) {
    console.error("[copilot/approvals/pending] GET error:", err);
    return NextResponse.json({ error: "Failed to load pending approvals" }, { status: 500 });
  }
}
