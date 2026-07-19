/**
 * app/api/orgs/[orgSlug]/marketing-studio/orchestrator/retry/route.ts
 *
 * MS-18 — Execution Actions: Retry shortcut
 *
 * POST /api/orgs/[orgSlug]/marketing-studio/orchestrator/retry
 *
 * Body: { planId?, stageId?, retryCount? }
 *
 * Platform-admin only.
 */

import { NextRequest, NextResponse }           from "next/server";
import { requireOrgAccess }                    from "@/lib/auth/org-access";
import { isInternalRole }                      from "@/lib/auth/module-access";
import { dispatchOrchestratorAction }          from "@/lib/marketing-studio/orchestrator/orchestrator-action-dispatcher";
import { buildActionIdempotencyKey, ORCHESTRATOR_ACTION_TYPE } from "@/lib/marketing-studio/orchestrator/orchestrator-actions";

type Body = {
  planId?:     string;
  stageId?:    string;
  retryCount?: number;
  payload?:    Record<string, unknown>;
};

export async function POST(
  req:     NextRequest,
  context: { params: { orgSlug: string } },
) {
  try {
    const { orgSlug }                  = context.params;
    const { user, membership, organization } = await requireOrgAccess(orgSlug);

    if (!isInternalRole(membership.role)) {
      return NextResponse.json({ error: "Forbidden — platform-admin only" }, { status: 403 });
    }

    const body: Body = await req.json();

    const actionType = body.stageId
      ? ORCHESTRATOR_ACTION_TYPE.RETRY_STAGE
      : ORCHESTRATOR_ACTION_TYPE.RETRY_PLAN;

    if (!body.planId) {
      return NextResponse.json({ error: "planId is required" }, { status: 400 });
    }

    const entityId    = body.stageId ?? body.planId;
    const retrySuffix = body.retryCount != null ? String(body.retryCount) : undefined;
    const idempotencyKey = buildActionIdempotencyKey(
      actionType, organization.id, entityId, retrySuffix,
    );

    const result = await dispatchOrchestratorAction({
      organizationId: organization.id,
      actorId:        user.id ?? null,
      planId:         body.planId  ?? null,
      stageId:        body.stageId ?? null,
      jobId:          null,
      actionType,
      payload:        { ...(body.payload ?? {}), retryCount: body.retryCount ?? 0 },
      idempotencyKey,
      requestedAt:    new Date().toISOString(),
    });

    return NextResponse.json(result, { status: result.success ? 200 : 422 });

  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
