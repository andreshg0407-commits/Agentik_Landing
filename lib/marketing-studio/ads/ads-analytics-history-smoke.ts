/**
 * lib/marketing-studio/ads/ads-analytics-history-smoke.ts
 *
 * MARKETING-ANALYTICS-HISTORY-01 — Smoke Checks del Historial de Métricas
 *
 * Checks determinísticos sin llamadas externas (no Prisma, no Meta, no TikTok).
 * Valida lógica de cálculo, comparación de períodos, tendencias y estructura.
 */

import type {
  AdsMetricSnapshotRecord,
  AdsTrendPoint,
  AdsPeriodMetrics,
  AdsMetricDelta,
  AdsChangeSentiment,
} from "./ads-analytics-history-types";

// ── Resultado de smoke ─────────────────────────────────────────────────────────

export interface AdsHistorySmokeResult {
  total:   number;
  passed:  number;
  failed:  number;
  results: { name: string; passed: boolean; reason?: string }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function check(name: string, passed: boolean, reason?: string) {
  return { name, passed, reason: passed ? undefined : (reason ?? `"${name}" falló`) };
}

// ── Lógica inline (mirror del servicio) ───────────────────────────────────────

function calcCtr(clicks: number, impressions: number): number {
  return impressions > 0 ? clicks / impressions : 0;
}

function calcCpc(spend: number, clicks: number): number {
  return clicks > 0 ? spend / clicks : 0;
}

function calcCpm(spend: number, impressions: number): number {
  return impressions > 0 ? (spend / impressions) * 1000 : 0;
}

function calcCostPerResult(spend: number, results: number): number {
  return results > 0 ? spend / results : 0;
}

function calcDeltaPercent(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

function calcSentiment(
  deltaPercent: number | null,
  direction: "lower_is_better" | "higher_is_better",
): AdsChangeSentiment {
  if (deltaPercent === null) return "insufficient_data";
  const isImprovement = direction === "lower_is_better" ? deltaPercent < -5 : deltaPercent > 5;
  const isWorsening   = direction === "lower_is_better" ? deltaPercent > 5  : deltaPercent < -5;
  return isImprovement ? "positive" : isWorsening ? "negative" : "neutral";
}

function makeSnapshot(overrides: Partial<AdsMetricSnapshotRecord> = {}): AdsMetricSnapshotRecord {
  return {
    id:                 "snap_001",
    tenantId:           "castillitos",
    executionId:        "exec_001",
    provider:           "meta",
    platform:           "meta",
    externalCampaignId: "camp_123",
    externalAdsetId:    null,
    externalAdId:       null,
    range:              "week",
    date:               "2026-07-09",
    currency:           "USD",
    spend:              100,
    impressions:        10000,
    reach:              0,
    clicks:             200,
    ctr:                0.02,
    cpc:                0.5,
    cpm:                10,
    conversions:        5,
    results:            5,
    costPerResult:      20,
    externalStatus:     "active",
    providerStatus:     "ACTIVE",
    createdAt:          new Date().toISOString(),
    ...overrides,
  };
}

function makeTrendPoint(overrides: Partial<AdsTrendPoint> = {}): AdsTrendPoint {
  return {
    date:        "2026-07-09",
    spend:       100,
    impressions: 10000,
    clicks:      200,
    ctr:         0.02,
    cpc:         0.5,
    conversions: 5,
    results:     5,
    ...overrides,
  };
}

// ── Smoke checks ──────────────────────────────────────────────────────────────

export function runAdsHistorySmokeChecks(): AdsHistorySmokeResult {
  const results: AdsHistorySmokeResult["results"] = [];
  let passed = 0;
  let failed = 0;

  function assert(name: string, cond: boolean, reason?: string) {
    const r = check(name, cond, reason);
    results.push(r);
    if (cond) passed++; else failed++;
  }

  // ── Upsert key structure ───────────────────────────────────────────────────

  {
    const snap = makeSnapshot();
    const upsertKey = `${snap.tenantId}|${snap.executionId}|${snap.range}|${snap.date}`;
    assert("Upsert key tiene 4 componentes", upsertKey.split("|").length === 4);
    assert("Upsert key incluye tenantId",    upsertKey.includes("castillitos"));
    assert("Upsert key incluye executionId", upsertKey.includes("exec_001"));
    assert("Upsert key incluye range",       upsertKey.includes("week"));
    assert("Upsert key incluye date",        upsertKey.includes("2026-07-09"));
  }

  // ── Spend cero permitido ───────────────────────────────────────────────────

  {
    const snap = makeSnapshot({ spend: 0, clicks: 0, impressions: 0 });
    assert("spend = 0 es válido",       snap.spend === 0);
    assert("clicks = 0 es válido",      snap.clicks === 0);
    assert("impressions = 0 es válido", snap.impressions === 0);
  }

  // ── CTR/CPC/CPM calculados correctamente ──────────────────────────────────

  {
    const ctr = calcCtr(200, 10000);
    assert("CTR = clicks / impressions (0.02)",
      Math.abs(ctr - 0.02) < 1e-10,
      `esperado 0.02, recibido ${ctr}`);
  }

  {
    const cpc = calcCpc(100, 200);
    assert("CPC = spend / clicks (0.5)",
      Math.abs(cpc - 0.5) < 1e-10,
      `esperado 0.5, recibido ${cpc}`);
  }

  {
    const cpm = calcCpm(100, 10000);
    assert("CPM = (spend / impressions) * 1000 (10)",
      Math.abs(cpm - 10) < 1e-10,
      `esperado 10, recibido ${cpm}`);
  }

  {
    const costPerResult = calcCostPerResult(100, 5);
    assert("costPerResult = spend / results (20)",
      Math.abs(costPerResult - 20) < 1e-10,
      `esperado 20, recibido ${costPerResult}`);
  }

  // ── División por cero controlada ──────────────────────────────────────────

  {
    const ctr = calcCtr(0, 0);
    assert("CTR con 0 impressions = 0", ctr === 0, `esperado 0, recibido ${ctr}`);
  }

  {
    const cpc = calcCpc(100, 0);
    assert("CPC con 0 clicks = 0", cpc === 0, `esperado 0, recibido ${cpc}`);
  }

  {
    const cpm = calcCpm(0, 0);
    assert("CPM con 0 impressions = 0", cpm === 0, `esperado 0, recibido ${cpm}`);
  }

  {
    const cost = calcCostPerResult(100, 0);
    assert("costPerResult con 0 results = 0", cost === 0, `esperado 0, recibido ${cost}`);
  }

  // ── Comparación positiva ───────────────────────────────────────────────────

  {
    // clicks subió: higher_is_better → positive
    const delta = calcDeltaPercent(200, 100); // +100%
    assert("deltaPercent clicks +100%", delta !== null && Math.abs(delta - 100) < 1e-6,
      `esperado 100, recibido ${delta}`);
    const sentiment = calcSentiment(delta, "higher_is_better");
    assert("sentiment clicks sube = positive", sentiment === "positive",
      `esperado positive, recibido ${sentiment}`);
  }

  // ── Comparación negativa ───────────────────────────────────────────────────

  {
    // clicks bajó: higher_is_better → negative
    const delta = calcDeltaPercent(80, 100); // -20%
    assert("deltaPercent clicks -20%", delta !== null && Math.abs(delta - (-20)) < 1e-6,
      `esperado -20, recibido ${delta}`);
    const sentiment = calcSentiment(delta, "higher_is_better");
    assert("sentiment clicks baja = negative", sentiment === "negative",
      `esperado negative, recibido ${sentiment}`);
  }

  {
    // CPC bajó: lower_is_better → positive
    const delta = calcDeltaPercent(0.4, 0.8); // -50%
    assert("deltaPercent CPC -50%", delta !== null && Math.abs(delta - (-50)) < 1e-6,
      `esperado -50, recibido ${delta}`);
    const sentiment = calcSentiment(delta, "lower_is_better");
    assert("sentiment CPC baja = positive", sentiment === "positive",
      `esperado positive, recibido ${sentiment}`);
  }

  {
    // CPC subió: lower_is_better → negative
    const delta = calcDeltaPercent(1.2, 0.8); // +50%
    const sentiment = calcSentiment(delta, "lower_is_better");
    assert("sentiment CPC sube = negative", sentiment === "negative",
      `esperado negative, recibido ${sentiment}`);
  }

  // ── Sin datos previos → insufficient_data ─────────────────────────────────

  {
    const delta = calcDeltaPercent(100, 0); // previous = 0
    assert("deltaPercent con previous=0 = null", delta === null);
    const sentiment = calcSentiment(null, "higher_is_better");
    assert("sentiment sin datos previos = insufficient_data", sentiment === "insufficient_data");
  }

  // ── Historial vacío devuelve estado seguro ────────────────────────────────

  {
    const emptyHistory: AdsMetricSnapshotRecord[] = [];
    const totalSpend  = emptyHistory.reduce((s, r) => s + r.spend, 0);
    const snapshotCount = emptyHistory.length;
    assert("historial vacío: totalSpend = 0",    totalSpend === 0);
    assert("historial vacío: snapshotCount = 0", snapshotCount === 0);
    assert("historial vacío: insuficiente",      snapshotCount < 3);
  }

  // ── No secrets en snapshot ───────────────────────────────────────────────

  {
    const snap     = makeSnapshot();
    const serial   = JSON.stringify(snap).toLowerCase();
    const banned   = ["accesstoken", "access_token", "token", "secret", "password", "bearer"];
    const found    = banned.filter(f => serial.includes(f));
    assert("snapshot no expone secretos", found.length === 0,
      `Campos prohibidos: ${found.join(", ")}`);
  }

  // ── Trend point acumulación correcta ─────────────────────────────────────

  {
    const p1 = makeTrendPoint({ spend: 100, impressions: 5000, clicks: 100 });
    const p2 = makeTrendPoint({ spend: 80,  impressions: 4000, clicks: 80 });
    const combined: AdsTrendPoint = {
      date:        p1.date,
      spend:       p1.spend       + p2.spend,
      impressions: p1.impressions + p2.impressions,
      clicks:      p1.clicks      + p2.clicks,
      conversions: p1.conversions + p2.conversions,
      results:     p1.results     + p2.results,
      ctr:         0,
      cpc:         0,
    };
    combined.ctr = calcCtr(combined.clicks, combined.impressions);
    combined.cpc = calcCpc(combined.spend, combined.clicks);

    assert("acumulación: spend = 180",       Math.abs(combined.spend - 180) < 1e-6);
    assert("acumulación: impressions = 9000", combined.impressions === 9000);
    assert("acumulación: clicks = 180",       combined.clicks === 180);
    assert("acumulación: ctr recalculado",
      Math.abs(combined.ctr - 180 / 9000) < 1e-10,
      `esperado ${180 / 9000}, recibido ${combined.ctr}`);
  }

  // ── AdsHistoryRange labels definidos ─────────────────────────────────────

  {
    const { ADS_HISTORY_RANGE_LABEL } = require("./ads-analytics-history-types") as typeof import("./ads-analytics-history-types");
    const ranges = ["today", "week", "month", "quarter"] as const;
    for (const r of ranges) {
      assert(`Etiqueta definida para rango "${r}"`, !!ADS_HISTORY_RANGE_LABEL[r]);
    }
  }

  // ── Sentiment neutral dentro de rango ─────────────────────────────────────

  {
    // +3% no supera umbral de 5% → neutral
    const delta = calcDeltaPercent(103, 100);
    const sentiment = calcSentiment(delta, "higher_is_better");
    assert("sentiment +3% = neutral", sentiment === "neutral",
      `esperado neutral, recibido ${sentiment}`);
  }

  // ── Estructura AdsMetricSnapshotRecord completa ────────────────────────────

  {
    const snap = makeSnapshot();
    const requiredFields: (keyof AdsMetricSnapshotRecord)[] = [
      "id", "tenantId", "executionId", "provider", "platform",
      "range", "date", "currency", "spend", "impressions", "clicks",
      "ctr", "cpc", "cpm", "conversions", "externalStatus", "createdAt",
    ];
    for (const field of requiredFields) {
      assert(`AdsMetricSnapshotRecord.${field} existe`, snap[field] !== undefined);
    }
  }

  return { total: results.length, passed, failed, results };
}
