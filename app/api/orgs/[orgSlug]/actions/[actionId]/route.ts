/**
 * PATCH /api/orgs/[orgSlug]/actions/[actionId]
 *
 * Unified mutation endpoint. Body:
 *   { operation: "complete" | "cancel" | "assign" | "status" | "reschedule" }
 *
 * Per operation:
 *   complete:   { result?: Record<string,unknown> }
 *   cancel:     (no extra fields)
 *   assign:     { assignedTo: string }
 *   status:     { status: ActionTaskStatus, errorMessage?: string, result?: Record<string,unknown> }
 *   reschedule: { dueAt: string (ISO) }
 */

import { NextResponse }          from "next/server";
import { requireOrgAccess }      from "@/lib/auth/org-access";
import {
  completeActionTask,
  cancelActionTask,
  assignActionTask,
  updateActionStatus,
  getActionTask,
  ActionTaskStatus,
}                                from "@/lib/actions/service";

export const runtime = "nodejs";

function handleError(err: unknown, label: string) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED")   return NextResponse.json({ error: "Unauthorized" },    { status: 401 });
  if (msg === "ACCESS_DENIED")     return NextResponse.json({ error: "Forbidden" },       { status: 403 });
  if (msg === "ORG_NOT_FOUND")     return NextResponse.json({ error: "Not found" },       { status: 404 });
  if (msg === "ACTION_NOT_FOUND")  return NextResponse.json({ error: "Action not found"}, { status: 404 });
  console.error(`[${label}]`, err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function GET(
  _req: Request,
  { params }: { params: { orgSlug: string; actionId: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const task = await getActionTask(organization.id, params.actionId);
    if (!task) return NextResponse.json({ error: "Action not found" }, { status: 404 });
    return NextResponse.json({ task });
  } catch (err) {
    return handleError(err, "actions/[id]/GET");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { orgSlug: string; actionId: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const orgId    = organization.id;
    const actionId = params.actionId;

    const body = await req.json() as {
      operation:    string;
      assignedTo?:  string;
      status?:      string;
      errorMessage?: string;
      result?:      Record<string, unknown>;
      dueAt?:       string;
    };

    let task;

    switch (body.operation) {
      case "complete":
        task = await completeActionTask(orgId, actionId, body.result);
        break;

      case "cancel":
        task = await cancelActionTask(orgId, actionId);
        break;

      case "assign":
        if (!body.assignedTo?.trim())
          return NextResponse.json({ error: "assignedTo is required" }, { status: 400 });
        task = await assignActionTask(orgId, actionId, body.assignedTo.trim());
        break;

      case "status": {
        if (!body.status)
          return NextResponse.json({ error: "status is required" }, { status: 400 });
        const validStatuses = Object.values(ActionTaskStatus) as string[];
        if (!validStatuses.includes(body.status))
          return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 });
        task = await updateActionStatus(orgId, actionId, body.status as ActionTaskStatus, {
          errorMessage: body.errorMessage,
          result:       body.result,
        });
        break;
      }

      case "reschedule": {
        if (!body.dueAt)
          return NextResponse.json({ error: "dueAt is required" }, { status: 400 });
        const { prisma } = await import("@/lib/prisma");
        task = await prisma.actionTask.update({
          where: { id: actionId },
          data:  { dueAt: new Date(body.dueAt) },
        });
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown operation: ${body.operation}` }, { status: 400 });
    }

    return NextResponse.json({ task });

  } catch (err) {
    return handleError(err, "actions/[id]/PATCH");
  }
}
