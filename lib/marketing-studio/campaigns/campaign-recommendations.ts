/**
 * lib/marketing-studio/campaigns/campaign-recommendations.ts
 *
 * MS-15 — Campaign Operating System: Luca + Mila campaign intelligence
 *
 * Pure computation. No Prisma. No async.
 */

import {
  CAMPAIGN_STATUS,
  type CampaignEntity,
  type CampaignRecommendation,
  type CampaignLaunchWindow,
  type CoordinationWarning,
} from "./campaign-types";

// ── Luca: strategy + commercial intelligence ──────────────────────────────────

export function generateCampaignLucaRecos(opts: {
  campaigns:     CampaignEntity[];
  launchWindows: CampaignLaunchWindow[];
  productCount:  number;
  warnings:      CoordinationWarning[];
}): CampaignRecommendation[] {
  const { campaigns, launchWindows, productCount, warnings } = opts;
  const recos: CampaignRecommendation[] = [];

  // Blocked launches
  const blocked = campaigns.filter(c =>
    c.readinessLevel === "blocked" &&
    (["planning", "scheduled"] as string[]).includes(c.status),
  );
  if (blocked.length > 0) {
    recos.push({
      key:               "blocked_launches",
      label:             "Lanzamientos bloqueados",
      detail:            `${blocked.length} campaña${blocked.length > 1 ? "s" : ""} no puede${blocked.length > 1 ? "n" : ""} lanzarse por activos o canales faltantes.`,
      urgency:           "critical",
      campaignId:        blocked[0].id,
      campaignName:      blocked[0].name,
      affectedCount:     blocked.length,
      recommendedAction: "Revisar readiness de cada campaña y completar assets críticos primero",
      agentLabel:        "Luca",
    });
  }

  // Overdue launches
  const overdue = launchWindows.filter(w => w.isOverdue && !w.isLive);
  if (overdue.length > 0) {
    recos.push({
      key:               "overdue_launches",
      label:             "Lanzamientos vencidos sin publicar",
      detail:            `${overdue.length} ventana${overdue.length > 1 ? "s" : ""} de lanzamiento ya pasó sin publicación.`,
      urgency:           "critical",
      affectedCount:     overdue.length,
      recommendedAction: "Reprogramar o ejecutar lanzamientos vencidos de inmediato",
      agentLabel:        "Luca",
    });
  }

  // TikTok underutilization
  const tiktokCampaigns = campaigns.filter(c =>
    !(c.channels as string[]).includes("tiktok") &&
    c.type === "launch" &&
    c.status !== CAMPAIGN_STATUS.COMPLETED,
  );
  if (tiktokCampaigns.length > 0) {
    recos.push({
      key:               "tiktok_underutilized",
      label:             "TikTok sin usar en lanzamientos activos",
      detail:            `${tiktokCampaigns.length} campaña${tiktokCampaigns.length > 1 ? "s" : ""} de lanzamiento no incluye TikTok. Canal de mayor alcance orgánico no explotado.`,
      urgency:           "high",
      affectedCount:     tiktokCampaigns.length,
      channel:           "tiktok",
      recommendedAction: "Agregar TikTok a campañas de lanzamiento con reels de 15–30s",
      agentLabel:        "Luca",
    });
  }

  // No teaser phase detected
  const launchesWithoutTeaser = campaigns.filter(c =>
    c.type === "launch" &&
    c.status === CAMPAIGN_STATUS.PLANNING &&
    !c.sequences.some(s => s.phase === "teaser"),
  );
  if (launchesWithoutTeaser.length > 0) {
    recos.push({
      key:               "missing_teaser_phase",
      label:             "Lanzamientos sin fase teaser",
      detail:            `${launchesWithoutTeaser.length} campaña${launchesWithoutTeaser.length > 1 ? "s" : ""} de lanzamiento sin fase teaser previa. El teaser genera anticipación y reduces CPA.`,
      urgency:           "medium",
      affectedCount:     launchesWithoutTeaser.length,
      recommendedAction: "Agregar secuencia de teaser 7 días antes del lanzamiento",
      agentLabel:        "Luca",
    });
  }

  // Missing hero creative
  const noHero = campaigns.filter(c =>
    c.status !== CAMPAIGN_STATUS.COMPLETED &&
    !c.contentSlots.some(s =>
      (s.contentType === "landing_hero" || s.contentType === "collection_banner") && s.isReady,
    ),
  );
  if (noHero.length > 0) {
    recos.push({
      key:               "missing_hero_creative",
      label:             "Campañas sin hero creativo",
      detail:            `${noHero.length} campaña${noHero.length > 1 ? "s" : ""} sin hero banner o landing hero listo. El hero es el activo de mayor conversión.`,
      urgency:           "high",
      affectedCount:     noHero.length,
      recommendedAction: "Priorizar generación de hero creative antes del lanzamiento",
      agentLabel:        "Luca",
    });
  }

  // High-product campaigns without distribution coverage
  const noCoverage = campaigns.filter(c =>
    c.productIds.length >= 3 &&
    c.readinessScore < 40 &&
    c.status !== CAMPAIGN_STATUS.COMPLETED,
  );
  if (noCoverage.length > 0) {
    recos.push({
      key:               "poor_distribution_coverage",
      label:             "Campañas con cobertura de distribución insuficiente",
      detail:            `${noCoverage.length} campaña${noCoverage.length > 1 ? "s" : ""} tienen productos suficientes pero readiness bajo. Revisar variantes y canales.`,
      urgency:           "medium",
      affectedCount:     noCoverage.length,
      recommendedAction: "Completar variantes de distribución para los productos de la campaña",
      agentLabel:        "Luca",
    });
  }

  // No active campaigns at all
  const activeCampaigns = campaigns.filter(c => c.status === CAMPAIGN_STATUS.ACTIVE);
  if (activeCampaigns.length === 0 && productCount > 0) {
    recos.push({
      key:               "no_active_campaigns",
      label:             "Sin campañas activas",
      detail:            `El catálogo tiene ${productCount} productos pero ninguna campaña activa. Oportunidad de activación desperdiciada.`,
      urgency:           "medium",
      affectedCount:     productCount,
      recommendedAction: "Crear una campaña evergreen o de lanzamiento para activar el catálogo",
      agentLabel:        "Luca",
    });
  }

  return recos.sort((a, b) => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.urgency] ?? 3) - (order[b.urgency] ?? 3);
  }).slice(0, 5);
}

// ── Mila: content + social commerce intelligence ──────────────────────────────

export function generateCampaignMilaRecos(opts: {
  campaigns:    CampaignEntity[];
  productCount: number;
}): CampaignRecommendation[] {
  const { campaigns, productCount } = opts;
  const recos: CampaignRecommendation[] = [];

  // Missing 9:16 assets (reels + stories)
  const noVertical = campaigns.filter(c =>
    c.status !== CAMPAIGN_STATUS.COMPLETED &&
    !c.contentSlots.some(s =>
      (s.contentType === "reel" || s.contentType === "story") && s.isReady,
    ),
  );
  if (noVertical.length > 0) {
    recos.push({
      key:               "missing_vertical_content",
      label:             "Campañas sin contenido vertical (9:16)",
      detail:            `${noVertical.length} campaña${noVertical.length > 1 ? "s" : ""} sin reels ni stories listos. Formato dominante en Instagram y TikTok.`,
      urgency:           "high",
      affectedCount:     noVertical.length,
      contentType:       "reel",
      recommendedAction: "Generar versiones 9:16 de los activos principales de cada campaña",
      agentLabel:        "Mila",
    });
  }

  // WhatsApp catalog pressure
  const whatsappCampaigns = campaigns.filter(c =>
    (c.channels as string[]).includes("whatsapp") &&
    c.status !== CAMPAIGN_STATUS.COMPLETED &&
    c.contentSlots.filter(s => s.channel === "whatsapp" && s.isReady).length === 0,
  );
  if (whatsappCampaigns.length > 0) {
    recos.push({
      key:               "whatsapp_catalog_missing",
      label:             "WhatsApp activo sin catálogo listo",
      detail:            `${whatsappCampaigns.length} campaña${whatsappCampaigns.length > 1 ? "s" : ""} con WhatsApp activado pero sin push copy ni catálogo preparado.`,
      urgency:           "high",
      affectedCount:     whatsappCampaigns.length,
      channel:           "whatsapp",
      recommendedAction: "Preparar catálogo de WhatsApp Business y texto del push antes de activar",
      agentLabel:        "Mila",
    });
  }

  // Instagram carousel opportunity
  const noCarousel = campaigns.filter(c =>
    (c.channels as string[]).includes("instagram") &&
    !c.contentSlots.some(s => s.contentType === "carousel" && s.isReady) &&
    c.productIds.length >= 3,
  );
  if (noCarousel.length > 0) {
    recos.push({
      key:               "instagram_carousel_opportunity",
      label:             "Oportunidad de carrusel en Instagram",
      detail:            `${noCarousel.length} campaña${noCarousel.length > 1 ? "s" : ""} con múltiples productos sin carrusel de Instagram. Formato ideal para colecciones.`,
      urgency:           "medium",
      affectedCount:     noCarousel.length,
      channel:           "instagram",
      contentType:       "carousel",
      recommendedAction: "Crear carrusel de productos para campaña de colección en Instagram",
      agentLabel:        "Mila",
    });
  }

  // Shopify collection sync
  const shopifyCampaigns = campaigns.filter(c =>
    (c.channels as string[]).includes("shopify") &&
    !c.contentSlots.some(s => s.channel === "shopify" && s.isReady),
  );
  if (shopifyCampaigns.length > 0) {
    recos.push({
      key:               "shopify_collection_missing",
      label:             "Colecciones Shopify sin actualizar",
      detail:            `${shopifyCampaigns.length} campaña${shopifyCampaigns.length > 1 ? "s" : ""} con Shopify activo pero sin banner de colección listo.`,
      urgency:           "medium",
      affectedCount:     shopifyCampaigns.length,
      channel:           "shopify",
      recommendedAction: "Actualizar banner de colección en Shopify antes del lanzamiento",
      agentLabel:        "Mila",
    });
  }

  return recos.sort((a, b) => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.urgency] ?? 3) - (order[b.urgency] ?? 3);
  }).slice(0, 4);
}
