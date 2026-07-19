"use client";
/**
 * components/marketing-studio/ads/ads-analytics-history-client.tsx
 *
 * MARKETING-ANALYTICS-HISTORY-01 — Historial de métricas de anuncios
 *
 * Muestra:
 *   1. Evolución de inversión — serie temporal simple
 *   2. Comparación contra período anterior — 4 cards de delta
 *   3. Tendencias de Luca — insights históricos
 *
 * Principios:
 *   - Nunca activa campañas ni ejecuta acciones automáticas.
 *   - Los datos de gasto son indicativos — no usar para contabilidad.
 *   - Las recomendaciones de Luca son sugerencias — requieren revisión.
 */

import { useState, useTransition, useCallback } from "react";
import { C, T, S, R, E }                        from "@/lib/ui/tokens";
import { MSAgentSignal }                         from "@/components/marketing-studio/shared/ms-agent-signal";
import { MSStatusBadge }                         from "@/components/marketing-studio/shared/ms-status-badge";
import type { MSStatusVariant }                  from "@/components/marketing-studio/shared/ms-status-badge";
import type {
  AdsHistorySummary,
  AdsHistoryRange,
  AdsTrendPoint,
  AdsTrendSeries,
  AdsPeriodComparison,
  AdsMetricDelta,
  AdsHistoryInsight,
  AdsChangeSentiment,
} from "@/lib/marketing-studio/ads/ads-analytics-history-types";
import { ADS_HISTORY_RANGE_LABEL }              from "@/lib/marketing-studio/ads/ads-analytics-history-types";

// ── Format helpers ────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtCurrency(n: number, currency = "USD"): string {
  return new Intl.NumberFormat("es-CO", {
    style:                "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtCtr(ctr: number): string {
  return `${(ctr * 100).toFixed(2)}%`;
}

function fmtDelta(delta: number | null, suffix = "%"): string {
  if (delta === null) return "—";
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}${suffix}`;
}

function sentimentColor(s: AdsChangeSentiment): string {
  if (s === "positive") return C.green;
  if (s === "negative") return C.red ?? C.amber;
  return C.inkFaint;
}

function sentimentBadgeVariant(s: AdsChangeSentiment): MSStatusVariant {
  if (s === "positive") return "ok";
  if (s === "negative") return "error";
  if (s === "neutral")  return "neutral";
  return "archived";
}

// ── Range selector ────────────────────────────────────────────────────────────

function RangeButton({
  range, active, onClick, disabled,
}: {
  range: AdsHistoryRange; active: boolean; onClick: () => void; disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily:  T.mono,
        fontSize:    T.sz.xs,
        fontWeight:  active ? T.wt.bold   : T.wt.normal,
        color:       active ? C.white      : C.inkMid,
        background:  active ? C.blueDark   : "transparent",
        border:      `1px solid ${active ? C.blueDark : C.line}`,
        borderRadius: R.md,
        padding:     `${S[1]}px ${S[3]}px`,
        cursor:      disabled ? "default" : "pointer",
        opacity:     disabled ? 0.6 : 1,
        whiteSpace:  "nowrap",
      }}
    >
      {ADS_HISTORY_RANGE_LABEL[range]}
    </button>
  );
}

// ── Timeline bar chart (simple CSS bars, no external lib) ────────────────────

function TimelineBars({ points }: { points: AdsTrendPoint[] }) {
  if (points.length === 0) return null;

  const maxSpend = Math.max(...points.map(p => p.spend), 1);
  const maxClicks = Math.max(...points.map(p => p.clicks), 1);

  return (
    <div style={{ overflow: "hidden" }}>
      {/* Labels */}
      <div style={{ display: "flex", gap: S[4], marginBottom: S[2] }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
          <span style={{ width: 10, height: 10, background: C.blueDark, borderRadius: 2, display: "inline-block" }} />
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Inversión</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
          <span style={{ width: 10, height: 10, background: C.green, borderRadius: 2, display: "inline-block" }} />
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Clics</span>
        </div>
      </div>

      {/* Bar pairs */}
      <div style={{
        display:        "flex",
        alignItems:     "flex-end",
        gap:            S[2],
        height:         100,
        paddingBottom:  S[4],
        overflowX:      "auto",
      }}>
        {points.map(p => {
          const spendPct  = (p.spend  / maxSpend)  * 100;
          const clicksPct = (p.clicks / maxClicks) * 100;
          const dateLabel = p.date.slice(5); // MM-DD
          return (
            <div
              key={p.date}
              title={`${p.date} · Inversión: ${fmtCurrency(p.spend)} · Clics: ${fmt(p.clicks)}`}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 28 }}
            >
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 72 }}>
                {/* Spend bar */}
                <div style={{
                  width:        12,
                  height:       `${Math.max(spendPct, 2)}%`,
                  background:   C.blueDark,
                  borderRadius: `2px 2px 0 0`,
                  opacity:      0.85,
                }} />
                {/* Clicks bar */}
                <div style={{
                  width:        12,
                  height:       `${Math.max(clicksPct, 2)}%`,
                  background:   C.green,
                  borderRadius: `2px 2px 0 0`,
                  opacity:      0.75,
                }} />
              </div>
              <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkGhost, whiteSpace: "nowrap" }}>
                {dateLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Delta card ────────────────────────────────────────────────────────────────

const DELTA_METRIC_LABEL: Record<string, string> = {
  spend:         "Inversión",
  clicks:        "Clics",
  ctr:           "CTR",
  cpc:           "CPC",
  conversions:   "Conversiones",
  results:       "Resultados",
  costPerResult: "Costo por resultado",
  impressions:   "Impresiones",
};

function DeltaCard({ delta }: { delta: AdsMetricDelta }) {
  const label   = DELTA_METRIC_LABEL[delta.metric as string] ?? String(delta.metric);
  const color   = sentimentColor(delta.sentiment);
  const variant = sentimentBadgeVariant(delta.sentiment);

  const currentDisplay =
    delta.metric === "spend" || delta.metric === "cpc" || delta.metric === "costPerResult"
      ? fmtCurrency(delta.current)
      : delta.metric === "ctr"
      ? fmtCtr(delta.current)
      : fmt(delta.current);

  const arrow =
    delta.deltaPercent === null ? "" :
    delta.deltaPercent > 0 ? "↑" :
    delta.deltaPercent < 0 ? "↓" : "→";

  return (
    <div style={{
      background:    C.white,
      border:        `1px solid ${C.line}`,
      borderRadius:  R.xl,
      padding:       `${S[4]}px`,
      boxShadow:     E.xs,
      display:       "flex",
      flexDirection: "column",
      gap:           S[2],
      minWidth:      0,
    }}>
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz.xs,
        color:         C.inkFaint,
        textTransform: "uppercase" as const,
        letterSpacing: "0.05em",
        fontWeight:    T.wt.medium,
      }}>
        {label}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.bold, color: C.ink, lineHeight: 1 }}>
        {currentDisplay}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color, fontWeight: T.wt.semibold }}>
          {arrow} {fmtDelta(delta.deltaPercent)}
        </span>
        {delta.sentiment !== "insufficient_data" && (
          <MSStatusBadge
            label={
              delta.sentiment === "positive" ? "Mejora" :
              delta.sentiment === "negative" ? "Empeora" : "Estable"
            }
            variant={variant}
          />
        )}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
        Anterior: {
          delta.previous === 0 && delta.deltaPercent === null
            ? "Sin datos"
            : delta.metric === "spend" || delta.metric === "cpc" || delta.metric === "costPerResult"
            ? fmtCurrency(delta.previous)
            : delta.metric === "ctr"
            ? fmtCtr(delta.previous)
            : fmt(delta.previous)
        }
      </div>
    </div>
  );
}

// ── History insight card ──────────────────────────────────────────────────────

function HistoryInsightCard({ insight }: { insight: AdsHistoryInsight }) {
  const accentColor =
    insight.severity === "warning"     ? C.amber    :
    insight.severity === "opportunity" ? C.green     : C.blueDark;
  const accentBg =
    insight.severity === "warning"     ? C.amberLight  :
    insight.severity === "opportunity" ? C.greenLight   : "#e8f0fb";
  const icon =
    insight.severity === "warning"     ? "⚠" :
    insight.severity === "opportunity" ? "↗" : "ℹ";

  return (
    <div style={{
      background:   C.white,
      border:       `1px solid ${C.line}`,
      borderRadius: R.xl,
      padding:      `${S[4]}px`,
      boxShadow:    E.xs,
      display:      "flex",
      gap:          S[3],
      alignItems:   "flex-start",
    }}>
      <div style={{
        width:          28, height: 28,
        borderRadius:   R.md,
        background:     accentBg,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontSize:       12,
        color:          accentColor,
        fontWeight:     T.wt.bold,
        flexShrink:     0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[1] }}>
          {insight.title}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, lineHeight: 1.5 }}>
          {insight.description}
        </div>
        {insight.action && (
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: accentColor, fontWeight: T.wt.medium, marginTop: S[2] }}>
            → {insight.action}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Empty history state ────────────────────────────────────────────────────────

function EmptyHistoryState() {
  return (
    <div style={{
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      padding:        `${S[8]}px ${S[6]}px`,
      background:     C.surface,
      border:         `1px dashed ${C.line}`,
      borderRadius:   R.xl,
      textAlign:      "center",
      gap:            S[2],
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.inkMid }}>
        Sin historial acumulado aún
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, maxWidth: 360, lineHeight: 1.5 }}>
        El historial se construye automáticamente cada vez que se consultan métricas reales.
        Vuelve a esta sección luego de publicar y sincronizar anuncios.
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface AdsAnalyticsHistoryClientProps {
  orgSlug:        string;
  initialSummary: AdsHistorySummary;
}

export function AdsAnalyticsHistoryClient({
  orgSlug,
  initialSummary,
}: AdsAnalyticsHistoryClientProps) {
  const [range,    setRange]   = useState<AdsHistoryRange>(initialSummary.range);
  const [summary,  setSummary] = useState<AdsHistorySummary>(initialSummary);
  const [isPending, startTransition] = useTransition();

  const handleRangeChange = useCallback(async (newRange: AdsHistoryRange) => {
    if (newRange === range || isPending) return;
    setRange(newRange);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/orgs/${orgSlug}/marketing-studio/ads/analytics/history?range=${newRange}`,
          { method: "GET" },
        );
        if (!res.ok) return;
        const body = await res.json() as { historySummary: AdsHistorySummary };
        setSummary(body.historySummary);
      } catch {
        // keep current data on error
      }
    });
  }, [range, isPending, orgSlug]);

  const hasHistory   = summary.snapshotCount > 0;
  const allSeries    = summary.trendSeries ?? [];
  const mainSeries   = allSeries.find(s => s.platform === "all") ?? allSeries[0] ?? null;
  const comparison   = summary.periodComparison;

  // Only show the 4 most relevant deltas in the comparison strip
  const KEY_DELTAS = ["spend", "clicks", "ctr", "costPerResult"] as const;
  const keyDeltas  = comparison?.deltas.filter(d => (KEY_DELTAS as readonly string[]).includes(d.metric as string)) ?? [];

  return (
    <div>
      {/* ── Section header ──────────────────────────────────────────────── */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   S[4],
        flexWrap:       "wrap" as const,
        gap:            S[2],
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>
          Historial y tendencias
        </div>
        <div style={{ display: "flex", gap: S[2], alignItems: "center" }}>
          {(["today", "week", "month", "quarter"] as AdsHistoryRange[]).map(r => (
            <RangeButton
              key={r}
              range={r}
              active={range === r}
              disabled={isPending}
              onClick={() => handleRangeChange(r)}
            />
          ))}
          {isPending && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>…</span>
          )}
        </div>
      </div>

      {hasHistory ? (
        <>
          {/* ── 1. Evolución de inversión ──────────────────────────────── */}
          {mainSeries && mainSeries.points.length > 0 && (
            <div style={{
              background:   C.white,
              border:       `1px solid ${C.line}`,
              borderRadius: R.xl,
              padding:      `${S[5]}px`,
              marginBottom: S[5],
              boxShadow:    E.xs,
            }}>
              <div style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.base,
                fontWeight:   T.wt.semibold,
                color:        C.ink,
                marginBottom: S[3],
              }}>
                Evolución de inversión
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[3] }}>
                {mainSeries.points.length} puntos · {ADS_HISTORY_RANGE_LABEL[range]} · Datos indicativos — no usar para contabilidad
              </div>
              <TimelineBars points={mainSeries.points} />

              {/* Latest vs Earliest summary */}
              {mainSeries.latest && mainSeries.earliest && mainSeries.points.length > 1 && (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: S[3],
                  marginTop: S[4],
                  paddingTop: S[4],
                  borderTop: `1px solid ${C.lineSubtle}`,
                }}>
                  {[
                    { label: "Inversión total",    value: fmtCurrency(mainSeries.points.reduce((s, p) => s + p.spend, 0)) },
                    { label: "Clics acumulados",   value: fmt(mainSeries.points.reduce((s, p) => s + p.clicks, 0)) },
                    { label: "Conversiones total", value: fmt(mainSeries.points.reduce((s, p) => s + p.conversions, 0)) },
                  ].map(row => (
                    <div key={row.label}>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
                        {row.label}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink, marginTop: S[1] }}>
                        {row.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── 2. Comparación contra período anterior ─────────────────── */}
          {comparison && keyDeltas.length > 0 && (
            <div style={{ marginBottom: S[5] }}>
              <div style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.base,
                fontWeight:   T.wt.semibold,
                color:        C.ink,
                marginBottom: S[1],
              }}>
                Comparación vs período anterior
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[3] }}>
                {comparison.hasEnoughData
                  ? `${comparison.current.period} vs ${comparison.previous?.period ?? "período anterior"}`
                  : "Sin suficientes datos para comparar"}
              </div>
              {comparison.hasEnoughData ? (
                <div style={{
                  display:             "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap:                 S[3],
                }}>
                  {keyDeltas.map(delta => (
                    <DeltaCard key={String(delta.metric)} delta={delta} />
                  ))}
                </div>
              ) : (
                <div style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  color:      C.inkFaint,
                  padding:    `${S[4]}px`,
                  background: C.surface,
                  borderRadius: R.lg,
                  border:     `1px solid ${C.line}`,
                }}>
                  Se necesitan mediciones en al menos dos períodos para comparar. Agentik seguirá acumulando datos.
                </div>
              )}
            </div>
          )}

          {/* ── 3. Tendencias de Luca ──────────────────────────────────── */}
          {summary.insights.length > 0 && (
            <div>
              <div style={{ marginBottom: S[3] }}>
                <MSAgentSignal
                  text="Tendencias detectadas por Luca en el historial"
                  sub="Basado en métricas acumuladas · Sugerencias orientativas"
                  agentLabel="Luca · IA"
                  variant="dark"
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
                {summary.insights.map(insight => (
                  <HistoryInsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <EmptyHistoryState />
      )}

      {/* ── Snapshot count footer ──────────────────────────────────────── */}
      {summary.snapshotCount > 0 && (
        <div style={{
          marginTop:   S[5],
          fontFamily:  T.mono,
          fontSize:    T.sz.xs,
          color:       C.inkGhost,
          display:     "flex",
          gap:         S[2],
          alignItems:  "center",
        }}>
          <span>{summary.snapshotCount} snapshot{summary.snapshotCount > 1 ? "s" : ""}</span>
          <span>·</span>
          <span>{summary.dateRange.from ?? "—"} → {summary.dateRange.to ?? "—"}</span>
          <span>·</span>
          <span>Actualizado: {new Date(summary.generatedAt).toLocaleTimeString("es-CO")}</span>
        </div>
      )}
    </div>
  );
}
