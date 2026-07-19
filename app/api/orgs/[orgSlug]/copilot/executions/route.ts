/**
 * app/api/orgs/[orgSlug]/copilot/executions/route.ts
 *
 * AGENTIK-EXECUTION-PERSISTENCE-01 — Execution history API.
 * SERVER ONLY.
 *
 * GET /api/orgs/:orgSlug/copilot/executions
 *   ?status=completed|running|failed|awaiting_approval
 *   ?limit=20
 *   ?since=ISO8601
 *
 * Returns the most recent executions for the tenant, newest first.
 * Requires org membership (any role).
 */
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { createPrismaExecutionStore } from "@/lib/copilot/execution-store/prisma-execution-store";
import { getRecentExecutions }        from "@/lib/copilot/execution-store/execution-store-queries";

const store = createPrismaExecutionStore();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;

  try { await requireOrgAccess(orgSlug); }
  catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const url    = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const limit  = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);
  const since  = url.searchParams.get("since") ? new Date(url.searchParams.get("since")!) : undefined;

  try {
    const records = await store.listExecutions({
      tenantId: orgSlug,
      status,
      limit,
      since,
    });

    return NextResponse.json({
      tenantId:   orgSlug,
      total:      records.length,
      executions: records.map(r => ({
        executionId:     r.executionId,
        correlationId:   r.correlationId,
        status:          r.status,
        source:          r.source,
        executionMode:   r.executionMode,
        planTitle:       r.planTitle,
        totalSteps:      r.totalSteps,
        completedSteps:  r.completedSteps,
        failedSteps:     r.failedSteps,
        approvalRequired: r.approvalRequired,
        deniedByPolicy:  r.deniedByPolicy,
        startedAt:       r.startedAt,
        finishedAt:      r.finishedAt,
        durationMs:      r.durationMs,
      })),
    });
  } catch (err) {
    console.error("[copilot/executions] GET error:", err);
    return NextResponse.json({ error: "Failed to load executions" }, { status: 500 });
  }
}
