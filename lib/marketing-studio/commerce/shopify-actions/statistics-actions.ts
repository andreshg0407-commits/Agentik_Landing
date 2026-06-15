/**
 * lib/marketing-studio/commerce/shopify-actions/statistics-actions.ts
 *
 * SHOPIFY-COPILOT-ACTIONS-01B — Statistics domain actions.
 * SERVER ONLY — no React imports.
 */
import "server-only";

import {
  getOverview          as _getOverview,
  getSalesMetrics      as _getSalesMetrics,
  getCatalogMetrics    as _getCatalogMetrics,
  getPromotionMetrics  as _getPromotionMetrics,
  getOperationsMetrics as _getOperationsMetrics,
  getTrendAnalysis     as _getTrendAnalysis,
  getExecutiveInsights as _getExecutiveInsights,
}                                   from "../shopify-statistics-service";
import type { StatisticsPeriod }    from "../shopify-statistics-types";
import type { ShopifyActionMeta }   from "./action-types";
import {
  start,
  mkOk,
  type ShopifyContext,
} from "./action-types";

// ── Registry entries ───────────────────────────────────────────────────────────

export const statisticsActionRegistry: Record<string, ShopifyActionMeta> = {
  getOverview: {
    id: "getOverview", category: "statistics",
    displayName: "Resumen ejecutivo",
    description: "Devuelve el snapshot ejecutivo completo de la tienda para el período indicado.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  ["period?: StatisticsPeriod (default: week)"],
    expectedOutputs: ["StatisticsOverview"],
  },
  getAttentionSummary: {
    id: "getAttentionSummary", category: "statistics",
    displayName: "Resumen de indicadores a atender",
    description: "Devuelve los KPIs con salud warning/critical, pre-ordenados por urgencia.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  ["period?: StatisticsPeriod (default: week)"],
    expectedOutputs: ["MetricHealthSummary.needsAttention"],
  },
  getSalesMetrics: {
    id: "getSalesMetrics", category: "statistics",
    displayName: "Métricas de ventas",
    description: "Devuelve indicadores de rendimiento comercial para el período.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  ["period?: StatisticsPeriod"],
    expectedOutputs: ["SalesMetrics"],
  },
  getCatalogMetrics: {
    id: "getCatalogMetrics", category: "statistics",
    displayName: "Métricas del catálogo",
    description: "Devuelve estado del catálogo y top/bottom sellers.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  ["period?: StatisticsPeriod"],
    expectedOutputs: ["CatalogMetrics"],
  },
  getPromotionMetrics: {
    id: "getPromotionMetrics", category: "statistics",
    displayName: "Métricas de promociones",
    description: "Devuelve estadísticas de campañas de descuento.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  [],
    expectedOutputs: ["PromotionMetrics"],
  },
  getOperationsMetrics: {
    id: "getOperationsMetrics", category: "statistics",
    displayName: "Métricas operacionales",
    description: "Devuelve alertas, retrasos, devoluciones y reembolsos.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  [],
    expectedOutputs: ["OperationsMetrics"],
  },
  getTrendMetrics: {
    id: "getTrendMetrics", category: "statistics",
    displayName: "Análisis de tendencias",
    description: "Devuelve comparación período-sobre-período de 6 KPIs comerciales.",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  ["period?: StatisticsPeriod"],
    expectedOutputs: ["TrendAnalysis"],
  },
  getExecutiveInsights: {
    id: "getExecutiveInsights", category: "statistics",
    displayName: "Insights ejecutivos",
    description: "Devuelve insights determinísticos basados en reglas de umbral (NON-AI).",
    requiresApproval: false, automationEligible: true, supportedByCopilot: true,
    expectedInputs:  ["period?: StatisticsPeriod"],
    expectedOutputs: ["ExecutiveInsight[]"],
  },
};

// ── Actions ────────────────────────────────────────────────────────────────────

async function getOverview(ctx: ShopifyContext, period?: StatisticsPeriod) {
  const t0     = start();
  const result = await _getOverview(ctx.organizationId, ctx.accessToken, ctx.shopDomain, period);
  return mkOk(result, `Resumen ejecutivo generado (${result.period}).`, { executed: 1 }, t0);
}

async function getAttentionSummary(ctx: ShopifyContext, period?: StatisticsPeriod) {
  const t0      = start();
  const overview = await _getOverview(ctx.organizationId, ctx.accessToken, ctx.shopDomain, period);
  const attn     = overview.healthSummary.needsAttention;
  return mkOk(
    attn,
    attn.length > 0
      ? `${attn.length} indicador(es) requieren atención: ${attn.map(m => m.label).join(", ")}.`
      : "Todos los indicadores están en niveles normales.",
    { executed: attn.length },
    t0,
  );
}

async function getSalesMetrics(ctx: ShopifyContext, period?: StatisticsPeriod) {
  const t0     = start();
  const result = await _getSalesMetrics(ctx.organizationId, ctx.accessToken, ctx.shopDomain, period);
  return mkOk(result, `Métricas de ventas (${result.period}): ${result.totalRevenue} ${result.currency}.`, { executed: 1 }, t0);
}

async function getCatalogMetrics(ctx: ShopifyContext, period?: StatisticsPeriod) {
  const t0     = start();
  const result = await _getCatalogMetrics(ctx.organizationId, ctx.accessToken, ctx.shopDomain, period);
  return mkOk(result, `Catálogo: ${result.published} publicados, ${result.pending} pendientes.`, { executed: 1 }, t0);
}

async function getPromotionMetrics(ctx: ShopifyContext) {
  const t0     = start();
  const result = await _getPromotionMetrics(ctx.organizationId, ctx.accessToken, ctx.shopDomain);
  return mkOk(result, `Promociones: ${result.active} activas, ${result.scheduled} programadas.`, { executed: 1 }, t0);
}

async function getOperationsMetrics(ctx: ShopifyContext) {
  const t0     = start();
  const result = await _getOperationsMetrics(ctx.organizationId, ctx.accessToken, ctx.shopDomain);
  return mkOk(result, `Operaciones: ${result.criticalAlerts} alerta(s) crítica(s).`, { executed: 1 }, t0);
}

async function getTrendMetrics(ctx: ShopifyContext, period?: StatisticsPeriod) {
  const t0     = start();
  const result = await _getTrendAnalysis(ctx.organizationId, ctx.accessToken, ctx.shopDomain, period);
  return mkOk(result, `Tendencias del período: ingresos ${result.revenue.direction} ${result.revenue.pct}%.`, { executed: 1 }, t0);
}

async function getExecutiveInsights(ctx: ShopifyContext, period?: StatisticsPeriod) {
  const t0       = start();
  const result   = await _getExecutiveInsights(ctx.organizationId, ctx.accessToken, ctx.shopDomain, period);
  const critical = result.filter(i => i.severity === "critical").length;
  return mkOk(result, `${result.length} insight(s) ejecutivos. ${critical} crítico(s).`, { executed: result.length }, t0);
}

// ── Domain object ──────────────────────────────────────────────────────────────

export const statisticsActions = {
  getOverview,
  getSalesMetrics,
  getCatalogMetrics,
  getPromotionMetrics,
  getOperationsMetrics,
  getTrendMetrics,
  getExecutiveInsights,
  getAttentionSummary,
} as const;
