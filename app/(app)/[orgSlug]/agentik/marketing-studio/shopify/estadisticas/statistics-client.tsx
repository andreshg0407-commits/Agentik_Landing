"use client";

/**
 * statistics-client.tsx
 *
 * SHOPIFY-STATISTICS-UI-01 + SHOPIFY-STATISTICS-UX-02
 * Shopify Commercial Intelligence Console — Client Component
 *
 * Architecture:
 *   - Unified structure regardless of connection/data state
 *   - Placeholders replace metrics when overview is null — never blank screens
 *   - All actions route through Copilot → Intent Resolver → Policy → Runtime
 *   - Zero business logic: computation done server-side
 *   - OperationalSideDrawer used for all detail panels (4 sections each)
 *   - No accessToken in props or state
 *
 * Blocks:
 *   1. HeroBand        — period selector + connection CTA (if not connected)
 *   2. ActivationTimeline — 5-step horizontal progress
 *   3. SalesBlock      — protagonist: revenue KPI + sparkline + drawer
 *   4. OrdersBlock     — protagonist: orders KPI + sparkline + drawer
 *   5. KpiGrid         — 8 compact cards (each with drawer)
 *   6. CopilotInsights — deterministic signal cards + recommendations
 *   7. ExecutionHistory— recent Copilot executions
 */

import { useState, useCallback } from "react";
import { C, T, S, R, E }         from "@/lib/ui/tokens";
import { OperationalSideDrawer } from "@/components/workspace/operational-side-drawer";
import type { DrawerSeverity }   from "@/components/workspace/operational-side-drawer";
import { MSAgentSignal }          from "@/components/marketing-studio/shared/ms-agent-signal";
import { Panel }                  from "@/components/shell/primitives";

import type {
  StatisticsOverview,
  ExecutiveInsight,
  InsightSeverity,
  TrendDirection,
} from "@/lib/marketing-studio/commerce/shopify-statistics-types";

// ── Public types ───────────────────────────────────────────────────────────────

export interface RecentExecution {
  executionId:      string;
  planTitle:        string;
  status:           string;
  startedAt:        string;
  completedSteps:   number;
  failedSteps:      number;
  approvalRequired: boolean;
  durationMs:       number | null;
}

export interface StatisticsClientProps {
  orgSlug:          string;
  overview:         StatisticsOverview | null;
  recentExecutions: RecentExecution[];
  shopDomain:       string;
  connected:        boolean;
}

type DrawerId =
  | "sales" | "orders" | "aov" | "conversion"
  | "customers_new" | "customers_returning"
  | "promotions" | "catalog" | "seo" | "alerts";

type ActivePeriod = "today" | "7d" | "30d" | "custom";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtCurrency(amount: number, currency = "COP"): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);
}

function fmtNumber(n: number): string {
  return new Intl.NumberFormat("es-CO").format(n);
}

function trendSub(pct: number, dir: TrendDirection): string {
  if (dir === "up")   return `↑ ${Math.abs(pct).toFixed(1)}% vs anterior`;
  if (dir === "down") return `↓ ${Math.abs(pct).toFixed(1)}% vs anterior`;
  return "→ sin variación";
}

function trendColor(dir: TrendDirection, invert = false): string {
  const good = invert ? dir === "down" : dir === "up";
  const bad  = invert ? dir === "up"   : dir === "down";
  return good ? C.green : bad ? C.red : C.inkFaint;
}

function trendArrow(dir: TrendDirection): string {
  return dir === "up" ? "↑" : dir === "down" ? "↓" : "→";
}

function severityColors(s: InsightSeverity) {
  if (s === "critical") return { bg: C.redLight,   border: C.redBorder,   dot: C.red,   text: C.red   };
  if (s === "warning")  return { bg: C.amberLight, border: C.amberBorder, dot: C.amber, text: C.amber };
  return                       { bg: C.blueLight,  border: C.blueBorder,  dot: C.blue,  text: C.blue  };
}

function severityLabel(s: InsightSeverity): string {
  return s === "critical" ? "CRÍTICO" : s === "warning" ? "AVISO" : "INFO";
}

function executionStatusColor(status: string): string {
  if (status === "completed")         return C.green;
  if (status === "failed")            return C.red;
  if (status === "awaiting_approval") return C.amber;
  if (status === "running")           return C.blue;
  return C.inkFaint;
}

function executionStatusLabel(status: string): string {
  const m: Record<string, string> = {
    completed: "Completado", failed: "Fallido",
    awaiting_approval: "Pendiente aprobación", running: "En ejecución",
    blocked: "Bloqueado", cancelled: "Cancelado",
  };
  return m[status] ?? status;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function trackEvent(name: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production") console.log(`[stats:${name}]`, data ?? "");
}

// ── Placeholder primitive ─────────────────────────────────────────────────────

function Placeholder({ width = 60, height = 12 }: { width?: number; height?: number }) {
  return (
    <div style={{
      width, height, borderRadius: R.sm,
      background: C.surfaceAlt, display: "inline-block",
    }} />
  );
}

// ── DrawerSection ─────────────────────────────────────────────────────────────

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: S[6] }}>
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz.xs,
        fontWeight:    T.wt.bold,
        color:         C.inkFaint,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom:  S[3],
        paddingBottom: S[2],
        borderBottom:  `1px solid ${C.lineSubtle}`,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ── ActionButton — feeds Copilot pipeline ─────────────────────────────────────

function ActionButton({
  label, utterance, actionId, executing, result, onExecute,
}: {
  label:     string;
  utterance: string;
  actionId:  string;
  executing: boolean;
  result:    { status: string; message: string } | null;
  onExecute: (utterance: string, id: string) => void;
}) {
  if (result) {
    const color = result.status === "ok" ? C.green : result.status === "awaiting_approval" ? C.amber : C.red;
    const bg    = result.status === "ok" ? C.greenLight : result.status === "awaiting_approval" ? C.amberLight : C.redLight;
    const br    = result.status === "ok" ? C.greenBorder : result.status === "awaiting_approval" ? C.amberBorder : C.redBorder;
    return (
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xs, color,
        padding: `${S[2]}px ${S[3]}px`,
        background: bg, border: `1px solid ${br}`, borderRadius: R.md,
      }}>
        {result.message}
      </div>
    );
  }
  return (
    <button
      onClick={() => onExecute(utterance, actionId)}
      disabled={executing}
      style={{
        display: "flex", alignItems: "center", gap: S[2],
        width: "100%", textAlign: "left",
        padding: `${S[2]}px ${S[3]}px`,
        background: executing ? C.surfaceAlt : C.blueLight,
        border: `1px solid ${executing ? C.line : C.blueBorder}`,
        borderRadius: R.md,
        fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.medium,
        color: executing ? C.inkFaint : C.blueDark,
        cursor: executing ? "not-allowed" : "pointer",
      }}
    >
      <span style={{ fontSize: 12, opacity: 0.7 }}>→</span>
      {executing ? "Enviando a Copilot…" : label}
    </button>
  );
}

// ── TrendSparkline ────────────────────────────────────────────────────────────

function TrendSparkline({
  direction,
  color,
  chartId,
  width  = 120,
  height = 40,
}: {
  direction: TrendDirection;
  color:     string;
  chartId:   string;
  width?:    number;
  height?:   number;
}) {
  const pad = 4;
  const W   = width  - pad * 2;
  const H   = height - pad * 2;
  const gradId = `spark-${chartId}`;

  const pts: number[] =
    direction === "up"
      ? [0.80, 0.70, 0.72, 0.62, 0.58, 0.48, 0.38, 0.22]
      : direction === "down"
      ? [0.22, 0.32, 0.28, 0.42, 0.48, 0.60, 0.68, 0.80]
      : [0.52, 0.48, 0.54, 0.50, 0.51, 0.47, 0.52, 0.50];

  const x = (i: number) => (pad + (i / (pts.length - 1)) * W).toFixed(1);
  const y = (v: number) => (pad + (1 - v) * H).toFixed(1);

  const d = pts.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ");
  const areaD = `${d} L ${x(pts.length - 1)} ${(height - pad).toFixed(1)} L ${x(0)} ${(height - pad).toFixed(1)} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradId})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Block 1: HeroBand ─────────────────────────────────────────────────────────

const PERIODS: { id: ActivePeriod; label: string }[] = [
  { id: "today", label: "Hoy"        },
  { id: "7d",    label: "7 días"     },
  { id: "30d",   label: "30 días"    },
  { id: "custom",label: "Personalizado" },
];

function HeroBand({
  connected,
  orgSlug,
  activePeriod,
  onPeriodChange,
}: {
  connected:      boolean;
  orgSlug:        string;
  activePeriod:   ActivePeriod;
  onPeriodChange: (p: ActivePeriod) => void;
}) {
  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          S[3],
      marginBottom: S[4],
      flexWrap:     "wrap",
    }}>
      {/* Period tabs */}
      <div style={{
        display:      "flex",
        background:   C.surfaceAlt,
        border:       `1px solid ${C.line}`,
        borderRadius: R.lg,
        padding:      2,
        gap:          1,
      }}>
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => onPeriodChange(p.id)}
            style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.sm,
              fontWeight:   activePeriod === p.id ? T.wt.semibold : T.wt.normal,
              color:        activePeriod === p.id ? C.white        : C.inkLight,
              background:   activePeriod === p.id ? C.blueDark     : "transparent",
              border:       "none",
              borderRadius: R.md,
              padding:      `${S[1]}px ${S[3]}px`,
              cursor:       "pointer",
              transition:   "background 0.15s, color 0.15s",
              whiteSpace:   "nowrap",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Connection CTA */}
      {!connected && (
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <a
            href={`/${orgSlug}/agentik/marketing-studio/shopify`}
            style={{
              display:        "block",
              padding:        `${S[1]}px ${S[3]}px`,
              background:     C.blueDark,
              color:          C.white,
              borderRadius:   R.lg,
              fontFamily:     T.mono,
              fontSize:       T.sz.sm,
              fontWeight:     T.wt.semibold,
              textDecoration: "none",
              boxShadow:      E.sm,
              whiteSpace:     "nowrap",
            }}
          >
            Conectar tienda Shopify
          </a>
          <a
            href={`/${orgSlug}/agentik/marketing-studio/shopify`}
            style={{
              display:        "block",
              padding:        `${S[1]}px ${S[3]}px`,
              background:     C.white,
              color:          C.ink,
              borderRadius:   R.lg,
              fontFamily:     T.mono,
              fontSize:       T.sz.sm,
              textDecoration: "none",
              border:         `1px solid ${C.line}`,
              whiteSpace:     "nowrap",
            }}
          >
            Ir a Commerce OS
          </a>
        </div>
      )}
    </div>
  );
}

// ── Block 2: ActivationTimeline ───────────────────────────────────────────────

function ActivationTimeline({
  connected,
  overview,
  executions,
}: {
  connected:  boolean;
  overview:   StatisticsOverview | null;
  executions: RecentExecution[];
}) {
  const hasData      = overview !== null;
  const hasInsights  = (overview?.insights.length ?? 0) > 0;
  const hasExec      = executions.length > 0;

  const steps = [
    { label: "Conectar tienda",         done: connected                     },
    { label: "Sincronizar catálogo",    done: connected && hasData           },
    { label: "Recibir datos",           done: connected && hasData           },
    { label: "Copilot activo",          done: connected && hasData && hasInsights },
    { label: "Ejecutar mejoras",        done: hasExec                        },
  ];

  const currentIdx = steps.findIndex(s => !s.done);

  return (
    <div style={{
      border:        `1px solid ${C.line}`,
      borderRadius:  R.xl,
      padding:       `${S[4]}px ${S[5]}px`,
      background:    C.white,
      boxShadow:     E.xs,
      marginBottom:  S[4],
      overflowX:     "auto",
    }}>
      <div style={{
        display:   "flex",
        alignItems: "center",
        gap:        0,
        minWidth:   480,
      }}>
        {steps.map((step, i) => {
          const isCurrent = i === currentIdx;
          const isDone    = step.done;

          return (
            <div key={i} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
              {/* Step */}
              <div style={{
                display:       "flex",
                flexDirection: "column",
                alignItems:    "center",
                gap:           S[1],
                flex:          "0 0 auto",
                minWidth:      80,
              }}>
                {/* Circle */}
                <div style={{
                  width:          28,
                  height:         28,
                  borderRadius:   "50%",
                  background:     isDone    ? C.blueDark  : isCurrent ? C.blueLight : C.surfaceAlt,
                  border:         `2px solid ${isDone ? C.blueDark : isCurrent ? C.blueBorder : C.line}`,
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  flexShrink:     0,
                  transition:     "background 0.2s, border-color 0.2s",
                }}>
                  {isDone ? (
                    <span style={{ color: C.white, fontSize: 11, fontWeight: T.wt.bold }}>✓</span>
                  ) : (
                    <span style={{
                      fontFamily: T.mono,
                      fontSize:   T.sz.xs,
                      fontWeight: T.wt.bold,
                      color:      isCurrent ? C.blueDark : C.inkFaint,
                    }}>
                      {i + 1}
                    </span>
                  )}
                </div>
                {/* Label */}
                <span style={{
                  fontFamily:  T.mono,
                  fontSize:    T.sz["2xs"],
                  fontWeight:  isCurrent ? T.wt.semibold : T.wt.normal,
                  color:       isDone ? C.inkLight : isCurrent ? C.ink : C.inkFaint,
                  textAlign:   "center",
                  lineHeight:  1.3,
                  whiteSpace:  "nowrap",
                }}>
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {i < steps.length - 1 && (
                <div style={{
                  flex:       1,
                  height:     2,
                  background: step.done ? C.blueDark : C.line,
                  margin:     `0 ${S[1]}px`,
                  marginBottom: 18,
                  transition: "background 0.2s",
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Protagonist Block shared card ─────────────────────────────────────────────

function ProtagonistCard({
  icon,
  title,
  value,
  sub,
  trendDir,
  trendColor: tColor,
  chartId,
  noData,
  onOpenDrawer,
  copilotHint,
}: {
  icon:         string;
  title:        string;
  value:        string;
  sub:          string;
  trendDir:     TrendDirection;
  trendColor:   string;
  chartId:      string;
  noData:       boolean;
  onOpenDrawer: () => void;
  copilotHint:  string;
}) {
  return (
    <div style={{
      border:        `1px solid ${C.line}`,
      borderRadius:  R.xl,
      padding:       `${S[5]}px`,
      background:    C.white,
      boxShadow:     E.sm,
      display:       "flex",
      flexDirection: "column",
      gap:           S[3],
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.xs,
          fontWeight:  T.wt.bold,
          color:       C.inkFaint,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}>
          {title}
        </span>
      </div>

      {/* Value + chart */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: S[3] }}>
        <div>
          {noData ? (
            <>
              <div style={{ marginBottom: S[1] }}><Placeholder width={80} height={18} /></div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                Esperando datos
              </div>
            </>
          ) : (
            <>
              <div style={{
                fontFamily:  T.mono,
                fontSize:    T.sz["3xl"],
                fontWeight:  T.wt.bold,
                color:       C.ink,
                lineHeight:  1.1,
                marginBottom: S[1],
              }}>
                {value}
              </div>
              <div style={{
                fontFamily: T.mono,
                fontSize:   T.sz.sm,
                color:      tColor,
                fontWeight: T.wt.medium,
              }}>
                {sub}
              </div>
            </>
          )}
        </div>
        {noData ? (
          <div style={{
            width: 120, height: 40,
            background: C.surfaceAlt, borderRadius: R.md,
            opacity: 0.5,
          }} />
        ) : (
          <TrendSparkline direction={trendDir} color={tColor} chartId={chartId} />
        )}
      </div>

      {/* Copilot hint */}
      <div style={{
        display:      "flex",
        alignItems:   "flex-start",
        gap:          S[2],
        padding:      `${S[2]}px ${S[3]}px`,
        background:   C.blueLight,
        border:       `1px solid ${C.blueBorder}`,
        borderRadius: R.lg,
      }}>
        <span style={{ fontSize: 10, color: C.blue, marginTop: 1, flexShrink: 0 }}>◉</span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, lineHeight: 1.6 }}>
          {copilotHint}
        </span>
      </div>

      {/* Open drawer */}
      <button
        onClick={onOpenDrawer}
        style={{
          width:        "100%",
          padding:      `${S[2]}px 0`,
          background:   "none",
          border:       `1px solid ${C.line}`,
          borderRadius: R.lg,
          fontFamily:   T.mono,
          fontSize:     T.sz.sm,
          color:        C.inkLight,
          cursor:       "pointer",
          textAlign:    "center",
          transition:   "border-color 0.15s, color 0.15s",
        }}
      >
        Ver análisis completo →
      </button>
    </div>
  );
}

// ── Block 3: SalesBlock ───────────────────────────────────────────────────────

function SalesBlock({
  overview,
  onOpenDrawer,
}: {
  overview:     StatisticsOverview | null;
  onOpenDrawer: () => void;
}) {
  const noData = overview === null;
  const rev    = overview?.trends.revenue;

  return (
    <ProtagonistCard
      icon="💰"
      title="Ventas"
      value={noData ? "" : fmtCurrency(overview!.sales.totalRevenue, overview!.sales.currency || "COP")}
      sub={noData ? "" : trendSub(rev!.pct, rev!.direction)}
      trendDir={rev?.direction ?? "stable"}
      trendColor={noData ? C.inkFaint : trendColor(rev!.direction)}
      chartId="sales"
      noData={noData}
      onOpenDrawer={onOpenDrawer}
      copilotHint={
        noData
          ? "Una vez conectada la tienda, analizaré ventas diarias, tendencias y oportunidades de crecimiento."
          : rev!.direction === "down"
          ? "Las ventas están cayendo. Puedo analizar causas y generar una estrategia de recuperación."
          : "Las ventas muestran comportamiento positivo. Puedo identificar qué está funcionando mejor."
      }
    />
  );
}

// ── Block 4: OrdersBlock ──────────────────────────────────────────────────────

function OrdersBlock({
  overview,
  onOpenDrawer,
}: {
  overview:     StatisticsOverview | null;
  onOpenDrawer: () => void;
}) {
  const noData  = overview === null;
  const ordTrnd = overview?.trends.orders;

  return (
    <ProtagonistCard
      icon="📦"
      title="Pedidos"
      value={noData ? "" : fmtNumber(overview!.sales.orders)}
      sub={noData ? "" : trendSub(ordTrnd!.pct, ordTrnd!.direction)}
      trendDir={ordTrnd?.direction ?? "stable"}
      trendColor={noData ? C.inkFaint : trendColor(ordTrnd!.direction)}
      chartId="orders"
      noData={noData}
      onOpenDrawer={onOpenDrawer}
      copilotHint={
        noData
          ? "Monitorearé el volumen de pedidos, detectaré incidencias y sugeriré mejoras en fulfillment."
          : overview!.operations.openIncidents > 0
          ? `${overview!.operations.openIncidents} incidencia${overview!.operations.openIncidents !== 1 ? "s" : ""} abierta${overview!.operations.openIncidents !== 1 ? "s" : ""}. Puedo analizar y sugerir acciones.`
          : "Sin incidencias activas. El volumen de pedidos está bajo control."
      }
    />
  );
}

// ── Block 5: KpiGrid ─────────────────────────────────────────────────────────

interface KpiCardDef {
  id:       DrawerId;
  icon:     string;
  label:    string;
  value:    (o: StatisticsOverview) => string;
  sub:      (o: StatisticsOverview) => string;
  variant:  (o: StatisticsOverview) => "ok" | "warning" | "critical" | "neutral";
}

const KPI_DEFS: KpiCardDef[] = [
  {
    id:      "aov",
    icon:    "🎯",
    label:   "Ticket promedio",
    value:   o => fmtCurrency(o.sales.averageOrderValue, o.sales.currency || "COP"),
    sub:     o => trendSub(o.trends.aov.pct, o.trends.aov.direction),
    variant: o => o.trends.aov.direction === "up" ? "ok" : "neutral",
  },
  {
    id:      "conversion",
    icon:    "🔄",
    label:   "Conversión",
    value:   o => o.funnel?.overallConversion != null ? `${(o.funnel.overallConversion * 100).toFixed(1)}%` : "—",
    sub:     o => o.funnel?.addToCart != null ? `${fmtNumber(o.funnel.addToCart)} con carrito` : "Sin datos de embudo",
    variant: () => "neutral",
  },
  {
    id:      "customers_new",
    icon:    "👤",
    label:   "Clientes nuevos",
    value:   o => fmtNumber(o.sales.newCustomers),
    sub:     o => `${fmtNumber(o.sales.returningCustomers)} recurrentes`,
    variant: o => o.sales.newCustomers > 0 ? "ok" : "neutral",
  },
  {
    id:      "customers_returning",
    icon:    "🔁",
    label:   "Tasa de retención",
    value:   o => o.sales.newCustomers > 0
      ? `${((o.sales.returningCustomers / (o.sales.newCustomers + o.sales.returningCustomers)) * 100).toFixed(0)}%`
      : "—",
    sub:     () => "retornaron a comprar",
    variant: () => "neutral",
  },
  {
    id:      "promotions",
    icon:    "🏷",
    label:   "Promociones activas",
    value:   o => fmtNumber(o.promotions.active),
    sub:     o => `${fmtNumber(o.promotions.scheduled)} programadas`,
    variant: o => o.promotions.active > 0 ? "ok" : "neutral",
  },
  {
    id:      "catalog",
    icon:    "📋",
    label:   "Pendientes catálogo",
    value:   o => fmtNumber(o.catalog.pending),
    sub:     o => `de ${fmtNumber(o.catalog.totalProducts)} en catálogo`,
    variant: o => o.catalog.pending > 0 ? "warning" : "ok",
  },
  {
    id:      "seo",
    icon:    "✍",
    label:   "Sin ventas (SEO)",
    value:   o => fmtNumber(o.catalog.neverSold),
    sub:     () => "publicados sin ventas",
    variant: o => o.catalog.neverSold > 0 ? "warning" : "ok",
  },
  {
    id:      "alerts",
    icon:    "⚡",
    label:   "Alertas Copilot",
    value:   o => fmtNumber(o.operations.criticalAlerts),
    sub:     o => `${fmtNumber(o.insights.length)} señales totales`,
    variant: o => o.operations.criticalAlerts > 0 ? "critical" : o.insights.length > 0 ? "warning" : "ok",
  },
];

function KpiTile({
  def,
  overview,
  onOpenDrawer,
}: {
  def:          KpiCardDef;
  overview:     StatisticsOverview | null;
  onOpenDrawer: (id: DrawerId) => void;
}) {
  const noData  = overview === null;
  const variant = noData ? "neutral" : def.variant(overview!);

  const dotColor =
    variant === "ok"       ? C.green :
    variant === "warning"  ? C.amber :
    variant === "critical" ? C.red   : C.inkFaint;

  return (
    <button
      onClick={() => onOpenDrawer(def.id)}
      style={{
        display:       "flex",
        flexDirection: "column",
        gap:           S[2],
        padding:       `${S[4]}px`,
        background:    C.white,
        border:        `1px solid ${C.line}`,
        borderRadius:  R.xl,
        cursor:        "pointer",
        textAlign:     "left",
        boxShadow:     E.xs,
        transition:    "border-color 0.15s, box-shadow 0.15s",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
        <span style={{ fontSize: 14 }}>{def.icon}</span>
        <span style={{
          fontFamily: T.mono, fontSize: T.sz.xs,
          color: C.inkFaint, flex: 1,
        }}>
          {def.label}
        </span>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: dotColor, flexShrink: 0,
        }} />
      </div>

      {/* Value */}
      {noData ? (
        <Placeholder width={52} height={14} />
      ) : (
        <div style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.xl,
          fontWeight:  T.wt.bold,
          color:       C.ink,
          lineHeight:  1.2,
        }}>
          {def.value(overview!)}
        </div>
      )}

      {/* Sub */}
      <div style={{
        fontFamily: T.mono,
        fontSize:   T.sz.xs,
        color:      C.inkFaint,
        lineHeight: 1.4,
      }}>
        {noData ? "Esperando datos" : def.sub(overview!)}
      </div>

      {/* Drawer hint */}
      <div style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"],
        color: C.blue, marginTop: "auto",
      }}>
        Ver análisis →
      </div>
    </button>
  );
}

function KpiGrid({
  overview,
  onOpenDrawer,
}: {
  overview:     StatisticsOverview | null;
  onOpenDrawer: (id: DrawerId) => void;
}) {
  return (
    <div style={{ marginBottom: S[4] }}>
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz.xs,
        fontWeight:    T.wt.semibold,
        color:         C.inkFaint,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom:  S[3],
      }}>
        KPIs clave
      </div>
      <div style={{
        display:             "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap:                 S[3],
      }}>
        {KPI_DEFS.map(def => (
          <KpiTile key={def.id} def={def} overview={overview} onOpenDrawer={onOpenDrawer} />
        ))}
      </div>
    </div>
  );
}

// ── Drawer contents ───────────────────────────────────────────────────────────

const SALES_ACTIONS = [
  { id: "analyze_revenue",  label: "Analizar comportamiento de ventas",  utterance: "analiza el comportamiento de ventas de esta semana" },
  { id: "gen_promo",        label: "Generar promoción de rescate",        utterance: "genera una promoción para recuperar ventas" },
  { id: "top_products",     label: "Revisar productos líderes",           utterance: "muéstrame los productos con mejores ventas esta semana" },
  { id: "opportunities",    label: "Explorar oportunidades de crecimiento", utterance: "identifica oportunidades de crecimiento en ventas" },
];

const ORDERS_ACTIONS = [
  { id: "analyze_orders",   label: "Analizar tendencia de pedidos",  utterance: "analiza la tendencia de pedidos de esta semana" },
  { id: "review_incidents", label: "Revisar incidencias abiertas",   utterance: "lista las incidencias de pedidos abiertas" },
  { id: "optimize_flow",    label: "Optimizar flujo de pedidos",     utterance: "sugiere mejoras para el flujo de procesamiento de pedidos" },
];

const SEO_ACTIONS = [
  { id: "enrich_seo",       label: "Enriquecer SEO de productos",      utterance: "mejora las descripciones SEO de productos pendientes" },
  { id: "prioritize_seo",   label: "Priorizar productos sin descripción", utterance: "lista los productos sin descripción por prioridad de ventas" },
  { id: "seo_plan",         label: "Generar plan de contenido SEO",    utterance: "genera un plan de enriquecimiento SEO para el catálogo" },
];

const CATALOG_ACTIONS = [
  { id: "review_pending",   label: "Revisar productos pendientes",   utterance: "lista los productos pendientes de publicación" },
  { id: "publish_batch",    label: "Publicar lote pendiente",        utterance: "prepara la publicación del lote de productos pendientes" },
];

const PROMO_ACTIONS = [
  { id: "review_promos",    label: "Analizar rendimiento de promociones", utterance: "analiza el rendimiento de las promociones activas" },
  { id: "new_promo",        label: "Crear nueva promoción",              utterance: "crea una nueva promoción basada en el inventario actual" },
];

const GENERIC_ACTIONS = [
  { id: "analyze_kpi",      label: "Analizar este indicador",   utterance: "analiza este KPI y sugiere acciones" },
  { id: "create_plan",      label: "Crear plan de mejora",      utterance: "genera un plan de mejora basado en los datos actuales" },
];

function DrawerActions({
  actions,
  onExecute,
  executingId,
  results,
}: {
  actions:     { id: string; label: string; utterance: string }[];
  onExecute:   (utterance: string, id: string) => void;
  executingId: string | null;
  results:     Record<string, { status: string; message: string }>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
      {actions.map(a => (
        <ActionButton
          key={a.id}
          actionId={a.id}
          label={a.label}
          utterance={a.utterance}
          executing={executingId === a.id}
          result={results[a.id] ?? null}
          onExecute={onExecute}
        />
      ))}
      <div style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
        marginTop: S[1], lineHeight: 1.6,
      }}>
        Todas las acciones pasan por Intent Resolver → Policy → Runtime → Shopify
      </div>
    </div>
  );
}

function SalesDrawerContent({
  overview,
  onExecute,
  executingId,
  results,
}: {
  overview:    StatisticsOverview | null;
  onExecute:   (utterance: string, id: string) => void;
  executingId: string | null;
  results:     Record<string, { status: string; message: string }>;
}) {
  const noData = overview === null;
  const s      = overview?.sales;
  const rev    = overview?.trends.revenue;

  return (
    <>
      <DrawerSection title="Resumen ejecutivo">
        {noData ? (
          <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
            {[100, 72, 88].map((w, i) => <Placeholder key={i} width={w} />)}
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[2] }}>
              Conecta Shopify para ver ingresos, pedidos y ticket promedio.
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
            {[
              { label: "Ingresos totales",  value: fmtCurrency(s!.totalRevenue, s!.currency || "COP") },
              { label: "Pedidos",            value: fmtNumber(s!.orders)                               },
              { label: "Ticket promedio",    value: fmtCurrency(s!.averageOrderValue, s!.currency || "COP") },
              { label: "Clientes nuevos",    value: fmtNumber(s!.newCustomers)                          },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: 2 }}>{label}</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>{value}</div>
              </div>
            ))}
          </div>
        )}
      </DrawerSection>

      <DrawerSection title="Evolución temporal">
        {noData ? (
          <div style={{
            height: 60, background: C.surfaceAlt,
            borderRadius: R.lg, opacity: 0.5,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              Gráfico disponible tras conectar Shopify
            </span>
          </div>
        ) : (
          <>
            <TrendSparkline direction={rev!.direction} color={trendColor(rev!.direction)} chartId="sales-drawer" width={400} height={60} />
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginTop: S[2] }}>
              {trendArrow(rev!.direction)} {Math.abs(rev!.pct).toFixed(1)}% vs período anterior ·
              {rev!.direction === "up" ? " tendencia positiva" : rev!.direction === "down" ? " tendencia negativa" : " sin cambio"}
            </div>
          </>
        )}
      </DrawerSection>

      <DrawerSection title="Interpretación Copilot">
        {noData ? (
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, lineHeight: 1.7 }}>
            Analizaré ingresos, caídas, picos y patrones temporales. Detectaré automáticamente si las ventas
            caen por debajo del promedio o si hay oportunidades sin explotar.
          </div>
        ) : rev!.direction === "down" ? (
          <MSAgentSignal
            variant="dark"
            text="Las ventas están por debajo del período anterior. Hay causas detectables."
            sub="Puedo analizar productos, horarios y canales que explican la caída."
            agentLabel="Copilot · Shopify"
          />
        ) : (
          <MSAgentSignal
            variant="positive"
            text="Las ventas muestran comportamiento positivo en este período."
            sub={`${fmtCurrency(s!.totalRevenue, s!.currency || "COP")} generados. Puedo identificar qué factores explican el crecimiento.`}
            agentLabel="Copilot · Shopify"
          />
        )}
      </DrawerSection>

      <DrawerSection title="Acciones recomendadas">
        <DrawerActions
          actions={SALES_ACTIONS}
          onExecute={onExecute}
          executingId={executingId}
          results={results}
        />
      </DrawerSection>
    </>
  );
}

function OrdersDrawerContent({
  overview,
  onExecute,
  executingId,
  results,
}: {
  overview:    StatisticsOverview | null;
  onExecute:   (utterance: string, id: string) => void;
  executingId: string | null;
  results:     Record<string, { status: string; message: string }>;
}) {
  const noData = overview === null;
  const s      = overview?.sales;
  const op     = overview?.operations;
  const ord    = overview?.trends.orders;

  return (
    <>
      <DrawerSection title="Resumen">
        {noData ? (
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            Conecta Shopify para ver volumen de pedidos, incidencias y fulfillment.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
            {[
              { label: "Pedidos totales",    value: fmtNumber(s!.orders)             },
              { label: "Incidencias abiertas", value: fmtNumber(op!.openIncidents)   },
              { label: "Alertas críticas",   value: fmtNumber(op!.criticalAlerts)     },
              { label: "Clientes recurrentes", value: fmtNumber(s!.returningCustomers) },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: 2 }}>{label}</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>{value}</div>
              </div>
            ))}
          </div>
        )}
      </DrawerSection>

      <DrawerSection title="Evolución">
        {noData ? (
          <div style={{ height: 60, background: C.surfaceAlt, borderRadius: R.lg, opacity: 0.5 }} />
        ) : (
          <>
            <TrendSparkline direction={ord!.direction} color={trendColor(ord!.direction)} chartId="orders-drawer" width={400} height={60} />
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginTop: S[2] }}>
              {trendArrow(ord!.direction)} {Math.abs(ord!.pct).toFixed(1)}% vs período anterior
            </div>
          </>
        )}
      </DrawerSection>

      <DrawerSection title="Análisis Copilot">
        {noData ? (
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, lineHeight: 1.7 }}>
            Monitorearé volumen de pedidos, detectaré incidencias y sugeriré mejoras en el proceso
            de fulfillment basado en los datos reales de tu tienda.
          </div>
        ) : op!.openIncidents > 0 ? (
          <MSAgentSignal
            variant="dark"
            text={`${op!.openIncidents} incidencia${op!.openIncidents !== 1 ? "s" : ""} abierta${op!.openIncidents !== 1 ? "s" : ""} que requieren atención.`}
            sub="Puedo revisar las causas y preparar un plan de resolución."
            agentLabel="Copilot · Shopify"
          />
        ) : (
          <MSAgentSignal
            variant="positive"
            text="Sin incidencias activas en pedidos. El flujo está operando normalmente."
            sub={`${fmtNumber(s!.orders)} pedidos procesados en este período.`}
            agentLabel="Copilot · Shopify"
          />
        )}
      </DrawerSection>

      <DrawerSection title="Acciones sugeridas">
        <DrawerActions
          actions={ORDERS_ACTIONS}
          onExecute={onExecute}
          executingId={executingId}
          results={results}
        />
      </DrawerSection>
    </>
  );
}

function KpiDrawerContent({
  drawerId,
  overview,
  onExecute,
  executingId,
  results,
}: {
  drawerId:    DrawerId;
  overview:    StatisticsOverview | null;
  onExecute:   (utterance: string, id: string) => void;
  executingId: string | null;
  results:     Record<string, { status: string; message: string }>;
}) {
  const noData = overview === null;
  const def    = KPI_DEFS.find(d => d.id === drawerId);

  const actions =
    drawerId === "seo"        ? SEO_ACTIONS     :
    drawerId === "catalog"    ? CATALOG_ACTIONS :
    drawerId === "promotions" ? PROMO_ACTIONS   :
    GENERIC_ACTIONS;

  const copilotMessages: Record<string, string> = {
    aov:                  "Analizaré tendencias de ticket promedio e identificaré estrategias para incrementarlo.",
    conversion:           "Detectaré cuellos de botella en el embudo y sugeriré optimizaciones por etapa.",
    customers_new:        "Evaluaré la adquisición de clientes y su costo relativo vs valor de vida.",
    customers_returning:  "Analizaré la retención y propondré acciones para mejorar la lealtad.",
    promotions:           "Revisaré el rendimiento de cada promoción activa y su impacto real en ventas.",
    catalog:              "Identificaré productos listos para publicar y prepararé el lote de publicación.",
    seo:                  "Detectaré productos sin descripción, títulos deficientes y alt text faltante.",
    alerts:               "Interpretaré cada alerta, evaluaré su impacto y prepararé acciones correctivas.",
  };

  return (
    <>
      <DrawerSection title="Resumen">
        {noData ? (
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            Conecta Shopify para ver datos reales de {def?.label ?? "este indicador"}.
          </div>
        ) : def ? (
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["3xl"], fontWeight: T.wt.bold, color: C.ink, marginBottom: S[2] }}>
              {def.value(overview!)}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
              {def.sub(overview!)}
            </div>
          </div>
        ) : null}
      </DrawerSection>

      <DrawerSection title="Tendencias">
        {noData ? (
          <div style={{ height: 48, background: C.surfaceAlt, borderRadius: R.lg, opacity: 0.5 }} />
        ) : (
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, lineHeight: 1.6 }}>
            Comparación con período anterior disponible en el panel principal.
          </div>
        )}
      </DrawerSection>

      <DrawerSection title="Interpretación Copilot">
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, lineHeight: 1.7 }}>
          {copilotMessages[drawerId] ?? "Analizaré este indicador y propondré acciones concretas."}
        </div>
      </DrawerSection>

      <DrawerSection title="Acciones recomendadas">
        <DrawerActions
          actions={actions}
          onExecute={onExecute}
          executingId={executingId}
          results={results}
        />
      </DrawerSection>
    </>
  );
}

// ── Copilot Insights ──────────────────────────────────────────────────────────

function InsightCard({
  insight, isOpen, onToggle, executing, result, onExecute,
}: {
  insight:   ExecutiveInsight;
  isOpen:    boolean;
  onToggle:  () => void;
  executing: boolean;
  result:    { status: string; message: string } | null;
  onExecute: (utterance: string, id: string) => void;
}) {
  const colors = severityColors(insight.severity);
  return (
    <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: R.md, overflow: "hidden" }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "flex-start",
          gap: S[3], padding: `${S[3]}px ${S[4]}px`,
          background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: colors.dot, flexShrink: 0, marginTop: 5 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: 4 }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: colors.text, letterSpacing: "0.06em" }}>
              {severityLabel(insight.severity)}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              · {insight.category}
            </span>
            <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              P{insight.priority}
            </span>
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
            {insight.title}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginTop: 2 }}>
            {insight.description}
          </div>
        </div>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, flexShrink: 0 }}>
          {isOpen ? "▲" : "▼"}
        </span>
      </button>
      {isOpen && (
        <div style={{ padding: `0 ${S[4]}px ${S[3]}px`, paddingLeft: S[4] + 8 + S[3] }}>
          {insight.evidence.length > 0 && (
            <div style={{ marginBottom: S[3] }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[1] }}>Evidencia</div>
              <ul style={{ margin: 0, padding: `0 0 0 ${S[3]}px` }}>
                {insight.evidence.map((ev, i) => (
                  <li key={i} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginBottom: 2 }}>{ev}</li>
                ))}
              </ul>
            </div>
          )}
          {insight.suggestedAction && (
            <ActionButton
              actionId={insight.id}
              label="Ejecutar via Copilot"
              utterance={insight.suggestedAction}
              executing={executing}
              result={result}
              onExecute={onExecute}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CopilotInsights({
  overview,
  onExecute,
  executingId,
  results,
}: {
  overview:    StatisticsOverview | null;
  onExecute:   (utterance: string, id: string) => void;
  executingId: string | null;
  results:     Record<string, { status: string; message: string }>;
}) {
  const insights = overview?.insights ?? [];
  const [openId, setOpenId] = useState<string | null>(
    insights.find(i => i.severity === "critical")?.id ?? insights[0]?.id ?? null,
  );

  return (
    <div style={{ marginBottom: S[6] }}>
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz.xs,
        fontWeight:    T.wt.semibold,
        color:         C.inkFaint,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom:  S[3],
      }}>
        Inteligencia Copilot
      </div>

      {!overview ? (
        <div style={{
          padding:      `${S[5]}px`,
          background:   "linear-gradient(135deg, #001E4A 0%, #003A8A 100%)",
          borderRadius: R.xl,
          display:      "flex",
          gap:          S[3],
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "rgba(191,219,254,.5)", flexShrink: 0, marginTop: 4,
          }} />
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: "rgba(255,255,255,.85)", marginBottom: S[1] }}>
              Esperando datos para analizar
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: "rgba(255,255,255,.5)", lineHeight: 1.7 }}>
              Una vez conectada la tienda: detectaré caídas en ventas, productos sin descripción SEO,
              promociones de bajo rendimiento, alertas de inventario y oportunidades de crecimiento.
              Cada señal generará una recomendación accionable.
            </div>
          </div>
        </div>
      ) : insights.length === 0 ? (
        <MSAgentSignal
          variant="positive"
          text="Sin señales de alerta para este período."
          sub="Todos los indicadores están dentro de rangos saludables. Puedo buscar oportunidades de optimización."
          agentLabel="Copilot · Shopify"
        />
      ) : (
        <>
          <MSAgentSignal
            variant="dark"
            text={
              insights.some(i => i.severity === "critical")
                ? `${insights.filter(i => i.severity === "critical").length} señal(es) crítica(s) detectada(s).`
                : `${insights.length} señal(es) detectada(s). Sin críticas activas.`
            }
            sub="Reglas determinísticas · Sin IA generativa"
            agentLabel="Copilot · Shopify"
            style={{ marginBottom: S[4] }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
            {insights.map(insight => (
              <InsightCard
                key={insight.id}
                insight={insight}
                isOpen={openId === insight.id}
                onToggle={() => {
                  const next = openId === insight.id ? null : insight.id;
                  if (next) trackEvent("insight_opened", { insightId: insight.id });
                  setOpenId(next);
                }}
                executing={executingId === insight.id}
                result={results[insight.id] ?? null}
                onExecute={onExecute}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Execution History ─────────────────────────────────────────────────────────

function ExecutionHistory({ executions }: { executions: RecentExecution[] }) {
  if (executions.length === 0) return null;
  return (
    <div style={{ marginBottom: S[6] }}>
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz.xs,
        fontWeight:    T.wt.semibold,
        color:         C.inkFaint,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom:  S[3],
      }}>
        Historial Copilot
      </div>
      <Panel>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 140px 90px 60px",
          gap: `0 ${S[3]}px`, padding: `${S[2]}px ${S[3]}px`,
          borderBottom: `1px solid ${C.line}`,
          fontFamily: T.mono, fontSize: T.sz.xs,
          color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.04em",
        }}>
          <span>Plan</span><span>Estado</span><span>Fecha</span><span>Pasos</span>
        </div>
        <div className="ag-op-table">
          {executions.map(ex => (
            <div key={ex.executionId} className="ag-op-row" style={{
              display: "grid", gridTemplateColumns: "1fr 140px 90px 60px",
              gap: `0 ${S[3]}px`, alignItems: "center",
              padding: `${S[2]}px ${S[3]}px`,
            }}>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, fontWeight: T.wt.medium }}>
                  {ex.planTitle}
                </div>
                {ex.approvalRequired && (
                  <span style={{
                    fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber,
                    background: C.amberLight, border: `1px solid ${C.amberBorder}`,
                    borderRadius: R.pill, padding: `1px ${S[2]}px`,
                    display: "inline-block", marginTop: 2,
                  }}>
                    Requirió aprobación
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: executionStatusColor(ex.status), flexShrink: 0 }} />
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                  {executionStatusLabel(ex.status)}
                </span>
              </div>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{fmtDate(ex.startedAt)}</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>
                {ex.completedSteps}
                {ex.failedSteps > 0 && <span style={{ color: C.red }}> /{ex.failedSteps}✗</span>}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ── Drawer config ─────────────────────────────────────────────────────────────

function getDrawerConfig(
  id:         DrawerId | null,
  overview:   StatisticsOverview | null,
  shopDomain: string,
): { title: string; subtitle?: string; severity: DrawerSeverity; statusLabel?: string } {
  if (!id) return { title: "", severity: "info" };
  const domain  = shopDomain || "tienda";
  const noData  = !overview;

  const configs: Record<DrawerId, { title: string; subtitle?: string; severity: DrawerSeverity }> = {
    sales:               { title: "Análisis de Ventas",        subtitle: noData ? "Sin conexión" : `${domain} · ${overview!.period}`, severity: noData ? "info" : overview!.trends.revenue.direction === "down" ? "warning" : "info" },
    orders:              { title: "Análisis de Pedidos",       subtitle: noData ? "Sin conexión" : `${domain} · ${overview!.period}`, severity: noData ? "info" : (overview!.operations.openIncidents > 0 ? "warning" : "info")           },
    aov:                 { title: "Ticket Promedio",           severity: "info"                       },
    conversion:          { title: "Conversión del Embudo",     severity: "info"                       },
    customers_new:       { title: "Adquisición de Clientes",   severity: "info"                       },
    customers_returning: { title: "Retención de Clientes",     severity: "info"                       },
    promotions:          { title: "Promociones y Descuentos",  severity: noData ? "info" : (overview!.promotions.active > 0 ? "info" : "watch")   },
    catalog:             { title: "Estado del Catálogo",       severity: noData ? "info" : (overview!.catalog.pending > 0 ? "warning" : "info")    },
    seo:                 { title: "Productos Sin Ventas (SEO)", severity: noData ? "info" : (overview!.catalog.neverSold > 0 ? "warning" : "info")                  },
    alerts:              { title: "Alertas Copilot",           severity: noData ? "info" : (overview!.operations.criticalAlerts > 0 ? "critical" : "watch")         },
  };

  return configs[id] ?? { title: id, severity: "info" };
}

// ── Root: StatisticsClient ────────────────────────────────────────────────────

export function StatisticsClient({
  orgSlug,
  overview,
  recentExecutions,
  shopDomain,
  connected,
}: StatisticsClientProps) {
  const [activePeriod, setActivePeriod] = useState<ActivePeriod>("7d");
  const [openDrawer,   setOpenDrawer]   = useState<DrawerId | null>(null);
  const [executingId,  setExecutingId]  = useState<string | null>(null);
  const [results,      setResults]      = useState<Record<string, { status: string; message: string }>>({});

  const handleExecute = useCallback(async (utterance: string, actionId: string) => {
    trackEvent("action_sent_to_copilot", { actionId, utterance });
    setExecutingId(actionId);

    try {
      const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/shopify/execute`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ utterance }),
      });

      const data = await res.json() as {
        report?: { overallStatus?: string };
        status?: string;
        error?:  string;
      };

      const overallStatus = data.report?.overallStatus ?? data.status ?? "unknown";

      if (res.ok) {
        const message =
          overallStatus === "completed"         ? "✓ Ejecutado correctamente"    :
          overallStatus === "awaiting_approval" ? "⏳ Pendiente de aprobación"   :
          overallStatus === "blocked"           ? "⚠ Bloqueado por política"     :
          "Procesado";
        setResults(prev => ({
          ...prev,
          [actionId]: {
            status:  overallStatus === "awaiting_approval" ? "awaiting_approval" : "ok",
            message,
          },
        }));
      } else {
        const errorCode = data.status ?? "error";
        const message =
          errorCode === "shopify_not_configured"          ? "⚠ Shopify no configurado"     :
          errorCode === "domain_provider_not_available"   ? "⚠ Proveedor no disponible"    :
          data.error ?? "Error al ejecutar";
        setResults(prev => ({ ...prev, [actionId]: { status: "error", message } }));
      }
    } catch {
      setResults(prev => ({
        ...prev,
        [actionId]: { status: "error", message: "Error de red al enviar a Copilot" },
      }));
    } finally {
      setExecutingId(null);
    }
  }, [orgSlug]);

  const drawerConfig = getDrawerConfig(openDrawer, overview, shopDomain);

  return (
    <>
      {/* Block 1: Hero band */}
      <HeroBand
        connected={connected}
        orgSlug={orgSlug}
        activePeriod={activePeriod}
        onPeriodChange={setActivePeriod}
      />

      {/* Block 2: Activation timeline */}
      <ActivationTimeline
        connected={connected}
        overview={overview}
        executions={recentExecutions}
      />

      {/* Blocks 3 + 4: Protagonist metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[4], marginBottom: S[4] }}>
        <SalesBlock  overview={overview} onOpenDrawer={() => setOpenDrawer("sales")}  />
        <OrdersBlock overview={overview} onOpenDrawer={() => setOpenDrawer("orders")} />
      </div>

      {/* Block 5: KPI grid */}
      <KpiGrid
        overview={overview}
        onOpenDrawer={id => setOpenDrawer(id)}
      />

      {/* Copilot intelligence */}
      <CopilotInsights
        overview={overview}
        onExecute={handleExecute}
        executingId={executingId}
        results={results}
      />

      {/* Execution history */}
      <ExecutionHistory executions={recentExecutions} />

      {/* Footer */}
      <div style={{
        padding:    `${S[3]}px 0`,
        borderTop:  `1px solid ${C.line}`,
        display:    "flex",
        gap:        S[4],
        alignItems: "center",
        flexWrap:   "wrap",
      }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
          Estadísticas Shopify · SHOPIFY-STATISTICS-UX-02
        </span>
        {overview && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            · {overview.period} · {new Date(overview.generatedAt).toLocaleTimeString("es-MX")}
          </span>
        )}
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
          · Señales determinísticas · Sin IA generativa
        </span>
      </div>

      {/* ── Drawer overlay ── */}
      <OperationalSideDrawer
        open={openDrawer !== null}
        onClose={() => setOpenDrawer(null)}
        title={drawerConfig.title}
        subtitle={drawerConfig.subtitle}
        severity={drawerConfig.severity}
      >
        {openDrawer === "sales"  && (
          <SalesDrawerContent
            overview={overview}
            onExecute={handleExecute}
            executingId={executingId}
            results={results}
          />
        )}
        {openDrawer === "orders" && (
          <OrdersDrawerContent
            overview={overview}
            onExecute={handleExecute}
            executingId={executingId}
            results={results}
          />
        )}
        {openDrawer !== null && openDrawer !== "sales" && openDrawer !== "orders" && (
          <KpiDrawerContent
            drawerId={openDrawer}
            overview={overview}
            onExecute={handleExecute}
            executingId={executingId}
            results={results}
          />
        )}
      </OperationalSideDrawer>
    </>
  );
}
