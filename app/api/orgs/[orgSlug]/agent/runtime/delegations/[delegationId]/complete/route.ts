/**
 * POST /api/orgs/[orgSlug]/agent/runtime/delegations/[delegationId]/complete
 *
 * Marks a delegation as completed.
 * Transitions: in_progress → completed
 *
 * Sprint: AGENTIK-AGENT-DELEGATION-ORCHESTRATION-01
 */

import { NextResponse }                    from "next/server";
import { requireOrgAccess }                from "@/lib/auth/org-access";
import { getDelegation, updateDelegation } from "@/lib/agent-orchestration/delegation-queue";
import { completeDelegation }              from "@/lib/agent-orchestration/delegation-lifecycle";
import { emitDelegationEvent }             from "@/lib/agent-orchestration/delegation-events";
import { recordDelegationCompleted }       from "@/lib/agent-orchestration/delegation-memory";

export const runtime = "nodejs";

function handleError(err: unknown) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error("[delegations/complete/POST]", err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string; delegationId: string } },
) {
  try {
    await requireOrgAccess(params.orgSlug);
    const body = await req.json().catch(() => ({})) as { resolutionSummary?: string };
    const { delegationId } = params;
    const resolution = body.resolutionSummary?.trim() ?? "Completado";

    const delegation = await getDelegation(delegationId);
    if (!delegation) {
      return NextResponse.json({ error: "Delegation not found" }, { status: 404 });
    }

    const completed = completeDelegation(delegation, resolution);
    await updateDelegation(completed);

    try {
      await recordDelegationCompleted(completed);
    } catch { /* best-effort */ }

    emitDelegationEvent("delegation.completed", completed);

    return NextResponse.json({ delegation: completed, status: "completed" });

  } catch (err) {
    return handleError(err);
  }
}
