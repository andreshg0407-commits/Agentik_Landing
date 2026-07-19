/**
 * app/api/orgs/[orgSlug]/marketing-studio/orchestrator/health/route.ts
 *
 * MS-18 — Execution Actions: Health endpoint
 *
 * GET  — returns current orchestrator health
 * POST — refreshes health + records event
 *
 * Platform-admin only.
 */

import { NextRequest, NextResponse }           from "next/server";
import { requireOrgAccess }                    from "@/lib/auth/org-access";
import { isInternalRole }                      from "@/lib/auth/module-access";
import { buildOrchestratorRuntimeState }       from "@/lib/marketing-studio/orchestrator/orchestrator-engine";
import { dispatchOrchestratorAction }          from "@/lib/marketing-studio/orchestrator/orchestrator-action-dispatcher";
import { buildActionIdempotencyKey, ORCHESTRATOR_ACTION_TYPE } from "@/lib/marketing-studio/orchestrator/orchestrator-actions";

export async function GET(
  _req:    NextRequest,
  context: { params: { orgSlug: string } },
) {
  try {
    const { orgSlug }                  = context.params;
    const { user, membership, organization } = await requireOrgAccess(orgSlug);

    if (!isInternalRole(membership.role)) {
      return NextResponse.json({ error: "Forbidden — platform-admin only" }, { status: 403 });
    }

    const state = await buildOrchestratorRuntimeState(organization.id);

    return NextResponse.json({
      health:      state.health,
      activePlans: state.activePlanIds.length,
      totalPlans:  state.totalPlans,
      computedAt:  state.computedAt,
    });

  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  _req:    NextRequest,
  context: { params: { orgSlug: string } },
) {
  try {
    const { orgSlug }                  = context.params;
    const { user, membership, organization } = await requireOrgAccess(orgSlug);

    if (!isInternalRole(membership.role)) {
      return NextResponse.json({ error: "Forbidden — platform-admin only" }, { status: 403 });
    }

    const idempotencyKey = buildActionIdempotencyKey(
      ORCHESTRATOR_ACTION_TYPE.REFRESH_HEALTH,
      organization.id,
      `health-${Date.now()}`,
    );

    const result = await dispatchOrchestratorAction({
      organizationId: organization.id,
      actorId:        user.id ?? null,
      planId:         null,
      stageId:        null,
      jobId:          null,
      actionType:     ORCHESTRATOR_ACTION_TYPE.REFRESH_HEALTH,
      payload:        {},
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
