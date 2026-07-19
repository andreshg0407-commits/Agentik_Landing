/**
 * lib/marketing-studio/publishing/publishing-events.ts
 *
 * MS-17 — Unified Publishing OS: Event system
 *
 * handlePublishingEvent() — reacts to publishing lifecycle events:
 *   - Execution Runtime jobs
 *   - Distribution Runtime updates
 *   - Campaign Runtime updates
 *   - Social Runtime updates
 *
 * SERVER ONLY.
 */

import { dispatchExecutionJob }   from "@/lib/marketing-studio/execution/execution-dispatcher";
import {
  EXECUTION_JOB_TYPE,
  EXECUTION_DESTINATION,
  buildIdempotencyKey,
} from "@/lib/marketing-studio/execution/execution-types";
import {
  DISTRIBUTION_EVENT,
  handleDistributionEvent,
} from "@/lib/marketing-studio/distribution/distribution-events";
import {
  CAMPAIGN_EVENT,
  handleCampaignEvent,
} from "@/lib/marketing-studio/campaigns/campaign-events";
import {
  PUBLISHING_EVENT,
  type PublishingEventType,
  type PublishingDestination,
} from "./publishing-types";
import { recordPublishingEvent }  from "./publishing-repository";

export interface PublishingEventPayload {
  organizationId: string;
  eventType:      PublishingEventType;
  planId?:        string;
  stepId?:        string;
  destination?:   PublishingDestination;
  productId?:     string | null;
  campaignId?:    string | null;
  catalogId?:     string | null;
  assetId?:       string | null;
  distributionId?:string | null;
  errorMessage?:  string | null;
}

// ── Event handler ─────────────────────────────────────────────────────────────

export async function handlePublishingEvent(
  payload: PublishingEventPayload,
): Promise<void> {
  const { organizationId, eventType } = payload;

  // Always persist event
  await recordPublishingEvent({
    organizationId,
    planId:    payload.planId    ?? null,
    stepId:    payload.stepId    ?? null,
    eventType,
    payload:   payload as unknown as Record<string, unknown>,
  }).catch(() => void 0);

  switch (eventType) {
    case PUBLISHING_EVENT.PLAN_CREATED: {
      // New plan — trigger catalog readiness check
      await dispatchExecutionJob({
        organizationId,
        jobType:        EXECUTION_JOB_TYPE.CATALOG_REFRESH_READINESS,
        destination:    EXECUTION_DESTINATION.INTERNAL,
        idempotencyKey: buildIdempotencyKey(
          EXECUTION_JOB_TYPE.CATALOG_REFRESH_READINESS,
          organizationId,
          `plan_created:${payload.planId ?? ""}`,
        ),
        priority:   3,
        maxRetries: 1,
      }).catch(() => void 0);
      break;
    }

    case PUBLISHING_EVENT.STEP_PUBLISHED: {
      // Step published — propagate to distribution + campaign
      if (payload.assetId) {
        await handleDistributionEvent({
          organizationId,
          eventType:  DISTRIBUTION_EVENT.VARIANT_READY,
          assetId:    payload.assetId,
          productId:  payload.productId  ?? undefined,
          channel:    payload.destination as string | undefined,
        }).catch(() => void 0);
      }
      if (payload.campaignId) {
        await handleCampaignEvent({
          organizationId,
          eventType:  CAMPAIGN_EVENT.ASSET_PUBLISHED,
          campaignId: payload.campaignId,
          assetId:    payload.assetId    ?? undefined,
          channel:    payload.destination as string | undefined,
        }).catch(() => void 0);
      }
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
          priority:   4,
          maxRetries: 1,
        }).catch(() => void 0);
      }
      break;
    }

    case PUBLISHING_EVENT.STEP_FAILED: {
      if (payload.campaignId) {
        await handleCampaignEvent({
          organizationId,
          eventType:    CAMPAIGN_EVENT.DISTRIBUTION_FAILED,
          campaignId:   payload.campaignId,
          channel:      payload.destination as string | undefined,
          errorMessage: payload.errorMessage ?? undefined,
        }).catch(() => void 0);
      }
      break;
    }

    case PUBLISHING_EVENT.PLAN_COMPLETED: {
      // Plan complete — rebuild catalog
      await dispatchExecutionJob({
        organizationId,
        jobType:        EXECUTION_JOB_TYPE.CATALOG_REBUILD,
        destination:    EXECUTION_DESTINATION.CATALOG,
        idempotencyKey: buildIdempotencyKey(
          EXECUTION_JOB_TYPE.CATALOG_REBUILD,
          organizationId,
          `plan_completed:${payload.planId ?? ""}`,
        ),
        priority:   6,
        maxRetries: 2,
      }).catch(() => void 0);
      break;
    }

    case PUBLISHING_EVENT.PLAN_BLOCKED:
    case PUBLISHING_EVENT.SCHEDULE_MISSED:
    case PUBLISHING_EVENT.STEP_QUEUED:
    case PUBLISHING_EVENT.STEP_STARTED:
    case PUBLISHING_EVENT.STEP_RETRYING:
    case PUBLISHING_EVENT.DEPENDENCY_RESOLVED:
      // Logged above — no additional side effects needed
      break;

    default:
      break;
  }
}
