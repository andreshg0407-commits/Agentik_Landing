/**
 * components/executive/cartera-risk-panel.tsx
 *
 * Executive cartera risk intelligence panel — desktop Torre de Control.
 *
 * Shows:
 *   • Risk header: ratio de mora, maxDpd, concentración, clientes 90+
 *   • Top 5 deudores table with share bars
 *   • All-clear state when no overdue balance
 *
 * Pure presentational — all data must be pre-fetched by the server page.
 */

import Link from "next/link";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import { Panel, PanelHeader, Badge } from "@/components/shell/primitives";
import type { CarteraKpis } from "@/lib/finance/cartera-kpis";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000)     return "$" + (n / 1_000_000).toFixed(0) + "M";
  return "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
}

function pct(n: number, digits = 1): string {
  return n.toFixed(digits) + "%";
}

function riskBadge(maxDpd: number, overdueRatio: number) {
  if (maxDpd > 180 || overdueRatio > 90) return <Badge variant="danger">CRÍTICO</Badge>;
  if (maxDpd > 90  || overdueRatio > 60) return <Badge variant="warning">ALTO</Badge>;
  if (maxDpd > 30  || overdueRatio > 30) return <Badge variant="warning">MEDIO</Badge>;
  return <Badge variant="success">BAJO</Badge>;
}

function dpd2Color(dpd: number): string {
  if (dpd > 180) return C.red;
  if (dpd > 90)  return C.amber;
  if (dpd > 30)  return C.amberMid;
  return C.inkLight;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CarteraRiskPanel({
  kpis,
  orgSlug,
}: {
  kpis:    CarteraKpis;
  orgSlug: string;
}) {
  if (!kpis.hasData) {
    return (
      <Panel style={{ marginBottom: S[5] }}>
        <PanelHeader
          title="💳 Inteligencia de cartera"
          icon=""
          badge={<Badge variant="neutral">SIN DATOS</Badge>}
          cta={{ label: "Ver clientes →", href: `/${orgSlug}/customer-360` }}
        />
        <div style={{ padding: `${S[4]}px ${S[5]}px`, color: C.inkFaint, fontSize: T.sz.sm }}>
          No hay datos de cartera disponibles. Sincroniza el conector SAG para activar los KPIs.
        </div>
      </Panel>
    );
  }

  const isHighRisk = kpis.overdueRatio > 30 || kpis.maxDpd > 90;
  const isHighConc = kpis.concentrationRisk > 20;

  return (
    <Panel urgent={isHighRisk} style={{ marginBottom: S[5] }}>

      {/* ── Header ── */}
      <PanelHeader
        title="💳 Inteligencia de cartera"
        urgent={isHighRisk}
        badge={riskBadge(kpis.maxDpd, kpis.overdueRatio)}
        cta={{ label: "Ver cartera →", href: `/${orgSlug}/customer-360?hasOverdue=true` }}
      />

      {/* ── KPI row ── */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr 1fr 1fr 1fr",
        borderBottom:        `1px solid ${isHighRisk ? C.redBorder : C.lineSubtle}`,
      }}>
        {[
          {
            label:  "Saldo total abierto",
            value:  fmtCOP(kpis.totalReceivable),
            sub:    `${kpis.activeDebtors} deudores activos`,
            dot:    C.inkLight,
          },
          {
            label:  "Cartera vencida",
            value:  fmtCOP(kpis.overdueReceivable),
            sub:    `${pct(kpis.overdueRatio)} del total`,
            dot:    kpis.overdueReceivable > 0 ? C.red : C.green,
          },
          {
            label:  "DPD máximo",
            value:  kpis.maxDpd > 0 ? `${kpis.maxDpd}d` : "—",
            sub:    kpis.count90Plus > 0 ? `${kpis.count90Plus} clientes +90d` : "sin mora crítica",
            dot:    dpd2Color(kpis.maxDpd),
          },
          {
            label:  "Concentración",
            value:  kpis.topDebtor ? pct(kpis.concentrationRisk, 0) : "—",
            sub:    kpis.topDebtor
              ? kpis.topDebtor.name.slice(0, 22) + (kpis.topDebtor.name.length > 22 ? "…" : "")
              : "sin deudores",
            dot:    isHighConc ? C.amber : C.green,
          },
        ].map((item, idx) => (
          <div key={idx} style={{
            padding:     `${S[3]}px ${S[4]}px`,
            borderRight: idx < 3 ? `1px solid ${C.lineSubtle}` : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: item.dot, flexShrink: 0 }} />
              <span style={{ fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.inkMid, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {item.label}
              </span>
            </div>
            <div style={{ fontSize: T.sz["2xl"] + 2, fontWeight: T.wt.black, color: C.ink, letterSpacing: "-0.01em", lineHeight: 1.1 }}>
              {item.value}
            </div>
            <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: 3 }}>
              {item.sub}
            </div>
          </div>
        ))}
      </div>

      {/* ── Top 5 deudores ── */}
      {kpis.top5Debtors.length > 0 && (
        <div>
          <div style={{
            padding:      `${S[2]}px ${S[4]}px`,
            borderBottom: `1px solid ${C.lineSubtle}`,
            fontSize:     T.sz.xs,
            fontWeight:   T.wt.bold,
            color:        C.inkFaint,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            background:   C.surfaceAlt,
          }}>
            Top deudores por cartera vencida
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "monospace", fontSize: T.sz.sm }}>
              <thead>
                <tr style={{ background: C.surface }}>
                  {["Cliente", "Vencido", "Total abierto", "DPD Máx", "Concentración"].map(h => (
                    <th key={h} style={{
                      padding:   `${S[2]}px ${S[3]}px`,
                      textAlign: h === "Cliente" ? "left" : "right",
                      fontSize:  T.sz.xs, fontWeight: T.wt.bold, color: C.inkLight,
                      textTransform: "uppercase", letterSpacing: "0.05em",
                      borderBottom: `1px solid ${C.lineSubtle}`,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {kpis.top5Debtors.map((d, i) => (
                  <tr key={d.slug} style={{ background: i % 2 === 0 ? C.white : C.surface }}>
                    {/* Name */}
                    <td style={{ padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}` }}>
                      <Link href={`/${orgSlug}/customer-360?slug=${d.slug}`} style={{ textDecoration: "none" }}>
                        <span style={{ fontWeight: T.wt.semibold, color: C.brand }}>
                          {d.name.length > 36 ? d.name.slice(0, 36) + "…" : d.name}
                        </span>
                      </Link>
                    </td>
                    {/* Vencido */}
                    <td style={{ padding: `${S[2]}px ${S[3]}px`, textAlign: "right", borderBottom: `1px solid ${C.lineSubtle}` }}>
                      <span style={{ fontWeight: T.wt.bold, color: C.red }}>{fmtCOP(d.overdueReceivable)}</span>
                    </td>
                    {/* Total abierto */}
                    <td style={{ padding: `${S[2]}px ${S[3]}px`, textAlign: "right", borderBottom: `1px solid ${C.lineSubtle}` }}>
                      <span style={{ color: C.inkMid }}>{fmtCOP(d.totalReceivable)}</span>
                    </td>
                    {/* DPD */}
                    <td style={{ padding: `${S[2]}px ${S[3]}px`, textAlign: "right", borderBottom: `1px solid ${C.lineSubtle}` }}>
                      <span style={{ fontWeight: T.wt.bold, color: dpd2Color(d.maxDpd) }}>
                        {d.maxDpd > 0 ? `+${d.maxDpd}d` : "—"}
                      </span>
                    </td>
                    {/* Concentration bar */}
                    <td style={{ padding: `${S[2]}px ${S[3]}px`, textAlign: "right", borderBottom: `1px solid ${C.lineSubtle}` }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                          display: "inline-block",
                          height:  8,
                          width:   Math.max(2, Math.round(d.share * 1.2)),
                          background: d.share > 20 ? C.redBorder : C.amberBorder,
                          borderRadius: 2,
                        }} />
                        <span style={{ fontSize: T.sz.xs, color: C.inkMid, minWidth: 38, textAlign: "right" }}>
                          {pct(d.share, 0)}
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Concentration warning */}
          {isHighConc && (
            <div style={{
              padding:    `${S[2]}px ${S[4]}px`,
              borderTop:  `1px solid ${C.amberBorder}`,
              background: C.amberLight,
              fontSize:   T.sz.xs,
              color:      C.amberDark,
              fontWeight: T.wt.semibold,
            }}>
              ⚠ Riesgo de concentración: {kpis.topDebtor?.name} representa el{" "}
              {pct(kpis.concentrationRisk, 0)} de la cartera vencida total.
              Diversificar política de cobro.
            </div>
          )}
        </div>
      )}

    </Panel>
  );
}
