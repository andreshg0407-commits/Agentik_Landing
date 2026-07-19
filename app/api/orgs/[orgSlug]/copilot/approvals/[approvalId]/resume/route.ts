/**
 * POST /api/orgs/:orgSlug/copilot/approvals/:approvalId/resume
 *
 * Resumes a Copilot execution that was paused at a require_approval gate.
 *
 * This route does NOT accept a dispatcher from the request body.
 * Domain providers must be registered server-side.
 *
 * If no domain provider is available for the execution's domain,
 * the route returns { status: "domain_provider_not_available" } with HTTP 503.
 *
 * Responses:
 *   200 { status: "resumed",     executionId, correlationId, report }
 *   200 { status: "already_resumed" | "no_steps_to_run" | ... }
 *   400 { status: "cannot_resume" | "approval_not_approved" | ... }
 *   401 Unauthorized
 *   404 { status: "approval_not_found" }
 *   503 { status: "domain_provider_not_available" }
 *   500 Internal server error
 *
 * Note:
 *   Currently returns 503 "domain_provider_not_available" because domain
 *   providers are not yet wired into the generic resume route.
 *   This is intentional: the route is deployed first, providers follow.
 *   Domain-specific resume (e.g. Shopify) should be handled by a separate
 *   adapter route that registers the appropriate provider before calling
 *   resumeExecutionFromApproval().
 */
import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { createPrismaExecutionStore } from "@/lib/copilot/execution-store";
import { resumeExecutionFromApproval } from "@/lib/copilot/runtime/execution-resume";

interface Params { params: { orgSlug: string; approvalId: string } }

export async function POST(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { orgSlug, approvalId } = params;

  let tenantId: string;
  let resumedBy: string;
  try {
    const access = await requireOrgAccess(orgSlug);
    tenantId  = access.organization.id;
    resumedBy = access.user.email ?? access.user.id;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await resumeExecutionFromApproval({
      tenantId,
      approvalId,
      resumedBy,
      executionStore: createPrismaExecutionStore(),
      // dispatcher: intentionally omitted — returns domain_provider_not_available
      // Domain-specific routes (e.g. /resume/shopify) register providers before calling.
    });

    if (result.status === "approval_not_found") {
      return NextResponse.json(result, { status: 404 });
    }

    if (result.status === "domain_provider_not_available") {
      return NextResponse.json(result, { status: 503 });
    }

    if (
      result.status === "cannot_resume" ||
      result.status === "approval_not_approved" ||
      result.status === "error"
    ) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[copilot/approvals/:approvalId/resume] POST error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
