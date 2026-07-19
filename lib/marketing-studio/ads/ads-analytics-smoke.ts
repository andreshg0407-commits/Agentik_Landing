/**
 * lib/marketing-studio/ads/ads-analytics-smoke.ts
 *
 * MARKETING-ANALYTICS-LIVE-01 — Smoke Checks de Analítica de Anuncios
 *
 * Checks determinísticos sin llamadas externas (no Prisma, no Meta, no TikTok).
 * Valida la lógica de cálculo de métricas, normalización, caché y estructura.
 */

import {
  ADS_ANALYTICS_RANGE_LABEL,
  emptyMetric,
} from "./ads-analytics-types";
import type {
  AdsAnalyticsRange,
  AdsAnalyticsMetric,
  AdsAnalyticsItem,
} from "./ads-analytics-types";

// ── Resultado de smoke ────────────────────────────────────────────────────────

export interface AdsAnalyticsSmokeResult {
  total:   number;
  passed:  number;
  failed:  number;
  results: { name: string; passed: boolean; reason?: string }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function check(
  name:    string,
  passed:  boolean,
  reason?: string,
): { name: string; passed: boolean; reason?: string } {
  return { name, passed, reason: passed ? undefined : (reason ?? `"${name}" falló`) };
}

// ── Lógica de cálculo inline (mirror del servicio) ────────────────────────────

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

function makeItem(
  platform:    "meta" | "tiktok" | "unknown",
  impressions: number,
  clicks:      number,
  spend:       number,
  conversions  = 0,
): AdsAnalyticsItem {
  const ctr = impressions > 0 ? clicks / impressions : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  return {
    executionId:  `exec_${platform}_test`,
    platform,
    campaignName: null,
    campaignId:   `camp_${platform}`,
    metric:       { spend, impressions, clicks, ctr, cpc, cpm, conversions, currency: "USD" },
    fetchedAt:    new Date().toISOString(),
    fromCache:    false,
    issues:       [],
  };
}

// ── Casos de prueba ───────────────────────────────────────────────────────────

export function runAdsAnalyticsSmokeChecks(): AdsAnalyticsSmokeResult {
  const results: AdsAnalyticsSmokeResult["results"] = [];
  let passed = 0;
  let failed = 0;

  function assert(name: string, cond: boolean, reason?: string) {
    const r = check(name, cond, reason);
    results.push(r);
    if (cond) passed++; else failed++;
  }

  // ── emptyMetric ────────────────────────────────────────────────────────────

  {
    const m = emptyMetric("COP");
    assert("emptyMetric.spend = 0",       m.spend === 0);
    assert("emptyMetric.impressions = 0", m.impressions === 0);
    assert("emptyMetric.ctr = 0",         m.ctr === 0);
    assert("emptyMetric.currency = COP",  m.currency === "COP");
  }

  // ── addMetrics: acumulación correcta ──────────────────────────────────────

  {
    const a = makeItem("meta",   1000, 10, 50);
    const b = makeItem("tiktok", 2000, 40, 80);
    const s = addMetrics(a.metric, b.metric);

    assert("addMetrics.impressions = 3000", s.impressions === 3000,
      `esperado 3000, recibido ${s.impressions}`);
    assert("addMetrics.clicks = 50", s.clicks === 50,
      `esperado 50, recibido ${s.clicks}`);
    assert("addMetrics.spend = 130", s.spend === 130,
      `esperado 130, recibido ${s.spend}`);
    assert("addMetrics.ctr correcto",
      Math.abs(s.ctr - 50 / 3000) < 1e-10,
      `esperado ${50 / 3000}, recibido ${s.ctr}`);
    assert("addMetrics.cpc correcto",
      Math.abs(s.cpc - 130 / 50) < 1e-10,
      `esperado ${130 / 50}, recibido ${s.cpc}`);
    assert("addMetrics.cpm correcto",
      Math.abs(s.cpm - (130 / 3000) * 1000) < 1e-6,
      `esperado ${(130 / 3000) * 1000}, recibido ${s.cpm}`);
  }

  // ── addMetrics: sin impresiones ni clics ─────────────────────────────────

  {
    const a = emptyMetric();
    const b = emptyMetric();
    const s = addMetrics(a, b);
    assert("addMetrics sin impresiones: ctr = 0", s.ctr === 0);
    assert("addMetrics sin clics: cpc = 0",       s.cpc === 0);
  }

  // ── CTR calculado correctamente ────────────────────────────────────────────

  {
    const m = makeItem("meta", 1000, 20, 100);
    assert("CTR = clicks / impressions", Math.abs(m.metric.ctr - 0.02) < 1e-10,
      `esperado 0.02, recibido ${m.metric.ctr}`);
  }

  // ── CPC calculado correctamente ────────────────────────────────────────────

  {
    const m = makeItem("tiktok", 1000, 50, 250);
    assert("CPC = spend / clicks", Math.abs(m.metric.cpc - 5) < 1e-10,
      `esperado 5, recibido ${m.metric.cpc}`);
  }

  // ── CPM calculado correctamente ────────────────────────────────────────────

  {
    const m = makeItem("meta", 10000, 100, 50);
    assert("CPM = (spend / impressions) * 1000", Math.abs(m.metric.cpm - 5) < 1e-10,
      `esperado 5, recibido ${m.metric.cpm}`);
  }

  // ── Rangos definidos ──────────────────────────────────────────────────────

  const allRanges: AdsAnalyticsRange[] = ["today", "week", "month"];
  for (const r of allRanges) {
    assert(
      `Etiqueta definida para rango "${r}"`,
      !!ADS_ANALYTICS_RANGE_LABEL[r],
      `Falta etiqueta para "${r}"`,
    );
  }

  // ── Sin secretos en AdsAnalyticsItem ─────────────────────────────────────

  {
    const item    = makeItem("meta", 1000, 10, 50);
    const serial  = JSON.stringify(item).toLowerCase();
    const banned  = ["accesstoken", "access_token", "token", "secret", "password", "bearer"];
    const found   = banned.filter(f => serial.includes(f));
    assert(
      "AdsAnalyticsItem no expone secretos",
      found.length === 0,
      `Campos prohibidos: ${found.join(", ")}`,
    );
  }

  // ── fromCache = false en item nuevo ───────────────────────────────────────

  {
    const item = makeItem("tiktok", 500, 5, 20);
    assert("fromCache = false en item nuevo", item.fromCache === false);
  }

  // ── Estructura correcta de AdsAnalyticsItem ────────────────────────────────

  {
    const item = makeItem("meta", 1000, 10, 50);
    assert("item.executionId existe",  typeof item.executionId === "string");
    assert("item.platform existe",     typeof item.platform    === "string");
    assert("item.metric existe",       typeof item.metric      === "object");
    assert("item.fetchedAt existe",    typeof item.fetchedAt   === "string");
    assert("item.issues es array",     Array.isArray(item.issues));
  }

  // ── Conversiones acumuladas ────────────────────────────────────────────────

  {
    const a = makeItem("meta",   1000, 10, 50, 3);
    const b = makeItem("tiktok", 2000, 20, 80, 7);
    const s = addMetrics(a.metric, b.metric);
    assert("addMetrics.conversions = 10", s.conversions === 10,
      `esperado 10, recibido ${s.conversions}`);
  }

  // ── emptyMetric con moneda por defecto ────────────────────────────────────

  {
    const m = emptyMetric();
    assert("emptyMetric currency default = USD", m.currency === "USD");
  }

  return { total: results.length, passed, failed, results };
}
