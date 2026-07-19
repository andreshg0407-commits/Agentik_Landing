/**
 * lib/marketing-studio/campaigns/campaign-runtime.ts
 *
 * MS-15 — Campaign Operating System: Main orchestration layer
 *
 * buildCampaignRuntime() — loads all data and computes CampaignRuntimeState.
 *
 * Campaigns are derived from DistributionPipeline records + product data.
 * No new Prisma models required.
 *
 * SERVER ONLY — called from Campaign Center RSC page.
 */

import {
  listDistributionPipelines,
  listDistributionSchedules,
  listDistributionVariants,
} from "@/lib/marketing-studio/distribution/distribution-repository";
import { listProductConsoleItems }  from "@/lib/marketing-studio/products/product-query-service";
import { buildCampaignSequence }    from "./campaign-sequences";
import { computeCampaignReadiness } from "./campaign-readiness";
import { computeCampaignHealth }    from "./campaign-health";
import { buildEditorialCalendar, buildLaunchWindows } from "./campaign-calendar";
import { generateCampaignLucaRecos, generateCampaignMilaRecos } from "./campaign-recommendations";
import { computeCoordination }      from "./campaign-coordination";
import {
  CAMPAIGN_TYPE,
  CAMPAIGN_STATUS,
  CAMPAIGN_PRIORITY,
  type CampaignEntity,
  type CampaignRuntimeState,
  type CampaignContentSlot,
  type ChannelType,
  type CampaignType,
  type CampaignStatus,
  type CampaignPriority,
} from "./campaign-types";
import type { DistributionPipelineDTO } from "@/lib/marketing-studio/distribution/distribution-types";

// ── Pipeline → Campaign mapping ────────────────────────────────────────────────

function mapPipelineToCampaign(
  pipeline:       DistributionPipelineDTO,
  contentSlots:   CampaignContentSlot[],
): CampaignEntity {
  // Map pipeline type → campaign type
  const typeMap: Record<string, CampaignType> = {
    new_collection_launch: CAMPAIGN_TYPE.LAUNCH,
    whatsapp_drop:         CAMPAIGN_TYPE.WHATSAPP_PUSH,
    campaign_launch:       CAMPAIGN_TYPE.LAUNCH,
    evergreen_rotation:    CAMPAIGN_TYPE.EVERGREEN,
    seasonal_release:      CAMPAIGN_TYPE.SEASONAL,
    recovery_campaign:     CAMPAIGN_TYPE.RETENTION,
  };

  const statusMap: Record<string, CampaignStatus> = {
    draft:      CAMPAIGN_STATUS.PLANNING,
    scheduled:  CAMPAIGN_STATUS.SCHEDULED,
    queued:     CAMPAIGN_STATUS.SCHEDULED,
    publishing: CAMPAIGN_STATUS.ACTIVE,
    published:  CAMPAIGN_STATUS.COMPLETED,
    partial:    CAMPAIGN_STATUS.ACTIVE,
    failed:     CAMPAIGN_STATUS.FAILED,
    stale:      CAMPAIGN_STATUS.PAUSED,
    archived:   CAMPAIGN_STATUS.COMPLETED,
  };

  const campaignType  = typeMap[pipeline.pipelineType]  ?? CAMPAIGN_TYPE.LAUNCH;
  const campaignStatus = statusMap[pipeline.status]     ?? CAMPAIGN_STATUS.PLANNING;
  const channels       = pipeline.channels as ChannelType[];

  // Build sequences from content slots
  const sequences = buildCampaignSequence({
    campaignType,
    channels,
    existingSlots: contentSlots,
  });

  // Placeholder readiness (enriched below)
  return {
    id:             pipeline.id,
    name:           pipeline.name,
    type:           campaignType,
    status:         campaignStatus,
    priority:       derivePriority(pipeline.status, pipeline.stages ?? []),
    channels,
    productIds:     (pipeline.productIds ?? []) as string[],
    startDate:      pipeline.scheduledAt,
    endDate:        null,
    sequences,
    contentSlots,
    readinessScore: 0,   // computed below
    readinessLevel: "partial",
    sourceId:       pipeline.id,
    createdAt:      pipeline.createdAt,
    updatedAt:      pipeline.updatedAt,
  };
}

function derivePriority(
  status: string,
  stages: { isRequired: boolean; status: string }[],
): CampaignPriority {
  if (status === "failed") return CAMPAIGN_PRIORITY.CRITICAL;
  const blockedRequired = stages.some(s => s.isRequired && s.status === "failed");
  if (blockedRequired)    return CAMPAIGN_PRIORITY.HIGH;
  if (status === "publishing") return CAMPAIGN_PRIORITY.HIGH;
  return CAMPAIGN_PRIORITY.MEDIUM;
}

// ── Variant → ContentSlot mapping ─────────────────────────────────────────────

function variantsToContentSlots(
  pipelineId: string,
  productIds: string[],
  variants:   import("@/lib/marketing-studio/distribution/distribution-types").DistributionVariantDTO[],
): CampaignContentSlot[] {
  const slots: CampaignContentSlot[] = [];
  const pipelineVariants = variants.filter(v =>
    v.productId && (productIds as string[]).includes(v.productId),
  );

  for (const v of pipelineVariants) {
    // Map variant purpose → content type
    const contentTypeMap: Record<string, string> = {
      feed:             "product_post",
      story:            "story",
      reel:             "reel",
      ad:               "banner",
      catalog:          "product_post",
      whatsapp:         "whatsapp_push",
      hero:             "landing_hero",
      thumbnail:        "product_post",
      collection_cover: "collection_banner",
      landing_banner:   "landing_hero",
    };

    // Map channel
    const channelMap: Record<string, ChannelType> = {
      shopify:   "shopify",
      whatsapp:  "whatsapp",
      instagram: "instagram",
      facebook:  "facebook",
      tiktok:    "tiktok",
      ads:       "ads",
      landing:   "landing",
      catalog:   "shopify",
      email:     "email",
    };

    const contentType = contentTypeMap[v.purpose] ?? "product_post";
    const channel     = channelMap[v.channel]     ?? "instagram";

    slots.push({
      id:          v.id,
      contentType: contentType as CampaignContentSlot["contentType"],
      channel:     channel as ChannelType,
      phase:       "launch",
      isReady:     v.isReady,
      assetId:     v.assetId,
      notes:       v.notes,
      scheduledAt: null,
    });
  }

  return slots;
}

// ── Main runtime builder ───────────────────────────────────────────────────────

export async function buildCampaignRuntime(
  organizationId: string,
): Promise<CampaignRuntimeState> {
  const [products, pipelines, variants] = await Promise.all([
    listProductConsoleItems(organizationId),
    listDistributionPipelines(organizationId),
    listDistributionVariants(organizationId),
  ]);

  const productCount = products.length;

  // Derive campaigns from distribution pipelines
  const campaigns: CampaignEntity[] = pipelines.map(pipeline => {
    const contentSlots = variantsToContentSlots(
      pipeline.id,
      pipeline.productIds as string[],
      variants,
    );

    const campaign = mapPipelineToCampaign(pipeline, contentSlots);

    // Compute readiness per campaign
    const channelCoverage: Record<string, number> = {};
    for (const ch of campaign.channels) {
      const chVariants = variants.filter(v =>
        v.channel === ch &&
        (pipeline.productIds as string[]).includes(v.productId ?? ""),
      );
      const ready  = chVariants.filter(v => v.isReady).length;
      const total  = chVariants.length;
      channelCoverage[ch] = total > 0 ? (ready / total) * 100 : 0;
    }

    const readiness = computeCampaignReadiness(campaign, {
      totalProducts:    productCount,
      variantCoverage:  channelCoverage,
      hasScheduledDate: !!campaign.startDate,
    });

    return {
      ...campaign,
      readinessScore: readiness.readinessScore,
      readinessLevel: readiness.readinessLevel,
    };
  });

  // Build calendar
  const calendar = buildEditorialCalendar({
    campaigns,
    mode:       "weekly",
    anchorDate: new Date().toISOString(),
  });

  // Build launch windows
  const launchWindows = buildLaunchWindows(campaigns);

  // Compute health
  const health = computeCampaignHealth({ campaigns, launchWindows });

  // Compute coordination
  const coordination = computeCoordination(campaigns);

  // Generate intelligence
  const lucaRecos = generateCampaignLucaRecos({
    campaigns,
    launchWindows,
    productCount,
    warnings: coordination.warnings,
  });

  const milaRecos = generateCampaignMilaRecos({ campaigns, productCount });

  const activeCampaignIds = campaigns
    .filter(c => c.status === CAMPAIGN_STATUS.ACTIVE || c.status === CAMPAIGN_STATUS.SCHEDULED)
    .map(c => c.id);

  return {
    organizationId,
    computedAt:              new Date().toISOString(),
    campaigns,
    calendarEvents:          calendar.days.flatMap(d => d.events),
    launchWindows,
    health,
    lucaRecos,
    milaRecos,
    coordinationWarnings:    coordination.warnings,
    coordinationSuggestions: coordination.suggestions,
    productCount,
    activeCampaignIds,
  };
}
