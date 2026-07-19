/**
 * lib/marketing-studio/ads/ads-analytics-types.ts
 *
 * MARKETING-ANALYTICS-LIVE-01 — Tipos para el módulo de Analítica de Anuncios
 *
 * Client-safe — no server-only imports.
 *
 * Principios:
 *   - Estas métricas son siempre indicativas, nunca fuente de verdad financiera.
 *   - Los totales de gasto vienen de las plataformas — no se deben usar para contabilidad.
 *   - Los insights son sugerencias del sistema, nunca órdenes automáticas.
 */

// ── Rangos temporales ──────────────────────────────────────────────────────────

export type AdsAnalyticsRange = "today" | "week" | "month";

export const ADS_ANALYTICS_RANGE_LABEL: Record<AdsAnalyticsRange, string> = {
  today: "Hoy",
  week:  "Últimos 7 días",
  month: "Últimos 30 días",
};

// ── Métricas por plataforma ────────────────────────────────────────────────────

export interface AdsAnalyticsMetric {
  /** Gasto total en la moneda de la cuenta */
  spend:       number;
  /** Impresiones totales */
  impressions: number;
  /** Clics totales */
  clicks:      number;
  /** CTR calculado como clics / impresiones (0–1) */
  ctr:         number;
  /** CPC calculado como spend / clics (puede ser Infinity si clics = 0) */
  cpc:         number;
  /** CPM calculado como (spend / impresiones) * 1000 */
  cpm:         number;
  /** Conversiones reportadas por la plataforma (puede ser 0 si no configurado) */
  conversions: number;
  /** Moneda ISO 4217 */
  currency:    string;
}

export function emptyMetric(currency = "USD"): AdsAnalyticsMetric {
  return { spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0, conversions: 0, currency };
}

// ── Resultado por ejecución/anuncio ───────────────────────────────────────────

export type AdsAnalyticsPlatform = "meta" | "tiktok" | "unknown";

export interface AdsAnalyticsItem {
  executionId:  string;
  platform:     AdsAnalyticsPlatform;
  campaignName: string | null;
  campaignId:   string | null;
  metric:       AdsAnalyticsMetric;
  fetchedAt:    string;
  /** true si los datos provienen del caché de metadataJson */
  fromCache:    boolean;
  issues:       string[];
}

// ── Tendencia ─────────────────────────────────────────────────────────────────

export type AdsAnalyticsTrendDirection = "up" | "down" | "neutral";

export interface AdsAnalyticsTrend {
  metric:    keyof AdsAnalyticsMetric;
  direction: AdsAnalyticsTrendDirection;
  /** Diferencia porcentual respecto al período anterior (puede ser null si no hay datos) */
  deltaPercent: number | null;
}

// ── Insights determinísticos ───────────────────────────────────────────────────

export type AdsAnalyticsInsightSeverity = "info" | "warning" | "opportunity";

export interface AdsAnalyticsInsight {
  id:          string;
  severity:    AdsAnalyticsInsightSeverity;
  title:       string;
  description: string;
  /** Acción sugerida — siempre suggestedOnly, nunca automática */
  action:      string | null;
  /** Plataforma afectada, null si aplica a todas */
  platform:    AdsAnalyticsPlatform | null;
}

// ── Resumen consolidado ────────────────────────────────────────────────────────

export interface AdsAnalyticsSummary {
  /** Totales consolidados de todas las plataformas */
  totals:    AdsAnalyticsMetric;
  /** Desglose por plataforma */
  byPlatform: Partial<Record<AdsAnalyticsPlatform, AdsAnalyticsMetric>>;
  /** Número de ejecuciones activas / en revisión */
  activeCount:    number;
  inReviewCount:  number;
  pausedCount:    number;
}

// ── Resultado completo del servicio ───────────────────────────────────────────

export interface AdsAnalyticsResult {
  tenantId:    string;
  range:       AdsAnalyticsRange;
  generatedAt: string;
  summary:     AdsAnalyticsSummary;
  items:       AdsAnalyticsItem[];
  insights:    AdsAnalyticsInsight[];
  trends:      AdsAnalyticsTrend[];
  /** true si al menos una plataforma tuvo problemas (partial data) */
  partial:     boolean;
}

// ── API response ───────────────────────────────────────────────────────────────

export interface AdsAnalyticsApiResponse {
  result:      AdsAnalyticsResult;
  cachedUntil: string | null;
}
