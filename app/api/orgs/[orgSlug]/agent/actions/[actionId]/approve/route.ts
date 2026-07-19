/**
 * POST /api/orgs/[orgSlug]/agent/actions/[actionId]/approve
 *
 * Agentik Agent Runtime — Action Approval Endpoint
 *
 * Approves a pending_approval AgentAction.
 * Updates the ActionTask status to COMPLETED and records the audit entry.
 * Does NOT execute the action — execution is a separate concern (V2).
 *
 * Sprint: AGENTIK-AGENT-ACTION-LIFECYCLE-01
 */

import { NextResponse }             from "next/server";
import { requireOrgAccess }         from "@/lib/auth/org-access";
import { prisma }                   from "@/lib/prisma";
import { ActionTaskStatus }         from "@prisma/client";
import { approveAgentAction }       from "@/lib/agent-runtime/action-lifecycle";
import { getAgentAction, updateAgentActionStatus } from "@/lib/agent-runtime/action-queue";
import { emitAgentRuntimeEvent }    from "@/lib/agent-runtime/runtime-events";
import { createAgentAuditRecord }   from "@/lib/agent-runtime/audit";
import type { ActionStatusEvent }   from "@/lib/agent-runtime/runtime-events";
import { envelopeFromTask }          from "@/lib/agent-runtime/action-envelope";
import { recordApprovalDecision }    from "@/lib/agent-memory/action-context";

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
    const body  = await req.json().catch(() => ({})) as { reason?: string };
    const { actionId } = params;

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
      // Update ActionTask directly when queue is in-memory only
      await prisma.actionTask.update({
        where: { id: task.id },
        data: {
          status:     ActionTaskStatus.COMPLETED,
          payloadJson: {
            ...(task.payloadJson as Record<string, unknown>),
            agentActionStatus: "approved",
            approvedBy:        user.email ?? user.id,
            approvedAt:        new Date().toISOString(),
          },
        },
      });
      return NextResponse.json({
        agentActionId: actionId,
        status:        "approved",
        approvedBy:    user.email ?? user.id,
        message:       "Acción aprobada. Lista para ejecución.",
      });
    }

    // ── 2. Apply lifecycle transition ─────────────────────────────────────────
    const approved = approveAgentAction(action, user.email ?? user.id);
    await updateAgentActionStatus(actionId, organization.id, approved);

    // ── 3. Update ActionTask to COMPLETED ─────────────────────────────────────
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
          status:     ActionTaskStatus.COMPLETED,
          payloadJson: {
            ...(task.payloadJson as Record<string, unknown>),
            agentActionStatus: "approved",
            approvedBy:        user.email ?? user.id,
            approvedAt:        new Date().toISOString(),
          },
        },
      });
    }

    // ── 4. Memory graph — record approval decision ────────────────────────────
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
            agentActionStatus: "approved",
            approvedBy:        user.email ?? user.id,
          },
        });
        const nodeId = `mn_action_${task.id}`;
        await recordApprovalDecision(nodeId, envelope, user.email ?? user.id, organization.id);
      } catch {
        // Memory graph is best-effort — never fail the endpoint
      }
    }

    // ── 5. Audit record ───────────────────────────────────────────────────────
    createAgentAuditRecord({
      organizationId: organization.id,
      agentId:        approved.sourceAgentId,
      domain:         approved.domain,
      moduleKey:      approved.moduleKey,
      userId:         user.email ?? user.id,
      actionId,
      actionType:     approved.type,
      prevStatus:     "pending_approval",
      newStatus:      "approved",
      summary:        `Action "${approved.title}" approved by ${user.email ?? user.id}`,
      success:        true,
    });

    // ── 6. Emit runtime event ─────────────────────────────────────────────────
    emitAgentRuntimeEvent<ActionStatusEvent>({
      type:           "action.approved",
      organizationId: organization.id,
      agentId:        approved.sourceAgentId,
      domain:         approved.domain,
      moduleKey:      approved.moduleKey,
      metadata: {
        actionId,
        actionType:  approved.type,
        prevStatus:  "pending_approval",
        newStatus:   "approved",
        userId:      user.email ?? user.id,
      },
    });

    return NextResponse.json({
      agentAction: approved,
      status:      "approved",
      message:     "Acción aprobada. Lista para ejecución.",
    });

  } catch (err) {
    return handleError(err, "agent/actions/approve/POST");
  }
}
