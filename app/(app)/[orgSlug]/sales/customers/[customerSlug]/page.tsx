/**
 * /[orgSlug]/sales/customers/[customerSlug]
 * Customer Command Center — enterprise single-customer intelligence dashboard.
 *
 * Sections:
 *   1. Header       — identity, badges, 4 CTA actions
 *   2. KPI Radar    — 9 metric cards
 *   3. Timeline     — merged chronological feed (CRM + SAG + XML + alerts)
 *   4. Purchase Intelligence — lines, sellers, branch, channel, trend
 *   5. Risk & Growth AI  — churn, health, next best action, AI summary
 *   6. Seller Cockpit    — assigned seller + open commitments
 *   7. Financial Reconciliation — ledger KPIs + aging buckets + receivable docs
 */

import Link                  from "next/link";
import { formatDateCol } from "@/lib/utils/formatDate";
import { requireOrgAccess }  from "@/lib/auth/org-access";
import { getLatestPeriod }   from "@/lib/sales/reports";
import { isValidPeriod, fmtPeriodo } from "@/lib/sales/period-utils";
import { loadCustomerCommandData }   from "@/lib/customer360/loader";
import type { CRMActivity_type, CRMOpportunity_type } from "@/lib/customer360/service";
import type { CommercialFact } from "@/lib/commercial-ledger/types";
import type { BusinessAlertRow } from "@/lib/sales/alert-engine";
import {
  fmtCOP, fmtN,
  TABLE, THEAD_ROW, TH, TD,
  ShareBar,
} from "../../_components";
import { LedgerStatusBadge, CommercialTimeline } from "../../_ledger-section";
import ActionButton from "../../../_action-button";

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CustomerCommandCenterPage({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string; customerSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { orgSlug, customerSlug } = await params;
  const sp                        = await searchParams;
  const { organization }          = await requireOrgAccess(orgSlug);
  const orgId                     = organization.id;

  const customerKey   = decodeURIComponent(customerSlug);
  const latest        = await getLatestPeriod(orgId);
  const currentPeriod = isValidPeriod(sp.period) ? sp.period : latest;

  const d = await loadCustomerCommandData(orgId, customerKey, currentPeriod);

  const displayName = d.profile?.name ?? d.profile?.legalName ?? customerKey;
  const nit         = d.profile?.nit  ?? (/^\d/.test(customerKey) ? customerKey : null);

  // Unified timeline events
  const timelineEvents = buildTimeline(d.timeline, d.recentActivities, d.opportunities, d.activeAlerts);

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 1100 }}>

      {/* ── Breadcrumb ── */}
      <div style={{ fontSize: 11, color: "#aaa", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        <Link href={`/${orgSlug}/sales`}          style={{ color: "#aaa", textDecoration: "none" }}>Control Comercial</Link>
        {" › "}
        <Link href={`/${orgSlug}/sales/customers?period=${currentPeriod}`} style={{ color: "#aaa", textDecoration: "none" }}>Clientes</Link>
        {" › "}
        {displayName}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 1 — HEADER IDENTITY LAYER
      ════════════════════════════════════════════════════════════════════════ */}
      <div style={{
        border: "1.5px solid #111", borderRadius: 8, padding: "18px 22px",
        marginBottom: 20, background: "#fff",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>

          {/* Identity */}
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#111", letterSpacing: "-0.02em" }}>
                {displayName}
              </h1>
              {d.profile?.status && <StatusPill status={d.profile.status} />}
              {d.profile?.segment && (
                <span style={{ fontSize: 10, background: "#eff6ff", color: "#1d4ed8", padding: "2px 7px", borderRadius: 3, fontWeight: 700 }}>
                  {d.profile.segment}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: "#555", lineHeight: 1.8 }}>
              {nit         && <span style={{ marginRight: 14 }}>NIT <b style={{ color: "#111" }}>{nit}</b></span>}
              {d.profile?.city && <span style={{ marginRight: 14 }}>📍 {d.profile.city}{d.profile.department ? `, ${d.profile.department}` : ""}</span>}
              {d.profile?.sellerName && <span style={{ marginRight: 14 }}>👤 {d.profile.sellerName}</span>}
              {d.profile?.customerType && (
                <span style={{ marginRight: 14, fontSize: 10, background: "#f5f5f5", color: "#555", padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>
                  {d.profile.customerType}
                </span>
              )}
            </div>
            {/* Risk badges row */}
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {d.profile?.healthScore != null && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                  background: healthBg(d.profile.healthScore), color: healthColor(d.profile.healthScore),
                }}>
                  ♥ Salud {d.profile.healthScore}/100
                </span>
              )}
              {d.profile?.churnRisk && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                  background: churnBg(d.profile.churnRisk), color: churnColor(d.profile.churnRisk),
                }}>
                  ⚠ Churn {d.profile.churnRisk}
                </span>
              )}
              {d.profile?.erpSyncedAt && (
                <span style={{ fontSize: 10, background: "#f0fdf4", color: "#15803d", padding: "2px 7px", borderRadius: 3, fontWeight: 600 }}>
                  SAG sync {fmtDate(d.profile.erpSyncedAt)}
                </span>
              )}
              {d.profile?.crmSyncedAt && (
                <span style={{ fontSize: 10, background: "#ede9fe", color: "#6d28d9", padding: "2px 7px", borderRadius: 3, fontWeight: 600 }}>
                  CRM sync {fmtDate(d.profile.crmSyncedAt)}
                </span>
              )}
              {d.activeAlerts.length > 0 && (
                <span style={{ fontSize: 10, background: "#fef2f2", color: "#dc2626", padding: "2px 7px", borderRadius: 3, fontWeight: 700 }}>
                  {d.activeAlerts.length} ALERTA{d.activeAlerts.length > 1 ? "S" : ""}
                </span>
              )}
            </div>
          </div>

          {/* CTA Actions */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignSelf: "center" }}>
            {[
              {
                label: "Ficha 360",
                href:  `/${orgSlug}/customer-360?slug=${encodeURIComponent(customerKey.toLowerCase().replace(/\s+/g, "-"))}`,
                style: { border: "1px solid #7c3aed", color: "#7c3aed", background: "#faf5ff" },
              },
              {
                label: "✨ Informe",
                href:  `/${orgSlug}/reports?q=${encodeURIComponent("Análisis cliente " + displayName)}`,
                style: { border: "1px solid #7c3aed", color: "#7c3aed", background: "#faf5ff" },
              },
              {
                label: "🤖 Agentik",
                href:  `/${orgSlug}/agentik?q=${encodeURIComponent(displayName)}`,
                style: { border: "1px solid #111", color: "#111", background: "#fff" },
              },
              {
                label: "Conciliación",
                href:  `/${orgSlug}/reconciliation?nit=${encodeURIComponent(nit ?? "")}`,
                style: { border: "1px solid #ddd", color: "#555", background: "#fafafa" },
              },
            ].map(a => (
              <Link key={a.href} href={a.href} style={{
                fontSize: 11, fontWeight: 700, padding: "6px 14px", borderRadius: 5,
                textDecoration: "none", ...a.style,
              }}>
                {a.label} →
              </Link>
            ))}
            {/* Agentik Action Layer entry points */}
            <ActionButton
              orgSlug={orgSlug}
              label="Cobranza"
              icon="💰"
              variant="danger"
              size="sm"
              prefill={{
                actionType:   "CREAR_ACCION_COBRANZA",
                targetType:   "customer",
                targetLabel:  displayName,
                sourceModule: "control_comercial",
                title:        `Acción de cobranza — ${displayName}`,
                priority:     "HIGH",
              }}
            />
            <ActionButton
              orgSlug={orgSlug}
              label="Tarea"
              icon="✚"
              variant="outline"
              size="sm"
              prefill={{
                actionType:   "CREAR_TAREA_COMERCIAL",
                targetType:   "customer",
                targetLabel:  displayName,
                sourceModule: "control_comercial",
                title:        `Tarea comercial — ${displayName}`,
              }}
            />
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 2 — KPI RADAR
      ════════════════════════════════════════════════════════════════════════ */}
      <SectionHeader title="KPI Radar" subtitle="Indicadores clave de este cliente" />
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))",
        gap: 10, marginBottom: 22,
      }}>
        <KpiCard label="Ventas L30D"    value={fmtCOP(d.salesL30d)}   accent={d.salesL30d > 0}  source="SAG" />
        <KpiCard label="Ventas L90D"    value={fmtCOP(d.salesL90d)}   source="SAG" />
        <KpiCard label="Ventas 12M"     value={fmtCOP(d.salesL12m)}   source="SAG" />
        <KpiCard label="LTV Total"      value={fmtCOP(d.salesAllTime)} source="SAG" />
        <KpiCard
          label="Ticket promedio"
          value={d.avgTicket != null ? fmtCOP(d.avgTicket) : "—"}
          source="SAG"
        />
        <KpiCard
          label="Períodos activos"
          value={d.purchasePeriods > 0 ? `${d.purchasePeriods} meses` : "—"}
          hint="Meses distintos con compras en los últimos 12 meses"
          source="SAG"
        />
        <KpiCard
          label="Días sin compra"
          value={d.daysSinceLastPurchase != null ? `${d.daysSinceLastPurchase}d` : "—"}
          red={d.daysSinceLastPurchase != null && d.daysSinceLastPurchase > 90}
          hint="Días desde la última compra registrada"
        />
        <KpiCard
          label="Opps abiertas"
          value={fmtN(d.openOpportunities)}
          source="CRM"
          accent={d.openOpportunities > 0}
        />
        <KpiCard
          label="Cotizaciones"
          value={fmtN(d.openQuotes)}
          source="CRM"
          hint="Cotizaciones en estado OPEN, DRAFT o PENDING"
        />
        {d.ledger && (
          <KpiCard
            label="Cartera vencida"
            value={fmtCOP(d.ledger.totalOverdue)}
            red={(d.ledger.totalOverdue ?? 0) > 0}
            source="SAG"
            hint="Saldo vencido según cartera SAG"
          />
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 3 — UNIFIED ACTIVITY TIMELINE
      ════════════════════════════════════════════════════════════════════════ */}
      <SectionHeader title="Timeline Comercial" subtitle="Actividad unificada: CRM · SAG · XML · Alertas" />
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, marginBottom: 22, overflow: "hidden" }}>
        {timelineEvents.length === 0 ? (
          <div style={{ padding: "24px 18px", fontSize: 12, color: "#aaa", textAlign: "center" }}>
            Sin actividad registrada para este cliente.
          </div>
        ) : (
          <div>
            {timelineEvents.slice(0, 30).map((ev, i) => (
              <div key={ev.id} style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "10px 16px",
                borderBottom: i < timelineEvents.length - 1 ? "1px solid #f5f5f5" : undefined,
                background: i % 2 === 0 ? "#fff" : "#fafafa",
              }}>
                <div style={{ width: 90, flexShrink: 0, fontSize: 10, color: "#888", paddingTop: 2 }}>
                  {ev.date ? fmtDate(ev.date) : "—"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <SourceTag source={ev.source} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>{ev.label}</span>
                    {ev.amount != null && (
                      <span style={{ fontSize: 11, color: "#555", marginLeft: "auto" }}>
                        {fmtCOP(ev.amount)}
                      </span>
                    )}
                  </div>
                  {ev.detail && (
                    <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{ev.detail}</div>
                  )}
                </div>
                {ev.statusLabel && (
                  <div style={{ flexShrink: 0 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 3,
                      background: ev.statusBg ?? "#f5f5f5", color: ev.statusColor ?? "#555",
                    }}>
                      {ev.statusLabel}
                    </span>
                  </div>
                )}
              </div>
            ))}
            {timelineEvents.length > 30 && (
              <div style={{ padding: "8px 16px", fontSize: 11, color: "#888", textAlign: "center", background: "#f9fafb" }}>
                {timelineEvents.length - 30} eventos adicionales · Descarga el informe completo
              </div>
            )}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 4 — PURCHASE INTELLIGENCE
      ════════════════════════════════════════════════════════════════════════ */}
      <SectionHeader title="Inteligencia de Compra" subtitle="Patrones de comportamiento comercial (histórico total)" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16, marginBottom: 22 }}>

        {/* Top product lines */}
        <div style={CARD_STYLE}>
          <CardTitle>Líneas de producto</CardTitle>
          {d.topLines.length === 0 ? <EmptyMsg /> : (
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>Línea</TH>
                  <TH right>Compras</TH>
                  <TH right>%</TH>
                </tr>
              </thead>
              <tbody>
                {d.topLines.slice(0, 8).map((l, i) => (
                  <tr key={l.productLine} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <TD bold>
                      <Link href={`/${orgSlug}/sales/lines/${encodeURIComponent(l.productLine)}?period=${currentPeriod}`}
                        style={{ color: "inherit", textDecoration: "none" }}>
                        {l.productLine}
                      </Link>
                    </TD>
                    <TD right>{fmtCOP(l.amount)}</TD>
                    <TD right><ShareBar share={l.share} /></TD>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Top sellers */}
        <div style={CARD_STYLE}>
          <CardTitle>Vendedores</CardTitle>
          {d.topSellers.length === 0 ? <EmptyMsg /> : (
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>Vendedor</TH>
                  <TH right>Ventas</TH>
                  <TH right>%</TH>
                </tr>
              </thead>
              <tbody>
                {d.topSellers.map((s, i) => (
                  <tr key={s.sellerSlug} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <TD bold>
                      <Link href={`/${orgSlug}/sales/vendors/${s.sellerSlug}?period=${currentPeriod}`}
                        style={{ color: "inherit", textDecoration: "none" }}>
                        {s.sellerName}
                      </Link>
                    </TD>
                    <TD right>{fmtCOP(s.amount)}</TD>
                    <TD right><ShareBar share={s.share} /></TD>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Preferences: branch, channel */}
        <div style={CARD_STYLE}>
          <CardTitle>Preferencias de compra</CardTitle>
          <div style={{ display: "grid", gap: 10 }}>
            <PreferenceRow label="Sucursal preferida" value={d.topBranch ? `${d.topBranch.storeName} (${fmtCOP(d.topBranch.amount)})` : "—"} />
            <PreferenceRow label="Canal preferido"   value={d.preferredChannel ?? "—"} />
            <PreferenceRow label="Períodos activos"  value={d.purchasePeriods > 0 ? `${d.purchasePeriods} meses en L12M` : "—"} />
            <PreferenceRow
              label="Última compra"
              value={d.profile?.lastPurchaseAt
                ? `${fmtDate(d.profile.lastPurchaseAt)}${d.daysSinceLastPurchase != null ? ` (${d.daysSinceLastPurchase}d)` : ""}`
                : "—"}
            />
          </div>
        </div>

        {/* Monthly trend — L12M */}
        {d.monthlyTrend.length > 0 && (
          <div style={CARD_STYLE}>
            <CardTitle>Tendencia mensual (L12M)</CardTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
              {d.monthlyTrend.map(t => {
                const max = Math.max(...d.monthlyTrend.map(x => x.amount));
                const pct = max > 0 ? Math.round((t.amount / max) * 100) : 0;
                return (
                  <div key={t.period} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, width: 50, flexShrink: 0, color: "#888" }}>
                      {fmtPeriodo(t.period)}
                    </span>
                    <div style={{ flex: 1, background: "#f5f5f5", borderRadius: 2, height: 10, position: "relative" }}>
                      <div style={{
                        position: "absolute", left: 0, top: 0, height: "100%",
                        width: `${pct}%`, background: "#111", borderRadius: 2,
                      }} />
                    </div>
                    <span style={{ fontSize: 10, width: 80, textAlign: "right", flexShrink: 0, color: "#555" }}>
                      {fmtCOP(t.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 5 — RISK + GROWTH AI
      ════════════════════════════════════════════════════════════════════════ */}
      {d.aiInsight && (
        <>
          <SectionHeader
            title="Riesgo y Oportunidades · IA"
            subtitle="Scoring automático · Agentik Enterprise"
            badge="IA"
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginBottom: 22 }}>

            {d.aiInsight.healthScore != null && (
              <AiCard
                icon="♥"
                title="Score de salud"
                bg={healthBg(d.aiInsight.healthScore)}
                color={healthColor(d.aiInsight.healthScore)}
              >
                <div style={{ fontSize: 28, fontWeight: 900 }}>{d.aiInsight.healthScore}<span style={{ fontSize: 14, fontWeight: 400 }}>/100</span></div>
                <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>
                  {d.aiInsight.healthScore >= 70 ? "Cliente activo y saludable" : d.aiInsight.healthScore >= 40 ? "Requiere atención" : "Riesgo elevado"}
                </div>
              </AiCard>
            )}

            {d.aiInsight.riskScore != null && (
              <AiCard
                icon="⚡"
                title="Score de riesgo"
                bg={riskBg(d.aiInsight.riskScore)}
                color={riskColor(d.aiInsight.riskScore)}
              >
                <div style={{ fontSize: 28, fontWeight: 900 }}>{d.aiInsight.riskScore}<span style={{ fontSize: 14, fontWeight: 400 }}>/100</span></div>
                <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>
                  {d.aiInsight.riskScore <= 30 ? "Riesgo bajo" : d.aiInsight.riskScore <= 60 ? "Riesgo moderado" : "Riesgo alto"}
                </div>
              </AiCard>
            )}

            {d.aiInsight.churnRisk && (
              <AiCard
                icon="⚠"
                title="Riesgo de churn"
                bg={churnBg(d.aiInsight.churnRisk)}
                color={churnColor(d.aiInsight.churnRisk)}
              >
                <div style={{ fontSize: 20, fontWeight: 800 }}>{d.aiInsight.churnRisk}</div>
                <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>
                  Probabilidad de abandono según modelo IA
                </div>
              </AiCard>
            )}

            {d.aiInsight.nextBestAction && (
              <AiCard icon="🎯" title="Próxima mejor acción" bg="#f0fdf4" color="#065f46">
                <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>
                  {d.aiInsight.nextBestAction}
                </div>
              </AiCard>
            )}

            {d.aiInsight.aiSummary && (
              <AiCard icon="🤖" title="Resumen Agentik" bg="#faf5ff" color="#6d28d9" wide>
                <div style={{ fontSize: 12, lineHeight: 1.6, color: "#374151" }}>
                  {d.aiInsight.aiSummary}
                </div>
              </AiCard>
            )}
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 6 — SELLER COCKPIT
      ════════════════════════════════════════════════════════════════════════ */}
      {(d.profile?.sellerSlug || d.opportunities.length > 0 || d.recentActivities.length > 0) && (
        <>
          <SectionHeader title="Cockpit del Vendedor" subtitle="Responsable · Pipeline · Compromisos abiertos" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, marginBottom: 22 }}>

            {/* Assigned seller */}
            {d.profile?.sellerName && (
              <div style={CARD_STYLE}>
                <CardTitle>Vendedor asignado</CardTitle>
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>{d.profile.sellerName}</div>
                  {d.profile.sellerSlug && (
                    <Link href={`/${orgSlug}/sales/vendors/${d.profile.sellerSlug}?period=${currentPeriod}`}
                      style={{ fontSize: 11, color: "#7c3aed", textDecoration: "none" }}>
                      Ver rendimiento del vendedor →
                    </Link>
                  )}
                  <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
                    <PreferenceRow label="Ventas L12M con este cliente" value={fmtCOP(d.salesL12m)} />
                    <PreferenceRow label="Ticket promedio" value={d.avgTicket != null ? fmtCOP(d.avgTicket) : "—"} />
                  </div>
                </div>
              </div>
            )}

            {/* Open opportunities */}
            {d.opportunities.length > 0 && (
              <div style={CARD_STYLE}>
                <CardTitle>Oportunidades CRM</CardTitle>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {d.opportunities.slice(0, 5).map(opp => (
                    <div key={opp.id} style={{
                      padding: "8px 10px", borderRadius: 5, border: "1px solid #e5e7eb",
                      background: opp.status === "OPEN" ? "#fffbeb" : "#fafafa",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#111" }}>{opp.title}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: opp.status === "OPEN" ? "#b45309" : "#555" }}>
                          {opp.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>
                        {fmtCOP(opp.amount)} · {opp.stage}
                        {opp.expectedCloseAt && ` · cierre ${fmtDate(opp.expectedCloseAt)}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent CRM activities */}
            {d.recentActivities.length > 0 && (
              <div style={CARD_STYLE}>
                <CardTitle>Actividades recientes CRM</CardTitle>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {d.recentActivities.slice(0, 5).map(act => (
                    <div key={act.id} style={{
                      padding: "7px 10px", borderRadius: 4, border: "1px solid #f5f5f5",
                      fontSize: 11,
                    }}>
                      <div style={{ fontWeight: 600, color: "#111" }}>
                        <span style={{ fontSize: 9, background: "#ede9fe", color: "#6d28d9", padding: "1px 5px", borderRadius: 3, marginRight: 5, fontWeight: 700 }}>
                          {act.type}
                        </span>
                        {act.subject ?? "(sin asunto)"}
                      </div>
                      <div style={{ color: "#888", marginTop: 2 }}>
                        {fmtDate(act.occurredAt)}
                        {act.sellerName && ` · ${act.sellerName}`}
                        {act.outcome && ` · ${act.outcome}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 7 — FINANCIAL RECONCILIATION
      ════════════════════════════════════════════════════════════════════════ */}
      {d.ledger && (
        <>
          <SectionHeader title="Reconciliación Financiera" subtitle="CRM · SAG · XML · Cartera" />

          {/* KPI summary bar */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 10, marginBottom: 16,
          }}>
            {([
              { label: "Cotizado CRM",    val: fmtCOP(d.ledger.totalQuoteAmount ?? 0), source: "CRM" },
              { label: "Facturado SAG",   val: fmtCOP(d.ledger.totalInvoiced ?? 0),    source: "SAG" },
              { label: "Cobrado",         val: fmtCOP(d.ledger.totalCollected ?? 0),   source: "XML" },
              { label: "Saldo pendiente", val: fmtCOP(d.ledger.totalOutstanding ?? 0), red: (d.ledger.totalOutstanding ?? 0) > 0 },
              { label: "Vencido",         val: fmtCOP(d.ledger.totalOverdue ?? 0),     red: (d.ledger.totalOverdue ?? 0) > 0 },
              {
                label: "Tasa de recaudo",
                val: d.ledger.collectionRate != null ? `${d.ledger.collectionRate.toFixed(1)} %` : "—",
              },
            ] as Array<{ label: string; val: string; red?: boolean; source?: string }>).map(({ label, val, red, source }) => (
              <div key={label} style={{
                border: `1px solid ${red ? "#fee2e2" : "#e5e7eb"}`,
                borderRadius: 6, padding: "10px 14px", background: red ? "#fff5f5" : "#fff",
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                  {label}
                  {source && (
                    <span style={{ marginLeft: 4, fontSize: 9, background: "#f5f5f5", color: "#555", padding: "0 4px", borderRadius: 2, fontWeight: 700 }}>
                      {source}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: red ? "#dc2626" : "#111" }}>{val}</div>
              </div>
            ))}
          </div>

          {/* CRM pipeline status */}
          {(d.ledger.pendingToSag > 0 || d.ledger.notInvoiced > 0) && (
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              {d.ledger.pendingToSag > 0 && (
                <PipelineChip
                  count={d.ledger.pendingToSag}
                  label="cotizaciones pendientes de pasar a SAG"
                  bg="#fef9c3" color="#92400e"
                />
              )}
              {d.ledger.notInvoiced > 0 && (
                <PipelineChip
                  count={d.ledger.notInvoiced}
                  label="en SAG sin facturar"
                  bg="#dbeafe" color="#1d4ed8"
                />
              )}
            </div>
          )}

          {/* Aging buckets */}
          {d.receivables && d.receivables.byBucket.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Antigüedad de cartera
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {d.receivables.byBucket.map(b => (
                  <div key={b.bucket} style={{
                    border: "1px solid #e5e7eb", borderRadius: 5, padding: "8px 14px",
                    background: b.bucket === "OVERDUE_90+" ? "#fef2f2" : b.bucket === "OVERDUE_30" ? "#fffbeb" : "#fff",
                  }}>
                    <div style={{ fontSize: 10, color: "#888", fontWeight: 700, marginBottom: 3 }}>{b.bucket}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{fmtCOP(b.amount)}</div>
                    <div style={{ fontSize: 10, color: "#aaa" }}>{b.count} doc{b.count !== 1 ? "s" : ""}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unified commercial timeline (CommercialFact rows) */}
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden" }}>
            <div style={{
              padding: "9px 14px", borderBottom: "1px solid #e5e7eb",
              background: "#f9fafb", fontSize: 11, fontWeight: 700, color: "#555",
              textTransform: "uppercase", letterSpacing: "0.04em",
            }}>
              Documentos comerciales · CRM · SAG · XML
            </div>
            <CommercialTimeline facts={d.timeline} limit={20} />
          </div>
        </>
      )}

      {/* ── Footer ── */}
      <div style={{ fontSize: 10, color: "#ccc", textAlign: "right", paddingTop: 24, paddingBottom: 8 }}>
        Customer Command Center · {organization.name} · {displayName} · Período: {fmtPeriodo(currentPeriod)}
      </div>
    </div>
  );
}

// ── Timeline builder ───────────────────────────────────────────────────────────

interface TimelineEvent {
  id:          string;
  date:        Date | null;
  source:      string;
  label:       string;
  detail?:     string;
  amount?:     number | null;
  statusLabel?: string;
  statusBg?:   string;
  statusColor?: string;
}

function buildTimeline(
  facts:       CommercialFact[],
  activities:  CRMActivity_type[],
  opps:        CRMOpportunity_type[],
  alerts:      BusinessAlertRow[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const f of facts) {
    const sourceLabel = f.sourceType === "crm_quote" ? "CRM" : f.sourceType === "sag_invoice" ? "SAG" : "XML";
    const label = f.sourceType === "crm_quote"
      ? `Cotización ${f.documentNumber ?? f.sourceId.slice(-6)}`
      : f.sourceType === "sag_invoice"
      ? `Factura ${f.documentNumber ?? f.sourceId.slice(-6)}`
      : `Pago XML ${f.documentNumber ?? f.sourceId.slice(-6)}`;

    const statusMeta = LEDGER_STATUS_META[f.ledgerStatus];
    events.push({
      id:          `fact-${f.id}`,
      date:        f.issuedAt ?? f.paidAt,
      source:      sourceLabel,
      label,
      amount:      f.grossAmount,
      detail:      f.sellerName ?? f.branch ?? undefined,
      statusLabel: statusMeta?.label,
      statusBg:    statusMeta?.bg,
      statusColor: statusMeta?.color,
    });
  }

  for (const act of activities) {
    events.push({
      id:     `act-${act.id}`,
      date:   act.occurredAt,
      source: "CRM",
      label:  `${act.type}: ${act.subject ?? "(sin asunto)"}`,
      detail: act.sellerName ?? undefined,
    });
  }

  for (const opp of opps) {
    events.push({
      id:          `opp-${opp.id}`,
      date:        opp.closedAt ?? opp.openedAt,
      source:      "CRM",
      label:       `Oportunidad: ${opp.title}`,
      amount:      opp.amount,
      detail:      opp.stage,
      statusLabel: opp.status,
      statusBg:    opp.status === "OPEN" ? "#fef9c3" : "#f5f5f5",
      statusColor: opp.status === "OPEN" ? "#92400e" : "#555",
    });
  }

  for (const a of alerts) {
    events.push({
      id:          `alert-${a.id}`,
      date:        null,
      source:      "ALERT",
      label:       `Alerta: ${a.type}`,
      detail:      a.message ?? undefined,
      statusLabel: a.severity,
      statusBg:    a.severity === "CRITICAL" ? "#fee2e2" : "#fffbeb",
      statusColor: a.severity === "CRITICAL" ? "#dc2626" : "#92400e",
    });
  }

  // Sort: most recent first; null dates at the end
  events.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.getTime() - a.date.getTime();
  });

  return events;
}

// ── Ledger status meta ─────────────────────────────────────────────────────────

const LEDGER_STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  pending_sag:   { label: "Pendiente SAG", bg: "#fef9c3", color: "#92400e" },
  synced_sag:    { label: "En SAG",        bg: "#dbeafe", color: "#1d4ed8" },
  invoiced:      { label: "Facturado",     bg: "#d1fae5", color: "#065f46" },
  current:       { label: "Vigente",       bg: "#f0fdf4", color: "#15803d" },
  partial:       { label: "Pago parcial",  bg: "#fef3c7", color: "#d97706" },
  overdue:       { label: "Vencido",       bg: "#fee2e2", color: "#dc2626" },
  paid:          { label: "Cobrado",       bg: "#d1fae5", color: "#065f46" },
  written_off:   { label: "Castigado",     bg: "#f5f5f5", color: "#6b7280" },
  collected_xml: { label: "Cobrado XML",   bg: "#ede9fe", color: "#6d28d9" },
};

// ── Shared UI helpers ──────────────────────────────────────────────────────────

import type { CSSProperties, ReactNode } from "react";

const CARD_STYLE: CSSProperties = {
  border: "1px solid #e5e7eb", borderRadius: 6, padding: "14px 16px",
  background: "#fff", overflow: "hidden",
};

function SectionHeader({ title, subtitle, badge }: { title: string; subtitle?: string; badge?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#111", letterSpacing: "-0.01em" }}>
        {title}
      </h2>
      {badge && (
        <span style={{ fontSize: 9, background: "#ede9fe", color: "#6d28d9", padding: "2px 6px", borderRadius: 3, fontWeight: 800, letterSpacing: "0.04em" }}>
          {badge}
        </span>
      )}
      {subtitle && (
        <span style={{ fontSize: 11, color: "#aaa", marginLeft: 4 }}>{subtitle}</span>
      )}
      <div style={{ flex: 1, borderBottom: "1px solid #eee", marginLeft: 6 }} />
    </div>
  );
}

function CardTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8, borderBottom: "1px solid #f5f5f5", paddingBottom: 6 }}>
      {children}
    </div>
  );
}

function KpiCard({ label, value, accent, red, source, hint }: {
  label: string; value: string; accent?: boolean; red?: boolean;
  source?: string; hint?: string;
}) {
  return (
    <div style={{
      border: `1px solid ${accent ? "#111" : red ? "#fee2e2" : "#e5e7eb"}`,
      borderRadius: 6, padding: "10px 14px", background: red ? "#fff5f5" : "#fff",
    }}
      title={hint}
    >
      <div style={{ fontSize: 9, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        {source && (
          <span style={{ fontSize: 8, background: "#f5f5f5", color: "#555", padding: "0 4px", borderRadius: 2, fontWeight: 700 }}>
            {source}
          </span>
        )}
      </div>
      <div style={{ fontSize: 16, fontWeight: 900, color: red ? "#dc2626" : accent ? "#111" : "#374151" }}>
        {value}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const active = status === "ACTIVE" || status === "active";
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 3,
      background: active ? "#d1fae5" : "#f5f5f5",
      color: active ? "#065f46" : "#555",
      letterSpacing: "0.04em",
    }}>
      {status}
    </span>
  );
}

function SourceTag({ source }: { source: string }) {
  const COLORS: Record<string, { bg: string; color: string }> = {
    CRM:   { bg: "#ede9fe", color: "#6d28d9" },
    SAG:   { bg: "#fff7ed", color: "#c2410c" },
    XML:   { bg: "#f0fdf4", color: "#15803d" },
    ALERT: { bg: "#fee2e2", color: "#dc2626" },
  };
  const c = COLORS[source] ?? { bg: "#f5f5f5", color: "#555" };
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
      background: c.bg, color: c.color, letterSpacing: "0.04em", whiteSpace: "nowrap",
      flexShrink: 0,
    }}>
      {source}
    </span>
  );
}

function PreferenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, borderBottom: "1px solid #f5f5f5", paddingBottom: 5 }}>
      <span style={{ color: "#888" }}>{label}</span>
      <span style={{ fontWeight: 600, color: "#111" }}>{value}</span>
    </div>
  );
}

function AiCard({ icon, title, bg, color, children, wide }: {
  icon: string; title: string; bg: string; color: string; children: ReactNode; wide?: boolean;
}) {
  return (
    <div style={{
      border: `1px solid ${bg}`, borderRadius: 6, padding: "14px 16px",
      background: bg, gridColumn: wide ? "1 / -1" : undefined,
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

function PipelineChip({ count, label, bg, color }: { count: number; label: string; bg: string; color: string }) {
  return (
    <span style={{
      fontSize: 11, padding: "4px 12px", borderRadius: 4, background: bg, color,
      fontWeight: 700, display: "inline-flex", gap: 5, alignItems: "center",
    }}>
      <span style={{ fontSize: 13, fontWeight: 900 }}>{count}</span> {label}
    </span>
  );
}

function EmptyMsg() {
  return <div style={{ fontSize: 11, color: "#aaa", padding: "16px 0", textAlign: "center" }}>Sin datos.</div>;
}

// ── Score color helpers ────────────────────────────────────────────────────────

function healthBg(s: number)    { return s >= 70 ? "#d1fae5" : s >= 40 ? "#fef3c7" : "#fee2e2"; }
function healthColor(s: number) { return s >= 70 ? "#065f46" : s >= 40 ? "#d97706" : "#dc2626"; }
function riskBg(s: number)      { return s <= 30 ? "#d1fae5" : s <= 60 ? "#fef3c7" : "#fee2e2"; }
function riskColor(s: number)   { return s <= 30 ? "#065f46" : s <= 60 ? "#d97706" : "#dc2626"; }
function churnBg(r: string)     { return r === "HIGH" ? "#fee2e2" : r === "MEDIUM" ? "#fef3c7" : "#d1fae5"; }
function churnColor(r: string)  { return r === "HIGH" ? "#dc2626" : r === "MEDIUM" ? "#d97706" : "#065f46"; }

// ── Date formatter ─────────────────────────────────────────────────────────────

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return formatDateCol(dt);
}
