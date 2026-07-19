"use client";

/**
 * ExecutiveIntelligencePanel
 *
 * INFORMES-EJECUTIVOS-CASTILLITOS-03
 * Renders the Executive Intelligence Report within the executive dashboard.
 *
 * This component receives the pre-assembled report — it NEVER queries
 * modules, Prisma, or services directly.
 *
 * Sections:
 * 1. Executive Summary (pulse KPIs)
 * 2. Critical Alerts
 * 3. Commercial Intelligence
 * 4. Production Status
 * 5. Cartera / Receivables
 * 6. Risk Report
 * 7. Opportunity Report
 * 8. David Recommends (prioritized recommendations)
 */

import React from "react";
import { C, T, S, R } from "@/lib/ui/tokens";
import type { ExecutiveIntelligenceReport } from "@/lib/executive-intelligence";

// -- Styles ---------------------------------------------------------------

const SECTION: React.CSSProperties = {
  marginBottom: S[6],
};

const SECTION_TITLE: React.CSSProperties = {
  fontFamily: T.mono,
  fontSize: T.sz.sm,
  fontWeight: 600,
  color: C.ink,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  marginBottom: S[3],
  paddingBottom: S[1],
  borderBottom: `1px solid ${C.line}`,
};

const KPI_GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
  gap: S[3],
  marginBottom: S[4],
};

const KPI_CARD: React.CSSProperties = {
  padding: S[3],
  borderRadius: R.md,
  border: `1px solid ${C.line}`,
  background: C.surface,
};

const KPI_LABEL: React.CSSProperties = {
  fontFamily: T.mono,
  fontSize: T.sz.xs,
  color: C.inkLight,
  marginBottom: S[1],
};

const KPI_VALUE: React.CSSProperties = {
  fontFamily: T.mono,
  fontSize: T.sz.xl,
  fontWeight: 700,
  color: C.ink,
};

const ALERT_ROW: React.CSSProperties = {
  padding: S[3],
  borderRadius: R.md,
  marginBottom: S[2],
  fontFamily: T.mono,
  fontSize: T.sz.sm,
};

const REC_ROW: React.CSSProperties = {
  padding: S[3],
  borderRadius: R.md,
  border: `1px solid ${C.line}`,
  marginBottom: S[2],
  background: C.surface,
};

const TAG: React.CSSProperties = {
  fontFamily: T.mono,
  fontSize: "10px",
  padding: "2px 6px",
  borderRadius: R.sm,
  display: "inline-block",
  marginRight: S[1],
};

const TABLE: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse" as const,
  fontFamily: T.mono,
  fontSize: T.sz.sm,
};

const TH: React.CSSProperties = {
  textAlign: "left" as const,
  padding: `${S[2]} ${S[3]}`,
  borderBottom: `1px solid ${C.line}`,
  color: C.inkLight,
  fontWeight: 500,
  fontSize: T.sz.xs,
};

const TD: React.CSSProperties = {
  padding: `${S[2]} ${S[3]}`,
  borderBottom: `1px solid ${C.line}`,
  color: C.ink,
};

// -- Severity colors -------------------------------------------------------

function severityBg(s: string): string {
  switch (s) {
    case "critical": return "#fef2f2";
    case "high":     return "#fff7ed";
    case "medium":   return "#fefce8";
    case "low":      return "#f0fdf4";
    default:         return C.surface;
  }
}

function severityBorder(s: string): string {
  switch (s) {
    case "critical": return "#fca5a5";
    case "high":     return "#fdba74";
    case "medium":   return "#fde047";
    case "low":      return "#86efac";
    default:         return C.line;
  }
}

function severityColor(s: string): string {
  switch (s) {
    case "critical": return "#dc2626";
    case "high":     return "#ea580c";
    case "medium":   return "#ca8a04";
    case "low":      return "#16a34a";
    default:         return C.inkLight;
  }
}

function categoryLabel(c: string): string {
  const labels: Record<string, string> = {
    commercial: "Comercial", inventory: "Inventario", production: "Produccion",
    financial: "Finanzas", operational: "Operativo", customer: "Clientes",
    vendor: "Vendedores", supply_chain: "Cadena", compliance: "Cumplimiento",
    strategic: "Estrategia",
  };
  return labels[c] ?? c;
}

// -- Component -------------------------------------------------------------

export default function ExecutiveIntelligencePanel({
  report,
}: {
  report: ExecutiveIntelligenceReport;
}) {
  return (
    <div style={{ fontFamily: T.mono }}>

      {/* -- 1. Executive Summary / Pulse KPIs -- */}
      <section style={SECTION}>
        <div style={SECTION_TITLE}>Pulso ejecutivo</div>
        <div style={KPI_GRID}>
          {report.summaryKpis.map(k => (
            <div key={k.key} style={{
              ...KPI_CARD,
              borderColor: k.alert ? severityBorder("high") : C.line,
              background: k.alert ? severityBg("high") : C.surface,
            }}>
              <div style={KPI_LABEL}>{k.label}</div>
              <div style={KPI_VALUE}>{k.formatted}</div>
              {k.delta != null && (
                <div style={{
                  fontFamily: T.mono,
                  fontSize: T.sz.xs,
                  color: k.trend === "up" ? "#16a34a" : k.trend === "down" ? "#dc2626" : C.inkLight,
                  marginTop: S[1],
                }}>
                  {k.trend === "up" ? "+" : ""}{k.unit === "currency" ? `$${k.delta.toLocaleString()}` : k.delta}
                </div>
              )}
            </div>
          ))}
        </div>
        {report.commercial.lastOperationalDate && (
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
            Ultimo dia operativo SAG: {report.commercial.lastOperationalDate} | Confianza: {report.confidence.score}% ({report.confidence.level}) | {report.processingMs}ms
          </div>
        )}
      </section>

      {/* -- 2. Critical Alerts -- */}
      {report.criticalAlerts.length > 0 && (
        <section style={SECTION}>
          <div style={SECTION_TITLE}>Alertas criticas</div>
          {report.criticalAlerts.map(a => (
            <div key={a.id} style={{
              ...ALERT_ROW,
              background: severityBg(a.severity),
              border: `1px solid ${severityBorder(a.severity)}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[1] }}>
                <span style={{ ...TAG, background: severityBorder(a.severity), color: severityColor(a.severity) }}>
                  {a.severity.toUpperCase()}
                </span>
                <span style={{ ...TAG, background: C.line, color: C.inkLight }}>
                  {categoryLabel(a.category)}
                </span>
              </div>
              <div style={{ fontWeight: 600, color: C.ink }}>{a.title}</div>
              <div style={{ color: C.inkLight, fontSize: T.sz.xs, marginTop: S[1] }}>{a.description}</div>
            </div>
          ))}
        </section>
      )}

      {/* -- 3. Commercial Intelligence -- */}
      <section style={SECTION}>
        <div style={SECTION_TITLE}>Inteligencia comercial</div>
        <div style={KPI_GRID}>
          {report.commercial.kpis.map(k => (
            <div key={k.key} style={KPI_CARD}>
              <div style={KPI_LABEL}>{k.label}</div>
              <div style={{ ...KPI_VALUE, fontSize: T.sz.lg }}>{k.formatted}</div>
            </div>
          ))}
        </div>
        {report.commercial.vendorPerformance.length > 0 && (
          <>
            <div style={{ ...KPI_LABEL, marginBottom: S[2], marginTop: S[3] }}>Desempeno de vendedores</div>
            <div className="ag-op-table">
              <table style={TABLE}>
                <thead>
                  <tr>
                    <th style={TH}>Vendedor</th>
                    <th style={{ ...TH, textAlign: "right" }}>Ventas hoy</th>
                    <th style={{ ...TH, textAlign: "right" }}>Ventas mes</th>
                    <th style={{ ...TH, textAlign: "right" }}>Pedidos</th>
                    <th style={{ ...TH, textAlign: "right" }}>Cumplimiento</th>
                    <th style={{ ...TH, textAlign: "center" }}>Salud</th>
                  </tr>
                </thead>
                <tbody>
                  {report.commercial.vendorPerformance.map(v => (
                    <tr key={v.vendorName} className="ag-op-row">
                      <td style={TD}>{v.vendorName}</td>
                      <td style={{ ...TD, textAlign: "right" }}>${v.salesToday.toLocaleString()}</td>
                      <td style={{ ...TD, textAlign: "right" }}>${v.salesMonth.toLocaleString()}</td>
                      <td style={{ ...TD, textAlign: "right" }}>{v.ordersToday}</td>
                      <td style={{ ...TD, textAlign: "right" }}>{v.fulfillmentRate}%</td>
                      <td style={{ ...TD, textAlign: "center" }}>
                        <span style={{
                          display: "inline-block",
                          width: 8, height: 8, borderRadius: "50%",
                          background: v.health === "critical" ? "#dc2626"
                            : v.health === "warning" ? "#ea580c"
                            : v.health === "healthy" ? "#16a34a"
                            : C.inkLight,
                        }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* -- 4. Production Status -- */}
      <section style={SECTION}>
        <div style={SECTION_TITLE}>Estado de produccion</div>
        <div style={KPI_GRID}>
          {report.production.kpis.map(k => (
            <div key={k.key} style={KPI_CARD}>
              <div style={KPI_LABEL}>{k.label}</div>
              <div style={{ ...KPI_VALUE, fontSize: T.sz.lg }}>{k.formatted}</div>
            </div>
          ))}
        </div>
        {report.production.referencesInProduction.length > 0 && (
          <>
            <div style={{ ...KPI_LABEL, marginBottom: S[2], marginTop: S[3] }}>Referencias en fabricacion</div>
            <div className="ag-op-table">
              <table style={TABLE}>
                <thead>
                  <tr>
                    <th style={TH}>Referencia</th>
                    <th style={{ ...TH, textAlign: "right" }}>OPs</th>
                    <th style={{ ...TH, textAlign: "right" }}>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {report.production.referencesInProduction.map(r => (
                    <tr key={r.reference} className="ag-op-row">
                      <td style={TD}>{r.reference}</td>
                      <td style={{ ...TD, textAlign: "right" }}>{r.opCount}</td>
                      <td style={{ ...TD, textAlign: "right" }}>{r.totalQuantity.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* -- 5. Cartera / Receivables -- */}
      <section style={SECTION}>
        <div style={SECTION_TITLE}>Cartera</div>
        <div style={KPI_GRID}>
          {report.cartera.kpis.map(k => (
            <div key={k.key} style={{
              ...KPI_CARD,
              borderColor: k.alert ? severityBorder("high") : C.line,
              background: k.alert ? severityBg("high") : C.surface,
            }}>
              <div style={KPI_LABEL}>{k.label}</div>
              <div style={{ ...KPI_VALUE, fontSize: T.sz.lg }}>{k.formatted}</div>
            </div>
          ))}
        </div>
        {report.cartera.topDebtors.length > 0 && (
          <>
            <div style={{ ...KPI_LABEL, marginBottom: S[2], marginTop: S[3] }}>Principales deudores</div>
            <div className="ag-op-table">
              <table style={TABLE}>
                <thead>
                  <tr>
                    <th style={TH}>Cliente</th>
                    <th style={{ ...TH, textAlign: "right" }}>Saldo</th>
                    <th style={{ ...TH, textAlign: "right" }}>Dias vencido</th>
                  </tr>
                </thead>
                <tbody>
                  {report.cartera.topDebtors.map(d => (
                    <tr key={d.customerName} className="ag-op-row">
                      <td style={TD}>{d.customerName}</td>
                      <td style={{ ...TD, textAlign: "right" }}>${d.balanceDue.toLocaleString()}</td>
                      <td style={{ ...TD, textAlign: "right", color: d.daysOverdue > 60 ? "#dc2626" : d.daysOverdue > 30 ? "#ea580c" : C.ink }}>
                        {d.daysOverdue}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* -- 6. Risk Report -- */}
      {report.risks.length > 0 && (
        <section style={SECTION}>
          <div style={SECTION_TITLE}>Riesgos ({report.risks.length})</div>
          {report.risks.map(r => (
            <div key={r.id} style={{
              ...REC_ROW,
              borderLeft: `3px solid ${severityBorder(r.severity)}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[1] }}>
                <span style={{ ...TAG, background: severityBg(r.severity), color: severityColor(r.severity), border: `1px solid ${severityBorder(r.severity)}` }}>
                  {r.severity.toUpperCase()}
                </span>
                <span style={{ ...TAG, background: C.line, color: C.inkLight }}>
                  {categoryLabel(r.category)}
                </span>
                {r.estimatedValueAtRisk != null && (
                  <span style={{ ...TAG, background: "#fef2f2", color: "#dc2626" }}>
                    ${r.estimatedValueAtRisk.toLocaleString()} en riesgo
                  </span>
                )}
              </div>
              <div style={{ fontWeight: 600, color: C.ink, fontSize: T.sz.sm }}>{r.title}</div>
              <div style={{ color: C.inkLight, fontSize: T.sz.xs, marginTop: S[1] }}>{r.description}</div>
              <div style={{ color: C.inkLight, fontSize: "10px", marginTop: S[1], fontStyle: "italic" }}>
                Probabilidad: {r.probability}% | Impacto: {r.impact}/10
              </div>
            </div>
          ))}
        </section>
      )}

      {/* -- 7. Opportunity Report -- */}
      {report.opportunities.length > 0 && (
        <section style={SECTION}>
          <div style={SECTION_TITLE}>Oportunidades ({report.opportunities.length})</div>
          {report.opportunities.map(o => (
            <div key={o.id} style={{
              ...REC_ROW,
              borderLeft: `3px solid #86efac`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[1] }}>
                <span style={{ ...TAG, background: "#f0fdf4", color: "#16a34a", border: "1px solid #86efac" }}>
                  {categoryLabel(o.category)}
                </span>
                {o.estimatedValue != null && (
                  <span style={{ ...TAG, background: "#f0fdf4", color: "#16a34a" }}>
                    ~${o.estimatedValue.toLocaleString()}
                  </span>
                )}
                <span style={{ ...TAG, background: C.line, color: C.inkLight }}>
                  Esfuerzo: {o.effort}
                </span>
              </div>
              <div style={{ fontWeight: 600, color: C.ink, fontSize: T.sz.sm }}>{o.title}</div>
              <div style={{ color: C.inkLight, fontSize: T.sz.xs, marginTop: S[1] }}>{o.description}</div>
            </div>
          ))}
        </section>
      )}

      {/* -- 8. David Recommends -- */}
      {report.recommendations.length > 0 && (
        <section style={SECTION}>
          <div style={{
            ...SECTION_TITLE,
            color: C.blueDark,
            borderBottomColor: C.blueDark,
          }}>
            David recomienda ({report.recommendations.length})
          </div>
          {report.recommendations.map((r, i) => (
            <div key={r.id} style={{
              ...REC_ROW,
              borderLeft: `3px solid ${C.blueDark}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[1] }}>
                <span style={{
                  fontFamily: T.mono,
                  fontSize: "10px",
                  fontWeight: 700,
                  color: C.blueDark,
                  background: "#e8f0fe",
                  padding: "2px 8px",
                  borderRadius: R.sm,
                }}>
                  #{i + 1}
                </span>
                <span style={{ ...TAG, background: severityBg(r.severity), color: severityColor(r.severity), border: `1px solid ${severityBorder(r.severity)}` }}>
                  {r.severity.toUpperCase()}
                </span>
                <span style={{ ...TAG, background: C.line, color: C.inkLight }}>
                  {categoryLabel(r.category)}
                </span>
              </div>
              <div style={{ fontWeight: 600, color: C.ink, fontSize: T.sz.sm }}>{r.title}</div>
              <div style={{ color: C.inkLight, fontSize: T.sz.xs, marginTop: S[1] }}>{r.description}</div>
              <div style={{ color: C.blueDark, fontSize: T.sz.xs, marginTop: S[1], fontWeight: 500 }}>
                Beneficio esperado: {r.expectedBenefit}
              </div>
              <div style={{ color: C.inkLight, fontSize: "10px", marginTop: S[1], fontStyle: "italic" }}>
                Evidencia: {r.evidenceSummary}
              </div>
            </div>
          ))}
          <div style={{
            fontFamily: T.mono,
            fontSize: "10px",
            color: C.inkLight,
            marginTop: S[2],
            fontStyle: "italic",
          }}>
            Todas las recomendaciones son sugerencias. No se ejecutan acciones automaticas.
          </div>
        </section>
      )}
    </div>
  );
}
