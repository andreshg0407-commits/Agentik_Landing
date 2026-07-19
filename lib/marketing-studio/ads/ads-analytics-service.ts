/**
 * lib/marketing-studio/ads/ads-analytics-service.ts
 *
 * MARKETING-ANALYTICS-LIVE-01 — Servicio de Analítica de Anuncios
 * SERVER ONLY — @server-only
 *
 * Responsabilidad:
 *   - Consolidar métricas reales de Meta y TikTok para ejecuciones del tenant.
 *   - Respetar un caché de 15 minutos por ejecución (metadataJson.adsAnalytics).
 *   - Calcular totales y desglose por plataforma.
 *   - Generar insights determinísticos — solo sugerencias, nunca acciones automáticas.
 *   - Nunca activar campañas, modificar presupuesto, ni gastar recursos.
 *   - Nunca almacenar tokens ni payloads sensibles.
 *   - Nunca fallar todo si una plataforma falla.
 *
 * Principio de datos:
 *   Las plataformas externas (Meta, TikTok) son fuentes indicativas de métricas.
 *   Los valores de gasto NUNCA se usan para contabilidad — para eso está Tesorería.
 *   AgentExecution es la fuente de verdad operativa en Agentik.
 */
import "server-only";

import { prisma }             from "@/lib/prisma";
import { listExecutions }     from "@/lib/execution/execution-registry";
import { getMetaAdInsights }  from "./connectors/meta-ads-connector";
import { getTikTokAdInsights } from "./connectors/tiktok-ads-connector";
import { recordAdsMetricSnapshots } from "./ads-analytics-history-service";
import type { AdsExternalIds } from "./ads-sync-types";
import type {
  AdsAnalyticsRange,
  AdsAnalyticsMetric,
  AdsAnalyticsItem,
  AdsAnalyticsPlatform,
  AdsAnalyticsSummary,
  AdsAnalyticsInsight,
  AdsAnalyticsTrend,
  AdsAnalyticsResult,
} from "./ads-analytics-types";
import { emptyMetric } from "./ads-analytics-types";

// ── Constantes ────────────────────────────────────────────────────────────────

const CACHE_TTL_MS  = 15 * 60 * 1000; // 15 minutos
const BATCH_SIZE    = 5;
const MAX_ITEMS     = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Lee metadataJson de un AgentExecution directamente (no está en AgentExecutionRecord). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => (prisma as any).agentExecution;

async function readMetadataJson(executionId: string): Promise<Record<string, unknown> | null> {
  try {
    const row = await db().findUnique({ where: { id: executionId }, select: { metadataJson: true } });
    if (!row?.metadataJson) return null;
    return row.metadataJson as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function writeAnalyticsCache(
  executionId: string,
  tenantId:    string,
  item:        AdsAnalyticsItem,
): Promise<void> {
  try {
    // Read current metadataJson to merge without overwriting other keys
    const meta = await readMetadataJson(executionId) ?? {};
    await db().update({
      where: { id: executionId, tenantId },
      data:  {
        metadataJson: {
          ...meta,
          adsAnalytics: {
            lastSyncedAt: item.fetchedAt,
            item,
          },
        },
      },
    });
  } catch {
    // Cache write failures are non-fatal
  }
}

/** Detecta la plataforma de los IDs externos */
function detectPlatform(ids: Record<string, string>): AdsAnalyticsPlatform {
  const hasMeta   = !!(ids.meta_campaign_id || ids.meta_adset_id || ids.meta_ad_id);
  const hasTikTok = !!(ids.tiktok_campaign_id || ids.tiktok_adgroup_id || ids.tiktok_ad_id);
  if (hasMeta && hasTikTok) return "unknown"; // mixed — return primary
  if (hasMeta)   return "meta";
  if (hasTikTok) return "tiktok";
  return "unknown";
}

/** Suma acumulada de dos métricas */
function addMetrics(a: AdsAnalyticsMetric, b: AdsAnalyticsMetric): AdsAnalyticsMetric {
  const impressions = a.impressions + b.impressions;
  const clicks      = a.clicks      + b.clicks;
  const spend       = a.spend       + b.spend;
  return {
    spend,
    impressions,
    clicks,
    ctr:         impressions > 0 ? clicks / impressions : 0,
    cpc:         clicks      > 0 ? spend  / clicks      : 0,
    cpm:         impressions > 0 ? (spend / impressions) * 1000 : 0,
    conversions: a.conversions + b.conversions,
    currency:    a.currency || b.currency || "USD",
  };
}

// ── Fetch de métricas por ejecución ───────────────────────────────────────────

interface FetchResult {
  item:        AdsAnalyticsItem;
  fromPlatform: boolean;
}

async function fetchMetricsForExecution(
  tenantId:    string,
  executionId: string,
  rawIds:      Record<string, string>,
  range:       AdsAnalyticsRange,
): Promise<FetchResult> {
  const platform = detectPlatform(rawIds);

  // ── Verificar caché ────────────────────────────────────────────────────────
  try {
    const meta = await readMetadataJson(executionId);
    const cached = meta?.adsAnalytics as { lastSyncedAt: string; item: AdsAnalyticsItem } | undefined;

    if (cached?.lastSyncedAt && cached?.item) {
      const age = Date.now() - new Date(cached.lastSyncedAt).getTime();
      if (age < CACHE_TTL_MS) {
        return { item: { ...cached.item, fromCache: true }, fromPlatform: false };
      }
    }
  } catch {
    // caché no disponible — continuar
  }

  // ── Consultar plataforma ───────────────────────────────────────────────────
  const externalIds: AdsExternalIds = {
    meta_campaign_id:   rawIds.meta_campaign_id,
    meta_adset_id:      rawIds.meta_adset_id,
    meta_ad_id:         rawIds.meta_ad_id,
    tiktok_campaign_id: rawIds.tiktok_campaign_id,
    tiktok_adgroup_id:  rawIds.tiktok_adgroup_id,
    tiktok_ad_id:       rawIds.tiktok_ad_id,
  };

  const issues: string[] = [];
  let metric:     AdsAnalyticsMetric | null = null;
  let campaignId: string | null = null;

  try {
    if (platform === "meta") {
      const result = await getMetaAdInsights(tenantId, externalIds, range);
      if (result) {
        metric     = result.metric;
        campaignId = result.campaignId;
      } else {
        issues.push("No se obtuvieron métricas de Meta — credenciales o permisos insuficientes.");
      }
    } else if (platform === "tiktok") {
      const result = await getTikTokAdInsights(tenantId, externalIds, range);
      if (result) {
        metric     = result.metric;
        campaignId = result.campaignId;
      } else {
        issues.push("No se obtuvieron métricas de TikTok — credenciales o permisos insuficientes.");
      }
    } else {
      issues.push("Plataforma no detectada en los IDs externos.");
    }
  } catch {
    issues.push(`Error inesperado al consultar ${platform}.`);
  }

  const item: AdsAnalyticsItem = {
    executionId,
    platform:     platform === "unknown" ? "unknown" : platform,
    campaignName: null,
    campaignId,
    metric:       metric ?? emptyMetric(),
    fetchedAt:    new Date().toISOString(),
    fromCache:    false,
    issues,
  };

  // Persistir en caché si hubo datos
  if (metric) {
    await writeAnalyticsCache(executionId, tenantId, item);
  }

  return { item, fromPlatform: !!metric };
}

// ── Insights determinísticos ──────────────────────────────────────────────────

function buildInsights(
  items:   AdsAnalyticsItem[],
  totals:  AdsAnalyticsMetric,
): AdsAnalyticsInsight[] {
  const insights: AdsAnalyticsInsight[] = [];
  let idSeq = 0;
  const id = () => `ins_${++idSeq}`;

  if (items.length === 0) return [];

  // ── CTR bajo ──────────────────────────────────────────────────────────────
  const lowCtrItems = items.filter(i => i.metric.impressions > 500 && i.metric.ctr < 0.005);
  if (lowCtrItems.length > 0) {
    insights.push({
      id:          id(),
      severity:    "warning",
      title:       "CTR bajo detectado",
      description: `${lowCtrItems.length} campaña${lowCtrItems.length > 1 ? "s" : ""} con CTR < 0.5% en el período seleccionado. Considera actualizar los creativos o la segmentación de audiencia.`,
      action:      "Revisar creativos y segmentación",
      platform:    lowCtrItems.every(i => i.platform === "meta") ? "meta"
                 : lowCtrItems.every(i => i.platform === "tiktok") ? "tiktok" : null,
    });
  }

  // ── TikTok más eficiente que Meta ────────────────────────────────────────
  const metaItems   = items.filter(i => i.platform === "meta"   && i.metric.clicks > 0);
  const tiktokItems = items.filter(i => i.platform === "tiktok" && i.metric.clicks > 0);

  if (metaItems.length > 0 && tiktokItems.length > 0) {
    const metaCpc   = metaItems.reduce((s, i)   => s + i.metric.cpc, 0)   / metaItems.length;
    const tiktokCpc = tiktokItems.reduce((s, i) => s + i.metric.cpc, 0)   / tiktokItems.length;

    if (tiktokCpc < metaCpc * 0.8) {
      insights.push({
        id:          id(),
        severity:    "opportunity",
        title:       "TikTok con mejor CPC que Meta",
        description: `El CPC promedio en TikTok es ${Math.round((1 - tiktokCpc / metaCpc) * 100)}% menor que en Meta en este período. Considera reasignar presupuesto hacia TikTok.`,
        action:      "Analizar distribución de presupuesto",
        platform:    null,
      });
    } else if (metaCpc < tiktokCpc * 0.8) {
      insights.push({
        id:          id(),
        severity:    "opportunity",
        title:       "Meta con mejor CPC que TikTok",
        description: `El CPC promedio en Meta es ${Math.round((1 - metaCpc / tiktokCpc) * 100)}% menor que en TikTok en este período.`,
        action:      "Analizar distribución de presupuesto",
        platform:    null,
      });
    }
  }

  // ── Sin datos suficientes ────────────────────────────────────────────────
  if (totals.impressions === 0 && items.length > 0) {
    insights.push({
      id:          id(),
      severity:    "info",
      title:       "Sin impresiones en el período",
      description: "No se registraron impresiones en el rango seleccionado. Las campañas pueden estar pausadas o en revisión.",
      action:      "Verificar estado de campañas",
      platform:    null,
    });
  }

  // ── Gasto sin conversiones ───────────────────────────────────────────────
  if (totals.spend > 0 && totals.conversions === 0 && totals.clicks > 100) {
    insights.push({
      id:          id(),
      severity:    "warning",
      title:       "Clics sin conversiones registradas",
      description: `Se registraron ${totals.clicks.toLocaleString("es-CO")} clics sin conversiones en el período. Verifica el píxel de conversión o el landing page.`,
      action:      "Revisar píxel y landing page",
      platform:    null,
    });
  }

  return insights;
}

// ── Tendencias ────────────────────────────────────────────────────────────────

function buildTrends(_items: AdsAnalyticsItem[], totals: AdsAnalyticsMetric): AdsAnalyticsTrend[] {
  // Sin datos históricos en esta versión — solo CTR y CPC con dirección neutral
  // En una versión futura se compara con el período anterior.
  if (totals.impressions === 0) return [];

  return [
    { metric: "ctr",  direction: totals.ctr  > 0.01 ? "up" : totals.ctr > 0.005 ? "neutral" : "down", deltaPercent: null },
    { metric: "cpc",  direction: totals.cpc  < 0.5  ? "up" : totals.cpc < 1.5   ? "neutral" : "down", deltaPercent: null },
    { metric: "spend", direction: "neutral", deltaPercent: null },
  ];
}

// ── getAdsAnalyticsSummary ────────────────────────────────────────────────────

/**
 * Consolida métricas reales de anuncios para el tenant.
 *
 * Flujo:
 *   1. Listar ejecuciones ads completadas (máx 20).
 *   2. Filtrar las que tienen IDs externos.
 *   3. Consultar plataformas en paralelo (batch 5), respetando caché 15min.
 *   4. Calcular totales y desglose por plataforma.
 *   5. Generar insights determinísticos.
 *   6. Retornar AdsAnalyticsResult.
 *
 * Nunca activa campañas. Nunca falla todo si una plataforma falla.
 *
 * @param tenantId — orgSlug del tenant.
 * @param range    — Rango temporal para las métricas.
 */
export async function getAdsAnalyticsSummary(
  tenantId: string,
  range:    AdsAnalyticsRange = "week",
): Promise<AdsAnalyticsResult> {
  const generatedAt = new Date().toISOString();

  const empty = (): AdsAnalyticsResult => ({
    tenantId,
    range,
    generatedAt,
    summary:  {
      totals:        emptyMetric(),
      byPlatform:    {},
      activeCount:   0,
      inReviewCount: 0,
      pausedCount:   0,
    },
    items:    [],
    insights: [],
    trends:   [],
    partial:  false,
  });

  if (!tenantId) return empty();

  // ── 1. Listar ejecuciones completadas ─────────────────────────────────────
  const rows = await listExecutions(tenantId, { module: "ads", status: "completed", limit: MAX_ITEMS });

  // Filtrar las que tienen IDs externos de plataforma
  const withIds = rows.filter(r => {
    const ids = r.externalReferenceIds as Record<string, string> | null ?? {};
    return detectPlatform(ids) !== "unknown";
  });

  if (withIds.length === 0) return empty();

  // ── 2. Consultar métricas en paralelo (batch 5) ───────────────────────────
  const items:   AdsAnalyticsItem[] = [];
  let partial = false;

  for (let i = 0; i < withIds.length; i += BATCH_SIZE) {
    const batch   = withIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(r =>
        fetchMetricsForExecution(
          tenantId,
          r.id,
          r.externalReferenceIds as Record<string, string> ?? {},
          range,
        ).catch((): FetchResult => ({
          item: {
            executionId: r.id,
            platform:    "unknown",
            campaignName: null,
            campaignId:  null,
            metric:      emptyMetric(),
            fetchedAt:   new Date().toISOString(),
            fromCache:   false,
            issues:      ["Error inesperado al obtener métricas."],
          },
          fromPlatform: false,
        })),
      ),
    );

    for (const r of results) {
      items.push(r.item);
      if (r.item.issues.length > 0) partial = true;
    }
  }

  // ── 3. Calcular totales y desglose ────────────────────────────────────────
  const byPlatformMap: Partial<Record<AdsAnalyticsPlatform, AdsAnalyticsMetric>> = {};

  let totals = emptyMetric();
  for (const item of items) {
    totals = addMetrics(totals, item.metric);

    if (item.platform !== "unknown") {
      const prev = byPlatformMap[item.platform] ?? emptyMetric(item.metric.currency);
      byPlatformMap[item.platform] = addMetrics(prev, item.metric);
    }
  }

  // Status counts desde metadataJson.adsSync (si disponible)
  let activeCount   = 0;
  let inReviewCount = 0;
  let pausedCount   = 0;

  for (const row of withIds) {
    try {
      const meta = await readMetadataJson(row.id);
      const syncStatus = (meta?.adsSync as { externalStatus?: string } | undefined)?.externalStatus;
      if (syncStatus === "active")    activeCount++;
      if (syncStatus === "in_review") inReviewCount++;
      if (syncStatus === "paused")    pausedCount++;
    } catch {
      // no es crítico
    }
  }

  const summary: AdsAnalyticsSummary = {
    totals,
    byPlatform: byPlatformMap,
    activeCount,
    inReviewCount,
    pausedCount,
  };

  // ── 4. Insights y tendencias ──────────────────────────────────────────────
  const insights = buildInsights(items, totals);
  const trends   = buildTrends(items, totals);

  const result: AdsAnalyticsResult = {
    tenantId,
    range,
    generatedAt,
    summary,
    items,
    insights,
    trends,
    partial,
  };

  // ── 5. Persistir historial (non-blocking, non-fatal) ──────────────────────
  // Analytics Live no depende del historial para funcionar.
  // Si la persistencia falla, solo se registra un warning — nunca se lanza.
  if (items.length > 0) {
    recordAdsMetricSnapshots(tenantId, result).then(({ saved, failed }) => {
      if (failed > 0) {
        console.warn(`[ads-analytics] History persistence: ${saved} saved, ${failed} failed`);
      }
    }).catch(err => {
      console.warn("[ads-analytics] History persistence error (non-fatal):", (err as Error).message ?? err);
    });
  }

  return result;
}

// ── syncAdsAnalyticsForExecution ──────────────────────────────────────────────

/**
 * Fuerza la actualización de métricas para una ejecución específica,
 * ignorando el caché.
 *
 * Útil para el botón "Actualizar métricas" en el panel de detalle.
 * Nunca activa campañas.
 *
 * @param tenantId    — orgSlug del tenant.
 * @param executionId — ID del AgentExecution.
 * @param range       — Rango temporal.
 */
export async function syncAdsAnalyticsForExecution(
  tenantId:    string,
  executionId: string,
  range:       AdsAnalyticsRange = "week",
): Promise<AdsAnalyticsItem | null> {
  if (!tenantId || !executionId) return null;

  try {
    // Invalidar caché explícitamente antes de llamar
    const meta = await readMetadataJson(executionId);
    if (meta) {
      await db().update({
        where: { id: executionId, tenantId },
        data:  {
          metadataJson: {
            ...meta,
            adsAnalytics: null, // forzar re-fetch
          },
        },
      });
    }

    // Obtener IDs externos
    const row = await db().findUnique({
      where:  { id: executionId, tenantId },
      select: { externalReferenceIds: true },
    });
    if (!row) return null;

    const rawIds = (row.externalReferenceIds as Record<string, string> | null) ?? {};
    if (detectPlatform(rawIds) === "unknown") return null;

    const { item } = await fetchMetricsForExecution(tenantId, executionId, rawIds, range);
    return item;
  } catch {
    return null;
  }
}
