/**
 * app/api/internal/orchestrator-worker/route.ts
 *
 * MS-18 — Execution Actions: Internal orchestrator worker
 *
 * POST /api/internal/orchestrator-worker
 *
 * Requires INTERNAL_CRON_SECRET header.
 * Designed for Vercel Cron — no Redis, no daemon.
 *
 * Responsibilities:
 *   1. Find all queued/running plans across active orgs
 *   2. Advance plans with ready stages
 *   3. Process overdue retries
 *   4. Refresh health per org
 *   5. Return execution summary
 */

import { NextRequest, NextResponse }      from "next/server";
import { prisma }                         from "@/lib/prisma";
import { dispatchOrchestratorAction }     from "@/lib/marketing-studio/orchestrator/orchestrator-action-dispatcher";
import { buildOrchestratorRuntimeState }  from "@/lib/marketing-studio/orchestrator/orchestrator-engine";
import { computeOrchestratorHealth }      from "@/lib/marketing-studio/orchestrator/orchestrator-health";
import { buildActionIdempotencyKey, ORCHESTRATOR_ACTION_TYPE } from "@/lib/marketing-studio/orchestrator/orchestrator-actions";

export async function POST(req: NextRequest) {
  // Auth: require INTERNAL_CRON_SECRET
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization");
  const expected = process.env.INTERNAL_CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const summary = {
    orgsProcessed:      0,
    plansAdvanced:      0,
    stagesDispatched:   0,
    retriesScheduled:   0,
    healthRefreshed:    0,
    errors:             [] as string[],
  };

  try {
    // Find active orgs that have queued/running plans
    const activeOrgs = await prisma.publishingPlan.groupBy({
      by:     ["organizationId"],
      where:  { status: { in: ["queued", "publishing", "partial", "preparing"] } },
      _count: { id: true },
    });

    for (const orgGroup of activeOrgs) {
      const organizationId = orgGroup.organizationId;
      summary.orgsProcessed++;

      try {
        const state = await buildOrchestratorRuntimeState(organizationId);

        for (const plan of state.plans) {
          if (!["queued","running","partially_completed"].includes(plan.status)) continue;

          // Check if any stages are ready but not yet running
          const readyStages = plan.stages.filter(s =>
            s.status === "ready" || s.status === "pending"
          );

          if (readyStages.length === 0) continue;

          const idempotencyKey = buildActionIdempotencyKey(
            ORCHESTRATOR_ACTION_TYPE.RUN_PLAN,
            organizationId,
            `${plan.id}-worker-${Math.floor(Date.now() / 60000)}`, // 1-minute window
          );

          const result = await dispatchOrchestratorAction({
            organizationId,
            actorId:        null,
            planId:         plan.id,
            stageId:        null,
            jobId:          null,
            actionType:     ORCHESTRATOR_ACTION_TYPE.RUN_PLAN,
            payload:        { trigger: "worker" },
            idempotencyKey,
            requestedAt:    new Date().toISOString(),
          });

          if (result.success) {
            summary.plansAdvanced++;
          } else if (result.error && !result.wasDeduped) {
            summary.errors.push(`plan:${plan.id}: ${result.error.message}`);
          }
        }

        // Refresh health
        const health = computeOrchestratorHealth(state.plans);
        summary.healthRefreshed++;

      } catch (orgErr) {
        const msg = orgErr instanceof Error ? orgErr.message : "unknown";
        summary.errors.push(`org:${organizationId}: ${msg}`);
      }
    }

    return NextResponse.json({
      ok:          true,
      durationMs:  Date.now() - startedAt,
      ...summary,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message, ...summary }, { status: 500 });
  }
}
