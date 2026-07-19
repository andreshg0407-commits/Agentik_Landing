/**
 * lib/marketing-studio/distribution/distribution-recommendations.ts
 *
 * MS-14 — Distribution Runtime: Luca + Mila intelligence
 *
 * Generates agent-branded recommendations from distribution state.
 * Pure computation — no Prisma, no async.
 */

import type {
  DistributionRecommendation,
  DistributionPipelineDTO,
  DistributionScheduleDTO,
  ChannelCoverageItem,
  VariantGapSummary,
} from "./distribution-types";

// ── Luca signals (commercial intelligence) ────────────────────────────────────

/**
 * Luca analyzes commercial impact: revenue loss from missing channels,
 * pipeline failures, stale inventory.
 */
export function generateDistributionLucaRecos(opts: {
  pipelines:       DistributionPipelineDTO[];
  schedules:       DistributionScheduleDTO[];
  channelCoverage: ChannelCoverageItem[];
  variantGaps:     VariantGapSummary[];
  productCount:    number;
}): DistributionRecommendation[] {
  const { pipelines, schedules, channelCoverage, variantGaps, productCount } = opts;
  const recos: DistributionRecommendation[] = [];

  // Failed pipelines
  const failed = pipelines.filter(p => p.status === "failed");
  if (failed.length > 0) {
    recos.push({
      key:               "failed_pipelines",
      label:             "Pipelines con fallas",
      detail:            `${failed.length} pipeline${failed.length > 1 ? "s" : ""} fallaron y dejan canales sin contenido activo.`,
      urgency:           "critical",
      affectedCount:     failed.length,
      recommendedAction: "Revisar errores y reintentar pipelines fallidos",
      agentLabel:        "Luca",
    });
  }

  // Critical channel coverage
  const criticalChannels = channelCoverage.filter(c => c.coveragePct < 30 && c.totalProducts > 0);
  for (const ch of criticalChannels.slice(0, 2)) {
    recos.push({
      key:               `critical_channel_${ch.channel}`,
      label:             `Cobertura crítica: ${ch.channel}`,
      detail:            `Solo ${Math.round(ch.coveragePct)}% de productos tienen variantes listas para ${ch.channel}. ${ch.missing} productos sin cobertura.`,
      urgency:           "critical",
      channel:           ch.channel,
      affectedCount:     ch.missing,
      recommendedAction: "Generar variantes faltantes para activar canal",
      agentLabel:        "Luca",
    });
  }

  // Overdue scheduled drops
  const now = new Date();
  const overdue = schedules.filter(s =>
    s.scheduledAt &&
    new Date(s.scheduledAt) < now &&
    s.status === "pending",
  );
  if (overdue.length > 0) {
    recos.push({
      key:               "overdue_drops",
      label:             "Drops programados vencidos",
      detail:            `${overdue.length} drop${overdue.length > 1 ? "s" : ""} no se ejecutó en la fecha programada.`,
      urgency:           "high",
      affectedCount:     overdue.length,
      recommendedAction: "Reprogramar o ejecutar drops vencidos",
      agentLabel:        "Luca",
    });
  }

  // High missing variant counts
  const topGap = variantGaps[0];
  if (topGap && topGap.missingCount >= 5) {
    recos.push({
      key:               `variant_gap_${topGap.purpose}_${topGap.channel}`,
      label:             `Variantes "${topGap.purpose}" faltantes`,
      detail:            `${topGap.missingCount} productos sin variante "${topGap.purpose}" para el canal ${topGap.channel}.`,
      urgency:           topGap.missingCount > 10 ? "high" : "medium",
      channel:           topGap.channel,
      affectedCount:     topGap.missingCount,
      recommendedAction: "Solicitar generación de variantes en lote",
      agentLabel:        "Luca",
    });
  }

  // No active pipelines
  const activePipelines = pipelines.filter(p =>
    ["draft", "scheduled", "queued", "publishing"].includes(p.status),
  );
  if (activePipelines.length === 0 && productCount > 0) {
    recos.push({
      key:               "no_active_pipelines",
      label:             "Sin pipelines activos",
      detail:            `No hay ningún pipeline en curso. El catálogo de ${productCount} productos no está siendo distribuido activamente.`,
      urgency:           "medium",
      affectedCount:     productCount,
      recommendedAction: "Crear un pipeline de distribución para los canales prioritarios",
      agentLabel:        "Luca",
    });
  }

  return recos.slice(0, 5);
}

// ── Mila signals (content intelligence) ──────────────────────────────────────

/**
 * Mila analyzes content completeness: missing formats, ratio issues,
 * content freshness.
 */
export function generateDistributionMilaRecos(opts: {
  channelCoverage: ChannelCoverageItem[];
  variantGaps:     VariantGapSummary[];
  productCount:    number;
}): DistributionRecommendation[] {
  const { channelCoverage, variantGaps, productCount } = opts;
  const recos: DistributionRecommendation[] = [];

  // Channels with moderate coverage needing attention
  const degradedChannels = channelCoverage.filter(
    c => c.coveragePct >= 30 && c.coveragePct < 70 && c.totalProducts > 0,
  );
  if (degradedChannels.length > 0) {
    const ch = degradedChannels[0];
    recos.push({
      key:               `degraded_coverage_${ch.channel}`,
      label:             `Cobertura incompleta: ${ch.channel}`,
      detail:            `${Math.round(ch.coveragePct)}% de productos tienen variantes para ${ch.channel}. Faltan ${ch.missing} productos.`,
      urgency:           "medium",
      channel:           ch.channel,
      affectedCount:     ch.missing,
      recommendedAction: "Completar variantes de contenido para el canal",
      agentLabel:        "Mila",
    });
  }

  // Story/Reel variants missing (social-first content)
  const socialGaps = variantGaps.filter(g =>
    ["story", "reel", "feed"].includes(g.purpose) && g.missingCount > 0,
  );
  if (socialGaps.length > 0) {
    const top = socialGaps[0];
    recos.push({
      key:               `social_gap_${top.purpose}`,
      label:             `Formato social "${top.purpose}" incompleto`,
      detail:            `${top.missingCount} producto${top.missingCount > 1 ? "s" : ""} sin variante "${top.purpose}" para redes sociales.`,
      urgency:           "medium",
      affectedCount:     top.missingCount,
      recommendedAction: "Generar versiones de story/reel para activos pendientes",
      agentLabel:        "Mila",
    });
  }

  // Hero/landing variants missing
  const webGaps = variantGaps.filter(g =>
    ["hero", "landing_banner", "collection_cover"].includes(g.purpose) && g.missingCount > 0,
  );
  if (webGaps.length > 0) {
    const top = webGaps[0];
    recos.push({
      key:               `web_gap_${top.purpose}`,
      label:             `Variantes web "${top.purpose}" faltantes`,
      detail:            `${top.missingCount} producto${top.missingCount > 1 ? "s" : ""} sin variante "${top.purpose}" para web/landing.`,
      urgency:           "low",
      affectedCount:     top.missingCount,
      recommendedAction: "Preparar versiones hero/banner para publicación web",
      agentLabel:        "Mila",
    });
  }

  // No variants at all
  if (variantGaps.length === 0 && productCount > 0) {
    const totalCoverage = channelCoverage.reduce((sum, c) => sum + c.coveragePct, 0);
    const avgCoverage   = channelCoverage.length > 0 ? totalCoverage / channelCoverage.length : 0;
    if (avgCoverage >= 80) {
      recos.push({
        key:               "content_coverage_ok",
        label:             "Cobertura de contenido completa",
        detail:            "Todos los canales activos tienen variantes de contenido preparadas.",
        urgency:           "low",
        affectedCount:     0,
        recommendedAction: "Mantener ciclo de actualización de contenido",
        agentLabel:        "Mila",
      });
    }
  }

  return recos.slice(0, 4);
}
