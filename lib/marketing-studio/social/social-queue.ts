/**
 * lib/marketing-studio/social/social-queue.ts
 *
 * MS-16 — Social Publishing Execution Engine: Queue engine
 *
 * Derives the social publication queue from distribution + campaign state.
 * Pure computation. No Prisma. No async.
 */

import {
  SOCIAL_STATUS,
  SOCIAL_PRIORITY,
  SOCIAL_CONTENT_TYPE,
  type SocialQueueItem,
  type SocialPublication,
  type SocialChannel,
  type SocialPriority,
  type SocialStatus,
} from "./social-types";

// ── Priority ordering ──────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<SocialPriority, number> = {
  critical: 0,
  high:     1,
  medium:   2,
  low:      3,
};

const STATUS_PRIORITY_BOOST: Record<SocialStatus, number> = {
  retrying:   -1,  // bump above everything
  failed:     10,
  publishing: -0.5,
  queued:     0,
  scheduled:  1,
  preparing:  0,
  published:  99,
  draft:      5,
  paused:     8,
  cancelled:  99,
};

// ── Blocker detection ──────────────────────────────────────────────────────────

export function detectPublicationBlockers(pub: {
  asset:      { isReady: boolean; assetUrl: string | null; ratio: string | null } | null;
  caption:    string | null;
  channel:    SocialChannel;
  retry:      { failureType: string | null; retryCount: number; maxRetries: number };
}): string[] {
  const blockers: string[] = [];

  if (!pub.asset)                                 blockers.push("Sin asset asignado");
  else if (!pub.asset.isReady)                    blockers.push("Asset no aprobado");
  else if (!pub.asset.assetUrl)                   blockers.push("URL de asset faltante");

  if (!pub.caption)                               blockers.push("Sin caption");

  if (pub.retry.failureType === "auth_failure")   blockers.push("Auth inválida — reconectar canal");
  if (pub.retry.failureType === "invalid_media")  blockers.push("Formato de media no soportado");
  if (pub.retry.retryCount >= pub.retry.maxRetries) blockers.push("Máximo de reintentos alcanzado");

  // Channel-specific checks
  if (pub.channel === "tiktok" || pub.channel === "instagram") {
    if (pub.asset && pub.asset.ratio && !["9:16", "1:1"].includes(pub.asset.ratio)) {
      blockers.push(`Ratio ${pub.asset.ratio} no óptimo para ${pub.channel}`);
    }
  }

  return blockers;
}

// ── Queue derivation from publications ────────────────────────────────────────

export function buildSocialQueue(
  publications: SocialPublication[],
): SocialQueueItem[] {
  const now = new Date();

  const items: SocialQueueItem[] = publications
    .filter(p => p.status !== SOCIAL_STATUS.PUBLISHED && p.status !== SOCIAL_STATUS.CANCELLED)
    .map(p => {
      const isOverdue = p.scheduledAt
        ? new Date(p.scheduledAt).getTime() < now.getTime() &&
          p.status !== SOCIAL_STATUS.PUBLISHING
        : false;

      const readinessScore = computePublicationReadiness(p);

      return {
        publicationId:  p.id,
        channel:        p.channel,
        contentType:    p.contentType,
        status:         p.status,
        priority:       p.priority,
        campaignName:   p.campaignLink?.campaignName ?? null,
        scheduledAt:    p.scheduledAt,
        isOverdue,
        retryCount:     p.retry.retryCount,
        blockers:       p.blockers,
        readinessScore,
      };
    });

  return sortExecutionQueue(items);
}

// ── Queue sorting ──────────────────────────────────────────────────────────────

export function sortExecutionQueue(items: SocialQueueItem[]): SocialQueueItem[] {
  return [...items].sort((a, b) => {
    // 1. Retrying items go first
    const aStatusBoost = STATUS_PRIORITY_BOOST[a.status] ?? 0;
    const bStatusBoost = STATUS_PRIORITY_BOOST[b.status] ?? 0;
    if (aStatusBoost !== bStatusBoost) return aStatusBoost - bStatusBoost;

    // 2. Overdue items before scheduled
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;

    // 3. Priority
    const aPriority = PRIORITY_ORDER[a.priority] ?? 3;
    const bPriority = PRIORITY_ORDER[b.priority] ?? 3;
    if (aPriority !== bPriority) return aPriority - bPriority;

    // 4. Campaign-linked over standalone
    if (a.campaignName && !b.campaignName) return -1;
    if (!a.campaignName && b.campaignName) return 1;

    // 5. Scheduled time
    const aTime = a.scheduledAt ?? "9999";
    const bTime = b.scheduledAt ?? "9999";
    return aTime.localeCompare(bTime);
  });
}

// ── Readiness score ────────────────────────────────────────────────────────────

export function computePublicationReadiness(pub: SocialPublication): number {
  let score = 100;

  if (!pub.asset)              score -= 40;
  else if (!pub.asset.isReady) score -= 30;
  else if (!pub.asset.assetUrl)score -= 20;

  if (!pub.caption)            score -= 20;

  if (pub.retry.retryCount > 0) score -= Math.min(pub.retry.retryCount * 10, 30);

  if (pub.blockers.length > 0) score -= pub.blockers.length * 5;

  return Math.max(0, score);
}

// ── Blocked publications detection ────────────────────────────────────────────

export function detectBlockedPublications(
  publications: SocialPublication[],
): SocialPublication[] {
  return publications.filter(p =>
    p.status !== SOCIAL_STATUS.PUBLISHED &&
    p.status !== SOCIAL_STATUS.CANCELLED &&
    (p.blockers.length > 0 ||
     p.retry.failureType === "auth_failure" ||
     p.retry.retryCount >= p.retry.maxRetries),
  );
}

// ── Priority computation ───────────────────────────────────────────────────────

export function computeQueuePriority(opts: {
  isRetrying:       boolean;
  isOverdue:        boolean;
  isCampaignLinked: boolean;
  contentType:      string;
  scheduledAt:      string | null;
}): SocialPriority {
  if (opts.isRetrying)                              return SOCIAL_PRIORITY.CRITICAL;
  if (opts.isOverdue)                               return SOCIAL_PRIORITY.HIGH;
  if (opts.contentType === SOCIAL_CONTENT_TYPE.CAMPAIGN_LAUNCH) return SOCIAL_PRIORITY.HIGH;
  if (opts.contentType === SOCIAL_CONTENT_TYPE.PRODUCT_DROP)    return SOCIAL_PRIORITY.HIGH;
  if (opts.isCampaignLinked)                        return SOCIAL_PRIORITY.MEDIUM;
  return SOCIAL_PRIORITY.LOW;
}
