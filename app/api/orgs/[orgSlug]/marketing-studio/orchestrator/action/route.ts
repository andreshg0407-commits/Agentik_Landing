/**
 * app/api/orgs/[orgSlug]/marketing-studio/orchestrator/action/route.ts
 *
 * MS-18 — Execution Actions: Central action endpoint
 *
 * POST /api/orgs/[orgSlug]/marketing-studio/orchestrator/action
 *
 * Platform-admin only (SUPER_ADMIN / AGENTIK_ADMIN).
 * organizationId always sourced from server context — never from body.
 */

import { NextRequest, NextResponse }           from "next/server";
import { requireOrgAccess }                    from "@/lib/auth/org-access";
import { isInternalRole }                      from "@/lib/auth/module-access";
import { dispatchOrchestratorAction }          from "@/lib/marketing-studio/orchestrator/orchestrator-action-dispatcher";
import { buildActionIdempotencyKey }           from "@/lib/marketing-studio/orchestrator/orchestrator-actions";
import type { OrchestratorActionType }         from "@/lib/marketing-studio/orchestrator/orchestrator-actions";

type Body = {
  actionType:      OrchestratorActionType;
  planId?:         string | null;
  stageId?:        string | null;
  jobId?:          string | null;
  payload?:        Record<string, unknown>;
  idempotencyKey?: string;
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

    if (!body.actionType) {
      return NextResponse.json({ error: "actionType is required" }, { status: 400 });
    }

    const entityId = body.planId ?? body.stageId ?? body.jobId ?? organization.id;
    const idempotencyKey = body.idempotencyKey
      ?? buildActionIdempotencyKey(body.actionType, organization.id, entityId);

    const result = await dispatchOrchestratorAction({
      organizationId:  organization.id,
      actorId:         user.id ?? null,
      planId:          body.planId   ?? null,
      stageId:         body.stageId  ?? null,
      jobId:           body.jobId    ?? null,
      actionType:      body.actionType,
      payload:         body.payload  ?? {},
      idempotencyKey,
      requestedAt:     new Date().toISOString(),
    });

    const status = result.success ? 200 : 422;
    return NextResponse.json(result, { status });

  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
