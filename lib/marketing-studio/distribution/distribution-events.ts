/**
 * lib/marketing-studio/distribution/distribution-events.ts
 *
 * MS-14 — Distribution Runtime: Event reaction engine
 *
 * handleDistributionEvent() — reacts to platform events with distribution
 * side effects (variant readiness, pipeline auto-advance, schedule triggers).
 *
 * SERVER ONLY.
 */

import { upsertDistributionVariant, markVariantReady } from "./distribution-repository";
import { completePipelineStage, failPipelineStage }    from "./distribution-pipelines";
import { dispatchExecutionJob }    from "@/lib/marketing-studio/execution/execution-dispatcher";
import { EXECUTION_JOB_TYPE, EXECUTION_DESTINATION, buildIdempotencyKey } from "@/lib/marketing-studio/execution/execution-types";

// ── Event types ────────────────────────────────────────────────────────────────

export const DISTRIBUTION_EVENT = {
  ASSET_APPROVED:          "asset.approved",
  VARIANT_READY:           "variant.ready",
  PIPELINE_STAGE_COMPLETE: "pipeline.stage_complete",
  PIPELINE_STAGE_FAILED:   "pipeline.stage_failed",
  PRODUCT_PUBLISHED:       "product.published",
  PRODUCT_UPDATED:         "product.updated",
  DROP_TRIGGERED:          "drop.triggered",
} as const;

export type DistributionEventType = typeof DISTRIBUTION_EVENT[keyof typeof DISTRIBUTION_EVENT];

export interface DistributionEventPayload {
  organizationId: string;
  eventType:      DistributionEventType;

  // asset.approved / variant.ready
  assetId?:       string;
  productId?:     string;
  channel?:       string;
  purpose?:       string;
  sourceUrl?:     string;

  // pipeline.stage_*
  pipelineId?:    string;
  stageKey?:      string;
  errorMessage?:  string;

  // drop.triggered
  scheduleId?:    string;
}

// ── Event handler ──────────────────────────────────────────────────────────────

export async function handleDistributionEvent(
  payload: DistributionEventPayload,
): Promise<void> {
  const { organizationId, eventType } = payload;

  switch (eventType) {
    case DISTRIBUTION_EVENT.ASSET_APPROVED: {
      // When a new asset is approved, register it as a distribution variant
      if (payload.productId && payload.channel && payload.purpose) {
        await upsertDistributionVariant({
          organizationId,
          productId:      payload.productId,
          assetId:        payload.assetId ?? null,
          purpose:        payload.purpose,
          channel:        payload.channel,
          isReady:        false,
          sourceAssetUrl: payload.sourceUrl ?? null,
        });
      }
      break;
    }

    case DISTRIBUTION_EVENT.VARIANT_READY: {
      // Mark variant as ready and trigger channel readiness refresh
      if (payload.assetId) {
        // Find variant by assetId and mark ready — simplified as upsert
        if (payload.productId && payload.channel && payload.purpose) {
          await upsertDistributionVariant({
            organizationId,
            productId: payload.productId,
            assetId:   payload.assetId,
            purpose:   payload.purpose,
            channel:   payload.channel,
            isReady:   true,
          });
        }
      }

      // Dispatch catalog refresh job to update readiness scores
      await dispatchExecutionJob({
        organizationId,
        jobType:        EXECUTION_JOB_TYPE.CATALOG_REFRESH_READINESS,
        destination:    EXECUTION_DESTINATION.INTERNAL,
        idempotencyKey: buildIdempotencyKey(
          EXECUTION_JOB_TYPE.CATALOG_REFRESH_READINESS,
          organizationId,
          `variant_ready:${payload.assetId ?? ""}`,
        ),
        priority:   4,
        maxRetries: 1,
      });
      break;
    }

    case DISTRIBUTION_EVENT.PIPELINE_STAGE_COMPLETE: {
      if (payload.pipelineId && payload.stageKey) {
        await completePipelineStage(
          payload.pipelineId,
          organizationId,
          payload.stageKey,
        );
      }
      break;
    }

    case DISTRIBUTION_EVENT.PIPELINE_STAGE_FAILED: {
      if (payload.pipelineId && payload.stageKey) {
        await failPipelineStage(
          payload.pipelineId,
          organizationId,
          payload.stageKey,
          payload.errorMessage ?? "Stage failed",
        );
      }
      break;
    }

    case DISTRIBUTION_EVENT.PRODUCT_PUBLISHED: {
      // When a product is published to Shopify, dispatch a readiness refresh
      await dispatchExecutionJob({
        organizationId,
        jobType:        EXECUTION_JOB_TYPE.PRODUCT_RECOMPUTE_READINESS,
        destination:    EXECUTION_DESTINATION.INTERNAL,
        productId:      payload.productId ?? null,
        idempotencyKey: buildIdempotencyKey(
          EXECUTION_JOB_TYPE.PRODUCT_RECOMPUTE_READINESS,
          organizationId,
          payload.productId ?? "global",
        ),
        priority:   3,
        maxRetries: 1,
      });
      break;
    }

    case DISTRIBUTION_EVENT.PRODUCT_UPDATED: {
      // Trigger readiness refresh for the updated product
      if (payload.productId) {
        await dispatchExecutionJob({
          organizationId,
          jobType:        EXECUTION_JOB_TYPE.PRODUCT_RECOMPUTE_READINESS,
          destination:    EXECUTION_DESTINATION.INTERNAL,
          productId:      payload.productId,
          idempotencyKey: buildIdempotencyKey(
            EXECUTION_JOB_TYPE.PRODUCT_RECOMPUTE_READINESS,
            organizationId,
            payload.productId,
          ),
          priority:   3,
          maxRetries: 1,
        });
      }
      break;
    }

    case DISTRIBUTION_EVENT.DROP_TRIGGERED: {
      // Manually triggered drop — dispatch catalog rebuild + channel jobs
      await dispatchExecutionJob({
        organizationId,
        jobType:        EXECUTION_JOB_TYPE.CATALOG_REBUILD,
        destination:    EXECUTION_DESTINATION.INTERNAL,
        idempotencyKey: buildIdempotencyKey(
          EXECUTION_JOB_TYPE.CATALOG_REBUILD,
          organizationId,
          payload.scheduleId ?? "manual",
        ),
        priority:   7,
        maxRetries: 2,
      });
      break;
    }

    default:
      break;
  }
}
