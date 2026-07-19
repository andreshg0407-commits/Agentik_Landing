/**
 * lib/marketing-studio/campaigns/campaign-health.ts
 *
 * MS-15 — Campaign Operating System: Health computation
 *
 * computeCampaignHealth() — derives CampaignHealthSummary from runtime state.
 *
 * Pure computation. No Prisma. No async.
 */

import {
  CAMPAIGN_STATUS,
  CAMPAIGN_HEALTH_LEVEL,
  type CampaignEntity,
  type CampaignHealthSummary,
  type CampaignLaunchWindow,
  type ChannelType,
} from "./campaign-types";

// ── Health computation ─────────────────────────────────────────────────────────

export function computeCampaignHealth(opts: {
  campaigns:     CampaignEntity[];
  launchWindows: CampaignLaunchWindow[];
}): CampaignHealthSummary {
  const { campaigns, launchWindows } = opts;

  const now = new Date();

  const activeCampaigns = campaigns.filter(c =>
    c.status === CAMPAIGN_STATUS.ACTIVE ||
    c.status === CAMPAIGN_STATUS.SCHEDULED,
  ).length;

  const blockedLaunches = campaigns.filter(c =>
    c.readinessLevel === "blocked" &&
    (c.status === CAMPAIGN_STATUS.PLANNING || c.status === CAMPAIGN_STATUS.SCHEDULED),
  ).length;

  const overduePublications = launchWindows.filter(w => w.isOverdue && !w.isLive).length;

  const missingAssets = campaigns.reduce((sum, c) => {
    return sum + c.contentSlots.filter(s => !s.isReady).length;
  }, 0);

  const staleCampaigns = campaigns.filter(c =>
    c.status === CAMPAIGN_STATUS.PAUSED ||
    (c.status === CAMPAIGN_STATUS.ACTIVE && c.readinessScore < 30),
  ).length;

  // Channel-specific readiness (avg across campaigns)
  const tiktokReadiness   = computeChannelReadiness(campaigns, "tiktok");
  const whatsappReadiness = computeChannelReadiness(campaigns, "whatsapp");
  const shopifySync       = computeChannelReadiness(campaigns, "shopify");

  const launchPressure = deriveLaunchPressure({
    blockedLaunches,
    overduePublications,
    activeCampaigns,
    missingAssets,
  });

  const level = deriveHealthLevel({
    blockedLaunches,
    overduePublications,
    staleCampaigns,
    activeCampaigns,
    missingAssets,
  });

  const label = HEALTH_LABELS[level as string] ?? level;

  return {
    level:  level as import("./campaign-types").CampaignHealthLevel,
    label,
    activeCampaigns,
    blockedLaunches,
    overduePublications,
    missingAssets,
    staleCampaigns,
    tiktokReadiness,
    whatsappReadiness,
    shopifySync,
    launchPressure,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function computeChannelReadiness(
  campaigns: CampaignEntity[],
  channel:   ChannelType,
): number {
  const relevantCampaigns = campaigns.filter(c =>
    (c.channels as string[]).includes(channel) &&
    c.status !== CAMPAIGN_STATUS.COMPLETED &&
    c.status !== CAMPAIGN_STATUS.FAILED,
  );

  if (relevantCampaigns.length === 0) return 100;

  const avgScore = relevantCampaigns.reduce((sum, c) => sum + c.readinessScore, 0) /
    relevantCampaigns.length;

  return Math.round(avgScore);
}

function deriveLaunchPressure(opts: {
  blockedLaunches:     number;
  overduePublications: number;
  activeCampaigns:     number;
  missingAssets:       number;
}): "low" | "medium" | "high" | "critical" {
  const { blockedLaunches, overduePublications, missingAssets } = opts;
  if (blockedLaunches >= 2 || overduePublications >= 3)  return "critical";
  if (blockedLaunches >= 1 || overduePublications >= 1)  return "high";
  if (missingAssets > 10)                                return "medium";
  return "low";
}

function deriveHealthLevel(opts: {
  blockedLaunches:     number;
  overduePublications: number;
  staleCampaigns:      number;
  activeCampaigns:     number;
  missingAssets:       number;
}): string {
  const { blockedLaunches, overduePublications, staleCampaigns, activeCampaigns, missingAssets } = opts;

  if (blockedLaunches >= 2 || overduePublications >= 3)  return CAMPAIGN_HEALTH_LEVEL.CRITICAL;
  if (blockedLaunches >= 1 || overduePublications >= 1)  return CAMPAIGN_HEALTH_LEVEL.WARNING;
  if (staleCampaigns >= 2 || missingAssets > 20)         return CAMPAIGN_HEALTH_LEVEL.WARNING;
  if (activeCampaigns === 0)                             return CAMPAIGN_HEALTH_LEVEL.STALLED;
  return CAMPAIGN_HEALTH_LEVEL.HEALTHY;
}

const HEALTH_LABELS: Record<string, string> = {
  healthy:  "Sistema de campañas operativo",
  warning:  "Campañas con riesgo de retraso",
  critical: "Lanzamientos bloqueados",
  stalled:  "Sin campañas activas",
};
