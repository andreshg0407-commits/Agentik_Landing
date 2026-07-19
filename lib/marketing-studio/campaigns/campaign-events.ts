/**
 * lib/marketing-studio/campaigns/campaign-events.ts
 *
 * MS-15 — Campaign Operating System: Event reaction layer
 *
 * handleCampaignEvent() — reacts to platform events with campaign
 * side effects: readiness recalculations, alerts, coordination updates.
 *
 * SERVER ONLY.
 */

import { dispatchExecutionJob }    from "@/lib/marketing-studio/execution/execution-dispatcher";
import {
  EXECUTION_JOB_TYPE,
  EXECUTION_DESTINATION,
  buildIdempotencyKey,
} from "@/lib/marketing-studio/execution/execution-types";

// ── Event types ────────────────────────────────────────────────────────────────

export const CAMPAIGN_EVENT = {
  CAMPAIGN_CREATED:   "campaign.created",
  CAMPAIGN_STARTED:   "campaign.started",
  CAMPAIGN_PAUSED:    "campaign.paused",
  ASSET_PUBLISHED:    "asset.published",
  LAUNCH_COMPLETED:   "launch.completed",
  VARIANT_GENERATED:  "variant.generated",
  DISTRIBUTION_FAILED:"distribution.failed",
  SCHEDULE_MISSED:    "schedule.missed",
} as const;

export type CampaignEventType = typeof CAMPAIGN_EVENT[keyof typeof CAMPAIGN_EVENT];

export interface CampaignEventPayload {
  organizationId: string;
  eventType:      CampaignEventType;

  // campaign events
  campaignId?:    string;

  // asset events
  assetId?:       string;
  productId?:     string;
  channel?:       string;
  contentType?:   string;

  // schedule events
  scheduleId?:    string;
  errorMessage?:  string;
}

// ── Event handler ──────────────────────────────────────────────────────────────

export async function handleCampaignEvent(
  payload: CampaignEventPayload,
): Promise<void> {
  const { organizationId, eventType } = payload;

  switch (eventType) {
    case CAMPAIGN_EVENT.CAMPAIGN_CREATED:
    case CAMPAIGN_EVENT.CAMPAIGN_STARTED: {
      // Trigger catalog readiness refresh so products are synced
      await dispatchExecutionJob({
        organizationId,
        jobType:        EXECUTION_JOB_TYPE.CATALOG_REFRESH_READINESS,
        destination:    EXECUTION_DESTINATION.INTERNAL,
        idempotencyKey: buildIdempotencyKey(
          EXECUTION_JOB_TYPE.CATALOG_REFRESH_READINESS,
          organizationId,
          `campaign_start:${payload.campaignId ?? "new"}`,
        ),
        priority:   5,
        maxRetries: 1,
      });
      break;
    }

    case CAMPAIGN_EVENT.CAMPAIGN_PAUSED: {
      // No automated action needed — just log that it's paused
      // Future: could suspend scheduled dispatch jobs tied to this campaign
      break;
    }

    case CAMPAIGN_EVENT.ASSET_PUBLISHED: {
      // A campaign asset has been published — refresh product readiness
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

    case CAMPAIGN_EVENT.LAUNCH_COMPLETED: {
      // Campaign launched — sync Shopify to ensure product visibility
      await dispatchExecutionJob({
        organizationId,
        jobType:        EXECUTION_JOB_TYPE.CATALOG_REBUILD,
        destination:    EXECUTION_DESTINATION.INTERNAL,
        idempotencyKey: buildIdempotencyKey(
          EXECUTION_JOB_TYPE.CATALOG_REBUILD,
          organizationId,
          `launch_complete:${payload.campaignId ?? ""}`,
        ),
        priority:   6,
        maxRetries: 2,
      });
      break;
    }

    case CAMPAIGN_EVENT.VARIANT_GENERATED: {
      // New variant generated — refresh readiness for the affected product
      if (payload.productId) {
        await dispatchExecutionJob({
          organizationId,
          jobType:        EXECUTION_JOB_TYPE.PRODUCT_RECOMPUTE_READINESS,
          destination:    EXECUTION_DESTINATION.INTERNAL,
          productId:      payload.productId,
          idempotencyKey: buildIdempotencyKey(
            EXECUTION_JOB_TYPE.PRODUCT_RECOMPUTE_READINESS,
            organizationId,
            `variant_gen:${payload.assetId ?? payload.productId}`,
          ),
          priority:   3,
          maxRetries: 1,
        });
      }
      break;
    }

    case CAMPAIGN_EVENT.DISTRIBUTION_FAILED: {
      // Distribution failed for a campaign — retry sync check
      await dispatchExecutionJob({
        organizationId,
        jobType:        EXECUTION_JOB_TYPE.SHOPIFY_SYNC_CHECK,
        destination:    EXECUTION_DESTINATION.SHOPIFY,
        idempotencyKey: buildIdempotencyKey(
          EXECUTION_JOB_TYPE.SHOPIFY_SYNC_CHECK,
          organizationId,
          `dist_fail:${payload.campaignId ?? ""}`,
        ),
        priority:   7,
        maxRetries: 3,
      });
      break;
    }

    case CAMPAIGN_EVENT.SCHEDULE_MISSED: {
      // Missed schedule — trigger WhatsApp catalog refresh if relevant
      if (payload.channel === "whatsapp") {
        await dispatchExecutionJob({
          organizationId,
          jobType:        EXECUTION_JOB_TYPE.WHATSAPP_PREPARE_CATALOG,
          destination:    EXECUTION_DESTINATION.WHATSAPP,
          idempotencyKey: buildIdempotencyKey(
            EXECUTION_JOB_TYPE.WHATSAPP_PREPARE_CATALOG,
            organizationId,
            `schedule_miss:${payload.scheduleId ?? ""}`,
          ),
          priority:   8,
          maxRetries: 2,
        });
      }
      break;
    }

    default:
      break;
  }
}
