/**
 * GET /api/orgs/[orgSlug]/agent/memory/diagnostics
 *
 * Agentik Agent Runtime — Memory Graph Diagnostics Endpoint
 *
 * Returns runtime memory diagnostics for the dev panel in Approval Center.
 * Restricted to development mode or platform admin users.
 *
 * Sprint: AGENTIK-AGENT-CONTEXT-MEMORY-GRAPH-01
 */

import { NextResponse }           from "next/server";
import { requireOrgAccess }       from "@/lib/auth/org-access";
import { getMemoryDiagnostics }   from "@/lib/agent-memory/runtime-memory-store";
import { getRecentOperationalContext } from "@/lib/agent-memory/memory-query";

export const runtime = "nodejs";

function handleError(err: unknown) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error("[agent/memory/diagnostics/GET]", err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function GET(
  _req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);

    const [diagnostics, recentCtx] = await Promise.all([
      getMemoryDiagnostics(organization.id),
      getRecentOperationalContext(organization.id, 60, 10),
    ]);

    return NextResponse.json({
      diagnostics,
      recentContext: {
        recentNodeCount:     recentCtx.recentNodes.length,
        recentObsCount:      recentCtx.recentObs.length,
        pendingActionCount:  recentCtx.pendingActions.length,
        failedActionCount:   recentCtx.failedActions.length,
        criticalSignalCount: recentCtx.criticalSignals.length,
        recentNodes:         recentCtx.recentNodes.slice(0, 5),
        recentObs:           recentCtx.recentObs.slice(0, 5),
      },
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    return handleError(err);
  }
}
