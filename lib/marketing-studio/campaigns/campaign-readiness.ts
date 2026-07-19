/**
 * lib/marketing-studio/campaigns/campaign-readiness.ts
 *
 * MS-15 — Campaign Operating System: Readiness engine
 *
 * computeCampaignReadiness() — evaluates a campaign's launch readiness
 * across content, variants, channels, products, cadence, timing.
 *
 * Pure computation. No Prisma. No async.
 */

import {
  CAMPAIGN_READINESS_LEVEL,
  CHANNEL_REQUIRED_CONTENT,
  type CampaignEntity,
  type CampaignReadinessLevel,
  type ChannelType,
  type ContentType,
} from "./campaign-types";

// ── Readiness result ───────────────────────────────────────────────────────────

export interface CampaignReadinessResult {
  readinessScore:  number;           // 0–100
  readinessLevel:  CampaignReadinessLevel;
  missingItems:    string[];
  warnings:        string[];
  recommendations: string[];
  breakdown: {
    contentScore:      number;
    channelScore:      number;
    productScore:      number;
    cadenceScore:      number;
    timingScore:       number;
  };
}

// ── Main computation ───────────────────────────────────────────────────────────

export function computeCampaignReadiness(
  campaign: CampaignEntity,
  opts?: {
    totalProducts?: number;
    variantCoverage?: Record<string, number>; // channel → 0-100
    hasScheduledDate?: boolean;
    averagePostsPerWeek?: number;
  },
): CampaignReadinessResult {
  const missingItems:    string[] = [];
  const warnings:        string[] = [];
  const recommendations: string[] = [];

  // ── 1. Content score (40% weight) ──────────────────────────────────────────
  let contentScore = 100;
  const readySlots  = campaign.contentSlots.filter(s => s.isReady).length;
  const totalSlots  = campaign.contentSlots.length;

  if (totalSlots === 0) {
    contentScore = 0;
    missingItems.push("No hay slots de contenido definidos para esta campaña");
  } else {
    const contentPct = (readySlots / totalSlots) * 100;
    contentScore     = Math.round(contentPct);
    if (contentPct < 100) {
      const missing = totalSlots - readySlots;
      missingItems.push(`${missing} slot${missing > 1 ? "s" : ""} de contenido sin asset listo`);
    }
  }

  // Required content per channel
  for (const channel of campaign.channels as ChannelType[]) {
    const required = CHANNEL_REQUIRED_CONTENT[channel] ?? [];
    const present  = campaign.contentSlots
      .filter(s => s.channel === channel && s.isReady)
      .map(s => s.contentType);
    for (const req of required) {
      if (!present.includes(req as ContentType)) {
        missingItems.push(`Falta "${req}" en canal ${channel}`);
        contentScore = Math.max(0, contentScore - 10);
      }
    }
  }

  // ── 2. Channel score (20% weight) ──────────────────────────────────────────
  let channelScore = 100;
  if (campaign.channels.length === 0) {
    channelScore = 0;
    missingItems.push("No hay canales configurados para esta campaña");
  } else {
    for (const channel of campaign.channels as ChannelType[]) {
      const coverage = opts?.variantCoverage?.[channel] ?? 0;
      if (coverage < 30) {
        channelScore = Math.max(0, channelScore - 25);
        missingItems.push(`Canal ${channel}: cobertura de variantes muy baja (${Math.round(coverage)}%)`);
      } else if (coverage < 70) {
        channelScore = Math.max(0, channelScore - 10);
        warnings.push(`Canal ${channel}: cobertura de variantes incompleta (${Math.round(coverage)}%)`);
      }
    }
  }

  // ── 3. Product score (20% weight) ──────────────────────────────────────────
  let productScore = 100;
  const totalProducts = opts?.totalProducts ?? 0;
  if (campaign.productIds.length === 0) {
    productScore = 0;
    missingItems.push("No hay productos asociados a esta campaña");
  } else if (totalProducts > 0) {
    const coveragePct = (campaign.productIds.length / totalProducts) * 100;
    if (coveragePct < 20) {
      productScore = 40;
      warnings.push("Campaña cubre menos del 20% del catálogo");
    }
  }

  // ── 4. Cadence score (10% weight) ──────────────────────────────────────────
  let cadenceScore = 100;
  const postsPerWeek = opts?.averagePostsPerWeek ?? 0;
  if (postsPerWeek === 0) {
    cadenceScore = 30;
    warnings.push("No se ha definido cadencia de publicación");
    recommendations.push("Configurar cadencia de publicación semanal");
  } else if (postsPerWeek > 14) {
    cadenceScore = 60;
    warnings.push("Cadencia demasiado agresiva puede generar fatiga de audiencia");
    recommendations.push("Reducir frecuencia a máximo 7–10 posts/semana por canal");
  }

  // Check sequence completeness
  const completeSequences = campaign.sequences.filter(s => s.isComplete).length;
  const totalSequences    = campaign.sequences.length;
  if (totalSequences > 0 && completeSequences < totalSequences) {
    const incomplete = totalSequences - completeSequences;
    cadenceScore = Math.max(0, cadenceScore - incomplete * 15);
    warnings.push(`${incomplete} fase${incomplete > 1 ? "s" : ""} de secuencia incompleta${incomplete > 1 ? "s" : ""}`);
  }

  // ── 5. Timing score (10% weight) ───────────────────────────────────────────
  let timingScore = 100;
  const hasScheduled = opts?.hasScheduledDate ?? !!campaign.startDate;
  if (!hasScheduled) {
    timingScore = 50;
    warnings.push("Campaña sin fecha de inicio programada");
    recommendations.push("Establecer ventana de lanzamiento");
  } else if (campaign.startDate) {
    const daysToLaunch = Math.round(
      (new Date(campaign.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    if (daysToLaunch < 0) {
      timingScore = 30;
      missingItems.push("Campaña pasó su fecha de lanzamiento sin publicarse");
    } else if (daysToLaunch < 3 && contentScore < 80) {
      warnings.push(`Solo ${daysToLaunch}d para el lanzamiento con contenido incompleto`);
      timingScore = 60;
    }
  }

  // ── Sequences recommendations ───────────────────────────────────────────────
  if (campaign.sequences.length === 0 && campaign.type === "launch") {
    recommendations.push("Agregar secuencia de lanzamiento (teaser → reveal → launch)");
  }

  // TikTok / reel check
  const hasTikTok = campaign.channels.includes("tiktok");
  const hasReel   = campaign.contentSlots.some(s => s.contentType === "reel" && s.isReady);
  if (hasTikTok && !hasReel) {
    missingItems.push("TikTok activo pero sin reels listos");
    recommendations.push("Preparar al menos 2 reels verticales para TikTok antes del lanzamiento");
  }

  // WhatsApp check
  const hasWA   = campaign.channels.includes("whatsapp");
  const hasPush = campaign.contentSlots.some(s => s.contentType === "whatsapp_push" && s.isReady);
  if (hasWA && !hasPush) {
    missingItems.push("WhatsApp activo pero sin push copy listo");
    recommendations.push("Preparar mensaje de push y catálogo antes de activar WhatsApp");
  }

  // ── Weighted total score ────────────────────────────────────────────────────
  const readinessScore = Math.round(
    contentScore  * 0.40 +
    channelScore  * 0.20 +
    productScore  * 0.20 +
    cadenceScore  * 0.10 +
    timingScore   * 0.10,
  );

  const readinessLevel = deriveReadinessLevel(readinessScore, missingItems.length);

  return {
    readinessScore,
    readinessLevel,
    missingItems,
    warnings,
    recommendations,
    breakdown: {
      contentScore,
      channelScore,
      productScore,
      cadenceScore,
      timingScore,
    },
  };
}

function deriveReadinessLevel(
  score:        number,
  missingCount: number,
): CampaignReadinessLevel {
  if (missingCount >= 3 || score < 30) return CAMPAIGN_READINESS_LEVEL.BLOCKED;
  if (score < 60)                      return CAMPAIGN_READINESS_LEVEL.PARTIAL;
  if (score < 85)                      return CAMPAIGN_READINESS_LEVEL.READY;
  return CAMPAIGN_READINESS_LEVEL.EXCELLENT;
}
