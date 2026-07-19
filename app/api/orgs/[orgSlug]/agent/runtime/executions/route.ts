/**
 * GET /api/orgs/[orgSlug]/agent/runtime/executions
 *
 * Agentik Execution Lifecycle — Session Query API
 *
 * Returns execution sessions for the organization, with optional filtering.
 * Includes diagnostics and stuck execution detection.
 *
 * Sprint: AGENTIK-AGENT-EXECUTION-LIFECYCLE-01
 */

import { NextResponse }                    from "next/server";
import { requireOrgAccess }               from "@/lib/auth/org-access";
import {
  queryExecutionSessions,
  getExecutionDiagnostics,
  getStuckExecutions,
}                                         from "@/lib/agent-runtime/execution-session-store";
import { getActiveHeartbeatCount }        from "@/lib/agent-runtime/execution-heartbeat";
import { bootstrapRuntime }               from "@/lib/agent-runtime/runtime-bootstrap";
import { getStoreMode }                   from "@/lib/agent-runtime/execution-store-provider";
import { validateExecutionConsistency }   from "@/lib/agent-runtime/execution-consistency";
import { getLastRecoveryReport }          from "@/lib/agent-runtime/runtime-recovery";
import type { ExecutionStatus }           from "@/lib/agent-runtime/execution-lifecycle-types";

// Bootstrap store on first request (idempotent — no-ops after first call)
void bootstrapRuntime();

export const runtime = "nodejs";

function handleError(err: unknown) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error("[agent/runtime/executions/GET]", err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function GET(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const url              = new URL(req.url);
    const qs               = url.searchParams;

    const statusParam = qs.get("status");
    const status = statusParam
      ? (statusParam.split(",") as ExecutionStatus[])
      : undefined;

    const actionId = qs.get("actionId")  ?? undefined;
    const toolId   = qs.get("toolId")    ?? undefined;
    const agentId  = qs.get("agentId")   ?? undefined;
    const since    = qs.get("since")     ?? undefined;
    const limit    = qs.get("limit")     ? parseInt(qs.get("limit")!, 10) : 50;

    const [sessions, diagnostics, stuck, consistency] = await Promise.all([
      queryExecutionSessions({
        orgId: organization.id,
        status,
        actionId,
        toolId,
        agentId,
        since,
        limit,
      }),
      getExecutionDiagnostics(organization.id, getActiveHeartbeatCount()),
      getStuckExecutions(organization.id),
      validateExecutionConsistency(organization.id),
    ]);

    return NextResponse.json({
      sessions,
      diagnostics,
      stuck,
      consistency,
      recovery:  getLastRecoveryReport(),
      storeMode: getStoreMode(),
      meta: {
        count:       sessions.length,
        stuckCount:  stuck.length,
        generatedAt: new Date().toISOString(),
      },
    });

  } catch (err) {
    return handleError(err);
  }
}
