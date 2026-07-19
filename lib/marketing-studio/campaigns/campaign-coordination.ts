/**
 * lib/marketing-studio/campaigns/campaign-coordination.ts
 *
 * MS-15 — Campaign Operating System: Cross-channel coordination engine
 *
 * computeCoordination() — detects cross-channel dependencies, warnings,
 * and suggestions for orchestrated multi-channel campaigns.
 *
 * Pure computation. No Prisma. No async.
 */

import {
  type CampaignEntity,
  type CoordinationWarning,
  type CoordinationSuggestion,
  type DependencyEdge,
  type ChannelType,
} from "./campaign-types";

// ── Cross-channel dependency rules ────────────────────────────────────────────

const DEPENDENCY_RULES: {
  fromChannel:  ChannelType;
  toChannel:    ChannelType;
  description:  string;
  triggerType:  string;
  suggestion:   string;
}[] = [
  {
    fromChannel: "tiktok",
    toChannel:   "whatsapp",
    description: "Lanzamiento TikTok debería coordinarse con push WhatsApp",
    triggerType: "tiktok.launch",
    suggestion:  "Coordinar push WhatsApp simultáneo al lanzamiento en TikTok para maximizar impacto",
  },
  {
    fromChannel: "shopify",
    toChannel:   "landing",
    description: "Lanzamiento de colección Shopify requiere actualización de Landing hero",
    triggerType: "shopify.collection_launch",
    suggestion:  "Actualizar hero banner en landing page al mismo tiempo que la colección en Shopify",
  },
  {
    fromChannel: "instagram",
    toChannel:   "instagram",
    description: "Carrusel de Instagram requiere soporte de story para el mismo día",
    triggerType: "instagram.carousel",
    suggestion:  "Preparar story de soporte para el día del carrusel (swipe-up o link en bio)",
  },
  {
    fromChannel: "whatsapp",
    toChannel:   "shopify",
    description: "Push de WhatsApp requiere que el catálogo Shopify esté sincronizado",
    triggerType: "whatsapp.push",
    suggestion:  "Asegurar que los productos mencionados en el push estén publicados en Shopify",
  },
  {
    fromChannel: "ads",
    toChannel:   "landing",
    description: "Campaña de Ads requiere landing page con CTA activa",
    triggerType: "ads.campaign",
    suggestion:  "Verificar que la landing destino de los ads esté activa y optimizada para conversión",
  },
  {
    fromChannel: "email",
    toChannel:   "shopify",
    description: "Email marketing requiere que los productos estén activos en Shopify",
    triggerType: "email.blast",
    suggestion:  "Confirmar disponibilidad de stock y precio antes de enviar email",
  },
];

// ── Coordination result ────────────────────────────────────────────────────────

export interface CoordinationResult {
  warnings:    CoordinationWarning[];
  suggestions: CoordinationSuggestion[];
  dependencies: DependencyEdge[];
}

// ── Main computation ───────────────────────────────────────────────────────────

export function computeCoordination(
  campaigns: CampaignEntity[],
): CoordinationResult {
  const warnings:     CoordinationWarning[]  = [];
  const suggestions:  CoordinationSuggestion[] = [];
  const dependencies: DependencyEdge[]       = [];

  const activeCampaigns = campaigns.filter(c =>
    c.status !== "completed" && c.status !== "failed",
  );

  for (const campaign of activeCampaigns) {
    const channels = campaign.channels as ChannelType[];

    // Check each dependency rule against this campaign's channels
    for (const rule of DEPENDENCY_RULES) {
      const hasFrom = channels.includes(rule.fromChannel);
      const hasTo   = channels.includes(rule.toChannel);

      if (!hasFrom) continue;

      // Check if FROM channel content is ready
      const fromReady = campaign.contentSlots.some(
        s => s.channel === rule.fromChannel && s.isReady,
      );

      // Check if TO channel content is ready
      const toReady = hasTo
        ? campaign.contentSlots.some(s => s.channel === rule.toChannel && s.isReady)
        : false;

      // Build dependency edge
      dependencies.push({
        fromChannel: rule.fromChannel,
        toChannel:   rule.toChannel,
        description: rule.description,
        isMet:       !hasFrom || toReady,
      });

      if (hasFrom && hasTo && fromReady && !toReady) {
        // FROM is ready but TO is not — potential coordination issue
        warnings.push({
          key:        `dep_${rule.fromChannel}_${rule.toChannel}_${campaign.id}`,
          label:      `${rule.fromChannel} listo, ${rule.toChannel} pendiente`,
          detail:     `Campaña "${campaign.name}": ${rule.description}`,
          channels:   [rule.fromChannel, rule.toChannel],
          campaignId: campaign.id,
          severity:   "warning",
        });
      } else if (hasFrom && !hasTo) {
        // Campaign uses FROM but not TO — missed opportunity
        suggestions.push({
          key:               `opp_${rule.fromChannel}_${rule.toChannel}_${campaign.id}`,
          label:             `Añadir ${rule.toChannel} a campaña "${campaign.name}"`,
          detail:            rule.description,
          fromChannel:       rule.fromChannel,
          toChannel:         rule.toChannel,
          triggerType:       rule.triggerType,
          recommendedAction: rule.suggestion,
        });
      }
    }

    // Detect oversaturation: same channel in multiple concurrent active campaigns
  }

  // Detect channel oversaturation across all campaigns
  const channelCampaignCount: Record<string, number> = {};
  for (const campaign of activeCampaigns) {
    for (const ch of campaign.channels) {
      channelCampaignCount[ch] = (channelCampaignCount[ch] ?? 0) + 1;
    }
  }
  for (const [channel, count] of Object.entries(channelCampaignCount)) {
    if (count >= 3) {
      warnings.push({
        key:      `oversaturation_${channel}`,
        label:    `Saturación en ${channel}`,
        detail:   `${count} campañas activas comparten el canal ${channel}. Puede generar solapamiento y fatiga de audiencia.`,
        channels: [channel as ChannelType],
        severity: count >= 5 ? "critical" : "warning",
      });
    }
  }

  return {
    warnings:     warnings.slice(0, 10),
    suggestions:  suggestions.slice(0, 8),
    dependencies: deduplicateDependencies(dependencies),
  };
}

function deduplicateDependencies(deps: DependencyEdge[]): DependencyEdge[] {
  const seen = new Set<string>();
  return deps.filter(d => {
    const key = `${d.fromChannel}:${d.toChannel}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
