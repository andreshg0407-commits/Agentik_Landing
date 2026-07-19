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

import React           from "react";
import Link            from "next/link";
import { requireOrgAccess }    from "@/lib/auth/org-access";
import { getLatestPeriod, getRemisionKpisBySeller, getVentasHoyPorCanal } from "@/lib/sales/reports";
import { getSalesAlerts }      from "@/lib/sales/alert-engine";
import {
  getSourceSplitOverview,
  getFpaRevenueForecast,
  getFpaCashFlow,
  type SourceSplitOverview,
  type CashFlowSummary,
} from "@/lib/finance/fpa-queries";
import { getUnifiedCommercialKpis } from "@/lib/commercial-ledger/service";
import type { CommercialKpis }      from "@/lib/commercial-ledger/types";
import { getCarteraKpis, getCarteraHistoricoByYear, type CarteraHistoricoYear } from "@/lib/finance/cartera-kpis";
import { getPaymentSummary }   from "@/lib/finance/payment-service";
import { getCobrosBreakdown }  from "@/lib/finance/cobros-breakdown";
import { getCobrosSegments, type CobrosSegments } from "@/lib/finance/cobros-kpis";
import { getApKpis, getOldestApRecord, type ApKpis, type ApDocumentRecord } from "@/lib/finance/ap-kpis";
import { FiscalWindowSelector } from "@/components/shell/fiscal-window-selector";
import {
  parseFiscalWindowMode,
  defaultCarteraWindow,
  getFiscalWindow,
  CARTERA_WINDOW_MODES,
} from "@/lib/finance/fiscal-window";
import { prisma }              from "@/lib/prisma";
import { PRISMA_EXCLUIR_ARKETOPS } from "@/lib/sag/master-data/source-semantic-rules";
import {
  getSourceRulesForView,
  getSalesSourceCodes,
  getCollectionSourceCodes,
  getPendingDepositSourceCodes,
  getOrderSourceCodes,
  getInvoiceSourceCodes,
  getF1CollectionSourceCodes,
  getCompanySalesSourceCodes,
  getStoreSalesSourceCodes,
  getWebSalesSourceCodes,
} from "@/lib/castillitos/source-rules";
import { getDailyOrderKpis, getLatestOrderDate } from "@/lib/orders/queries";
import { getModuleContext }    from "@/lib/agentik/copilot-context";
import ActionButton            from "../_action-button";
import MobileExecutiveBrief    from "@/components/executive/mobile-brief";
import MobileKpiCarousel, { type MobileKpiCard } from "@/components/executive/mobile-kpi-carousel";
import MobileSignalStrip       from "@/components/executive/mobile-signal-strip";
import MobileCriticalAlerts    from "@/components/executive/mobile-critical-alerts";
import MobileQuickActions, { type RecentActionItem } from "@/components/executive/mobile-quick-actions";
import MobileCopilotInput      from "@/components/executive/mobile-copilot-input";
import { F2Toggle }           from "@/components/executive/f2-toggle";
import DailyCarousel, { type DailyCard } from "@/components/executive/daily-carousel";
import { C, T, S, R, E }    from "@/lib/ui/tokens";
import { Panel, PanelHeader, Badge }  from "@/components/shell/primitives";

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
  // Main window: controls HOY panel + commercial sales view
  const windowParam  = typeof sp.window  === "string" ? sp.window  : undefined;
  const windowMode   = parseFiscalWindowMode(windowParam, "today");
  const fiscalWindow = getFiscalWindow(windowMode);
  // Cartera window: independent selector in the Cartera section — default current_year
  const carteraWindowParam = typeof sp.carteraWindow === "string" ? sp.carteraWindow : undefined;
  // B2.1: default is strict_year — only 2026 invoices, no carry-over from prior years.
  const carteraWindowMode  = parseFiscalWindowMode(carteraWindowParam, "strict_year");
  const carteraWindow      = getFiscalWindow(carteraWindowMode);

  // Operational view: controls which channel/source the HOY panel shows.
  // Default: consolidado (all).  URL param: ?view=consolidado|empresa|f2|tiendas|web
  type OperationalView = "consolidado" | "empresa" | "f2" | "tiendas" | "web";
  const VALID_VIEWS: OperationalView[] = ["consolidado", "empresa", "f2", "tiendas", "web"];
  const VIEW_LABELS: Record<OperationalView, string> = {
    consolidado: "Consolidado",
    empresa:     "Empresa",
    f2:          "F2 / Remisiones",
    tiendas:     "Tiendas",
    web:         "Web",
  };
  const VIEW_SUBLABELS: Record<OperationalView, string> = {
    consolidado: "todos los canales · oficial",
    empresa:     "F1 oficial · empresa",
    f2:          "remisiones / F2",
    tiendas:     "POS almacenes",
    web:         "canal web",
  };
  const rawView = typeof sp.view === "string" ? sp.view : undefined;
  const view: OperationalView = VALID_VIEWS.includes(rawView as OperationalView)
    ? (rawView as OperationalView) : "consolidado";

  // Per-view sale filter for SaleRecord queries.
  // Sprint 3.1: ARKETOPS codes excluded from all views.
  const viewSaleFilter: Record<string, unknown> = (() => {
    switch (view) {
      case "empresa":  return { channel: "EMPRESA", sagSourceType: "OFICIAL", ...PRISMA_EXCLUIR_ARKETOPS };
      case "f2":       return { sagSourceType: "REMISION", ...PRISMA_EXCLUIR_ARKETOPS };
      case "tiendas":  return { channel: "ALMACEN", ...PRISMA_EXCLUIR_ARKETOPS };
      case "web":      return { channel: "ONLINE", ...PRISMA_EXCLUIR_ARKETOPS };
      default:         return { sagSourceType: "OFICIAL", ...PRISMA_EXCLUIR_ARKETOPS }; // consolidado
    }
  })();
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
  const [sourceSplit, sellerConvKpis, fpaForecast, fpaCashFlow, carteraKpis, cobrosBreakdown, historicalCartera, pendingApprovals, openTasks, rawRecentActions, commercialKpis, cobrosSegments, apKpis] = await Promise.all([
    getSourceSplitOverview(orgId, latestPeriod).catch(() => null),
    getRemisionKpisBySeller(orgId, latestPeriod).catch(() => []),
    getFpaRevenueForecast(orgId).catch(() => null),
    getFpaCashFlow(orgId, carteraWindow).catch(() => null),
    getCarteraKpis(orgId, carteraWindow).catch(() => null),
    getCobrosBreakdown(orgId, carteraWindow).catch(() => null),
    getCarteraHistoricoByYear(orgId).catch(() => [] as CarteraHistoricoYear[]),
    (prisma as any).sagWriteOperation.count({
      where: { organizationId: orgId, status: "PENDING" },
    }).catch(() => 0) as Promise<number>,
    (prisma as any).actionTask.count({
      where: { organizationId: orgId, status: { in: ["PENDING", "IN_PROGRESS"] } },
    }).catch(() => 0) as Promise<number>,
    // Last 5 Agentik-triggered ActionTasks — drives mobile history log.
    prisma.actionTask.findMany({
      where:   { organizationId: orgId, sourceModule: "agentik_copilot" },
      orderBy: { createdAt: "desc" },
      take:    5,
      select:  { id: true, title: true, status: true, actionType: true, createdAt: true, payloadJson: true },
    }).catch(() => []),
    // Commercial ledger KPIs: facturado / cobrado / tasa — shown in period analysis
    getUnifiedCommercialKpis(orgId).catch(() => null) as Promise<CommercialKpis | null>,
    // Real cobros from CollectionRecord (v_pagosnew) — scoped to carteraWindow
    getCobrosSegments(orgId, { from: carteraWindow.from, to: carteraWindow.to }).catch(() => null) as Promise<CobrosSegments | null>,
    // AP and pending-deposit KPIs (C1/G1/C2/DC/DG/B1/B2/H1/H2/CP from SaleRecord)
    getApKpis(orgId, carteraWindow).catch(() => null) as Promise<ApKpis | null>,
  ]);

  const periodLabel = fmtPeriodo(latestPeriod);

  // ── B1 source governance — derived at call-time, no async ───────────────────
  // Authoritative source lists from PYA governance layer.
  // These MUST be the only filters used for B1 cards — no viewSaleFilter mixing.
  const b1OrderCodes   = getOrderSourceCodes();           // ["PD"] — pedidos only
  const b1InvCodes     = getInvoiceSourceCodes();         // FE FD FC FG FA FW
  const b1CobroF1Codes = getF1CollectionSourceCodes();    // R1 A1 AN SI
  const b1EmpresaCodes = getCompanySalesSourceCodes();    // FE
  const b1AlmacenCodes = getStoreSalesSourceCodes();      // FD FC FG FA
  const b1WebCodes     = getWebSalesSourceCodes();        // FW

  // ── B1: último día operativo disponible ──────────────────────────────────
  // SAG no importa en tiempo real. saleDate refleja la fecha operativa del
  // documento SAG, no cuándo se importó. Usar max(saleDate) para los códigos
  // de facturación F1 activos — ignora códigos aislados como M2.
  const latestOpRow = await (prisma as any).saleRecord.findFirst({
    where: { organizationId: orgId, comprobanteCode: { in: b1InvCodes } },
    orderBy: { saleDate: "desc" },
    select: { saleDate: true },
  }).catch(() => null) as { saleDate: Date } | null;

  const latestOpDate: Date | null = latestOpRow?.saleDate ?? null;

  // Window: [start of that calendar day, start of next day) — UTC-based since
  // saleDate is stored as "UTC midnight of the sale date" per schema comment.
  const latestOpDayStart: Date | null = latestOpDate
    ? (() => { const d = new Date(latestOpDate); d.setUTCHours(0, 0, 0, 0); return d; })()
    : null;
  const latestOpDayEnd: Date | null = latestOpDayStart
    ? new Date(latestOpDayStart.getTime() + 86_400_000)
    : null;

  // Human-readable label for the B1 section header.
  const latestOpLabel: string = (() => {
    if (!latestOpDate) return "sin datos";
    const iso   = latestOpDate.toISOString();          // "2026-04-24T00:00:00.000Z"
    const parts = iso.split("T")[0].split("-").map(Number); // [2026, 4, 24]
    const months = ["","ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    return `${parts[2]} ${months[parts[1]]} ${parts[0]}`;  // "24 abr 2026"
  })();

  // ── B1 Pedidos: latest order operational date from CustomerOrderRecord ───────
  // Orders (PD) and invoices (FE/FD/etc.) can have DIFFERENT max dates in SAG.
  // Never scope pedidos to latestOpDayStart (invoice date) — use its own max.
  const latestOrderDate = await getLatestOrderDate(orgId).catch(() => null);
  const latestOrderDayStart: Date | null = latestOrderDate
    ? (() => { const d = new Date(latestOrderDate); d.setUTCHours(0, 0, 0, 0); return d; })()
    : null;
  const latestOrderDayEnd: Date | null = latestOrderDayStart
    ? new Date(latestOrderDayStart.getTime() + 86_400_000)
    : null;

  // ── Today's activity KPIs ─────────────────────────────────────────────────
  // Scope: last SAG operational day, not wall-clock today.
  // todayStart kept for other non-B1 usages below (mobile shell, etc).
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayBase  = { organizationId: orgId, saleDate: { gte: todayStart } };
  const [
    todayVentas,
    todayFacturas,
    paymentSummary,
    todayPedidos,
    ventasPorCanal,
    todayCobrosF1Raw,
    todayVentasEmpresaRaw,
    todayVentasAlmacenesRaw,
    todayVentasWebRaw,
  ] = await Promise.all([
    // ── VENTAS: FE FD FC FG FA FW · scoped to último día operativo SAG.
    latestOpDayStart && latestOpDayEnd
      ? (prisma as any).saleRecord.aggregate({
          where: {
            organizationId: orgId,
            saleDate: { gte: latestOpDayStart, lt: latestOpDayEnd },
            comprobanteCode: { in: b1InvCodes },
          },
          _sum:   { amount: true },
          _count: { _all: true },
        }).catch(() => null) as Promise<{ _sum: { amount: number | null }; _count: { _all: number } } | null>
      : Promise.resolve(null),

    // ── FACTURAS: derivado de todayVentas — slot mantenido en tupla.
    Promise.resolve(null),

    // ── PAYMENT SUMMARY: B3/B4 únicamente (collectionRate, pendingAllocation).
    getPaymentSummary(orgId).catch(() => null),

    // ── PEDIDOS: CustomerOrderRecord (SAG PD, k_n_clase_fuente=4).
    // PD rows are NOT in SaleRecord (excluded at import — see audit 2026-04-29).
    // Scoped to latestOrderDayStart — independent from invoice operational date.
    latestOrderDayStart && latestOrderDayEnd
      ? getDailyOrderKpis(orgId, latestOrderDayStart, latestOrderDayEnd).catch(() => ({ count: 0, totalAmount: 0, latestOrderDate: null }))
      : Promise.resolve({ count: 0, totalAmount: 0, latestOrderDate: null }),

    // ── CANAL BREAKDOWN: desglose ventas por canal.
    latestOpDayStart
      ? getVentasHoyPorCanal(orgId, latestOpDayStart).catch(() => [])
      : Promise.resolve([]),

    // ── COBROS HOY: CollectionRecord para el último día operativo SAG.
    latestOpDayStart && latestOpDayEnd
      ? (prisma as any).collectionRecord.aggregate({
          where: {
            organizationId: orgId,
            collectionDate: { gte: latestOpDayStart, lt: latestOpDayEnd },
          },
          _sum:   { amount: true },
          _count: { _all: true },
        }).catch(() => null) as Promise<{ _sum: { amount: unknown }; _count: { _all: number } } | null>
      : Promise.resolve(null),

    // ── VENTAS EMPRESA (FE) · último día operativo
    latestOpDayStart && latestOpDayEnd
      ? (prisma as any).saleRecord.aggregate({
          where: {
            organizationId: orgId,
            saleDate: { gte: latestOpDayStart, lt: latestOpDayEnd },
            comprobanteCode: { in: b1EmpresaCodes },
          },
          _sum: { amount: true },
        }).catch(() => null) as Promise<{ _sum: { amount: number | null } } | null>
      : Promise.resolve(null),

    // ── VENTAS ALMACENES (FD FC FG FA) · último día operativo
    latestOpDayStart && latestOpDayEnd
      ? (prisma as any).saleRecord.aggregate({
          where: {
            organizationId: orgId,
            saleDate: { gte: latestOpDayStart, lt: latestOpDayEnd },
            comprobanteCode: { in: b1AlmacenCodes },
          },
          _sum: { amount: true },
        }).catch(() => null) as Promise<{ _sum: { amount: number | null } } | null>
      : Promise.resolve(null),

    // ── VENTAS WEB (FW) · último día operativo
    latestOpDayStart && latestOpDayEnd
      ? (prisma as any).saleRecord.aggregate({
          where: {
            organizationId: orgId,
            saleDate: { gte: latestOpDayStart, lt: latestOpDayEnd },
            comprobanteCode: { in: b1WebCodes },
          },
          _sum: { amount: true },
        }).catch(() => null) as Promise<{ _sum: { amount: number | null } } | null>
      : Promise.resolve(null),
  ]);

  // ── Tesorería inmediata urgency signal ───────────────────────────────────
  const oldestApRecord = await getOldestApRecord(orgId).catch(() => null);

  // ── Derived B1 values ────────────────────────────────────────────────────
  // All scoped to latestOperationalDate (last SAG import day), not wall-clock today.

  // Ventas + facturas: misma fuente (SaleRecord, b1InvCodes), distintas perspectivas.
  const todayVentasAmount   = todayVentas ? Number(todayVentas._sum.amount ?? 0) : null;
  const todayFacturasCount  = todayVentas ? todayVentas._count._all : null;
  const todayFacturasAmount = todayVentasAmount; // same aggregate, different card axis

  // Canal desglose
  const todayVentasEmpresaAmt   = todayVentasEmpresaRaw   ? Number(todayVentasEmpresaRaw._sum.amount   ?? 0) : 0;
  const todayVentasAlmacenesAmt = todayVentasAlmacenesRaw ? Number(todayVentasAlmacenesRaw._sum.amount ?? 0) : 0;
  const todayVentasWebAmt       = todayVentasWebRaw       ? Number(todayVentasWebRaw._sum.amount       ?? 0) : 0;

  // PaymentRecord summary: B3/B4 only (collectionRate, pendingAllocation)
  const collectionRate = paymentSummary?.collectionRate ?? 0;

  // ── B1 ORDERS DEBUG ──────────────────────────────────────────────────────
  console.log("[ORDERS B1 DEBUG]", {
    orgId,
    orgSlug,
    latestOrderDate,
    latestOrderDayStart,
    latestOrderDayEnd,
    todayPedidos,
  });

  // ── B1 AUDIT LOG ─────────────────────────────────────────────────────────
  console.log("[B1 AUDIT]", {
    latestOperationalDate:         latestOpDate?.toISOString().slice(0, 10) ?? null,
    ventas_sources:                b1InvCodes,
    totals: {
      ventas_total:                todayVentasAmount,
      ventas_empresa:              todayVentasEmpresaAmt,
      ventas_almacenes:            todayVentasAlmacenesAmt,
      ventas_web:                  todayVentasWebAmt,
      facturas_count:              todayFacturasCount,
    },
    orders_latest_date:            latestOrderDayStart?.toISOString().slice(0, 10) ?? null,
    orders_count:                  todayPedidos?.count ?? 0,
    orders_amount:                 todayPedidos?.totalAmount ?? 0,
    orders_source:    b1OrderCodes,
    cobros_today_amt: (todayCobrosF1Raw as any)?._sum?.amount ?? null,
    cobros_today_cnt: (todayCobrosF1Raw as any)?._count?._all ?? null,
  });

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

  // ── View context — Phase 2 scaffold ─────────────────────────────────────────
  // Defines per-view semantics for each block. No data is invented — only shape
  // and messaging. When real per-view data arrives from Excel ingestion, each
  // block reads viewCtx instead of static copy.
  type OperationalViewContext = {
    description:   string;
    carteraLabel:  string;
    carteraScope:  "consolidado" | "empresa" | "n/a";
    cxpScope:      "full" | "n/a";
    cashFlowScope: "full" | "partial" | "n/a";
    perfLabel:     string;
    actionFocus:   string;
    blockMsg: {
      cartera:  string | null;
      cxp:      string | null;
      cashflow: string | null;
    };
  };
  const VIEW_CONTEXT: Record<OperationalView, OperationalViewContext> = {
    consolidado: {
      description:   "Todos los canales · vista oficial consolidada",
      carteraLabel:  "Cartera total consolidada",
      carteraScope:  "consolidado",
      cxpScope:      "full",
      cashFlowScope: "full",
      perfLabel:     "Mix global · Empresa + Almacenes + Web",
      actionFocus:   "Escalar · delegar · programar informe",
      blockMsg:      { cartera: null, cxp: null, cashflow: null },
    },
    empresa: {
      description:   "F1 oficial · facturación empresa",
      carteraLabel:  "Cartera cuentas por cobrar B2B",
      carteraScope:  "empresa",
      cxpScope:      "full",
      cashFlowScope: "partial",
      perfLabel:     "Empresa vs otras fuentes",
      actionFocus:   "Aprobar facturas · gestionar cartera",
      blockMsg:      { cartera: null, cxp: null, cashflow: null },
    },
    f2: {
      description:   "F2 · remisiones y facturación diferida",
      carteraLabel:  "N/A — F2 sin cartera formal",
      carteraScope:  "n/a",
      cxpScope:      "n/a",
      cashFlowScope: "n/a",
      perfLabel:     "Comparativo F1 vs F2 · tasa de conversión",
      actionFocus:   "Gestionar conversión de remisiones",
      blockMsg: {
        cartera:  "Las remisiones F2 no generan cartera formal. Cambia a vista Consolidado o Empresa para ver cartera.",
        cxp:      "Cuentas por pagar no se segmentan por fuente F2. Ver Consolidado.",
        cashflow: "Flujo de caja no disponible en vista F2. Ver Consolidado.",
      },
    },
    tiendas: {
      description:   "POS almacenes · ventas al detal",
      carteraLabel:  "N/A — ventas POS sin cartera",
      carteraScope:  "n/a",
      cxpScope:      "n/a",
      cashFlowScope: "partial",
      perfLabel:     "Performance por tienda · cierres POS",
      actionFocus:   "Revisar cierres POS · conciliar caja",
      blockMsg: {
        cartera:  "Las ventas POS en almacenes no generan cartera por cobrar. Ver Consolidado para cartera empresa.",
        cxp:      "Cuentas por pagar no se segmentan por tienda. Ver Consolidado.",
        cashflow: null,
      },
    },
    web: {
      description:   "Canal web · e-commerce",
      carteraLabel:  "N/A — web sin AR directo",
      carteraScope:  "n/a",
      cxpScope:      "n/a",
      cashFlowScope: "n/a",
      perfLabel:     "E-commerce · conversión y recurrencia",
      actionFocus:   "Revisar conversión web · gestionar abandono",
      blockMsg: {
        cartera:  "El canal web no genera cartera formal. Ver Consolidado para cartera empresa.",
        cxp:      "Cuentas por pagar no se segmentan por canal web. Ver Consolidado.",
        cashflow: "Flujo de caja no disponible en vista Web. Ver Consolidado.",
      },
    },
  };
  const viewCtx = VIEW_CONTEXT[view];

  // ── Source semantics — Phase 2 wiring ────────────────────────────────────────
  // Derives the set of relevant source codes for each Executive OS view using
  // lib/castillitos/source-rules.ts as the single governance layer.
  //
  // These values are PREPARED but not yet enforced in queries.
  // Current queries still use the consolidated dataset (all Castillitos sources).
  // TODO: awaiting Castillitos Excel confirmation before enforcing source filters
  //       per view. When ready, pass salesSourceCodes / collectionSourceCodes
  //       directly to the query helpers below.
  //
  // Invariants already enforced by the semantic layer (no query change needed):
  //   - F2 collectionSourceCodes === [] (remisiones don't generate formal AR)
  //   - Tiendas/Web collectionSourceCodes exclude empresa R1/R2 (no contamination)
  //   - pendingDepositSourceCodes (CP/B1/B2/H1/H2) never count as final cobros
  //
  // view is OperationalView — structurally identical to ExecutiveView in source-rules.ts
  const sourceRules           = getSourceRulesForView(view);
  const salesSourceCodes      = getSalesSourceCodes(view);
  const collectionSourceCodes = getCollectionSourceCodes(view);
  const pendingDepositCodes   = getPendingDepositSourceCodes();
  // ────────────────────────────────────────────────────────────────────────────

  // ── Executive attention layer — operational health state ─────────────────────
  // Derived from already-fetched data. Drives the operational pulse bar + copilot
  // zone. No new queries. Mirrors the logic in the Closing Executive Summary IIFE.
  const _overdue90  = carteraKpis?.aging?.find(b => b.key === "90+")?.amount ?? 0;
  const _isCritical = criticalAlerts.length > 0
    || (carteraKpis?.overdueRatio ?? 0) > 30
    || _overdue90 > 0;
  const _isWarning  = !_isCritical && (
    (cobrosBreakdown?.consignacionesPendientes.count ?? 0) > 0
    || Boolean(carteraKpis?.hasData && (carteraKpis.overdueReceivable ?? 0) > 0)
  );
  const _pulseState: "critical" | "warn" | "ok" = _isCritical ? "critical" : _isWarning ? "warn" : "ok";
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
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
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="dsk-exec">
        <div style={{ fontFamily: T.mono, maxWidth: 1100 }}>

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
            display: "flex", alignItems: "center", gap: 14, marginBottom: 20,
            paddingBottom: 16, borderBottom: "1px solid var(--ag-line, rgba(0,74,173,.12))",
          }}>
            <div>
              <h1 className="ag-hero-title" style={{ margin: 0, fontSize: T.sz["4xl"], fontWeight: T.wt.black, letterSpacing: "-0.02em" }}>
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

          {/* ══ CENTRO DE MANDO — VIEW SWITCHER ═════════════════════════════════
               Protagonista absoluto. Seleccionar aquí redefine todos los bloques.
               ════════════════════════════════════════════════════════════════ */}
          <div style={{
            background: "var(--ag-surface, #F7F9FF)", border: "1px solid var(--ag-line, rgba(0,74,173,.12))",
            borderRadius: R.xl, padding: `${S[3]}px ${S[4]}px`,
            marginBottom: S[5], display: "flex", alignItems: "center",
            gap: S[2], flexWrap: "wrap" as const,
          }}>
            <span style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
              color: C.inkMid, textTransform: "uppercase" as const,
              letterSpacing: "0.08em", marginRight: S[1], flexShrink: 0,
            }}>
              Centro de mando:
            </span>
            {(VALID_VIEWS).map(v => {
              const isActive = v === view;
              const href = (() => {
                const p = new URLSearchParams();
                p.set("view", v);
                if (carteraWindowParam) p.set("carteraWindow", carteraWindowParam);
                return `/${orgSlug}/executive?${p.toString()}`;
              })();
              return isActive ? (
                <span key={v} className="ag-chan-active" style={{
                  fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
                  padding: "5px 16px", borderRadius: 8, cursor: "default",
                  display: "inline-block",
                }}>
                  {VIEW_LABELS[v]}
                </span>
              ) : (
                <Link key={v} href={href} style={{
                  fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                  padding: "5px 16px", borderRadius: 8, border: `1px solid ${C.line}`,
                  color: C.inkLight, background: "#fff", textDecoration: "none", cursor: "pointer",
                  transition: "border-color 0.12s, color 0.12s",
                }}>
                  {VIEW_LABELS[v]}
                </Link>
              );
            })}
            <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              {viewCtx.description}
            </span>
          </div>

          {/* ── Pulso operativo — executive orientation before first section ──
               One line. Tells the executive what kind of day this is before
               they read any detail. Calm green = scan normally. Red = act first. */}
          <div className={`ag-op-pulse ag-op-pulse--${_pulseState}`}>
            {/* Health dot with ambient glow */}
            <div style={{
              width:        6,
              height:       6,
              borderRadius: "50%",
              flexShrink:   0,
              background:   _isCritical ? "#ef4444" : _isWarning ? "#f59e0b" : "#22c55e",
              boxShadow:    _isCritical ? "0 0 6px rgba(239,68,68,.55)"
                          : _isWarning  ? "0 0 6px rgba(245,158,11,.50)"
                          :               "0 0 6px rgba(34,197,94,.45)",
            }} />
            {/* Operational state label */}
            <span style={{
              fontFamily:    T.mono,
              fontSize:      T.sz.xs,
              fontWeight:    T.wt.bold,
              color:         _isCritical ? "#dc2626" : _isWarning ? "#b45309" : C.inkMid,
              letterSpacing: "0.05em",
              flexShrink:    0,
            }}>
              {_isCritical ? "ATENCIÓN REQUERIDA" : _isWarning ? "ATENCIÓN" : "OPERACIÓN NORMAL"}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>·</span>
            {/* Primary signal */}
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
              {criticalAlerts.length > 0
                ? `${criticalAlerts.length} alerta${criticalAlerts.length > 1 ? "s" : ""} crítica${criticalAlerts.length > 1 ? "s" : ""} activa${criticalAlerts.length > 1 ? "s" : ""}`
                : _overdue90 > 0
                ? `cartera vencida +90d · ${fmtCOP(_overdue90)} en riesgo`
                : (cobrosBreakdown?.consignacionesPendientes.count ?? 0) > 0
                ? `${cobrosBreakdown!.consignacionesPendientes.count} consignación${cobrosBreakdown!.consignacionesPendientes.count > 1 ? "es" : ""} sin identificar`
                : "sin alertas críticas activas"}
            </span>
            {/* Latest data timestamp — right-aligned */}
            <span style={{
              marginLeft:    "auto",
              fontFamily:    T.mono,
              fontSize:      T.sz["2xs"],
              color:         C.inkGhost,
              letterSpacing: "0.03em",
              flexShrink:    0,
            }}>
              {latestOpLabel}
            </span>
          </div>

          {/* ══ BLOQUE 1 — CENTRO DE MANDO DIARIO · HOY ═════════════════════════
               Operación viva del día. Solo datos de hoy. Sin histórico.
               6 KPIs: pedidos · ventas · facturas · cobros · alertas · tareas del día
               Tasa cobro movida a B4 (ratio de eficiencia comercial, no señal de hoy).
               ════════════════════════════════════════════════════════════════ */}
          <div style={{ marginBottom: S[5] }}>
            <SectionHeader
              label="Centro de Mando Diario"
              accent="#004AAD"
              sublabel={`Último día operativo · ${latestOpLabel}`}
              badge={criticalAlerts.length > 0 ? {
                text: `${criticalAlerts.length} alerta${criticalAlerts.length > 1 ? "s" : ""} activa${criticalAlerts.length > 1 ? "s" : ""}`,
                color: C.red,
              } : undefined}
              tier="primary"
            />

            {/* DailyCarousel — 3 cards visible, navegable, accionable */}
            {(() => {
              const dailyCards: DailyCard[] = [
                {
                  id:       "pedidos",
                  label:    "Pedidos del día",
                  value:    todayPedidos && todayPedidos.count > 0
                    ? String(todayPedidos.count)
                    : "—",
                  sub:      todayPedidos && todayPedidos.count > 0
                    ? `${fmtCOP(todayPedidos.totalAmount)} · pendiente facturación`
                    : "Sin pedidos en el último día operativo",
                  dotColor: C.inkGhost,
                  href:     `/${orgSlug}/operaciones/pedidos?fecha=hoy`,
                  urgent:   false,
                  severity: todayPedidos && todayPedidos.count > 0 ? "ok" : "neutral",
                },
                {
                  id:       "ventas",
                  label:    "Ventas del día",
                  value:    todayVentasAmount !== null
                    ? (todayVentasAmount > 0 ? fmtCOP(todayVentasAmount) : "$0")
                    : "—",
                  sub:      todayVentasAmount !== null && todayVentasAmount > 0
                    ? (todayFacturasCount !== null && todayFacturasCount > 0
                        ? `${todayFacturasCount} doc${todayFacturasCount !== 1 ? "s" : ""} · F1 oficial · ver canal ↓`
                        : "F1 oficial · hoy")
                    : todayVentasAmount !== null ? "Sin ventas F1 hoy" : "Sin datos de ventas hoy",
                  dotColor: todayVentasAmount !== null && todayVentasAmount > 0 ? C.green : C.inkGhost,
                  href:     `/${orgSlug}/comercial/ventas?fecha=hoy`,
                  urgent:   false,
                  severity: todayVentasAmount !== null && todayVentasAmount > 0 ? "ok" : "neutral",
                },
                {
                  id:       "facturas",
                  label:    "Facturas emitidas hoy",
                  value:    todayFacturasCount !== null
                    ? String(todayFacturasCount)
                    : "—",
                  sub:      todayFacturasCount !== null && todayFacturasCount > 0
                    ? "FE FD FC FG FA FW · F1 oficial"
                    : todayFacturasCount !== null ? "Sin documentos F1 hoy" : "Sin datos hoy",
                  dotColor: todayFacturasCount !== null && todayFacturasCount > 0 ? C.inkMid : C.inkGhost,
                  href:     `/${orgSlug}/finanzas/facturas?fecha=hoy`,
                  urgent:   false,
                  severity: todayFacturasCount !== null && todayFacturasCount > 0 ? "ok" : "neutral",
                },
                {
                  id: "cobros",
                  label: "Cobros recibidos hoy",
                  ...((): { value: string; sub: string; dotColor: string; severity: "ok" | "neutral" } => {
                    const raw = todayCobrosF1Raw as { _sum: { amount: unknown }; _count: { _all: number } } | null;
                    const amt = raw?._sum?.amount != null
                      ? (typeof (raw._sum.amount as any).toNumber === "function"
                          ? (raw._sum.amount as any).toNumber()
                          : Number(raw._sum.amount))
                      : 0;
                    const cnt = raw?._count?._all ?? 0;
                    if (cnt > 0 && amt > 0) {
                      return { value: fmtCOP(amt), sub: `${cnt} recibo${cnt !== 1 ? "s" : ""} · SAG registrado · pendiente conciliación`, dotColor: C.green, severity: "ok" };
                    }
                    return { value: "—", sub: "Sin cobros en período", dotColor: C.inkGhost, severity: "neutral" };
                  })(),
                  href:   `/${orgSlug}/finanzas/torre-control/cobros-hoy`,
                  urgent: false,
                },
                {
                  id:       "alertas",
                  label:    "Alertas activas",
                  value:    String(criticalAlerts.length),
                  sub:      criticalAlerts.length > 0
                    ? `${criticalAlerts.length} alerta${criticalAlerts.length > 1 ? "s" : ""} requieren decision ejecutiva`
                    : "Operacion normal · sin alertas criticas",
                  dotColor: criticalAlerts.length > 0 ? C.red : C.green,
                  href:     `/${orgSlug}/alerts`,
                  urgent:   criticalAlerts.length > 0,
                  severity: criticalAlerts.length > 0 ? "critical" : "ok",
                },
                {
                  id:       "tareas",
                  label:    "Tareas del día",
                  value:    String(openTasks),
                  sub:      openTasks > 0
                    ? `${openTasks} tarea${openTasks > 1 ? "s" : ""} pendiente${openTasks > 1 ? "s" : ""} · accion requerida`
                    : "Sin tareas pendientes hoy",
                  dotColor: openTasks > 3 ? C.red : openTasks > 0 ? C.amber : C.green,
                  href:     `/${orgSlug}/alerts`,
                  urgent:   openTasks > 0,
                  severity: openTasks > 3 ? "critical" : openTasks > 0 ? "warning" : "ok",
                },
              ];
              console.log("[DAILY CARDS]", dailyCards.find(c => c.id === "pedidos"));
              return <DailyCarousel cards={dailyCards} />;
            })()}

            {/* ── Inteligencia Financiera Hoy — contextual intelligence layer ──
                 Separates signal (cards above) from context (this strip).
                 Uses only data already fetched above — no new queries.       */}
            {(() => {
              const cobrosRaw = todayCobrosF1Raw as { _sum: { amount: unknown }; _count: { _all: number } } | null;
              const cobrosAmt = cobrosRaw?._sum?.amount != null
                ? (typeof (cobrosRaw._sum.amount as any).toNumber === "function"
                    ? (cobrosRaw._sum.amount as any).toNumber()
                    : Number(cobrosRaw._sum.amount))
                : 0;
              const cobrosCnt = cobrosRaw?._count?._all ?? 0;
              const cp = cobrosBreakdown?.consignacionesPendientes;

              const signals = [
                {
                  label:  "Empresa · hoy",
                  value:  todayVentasEmpresaAmt > 0   ? fmtCOP(todayVentasEmpresaAmt)   : "—",
                  note:   todayVentasEmpresaAmt > 0   ? "canal empresa activo"           : "sin movimiento",
                  active: todayVentasEmpresaAmt > 0,
                },
                {
                  label:  "Almacenes · hoy",
                  value:  todayVentasAlmacenesAmt > 0 ? fmtCOP(todayVentasAlmacenesAmt) : "—",
                  note:   todayVentasAlmacenesAmt > 0 ? "POS tiendas activo"             : "sin transacciones POS",
                  active: todayVentasAlmacenesAmt > 0,
                },
                {
                  label:  "Web · hoy",
                  value:  todayVentasWebAmt > 0 ? fmtCOP(todayVentasWebAmt) : "—",
                  note:   todayVentasWebAmt > 0 ? "canal digital activo"    : "sin movimiento web",
                  active: todayVentasWebAmt > 0,
                },
                {
                  label:  "Cobros · hoy",
                  value:  cobrosAmt > 0 ? fmtCOP(cobrosAmt) : "—",
                  note:   cobrosCnt > 0
                    ? (cp && cp.count > 0
                        ? `${cobrosCnt} recibo${cobrosCnt !== 1 ? "s" : ""} · flujo activo · ${cp.count} consig. bloqueando`
                        : `${cobrosCnt} recibo${cobrosCnt !== 1 ? "s" : ""} · flujo activo · sin bloqueos`)
                    : (cp && cp.count > 0
                        ? "sin cobros hoy · consignaciones acumulando"
                        : "flujo de cobros sin movimiento"),
                  active: cobrosCnt > 0,
                },
              ];

              return (
                <div className="ag-insight-card" style={{ marginTop: S[3] }}>
                  <div className="ag-intel-header" style={{
                    display: "flex", alignItems: "center", gap: S[3],
                    fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
                    color: C.blueDark, textTransform: "uppercase" as const, letterSpacing: "0.07em",
                  }}>
                    Inteligencia financiera · hoy
                    {cp && cp.count > 0 && (
                      <span style={{
                        fontFamily:    T.mono,
                        fontSize:      9,
                        fontWeight:    T.wt.bold,
                        color:         "#92400e",
                        background:    "#fef3c7",
                        border:        "1px solid #fde68a",
                        borderRadius:  3,
                        padding:       "1px 6px",
                        letterSpacing: "0.03em",
                      }}>
                        {cp.count} consignación{cp.count !== 1 ? "es" : ""} pendiente{cp.count !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
                    {signals.map((sig, i) => (
                      <div key={sig.label} style={{
                        padding:     `${S[2] + 2}px ${S[4]}px`,
                        borderRight: i < 3 ? `1px solid ${C.lineSubtle}` : "none",
                      }}>
                        <div style={{
                          fontFamily:    T.mono,
                          fontSize:      T.sz["2xs"],
                          fontWeight:    T.wt.bold,
                          color:         C.inkFaint,
                          textTransform: "uppercase" as const,
                          letterSpacing: "0.06em",
                          marginBottom:  S[1],
                        }}>
                          {sig.label}
                        </div>
                        <div
                          title={sig.value}
                          style={{
                            fontFamily:          T.mono,
                            fontSize:            T.sz.xl,
                            fontWeight:          T.wt.black,
                            color:               sig.active ? C.ink : C.inkMid,
                            lineHeight:          1.1,
                            whiteSpace:          "nowrap",
                            overflow:            "hidden",
                            textOverflow:        "ellipsis",
                            fontVariantNumeric:  "tabular-nums",
                            marginBottom:        2,
                          }}
                        >
                          {sig.value}
                        </div>
                        <div style={{
                          fontFamily: T.mono,
                          fontSize:   T.sz.xs,
                          color:      C.inkFaint,
                          lineHeight: 1.4,
                          fontStyle:  sig.active ? "normal" : "italic" as const,
                        }}>
                          {sig.note}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ══ BLOQUE 2 — CARTERA Y RIESGO ═════════════════════════════════════
               Aging por antigüedad · Risk intelligence · Cobros · CP pendientes.
               Solo vistas con AR formal (empresa / consolidado).
               ════════════════════════════════════════════════════════════════ */}
          {viewCtx.carteraScope !== "n/a" ? (
            <>
              <SectionHeader
                label="Cartera y Riesgo"
                accent="#dc2626"
                sublabel={`${viewCtx.carteraLabel}${carteraKpis?.hasData && carteraKpis.windowLabel ? ` · ${carteraKpis.windowLabel}` : ""}`}
                badge={carteraKpis?.hasData && carteraKpis.overdueReceivable > 0 ? {
                  text: `${fmtCOP(carteraKpis.overdueReceivable)} vencido`,
                  color: C.red,
                } : undefined}
                href={`/${orgSlug}/collections`}
                hrefLabel="Ver cobranza →"
                tier="primary"
              />
              <div style={{ marginBottom: S[3] }}>
                <FiscalWindowSelector
                  currentMode={carteraWindowMode}
                  baseHref={`/${orgSlug}/executive`}
                  defaultMode="current_year"
                  modes={CARTERA_WINDOW_MODES}
                  paramName="carteraWindow"
                />
              </div>

              {/* ── B2: Señales + Aging + Cobros · B2.6 (unified CustomerReceivable source) ── */}
              {(() => {
                const hasCartera    = carteraKpis?.hasData ?? false;
                // Aging from carteraKpis.aging — same CustomerReceivable source, same window.
                const findBucket    = (key: string) => carteraKpis?.aging?.find(b => b.key === key);
                const cp            = cobrosBreakdown?.consignacionesPendientes;
                // Note: this IIFE is inside viewCtx.carteraScope !== "n/a" branch,
                // so carteraScope is always "consolidado" | "empresa" here.

                type SigSev = "critical" | "warning" | "ok" | "neutral";
                function sigCard(severity: SigSev): React.CSSProperties {
                  const border =
                    severity === "critical" ? "#ef4444"
                    : severity === "warning" ? "#f59e0b"
                    : severity === "ok"      ? "#22c55e"
                    : "#004AAD";
                  return {
                    display:        "flex",
                    flexDirection:  "column",
                    gap:            S[2],
                    border:         `1px solid ${border}33`,
                    borderLeft:     `4px solid ${border}`,
                    borderRadius:   R.card,
                    background:     "var(--ag-grad-card, linear-gradient(135deg,#fff,#F7F9FF))",
                    padding:        `${S[4]}px ${S[4]}px`,
                    textDecoration: "none",
                    cursor:         "pointer",
                    minHeight:      96,
                    boxShadow:      "var(--ag-shadow-sm)",
                  };
                }

                // Cartera 2026 card always uses neutral/blue border; risk shown inline in subtext
                const cvSev: SigSev = "neutral";
                // Aging-derived amounts for card subtext (same buckets as Row 2)
                const _b3160         = findBucket("31-60")?.amount ?? 0;
                const _b6190         = findBucket("61-90")?.amount ?? 0;
                const _b90p          = findBucket("90+")?.amount   ?? 0;
                const fueraDePlazo   = _b3160 + _b6190 + _b90p;
                const accionInmediata = _b90p;

                // Cobros severity: ok when real amounts present, neutral when no data
                const cobrosSev: SigSev = cobrosSegments?.hasRealAmounts && cobrosSegments.grandTotal > 0 ? "ok" : "neutral";

                const LABEL: React.CSSProperties = {
                  fontFamily:    T.mono,
                  fontSize:      T.sz.xs,
                  fontWeight:    T.wt.semibold,
                  color:         C.inkFaint,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                };
                const VALUE: React.CSSProperties = {
                  fontFamily:          T.mono,
                  fontSize:            T.sz["2xl"],
                  fontWeight:          T.wt.black,
                  color:               C.ink,
                  lineHeight:          1.1,
                  // §17 — KPI numeric containment
                  whiteSpace:          "nowrap",
                  overflow:            "hidden",
                  textOverflow:        "ellipsis",
                  maxWidth:            "100%",
                  minWidth:            0,
                  fontVariantNumeric:  "tabular-nums",
                };
                const SUB: React.CSSProperties = {
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  color:      C.inkMid,
                  lineHeight: 1.4,
                };
                const CTA: React.CSSProperties = {
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  fontWeight: T.wt.semibold,
                  color:      C.blue,
                  marginTop:  "auto",
                };
                // ── Cobros del período: view-aware value + breakdown lines + ratio ────
                const cobrosCard = (() => {
                  const seg        = cobrosSegments;
                  if (!seg) return { value: "—", subLines: ["Sin datos"], ratio: null as string | null };
                  const r1Amt  = seg.empresa.r1.amount;
                  const r2Amt  = seg.empresa.r2.amount;
                  const almAmt = seg.almacenes.amount;
                  const retAmt = seg.retailFinanciero.amount;
                  switch (view) {
                    case "empresa":
                      return {
                        value:    r1Amt > 0 ? fmtCOP(r1Amt) : "—",
                        subLines: [seg.empresa.r1.count > 0 ? `${seg.empresa.r1.count} recibos R1 · Empresa F1` : "Sin cobros en período"],
                        ratio:    null as string | null,
                      };
                    case "f2":
                      return {
                        value:    r2Amt > 0 ? fmtCOP(r2Amt) : "—",
                        subLines: [seg.empresa.r2.count > 0 ? `${seg.empresa.r2.count} recibos R2 · Remisiones` : "Sin cobros en período"],
                        ratio:    null as string | null,
                      };
                    case "tiendas":
                      return {
                        value:    almAmt > 0 ? fmtCOP(almAmt) : "—",
                        subLines: [seg.almacenes.count > 0 ? `${seg.almacenes.count} recibos · RS/RC/RG/RA` : "Sin cobros en período"],
                        ratio:    null as string | null,
                      };
                    case "web":
                      return { value: "—", subLines: ["Sin cobros SAG en canal web"], ratio: null as string | null };
                    default: {
                      const lines = [
                        r1Amt  > 0 ? `F1 Empresa: ${fmtCOP(r1Amt)}`   : null,
                        r2Amt  > 0 ? `F2 Remisiones: ${fmtCOP(r2Amt)}` : null,
                        almAmt > 0 ? `Tiendas: ${fmtCOP(almAmt)}`      : null,
                        retAmt > 0 ? `Retail: ${fmtCOP(retAmt)}`       : null,
                      ].filter((l): l is string => l !== null);
                      // Movement interpretation: cobros/cartera ratio as recovery signal
                      const _pct = fueraDePlazo > 0 && seg.grandTotal > 0
                        ? Math.round((seg.grandTotal / fueraDePlazo) * 100)
                        : null;
                      const ratioStr = _pct !== null
                        ? _pct >= 80 ? `Cobro fuerte · ${_pct}% de cartera vencida gestionada`
                        : _pct >= 50 ? `Cobro progresando · ${_pct}% cubierto · flujo activo`
                        : _pct >= 20 ? `Recuperación en curso · ${_pct}% de cartera gestionada`
                        :              `Cobro bajo presión · ${_pct}% capturado · seguimiento urgente`
                        : null;
                      return {
                        value:    seg.grandTotal > 0 ? fmtCOP(seg.grandTotal) : "—",
                        subLines: lines.length > 0 ? lines : [seg.grandCount > 0 ? `${seg.grandCount} recibos` : "Sin cobros en período"],
                        ratio:    ratioStr,
                      };
                    }
                  }
                })();

                return (
                  <>
                    {/* ── Row 1: Cartera vencida · Cobros del período · Consignaciones ── */}
                    <div style={{
                      display:             "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap:                 S[3],
                      marginBottom:        S[3],
                    }}>
                      {/* Cartera 2026 · F1 — total abierto positivo año fiscal */}
                      <a href={`/${orgSlug}/collections`} className="op-sig-card" style={sigCard(cvSev)}>
                        <div style={LABEL}>Cartera 2026 · F1</div>
                        <div style={VALUE} title={hasCartera ? fmtCOP(carteraKpis!.totalReceivable) : "—"}>
                          {hasCartera ? fmtCOP(carteraKpis!.totalReceivable) : "—"}
                        </div>
                        {hasCartera ? (
                          <>
                            <div style={{ ...SUB, color: C.inkFaint }}>
                              Total abierto · saldos positivos
                            </div>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>
                              Cartera SAG · desglose por antigüedad abajo
                            </div>
                          </>
                        ) : (
                          <div style={SUB}>Sin datos de cartera activos</div>
                        )}
                        <div style={CTA}>Ver cartera →</div>
                      </a>

                      {/* Cobros identificados — CollectionRecord */}
                      <a href={`/${orgSlug}/finanzas/torre-control/cobros-identificados`} className="op-sig-card" style={{ ...sigCard(cobrosSev), textDecoration: "none" }}>
                        <div style={LABEL}>Cobros identificados</div>
                        <div style={VALUE} title={cobrosCard.value}>{cobrosCard.value}</div>
                        {cobrosCard.ratio ? (
                          <div style={{ ...SUB, color: C.blue }}>
                            {cobrosCard.ratio}
                          </div>
                        ) : (
                          <div style={SUB}>
                            {cobrosSegments && cobrosSegments.grandCount > 0
                              ? `${cobrosSegments.grandCount} recibos`
                              : "Sin cobros en período"}
                          </div>
                        )}
                        <div style={CTA}>Ver composición →</div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost, marginTop: S[1] }}>
                          Cobros SAG · desglose por segmento abajo
                        </div>
                      </a>

                      {/* Consignaciones pendientes */}
                      <a href={`/${orgSlug}/finanzas/torre-control/consignaciones`} className="op-sig-card" style={sigCard(cp && cp.amount > 0 ? "warning" : "ok")}>
                        <div style={LABEL}>Consignaciones pendientes</div>
                        <div style={VALUE}>
                          {cp && cp.amount > 0 ? fmtCOP(cp.amount) : "—"}
                        </div>
                        <div style={SUB}>
                          {cp && cp.count > 0
                            ? `${cp.count} consignacion${cp.count !== 1 ? "es" : ""} sin identificar · bloquea flujo de caja`
                            : "Sin consignaciones pendientes"}
                        </div>
                        <div style={CTA}>Conciliar →</div>
                      </a>
                    </div>

                    {/* ── B2 Cobros breakdown franja — contextual layer, signal/breakdown separation ──
                         Moves the F1/F2/Tiendas/Retail breakdown OUT of the main cobros card.
                         Only rendered in consolidado view with real segment data.
                         No new queries — same cobrosSegments already fetched above.           */}
                    {view === "consolidado" && cobrosSegments?.hasRealAmounts && (() => {
                      const seg = cobrosSegments!;
                      const breakdownCells = [
                        { label: "F1 Empresa", value: seg.empresa.r1.amount, count: seg.empresa.r1.count, note: "R1 · cobros empresa" },
                        { label: "F2 Remisiones", value: seg.empresa.r2.amount, count: seg.empresa.r2.count, note: "R2 · remisiones" },
                        { label: "Tiendas", value: seg.almacenes.amount, count: seg.almacenes.count, note: "Cobros POS almacenes" },
                        { label: "Retail", value: seg.retailFinanciero.amount, count: seg.retailFinanciero.count, note: "Canal financiero" },
                      ].filter(c => c.value > 0 || c.count > 0);
                      if (breakdownCells.length === 0) return null;
                      return (
                        <div className="ag-insight-card" style={{ marginBottom: S[3] }}>
                          <div className="ag-intel-header" style={{
                            fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
                            color: C.blueDark, textTransform: "uppercase" as const, letterSpacing: "0.07em",
                          }}>
                            Cobros del período · desglose por segmento
                          </div>
                          <div style={{
                            display: "grid",
                            gridTemplateColumns: `repeat(${breakdownCells.length}, 1fr)`,
                          }}>
                            {breakdownCells.map((cell, i) => (
                              <div key={cell.label} style={{
                                padding:     `${S[2] + 2}px ${S[4]}px`,
                                borderRight: i < breakdownCells.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                              }}>
                                <div style={{
                                  fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
                                  color: C.inkFaint, textTransform: "uppercase" as const,
                                  letterSpacing: "0.06em", marginBottom: S[1],
                                }}>
                                  {cell.label}
                                </div>
                                <div title={fmtCOP(cell.value)} style={{
                                  fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.black,
                                  color: cell.value > 0 ? C.ink : C.inkMid, lineHeight: 1.1,
                                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                  fontVariantNumeric: "tabular-nums", marginBottom: 2,
                                }}>
                                  {cell.value > 0 ? fmtCOP(cell.value) : "—"}
                                </div>
                                <div style={{
                                  fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, lineHeight: 1.4,
                                }}>
                                  {cell.count > 0 ? `${cell.count} recibos · ${cell.note}` : cell.note}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Row 2: Aging — 4 buckets con semáforo correcto ── */}
                    <div style={{
                      display:             "grid",
                      gridTemplateColumns: "repeat(4, 1fr)",
                      gap:                 S[2],
                      marginBottom:        S[3],
                    }}>
                      {(([
                        { key: "0-30",  label: "Cartera sana",     sublabel: "dentro de plazo", accent: "#22c55e" },
                        { key: "31-60", label: "Atención leve",    sublabel: "31 – 60 días",    accent: "#eab308" },
                        { key: "61-90", label: "Riesgo",           sublabel: "61 – 90 días",    accent: "#f97316" },
                        { key: "90+",   label: "Acción inmediata", sublabel: "+90 días",         accent: "#ef4444" },
                      ]) as Array<{ key: string; label: string; sublabel: string; accent: string }>).map(({ key, label, sublabel, accent }) => {
                        const bucket  = findBucket(key);
                        const amount  = bucket?.amount  ?? 0;
                        const clients = bucket?.clients ?? 0;
                        // 0-30: green even when empty (no overdue balance = good signal)
                        const activeColor = amount > 0 ? accent : (key === "0-30" ? "#22c55e" : C.lineSubtle);
                        return (
                          <div key={key} style={{
                            border:       `1px solid ${activeColor}33`,
                            borderTop:    `3px solid ${activeColor}`,
                            borderRadius: 14,
                            background:   "linear-gradient(180deg, #ffffff, #FAFBFF)",
                            padding:      `${S[3]}px ${S[3]}px`,
                            boxShadow:    "0 1px 4px rgba(0,74,173,.05)",
                          }}>
                            <div style={{ ...LABEL, marginBottom: 2, color: amount > 0 ? accent : C.inkFaint }}>{label}</div>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: S[1] }}>{sublabel}</div>
                            <div style={{ ...VALUE, fontSize: T.sz.lg, color: amount > 0 ? accent : C.inkMid }}>
                              {hasCartera ? fmtCOP(amount) : "—"}
                            </div>
                            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[1] }}>
                              {hasCartera ? `${clients} cliente${clients !== 1 ? "s" : ""}` : "Sin datos"}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* ── Cartera movement interpretation — temporal signal from aging distribution ──
                         Interprets the DISTRIBUTION across buckets as a movement signal.
                         No historical data needed: structure of aging IS the evolution story. */}
                    {hasCartera && (() => {
                      const amt90p  = _b90p;
                      const amt6190 = _b6190;
                      const amt3160 = _b3160;
                      const amt0030 = findBucket("0-30")?.amount ?? 0;

                      type MovVariant = "stable" | "watch" | "risk";
                      const signal: { label: string; variant: MovVariant } =
                        amt90p  > 0 ? { label: "cartera envejeciendo · acción urgente en +90d",          variant: "risk"   }
                      : amt6190 > 0 ? { label: "deterioro activo · cartera acumulándose en 61-90 días",  variant: "watch"  }
                      : amt3160 > 0 ? { label: "señales tempranas · monitoreo preventivo en 31-60 días", variant: "watch"  }
                      : amt0030 > 0 ? { label: "cartera saludable · sin vencimientos · flujo normal",    variant: "stable" }
                      :               { label: "sin cartera activa · verificar fuente SAG",              variant: "stable" };

                      return (
                        <div style={{
                          display:    "flex",
                          alignItems: "center",
                          gap:        S[2],
                          marginBottom: S[3],
                          flexWrap:   "wrap" as const,
                        }}>
                          <span className={`ag-movement-tag ag-movement-tag--${signal.variant}`}>
                            {signal.label}
                          </span>
                          {amt90p > 0 && (
                            <span className="ag-movement-tag ag-movement-tag--risk">
                              {fmtCOP(amt90p)} vencido crítico
                            </span>
                          )}
                          {amt6190 > 0 && amt90p === 0 && (
                            <span className="ag-movement-tag ag-movement-tag--watch">
                              {fmtCOP(amt6190)} en riesgo
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </>
                );
              })()}


              {/* ── Detalle colapsable: top deudores como perfiles ejecutivos ── */}
              {carteraKpis?.hasData && carteraKpis!.top5Debtors.length > 0 && (
                <details style={{ marginBottom: S[4] }}>
                  <summary style={{
                    fontFamily:  T.mono,
                    fontSize:    T.sz.xs,
                    fontWeight:  T.wt.bold,
                    color:       C.inkMid,
                    cursor:      "pointer",
                    padding:     `${S[2]}px ${S[3]}px`,
                    background:  C.surfaceAlt,
                    border:      `1px solid ${C.line}`,
                    borderRadius: R.sm,
                    listStyle:   "none",
                    display:     "flex",
                    alignItems:  "center",
                    gap:         8,
                  }}>
                    <span style={{ color: C.inkFaint }}>▶</span>
                    Top deudores por prioridad · {carteraKpis!.top5Debtors.length} perfiles accionables
                  </summary>

                  {/* ── Profile cards ── */}
                  <div style={{
                    border:       `1px solid ${C.line}`,
                    borderTop:    "none",
                    borderRadius: `0 0 ${R.sm}px ${R.sm}px`,
                    padding:      S[3],
                    background:   C.surface,
                    marginBottom: S[1],
                  }}>

                    {/* Section header */}
                    <div style={{
                      fontFamily:    T.mono,
                      fontSize:      T.sz["2xs"],
                      fontWeight:    T.wt.bold,
                      color:         C.inkFaint,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom:  S[3],
                      paddingBottom:  S[2],
                      borderBottom:  `1px solid ${C.lineSubtle}`,
                    }}>
                      Clientes con cartera vencida · acción requerida
                    </div>

                    {/* Cards grid */}
                    <div style={{
                      display:             "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                      gap:                 S[3],
                      marginBottom:        S[3],
                    }}>
                      {carteraKpis!.top5Debtors.map((d, idx) => {
                        const isCritical = d.maxDpd > 60;
                        const isWarning  = d.maxDpd > 30 && !isCritical;
                        const accentColor = isCritical ? "#f87171"
                                          : isWarning  ? "#fbbf24"
                                          : "#4ade80";
                        const headerBg    = isCritical ? "#fff1f2"
                                          : isWarning  ? "#fffbeb"
                                          : "#f0fdf4";
                        const badgeBg     = isCritical ? "#fee2e2"
                                          : isWarning  ? "#fef3c7"
                                          : "#dcfce7";
                        const badgeColor  = isCritical ? "#dc2626"
                                          : isWarning  ? "#92400e"
                                          : "#16a34a";
                        const badgeLabel  = isCritical ? "CRÍTICO"
                                          : isWarning  ? "ATENCIÓN"
                                          : "NORMAL";
                        const accion      = d.maxDpd > 90 ? "Iniciar proceso de cobro judicial"
                                          : d.maxDpd > 60 ? "Llamada de cobro urgente · escalar a gerencia"
                                          : d.maxDpd > 30 ? "Enviar recordatorio formal · bloquear pedidos"
                                          : "Monitorear · confirmar fecha de pago";
                        const clientHref  = d.customerId
                          ? `/${orgSlug}/customer-360?customerId=${d.customerId}`
                          : d.slug
                          ? `/${orgSlug}/customer-360?slug=${d.slug}`
                          : d.nit
                          ? `/${orgSlug}/customer-360?nit=${encodeURIComponent(d.nit)}`
                          : `/${orgSlug}/customer-360`;

                        const isConsumidorFinal = d.name.toLowerCase().includes("consumidor");

                        return (
                          <a
                            key={d.slug ?? idx}
                            href={clientHref}
                            style={{ textDecoration: "none", display: "flex" }}
                          >
                            <div style={{
                              flex:          1,
                              border:        `1.5px solid ${isCritical ? "#fca5a5" : isConsumidorFinal ? "#d97706" : C.line}`,
                              borderLeft:    `4px solid ${accentColor}`,
                              borderRadius:  R.md,
                              overflow:      "hidden",
                              background:    "#ffffff",
                              display:       "flex",
                              flexDirection: "column",
                            }}>

                              {/* Card header: name + badge */}
                              <div style={{
                                background:   headerBg,
                                borderBottom: `1px solid ${C.lineSubtle}`,
                                padding:      `${S[2]}px ${S[3]}px`,
                                display:      "flex",
                                alignItems:   "center",
                                gap:          8,
                                flexShrink:   0,
                              }}>
                                {/* Priority rank */}
                                <span style={{
                                  fontFamily:   T.mono,
                                  fontSize:     10,
                                  fontWeight:   T.wt.black,
                                  color:        isCritical ? "#dc2626" : C.inkGhost,
                                  background:   isCritical ? "#fee2e2" : C.lineSubtle,
                                  borderRadius: "50%",
                                  width:        20,
                                  height:       20,
                                  display:      "flex",
                                  alignItems:   "center",
                                  justifyContent: "center",
                                  flexShrink:   0,
                                }}>
                                  {idx + 1}
                                </span>
                                <span style={{
                                  fontFamily:    T.sans,
                                  fontSize:      T.sz.xs,
                                  fontWeight:    T.wt.bold,
                                  color:         isCritical ? "#dc2626" : C.inkMid,
                                  flex:          1,
                                  lineHeight:    1.3,
                                  overflow:      "hidden",
                                  textOverflow:  "ellipsis",
                                  whiteSpace:    "nowrap",
                                }}>
                                  {d.name}
                                  {isConsumidorFinal && (
                                    <span style={{
                                      fontFamily:    T.mono,
                                      fontSize:      9,
                                      fontWeight:    T.wt.bold,
                                      color:         "#92400e",
                                      background:    "#fef3c7",
                                      border:        "1px solid #fde68a",
                                      borderRadius:  3,
                                      padding:       "1px 5px",
                                      marginLeft:    6,
                                      letterSpacing: "0.03em",
                                      display:       "inline-block",
                                    }}>
                                      sin NIT · depurar
                                    </span>
                                  )}
                                </span>
                                <span style={{
                                  fontFamily:   T.mono,
                                  fontSize:     9,
                                  fontWeight:   T.wt.bold,
                                  background:   badgeBg,
                                  color:        badgeColor,
                                  padding:      "2px 6px",
                                  borderRadius: 3,
                                  flexShrink:   0,
                                  letterSpacing: "0.04em",
                                }}>
                                  {badgeLabel}
                                </span>
                              </div>

                              {/* KPIs row: vencido + total + DPD + concentración */}
                              <div style={{
                                display:             "grid",
                                gridTemplateColumns: "1fr 1fr",
                                borderBottom:        `1px solid ${C.lineSubtle}`,
                              }}>
                                {[
                                  { label: "Vencido",      value: fmtCOP(d.overdueReceivable), urgent: true  },
                                  { label: "Total abierto", value: fmtCOP(d.totalReceivable),  urgent: false },
                                  { label: "DPD máximo",   value: d.maxDpd > 0 ? `+${d.maxDpd}d` : "—", urgent: isCritical },
                                  { label: "Concentración", value: `${d.share.toFixed(0)}%`,   urgent: d.share > 20 },
                                ].map((kpi, ki) => (
                                  <div key={ki} style={{
                                    padding:      `${S[2]}px ${S[3]}px`,
                                    borderRight:  ki % 2 === 0 ? `1px solid ${C.lineSubtle}` : "none",
                                    borderBottom: ki < 2 ? `1px solid ${C.lineSubtle}` : "none",
                                  }}>
                                    <div style={{
                                      fontFamily: T.mono,
                                      fontSize:   T.sz["2xs"],
                                      color:      C.inkFaint,
                                      textTransform: "uppercase",
                                      letterSpacing: "0.04em",
                                      marginBottom: 2,
                                    }}>
                                      {kpi.label}
                                    </div>
                                    <div style={{
                                      fontFamily:    T.mono,
                                      fontSize:      T.sz.md,
                                      fontWeight:    T.wt.black,
                                      color:         kpi.urgent ? "#dc2626" : C.ink,
                                      letterSpacing: "-0.02em",
                                      lineHeight:    1,
                                    }}>
                                      {kpi.value}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Acción sugerida */}
                              <div style={{
                                padding:    `${S[2]}px ${S[3]}px`,
                                background: isCritical ? "#fff8f8" : C.white,
                                flex:       1,
                              }}>
                                <div style={{
                                  fontFamily: T.mono,
                                  fontSize:   T.sz["2xs"],
                                  color:      C.inkFaint,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.04em",
                                  marginBottom: 3,
                                }}>
                                  Acción sugerida
                                </div>
                                <div style={{
                                  fontFamily: T.mono,
                                  fontSize:   T.sz.xs,
                                  color:      isCritical ? "#dc2626" : C.inkMid,
                                  fontWeight: T.wt.semibold,
                                  lineHeight: 1.4,
                                }}>
                                  {accion}
                                </div>
                              </div>

                              {/* CTA footer */}
                              <div style={{
                                padding:        `${S[2]}px ${S[3]}px`,
                                borderTop:      `1px solid ${C.lineSubtle}`,
                                display:        "flex",
                                alignItems:     "center",
                                justifyContent: "flex-end",
                                flexShrink:     0,
                              }}>
                                <span style={{
                                  fontFamily: T.mono,
                                  fontSize:   T.sz.xs,
                                  fontWeight: T.wt.bold,
                                  color:      isCritical ? "#dc2626" : "#004AAD",
                                }}>
                                  Ver perfil →
                                </span>
                              </div>

                            </div>
                          </a>
                        );
                      })}
                    </div>

                    {/* CTA if more than 5 */}
                    {carteraKpis!.top5Debtors.length >= 5 && (
                      <div style={{
                        textAlign: "center",
                        paddingTop: S[2],
                        borderTop:  `1px solid ${C.lineSubtle}`,
                      }}>
                        <a href={`/${orgSlug}/collections`} style={{
                          fontFamily:     T.mono,
                          fontSize:       T.sz.xs,
                          fontWeight:     T.wt.bold,
                          color:          "#dc2626",
                          textDecoration: "none",
                          padding:        "6px 16px",
                          border:         "1px solid #fca5a5",
                          borderRadius:   R.sm,
                          background:     "#fff8f8",
                          display:        "inline-block",
                        }}>
                          Ver cola completa de cobros →
                        </a>
                      </div>
                    )}

                  </div>
                </details>
              )}

              {/* ── Cartera histórica por depurar ─────────────────────────────
                   Solo años anteriores (invoiceDate < 2026-01-01) con saldo abierto.
                   Riesgo de depuración — NO es cartera operativa 2026.
                   ──────────────────────────────────────────────────────────── */}
              {historicalCartera.length > 0 && historicalCartera.some(h => h.totalBalance > 0) && (() => {
                const SHOW_YEARS = [2025, 2024, 2023];
                const fmtH = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 0 });

                // Rows for 2023-2025 individual; everything older → "Anteriores"
                type HistRow = { label: string; total: number; overdue: number; docs: number };
                const rows: HistRow[] = [];
                let anteriorTotal = 0, anteriorOverdue = 0, anteriorDocs = 0;
                for (const h of historicalCartera) {
                  if (SHOW_YEARS.includes(h.year)) {
                    rows.push({ label: String(h.year), total: h.totalBalance, overdue: h.overdueBalance, docs: h.docCount });
                  } else {
                    anteriorTotal   += h.totalBalance;
                    anteriorOverdue += h.overdueBalance;
                    anteriorDocs    += h.docCount;
                  }
                }
                if (anteriorTotal > 0) {
                  rows.push({ label: "Anteriores", total: anteriorTotal, overdue: anteriorOverdue, docs: anteriorDocs });
                }
                const grandTotal   = historicalCartera.reduce((s, h) => s + h.totalBalance,   0);
                const grandOverdue = historicalCartera.reduce((s, h) => s + h.overdueBalance, 0);

                return (
                  <details style={{ marginBottom: S[4] }}>
                    <summary style={{
                      fontFamily:   T.mono,
                      fontSize:     T.sz.xs,
                      fontWeight:   T.wt.bold,
                      color:        "#92400e",
                      cursor:       "pointer",
                      padding:      `${S[2]}px ${S[3]}px`,
                      background:   "#fffbeb",
                      border:       "1px solid #fde68a",
                      borderRadius: R.sm,
                      listStyle:    "none",
                      display:      "flex",
                      alignItems:   "center",
                      gap:          8,
                    }}>
                      <span style={{ color: "#d97706" }}>▶</span>
                      Cartera histórica por depurar · {rows.length} período{rows.length !== 1 ? "s" : ""}
                      <span style={{
                        fontFamily:   T.mono,
                        fontSize:     9,
                        fontWeight:   T.wt.bold,
                        background:   "#fef3c7",
                        color:        "#92400e",
                        border:       "1px solid #fde68a",
                        borderRadius: 3,
                        padding:      "1px 6px",
                        marginLeft:   "auto",
                      }}>
                        {fmtH(grandTotal)} · {fmtH(grandOverdue)} vencido
                      </span>
                    </summary>

                    <div style={{
                      border:       "1px solid #fde68a",
                      borderTop:    "none",
                      borderRadius: `0 0 ${R.sm}px ${R.sm}px`,
                      background:   "#fffdf0",
                      padding:      S[3],
                      marginBottom: S[1],
                    }}>
                      {/* Header note */}
                      <div style={{
                        fontFamily:    T.mono,
                        fontSize:      T.sz["2xs"],
                        color:         "#92400e",
                        marginBottom:  S[3],
                        paddingBottom: S[2],
                        borderBottom:  "1px solid #fde68a",
                        lineHeight:    1.5,
                      }}>
                        Saldo vivo (OPEN/PARTIAL/OVERDUE) en invoiceDate anteriores a 2026-01-01.
                        Pendiente de conciliación con XML/documentos de años anteriores.
                        NO incluir en métricas operativas 2026.
                      </div>

                      {/* Year table */}
                      <div style={{ overflowX: "auto" as const }}>
                        <table style={{
                          width:          "100%",
                          borderCollapse: "collapse" as const,
                          fontFamily:     T.mono,
                          fontSize:       T.sz.xs,
                        }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid #fde68a" }}>
                              {["Año", "Documentos", "Saldo abierto", "Vencido", "% mora"].map(h => (
                                <th key={h} style={{
                                  textAlign:     "left" as const,
                                  padding:       `${S[1]}px ${S[2]}px`,
                                  color:         "#92400e",
                                  fontWeight:    T.wt.bold,
                                  fontSize:      T.sz["2xs"],
                                  textTransform: "uppercase" as const,
                                  letterSpacing: "0.05em",
                                  whiteSpace:    "nowrap" as const,
                                }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(r => {
                              const mora = r.total > 0 ? (r.overdue / r.total * 100).toFixed(0) : "0";
                              const moraCritical = Number(mora) > 70;
                              return (
                                <tr key={r.label} style={{ borderBottom: "1px solid #fef3c7" }}>
                                  <td style={{ padding: `${S[1]}px ${S[2]}px`, fontWeight: T.wt.bold, color: "#78350f" }}>
                                    {r.label}
                                  </td>
                                  <td style={{ padding: `${S[1]}px ${S[2]}px`, color: C.inkMid }}>
                                    {r.docs.toLocaleString("es-CO")}
                                  </td>
                                  <td style={{ padding: `${S[1]}px ${S[2]}px`, color: C.inkMid }}>
                                    {fmtH(r.total)}
                                  </td>
                                  <td style={{ padding: `${S[1]}px ${S[2]}px`, color: moraCritical ? "#dc2626" : "#92400e", fontWeight: T.wt.semibold }}>
                                    {fmtH(r.overdue)}
                                  </td>
                                  <td style={{ padding: `${S[1]}px ${S[2]}px`, color: moraCritical ? "#dc2626" : "#92400e", fontWeight: T.wt.bold }}>
                                    {mora}%
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{ borderTop: "1px solid #fde68a" }}>
                              <td style={{ padding: `${S[1]}px ${S[2]}px`, fontWeight: T.wt.black, color: "#78350f" }}>
                                Total
                              </td>
                              <td style={{ padding: `${S[1]}px ${S[2]}px`, color: C.inkMid }}>
                                {historicalCartera.reduce((s, h) => s + h.docCount, 0).toLocaleString("es-CO")}
                              </td>
                              <td style={{ padding: `${S[1]}px ${S[2]}px`, fontWeight: T.wt.bold, color: "#78350f" }}>
                                {fmtH(grandTotal)}
                              </td>
                              <td style={{ padding: `${S[1]}px ${S[2]}px`, fontWeight: T.wt.bold, color: "#dc2626" }}>
                                {fmtH(grandOverdue)}
                              </td>
                              <td style={{ padding: `${S[1]}px ${S[2]}px`, fontWeight: T.wt.bold, color: "#dc2626" }}>
                                {grandTotal > 0 ? (grandOverdue / grandTotal * 100).toFixed(0) : "0"}%
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {/* Depuración note */}
                      <div style={{
                        marginTop:  S[3],
                        padding:    `${S[2]}px ${S[3]}px`,
                        background: "#fef9c3",
                        border:     "1px solid #fde68a",
                        borderRadius: R.sm,
                        fontFamily: T.mono,
                        fontSize:   T.sz["2xs"],
                        color:      "#713f12",
                        lineHeight: 1.5,
                      }}>
                        Próximo paso: conciliar con XML de facturas y extractos bancarios
                        entregados por la empresa. Cada año debe revisarse individualmente
                        antes de marcar como PAID o WRITTEN_OFF.
                      </div>
                    </div>
                  </details>
                );
              })()}

              {/* ── Action links ── */}
              <div style={{ display: "flex", gap: S[2], marginBottom: S[5], flexWrap: "wrap" as const }}>
                <Link href={`/${orgSlug}/collections`} style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
                  padding: "5px 12px", borderRadius: R.sm, textDecoration: "none",
                  border: `1px solid ${C.red}`, color: C.red, background: "#fff8f8",
                }}>
                  Ver cola urgente →
                </Link>
                <Link href={`/${orgSlug}/customer-360?hasOverdue=true`} style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
                  padding: "5px 12px", borderRadius: R.sm, textDecoration: "none",
                  border: "1px solid var(--ag-line, rgba(0,74,173,.18))", color: C.blueDark, background: "var(--ag-brand-50, #EEF5FF)",
                }}>
                  Ver clientes con mora →
                </Link>
                <Link href={`/${orgSlug}/reconciliation`} style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
                  padding: "5px 12px", borderRadius: R.sm, textDecoration: "none",
                  border: `1px solid ${C.line}`, color: C.inkMid, background: C.white,
                }}>
                  Conciliación Inteligente →
                </Link>
              </div>
            </>
          ) : (
            <>
              <BlockNotApplicable
                label="Cartera y Riesgo"
                accent="#dc2626"
                message={viewCtx.blockMsg.cartera ?? ""}
                switchHref={`/${orgSlug}/executive?view=consolidado${carteraWindowParam ? `&carteraWindow=${carteraWindowParam}` : ""}`}
              />
              {/* Cobros R2 — visible en vista F2 aunque cartera formal sea N/A */}
              {view === "f2" && cobrosSegments && (
                (() => {
                  const r2   = cobrosSegments.empresa.r2;
                  const MONO = T.mono;
                  const hasAmt = r2.count > 0 && r2.amount > 0;
                  return (
                    <div style={{
                      border:       `1px solid ${C.lineSubtle}`,
                      borderLeft:   `3px solid ${C.line}`,
                      borderRadius: R.sm,
                      background:   C.surface,
                      padding:      `${S[3]}px ${S[4]}px`,
                      marginBottom: S[3],
                    }}>
                      <div style={{
                        fontFamily:    MONO,
                        fontSize:      T.sz.xs,
                        fontWeight:    T.wt.semibold,
                        color:         C.inkFaint,
                        textTransform: "uppercase",
                        letterSpacing: "0.07em",
                        marginBottom:  S[1],
                      }}>
                        Cobros R2 · Remisiones F2
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: T.sz.xl, fontWeight: T.wt.black, color: hasAmt ? C.ink : C.inkMid, lineHeight: 1.1 }}>
                        {hasAmt ? fmtCOP(r2.amount) : "—"}
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[1] }}>
                        {r2.count > 0
                          ? `${r2.count} recibo${r2.count !== 1 ? "s" : ""}`
                          : "Sin cobros en período"}
                      </div>
                    </div>
                  );
                })()
              )}
            </>
          )}

          {/* Zone breath — structural separation between financial risk (B2) and treasury (B3) */}
          <hr className="ag-zone-breath" aria-hidden="true" />

          {/* ══ BLOQUE 3 — TESORERÍA OPERATIVA · CONTROL PRESUPUESTAL ═════════
               A: Cuentas por pagar · Bancos y créditos · Tesorería inmediata
               B: Control presupuestal · ejecución · desviación · alertas
               ════════════════════════════════════════════════════════════════ */}
          {viewCtx.cxpScope !== "n/a" ? (
            <>
              <SectionHeader
                label="Tesorería Operativa"
                accent="#004AAD"
                sublabel="Cuentas por pagar · Créditos · Caja · Presupuesto"
              />
              <TesoreriaOperativa orgSlug={orgSlug} apKpis={apKpis} oldestAp={oldestApRecord} />
              <ControlPresupuestal orgSlug={orgSlug} periodLabel={periodLabel} />
            </>
          ) : (
            <BlockNotApplicable
              label="Tesorería Operativa"
              accent="#004AAD"
              message={viewCtx.blockMsg.cxp ?? ""}
              switchHref={`/${orgSlug}/executive?view=consolidado${carteraWindowParam ? `&carteraWindow=${carteraWindowParam}` : ""}`}
            />
          )}

          {/* ══ BLOQUE 4 — RADAR COMERCIAL EJECUTIVO ════════════════════════════
               Señales de acción · Inteligencia por canal · Rendimiento del período.
               Qué revisar hoy · Decisiones, no reportes.
               ════════════════════════════════════════════════════════════════ */}
          <SectionHeader
            label="Radar Comercial Ejecutivo"
            accent={C.blueDark}
            sublabel={`${viewCtx.perfLabel} · ${periodLabel}`}
            tier="contextual"
          />

          {/* ── Subbloque C — Rendimiento mensual · 3 señales ── */}
          {(() => {
            // TC-03 audit: paidAmount=0 for all SAG-synced AR (mapper sets it explicitly).
            // Use cobrosBreakdown.totalCobros (from SaleRecord R1/R2/RS/RC/RG/RA/SI/AN)
            // as the real cobros numerator. collectionRate from commercialKpis is discarded.
            const cobrosTotal  = cobrosBreakdown?.totalCobros ?? null;
            const facturadoTot = commercialKpis?.totalInvoiced ?? null;
            const recaudoRate  = cobrosTotal != null && facturadoTot != null && facturadoTot > 0
              ? Math.round((cobrosTotal / facturadoTot) * 10000) / 100
              : null;
            const rendimientoCards: DailyCard[] = [
              {
                id:       "facturado-acumulado",
                label:    "Facturado acumulado (histórico)",
                value:    commercialKpis ? fmtCOP(commercialKpis.totalInvoiced) : "—",
                sub:      `${commercialKpis?.openInvoiceCount ?? 0} facturas abiertas · histórico`,
                dotColor: C.inkMid,
                href:     `/${orgSlug}/sales`,
                urgent:   false,
                severity: commercialKpis ? "ok" : "neutral",
              },
              {
                id:       "cobros-identificados",
                label:    "Cobros identificados",
                value:    cobrosTotal != null ? fmtCOP(cobrosTotal) : "—",
                sub:      "Cobros SAG registrados · sin conciliar a facturas",
                dotColor: cobrosTotal != null && cobrosTotal > 0 ? C.green : C.inkGhost,
                href:     `/${orgSlug}/sales`,
                urgent:   false,
                severity: cobrosTotal != null && cobrosTotal > 0 ? "ok" : "neutral",
              },
              {
                id:       "tasa-recaudo",
                label:    "Tasa de recaudo estimada",
                value:    recaudoRate != null ? `${recaudoRate.toFixed(1)}%` : "—",
                sub:      "Cobros SAG / Facturado histórico · no reconciliado",
                dotColor: recaudoRate != null
                  ? recaudoRate >= 80 ? C.green : recaudoRate >= 60 ? C.amber : C.inkLight
                  : C.inkGhost,
                href:     `/${orgSlug}/sales`,
                urgent:   false,
                severity: recaudoRate == null ? "neutral"
                        : recaudoRate >= 80  ? "ok"
                        : recaudoRate >= 60  ? "warning"
                        :                      "neutral",
              },
            ];
            return (
              <div style={{ marginBottom: S[4] }}>
                <DailyCarousel cards={rendimientoCards} />
              </div>
            );
          })()}

          {/* F2 source mix — role-gated, collapsed */}
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

          {/* ── Subbloque D — CTA ejecutivo ── */}
          <div style={{
            borderTop:   `1px solid ${C.lineSubtle}`,
            paddingTop:  S[3],
            marginBottom: S[5],
            display:     "flex",
            alignItems:  "center",
            justifyContent: "flex-end",
          }}>
            <Link href={`/${orgSlug}/sales`} style={{
              fontFamily:     T.mono,
              fontSize:       T.sz.sm,
              fontWeight:     T.wt.bold,
              color:          "#004AAD",
              textDecoration: "none",
              letterSpacing:  "0.01em",
            }}>
              Ver decisiones comerciales →
            </Link>
          </div>

          {/* Escalamiento y automatizaciones */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: S[5] }}>
            <ActionButton
              orgSlug={orgSlug}
              label="Escalar desviacion"
              variant="danger"
              size="sm"
              prefill={{
                actionType: "ESCALAR_A_GERENCIA",
                sourceModule: "torre_de_control",
                title: `Escalamiento ejecutivo — desviacion detectada · ${periodLabel}`,
                description: criticalAlerts.length > 0
                  ? `${criticalAlerts.length} alerta${criticalAlerts.length > 1 ? "s" : ""} critica${criticalAlerts.length > 1 ? "s" : ""} activa${criticalAlerts.length > 1 ? "s" : ""}. Requiere atencion gerencial.`
                  : "Desviacion identificada en Torre de Control. Requiere revision ejecutiva.",
                priority: "URGENT",
              }}
            />
            <ActionButton
              orgSlug={orgSlug}
              label="Crear comite"
              variant="outline"
              size="sm"
              prefill={{
                actionType: "CREAR_TAREA_COMERCIAL",
                sourceModule: "torre_de_control",
                title: `Comite de seguimiento ejecutivo — ${periodLabel}`,
                description: `Convocar comite de seguimiento para revision de resultados del periodo ${periodLabel}.`,
                priority: "HIGH",
              }}
            />
            <ActionButton
              orgSlug={orgSlug}
              label="Asignar investigacion"
              variant="outline"
              size="sm"
              prefill={{
                actionType: "CREAR_TAREA_COMERCIAL",
                sourceModule: "torre_de_control",
                title: `Investigacion ejecutiva — ${periodLabel}`,
                description: "Asignar analisis profundo de desviaciones o anomalias detectadas en Torre de Control.",
                priority: "HIGH",
              }}
            />
            <ActionButton
              orgSlug={orgSlug}
              label="Informe recurrente"
              variant="purple"
              size="sm"
              prefill={{
                actionType: "PROGRAMAR_INFORME",
                sourceModule: "torre_de_control",
                title: `Informe ejecutivo recurrente — ${organization.name}`,
                description: `Programar generacion automatica de informe ejecutivo mensual a partir de ${periodLabel}.`,
                priority: "MEDIUM",
              }}
            />
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

function fmtShortDate(d: Date): string {
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "2-digit" });
}



// ── Section Header ────────────────────────────────────────────────────────────
// Reusable section separator with accent color + optional badge + optional link.

// ── SectionHeader tiers — executive attention priority zones ──────────────────
// primary:     B1 (Centro de Mando Diario), B2 (Cartera y Riesgo)
//              → 4px border, larger label, more margin — highest dominance
// operational: B3 (Tesorería), B5 (Decisiones) — standard weight (default)
// contextual:  B4 (Radar Comercial) — quieter, analytical layer
function SectionHeader({
  label,
  accent,
  sublabel,
  badge,
  href,
  hrefLabel,
  tier = "operational",
}: {
  label:      string;
  accent:     string;
  sublabel?:  string;
  badge?:     { text: string; color: string };
  href?:      string;
  hrefLabel?: string;
  tier?:      "primary" | "operational" | "contextual";
}) {
  const borderWidth  = tier === "primary" ? 4 : tier === "contextual" ? 2 : 3;
  const fontSize     = tier === "primary" ? T.sz.lg : tier === "contextual" ? T.sz.sm : T.sz.md;
  const marginBottom = tier === "primary" ? S[6]    : tier === "contextual" ? S[4]    : S[5];
  const accentVis    = tier === "contextual" ? `${accent}bb` : accent;

  return (
    <div style={{
      display:       "flex",
      alignItems:    "center",
      gap:           S[2],
      paddingLeft:   tier === "primary" ? S[3] + 2 : S[3],
      paddingBottom: S[2],
      marginBottom,
      borderLeft:    `${borderWidth}px solid ${accentVis}`,
      borderBottom:  `1px solid ${accentVis}33`,
    }}>
      <div style={{
        fontFamily:    T.mono,
        fontSize,
        fontWeight:    T.wt.bold,
        color:         accentVis,
        textTransform: "uppercase" as const,
        letterSpacing: tier === "primary" ? "0.06em" : "0.07em",
      }}>
        {label}
      </div>
      {sublabel && (
        <span style={{ fontSize: T.sz["2xs"], color: C.inkFaint, fontFamily: T.mono }}>
          · {sublabel}
        </span>
      )}
      {badge && (
        <span style={{
          marginLeft:   S[1],
          fontSize:     T.sz["2xs"],
          fontWeight:   T.wt.bold,
          color:        badge.color,
          background:   `${badge.color}18`,
          border:       `1px solid ${badge.color}55`,
          borderRadius: R.card,
          padding:      "2px 10px",
          fontFamily:   T.mono,
        }}>
          {badge.text}
        </span>
      )}
      {href && hrefLabel && (
        <Link href={href} style={{
          marginLeft:     "auto",
          fontSize:       T.sz.xs,
          color:          accent,
          fontWeight:     T.wt.bold,
          textDecoration: "none",
          fontFamily:     T.mono,
        }}>
          {hrefLabel}
        </Link>
      )}
    </div>
  );
}

// ── Tesorería Operativa ────────────────────────────────────────────────────────
// Block A: 3 operational cards — CxP, Bancos y Créditos, Tesorería Inmediata.
// Empty state is operational (0 activos / sin registros), never placeholder spam.

function TesoreriaOperativa({ orgSlug, apKpis, oldestAp }: { orgSlug: string; apKpis: ApKpis | null; oldestAp: ApDocumentRecord | null }) {
  // ── CxP card — real AP data from SaleRecord (C1/G1/C2 creation, DC/DG reduction) ──
  // Note: SAG SOAP does not populate amount for AP codes → amount is 0 in most cases.
  // When netBalance=0 but docs exist, show the doc count as headline to avoid misleading $0.
  const hasAp      = apKpis !== null && apKpis.totalCreated.count > 0;
  const cxpAmtAvail = hasAp && apKpis!.netBalance > 0;
  const cxpValue   = !hasAp
    ? "—"
    : cxpAmtAvail
      ? fmtCOP(apKpis!.netBalance)
      : `${apKpis!.totalCreated.count} docs`;
  const cxpState   = hasAp
    ? cxpAmtAvail
      ? `${apKpis!.totalCreated.count} doc${apKpis!.totalCreated.count !== 1 ? "s" : ""} · saldo neto`
      : `${apKpis!.totalCreated.count} doc${apKpis!.totalCreated.count !== 1 ? "s" : ""} · monto sin detalle SAG`
    : "Sin obligaciones registradas";
  const cxpNote    = hasAp
    ? (cxpAmtAvail && apKpis!.topSuppliers.length > 0
        ? `Principales: ${apKpis!.topSuppliers.slice(0, 2).map(s => s.name).join(" · ")}`
        : "Ver detalle de documentos para identificar proveedores")
    : "Los documentos C1/G1/C2 de SAG activarán este indicador";

  // ── Tesorería inmediata — urgency signal: oldest AP obligation ──
  // Answers: "What payment requires the fastest attention?"
  // No dueDate available → saleDate is the obligation date proxy (labeled clearly).
  const hasOldestAp  = oldestAp !== null;
  const totalApDocs  = apKpis?.totalCreated.count ?? 0;
  const urgentDate   = hasOldestAp
    ? oldestAp!.saleDate.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "2-digit" })
    : null;
  const urgentName   = oldestAp?.customerName ?? null;
  const urgentCode   = oldestAp?.comprobante ?? (hasOldestAp ? oldestAp!.comprobanteCode : null);
  // Card 3 shows WHEN (oldest date) — card 1 shows HOW MANY (count/amount).
  // This eliminates duplication: each card now answers a different question.
  const depValue     = hasOldestAp ? (urgentDate ?? "—") : "—";
  const depState     = hasOldestAp && urgentName
    ? `Proveedor: ${urgentName}`
    : hasOldestAp ? "Obligación pendiente identificada" : "Sin obligaciones registradas";
  const depNote      = hasOldestAp
    ? `${totalApDocs} doc${totalApDocs !== 1 ? "s" : ""} en total${urgentCode ? ` · doc más antiguo: ${urgentCode}` : ""}`
    : "Los documentos C1/G1 de SAG activarán este indicador";

  const CARDS: {
    id:       string;
    label:    string;
    sublabel: string;
    accent:   string;
    lightBg:  string;
    value:    string;
    state:    string;
    note:     string;
    ctaLabel: string;
    ctaHref:  string;
  }[] = [
    {
      id:       "cxp",
      label:    "Cuentas por pagar",
      sublabel: "Proveedores · obligaciones operativas",
      accent:   "#004AAD",
      lightBg:  "#eff6ff",
      value:    cxpValue,
      state:    cxpState,
      note:     cxpNote,
      ctaLabel: "Ver obligaciones →",
      ctaHref:  `/${orgSlug}/finanzas/torre-control/cuentas-por-pagar`,
    },
    {
      id:       "bancos",
      label:    "Bancos y créditos activos",
      sublabel: "Créditos · leasing · líneas rotativas",
      accent:   "#0891b2",
      lightBg:  "#ecfeff",
      value:    "—",
      state:    "0 créditos activos registrados",
      note:     "Sincronización bancaria pendiente de configuración",
      ctaLabel: "Conectar banco →",
      ctaHref:  `/${orgSlug}/agentik`,
    },
    {
      id:       "tesoreria",
      label:    "Obligación más antigua",
      sublabel: "Fecha del documento AP más viejo pendiente",
      accent:   C.blueDark,
      lightBg:  "var(--ag-brand-50, #EEF5FF)",
      value:    depValue,
      state:    depState,
      note:     depNote,
      ctaLabel: "Ver vencimientos →",
      ctaHref:  `/${orgSlug}/finanzas/torre-control/cuentas-por-pagar`,
    },
  ];

  return (
    <div style={{ marginBottom: S[4] }}>
      {/* Block A sub-header */}
      <div style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
        color: "#004AAD", textTransform: "uppercase", letterSpacing: "0.06em",
        marginBottom: S[2],
      }}>
        Bloque A — Tesorería Operativa
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[3] }}>
        {CARDS.map((card) => (
          <a key={card.id} href={card.ctaHref} className="op-trea-card" style={{ textDecoration: "none", display: "flex" }}>
            <div className="ag-tcard" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              {/* Top brand bar */}
              <div className="ag-tcard-bar" />

              {/* Header */}
              <div style={{
                background: "var(--ag-brand-50, #EEF5FF)",
                borderBottom: `1px solid var(--ag-line)`,
                padding: `${S[2] + 4}px ${S[3]}px ${S[2]}px`,
              }}>
                <div style={{
                  fontFamily: T.sans, fontSize: T.sz.xs, fontWeight: T.wt.black,
                  color: card.accent, textTransform: "uppercase", letterSpacing: "0.06em",
                }}>
                  {card.label}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
                  {card.sublabel}
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: `${S[3]}px ${S[3]}px ${S[2]}px`, flex: 1 }}>
                <div
                  title={card.value}
                  style={{
                    fontFamily: T.mono, fontSize: 22, fontWeight: T.wt.black,
                    color: card.value === "—" ? C.inkGhost : C.ink,
                    letterSpacing: "-0.02em", lineHeight: 1, marginBottom: S[2],
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}
                >
                  {card.value}
                </div>
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid,
                  fontWeight: T.wt.semibold, marginBottom: 3, lineHeight: 1.3,
                }}>
                  {card.state}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, lineHeight: 1.4 }}>
                  {card.note}
                </div>
              </div>

              {/* CTA footer */}
              <div style={{
                padding: `${S[2]}px ${S[3]}px`, borderTop: `1px solid ${C.lineSubtle}`,
                display: "flex", alignItems: "center", justifyContent: "flex-end",
              }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: card.accent }}>
                  {card.ctaLabel}
                </span>
              </div>
            </div>
          </a>
        ))}
      </div>

    </div>
  );
}

// ── Control Presupuestal ──────────────────────────────────────────────────────
// Block B: 4-KPI budget row + progress bar + future-ready CTAs.
// Empty state shows contextual period label, not generic "waiting" text.

function ControlPresupuestal({ orgSlug, periodLabel }: { orgSlug: string; periodLabel: string }) {
  const hasData    = false;
  const aprobado   = 0;
  const ejecutado  = 0;
  const disponible = aprobado - ejecutado;
  const desviacion = ejecutado - aprobado;
  const pctConsumo = aprobado > 0 ? (ejecutado / aprobado) * 100 : 0;

  return (
    <div style={{ marginBottom: S[5] }}>
      {/* Block B sub-header */}
      <div style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
        color: "#004AAD", textTransform: "uppercase", letterSpacing: "0.06em",
        marginBottom: S[2],
      }}>
        Bloque B — Control Presupuestal
      </div>

      <div style={{
        border: `1.5px solid #bfdbfe`, borderLeft: `4px solid #1e40af`,
        borderRadius: R.md, overflow: "hidden", background: C.white,
      }}>
        {/* 4-KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", borderBottom: `1px solid ${C.lineSubtle}` }}>
          {([
            { label: "Presupuesto activo", value: hasData ? fmtCOP(aprobado)   : "—", sub: periodLabel,        urgent: false },
            { label: "Ejecutado",          value: hasData ? fmtCOP(ejecutado)  : "—", sub: "acumulado",        urgent: false },
            { label: "Disponible",         value: hasData ? fmtCOP(disponible) : "—", sub: "margen restante",  urgent: disponible < 0 },
            {
              label: "Desviación",
              value: hasData && desviacion !== 0
                ? (desviacion > 0 ? `+${fmtCOP(desviacion)}` : fmtCOP(Math.abs(desviacion)))
                : "—",
              sub:    desviacion > 0 ? "sobre presupuesto" : "dentro de límite",
              urgent: desviacion > 0,
            },
          ] as Array<{ label: string; value: string; sub: string; urgent: boolean }>).map((kpi, i) => (
            <div key={i} style={{ padding: `${S[3]}px ${S[4]}px`, borderRight: i < 3 ? `1px solid ${C.lineSubtle}` : "none" }}>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
                color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3,
              }}>
                {kpi.label}
              </div>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.black,
                color: kpi.urgent ? "#dc2626" : kpi.value === "—" ? C.inkGhost : C.ink,
                letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 2,
              }}>
                {kpi.value}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                {kpi.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Progress bar / empty state */}
        <div style={{ padding: `${S[3]}px ${S[4]}px` }}>
          {hasData ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Consumo presupuestal
                </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: pctConsumo > 90 ? "#dc2626" : "#004AAD" }}>
                  {pctConsumo.toFixed(1)}%
                </span>
              </div>
              <div style={{ height: 8, background: C.lineSubtle, borderRadius: 4, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${Math.min(100, pctConsumo)}%`,
                  background: pctConsumo > 90 ? "#ef4444" : pctConsumo > 75 ? "#f59e0b" : "#2563eb",
                  borderRadius: 4, transition: "width 0.4s ease",
                }} />
              </div>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: S[4] }}>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, fontWeight: T.wt.semibold, marginBottom: 3 }}>
                  No existen presupuestos activos para {periodLabel}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, lineHeight: 1.5 }}>
                  Control por área · por tienda · por campaña · alertas de desviación
                </div>
              </div>
              <Link href={`/${orgSlug}/agentik`} style={{
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
                padding: "6px 14px", borderRadius: R.sm, textDecoration: "none",
                border: "1px solid var(--ag-line, rgba(0,74,173,.18))", color: C.blueDark, background: "var(--ag-brand-50, #EEF5FF)",
                whiteSpace: "nowrap", flexShrink: 0,
              }}>
                Crear presupuesto →
              </Link>
            </div>
          )}
        </div>

        {/* CTA footer */}
        <div style={{
          padding: `${S[2]}px ${S[4]}px`, borderTop: `1px solid ${C.lineSubtle}`,
          background: "#f0f9ff", display: "flex", alignItems: "center", gap: S[3],
        }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            {hasData ? "Actualizado al cierre del día" : "Módulo disponible · pendiente primera carga presupuestal"}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: S[2] }}>
            <Link href={`/${orgSlug}/agentik`} style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.blueDark, textDecoration: "none" }}>
              Ver ejecución →
            </Link>
            <span style={{ color: C.lineSubtle }}>·</span>
            <Link href={`/${orgSlug}/alerts`} style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.blueDark, textDecoration: "none" }}>
              Configurar alertas →
            </Link>
          </div>
        </div>
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
          marginLeft: "auto", fontSize: T.sz.sm, color: C.blueDark, fontWeight: T.wt.bold, textDecoration: "none",
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

// ── Block Not Applicable ───────────────────────────────────────────────────────
// Shown when the active viewCtx marks a block as "n/a" for this operational view.
// Provides a clear message and a direct link back to Consolidado.

function BlockNotApplicable({
  label,
  accent,
  message,
  switchHref,
}: {
  label:      string;
  accent:     string;
  message:    string;
  switchHref: string;
}) {
  return (
    <div style={{ marginBottom: S[5] }}>
      <SectionHeader label={label} accent={accent} sublabel="No aplica en esta vista" />
      <div style={{
        background:   C.surfaceAlt,
        border:       `1px solid ${C.lineSubtle}`,
        borderRadius: R.md,
        padding:      `${S[3]}px ${S[4]}px`,
        display:      "flex",
        alignItems:   "center",
        gap:          S[3],
      }}>
        <div style={{ flex: 1, fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, lineHeight: 1.5 }}>
          {message}
        </div>
        <Link href={switchHref} style={{
          fontFamily:     T.mono,
          fontSize:       T.sz.xs,
          fontWeight:     T.wt.bold,
          padding:        "5px 12px",
          borderRadius:   R.sm,
          textDecoration: "none",
          border:         `1px solid ${C.line}`,
          color:          C.inkMid,
          background:     C.white,
          whiteSpace:     "nowrap" as const,
        }}>
          Ver Consolidado →
        </Link>
      </div>
    </div>
  );
}

// ── Cash Flow Block ────────────────────────────────────────────────────────────
// Bloque 4: movimientos del día + proyección de recuperación de cartera.
//
// Ingresos del día  = cobros recibidos hoy (PaymentRecord — datos reales).
// Egresos del día   = pendiente modelo de datos — placeholder profesional.
// Proyección H30/60/90 = fpaCashFlow.horizons (recuperación esperada de cartera).

function CashFlowBlock({
  todayIngresos,
  todayIngresosCount,
  cashFlow,
  notApplicableMsg,
  orgSlug,
}: {
  todayIngresos:      number;
  todayIngresosCount: number;
  cashFlow:           CashFlowSummary | null;
  notApplicableMsg:   string | null;
  orgSlug:            string;
}) {
  if (notApplicableMsg) {
    return (
      <div style={{
        background:   C.surfaceAlt,
        border:       `1px solid ${C.lineSubtle}`,
        borderRadius: R.md,
        padding:      `${S[3]}px ${S[4]}px`,
        marginBottom: S[5],
        fontFamily:   T.mono,
        fontSize:     T.sz.xs,
        color:        C.inkFaint,
      }}>
        {notApplicableMsg}
      </div>
    );
  }

  const h30 = cashFlow?.horizons?.[0];
  const h60 = cashFlow?.horizons?.[1];
  const h90 = cashFlow?.horizons?.[2];

  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: "1fr 1fr",
      gap:                 S[4],
      marginBottom:        S[5],
    }}>
      {/* Movimientos del día */}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "hidden" }}>
        <div style={{
          background:    "#ecfeff",
          borderBottom:  `1px solid #a5f3fc`,
          padding:       `${S[2]}px ${S[4]}px`,
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.bold,
          color:         "#0891b2",
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
        }}>
          Movimientos del día
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
          {([
            {
              label:  "Ingresos",
              value:  todayIngresos > 0 ? fmtCOP(todayIngresos) : "$0",
              sub:    todayIngresosCount > 0 ? `${todayIngresosCount} cobro${todayIngresosCount > 1 ? "s" : ""}` : "sin cobros hoy",
              color:  todayIngresos > 0 ? C.green : C.inkGhost,
              source: "PaymentRecord",
            },
            {
              label:  "Egresos",
              value:  "—",
              sub:    "pendiente carga",
              color:  C.inkGhost,
              source: "próx. fase",
            },
            {
              label:  "Saldo neto",
              value:  "—",
              sub:    "requiere egresos",
              color:  C.inkGhost,
              source: "",
            },
          ] as const).map((item, i) => (
            <div key={item.label} style={{
              padding:     `${S[3]}px ${S[3]}px`,
              borderRight: i < 2 ? `1px solid ${C.lineSubtle}` : "none",
            }}>
              <div style={{
                fontFamily:    T.mono,
                fontSize:      T.sz["2xs"],
                fontWeight:    T.wt.bold,
                color:         C.inkMid,
                textTransform: "uppercase" as const,
                letterSpacing: "0.05em",
                marginBottom:  4,
              }}>
                {item.label}
              </div>
              <div style={{
                fontFamily:    T.mono,
                fontSize:      T.sz.xl,
                fontWeight:    T.wt.black,
                color:         item.color,
                letterSpacing: "-0.02em",
                lineHeight:    1,
                marginBottom:  3,
              }}>
                {item.value}
              </div>
              <div style={{ fontSize: T.sz["2xs"], color: C.inkFaint, fontFamily: T.mono }}>
                {item.sub}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Proyección de recuperación */}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "hidden" }}>
        <div style={{
          background:    C.surfaceAlt,
          borderBottom:  `1px solid ${C.lineSubtle}`,
          padding:       `${S[2]}px ${S[4]}px`,
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.bold,
          color:         C.inkMid,
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
        }}>
          Proyección de recuperación · cartera
        </div>
        {cashFlow?.hasData ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
            {([
              { label: "30 días", horizon: h30 },
              { label: "60 días", horizon: h60 },
              { label: "90 días", horizon: h90 },
            ] as const).map(({ label, horizon }, i) => (
              <div key={label} style={{
                padding:     `${S[3]}px ${S[3]}px`,
                borderRight: i < 2 ? `1px solid ${C.lineSubtle}` : "none",
              }}>
                <div style={{
                  fontFamily:    T.mono,
                  fontSize:      T.sz["2xs"],
                  fontWeight:    T.wt.bold,
                  color:         C.inkMid,
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.05em",
                  marginBottom:  4,
                }}>
                  {label}
                </div>
                <div style={{
                  fontFamily:    T.mono,
                  fontSize:      T.sz.xl,
                  fontWeight:    T.wt.black,
                  color:         horizon && horizon.expected > 0 ? C.green : C.inkGhost,
                  letterSpacing: "-0.02em",
                  lineHeight:    1,
                  marginBottom:  3,
                }}>
                  {horizon ? fmtCOP(horizon.expected) : "—"}
                </div>
                <div style={{ fontSize: T.sz["2xs"], color: C.inkFaint, fontFamily: T.mono }}>
                  esperado · base
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: `${S[3]}px ${S[4]}px`, fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            Sin datos de cartera para proyección. Sincroniza el conector SAG.
          </div>
        )}
        <div style={{
          padding:        `${S[2]}px ${S[4]}px`,
          borderTop:      `1px solid ${C.lineSubtle}`,
          display:        "flex",
          justifyContent: "flex-end",
        }}>
          <Link href={`/${orgSlug}/customer-360`} style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
            color: C.blueDark, textDecoration: "none",
          }}>
            Ver flujo completo →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-04 detail panels moved to dedicated operational workspaces (UX-03).
// Routes: /finanzas/torre-control/cobros-hoy
//         /finanzas/torre-control/cobros-identificados
//         /finanzas/torre-control/consignaciones
//         /finanzas/torre-control/cuentas-por-pagar
// ─────────────────────────────────────────────────────────────────────────────

// (end of file)
