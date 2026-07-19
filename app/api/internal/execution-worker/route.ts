/**
 * app/api/internal/execution-worker/route.ts
 *
 * MS-13 — Execution Runtime: Internal worker entrypoint
 *
 * POST /api/internal/execution-worker
 *
 * Cron-safe worker endpoint:
 *   - Protected by INTERNAL_CRON_SECRET
 *   - Processes a bounded batch of pending execution jobs
 *   - Optionally scoped to a specific org or destination
 *   - Returns a summary (no raw job data)
 *
 * Prepare for Vercel Cron:
 *   vercel.json: { "path": "/api/internal/execution-worker", "schedule": "* /5 * * * *" }
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   INTERNAL_CRON_SECRET required in x-cron-secret header or ?secret= query.
 *   Access tokens fetched from vault server-side — NEVER in response.
 *   All DB writes scoped to organizationId.
 */

import { NextResponse }             from "next/server";
import { runPendingExecutionJobs }  from "@/lib/marketing-studio/execution/execution-runner";
import { recordAllDestinationHealth } from "@/lib/marketing-studio/execution/execution-health";
import { prisma }                   from "@/lib/prisma";

export const runtime = "nodejs";

const CRON_SECRET   = process.env.INTERNAL_CRON_SECRET;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT     = 50;

type WorkerBody = {
  limit?:         number;
  orgId?:         string;
  destination?:   string;
  refreshHealth?: boolean;
};

async function runWorker(body: WorkerBody) {
  const limit = Math.min(body.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  // If a specific org is provided, run for that org only
  if (body.orgId) {
    const batchResult = await runPendingExecutionJobs({
      organizationId: body.orgId,
      destination:    body.destination,
      limit,
    });

    if (body.refreshHealth) {
      await recordAllDestinationHealth(body.orgId);
    }

    return { orgs: 1, ...batchResult };
  }

  // Multi-tenant: process all active orgs (bounded)
  const orgs = await prisma.organization.findMany({
    where:  { status: "ACTIVE" },
    select: { id: true },
    take:   20,     // cap org scan per run
  });

  let totalProcessed = 0;
  let totalSucceeded = 0;
  let totalFailed    = 0;
  let totalSkipped   = 0;
  const allErrors: Array<{ jobId: string; error: string }> = [];

  for (const org of orgs) {
    // Per-org batch limit to avoid starvation
    const perOrgLimit = Math.max(1, Math.floor(limit / orgs.length));
    const result = await runPendingExecutionJobs({
      organizationId: org.id,
      destination:    body.destination,
      limit:          perOrgLimit,
    });

    totalProcessed += result.processed;
    totalSucceeded += result.succeeded;
    totalFailed    += result.failed;
    totalSkipped   += result.skipped;
    allErrors.push(...result.errors);
  }

  return {
    orgs:      orgs.length,
    processed: totalProcessed,
    succeeded: totalSucceeded,
    failed:    totalFailed,
    skipped:   totalSkipped,
    errors:    allErrors.slice(0, 20),   // truncate for response safety
  };
}

export async function POST(req: Request) {
  // ── Auth guard ───────────────────────────────────────────────────────────
  const authHeader  = req.headers.get("x-cron-secret");
  const url         = new URL(req.url);
  const querySecret = url.searchParams.get("secret");

  if (CRON_SECRET && authHeader !== CRON_SECRET && querySecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: WorkerBody = {};
  try {
    body = await req.json();
  } catch { /* empty body is fine */ }

  try {
    const startMs = Date.now();
    const result  = await runWorker(body);
    const elapsed = Date.now() - startMs;

    console.info("[execution-worker]", JSON.stringify({ ...result, elapsedMs: elapsed }));

    return NextResponse.json({
      ok:      true,
      elapsed: `${elapsed}ms`,
      ...result,
    });
  } catch (err) {
    console.error("[execution-worker]", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

// Vercel Cron uses GET
export { POST as GET };
