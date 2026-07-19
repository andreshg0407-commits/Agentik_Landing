"use client";

/**
 * Pipeline Intelligence client component.
 *
 * Renders:
 *  1. KPI header row (5 cards)
 *  2. Pipeline Funnel — horizontal stage cards
 *  3. At-Risk Deals table
 *  4. Seller Leaderboard table
 *  5. Lost Deal Analysis — horizontal CSS bar chart
 *  6. Forecast table — next 3 months
 *
 * All styling is inline CSS, monospace font family, enterprise dark-on-white
 * style — no Tailwind classes.
 */

import type { CSSProperties, ReactNode } from "react";
import { formatDateCol } from "@/lib/utils/formatDate";
import type {
  PipelineKpis,
  SellerPipelineRow,
} from "@/lib/pipeline/service";
import type { SerializedQuotesSummary } from "./page";

// ── DealRisk with serialized dates ────────────────────────────────────────────

interface SerializedDealRisk {
  id:                    string;
  title:                 string;
  customerName:          string | null;
  sellerName:            string | null;
  stage:                 string;
  amount:                number;
  daysSinceLastActivity: number;
  expectedCloseAt:       string | null;
  riskFlags:             string[];
}

// ── Quote status display ──────────────────────────────────────────────────────

const QUOTE_STATUS_COLORS: Record<string, CSSProperties> = {
  DRAFT:    { background: "#e5e7eb", color: "#374151" },
  SENT:     { background: "#bfdbfe", color: "#1e3a8a" },
  ACCEPTED: { background: "#bbf7d0", color: "#14532d" },
  REJECTED: { background: "#fca5a5", color: "#991b1b" },
  EXPIRED:  { background: "#fde68a", color: "#92400e" },
};

const QUOTE_STATUS_LABELS: Record<string, string> = {
  DRAFT:    "Borrador",
  SENT:     "Enviada",
  ACCEPTED: "Aceptada",
  REJECTED: "Rechazada",
  EXPIRED:  "Vencida",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug:             string;
  kpis:                PipelineKpis | null;
  atRisk:              SerializedDealRisk[];
  sellers:             SellerPipelineRow[];
  lostAnalysis:        Array<{ reason: string; count: number; totalAmount: number }>;
  quotesSummary:       SerializedQuotesSummary | null;
  dataError:           boolean;
  /**
   * True only when BOTH opportunities AND quotes are absent.
   * The page still renders the quotes section when this is false but
   * opportunitiesSynced is also false.
   */
  syncPending:         boolean;
  /** True when at least one CRMOpportunity row exists for this org. */
  opportunitiesSynced: boolean;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtCOP(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtN(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-CO").format(n);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return formatDateCol(d);
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

const MONTH_ABBR: Record<string, string> = {
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
};

function fmtYearMonth(ym: string): string {
  const [year, month] = ym.split("-");
  return `${MONTH_ABBR[month] ?? month} ${year}`;
}

// ── Stage colors ──────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  prospect:    "#94a3b8",
  qualified:   "#60a5fa",
  proposal:    "#a78bfa",
  negotiation: "#fb923c",
  closed_won:  "#4ade80",
  closed_lost: "#f87171",
};

// ── Risk flag labels ──────────────────────────────────────────────────────────

const RISK_FLAG_LABELS: Record<string, { label: string; style: CSSProperties }> = {
  past_due_date: { label: "Fecha vencida",    style: { background: "#fed7aa", color: "#9a3412" } },
  large_deal:    { label: "Deal grande",      style: { background: "#e9d5ff", color: "#6b21a8" } },
};

function getRiskFlagStyle(flag: string): { label: string; style: CSSProperties } {
  if (RISK_FLAG_LABELS[flag]) return RISK_FLAG_LABELS[flag];
  // Catch `no_activity_Xd` pattern
  if (flag.startsWith("no_activity_")) {
    return { label: `Sin actividad ${flag.replace("no_activity_", "")}`, style: { background: "#fca5a5", color: "#991b1b" } };
  }
  return { label: flag.replace(/_/g, " "), style: { background: "#e5e7eb", color: "#374151" } };
}

// ── Table primitives ──────────────────────────────────────────────────────────

const TABLE: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const THEAD_ROW: CSSProperties = { borderBottom: "1px solid #eee", background: "#fafafa" };

function TH({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th style={{
      padding: "6px 14px",
      textAlign: right ? "right" : "left",
      fontWeight: 600,
      color: "#777",
      fontSize: 11,
    }}>
      {children}
    </th>
  );
}

function TD({ children, right, bold }: { children: ReactNode; right?: boolean; bold?: boolean }) {
  return (
    <td style={{
      padding: "7px 14px",
      textAlign: right ? "right" : "left",
      fontWeight: bold ? 600 : 400,
      color: "#111",
      borderBottom: "1px solid #f5f5f5",
    }}>
      {children}
    </td>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  accent,
}: {
  label:   string;
  value:   string;
  accent?: "green" | "red" | "yellow";
}) {
  const bg    = accent === "green" ? "#f0fdf4" : accent === "red" ? "#fef2f2" : accent === "yellow" ? "#fffbeb" : "#fff";
  const color = accent === "green" ? "#15803d" : accent === "red" ? "#991b1b" : accent === "yellow" ? "#92400e" : "#111";
  return (
    <div style={{
      border: "1px solid #ddd",
      borderRadius: 6,
      padding: "14px 18px",
      background: bg,
      fontFamily: "monospace",
    }}>
      <div style={{
        fontSize: 10,
        color: "#888",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1.2 }}>
        {value}
      </div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 6, overflow: "hidden", marginBottom: 20 }}>
      <div style={{
        padding: "9px 14px",
        borderBottom: "1px solid #ddd",
        background: "#f5f5f5",
      }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{
      padding: "20px 16px",
      fontSize: 12,
      color: "#aaa",
      background: "#fafafa",
    }}>
      {message}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PipelineClient({
  orgSlug,
  kpis,
  atRisk,
  sellers,
  lostAnalysis,
  quotesSummary,
  dataError,
  syncPending,
  opportunitiesSynced,
}: Props) {
  // Derived display flags
  const hasQuotes = (quotesSummary?.totalQuotes ?? 0) > 0;

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20 }}>
        <a href={`/${orgSlug}/sales`} style={{ fontSize: 11, color: "#888", textDecoration: "none", fontFamily: "monospace" }}>← Control Comercial</a>
        <span style={{ color: "#ccc" }}>/</span>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Embudo Comercial</h1>
        <span style={{
          fontSize: 11,
          background: "#111",
          color: "#fff",
          padding: "2px 10px",
          borderRadius: 4,
          fontWeight: 700,
          letterSpacing: "0.03em",
        }}>
          CRM
        </span>
        <span style={{ marginLeft: "auto" }}>
          <a
            href={`/${orgSlug}/customer-360`}
            style={{ fontSize: 11, color: "#888", textDecoration: "none", fontFamily: "monospace" }}
          >
            Cliente 360 →
          </a>
        </span>
      </div>

      {/* ── Hard error state (fatal load failure) ── */}
      {dataError && (
        <div style={{
          border: "1px solid #ddd",
          borderRadius: 6,
          padding: "32px 24px",
          background: "#fafafa",
          textAlign: "center",
          marginBottom: 20,
          fontFamily: "monospace",
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#555", marginBottom: 8 }}>
            Error al cargar el pipeline
          </div>
          <div style={{ fontSize: 13, color: "#888", maxWidth: 500, margin: "0 auto" }}>
            No se pudo cargar la información del pipeline. Revise los conectores CRM.
          </div>
        </div>
      )}

      {/* ── Both opportunities and quotes absent — nothing synced yet ── */}
      {!dataError && syncPending && (
        <div style={{
          border: "1px solid #e0c97a",
          borderRadius: 6,
          padding: "32px 24px",
          background: "#fffdf0",
          textAlign: "center",
          marginBottom: 20,
          fontFamily: "monospace",
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#555", marginBottom: 8 }}>
            CRM pendiente de sincronización
          </div>
          <div style={{ fontSize: 13, color: "#888", maxWidth: 500, margin: "0 auto" }}>
            No se encontraron oportunidades ni pedidos. Ejecute una sincronización del
            conector CRM (castillitos_crm) con el módulo <code>quotes</code> para ver el
            panel comercial de pedidos/cotizaciones.
          </div>
        </div>
      )}

      {/* ── Soft note: quotes present but opportunities still absent ── */}
      {!dataError && !syncPending && !opportunitiesSynced && hasQuotes && (
        <div style={{
          border: "1px solid #ddd",
          borderRadius: 6,
          padding: "10px 16px",
          background: "#f8fafc",
          fontSize: 12,
          color: "#64748b",
          marginBottom: 16,
          fontFamily: "monospace",
        }}>
          No hay oportunidades CRM sincronizadas aún. Mostrando panel comercial basado en
          pedidos / cotizaciones (AOS_Quotes).
        </div>
      )}

      {!dataError && (
        <>
          {/* ── Opportunity sections (1–5) — only when opportunities exist ── */}
          {opportunitiesSynced && (
            <>
          {/* ── KPI row ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
            <KpiCard
              label="Oportunidades abiertas"
              value={kpis ? fmtN(kpis.totalOpen) : "0"}
            />
            <KpiCard
              label="Pipeline total"
              value={kpis ? fmtCOP(kpis.totalOpenAmount) : "—"}
            />
            <KpiCard
              label="Forecast ponderado"
              value={kpis ? fmtCOP(kpis.weightedForecast) : "—"}
            />
            <KpiCard
              label="Tasa de cierre (90d)"
              value={kpis ? fmtPct(kpis.conversionRate) : "—"}
              accent={
                kpis && kpis.conversionRate >= 50 ? "green"
                  : kpis && kpis.conversionRate >= 25 ? "yellow"
                  : kpis ? "red"
                  : undefined
              }
            />
            <KpiCard
              label="Ciclo de cierre prom."
              value={kpis && kpis.avgDealCycleDays > 0 ? `${kpis.avgDealCycleDays}d` : "—"}
            />
          </div>

          {/* ── Section 1: Pipeline Funnel ── */}
          <Section title="Embudo de ventas">
            {!kpis || kpis.byStage.length === 0 ? (
              <EmptyState message="No hay oportunidades en el pipeline actualmente." />
            ) : (
              <div style={{ padding: "16px 20px" }}>
                {(() => {
                  const openStages = kpis.byStage.filter(s => s.key !== "closed_won" && s.key !== "closed_lost");
                  const maxAmt = Math.max(...openStages.map(s => s.totalAmount), 1);
                  return openStages.map(stage => {
                    const color = STAGE_COLORS[stage.key] ?? stage.color ?? "#94a3b8";
                    const barWidth = Math.max(4, Math.round((stage.totalAmount / maxAmt) * 100));
                    return (
                      <div key={stage.key} style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 10 }}>
                        <div style={{
                          width: 120,
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#555",
                          textAlign: "right",
                          flexShrink: 0,
                        }}>
                          {stage.label}
                        </div>
                        <div style={{
                          flex: 1,
                          height: 32,
                          background: "#f5f5f5",
                          borderRadius: 4,
                          position: "relative",
                          overflow: "hidden",
                        }}>
                          <div style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: `${barWidth}%`,
                            background: color,
                            borderRadius: "4px 0 0 4px",
                            opacity: 0.85,
                          }} />
                          <div style={{
                            position: "absolute",
                            left: 10,
                            top: 0,
                            bottom: 0,
                            display: "flex",
                            alignItems: "center",
                            fontSize: 11,
                            fontWeight: 600,
                            color: barWidth > 30 ? "#fff" : "#333",
                            gap: 10,
                          }}>
                            <span>{stage.count} oport.</span>
                            <span style={{ opacity: 0.9 }}>{fmtCOP(stage.totalAmount)}</span>
                            <span style={{ opacity: 0.75 }}>{stage.probability}% prob.</span>
                          </div>
                        </div>
                        <div style={{
                          width: 60,
                          fontSize: 10,
                          color: "#aaa",
                          textAlign: "right",
                          flexShrink: 0,
                        }}>
                          ~{stage.avgAge}d
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </Section>

          {/* ── Section 2: At-Risk Deals ── */}
          <Section title={`Oportunidades en riesgo (${atRisk.length})`}>
            {atRisk.length === 0 ? (
              <EmptyState message="Sin oportunidades en riesgo detectadas." />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={TABLE}>
                  <thead>
                    <tr style={THEAD_ROW}>
                      <TH>Título</TH>
                      <TH>Cliente</TH>
                      <TH>Vendedor</TH>
                      <TH>Etapa</TH>
                      <TH right>Monto</TH>
                      <TH right>Días sin actividad</TH>
                      <TH right>Cierre esperado</TH>
                      <TH>Riesgos</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {atRisk.map((d, i) => (
                      <tr key={d.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <TD bold>{d.title}</TD>
                        <TD>{d.customerName ?? <span style={{ color: "#ccc" }}>—</span>}</TD>
                        <TD>{d.sellerName ?? <span style={{ color: "#ccc" }}>—</span>}</TD>
                        <TD>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontFamily: "monospace",
                            background: (STAGE_COLORS[d.stage] ?? "#94a3b8") + "33",
                            color: STAGE_COLORS[d.stage] ?? "#555",
                            border: `1px solid ${STAGE_COLORS[d.stage] ?? "#94a3b8"}66`,
                          }}>
                            {d.stage}
                          </span>
                        </TD>
                        <TD right>{fmtCOP(d.amount)}</TD>
                        <TD right>
                          <span style={{ color: d.daysSinceLastActivity >= 30 ? "#991b1b" : d.daysSinceLastActivity >= 14 ? "#92400e" : "#555", fontWeight: 600 }}>
                            {d.daysSinceLastActivity}d
                          </span>
                        </TD>
                        <TD right>{fmtDate(d.expectedCloseAt)}</TD>
                        <TD>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {d.riskFlags.map(f => {
                              const rf = getRiskFlagStyle(f);
                              return (
                                <span key={f} style={{
                                  ...rf.style,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: "2px 7px",
                                  borderRadius: 4,
                                  fontFamily: "monospace",
                                  whiteSpace: "nowrap",
                                }}>
                                  {rf.label}
                                </span>
                              );
                            })}
                          </div>
                        </TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ── Section 3: Seller Leaderboard ── */}
          <Section title="Rendimiento por vendedor">
            {sellers.length === 0 ? (
              <EmptyState message="Sin datos de vendedores disponibles." />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={TABLE}>
                  <thead>
                    <tr style={THEAD_ROW}>
                      <TH>Vendedor</TH>
                      <TH right>Pipeline abierto</TH>
                      <TH right>Monto abierto</TH>
                      <TH right>Ganados (30d)</TH>
                      <TH right>Tasa cierre (90d)</TH>
                      <TH right>Ciclo prom.</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {sellers.map((s, i) => (
                      <tr key={s.sellerSlug} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <TD bold>{s.sellerName}</TD>
                        <TD right>{fmtN(s.openDeals)}</TD>
                        <TD right>{fmtCOP(s.openAmount)}</TD>
                        <TD right>
                          <span style={{ color: "#15803d", fontWeight: 600 }}>
                            {s.wonDeals} ({fmtCOP(s.wonAmountL30)})
                          </span>
                        </TD>
                        <TD right>
                          <span style={{
                            fontWeight: 600,
                            color: s.conversionRate >= 50 ? "#15803d"
                              : s.conversionRate >= 25 ? "#92400e"
                              : "#991b1b",
                          }}>
                            {fmtPct(s.conversionRate)}
                          </span>
                        </TD>
                        <TD right>
                          {s.avgDaysToClose != null
                            ? <span style={{ color: "#555" }}>{s.avgDaysToClose}d</span>
                            : <span style={{ color: "#ccc" }}>—</span>}
                        </TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ── Section 4: Lost Deal Analysis ── */}
          <Section title="Análisis de pérdidas (últimos 90 días)">
            {lostAnalysis.length === 0 ? (
              <EmptyState message="Sin oportunidades perdidas en los últimos 90 días." />
            ) : (
              <div style={{ padding: "16px 20px" }}>
                {(() => {
                  const maxAmt = Math.max(...lostAnalysis.map(r => r.totalAmount), 1);
                  const totalLost = lostAnalysis.reduce((s, r) => s + r.totalAmount, 0);
                  return (
                    <>
                      <div style={{
                        fontSize: 11,
                        color: "#888",
                        marginBottom: 14,
                        fontFamily: "monospace",
                      }}>
                        Total perdido: <strong style={{ color: "#991b1b" }}>{fmtCOP(totalLost)}</strong>
                      </div>
                      {lostAnalysis.map(r => {
                        const barWidth = Math.max(2, Math.round((r.totalAmount / maxAmt) * 100));
                        const pct = totalLost > 0 ? (r.totalAmount / totalLost) * 100 : 0;
                        return (
                          <div key={r.reason} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
                            <div style={{
                              width: 200,
                              fontSize: 11,
                              color: "#444",
                              textAlign: "right",
                              flexShrink: 0,
                              fontFamily: "monospace",
                            }}>
                              {r.reason}
                            </div>
                            <div style={{
                              flex: 1,
                              height: 22,
                              background: "#f5f5f5",
                              borderRadius: 4,
                              position: "relative",
                              overflow: "hidden",
                            }}>
                              <div style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: `${barWidth}%`,
                                background: "#f87171",
                                borderRadius: "4px 0 0 4px",
                                opacity: 0.8,
                              }} />
                              <div style={{
                                position: "absolute",
                                left: 8,
                                top: 0,
                                bottom: 0,
                                display: "flex",
                                alignItems: "center",
                                fontSize: 10,
                                fontWeight: 600,
                                color: barWidth > 40 ? "#fff" : "#991b1b",
                              }}>
                                {r.count} oport. · {fmtCOP(r.totalAmount)}
                              </div>
                            </div>
                            <div style={{
                              width: 50,
                              fontSize: 10,
                              color: "#aaa",
                              textAlign: "right",
                              flexShrink: 0,
                              fontFamily: "monospace",
                            }}>
                              {pct.toFixed(1)}%
                            </div>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            )}
          </Section>

          {/* ── Section 5: Forecast (next 3 months) ── */}
          <Section title="Forecast — próximos 3 meses (por fecha de cierre esperada)">
            {!kpis || kpis.forecast.length === 0 ? (
              <EmptyState message="Sin oportunidades con fecha de cierre en los próximos 3 meses." />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={TABLE}>
                  <thead>
                    <tr style={THEAD_ROW}>
                      <TH>Mes</TH>
                      <TH right>Pipeline total</TH>
                      <TH right>Forecast ponderado</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {kpis.forecast.map((f, i) => (
                      <tr key={f.month} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <TD bold>{fmtYearMonth(f.month)}</TD>
                        <TD right>{fmtCOP(f.amount)}</TD>
                        <TD right>
                          <span style={{ color: "#7c3aed", fontWeight: 600 }}>
                            {fmtCOP(f.weightedAmount)}
                          </span>
                        </TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
            </>
          )} {/* end opportunitiesSynced */}

          {/* ── Section 6: Pedidos / Cotizaciones CRM (AOS_Quotes) ── */}
          {/* Renders independently of opportunities — gated only on quotesSummary */}
          {quotesSummary && (
            <>
              {/* Panel heading */}
              <div style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                marginBottom: 14,
                paddingTop: opportunitiesSynced ? 8 : 0,
                borderTop: opportunitiesSynced ? "1px solid #eee" : undefined,
              }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>Panel comercial de pedidos</span>
                <span style={{
                  fontSize: 10,
                  background: "#f0fdf4",
                  color: "#15803d",
                  border: "1px solid #bbf7d0",
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontWeight: 700,
                  fontFamily: "monospace",
                }}>
                  AOS_Quotes · {quotesSummary.totalQuotes} registros
                </span>
              </div>

              {/* KPI bar for quotes */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                <KpiCard label="Pedidos / cotizaciones" value={fmtN(quotesSummary.totalQuotes)} />
                <KpiCard label="Valor total pedidos"   value={fmtCOP(quotesSummary.totalAmount)} />
                {quotesSummary.byStage.filter(s => s.status === "ACCEPTED").map(s => (
                  <KpiCard key={s.status} label="Aceptadas" value={`${s.count} · ${fmtCOP(s.totalAmount)}`} accent="green" />
                ))}
                {quotesSummary.byStage.filter(s => s.status === "DRAFT").map(s => (
                  <KpiCard key={s.status} label="En borrador" value={`${s.count} · ${fmtCOP(s.totalAmount)}`} />
                ))}
              </div>

              {/* Stage distribution */}
              <Section title="Pedidos por estado (AOS_Quotes)">
                {quotesSummary.byStage.length === 0 ? (
                  <EmptyState message="Sin pedidos en el CRM." />
                ) : (
                  <div style={{ padding: "14px 20px" }}>
                    {(() => {
                      const maxAmt = Math.max(...quotesSummary.byStage.map(s => s.totalAmount), 1);
                      return quotesSummary.byStage.map(s => {
                        const style = QUOTE_STATUS_COLORS[s.status] ?? { background: "#e5e7eb", color: "#374151" };
                        const barWidth = Math.max(4, Math.round((s.totalAmount / maxAmt) * 100));
                        return (
                          <div key={s.status} style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 10 }}>
                            <div style={{ width: 100, fontSize: 11, fontWeight: 600, textAlign: "right", flexShrink: 0, color: "#555" }}>
                              {QUOTE_STATUS_LABELS[s.status] ?? s.status}
                            </div>
                            <div style={{ flex: 1, height: 28, background: "#f5f5f5", borderRadius: 4, position: "relative", overflow: "hidden" }}>
                              <div style={{
                                position: "absolute", left: 0, top: 0, bottom: 0,
                                width: `${barWidth}%`,
                                background: String(style.background),
                                borderRadius: "4px 0 0 4px",
                                opacity: 0.85,
                              }} />
                              <div style={{
                                position: "absolute", left: 10, top: 0, bottom: 0,
                                display: "flex", alignItems: "center",
                                fontSize: 11, fontWeight: 600,
                                color: barWidth > 30 ? String(style.color) : "#333",
                                gap: 10,
                              }}>
                                <span>{s.count} pedidos</span>
                                <span style={{ opacity: 0.9 }}>{fmtCOP(s.totalAmount)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </Section>

              {/* Recent quotes table */}
              <Section title={`Pedidos recientes — ${quotesSummary.recentQuotes.length} últimos (AOS_Quotes)`}>
                {quotesSummary.recentQuotes.length === 0 ? (
                  <EmptyState message="Sin pedidos recientes." />
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={TABLE}>
                      <thead>
                        <tr style={THEAD_ROW}>
                          <TH>Pedido</TH>
                          <TH>Cliente</TH>
                          <TH>Vendedor</TH>
                          <TH>Estado CRM</TH>
                          <TH right>Monto</TH>
                          <TH>Sucursal</TH>
                          <TH>SAG</TH>
                          <TH right>Fecha</TH>
                        </tr>
                      </thead>
                      <tbody>
                        {quotesSummary.recentQuotes.map((q, i) => {
                          const hasSag = !!(q.idSag && q.idSag !== "null");
                          const sagOk  = hasSag && q.respuestaSag && !q.respuestaSag.toLowerCase().includes("error");
                          return (
                            <tr key={q.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                              <TD bold>
                                <div>{q.quoteName ?? q.quoteNumber ?? q.crmId?.slice(-8) ?? q.id.slice(-8)}</div>
                                {q.quoteNumber && q.quoteName && (
                                  <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>#{q.quoteNumber}</div>
                                )}
                              </TD>
                              <TD>{q.customerName ?? <span style={{ color: "#ccc" }}>—</span>}</TD>
                              <TD>{q.sellerName ?? <span style={{ color: "#ccc" }}>—</span>}</TD>
                              <TD>
                                {q.stage ? (
                                  <span style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: "2px 7px",
                                    borderRadius: 4,
                                    fontFamily: "monospace",
                                    ...(QUOTE_STATUS_COLORS[q.status] ?? { background: "#e5e7eb", color: "#374151" }),
                                  }}>
                                    {q.stage}
                                  </span>
                                ) : (
                                  <span style={{ color: "#ccc" }}>—</span>
                                )}
                              </TD>
                              <TD right>{fmtCOP(q.amount)}</TD>
                              <TD>{q.sucursal ?? <span style={{ color: "#ccc" }}>—</span>}</TD>
                              <TD>
                                {hasSag ? (
                                  <span style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: "2px 7px",
                                    borderRadius: 4,
                                    fontFamily: "monospace",
                                    background: sagOk ? "#bbf7d0" : "#fde68a",
                                    color:      sagOk ? "#14532d" : "#92400e",
                                  }}>
                                    {sagOk ? "En SAG" : "Pendiente"}
                                  </span>
                                ) : (
                                  <span style={{ fontSize: 10, color: "#ccc" }}>Sin SAG</span>
                                )}
                              </TD>
                              <TD right><span style={{ color: "#555" }}>{fmtDate(q.issuedAt)}</span></TD>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
            </>
          )}

          {/* Prompt to sync quotes — only shown when opportunities exist but quotes haven't
              been synced yet. When both are missing, the top syncPending banner handles it. */}
          {!quotesSummary && !syncPending && (
            <div style={{
              border: "1px solid #ddd",
              borderRadius: 6,
              padding: "14px 18px",
              background: "#f8fafc",
              fontSize: 12,
              color: "#64748b",
              fontFamily: "monospace",
              marginBottom: 16,
            }}>
              <strong>Pedidos CRM (AOS_Quotes):</strong> Ejecute una sincronización del módulo{" "}
              <code>quotes</code> en el conector <code>castillitos_crm</code> para ver el historial
              de pedidos y cotizaciones con estado SAG.
            </div>
          )}
        </>
      )}
    </div>
  );
}
