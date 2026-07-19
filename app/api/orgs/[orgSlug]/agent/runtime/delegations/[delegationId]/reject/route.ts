/**
 * POST /api/orgs/[orgSlug]/agent/runtime/delegations/[delegationId]/reject
 *
 * Rejects a pending_approval or proposed delegation.
 * Transitions: pending_approval → rejected
 *
 * Sprint: AGENTIK-AGENT-DELEGATION-ORCHESTRATION-01
 */

import { NextResponse }                    from "next/server";
import { requireOrgAccess }                from "@/lib/auth/org-access";
import { getDelegation, updateDelegation } from "@/lib/agent-orchestration/delegation-queue";
import { rejectDelegation }                from "@/lib/agent-orchestration/delegation-lifecycle";
import { emitDelegationEvent }             from "@/lib/agent-orchestration/delegation-events";
import { recordDelegationRejected }        from "@/lib/agent-orchestration/delegation-memory";

export const runtime = "nodejs";

function handleError(err: unknown) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error("[delegations/reject/POST]", err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string; delegationId: string } },
) {
  try {
    const { user } = await requireOrgAccess(params.orgSlug);
    const body = await req.json().catch(() => ({})) as { reason?: string };
    const { delegationId } = params;

    const delegation = await getDelegation(delegationId);
    if (!delegation) {
      return NextResponse.json({ error: "Delegation not found" }, { status: 404 });
    }

    const rejected = rejectDelegation(delegation, user.email ?? user.id, body.reason?.trim());
    await updateDelegation(rejected);

    try {
      await recordDelegationRejected(rejected, user.email ?? user.id);
    } catch { /* best-effort */ }

    emitDelegationEvent("delegation.rejected", rejected);

    return NextResponse.json({ delegation: rejected, status: "rejected" });

  } catch (err) {
    return handleError(err);
  }
}
