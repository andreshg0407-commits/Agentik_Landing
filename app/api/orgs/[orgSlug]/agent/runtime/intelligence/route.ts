/**
 * GET /api/orgs/[orgSlug]/agent/runtime/intelligence
 *
 * Agentik Runtime Intelligence — Intelligence Report Endpoint
 *
 * Returns the full RuntimeIntelligenceReport: insights, blockers,
 * coordination recommendations, detected patterns, orphan decisions, summary.
 *
 * Read-only. Does NOT mutate any state.
 * All analysis is deterministic — no LLM, no Mastra, no external calls.
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-INTELLIGENCE-01
 */

import { NextResponse }                  from "next/server";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import { prisma }                        from "@/lib/prisma";
import { envelopeFromTask }              from "@/lib/agent-runtime/action-envelope";
import { queryMemory, queryObservations } from "@/lib/agent-memory/runtime-memory-store";
import { generateRuntimeIntelligence }   from "@/lib/agent-intelligence/runtime-intelligence-engine";
import { deriveExecutiveRuntimeInsight } from "@/lib/agent-intelligence/runtime-intelligence-engine";

export const runtime = "nodejs";

function handleError(err: unknown) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error("[agent/runtime/intelligence/GET]", err);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function GET(
  req: Request,
  { params }: { params: { orgSlug: string } },
) {
  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const url    = new URL(req.url);
    const limit  = Math.min(200, Number(url.searchParams.get("limit") ?? "100"));
    const window = Number(url.searchParams.get("windowMins") ?? "480"); // 8h default

    // ── 1. Load ActionEnvelopes from Prisma ───────────────────────────────────
    const tasks = await prisma.actionTask.findMany({
      where:   { organizationId: organization.id },
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

    // ── 2. Load memory graph data ─────────────────────────────────────────────
    const since = new Date(Date.now() - window * 60_000).toISOString();

    const [memoryNodes, observations] = await Promise.all([
      queryMemory({ orgId: organization.id, since, limit: 200 }),
      queryObservations({ orgId: organization.id, since, limit: 100 }),
    ]);

    // ── 3. Generate intelligence report ──────────────────────────────────────
    const report  = generateRuntimeIntelligence(organization.id, envelopes, memoryNodes, observations);
    const execSummary = deriveExecutiveRuntimeInsight(report);

    return NextResponse.json({
      ...report,
      executiveSummary: execSummary,
      meta: {
        envelopesAnalyzed: envelopes.length,
        memoryNodesLoaded: memoryNodes.length,
        observationsLoaded: observations.length,
        windowMins:         window,
      },
    });

  } catch (err) {
    return handleError(err);
  }
}
