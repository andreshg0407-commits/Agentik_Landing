/**
 * POST /api/orgs/[orgSlug]/agent/runtime/delegations/[delegationId]/approve
 *
 * Approves a pending_approval delegation.
 * Transitions: pending_approval → approved
 *
 * Sprint: AGENTIK-AGENT-DELEGATION-ORCHESTRATION-01
 */

import { NextResponse }                  from "next/server";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import { getDelegation, updateDelegation } from "@/lib/agent-orchestration/delegation-queue";
import { approveDelegation }             from "@/lib/agent-orchestration/delegation-lifecycle";
import { emitDelegationEvent }           from "@/lib/agent-orchestration/delegation-events";
import { recordDelegationProposed }      from "@/lib/agent-orchestration/delegation-memory";

export const runtime = "nodejs";

function handleError(err: unknown) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error("[delegations/approve/POST]", err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string; delegationId: string } },
) {
  try {
    const { user } = await requireOrgAccess(params.orgSlug);
    const { delegationId } = params;

    const delegation = await getDelegation(delegationId);
    if (!delegation) {
      return NextResponse.json({ error: "Delegation not found" }, { status: 404 });
    }

    const approved = approveDelegation(delegation, user.email ?? user.id);
    await updateDelegation(approved);

    // Memory graph — record the approval
    try {
      await recordDelegationProposed(approved);
    } catch { /* best-effort */ }

    emitDelegationEvent("delegation.approved", approved);

    return NextResponse.json({ delegation: approved, status: "approved" });

  } catch (err) {
    return handleError(err);
  }
}
