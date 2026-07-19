/**
 * GET /api/orgs/[orgSlug]/agent/runtime/execution-graph/diagnostics
 *
 * Agentik Execution Graph — Diagnostics-Only Endpoint
 *
 * Returns graph diagnostics without returning the full node/edge payload.
 * Faster than the main endpoint — suitable for health checks and monitoring.
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-EXECUTION-GRAPH-01
 */

import { NextResponse }                  from "next/server";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import {
  getExecutionGraphForOrg,
  summarizeIssues,
} from "@/lib/agent-runtime/execution-graph";

export const runtime = "nodejs";

function handleError(err: unknown) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error("[agent/runtime/execution-graph/diagnostics/GET]", err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function GET(
  _req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);

    const result = await getExecutionGraphForOrg({
      orgId:         organization.id,
      includeEvents: true,
      includeMemory: false,
      depth:         8,
    });

    const { graph, issues, diagnostics } = result;
    const summary = graph.summary;

    return NextResponse.json({
      summary: {
        nodeCount:            summary.nodeCount,
        edgeCount:            summary.edgeCount,
        actionCount:          summary.actionCount,
        executionCount:       summary.executionCount,
        attemptCount:         summary.attemptCount,
        delegationCount:      summary.delegationCount,
        planCount:            summary.planCount,
        eventCount:           summary.eventCount,
        memoryNodeCount:      summary.memoryNodeCount,
        orphanNodes:          summary.orphanNodes,
        failedChains:         summary.failedChains,
        unresolvedBlocks:     summary.unresolvedBlocks,
        maxDepth:             summary.maxDepth,
        cyclesDetected:       summary.cyclesDetected,
      },
      issueCounts:          summarizeIssues(issues),
      diagnostics: {
        issueCount:           diagnostics.issueCount,
        issueBySeverity:      diagnostics.issueBySeverity,
        issueByType:          diagnostics.issueByType,
        sourceNodeCounts:     diagnostics.sourceNodeCounts,
      },
      generatedAt: result.generatedAt,
    });

  } catch (err) {
    return handleError(err);
  }
}
