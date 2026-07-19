/**
 * lib/marketing-studio/social/runtime/social-runtime.ts
 *
 * MS-16 — Social Publishing Execution Engine: Main runtime
 *
 * buildSocialRuntime() — derives SocialRuntimeState from distribution +
 * campaign + distribution schedule data. No new Prisma models.
 *
 * SERVER ONLY — called from Social Runtime RSC page.
 */

import {
  listDistributionPipelines,
  listDistributionSchedules,
  listDistributionVariants,
} from "@/lib/marketing-studio/distribution/distribution-repository";
import { listProductConsoleItems }      from "@/lib/marketing-studio/products/product-query-service";
import {
  SOCIAL_CHANNEL,
  SOCIAL_STATUS,
  SOCIAL_CONTENT_TYPE,
  SOCIAL_PRIORITY,
  SOCIAL_FAILURE_TYPE,
  type SocialPublication,
  type SocialQueueItem,
  type SocialChannelState,
  type SocialHealthSummary,
  type SocialRuntimeState,
  type SocialLiveActivity,
  type SocialChannel,
  type SocialFailureType,
} from "../social-types";
import { buildSocialQueue, computeQueuePriority }   from "../social-queue";
import { buildRecoverySuggestions }                  from "../social-retries";
import { randomUUID }                                from "crypto";

// ── Derive SocialPublication from DistributionSchedule + variants ──────────────

function derivePublicationsFromSchedules(
  schedules: import("@/lib/marketing-studio/distribution/distribution-types").DistributionScheduleDTO[],
  variants:  import("@/lib/marketing-studio/distribution/distribution-types").DistributionVariantDTO[],
  organizationId: string,
): SocialPublication[] {
  const SOCIAL_CHANNELS = Object.values(SOCIAL_CHANNEL) as SocialChannel[];

  const publications: SocialPublication[] = [];

  for (const schedule of schedules) {
    // Only include channels that are social
    if (!(SOCIAL_CHANNELS as string[]).includes(schedule.channel)) continue;

    const channel = schedule.channel as SocialChannel;

    // Map status
    const statusMap: Record<string, import("../social-types").SocialStatus> = {
      pending:    SOCIAL_STATUS.QUEUED,
      queued:     SOCIAL_STATUS.QUEUED,
      published:  SOCIAL_STATUS.PUBLISHED,
      failed:     SOCIAL_STATUS.FAILED,
      paused:     SOCIAL_STATUS.PAUSED,
    };

    const status = statusMap[schedule.status] ?? SOCIAL_STATUS.SCHEDULED;

    // Find a matching variant for the first product
    const productId  = schedule.productIds[0] ?? null;
    const variant    = productId
      ? variants.find(v => v.productId === productId && v.channel === channel)
      : null;

    const contentTypeMap: Record<string, import("../social-types").SocialContentType> = {
      feed:             SOCIAL_CONTENT_TYPE.IMAGE_POST,
      story:            SOCIAL_CONTENT_TYPE.STORY,
      reel:             SOCIAL_CONTENT_TYPE.REEL,
      catalog:          SOCIAL_CONTENT_TYPE.PRODUCT_DROP,
      whatsapp:         SOCIAL_CONTENT_TYPE.PRODUCT_DROP,
      hero:             SOCIAL_CONTENT_TYPE.IMAGE_POST,
      thumbnail:        SOCIAL_CONTENT_TYPE.IMAGE_POST,
      collection_cover: SOCIAL_CONTENT_TYPE.CAMPAIGN_LAUNCH,
      landing_banner:   SOCIAL_CONTENT_TYPE.IMAGE_POST,
      ad:               SOCIAL_CONTENT_TYPE.IMAGE_POST,
    };

    const contentType = variant
      ? (contentTypeMap[variant.purpose] ?? SOCIAL_CONTENT_TYPE.IMAGE_POST)
      : SOCIAL_CONTENT_TYPE.IMAGE_POST;

    const priority = computeQueuePriority({
      isRetrying:       status === SOCIAL_STATUS.RETRYING,
      isOverdue:        schedule.scheduledAt ? new Date(schedule.scheduledAt) < new Date() : false,
      isCampaignLinked: false,
      contentType,
      scheduledAt:      schedule.scheduledAt,
    });

    publications.push({
      id:             schedule.id,
      organizationId,
      channel,
      contentType,
      status,
      priority,
      caption:        schedule.notes,
      asset:          variant ? {
        assetId:     variant.assetId,
        assetUrl:    variant.sourceAssetUrl,
        contentType,
        ratio:       variant.ratio,
        width:       variant.width,
        height:      variant.height,
        isReady:     variant.isReady,
        notes:       variant.notes,
      } : null,
      campaignLink:    null,
      distributionId:  schedule.id,
      scheduledAt:     schedule.scheduledAt,
      publishedAt:     null,
      platformPostId:  null,
      platformUrl:     null,
      retry: {
        retryCount:    0,
        maxRetries:    3,
        policy:        "exponential",
        nextRetryAt:   null,
        lastFailureAt: null,
        failureType:   null,
        errorMessage:  null,
      },
      blockers:        [],
      createdAt:       schedule.createdAt,
      updatedAt:       schedule.updatedAt,
    });
  }

  return publications;
}

// ── Channel state derivation ───────────────────────────────────────────────────

function deriveChannelStates(
  publications: SocialPublication[],
): SocialChannelState[] {
  const channels = Object.values(SOCIAL_CHANNEL) as SocialChannel[];

  return channels.map(channel => {
    const chPubs = publications.filter(p => p.channel === channel);

    const queuedCount    = chPubs.filter(p => p.status === SOCIAL_STATUS.QUEUED || p.status === SOCIAL_STATUS.SCHEDULED).length;
    const publishingCount = chPubs.filter(p => p.status === SOCIAL_STATUS.PUBLISHING || p.status === SOCIAL_STATUS.PREPARING).length;
    const failedCount    = chPubs.filter(p => p.status === SOCIAL_STATUS.FAILED).length;
    const retriesCount   = chPubs.filter(p => p.status === SOCIAL_STATUS.RETRYING).length;

    const published      = chPubs.filter(p => p.status === SOCIAL_STATUS.PUBLISHED);
    const lastPublishedAt = published.length > 0
      ? published.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))[0].publishedAt
      : null;

    const hasAuthFailure = chPubs.some(p => p.retry.failureType === SOCIAL_FAILURE_TYPE.AUTH_FAILURE);

    let healthLevel: SocialChannelState["healthLevel"] = "healthy";
    let healthDetail: string | null = null;

    if (hasAuthFailure) {
      healthLevel  = "offline";
      healthDetail = "Auth inválida — reconectar integración";
    } else if (failedCount >= 3) {
      healthLevel  = "blocked";
      healthDetail = `${failedCount} publicaciones fallidas acumuladas`;
    } else if (failedCount >= 1 || retriesCount > 0) {
      healthLevel  = "degraded";
      healthDetail = `${failedCount} fallas, ${retriesCount} reintentos activos`;
    }

    return {
      channel,
      isAuthValid:    !hasAuthFailure,
      queuedCount,
      publishingCount,
      failedCount,
      retriesCount,
      lastPublishedAt,
      healthLevel,
      healthDetail,
    };
  });
}

// ── Health summary ─────────────────────────────────────────────────────────────

function computeHealthSummary(
  publications:  SocialPublication[],
  channelStates: SocialChannelState[],
): SocialHealthSummary {
  const now = new Date();

  const queuedCount    = publications.filter(p => p.status === SOCIAL_STATUS.QUEUED).length;
  const publishingCount = publications.filter(p => p.status === SOCIAL_STATUS.PUBLISHING).length;
  const failedCount    = publications.filter(p => p.status === SOCIAL_STATUS.FAILED).length;
  const retryingCount  = publications.filter(p => p.status === SOCIAL_STATUS.RETRYING).length;
  const overdueCount   = publications.filter(p =>
    p.scheduledAt &&
    new Date(p.scheduledAt) < now &&
    p.status !== SOCIAL_STATUS.PUBLISHED &&
    p.status !== SOCIAL_STATUS.PUBLISHING,
  ).length;
  const campaignLinked = publications.filter(p => p.campaignLink !== null).length;
  const liveNow        = publishingCount;

  const retryPressure = retryingCount >= 5 || failedCount >= 10 ? "critical"
    : retryingCount >= 3 || failedCount >= 5 ? "high"
    : retryingCount >= 1 || failedCount >= 1 ? "medium"
    : "low";

  const hasOffline  = channelStates.some(c => c.healthLevel === "offline");
  const hasBlocked  = channelStates.some(c => c.healthLevel === "blocked");
  const hasDegraded = channelStates.some(c => c.healthLevel === "degraded");

  const level = hasOffline || (failedCount >= 5) ? "blocked"
    : hasBlocked  || failedCount >= 2 ? "degraded"
    : hasDegraded || retryingCount > 0 ? "degraded"
    : "healthy";

  const LABELS: Record<string, string> = {
    healthy:  "Sistema de publicación operativo",
    degraded: "Publicaciones con incidencias",
    blocked:  "Canales bloqueados — acción requerida",
    offline:  "Canal(es) offline",
  };

  return {
    level:           level as SocialHealthSummary["level"],
    label:           LABELS[level] ?? level,
    queuedCount,
    publishingCount,
    failedCount,
    retryingCount,
    overdueCount,
    campaignLinked,
    liveNow,
    retryPressure:   retryPressure as SocialHealthSummary["retryPressure"],
  };
}

// ── Failures by type ───────────────────────────────────────────────────────────

function groupFailuresByType(publications: SocialPublication[]) {
  const failed = publications.filter(p =>
    p.status === SOCIAL_STATUS.FAILED && p.retry.failureType,
  );

  const countMap: Record<string, number> = {};
  for (const p of failed) {
    const ft = p.retry.failureType ?? "unknown";
    countMap[ft] = (countMap[ft] ?? 0) + 1;
  }

  return Object.entries(countMap).map(([failureType, count]) => ({
    failureType:  failureType as SocialFailureType,
    count,
    recoveryHint: buildRecoverySuggestions(failureType as SocialFailureType).action,
  })).sort((a, b) => b.count - a.count);
}

// ── Recent activity (synthetic from publication state) ─────────────────────────

function deriveRecentActivity(publications: SocialPublication[]): SocialLiveActivity[] {
  const activity: SocialLiveActivity[] = [];

  for (const p of publications.slice(0, 20)) {
    if (p.status === SOCIAL_STATUS.PUBLISHED && p.publishedAt) {
      activity.push({
        id:          `act_${p.id}_published`,
        type:        "success",
        channel:     p.channel,
        contentType: p.contentType,
        message:     `Publicación ${p.contentType} en ${p.channel} exitosa`,
        timestamp:   p.publishedAt,
        campaignId:  p.campaignLink?.campaignId,
      });
    } else if (p.status === SOCIAL_STATUS.FAILED) {
      activity.push({
        id:          `act_${p.id}_failed`,
        type:        "failed",
        channel:     p.channel,
        contentType: p.contentType,
        message:     p.retry.errorMessage ?? `Fallo en ${p.channel}`,
        timestamp:   p.retry.lastFailureAt ?? p.updatedAt,
        campaignId:  p.campaignLink?.campaignId,
      });
    } else if (p.status === SOCIAL_STATUS.RETRYING) {
      activity.push({
        id:          `act_${p.id}_retrying`,
        type:        "retrying",
        channel:     p.channel,
        contentType: p.contentType,
        message:     `Reintentando publicación en ${p.channel} (intento ${p.retry.retryCount})`,
        timestamp:   p.retry.nextRetryAt ?? p.updatedAt,
        campaignId:  p.campaignLink?.campaignId,
      });
    }
  }

  return activity
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 15);
}

// ── Main runtime builder ───────────────────────────────────────────────────────

export async function buildSocialRuntime(
  organizationId: string,
): Promise<SocialRuntimeState> {
  const [schedules, variants, pipelines] = await Promise.all([
    listDistributionSchedules(organizationId),
    listDistributionVariants(organizationId),
    listDistributionPipelines(organizationId),
  ]);

  // Derive publications from distribution schedules (social channels only)
  const publications = derivePublicationsFromSchedules(schedules, variants, organizationId);

  // Build queue from publications
  const queue = buildSocialQueue(publications);

  // Derive channel states
  const channelStates = deriveChannelStates(publications);

  // Compute health
  const health = computeHealthSummary(publications, channelStates);

  // Group failures by type
  const failedByType = groupFailuresByType(publications);

  // Recent activity
  const recentActivity = deriveRecentActivity(publications);

  return {
    organizationId,
    computedAt:       new Date().toISOString(),
    queue,
    publications,
    channelStates,
    recentActivity,
    health,
    failedByType,
    totalPublications: publications.length,
  };
}
