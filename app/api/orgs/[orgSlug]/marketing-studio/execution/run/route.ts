/**
 * app/api/orgs/[orgSlug]/marketing-studio/execution/run/route.ts
 *
 * MS-13 — Execution Runtime: Job execution endpoint
 *
 * POST /api/orgs/[orgSlug]/marketing-studio/execution/run
 *
 * Executes a specific job or a small batch of pending jobs for this org.
 *
 * Body (one of):
 *   { jobId: string }                  — run a specific job
 *   { all: true, limit?: number }      — run pending batch (max 10 per call)
 *   { destination: string, limit?: number } — run pending for a destination
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   Session required. Vault tokens are fetched server-side, never returned.
 *   All queries scoped to organizationId from server context.
 */

import { NextRequest, NextResponse }  from "next/server";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { canAccessMarketingStudio }   from "@/lib/auth/module-access";
import { runExecutionJobById, runPendingExecutionJobs } from "@/lib/marketing-studio/execution/execution-runner";

type Body = {
  jobId?:      string;
  all?:        boolean;
  destination?: string;
  limit?:      number;
};

export async function POST(
  req:     NextRequest,
  context: { params: { orgSlug: string } },
) {
  try {
    const { orgSlug }                  = context.params;
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: Body = await req.json();

    // ── Run specific job ─────────────────────────────────────────────────────
    if (body.jobId) {
      const result = await runExecutionJobById(body.jobId, organization.id);
      return NextResponse.json(result);
    }

    // ── Batch run ────────────────────────────────────────────────────────────
    const limit = Math.min(body.limit ?? 10, 10);  // cap at 10 per UI call
    const batch = await runPendingExecutionJobs({
      organizationId: organization.id,
      destination:    body.destination,
      limit,
    });
    return NextResponse.json(batch);

  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
