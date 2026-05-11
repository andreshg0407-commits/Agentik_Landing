/**
 * app/(app)/[orgSlug]/control-center/cobranza/page.tsx
 *
 * Torre de Control Ejecutiva — Centro de Mando Diario de Gerencia.
 *
 * ── Ventana gerencial ─────────────────────────────────────────────────────────
 *
 * Default: "current_year" (Año fiscal actual, e.g. 2026-01-01 → hoy).
 * Todas las consultas de cartera filtran por invoiceDate para evitar que
 * 6 años de histórico distorsionen los KPIs ejecutivos.
 *
 * Regla carry-over: si un documento es de año anterior PERO sigue abierto
 * (daysOverdue > 0), se incluye en la vista gerencial para no ocultar deuda viva.
 *
 * Modos disponibles (selector URL ?window=<mode>):
 *   current_year      → Año fiscal 2026 (default)
 *   current_and_prior → 2025-2026 con carry-over
 *   trailing_12       → Últimos 12 meses móviles
 *   full_history      → Todo el histórico (solo análisis/drill-down)
 *
 * ── Bloques ───────────────────────────────────────────────────────────────────
 *   A — Información del día  ("cómo amaneció el negocio")
 *   B — Información del mes  ("cómo vamos este mes")
 *   C — Vendedores           (empresa vs almacenes)
 *   D — Clientes / Líneas    (top deudores, top líneas)
 *   E — Obligaciones         (proveedores, bancos, créditos — pendiente de ingesta)
 *   F — Tareas y Alertas     (siempre visible)
 *
 * ⚠ paidAmount=0 en CustomerReceivable — SAG no exporta pagos/recibos.
 */

import Link               from "next/link";
import { formatDateShort, formatMonthYear, formatDateWeekday, formatDateWeekdayShort } from "@/lib/utils/formatDate";
import { requireOrgAccess }       from "@/lib/auth/org-access";
import { prisma }                 from "@/lib/prisma";
import { C, T, S, R, E }         from "@/lib/ui/tokens";
import { FiscalWindowSelector }   from "@/components/shell/fiscal-window-selector";
import {
  parseFiscalWindowMode,
  getFiscalWindow,
  CARTERA_WINDOW_MODES,
  type FiscalWindow,
  type FiscalWindowMode,
} from "@/lib/finance/fiscal-window";
import {
  getFpaCashFlow,
  getFpaVariance,
  getFpaRevenueForecast,
  type CashFlowSummary,
  type VarianceRow,
  type RevenueForecast,
} from "@/lib/finance/fpa-queries";

// ── Fiscal window filter for CustomerReceivable ───────────────────────────────
//
// CustomerProfile.lastPurchaseAt is a CRM field — not set by ERP sync.
// We therefore filter directly on CustomerReceivable.invoiceDate.
//
// Carry-over rule: include prior-year invoices that are still open (daysOverdue>0)
// so operational debt is never silently excluded from the executive view.
// The prior-year lookback is bounded to [window.from - 1 year] to avoid pulling
// all 6 years of history into the "current year" view.

function buildRxWhere(
  orgId:  string,
  window: FiscalWindow,
  extra?: object,
): object {
  // Canonical open statuses — mirrors RX_OPEN_STATUSES in receivables-snapshot.ts
  const base = { organizationId: orgId, status: { in: ["OPEN", "PARTIAL", "OVERDUE"] }, ...extra };

  if (window.mode === "full_history") {
    return base;
  }

  const priorYearFrom = new Date(window.from);
  priorYearFrom.setFullYear(priorYearFrom.getFullYear() - 1);

  return {
    ...base,
    OR: [
      // Invoices issued within the active fiscal window
      { invoiceDate: { gte: window.from } },
      // Carry-over: prior year invoices still open and overdue
      {
        invoiceDate: { gte: priorYearFrom, lt: window.from },
        daysOverdue: { gt: 0 },
      },
    ],
  };
}

// Same but no status filter (for counting all docs in window, including paid)
function buildRxWindowOnly(orgId: string, window: FiscalWindow): object {
  if (window.mode === "full_history") return { organizationId: orgId };
  const priorYearFrom = new Date(window.from);
  priorYearFrom.setFullYear(priorYearFrom.getFullYear() - 1);
  return {
    organizationId: orgId,
    OR: [
      { invoiceDate: { gte: window.from } },
      { invoiceDate: { gte: priorYearFrom, lt: window.from }, daysOverdue: { gt: 0 } },
    ],
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCOP(n: number | null | undefined): string {
  const v = n ?? 0;
  if (v < 0)              return "-" + fmtCOP(-v);
  if (v >= 1_000_000_000) return "$" + (v / 1_000_000_000).toFixed(1) + "B";
  if (v >= 1_000_000)     return "$" + (v / 1_000_000).toFixed(0) + "M";
  return "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(v);
}

function fmtNum(n: number): string { return n.toLocaleString("es-CO"); }

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return formatDateShort(d);
}

function monthLabel(d: Date): string {
  return formatMonthYear(d);
}

function periodKey(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ label, sub }: { label: string; sub?: string }) {
  return (
    <div style={{ marginBottom: S[3], paddingBottom: S[2], borderBottom: `1.5px solid ${C.inkGhost}` }}>
      <div style={{ fontSize: T.sz.xl, fontWeight: T.wt.black, color: C.ink, letterSpacing: "-0.02em" }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function KpiTile({
  label, value, sub, dotColor, urgent, faint, href,
}: {
  label: string; value: string; sub?: string;
  dotColor?: string; urgent?: boolean; faint?: boolean; href?: string;
}) {
  const inner = (
    <div style={{
      background:   urgent ? C.redLight : faint ? C.surface : C.white,
      border:       urgent ? `1.5px solid ${C.redBorder}` : `1px solid ${C.line}`,
      borderRadius: R.xl, padding: `${S[3]}px ${S[4]}px`, boxShadow: E.xs,
      cursor: href ? "pointer" : undefined,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: S[1], marginBottom: S[1] + 2 }}>
        {dotColor && <div style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />}
        <div style={{ fontSize: T.sz.xs, fontWeight: T.wt.bold, color: faint ? C.inkGhost : C.inkLight, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {label}
        </div>
        {href && <div style={{ marginLeft: "auto", fontSize: T.sz.xs, color: C.brand, fontWeight: T.wt.semibold }}>→</div>}
      </div>
      <div style={{ fontSize: faint ? T.sz["2xl"] : T.sz["3xl"], fontWeight: T.wt.black, color: urgent ? C.red : faint ? C.inkGhost : C.ink, letterSpacing: "-0.02em", lineHeight: 1, marginBottom: 4 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: T.sz.xs, color: urgent ? C.redDark : faint ? C.inkGhost : C.inkFaint }}>{sub}</div>}
    </div>
  );
  if (href) return <Link href={href} style={{ textDecoration: "none", display: "block" }}>{inner}</Link>;
  return inner;
}

function PendingTile({ label, reason }: { label: string; reason: string }) {
  return (
    <div style={{
      background: C.surface, border: `1px dashed ${C.line}`,
      borderRadius: R.xl, padding: `${S[3]}px ${S[4]}px`,
    }}>
      <div style={{ fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.inkGhost, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: S[1] + 2 }}>
        {label}
      </div>
      <div style={{ fontSize: T.sz.sm, color: C.inkGhost, fontWeight: T.wt.black }}>—</div>
      <div style={{ fontSize: T.sz.xs, color: C.inkGhost, marginTop: 3 }}>{reason}</div>
    </div>
  );
}

function DayTile({ label, count, amount, href, focused }: {
  label: string; count: number; amount: number;
  href: string; focused?: boolean;
}) {
  const hasData = count > 0;
  return (
    <Link href={href} style={{ textDecoration: "none", display: "block" }}>
      <div style={{
        background:   focused ? C.brandLight ?? "#EFF6FF" : hasData ? C.white : C.surface,
        border:       focused ? `1.5px solid ${C.brand}` : hasData ? `1px solid ${C.line}` : `1px dashed ${C.line}`,
        borderRadius: R.xl, padding: `${S[3]}px ${S[4]}px`, boxShadow: E.xs,
        cursor: "pointer",
      }}>
        <div style={{ fontSize: T.sz.xs, fontWeight: T.wt.bold, color: hasData ? C.inkLight : C.inkGhost, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: S[1] + 2 }}>
          {label}
        </div>
        <div style={{ fontSize: T.sz["3xl"], fontWeight: T.wt.black, color: hasData ? C.ink : C.inkGhost, letterSpacing: "-0.02em", lineHeight: 1, marginBottom: 4 }}>
          {hasData ? fmtCOP(amount) : "—"}
        </div>
        <div style={{ fontSize: T.sz.xs, color: hasData ? C.brand : C.inkGhost }}>
          {hasData ? `${fmtNum(count)} registros · Ver →` : "Sin datos hoy"}
        </div>
      </div>
    </Link>
  );
}

function CardPanel({ children, redBorder, style }: { children: React.ReactNode; redBorder?: boolean; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.white,
      border: redBorder ? `1.5px solid ${C.redBorder}` : `1px solid ${C.line}`,
      borderRadius: R.xl, overflow: "hidden", boxShadow: E.sm, ...style,
    }}>
      {children}
    </div>
  );
}

function CardHead({ title, sub, right, urgent }: {
  title: string; sub?: string; right?: React.ReactNode; urgent?: boolean;
}) {
  return (
    <div style={{
      padding: `${S[2] + 2}px ${S[4]}px`,
      borderBottom: urgent ? `1px solid ${C.redBorder}` : `1px solid ${C.line}`,
      background: urgent ? C.redLight : C.surfaceAlt,
      display: "flex", alignItems: "center", gap: S[2],
    }}>
      <div>
        <div style={{ fontSize: T.sz.sm, fontWeight: T.wt.bold, color: urgent ? C.red : C.ink }}>{title}</div>
        {sub && <div style={{ fontSize: T.sz.xs, color: C.inkLight }}>{sub}</div>}
      </div>
      {right && <div style={{ marginLeft: "auto" }}>{right}</div>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TorreDeControlPage({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgSlug }      = await params;
  const sp               = await searchParams;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId            = organization.id;

  // ── Ventana fiscal ──────────────────────────────────────────────────────────
  const windowParam  = typeof sp.window === "string" ? sp.window : undefined;
  const focus        = typeof sp.focus  === "string" ? sp.focus  : undefined;
  // Default: current_year (Año fiscal 2026) — no histórico inflado
  const windowMode   = parseFiscalWindowMode(windowParam, "current_year") as FiscalWindowMode;
  const win          = getFiscalWindow(windowMode);
  const isFullHistory = windowMode === "full_history";
  const baseHref      = `/${orgSlug}/control-center/cobranza`;

  // ── Derived date bounds ─────────────────────────────────────────────────────
  const now         = new Date();
  const todayStart  = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd    = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const monthStart  = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd    = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const in30d       = new Date(now.getTime() + 30 * 86_400_000);
  const curPeriod   = periodKey(now);
  const curMonthLbl = monthLabel(now);

  // ── Windowed WHERE clauses ──────────────────────────────────────────────────
  // Base: org + status filter + fiscal window on invoiceDate
  const rxWhere      = buildRxWhere(orgId, win);
  const rxWhereFull  = buildRxWindowOnly(orgId, win); // for doc counts including all statuses

  // ── All queries in parallel ────────────────────────────────────────────────
  const db = prisma as any;

  const [
    // ── Cartera totales (ventana activa) ──
    totalAgg,
    agingBuckets,
    // ── Bloque A ──
    vencHoyCount,
    vencHoySuma,
    proximosVenc,
    // ── Bloque B ──
    vencMesCount,
    vencMesSuma,
    // ── Vendedores y líneas ──
    vendedoresMes,
    lineasMes,
    clientesNuevosMes,
    // ── Top deudores (ventana activa) ──
    topDeudores,
    // ── Tareas y alertas ──
    tareasAbiertas,
    alertasActivas,
    // ── Sync info ──
    ultimoSync,
    // ── Histórico total (para comparación / badge) ──
    totalHistoricoAgg,
    // ── Bloque A — datos del día ──
    pedidosHoy,
    pedidosHoyAgg,
    ventasHoyRows,
    ventasHoyAgg,
    facturasHoyRows,
    facturasHoyAgg,
    cobrosHoyRows,
    cobrosHoyAgg,
    // ── Bloque E/F — tesorería + presupuesto ──
    cashFlow,
    budgetVariance,
    revenueForecast,
  ] = await Promise.all([

    // Total cartera en ventana activa
    prisma.customerReceivable.aggregate({
      where: rxWhere,
      _sum:  { balanceDue: true, originalAmount: true },
      _count: { id: true },
    }),

    // Aging buckets en ventana activa
    prisma.customerReceivable.groupBy({
      by:    ["agingBucket"],
      where: rxWhere,
      _count: { id: true },
      _sum:   { balanceDue: true },
    }),

    // Vencimientos HOY (sin filtro de ventana — siempre operativo)
    prisma.customerReceivable.count({
      where: {
        organizationId: orgId,
        status: { in: ["OPEN", "PARTIAL", "OVERDUE"] },
        dueDate: { gte: todayStart, lte: todayEnd },
      },
    }),
    prisma.customerReceivable.aggregate({
      where: {
        organizationId: orgId,
        status: { in: ["OPEN", "PARTIAL", "OVERDUE"] },
        dueDate: { gte: todayStart, lte: todayEnd },
      },
      _sum: { balanceDue: true },
    }),

    // Próximos vencimientos 30 días (sin filtro de ventana — siempre operativo)
    prisma.customerReceivable.findMany({
      where: {
        organizationId: orgId,
        status: { in: ["OPEN", "PARTIAL", "OVERDUE"] },
        dueDate: { gte: todayStart, lte: in30d },
      },
      select: {
        erpId: true, customerName: true, customerNit: true,
        balanceDue: true, dueDate: true, daysOverdue: true,
      },
      orderBy: { dueDate: "asc" },
      take: 12,
    }),

    // Vencimientos del mes actual
    prisma.customerReceivable.count({
      where: {
        organizationId: orgId,
        status: { in: ["OPEN", "PARTIAL", "OVERDUE"] },
        dueDate: { gte: monthStart, lte: monthEnd },
      },
    }),
    prisma.customerReceivable.aggregate({
      where: {
        organizationId: orgId,
        status: { in: ["OPEN", "PARTIAL", "OVERDUE"] },
        dueDate: { gte: monthStart, lte: monthEnd },
      },
      _sum: { balanceDue: true },
    }),

    // Vendedores del mes (SaleRecord)
    db.saleRecord.groupBy({
      by: ["sellerName", "sellerSlug"],
      where: { organizationId: orgId, periodoAoMes: curPeriod },
      _sum: { amount: true }, _count: { id: true },
      orderBy: { _sum: { amount: "desc" } }, take: 15,
    }).catch(() => []),

    // Líneas del mes (SaleRecord)
    db.saleRecord.groupBy({
      by: ["productLine", "sagSourceType"],
      where: { organizationId: orgId, periodoAoMes: curPeriod },
      _sum: { amount: true }, _count: { id: true },
      orderBy: { _sum: { amount: "desc" } }, take: 20,
    }).catch(() => []),

    // Clientes nuevos este mes
    db.customerProfile.count({
      where: { organizationId: orgId, createdAt: { gte: monthStart } },
    }).catch(() => 0),

    // Top 8 deudores en ventana activa
    prisma.$queryRaw<{
      customerNit: string | null; customerName: string;
      total: number; docs: bigint; maxDpd: number;
    }[]>`
      SELECT "customerNit", "customerName",
             SUM("balanceDue")::float AS total,
             COUNT(*)                 AS docs,
             MAX("daysOverdue")       AS "maxDpd"
      FROM   "CustomerReceivable"
      WHERE  "organizationId" = ${orgId}
        AND  "status" IN ('OPEN', 'PARTIAL', 'OVERDUE')
        AND  (
               "invoiceDate" >= ${win.mode === "full_history" ? new Date("2000-01-01") : win.from}
               OR (
                 "invoiceDate" >= ${win.mode === "full_history" ? new Date("2000-01-01") : (() => { const d = new Date(win.from); d.setFullYear(d.getFullYear()-1); return d; })()}
                 AND "invoiceDate"  < ${win.mode === "full_history" ? new Date("9999-01-01") : win.from}
                 AND "daysOverdue" > 0
               )
             )
      GROUP  BY "customerNit", "customerName"
      ORDER  BY total DESC
      LIMIT  8
    `,

    // Tareas abiertas
    db.actionTask.findMany({
      where: { organizationId: orgId, status: { in: ["PENDING", "SCHEDULED", "RUNNING"] } },
      select: { id: true, title: true, priority: true, status: true, dueAt: true, targetLabel: true },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 10,
    }).catch(() => []),

    // Alertas sin resolver
    prisma.alert.findMany({
      where: { organizationId: orgId, status: { not: "RESOLVED" } },
      select: { id: true, title: true, severity: true, status: true, createdAt: true },
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      take: 8,
    }).catch(() => []),

    // Último sync de cartera
    prisma.customerReceivable.findFirst({
      where:   { organizationId: orgId },
      orderBy: { syncedAt: "desc" },
      select:  { syncedAt: true },
    }),

    // Total histórico (para mostrar en pie de página / comparación)
    prisma.customerReceivable.aggregate({
      where: { organizationId: orgId, status: { in: ["OPEN", "PARTIAL", "OVERDUE"] } },
      _count: { id: true },
      _sum:   { balanceDue: true },
    }),

    // ── Bloque A — Pedidos del día ──
    db.customerOrderRecord.findMany({
      where: { organizationId: orgId, orderDate: { gte: todayStart, lte: todayEnd } },
      select: { id: true, orderNumber: true, customerName: true, customerNit: true, amount: true },
      orderBy: { orderDate: "desc" },
      take: 50,
    }).catch(() => []),
    db.customerOrderRecord.aggregate({
      where: { organizationId: orgId, orderDate: { gte: todayStart, lte: todayEnd } },
      _sum: { amount: true }, _count: { id: true },
    }).catch(() => ({ _sum: { amount: null }, _count: { id: 0 } })),

    // ── Bloque A — Ventas del día ──
    db.saleRecord.findMany({
      where: { organizationId: orgId, saleDate: { gte: todayStart, lte: todayEnd } },
      select: { id: true, customerName: true, sellerName: true, storeName: true, productLine: true, amount: true },
      orderBy: { saleDate: "desc" },
      take: 50,
    }).catch(() => []),
    db.saleRecord.aggregate({
      where: { organizationId: orgId, saleDate: { gte: todayStart, lte: todayEnd } },
      _sum: { amount: true }, _count: { id: true },
    }).catch(() => ({ _sum: { amount: null }, _count: { id: 0 } })),

    // ── Bloque A — Facturas emitidas hoy ──
    prisma.customerReceivable.findMany({
      where: { organizationId: orgId, invoiceDate: { gte: todayStart, lte: todayEnd } },
      select: { erpId: true, customerName: true, customerNit: true, originalAmount: true, balanceDue: true },
      orderBy: { invoiceDate: "desc" },
      take: 50,
    }).catch(() => []),
    prisma.customerReceivable.aggregate({
      where: { organizationId: orgId, invoiceDate: { gte: todayStart, lte: todayEnd } },
      _sum: { originalAmount: true }, _count: { id: true },
    }).catch(() => ({ _sum: { originalAmount: null }, _count: { id: 0 } })),

    // ── Bloque A — Cobros recibidos hoy ──
    db.collectionRecord.findMany({
      where: { organizationId: orgId, collectionDate: { gte: todayStart, lte: todayEnd } },
      select: { id: true, customerName: true, customerNit: true, customerId: true, amount: true, comprobanteCode: true, documentNumber: true },
      orderBy: { collectionDate: "desc" },
      take: 50,
    }).catch(() => []),
    db.collectionRecord.aggregate({
      where: { organizationId: orgId, collectionDate: { gte: todayStart, lte: todayEnd } },
      _sum: { amount: true }, _count: { id: true },
    }).catch(() => ({ _sum: { amount: null }, _count: { id: 0 } })),

    // ── Bloque E — Presión de Caja (AR inflow forecast) ──
    getFpaCashFlow(orgId, win).catch((): CashFlowSummary => ({
      hasData: false, currency: "COP", totalOutstanding: 0, totalOverdue: 0,
      horizons: [], aging: [],
      overdueRecovery: { conservative: 0, base: 0, aggressive: 0 },
    })),

    // ── Bloque F — Control Presupuestal (varianza plan vs real) ──
    getFpaVariance(orgId, now.getFullYear()).catch(() => ({ rows: [] as VarianceRow[], hasData: false })),

    // ── Bloque F — Proyección de cierre ──
    getFpaRevenueForecast(orgId).catch((): RevenueForecast => ({
      hasData: false, currency: "COP",
      monthToDate: 0, monthProjection: 0, dayOfMonth: 0, daysInMonth: 30,
      quarterToDate: 0, quarterForecast: 0, currentQuarter: 1,
      rolling12Months: [], rolling12Total: 0,
      priorYearSameMonthTotal: 0, yoyGrowthPct: null,
    })),
  ]);

  // ── Derived calculations ────────────────────────────────────────────────────

  const BUCKET_ORDER = ["CURRENT", "1-30", "31-60", "61-90", "90+"] as const;
  const BUCKET_LABEL: Record<string, string> = {
    "CURRENT": "Al día", "1-30": "1–30 días", "31-60": "31–60 días",
    "61-90":  "61–90 días", "90+":  "+90 días",
  };
  const BUCKET_COLOR: Record<string, string> = {
    "CURRENT": C.green, "1-30": C.amber, "31-60": C.amberMid, "61-90": C.red, "90+": C.redDark,
  };

  const agingMap        = new Map(agingBuckets.map(b => [b.agingBucket, b]));
  const totalCartera    = Number(totalAgg._sum.originalAmount ?? 0);
  const totalBalanceDue = Number(totalAgg._sum.balanceDue ?? 0);
  const totalDocs       = totalAgg._count.id;

  // Cartera vencida = todos los buckets EXCEPTO CURRENT
  const totalVencida = agingBuckets
    .filter(b => b.agingBucket !== "CURRENT")
    .reduce((s, b) => s + Math.max(0, Number(b._sum.balanceDue ?? 0)), 0);
  const ratioVencida = totalCartera > 0 ? (totalVencida / totalCartera) * 100 : 0;

  const bucket90 = agingMap.get("90+");
  const bal90    = Math.max(0, Number(bucket90?._sum.balanceDue ?? 0));
  const pct90    = totalBalanceDue > 0 ? (bal90 / totalBalanceDue) * 100 : 0;

  // Histórico total (sin ventana) — para el badge informativo
  const totalHistorico     = Number(totalHistoricoAgg._sum.balanceDue ?? 0);
  const totalHistoricoDocs = totalHistoricoAgg._count.id;
  const excluyendoDocs     = totalHistoricoDocs - totalDocs;

  // Ventas (SaleRecord — puede estar vacío)
  type VRow = { sellerName: string; sellerSlug: string; _sum: { amount: number }; _count: { id: number } };
  const vendData        = vendedoresMes as VRow[];
  const totalVendidoMes = vendData.reduce((s, v) => s + Number(v._sum.amount ?? 0), 0);
  const hasSales        = totalVendidoMes > 0;

  type LRow = { productLine: string; sagSourceType: string; _sum: { amount: number }; _count: { id: number } };
  const lineasData = lineasMes as LRow[];

  type TRow = { id: string; title: string; priority: string; status: string; dueAt: Date | null; targetLabel: string | null };
  const tareas: TRow[] = tareasAbiertas as TRow[];

  type ARow = { id: string; title: string; severity: string; status: string; createdAt: Date };
  const alertas: ARow[] = alertasActivas as ARow[];

  // ── E3 — Presión de caja derivations ────────────────────────────────────────
  const cashHorizon30  = cashFlow.horizons.find(h => h.daysLabel.includes("30") || h.label.includes("30")) ?? cashFlow.horizons[0];
  const arInflow30     = cashHorizon30?.expected ?? 0;
  const arInflow30Con  = cashHorizon30?.conservative ?? 0;

  // ── F1 — Presupuesto varianza total (TOTAL dimension, revenue) ──────────────
  const totalVarianceRow = budgetVariance.rows.find(r => r.dimension === "TOTAL" && r.category === "revenue");
  const hasBudget        = budgetVariance.hasData;
  const budgetTotal      = totalVarianceRow?.budgeted ?? 0;
  const actualTotal      = totalVarianceRow?.actual   ?? 0;
  const varianceAbs      = totalVarianceRow?.variance ?? 0;
  const variancePct      = totalVarianceRow?.variancePct ?? 0;
  const cumplimiento     = budgetTotal > 0 ? Math.min(200, (actualTotal / budgetTotal) * 100) : 0;

  // ── F2 — Proyección de cierre ────────────────────────────────────────────────
  const projectionSignal = (() => {
    if (!hasBudget || budgetTotal === 0) return null;
    const ratio = revenueForecast.monthProjection / budgetTotal;
    if (ratio >= 0.95) return "EN RUTA";
    if (ratio >= 0.80) return "EN RIESGO";
    return "CRITICO";
  })();

  const PRIORITY_COLOR: Record<string, string> = {
    URGENT: C.red, HIGH: C.amber, MEDIUM: C.amberMid, LOW: C.inkLight,
  };
  const SEV_STYLE: Record<string, { bg: string; border: string; text: string }> = {
    CRITICAL: { bg: C.redLight,   border: C.redBorder,   text: C.redDark  },
    WARNING:  { bg: C.amberLight, border: C.amberBorder, text: C.amberDark },
    INFO:     { bg: C.blueLight,  border: C.blueBorder,  text: C.blueDark  },
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "monospace", maxWidth: 1160 }}>

      {/* ── Breadcrumb ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 4, fontSize: T.sz.sm, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        <Link href={`/${orgSlug}/dashboard`} style={{ color: C.inkFaint, textDecoration: "none" }}>
          {organization.name}
        </Link>
        {" "} › <span style={{ color: C.ink, fontWeight: T.wt.bold }}>Torre de Control</span>
      </div>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        gap: S[4], marginBottom: S[4], paddingBottom: S[4], borderBottom: `2px solid ${C.ink}`,
      }}>
        <div>
          <h1 style={{
            margin: 0, fontSize: T.sz["4xl"], fontWeight: T.wt.black,
            color: C.ink, letterSpacing: "-0.03em", lineHeight: 1,
          }}>
            Torre de Control
          </h1>
          <div style={{ fontSize: T.sz.sm, color: C.inkLight, marginTop: 5 }}>
            {organization.name} · {formatDateWeekday(now)}
            {ultimoSync?.syncedAt && (
              <span style={{ color: C.inkGhost }}>
                {" "}· cartera al {formatDateShort(ultimoSync.syncedAt)}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: S[2] }}>
          <Link href={`/${orgSlug}/collections`} style={{
            fontSize: T.sz.sm, fontWeight: T.wt.bold, color: "#7c3aed",
            background: "#faf5ff", border: "1px solid #ede9fe",
            borderRadius: R.md, padding: "6px 14px", textDecoration: "none",
          }}>
            Cola cobranza →
          </Link>
          <Link href={`/${orgSlug}/customer-360?hasOverdue=true`} style={{
            fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.inkMid,
            background: C.surface, border: `1px solid ${C.line}`,
            borderRadius: R.md, padding: "6px 14px", textDecoration: "none",
          }}>
            Cliente 360 →
          </Link>
        </div>
      </div>

      {/* ── Selector de ventana + banner informativo ────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: S[4],
        marginBottom: S[4], flexWrap: "wrap",
      }}>
        <FiscalWindowSelector
          currentMode={windowMode}
          baseHref={baseHref}
          defaultMode="current_year"
          modes={CARTERA_WINDOW_MODES}
        />

        {/* Badge: documentos excluidos del histórico */}
        {!isFullHistory && excluyendoDocs > 0 && (
          <span style={{
            fontSize: T.sz.xs, color: C.inkLight,
            background: C.surface, border: `1px solid ${C.line}`,
            borderRadius: R.sm, padding: "2px 8px",
          }}>
            {fmtNum(excluyendoDocs)} docs históricos excluidos ·{" "}
            <Link
              href={`${baseHref}?window=full_history`}
              style={{ color: C.brand, textDecoration: "none", fontWeight: T.wt.bold }}
            >
              ver todo →
            </Link>
          </span>
        )}

        {/* Banner full_history warning */}
        {isFullHistory && (
          <span style={{
            fontSize: T.sz.xs, fontWeight: T.wt.bold,
            color: C.amberDark, background: C.amberLight,
            border: `1px solid ${C.amberBorder}`,
            borderRadius: R.sm, padding: "2px 10px",
          }}>
            ⚠ Vista histórica — incluye {fmtNum(totalHistoricoDocs)} docs de todos los años.{" "}
            <Link
              href={baseHref}
              style={{ color: C.amberDark, textDecoration: "underline", fontWeight: T.wt.bold }}
            >
              Volver a año fiscal →
            </Link>
          </span>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          BLOQUE A — INFORMACIÓN DEL DÍA
          ══════════════════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: S[6] }}>
        <SectionHeader
          label="A — Información del día"
          sub={`¿Cómo amaneció el negocio? · ${formatDateWeekdayShort(now)}`}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: S[3], marginBottom: S[3] }}>
          <DayTile
            label="Pedidos del día"
            count={Number((pedidosHoyAgg as any)._count?.id ?? 0)}
            amount={Number((pedidosHoyAgg as any)._sum?.amount ?? 0)}
            href={`${baseHref}?focus=pedidos-dia#section-pedidos-dia`}
            focused={focus === "pedidos-dia"}
          />
          <DayTile
            label="Ventas del día"
            count={Number((ventasHoyAgg as any)._count?.id ?? 0)}
            amount={Number((ventasHoyAgg as any)._sum?.amount ?? 0)}
            href={`${baseHref}?focus=ventas-dia#section-ventas-dia`}
            focused={focus === "ventas-dia"}
          />
          <DayTile
            label="Facturas emitidas"
            count={Number((facturasHoyAgg as any)._count?.id ?? 0)}
            amount={Number((facturasHoyAgg as any)._sum?.originalAmount ?? 0)}
            href={`${baseHref}?focus=facturas-dia#section-facturas-dia`}
            focused={focus === "facturas-dia"}
          />
          <DayTile
            label="Cobros recibidos"
            count={Number((cobrosHoyAgg as any)._count?.id ?? 0)}
            amount={Number((cobrosHoyAgg as any)._sum?.amount ?? 0)}
            href={`${baseHref}?focus=cobros-dia#section-cobros-dia`}
            focused={focus === "cobros-dia"}
          />

          <KpiTile
            label="Vencimientos hoy"
            value={vencHoyCount > 0 ? fmtCOP(Number(vencHoySuma._sum.balanceDue ?? 0)) : "—"}
            sub={vencHoyCount > 0 ? `${fmtNum(vencHoyCount)} documentos` : "Sin vencimientos hoy"}
            dotColor={vencHoyCount > 0 ? C.amber : C.green}
            urgent={vencHoyCount > 10}
            href={vencHoyCount > 0 ? `${baseHref}?focus=venc-hoy#section-venc-hoy` : undefined}
          />

          <KpiTile
            label="Vencen este mes"
            value={vencMesCount > 0 ? fmtCOP(Number(vencMesSuma._sum.balanceDue ?? 0)) : "—"}
            sub={vencMesCount > 0 ? `${fmtNum(vencMesCount)} docs · ${curMonthLbl}` : `Sin vencimientos en ${curMonthLbl}`}
            dotColor={vencMesCount > 100 ? C.amber : C.inkLight}
            href={vencMesCount > 0 ? `/${orgSlug}/collections` : undefined}
          />

          <PendingTile label="Pagos programados" reason="Sin pagos programados registrados" />

          <KpiTile
            label={isFullHistory ? "Cartera total (histórico)" : `Cartera total · ${win.label}`}
            value={fmtCOP(totalCartera)}
            sub={`${fmtNum(totalDocs)} documentos activos`}
            dotColor={C.inkLight}
            href={`/${orgSlug}/customer-360`}
          />
        </div>

        {/* Próximos vencimientos */}
        {proximosVenc.length > 0 && (
          <CardPanel>
            <CardHead
              title="Próximos vencimientos — 30 días"
              sub={`${proximosVenc.length} documentos · ${fmtCOP(proximosVenc.reduce((s, d) => s + Number(d.balanceDue ?? 0), 0))}`}
              right={<Link href={`/${orgSlug}/collections`} style={{ fontSize: T.sz.xs, color: C.brand, textDecoration: "none", fontWeight: T.wt.semibold }}>Ir a cola →</Link>}
            />
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sz.sm }}>
                <thead>
                  <tr style={{ background: C.surfaceAlt }}>
                    {["Cliente", "NIT", "Vence", "Estado", "Saldo", ""].map((h, i) => (
                      <th key={h || `h${i}`} style={{
                        padding: `${S[1] + 2}px ${S[3]}px`,
                        textAlign: i >= 3 ? "right" : "left",
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
                  {proximosVenc.map((doc, i) => {
                    const daysLeft = doc.dueDate
                      ? Math.round((doc.dueDate.getTime() - now.getTime()) / 86_400_000)
                      : null;
                    const isToday  = daysLeft === 0;
                    const isUrgent = daysLeft !== null && daysLeft <= 3;
                    return (
                      <tr key={doc.erpId} style={{ background: i % 2 === 0 ? C.white : C.surface }}>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, fontWeight: T.wt.semibold, color: C.ink }}>
                          {doc.customerName?.slice(0, 32) ?? "—"}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, color: C.inkFaint, fontSize: T.sz.xs }}>
                          {doc.customerNit ?? "—"}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, color: C.inkMid }}>
                          {fmtDate(doc.dueDate)}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, textAlign: "right" }}>
                          <span style={{
                            fontSize: T.sz.xs, fontWeight: T.wt.bold,
                            color: isToday ? C.red : isUrgent ? C.amber : C.green,
                            background: isToday ? C.redLight : isUrgent ? C.amberLight : C.greenLight,
                            border: `1px solid ${isToday ? C.redBorder : isUrgent ? C.amberBorder : C.greenBorder}`,
                            borderRadius: R.xs, padding: "1px 6px",
                          }}>
                            {isToday ? "HOY" : daysLeft !== null ? `en ${daysLeft}d` : "—"}
                          </span>
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, textAlign: "right", fontWeight: T.wt.bold, color: isUrgent ? C.red : C.ink }}>
                          {fmtCOP(Number(doc.balanceDue))}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, textAlign: "right" }}>
                          {(doc.customerNit || doc.customerName) && (
                            <Link
                              href={`/${orgSlug}/customer-360?q=${encodeURIComponent(doc.customerNit ?? doc.customerName ?? "")}`}
                              style={{ fontSize: T.sz.xs, color: C.brand, textDecoration: "none", fontWeight: T.wt.semibold }}
                            >
                              Ver →
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardPanel>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          DETALLE DEL DÍA — secciones abiertas por ?focus=
          ══════════════════════════════════════════════════════════════════════ */}

      {/* ── Pedidos del día ─────────────────────────────────────────────────── */}
      {focus === "pedidos-dia" && (
        <div id="section-pedidos-dia" style={{ marginBottom: S[6] }}>
          <CardPanel>
            <CardHead
              title="Pedidos del día"
              sub={`${formatDateWeekdayShort(now)} · ${(pedidosHoy as any[]).length} registros · ${fmtCOP(Number((pedidosHoyAgg as any)._sum?.amount ?? 0))}`}
              right={
                <Link href={baseHref} style={{ fontSize: T.sz.xs, color: C.inkLight, textDecoration: "none" }}>
                  ✕ Cerrar
                </Link>
              }
            />
            {(pedidosHoy as any[]).length === 0 ? (
              <div style={{ padding: `${S[6]}px ${S[4]}px`, textAlign: "center", color: C.inkGhost, fontSize: T.sz.sm }}>
                Sin pedidos registrados hoy
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sz.sm }}>
                  <thead>
                    <tr style={{ background: C.surfaceAlt }}>
                      {["# Pedido", "Cliente", "NIT", "Monto", "Acción"].map((h, i) => (
                        <th key={h} style={{
                          padding: `${S[1] + 2}px ${S[3]}px`,
                          textAlign: i >= 3 ? "right" : "left",
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
                    {(pedidosHoy as any[]).map((row: any, i: number) => (
                      <tr key={row.id} style={{ background: i % 2 === 0 ? C.white : C.surface }}>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, fontWeight: T.wt.semibold, color: C.inkMid, fontSize: T.sz.xs }}>
                          {row.orderNumber ?? "—"}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, fontWeight: T.wt.semibold, color: C.ink }}>
                          {(row.customerName ?? "—").slice(0, 36)}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, color: C.inkFaint, fontSize: T.sz.xs }}>
                          {row.customerNit ?? "—"}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, textAlign: "right", fontWeight: T.wt.bold, color: C.ink }}>
                          {fmtCOP(Number(row.amount ?? 0))}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, textAlign: "right" }}>
                          {row.customerNit && (
                            <Link href={`/${orgSlug}/customer-360?q=${encodeURIComponent(row.customerNit)}`} style={{ fontSize: T.sz.xs, color: C.brand, textDecoration: "none", fontWeight: T.wt.semibold }}>
                              Ver cliente →
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardPanel>
        </div>
      )}

      {/* ── Ventas del día ──────────────────────────────────────────────────── */}
      {focus === "ventas-dia" && (
        <div id="section-ventas-dia" style={{ marginBottom: S[6] }}>
          <CardPanel>
            <CardHead
              title="Ventas del día"
              sub={`${formatDateWeekdayShort(now)} · ${(ventasHoyRows as any[]).length} registros · ${fmtCOP(Number((ventasHoyAgg as any)._sum?.amount ?? 0))}`}
              right={
                <Link href={baseHref} style={{ fontSize: T.sz.xs, color: C.inkLight, textDecoration: "none" }}>
                  ✕ Cerrar
                </Link>
              }
            />
            {(ventasHoyRows as any[]).length === 0 ? (
              <div style={{ padding: `${S[6]}px ${S[4]}px`, textAlign: "center", color: C.inkGhost, fontSize: T.sz.sm }}>
                Sin ventas registradas hoy
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sz.sm }}>
                  <thead>
                    <tr style={{ background: C.surfaceAlt }}>
                      {["Cliente", "Vendedor", "Almacén", "Línea", "Monto", "Acción"].map((h, i) => (
                        <th key={h} style={{
                          padding: `${S[1] + 2}px ${S[3]}px`,
                          textAlign: i >= 4 ? "right" : "left",
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
                    {(ventasHoyRows as any[]).map((row: any, i: number) => (
                      <tr key={row.id} style={{ background: i % 2 === 0 ? C.white : C.surface }}>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, fontWeight: T.wt.semibold, color: C.ink }}>
                          {(row.customerName ?? "—").slice(0, 30)}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, color: C.inkMid, fontSize: T.sz.xs }}>
                          {row.sellerName ?? "—"}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, color: C.inkFaint, fontSize: T.sz.xs }}>
                          {row.storeName ?? "—"}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, color: C.inkFaint, fontSize: T.sz.xs }}>
                          {row.productLine ?? "—"}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, textAlign: "right", fontWeight: T.wt.bold, color: C.ink }}>
                          {fmtCOP(Number(row.amount ?? 0))}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, textAlign: "right" }}>
                          {row.customerName && (
                            <Link href={`/${orgSlug}/customer-360?q=${encodeURIComponent(row.customerName)}`} style={{ fontSize: T.sz.xs, color: C.brand, textDecoration: "none", fontWeight: T.wt.semibold }}>
                              Ver cliente →
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardPanel>
        </div>
      )}

      {/* ── Facturas emitidas hoy ────────────────────────────────────────────── */}
      {focus === "facturas-dia" && (
        <div id="section-facturas-dia" style={{ marginBottom: S[6] }}>
          <CardPanel>
            <CardHead
              title="Facturas emitidas hoy"
              sub={`${formatDateWeekdayShort(now)} · ${(facturasHoyRows as any[]).length} documentos · ${fmtCOP(Number((facturasHoyAgg as any)._sum?.originalAmount ?? 0))}`}
              right={
                <Link href={baseHref} style={{ fontSize: T.sz.xs, color: C.inkLight, textDecoration: "none" }}>
                  ✕ Cerrar
                </Link>
              }
            />
            {(facturasHoyRows as any[]).length === 0 ? (
              <div style={{ padding: `${S[6]}px ${S[4]}px`, textAlign: "center", color: C.inkGhost, fontSize: T.sz.sm }}>
                Sin facturas emitidas hoy
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sz.sm }}>
                  <thead>
                    <tr style={{ background: C.surfaceAlt }}>
                      {["Cliente", "NIT", "Valor original", "Saldo", "Acción"].map((h, i) => (
                        <th key={h} style={{
                          padding: `${S[1] + 2}px ${S[3]}px`,
                          textAlign: i >= 2 ? "right" : "left",
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
                    {(facturasHoyRows as any[]).map((row: any, i: number) => (
                      <tr key={row.erpId} style={{ background: i % 2 === 0 ? C.white : C.surface }}>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, fontWeight: T.wt.semibold, color: C.ink }}>
                          {(row.customerName ?? "—").slice(0, 36)}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, color: C.inkFaint, fontSize: T.sz.xs }}>
                          {row.customerNit ?? "—"}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, textAlign: "right", color: C.ink }}>
                          {fmtCOP(Number(row.originalAmount ?? 0))}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, textAlign: "right", fontWeight: T.wt.bold, color: Number(row.balanceDue ?? 0) > 0 ? C.amber : C.green }}>
                          {fmtCOP(Number(row.balanceDue ?? 0))}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, textAlign: "right" }}>
                          {row.customerNit && (
                            <Link href={`/${orgSlug}/customer-360?q=${encodeURIComponent(row.customerNit)}`} style={{ fontSize: T.sz.xs, color: C.brand, textDecoration: "none", fontWeight: T.wt.semibold }}>
                              Ver cliente →
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardPanel>
        </div>
      )}

      {/* ── Cobros recibidos hoy ─────────────────────────────────────────────── */}
      {focus === "cobros-dia" && (
        <div id="section-cobros-dia" style={{ marginBottom: S[6] }}>
          <CardPanel>
            <CardHead
              title="Cobros recibidos hoy"
              sub={`${formatDateWeekdayShort(now)} · ${(cobrosHoyRows as any[]).length} cobros · ${fmtCOP(Number((cobrosHoyAgg as any)._sum?.amount ?? 0))}`}
              right={
                <Link href={baseHref} style={{ fontSize: T.sz.xs, color: C.inkLight, textDecoration: "none" }}>
                  ✕ Cerrar
                </Link>
              }
            />
            {(cobrosHoyRows as any[]).length === 0 ? (
              <div style={{ padding: `${S[6]}px ${S[4]}px`, textAlign: "center", color: C.inkGhost, fontSize: T.sz.sm }}>
                Sin cobros registrados hoy
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sz.sm }}>
                  <thead>
                    <tr style={{ background: C.surfaceAlt }}>
                      {["Cliente", "NIT", "Comprobante", "# Doc", "Monto", "Acción"].map((h, i) => (
                        <th key={h} style={{
                          padding: `${S[1] + 2}px ${S[3]}px`,
                          textAlign: i >= 4 ? "right" : "left",
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
                    {(cobrosHoyRows as any[]).map((row: any, i: number) => (
                      <tr key={row.id} style={{ background: i % 2 === 0 ? C.white : C.surface }}>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, fontWeight: T.wt.semibold, color: C.ink }}>
                          {(row.customerName ?? "—").slice(0, 36)}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, color: C.inkFaint, fontSize: T.sz.xs }}>
                          {row.customerNit ?? "—"}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, color: C.inkMid, fontSize: T.sz.xs }}>
                          {row.comprobanteCode ?? "—"}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, color: C.inkFaint, fontSize: T.sz.xs }}>
                          {row.documentNumber ?? "—"}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, textAlign: "right", fontWeight: T.wt.bold, color: C.green }}>
                          {fmtCOP(Number(row.amount ?? 0))}
                        </td>
                        <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, textAlign: "right" }}>
                          {row.customerId ? (
                            <Link href={`/${orgSlug}/customer-360?customerId=${row.customerId}`} style={{ fontSize: T.sz.xs, color: C.brand, textDecoration: "none", fontWeight: T.wt.semibold }}>
                              Ver cliente →
                            </Link>
                          ) : row.customerNit ? (
                            <Link href={`/${orgSlug}/customer-360?q=${encodeURIComponent(row.customerNit)}`} style={{ fontSize: T.sz.xs, color: C.brand, textDecoration: "none", fontWeight: T.wt.semibold }}>
                              Ver cliente →
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardPanel>
        </div>
      )}

      {/* ── Vencimientos hoy ────────────────────────────────────────────────── */}
      {focus === "venc-hoy" && (
        <div id="section-venc-hoy" style={{ marginBottom: S[6] }}>
          <CardPanel redBorder={vencHoyCount > 10}>
            <CardHead
              title="Vencimientos hoy"
              sub={`${formatDateWeekdayShort(now)} · ${fmtNum(vencHoyCount)} documentos · ${fmtCOP(Number(vencHoySuma._sum.balanceDue ?? 0))}`}
              urgent={vencHoyCount > 10}
              right={
                <Link href={baseHref} style={{ fontSize: T.sz.xs, color: C.inkLight, textDecoration: "none" }}>
                  ✕ Cerrar
                </Link>
              }
            />
            {(() => {
              const hoy = proximosVenc.filter(d => {
                if (!d.dueDate) return false;
                const dl = Math.round((d.dueDate.getTime() - now.getTime()) / 86_400_000);
                return dl === 0;
              });
              if (hoy.length === 0) {
                return (
                  <div style={{ padding: `${S[6]}px ${S[4]}px`, textAlign: "center", color: C.green, fontSize: T.sz.sm, fontWeight: T.wt.bold }}>
                    ✓ Sin documentos con vencimiento hoy
                  </div>
                );
              }
              return (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sz.sm }}>
                    <thead>
                      <tr style={{ background: C.surfaceAlt }}>
                        {["Cliente", "NIT", "Días mora", "Saldo", "Acción"].map((h, i) => (
                          <th key={h} style={{
                            padding: `${S[1] + 2}px ${S[3]}px`,
                            textAlign: i >= 3 ? "right" : "left",
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
                      {hoy.map((doc, i) => (
                        <tr key={doc.erpId} style={{ background: i % 2 === 0 ? C.white : C.surface }}>
                          <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, fontWeight: T.wt.semibold, color: C.ink }}>
                            {doc.customerName?.slice(0, 32) ?? "—"}
                          </td>
                          <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, color: C.inkFaint, fontSize: T.sz.xs }}>
                            {doc.customerNit ?? "—"}
                          </td>
                          <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, color: C.red, fontWeight: T.wt.bold }}>
                            {doc.daysOverdue > 0 ? `${doc.daysOverdue}d` : "HOY"}
                          </td>
                          <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, textAlign: "right", fontWeight: T.wt.bold, color: C.red }}>
                            {fmtCOP(Number(doc.balanceDue))}
                          </td>
                          <td style={{ padding: `${S[1] + 2}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, textAlign: "right" }}>
                            {(doc.customerNit || doc.customerName) && (
                              <Link
                                href={`/${orgSlug}/customer-360?q=${encodeURIComponent(doc.customerNit ?? doc.customerName ?? "")}`}
                                style={{ fontSize: T.sz.xs, color: C.brand, textDecoration: "none", fontWeight: T.wt.semibold }}
                              >
                                Ver cliente →
                              </Link>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </CardPanel>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          BLOQUE B — INFORMACIÓN DEL MES
          ══════════════════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: S[6] }}>
        <SectionHeader
          label="B — Información del mes"
          sub={`¿Cómo vamos? · ${curMonthLbl} · ventana: ${win.label}`}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: S[3], marginBottom: S[4] }}>
          {hasSales
            ? <KpiTile label="Total vendido" value={fmtCOP(totalVendidoMes)} sub="ventas SAG registradas" dotColor={C.green} href={`/${orgSlug}/sales`} />
            : <PendingTile label="Total vendido" reason="Sin ventas registradas este mes" />
          }
          <PendingTile label="Total facturado"   reason="Sin facturas SAG F1 registradas" />
          <PendingTile label="Total cobrado"     reason="SAG no exporta recaudos — pendiente integración bancaria" />

          <KpiTile
            label="Cartera vencida"
            value={fmtCOP(totalVencida)}
            sub={`${ratioVencida.toFixed(0)}% del total · ${fmtNum(totalDocs)} docs`}
            dotColor={ratioVencida > 80 ? C.red : C.amber}
            urgent={ratioVencida > 90}
            href={`/${orgSlug}/customer-360?hasOverdue=true`}
          />

          <PendingTile label="Cuentas por pagar" reason="Sin obligaciones registradas" />

          <KpiTile
            label="Flujo comprometido"
            value={fmtCOP(Number(vencMesSuma._sum.balanceDue ?? 0))}
            sub={`${fmtNum(vencMesCount)} docs vencen en ${curMonthLbl}`}
            dotColor={C.blue}
            href={`/${orgSlug}/collections`}
          />

          <KpiTile
            label="Mora crítica +90d"
            value={fmtCOP(bal90)}
            sub={`${bucket90?._count.id ?? 0} docs · ${pct90.toFixed(0)}% del total`}
            dotColor={pct90 > 80 ? C.redDark : C.red}
            urgent={pct90 > 80}
            href={`/${orgSlug}/customer-360?hasOverdue=true`}
          />

          <PendingTile label="Proyección de cierre" reason="Requiere presupuesto de ventas configurado" />
        </div>

        {/* Aging */}
        <CardPanel>
          <CardHead
            title="Envejecimiento de cartera — Aging"
            sub={`${win.label} · saldo vivo · excluye pagado y castigado`}
            right={
              totalDocs === 0 ? undefined :
              <span style={{ fontSize: T.sz.xs, color: C.inkLight }}>
                {fmtNum(totalDocs)} docs · {fmtCOP(totalBalanceDue)}
              </span>
            }
          />
          {totalDocs === 0 ? (
            <div style={{ padding: `${S[4]}px`, textAlign: "center", color: C.inkGhost, fontSize: T.sz.sm }}>
              Sin documentos en la ventana seleccionada
            </div>
          ) : (
            <div style={{ padding: `${S[3]}px ${S[4]}px`, display: "flex", flexDirection: "column", gap: S[2] + 2 }}>
              {BUCKET_ORDER.map(bucket => {
                const b    = agingMap.get(bucket);
                const bal  = Math.max(0, Number(b?._sum.balanceDue ?? 0));
                const docs = b?._count.id ?? 0;
                const pct  = totalBalanceDue > 0 ? (bal / totalBalanceDue) * 100 : 0;
                const col  = BUCKET_COLOR[bucket];
                const bucketHref = docs > 0
                  ? (bucket === "CURRENT" ? `/${orgSlug}/customer-360` : `/${orgSlug}/customer-360?hasOverdue=true`)
                  : undefined;
                return (
                  <Link
                    key={bucket}
                    href={bucketHref ?? "#"}
                    style={{ display: "flex", alignItems: "center", gap: S[3], textDecoration: "none", borderRadius: R.sm, padding: "2px 0", cursor: docs > 0 ? "pointer" : "default" }}
                  >
                    <div style={{ width: 90, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: col, flexShrink: 0 }}>
                      {BUCKET_LABEL[bucket]}
                    </div>
                    <div style={{ flex: 1, background: C.lineSubtle, borderRadius: R.pill, height: 8, position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max(0.3, pct)}%`, background: col, borderRadius: R.pill }} />
                    </div>
                    <div style={{ width: 42, textAlign: "right", fontSize: T.sz.sm, fontWeight: T.wt.bold, color: col, flexShrink: 0 }}>{pct.toFixed(0)}%</div>
                    <div style={{ width: 90, textAlign: "right", fontSize: T.sz.sm, fontWeight: T.wt.bold, color: col, flexShrink: 0 }}>{fmtCOP(bal)}</div>
                    <div style={{ width: 75, textAlign: "right", fontSize: T.sz.xs, color: C.inkLight, flexShrink: 0 }}>{fmtNum(docs)} docs</div>
                    {docs > 0 && <div style={{ width: 20, textAlign: "right", fontSize: T.sz.xs, color: C.brand, flexShrink: 0 }}>→</div>}
                  </Link>
                );
              })}
              <div style={{ display: "flex", alignItems: "center", gap: S[3], paddingTop: S[2], borderTop: `1px solid ${C.line}` }}>
                <div style={{ width: 90, fontSize: T.sz.sm, fontWeight: T.wt.black, color: C.ink, flexShrink: 0 }}>TOTAL</div>
                <div style={{ flex: 1 }} />
                <div style={{ width: 42, textAlign: "right", fontSize: T.sz.sm, fontWeight: T.wt.black, color: C.ink }}>100%</div>
                <div style={{ width: 90, textAlign: "right", fontSize: T.sz.sm, fontWeight: T.wt.black, color: C.ink }}>{fmtCOP(totalBalanceDue)}</div>
                <div style={{ width: 75, textAlign: "right", fontSize: T.sz.xs, color: C.inkLight }}>{fmtNum(totalDocs)} docs</div>
              </div>
            </div>
          )}
        </CardPanel>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          BLOQUE C — VENDEDORES
          ══════════════════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: S[6] }}>
        <SectionHeader
          label="C — Vendedores"
          sub="Desempeño del mes · empresa vs almacenes"
        />
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: S[4] }}>
          <CardPanel>
            <CardHead
              title={hasSales ? `Ventas por vendedor · ${curMonthLbl}` : "Ventas por vendedor"}
              sub={hasSales ? `${vendData.length} vendedores activos` : undefined}
              right={<Link href={`/${orgSlug}/sales/vendors`} style={{ fontSize: T.sz.xs, color: C.brand, textDecoration: "none", fontWeight: T.wt.semibold }}>Ver vendedores →</Link>}
            />
            {!hasSales ? (
              <div style={{ padding: `${S[5]}px ${S[4]}px`, textAlign: "center" }}>
                <div style={{ fontSize: T.sz.sm, color: C.inkGhost, fontWeight: T.wt.bold }}>Sin datos de ventas</div>
                <div style={{ fontSize: T.sz.xs, color: C.inkGhost, marginTop: 4 }}>Importar CSV de ventas SAG para ver desempeño por vendedor</div>
                <Link href={`/${orgSlug}/sales`} style={{
                  display: "inline-block", marginTop: S[3],
                  fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.brand,
                  background: C.brandLight, border: `1px solid ${C.brandBorder}`,
                  borderRadius: R.sm, padding: "4px 12px", textDecoration: "none",
                }}>
                  Ir a importación →
                </Link>
              </div>
            ) : (
              <div>
                {vendData.slice(0, 12).map((v, i) => {
                  const pct = totalVendidoMes > 0 ? (Number(v._sum.amount) / totalVendidoMes) * 100 : 0;
                  return (
                    <Link
                      key={v.sellerSlug}
                      href={v.sellerSlug ? `/${orgSlug}/sales/vendors/${v.sellerSlug}` : `/${orgSlug}/sales/vendors`}
                      style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: S[2],
                        padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}`,
                        background: i % 2 === 0 ? C.white : C.surface,
                      }}
                    >
                      <div style={{ width: 20, fontSize: T.sz.xs, color: C.inkGhost, textAlign: "right", flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {v.sellerName}
                      </div>
                      <div style={{ width: 45, fontSize: T.sz.xs, color: C.inkFaint, textAlign: "right" }}>{pct.toFixed(0)}%</div>
                      <div style={{ width: 85, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink, textAlign: "right" }}>{fmtCOP(Number(v._sum.amount))}</div>
                      <div style={{ width: 16, fontSize: T.sz.xs, color: C.brand, textAlign: "right", flexShrink: 0 }}>→</div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardPanel>

          <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
            <KpiTile
              label="Clientes nuevos este mes"
              value={String(clientesNuevosMes)}
              sub={`desde el 1 de ${curMonthLbl}`}
              dotColor={C.green}
              href={`/${orgSlug}/customer-360`}
            />
            <CardPanel style={{ flex: 1 }}>
              <CardHead title="Empresa vs Almacenes" sub="separación por canal / sucursal" />
              <div style={{ padding: `${S[3]}px ${S[4]}px`, color: C.inkGhost, fontSize: T.sz.sm }}>
                {!hasSales
                  ? "Disponible tras importar CSV de ventas con columna de canal/sucursal"
                  : "Configurar separación empresa-almacén en el CSV de ventas"}
              </div>
            </CardPanel>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          BLOQUE D — CLIENTES / LÍNEAS
          ══════════════════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: S[6] }}>
        <SectionHeader
          label="D — Clientes y Líneas"
          sub={`Top deudores · Top líneas · ventana: ${win.label}`}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[4] }}>

          {/* Top deudores */}
          <CardPanel>
            <CardHead
              title={`Top deudores · ${win.label}`}
              sub="saldo vivo · incluye carry-over"
              right={<Link href={`/${orgSlug}/customer-360?hasOverdue=true`} style={{ fontSize: T.sz.xs, color: C.brand, textDecoration: "none", fontWeight: T.wt.semibold }}>Ver todos →</Link>}
            />
            {topDeudores.length === 0 ? (
              <div style={{ padding: `${S[4]}px`, textAlign: "center", color: C.green, fontWeight: T.wt.bold, fontSize: T.sz.sm }}>
                ✓ Sin deudores en esta ventana
              </div>
            ) : topDeudores.map((d, i) => {
              const pct = totalCartera > 0 ? (d.total / totalCartera) * 100 : 0;
              const isCritical = d.maxDpd > 90;
              const clienteHref = `/${orgSlug}/customer-360?q=${encodeURIComponent(d.customerNit ?? d.customerName ?? "")}`;
              return (
                <Link key={i} href={clienteHref} style={{
                  display: "flex", alignItems: "center", gap: S[2], textDecoration: "none",
                  padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}`,
                  borderLeft: isCritical ? `3px solid ${C.red}` : "3px solid transparent",
                  background: i % 2 === 0 ? C.white : C.surface,
                }}>
                  <div style={{ width: 18, fontSize: T.sz.xs, color: C.inkGhost, textAlign: "right", flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: isCritical ? C.red : C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.customerName?.slice(0, 32) ?? "—"}
                    </div>
                    <div style={{ fontSize: T.sz.xs, color: C.inkFaint }}>
                      NIT {d.customerNit ?? "N/A"} · {Number(d.docs)} docs
                      {isCritical && <span style={{ color: C.red, fontWeight: T.wt.bold }}> · +{d.maxDpd}d</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: T.sz.sm, fontWeight: T.wt.bold, color: isCritical ? C.red : C.ink }}>{fmtCOP(d.total)}</div>
                    <div style={{ fontSize: T.sz.xs, color: C.inkFaint }}>{pct.toFixed(1)}%</div>
                  </div>
                  <div style={{ width: 16, fontSize: T.sz.xs, color: C.brand, flexShrink: 0 }}>→</div>
                </Link>
              );
            })}
          </CardPanel>

          {/* Líneas de producto */}
          <CardPanel>
            <CardHead
              title={lineasData.length > 0 ? `Top líneas · ${curMonthLbl}` : "Top líneas de producto"}
              sub={lineasData.length > 0 ? "por monto vendido · F1 = factura · F2 = remisión" : undefined}
              right={<Link href={`/${orgSlug}/sales/lines`} style={{ fontSize: T.sz.xs, color: C.brand, textDecoration: "none", fontWeight: T.wt.semibold }}>Ver líneas →</Link>}
            />
            {lineasData.length === 0 ? (
              <div style={{ padding: `${S[5]}px ${S[4]}px`, textAlign: "center" }}>
                <div style={{ fontSize: T.sz.sm, color: C.inkGhost, fontWeight: T.wt.bold }}>Sin datos de líneas</div>
                <div style={{ fontSize: T.sz.xs, color: C.inkGhost, marginTop: 4, lineHeight: 1.5 }}>
                  Disponible tras importar CSV de ventas SAG.<br />
                  Empresa · Almacenes · Web (por canal/sucursal).
                </div>
              </div>
            ) : lineasData.slice(0, 10).map((l, i) => {
              const tot = lineasData.reduce((s, x) => s + Number(x._sum.amount ?? 0), 0);
              const pct = tot > 0 ? (Number(l._sum.amount) / tot) * 100 : 0;
              const lineaSlug = l.productLine ? encodeURIComponent(l.productLine.toLowerCase().replace(/\s+/g, "-")) : undefined;
              return (
                <Link
                  key={i}
                  href={lineaSlug ? `/${orgSlug}/sales/lines/${lineaSlug}` : `/${orgSlug}/sales/lines`}
                  style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: S[2],
                    padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}`,
                    background: i % 2 === 0 ? C.white : C.surface,
                  }}
                >
                  <div style={{ flex: 1, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>{l.productLine}</div>
                  <span style={{
                    fontSize: T.sz.xs, color: C.inkLight,
                    background: C.surface, border: `1px solid ${C.line}`,
                    borderRadius: R.xs, padding: "1px 5px",
                  }}>
                    {l.sagSourceType === "OFICIAL" ? "F1" : "F2"}
                  </span>
                  <div style={{ width: 38, textAlign: "right", fontSize: T.sz.xs, color: C.inkFaint }}>{pct.toFixed(0)}%</div>
                  <div style={{ width: 80, textAlign: "right", fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>{fmtCOP(Number(l._sum.amount))}</div>
                  <div style={{ width: 16, fontSize: T.sz.xs, color: C.brand, textAlign: "right", flexShrink: 0 }}>→</div>
                </Link>
              );
            })}
          </CardPanel>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          BLOQUE E — OBLIGACIONES Y TESORERÍA
          ¿Qué debo pagar? · ¿Tengo caja para pagarlo?
          ══════════════════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: S[6] }}>
        <SectionHeader
          label="E — Obligaciones y Tesorería"
          sub="¿Qué debo pagar? · ¿Tengo caja para pagarlo?"
        />

        {/* E1/E2/E3 — 3 columnas: Proveedores · Bancos/Créditos · Presión de Caja */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[4], marginBottom: S[4] }}>

          {/* E1 — Obligaciones con proveedores */}
          <CardPanel>
            <CardHead
              title="Proveedores"
              sub="Cuentas por pagar — CXP"
              right={
                <Link href={`/${orgSlug}/agentik`} style={{ fontSize: T.sz.xs, color: "#4f46e5", textDecoration: "none", fontWeight: T.wt.semibold }}>
                  Registrar →
                </Link>
              }
            />
            <div style={{ padding: `${S[4]}px ${S[4]}px ${S[3]}px` }}>
              <div style={{ fontSize: T.sz["3xl"], fontWeight: T.wt.black, color: C.inkGhost, letterSpacing: "-0.02em", lineHeight: 1, marginBottom: 4 }}>
                —
              </div>
              <div style={{ fontSize: T.sz.xs, color: C.inkGhost, lineHeight: 1.5, marginBottom: S[3] }}>
                Sin obligaciones con proveedores registradas.
                <br />
                Aquí verás el total pendiente, vencimientos
                <br />
                y proveedores críticos por pagar.
              </div>
              <div style={{ fontSize: T.sz.xs, color: C.inkGhost, background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.sm, padding: "4px 8px", display: "inline-block" }}>
                Integración SAG CXP · pendiente
              </div>
            </div>
          </CardPanel>

          {/* E2 — Bancos y créditos activos */}
          <CardPanel>
            <CardHead
              title="Bancos y Créditos"
              sub="Obligaciones financieras activas"
              right={
                <Link href={`/${orgSlug}/agentik`} style={{ fontSize: T.sz.xs, color: "#4f46e5", textDecoration: "none", fontWeight: T.wt.semibold }}>
                  Registrar →
                </Link>
              }
            />
            <div style={{ padding: `${S[4]}px ${S[4]}px ${S[3]}px` }}>
              <div style={{ fontSize: T.sz["3xl"], fontWeight: T.wt.black, color: C.inkGhost, letterSpacing: "-0.02em", lineHeight: 1, marginBottom: 4 }}>
                —
              </div>
              <div style={{ fontSize: T.sz.xs, color: C.inkGhost, lineHeight: 1.5, marginBottom: S[3] }}>
                Sin créditos bancarios registrados.
                <br />
                Los créditos activos aparecerán aquí con
                <br />
                su cuota y próxima fecha de pago.
              </div>
              <div style={{ fontSize: T.sz.xs, color: C.inkGhost, background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.sm, padding: "4px 8px", display: "inline-block" }}>
                Registro manual · próximamente
              </div>
            </div>
          </CardPanel>

          {/* E3 — Presión de caja: AR inflow vs compromisos */}
          {(() => {
            const signal = arInflow30 === 0
              ? null
              : arInflow30 >= 0
                ? "POSITIVO"  // no AP data — show AR only with caveat
                : "CRÍTICO";
            const signalColor  = signal === "CRÍTICO" ? C.red : signal === "POSITIVO" ? C.green : C.inkGhost;
            const signalBg     = signal === "CRÍTICO" ? C.redLight : signal === "POSITIVO" ? C.greenLight : C.surface;
            const signalBorder = signal === "CRÍTICO" ? C.redBorder : signal === "POSITIVO" ? C.greenBorder : C.line;
            return (
              <CardPanel>
                <CardHead
                  title="Presión de Caja — 30 días"
                  sub="Ingresos proyectados vs compromisos"
                />
                <div style={{ padding: `${S[3]}px ${S[4]}px` }}>
                  {/* Signal badge */}
                  {signal && (
                    <div style={{ marginBottom: S[2] }}>
                      <span style={{
                        fontSize: T.sz.xs, fontWeight: T.wt.black,
                        color: signalColor, background: signalBg,
                        border: `1px solid ${signalBorder}`,
                        borderRadius: R.xs, padding: "2px 8px", letterSpacing: "0.06em",
                      }}>
                        {signal}
                      </span>
                    </div>
                  )}
                  {cashFlow.hasData ? (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: S[1] + 2, marginBottom: S[2] }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: T.sz.xs, color: C.inkLight }}>Cobranza proyectada (base)</span>
                          <span style={{ fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.green }}>{fmtCOP(arInflow30)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: T.sz.xs, color: C.inkLight }}>Cobranza conservadora (60%)</span>
                          <span style={{ fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.inkMid }}>{fmtCOP(arInflow30Con)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: S[1], borderTop: `1px dashed ${C.lineSubtle}` }}>
                          <span style={{ fontSize: T.sz.xs, color: C.inkFaint }}>Compromisos AP</span>
                          <span style={{ fontSize: T.sz.xs, color: C.inkGhost, fontStyle: "italic" }}>sin datos aún</span>
                        </div>
                      </div>
                      <div style={{ fontSize: T.sz.xs, color: C.inkFaint, lineHeight: 1.4 }}>
                        Basado en {cashHorizon30?.receivableCount ?? 0} facturas con vencimiento próximos 30 días.
                        <br />
                        Compromisos AP no registrados — cifra parcial.
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: T.sz["3xl"], fontWeight: T.wt.black, color: C.inkGhost, letterSpacing: "-0.02em", lineHeight: 1, marginBottom: 4 }}>
                        —
                      </div>
                      <div style={{ fontSize: T.sz.xs, color: C.inkGhost, lineHeight: 1.5 }}>
                        Sin cartera activa para proyectar.
                        <br />
                        Disponible cuando existan facturas
                        <br />
                        abiertas en la ventana actual.
                      </div>
                    </>
                  )}
                </div>
              </CardPanel>
            );
          })()}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          BLOQUE F — CONTROL PRESUPUESTAL
          ¿Cómo voy vs el plan?
          ══════════════════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: S[6] }}>
        <SectionHeader
          label="F — Control Presupuestal"
          sub={`¿Cómo vamos vs el plan? · ${curMonthLbl} · ${now.getFullYear()}`}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[4], marginBottom: S[4] }}>

          {/* F1 — Presupuesto vs Ejecución */}
          <CardPanel>
            <CardHead
              title={hasBudget ? `Presupuesto vs Ejecución · ${curMonthLbl}` : "Presupuesto vs Ejecución"}
              sub={hasBudget ? "ventas reales F1 vs target configurado" : undefined}
              right={
                <Link href={`/${orgSlug}/finance`} style={{ fontSize: T.sz.xs, color: C.brand, textDecoration: "none", fontWeight: T.wt.semibold }}>
                  {hasBudget ? "Ver finanzas →" : "Configurar →"}
                </Link>
              }
            />
            {!hasBudget ? (
              <div style={{ padding: `${S[5]}px ${S[4]}px`, textAlign: "center" }}>
                <div style={{ fontSize: T.sz.sm, color: C.inkGhost, fontWeight: T.wt.bold, marginBottom: 6 }}>
                  Sin presupuesto configurado
                </div>
                <div style={{ fontSize: T.sz.xs, color: C.inkGhost, lineHeight: 1.5, marginBottom: S[3] }}>
                  Define las metas de ventas mensuales para ver
                  <br />
                  la varianza entre plan y ejecución real.
                </div>
                <Link href={`/${orgSlug}/finance`} style={{
                  display: "inline-block", fontSize: T.sz.xs, fontWeight: T.wt.bold,
                  color: C.brand, background: C.brandLight, border: `1px solid ${C.brandBorder}`,
                  borderRadius: R.sm, padding: "5px 12px", textDecoration: "none",
                }}>
                  Ir a configurar presupuesto →
                </Link>
              </div>
            ) : (
              <div style={{ padding: `${S[3]}px ${S[4]}px` }}>
                {/* Summary KPIs */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[3], marginBottom: S[4] }}>
                  <div>
                    <div style={{ fontSize: T.sz.xs, color: C.inkLight, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Plan</div>
                    <div style={{ fontSize: T.sz["2xl"], fontWeight: T.wt.black, color: C.inkMid, letterSpacing: "-0.02em" }}>{fmtCOP(budgetTotal)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: T.sz.xs, color: C.inkLight, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Ejecución</div>
                    <div style={{ fontSize: T.sz["2xl"], fontWeight: T.wt.black, color: C.ink, letterSpacing: "-0.02em" }}>{fmtCOP(actualTotal)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: T.sz.xs, color: C.inkLight, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Varianza</div>
                    <div style={{ fontSize: T.sz["2xl"], fontWeight: T.wt.black, color: varianceAbs >= 0 ? C.green : C.red, letterSpacing: "-0.02em" }}>
                      {varianceAbs >= 0 ? "+" : ""}{fmtCOP(varianceAbs)}
                    </div>
                  </div>
                </div>
                {/* Progress bar */}
                <div style={{ marginBottom: S[2] }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: T.sz.xs, color: C.inkLight }}>Cumplimiento</span>
                    <span style={{ fontSize: T.sz.xs, fontWeight: T.wt.bold, color: cumplimiento >= 95 ? C.green : cumplimiento >= 80 ? C.amber : C.red }}>
                      {cumplimiento.toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ background: C.lineSubtle, borderRadius: R.pill, height: 8, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: R.pill,
                      width: `${Math.min(100, cumplimiento)}%`,
                      background: cumplimiento >= 95 ? C.green : cumplimiento >= 80 ? C.amber : C.red,
                    }} />
                  </div>
                </div>
                {/* Variance by dimension */}
                {budgetVariance.rows.filter(r => r.dimension !== "TOTAL" && r.category === "revenue").slice(0, 4).map((row, i) => (
                  <div key={`${row.dimension}-${row.dimensionKey}`} style={{
                    display: "flex", alignItems: "center", gap: S[2],
                    padding: `${S[1] + 2}px 0`,
                    borderTop: i === 0 ? `1px solid ${C.lineSubtle}` : undefined,
                    borderBottom: `1px solid ${C.lineSubtle}`,
                  }}>
                    <div style={{ flex: 1, fontSize: T.sz.xs, color: C.inkMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.dimensionLabel}
                    </div>
                    <div style={{ fontSize: T.sz.xs, color: C.inkFaint, width: 70, textAlign: "right" }}>{fmtCOP(row.actual)}</div>
                    <div style={{ fontSize: T.sz.xs, fontWeight: T.wt.bold, color: row.variance >= 0 ? C.green : C.red, width: 60, textAlign: "right" }}>
                      {row.variance >= 0 ? "+" : ""}{row.variancePct.toFixed(0)}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardPanel>

          {/* F2 — Proyección de cierre */}
          <CardPanel>
            <CardHead
              title={`Proyección de cierre · ${curMonthLbl}`}
              sub="¿Voy a cumplir el mes a ritmo actual?"
              right={
                <Link href={`/${orgSlug}/sales`} style={{ fontSize: T.sz.xs, color: C.brand, textDecoration: "none", fontWeight: T.wt.semibold }}>
                  Ver ventas →
                </Link>
              }
            />
            {!revenueForecast.hasData ? (
              <div style={{ padding: `${S[5]}px ${S[4]}px`, textAlign: "center" }}>
                <div style={{ fontSize: T.sz.sm, color: C.inkGhost, fontWeight: T.wt.bold, marginBottom: 6 }}>
                  Sin ventas registradas
                </div>
                <div style={{ fontSize: T.sz.xs, color: C.inkGhost, lineHeight: 1.5 }}>
                  La proyección de cierre se calcula
                  <br />
                  cuando hay ventas SAG registradas.
                </div>
              </div>
            ) : (
              <div style={{ padding: `${S[3]}px ${S[4]}px` }}>
                {/* Signal badge */}
                {projectionSignal && (
                  <div style={{ marginBottom: S[3] }}>
                    <span style={{
                      fontSize: T.sz.xs, fontWeight: T.wt.black, letterSpacing: "0.06em",
                      color:      projectionSignal === "EN RUTA" ? C.green : projectionSignal === "EN RIESGO" ? C.amber : C.red,
                      background: projectionSignal === "EN RUTA" ? C.greenLight : projectionSignal === "EN RIESGO" ? C.amberLight : C.redLight,
                      border: `1px solid ${projectionSignal === "EN RUTA" ? C.greenBorder : projectionSignal === "EN RIESGO" ? C.amberBorder : C.redBorder}`,
                      borderRadius: R.xs, padding: "2px 8px",
                    }}>
                      {projectionSignal}
                    </span>
                  </div>
                )}
                {/* KPIs */}
                <div style={{ display: "flex", flexDirection: "column", gap: S[2], marginBottom: S[3] }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: T.sz.xs, color: C.inkLight }}>Ventas hasta hoy</span>
                    <span style={{ fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>{fmtCOP(revenueForecast.monthToDate)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: T.sz.xs, color: C.inkLight }}>Proyección mes completo</span>
                    <span style={{ fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.brand }}>{fmtCOP(revenueForecast.monthProjection)}</span>
                  </div>
                  {hasBudget && budgetTotal > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: S[1], borderTop: `1px solid ${C.lineSubtle}` }}>
                      <span style={{ fontSize: T.sz.xs, color: C.inkLight }}>Target del mes</span>
                      <span style={{ fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.inkMid }}>{fmtCOP(budgetTotal)}</span>
                    </div>
                  )}
                  {!hasBudget && (
                    <div style={{ paddingTop: S[1], borderTop: `1px solid ${C.lineSubtle}` }}>
                      <span style={{ fontSize: T.sz.xs, color: C.inkGhost, fontStyle: "italic" }}>Sin target configurado — sin señal de cumplimiento</span>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: T.sz.xs, color: C.inkFaint }}>
                  Día {revenueForecast.dayOfMonth} de {revenueForecast.daysInMonth} · extrapolación lineal a ritmo actual
                </div>
              </div>
            )}
          </CardPanel>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          BLOQUE G — TAREAS Y ALERTAS
          ══════════════════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: S[6] }}>
        <SectionHeader
          label="G — Tareas y Alertas"
          sub="Visibles siempre · Prioridades · Pendientes · Desviaciones"
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[4] }}>

          {/* Tareas */}
          <CardPanel>
            <CardHead
              title="Tareas pendientes"
              sub={tareas.length > 0 ? `${tareas.length} abiertas` : "sin tareas activas"}
              right={<Link href={`/${orgSlug}/agentik`} style={{ fontSize: T.sz.xs, color: C.brand, textDecoration: "none", fontWeight: T.wt.semibold }}>Nueva tarea →</Link>}
            />
            {tareas.length === 0 ? (
              <div style={{ padding: `${S[5]}px ${S[4]}px`, textAlign: "center" }}>
                <div style={{ fontSize: 26, marginBottom: S[1] }}>✓</div>
                <div style={{ fontSize: T.sz.sm, color: C.green, fontWeight: T.wt.bold }}>Sin tareas pendientes</div>
                <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: 4 }}>Las tareas creadas en Agentik aparecerán aquí</div>
              </div>
            ) : tareas.map((t, i) => {
              const dotColor = PRIORITY_COLOR[t.priority] ?? C.inkLight;
              const isOverdue = t.dueAt && t.dueAt < now;
              return (
                <Link key={t.id} href={`/${orgSlug}/agentik`} style={{
                  display: "flex", alignItems: "flex-start", gap: S[2], textDecoration: "none",
                  padding: `${S[2] + 2}px ${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}`,
                  background: i % 2 === 0 ? C.white : C.surface,
                  borderLeft: `3px solid ${dotColor}`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>{t.title}</div>
                    {t.targetLabel && <div style={{ fontSize: T.sz.xs, color: C.inkFaint }}>{t.targetLabel}</div>}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <span style={{ fontSize: T.sz.xs, fontWeight: T.wt.bold, color: dotColor, textTransform: "uppercase" }}>{t.priority}</span>
                    {t.dueAt && <div style={{ fontSize: T.sz.xs, color: isOverdue ? C.red : C.inkFaint, marginTop: 2 }}>{isOverdue ? "VENCIDA · " : ""}{fmtDate(t.dueAt)}</div>}
                  </div>
                </Link>
              );
            })}
          </CardPanel>

          {/* Alertas */}
          <CardPanel redBorder={alertas.some(a => a.severity === "CRITICAL")}>
            <CardHead
              title="Alertas activas"
              sub={alertas.length > 0 ? `${alertas.length} sin resolver` : "sin alertas activas"}
              urgent={alertas.some(a => a.severity === "CRITICAL")}
              right={<Link href={`/${orgSlug}/alerts`} style={{ fontSize: T.sz.xs, color: alertas.length > 0 ? C.red : C.brand, textDecoration: "none", fontWeight: T.wt.semibold }}>Ver todas →</Link>}
            />
            {alertas.length === 0 ? (
              <div style={{ padding: `${S[5]}px ${S[4]}px`, textAlign: "center" }}>
                <div style={{ fontSize: 26, marginBottom: S[1] }}>✓</div>
                <div style={{ fontSize: T.sz.sm, color: C.green, fontWeight: T.wt.bold }}>Sin alertas activas</div>
                <div style={{ fontSize: T.sz.xs, color: C.inkFaint, marginTop: 4 }}>Las alertas del sistema aparecerán aquí</div>
              </div>
            ) : alertas.map((a, i) => {
              const sty = SEV_STYLE[a.severity] ?? SEV_STYLE.INFO;
              return (
                <Link key={a.id} href={`/${orgSlug}/alerts/${a.id}`} style={{
                  display: "flex", alignItems: "center", gap: S[2], textDecoration: "none",
                  padding: `${S[2] + 2}px ${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}`,
                  background: i % 2 === 0 ? C.white : C.surface,
                }}>
                  <span style={{
                    fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
                    background: sty.bg, color: sty.text, border: `1px solid ${sty.border}`,
                    borderRadius: R.xs, padding: "1px 5px", flexShrink: 0,
                  }}>
                    {a.severity}
                  </span>
                  <div style={{ flex: 1, fontSize: T.sz.sm, color: C.ink, fontWeight: T.wt.semibold }}>{a.title}</div>
                  <div style={{ fontSize: T.sz.xs, color: C.inkFaint, flexShrink: 0 }}>{fmtDate(a.createdAt)}</div>
                  <div style={{ fontSize: T.sz.xs, color: C.brand, flexShrink: 0 }}>→</div>
                </Link>
              );
            })}
          </CardPanel>
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div style={{
        fontSize: T.sz.xs, color: C.inkGhost,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        paddingTop: S[2], paddingBottom: S[4], borderTop: `1px solid ${C.line}`,
      }}>
        <span>Torre de Control · {organization.name} · ventana: {win.label}</span>
        <span style={{ display: "flex", gap: S[4] }}>
          {!isFullHistory && (
            <span>
              {fmtNum(totalDocs)} docs en ventana · {fmtNum(totalHistoricoDocs)} total histórico ·{" "}
              <Link href={`${baseHref}?window=full_history`} style={{ color: C.brand, textDecoration: "none" }}>
                ver histórico →
              </Link>
            </span>
          )}
          <span style={{ color: C.amberMid }}>⚠ paidAmount=0 · SAG sin pagos</span>
        </span>
      </div>

    </div>
  );
}
