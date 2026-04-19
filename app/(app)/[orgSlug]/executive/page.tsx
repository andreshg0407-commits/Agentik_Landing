/**
 * Torre de Control — módulo ejecutivo.
 *
 * Propósito: dashboard de gestión para decisiones directivas.
 *   - KPIs ejecutivos comerciales (ventas, facturación, cobros)
 *   - Tendencia y crecimiento mensual (12 meses)
 *   - Mix por línea, sucursal y canal
 *   - Riesgo financiero (cartera vencida, saldo pendiente)
 *   - Pipeline CRM → SAG (forecast, cotizaciones aceptadas)
 *   - Insights de IA (enlace a Agentik e Informes Inteligentes)
 *
 * El contenido operativo del día a día vive en Centro de Operaciones
 * — /[orgSlug]/dashboard.
 */

import Link            from "next/link";
import { requireOrgAccess }    from "@/lib/auth/org-access";
import { getLatestPeriod, getRemisionKpisBySeller } from "@/lib/sales/reports";
import { getSalesAlerts }      from "@/lib/sales/alert-engine";
import {
  getSourceSplitOverview,
  getFpaRevenueForecast,
  getFpaCashFlow,
  type SourceSplitOverview,
  type CashFlowSummary,
} from "@/lib/finance/fpa-queries";
import { getCarteraKpis }     from "@/lib/finance/cartera-kpis";
import CarteraRiskPanel        from "@/components/executive/cartera-risk-panel";
import { FiscalWindowSelector } from "@/components/shell/fiscal-window-selector";
import {
  parseFiscalWindowMode,
  defaultCarteraWindow,
  getFiscalWindow,
} from "@/lib/finance/fiscal-window";
import { prisma }              from "@/lib/prisma";
import { getModuleContext }    from "@/lib/agentik/copilot-context";
import SalesDashboard          from "../sales/dashboard";
import ActionButton            from "../_action-button";
import MobileExecutiveBrief    from "@/components/executive/mobile-brief";
import MobileKpiCarousel, { type MobileKpiCard } from "@/components/executive/mobile-kpi-carousel";
import MobileSignalStrip       from "@/components/executive/mobile-signal-strip";
import MobileCriticalAlerts    from "@/components/executive/mobile-critical-alerts";
import MobileQuickActions, { type RecentActionItem } from "@/components/executive/mobile-quick-actions";
import MobileCopilotInput      from "@/components/executive/mobile-copilot-input";
import { F2Toggle }           from "@/components/executive/f2-toggle";
import { C, T, S, R, E }    from "@/lib/ui/tokens";
import { KpiCard, Panel, PanelHeader, Badge }  from "@/components/shell/primitives";

// Roles allowed to access the F2 advanced analysis panel
const ADVANCED_ROLES = new Set(["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"]);

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TorreDeControlPage({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgSlug }  = await params;
  const sp           = await searchParams;
  const windowParam  = typeof sp.window === "string" ? sp.window : undefined;
  const windowMode   = parseFiscalWindowMode(windowParam, "current_and_prior");
  const fiscalWindow = getFiscalWindow(windowMode);
  const { user, organization, membership }   = await requireOrgAccess(orgSlug);
  const orgId                                = organization.id;
  const canSeeF2                             = ADVANCED_ROLES.has(membership.role);
  const firstName                            = user.name?.split(" ")[0] ?? "Ejecutivo";

  // Dynamic period: always reflects the latest imported data
  const latestPeriod  = await getLatestPeriod(orgId);
  const trendEnd      = latestPeriod;
  const trendStart    = periodMinusMonths(latestPeriod, 11); // 12-month window

  // Critical alerts for the financial risk header
  const alertsResult = await getSalesAlerts(orgId, latestPeriod).catch(() => []);
  const criticalAlerts = alertsResult.filter(a => a.severity === "CRITICAL");

  // Source-aware KPIs: F1/F2 split for this period
  const [sourceSplit, sellerConvKpis, fpaForecast, fpaCashFlow, carteraKpis, pendingApprovals, rawRecentActions] = await Promise.all([
    getSourceSplitOverview(orgId, latestPeriod).catch(() => null),
    getRemisionKpisBySeller(orgId, latestPeriod).catch(() => []),
    getFpaRevenueForecast(orgId).catch(() => null),
    getFpaCashFlow(orgId, fiscalWindow).catch(() => null),
    getCarteraKpis(orgId, fiscalWindow).catch(() => null),
    (prisma as any).sagWriteOperation.count({
      where: { organizationId: orgId, status: "PENDING" },
    }).catch(() => 0) as Promise<number>,
    // Last 5 Agentik-triggered ActionTasks — drives mobile history log.
    // Added to Promise.all so it runs concurrently with no extra serial latency.
    prisma.actionTask.findMany({
      where:   { organizationId: orgId, sourceModule: "agentik_copilot" },
      orderBy: { createdAt: "desc" },
      take:    5,
      select:  { id: true, title: true, status: true, actionType: true, createdAt: true, payloadJson: true },
    }).catch(() => []),
  ]);

  const periodLabel = fmtPeriodo(latestPeriod);

  // Recent Agentik actions — serialised for the client component
  const recentMobileActions: RecentActionItem[] = rawRecentActions.map(a => ({
    id:           a.id,
    title:        a.title,
    status:       a.status as string,
    actionType:   a.actionType as string,
    createdAtISO: a.createdAt.toISOString(),
    payloadJson:  (a.payloadJson !== null && typeof a.payloadJson === "object" && !Array.isArray(a.payloadJson))
      ? (a.payloadJson as Record<string, unknown>)
      : null,
  }));

  // ── Mobile shell data ────────────────────────────────────────────────────────
  // All values are pre-computed here — mobile components stay purely presentational.
  // No additional queries: all data flows from the concurrent fetches above.

  const overdueAmount  = fpaCashFlow?.hasData ? fpaCashFlow.totalOverdue : 0;
  const hasOverdueData = fpaCashFlow?.hasData ?? false;

  // KPI carousel: swipeable revenue + overdue cards
  const mobileKpis: MobileKpiCard[] = [
    {
      id:       "mtd",
      label:    "Ingresos MTD",
      value:    fpaForecast?.hasData ? fmtCOP(fpaForecast.monthToDate) : "—",
      sublabel: fpaForecast?.hasData ? `día ${fpaForecast.dayOfMonth} · F1 oficial` : "sin datos",
      dotColor: "#16a34a",
    },
    {
      id:       "f1",
      label:    "F1 · Oficial",
      value:    sourceSplit ? fmtCOP(sourceSplit.f1Amount) : "—",
      sublabel: sourceSplit ? `${sourceSplit.f1SharePct.toFixed(1)}% del total` : "sin datos",
      dotColor: "#7c3aed",
    },
    {
      id:       "total",
      label:    "Total operacional",
      value:    sourceSplit ? fmtCOP(sourceSplit.totalAmount) : "—",
      sublabel: "F1 + F2",
      dotColor: "#6b7280",
    },
    {
      id:       "overdue",
      label:    "Cartera vencida",
      value:    hasOverdueData
        ? (overdueAmount > 0 ? fmtCOP(overdueAmount) : "✓ Al día")
        : "—",
      sublabel: hasOverdueData
        ? (overdueAmount > 0 ? "saldo vencido" : "sin mora")
        : "sin datos",
      dotColor: hasOverdueData && overdueAmount > 0 ? "#dc2626" : "#16a34a",
    },
    {
      id:       "maxdpd",
      label:    "DPD máximo",
      value:    carteraKpis?.hasData ? (carteraKpis.maxDpd > 0 ? `+${carteraKpis.maxDpd}d` : "—") : "—",
      sublabel: carteraKpis?.hasData && carteraKpis.count90Plus > 0
        ? `${carteraKpis.count90Plus} clientes +90d`
        : "sin mora crítica",
      dotColor: carteraKpis?.maxDpd && carteraKpis.maxDpd > 180 ? "#dc2626"
              : carteraKpis?.maxDpd && carteraKpis.maxDpd > 90  ? "#d97706"
              : "#16a34a",
    },
  ];

  // Extract a minimal, safely-typed shape for the alerts panel.
  const mobileAlerts = criticalAlerts.slice(0, 3).map(a => ({
    title:   (a as any).title   ?? (a as any).type ?? "Alerta crítica",
    message: (a as any).message as string | null ?? null,
    type:    (a as any).type    ?? "",
  }));

  // Module context for the mobile copilot input (executive module)
  const mobileModuleContext = getModuleContext(orgSlug, `/${orgSlug}/executive`);
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Responsive switching ──────────────────────────────────────────────
          .mob-exec  shown on mobile  (≤ 768 px)
          .dsk-exec  shown on desktop (≥ 769 px)
          Pure CSS — no JS, no new libraries.                                 */}
      <style>{`
        .mob-exec { display: block; }
        .dsk-exec { display: none;  }
        @media (min-width: 769px) {
          .mob-exec { display: none  !important; }
          .dsk-exec { display: block !important; }
        }
      `}</style>

      {/* ══════════════════════════════════════════════════════════════════════
          MOBILE SHELL  ≤ 768 px
          Data reused entirely from server-side fetches above. No new queries.
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="mob-exec" style={{ padding: "0 4px" }}>

        {/* 1. Hero — greeting + top 3 live risks */}
        <MobileExecutiveBrief
          orgName={organization.name}
          orgSlug={orgSlug}
          firstName={firstName}
          role={membership.role}
          periodLabel={periodLabel}
          criticalCount={criticalAlerts.length}
          totalOverdue={overdueAmount}
          pendingApprovals={pendingApprovals}
          f2SharePct={sourceSplit?.f2SharePct ?? 0}
          conversionRate={sourceSplit?.conversionRate ?? 100}
          hasSourceData={sourceSplit?.hasData ?? false}
          count90Plus={carteraKpis?.count90Plus ?? 0}
        />

        {/* 2. KPI carousel — revenue + overdue swipeable cards */}
        <MobileKpiCarousel kpis={mobileKpis} />

        {/* 3. Three critical signals — overdue | SAG | alerts */}
        <MobileSignalStrip
          orgSlug={orgSlug}
          totalOverdue={overdueAmount}
          hasOverdueData={hasOverdueData}
          pendingApprovals={pendingApprovals}
          criticalAlertCount={criticalAlerts.length}
        />

        {/* 4. Critical alerts list (top 3) */}
        <MobileCriticalAlerts alerts={mobileAlerts} orgSlug={orgSlug} />

        {/* 5. Quick execution strip + action history log */}
        <MobileQuickActions
          orgSlug={orgSlug}
          criticalCount={criticalAlerts.length}
          hasOverdue={hasOverdueData && overdueAmount > 0}
          pendingApprovals={pendingApprovals}
          recentActions={recentMobileActions}
        />

        {/* 6. Sticky Copilot command bar */}
        <MobileCopilotInput
          orgSlug={orgSlug}
          moduleContext={mobileModuleContext}
          lastActionLabel={recentMobileActions[0]?.title ?? null}
        />

      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          DESKTOP SHELL  ≥ 769 px
          Unchanged from original layout — wrapped in .dsk-exec only.
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="dsk-exec">
        <div style={{ fontFamily: "monospace", maxWidth: 1100 }}>

          {/* ── Breadcrumb ── */}
          <div style={{
            fontSize: T.sz.sm, color: C.inkFaint, marginBottom: S[1] + 2,
            textTransform: "uppercase", letterSpacing: "0.04em",
          }}>
            <Link href={`/${orgSlug}/dashboard`} style={{ color: C.inkFaint, textDecoration: "none" }}>
              {organization.name} · Centro de Operaciones
            </Link>
            {" "} › Torre de Control
          </div>

          {/* ── Header ── */}
          <div style={{
            display: "flex", alignItems: "center", gap: 14, marginBottom: 28,
            paddingBottom: 16, borderBottom: `1.5px solid ${C.ink}`,
          }}>
            <div>
              <h1 style={{ margin: 0, fontSize: T.sz["4xl"], fontWeight: T.wt.black, color: C.ink, letterSpacing: "-0.02em" }}>
                Torre de Control
              </h1>
              <div style={{ fontSize: T.sz.base, color: C.inkLight, marginTop: 3 }}>
                {organization.name} · Vista ejecutiva · Período activo:{" "}
                <b style={{ color: C.ink }}>{periodLabel}</b>
              </div>
            </div>

            <div style={{ display: "flex", gap: S[2], marginLeft: "auto", flexWrap: "wrap" }}>
              <Badge variant="dark">EJECUTIVO</Badge>
              {criticalAlerts.length > 0 && (
                <Link href={`/${orgSlug}/alerts`} style={{ textDecoration: "none" }}>
                  <Badge variant="danger">
                    ⚠ {criticalAlerts.length} ALERTA{criticalAlerts.length > 1 ? "S" : ""} CRÍTICA{criticalAlerts.length > 1 ? "S" : ""}
                  </Badge>
                </Link>
              )}
            </div>
          </div>

          {/* ── Fiscal window selector ── */}
          <div style={{ marginBottom: S[4] }}>
            <FiscalWindowSelector
              currentMode={windowMode}
              baseHref={`/${orgSlug}/executive`}
              defaultMode="current_and_prior"
            />
          </div>

          {/* ── KPIs financieros clave ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: S[3],
            marginBottom: S[5],
          }}>
            <KpiCard
              label="MTD Real"
              sublabel={`Ingresos al día ${fpaForecast?.dayOfMonth ?? "—"} · F1 oficial`}
              value={fpaForecast?.hasData ? fmtCOP(fpaForecast.monthToDate) : "—"}
              dotColor={C.green}
              empty={!fpaForecast?.hasData}
            />
            <KpiCard
              label="Proyección del mes"
              sublabel={`Estimado a cierre · ${periodLabel}`}
              value={fpaForecast?.hasData ? fmtCOP(fpaForecast.monthProjection) : "—"}
              dotColor={C.brand}
              empty={!fpaForecast?.hasData}
            />
            <KpiCard
              label="Cartera vencida"
              sublabel="Saldo pendiente vencido"
              value={fpaCashFlow?.hasData ? fmtCOP(fpaCashFlow.totalOverdue) : "—"}
              dotColor={fpaCashFlow?.hasData && fpaCashFlow.totalOverdue > 0 ? C.red : C.inkGhost}
              urgent={fpaCashFlow?.hasData && fpaCashFlow.totalOverdue > 0}
              empty={!fpaCashFlow?.hasData}
            />
          </div>

          {/* ── KPIs de cartera vencida ── */}
          {carteraKpis?.hasData && carteraKpis.windowLabel && (
            <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[2], fontFamily: "monospace" }}>
              <span style={{ fontWeight: 700, color: "#7c3aed" }}>Cartera · </span>
              {carteraKpis.windowLabel}
              {windowMode !== "full_history" && (
                <span style={{
                  marginLeft: 8, fontSize: 10, fontWeight: 700,
                  color: "#1e40af", background: "#eff6ff",
                  border: "1px solid #bfdbfe", borderRadius: 3, padding: "1px 6px",
                }}>
                  carry-over incluido
                </span>
              )}
            </div>
          )}
          {carteraKpis?.hasData && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: S[3],
              marginBottom: S[5],
            }}>
              <KpiCard
                label="Saldo total abierto"
                sublabel={`${carteraKpis.activeDebtors} deudores activos`}
                value={fmtCOP(carteraKpis.totalReceivable)}
                dotColor={C.inkLight}
              />
              <KpiCard
                label="Ratio de mora"
                sublabel={`${fmtCOP(carteraKpis.overdueReceivable)} vencido`}
                value={carteraKpis.overdueRatio.toFixed(1) + "%"}
                dotColor={carteraKpis.overdueRatio > 30 ? C.red : carteraKpis.overdueRatio > 10 ? C.amber : C.green}
                urgent={carteraKpis.overdueRatio > 30}
              />
              <KpiCard
                label="DPD máximo"
                sublabel={carteraKpis.count90Plus > 0 ? `${carteraKpis.count90Plus} clientes +90d` : "sin mora crítica"}
                value={carteraKpis.maxDpd > 0 ? `+${carteraKpis.maxDpd}d` : "—"}
                dotColor={carteraKpis.maxDpd > 180 ? C.red : carteraKpis.maxDpd > 90 ? C.amber : C.inkLight}
                urgent={carteraKpis.maxDpd > 90}
              />
              <KpiCard
                label="Mayor deudor"
                sublabel={carteraKpis.topDebtor ? `${carteraKpis.concentrationRisk.toFixed(0)}% del total vencido` : "sin deudores"}
                value={carteraKpis.topDebtor ? fmtCOP(carteraKpis.topDebtor.overdueReceivable) : "—"}
                dotColor={carteraKpis.concentrationRisk > 20 ? C.amber : C.inkLight}
              />
            </div>
          )}

          {/* ── Panel de riesgo de cartera ── */}
          {carteraKpis?.hasData && (
            <CarteraRiskPanel kpis={carteraKpis} orgSlug={orgSlug} />
          )}

          {/* ── Panel de antigüedad de cartera ── */}
          {fpaCashFlow?.hasData && (
            <AgingPanel cashFlow={fpaCashFlow} orgSlug={orgSlug} />
          )}

          {/* ── Acciones ejecutivas (above the fold) ── */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
            <ActionButton
              orgSlug={orgSlug}
              label="⬆ Escalar desviación"
              variant="danger"
              size="sm"
              prefill={{
                actionType:   "ESCALAR_A_GERENCIA",
                sourceModule: "torre_de_control",
                title:        `Escalamiento ejecutivo — desviación detectada · ${periodLabel}`,
                description:  criticalAlerts.length > 0
                  ? `${criticalAlerts.length} alerta${criticalAlerts.length > 1 ? "s" : ""} crítica${criticalAlerts.length > 1 ? "s" : ""} activa${criticalAlerts.length > 1 ? "s" : ""}. Requiere atención gerencial.`
                  : "Desviación identificada en Torre de Control. Requiere revisión ejecutiva.",
                priority:     "URGENT",
              }}
            />
            <ActionButton
              orgSlug={orgSlug}
              label="🤝 Crear comité"
              variant="outline"
              size="sm"
              prefill={{
                actionType:   "CREAR_TAREA_COMERCIAL",
                sourceModule: "torre_de_control",
                title:        `Comité de seguimiento ejecutivo — ${periodLabel}`,
                description:  `Convocar comité de seguimiento para revisión de resultados del período ${periodLabel}.`,
                priority:     "HIGH",
              }}
            />
            <ActionButton
              orgSlug={orgSlug}
              label="🔍 Asignar investigación"
              variant="outline"
              size="sm"
              prefill={{
                actionType:   "CREAR_TAREA_COMERCIAL",
                sourceModule: "torre_de_control",
                title:        `Investigación ejecutiva — ${periodLabel}`,
                description:  "Asignar análisis profundo de desviaciones o anomalías detectadas en Torre de Control.",
                priority:     "HIGH",
              }}
            />
            <ActionButton
              orgSlug={orgSlug}
              label="📊 Informe recurrente"
              variant="purple"
              size="sm"
              prefill={{
                actionType:   "PROGRAMAR_INFORME",
                sourceModule: "torre_de_control",
                title:        `Informe ejecutivo recurrente — ${organization.name}`,
                description:  `Programar generación automática de informe ejecutivo mensual a partir de ${periodLabel}.`,
                priority:     "MEDIUM",
              }}
            />
          </div>

          {/* ── Panel ejecutivo comercial — Unified Commercial Ledger ── */}
          {/* SalesDashboard contiene: KPIs del período, ledger CRM·SAG·XML,
              pipeline CRM → SAG, tendencia mensual, mix por línea, sucursales,
              canales de venta, top 10 clientes.
              Es el núcleo del análisis ejecutivo de la Torre de Control.
              Posición: inmediatamente después de FPA KPIs + action buttons
              para que el ciclo comercial completo quede above the fold. */}
          <SalesDashboard
            orgId={orgId}
            orgSlug={orgSlug}
            currentPeriod={latestPeriod}
            trendStart={trendStart}
            trendEnd={trendEnd}
          />

          {/* ── Acceso rápido al análisis ── */}
          <div style={{
            display: "flex", gap: S[2], marginBottom: S[6], flexWrap: "wrap",
            fontSize: T.sz.sm, fontFamily: "monospace",
          }}>
            {[
              { label: "✨ Informes Inteligentes", href: `/${orgSlug}/reports`  },
              { label: "🤖 Consultar Agentik",     href: `/${orgSlug}/agentik`  },
            ].map(nav => (
              <Link key={nav.href} href={nav.href} style={{
                padding: "5px 12px",
                border: `1px solid ${C.brand}`,
                borderRadius: R.sm,
                textDecoration: "none",
                color:      C.brand,
                background: C.brandLight,
                fontWeight: T.wt.bold,
              }}>
                {nav.label} →
              </Link>
            ))}
          </div>

          {/* ── F2 advanced panel — collapsed by default, role-gated ── */}
          {/*   Visible only for ORG_ADMIN, MANAGER, SUPER_ADMIN.          */}
          {/*   Expands on demand via F2Toggle client component.            */}
          {sourceSplit && sourceSplit.hasData && canSeeF2 && (
            <F2Toggle>
              <SourceMixPanel
                split={sourceSplit}
                sellerKpis={sellerConvKpis.slice(0, 5)}
                orgSlug={orgSlug}
                periodLabel={periodLabel}
              />
            </F2Toggle>
          )}

          {/* ── Insights y acciones de gestión ── */}
          <Panel style={{ marginBottom: S[8] }}>
            <PanelHeader
              title="🔍 Análisis rápido"
              badge={<Badge variant="brand">IA</Badge>}
            />
            <div style={{
              padding: `${S[4]}px ${S[5] - 2}px`,
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[3],
            }}>
              {[
                {
                  icon: "📈",
                  title: "Análisis de tendencias",
                  description: "Consulta variaciones de crecimiento, períodos críticos y proyecciones con lenguaje natural.",
                  href: `/${orgSlug}/reports`,
                  label: "Abrir Informes →",
                },
                {
                  icon: "⚠",
                  title: "Riesgo y cartera",
                  description: "Identifica clientes con cartera vencida, alertas comerciales activas y riesgo de cobro.",
                  href: `/${orgSlug}/customer-360`,
                  label: "Ver Cliente 360 →",
                },
                {
                  icon: "🤖",
                  title: "Preguntas al asistente",
                  description: "Haz preguntas directas sobre ventas, pipeline, clientes o alertas al asistente Agentik.",
                  href: `/${orgSlug}/agentik`,
                  label: "Consultar Agentik →",
                },
              ].map(item => (
                <div key={item.href} style={{
                  border: `1px solid ${C.line}`, borderRadius: R.md, padding: `${S[4]}px ${S[4]}px`,
                }}>
                  <div style={{ fontSize: 20, marginBottom: S[1] + 2 }}>{item.icon}</div>
                  <div style={{ fontWeight: T.wt.bold, fontSize: T.sz.md, color: C.ink, marginBottom: S[1] }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: T.sz.sm, color: C.inkLight, lineHeight: 1.5, marginBottom: S[2] + 2 }}>
                    {item.description}
                  </div>
                  <Link href={item.href} style={{
                    fontSize: T.sz.sm, color: C.brand, fontWeight: T.wt.bold, textDecoration: "none",
                  }}>
                    {item.label}
                  </Link>
                </div>
              ))}
            </div>
          </Panel>

          {/* ── Pie de página ── */}
          <div style={{ fontSize: T.sz.xs, color: C.inkGhost, textAlign: "right", paddingBottom: S[2] }}>
            Torre de Control · {organization.name} · Período: {periodLabel}
          </div>

        </div>
      </div>{/* /dsk-exec */}
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function periodMinusMonths(periodo: string, months: number): string {
  const year  = Number(periodo.slice(0, 4));
  const month = Number(periodo.slice(4));
  const date  = new Date(year, month - 1 - months, 1);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_NAMES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function fmtPeriodo(p: string): string {
  const m = Number(p.slice(4));
  return `${MONTH_NAMES[m] ?? p.slice(4)} ${p.slice(0, 4)}`;
}

function fmtCOP(n: number): string {
  return "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
}

// ── Aging Panel ───────────────────────────────────────────────────────────────

const AGING_BUCKETS: {
  key:      string;
  label:    string;
  sublabel: string;
  color:    string;
}[] = [
  { key: "CURRENT", label: "Al día",  sublabel: "sin vencer", color: C.green    },
  { key: "1-30",    label: "1–30 d",  sublabel: "vencido",    color: C.amberMid },
  { key: "31-60",   label: "31–60 d", sublabel: "vencido",    color: C.amber    },
  { key: "90+",     label: "+90 d",   sublabel: "crítico",    color: C.red      },
];

function AgingPanel({
  cashFlow,
  orgSlug,
}: {
  cashFlow: CashFlowSummary;
  orgSlug:  string;
}) {
  const find = (key: string) => cashFlow.aging.find(b => b.bucket === key);

  // Risk signal: >30 % of outstanding is 31d+ overdue → high risk
  const overdueHigh =
    (find("31-60")?.amount ?? 0) +
    (find("61-90")?.amount ?? 0) +
    (find("90+")?.amount   ?? 0);
  const highRisk =
    cashFlow.totalOutstanding > 0 &&
    overdueHigh / cashFlow.totalOutstanding > 0.30;

  return (
    <div style={{
      border:       highRisk ? `1.5px solid ${C.redBorder}` : `1px solid ${C.line}`,
      borderRadius: R.md,
      overflow:     "hidden",
      marginBottom: S[5],
    }}>
      {/* Header */}
      <div style={{
        padding:       `${S[2]}px ${S[4]}px`,
        borderBottom:  highRisk ? `1px solid ${C.redBorder}` : `1px solid ${C.line}`,
        background:    highRisk ? "#fff8f8" : C.surfaceAlt,
        display:       "flex",
        alignItems:    "center",
        gap:           S[2] + 2,
        fontSize:      T.sz.base,
      }}>
        <span style={{ fontWeight: T.wt.bold, color: C.ink }}>💳 Cartera por antigüedad</span>
        {highRisk && (
          <Badge variant="danger">RIESGO ALTO</Badge>
        )}
        <span style={{ marginLeft: "auto", fontSize: T.sz.sm, color: C.inkLight }}>
          Total saldo abierto:{" "}
          <b style={{ color: C.ink }}>{fmtCOP(cashFlow.totalOutstanding)}</b>
        </span>
        <Link href={`/${orgSlug}/customer-360`} style={{
          fontSize: T.sz.sm, color: C.brand, fontWeight: T.wt.bold, textDecoration: "none",
        }}>
          Ver detalle →
        </Link>
      </div>

      {/* Bucket columns */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr 1fr 1fr 1fr",
      }}>
        {AGING_BUCKETS.map((b, i) => {
          const row   = find(b.key);
          const pct   = row && cashFlow.totalOutstanding > 0
            ? (row.amount / cashFlow.totalOutstanding * 100).toFixed(0)
            : null;
          const isLast = i === AGING_BUCKETS.length - 1;

          return (
            <div key={b.key} style={{
              padding:     `${S[3]}px ${S[4]}px`,
              borderRight: isLast ? "none" : `1px solid ${C.lineSubtle}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: row ? b.color : C.line,
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.inkMid,
                  textTransform: "uppercase", letterSpacing: "0.04em",
                }}>
                  {b.label}
                </span>
                <span style={{ fontSize: T.sz["2xs"], color: C.inkGhost }}>{b.sublabel}</span>
              </div>
              <div style={{
                fontSize:    row ? T.sz.xl + 2 : T.sz.lg,
                fontWeight:  T.wt.black,
                color:       row ? b.color : C.inkGhost,
                letterSpacing: "-0.01em",
                lineHeight:  1.1,
              }}>
                {row ? fmtCOP(row.amount) : "—"}
              </div>
              <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: 3 }}>
                {row
                  ? `${row.count} cliente${row.count !== 1 ? "s" : ""}${pct ? ` · ${pct}%` : ""}`
                  : "sin saldo"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ── Source Mix Panel ──────────────────────────────────────────────────────────
//
// Shows FUENTE_1 / FUENTE_2 split KPIs at the executive level.
// Displayed before SalesDashboard so leadership sees the data quality signal
// before interpreting the main KPIs.

type RemisionKpiRow = { key: string; label: string; oficialAmount: number; remisionAmount: number; conversionRate: number; riskLevel: "LOW" | "MEDIUM" | "HIGH" };

function SourceMixPanel({
  split,
  sellerKpis,
  orgSlug,
  periodLabel,
}: {
  split:       SourceSplitOverview;
  sellerKpis:  RemisionKpiRow[];
  orgSlug:     string;
  periodLabel: string;
}) {
  const f2Risk = split.f2SharePct >= 40 ? "CRITICAL" : split.f2SharePct >= 25 ? "HIGH" : split.f2SharePct >= 10 ? "MEDIUM" : "LOW";
  const riskColor: Record<string, string> = {
    CRITICAL: "#dc2626", HIGH: "#d97706", MEDIUM: "#ca8a04", LOW: "#16a34a",
  };
  const legacyHigh = split.legacyAssumedPct > 30;

  return (
    <div style={{
      border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "hidden", marginBottom: S[6],
    }}>
      {/* Header */}
      <div style={{
        padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}`,
        background: C.surfaceAlt, display: "flex", alignItems: "center", gap: S[2] + 2,
      }}>
        <span style={{ fontWeight: T.wt.bold, fontSize: T.sz.md }}>📊 Mix de Fuente — Fuente 1 vs Fuente 2</span>
        <Badge variant="dark">{periodLabel}</Badge>
        {split.f2SharePct >= 25 && (
          <span style={{
            fontSize: T.sz.xs, background: riskColor[f2Risk], color: "#fff",
            padding: "2px 8px", borderRadius: R.sm, fontWeight: T.wt.bold,
          }}>
            F2 {split.f2SharePct.toFixed(0)}% — REVISAR
          </span>
        )}
        {legacyHigh && (
          <span style={{
            fontSize: T.sz.xs, background: C.amber, color: "#fff",
            padding: "2px 8px", borderRadius: R.sm, fontWeight: T.wt.bold,
          }}>
            {split.legacyAssumedPct.toFixed(0)}% LEGADO — CLASIFICAR
          </span>
        )}
        <Link href={`/${orgSlug}/sales`} style={{
          marginLeft: "auto", fontSize: T.sz.sm, color: C.brand, fontWeight: T.wt.bold, textDecoration: "none",
        }}>
          Ver detalle →
        </Link>
      </div>

      {/* KPI row */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
        borderBottom: `1px solid ${C.lineSubtle}`,
      }}>
        {[
          {
            label:   "Fuente 1 · Oficial",
            value:   fmtCOP(split.f1Amount),
            sub:     `${split.f1SharePct.toFixed(1)}% del total`,
            dot:     C.green,
          },
          {
            label:   "Fuente 2 · Remisión",
            value:   fmtCOP(split.f2Amount),
            sub:     `${split.f2SharePct.toFixed(1)}% del total`,
            dot:     C.amber,
          },
          {
            label:   "Conversión F2 → F1",
            value:   `${split.conversionRate.toFixed(1)}%`,
            sub:     "tasa estimada",
            dot:     split.conversionRate >= 75 ? C.green : split.conversionRate >= 50 ? C.amberMid : C.red,
          },
          {
            label:   "Total operacional",
            value:   fmtCOP(split.totalAmount),
            sub:     "F1 + F2",
            dot:     C.inkLight,
          },
          {
            label:   "Datos legado",
            value:   `${split.legacyAssumedPct.toFixed(1)}%`,
            sub:     "asumidos F1",
            dot:     legacyHigh ? C.amber : C.inkLight,
          },
        ].map(kpi => (
          <div key={kpi.label} style={{ padding: `${S[3]}px ${S[4]}px`, borderRight: `1px solid ${C.lineSubtle}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: kpi.dot }} />
              <span style={{ fontSize: T.sz.xs, color: C.inkLight, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {kpi.label}
              </span>
            </div>
            <div style={{ fontSize: T.sz.xl + 2, fontWeight: T.wt.black, color: C.ink, letterSpacing: "-0.02em" }}>
              {kpi.value}
            </div>
            <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Seller conversion bottom row (if any sellers have F2) */}
      {sellerKpis.filter(s => s.remisionAmount > 0).length > 0 && (
        <div style={{ padding: `${S[2] + 2}px ${S[4]}px`, background: C.surfaceAlt }}>
          <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginBottom: S[1] + 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Vendedores · Conversión despacho → factura (peores primero)
          </div>
          <div style={{ display: "flex", gap: S[1] + 2, flexWrap: "wrap" }}>
            {sellerKpis.filter(s => s.remisionAmount > 0).map(s => (
              <Link key={s.key} href={`/${orgSlug}/sales/vendors/${s.key}`} style={{ textDecoration: "none" }}>
                <span style={{
                  fontSize: T.sz.xs, padding: "3px 8px", borderRadius: R.sm,
                  background: s.riskLevel === "HIGH" ? C.redLight   : s.riskLevel === "MEDIUM" ? C.amberLight  : C.greenLight,
                  color:      s.riskLevel === "HIGH" ? C.red        : s.riskLevel === "MEDIUM" ? C.amber       : C.green,
                  border:     `1px solid ${s.riskLevel === "HIGH" ? C.redBorder : s.riskLevel === "MEDIUM" ? C.amberBorder : C.greenBorder}`,
                  fontWeight: T.wt.semibold,
                }}>
                  {s.label}: {s.conversionRate.toFixed(0)}% F1
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
