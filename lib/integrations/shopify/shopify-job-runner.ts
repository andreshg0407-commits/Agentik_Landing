/**
 * lib/integrations/shopify/shopify-job-runner.ts
 *
 * MS-11 — Commerce Job Execution + Retry Engine
 *
 * Manages the CommerceJob lifecycle for Shopify publication:
 *   - Mark job started (pending → running)
 *   - Execute via shopify-publisher
 *   - Mark job completed or failed
 *   - Schedule retry with exponential backoff (60s × 2^retryCount)
 *   - Enforce MAX_PUBLICATION_RETRIES cap
 *
 * ── DESIGN ────────────────────────────────────────────────────────────────────
 *   Runs synchronously within the API route handler (no background worker).
 *   The caller (API route) owns the vault token fetch — token is injected.
 *   All DB writes are scoped to organizationId.
 *   No token or secret is ever written to a DB field.
 */

import { prisma }                       from "@/lib/prisma";
import { publishProductToShopify }      from "./shopify-publisher";
import type { PublishResult }           from "./shopify-publisher";
import { MAX_PUBLICATION_RETRIES }      from "@/lib/marketing-studio/commerce/publication-state";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JobRunInput {
  jobId:         string;
  organizationId: string;
  accessToken:   string;   // ⚠ server-only — never log
  shopDomain:    string;
}

export interface JobRunResult {
  jobId:        string;
  success:      boolean;
  retryCount:   number;
  canRetry:     boolean;
  nextRetryAt:  Date | null;
  publishResult: PublishResult | null;
  errorMessage:  string | null;
}

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runSingleShopifyJob(input: JobRunInput): Promise<JobRunResult> {
  const { jobId, organizationId, accessToken, shopDomain } = input;

  // ── Load job ───────────────────────────────────────────────────────────────
  const job = await prisma.commerceJob.findFirst({
    where: { id: jobId, organizationId },
  });

  if (!job) {
    return {
      jobId, success: false, retryCount: 0, canRetry: false,
      nextRetryAt: null, publishResult: null,
      errorMessage: `Job not found: ${jobId}`,
    };
  }

  // ── Guard: only execute pending/queued jobs ────────────────────────────────
  if (job.status !== "pending" && job.status !== "queued") {
    return {
      jobId, success: false,
      retryCount: job.retryCount, canRetry: false,
      nextRetryAt: null, publishResult: null,
      errorMessage: `Job is not executable in state: ${job.status}`,
    };
  }

  if (!job.productId) {
    await markJobFailed(jobId, organizationId, "Job has no productId", job.retryCount);
    return {
      jobId, success: false,
      retryCount: job.retryCount, canRetry: false,
      nextRetryAt: null, publishResult: null,
      errorMessage: "Job has no productId",
    };
  }

  // ── Mark running ───────────────────────────────────────────────────────────
  await markJobStarted(jobId, organizationId);

  // ── Execute publisher ──────────────────────────────────────────────────────
  let publishResult: PublishResult;
  try {
    publishResult = await publishProductToShopify({
      organizationId,
      productId:   job.productId,
      connectionId: job.connectionId ?? "",
      jobId,
      accessToken,
      shopDomain,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected publisher error";
    await markJobFailed(jobId, organizationId, msg, job.retryCount);
    const canRetry    = job.retryCount < MAX_PUBLICATION_RETRIES;
    const nextRetryAt = canRetry ? computeNextRetry(job.retryCount) : null;
    return {
      jobId, success: false,
      retryCount: job.retryCount, canRetry, nextRetryAt,
      publishResult: null, errorMessage: msg,
    };
  }

  // ── Handle result ──────────────────────────────────────────────────────────
  if (publishResult.success) {
    await markJobCompleted(jobId, organizationId, publishResult);
    return {
      jobId, success: true,
      retryCount: job.retryCount, canRetry: false,
      nextRetryAt: null, publishResult, errorMessage: null,
    };
  }

  // Failed — check retry eligibility
  const newRetryCount = job.retryCount + 1;
  await markJobFailed(jobId, organizationId, publishResult.errorMessage ?? "Publication failed", job.retryCount);

  const canRetry    = newRetryCount <= MAX_PUBLICATION_RETRIES;
  const nextRetryAt = canRetry ? computeNextRetry(newRetryCount) : null;

  if (canRetry && nextRetryAt) {
    await scheduleRetry(jobId, organizationId, newRetryCount, nextRetryAt);
  }

  return {
    jobId, success: false,
    retryCount: newRetryCount, canRetry, nextRetryAt,
    publishResult, errorMessage: publishResult.errorMessage,
  };
}

// ── Job state mutators ────────────────────────────────────────────────────────

async function markJobStarted(jobId: string, organizationId: string): Promise<void> {
  await prisma.commerceJob.updateMany({
    where:  { id: jobId, organizationId },
    data:   { status: "running", startedAt: new Date() },
  });
}

async function markJobCompleted(
  jobId:         string,
  organizationId: string,
  result:        PublishResult,
): Promise<void> {
  await prisma.commerceJob.updateMany({
    where: { id: jobId, organizationId },
    data:  {
      status:      "succeeded",
      completedAt: new Date(),
      lastError:   null,
      result: {
        shopifyProductId: result.shopifyProductId,
        shopifyHandle:    result.shopifyHandle,
        adminUrl:         result.adminUrl,
        variantCount:     result.variantCount,
        imageCount:       result.imageCount,
        warnings:         result.warnings,
      },
    },
  });
}

async function markJobFailed(
  jobId:          string,
  organizationId: string,
  errorMessage:   string,
  currentRetryCount: number,
): Promise<void> {
  await prisma.commerceJob.updateMany({
    where: { id: jobId, organizationId },
    data:  {
      status:      "failed",
      completedAt: new Date(),
      lastError:   errorMessage.slice(0, 500), // truncate for safety
      retryCount:  currentRetryCount,
    },
  });
}

async function scheduleRetry(
  jobId:          string,
  organizationId: string,
  newRetryCount:  number,
  nextRetryAt:    Date,
): Promise<void> {
  await prisma.commerceJob.updateMany({
    where: { id: jobId, organizationId },
    data:  {
      status:      "pending",
      retryCount:  newRetryCount,
      scheduledAt: nextRetryAt,
      startedAt:   null,
      completedAt: null,
    },
  });
}

// ── Backoff ───────────────────────────────────────────────────────────────────

/** Exponential backoff: 60s × 2^retryCount */
function computeNextRetry(retryCount: number): Date {
  const delayMs = 60_000 * Math.pow(2, retryCount);
  return new Date(Date.now() + delayMs);
}
