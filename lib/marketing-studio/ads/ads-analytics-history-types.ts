/**
 * lib/marketing-studio/ads/ads-analytics-history-types.ts
 *
 * MARKETING-ANALYTICS-HISTORY-01 — Tipos para el historial de métricas de anuncios
 *
 * Client-safe — no server-only imports.
 *
 * Principios:
 *   - Los snapshots son solo métricas normalizadas — nunca tokens ni payloads crudos.
 *   - La comparación de períodos es orientativa, no fuente de verdad financiera.
 *   - Las tendencias de Luca son sugerencias — nunca acciones automáticas.
 */

import type { AdsAnalyticsRange } from "./ads-analytics-types";

// ── Re-export for convenience ─────────────────────────────────────────────────
export type { AdsAnalyticsRange };

// ── Rangos históricos ─────────────────────────────────────────────────────────

/** Rango extendido que incluye opciones históricas más largas */
export type AdsHistoryRange = AdsAnalyticsRange | "quarter";

export const ADS_HISTORY_RANGE_LABEL: Record<AdsHistoryRange, string> = {
  today:   "Hoy",
  week:    "Últimos 7 días",
  month:   "Últimos 30 días",
  quarter: "Últimos 90 días",
};

// ── Snapshot record (espejo del modelo Prisma) ────────────────────────────────

export interface AdsMetricSnapshotRecord {
  id:                 string;
  tenantId:           string;
  executionId:        string;
  provider:           string;
  platform:           string;
  externalCampaignId: string | null;
  externalAdsetId:    string | null;
  externalAdId:       string | null;
  range:              string;
  date:               string;        // YYYY-MM-DD
  currency:           string;
  spend:              number;
  impressions:        number;
  reach:              number;
  clicks:             number;
  ctr:                number;
  cpc:                number;
  cpm:                number;
  conversions:        number;
  results:            number;
  costPerResult:      number;
  externalStatus:     string;
  providerStatus:     string | null;
  createdAt:          string;        // ISO string
}

// ── Serie temporal ────────────────────────────────────────────────────────────

/** Punto individual en una serie temporal */
export interface AdsTrendPoint {
  date:        string;   // YYYY-MM-DD
  spend:       number;
  impressions: number;
  clicks:      number;
  ctr:         number;
  cpc:         number;
  conversions: number;
  results:     number;
}

/** Serie temporal completa para una plataforma */
export interface AdsTrendSeries {
  platform: string;       // meta | tiktok | all
  range:    AdsHistoryRange;
  points:   AdsTrendPoint[];
  /** Punto más reciente */
  latest:   AdsTrendPoint | null;
  /** Punto más antiguo */
  earliest: AdsTrendPoint | null;
}

// ── Comparación de períodos ───────────────────────────────────────────────────

export interface AdsPeriodMetrics {
  period:      string;   // etiqueta del período
  spend:       number;
  impressions: number;
  clicks:      number;
  ctr:         number;
  cpc:         number;
  conversions: number;
  results:     number;
  costPerResult: number;
}

export type AdsChangeSentiment = "positive" | "negative" | "neutral" | "insufficient_data";

export interface AdsMetricDelta {
  metric:         keyof AdsPeriodMetrics;
  current:        number;
  previous:       number;
  /** Diferencia porcentual (positivo = subida, negativo = bajada). null si sin datos anteriores. */
  deltaPercent:   number | null;
  /** Dirección: positivo o negativo según el contexto del indicador */
  sentiment:      AdsChangeSentiment;
}

export interface AdsPeriodComparison {
  currentRange:  AdsHistoryRange;
  previousRange: AdsHistoryRange;
  current:       AdsPeriodMetrics;
  previous:      AdsPeriodMetrics | null;
  deltas:        AdsMetricDelta[];
  hasEnoughData: boolean;
}

// ── Recomendaciones históricas de Luca ────────────────────────────────────────

export type AdsHistoryInsightType =
  | "trend_spend_up_clicks_down"
  | "trend_tiktok_better_cpc"
  | "trend_meta_better_reach"
  | "trend_declining_ctr"
  | "trend_improving_ctr"
  | "trend_no_data"
  | "trend_insufficient_history"
  | "trend_stable";

export interface AdsHistoryInsight {
  id:          string;
  type:        AdsHistoryInsightType;
  severity:    "info" | "warning" | "opportunity";
  title:       string;
  description: string;
  /** Acción sugerida — nunca automática */
  action:      string | null;
  platform:    string | null;
}

// ── Resumen histórico ─────────────────────────────────────────────────────────

export interface AdsHistorySummary {
  tenantId:       string;
  range:          AdsHistoryRange;
  generatedAt:    string;
  snapshotCount:  number;
  dateRange: {
    from: string | null;
    to:   string | null;
  };
  totalSpend:       number;
  totalImpressions: number;
  totalClicks:      number;
  totalConversions: number;
  avgCtr:           number;
  avgCpc:           number;
  trendSeries:      AdsTrendSeries[];
  periodComparison: AdsPeriodComparison | null;
  insights:         AdsHistoryInsight[];
  /** true si no hay suficiente historial para tendencias confiables */
  insufficientHistory: boolean;
}

// ── API response ───────────────────────────────────────────────────────────────

export interface AdsAnalyticsHistoryApiResponse {
  historySummary:   AdsHistorySummary;
  trendSeries:      AdsTrendSeries[];
  periodComparison: AdsPeriodComparison | null;
}
