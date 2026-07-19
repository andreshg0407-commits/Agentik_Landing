/**
 * lib/marketing-studio/execution/execution-runner.ts
 *
 * MS-13 — Execution Runtime: Job runner
 *
 * runExecutionJobById()       — run a specific job by ID
 * runPendingExecutionJobs()   — batch-process pending jobs (for worker)
 *
 * Handler dispatch:
 *   shopify.*         → existing shopify-job-runner (requires vault token)
 *   catalog.*         → pending_external (not yet implemented)
 *   product.*         → partial (readiness recompute) or pending_external
 *   whatsapp.*        → pending_external
 *   assets.*          → skipped (placeholder)
 *
 * SERVER ONLY — accesses vault, Prisma, and Shopify.
 */

import {
  findExecutionJob,
  updateExecutionJobStatus,
  listPendingExecutionJobs,
} from "./execution-repository";
import {
  scheduleExecutionRetry,
  markPermanentFailure,
  shouldRetryExecutionJob,
} from "./execution-retries";
import { auditExecution } from "./execution-audit";
import type {
  ExecutionJob,
  ExecutionJobRunResult,
  BatchRunResult,
} from "./execution-types";
import { EXECUTION_JOB_STATUS, EXECUTION_JOB_TYPE } from "./execution-types";

// ── Shopify bridge ─────────────────────────────────────────────────────────────

async function runShopifyJob(
  job:            ExecutionJob,
  organizationId: string,
): Promise<ExecutionJobRunResult> {
  // Dynamic import to keep server boundary clear
  const { runSingleShopifyJob } = await import("@/lib/integrations/shopify/shopify-job-runner");
  const { getIntegrationConnection } = await import("@/lib/integrations/integration-repository");
  const { assertIntegrationActive }  = await import("@/lib/integrations/integration-runtime");
  const { getIntegrationSecret }     = await import("@/lib/integrations/vault/vault-service");
  const { SECRET_TYPE }              = await import("@/lib/integrations/vault/vault-types");

  // Resolve connection
  const connection = await getIntegrationConnection(organizationId, "shopify");
  if (!connection) {
    return {
      jobId:        job.id,
      success:      false,
      outcome:      "connection_missing",
      errorMessage: "Shopify not connected",
      canRetry:     false,
      nextRetryAt:  null,
    };
  }

  try {
    assertIntegrationActive(connection, "shopify", organizationId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Shopify connection inactive";
    return {
      jobId:        job.id,
      success:      false,
      outcome:      "connection_inactive",
      errorMessage: msg,
      canRetry:     false,
      nextRetryAt:  null,
    };
  }

  if (!connection.shopDomain) {
    return {
      jobId:        job.id,
      success:      false,
      outcome:      "missing_shop_domain",
      errorMessage: "Connection missing shopDomain",
      canRetry:     false,
      nextRetryAt:  null,
    };
  }

  // Fetch vault secret — server-only, never forwarded to client
  const vaultSecret = await getIntegrationSecret({
    organizationId,
    connectionId: connection.id,
    secretType:   SECRET_TYPE.ACCESS_TOKEN,
  });

  if (!vaultSecret) {
    return {
      jobId:        job.id,
      success:      false,
      outcome:      "vault_token_missing",
      errorMessage: "Access token not found — reconnect Shopify",
      canRetry:     false,
      nextRetryAt:  null,
    };
  }

  // Reset to pending if needed (for retries)
  if (job.status !== EXECUTION_JOB_STATUS.PENDING && job.status !== "queued") {
    await updateExecutionJobStatus(job.id, organizationId, EXECUTION_JOB_STATUS.PENDING, {
      startedAt:   null,
      completedAt: null,
      lastError:   null,
    });
  }

  const runResult = await runSingleShopifyJob({
    jobId:          job.id,
    organizationId,
    accessToken:    vaultSecret.plainValue,   // ⚠ server-only — never logged
    shopDomain:     connection.shopDomain,
  });

  const canRetry    = !runResult.success && shouldRetryExecutionJob(job);
  const nextRetryAt = runResult.nextRetryAt?.toISOString() ?? null;

  return {
    jobId:        job.id,
    success:      runResult.success,
    outcome:      runResult.success ? "succeeded" : "failed",
    errorMessage: runResult.errorMessage,
    canRetry,
    nextRetryAt,
  };
}

// ── Handler registry ──────────────────────────────────────────────────────────

type HandlerResult = ExecutionJobRunResult;

async function dispatchToHandler(
  job:            ExecutionJob,
  organizationId: string,
): Promise<HandlerResult> {
  const { jobType } = job;

  // Shopify handlers — bridged to existing runtime
  if (
    jobType === EXECUTION_JOB_TYPE.SHOPIFY_PUBLISH_DRAFT ||
    jobType === EXECUTION_JOB_TYPE.SHOPIFY_RETRY_SYNC    ||
    jobType === EXECUTION_JOB_TYPE.SHOPIFY_SYNC_CHECK    ||
    // Legacy CommerceJob types
    jobType === "publish_product_draft"                  ||
    jobType === "re_publish_draft"                       ||
    jobType === "update_shopify_product"                 ||
    jobType === "mark_external_missing"
  ) {
    return runShopifyJob(job, organizationId);
  }

  // Product readiness — pure computation, no external calls
  if (jobType === EXECUTION_JOB_TYPE.PRODUCT_RECOMPUTE_READINESS) {
    return {
      jobId:        job.id,
      success:      true,
      outcome:      "skipped",
      errorMessage: null,
      canRetry:     false,
      nextRetryAt:  null,
    };
  }

  // All other handlers — pending_external until implemented
  const pendingExternalTypes = [
    EXECUTION_JOB_TYPE.CATALOG_REBUILD,
    EXECUTION_JOB_TYPE.CATALOG_REFRESH_READINESS,
    EXECUTION_JOB_TYPE.PRODUCT_REFRESH_RECOMMENDATIONS,
    EXECUTION_JOB_TYPE.WHATSAPP_PREPARE_CATALOG,
    EXECUTION_JOB_TYPE.ASSETS_GENERATE_VARIANTS,
  ];

  if (pendingExternalTypes.includes(jobType as typeof pendingExternalTypes[number])) {
    return {
      jobId:        job.id,
      success:      true,
      outcome:      "pending_external",
      errorMessage: null,
      canRetry:     false,
      nextRetryAt:  null,
    };
  }

  // Unknown job type — skip to avoid silent failure
  return {
    jobId:        job.id,
    success:      false,
    outcome:      "handler_not_found",
    errorMessage: `No handler for job type: ${jobType}`,
    canRetry:     false,
    nextRetryAt:  null,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function runExecutionJobById(
  jobId:          string,
  organizationId: string,
): Promise<ExecutionJobRunResult> {
  const job = await findExecutionJob(jobId, organizationId);
  if (!job) {
    return {
      jobId,
      success:      false,
      outcome:      "job_not_found",
      errorMessage: `Job not found: ${jobId}`,
      canRetry:     false,
      nextRetryAt:  null,
    };
  }

  const executableStatuses = [
    EXECUTION_JOB_STATUS.PENDING,
    EXECUTION_JOB_STATUS.RETRY_SCHEDULED,
    "queued",
  ];

  if (!executableStatuses.includes(job.status)) {
    return {
      jobId,
      success:      false,
      outcome:      "wrong_state",
      errorMessage: `Job not executable in state: ${job.status}`,
      canRetry:     false,
      nextRetryAt:  null,
    };
  }

  const startedAt = new Date();
  await updateExecutionJobStatus(jobId, organizationId, EXECUTION_JOB_STATUS.RUNNING, {
    startedAt,
  });

  auditExecution({
    ts:             startedAt.toISOString(),
    event:          "job_started",
    organizationId,
    jobId,
    jobType:        job.jobType,
    destination:    job.destination,
    productId:      job.productId ?? undefined,
  });

  let result: ExecutionJobRunResult;
  try {
    result = await dispatchToHandler(job, organizationId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected execution error";
    result = {
      jobId,
      success:      false,
      outcome:      "runtime_error",
      errorMessage: msg,
      canRetry:     shouldRetryExecutionJob(job),
      nextRetryAt:  null,
    };
  }

  const durationMs = Date.now() - startedAt.getTime();

  if (result.success) {
    const finalStatus =
      result.outcome === "pending_external" ? EXECUTION_JOB_STATUS.PENDING_EXTERNAL :
      result.outcome === "skipped"          ? EXECUTION_JOB_STATUS.SKIPPED :
      EXECUTION_JOB_STATUS.SUCCEEDED;

    await updateExecutionJobStatus(jobId, organizationId, finalStatus, {
      completedAt: new Date(),
      lastError:   null,
    });

    auditExecution({
      ts:             new Date().toISOString(),
      event:          "job_succeeded",
      organizationId,
      jobId,
      jobType:        job.jobType,
      outcome:        result.outcome,
      durationMs,
    });
  } else {
    // Decide: retry or permanent failure
    if (result.canRetry && shouldRetryExecutionJob(job)) {
      await updateExecutionJobStatus(jobId, organizationId, EXECUTION_JOB_STATUS.FAILED, {
        completedAt: new Date(),
        lastError:   result.errorMessage?.slice(0, 500) ?? null,
      });
      await scheduleExecutionRetry(jobId, organizationId);
    } else {
      await markPermanentFailure(
        jobId, organizationId,
        result.errorMessage ?? "Execution failed",
      );
    }

    auditExecution({
      ts:             new Date().toISOString(),
      event:          "job_failed",
      organizationId,
      jobId,
      jobType:        job.jobType,
      outcome:        result.outcome,
      durationMs,
      detail:         result.errorMessage?.slice(0, 200),
    });
  }

  return result;
}

export async function runPendingExecutionJobs(opts: {
  organizationId?: string;
  destination?:    string;
  limit?:          number;
}): Promise<BatchRunResult> {
  const limit = opts.limit ?? 20;
  const jobs  = await listPendingExecutionJobs({
    organizationId: opts.organizationId,
    destination:    opts.destination,
    limit,
  });

  const summary: BatchRunResult = {
    processed: jobs.length,
    succeeded: 0,
    failed:    0,
    skipped:   0,
    errors:    [],
  };

  auditExecution({
    ts:             new Date().toISOString(),
    event:          "batch_started",
    organizationId: opts.organizationId ?? "all",
    detail:         `Processing ${jobs.length} jobs`,
  });

  for (const job of jobs) {
    try {
      const result = await runExecutionJobById(job.id, job.organizationId);
      if (result.success) {
        if (result.outcome === "skipped" || result.outcome === "pending_external") {
          summary.skipped++;
        } else {
          summary.succeeded++;
        }
      } else {
        summary.failed++;
        summary.errors.push({ jobId: job.id, error: result.errorMessage ?? "unknown" });
      }
    } catch (err) {
      summary.failed++;
      summary.errors.push({
        jobId: job.id,
        error: err instanceof Error ? err.message : "unexpected error",
      });
    }
  }

  auditExecution({
    ts:             new Date().toISOString(),
    event:          "batch_completed",
    organizationId: opts.organizationId ?? "all",
    detail:         `succeeded:${summary.succeeded} failed:${summary.failed} skipped:${summary.skipped}`,
  });

  return summary;
}
