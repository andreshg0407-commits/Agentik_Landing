/**
 * GET /api/orgs/[orgSlug]/agent/runtime/plans
 *
 * Agentik Runtime Planning — Operational Plans Endpoint
 *
 * Returns the full plans report for the org:
 * - Active OperationalPlan[] with steps, dependencies, blockers, conflicts
 * - Dependency graph summary (cycles, orphans)
 * - Plans summary (ready / blocked / conflicts)
 * - Readiness summary per action
 *
 * Read-only: deterministic, no external state mutation.
 *
 * Sprint: AGENTIK-AGENT-DEPENDENCY-PLANNING-01
 */

import { NextResponse }                    from "next/server";
import { requireOrgAccess }                from "@/lib/auth/org-access";
import { prisma }                          from "@/lib/prisma";
import { envelopeFromTask }                from "@/lib/agent-runtime/action-envelope";
import {
  queryMemory,
  queryObservations,
  queryEdges,
}                                          from "@/lib/agent-memory/runtime-memory-store";
import { generateRuntimeIntelligence }     from "@/lib/agent-intelligence/runtime-intelligence-engine";
import { buildDelegationReport }           from "@/lib/agent-orchestration/delegation-queue";
import { buildPlansReport }                from "@/lib/agent-planning/planning-engine";
import { summarizeReadiness }              from "@/lib/agent-planning/readiness-engine";
import { buildDependencyGraph }            from "@/lib/agent-planning/dependency-graph";

export const runtime = "nodejs";

function handleError(err: unknown) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error("[agent/runtime/plans/GET]", err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function GET(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const url        = new URL(req.url);
    const windowMins = Number(url.searchParams.get("windowMins") ?? "480");
    const since      = new Date(Date.now() - windowMins * 60_000).toISOString();

    // ── 1. Load envelopes ─────────────────────────────────────────────────────
    const tasks = await prisma.actionTask.findMany({
      where:   { organizationId: organization.id },
      orderBy: { createdAt: "desc" },
      take:    100,
      select: {
        id: true, title: true, description: true, actionType: true,
        status: true, priority: true, sourceModule: true,
        createdAt: true, updatedAt: true, payloadJson: true,
      },
    });

    const envelopes = tasks.map(t =>
      envelopeFromTask({
        ...t,
        actionType:  t.actionType as string,
        status:      t.status as string,
        priority:    t.priority as string,
        createdAt:   t.createdAt.toISOString(),
        updatedAt:   t.updatedAt.toISOString(),
        payloadJson: t.payloadJson as Record<string, unknown> | null,
      }),
    );

    // ── 2. Load memory state ──────────────────────────────────────────────────
    const [memoryNodes, memoryEdges, observations] = await Promise.all([
      queryMemory({ orgId: organization.id, since, limit: 200 }),
      queryEdges({ since, limit: 500 }),
      queryObservations({ orgId: organization.id, since, limit: 100 }),
    ]);

    // ── 3. Run intelligence engine ────────────────────────────────────────────
    const intelligenceReport = generateRuntimeIntelligence(
      organization.id, envelopes, memoryNodes, observations,
    );

    // ── 4. Load delegations ───────────────────────────────────────────────────
    const delegationReport = await buildDelegationReport(organization.id);
    const delegations      = delegationReport.delegations;

    // ── 5. Build plans report ─────────────────────────────────────────────────
    const plansReport = buildPlansReport(
      organization.id,
      envelopes,
      delegations,
      memoryNodes,
      memoryEdges,
      intelligenceReport,
    );

    // ── 6. Readiness summary ──────────────────────────────────────────────────
    const graph    = buildDependencyGraph(envelopes, delegations, memoryNodes, memoryEdges);
    const readiness = summarizeReadiness(envelopes, delegations, graph);

    return NextResponse.json({
      ...plansReport,
      readiness: {
        total:             readiness.total,
        ready:             readiness.ready,
        waitingApproval:   readiness.waitingApproval,
        waitingDelegation: readiness.waitingDelegation,
        blocked:           readiness.blocked,
        failedDependency:  readiness.failedDependency,
      },
      graph: {
        totalNodes:    graph.nodes.size,
        rootNodes:     graph.rootNodeIds.length,
        leafNodes:     graph.leafNodeIds.length,
        cyclesDetected: graph.cycles.length,
        orphanNodes:   graph.orphanIds.length,
      },
      meta: {
        envelopesAnalyzed: envelopes.length,
        delegationsLoaded: delegations.length,
        memoryNodesLoaded: memoryNodes.length,
        windowMins,
        generatedAt: new Date().toISOString(),
      },
    });

  } catch (err) {
    return handleError(err);
  }
}
