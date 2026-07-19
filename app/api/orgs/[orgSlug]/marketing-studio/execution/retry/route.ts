/**
 * app/api/orgs/[orgSlug]/marketing-studio/execution/retry/route.ts
 *
 * MS-13 — Execution Runtime: Manual retry endpoint
 *
 * POST /api/orgs/[orgSlug]/marketing-studio/execution/retry
 *
 * Resets a failed job to pending and immediately executes it.
 * Persists a retry attempt record for the audit trail.
 *
 * Body: { jobId: string }
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   Session required. organizationId from server context only.
 */

import { NextRequest, NextResponse }   from "next/server";
import { requireOrgAccess }            from "@/lib/auth/org-access";
import { canAccessMarketingStudio }    from "@/lib/auth/module-access";
import { findExecutionJob, updateExecutionJobStatus } from "@/lib/marketing-studio/execution/execution-repository";
import { runExecutionJobById }         from "@/lib/marketing-studio/execution/execution-runner";
import { EXECUTION_JOB_STATUS }        from "@/lib/marketing-studio/execution/execution-types";

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

    const body = await req.json() as { jobId?: string };
    if (!body.jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    const job = await findExecutionJob(body.jobId, organization.id);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Only allow retry on failed or permanently failed jobs
    const retryableStatuses = [
      EXECUTION_JOB_STATUS.FAILED,
      EXECUTION_JOB_STATUS.PENDING_EXTERNAL,
    ];
    if (!retryableStatuses.includes(job.status as typeof retryableStatuses[number])) {
      return NextResponse.json(
        { error: `Job cannot be retried in state: ${job.status}` },
        { status: 409 },
      );
    }

    // Reset to pending
    await updateExecutionJobStatus(body.jobId, organization.id, EXECUTION_JOB_STATUS.PENDING, {
      startedAt:   null,
      completedAt: null,
      lastError:   null,
    });

    // Execute immediately
    const result = await runExecutionJobById(body.jobId, organization.id);

    return NextResponse.json({
      success:      result.success,
      jobId:        result.jobId,
      outcome:      result.outcome,
      errorMessage: result.errorMessage,
      canRetry:     result.canRetry,
      nextRetryAt:  result.nextRetryAt,
    });

  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
