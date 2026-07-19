/**
 * POST /api/orgs/[orgSlug]/agent/runtime/delegations/[delegationId]/accept
 *
 * Target agent acknowledges a delegation.
 * Transitions: approved → accepted
 *
 * Sprint: AGENTIK-AGENT-DELEGATION-ORCHESTRATION-01
 */

import { NextResponse }                    from "next/server";
import { requireOrgAccess }                from "@/lib/auth/org-access";
import { getDelegation, updateDelegation } from "@/lib/agent-orchestration/delegation-queue";
import { acceptDelegation }                from "@/lib/agent-orchestration/delegation-lifecycle";
import { emitDelegationEvent }             from "@/lib/agent-orchestration/delegation-events";
import { recordDelegationAccepted }        from "@/lib/agent-orchestration/delegation-memory";

export const runtime = "nodejs";

function handleError(err: unknown) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error("[delegations/accept/POST]", err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function POST(
  _req: Request,
  { params }: { params: { orgSlug: string; delegationId: string } },
) {
  try {
    await requireOrgAccess(params.orgSlug);
    const { delegationId } = params;

    const delegation = await getDelegation(delegationId);
    if (!delegation) {
      return NextResponse.json({ error: "Delegation not found" }, { status: 404 });
    }

    const accepted = acceptDelegation(delegation);
    await updateDelegation(accepted);

    try {
      await recordDelegationAccepted(accepted);
    } catch { /* best-effort */ }

    emitDelegationEvent("delegation.accepted", accepted);

    return NextResponse.json({ delegation: accepted, status: "accepted" });

  } catch (err) {
    return handleError(err);
  }
}
