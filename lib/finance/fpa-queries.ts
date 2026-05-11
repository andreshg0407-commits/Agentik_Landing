/**
 * lib/finance/fpa-queries.ts
 *
 * Finance V2 — FP&A (Planeación y Presupuesto) data layer.
 *
 * All functions return graceful empty/zero results when ERP data is not yet
 * available.  The page uses `hasData` flags to show appropriate empty states
 * instead of broken charts or N/A numbers.
 *
 * Data sources:
 *   SaleRecord        → revenue actuals (actuals for forecast + variance)
 *   CustomerReceivable → cash flow / aging / inflow forecast
 *   Budget            → planned targets (for variance analysis)
 */

import { prisma } from "@/lib/prisma";
import { BudgetDimension, BudgetPeriod } from "@prisma/client";
import { Prisma } from "@prisma/client";
import {
  REVENUE_SOURCE_CONDITION,
  DISPATCH_SOURCE_CONDITION,
  fromSagSourceType,
  getSourceSemantics,
} from "@/lib/sag/source-semantics";
import { PRISMA_EXCLUIR_ARKETOPS, SQL_FILTER_EXCLUIR_ARKETOPS } from "@/lib/sag/master-data/source-semantic-rules";
import type { FiscalWindow } from "@/lib/finance/fiscal-window";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(d: { toString(): string } | null | undefined): number {
  if (d == null) return 0;
  const n = parseFloat(d.toString());
  return isFinite(n) ? n : 0;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate(); // month is 1-indexed here
}

function quarter(month: number): number {
  return Math.ceil(month / 3);
}

function startOfQuarter(year: number, q: number): Date {
  return new Date(year, (q - 1) * 3, 1);
}

function endOfQuarter(year: number, q: number): Date {
  return new Date(year, q * 3, 1);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MonthlyTotal {
  year:  number;
  month: number;
  total: number;
}

export interface RevenueForecast {
  hasData:              boolean;
  currency:             string;
  // Month
  monthToDate:          number;
  monthProjection:      number;  // extrapolated to month-end
  dayOfMonth:           number;
  daysInMonth:          number;
  // Quarter
  quarterToDate:        number;
  quarterForecast:      number;
  currentQuarter:       number;
  // Rolling 12M
  rolling12Months:      MonthlyTotal[];
  rolling12Total:       number;
  // Prior period (YoY)
  priorYearSameMonthTotal: number;
  yoyGrowthPct:         number | null; // null if no prior-year data
}

export interface BudgetRow {
  id:             string;
  dimension:      BudgetDimension;
  dimensionKey:   string;
  dimensionLabel: string;
  category:       string;
  amount:         number;
  currency:       string;
  year:           number;
  month:          number | null;
  quarter:        number | null;
  periodType:     BudgetPeriod;
}

export interface VarianceRow {
  dimension:      BudgetDimension;
  dimensionKey:   string;
  dimensionLabel: string;
  category:       string;
  budgeted:       number;
  actual:         number;
  variance:       number;   // actual - budgeted
  variancePct:    number;   // (actual - budgeted) / budgeted * 100
  currency:       string;
}

export interface CashFlowBucket {
  label:        string;
  daysLabel:    string;
  expected:     number;    // base-case expected inflow
  conservative: number;    // ×0.60
  aggressive:   number;    // ×0.95
  receivableCount: number;
}

export interface CashFlowSummary {
  hasData:         boolean;
  currency:        string;
  totalOutstanding: number;  // all OPEN/PARTIAL
  totalOverdue:    number;   // past due date
  // Inflow forecast by horizon
  horizons:        CashFlowBucket[];
  // Aging breakdown
  aging: {
    bucket:  string;
    amount:  number;
    count:   number;
  }[];
  // Recovery scenario for overdue
  overdueRecovery: {
    conservative: number;
    base:         number;
    aggressive:   number;
  };
}

export interface FpaRecommendation {
  id:       string;
  severity: "info" | "warning" | "critical";
  category: "budget" | "cashflow" | "growth" | "workforce";
  title:    string;
  body:     string;
  metric?:  string;
}

// ── Revenue Forecast ──────────────────────────────────────────────────────────

export async function getFpaRevenueForecast(
  organizationId: string,
): Promise<RevenueForecast> {
  const now      = new Date();
  const year     = now.getFullYear();
  const month    = now.getMonth() + 1; // 1-indexed
  const dom      = now.getDate();
  const dim      = daysInMonth(year, month);
  const q        = quarter(month);
  const currency = "COP";

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd   = new Date(year, month, 1);
  const qStart     = startOfQuarter(year, q);
  const qEnd       = endOfQuarter(year, q);
  const rolling12Start = new Date(now.getFullYear() - 1, now.getMonth(), 1);

  // Prior year same month
  const pyMonthStart = new Date(year - 1, month - 1, 1);
  const pyMonthEnd   = new Date(year - 1, month, 1);

  // Finance rule (FUENTE_1 = shouldCountForRevenue): only OFICIAL rows contribute
  // to recognized revenue, budget actuals, and DIAN reconciliation.
  // REMISION (FUENTE_2) feeds operational demand / near-term forecast only.
  // See: REVENUE_SOURCE_CONDITION in lib/sag/source-semantics.ts
  // Sprint 3.1: exclude ARKETOPS codes from all revenue KPIs.
  const revenueWhere = { organizationId, sagSourceType: "OFICIAL", ...PRISMA_EXCLUIR_ARKETOPS } as any;

  const [mtdAgg, qtdAgg, pyAgg, rolling12Raw] = await Promise.all([
    // Month to date — OFICIAL only
    prisma.saleRecord.aggregate({
      where: { ...revenueWhere, saleDate: { gte: monthStart, lt: monthEnd } },
      _sum: { amount: true },
    }),
    // Quarter to date — OFICIAL only
    prisma.saleRecord.aggregate({
      where: { ...revenueWhere, saleDate: { gte: qStart, lt: qEnd } },
      _sum: { amount: true },
    }),
    // Prior year same month — OFICIAL only
    prisma.saleRecord.aggregate({
      where: { ...revenueWhere, saleDate: { gte: pyMonthStart, lt: pyMonthEnd } },
      _sum: { amount: true },
    }),
    // Rolling 12 months — FUENTE_1 only, raw SQL for month-level grouping
    prisma.$queryRaw<{ yr: number; mo: number; total: string }[]>(Prisma.sql`
      SELECT
        EXTRACT(YEAR  FROM "saleDate")::int AS yr,
        EXTRACT(MONTH FROM "saleDate")::int AS mo,
        SUM(amount)::text                   AS total
      FROM "SaleRecord"
      WHERE "organizationId" = ${organizationId}
        AND "saleDate"        >= ${rolling12Start}
        AND ${Prisma.raw(REVENUE_SOURCE_CONDITION)}
      GROUP BY 1, 2
      ORDER BY 1, 2
    `),
  ]);

  const monthToDate     = toNum(mtdAgg._sum.amount);
  const quarterToDate   = toNum(qtdAgg._sum.amount);
  const priorYearSameMonth = toNum(pyAgg._sum.amount);

  // Straight-line extrapolation to month-end (only if we have some days elapsed)
  const dailyRate      = dom > 0 ? monthToDate / dom : 0;
  const monthProjection = dailyRate * dim;

  // Quarter forecast: scale current QTD run rate to full quarter days
  const qDaysElapsed = Math.ceil((now.getTime() - qStart.getTime()) / 86_400_000) || 1;
  const qDaysTotal   = Math.ceil((qEnd.getTime() - qStart.getTime()) / 86_400_000);
  const quarterForecast = qDaysElapsed > 0 ? (quarterToDate / qDaysElapsed) * qDaysTotal : 0;

  const rolling12Months: MonthlyTotal[] = rolling12Raw.map((r) => ({
    year:  r.yr,
    month: r.mo,
    total: parseFloat(r.total ?? "0"),
  }));
  const rolling12Total = rolling12Months.reduce((s, r) => s + r.total, 0);

  const yoyGrowthPct =
    priorYearSameMonth > 0
      ? ((monthToDate - priorYearSameMonth) / priorYearSameMonth) * 100
      : null;

  const hasData = rolling12Total > 0 || monthToDate > 0;

  return {
    hasData,
    currency,
    monthToDate,
    monthProjection,
    dayOfMonth:   dom,
    daysInMonth:  dim,
    quarterToDate,
    quarterForecast,
    currentQuarter: q,
    rolling12Months,
    rolling12Total,
    priorYearSameMonthTotal: priorYearSameMonth,
    yoyGrowthPct,
  };
}

// ── Budget Allocation ─────────────────────────────────────────────────────────

export async function getFpaBudgets(
  organizationId: string,
  year: number,
): Promise<BudgetRow[]> {
  const rows = await prisma.budget.findMany({
    where: { organizationId, year },
    orderBy: [{ dimension: "asc" }, { dimensionKey: "asc" }, { category: "asc" }],
  });
  return rows.map((r) => ({
    id:             r.id,
    dimension:      r.dimension,
    dimensionKey:   r.dimensionKey,
    dimensionLabel: r.dimensionLabel,
    category:       r.category,
    amount:         toNum(r.amount),
    currency:       r.currency,
    year:           r.year,
    month:          r.month,
    quarter:        r.quarter,
    periodType:     r.periodType,
  }));
}

// ── Variance Analysis ─────────────────────────────────────────────────────────

export async function getFpaVariance(
  organizationId: string,
  year: number,
): Promise<{ rows: VarianceRow[]; hasData: boolean }> {
  const budgets = await getFpaBudgets(organizationId, year);
  if (budgets.length === 0) return { rows: [], hasData: false };

  // Get actual SaleRecord totals grouped by each dimension.
  // Finance rule: only OFICIAL (Fuente 1) contributes to recognized revenue actuals.
  const yearStart = new Date(year, 0, 1);
  const yearEnd   = new Date(year + 1, 0, 1);
  // Sprint 3.1: exclude ARKETOPS codes from variance actuals.
  const where     = { organizationId, saleDate: { gte: yearStart, lt: yearEnd }, sagSourceType: "OFICIAL" as const, ...PRISMA_EXCLUIR_ARKETOPS } as any;

  const [
    byStore,
    bySeller,
    byLine,
    byChannel,
    total,
  ] = await Promise.all([
    prisma.saleRecord.groupBy({
      by: ["storeSlug", "storeName"],
      where,
      _sum: { amount: true },
    }),
    prisma.saleRecord.groupBy({
      by: ["sellerSlug", "sellerName"],
      where,
      _sum: { amount: true },
    }),
    prisma.saleRecord.groupBy({
      by: ["productLine"],
      where,
      _sum: { amount: true },
    }),
    prisma.saleRecord.groupBy({
      by: ["channel"],
      where,
      _sum: { amount: true },
    }),
    prisma.saleRecord.aggregate({ where, _sum: { amount: true } }),
  ]);

  // Build a lookup map: "dimension:key" → actual amount
  const actuals = new Map<string, number>();
  actuals.set("TOTAL:total", toNum(total._sum.amount));
  for (const r of byStore)   actuals.set(`BRANCH:${r.storeSlug}`,   toNum(r._sum.amount));
  for (const r of bySeller)  actuals.set(`SELLER:${r.sellerSlug}`,  toNum(r._sum.amount));
  for (const r of byLine)    actuals.set(`LINE:${r.productLine}`,    toNum(r._sum.amount));
  for (const r of byChannel) actuals.set(`CHANNEL:${r.channel}`,    toNum(r._sum.amount));

  const rows: VarianceRow[] = budgets
    .filter((b) => b.category === "revenue") // variance vs revenue targets only
    .map((b) => {
      const key    = `${b.dimension}:${b.dimensionKey}`;
      const actual = actuals.get(key) ?? 0;
      const variance    = actual - b.amount;
      const variancePct = b.amount !== 0 ? (variance / b.amount) * 100 : 0;
      return {
        dimension:      b.dimension,
        dimensionKey:   b.dimensionKey,
        dimensionLabel: b.dimensionLabel,
        category:       b.category,
        budgeted:       b.amount,
        actual,
        variance,
        variancePct,
        currency:       b.currency,
      };
    });

  const hasData = rows.some((r) => r.budgeted > 0 || r.actual > 0);
  return { rows, hasData };
}

// ── Cash Flow Planning ────────────────────────────────────────────────────────

export async function getFpaCashFlow(
  organizationId: string,
  window?: FiscalWindow,
): Promise<CashFlowSummary> {
  const now    = new Date();
  const d30    = new Date(now.getTime() + 30  * 86_400_000);
  const d60    = new Date(now.getTime() + 60  * 86_400_000);
  const d90    = new Date(now.getTime() + 90  * 86_400_000);

  // Apply fiscal window to invoiceDate scope.
  // strict_year: hard range [Jan 1, Jan 1 next year) — no carry-over.
  // Other modes: include one prior year of carry-over open invoices.
  // Horizon forecasts (30/60/90d future due) are always unscoped — they are forward-looking.
  let invoiceDateFilter: object = {};
  if (window && window.mode === "strict_year") {
    const to = new Date(window.year + 1, 0, 1);
    invoiceDateFilter = { invoiceDate: { gte: window.from, lt: to } };
  } else if (window && window.mode !== "full_history") {
    const priorYearFrom = new Date(window.from);
    priorYearFrom.setFullYear(priorYearFrom.getFullYear() - 1);
    invoiceDateFilter = { invoiceDate: { gte: priorYearFrom } };
  }

  // Canonical open status — mirrors RX_OPEN_STATUSES in receivables-snapshot.ts
  const where  = { organizationId, status: { in: ["OPEN", "PARTIAL", "OVERDUE"] }, ...invoiceDateFilter };

  const [totalAgg, overdueAgg, agingRaw, future30, future60, future90] = await Promise.all([
    prisma.customerReceivable.aggregate({
      where,
      _sum: { balanceDue: true },
      _count: true,
    }),
    // Vencido: daysOverdue > 0 — campo calculado por SAG en sync.
    // NO usar dueDate < now (live comparison que diverge del campo almacenado).
    prisma.customerReceivable.aggregate({
      where: { ...where, daysOverdue: { gt: 0 } },
      _sum: { balanceDue: true },
    }),
    // Aging breakdown by bucket
    prisma.customerReceivable.groupBy({
      by: ["agingBucket"],
      where,
      _sum:   { balanceDue: true },
      _count: true,
    }),
    // Future inflows: due within next 30d
    prisma.customerReceivable.aggregate({
      where: { ...where, dueDate: { gte: now, lt: d30 } },
      _sum: { balanceDue: true },
      _count: true,
    }),
    // Future inflows: due within next 60d
    prisma.customerReceivable.aggregate({
      where: { ...where, dueDate: { gte: now, lt: d60 } },
      _sum: { balanceDue: true },
      _count: true,
    }),
    // Future inflows: due within next 90d
    prisma.customerReceivable.aggregate({
      where: { ...where, dueDate: { gte: now, lt: d90 } },
      _sum: { balanceDue: true },
      _count: true,
    }),
  ]);

  const totalOutstanding = toNum(totalAgg._sum.balanceDue);
  const totalOverdue     = toNum(overdueAgg._sum.balanceDue);
  const hasData          = totalAgg._count > 0;

  const mkHorizon = (
    label: string,
    daysLabel: string,
    agg: { _sum: { balanceDue?: { toString(): string } | null }; _count: number },
  ): CashFlowBucket => {
    const expected = toNum(agg._sum.balanceDue);
    return {
      label,
      daysLabel,
      expected,
      conservative: expected * 0.60,
      aggressive:   expected * 0.95,
      receivableCount: agg._count,
    };
  };

  const horizons: CashFlowBucket[] = [
    mkHorizon("30 días",  "0 – 30 d",  future30),
    mkHorizon("60 días",  "31 – 60 d", future60),
    mkHorizon("90 días",  "61 – 90 d", future90),
  ];

  const BUCKET_ORDER = ["CURRENT", "1-30", "31-60", "61-90", "90+"];
  const aging = BUCKET_ORDER
    .map((bucket) => {
      const row = agingRaw.find((r) => r.agingBucket === bucket);
      return {
        bucket,
        amount: row ? toNum(row._sum.balanceDue) : 0,
        count:  row ? row._count : 0,
      };
    })
    .filter((r) => r.amount > 0);

  const overdueRecovery = {
    conservative: totalOverdue * 0.40,
    base:         totalOverdue * 0.70,
    aggressive:   totalOverdue * 0.90,
  };

  return {
    hasData,
    currency: "COP",
    totalOutstanding,
    totalOverdue,
    horizons,
    aging,
    overdueRecovery,
  };
}

// ── AI Recommendations ────────────────────────────────────────────────────────

export function buildFpaRecommendations(
  forecast:  RevenueForecast,
  variance:  { rows: VarianceRow[]; hasData: boolean },
  cashFlow:  CashFlowSummary,
): FpaRecommendation[] {
  const recs: FpaRecommendation[] = [];

  // ── Cash shortfall risk ────────────────────────────────────────────────────
  if (cashFlow.hasData) {
    const h30 = cashFlow.horizons[0];
    if (h30.expected < cashFlow.totalOverdue * 0.5) {
      recs.push({
        id:       "cash-shortfall-risk",
        severity: "critical",
        category: "cashflow",
        title:    "Riesgo de déficit de caja a 30 días",
        body:
          `El flujo esperado en 30 días (${fmtCOP(h30.expected)}) es inferior a la cartera vencida ` +
          `(${fmtCOP(cashFlow.totalOverdue)}). Priorizar recuperación de cartera.`,
        metric: `${fmtCOP(cashFlow.totalOverdue)} vencido`,
      });
    } else if (cashFlow.totalOverdue > cashFlow.totalOutstanding * 0.3) {
      recs.push({
        id:       "high-overdue-ratio",
        severity: "warning",
        category: "cashflow",
        title:    "Alta proporción de cartera vencida",
        body:
          `${pct((cashFlow.totalOverdue / cashFlow.totalOutstanding) * 100)} del saldo total está vencido ` +
          `(${fmtCOP(cashFlow.totalOverdue)}). Revisar política de cobro.`,
        metric: `${pct((cashFlow.totalOverdue / cashFlow.totalOutstanding) * 100)} overdue`,
      });
    }
  }

  // ── Month-end projection vs prior year ─────────────────────────────────────
  if (forecast.hasData) {
    if (forecast.yoyGrowthPct !== null && forecast.yoyGrowthPct < -10) {
      recs.push({
        id:       "revenue-decline-yoy",
        severity: "warning",
        category: "growth",
        title:    "Ingresos por debajo del mismo mes del año anterior",
        body:
          `La proyección del mes actual (${fmtCOP(forecast.monthProjection)}) está ` +
          `${Math.abs(forecast.yoyGrowthPct).toFixed(1)}% por debajo del mismo período del año anterior.`,
        metric: `${forecast.yoyGrowthPct.toFixed(1)}% YoY`,
      });
    } else if (forecast.yoyGrowthPct !== null && forecast.yoyGrowthPct > 20) {
      recs.push({
        id:       "revenue-growth-yoy",
        severity: "info",
        category: "growth",
        title:    "Crecimiento de ingresos acelerado",
        body:
          `Crecimiento YoY de +${forecast.yoyGrowthPct.toFixed(1)}% vs el mismo mes del año anterior. ` +
          `Evaluar capacidad operativa para sostener el ritmo.`,
        metric: `+${forecast.yoyGrowthPct.toFixed(1)}% YoY`,
      });
    }
  }

  // ── Variance: budget reallocation suggestions ──────────────────────────────
  if (variance.hasData && variance.rows.length > 0) {
    const overperformers  = variance.rows
      .filter((r) => r.variancePct > 15)
      .sort((a, b) => b.variancePct - a.variancePct)
      .slice(0, 2);
    const underperformers = variance.rows
      .filter((r) => r.variancePct < -15)
      .sort((a, b) => a.variancePct - b.variancePct)
      .slice(0, 2);

    if (overperformers.length > 0 && underperformers.length > 0) {
      recs.push({
        id:       "budget-reallocation",
        severity: "info",
        category: "budget",
        title:    "Oportunidad de reasignación presupuestal",
        body:
          `${overperformers.map((r) => r.dimensionLabel).join(", ")} supera el presupuesto (+${overperformers[0].variancePct.toFixed(0)}%). ` +
          `${underperformers.map((r) => r.dimensionLabel).join(", ")} está por debajo (${underperformers[0].variancePct.toFixed(0)}%). ` +
          `Considerar reasignación presupuestal.`,
      });
    } else if (underperformers.length > 0) {
      recs.push({
        id:       "budget-underperformance",
        severity: "warning",
        category: "budget",
        title:    "Centros de costo por debajo del presupuesto",
        body:
          `${underperformers.map((r) => `${r.dimensionLabel} (${r.variancePct.toFixed(0)}%)`).join(", ")} ` +
          `no están alcanzando sus metas. Revisar causas raíz.`,
      });
    }
  }

  // ── Expansion & hiring affordability ──────────────────────────────────────
  if (cashFlow.hasData) {
    const h90Expected = cashFlow.horizons[2]?.expected ?? 0;
    if (h90Expected > cashFlow.totalOverdue * 2 && h90Expected > 0) {
      recs.push({
        id:       "expansion-affordability",
        severity: "info",
        category: "growth",
        title:    "Condiciones favorables para expansión",
        body:
          `El flujo esperado a 90 días (${fmtCOP(h90Expected)}) cubre más del doble de la cartera vencida. ` +
          `La estructura de caja es compatible con inversiones de expansión conservadoras.`,
      });
    }
  }

  // ── No data fallback ───────────────────────────────────────────────────────
  if (recs.length === 0) {
    if (!forecast.hasData && !cashFlow.hasData) {
      recs.push({
        id:       "no-data",
        severity: "info",
        category: "budget",
        title:    "Sin datos suficientes para recomendaciones",
        body:
          "Importa datos de ventas SAG y sincroniza cartera de clientes para activar las " +
          "recomendaciones automáticas de FP&A.",
      });
    }
  }

  return recs;
}

// ── Local format helpers (server-side) ───────────────────────────────────────

function fmtCOP(n: number): string {
  return "$" + new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function pct(n: number): string {
  return n.toFixed(1) + "%";
}

// ── Source-Split Finance Overview ─────────────────────────────────────────────
//
// Returns a side-by-side breakdown of FUENTE_1 vs FUENTE_2 for the current
// month, to power the "Vista por fuente" panel in Finance and Executive pages.
//
// Rules applied:
//   FUENTE_1 (OFICIAL)  → shouldCountForRevenue = true  → legal P&L truth
//   FUENTE_2 (REMISION) → shouldCountForRevenue = false → operational pipeline
//   Mixed total = F1 + F2 (for operational coverage view)

export interface SourceSplitOverview {
  hasData:              boolean;
  currency:             string;
  periodo:              string;   // "YYYYMM" of the queried month
  // FUENTE_1 — recognized revenue
  f1Amount:             number;
  f1Label:              string;   // "Fuente 1 — Factura oficial"
  // FUENTE_2 — dispatch / remision (operational pipeline)
  f2Amount:             number;
  f2Label:              string;   // "Fuente 2 — Remisión / Despacho"
  // Totals
  totalAmount:          number;   // F1 + F2 (operational coverage)
  f1SharePct:           number;   // F1 / total × 100
  f2SharePct:           number;   // F2 / total × 100
  // Conversion signal
  conversionRate:       number;   // F1 / (F1 + F2) × 100 — proxy for F2→F1 conversion
  // Legacy coverage
  legacyAssumedPct:     number;   // % of records with sourceInferredFrom = "legacy"
}

export async function getSourceSplitOverview(
  organizationId: string,
  periodoAoMes?:  string,
): Promise<SourceSplitOverview> {
  const now   = new Date();
  const p     = periodoAoMes ??
    `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

  const rows = await prisma.$queryRaw<Array<{
    source:         string;
    amount:         number;
    rec_count:      string;
    legacy_count:   string;
  }>>(Prisma.sql`
    SELECT
      "sagSourceType"::text                                         AS source,
      SUM("amount")::float8                                         AS amount,
      CAST(COUNT(*) AS TEXT)                                        AS rec_count,
      CAST(COUNT(*) FILTER (WHERE "sourceInferredFrom" = 'legacy') AS TEXT) AS legacy_count
    FROM   "SaleRecord"
    WHERE  "organizationId" = ${organizationId}
      AND  COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM')) = ${p}
      AND  "productLine" NOT ILIKE 'Total %'
      AND  "productLine" NOT ILIKE 'Subtotal%'
      AND  ${Prisma.raw(SQL_FILTER_EXCLUIR_ARKETOPS)}
    GROUP  BY 1
  `);

  let f1 = 0, f2 = 0, totalCount = 0, legacyCount = 0;
  for (const r of rows) {
    const amt   = Number(r.amount);
    const cnt   = Number(r.rec_count);
    const legCnt = Number(r.legacy_count);
    if (r.source === "OFICIAL") f1 += amt; else f2 += amt;
    totalCount  += cnt;
    legacyCount += legCnt;
  }

  const total            = f1 + f2;
  const sem1             = getSourceSemantics(fromSagSourceType("OFICIAL"));
  const sem2             = getSourceSemantics(fromSagSourceType("REMISION"));

  return {
    hasData:          total > 0,
    currency:         "COP",
    periodo:          p,
    f1Amount:         f1,
    f1Label:          sem1.sourceLabel,
    f2Amount:         f2,
    f2Label:          sem2.sourceLabel,
    totalAmount:      total,
    f1SharePct:       total > 0 ? (f1 / total) * 100 : 100,
    f2SharePct:       total > 0 ? (f2 / total) * 100 : 0,
    conversionRate:   total > 0 ? (f1 / total) * 100 : 100,
    legacyAssumedPct: totalCount > 0 ? (legacyCount / totalCount) * 100 : 0,
  };
}

export { BudgetDimension, BudgetPeriod };
