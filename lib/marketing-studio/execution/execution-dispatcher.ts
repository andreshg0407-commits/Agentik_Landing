/**
 * lib/marketing-studio/execution/execution-dispatcher.ts
 *
 * MS-13 — Execution Runtime: Job Dispatcher
 *
 * dispatchExecutionJob() — creates a persistent ExecutionJob with idempotency.
 *
 * Responsibilities:
 *   - Validate organizationId scope
 *   - Check idempotencyKey for existing pending/running job
 *   - Create CommerceJob record via execution-repository
 *   - Return safe DTO (no tokens, no secrets)
 *
 * Does NOT execute the job. Callers must invoke execution-runner separately.
 *
 * SERVER ONLY.
 */

import {
  findByIdempotencyKey,
  createExecutionJobRecord,
} from "./execution-repository";
import type { DispatchJobInput, DispatchJobResult } from "./execution-types";
import { EXECUTION_JOB_STATUS } from "./execution-types";
import { auditExecution } from "./execution-audit";

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function dispatchExecutionJob(
  input: DispatchJobInput,
): Promise<DispatchJobResult> {
  const {
    organizationId,
    jobType,
    destination,
    productId    = null,
    catalogId    = null,
    payload      = {},
    priority     = 5,
    maxRetries   = 3,
  } = input;

  // ── Idempotency check ────────────────────────────────────────────────────
  if (input.idempotencyKey) {
    const existing = await findByIdempotencyKey(input.idempotencyKey, organizationId);
    if (existing) {
      // Return existing job if still active (not permanently failed/cancelled)
      const activeStatuses: string[] = [
        EXECUTION_JOB_STATUS.PENDING,
        EXECUTION_JOB_STATUS.RUNNING,
        EXECUTION_JOB_STATUS.RETRY_SCHEDULED,
        EXECUTION_JOB_STATUS.SUCCEEDED,
      ];
      const isActive = activeStatuses.includes(existing.status);

      if (isActive) {
        auditExecution({
          ts:             new Date().toISOString(),
          event:          "job_deduped",
          organizationId,
          jobId:          existing.id,
          jobType,
          destination,
          productId:      productId ?? undefined,
          detail:         `Deduped via idempotencyKey: ${input.idempotencyKey}`,
        });
        return { job: existing, wasDeduped: true };
      }
    }
  }

  // ── Create job record ────────────────────────────────────────────────────
  const job = await createExecutionJobRecord({
    organizationId,
    jobType,
    destination,
    productId,
    catalogId,
    idempotencyKey: input.idempotencyKey,
    priority,
    maxRetries,
    payload: {
      ...payload,
      _dispatchedAt: new Date().toISOString(),
      _jobType:      jobType,
    },
  });

  auditExecution({
    ts:             new Date().toISOString(),
    event:          "job_created",
    organizationId,
    jobId:          job.id,
    jobType,
    destination,
    productId:      productId ?? undefined,
  });

  return { job, wasDeduped: false };
}
