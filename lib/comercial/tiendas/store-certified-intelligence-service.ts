/**
 * lib/comercial/tiendas/store-certified-intelligence-service.ts
 *
 * AGENTIK-STORES-INTELLIGENCE-CERTIFIED-MVP-01
 *
 * Server-only service that assembles certified store intelligence
 * from existing data services (sales, discounts, benchmarks).
 *
 * Main entry: loadCertifiedStoreIntelligence(orgId, storeId)
 *
 * Data sources (all parallel):
 *   - loadStoreSales()       → revenue, monthly, KPIs
 *   - loadAllStoresSales()   → cross-store benchmark
 *   - loadStoreDiscounts()   → discount recommendations
 *
 * No direct Prisma usage. No SOAP. No external calls.
 */

import "server-only";

import { loadStoreSales, loadAllStoresSales } from "./store-sales-service";
import type { StoreSalesResponse, AllStoresSalesSummary, StoreSalesMonth } from "./store-sales-service";
import { loadStoreDiscounts } from "./store-discount-service";
import type { StoreDiscountResponse } from "./store-discount-types";

import type {
  CertifiedStoreIntelligenceResponse,
  CertifiedPeriod,
  CertifiedSalesKpis,
  CertifiedMonthlySales,
  SixMonthTrend,
  TrendDirection,
  StoreBenchmark,
  DiscountOpportunitySummary,
  DiscountOpportunityItem,
  ExecutiveInsight,
} from "./store-certified-intelligence-types";

import { MONTH_LABELS } from "./store-certified-intelligence-types";
import { loadIntelligenceHistoryBundle } from "./store-intelligence-history-service";

// AGENTIK-STORES-INTELLIGENCE-HISTORY-BENCHMARK-01:
// el año se deriva SIEMPRE de asOfDate — cero años hardcodeados en el contrato.
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: CertifiedStoreIntelligenceResponse; ts: number }>();

function getCached(key: string): CertifiedStoreIntelligenceResponse | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;
  return null;
}

function setCache(key: string, data: CertifiedStoreIntelligenceResponse): void {
  cache.set(key, { data, ts: Date.now() });
}

// ── Safe math helpers ────────────────────────────────────────────────────────

function safeDivide(numerator: number, denominator: number, fallback: number = 0): number {
  if (denominator === 0 || !isFinite(numerator) || !isFinite(denominator)) return fallback;
  const result = numerator / denominator;
  return isFinite(result) ? result : fallback;
}

function safeGrowthPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  const result = ((current - previous) / Math.abs(previous)) * 100;
  return isFinite(result) ? Math.round(result * 100) / 100 : null;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

// ── Build period ─────────────────────────────────────────────────────────────

function buildPeriod(sales: StoreSalesResponse | null, asOfDate: string): CertifiedPeriod {
  const asOfYear = Number(asOfDate.slice(0, 4));
  const dateTo = asOfDate;
  const isPartialYear = Number(asOfDate.slice(5, 7)) < 12;

  if (!sales || sales.monthly.length === 0) {
    return {
      year: asOfYear,
      dateFrom: `${asOfYear}-01-01`,
      dateTo,
      firstDataDate: null,
      lastDataDate: null,
      dataMonths: 0,
      isPartialYear,
    };
  }

  const sorted = [...sales.monthly].sort((a, b) => a.month.localeCompare(b.month));
  const firstMonth = sorted[0].month;
  const lastMonth = sorted[sorted.length - 1].month;

  return {
    year: asOfYear,
    dateFrom: `${asOfYear}-01-01`,
    dateTo,
    firstDataDate: `${firstMonth}-01`,
    lastDataDate: `${lastMonth}-01`,
    dataMonths: sales.kpis.dataMonths,
    isPartialYear,
  };
}

// ── Build sales KPIs ─────────────────────────────────────────────────────────

function buildSalesKpis(sales: StoreSalesResponse | null): CertifiedSalesKpis {
  if (!sales) {
    return {
      grossSales: 0,
      creditNotes: 0,
      netSales: 0,
      invoiceCount: 0,
      creditNoteCount: 0,
      documentCount: 0,
      averageTicket: 0,
      currentMonthSales: 0,
      previousMonthSales: 0,
      monthlyGrowthPct: null,
      yearProgressPct: 0,
    };
  }

  const { kpis, monthly } = sales;
  const grossSales = kpis.totalGrossRev;
  const creditNotes = kpis.totalCreditRev;
  const netSales = kpis.totalRevenue;
  const invoiceCount = kpis.invoiceCount;
  const creditNoteCount = kpis.creditNoteCount;
  const documentCount = invoiceCount + creditNoteCount;
  const averageTicket = Math.round(safeDivide(grossSales, invoiceCount));

  // Last two months with data for growth calculation
  const sorted = [...monthly].sort((a, b) => a.month.localeCompare(b.month));
  const currentMonthSales = sorted.length > 0 ? sorted[sorted.length - 1].revenue : 0;
  const previousMonthSales = sorted.length > 1 ? sorted[sorted.length - 2].revenue : 0;
  const monthlyGrowthPct = sorted.length > 1 ? safeGrowthPct(currentMonthSales, previousMonthSales) : null;

  const yearProgressPct = Math.round(safeDivide(kpis.dataMonths, 12) * 100 * 100) / 100;

  return {
    grossSales,
    creditNotes,
    netSales,
    invoiceCount,
    creditNoteCount,
    documentCount,
    averageTicket,
    currentMonthSales,
    previousMonthSales,
    monthlyGrowthPct,
    yearProgressPct,
  };
}

// ── Build monthly sales (fill missing months with zeros) ─────────────────────

function buildMonthlySales(sales: StoreSalesResponse | null, asOfDate: string): CertifiedMonthlySales[] {
  const asOfYear = Number(asOfDate.slice(0, 4));
  const currentMonth = Number(asOfDate.slice(5, 7));
  const salesMap = new Map<string, StoreSalesMonth>();

  if (sales) {
    for (const m of sales.monthly) {
      salesMap.set(m.month, m);
    }
  }

  const result: CertifiedMonthlySales[] = [];

  for (let i = 1; i <= currentMonth; i++) {
    const mm = pad2(i);
    const monthKey = `${asOfYear}-${mm}`;
    const monthLabel = MONTH_LABELS[mm] ?? mm;
    const data = salesMap.get(monthKey);

    const invoiceCount = data?.invoices ?? 0;
    const creditNoteCount = data?.credits ?? 0;
    const grossSales = data?.grossRev ?? 0;
    const creditNotesSales = data?.creditRev ?? 0;
    const netSales = data?.revenue ?? 0;
    const averageTicket = Math.round(safeDivide(grossSales, invoiceCount));

    // Growth vs previous month
    let monthOverMonthGrowthPct: number | null = null;
    if (result.length > 0) {
      const prev = result[result.length - 1];
      monthOverMonthGrowthPct = safeGrowthPct(netSales, prev.netSales);
    }

    result.push({
      month: monthKey,
      monthLabel,
      invoiceCount,
      creditNoteCount,
      grossSales,
      creditNotes: creditNotesSales,
      netSales,
      averageTicket,
      monthOverMonthGrowthPct,
    });
  }

  return result;
}

// ── Build 6-month trend ──────────────────────────────────────────────────────

function buildSixMonthTrend(monthlySales: CertifiedMonthlySales[]): SixMonthTrend {
  // Take last 6 months from the filled monthly array
  const window = monthlySales.slice(-6);
  const months = window.length;

  if (months < 2) {
    return {
      months,
      firstMonthSales: months > 0 ? window[0].netSales : 0,
      lastMonthSales: months > 0 ? window[months - 1].netSales : 0,
      accumulatedGrowthPct: null,
      averageMonthlySales: months > 0 ? Math.round(window[0].netSales) : 0,
      trend: "SIN_DATOS" as TrendDirection,
    };
  }

  const firstMonthSales = window[0].netSales;
  const lastMonthSales = window[months - 1].netSales;
  const accumulatedGrowthPct = safeGrowthPct(lastMonthSales, firstMonthSales);
  const totalSales = window.reduce((s, m) => s + m.netSales, 0);
  const averageMonthlySales = Math.round(safeDivide(totalSales, months));

  let trend: TrendDirection;
  if (accumulatedGrowthPct === null) {
    trend = "ESTABLE";
  } else if (accumulatedGrowthPct > 5) {
    trend = "CRECIENDO";
  } else if (accumulatedGrowthPct < -5) {
    trend = "DECRECIENDO";
  } else {
    trend = "ESTABLE";
  }

  return {
    months,
    firstMonthSales,
    lastMonthSales,
    accumulatedGrowthPct,
    averageMonthlySales,
    trend,
  };
}

// ── Build store benchmark ────────────────────────────────────────────────────

function buildStoreBenchmark(
  storeId: string,
  allStores: AllStoresSalesSummary,
): StoreBenchmark {
  const storeData = allStores.stores.find(s => s.storeId === storeId);
  const storeNetSales = storeData?.kpis.totalRevenue ?? 0;
  const allStoresNetSales = allStores.totals.totalRevenue;

  // Sort all stores by netSales DESC to determine position
  const sorted = [...allStores.stores].sort((a, b) => b.kpis.totalRevenue - a.kpis.totalRevenue);
  const positionIndex = sorted.findIndex(s => s.storeId === storeId);
  const positionByNetSales = positionIndex >= 0 ? positionIndex + 1 : allStores.stores.length;

  return {
    storeNetSales,
    allStoresNetSales,
    participationPct: Math.round(safeDivide(storeNetSales, allStoresNetSales) * 100 * 100) / 100,
    positionByNetSales,
    totalActiveStores: allStores.stores.length || 4,
  };
}

// ── Build discount opportunities summary ─────────────────────────────────────

function buildDiscountOpportunities(discounts: StoreDiscountResponse): DiscountOpportunitySummary {
  const recs = discounts.recommendations;

  // Only include recommendations that actually have a discount (exclude NONE)
  const withDiscount = recs.filter(r => r.discountTier !== "NONE");

  const totalReferences = withDiscount.length;
  const totalUnits = withDiscount.reduce((s, r) => s + r.storeQty, 0);

  const tier10 = discounts.kpis.tenPercent;
  const tier30 = discounts.kpis.thirtyPercent;
  const tier50 = discounts.kpis.fiftyPercent;
  const tier70 = discounts.kpis.seventyPercent;
  const withoutDate = discounts.kpis.sinFecha;

  // Top 8 items sorted by: 70% first, then 50%, 30%, 10%, SIN_FECHA, then by qty DESC, then daysInStore DESC
  const tierSortOrder: Record<string, number> = {
    SEVENTY_PERCENT: 0,
    FIFTY_PERCENT: 1,
    THIRTY_PERCENT: 2,
    TEN_PERCENT: 3,
    SIN_FECHA: 4,
    NONE: 5,
  };

  const sortedForTop = [...withDiscount].sort((a, b) => {
    const tierDiff = (tierSortOrder[a.discountTier] ?? 99) - (tierSortOrder[b.discountTier] ?? 99);
    if (tierDiff !== 0) return tierDiff;
    const qtyDiff = b.storeQty - a.storeQty;
    if (qtyDiff !== 0) return qtyDiff;
    return (b.daysInStore ?? -1) - (a.daysInStore ?? -1);
  });

  const topItems: DiscountOpportunityItem[] = sortedForTop.slice(0, 8).map(r => ({
    referenceCode: r.referenceCode,
    description: r.description,
    imageUrl: r.imageUrl,
    storeQty: r.storeQty,
    daysInStore: r.daysInStore,
    discountPercent: r.discountPercent,
    discountTier: r.discountTier,
    reason: r.reason,
  }));

  return {
    totalReferences,
    totalUnits,
    tier10,
    tier30,
    tier50,
    tier70,
    withoutDate,
    topItems,
  };
}

// ── Build executive insights ─────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return "$" + Math.round(amount).toLocaleString("es-CO");
}

function buildExecutiveInsights(
  storeName: string,
  salesKpis: CertifiedSalesKpis,
  benchmark: StoreBenchmark,
  discountSummary: DiscountOpportunitySummary,
  asOfYear: number,
): ExecutiveInsight[] {
  const insights: ExecutiveInsight[] = [];

  // 1. Revenue insight (always)
  insights.push({
    severity: "INFO",
    title: "Ventas netas acumuladas",
    description: `${storeName} registra ventas netas por ${formatCurrency(salesKpis.netSales)} durante ${asOfYear}.`,
    evidence: `Facturacion bruta: ${formatCurrency(salesKpis.grossSales)}, notas credito: ${formatCurrency(salesKpis.creditNotes)}, ${salesKpis.documentCount} documentos.`,
  });

  // 2. Position (always)
  insights.push({
    severity: benchmark.positionByNetSales <= 2 ? "INFO" : "WARNING",
    title: "Posicion en red de tiendas",
    description: `La tienda ocupa el puesto ${benchmark.positionByNetSales} de ${benchmark.totalActiveStores} por ventas retail certificadas.`,
    evidence: `Participacion: ${benchmark.participationPct}% del total de la red.`,
  });

  // 3. Growth (only if 2+ months)
  if (salesKpis.monthlyGrowthPct !== null) {
    const direction = salesKpis.monthlyGrowthPct >= 0 ? "crecio" : "decrecio";
    const severity: ExecutiveInsight["severity"] = salesKpis.monthlyGrowthPct < -10 ? "CRITICAL" : salesKpis.monthlyGrowthPct < 0 ? "WARNING" : "INFO";
    insights.push({
      severity,
      title: "Crecimiento mensual",
      description: `El ultimo mes ${direction} ${Math.abs(salesKpis.monthlyGrowthPct).toFixed(1)}% frente al mes anterior.`,
      evidence: `Mes actual: ${formatCurrency(salesKpis.currentMonthSales)}, mes anterior: ${formatCurrency(salesKpis.previousMonthSales)}.`,
    });
  }

  // 4. Credit notes (only if creditNoteCount > 0)
  if (salesKpis.creditNoteCount > 0 && salesKpis.grossSales > 0) {
    const creditPct = Math.abs(safeDivide(salesKpis.creditNotes, salesKpis.grossSales) * 100);
    const severity: ExecutiveInsight["severity"] = creditPct > 10 ? "WARNING" : "INFO";
    insights.push({
      severity,
      title: "Notas credito",
      description: `Las notas credito representan ${creditPct.toFixed(1)}% de la facturacion bruta.`,
      evidence: `${salesKpis.creditNoteCount} notas credito por ${formatCurrency(Math.abs(salesKpis.creditNotes))}.`,
    });
  }

  // 5. Discounts (only if tier70 > 0)
  if (discountSummary.tier70 > 0) {
    insights.push({
      severity: "CRITICAL",
      title: "Descuentos criticos",
      description: `Existen ${discountSummary.tier70} referencias con recomendacion de descuento del 70%.`,
      evidence: `Total referencias con descuento: ${discountSummary.totalReferences}, unidades: ${discountSummary.totalUnits}.`,
    });
  }

  return insights;
}

// ── Main entry point ─────────────────────────────────────────────────────────

const EMPTY_DISCOUNTS: StoreDiscountResponse = {
  storeId: "", storeName: "", recommendations: [],
  kpis: {
    totalEvaluated: 0, none: 0, tenPercent: 0, thirtyPercent: 0,
    fiftyPercent: 0, seventyPercent: 0, sinFecha: 0,
    excludedSpecialCollection: 0, buckets: [],
  },
  computedAt: "",
};

export async function loadCertifiedStoreIntelligence(
  orgId: string,
  storeId: string,
): Promise<CertifiedStoreIntelligenceResponse> {
  const asOfDate = todayISO();
  const asOfYear = Number(asOfDate.slice(0, 4));
  const cacheKey = `certifiedIntel:${orgId}:${storeId}:${asOfDate}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // Parallel data loading.
  // HISTORY-BENCHMARK-01: discounts es DEPRECADO en este contrato y su carga
  // es no-fatal — un fallo de Descuentos jamás tumba la Inteligencia.
  const [storeSales, allStores, discounts, historyBundle] = await Promise.all([
    loadStoreSales(orgId, storeId),
    loadAllStoresSales(orgId),
    loadStoreDiscounts(orgId, storeId).catch((): StoreDiscountResponse => ({ ...EMPTY_DISCOUNTS, storeId, storeName: storeId })),
    loadIntelligenceHistoryBundle(orgId, storeId, asOfDate),
  ]);

  const storeName = storeSales?.storeName ?? discounts.storeName ?? storeId;

  // Build each section
  const period = buildPeriod(storeSales, asOfDate);
  const salesKpis = buildSalesKpis(storeSales);
  const monthlySales = buildMonthlySales(storeSales, asOfDate);
  const sixMonthTrend = buildSixMonthTrend(monthlySales);
  const storeBenchmark = buildStoreBenchmark(storeId, allStores);
  const discountOpportunities = buildDiscountOpportunities(discounts);
  const executiveInsights = buildExecutiveInsights(storeName, salesKpis, storeBenchmark, discountOpportunities, asOfYear);

  const result: CertifiedStoreIntelligenceResponse = {
    store: {
      storeId,
      storeName,
    },
    asOfDate,
    period,
    salesKpis,
    monthlySales,
    sixMonthTrend,
    storeBenchmark,
    networkBenchmark: historyBundle.networkBenchmark,
    historicalSeries: historyBundle.historicalSeries,
    freshness: historyBundle.freshness,
    discountOpportunities,
    executiveInsights,
    salesSourceStatus: "CERTIFIED",
    salesSourceNote: "Datos certificados desde SaleRecord (SAG FACTURAS k_n_clase_fuente=1). Fuente unica de verdad para ventas retail.",
    snapshotAt: new Date().toISOString(),
  };

  setCache(cacheKey, result);
  return result;
}
