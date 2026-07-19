/**
 * lib/marketing-studio/ads/ads-analytics-history-service.ts
 *
 * MARKETING-ANALYTICS-HISTORY-01 — Servicio de Historial de Métricas de Anuncios
 * SERVER ONLY — @server-only
 *
 * Responsabilidad:
 *   - Persistir snapshots de métricas desde AdsAnalyticsResult.
 *   - Leer series históricas por tenant y plataforma.
 *   - Calcular tendencias temporales (spend, clicks, CTR).
 *   - Comparar períodos actual vs anterior.
 *   - Generar insights históricos de Luca.
 *   - Nunca llamar Meta/TikTok directamente — eso es trabajo de Ads Analytics Live.
 *   - Nunca guardar tokens ni payloads crudos sensibles.
 *
 * Principio de datos:
 *   AdsAnalyticsResult es la fuente de entrada — solo métricas normalizadas entran al historial.
 *   El historial es una capa adicional; Analytics Live no depende de él para funcionar.
 */
import "server-only";

import { prisma }          from "@/lib/prisma";
import type {
  AdsMetricSnapshotRecord,
  AdsTrendPoint,
  AdsTrendSeries,
  AdsPeriodComparison,
  AdsPeriodMetrics,
  AdsMetricDelta,
  AdsHistorySummary,
  AdsHistoryInsight,
  AdsHistoryRange,
  AdsChangeSentiment,
} from "./ads-analytics-history-types";
import type {
  AdsAnalyticsResult,
  AdsAnalyticsItem,
  AdsAnalyticsRange,
} from "./ads-analytics-types";

// ── Internal DB accessor ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => (prisma as any).adsMetricSnapshot;

// ── Date helpers ───────────────────────────────────────────────────────────────

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns previous range label for period comparison */
function previousRange(range: AdsHistoryRange): AdsHistoryRange {
  if (range === "today")   return "today";
  if (range === "week")    return "week";
  if (range === "month")   return "month";
  if (range === "quarter") return "quarter";
  return "week";
}

/** Number of days to look back per range */
function daysForRange(range: AdsHistoryRange): number {
  if (range === "today")   return 1;
  if (range === "week")    return 7;
  if (range === "month")   return 30;
  if (range === "quarter") return 90;
  return 7;
}

function dateNDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// ── Row → domain mapper ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): AdsMetricSnapshotRecord {
  return {
    id:                 row.id,
    tenantId:           row.tenantId,
    executionId:        row.executionId,
    provider:           row.provider,
    platform:           row.platform,
    externalCampaignId: row.externalCampaignId ?? null,
    externalAdsetId:    row.externalAdsetId    ?? null,
    externalAdId:       row.externalAdId       ?? null,
    range:              row.range,
    date:               row.date,
    currency:           row.currency           ?? "USD",
    spend:              row.spend              ?? 0,
    impressions:        row.impressions        ?? 0,
    reach:              row.reach              ?? 0,
    clicks:             row.clicks             ?? 0,
    ctr:                row.ctr                ?? 0,
    cpc:                row.cpc                ?? 0,
    cpm:                row.cpm                ?? 0,
    conversions:        row.conversions        ?? 0,
    results:            row.results            ?? 0,
    costPerResult:      row.costPerResult      ?? 0,
    externalStatus:     row.externalStatus     ?? "unknown",
    providerStatus:     row.providerStatus     ?? null,
    createdAt:          (row.createdAt as Date).toISOString(),
  };
}

// ── Insight builders ───────────────────────────────────────────────────────────

let insightSeq = 0;
function nextId(): string { return `hist_ins_${++insightSeq}`; }

function buildHistoryInsights(
  series:     AdsTrendSeries[],
  comparison: AdsPeriodComparison | null,
  snapshotCount: number,
): AdsHistoryInsight[] {
  const insights: AdsHistoryInsight[] = [];

  // Not enough data
  if (snapshotCount === 0) {
    insights.push({
      id:          nextId(),
      type:        "trend_no_data",
      severity:    "info",
      title:       "Sin historial disponible",
      description: "Agentik comenzará a construir el historial de métricas una vez que se publiquen anuncios y se obtengan métricas reales.",
      action:      "Publicar anuncios en el módulo de Pauta",
      platform:    null,
    });
    return insights;
  }

  if (snapshotCount < 3) {
    insights.push({
      id:          nextId(),
      type:        "trend_insufficient_history",
      severity:    "info",
      title:       "Historial insuficiente para tendencias confiables",
      description: "Se necesitan al menos 3 mediciones para detectar tendencias. Agentik seguirá acumulando datos.",
      action:      null,
      platform:    null,
    });
    return insights;
  }

  // Analyze period comparison
  if (comparison?.hasEnoughData && comparison.deltas.length > 0) {
    const spendDelta  = comparison.deltas.find(d => d.metric === "spend");
    const clicksDelta = comparison.deltas.find(d => d.metric === "clicks");
    const ctrDelta    = comparison.deltas.find(d => d.metric === "ctr");
    const cpcDelta    = comparison.deltas.find(d => d.metric === "cpc");

    // Spend up, clicks down
    if (
      spendDelta?.deltaPercent && spendDelta.deltaPercent > 10 &&
      clicksDelta?.deltaPercent && clicksDelta.deltaPercent < -5
    ) {
      insights.push({
        id:          nextId(),
        type:        "trend_spend_up_clicks_down",
        severity:    "warning",
        title:       "Inversión subió pero los clics bajaron",
        description: `La inversión subió ${Math.round(spendDelta.deltaPercent)}%, pero los clics bajaron ${Math.abs(Math.round(clicksDelta.deltaPercent))}% respecto al período anterior. Considera revisar creatividad o segmentación.`,
        action:      "Revisar creativos y segmentación de audiencia",
        platform:    null,
      });
    }

    // CTR declining
    if (ctrDelta?.deltaPercent && ctrDelta.deltaPercent < -10) {
      insights.push({
        id:          nextId(),
        type:        "trend_declining_ctr",
        severity:    "warning",
        title:       "CTR en tendencia descendente",
        description: `El CTR bajó ${Math.abs(Math.round(ctrDelta.deltaPercent))}% respecto al período anterior. La efectividad de los anuncios puede estar disminuyendo.`,
        action:      "Actualizar creativos o ajustar audiencia objetivo",
        platform:    null,
      });
    }

    // CTR improving
    if (ctrDelta?.deltaPercent && ctrDelta.deltaPercent > 15) {
      insights.push({
        id:          nextId(),
        type:        "trend_improving_ctr",
        severity:    "opportunity",
        title:       "CTR mejorando respecto al período anterior",
        description: `El CTR subió ${Math.round(ctrDelta.deltaPercent)}% comparado con el período anterior. Las optimizaciones recientes están teniendo impacto positivo.`,
        action:      null,
        platform:    null,
      });
    }

    // CPC getting cheaper
    if (cpcDelta?.deltaPercent && cpcDelta.deltaPercent < -10) {
      insights.push({
        id:          nextId(),
        type:        "trend_stable",
        severity:    "opportunity",
        title:       "Costo por clic reduciéndose",
        description: `El CPC bajó ${Math.abs(Math.round(cpcDelta.deltaPercent))}% respecto al período anterior. La eficiencia de la inversión está mejorando.`,
        action:      null,
        platform:    null,
      });
    }
  }

  // Multi-platform analysis
  const metaSeries   = series.find(s => s.platform === "meta");
  const tiktokSeries = series.find(s => s.platform === "tiktok");

  if (metaSeries?.latest && tiktokSeries?.latest) {
    const metaCpc   = metaSeries.latest.cpc;
    const tiktokCpc = tiktokSeries.latest.cpc;

    if (tiktokCpc > 0 && metaCpc > 0) {
      if (tiktokCpc < metaCpc * 0.8) {
        insights.push({
          id:          nextId(),
          type:        "trend_tiktok_better_cpc",
          severity:    "opportunity",
          title:       "TikTok mantiene mejor costo por resultado",
          description: `TikTok mantiene mejor costo por clic que Meta en el período analizado. Considera reasignar parte del presupuesto hacia TikTok.`,
          action:      "Analizar distribución de presupuesto entre plataformas",
          platform:    "tiktok",
        });
      } else if (metaCpc < tiktokCpc * 0.8) {
        insights.push({
          id:          nextId(),
          type:        "trend_meta_better_reach",
          severity:    "opportunity",
          title:       "Meta con mejor costo por clic en el período",
          description: `Meta tiene mejor CPC que TikTok en los datos históricos recientes. Puede ser conveniente aumentar la inversión en Meta.`,
          action:      "Analizar distribución de presupuesto entre plataformas",
          platform:    "meta",
        });
      }
    }
  }

  if (insights.length === 0) {
    insights.push({
      id:          nextId(),
      type:        "trend_stable",
      severity:    "info",
      title:       "Comportamiento estable en el período",
      description: "Las métricas se mantienen dentro de rangos normales. Agentik seguirá monitoreando para detectar cambios significativos.",
      action:      null,
      platform:    null,
    });
  }

  return insights;
}

// ── recordAdsMetricSnapshot ────────────────────────────────────────────────────

/**
 * Persiste un snapshot de métricas para una ejecución.
 * Upsert por tenantId + executionId + range + date.
 * Nunca guarda tokens ni payloads crudos.
 * Nunca lanza — los fallos de persistencia son no-fatales.
 *
 * @param tenantId — orgSlug del tenant.
 * @param item     — AdsAnalyticsItem con métricas normalizadas.
 * @param range    — Rango temporal de la consulta.
 */
export async function recordAdsMetricSnapshot(
  tenantId: string,
  item:     AdsAnalyticsItem,
  range:    AdsAnalyticsRange,
): Promise<boolean> {
  if (!tenantId || !item.executionId) return false;

  const date    = todayDateString();
  const m       = item.metric;

  const results       = m.conversions; // generalize as "results"
  const costPerResult = results > 0 ? m.spend / results : 0;

  try {
    await db().upsert({
      where: {
        tenantId_executionId_range_date: {
          tenantId,
          executionId: item.executionId,
          range,
          date,
        },
      },
      update: {
        spend:       m.spend,
        impressions: Math.round(m.impressions),
        clicks:      Math.round(m.clicks),
        ctr:         m.ctr,
        cpc:         m.cpc,
        cpm:         m.cpm,
        conversions: m.conversions,
        results,
        costPerResult,
        currency:    m.currency,
        platform:    item.platform,
        provider:    item.platform,
        externalCampaignId: item.campaignId,
      },
      create: {
        tenantId,
        executionId:       item.executionId,
        provider:          item.platform,
        platform:          item.platform,
        externalCampaignId: item.campaignId,
        range,
        date,
        currency:          m.currency,
        spend:             m.spend,
        impressions:       Math.round(m.impressions),
        reach:             0,
        clicks:            Math.round(m.clicks),
        ctr:               m.ctr,
        cpc:               m.cpc,
        cpm:               m.cpm,
        conversions:       m.conversions,
        results,
        costPerResult,
        externalStatus:    "unknown",
      },
    });
    return true;
  } catch (err) {
    // Non-fatal — analytics live does not depend on history persistence
    console.warn("[ads-analytics-history] recordAdsMetricSnapshot failed:", (err as Error).message ?? err);
    return false;
  }
}

// ── recordAdsMetricSnapshots ───────────────────────────────────────────────────

/**
 * Persiste todos los snapshots de un AdsAnalyticsResult.
 * Procesa en paralelo (batch 5). Nunca lanza.
 *
 * @param tenantId — orgSlug del tenant.
 * @param result   — Resultado completo de getAdsAnalyticsSummary.
 */
export async function recordAdsMetricSnapshots(
  tenantId: string,
  result:   AdsAnalyticsResult,
): Promise<{ saved: number; failed: number }> {
  if (!tenantId || result.items.length === 0) return { saved: 0, failed: 0 };

  let saved  = 0;
  let failed = 0;

  const BATCH = 5;
  for (let i = 0; i < result.items.length; i += BATCH) {
    const batch = result.items.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(item => recordAdsMetricSnapshot(tenantId, item, result.range)),
    );
    for (const ok of results) {
      if (ok) saved++; else failed++;
    }
  }

  return { saved, failed };
}

// ── getAdsMetricHistory ────────────────────────────────────────────────────────

/**
 * Obtiene el historial de snapshots para un tenant en un rango.
 *
 * @param tenantId — orgSlug del tenant.
 * @param range    — Rango histórico.
 */
export async function getAdsMetricHistory(
  tenantId: string,
  range:    AdsHistoryRange = "week",
): Promise<AdsMetricSnapshotRecord[]> {
  if (!tenantId) return [];

  const days    = daysForRange(range);
  const fromDate = dateNDaysAgo(days);

  try {
    const rows = await db().findMany({
      where: {
        tenantId,
        date: { gte: fromDate },
      },
      orderBy: { date: "asc" },
      take:    200,
    });
    return (rows as unknown[]).map(toRecord);
  } catch (err) {
    console.warn("[ads-analytics-history] getAdsMetricHistory failed:", (err as Error).message ?? err);
    return [];
  }
}

// ── getAdsTrendSeries ──────────────────────────────────────────────────────────

/**
 * Calcula series temporales por plataforma para el tenant.
 * Agrupa snapshots por fecha y plataforma.
 *
 * @param tenantId — orgSlug del tenant.
 * @param range    — Rango histórico.
 */
export async function getAdsTrendSeries(
  tenantId: string,
  range:    AdsHistoryRange = "week",
): Promise<AdsTrendSeries[]> {
  const history = await getAdsMetricHistory(tenantId, range);
  if (history.length === 0) return [];

  // Group by platform, then by date (sum within date)
  const byPlatform = new Map<string, Map<string, AdsTrendPoint>>();

  for (const snap of history) {
    if (!byPlatform.has(snap.platform)) {
      byPlatform.set(snap.platform, new Map());
    }
    const byDate = byPlatform.get(snap.platform)!;

    const existing = byDate.get(snap.date);
    if (existing) {
      // Accumulate multiple executions on same day
      const combined: AdsTrendPoint = {
        date:        snap.date,
        spend:       existing.spend       + snap.spend,
        impressions: existing.impressions + snap.impressions,
        clicks:      existing.clicks      + snap.clicks,
        conversions: existing.conversions + snap.conversions,
        results:     existing.results     + snap.results,
        ctr:         0, // recalculate below
        cpc:         0,
      };
      combined.ctr = combined.impressions > 0 ? combined.clicks / combined.impressions : 0;
      combined.cpc = combined.clicks      > 0 ? combined.spend  / combined.clicks      : 0;
      byDate.set(snap.date, combined);
    } else {
      byDate.set(snap.date, {
        date:        snap.date,
        spend:       snap.spend,
        impressions: snap.impressions,
        clicks:      snap.clicks,
        ctr:         snap.ctr,
        cpc:         snap.cpc,
        conversions: snap.conversions,
        results:     snap.results,
      });
    }
  }

  const series: AdsTrendSeries[] = [];

  for (const [platform, byDate] of byPlatform.entries()) {
    const points = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    series.push({
      platform,
      range,
      points,
      latest:   points.length > 0 ? points[points.length - 1] : null,
      earliest: points.length > 0 ? points[0]                 : null,
    });
  }

  // Also build an "all" series
  const allByDate = new Map<string, AdsTrendPoint>();
  for (const s of series) {
    for (const p of s.points) {
      const existing = allByDate.get(p.date);
      if (existing) {
        const combined: AdsTrendPoint = {
          date:        p.date,
          spend:       existing.spend       + p.spend,
          impressions: existing.impressions + p.impressions,
          clicks:      existing.clicks      + p.clicks,
          conversions: existing.conversions + p.conversions,
          results:     existing.results     + p.results,
          ctr:         0,
          cpc:         0,
        };
        combined.ctr = combined.impressions > 0 ? combined.clicks / combined.impressions : 0;
        combined.cpc = combined.clicks      > 0 ? combined.spend  / combined.clicks      : 0;
        allByDate.set(p.date, combined);
      } else {
        allByDate.set(p.date, { ...p });
      }
    }
  }

  if (allByDate.size > 0) {
    const allPoints = Array.from(allByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    series.unshift({
      platform: "all",
      range,
      points:   allPoints,
      latest:   allPoints.length > 0 ? allPoints[allPoints.length - 1] : null,
      earliest: allPoints.length > 0 ? allPoints[0]                    : null,
    });
  }

  return series;
}

// ── compareAdsPeriods ─────────────────────────────────────────────────────────

/**
 * Compara métricas agregadas entre dos períodos.
 * Negativo deltaPercent en spend/cpc = positivo (gasto menos).
 * Positivo deltaPercent en clicks/ctr = positivo (más eficiente).
 *
 * @param tenantId      — orgSlug del tenant.
 * @param currentRange  — Rango actual.
 * @param previousRange — Rango a comparar.
 */
export async function compareAdsPeriods(
  tenantId:      string,
  currentRange:  AdsHistoryRange,
  previousRange: AdsHistoryRange,
): Promise<AdsPeriodComparison> {
  const currentDays  = daysForRange(currentRange);
  const previousDays = daysForRange(previousRange);
  const today        = todayDateString();
  const currentFrom  = dateNDaysAgo(currentDays);
  const previousFrom = dateNDaysAgo(currentDays + previousDays);
  const previousTo   = dateNDaysAgo(currentDays + 1);

  async function fetchPeriodMetrics(
    from: string,
    to:   string,
    label: string,
  ): Promise<AdsPeriodMetrics | null> {
    try {
      const rows = await db().findMany({
        where: {
          tenantId,
          date: { gte: from, lte: to },
        },
        take: 200,
      });
      if (!rows || (rows as unknown[]).length === 0) return null;
      const records = (rows as unknown[]).map(toRecord);
      const totalSpend       = records.reduce((s, r) => s + r.spend,       0);
      const totalImpressions = records.reduce((s, r) => s + r.impressions, 0);
      const totalClicks      = records.reduce((s, r) => s + r.clicks,      0);
      const totalConversions = records.reduce((s, r) => s + r.conversions, 0);
      const totalResults     = records.reduce((s, r) => s + r.results,     0);
      return {
        period:        label,
        spend:         totalSpend,
        impressions:   totalImpressions,
        clicks:        totalClicks,
        ctr:           totalImpressions > 0 ? totalClicks / totalImpressions : 0,
        cpc:           totalClicks      > 0 ? totalSpend  / totalClicks      : 0,
        conversions:   totalConversions,
        results:       totalResults,
        costPerResult: totalResults > 0 ? totalSpend / totalResults : 0,
      };
    } catch {
      return null;
    }
  }

  const [current, previous] = await Promise.all([
    fetchPeriodMetrics(currentFrom, today, "Período actual"),
    fetchPeriodMetrics(previousFrom, previousTo, "Período anterior"),
  ]);

  if (!current) {
    return {
      currentRange,
      previousRange,
      current: {
        period: "Período actual", spend: 0, impressions: 0, clicks: 0,
        ctr: 0, cpc: 0, conversions: 0, results: 0, costPerResult: 0,
      },
      previous:      null,
      deltas:        [],
      hasEnoughData: false,
    };
  }

  function calcDelta(
    metric:   keyof AdsPeriodMetrics,
    curr:     number,
    prev:     number | undefined,
    // "lower_is_better" for spend/cpc/costPerResult; "higher_is_better" for clicks/ctr/conversions
    direction: "lower_is_better" | "higher_is_better",
  ): AdsMetricDelta {
    if (prev === undefined || prev === null) {
      return { metric, current: curr, previous: 0, deltaPercent: null, sentiment: "insufficient_data" };
    }
    const deltaPercent = prev > 0 ? ((curr - prev) / prev) * 100 : null;
    let sentiment: AdsChangeSentiment = "neutral";
    if (deltaPercent !== null) {
      const isImprovement = direction === "lower_is_better" ? deltaPercent < -5 : deltaPercent > 5;
      const isWorsening   = direction === "lower_is_better" ? deltaPercent > 5  : deltaPercent < -5;
      sentiment = isImprovement ? "positive" : isWorsening ? "negative" : "neutral";
    }
    return { metric, current: curr, previous: prev, deltaPercent, sentiment };
  }

  const deltas: AdsMetricDelta[] = [
    calcDelta("spend",         current.spend,         previous?.spend,         "lower_is_better"),
    calcDelta("impressions",   current.impressions,   previous?.impressions,   "higher_is_better"),
    calcDelta("clicks",        current.clicks,        previous?.clicks,        "higher_is_better"),
    calcDelta("ctr",           current.ctr,           previous?.ctr,           "higher_is_better"),
    calcDelta("cpc",           current.cpc,           previous?.cpc,           "lower_is_better"),
    calcDelta("conversions",   current.conversions,   previous?.conversions,   "higher_is_better"),
    calcDelta("results",       current.results,       previous?.results,       "higher_is_better"),
    calcDelta("costPerResult", current.costPerResult, previous?.costPerResult, "lower_is_better"),
  ];

  return {
    currentRange,
    previousRange,
    current,
    previous:      previous ?? null,
    deltas,
    hasEnoughData: !!previous,
  };
}

// ── getAdsTrendSummary (main entry) ───────────────────────────────────────────

/**
 * Genera el resumen histórico completo para un tenant.
 * Incluye series temporales, comparación de períodos e insights de Luca.
 *
 * @param tenantId — orgSlug del tenant.
 * @param range    — Rango histórico.
 */
export async function getAdsHistorySummary(
  tenantId: string,
  range:    AdsHistoryRange = "week",
): Promise<AdsHistorySummary> {
  const generatedAt = new Date().toISOString();

  if (!tenantId) {
    return {
      tenantId, range, generatedAt,
      snapshotCount: 0,
      dateRange:     { from: null, to: null },
      totalSpend:    0, totalImpressions: 0, totalClicks: 0, totalConversions: 0,
      avgCtr: 0, avgCpc: 0,
      trendSeries:       [],
      periodComparison:  null,
      insights:          [],
      insufficientHistory: true,
    };
  }

  // Run series and comparison in parallel
  const prevRange = previousRange(range);
  const [trendSeries, periodComparison, history] = await Promise.all([
    getAdsTrendSeries(tenantId, range),
    compareAdsPeriods(tenantId, range, prevRange),
    getAdsMetricHistory(tenantId, range),
  ]);

  const snapshotCount = history.length;

  // Aggregate totals
  const totalSpend       = history.reduce((s, r) => s + r.spend,       0);
  const totalImpressions = history.reduce((s, r) => s + r.impressions, 0);
  const totalClicks      = history.reduce((s, r) => s + r.clicks,      0);
  const totalConversions = history.reduce((s, r) => s + r.conversions, 0);

  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const avgCpc = totalClicks      > 0 ? totalSpend  / totalClicks      : 0;

  const dates = history.map(r => r.date).sort();
  const dateRange = {
    from: dates.length > 0 ? dates[0]                 : null,
    to:   dates.length > 0 ? dates[dates.length - 1]  : null,
  };

  const insights = buildHistoryInsights(trendSeries, periodComparison, snapshotCount);

  return {
    tenantId,
    range,
    generatedAt,
    snapshotCount,
    dateRange,
    totalSpend,
    totalImpressions,
    totalClicks,
    totalConversions,
    avgCtr,
    avgCpc,
    trendSeries,
    periodComparison,
    insights,
    insufficientHistory: snapshotCount < 3,
  };
}
