/**
 * lib/marketing-studio/commerce/shopify-statistics-service.ts
 *
 * SHOPIFY-STATISTICS-01 — Statistics Domain Service
 *
 * SERVER ONLY — never import from client components.
 *
 * Maps Shopify order data + existing Agentik domain services into the
 * canonical StatisticsOverview type. No logic duplication — re-uses:
 *   • shopify-operations-service (OperationListResult + alerts)
 *   • shopify-promotions-service (PromotionListResult)
 *   • product-query-service (ProductConsoleItem catalog state)
 *
 * ── Copilot Action Registry ────────────────────────────────────────────────────
 *
 *   statistics.getOverview()           — full executive snapshot
 *   statistics.getSalesMetrics()       — revenue, orders, AOV, units, customers
 *   statistics.getCatalogMetrics()     — publication state + top/bottom sellers
 *   statistics.getPromotionMetrics()   — active/expired/scheduled + code usage
 *   statistics.getOperationsMetrics()  — alerts, delays, returns, refunds
 *   statistics.getTrendAnalysis()      — period-over-period comparison (6 KPIs)
 *   statistics.getExecutiveInsights()  — deterministic rule-based insights
 *
 * ── Natural language scenarios (Copilot) ──────────────────────────────────────
 *
 *   "Dame el resumen ejecutivo de la tienda."
 *     → getOverview(orgId, token, domain, "week")
 *
 *   "¿Cuánto vendimos esta semana vs la semana pasada?"
 *     → getTrendAnalysis(orgId, token, domain, "week") → revenue comparison
 *
 *   "¿Qué productos se venden más?"
 *     → getCatalogMetrics → topSelling
 *
 *   "¿Hay problemas operacionales urgentes?"
 *     → getExecutiveInsights → filter severity="critical"
 *
 *   "¿El ticket promedio mejoró este mes?"
 *     → getTrendAnalysis(period="month") → aov.direction + aov.pct
 *
 *   "¿Qué está generando más reembolsos?"
 *     → getSalesMetrics → refundsTotal; getCatalogMetrics → bottomSelling
 *
 * ── Data flow ─────────────────────────────────────────────────────────────────
 *
 *   Shopify listOrders (date-filtered)
 *       ↓
 *   computeSalesFromOrders()   → SalesMetrics
 *   computeCatalogMetrics()    → CatalogMetrics (+ ProductConsoleItem)
 *   buildTrendAnalysis()       → TrendAnalysis (current + previous period)
 *       ↓
 *   listPromotions()           → PromotionMetrics
 *   listOperations()           → OperationsMetrics (re-uses ops domain)
 *       ↓
 *   generateExecutiveInsights() → ExecutiveInsight[] (deterministic rules)
 *       ↓
 *   StatisticsOverview
 *
 * ── Architectural constraints ─────────────────────────────────────────────────
 *
 *   - No React imports. No Next.js router imports.
 *   - All exported functions accept (orgId, accessToken, shopDomain).
 *   - accessToken is never logged (⚠ server-only param).
 *   - No Prisma calls — statistics are computed from live Shopify + catalog data.
 *   - Period defaults to "week" when not specified.
 */

import { createShopifyClient }        from "@/lib/integrations/shopify/shopify-client";
import { listProductConsoleItems }     from "@/lib/marketing-studio/products/product-query-service";
import { listPromotions }              from "./shopify-promotions-service";
import { listOperations }              from "./shopify-operations-service";
import type { ShopifyOrder }           from "@/lib/integrations/shopify/shopify-types";
import type { ProductConsoleItem }     from "@/lib/marketing-studio/products/product-display";
import type { PromotionListResult }    from "./shopify-promotions-types";
import type { OperationListResult }    from "./shopify-operations-types";
import type {
  StatisticsPeriod,
  TrendDirection,
  TrendMetric,
  ComparisonMetric,
  SalesMetrics,
  FunnelMetrics,
  CatalogMetrics,
  CatalogProductStat,
  PromotionMetrics,
  OperationsMetrics,
  TrendAnalysis,
  ExecutiveInsight,
  InsightPriority,
  StatisticsOverview,
  MetricHealth,
  HealthedMetric,
  MetricHealthSummary,
} from "./shopify-statistics-types";

// ── Period date range ─────────────────────────────────────────────────────────

interface DateRange {
  from: Date;
  to:   Date;
}

interface PeriodRanges {
  current:  DateRange;
  previous: DateRange;
}

/**
 * Returns the current and previous date ranges for a given StatisticsPeriod.
 * Used to fetch and filter orders for trend comparison.
 */
function getPeriodRanges(period: StatisticsPeriod): PeriodRanges {
  const now    = new Date();
  const MS_DAY = 86_400_000;
  const daysAgo = (n: number) => new Date(now.getTime() - n * MS_DAY);
  const dayStart = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

  if (period === "today") {
    const from     = dayStart(now);
    const prevFrom = new Date(from.getTime() - MS_DAY);
    const prevTo   = new Date(from.getTime() - 1);
    return { current: { from, to: now }, previous: { from: prevFrom, to: prevTo } };
  }

  if (period === "yesterday") {
    const todayStart = dayStart(now);
    const from       = new Date(todayStart.getTime() - MS_DAY);
    const to         = new Date(todayStart.getTime() - 1);
    const prevFrom   = new Date(from.getTime() - MS_DAY);
    const prevTo     = new Date(to.getTime() - MS_DAY);
    return { current: { from, to }, previous: { from: prevFrom, to: prevTo } };
  }

  if (period === "month") {
    const from     = daysAgo(30);
    const prevFrom = daysAgo(60);
    const prevTo   = new Date(from.getTime() - 1);
    return { current: { from, to: now }, previous: { from: prevFrom, to: prevTo } };
  }

  if (period === "last_week") {
    const to       = daysAgo(7);
    const from     = daysAgo(14);
    const prevFrom = daysAgo(21);
    const prevTo   = new Date(from.getTime() - 1);
    return { current: { from, to }, previous: { from: prevFrom, to: prevTo } };
  }

  if (period === "last_month") {
    const to       = daysAgo(30);
    const from     = daysAgo(60);
    const prevFrom = daysAgo(90);
    const prevTo   = new Date(from.getTime() - 1);
    return { current: { from, to }, previous: { from: prevFrom, to: prevTo } };
  }

  // Default: "week" — last 7 days vs 8–14 days ago
  const from     = daysAgo(7);
  const prevFrom = daysAgo(14);
  const prevTo   = new Date(from.getTime() - 1);
  return { current: { from, to: now }, previous: { from: prevFrom, to: prevTo } };
}

// ── Trend computation helpers ─────────────────────────────────────────────────

function computeTrend(current: number, previous: number): TrendMetric {
  const delta = current - previous;
  let pct: number;
  if (previous === 0) {
    pct = current > 0 ? 100 : 0;
  } else {
    pct = (delta / previous) * 100;
  }
  const direction: TrendDirection = delta > 0 ? "up" : delta < 0 ? "down" : "stable";
  return {
    current,
    previous,
    delta:     Math.round(delta * 100) / 100,
    pct:       Math.round(pct * 10) / 10,
    direction,
  };
}

function buildComparison(
  label:    string,
  current:  number,
  previous: number,
  unit?:    string,
  format?:  ComparisonMetric["format"],
): ComparisonMetric {
  const t = computeTrend(current, previous);
  return { label, ...t, unit, format };
}

// ── Metric health engine ──────────────────────────────────────────────────────

/**
 * Polarity controls how direction maps to health:
 *
 *   positive — rising is good (revenue, orders, AOV)
 *   negative — rising is bad (refunds, returns, failed payments, delayed shipments)
 */
type HealthPolarity = "positive" | "negative";

interface HealthRule {
  label:        string;
  value:        number;
  previous:     number;
  polarity:     HealthPolarity;
  /**
   * ±% band treated as neutral (stable). Default: 5.
   * Change below this threshold in either direction → neutral.
   */
  neutralBand?: number;
  /**
   * For negative metrics: absolute value above this → warning even without previous.
   * Default: 1 (any > 0 is warning).
   */
  warnAbove?:   number;
  /**
   * For negative metrics: absolute value above this → critical.
   * Default: 3.
   */
  criticalAbove?: number;
  /**
   * % threshold (absolute) above which warning is triggered. Default: 10.
   * For positive: direction=down AND |pct| > warnPct → warning.
   * For negative: direction=up AND |pct| > warnPct → warning.
   */
  warnPct?: number;
  /**
   * % threshold (absolute) above which critical is triggered. Default: 20.
   */
  criticalPct?: number;
}

/**
 * Deterministic metric health classifier.
 *
 * NON-AI: pure threshold arithmetic — no language model.
 * Only classifies when both value and previous are known.
 * When previous = 0, falls back to absolute-value rules.
 */
function computeMetricHealth(
  rule: HealthRule,
): { metricHealth: MetricHealth; healthReason: string } {
  const {
    label,
    value,
    previous,
    polarity,
    neutralBand  = 5,
    warnAbove    = 1,
    criticalAbove = 3,
    warnPct      = 10,
    criticalPct  = 20,
  } = rule;

  const delta = value - previous;
  const pct   = previous !== 0
    ? Math.round((delta / previous) * 1000) / 10   // 1 decimal
    : value > 0 ? 100 : 0;

  const absPct = Math.abs(pct);

  // When no historical data — use absolute-value rules for negative metrics
  if (previous === 0) {
    if (polarity === "negative") {
      if (value === 0) {
        return { metricHealth: "neutral", healthReason: `${label}: sin incidencias en el período.` };
      }
      if (value > criticalAbove) {
        return { metricHealth: "critical", healthReason: `${label}: ${value} casos activos — nivel crítico.` };
      }
      return { metricHealth: "warning", healthReason: `${label}: ${value} caso(s) detectado(s) que requieren atención.` };
    }
    // positive with no previous: can't classify direction fairly
    return { metricHealth: "neutral", healthReason: `${label}: sin período anterior para comparar.` };
  }

  // Both current and previous exist — compare by pct
  if (polarity === "positive") {
    if (delta >= 0) {
      // Rising — good if above neutral band, otherwise neutral
      if (absPct >= neutralBand) {
        return {
          metricHealth: "good",
          healthReason: `${label} subió ${pct.toFixed(1)}% frente al período anterior.`,
        };
      }
      return {
        metricHealth: "neutral",
        healthReason: `${label} se mantuvo estable (${pct > 0 ? "+" : ""}${pct.toFixed(1)}%).`,
      };
    }
    // Falling
    if (absPct >= criticalPct) {
      return {
        metricHealth: "critical",
        healthReason: `${label} bajó ${absPct.toFixed(1)}% — caída crítica frente al período anterior.`,
      };
    }
    if (absPct >= warnPct) {
      return {
        metricHealth: "warning",
        healthReason: `${label} bajó ${absPct.toFixed(1)}% frente al período anterior.`,
      };
    }
    return {
      metricHealth: "neutral",
      healthReason: `${label} bajó levemente (${absPct.toFixed(1)}%) — dentro del margen normal.`,
    };
  }

  // Negative polarity: rising is bad
  if (delta > 0) {
    if (absPct >= criticalPct || value > criticalAbove) {
      return {
        metricHealth: "critical",
        healthReason: `${label} aumentó ${pct.toFixed(1)}% — nivel crítico.`,
      };
    }
    if (absPct >= neutralBand || value >= warnAbove) {
      return {
        metricHealth: "warning",
        healthReason: `${label} aumentó ${pct.toFixed(1)}% frente al período anterior.`,
      };
    }
  }
  if (delta < 0) {
    return {
      metricHealth: "good",
      healthReason: `${label} bajó ${absPct.toFixed(1)}% — mejora frente al período anterior.`,
    };
  }
  return {
    metricHealth: value === 0 ? "neutral" : "neutral",
    healthReason: `${label} se mantuvo estable frente al período anterior.`,
  };
}

/**
 * Builds a HealthedMetric from a rule definition.
 */
function buildHealthedMetric(rule: HealthRule): HealthedMetric {
  const { label, value, previous, polarity, ...rest } = rule;
  const delta       = value - previous;
  const deltaPercent = previous !== 0
    ? Math.round((delta / previous) * 1000) / 10
    : value > 0 ? 100 : 0;
  const direction: TrendDirection = delta > 0 ? "up" : delta < 0 ? "down" : "stable";
  const { metricHealth, healthReason } = computeMetricHealth({ label, value, previous, polarity, ...rest });

  return {
    label,
    value,
    previousValue: previous,
    delta:         Math.round(delta * 100) / 100,
    deltaPercent,
    direction,
    metricHealth,
    healthReason,
  };
}

/**
 * Builds the full MetricHealthSummary from sales and operations data.
 *
 * NON-AI: all classifications are deterministic threshold rules.
 * Requires both current and previous SalesMetrics for trend-based KPIs.
 * Operations metrics (failedPayments, delayedShipments) use absolute-value rules
 * when no previous-period operations data is available.
 */
function buildHealthSummary(
  current:   SalesMetrics,
  previous:  SalesMetrics,
  ops:       OperationsMetrics,
): MetricHealthSummary {
  const revenue = buildHealthedMetric({
    label:       "Ingresos",
    value:       current.totalRevenue,
    previous:    previous.totalRevenue,
    polarity:    "positive",
    neutralBand: 5,
    warnPct:     10,
    criticalPct: 20,
  });

  const orders = buildHealthedMetric({
    label:       "Pedidos",
    value:       current.orders,
    previous:    previous.orders,
    polarity:    "positive",
    neutralBand: 5,
    warnPct:     15,
    criticalPct: 30,
  });

  const averageOrderValue = buildHealthedMetric({
    label:       "Ticket promedio",
    value:       current.averageOrderValue,
    previous:    previous.averageOrderValue,
    polarity:    "positive",
    neutralBand: 5,
    warnPct:     10,
    criticalPct: 20,
  });

  const refunds = buildHealthedMetric({
    label:        "Reembolsos",
    value:        current.refundsTotal,
    previous:     previous.refundsTotal,
    polarity:     "negative",
    neutralBand:  5,
    warnPct:      10,
    criticalPct:  25,
    warnAbove:    1,
    criticalAbove: 5,
  });

  const returns = buildHealthedMetric({
    label:        "Devoluciones",
    value:        current.returnsTotal,
    previous:     previous.returnsTotal,
    polarity:     "negative",
    neutralBand:  5,
    warnPct:      10,
    criticalPct:  25,
    warnAbove:    1,
    criticalAbove: 3,
  });

  // Operations metrics: use 0 as previous (no historical ops data)
  const failedPayments = buildHealthedMetric({
    label:        "Pagos fallidos",
    value:        ops.failedPayments,
    previous:     0,
    polarity:     "negative",
    warnAbove:    1,
    criticalAbove: 3,
  });

  const delayedShipments = buildHealthedMetric({
    label:        "Envíos retrasados",
    value:        ops.delayedShipments,
    previous:     0,
    polarity:     "negative",
    warnAbove:    1,
    criticalAbove: 5,
  });

  const all = [revenue, orders, averageOrderValue, refunds, returns, failedPayments, delayedShipments];

  const healthRank: Record<MetricHealth, number> = {
    critical: 0,
    warning:  1,
    neutral:  2,
    good:     3,
  };

  const needsAttention = all
    .filter(m => m.metricHealth === "warning" || m.metricHealth === "critical")
    .sort((a, b) => {
      const rankDiff = healthRank[a.metricHealth] - healthRank[b.metricHealth];
      if (rankDiff !== 0) return rankDiff;
      return Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent);
    });

  const improving = all
    .filter(m => m.metricHealth === "good" && m.direction === "up")
    .sort((a, b) => b.deltaPercent - a.deltaPercent);

  return {
    revenue,
    orders,
    averageOrderValue,
    refunds,
    returns,
    failedPayments,
    delayedShipments,
    needsAttention,
    improving,
  };
}

// ── Order filtering ───────────────────────────────────────────────────────────

function filterOrdersByRange(orders: ShopifyOrder[], range: DateRange): ShopifyOrder[] {
  return orders.filter(o => {
    const d = new Date(o.created_at);
    return d >= range.from && d <= range.to;
  });
}

// ── Sales computation ─────────────────────────────────────────────────────────

/**
 * Derives SalesMetrics from a flat list of Shopify orders for a given period.
 * Pure function — no API calls.
 */
function computeSalesFromOrders(
  orders:  ShopifyOrder[],
  period:  StatisticsPeriod,
  range:   DateRange,
): SalesMetrics {
  // Exclude cancelled and voided orders from revenue
  const active = orders.filter(
    o => !o.cancelled_at && o.financial_status !== "voided",
  );

  const totalRevenue = active.reduce(
    (s, o) => s + parseFloat(o.total_price ?? "0"),
    0,
  );
  const ordersCount = active.length;
  const aov         = ordersCount > 0 ? totalRevenue / ordersCount : 0;

  const unitsSold = active.reduce(
    (s, o) => s + o.line_items.reduce((ls, li) => ls + li.quantity, 0),
    0,
  );

  // Customer deduplication (approximation within this order set)
  const idCounts = new Map<number, number>();
  for (const o of active) {
    const cid = o.customer?.id;
    if (cid != null) idCounts.set(cid, (idCounts.get(cid) ?? 0) + 1);
  }
  const newCustomers       = [...idCounts.values()].filter(c => c === 1).length;
  const returningCustomers = [...idCounts.values()].filter(c => c > 1).length;

  // Refund total: sum completed refund transactions
  const refundsTotal = active.reduce((s, o) => {
    return s + o.refunds.reduce((rs, r) => {
      return rs + r.transactions.reduce((ts, t) => {
        return t.kind === "refund" && t.status === "success"
          ? ts + parseFloat(t.amount ?? "0")
          : ts;
      }, 0);
    }, 0);
  }, 0);

  // Returns: orders with at least one returned line item
  const returnsTotal = active.filter(
    o => o.refunds.some(r => r.refund_line_items.length > 0),
  ).length;

  const netRevenue = Math.max(0, totalRevenue - refundsTotal);
  const currency   = active[0]?.currency ?? "COP";

  return {
    totalRevenue:       Math.round(totalRevenue),
    orders:             ordersCount,
    averageOrderValue:  Math.round(aov),
    unitsSold,
    newCustomers,
    returningCustomers,
    netRevenue:         Math.round(netRevenue),
    refundsTotal:       Math.round(refundsTotal),
    returnsTotal,
    currency,
    period,
    fromDate: range.from.toISOString(),
    toDate:   range.to.toISOString(),
  };
}

// ── Catalog computation ───────────────────────────────────────────────────────

/**
 * Derives CatalogMetrics from the Agentik product catalog + order line items.
 * Pure function — no API calls.
 */
function computeCatalogMetrics(
  products: ProductConsoleItem[],
  orders:   ShopifyOrder[],
  currency: string,
): CatalogMetrics {
  const total     = products.length;
  const published = products.filter(p =>
    p.publicationSummary.some(
      s => s.channel === "shopify" && s.publicationStatus === "published",
    ),
  ).length;
  const pending = total - published;

  // Aggregate sales per Shopify product ID from order line items
  const productSales = new Map<number, { title: string; units: number; revenue: number }>();
  for (const o of orders) {
    if (o.cancelled_at) continue;
    for (const li of o.line_items) {
      if (li.product_id == null) continue;
      const prev = productSales.get(li.product_id) ?? { title: li.title, units: 0, revenue: 0 };
      prev.units   += li.quantity;
      prev.revenue += parseFloat(li.price ?? "0") * li.quantity;
      productSales.set(li.product_id, prev);
    }
  }

  const statsArr: CatalogProductStat[] = [...productSales.entries()].map(([id, s]) => ({
    productId: `shopify:product:${id}`,
    title:     s.title,
    unitsSold: s.units,
    revenue:   Math.round(s.revenue),
    currency,
  }));

  const sorted      = [...statsArr].sort((a, b) => b.revenue - a.revenue);
  const topSelling  = sorted.slice(0, 10);
  const bottomSelling = sorted.length > 10
    ? [...sorted].reverse().slice(0, 5)
    : sorted.length > 1
      ? [sorted[sorted.length - 1]]
      : [];

  // neverSold: published products whose Shopify externalId is not in productSales
  const soldIds = new Set(productSales.keys());
  const neverSold = products.filter(p => {
    const shopifySync = p.syncSummary.find(s => s.channel === "shopify");
    if (!shopifySync?.externalId) return false;
    const shopifyId = parseInt(shopifySync.externalId, 10);
    return !isNaN(shopifyId) && !soldIds.has(shopifyId);
  }).length;

  return {
    totalProducts: total,
    published,
    pending,
    outOfStock:   0,   // TODO(SHOPIFY-STATISTICS-02): Shopify Inventory API
    lowStock:     0,   // TODO(SHOPIFY-STATISTICS-02): Shopify Inventory API
    neverSold,
    topSelling,
    bottomSelling,
  };
}

// ── Funnel (stub — top-of-funnel requires analytics connector) ────────────────

function buildFunnelMetrics(completedOrders: number): FunnelMetrics {
  return {
    visits:            null,   // TODO(SHOPIFY-STATISTICS-03): GA4 / Shopify Analytics
    productViews:      null,
    addToCart:         null,
    checkoutStarted:   null,
    completed:         completedOrders,
    visitsToCartRate:  null,
    cartToOrderRate:   null,
    overallConversion: null,
  };
}

// ── Promotion metrics ─────────────────────────────────────────────────────────

function computePromotionMetrics(
  result:   PromotionListResult,
  currency: string,
): PromotionMetrics {
  const totalCodeUsage = result.active.reduce((s, p) => s + p.currentUsage, 0);
  return {
    active:           result.active.length,
    scheduled:        result.scheduled.length,
    expired:          result.expired.length,
    disabled:         result.disabled.length,
    totalCodeUsage,
    discountsApplied: 0,   // TODO(SHOPIFY-STATISTICS-04): order.discount_applications
    estimatedImpact:  0,   // TODO(SHOPIFY-STATISTICS-04): order-level discount data
    currency,
  };
}

// ── Operations metrics ────────────────────────────────────────────────────────

/**
 * Derives OperationsMetrics from the OperationListResult produced by listOperations().
 * No extra API calls — OperationListResult already contains alert summaries.
 */
function computeOperationsMetrics(result: OperationListResult): OperationsMetrics {
  const returns = result.orders.filter(o => o.status === "returned").length;
  const refunds = result.orders.filter(
    o => o.paymentStatus === "refunded" || o.paymentStatus === "partially_refunded",
  ).length;

  return {
    failedPayments:    result.alerts.paymentFailures,
    delayedShipments:  result.alerts.stalledShipments,
    pendingDeliveries: result.inTransit.length,
    returns,
    refunds,
    openIncidents:     result.alerts.total,
    ordersAtRisk:      result.alerts.ordersAtRisk,
    criticalAlerts:    result.alerts.critical,
  };
}

// ── Trend analysis ────────────────────────────────────────────────────────────

function buildTrendAnalysis(
  period:  StatisticsPeriod,
  current: SalesMetrics,
  prev:    SalesMetrics,
): TrendAnalysis {
  // Enrich each ComparisonMetric with health classification
  const withHealth = (
    label:    string,
    value:    number,
    previous: number,
    polarity: HealthPolarity,
    unit?:    string,
    format?:  ComparisonMetric["format"],
    warnPct      = 10,
    criticalPct  = 20,
  ): ComparisonMetric => {
    const base = buildComparison(label, value, previous, unit, format);
    const { metricHealth, healthReason } = computeMetricHealth({
      label, value, previous, polarity, warnPct, criticalPct,
    });
    return { ...base, metricHealth, healthReason };
  };

  return {
    period,
    fromDate: current.fromDate,
    toDate:   current.toDate,
    revenue:  withHealth("Ingresos",         current.totalRevenue,      prev.totalRevenue,      "positive", current.currency, "currency", 10, 20),
    orders:   withHealth("Pedidos",          current.orders,            prev.orders,            "positive", "pedidos",        "integer",  15, 30),
    aov:      withHealth("Ticket promedio",  current.averageOrderValue, prev.averageOrderValue, "positive", current.currency, "currency", 10, 20),
    units:    withHealth("Unidades vendidas",current.unitsSold,         prev.unitsSold,         "positive", "unidades",       "integer",  15, 30),
    refunds:  withHealth("Reembolsos",       current.refundsTotal,      prev.refundsTotal,      "negative", current.currency, "currency", 10, 25),
    returns:  withHealth("Devoluciones",     current.returnsTotal,      prev.returnsTotal,      "negative", "pedidos",        "integer",  10, 25),
  };
}

// ── Executive insights (deterministic rule engine) ────────────────────────────

/**
 * Generates ExecutiveInsight[] from computed metric data.
 *
 * NON-AI: Rules are fixed threshold comparisons. No language model involved.
 * Insights are sorted by priority ascending (1 = most urgent first).
 *
 * Rules applied (in priority order):
 *   P1 CRITICAL — Payment failures detected
 *   P1 CRITICAL — High critical alert accumulation (> 3)
 *   P2 WARNING  — Delayed shipments (> 0)
 *   P2 WARNING  — High refund rate (> 10% of revenue)
 *   P2 WARNING  — Revenue declining > 15% vs previous period
 *   P3 WARNING  — AOV declining > 10%
 *   P4 INFO     — No active promotions
 *   P4 INFO     — Catalog products pending publication (> 10)
 *   P5 INFO     — Products with no sales recorded (> 5)
 */
function generateExecutiveInsights(
  sales:      SalesMetrics,
  catalog:    CatalogMetrics,
  promotions: PromotionMetrics,
  operations: OperationsMetrics,
  trends:     TrendAnalysis,
): ExecutiveInsight[] {
  const insights: ExecutiveInsight[] = [];
  let idx = 0;
  const mkId = () => `insight-${++idx}`;

  const push = (
    id:              string,
    category:        ExecutiveInsight["category"],
    title:           string,
    description:     string,
    severity:        ExecutiveInsight["severity"],
    impact:          ExecutiveInsight["impact"],
    priority:        InsightPriority,
    evidence:        string[],
    suggestedAction: string | null,
  ) => insights.push({ id, category, title, description, severity, impact, priority, evidence, suggestedAction });

  // P1 — Payment failures
  if (operations.failedPayments > 0) {
    push(
      mkId(), "operations",
      "Pagos fallidos detectados",
      `${operations.failedPayments} pedido(s) con pagos fallidos o revertidos requieren atención inmediata.`,
      "critical", "high", 1,
      [`${operations.failedPayments} pago(s) fallido(s) en el período actual`],
      "Revisar los pedidos con pagos fallidos y contactar a los clientes para recuperar las ventas.",
    );
  }

  // P1 — High critical alerts
  if (operations.criticalAlerts > 3) {
    push(
      mkId(), "operations",
      "Acumulación de alertas críticas",
      `${operations.criticalAlerts} alertas críticas activas. La tienda necesita atención operativa urgente.`,
      "critical", "high", 1,
      [`${operations.criticalAlerts} alertas críticas abiertas`],
      "Abrir el panel de Operaciones y resolver las alertas críticas en orden de prioridad.",
    );
  }

  // P2 — Delayed shipments
  if (operations.delayedShipments > 0) {
    const sev = operations.delayedShipments > 5 ? "critical" : "warning";
    push(
      mkId(), "operations",
      "Envíos retrasados",
      `${operations.delayedShipments} envío(s) sin actividad de transportadora por 5+ días.`,
      sev, "medium", 2,
      [`${operations.delayedShipments} envíos estancados`],
      "Contactar a las transportadoras y notificar proactivamente a los clientes afectados.",
    );
  }

  // P2 — High refund rate (> 10% of gross revenue)
  if (sales.orders > 5 && sales.totalRevenue > 0) {
    const refundRate = sales.refundsTotal / sales.totalRevenue;
    if (refundRate > 0.1) {
      const pct = Math.round(refundRate * 100);
      push(
        mkId(), "sales",
        "Tasa de reembolsos elevada",
        `Los reembolsos representan el ${pct}% de los ingresos brutos del período.`,
        "warning", "high", 2,
        [
          `Ingresos brutos: ${sales.totalRevenue} ${sales.currency}`,
          `Reembolsos: ${sales.refundsTotal} ${sales.currency}`,
          `Tasa: ${pct}%`,
        ],
        "Analizar los motivos más frecuentes de reembolso y revisar la política de devoluciones.",
      );
    }
  }

  // P2 — Revenue declining > 15%
  if (trends.revenue.direction === "down" && Math.abs(trends.revenue.pct) > 15) {
    push(
      mkId(), "sales",
      "Ventas en descenso significativo",
      `Los ingresos bajaron un ${Math.abs(trends.revenue.pct).toFixed(1)}% respecto al período anterior.`,
      "warning", "high", 2,
      [
        `Período actual: ${sales.totalRevenue} ${sales.currency}`,
        `Período anterior: ${trends.revenue.previous} ${sales.currency}`,
        `Variación: ${trends.revenue.pct.toFixed(1)}%`,
      ],
      "Evaluar activar una campaña de descuentos o revisar el catálogo para identificar frenos de conversión.",
    );
  }

  // P3 — AOV declining > 10%
  if (trends.aov.direction === "down" && Math.abs(trends.aov.pct) > 10) {
    push(
      mkId(), "sales",
      "Ticket promedio en descenso",
      `El valor promedio por pedido bajó un ${Math.abs(trends.aov.pct).toFixed(1)}%.`,
      "warning", "medium", 3,
      [
        `Ticket actual: ${sales.averageOrderValue} ${sales.currency}`,
        `Ticket anterior: ${trends.aov.previous} ${sales.currency}`,
      ],
      "Considerar estrategias de upselling, bundles o incrementar el pedido mínimo con un incentivo.",
    );
  }

  // P4 — No active promotions
  if (promotions.active === 0) {
    push(
      mkId(), "promotions",
      "Sin promociones activas",
      "La tienda no tiene campañas de descuento activas en este momento.",
      "info", "low", 4,
      [
        "Promociones activas: 0",
        `Programadas: ${promotions.scheduled}`,
      ],
      promotions.scheduled > 0
        ? `Hay ${promotions.scheduled} promoción(es) programada(s) próximamente.`
        : "Crear una campaña de descuento para impulsar las ventas.",
    );
  }

  // P4 — Catalog pending > 10
  if (catalog.pending > 10) {
    push(
      mkId(), "catalog",
      "Productos pendientes de publicación",
      `${catalog.pending} productos están en Agentik pero no se han publicado en Shopify.`,
      "info", "medium", 4,
      [
        `Total en catálogo: ${catalog.totalProducts}`,
        `Publicados: ${catalog.published}`,
        `Pendientes: ${catalog.pending}`,
      ],
      "Revisar el Catálogo y publicar los productos listos en Shopify.",
    );
  }

  // P5 — Products never sold > 5
  if (catalog.neverSold > 5) {
    push(
      mkId(), "catalog",
      "Productos sin ventas en el período",
      `${catalog.neverSold} productos publicados no tienen ventas registradas en el período actual.`,
      "info", "low", 5,
      [`${catalog.neverSold} productos sin ventas`],
      "Revisar visibilidad de estos productos o incluirlos en la próxima campaña de promociones.",
    );
  }

  return insights.sort((a, b) => a.priority - b.priority);
}

// ── Exported service functions ─────────────────────────────────────────────────

/**
 * Returns commercial performance metrics for the given period.
 * Fetches a date-filtered batch of orders from Shopify.
 *
 * Copilot: "statistics.getSalesMetrics()"
 */
export async function getSalesMetrics(
  _organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
  period:          StatisticsPeriod = "week",
): Promise<SalesMetrics> {
  const { current } = getPeriodRanges(period);
  const client      = createShopifyClient(shopDomain);
  const orders      = await client.listOrders(accessToken, {
    status:       "any",
    limit:        250,
    createdAtMin: current.from.toISOString(),
    createdAtMax: current.to.toISOString(),
  });
  return computeSalesFromOrders(orders, period, current);
}

/**
 * Returns catalog health and performance statistics.
 * Cross-references Agentik catalog state with Shopify order line item data.
 *
 * Copilot: "statistics.getCatalogMetrics()"
 */
export async function getCatalogMetrics(
  organizationId: string,
  accessToken:    string,   // ⚠ server-only
  shopDomain:     string,
  period:         StatisticsPeriod = "week",
): Promise<CatalogMetrics> {
  const { current } = getPeriodRanges(period);
  const client      = createShopifyClient(shopDomain);

  const [products, orders] = await Promise.all([
    listProductConsoleItems(organizationId),
    client.listOrders(accessToken, {
      status:       "any",
      limit:        250,
      createdAtMin: current.from.toISOString(),
      createdAtMax: current.to.toISOString(),
    }),
  ]);

  const currency = orders[0]?.currency ?? "COP";
  return computeCatalogMetrics(products, orders, currency);
}

/**
 * Returns promotion campaign statistics from the existing Promotions domain.
 * No logic duplication — delegates directly to shopify-promotions-service.
 *
 * Copilot: "statistics.getPromotionMetrics()"
 */
export async function getPromotionMetrics(
  organizationId: string,
  accessToken:    string,   // ⚠ server-only
  shopDomain:     string,
): Promise<PromotionMetrics> {
  const result   = await listPromotions(organizationId, accessToken, shopDomain);
  const currency = "COP";   // promotions domain does not expose store currency
  return computePromotionMetrics(result, currency);
}

/**
 * Returns operational health statistics from the existing Operations domain.
 * No logic duplication — derives OperationsMetrics from OperationListResult.
 *
 * Copilot: "statistics.getOperationsMetrics()"
 */
export async function getOperationsMetrics(
  organizationId: string,
  accessToken:    string,   // ⚠ server-only
  shopDomain:     string,
): Promise<OperationsMetrics> {
  const result = await listOperations(organizationId, accessToken, shopDomain);
  return computeOperationsMetrics(result);
}

/**
 * Returns period-over-period comparison of 6 core commercial KPIs.
 * Fetches a broad date window covering both current and previous periods.
 *
 * Copilot: "statistics.getTrendAnalysis()"
 */
export async function getTrendAnalysis(
  _organizationId: string,
  accessToken:     string,   // ⚠ server-only
  shopDomain:      string,
  period:          StatisticsPeriod = "week",
): Promise<TrendAnalysis> {
  const ranges  = getPeriodRanges(period);
  const client  = createShopifyClient(shopDomain);

  // Fetch the broader window covering both current + previous period
  const allOrders = await client.listOrders(accessToken, {
    status:       "any",
    limit:        250,
    createdAtMin: ranges.previous.from.toISOString(),
    createdAtMax: ranges.current.to.toISOString(),
  });

  const currentOrders  = filterOrdersByRange(allOrders, ranges.current);
  const previousOrders = filterOrdersByRange(allOrders, ranges.previous);

  const currentSales  = computeSalesFromOrders(currentOrders,  period,   ranges.current);
  const previousSales = computeSalesFromOrders(previousOrders, period,   ranges.previous);

  return buildTrendAnalysis(period, currentSales, previousSales);
}

/**
 * Returns deterministic executive insights derived from all metric domains.
 * NON-AI: Rules are fixed thresholds, not language model outputs.
 *
 * Copilot: "statistics.getExecutiveInsights()"
 */
export async function getExecutiveInsights(
  organizationId: string,
  accessToken:    string,   // ⚠ server-only
  shopDomain:     string,
  period:         StatisticsPeriod = "week",
): Promise<ExecutiveInsight[]> {
  const [sales, catalog, promotions, operations, trends] = await Promise.all([
    getSalesMetrics(organizationId, accessToken, shopDomain, period),
    getCatalogMetrics(organizationId, accessToken, shopDomain, period),
    getPromotionMetrics(organizationId, accessToken, shopDomain),
    getOperationsMetrics(organizationId, accessToken, shopDomain),
    getTrendAnalysis(organizationId, accessToken, shopDomain, period),
  ]);
  return generateExecutiveInsights(sales, catalog, promotions, operations, trends);
}

/**
 * Full executive statistics overview.
 * Fetches all domains in parallel and assembles the StatisticsOverview.
 *
 * Optimized: fetches orders ONCE for the broad date window and derives
 * both current and previous period metrics without duplicate API calls.
 *
 * Copilot: "statistics.getOverview()"
 */
export async function getOverview(
  organizationId: string,
  accessToken:    string,   // ⚠ server-only
  shopDomain:     string,
  period:         StatisticsPeriod = "week",
): Promise<StatisticsOverview> {
  const ranges = getPeriodRanges(period);
  const client = createShopifyClient(shopDomain);

  // Single broad order fetch covers both current + previous period windows
  const [allOrders, products, promotionResult, opResult] = await Promise.all([
    client.listOrders(accessToken, {
      status:       "any",
      limit:        250,
      createdAtMin: ranges.previous.from.toISOString(),
      createdAtMax: ranges.current.to.toISOString(),
    }),
    listProductConsoleItems(organizationId),
    listPromotions(organizationId, accessToken, shopDomain),
    listOperations(organizationId, accessToken, shopDomain),
  ]);

  const currentOrders  = filterOrdersByRange(allOrders, ranges.current);
  const previousOrders = filterOrdersByRange(allOrders, ranges.previous);

  const currency = currentOrders[0]?.currency ?? allOrders[0]?.currency ?? "COP";

  const sales        = computeSalesFromOrders(currentOrders, period, ranges.current);
  const prevSales    = computeSalesFromOrders(previousOrders, period, ranges.previous);
  const catalog      = computeCatalogMetrics(products, currentOrders, currency);
  const promo        = computePromotionMetrics(promotionResult, currency);
  const ops          = computeOperationsMetrics(opResult);
  const funnel       = buildFunnelMetrics(sales.orders);
  const trends       = buildTrendAnalysis(period, sales, prevSales);
  const insights     = generateExecutiveInsights(sales, catalog, promo, ops, trends);
  const healthSummary = buildHealthSummary(sales, prevSales, ops);

  return {
    sales,
    catalog,
    promotions:  promo,
    operations:  ops,
    funnel,
    trends,
    insights,
    healthSummary,
    generatedAt: new Date().toISOString(),
    source:      "shopify",
    period,
  };
}
