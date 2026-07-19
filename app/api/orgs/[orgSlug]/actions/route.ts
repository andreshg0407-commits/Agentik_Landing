/**
 * GET  /api/orgs/[orgSlug]/actions          — list action tasks
 * POST /api/orgs/[orgSlug]/actions          — create action task
 */

import { NextResponse }          from "next/server";
import { requireOrgAccess }      from "@/lib/auth/org-access";
import {
  createActionTask,
  listActionTasks,
  getActionTaskStats,
  ActionTaskStatus,
  ActionTaskType,
  ActionTaskPriority,
  type CreateActionInput,
}                                from "@/lib/actions/service";

export const runtime = "nodejs";

function handleError(err: unknown, label: string) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error(`[${label}]`, err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const url    = new URL(req.url);
    const status = url.searchParams.get("status") as ActionTaskStatus | null;
    const limit  = Math.min(100, Number(url.searchParams.get("limit")  ?? "50"));
    const offset = Number(url.searchParams.get("offset") ?? "0");
    const withStats = url.searchParams.get("stats") === "1";

    const [tasks, stats] = await Promise.all([
      listActionTasks(organization.id, {
        ...(status ? { status } : {}),
        limit,
        offset,
      }),
      withStats ? getActionTaskStats(organization.id) : Promise.resolve(null),
    ]);

    return NextResponse.json({ tasks, stats });

  } catch (err) {
    return handleError(err, "actions/GET");
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { user, organization } = await requireOrgAccess(params.orgSlug);
    const body = await req.json() as Partial<CreateActionInput & { actionType: string; priority: string }>;

    // Validate required fields
    if (!body.title?.trim())      return NextResponse.json({ error: "title is required" },      { status: 400 });
    if (!body.actionType)         return NextResponse.json({ error: "actionType is required" }, { status: 400 });

    // Validate enum values
    const validTypes = Object.values(ActionTaskType) as string[];
    if (!validTypes.includes(body.actionType)) {
      return NextResponse.json({ error: `Invalid actionType: ${body.actionType}` }, { status: 400 });
    }

    if (body.priority) {
      const validPriorities = Object.values(ActionTaskPriority) as string[];
      if (!validPriorities.includes(body.priority)) {
        return NextResponse.json({ error: `Invalid priority: ${body.priority}` }, { status: 400 });
      }
    }

    const task = await createActionTask(
      organization.id,
      user.email ?? user.id,
      {
        title:        body.title.trim(),
        description:  body.description,
        actionType:   body.actionType as ActionTaskType,
        targetType:   body.targetType,
        targetId:     body.targetId,
        targetLabel:  body.targetLabel,
        sourceModule: body.sourceModule,
        priority:     (body.priority as ActionTaskPriority) ?? ActionTaskPriority.MEDIUM,
        assignedTo:   body.assignedTo,
        dueAt:        body.dueAt ? new Date(body.dueAt as unknown as string) : undefined,
        payloadJson:  body.payloadJson,
      },
    );

    return NextResponse.json({ task }, { status: 201 });

  } catch (err) {
    return handleError(err, "actions/POST");
  }
}
