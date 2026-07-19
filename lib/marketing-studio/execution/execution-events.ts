/**
 * lib/marketing-studio/execution/execution-events.ts
 *
 * MS-13 — Execution Runtime: Automatic reaction engine
 *
 * handleOperationalEvent() — receives a domain event and dispatches
 * the appropriate ExecutionJobs automatically.
 *
 * SERVER ONLY.
 */

import { dispatchExecutionJob } from "./execution-dispatcher";
import { scheduleExecutionRetry } from "./execution-retries";
import { recordDestinationHealthSnapshot } from "./execution-health";
import { updateExecutionJobStatus } from "./execution-repository";
import { auditExecution } from "./execution-audit";
import {
  OPERATIONAL_EVENT,
  EXECUTION_JOB_TYPE,
  EXECUTION_DESTINATION,
  EXECUTION_JOB_STATUS,
  buildIdempotencyKey,
} from "./execution-types";
import type { OperationalEventType } from "./execution-types";

// ── Reaction engine ───────────────────────────────────────────────────────────

export async function handleOperationalEvent(
  organizationId: string,
  eventType:       OperationalEventType | string,
  payload:         Record<string, unknown>,
): Promise<void> {
  auditExecution({
    ts:             new Date().toISOString(),
    event:          "event_received",
    organizationId,
    jobType:        eventType,
    detail:         `productId:${payload.productId ?? "-"} catalogId:${payload.catalogId ?? "-"}`,
  });

  const productId = typeof payload.productId === "string" ? payload.productId : null;
  const catalogId = typeof payload.catalogId === "string" ? payload.catalogId : null;
  const jobId     = typeof payload.jobId     === "string" ? payload.jobId     : null;
  const ts        = new Date().toISOString().replace(/[:.]/g, "-");

  switch (eventType) {

    // ── product.approved → recompute readiness → check publish eligibility ─
    case OPERATIONAL_EVENT.PRODUCT_APPROVED: {
      if (!productId) break;

      await dispatchExecutionJob({
        organizationId,
        jobType:        EXECUTION_JOB_TYPE.PRODUCT_RECOMPUTE_READINESS,
        destination:    EXECUTION_DESTINATION.INTERNAL,
        productId,
        priority:       2,
        idempotencyKey: buildIdempotencyKey(
          EXECUTION_JOB_TYPE.PRODUCT_RECOMPUTE_READINESS, organizationId, productId,
        ) + `:${ts}`,
      });

      await dispatchExecutionJob({
        organizationId,
        jobType:        EXECUTION_JOB_TYPE.CATALOG_REFRESH_READINESS,
        destination:    EXECUTION_DESTINATION.CATALOG,
        productId,
        priority:       3,
        idempotencyKey: buildIdempotencyKey(
          EXECUTION_JOB_TYPE.CATALOG_REFRESH_READINESS, organizationId, productId,
        ) + `:${ts}`,
      });

      // Attempt Shopify publish — idempotency prevents duplicate if already pending
      await dispatchExecutionJob({
        organizationId,
        jobType:        EXECUTION_JOB_TYPE.SHOPIFY_PUBLISH_DRAFT,
        destination:    EXECUTION_DESTINATION.SHOPIFY,
        productId,
        priority:       3,
        payload:        { trigger: "product.approved", productId },
        idempotencyKey: buildIdempotencyKey(
          EXECUTION_JOB_TYPE.SHOPIFY_PUBLISH_DRAFT, organizationId, productId,
        ),
      });

      await dispatchExecutionJob({
        organizationId,
        jobType:        EXECUTION_JOB_TYPE.WHATSAPP_PREPARE_CATALOG,
        destination:    EXECUTION_DESTINATION.WHATSAPP,
        productId,
        priority:       5,
        idempotencyKey: buildIdempotencyKey(
          EXECUTION_JOB_TYPE.WHATSAPP_PREPARE_CATALOG, organizationId, productId,
        ),
      });
      break;
    }

    // ── product.updated → sync check + readiness recompute ─────────────────
    case OPERATIONAL_EVENT.PRODUCT_UPDATED: {
      if (!productId) break;

      await dispatchExecutionJob({
        organizationId,
        jobType:        EXECUTION_JOB_TYPE.SHOPIFY_SYNC_CHECK,
        destination:    EXECUTION_DESTINATION.SHOPIFY,
        productId,
        priority:       3,
        idempotencyKey: buildIdempotencyKey(
          EXECUTION_JOB_TYPE.SHOPIFY_SYNC_CHECK, organizationId, productId,
        ) + `:${ts}`,
      });

      await dispatchExecutionJob({
        organizationId,
        jobType:        EXECUTION_JOB_TYPE.PRODUCT_RECOMPUTE_READINESS,
        destination:    EXECUTION_DESTINATION.INTERNAL,
        productId,
        priority:       4,
        idempotencyKey: buildIdempotencyKey(
          EXECUTION_JOB_TYPE.PRODUCT_RECOMPUTE_READINESS, organizationId, productId,
        ) + `:${ts}`,
      });
      break;
    }

    // ── asset.approved → refresh recommendations + catalog rebuild ──────────
    case OPERATIONAL_EVENT.ASSET_APPROVED: {
      if (!productId) break;

      await dispatchExecutionJob({
        organizationId,
        jobType:        EXECUTION_JOB_TYPE.PRODUCT_REFRESH_RECOMMENDATIONS,
        destination:    EXECUTION_DESTINATION.INTERNAL,
        productId,
        priority:       4,
        idempotencyKey: buildIdempotencyKey(
          EXECUTION_JOB_TYPE.PRODUCT_REFRESH_RECOMMENDATIONS, organizationId, productId,
        ) + `:${ts}`,
      });

      await dispatchExecutionJob({
        organizationId,
        jobType:        EXECUTION_JOB_TYPE.CATALOG_REBUILD,
        destination:    EXECUTION_DESTINATION.CATALOG,
        productId,
        priority:       5,
        idempotencyKey: buildIdempotencyKey(
          EXECUTION_JOB_TYPE.CATALOG_REBUILD, organizationId, productId,
        ) + `:${ts}`,
      });
      break;
    }

    // ── catalog.updated → rebuild ───────────────────────────────────────────
    case OPERATIONAL_EVENT.CATALOG_UPDATED: {
      await dispatchExecutionJob({
        organizationId,
        jobType:        EXECUTION_JOB_TYPE.CATALOG_REBUILD,
        destination:    EXECUTION_DESTINATION.CATALOG,
        catalogId:      catalogId ?? undefined,
        priority:       4,
        idempotencyKey: buildIdempotencyKey(
          EXECUTION_JOB_TYPE.CATALOG_REBUILD, organizationId, catalogId ?? "all",
        ) + `:${ts}`,
      });
      break;
    }

    // ── shopify.publish_failed → retry + degrade health ─────────────────────
    case OPERATIONAL_EVENT.SHOPIFY_PUBLISH_FAILED: {
      if (jobId) {
        const retryResult = await scheduleExecutionRetry(jobId, organizationId);
        if (!retryResult.scheduled) {
          // Retries exhausted — update job to failed state
          await updateExecutionJobStatus(jobId, organizationId, EXECUTION_JOB_STATUS.FAILED, {
            lastError:   payload.errorMessage as string | undefined ?? "publish_failed",
            completedAt: new Date(),
          });
        }
      }
      // Degrade Shopify health snapshot
      await recordDestinationHealthSnapshot(organizationId, EXECUTION_DESTINATION.SHOPIFY);
      break;
    }

    // ── shopify.sync_drift_detected → schedule sync check ───────────────────
    case OPERATIONAL_EVENT.SHOPIFY_SYNC_DRIFT: {
      if (!productId) break;
      await dispatchExecutionJob({
        organizationId,
        jobType:        EXECUTION_JOB_TYPE.SHOPIFY_SYNC_CHECK,
        destination:    EXECUTION_DESTINATION.SHOPIFY,
        productId,
        priority:       2,
        payload:        { trigger: "sync_drift", productId },
        idempotencyKey: buildIdempotencyKey(
          EXECUTION_JOB_TYPE.SHOPIFY_SYNC_CHECK, organizationId, productId,
        ) + `:${ts}`,
      });
      break;
    }

    // ── readiness.changed → catalog refresh ────────────────────────────────
    case OPERATIONAL_EVENT.READINESS_CHANGED: {
      if (!productId) break;
      await dispatchExecutionJob({
        organizationId,
        jobType:        EXECUTION_JOB_TYPE.CATALOG_REFRESH_READINESS,
        destination:    EXECUTION_DESTINATION.CATALOG,
        productId,
        priority:       4,
        idempotencyKey: buildIdempotencyKey(
          EXECUTION_JOB_TYPE.CATALOG_REFRESH_READINESS, organizationId, productId,
        ) + `:${ts}`,
      });
      break;
    }

    default:
      break;
  }

  auditExecution({
    ts:             new Date().toISOString(),
    event:          "event_dispatched",
    organizationId,
    jobType:        eventType,
  });
}
