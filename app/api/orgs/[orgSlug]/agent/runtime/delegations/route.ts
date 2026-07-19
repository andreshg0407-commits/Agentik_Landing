/**
 * GET /api/orgs/[orgSlug]/agent/runtime/delegations
 *
 * Agentik Agent Orchestration — Delegation List Endpoint
 *
 * Returns the full delegation report for the org.
 * Also runs the delegation engine lazily to populate new proposals
 * from the current intelligence state (idempotent via dedup).
 *
 * Read-only: no external state mutation. In-memory queue updates are
 * idempotent and ephemeral (reset on process restart).
 *
 * Sprint: AGENTIK-AGENT-DELEGATION-ORCHESTRATION-01
 */

import { NextResponse }                    from "next/server";
import { requireOrgAccess }                from "@/lib/auth/org-access";
import { prisma }                          from "@/lib/prisma";
import { envelopeFromTask }                from "@/lib/agent-runtime/action-envelope";
import { queryMemory, queryObservations }  from "@/lib/agent-memory/runtime-memory-store";
import { generateRuntimeIntelligence }     from "@/lib/agent-intelligence/runtime-intelligence-engine";
import { runDelegationEngine }             from "@/lib/agent-orchestration/delegation-engine";
import { buildDelegationReport }           from "@/lib/agent-orchestration/delegation-queue";

export const runtime = "nodejs";

function handleError(err: unknown) {
  const msg = (err as Error).message;
  if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" },    { status: 403 });
  if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" },    { status: 404 });
  console.error("[agent/runtime/delegations/GET]", err);
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
    const [memoryNodes, observations] = await Promise.all([
      queryMemory({ orgId: organization.id, since, limit: 200 }),
      queryObservations({ orgId: organization.id, since, limit: 100 }),
    ]);

    // ── 3. Run intelligence engine ────────────────────────────────────────────
    const report = generateRuntimeIntelligence(
      organization.id, envelopes, memoryNodes, observations,
    );

    // ── 4. Run delegation engine (idempotent — dedup prevents duplicates) ─────
    await runDelegationEngine(organization.id, envelopes, memoryNodes, observations, report);

    // ── 5. Build and return delegation report ─────────────────────────────────
    const delegationReport = await buildDelegationReport(organization.id);

    return NextResponse.json({
      ...delegationReport,
      meta: {
        envelopesAnalyzed: envelopes.length,
        windowMins,
        generatedAt: new Date().toISOString(),
      },
    });

  } catch (err) {
    return handleError(err);
  }
}
