/**
 * POST /api/orgs/[orgSlug]/agent/actions/[actionId]/reject
 *
 * Agentik Agent Runtime — Action Rejection Endpoint
 *
 * Rejects a pending_approval AgentAction.
 * Updates the ActionTask status to CANCELED and records the audit entry.
 *
 * Sprint: AGENTIK-AGENT-ACTION-LIFECYCLE-01
 */

import { NextResponse }             from "next/server";
import { requireOrgAccess }         from "@/lib/auth/org-access";
import { prisma }                   from "@/lib/prisma";
import { ActionTaskStatus }         from "@prisma/client";
import { rejectAgentAction }        from "@/lib/agent-runtime/action-lifecycle";
import { getAgentAction, updateAgentActionStatus } from "@/lib/agent-runtime/action-queue";
import { emitAgentRuntimeEvent }    from "@/lib/agent-runtime/runtime-events";
import { createAgentAuditRecord }   from "@/lib/agent-runtime/audit";
import type { ActionStatusEvent }   from "@/lib/agent-runtime/runtime-events";
import { envelopeFromTask }          from "@/lib/agent-runtime/action-envelope";
import { recordRejectionDecision }   from "@/lib/agent-memory/action-context";

export const runtime = "nodejs";

function handleError(err: unknown, label: string) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error(`[${label}]`, err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string; actionId: string } },
) {
  try {
    const { user, organization } = await requireOrgAccess(params.orgSlug);
    const body = await req.json().catch(() => ({})) as { reason?: string };
    const { actionId } = params;
    const reason = body.reason?.trim();

    // ── 1. Load from in-memory queue ─────────────────────────────────────────
    const action = await getAgentAction(actionId, organization.id);

    if (!action) {
      // Fall back: find by agentActionId in ActionTask.payloadJson
      const task = await prisma.actionTask.findFirst({
        where: {
          organizationId: organization.id,
          payloadJson:    { path: ["agentActionId"], equals: actionId },
        },
      });
      if (!task) {
        return NextResponse.json({ error: "Action not found" }, { status: 404 });
      }
      await prisma.actionTask.update({
        where: { id: task.id },
        data: {
          status:     ActionTaskStatus.CANCELED,
          payloadJson: {
            ...(task.payloadJson as Record<string, unknown>),
            agentActionStatus: "rejected",
            rejectedBy:        user.email ?? user.id,
            rejectedAt:        new Date().toISOString(),
            rejectionReason:   reason ?? null,
          },
        },
      });
      return NextResponse.json({
        agentActionId: actionId,
        status:        "rejected",
        rejectedBy:    user.email ?? user.id,
        message:       "Propuesta rechazada.",
      });
    }

    // ── 2. Apply lifecycle transition ─────────────────────────────────────────
    const rejected = rejectAgentAction(action, user.email ?? user.id, reason);
    await updateAgentActionStatus(actionId, organization.id, rejected);

    // ── 3. Update ActionTask to CANCELED ──────────────────────────────────────
    const task = await prisma.actionTask.findFirst({
      where: {
        organizationId: organization.id,
        payloadJson:    { path: ["agentActionId"], equals: actionId },
      },
    });
    if (task) {
      await prisma.actionTask.update({
        where: { id: task.id },
        data: {
          status:     ActionTaskStatus.CANCELED,
          payloadJson: {
            ...(task.payloadJson as Record<string, unknown>),
            agentActionStatus: "rejected",
            rejectedBy:        user.email ?? user.id,
            rejectedAt:        new Date().toISOString(),
            rejectionReason:   reason ?? null,
          },
        },
      });
    }

    // ── 4. Memory graph — record rejection decision ───────────────────────────
    if (task) {
      try {
        const envelope = envelopeFromTask({
          id:            task.id,
          title:         task.title,
          description:   task.description,
          actionType:    task.actionType as string,
          status:        task.status as string,
          priority:      task.priority as string,
          sourceModule:  task.sourceModule,
          createdAt:     task.createdAt instanceof Date ? task.createdAt.toISOString() : String(task.createdAt),
          updatedAt:     task.updatedAt instanceof Date ? task.updatedAt.toISOString() : String(task.updatedAt),
          payloadJson: {
            ...(task.payloadJson as Record<string, unknown>),
            agentActionStatus: "rejected",
            rejectedBy:        user.email ?? user.id,
            rejectionReason:   reason ?? null,
          },
        });
        const nodeId = `mn_action_${task.id}`;
        await recordRejectionDecision(nodeId, envelope, user.email ?? user.id, reason, organization.id);
      } catch {
        // Memory graph is best-effort — never fail the endpoint
      }
    }

    // ── 5. Audit record ───────────────────────────────────────────────────────
    createAgentAuditRecord({
      organizationId: organization.id,
      agentId:        rejected.sourceAgentId,
      domain:         rejected.domain,
      moduleKey:      rejected.moduleKey,
      userId:         user.email ?? user.id,
      actionId,
      actionType:     rejected.type,
      prevStatus:     "pending_approval",
      newStatus:      "rejected",
      summary:        `Action "${rejected.title}" rejected by ${user.email ?? user.id}${reason ? `: ${reason}` : ""}`,
      success:        true,
    });

    // ── 6. Emit runtime event ─────────────────────────────────────────────────
    emitAgentRuntimeEvent<ActionStatusEvent>({
      type:           "action.rejected",
      organizationId: organization.id,
      agentId:        rejected.sourceAgentId,
      domain:         rejected.domain,
      moduleKey:      rejected.moduleKey,
      metadata: {
        actionId,
        actionType:  rejected.type,
        prevStatus:  "pending_approval",
        newStatus:   "rejected",
        userId:      user.email ?? user.id,
      },
    });

    return NextResponse.json({
      agentAction: rejected,
      status:      "rejected",
      message:     "Propuesta rechazada.",
    });

  } catch (err) {
    return handleError(err, "agent/actions/reject/POST");
  }
}
