/**
 * POST /api/orgs/[orgSlug]/agent/runtime/executions/[executionId]/retry
 *
 * Agentik Execution Lifecycle — Retry Execution Session
 *
 * RETRY SEMANTICS — V1 (state-level, manual re-execution)
 * ─────────────────────────────────────────────────────────
 * This endpoint PREPARES a session for re-execution. It does NOT
 * automatically re-run the handler. To actually retry:
 *
 *   1. Call POST /retry  → session transitions to "queued"
 *   2. Call POST /api/orgs/.../agent/actions/[actionId]/execute → executes again
 *
 * Retry lineage is preserved: the next attempt will carry parentAttemptId
 * pointing to the attempt that failed.
 *
 * No auto-retry. No background job. No BullMQ/Temporal/workers in V1.
 *
 * Sprint: AGENTIK-AGENT-EXECUTION-LIFECYCLE-HARDENING-01
 */

import { NextResponse }               from "next/server";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import {
  getExecutionSession,
  updateExecutionSession,
}                                     from "@/lib/agent-runtime/execution-session-store";
import {
  markExecutionRetryScheduled,
  markExecutionQueued,
  getLatestAttempt,
}                                     from "@/lib/agent-runtime/execution-lifecycle";
import {
  shouldRetryExecution,
  DEFAULT_RETRY_POLICY,
}                                     from "@/lib/agent-runtime/execution-retry-policy";
import { emitAgentRuntimeEvent }      from "@/lib/agent-runtime/runtime-events";
import type { RuntimeEvent }          from "@/lib/agent-runtime/runtime-events";

export const runtime = "nodejs";

function handleError(err: unknown) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error("[agent/runtime/executions/retry/POST]", err);
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

    if (!["failed", "timed_out"].includes(session.status)) {
      return NextResponse.json(
        { error: `Session status "${session.status}" is not retryable (must be failed or timed_out).` },
        { status: 422 },
      );
    }

    const decision = shouldRetryExecution(session, DEFAULT_RETRY_POLICY);

    if (!decision.shouldRetry) {
      return NextResponse.json(
        { error: decision.reason, decision },
        { status: 422 },
      );
    }

    // Capture failing attempt's id for retry lineage before transitioning
    const failingAttempt = getLatestAttempt(session);
    const retryReason    = `Manual retry after ${session.status} (attempt ${session.attempt}/${session.maxAttempts})`;

    // Transition: failed/timed_out → retry_scheduled → queued
    const scheduled = await markExecutionRetryScheduled(session, decision.nextRetryAt!);
    let   requeued  = await markExecutionQueued(scheduled);

    // Stamp retry lineage on the session metadata so the next attempt can reference it
    if (failingAttempt) {
      try {
        // Update the failing attempt record with retryReason
        const updatedAttempts = requeued.attempts.map(a =>
          a.id === failingAttempt.id
            ? { ...a, retryReason, nextRetryAt: decision.nextRetryAt }
            : a,
        );
        requeued = await updateExecutionSession(requeued.id, { attempts: updatedAttempts });
      } catch { /* best-effort */ }
    }

    // Emit retry_prepared event
    try {
      emitAgentRuntimeEvent<RuntimeEvent>({
        type:           "execution.retry_prepared",
        organizationId: organization.id,
        agentId:        session.agentId as import("@/lib/agent-runtime/agent-types").AgentRuntimeId,
        domain:         "commercial" as import("@/lib/agent-runtime/agent-types").AgentDomain,
        moduleKey:      session.moduleKey,
        metadata:       {
          sessionId:        session.id,
          failingAttemptId: failingAttempt?.id ?? null,
          retryReason,
          nextAttemptNumber: decision.attemptNumber,
          nextRetryAt:      decision.nextRetryAt,
          delayMs:          decision.delayMs,
        },
      });
    } catch { /* best-effort */ }

    return NextResponse.json({
      session:     requeued,
      decision,
      retryReason,
      note:        "Session is queued. Re-execute by calling POST /agent/actions/[actionId]/execute.",
      generatedAt: new Date().toISOString(),
    });

  } catch (err) {
    return handleError(err);
  }
}
