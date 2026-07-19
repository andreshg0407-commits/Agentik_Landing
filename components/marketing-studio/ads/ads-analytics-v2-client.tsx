"use client";
/**
 * components/marketing-studio/ads/ads-analytics-v2-client.tsx
 *
 * MARKETING-ANALYTICS-V2-FINAL-POLISH-01 — Centro ejecutivo de rendimiento
 *
 * Arquitectura:
 *   AdsAnalyticsOverview      — 4 tarjetas ejecutivas con comparación de período
 *   AdsAnalyticsComparison    — Meta · TikTok · Google Ads con tendencia
 *   AdsAnalyticsCards         — Cards protagonistas (creativo 220 px)
 *   AdsTopPerformersCards     — 4 categorías champion con razón explícita
 *   AdsAnalyticsInsights      — Hallazgos de Luca (mínimo — solo si son reales)
 *   AnuncioDrawer             — Ficha completa con creativo primero
 *   AnalyticsV2Client         — Orquestador principal
 *
 * Principios:
 *   - No crea anuncios. No crea contenido. No conecta cuentas.
 *   - Mide, compara, diagnostica, ayuda a decidir.
 *   - Lenguaje ejecutivo LATAM — sin jerga técnica visible.
 *   - Placeholders de alta fidelidad — misma estructura que datos reales.
 *   - Luca aparece solo cuando hay un hallazgo accionable verificado.
 */

import { useState, useTransition, useCallback }  from "react";
import type { ReactNode }                         from "react";
import { C, T, S, R, E }                         from "@/lib/ui/tokens";
import { MSStatusBadge }                          from "@/components/marketing-studio/shared/ms-status-badge";
import { MSDrawer }                               from "@/components/marketing-studio/shared/ms-drawer";
import { MSDrawerHeader }                         from "@/components/marketing-studio/shared/ms-drawer-header";
import { MSDrawerSection }                        from "@/components/marketing-studio/shared/ms-drawer-section";
import { MSDrawerFooter }                         from "@/components/marketing-studio/shared/ms-drawer-footer";
import type { MSStatusVariant }                   from "@/components/marketing-studio/shared/ms-status-badge";
import type {
  AdsAnalyticsResult,
  AdsAnalyticsRange,
  AdsAnalyticsItem,
  AdsAnalyticsInsight,
  AdsAnalyticsInsightSeverity,
} from "@/lib/marketing-studio/ads/ads-analytics-types";
import { ADS_ANALYTICS_RANGE_LABEL }             from "@/lib/marketing-studio/ads/ads-analytics-types";
import type { AdsHistorySummary }                from "@/lib/marketing-studio/ads/ads-analytics-history-types";
import { AdsAnalyticsHistoryClient }             from "./ads-analytics-history-client";

// ── Format helpers ─────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtCurrency(n: number, currency = "USD"): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(n);
}

function fmtCtr(ctr: number): string {
  return `${(ctr * 100).toFixed(2)}%`;
}

function fmtShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return fmt(n);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function fmtDeltaPct(delta: number): string {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

// ── Objective inference ────────────────────────────────────────────────────────

interface ObjectiveResult {
  label:              string;
  primaryMetricLabel: string;
  primaryMetricValue: string;
  costLabel:          string;
  costValue:          string;
}

function inferObjective(item: AdsAnalyticsItem): ObjectiveResult {
  const m        = item.metric;
  const currency = m.currency;

  if (m.conversions > 0) {
    const cpa = m.spend > 0 ? m.spend / m.conversions : 0;
    return {
      label:              "Conversiones",
      primaryMetricLabel: "Conversiones",
      primaryMetricValue: fmt(m.conversions),
      costLabel:          "Costo por conversión",
      costValue:          cpa > 0 ? fmtCurrency(cpa, currency) : "—",
    };
  }
  if (m.impressions > 200 && m.ctr > 0.015) {
    return {
      label:              "Tráfico",
      primaryMetricLabel: "Clics",
      primaryMetricValue: m.clicks > 0 ? fmt(m.clicks) : "—",
      costLabel:          "Costo por clic",
      costValue:          m.cpc > 0 ? fmtCurrency(m.cpc, currency) : "—",
    };
  }
  if (m.impressions > 500 && m.ctr < 0.005) {
    return {
      label:              "Alcance",
      primaryMetricLabel: "Impresiones",
      primaryMetricValue: fmtShort(m.impressions),
      costLabel:          "CPM",
      costValue:          m.cpm > 0 ? fmtCurrency(m.cpm, currency) : "—",
    };
  }
  const costPerResult = m.clicks > 0 && m.spend > 0 ? m.spend / m.clicks : 0;
  return {
    label:              "Resultados",
    primaryMetricLabel: "Resultados",
    primaryMetricValue: m.clicks > 0 ? fmtShort(m.clicks) : "—",
    costLabel:          "Costo por resultado",
    costValue:          costPerResult > 0 ? fmtCurrency(costPerResult, currency) : "—",
  };
}

// ── Top performers scoring ─────────────────────────────────────────────────────

export interface AnuncioScore {
  item:  AdsAnalyticsItem;
  score: number;
}

/**
 * Ordena anuncios por eficiencia compuesta.
 * CTR alto × impresiones suficientes pesa más que gasto alto.
 */
export function scoreAnuncios(items: AdsAnalyticsItem[]): AnuncioScore[] {
  return items
    .filter(i => i.metric.impressions > 0)
    .map(item => {
      const m         = item.metric;
      const ctrScore  = Math.min(m.ctr * 5000, 100);
      const reachScore = m.impressions > 0 ? Math.min(Math.log10(m.impressions) * 10, 40) : 0;
      const convBonus = m.conversions > 0 ? 30 : 0;
      const penalty   = item.issues.length > 0 ? 15 : 0;
      return { item, score: ctrScore + reachScore + convBonus - penalty };
    })
    .sort((a, b) => b.score - a.score);
}

// ── Champion categories ────────────────────────────────────────────────────────

interface ChampionCategory {
  key:         string;
  label:       string;
  icon:        string;
  accentColor: string;
  item:        AdsAnalyticsItem | null;
  value:       string | null;
  valueLabel:  string;
}

function buildChampionCategories(items: AdsAnalyticsItem[]): ChampionCategory[] {
  const active = items.filter(i => i.metric.impressions > 0);
  const used   = new Set<string>();

  function pick(sorted: AdsAnalyticsItem[]): AdsAnalyticsItem | null {
    const found = sorted.find(i => !used.has(i.executionId));
    if (found) used.add(found.executionId);
    return found ?? null;
  }

  // 1. Menor costo por resultado
  const byEfficiency = [...active].sort((a, b) => {
    const ca = a.metric.conversions > 0 ? a.metric.spend / a.metric.conversions : a.metric.cpc;
    const cb = b.metric.conversions > 0 ? b.metric.spend / b.metric.conversions : b.metric.cpc;
    if (ca <= 0 && cb <= 0) return 0;
    if (ca <= 0) return 1;
    if (cb <= 0) return -1;
    return ca - cb;
  });
  const effItem = pick(byEfficiency);

  // 2. Mayor CTR
  const byCtr  = [...active].sort((a, b) => b.metric.ctr - a.metric.ctr);
  const ctrItem = pick(byCtr);

  // 3. Más resultados
  const byResults = [...active].sort((a, b) => {
    const ra = a.metric.conversions > 0 ? a.metric.conversions : a.metric.clicks;
    const rb = b.metric.conversions > 0 ? b.metric.conversions : b.metric.clicks;
    return rb - ra;
  });
  const resItem = pick(byResults);

  // 4. Mejor rendimiento global (composite score)
  const byOverall = scoreAnuncios(active).map(s => s.item);
  const topItem   = pick(byOverall);

  const currency = active[0]?.metric.currency ?? "USD";

  return [
    {
      key:         "efficiency",
      label:       "Mejor costo por resultado",
      icon:        "💡",
      accentColor: C.green,
      item:        effItem,
      value: effItem
        ? (effItem.metric.conversions > 0
            ? fmtCurrency(effItem.metric.spend / effItem.metric.conversions, effItem.metric.currency)
            : effItem.metric.cpc > 0
            ? fmtCurrency(effItem.metric.cpc, effItem.metric.currency)
            : "—")
        : null,
      valueLabel: "por resultado",
    },
    {
      key:         "ctr",
      label:       "Mayor tasa de clics",
      icon:        "📈",
      accentColor: C.blueDark,
      item:        ctrItem,
      value:       ctrItem ? fmtCtr(ctrItem.metric.ctr) : null,
      valueLabel:  "CTR",
    },
    {
      key:         "results",
      label:       "Más resultados del período",
      icon:        "🏆",
      accentColor: C.amber,
      item:        resItem,
      value: resItem
        ? (resItem.metric.conversions > 0
            ? `${fmt(resItem.metric.conversions)} conversiones`
            : `${fmt(resItem.metric.clicks)} clics`)
        : null,
      valueLabel: "resultados",
    },
    {
      key:         "overall",
      label:       "Mejor rendimiento global",
      icon:        "⭐",
      accentColor: C.ink,
      item:        topItem,
      value:       topItem ? fmtShort(topItem.metric.impressions) : null,
      valueLabel:  "impresiones",
    },
  ];
}

// ── Status logic ───────────────────────────────────────────────────────────────

function statusForItem(item: AdsAnalyticsItem): { label: string; variant: MSStatusVariant } {
  if (item.issues.length > 0)        return { label: "Requiere atención", variant: "warning" };
  if (item.metric.impressions === 0) return { label: "Sin actividad",     variant: "neutral" };
  return                                    { label: "Activo",             variant: "ok" };
}

// ── Platform SVG logos ─────────────────────────────────────────────────────────

function MetaLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path
        d="M13.25 8.25h1.5V6h-1.5C11.179 6 9.5 7.679 9.5 9.75v1.25H8v2.25h1.5V18h2.25v-4.75H13.5l.375-2.25H11.75V9.75c0-.828.672-1.5 1.5-1.5z"
        fill="#fff"
      />
    </svg>
  );
}

function InstagramLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#FCAF45" />
          <stop offset="35%"  stopColor="#E1306C" />
          <stop offset="70%"  stopColor="#833AB4" />
          <stop offset="100%" stopColor="#405DE6" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#ig-grad)" />
      <rect x="7" y="7" width="10" height="10" rx="3" stroke="#fff" strokeWidth="1.6" fill="none" />
      <circle cx="12" cy="12" r="2.4" stroke="#fff" strokeWidth="1.6" fill="none" />
      <circle cx="16.2" cy="7.8" r="0.9" fill="#fff" />
    </svg>
  );
}

function TikTokLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <rect width="24" height="24" rx="5" fill="#111" />
      <path
        d="M15.6 5h-2v9.3a2.3 2.3 0 01-2.3 2.2 2.3 2.3 0 01-2.3-2.2 2.3 2.3 0 012.3-2.2c.2 0 .4 0 .6.1V9.8a5 5 0 00-.6 0 5 5 0 00-5 5 5 5 0 005 5 5 5 0 005-5V9.1a6.7 6.7 0 003.7 1.1V8a4.7 4.7 0 01-4.4-3z"
        fill="#fff"
      />
    </svg>
  );
}

function GoogleAdsLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="12" fill="#fff" />
      <circle cx="12" cy="12" r="11" fill="#fff" stroke="#e5e7eb" strokeWidth="0.5" />
      {/* Google "G" */}
      <path
        d="M19.5 12.2c0-.5 0-1-.1-1.5H12v2.8h4.2a3.6 3.6 0 01-1.6 2.4v2h2.6c1.5-1.4 2.3-3.4 2.3-5.7z"
        fill="#4285F4"
      />
      <path
        d="M12 20c2.1 0 3.9-.7 5.2-1.9l-2.6-2c-.7.5-1.6.8-2.6.8-2 0-3.7-1.3-4.3-3.2H5v2.1A8 8 0 0012 20z"
        fill="#34A853"
      />
      <path
        d="M7.7 13.7a4.8 4.8 0 010-3.4V8.2H5A8 8 0 004 12c0 1.3.3 2.5.9 3.8l2.8-2.1z"
        fill="#FBBC05"
      />
      <path
        d="M12 7.6c1.1 0 2.1.4 2.9 1.1l2.2-2.2A8 8 0 005 8.2l2.8 2.1C8.3 8.9 10 7.6 12 7.6z"
        fill="#EA4335"
      />
    </svg>
  );
}

function YouTubeLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <rect width="24" height="24" rx="5" fill="#FF0000" />
      <path
        d="M19.6 8.2a2 2 0 00-1.4-1.4C16.9 6.5 12 6.5 12 6.5s-4.9 0-6.2.3a2 2 0 00-1.4 1.4C4.1 9.5 4.1 12 4.1 12s0 2.5.3 3.8a2 2 0 001.4 1.4c1.3.3 6.2.3 6.2.3s4.9 0 6.2-.3a2 2 0 001.4-1.4c.3-1.3.3-3.8.3-3.8s0-2.5-.3-3.8z"
        fill="#FF0000"
      />
      <path d="M9.75 15.02l5.5-3.02-5.5-3.02v6.04z" fill="#fff" />
    </svg>
  );
}

function PlatformLogo({ platform, size = 20 }: { platform: string; size?: number }) {
  if (platform === "meta")    return <MetaLogo size={size} />;
  if (platform === "tiktok")  return <TikTokLogo size={size} />;
  return (
    <div style={{
      width: size, height: size, borderRadius: R.sm,
      background: C.surfaceAlt, border: `1px solid ${C.line}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 8, color: C.inkFaint, fontFamily: T.mono, flexShrink: 0,
    }}>
      ?
    </div>
  );
}

function platformName(platform: string): string {
  if (platform === "meta")   return "Meta Ads";
  if (platform === "tiktok") return "TikTok Ads";
  return "Mixto";
}

function platformCreativeGradient(platform: string): string {
  if (platform === "meta")   return `linear-gradient(145deg, #e8f0fb 0%, #d0e4ff 100%)`;
  if (platform === "tiktok") return `linear-gradient(145deg, #1a1a2e 0%, #16213e 100%)`;
  return `linear-gradient(145deg, ${C.surfaceAlt} 0%, ${C.lineSubtle} 100%)`;
}

function platformTextColor(platform: string): string {
  if (platform === "tiktok") return "rgba(255,255,255,0.5)";
  return C.inkFaint;
}

// ── Period delta badge ─────────────────────────────────────────────────────────

function DeltaBadge({
  deltaPercent,
  sentiment,
}: {
  deltaPercent: number | null;
  sentiment:    "positive" | "negative" | "neutral" | "insufficient_data";
}) {
  if (deltaPercent === null || sentiment === "insufficient_data") return null;
  const isUp    = deltaPercent >= 0;
  const color   = sentiment === "positive" ? C.green
                : sentiment === "negative" ? C.amber
                : C.inkFaint;
  const bg      = sentiment === "positive" ? C.greenLight
                : sentiment === "negative" ? C.amberLight
                : C.surfaceAlt;

  return (
    <span style={{
      display:     "inline-flex",
      alignItems:  "center",
      gap:         2,
      fontFamily:  T.mono,
      fontSize:    T.sz["2xs"],
      fontWeight:  T.wt.semibold,
      color,
      background:  bg,
      borderRadius: R.pill,
      padding:     `1px ${S[1]}px`,
      lineHeight:  1,
      whiteSpace:  "nowrap",
    }}>
      {isUp ? "↑" : "↓"} {fmtDeltaPct(Math.abs(deltaPercent))}
    </span>
  );
}

// ── Range selector ────────────────────────────────────────────────────────────

function RangeButton({
  range, active, onClick, disabled,
}: {
  range: AdsAnalyticsRange; active: boolean; onClick: () => void; disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily:   T.mono,
        fontSize:     T.sz.xs,
        fontWeight:   active ? T.wt.bold : T.wt.normal,
        color:        active ? C.white : C.inkMid,
        background:   active ? C.blueDark : "transparent",
        border:       `1px solid ${active ? C.blueDark : C.line}`,
        borderRadius: R.md,
        padding:      `${S[1]}px ${S[3]}px`,
        cursor:       disabled ? "default" : "pointer",
        opacity:      disabled ? 0.6 : 1,
        whiteSpace:   "nowrap",
        transition:   "background 120ms, color 120ms",
      }}
    >
      {ADS_ANALYTICS_RANGE_LABEL[range]}
    </button>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{
      background:   C.white,
      border:       `1px solid ${C.line}`,
      borderRadius: R.card,
      overflow:     "hidden",
      boxShadow:    E.xs,
    }}>
      <div style={{
        height:     compact ? 80 : 170,
        background: `linear-gradient(90deg, ${C.surfaceAlt} 0%, ${C.lineSubtle} 50%, ${C.surfaceAlt} 100%)`,
      }} />
      <div style={{ padding: `${S[4]}px` }}>
        <div style={{ height: 11, width: "65%", background: C.surfaceAlt, borderRadius: R.sm, marginBottom: S[2] }} />
        <div style={{ height: 9,  width: "40%", background: C.lineSubtle, borderRadius: R.sm, marginBottom: S[4] }} />
        {!compact && (
          <>
            <div style={{ height: 28, width: "55%", background: C.surfaceAlt, borderRadius: R.sm, marginBottom: S[3] }} />
            <div style={{ display: "flex", gap: S[2] }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ height: 8, flex: 1, background: C.lineSubtle, borderRadius: R.sm }} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SkeletonExecCard() {
  return (
    <div style={{
      flex:         "1 1 220px",
      minWidth:     200,
      background:   C.white,
      border:       `1px solid ${C.line}`,
      borderRadius: R.card,
      boxShadow:    E.xs,
      padding:      `${S[5]}px`,
      display:      "flex",
      flexDirection: "column" as const,
      gap:           S[3],
      minHeight:     140,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
        <div style={{ width: 28, height: 28, borderRadius: R.md, background: C.surfaceAlt }} />
        <div style={{ height: 9, width: "50%", background: C.surfaceAlt, borderRadius: R.sm }} />
      </div>
      <div style={{ height: 34, width: "60%", background: C.surfaceAlt, borderRadius: R.sm }} />
      <div style={{ height: 10, width: "80%", background: C.lineSubtle, borderRadius: R.sm }} />
      <div style={{ height: 9,  width: "50%", background: C.lineSubtle, borderRadius: R.sm, marginTop: "auto" }} />
    </div>
  );
}

// ── ExecCard — tarjeta ejecutiva principal ────────────────────────────────────

function ExecCard({
  iconEmoji, iconBg, title,
  value, deltaPercent, deltaSentiment,
  sub, sub2, accent, skeleton,
}: {
  iconEmoji:       string;
  iconBg?:         string;
  title:           string;
  value:           string;
  deltaPercent?:   number | null;
  deltaSentiment?: "positive" | "negative" | "neutral" | "insufficient_data";
  sub?:            string;
  sub2?:           string;
  accent?:         string;
  skeleton?:       boolean;
}) {
  if (skeleton) return <SkeletonExecCard />;

  return (
    <div style={{
      flex:          "1 1 220px",
      minWidth:      200,
      background:    C.white,
      border:        `1px solid ${C.line}`,
      borderRadius:  R.card,
      boxShadow:     E.xs,
      padding:       `${S[5]}px`,
      display:       "flex",
      flexDirection: "column" as const,
      gap:           S[2],
      minHeight:     140,
    }}>
      {/* Icon + title */}
      <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
        <div style={{
          width:        28,
          height:       28,
          borderRadius: R.md,
          background:   iconBg ?? C.surfaceAlt,
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          fontSize:     14,
          flexShrink:   0,
        }}>
          {iconEmoji}
        </div>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          color:         C.inkFaint,
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
          fontWeight:    T.wt.medium,
        }}>
          {title}
        </span>
      </div>

      {/* Value row — hero number + delta badge */}
      <div style={{ display: "flex", alignItems: "baseline", gap: S[2], flexWrap: "wrap" as const }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["4xl"],
          fontWeight:    T.wt.black,
          color:         accent ?? C.ink,
          lineHeight:    1,
          letterSpacing: "-0.03em",
        }}>
          {value}
        </span>
        {deltaPercent != null && deltaSentiment && (
          <DeltaBadge deltaPercent={deltaPercent} sentiment={deltaSentiment} />
        )}
      </div>

      {/* Sub — primary descriptor */}
      {sub && (
        <div style={{
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          color:      C.inkFaint,
          lineHeight: 1.4,
        }}>
          {sub}
        </div>
      )}

      {/* Sub2 — secondary descriptor, pushed to bottom */}
      {sub2 && (
        <div style={{
          fontFamily:  T.mono,
          fontSize:    T.sz["2xs"],
          color:       C.inkGhost,
          paddingTop:  S[2],
          borderTop:   `1px solid ${C.lineSubtle}`,
          marginTop:   "auto",
          lineHeight:  1.4,
        }}>
          {sub2}
        </div>
      )}
    </div>
  );
}

// ── AdsAnalyticsOverview — 4 tarjetas ejecutivas ──────────────────────────────

export function AdsAnalyticsOverview({
  data, hasData, history,
}: {
  data:     AdsAnalyticsResult;
  hasData:  boolean;
  history?: AdsHistorySummary | null;
}) {
  const t        = data.summary.totals;
  const s        = data.summary;
  const currency = t.currency;
  const comp     = history?.periodComparison ?? null;

  function getDelta(metric: string) {
    if (!comp?.hasEnoughData) return { pct: null, sentiment: "insufficient_data" as const };
    const d = comp.deltas.find(d => d.metric === metric);
    return { pct: d?.deltaPercent ?? null, sentiment: d?.sentiment ?? "insufficient_data" as const };
  }

  const spendDelta       = getDelta("spend");
  const impressionsDelta = getDelta("impressions");

  // Rendimiento — prefer conversions > clicks
  const hasConversions   = t.conversions > 0;
  const rendValue        = hasData
    ? (hasConversions ? fmtShort(t.conversions) : t.clicks > 0 ? fmtShort(t.clicks) : "—")
    : "—";
  const rendLabel        = hasConversions ? "Conversiones" : "Clics";
  const rendCost         = hasData
    ? (hasConversions && t.spend > 0
        ? `${fmtCurrency(t.spend / t.conversions, currency)} por conversión`
        : t.cpc > 0
        ? `${fmtCurrency(t.cpc, currency)} por clic`
        : "Sin resultados registrados")
    : "Las métricas aparecerán con actividad sincronizada";
  const rendDelta        = getDelta(hasConversions ? "conversions" : "clicks");

  // Alcance
  const alcanceValue = hasData && t.impressions > 0 ? fmtShort(t.impressions) : "—";
  const alcanceSub   = hasData && t.cpm > 0
    ? `CPM ${fmtCurrency(t.cpm, currency)} · CTR ${fmtCtr(t.ctr)}`
    : hasData ? "Sin impresiones en el período" : "Sin datos aún";

  // Estado operativo
  const activos   = s.activeCount ?? (data.items.length - (s.inReviewCount ?? 0) - (s.pausedCount ?? 0));
  const pausados  = s.pausedCount ?? 0;
  const enRevision = s.inReviewCount ?? 0;
  const conAlertas = data.items.filter(i => i.issues.length > 0).length;

  const estadoValue  = hasData
    ? (conAlertas > 0 ? `${conAlertas}` : activos > 0 ? `${activos}` : "0")
    : "—";
  const estadoSub    = hasData
    ? (conAlertas > 0
        ? `${conAlertas} anuncio${conAlertas > 1 ? "s" : ""} requieren atención`
        : `${activos} activo${activos > 1 ? "s" : ""} · ${pausados} pausado${pausados !== 1 ? "s" : ""}`)
    : "Cuando publiques anuncios aparecerá el estado aquí";
  const estadoSub2   = hasData
    ? `Actualizado ${fmtDateTime(data.generatedAt)}`
    : undefined;
  const estadoAccent = hasData && conAlertas > 0 ? C.amber
                     : hasData && activos > 0    ? C.green
                     : undefined;

  return (
    <div style={{ marginBottom: S[5] }}>
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   S[3],
      }}>
        <span style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.sm,
          fontWeight:  T.wt.semibold,
          color:       C.inkMid,
        }}>
          Resumen del período
        </span>
        {data.partial && <MSStatusBadge label="Datos parciales" variant="warning" />}
        {comp?.hasEnoughData && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            vs. período anterior
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const }}>
        {/* 1. Gasto del período */}
        <ExecCard
          iconEmoji="💰"
          iconBg="#f0fdf4"
          title="Gasto del período"
          value={hasData && t.spend > 0 ? fmtCurrency(t.spend, currency) : "—"}
          deltaPercent={spendDelta.pct}
          deltaSentiment={spendDelta.sentiment === "positive" ? "negative" : spendDelta.sentiment === "negative" ? "positive" : spendDelta.sentiment}
          sub={hasData && t.spend > 0
            ? `${data.items.length} anuncio${data.items.length !== 1 ? "s" : ""} en el período`
            : "Sin gasto registrado en el período"}
          sub2="Valor indicativo · no usar para contabilidad"
          skeleton={false}
        />
        {/* 2. Rendimiento general */}
        <ExecCard
          iconEmoji="📊"
          iconBg={hasData && hasConversions ? C.greenLight : C.blueLight}
          title={rendLabel}
          value={rendValue}
          deltaPercent={rendDelta.pct}
          deltaSentiment={rendDelta.sentiment}
          sub={rendCost}
          sub2={hasData && t.clicks > 0 ? `${fmt(t.clicks)} clics · CTR ${fmtCtr(t.ctr)}` : undefined}
          accent={hasData && t.conversions > 0 ? C.green : undefined}
          skeleton={!hasData}
        />
        {/* 3. Alcance total */}
        <ExecCard
          iconEmoji="👁"
          iconBg={C.blueLight}
          title="Alcance total"
          value={alcanceValue}
          deltaPercent={impressionsDelta.pct}
          deltaSentiment={impressionsDelta.sentiment}
          sub={alcanceSub}
          sub2={hasData && t.impressions > 0 ? `${fmt(data.items.length)} fuentes de datos` : undefined}
          skeleton={!hasData}
        />
        {/* 4. Estado operativo */}
        <ExecCard
          iconEmoji={conAlertas > 0 ? "⚠" : "🟢"}
          iconBg={conAlertas > 0 ? C.amberLight : C.greenLight}
          title="Estado operativo"
          value={estadoValue}
          sub={estadoSub}
          sub2={estadoSub2}
          accent={estadoAccent}
          skeleton={!hasData}
        />
      </div>
    </div>
  );
}

// ── Platform comparison ────────────────────────────────────────────────────────

interface PlatformMetricRow {
  label: string;
  value: string;
}

function PlatformCompCard({
  label, logo, metric, totalSpend, trend, empty,
}: {
  label:      string;
  logo:       ReactNode;
  metric:     { spend: number; impressions: number; clicks: number; ctr: number; cpc: number; cpm: number; currency: string; conversions: number } | null;
  totalSpend: number;
  trend?:     "up" | "down" | "neutral";
  empty?:     boolean;
}) {
  const pct = metric && totalSpend > 0
    ? Math.round((metric.spend / totalSpend) * 100)
    : 0;

  const trendIcon  = trend === "up" ? "↑" : trend === "down" ? "↓" : null;
  const trendColor = trend === "up" ? C.green : trend === "down" ? C.amber : C.inkFaint;

  const rows: PlatformMetricRow[] = metric
    ? [
        { label: "Inversión",          value: metric.spend > 0       ? fmtCurrency(metric.spend, metric.currency) : "—" },
        { label: "Resultados",         value: metric.conversions > 0 ? fmt(metric.conversions) : metric.clicks > 0 ? fmtShort(metric.clicks) : "—" },
        { label: "Costo por resultado", value: metric.cpc > 0        ? fmtCurrency(metric.cpc, metric.currency) : "—" },
        { label: "CTR",                value: metric.ctr > 0         ? fmtCtr(metric.ctr) : "—" },
      ]
    : [
        { label: "Inversión",          value: "—" },
        { label: "Resultados",         value: "—" },
        { label: "Costo por resultado", value: "—" },
        { label: "CTR",                value: "—" },
      ];

  return (
    <div style={{
      flex:         "1 1 200px",
      minWidth:     180,
      background:   C.white,
      border:       `1px solid ${empty ? C.lineSubtle : C.line}`,
      borderRadius: R.card,
      boxShadow:    E.xs,
      overflow:     "hidden",
      opacity:      empty ? 0.65 : 1,
    }}>
      {/* Header */}
      <div style={{
        padding:        `${S[3]}px ${S[4]}px`,
        borderBottom:   `1px solid ${C.lineSubtle}`,
        background:     C.surface,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          {logo}
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
            {label}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
          {trendIcon && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: trendColor, fontWeight: T.wt.bold }}>
              {trendIcon}
            </span>
          )}
          <span style={{
            fontFamily:   T.mono,
            fontSize:     T.sz["2xs"],
            color:        empty ? C.inkGhost : C.inkFaint,
            background:   C.surfaceAlt,
            border:       `1px solid ${C.line}`,
            borderRadius: R.pill,
            padding:      `1px ${S[1]}px`,
          }}>
            {empty ? "Sin conexión" : `${pct}%`}
          </span>
        </div>
      </div>

      {/* Metrics — 2×2 grid */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr 1fr",
        gap:                 1,
        background:          C.lineSubtle,
      }}>
        {rows.map(row => (
          <div key={row.label} style={{ background: C.white, padding: `${S[2]}px ${S[3]}px` }}>
            <div style={{
              fontFamily:    T.mono,
              fontSize:      T.sz["2xs"],
              color:         C.inkFaint,
              textTransform: "uppercase" as const,
              letterSpacing: "0.05em",
              marginBottom:  2,
            }}>
              {row.label}
            </div>
            <div style={{
              fontFamily: T.mono,
              fontSize:   T.sz.lg,
              fontWeight: T.wt.bold,
              color:      empty ? C.inkGhost : C.ink,
            }}>
              {row.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdsAnalyticsComparison({
  data, hasData, history,
}: {
  data:     AdsAnalyticsResult;
  hasData:  boolean;
  history?: AdsHistorySummary | null;
}) {
  const bp    = data.summary.byPlatform;
  const total = data.summary.totals.spend;

  function platformTrend(platform: string): "up" | "down" | "neutral" {
    if (!history) return "neutral";
    const series = history.trendSeries.find(s => s.platform === platform);
    if (!series?.latest || !series.earliest) return "neutral";
    const delta = series.latest.spend - series.earliest.spend;
    if (series.earliest.spend <= 0) return "neutral";
    const pct = delta / series.earliest.spend;
    if (pct > 0.05) return "up";
    if (pct < -0.05) return "down";
    return "neutral";
  }

  return (
    <div style={{ marginBottom: S[6] }}>
      <div style={{
        fontFamily:   T.mono,
        fontSize:     T.sz.sm,
        fontWeight:   T.wt.semibold,
        color:        C.inkMid,
        marginBottom: S[3],
      }}>
        Rendimiento por plataforma
      </div>
      <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const }}>
        <PlatformCompCard
          label="Meta Ads"
          logo={<MetaLogo size={20} />}
          metric={bp.meta ?? null}
          totalSpend={total}
          trend={platformTrend("meta")}
          empty={!bp.meta}
        />
        <PlatformCompCard
          label="TikTok Ads"
          logo={<TikTokLogo size={20} />}
          metric={bp.tiktok ?? null}
          totalSpend={total}
          trend={platformTrend("tiktok")}
          empty={!bp.tiktok}
        />
        <PlatformCompCard
          label="Google Ads"
          logo={<GoogleAdsLogo size={20} />}
          metric={null}
          totalSpend={total}
          trend="neutral"
          empty
        />
      </div>
    </div>
  );
}

// ── AnuncioCard — protagonista principal ──────────────────────────────────────

function AnuncioCard({ item, onClick }: { item: AdsAnalyticsItem; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const obj    = inferObjective(item);
  const status = statusForItem(item);
  const name   = item.campaignName ?? `Anuncio ${item.executionId.slice(-8)}`;
  const m      = item.metric;

  // Trend indicator from CTR benchmark (> 1% = good)
  const ctrBenchmark = 0.01;
  const trend = m.ctr > ctrBenchmark * 1.5 ? "up"
              : m.ctr < ctrBenchmark * 0.5 && m.impressions > 100 ? "down"
              : "neutral";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => e.key === "Enter" && onClick()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:    C.white,
        border:        `1px solid ${hovered ? C.blueDark + "44" : C.line}`,
        borderRadius:  R.card,
        overflow:      "hidden",
        boxShadow:     hovered ? E.md : E.xs,
        cursor:        "pointer",
        transition:    "border-color 140ms, box-shadow 140ms",
        display:       "flex",
        flexDirection: "column" as const,
      }}
    >
      {/* ── Creative area — half of card ── */}
      <div style={{
        height:         220,
        background:     platformCreativeGradient(item.platform),
        position:       "relative",
        flexShrink:     0,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
      }}>
        {/* Platform badge — top left */}
        <div style={{
          position:     "absolute",
          top:          S[3],
          left:         S[3],
          background:   "rgba(255,255,255,0.95)",
          borderRadius: R.md,
          padding:      `${S[1]}px ${S[2]}px`,
          boxShadow:    E.xs,
          display:      "flex",
          alignItems:   "center",
          gap:          S[1],
        }}>
          <PlatformLogo platform={item.platform} size={14} />
          <span style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            color:      C.inkMid,
            fontWeight: T.wt.medium,
          }}>
            {platformName(item.platform)}
          </span>
        </div>

        {/* Status badge — top right */}
        <div style={{ position: "absolute", top: S[3], right: S[3] }}>
          <MSStatusBadge label={status.label} variant={status.variant} />
        </div>

        {/* Objective pill — bottom left */}
        <div style={{
          position:     "absolute",
          bottom:       S[2],
          left:         S[3],
          background:   "rgba(0,0,0,0.50)",
          borderRadius: R.pill,
          padding:      `2px ${S[2]}px`,
        }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: "#fff" }}>
            {obj.label}
          </span>
        </div>

        {/* Trend indicator — bottom right */}
        {trend !== "neutral" && m.impressions > 0 && (
          <div style={{
            position:     "absolute",
            bottom:       S[2],
            right:        S[3],
            background:   trend === "up" ? C.greenLight : C.amberLight,
            borderRadius: R.pill,
            padding:      `2px ${S[2]}px`,
            display:      "flex",
            alignItems:   "center",
            gap:          2,
          }}>
            <span style={{
              fontFamily: T.mono,
              fontSize:   T.sz["2xs"],
              color:      trend === "up" ? C.green : C.amber,
              fontWeight: T.wt.semibold,
            }}>
              {trend === "up" ? "↑" : "↓"} CTR
            </span>
          </div>
        )}

        {/* Issues badge */}
        {item.issues.length > 0 && trend === "neutral" && (
          <div style={{
            position:     "absolute",
            bottom:       S[2],
            right:        S[3],
            background:   C.amberLight,
            borderRadius: R.pill,
            padding:      `2px ${S[2]}px`,
          }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber, fontWeight: T.wt.medium }}>
              ⚠ Atención
            </span>
          </div>
        )}

        {/* Creative placeholder visual */}
        <PlatformLogo platform={item.platform} size={36} />
      </div>

      {/* ── Body ── */}
      <div style={{
        padding:       `${S[4]}px`,
        flex:          1,
        display:       "flex",
        flexDirection: "column" as const,
      }}>
        {/* Name */}
        <div style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.sm,
          fontWeight:  T.wt.semibold,
          color:       C.ink,
          whiteSpace:  "nowrap",
          overflow:    "hidden",
          textOverflow: "ellipsis",
          marginBottom: S[3],
        }}>
          {name}
        </div>

        {/* Primary metric */}
        <div style={{
          background:   C.surface,
          borderRadius: R.lg,
          padding:      `${S[3]}px`,
          marginBottom: S[3],
          display:      "grid",
          gridTemplateColumns: "1fr 1fr",
          gap:          S[2],
        }}>
          <div>
            <div style={{
              fontFamily:    T.mono,
              fontSize:      T.sz["2xs"],
              color:         C.inkFaint,
              textTransform: "uppercase" as const,
              letterSpacing: "0.06em",
              marginBottom:  S[1],
            }}>
              {obj.primaryMetricLabel}
            </div>
            <div style={{
              fontFamily:    T.mono,
              fontSize:      T.sz["2xl"],
              fontWeight:    T.wt.bold,
              color:         C.ink,
              lineHeight:    1,
              letterSpacing: "-0.02em",
            }}>
              {obj.primaryMetricValue}
            </div>
          </div>
          <div>
            <div style={{
              fontFamily:    T.mono,
              fontSize:      T.sz["2xs"],
              color:         C.inkFaint,
              textTransform: "uppercase" as const,
              letterSpacing: "0.06em",
              marginBottom:  S[1],
            }}>
              {obj.costLabel}
            </div>
            <div style={{
              fontFamily:    T.mono,
              fontSize:      T.sz.lg,
              fontWeight:    T.wt.bold,
              color:         C.inkMid,
              lineHeight:    1,
            }}>
              {obj.costValue}
            </div>
          </div>
        </div>

        {/* Supporting metrics */}
        <div style={{
          display:             "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap:                 S[2],
          paddingTop:          S[3],
          borderTop:           `1px solid ${C.lineSubtle}`,
        }}>
          {[
            { label: "Gasto",       value: m.spend > 0       ? fmtCurrency(m.spend, m.currency) : "—" },
            { label: "Impresiones", value: m.impressions > 0 ? fmtShort(m.impressions) : "—" },
            { label: "CTR",         value: m.ctr > 0         ? fmtCtr(m.ctr) : "—" },
          ].map(cell => (
            <div key={cell.label}>
              <div style={{
                fontFamily:    T.mono,
                fontSize:      T.sz["2xs"],
                color:         C.inkGhost,
                textTransform: "uppercase" as const,
                letterSpacing: "0.05em",
              }}>
                {cell.label}
              </div>
              <div style={{
                fontFamily: T.mono,
                fontSize:   T.sz.xs,
                fontWeight: T.wt.medium,
                color:      C.inkMid,
                marginTop:  2,
              }}>
                {cell.value}
              </div>
            </div>
          ))}
        </div>

        {/* Ver detalles CTA */}
        <div style={{ marginTop: S[3] }}>
          <div style={{
            display:        "inline-flex",
            alignItems:     "center",
            gap:            S[1],
            fontFamily:     T.mono,
            fontSize:       T.sz.xs,
            fontWeight:     T.wt.medium,
            color:          hovered ? C.white : C.blueDark,
            background:     hovered ? C.blueDark : C.blueLight,
            border:         `1px solid ${hovered ? C.blueDark : C.blueBorder}`,
            borderRadius:   R.md,
            padding:        `${S[1]}px ${S[3]}px`,
            transition:     "background 140ms, color 140ms",
            pointerEvents:  "none",
          }}>
            Ver detalles →
          </div>
        </div>
      </div>
    </div>
  );
}

const MAX_VISIBLE = 6;

export function AdsAnalyticsCards({
  data, hasData, onSelectItem,
}: {
  data:         AdsAnalyticsResult;
  hasData:      boolean;
  onSelectItem: (item: AdsAnalyticsItem) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const items   = data.items;
  const visible = showAll ? items : items.slice(0, MAX_VISIBLE);

  return (
    <div style={{ marginBottom: S[6] }}>
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   S[4],
      }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
            Anuncios del período
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
            {hasData
              ? `${items.length} anuncio${items.length !== 1 ? "s" : ""} con datos sincronizados · selecciona para ver el detalle completo`
              : "Los anuncios sincronizados con Meta y TikTok aparecerán aquí"}
          </div>
        </div>
      </div>

      <div style={{
        display:             "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap:                 S[4],
      }}>
        {hasData
          ? visible.map(item => (
              <AnuncioCard key={item.executionId} item={item} onClick={() => onSelectItem(item)} />
            ))
          : [0, 1, 2].map(i => <SkeletonCard key={i} />)
        }
      </div>

      {hasData && items.length > MAX_VISIBLE && !showAll && (
        <div style={{ marginTop: S[4], textAlign: "center" as const }}>
          <button
            onClick={() => setShowAll(true)}
            style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              color:        C.inkMid,
              background:   C.white,
              border:       `1px solid ${C.line}`,
              borderRadius: R.md,
              padding:      `${S[2]}px ${S[5]}px`,
              cursor:       "pointer",
            }}
          >
            Ver todos ({items.length})
          </button>
        </div>
      )}
    </div>
  );
}

// ── Champion cards — Anuncios con mejor rendimiento ───────────────────────────

function ChampionCardComp({
  champ, onClick,
}: {
  champ:   ChampionCategory;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { item } = champ;
  const name = item ? (item.campaignName ?? `Anuncio ${item.executionId.slice(-8)}`) : null;

  return (
    <div
      role={item ? "button" : undefined}
      tabIndex={item ? 0 : undefined}
      onClick={item ? onClick : undefined}
      onKeyDown={item ? (e => e.key === "Enter" && onClick()) : undefined}
      onMouseEnter={() => item && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:   C.white,
        border:       `1px solid ${hovered ? champ.accentColor + "55" : C.line}`,
        borderRadius: R.card,
        boxShadow:    hovered ? E.sm : E.xs,
        cursor:       item ? "pointer" : "default",
        transition:   "border-color 130ms, box-shadow 130ms",
        overflow:     "hidden",
        display:      "flex",
        flexDirection: "column" as const,
      }}
    >
      {/* Category banner */}
      <div style={{
        background:  `${champ.accentColor}12`,
        borderBottom: `1px solid ${champ.accentColor}22`,
        padding:     `${S[2]}px ${S[3]}px`,
        display:     "flex",
        alignItems:  "center",
        gap:         S[2],
      }}>
        <span style={{ fontSize: 13 }}>{champ.icon}</span>
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          fontWeight: T.wt.semibold,
          color:      champ.accentColor,
        }}>
          {champ.label}
        </span>
      </div>

      {/* Content */}
      <div style={{ padding: `${S[3]}px ${S[4]}px`, flex: 1 }}>
        {item ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[2] }}>
              <PlatformLogo platform={item.platform} size={16} />
              <span style={{
                fontFamily:  T.mono,
                fontSize:    T.sz.xs,
                fontWeight:  T.wt.medium,
                color:       C.ink,
                whiteSpace:  "nowrap",
                overflow:    "hidden",
                textOverflow: "ellipsis",
              }}>
                {name}
              </span>
            </div>
            {champ.value && (
              <div style={{
                fontFamily:    T.mono,
                fontSize:      T.sz["2xl"],
                fontWeight:    T.wt.bold,
                color:         champ.accentColor,
                lineHeight:    1,
                letterSpacing: "-0.02em",
                marginBottom:  S[1],
              }}>
                {champ.value}
              </div>
            )}
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
              {champ.valueLabel}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
            <div style={{ height: 10, width: "70%", background: C.surfaceAlt, borderRadius: R.sm }} />
            <div style={{ height: 24, width: "45%", background: C.lineSubtle, borderRadius: R.sm }} />
            <div style={{ height: 8,  width: "30%", background: C.lineSubtle, borderRadius: R.sm }} />
          </div>
        )}
      </div>
    </div>
  );
}

export function AdsTopPerformersCards({
  data, hasData, onSelectItem,
}: {
  data:         AdsAnalyticsResult;
  hasData:      boolean;
  onSelectItem: (item: AdsAnalyticsItem) => void;
}) {
  const champions = hasData ? buildChampionCategories(data.items) : [
    { key: "efficiency", label: "Mejor costo por resultado", icon: "💡", accentColor: C.green,   item: null, value: null, valueLabel: "por resultado" },
    { key: "ctr",        label: "Mayor tasa de clics",       icon: "📈", accentColor: C.blueDark, item: null, value: null, valueLabel: "CTR" },
    { key: "results",    label: "Más resultados del período", icon: "🏆", accentColor: C.amber,   item: null, value: null, valueLabel: "resultados" },
    { key: "overall",    label: "Mejor rendimiento global",  icon: "⭐", accentColor: C.ink,     item: null, value: null, valueLabel: "impresiones" },
  ];

  return (
    <div style={{ marginBottom: S[6] }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[1] }}>
        Anuncios con mejor rendimiento
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[3] }}>
        {hasData
          ? "Clasificados por criterio de eficiencia · selecciona para ver el detalle"
          : "El ranking aparecerá cuando existan métricas sincronizadas"}
      </div>

      <div style={{
        display:             "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap:                 S[3],
      }}>
        {champions.map(champ => (
          <ChampionCardComp
            key={champ.key}
            champ={champ}
            onClick={() => champ.item && onSelectItem(champ.item)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Hallazgos de Luca — presencia mínima ──────────────────────────────────────

function insightAccent(severity: AdsAnalyticsInsightSeverity): { color: string; bg: string; icon: string } {
  if (severity === "warning")     return { color: C.amber,    bg: C.amberLight, icon: "⚠" };
  if (severity === "opportunity") return { color: C.green,    bg: C.greenLight, icon: "↗" };
  return                                 { color: C.blueDark, bg: C.blueLight,  icon: "ℹ" };
}

export function AdsAnalyticsInsights({ insights }: { insights: AdsAnalyticsInsight[] }) {
  const warnings = insights.filter(i => i.severity === "warning").slice(0, 2);
  const opps     = insights.filter(i => i.severity === "opportunity").slice(0, 2 - warnings.length);
  const shown    = [...warnings, ...opps].slice(0, 2);

  if (shown.length === 0) {
    return (
      <div style={{
        fontFamily:   T.mono,
        fontSize:     T.sz.xs,
        color:        C.inkFaint,
        fontStyle:    "italic" as const,
        marginBottom: S[5],
        padding:      `${S[2]}px 0`,
        borderTop:    `1px solid ${C.lineSubtle}`,
      }}>
        Luca · Sin hallazgos relevantes durante este período.
      </div>
    );
  }

  return (
    <div style={{ marginBottom: S[5] }}>
      <div style={{
        fontFamily:   T.mono,
        fontSize:     T.sz["2xs"],
        color:        C.inkFaint,
        textTransform: "uppercase" as const,
        letterSpacing: "0.06em",
        marginBottom: S[2],
      }}>
        Hallazgos de Luca
      </div>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
        {shown.map(insight => {
          const { color, bg, icon } = insightAccent(insight.severity);
          return (
            <div key={insight.id} style={{
              display:     "flex",
              gap:         S[3],
              alignItems:  "flex-start",
              padding:     `${S[3]}px ${S[4]}px`,
              background:  C.white,
              border:      `1px solid ${C.line}`,
              borderRadius: R.xl,
              boxShadow:   E.xs,
            }}>
              <div style={{
                width:          24,
                height:         24,
                borderRadius:   R.md,
                background:     bg,
                color,
                flexShrink:     0,
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                fontSize:       11,
                fontWeight:     T.wt.bold,
              }}>
                {icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.sm,
                  fontWeight: T.wt.semibold,
                  color:      C.ink,
                }}>
                  {insight.title}
                </div>
                <div style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  color:      C.inkFaint,
                  lineHeight: 1.5,
                  marginTop:  2,
                }}>
                  {insight.description}
                </div>
                {insight.action && (
                  <div style={{
                    fontFamily: T.mono,
                    fontSize:   T.sz.xs,
                    color,
                    fontWeight: T.wt.medium,
                    marginTop:  S[1],
                  }}>
                    → {insight.action}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Drawer — ficha completa ────────────────────────────────────────────────────

function DrawerKV({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div style={{
      display:     "flex",
      justifyContent: "space-between",
      padding:     `${S[1]}px 0`,
      alignItems:  "center",
      borderBottom: `1px solid ${C.lineSubtle}`,
    }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{
        fontFamily: T.mono,
        fontSize:   T.sz.xs,
        color:      color ?? C.inkMid,
        fontWeight: T.wt.medium,
        textAlign:  "right" as const,
        marginLeft: S[3],
      }}>
        {value}
      </span>
    </div>
  );
}

function DrawerMetricGrid({
  metrics,
}: {
  metrics: { label: string; value: string; highlight?: boolean }[];
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
      {metrics.map(m => (
        <div key={m.label} style={{
          background:   C.surface,
          borderRadius: R.lg,
          padding:      `${S[2]}px ${S[3]}px`,
        }}>
          <div style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            color:         C.inkFaint,
            textTransform: "uppercase" as const,
            letterSpacing: "0.05em",
          }}>
            {m.label}
          </div>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz.lg,
            fontWeight: T.wt.bold,
            color:      m.highlight ? C.ink : C.inkMid,
            marginTop:  2,
          }}>
            {m.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AnuncioDrawer({
  item, orgSlug, range, onClose,
}: {
  item:    AdsAnalyticsItem;
  orgSlug: string;
  range:   AdsAnalyticsRange;
  onClose: () => void;
}) {
  const m           = item.metric;
  const obj         = inferObjective(item);
  const status      = statusForItem(item);
  const name        = item.campaignName ?? `Anuncio ${item.executionId.slice(-8)}`;
  const currency    = m.currency;
  const domainColor = item.platform === "meta"   ? "#1877F2"
                    : item.platform === "tiktok"  ? "#111111"
                    : C.blueDark;
  const costPerConv = m.conversions > 0 && m.spend > 0
    ? m.spend / m.conversions
    : 0;

  // Approximate calendar range from fetchedAt
  const rangedays: Record<AdsAnalyticsRange, number> = { today: 1, week: 7, month: 30 };
  const days    = rangedays[range];
  const dateTo  = new Date(item.fetchedAt);
  const dateFrom = new Date(dateTo.getTime() - days * 24 * 60 * 60 * 1000);

  return (
    <MSDrawer onClose={onClose} width="clamp(480px, 44vw, 640px)">
      <MSDrawerHeader
        domainColor={domainColor}
        name={name}
        sku={platformName(item.platform)}
        category={obj.label}
        statusVariant={status.variant}
        statusLabel={status.label}
        readinessScore={m.impressions > 0 ? Math.min(100, Math.round((m.ctr / 0.02) * 100)) : 0}
        onClose={onClose}
      />

      <div style={{ flex: 1, overflowY: "auto" as const, padding: `${S[5]}px` }}>

        {/* ── 1. Creativo ── */}
        <MSDrawerSection title="Creativo">
          <div style={{
            height:         220,
            borderRadius:   R.xl,
            background:     platformCreativeGradient(item.platform),
            border:         `1px solid ${C.line}`,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            flexDirection:  "column" as const,
            gap:            S[2],
            marginBottom:   S[3],
            position:       "relative",
          }}>
            <PlatformLogo platform={item.platform} size={32} />
            <span style={{
              fontFamily: T.mono,
              fontSize:   T.sz.xs,
              color:      platformTextColor(item.platform),
              textAlign:  "center" as const,
              maxWidth:   260,
              lineHeight: 1.4,
            }}>
              Vista previa disponible en {platformName(item.platform)}
            </span>
          </div>
          <DrawerKV label="Texto del anuncio"   value="Disponible en la plataforma" />
          <DrawerKV label="Título"              value="Disponible en la plataforma" />
          <DrawerKV label="Llamado a la acción" value="Disponible en la plataforma" />
          <DrawerKV label="URL de destino"      value="Disponible en la plataforma" />
        </MSDrawerSection>

        {/* ── 2. Resumen ejecutivo ── */}
        <MSDrawerSection title="Resumen ejecutivo">
          <DrawerKV label="Plataforma"    value={platformName(item.platform)} />
          <DrawerKV label="Objetivo"      value={obj.label} />
          <DrawerKV label="Estado"        value={<MSStatusBadge label={status.label} variant={status.variant} />} />
          <DrawerKV label="Período"       value={ADS_ANALYTICS_RANGE_LABEL[range]} />
          {item.campaignName && (
            <DrawerKV label="Campaña"     value={item.campaignName} />
          )}
        </MSDrawerSection>

        {/* ── 3. Resultado principal ── */}
        <MSDrawerSection title="Resultado principal">
          <div style={{
            background:   `linear-gradient(135deg, ${C.surface} 0%, ${C.surfaceAlt} 100%)`,
            border:       `1px solid ${C.line}`,
            borderRadius: R.xl,
            padding:      `${S[4]}px`,
            display:      "flex",
            alignItems:   "center",
            gap:          S[4],
          }}>
            <div>
              <div style={{
                fontFamily:    T.mono,
                fontSize:      T.sz["2xs"],
                color:         C.inkFaint,
                textTransform: "uppercase" as const,
                letterSpacing: "0.06em",
              }}>
                {obj.primaryMetricLabel}
              </div>
              <div style={{
                fontFamily:    T.mono,
                fontSize:      T.sz["3xl"],
                fontWeight:    T.wt.bold,
                color:         C.ink,
                lineHeight:    1,
                letterSpacing: "-0.02em",
              }}>
                {obj.primaryMetricValue}
              </div>
            </div>
          </div>
        </MSDrawerSection>

        {/* ── 4. Costo por resultado ── */}
        <MSDrawerSection title="Costo por resultado">
          <div style={{
            background:   C.blueLight,
            border:       `1px solid ${C.blueBorder}`,
            borderRadius: R.xl,
            padding:      `${S[4]}px`,
            display:      "flex",
            flexDirection: "column" as const,
            gap:           S[1],
          }}>
            <div style={{
              fontFamily:    T.mono,
              fontSize:      T.sz["2xs"],
              color:         C.blue,
              textTransform: "uppercase" as const,
              letterSpacing: "0.06em",
            }}>
              {obj.costLabel}
            </div>
            <div style={{
              fontFamily:    T.mono,
              fontSize:      T.sz["2xl"],
              fontWeight:    T.wt.bold,
              color:         C.blueDark,
              lineHeight:    1,
              letterSpacing: "-0.02em",
            }}>
              {obj.costValue}
            </div>
          </div>
        </MSDrawerSection>

        {/* ── 5. Presupuesto ── */}
        <MSDrawerSection title="Presupuesto">
          <DrawerKV label="Presupuesto diario" value="Disponible en la plataforma" />
          <DrawerKV label="Presupuesto total"  value="Disponible en la plataforma" />
          <DrawerKV label="Tipo de puja"        value="Disponible en la plataforma" />
        </MSDrawerSection>

        {/* ── 6. Gasto ── */}
        <MSDrawerSection title="Gasto">
          <DrawerKV
            label="Gasto acumulado en el período"
            value={m.spend > 0 ? fmtCurrency(m.spend, currency) : "—"}
            color={m.spend > 0 ? C.ink : undefined}
          />
          {costPerConv > 0 && (
            <DrawerKV
              label="Costo por conversión"
              value={fmtCurrency(costPerConv, currency)}
            />
          )}
          {m.cpc > 0 && (
            <DrawerKV label="Costo por clic" value={fmtCurrency(m.cpc, currency)} />
          )}
          {m.cpm > 0 && (
            <DrawerKV label="CPM" value={fmtCurrency(m.cpm, currency)} />
          )}
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            color:      C.inkGhost,
            marginTop:  S[2],
            lineHeight: 1.4,
          }}>
            Los valores de gasto son indicativos. Para reportes financieros usa el módulo Tesorería.
          </div>
        </MSDrawerSection>

        {/* ── 7. Calendario ── */}
        <MSDrawerSection title="Calendario">
          <DrawerKV label="Período analizado" value={ADS_ANALYTICS_RANGE_LABEL[range]} />
          <DrawerKV label="Desde"             value={fmtDate(dateFrom.toISOString())} />
          <DrawerKV label="Hasta"             value={fmtDate(dateTo.toISOString())} />
          <DrawerKV label="Actualizado"        value={fmtDateTime(item.fetchedAt)} />
          <DrawerKV
            label="Fuente"
            value={item.fromCache ? "Datos recientes (sincronizados)" : "Tiempo real"}
          />
        </MSDrawerSection>

        {/* ── 8. Audiencia ── */}
        <MSDrawerSection title="Audiencia">
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            color:      C.inkFaint,
            padding:    `${S[3]}px`,
            background: C.surface,
            borderRadius: R.lg,
            lineHeight: 1.5,
          }}>
            La segmentación completa — edad, ubicación, intereses y dispositivos — está disponible en {platformName(item.platform)}.
          </div>
        </MSDrawerSection>

        {/* ── 9. Métricas completas ── */}
        <MSDrawerSection title="Detalle de métricas">
          <DrawerMetricGrid metrics={[
            { label: "Gasto",            value: m.spend > 0       ? fmtCurrency(m.spend, currency) : "—",  highlight: true },
            { label: "Impresiones",      value: m.impressions > 0 ? fmtShort(m.impressions) : "—",         highlight: true },
            { label: "Clics",            value: m.clicks > 0      ? fmt(m.clicks) : "—" },
            { label: "CTR",              value: m.ctr > 0         ? fmtCtr(m.ctr) : "—" },
            { label: "Costo por clic",   value: m.cpc > 0         ? fmtCurrency(m.cpc, currency) : "—" },
            { label: "CPM",              value: m.cpm > 0         ? fmtCurrency(m.cpm, currency) : "—" },
            { label: "Conversiones",     value: m.conversions > 0 ? fmt(m.conversions) : "—" },
            { label: "Costo por conv.",  value: costPerConv > 0   ? fmtCurrency(costPerConv, currency) : "—" },
          ]} />
        </MSDrawerSection>

        {/* ── 10. Historial ── */}
        <MSDrawerSection title="Historial">
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            color:      C.inkFaint,
            padding:    `${S[3]}px`,
            background: C.surface,
            borderRadius: R.lg,
            lineHeight: 1.5,
          }}>
            El historial detallado por anuncio estará disponible cuando existan múltiples períodos sincronizados.
            Consulta las tendencias generales en la sección de Historial más abajo.
          </div>
        </MSDrawerSection>

        {/* ── 11. Acciones permitidas ── */}
        {item.issues.length > 0 && (
          <MSDrawerSection title="Alertas activas">
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
              {item.issues.map((issue, i) => (
                <div key={i} style={{
                  fontFamily:   T.mono,
                  fontSize:     T.sz.xs,
                  color:        C.amber,
                  padding:      `${S[2]}px ${S[3]}px`,
                  background:   C.amberLight,
                  border:       `1px solid ${C.amberBorder}`,
                  borderRadius: R.lg,
                  lineHeight:   1.5,
                }}>
                  ⚠ {issue}
                </div>
              ))}
            </div>
            <div style={{
              fontFamily: T.mono,
              fontSize:   T.sz["2xs"],
              color:      C.inkGhost,
              marginTop:  S[2],
              lineHeight: 1.4,
            }}>
              Revisa el estado del anuncio en {platformName(item.platform)} antes de tomar acción.
            </div>
          </MSDrawerSection>
        )}

      </div>

      {/* Footer */}
      <MSDrawerFooter
        actions={[
          {
            label:   "Abrir en Anuncios",
            href:    `/${orgSlug}/agentik/marketing-studio/pauta`,
            primary: true,
          },
          {
            label:    "Pausar anuncio",
            onClick:  onClose,
            disabled: true,
          },
          {
            label:   "Cerrar",
            onClick: onClose,
          },
        ]}
      />
    </MSDrawer>
  );
}

// ── AnalyticsV2Client — Orquestador ──────────────────────────────────────────

export interface AnalyticsV2ClientProps {
  orgSlug:        string;
  initialData:    AdsAnalyticsResult;
  initialHistory: AdsHistorySummary;
}

export function AnalyticsV2Client({
  orgSlug, initialData, initialHistory,
}: AnalyticsV2ClientProps) {
  const [range,        setRange]        = useState<AdsAnalyticsRange>(initialData.range);
  const [data,         setData]         = useState<AdsAnalyticsResult>(initialData);
  const [history]                       = useState<AdsHistorySummary>(initialHistory);
  const [selectedItem, setSelectedItem] = useState<AdsAnalyticsItem | null>(null);
  const [isPending, startTransition]    = useTransition();

  const hasData = data.items.length > 0;

  const handleRangeChange = useCallback(async (newRange: AdsAnalyticsRange) => {
    if (newRange === range || isPending) return;
    setRange(newRange);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/orgs/${orgSlug}/marketing-studio/ads/analytics?range=${newRange}`,
          { method: "GET" },
        );
        if (!res.ok) return;
        const body = await res.json() as { result: AdsAnalyticsResult };
        setData(body.result);
      } catch {
        // Mantiene los datos actuales en caso de error
      }
    });
  }, [range, isPending, orgSlug]);

  return (
    <>
      {/* ── Selector de período ─────────────────────────────────────────────── */}
      <div style={{
        display:    "flex",
        alignItems: "center",
        gap:        S[2],
        marginBottom: S[5],
        flexWrap:   "wrap" as const,
      }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          color:         C.inkFaint,
          textTransform: "uppercase" as const,
          letterSpacing: "0.05em",
        }}>
          Período
        </span>
        {(["today", "week", "month"] as AdsAnalyticsRange[]).map(r => (
          <RangeButton
            key={r}
            range={r}
            active={range === r}
            disabled={isPending}
            onClick={() => handleRangeChange(r)}
          />
        ))}
        {isPending && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            Actualizando…
          </span>
        )}
      </div>

      {/* ── 1. Resumen ejecutivo — 4 tarjetas ──────────────────────────────── */}
      <AdsAnalyticsOverview data={data} hasData={hasData} history={history} />

      {/* ── 2. Comparación por plataforma ──────────────────────────────────── */}
      <AdsAnalyticsComparison data={data} hasData={hasData} history={history} />

      {/* ── 3. Anuncios del período ─────────────────────────────────────────── */}
      <AdsAnalyticsCards data={data} hasData={hasData} onSelectItem={setSelectedItem} />

      {/* ── 4. Anuncios con mejor rendimiento ──────────────────────────────── */}
      <AdsTopPerformersCards data={data} hasData={hasData} onSelectItem={setSelectedItem} />

      {/* ── 5. Hallazgos de Luca — mínimo ──────────────────────────────────── */}
      <AdsAnalyticsInsights insights={data.insights} />

      {/* ── 6. Historial y tendencias ───────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${C.lineSubtle}`, paddingTop: S[6], marginTop: S[2] }}>
        <AdsAnalyticsHistoryClient orgSlug={orgSlug} initialSummary={history} />
      </div>

      {/* ── Drawer de detalle ───────────────────────────────────────────────── */}
      {selectedItem && (
        <AnuncioDrawer
          item={selectedItem}
          orgSlug={orgSlug}
          range={range}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </>
  );
}
