/**
 * POST /api/orgs/[orgSlug]/agent/actions/[actionId]/execute
 *
 * Agentik Runtime Tool Execution Kernel — Execute Action Endpoint
 *
 * Executes the tool mapped to an approved action via the Execution Kernel.
 *
 * Rules:
 * - Action must be "approved" — never executes pending_approval or failed actions
 * - Tool must be resolvable from action type
 * - Handler must be registered
 * - Guard must pass
 * - Does NOT modify ActionTask in Prisma (V2 will add executing/executed status)
 *   V1 stores result in event store only
 *
 * Sprint: AGENTIK-AGENT-TOOL-EXECUTION-KERNEL-01
 */

import { NextResponse }             from "next/server";
import { requireOrgAccess }         from "@/lib/auth/org-access";
import { prisma }                   from "@/lib/prisma";
import { envelopeFromTask }         from "@/lib/agent-runtime/action-envelope";
import { resolveToolForAction }     from "@/lib/agent-runtime/action-tool-mapper";
import { executeApprovedAction }    from "@/lib/agent-runtime/tool-execution-kernel";
import { registerDefaultTools }     from "@/lib/agent-runtime/register-default-tools";
import { buildDelegationReport }    from "@/lib/agent-orchestration/delegation-queue";

export const runtime = "nodejs";

// Bootstrap tool handlers (idempotent)
registerDefaultTools();

function handleError(err: unknown) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error("[agent/actions/execute/POST]", err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string; actionId: string } },
) {
  try {
    const { organization, user } = await requireOrgAccess(params.orgSlug);

    // ── 1. Load action task ───────────────────────────────────────────────
    const task = await prisma.actionTask.findFirst({
      where: {
        id:             params.actionId,
        organizationId: organization.id,
      },
      select: {
        id: true, title: true, description: true, actionType: true,
        status: true, priority: true, sourceModule: true,
        createdAt: true, updatedAt: true, payloadJson: true,
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Action not found." }, { status: 404 });
    }

    const envelope = envelopeFromTask({
      ...task,
      actionType:  task.actionType as string,
      status:      task.status as string,
      priority:    task.priority as string,
      createdAt:   task.createdAt.toISOString(),
      updatedAt:   task.updatedAt.toISOString(),
      payloadJson: task.payloadJson as Record<string, unknown> | null,
    });

    // ── 2. Must be approved ───────────────────────────────────────────────
    if (envelope.agentStatus !== "approved") {
      return NextResponse.json(
        {
          error:  `Action is "${envelope.agentStatus}" — only approved actions can be executed.`,
          status: envelope.agentStatus,
        },
        { status: 422 },
      );
    }

    // ── 3. Resolve tool ───────────────────────────────────────────────────
    const toolId = resolveToolForAction(envelope);
    if (!toolId) {
      return NextResponse.json(
        { error: `No tool mapping found for action type "${envelope.type}".` },
        { status: 422 },
      );
    }

    // ── 4. Load delegations (for guard check) ─────────────────────────────
    const delegationReport = await buildDelegationReport(organization.id);
    const delegations      = delegationReport.delegations;

    // ── 5. Parse optional override payload from request body ──────────────
    let bodyPayload: Record<string, unknown> = {};
    try {
      const body = await req.json() as Record<string, unknown>;
      if (body && typeof body === "object") bodyPayload = body;
    } catch {
      // No body — use action payload
    }

    // ── 6. Execute via kernel ─────────────────────────────────────────────
    const result = await executeApprovedAction({
      orgId:         organization.id,
      actionId:      params.actionId,
      toolId,
      envelope,
      delegations,
      requestedBy:   user.email ?? user.id,
      userRole:      "ORG_ADMIN", // V2: derive from session
      payload:       Object.keys(bodyPayload).length > 0 ? bodyPayload : undefined,
      correlationId: envelope.agentActionId ?? envelope.actionTaskId ?? params.actionId,
    });

    const statusCode = result.status === "succeeded" ? 200
      : result.status === "rejected"  ? 422
      : result.status === "skipped"   ? 200
      : 500;

    return NextResponse.json({
      result,
      actionId:    params.actionId,
      toolId,
      generatedAt: new Date().toISOString(),
    }, { status: statusCode });

  } catch (err) {
    return handleError(err);
  }
}
