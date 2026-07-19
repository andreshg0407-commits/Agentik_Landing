/**
 * GET /api/orgs/[orgSlug]/agent/actions
 *
 * Agentik Agent Runtime — Action list endpoint.
 * Returns all ActionTasks with agent runtime metadata, as ActionEnvelopes.
 * Powers the Approval Center dashboard.
 *
 * Sprint: AGENTIK-AGENT-APPROVAL-CENTER-01
 */

import { NextResponse }         from "next/server";
import { requireOrgAccess }     from "@/lib/auth/org-access";
import { prisma }               from "@/lib/prisma";
import { envelopeFromTask }     from "@/lib/agent-runtime/action-envelope";
import type { ActionEnvelope }  from "@/lib/agent-runtime/action-envelope";

export const runtime = "nodejs";

function handleError(err: unknown, label: string) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error(`[${label}]`, err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function GET(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const url    = new URL(req.url);
    const limit  = Math.min(200, Number(url.searchParams.get("limit") ?? "50"));
    const status = url.searchParams.get("status"); // optional filter

    // Fetch ActionTasks with agent runtime metadata (sourceModule from agent copilots)
    const tasks = await prisma.actionTask.findMany({
      where: {
        organizationId: organization.id,
        sourceModule:   { contains: "david" }, // V2: expand to all agent modules
      },
      orderBy: { createdAt: "desc" },
      take:    limit,
      select: {
        id:           true,
        title:        true,
        description:  true,
        actionType:   true,
        status:       true,
        priority:     true,
        sourceModule: true,
        createdAt:    true,
        updatedAt:    true,
        payloadJson:  true,
      },
    });

    const envelopes: ActionEnvelope[] = tasks.map(t =>
      envelopeFromTask({
        ...t,
        actionType: t.actionType as string,
        status:     t.status as string,
        priority:   t.priority as string,
        createdAt:  t.createdAt.toISOString(),
        updatedAt:  t.updatedAt.toISOString(),
        payloadJson: t.payloadJson as Record<string, unknown> | null,
      }),
    );

    const filtered = status
      ? envelopes.filter(e => e.agentStatus === status || e.taskStatus === status)
      : envelopes;

    return NextResponse.json({ envelopes: filtered, total: filtered.length });

  } catch (err) {
    return handleError(err, "agent/actions/GET");
  }
}
