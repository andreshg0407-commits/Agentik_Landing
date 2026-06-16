"use client";

/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/shopify/estadisticas/statistics-client.tsx
 *
 * SHOPIFY-STATISTICS-UI-01 — Statistics Intelligence Console (Client Component)
 *
 * Four-level intelligence interface:
 *   Level 1 — Executive Summary: KPI cards from live metrics
 *   Level 2 — Copilot Intelligence: deterministic insights as signal cards
 *   Level 3 — Actionable Recommendations: buttons that feed Intent Resolver pipeline
 *   Level 4 — Execution History: recent Copilot executions for traceability
 *
 * Architecture constraints:
 *   - Zero business logic: all computation done server-side
 *   - Recommendations → POST /execute → Intent Resolver → Planner → Policy → Runtime
 *   - No direct action handler calls from UI
 *   - No accessToken in props or state
 *   - Observability events: insight_opened, recommendation_selected, recommendation_sent_to_copilot
 */

import { useState, useCallback }  from "react";
import { C, T, S, R }             from "@/lib/ui/tokens";
import { MSMetricStrip }           from "@/components/marketing-studio/shared/ms-metric-strip";
import { MSAgentSignal }           from "@/components/marketing-studio/shared/ms-agent-signal";
import { MSStatusBadge }           from "@/components/marketing-studio/shared/ms-status-badge";
import { Panel, PanelHeader }      from "@/components/shell/primitives";

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
  overview:         StatisticsOverview;
  recentExecutions: RecentExecution[];
  shopDomain:       string;
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

function fmtCurrency(amount: number, currency = "COP"): string {
  return new Intl.NumberFormat("es-CO", {
    style:                 "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtNumber(n: number): string {
  return new Intl.NumberFormat("es-CO").format(n);
}

function trendSub(pct: number, dir: TrendDirection): string {
  if (dir === "up")     return `↑ ${Math.abs(pct).toFixed(1)}% vs anterior`;
  if (dir === "down")   return `↓ ${Math.abs(pct).toFixed(1)}% vs anterior`;
  return "→ sin cambio";
}

function severityColors(severity: InsightSeverity) {
  if (severity === "critical") return { bg: C.redLight,  border: C.redBorder,  dot: C.red,    text: C.red    };
  if (severity === "warning")  return { bg: C.amberLight, border: C.amberBorder, dot: C.amber,  text: C.amber  };
  return                              { bg: C.blueLight, border: C.blueBorder, dot: C.blue,   text: C.blue   };
}

function severityLabel(severity: InsightSeverity): string {
  if (severity === "critical") return "CRÍTICO";
  if (severity === "warning")  return "AVISO";
  return "INFO";
}

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    sales: "Ventas", catalog: "Catálogo",
    promotions: "Promociones", operations: "Operaciones", funnel: "Embudo",
  };
  return map[cat] ?? cat;
}

function executionStatusColor(status: string): string {
  if (status === "completed")         return C.green;
  if (status === "failed")            return C.red;
  if (status === "awaiting_approval") return C.amber;
  if (status === "running")           return C.blue;
  return C.inkFaint;
}

function executionStatusLabel(status: string): string {
  const map: Record<string, string> = {
    completed:         "Completado",
    failed:            "Fallido",
    awaiting_approval: "Requiere aprobación",
    running:           "En ejecución",
    blocked:           "Bloqueado",
    cancelled:         "Cancelado",
  };
  return map[status] ?? status;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// ── Observability ──────────────────────────────────────────────────────────────

function trackEvent(name: string, data?: Record<string, unknown>) {
  // Non-sensitive observability events — no credentials, no PII
  // Replace with analytics sink (PostHog, Segment, etc.) when available
  if (process.env.NODE_ENV !== "production") {
    console.log(`[stats:${name}]`, data ?? "");
  }
}

// ── Level 1: Executive Summary ─────────────────────────────────────────────────

function ExecutiveSummary({ overview }: { overview: StatisticsOverview }) {
  const { sales, catalog, promotions, operations, trends } = overview;
  const currency = sales.currency || "COP";

  return (
    <div style={{ marginBottom: S[6] }}>
      <SectionLabel label="Resumen Ejecutivo" sub={`Período: ${sales.fromDate} → ${sales.toDate}`} />

      {/* Row 1: Commercial KPIs */}
      <MSMetricStrip cards={[
        {
          value:   fmtCurrency(sales.totalRevenue, currency),
          label:   "Ventas totales",
          sub:     trendSub(trends.revenue.pct, trends.revenue.direction),
          dot:     C.blueDark,
          variant: trends.revenue.direction === "down" ? "warning" : trends.revenue.direction === "up" ? "ok" : "neutral",
        },
        {
          value:   fmtNumber(sales.orders),
          label:   "Pedidos",
          sub:     trendSub(trends.orders.pct, trends.orders.direction),
          dot:     C.blue,
          variant: trends.orders.direction === "down" ? "warning" : "neutral",
        },
        {
          value:   fmtCurrency(sales.averageOrderValue, currency),
          label:   "Ticket promedio",
          sub:     trendSub(trends.aov.pct, trends.aov.direction),
          dot:     C.green,
          variant: trends.aov.direction === "up" ? "ok" : "neutral",
        },
        {
          value:   fmtNumber(sales.newCustomers),
          label:   "Clientes nuevos",
          sub:     `${fmtNumber(sales.returningCustomers)} recurrentes`,
          dot:     C.inkLight,
          variant: "neutral",
        },
      ]} />

      {/* Row 2: Catalog + Operations KPIs */}
      <MSMetricStrip cards={[
        {
          value:   fmtNumber(catalog.published),
          label:   "Publicados",
          sub:     `de ${fmtNumber(catalog.totalProducts)} en catálogo`,
          dot:     C.green,
          variant: catalog.pending > 0 ? "warning" : "ok",
        },
        {
          value:   fmtNumber(catalog.pending),
          label:   "Pendientes de publicar",
          sub:     catalog.pending > 0 ? "requieren acción" : "catálogo al día",
          dot:     catalog.pending > 0 ? C.amber : C.inkFaint,
          variant: catalog.pending > 0 ? "warning" : "neutral",
        },
        {
          value:   fmtNumber(promotions.active),
          label:   "Descuentos activos",
          sub:     `${fmtNumber(promotions.scheduled)} programados`,
          dot:     C.blue,
          variant: "neutral",
        },
        {
          value:   fmtNumber(operations.criticalAlerts),
          label:   "Alertas críticas",
          sub:     operations.openIncidents > 0
            ? `${operations.openIncidents} incidencias abiertas`
            : "sin incidencias",
          dot:     operations.criticalAlerts > 0 ? C.red : C.inkFaint,
          variant: operations.criticalAlerts > 0 ? "critical" : "neutral",
        },
      ]} />
    </div>
  );
}

// ── Level 2 + 3: Copilot Intelligence + Recommendations ───────────────────────

interface InsightCardProps {
  insight:   ExecutiveInsight;
  orgSlug:   string;
  isOpen:    boolean;
  onToggle:  () => void;
  executing: boolean;
  result:    { status: string; message: string } | null;
  onExecute: (utterance: string, insightId: string) => void;
}

function InsightCard({
  insight, orgSlug, isOpen, onToggle, executing, result, onExecute,
}: InsightCardProps) {
  const colors = severityColors(insight.severity);
  void orgSlug; // tenantId resolved server-side; route slug used via parent

  return (
    <div style={{
      background:   colors.bg,
      border:       `1px solid ${colors.border}`,
      borderRadius: R.md,
      overflow:     "hidden",
    }}>
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "flex-start",
          gap: S[3], padding: `${S[3]}px ${S[4]}px`,
          background: "transparent", border: "none", cursor: "pointer",
          textAlign: "left" as const,
        }}
      >
        {/* Severity dot */}
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: colors.dot, flexShrink: 0, marginTop: 5,
        }} />

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: 4 }}>
            <span style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
              color: colors.text, letterSpacing: "0.06em",
            }}>
              {severityLabel(insight.severity)}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              · {categoryLabel(insight.category)}
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

      {/* Expanded: evidence + action */}
      {isOpen && (
        <div style={{ padding: `0 ${S[4]}px ${S[3]}px`, paddingLeft: S[4] + 8 + S[3] }}>
          {insight.evidence.length > 0 && (
            <div style={{ marginBottom: S[3] }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[1] }}>
                Evidencia
              </div>
              <ul style={{ margin: 0, padding: `0 0 0 ${S[3]}px` }}>
                {insight.evidence.map((ev, i) => (
                  <li key={i} style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginBottom: 2,
                  }}>
                    {ev}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action button — feeds Intent Resolver pipeline */}
          {insight.suggestedAction && (
            <div style={{ display: "flex", alignItems: "center", gap: S[3], flexWrap: "wrap" as const }}>
              {result ? (
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz.xs,
                  color: result.status === "ok" ? C.green : result.status === "awaiting_approval" ? C.amber : C.red,
                  padding: `${S[1]}px ${S[3]}px`,
                  background: result.status === "ok" ? C.greenLight : result.status === "awaiting_approval" ? C.amberLight : C.redLight,
                  border: `1px solid ${result.status === "ok" ? C.green : result.status === "awaiting_approval" ? C.amberBorder : C.redBorder}`,
                  borderRadius: R.md,
                }}>
                  {result.message}
                </div>
              ) : (
                <button
                  onClick={() => onExecute(insight.suggestedAction!, insight.id)}
                  disabled={executing}
                  style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                    padding: `${S[2]}px ${S[3]}px`,
                    background: executing ? C.surfaceAlt : C.blueDark,
                    color:      executing ? C.inkLight    : C.white,
                    border:     `1px solid ${executing ? C.line : C.blueDark}`,
                    borderRadius: R.md, cursor: executing ? "not-allowed" : "pointer",
                  }}
                >
                  {executing ? "Enviando a Copilot…" : "Ejecutar via Copilot →"}
                </button>
              )}
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                Pasa por Intent Resolver → Policy → Runtime
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CopilotIntelligence({
  insights, orgSlug, onExecute, executingId, results,
}: {
  insights:    ExecutiveInsight[];
  orgSlug:     string;
  onExecute:   (utterance: string, insightId: string) => void;
  executingId: string | null;
  results:     Record<string, { status: string; message: string }>;
}) {
  const [openId, setOpenId] = useState<string | null>(
    insights.find(i => i.severity === "critical")?.id ?? insights[0]?.id ?? null,
  );

  if (insights.length === 0) {
    return (
      <div style={{ marginBottom: S[6] }}>
        <SectionLabel label="Inteligencia Copilot" sub="Análisis determinístico · Sin IA generativa" />
        <MSAgentSignal
          variant="positive"
          text="Sin señales de alerta para este período."
          sub="Todos los indicadores están dentro de rangos saludables."
          agentLabel="Luca · Comercio"
        />
      </div>
    );
  }

  const critical = insights.filter(i => i.severity === "critical");
  const warnings = insights.filter(i => i.severity === "warning");
  const info     = insights.filter(i => i.severity === "info");

  return (
    <div style={{ marginBottom: S[6] }}>
      <SectionLabel
        label="Inteligencia Copilot"
        sub={`${insights.length} señal${insights.length !== 1 ? "es" : ""} detectada${insights.length !== 1 ? "s" : ""} · Reglas determinísticas`}
      />

      {/* Summary agent signal */}
      {critical.length > 0 ? (
        <MSAgentSignal
          variant="dark"
          text={`${critical.length} señal${critical.length !== 1 ? "es" : ""} crítica${critical.length !== 1 ? "s" : ""} requieren atención inmediata.`}
          sub={critical[0].title}
          agentLabel="Copilot · Shopify"
          style={{ marginBottom: S[4] }}
        />
      ) : warnings.length > 0 ? (
        <MSAgentSignal
          variant="dark"
          text={`${warnings.length} aviso${warnings.length !== 1 ? "s" : ""} detectado${warnings.length !== 1 ? "s" : ""} para esta semana.`}
          sub={warnings[0].title}
          agentLabel="Copilot · Shopify"
          style={{ marginBottom: S[4] }}
        />
      ) : (
        <MSAgentSignal
          variant="positive"
          text={`${info.length} señal${info.length !== 1 ? "es" : ""} informativa${info.length !== 1 ? "s" : ""}.`}
          sub="No hay alertas críticas ni avisos activos."
          agentLabel="Copilot · Shopify"
          style={{ marginBottom: S[4] }}
        />
      )}

      {/* Insight cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
        {insights.map(insight => (
          <InsightCard
            key={insight.id}
            insight={insight}
            orgSlug={orgSlug}
            isOpen={openId === insight.id}
            onToggle={() => {
              const next = openId === insight.id ? null : insight.id;
              if (next) trackEvent("insight_opened", { insightId: insight.id, severity: insight.severity });
              setOpenId(next);
            }}
            executing={executingId === insight.id}
            result={results[insight.id] ?? null}
            onExecute={onExecute}
          />
        ))}
      </div>
    </div>
  );
}

// ── Level 4: Execution History ─────────────────────────────────────────────────

function ExecutionHistory({ executions }: { executions: RecentExecution[] }) {
  if (executions.length === 0) return null;

  return (
    <div style={{ marginBottom: S[6] }}>
      <SectionLabel label="Historial Copilot" sub="Últimas ejecuciones en esta organización" />
      <Panel>
        {/* Header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 120px 80px 60px",
          gap: `0 ${S[3]}px`,
          padding: `${S[2]}px ${S[3]}px`,
          borderBottom: `1px solid ${C.line}`,
          fontFamily: T.mono, fontSize: T.sz.xs,
          color: C.inkFaint, textTransform: "uppercase" as const,
          letterSpacing: "0.04em",
        }}>
          <span>Plan</span>
          <span>Estado</span>
          <span>Fecha</span>
          <span>Pasos</span>
        </div>

        <div className="ag-op-table">
          {executions.map(ex => (
            <div key={ex.executionId} className="ag-op-row" style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px 80px 60px",
              gap: `0 ${S[3]}px`,
              alignItems: "center",
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
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: executionStatusColor(ex.status), flexShrink: 0,
                }} />
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                  {executionStatusLabel(ex.status)}
                </span>
              </div>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                {fmtDate(ex.startedAt)}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>
                {ex.completedSteps}
                {ex.failedSteps > 0 && (
                  <span style={{ color: C.red }}> / {ex.failedSteps}✗</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ── Layout helpers ─────────────────────────────────────────────────────────────

function SectionLabel({ label, sub }: { label: string; sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: S[2], marginBottom: S[3] }}>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
        color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em",
      }}>
        {label}
      </span>
      {sub && (
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
          · {sub}
        </span>
      )}
    </div>
  );
}

// ── Trend Analysis strip ───────────────────────────────────────────────────────

function TrendStrip({ trends }: { trends: StatisticsOverview["trends"] }) {
  const items = [
    { label: "Ingresos",   metric: trends.revenue },
    { label: "Pedidos",    metric: trends.orders   },
    { label: "AOV",        metric: trends.aov      },
    { label: "Unidades",   metric: trends.units    },
    { label: "Reembolsos", metric: trends.refunds, invert: true },
    { label: "Retornos",   metric: trends.returns,  invert: true },
  ];

  return (
    <div style={{ marginBottom: S[6] }}>
      <SectionLabel label="Tendencias" sub="Período actual vs período anterior" />
      <Panel>
        <div style={{ padding: `${S[3]}px ${S[3]}px`, display: "flex", gap: S[4], flexWrap: "wrap" as const }}>
          {items.map(({ label, metric, invert }) => {
            const positive = invert ? metric.direction === "down" : metric.direction === "up";
            const negative = invert ? metric.direction === "up"   : metric.direction === "down";
            const color = positive ? C.green : negative ? C.red : C.inkFaint;
            const arrow = metric.direction === "up" ? "↑" : metric.direction === "down" ? "↓" : "→";
            return (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 90 }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                  {label}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color }}>
                  {arrow} {Math.abs(metric.pct).toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

// ── Root Client Component ──────────────────────────────────────────────────────

export function StatisticsClient({
  orgSlug,
  overview,
  recentExecutions,
}: StatisticsClientProps) {
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { status: string; message: string }>>({});

  const handleExecute = useCallback(async (utterance: string, insightId: string) => {
    trackEvent("recommendation_selected", { insightId, utterance });
    setExecutingId(insightId);

    try {
      trackEvent("recommendation_sent_to_copilot", { insightId, utterance });

      const res = await fetch(`/api/orgs/${orgSlug}/marketing-studio/shopify/execute`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ utterance }),
      });

      const data = await res.json() as { report?: { overallStatus?: string }; status?: string; error?: string };

      const overallStatus = data.report?.overallStatus ?? data.status ?? "unknown";

      if (res.ok) {
        const message =
          overallStatus === "completed"         ? "✓ Ejecutado correctamente" :
          overallStatus === "awaiting_approval" ? "⏳ Pendiente de aprobación" :
          overallStatus === "blocked"           ? "⚠ Bloqueado por política"  :
          "Procesado";

        setResults(prev => ({
          ...prev,
          [insightId]: { status: overallStatus === "awaiting_approval" ? "awaiting_approval" : "ok", message },
        }));
      } else {
        const errorCode = data.status ?? "error";
        const message =
          errorCode === "shopify_not_configured" ? "⚠ Shopify no configurado" :
          errorCode === "domain_provider_not_available" ? "⚠ Proveedor no disponible" :
          data.error ?? "Error al ejecutar";
        setResults(prev => ({ ...prev, [insightId]: { status: "error", message } }));
      }
    } catch {
      setResults(prev => ({
        ...prev,
        [insightId]: { status: "error", message: "Error de red al enviar a Copilot" },
      }));
    } finally {
      setExecutingId(null);
    }
  }, [orgSlug]);

  return (
    <>
      {/* Level 1: Executive Summary */}
      <ExecutiveSummary overview={overview} />

      {/* Trend strip */}
      <TrendStrip trends={overview.trends} />

      {/* Level 2 + 3: Copilot Intelligence + Recommendations */}
      <CopilotIntelligence
        insights={overview.insights}
        orgSlug={orgSlug}
        onExecute={handleExecute}
        executingId={executingId}
        results={results}
      />

      {/* Level 4: Execution History */}
      <ExecutionHistory executions={recentExecutions} />

      {/* Footer */}
      <div style={{
        padding: `${S[3]}px 0`,
        borderTop: `1px solid ${C.line}`,
        display: "flex", gap: S[4], alignItems: "center", flexWrap: "wrap" as const,
      }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
          Estadísticas Shopify · SHOPIFY-STATISTICS-UI-01
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
          · {overview.period} · Generado: {new Date(overview.generatedAt).toLocaleTimeString("es-MX")}
        </span>
        <MSStatusBadge
          label="Señales determinísticas · Sin IA generativa"
          variant="neutral"
          size="sm"
        />
      </div>
    </>
  );
}
