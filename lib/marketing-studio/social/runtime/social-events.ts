/**
 * lib/marketing-studio/social/runtime/social-events.ts
 *
 * MS-16 — Social Publishing Execution Engine: Event system
 *
 * handleSocialEvent() — reacts to publication events with side effects:
 *   - MS-14 Distribution Runtime updates (channel coverage, last published)
 *   - MS-15 Campaign Runtime updates (launch phases, campaign advancement)
 *   - MS-13 Execution Runtime dispatch
 *
 * SERVER ONLY.
 */

import { dispatchExecutionJob }    from "@/lib/marketing-studio/execution/execution-dispatcher";
import {
  EXECUTION_JOB_TYPE,
  EXECUTION_DESTINATION,
  buildIdempotencyKey,
} from "@/lib/marketing-studio/execution/execution-types";
import { markVariantReady }        from "@/lib/marketing-studio/distribution/distribution-repository";
import {
  DISTRIBUTION_EVENT,
  handleDistributionEvent,
} from "@/lib/marketing-studio/distribution/distribution-events";
import {
  CAMPAIGN_EVENT,
  handleCampaignEvent,
} from "@/lib/marketing-studio/campaigns/campaign-events";
import type { SocialChannel }      from "../social-types";

// ── Event types ────────────────────────────────────────────────────────────────

export const SOCIAL_EVENT = {
  PUBLICATION_CREATED:    "publication.created",
  PUBLICATION_STARTED:    "publication.started",
  PUBLICATION_PUBLISHED:  "publication.published",
  PUBLICATION_FAILED:     "publication.failed",
  PUBLICATION_RETRYING:   "publication.retrying",
  PUBLICATION_CANCELLED:  "publication.cancelled",
  CAMPAIGN_LAUNCH_TRIGGERED: "campaign.launch_triggered",
  SCHEDULE_TRIGGERED:     "schedule.triggered",
} as const;

export type SocialEventType = typeof SOCIAL_EVENT[keyof typeof SOCIAL_EVENT];

export interface SocialEventPayload {
  organizationId:  string;
  eventType:       SocialEventType;
  publicationId?:  string;
  channel?:        SocialChannel;
  campaignId?:     string;
  assetId?:        string;
  productId?:      string;
  platformPostId?: string;
  errorMessage?:   string;
  distributionId?: string;
}

// ── Event handler ──────────────────────────────────────────────────────────────

export async function handleSocialEvent(
  payload: SocialEventPayload,
): Promise<void> {
  const { organizationId, eventType } = payload;

  switch (eventType) {
    case SOCIAL_EVENT.PUBLICATION_CREATED: {
      // New publication created — queue catalog readiness check
      await dispatchExecutionJob({
        organizationId,
        jobType:        EXECUTION_JOB_TYPE.CATALOG_REFRESH_READINESS,
        destination:    EXECUTION_DESTINATION.INTERNAL,
        idempotencyKey: buildIdempotencyKey(
          EXECUTION_JOB_TYPE.CATALOG_REFRESH_READINESS,
          organizationId,
          `pub_created:${payload.publicationId ?? ""}`,
        ),
        priority:   3,
        maxRetries: 1,
      });
      break;
    }

    case SOCIAL_EVENT.PUBLICATION_PUBLISHED: {
      // Publication succeeded — update distribution coverage
      if (payload.assetId) {
        await handleDistributionEvent({
          organizationId,
          eventType:  DISTRIBUTION_EVENT.VARIANT_READY,
          assetId:    payload.assetId,
          productId:  payload.productId,
          channel:    payload.channel,
        }).catch(() => void 0);  // non-blocking
      }

      // Update campaign advancement
      if (payload.campaignId) {
        await handleCampaignEvent({
          organizationId,
          eventType:  CAMPAIGN_EVENT.ASSET_PUBLISHED,
          campaignId: payload.campaignId,
          assetId:    payload.assetId,
          channel:    payload.channel,
        }).catch(() => void 0);
      }

      // Trigger product readiness refresh
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
        });
      }
      break;
    }

    case SOCIAL_EVENT.PUBLICATION_FAILED: {
      // Failed publication — record distribution failure event
      if (payload.distributionId) {
        await handleCampaignEvent({
          organizationId,
          eventType:    CAMPAIGN_EVENT.DISTRIBUTION_FAILED,
          campaignId:   payload.campaignId,
          channel:      payload.channel,
          errorMessage: payload.errorMessage,
        }).catch(() => void 0);
      }
      break;
    }

    case SOCIAL_EVENT.PUBLICATION_RETRYING: {
      // Retry scheduled — no further side effects needed
      break;
    }

    case SOCIAL_EVENT.CAMPAIGN_LAUNCH_TRIGGERED: {
      // Campaign launch event — trigger full distribution rebuild + catalog
      if (payload.campaignId) {
        await handleCampaignEvent({
          organizationId,
          eventType:  CAMPAIGN_EVENT.CAMPAIGN_STARTED,
          campaignId: payload.campaignId,
        });

        await dispatchExecutionJob({
          organizationId,
          jobType:        EXECUTION_JOB_TYPE.CATALOG_REBUILD,
          destination:    EXECUTION_DESTINATION.INTERNAL,
          idempotencyKey: buildIdempotencyKey(
            EXECUTION_JOB_TYPE.CATALOG_REBUILD,
            organizationId,
            `campaign_launch:${payload.campaignId}`,
          ),
          priority:   8,
          maxRetries: 2,
        });
      }
      break;
    }

    case SOCIAL_EVENT.SCHEDULE_TRIGGERED: {
      // Scheduled drop triggered — check WhatsApp catalog
      if (payload.channel === "whatsapp") {
        await dispatchExecutionJob({
          organizationId,
          jobType:        EXECUTION_JOB_TYPE.WHATSAPP_PREPARE_CATALOG,
          destination:    EXECUTION_DESTINATION.WHATSAPP,
          idempotencyKey: buildIdempotencyKey(
            EXECUTION_JOB_TYPE.WHATSAPP_PREPARE_CATALOG,
            organizationId,
            `schedule_trigger:${payload.publicationId ?? ""}`,
          ),
          priority:   7,
          maxRetries: 2,
        });
      }
      break;
    }

    default:
      break;
  }
}
