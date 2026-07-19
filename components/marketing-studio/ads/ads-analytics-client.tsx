"use client";
/**
 * components/marketing-studio/ads/ads-analytics-client.tsx
 *
 * MARKETING-ANALYTICS-LIVE-01 — Componente interactivo de Analítica de Anuncios
 *
 * Responsabilidad:
 *   - Range selector (hoy / 7 días / 30 días).
 *   - MSMetricStrip con totales reales consolidados.
 *   - Tarjetas de insights determinísticos de Luca.
 *   - Tabla de ejecuciones con métricas reales.
 *   - MSDrawer de detalle por ejecución con acciones sugeridas (nunca automáticas).
 *
 * Principios:
 *   - Nunca activa campañas, nunca ejecuta acciones automáticas.
 *   - Los insights son sugerencias — solo Luca propone, el usuario decide.
 *   - Los datos de gasto son indicativos — no usar para contabilidad.
 */

import { useState, useTransition, useCallback } from "react";
import { C, T, S, R, E }            from "@/lib/ui/tokens";
import { MS_PALETTE }               from "@/lib/marketing-studio/ms-design-system";
import { MSMetricStrip }            from "@/components/marketing-studio/shared/ms-metric-strip";
import { MSStatusBadge }            from "@/components/marketing-studio/shared/ms-status-badge";
import { MSDrawer }                 from "@/components/marketing-studio/shared/ms-drawer";
import { MSDrawerHeader }           from "@/components/marketing-studio/shared/ms-drawer-header";
import { MSDrawerSection }          from "@/components/marketing-studio/shared/ms-drawer-section";
import { MSDrawerFooter }           from "@/components/marketing-studio/shared/ms-drawer-footer";
import { MSAgentSignal }            from "@/components/marketing-studio/shared/ms-agent-signal";
import type { MSStatusVariant }     from "@/components/marketing-studio/shared/ms-status-badge";
import type {
  AdsAnalyticsResult,
  AdsAnalyticsRange,
  AdsAnalyticsItem,
  AdsAnalyticsInsight,
  AdsAnalyticsInsightSeverity,
} from "@/lib/marketing-studio/ads/ads-analytics-types";
import { ADS_ANALYTICS_RANGE_LABEL } from "@/lib/marketing-studio/ads/ads-analytics-types";

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

function fmtCpc(cpc: number, currency = "USD"): string {
  return fmtCurrency(cpc, currency);
}

function insightVariant(severity: AdsAnalyticsInsightSeverity): MSStatusVariant {
  if (severity === "warning")     return "warning";
  if (severity === "opportunity") return "ok";
  return "info";
}

function insightAccent(severity: AdsAnalyticsInsightSeverity): { color: string; bg: string } {
  if (severity === "warning")     return { color: C.amber,    bg: C.amberLight };
  if (severity === "opportunity") return { color: C.green,    bg: C.greenLight };
  return                                 { color: C.blueDark, bg: "#e8f0fb" };
}

function platformBadgeVariant(platform: string): MSStatusVariant {
  if (platform === "meta")   return "info";
  if (platform === "tiktok") return "neutral";
  return "archived";
}

function platformLabel(platform: string): string {
  if (platform === "meta")   return "Meta";
  if (platform === "tiktok") return "TikTok";
  return "Mixto";
}

// ── Platform SVG logos ─────────────────────────────────────────────────────────

function MetaLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z"
        fill="#1877F2"
      />
      <path
        d="M13.25 8.25h1.5V6h-1.5C11.179 6 9.5 7.679 9.5 9.75v1.25H8v2.25h1.5V18h2.25v-4.75H13.5l.375-2.25H11.75V9.75c0-.828.672-1.5 1.5-1.5z"
        fill="#fff"
      />
    </svg>
  );
}

function TikTokLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="5" fill="#111111" />
      <path
        d="M16.5 5.5a3.5 3.5 0 01-3.5-3.5h-2.5v12a2 2 0 11-2-2v-2.5A4.5 4.5 0 1013 14V9.25a6 6 0 003.5 1.12V7.84A3.51 3.51 0 0116.5 5.5z"
        fill="white"
      />
    </svg>
  );
}

// ── Platform comparison card ───────────────────────────────────────────────────

function PlatformCard({
  platform, metric, total,
}: {
  platform: string;
  metric:   import("@/lib/marketing-studio/ads/ads-analytics-types").AdsAnalyticsMetric;
  total:    import("@/lib/marketing-studio/ads/ads-analytics-types").AdsAnalyticsMetric;
}) {
  const isMeta   = platform === "meta";
  const pctSpend = total.spend > 0 ? Math.round((metric.spend / total.spend) * 100) : 0;
  const pctImpr  = total.impressions > 0 ? Math.round((metric.impressions / total.impressions) * 100) : 0;

  return (
    <div style={{
      background:   C.white,
      border:       `1px solid ${C.line}`,
      borderRadius: R.xl,
      padding:      `${S[4]}px ${S[5]}px`,
      boxShadow:    E.xs,
      flex:         1,
      minWidth:     0,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[4] }}>
        {isMeta ? <MetaLogo size={24} /> : <TikTokLogo size={24} />}
        <span style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.semibold, color: C.ink }}>
          {isMeta ? "Meta Ads" : "TikTok Ads"}
        </span>
        <div style={{ marginLeft: "auto" }}>
          <MSStatusBadge
            label={`${pctSpend}% gasto`}
            variant="neutral"
          />
        </div>
      </div>

      {/* Metrics grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
        {[
          { label: "Impresiones",  value: fmt(metric.impressions),           sub: `${pctImpr}% del total` },
          { label: "Clics",        value: fmt(metric.clicks),                sub: `CTR ${fmtCtr(metric.ctr)}` },
          { label: "CPC",          value: metric.cpc > 0 ? fmtCpc(metric.cpc, metric.currency) : "—", sub: "por clic" },
          { label: "Gasto",        value: metric.spend > 0 ? fmtCurrency(metric.spend, metric.currency) : "—", sub: "indicativo" },
        ].map(row => (
          <div key={row.label} style={{
            background:   C.surface,
            borderRadius: R.lg,
            padding:      `${S[2]}px ${S[3]}px`,
          }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
              {row.label}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink, marginTop: 2 }}>
              {row.value}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 1 }}>
              {row.sub}
            </div>
          </div>
        ))}
      </div>
    </div>
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
        transition:  "background 120ms, color 120ms",
        whiteSpace:  "nowrap",
      }}
    >
      {ADS_ANALYTICS_RANGE_LABEL[range]}
    </button>
  );
}

// ── Insight card ──────────────────────────────────────────────────────────────

function InsightCard({ insight }: { insight: AdsAnalyticsInsight }) {
  const { color, bg } = insightAccent(insight.severity);
  const icon =
    insight.severity === "warning"     ? "⚠" :
    insight.severity === "opportunity" ? "↗" : "ℹ";

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
      <div style={{ display: "flex", alignItems: "flex-start", gap: S[2] }}>
        <div style={{
          width:          28,
          height:         28,
          borderRadius:   R.md,
          background:     bg,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          fontSize:       12,
          color,
          fontWeight:     T.wt.bold,
          flexShrink:     0,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz.sm,
            fontWeight: T.wt.semibold,
            color:      C.ink,
            lineHeight: 1.3,
          }}>
            {insight.title}
          </div>
          {insight.platform && (
            <div style={{ marginTop: S[1] }}>
              <MSStatusBadge
                label={platformLabel(insight.platform)}
                variant={insightVariant(insight.severity)}
              />
            </div>
          )}
        </div>
      </div>
      <div style={{
        fontFamily: T.mono,
        fontSize:   T.sz.xs,
        color:      C.inkFaint,
        lineHeight: 1.5,
      }}>
        {insight.description}
      </div>
      {insight.action && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color, fontWeight: T.wt.medium }}>
          → {insight.action}
        </div>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyAdsState({ orgSlug }: { orgSlug: string }) {
  return (
    <div style={{
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      padding:        `${S[10]}px ${S[6]}px`,
      background:     C.white,
      border:         `1px solid ${C.line}`,
      borderRadius:   R.xl,
      boxShadow:      E.xs,
      textAlign:      "center",
      gap:            S[3],
    }}>
      <div style={{
        width:          48,
        height:         48,
        borderRadius:   R.xl,
        background:     "#e8f0fb",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontSize:       22,
        color:          C.blueDark,
      }}>
        ◻
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.semibold, color: C.ink }}>
        Sin anuncios publicados en este período
      </div>
      <div style={{
        fontFamily: T.mono,
        fontSize:   T.sz.xs,
        color:      C.inkFaint,
        maxWidth:   360,
        lineHeight: 1.5,
      }}>
        Las métricas aparecen aquí una vez que publiques anuncios desde el módulo de Pauta
        y conectes tus cuentas de Meta o TikTok.
      </div>
      <a
        href={`/${orgSlug}/agentik/marketing-studio/pauta`}
        style={{
          display:        "inline-flex",
          alignItems:     "center",
          gap:            S[2],
          padding:        `${S[2]}px ${S[4]}px`,
          background:     C.blueDark,
          color:          "#fff",
          borderRadius:   R.lg,
          fontFamily:     T.mono,
          fontSize:       T.sz.sm,
          fontWeight:     T.wt.medium,
          textDecoration: "none",
        }}
      >
        Ir a Pauta
      </a>
    </div>
  );
}

// ── Execution table ───────────────────────────────────────────────────────────

const TABLE_TEMPLATE = "minmax(0, 2fr) 80px 96px 76px 76px 76px 80px";

function TableHead() {
  const cols = ["Anuncio / Campaña", "Plataforma", "Impresiones", "Clics", "CTR", "CPC", "Gasto"];
  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: TABLE_TEMPLATE,
      gap:                 `0 ${S[3]}px`,
      padding:             `${S[2]}px ${S[5]}px`,
      borderBottom:        `1px solid ${C.line}`,
      background:          C.surface,
    }}>
      {cols.map(col => (
        <span key={col} style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          color:         C.inkFaint,
          textTransform: "uppercase" as const,
          letterSpacing: "0.05em",
          fontWeight:    T.wt.medium,
          whiteSpace:    "nowrap" as const,
          overflow:      "hidden",
          textOverflow:  "ellipsis",
        }}>
          {col}
        </span>
      ))}
    </div>
  );
}

function TableRow({
  item, isLast, onClick,
}: {
  item:    AdsAnalyticsItem;
  isLast:  boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const m = item.metric;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => e.key === "Enter" && onClick()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="ag-op-row"
      style={{
        display:             "grid",
        gridTemplateColumns: TABLE_TEMPLATE,
        gap:                 `0 ${S[3]}px`,
        alignItems:          "center",
        padding:             `${S[3]}px ${S[5]}px`,
        borderBottom:        isLast ? "none" : `1px solid ${C.lineSubtle}`,
        cursor:              "pointer",
        background:          hovered ? C.surfaceAlt : "transparent",
        transition:          "background 100ms",
        minWidth:            0,
      }}
    >
      {/* Anuncio / Campaign */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.sm,
          color:        C.ink,
          fontWeight:   T.wt.medium,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
        }}>
          {item.campaignName ?? item.campaignId ?? `Anuncio ···${item.executionId.slice(-6)}`}
        </div>
        {item.issues.length > 0 && (
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber, marginTop: 2 }}>
            Datos parciales
          </div>
        )}
      </div>

      {/* Platform */}
      <div>
        <MSStatusBadge
          label={platformLabel(item.platform)}
          variant={platformBadgeVariant(item.platform)}
        />
      </div>

      {/* Impressions */}
      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>
        {fmt(m.impressions)}
      </span>

      {/* Clicks */}
      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>
        {fmt(m.clicks)}
      </span>

      {/* CTR */}
      <span style={{
        fontFamily: T.mono,
        fontSize:   T.sz.sm,
        color:      m.ctr > 0.01 ? C.green : m.ctr > 0.005 ? C.inkMid : C.amber,
        fontWeight: T.wt.medium,
      }}>
        {fmtCtr(m.ctr)}
      </span>

      {/* CPC */}
      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>
        {m.cpc > 0 ? fmtCpc(m.cpc, m.currency) : "—"}
      </span>

      {/* Spend */}
      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: T.wt.semibold }}>
        {m.spend > 0 ? fmtCurrency(m.spend, m.currency) : "—"}
      </span>
    </div>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────

function ItemDrawer({
  item,
  orgSlug,
  onClose,
}: {
  item:    AdsAnalyticsItem;
  orgSlug: string;
  onClose: () => void;
}) {
  const m = item.metric;

  return (
    <MSDrawer onClose={onClose} width={400}>
      <MSDrawerHeader
        domainColor={MS_PALETTE.product.primary}
        name={item.campaignName ?? item.campaignId ?? `Anuncio ···${item.executionId.slice(-6)}`}
        sku={item.platform.toUpperCase()}
        category={`${platformLabel(item.platform)} · Anuncio`}
        statusVariant={item.issues.length > 0 ? "warning" : "ok"}
        statusLabel={item.issues.length > 0 ? "Datos parciales" : "Métricas disponibles"}
        readinessScore={item.metric.impressions > 0 ? 100 : 0}
        onClose={onClose}
      />

      {/* Metrics */}
      <MSDrawerSection title="Métricas del período">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
          {[
            { label: "Impresiones",  value: fmt(m.impressions) },
            { label: "Clics",        value: fmt(m.clicks) },
            { label: "CTR",          value: fmtCtr(m.ctr) },
            { label: "CPC",          value: m.cpc > 0 ? fmtCpc(m.cpc, m.currency) : "—" },
            { label: "CPM",          value: m.cpm > 0 ? fmtCpc(m.cpm, m.currency) : "—" },
            { label: "Conversiones", value: fmt(m.conversions) },
            { label: "Gasto total",  value: m.spend > 0 ? fmtCurrency(m.spend, m.currency) : "—" },
          ].map(row => (
            <div key={row.label} style={{
              background:   C.surface,
              borderRadius: R.lg,
              padding:      `${S[3]}px`,
            }}>
              <div style={{
                fontFamily:    T.mono,
                fontSize:      T.sz["2xs"],
                color:         C.inkFaint,
                textTransform: "uppercase" as const,
                letterSpacing: "0.05em",
              }}>
                {row.label}
              </div>
              <div style={{
                fontFamily:  T.mono,
                fontSize:    T.sz.lg,
                fontWeight:  T.wt.bold,
                color:       C.ink,
                marginTop:   S[1],
              }}>
                {row.value}
              </div>
            </div>
          ))}
        </div>
      </MSDrawerSection>

      {/* Cache info */}
      <MSDrawerSection title="Fuente de datos">
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, lineHeight: 1.5 }}>
          {item.fromCache ? "Datos desde caché (< 15 min)" : "Datos en tiempo real"}
          {" · "}
          {new Date(item.fetchedAt).toLocaleTimeString("es-CO")}
        </div>
        {item.issues.map((issue, i) => (
          <div key={i} style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.xs,
            color:        C.amber,
            marginTop:    S[1],
            lineHeight:   1.5,
          }}>
            ⚠ {issue}
          </div>
        ))}
      </MSDrawerSection>

      {/* Luca findings — data-driven only */}
      <MSDrawerSection title="Análisis de Luca">
        <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
          {m.impressions === 0 ? (
            <div style={{
              padding:      `${S[3]}px`,
              background:   C.amberLight,
              border:       `1px solid ${C.amberBorder ?? C.amber + "44"}`,
              borderRadius: R.lg,
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              color:        C.amber,
              lineHeight:   1.5,
            }}>
              ⚠ Sin impresiones en el período. Verifica el estado del anuncio directamente en la plataforma.
            </div>
          ) : m.ctr < 0.003 ? (
            <div style={{
              padding:      `${S[3]}px`,
              background:   C.amberLight,
              border:       `1px solid ${C.amberBorder ?? C.amber + "44"}`,
              borderRadius: R.lg,
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              color:        C.amber,
              lineHeight:   1.5,
            }}>
              ⚠ CTR muy bajo ({fmtCtr(m.ctr)}). El creativo o la segmentación puede no estar resonando con la audiencia. Considera revisar la propuesta de valor del anuncio.
            </div>
          ) : m.spend > 0 && m.conversions === 0 && m.clicks > 50 ? (
            <div style={{
              padding:      `${S[3]}px`,
              background:   C.amberLight,
              border:       `1px solid ${C.amberBorder ?? C.amber + "44"}`,
              borderRadius: R.lg,
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              color:        C.amber,
              lineHeight:   1.5,
            }}>
              ⚠ {fmt(m.clicks)} clics sin conversiones registradas. Verifica el píxel de conversión y el landing page de destino.
            </div>
          ) : (
            <div style={{
              padding:      `${S[3]}px`,
              background:   C.greenLight,
              border:       `1px solid ${C.greenBorder}`,
              borderRadius: R.lg,
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              color:        C.green,
              lineHeight:   1.5,
            }}>
              ✓ Anuncio con CTR de {fmtCtr(m.ctr)} — dentro del rango normal para el período seleccionado.
            </div>
          )}
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, lineHeight: 1.4 }}>
            Las observaciones de Luca son orientativas. Solo el equipo puede decidir si actuar sobre ellas.
          </div>
        </div>
      </MSDrawerSection>

      <MSDrawerFooter
        actions={[
          {
            label:   "Ir a Pauta",
            href:    `/${orgSlug}/agentik/marketing-studio/pauta`,
            primary: true,
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

// ── Main component ────────────────────────────────────────────────────────────

export interface AdsAnalyticsClientProps {
  orgSlug:     string;
  initialData: AdsAnalyticsResult;
}

export function AdsAnalyticsClient({ orgSlug, initialData }: AdsAnalyticsClientProps) {
  const [range,        setRange]        = useState<AdsAnalyticsRange>(initialData.range);
  const [data,         setData]         = useState<AdsAnalyticsResult>(initialData);
  const [selectedItem, setSelectedItem] = useState<AdsAnalyticsItem | null>(null);
  const [isPending, startTransition]    = useTransition();

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
        // keep current data on error
      }
    });
  }, [range, isPending, orgSlug]);

  const s = data.summary;
  const t = s.totals;
  const hasData = data.items.length > 0;

  // MSMetricStrip cards — dot must be a hex color string
  const metricCards = [
    {
      value:   fmt(t.impressions),
      label:   "Impresiones",
      sub:     data.partial ? "Datos parciales" : "Todas las plataformas",
      dot:     C.blueDark,
      variant: "neutral" as const,
    },
    {
      value:   fmt(t.clicks),
      label:   "Clics totales",
      sub:     t.impressions > 0 ? `CTR ${fmtCtr(t.ctr)}` : "—",
      dot:     t.ctr > 0.01 ? C.green : t.ctr > 0.005 ? C.inkFaint : C.amber,
      variant: (t.ctr > 0.01 ? "ok" : t.ctr > 0.005 ? "neutral" : "warning") as "ok" | "neutral" | "warning",
    },
    {
      value:   t.cpc > 0 ? fmtCpc(t.cpc, t.currency) : "—",
      label:   "CPC promedio",
      sub:     t.clicks > 0 ? `${fmt(t.clicks)} clics` : "Sin clics",
      dot:     C.inkFaint,
      variant: "neutral" as const,
    },
    {
      value:   t.spend > 0 ? fmtCurrency(t.spend, t.currency) : "—",
      label:   "Gasto total",
      sub:     t.conversions > 0 ? `${fmt(t.conversions)} conv.` : "Indicativo · no contable",
      dot:     C.inkLight,
      variant: "neutral" as const,
    },
  ];

  return (
    <>
      {/* ── Range selector + status ──────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[4] }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          color:         C.inkFaint,
          textTransform: "uppercase" as const,
          letterSpacing: "0.05em",
          flexShrink:    0,
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
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginLeft: S[2] }}>
            Actualizando…
          </span>
        )}
        <div style={{ marginLeft: "auto" }}>
          {data.partial && <MSStatusBadge label="Datos parciales" variant="warning" />}
        </div>
      </div>

      {/* ── Luca agent signal ────────────────────────────────────────────── */}
      {hasData && data.insights.length > 0 && (
        <div style={{ marginBottom: S[4] }}>
          <MSAgentSignal
            text={`${data.insights.length} insight${data.insights.length > 1 ? "s" : ""} de Luca para el período`}
            sub="Sugerencias orientativas — requieren revisión antes de actuar"
            agentLabel="Luca · IA"
            variant="dark"
          />
        </div>
      )}

      {hasData ? (
        <>
          {/* ── Metrics strip ─────────────────────────────────────────────── */}
          <MSMetricStrip cards={metricCards} />

          {/* ── Platform comparison ───────────────────────────────────────── */}
          {(s.byPlatform.meta || s.byPlatform.tiktok) && (
            <div style={{ display: "flex", gap: S[4], marginBottom: S[5], flexWrap: "wrap" as const }}>
              {s.byPlatform.meta   && <PlatformCard platform="meta"   metric={s.byPlatform.meta}   total={t} />}
              {s.byPlatform.tiktok && <PlatformCard platform="tiktok" metric={s.byPlatform.tiktok} total={t} />}
            </div>
          )}

          {/* ── Insight cards ─────────────────────────────────────────────── */}
          {data.insights.length > 0 && (
            <div style={{
              display:             "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap:                 S[3],
              marginBottom:        S[5],
            }}>
              {data.insights.slice(0, 3).map(insight => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          )}

          {/* ── Status badges strip ───────────────────────────────────────── */}
          {(s.activeCount > 0 || s.inReviewCount > 0 || s.pausedCount > 0) && (
            <div style={{ display: "flex", gap: S[3], marginBottom: S[5], flexWrap: "wrap" as const }}>
              {s.activeCount > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", gap: S[2],
                  padding: `${S[1]}px ${S[3]}px`,
                  background: C.greenLight, border: `1px solid ${C.greenBorder}`, borderRadius: R.pill,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, display: "inline-block" }} />
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green, fontWeight: T.wt.medium }}>
                    {s.activeCount} activa{s.activeCount > 1 ? "s" : ""}
                  </span>
                </div>
              )}
              {s.inReviewCount > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", gap: S[2],
                  padding: `${S[1]}px ${S[3]}px`,
                  background: "#e8f0fb", border: `1px solid ${C.blueDark}33`, borderRadius: R.pill,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.blueDark, display: "inline-block" }} />
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark, fontWeight: T.wt.medium }}>
                    {s.inReviewCount} en revisión
                  </span>
                </div>
              )}
              {s.pausedCount > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", gap: S[2],
                  padding: `${S[1]}px ${S[3]}px`,
                  background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: R.pill,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.inkFaint, display: "inline-block" }} />
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, fontWeight: T.wt.medium }}>
                    {s.pausedCount} pausada{s.pausedCount > 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Execution table ───────────────────────────────────────────── */}
          <div style={{
            background:   C.white,
            border:       `1px solid ${C.line}`,
            borderRadius: R.xl,
            overflow:     "hidden",
            boxShadow:    E.xs,
          }}>
            <div style={{
              padding:        `${S[4]}px ${S[5]}px`,
              borderBottom:   `1px solid ${C.line}`,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.semibold, color: C.ink }}>
                  Centro de anuncios
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
                  {data.items.length} anuncio{data.items.length !== 1 ? "s" : ""} · clic para ver detalle
                </div>
              </div>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                {ADS_ANALYTICS_RANGE_LABEL[range]}
              </span>
            </div>

            <TableHead />

            <div className="ag-op-table">
              {data.items.map((item, idx) => (
                <TableRow
                  key={item.executionId}
                  item={item}
                  isLast={idx === data.items.length - 1}
                  onClick={() => setSelectedItem(item)}
                />
              ))}
            </div>
          </div>
        </>
      ) : (
        <EmptyAdsState orgSlug={orgSlug} />
      )}

      {/* ── Detail drawer ─────────────────────────────────────────────────── */}
      {selectedItem && (
        <ItemDrawer
          item={selectedItem}
          orgSlug={orgSlug}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </>
  );
}
