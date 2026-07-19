/**
 * GET /api/orgs/[orgSlug]/agent/runtime/execution-graph
 *
 * Agentik Execution Graph — On-Demand Causal Graph API
 *
 * Builds and returns the execution graph for an org (or a focused subgraph).
 * Graph is a materialized view — NOT persisted, built fresh on each request.
 *
 * Query params:
 *   actionId?      — anchor: focused subgraph around this action
 *   executionId?   — anchor: focused subgraph around this execution session
 *   delegationId?  — anchor: focused subgraph around this delegation
 *   planId?        — anchor: focused subgraph around this plan
 *   correlationId? — anchor: all sessions sharing this correlationId
 *   depth?         — max BFS depth for subgraph (default: 8)
 *   includeEvents? — "true" | "false" (default: true)
 *   includeMemory? — "true" | "false" (default: false)
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-EXECUTION-GRAPH-01
 */

import { NextResponse }             from "next/server";
import { requireOrgAccess }         from "@/lib/auth/org-access";
import { getExecutionGraphForOrg }  from "@/lib/agent-runtime/execution-graph";

export const runtime = "nodejs";

function handleError(err: unknown) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error("[agent/runtime/execution-graph/GET]", err);
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

    const actionId      = qs.get("actionId")      ?? undefined;
    const executionId   = qs.get("executionId")   ?? undefined;
    const delegationId  = qs.get("delegationId")  ?? undefined;
    const planId        = qs.get("planId")        ?? undefined;
    const correlationId = qs.get("correlationId") ?? undefined;
    const depthParam    = qs.get("depth");
    const depth         = depthParam ? Math.max(1, Math.min(parseInt(depthParam, 10), 20)) : 8;
    const includeEvents = qs.get("includeEvents") !== "false";
    const includeMemory = qs.get("includeMemory") === "true";

    const result = await getExecutionGraphForOrg({
      orgId: organization.id,
      actionId,
      executionId,
      delegationId,
      planId,
      correlationId,
      depth,
      includeEvents,
      includeMemory,
    });

    return NextResponse.json({
      graph:        result.graph,
      issues:       result.issues,
      explanations: result.explanations,
      diagnostics:  result.diagnostics,
      generatedAt:  result.generatedAt,
    });

  } catch (err) {
    return handleError(err);
  }
}
