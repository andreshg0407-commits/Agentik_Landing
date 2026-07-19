/**
 * app/(app)/[orgSlug]/collections/performance/page.tsx
 *
 * Collections Performance Dashboard.
 *
 * KPIs derived from completed CREAR_ACCION_COBRANZA ActionTasks.
 * Shows: recovery metrics, outcome distribution, collector leaderboard,
 * channel stats, and weekly trend.
 *
 * Server component — all data pre-fetched.
 */

import Link                         from "next/link";
import { requireOrgAccess }         from "@/lib/auth/org-access";
import {
  getCollectionsPerformance,
  getRecoveryTimeline,
}                                   from "@/lib/collections/performance";
import { getCarteraKpis }           from "@/lib/finance/cartera-kpis";
import { C, T, S, R }               from "@/lib/ui/tokens";
import { Panel, PanelHeader, Badge, KpiCard } from "@/components/shell/primitives";
import { OUTCOME_LABELS, OUTCOME_ICONS } from "@/lib/collections/outcomes";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000)     return "$" + (n / 1_000_000).toFixed(0) + "M";
  if (n >= 1_000)         return "$" + (n / 1_000).toFixed(0) + "K";
  return "$" + n;
}

function pct(n: number, digits = 0): string {
  return n.toFixed(digits) + "%";
}

function bar(count: number, total: number, color: string, maxPx = 120): string {
  const width = total > 0 ? Math.max(2, Math.round((count / total) * maxPx)) : 2;
  return `<div style="display:inline-block;height:8px;width:${width}px;background:${color};borderRadius:2px"></div>`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CollectionsPerformancePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }      = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId            = organization.id;

  const [kpis, perf, timeline] = await Promise.all([
    getCarteraKpis(orgId).catch(() => null),
    getCollectionsPerformance(orgId, 30).catch(() => null),
    getRecoveryTimeline(orgId, 8).catch(() => []),
  ]);

  const totalContacted = perf ? perf.paidCount + perf.promiseCount + perf.noContactCount + perf.brokenPromiseCount + perf.disputeCount : 0;
  const contactRate    = perf && perf.totalTasksCreated > 0
    ? Math.round(((perf.totalTasksCreated - perf.noContactCount) / perf.totalTasksCreated) * 100)
    : 0;

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 1100 }}>

      {/* ── Breadcrumb ── */}
      <div style={{ fontSize: T.sz.sm, color: C.inkFaint, marginBottom: S[1] + 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        <Link href={`/${orgSlug}/dashboard`} style={{ color: C.inkFaint, textDecoration: "none" }}>
          {organization.name}
        </Link>
        {" "} ›{" "}
        <Link href={`/${orgSlug}/collections`} style={{ color: C.inkFaint, textDecoration: "none" }}>
          Cola de Cobranza
        </Link>
        {" "} › Rendimiento
      </div>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24, paddingBottom: 16, borderBottom: `1.5px solid ${C.ink}` }}>
        <div>
          <h1 style={{ margin: 0, fontSize: T.sz["3xl"], fontWeight: T.wt.black, color: C.ink, letterSpacing: "-0.02em" }}>
            Rendimiento de Cobranza
          </h1>
          <div style={{ fontSize: T.sz.sm, color: C.inkLight, marginTop: 3 }}>
            {organization.name} · Últimos 30 días
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: S[2] }}>
          <Link href={`/${orgSlug}/collections`} style={{
            fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.brand,
            textDecoration: "none", padding: "4px 12px",
            border: `1px solid ${C.brand}`, borderRadius: R.sm,
          }}>
            ← Cola de cobranza
          </Link>
        </div>
      </div>

      {/* ── No data state ── */}
      {!perf || perf.totalTasksCreated === 0 ? (
        <Panel>
          <div style={{ padding: `${S[6]}px ${S[5]}px`, textAlign: "center", color: C.inkFaint }}>
            <div style={{ fontSize: 28, marginBottom: S[2] }}>📊</div>
            <div style={{ fontWeight: T.wt.bold, fontSize: T.sz.lg, color: C.inkLight }}>
              Sin datos de cobranza
            </div>
            <div style={{ fontSize: T.sz.sm, marginTop: S[1] }}>
              Registra resultados en la{" "}
              <Link href={`/${orgSlug}/collections`} style={{ color: C.brand }}>Cola de Cobranza</Link>
              {" "}para ver el rendimiento aquí.
            </div>
          </div>
        </Panel>
      ) : (
        <>

          {/* ── KPI row ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: S[3], marginBottom: S[5] }}>
            <KpiCard
              label="Tareas creadas"
              sublabel="últimos 30 días"
              value={String(perf.totalTasksCreated)}
              dotColor={C.brand}
            />
            <KpiCard
              label="Completadas"
              sublabel={`${pct(perf.completionRate)} tasa`}
              value={String(perf.totalCompleted)}
              dotColor={perf.completionRate >= 50 ? C.green : C.amber}
            />
            <KpiCard
              label="Pagos confirmados"
              sublabel="PAID + parciales"
              value={String(perf.paidCount)}
              dotColor={C.green}
            />
            <KpiCard
              label="Promesas activas"
              sublabel="por verificar"
              value={String(perf.promiseCount)}
              dotColor={C.brand}
            />
            <KpiCard
              label="Recuperación estimada"
              sublabel="promesas + parciales"
              value={perf.estimatedRecovery > 0 ? fmtCOP(perf.estimatedRecovery) : "—"}
              dotColor={C.green}
            />
          </div>

          {/* ── Exposure vs Progress ── */}
          {kpis?.hasData && (
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
              gap: S[3], marginBottom: S[5],
            }}>
              <KpiCard
                label="Cartera vencida total"
                sublabel="exposición org"
                value={fmtCOP(kpis.overdueReceivable)}
                dotColor={C.red}
                urgent
              />
              <KpiCard
                label="Tasa de contacto"
                sublabel={`${perf.totalTasksCreated - perf.noContactCount} de ${perf.totalTasksCreated} contactados`}
                value={pct(contactRate)}
                dotColor={contactRate >= 60 ? C.green : C.amber}
              />
              <KpiCard
                label="Tasa de recuperación"
                sublabel="sobre cartera vencida"
                value={kpis.overdueReceivable > 0
                  ? pct((perf.estimatedRecovery / kpis.overdueReceivable) * 100, 1)
                  : "—"}
                dotColor={C.green}
              />
            </div>
          )}

          {/* ── Outcome distribution ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[4], marginBottom: S[5] }}>

            <Panel>
              <PanelHeader title="Distribución de resultados" />
              {perf.outcomeCounts.length === 0 ? (
                <div style={{ padding: `${S[3]}px ${S[4]}px`, color: C.inkFaint, fontSize: T.sz.sm }}>
                  Sin resultados registrados aún.
                </div>
              ) : (
                <div style={{ padding: `${S[3]}px ${S[4]}px` }}>
                  {perf.outcomeCounts.map(({ outcomeType, count }) => {
                    const pctVal  = totalContacted > 0 ? (count / totalContacted) * 100 : 0;
                    const dotColor =
                      outcomeType === "PAID" || outcomeType === "PARTIAL_PAYMENT" ? C.green
                      : outcomeType === "PROMISE_TO_PAY" || outcomeType === "IN_NEGOTIATION" ? C.brand
                      : outcomeType === "NO_CONTACT" ? C.inkLight
                      : C.red;
                    return (
                      <div key={outcomeType} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: S[2] }}>
                        <span style={{ fontSize: 13, width: 20, textAlign: "center", flexShrink: 0 }}>
                          {OUTCOME_ICONS[outcomeType] ?? "·"}
                        </span>
                        <span style={{ fontSize: T.sz.xs, color: C.inkMid, width: 140, flexShrink: 0 }}>
                          {OUTCOME_LABELS[outcomeType] ?? outcomeType}
                        </span>
                        <div style={{
                          height: 8,
                          width:  Math.max(2, Math.round(pctVal * 1.2)),
                          background: dotColor,
                          borderRadius: 2,
                          flexShrink: 0,
                        }} />
                        <span style={{ fontSize: T.sz.xs, color: C.inkFaint, minWidth: 50 }}>
                          {count} · {pct(pctVal)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            <Panel>
              <PanelHeader title="Resultados por canal" />
              {perf.byChannel.length === 0 ? (
                <div style={{ padding: `${S[3]}px ${S[4]}px`, color: C.inkFaint, fontSize: T.sz.sm }}>
                  Sin datos de canal.
                </div>
              ) : (
                <div style={{ padding: `${S[3]}px ${S[4]}px` }}>
                  {perf.byChannel.map(ch => {
                    const chIcon = ch.channel === "call" ? "📞" : ch.channel === "whatsapp" ? "💬" : ch.channel === "email" ? "✉️" : "🤝";
                    const convRate = ch.total > 0 ? Math.round(((ch.paid + ch.promise) / ch.total) * 100) : 0;
                    return (
                      <div key={ch.channel} style={{ marginBottom: S[3] }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                            {chIcon} {ch.channel}
                          </span>
                          <span style={{ fontSize: T.sz.xs, color: C.inkFaint }}>
                            {ch.total} contactos · {convRate}% efectividad
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 4, fontSize: T.sz.xs, color: C.inkFaint }}>
                          <span style={{ color: C.green }}>✓ {ch.paid} pagos</span>
                          <span>·</span>
                          <span style={{ color: C.brand }}>🤝 {ch.promise} promesas</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

          </div>

          {/* ── Weekly trend ── */}
          {perf.weeklyTrend.length > 0 && (
            <Panel style={{ marginBottom: S[5] }}>
              <PanelHeader title="📈 Tendencia semanal — últimas 4 semanas" />
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "monospace", fontSize: T.sz.sm }}>
                  <thead>
                    <tr style={{ background: C.surfaceAlt }}>
                      {["Semana", "Tareas creadas", "Completadas", "Pagos", "Tasa completadas"].map((h, i) => (
                        <th key={h} style={{
                          padding: `${S[2]}px ${S[3]}px`,
                          textAlign: i === 0 ? "left" : "right",
                          fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.inkLight,
                          textTransform: "uppercase", letterSpacing: "0.05em",
                          borderBottom: `1px solid ${C.lineSubtle}`,
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {perf.weeklyTrend.map((wk, i) => {
                      const rate = wk.created > 0 ? Math.round((wk.completed / wk.created) * 100) : 0;
                      return (
                        <tr key={wk.week} style={{ background: i % 2 === 0 ? C.white : C.surface }}>
                          <td style={{ padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, fontWeight: T.wt.semibold, color: C.ink }}>
                            {wk.week}
                          </td>
                          <td style={{ padding: `${S[2]}px ${S[3]}px`, textAlign: "right", borderBottom: `1px solid ${C.lineSubtle}`, color: C.inkMid }}>
                            {wk.created}
                          </td>
                          <td style={{ padding: `${S[2]}px ${S[3]}px`, textAlign: "right", borderBottom: `1px solid ${C.lineSubtle}`, color: C.inkMid }}>
                            {wk.completed}
                          </td>
                          <td style={{ padding: `${S[2]}px ${S[3]}px`, textAlign: "right", borderBottom: `1px solid ${C.lineSubtle}`, color: C.green, fontWeight: T.wt.bold }}>
                            {wk.paid}
                          </td>
                          <td style={{ padding: `${S[2]}px ${S[3]}px`, textAlign: "right", borderBottom: `1px solid ${C.lineSubtle}` }}>
                            <span style={{ color: rate >= 50 ? C.green : rate >= 25 ? C.amber : C.red, fontWeight: T.wt.bold }}>
                              {pct(rate)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {/* ── Collector leaderboard ── */}
          {perf.topCollectors.length > 0 && (
            <Panel style={{ marginBottom: S[5] }}>
              <PanelHeader title="🏆 Ranking de cobradores — top 5" badge={<Badge variant="brand">EQUIPO</Badge>} />
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "monospace", fontSize: T.sz.sm }}>
                  <thead>
                    <tr style={{ background: C.surfaceAlt }}>
                      {["#", "Cobrador", "Completadas", "Pagos", "Promesas", "% Efectividad"].map((h, i) => (
                        <th key={h} style={{
                          padding: `${S[2]}px ${S[3]}px`,
                          textAlign: i <= 1 ? "left" : "right",
                          fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.inkLight,
                          textTransform: "uppercase", letterSpacing: "0.05em",
                          borderBottom: `1px solid ${C.lineSubtle}`,
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {perf.topCollectors.map((c, i) => {
                      const eff = c.completed > 0 ? Math.round(((c.paid + c.promise) / c.completed) * 100) : 0;
                      return (
                        <tr key={c.name} style={{ background: i % 2 === 0 ? C.white : C.surface }}>
                          <td style={{ padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, color: C.inkFaint, fontSize: T.sz.xs, width: 32 }}>
                            {i + 1}
                          </td>
                          <td style={{ padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, fontWeight: T.wt.semibold, color: C.ink }}>
                            {c.name.length > 30 ? c.name.slice(0, 30) + "…" : c.name}
                          </td>
                          <td style={{ padding: `${S[2]}px ${S[3]}px`, textAlign: "right", borderBottom: `1px solid ${C.lineSubtle}`, color: C.inkMid }}>
                            {c.completed}
                          </td>
                          <td style={{ padding: `${S[2]}px ${S[3]}px`, textAlign: "right", borderBottom: `1px solid ${C.lineSubtle}`, color: C.green, fontWeight: T.wt.bold }}>
                            {c.paid}
                          </td>
                          <td style={{ padding: `${S[2]}px ${S[3]}px`, textAlign: "right", borderBottom: `1px solid ${C.lineSubtle}`, color: C.brand }}>
                            {c.promise}
                          </td>
                          <td style={{ padding: `${S[2]}px ${S[3]}px`, textAlign: "right", borderBottom: `1px solid ${C.lineSubtle}` }}>
                            <span style={{ fontWeight: T.wt.bold, color: eff >= 50 ? C.green : eff >= 25 ? C.amber : C.red }}>
                              {pct(eff)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

        </>
      )}

      {/* ── Footer ── */}
      <div style={{ fontSize: T.sz.xs, color: C.inkGhost, textAlign: "right", paddingBottom: S[4] }}>
        Rendimiento de Cobranza · {organization.name} · últimos 30 días
      </div>
    </div>
  );
}
