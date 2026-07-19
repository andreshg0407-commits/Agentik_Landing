/**
 * POST /api/orgs/[orgSlug]/agent/runtime/executions/[executionId]/cancel
 *
 * Agentik Execution Lifecycle — Cancel Execution Session
 *
 * CANCEL SEMANTICS — V1 (state-level cooperative cancellation)
 * ─────────────────────────────────────────────────────────────
 * This endpoint transitions the execution session to "canceled" state and
 * releases the lease. It does NOT abort any in-flight JavaScript promise or
 * running handler. If a handler is currently executing, it will run to
 * completion (or timeout); only the session record is marked canceled.
 *
 * This is cooperative/state-level cancellation:
 * - Safe: no process is killed
 * - Immediate: session state changes instantly
 * - Not real-time: a running handler is unaffected until it finishes
 *
 * V2 plan: AbortController signal passed into handler context, allowing
 * handlers to honor cancellation requests. Distributed job cancellation
 * via workers or BullMQ/Temporal in a future durability sprint.
 *
 * Sprint: AGENTIK-AGENT-EXECUTION-LIFECYCLE-HARDENING-01
 */

import { NextResponse }          from "next/server";
import { requireOrgAccess }      from "@/lib/auth/org-access";
import {
  getExecutionSession,
  releaseExecutionLease,
}                                from "@/lib/agent-runtime/execution-session-store";
import { markExecutionCanceled } from "@/lib/agent-runtime/execution-lifecycle";
import { isTerminalStatus }      from "@/lib/agent-runtime/execution-lifecycle";
import { emitAgentRuntimeEvent } from "@/lib/agent-runtime/runtime-events";
import type { RuntimeEvent }     from "@/lib/agent-runtime/runtime-events";

export const runtime = "nodejs";

function handleError(err: unknown) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error("[agent/runtime/executions/cancel/POST]", err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function POST(
  _req: Request,
  { params }: { params: { orgSlug: string; executionId: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);

    const session = await getExecutionSession(params.executionId);
    if (!session) {
      return NextResponse.json({ error: "Execution session not found." }, { status: 404 });
    }
    if (session.orgId !== organization.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (isTerminalStatus(session.status)) {
      return NextResponse.json(
        { error: `Session is already in terminal state "${session.status}".`, status: session.status },
        { status: 422 },
      );
    }

    const canceled = await markExecutionCanceled(session);

    // Release lease if held
    try { await releaseExecutionLease(session.id); } catch { /* best-effort */ }

    try {
      emitAgentRuntimeEvent<RuntimeEvent>({
        type:           "execution.canceled",
        organizationId: organization.id,
        agentId:        session.agentId as import("@/lib/agent-runtime/agent-types").AgentRuntimeId,
        domain:         "commercial" as import("@/lib/agent-runtime/agent-types").AgentDomain,
        moduleKey:      session.moduleKey,
        metadata:       { sessionId: session.id, actionId: session.actionId, toolId: session.toolId },
      });
    } catch { /* best-effort */ }

    return NextResponse.json({
      session:     canceled,
      generatedAt: new Date().toISOString(),
    });

  } catch (err) {
    return handleError(err);
  }
}
