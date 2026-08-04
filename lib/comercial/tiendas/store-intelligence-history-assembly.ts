/**
 * lib/comercial/tiendas/store-intelligence-history-assembly.ts
 *
 * AGENTIK-STORES-INTELLIGENCE-HISTORY-BENCHMARK-01 — Pure assembly law.
 *
 * Client-safe: NO "server-only", NO Prisma, NO clock reads — asOfDate llega
 * SIEMPRE como parámetro (cero años hardcodeados; el fixture guardián corre
 * con años distintos de 2026 y todo sigue correcto).
 *
 * Tres leyes puras, alimentadas por la MISMA fuente certificada (SaleRecord
 * vía sales-canonical-source; la capa SQL vive en
 * store-intelligence-history-service.ts):
 *
 *   1. buildHistoricalSeries — serie anual dinámica desde la primera fecha
 *      disponible de la tienda hasta asOfDate. Distingue año completo,
 *      primer año parcial y año actual YTD. El YTD se compara ESTRICTAMENTE
 *      contra el mismo corte del año anterior (día exacto); el dominio
 *      entrega el período de comparación — React jamás decide denominadores.
 *
 *   2. buildNetworkBenchmark — filas reales stores[] sobre exactamente el
 *      mismo período, con posición, promedio, participación y deltas.
 *
 *   3. buildCertifiedFreshness — freshness derivada de los DATOS certificados
 *      (MAX(saleDate)), jamás de la fecha del servidor disfrazada.
 *
 * Viewport-agnostic por contrato: cero isMobile/breakpoints/viewport aquí.
 */

import type { StoreSalesMonth } from "./store-sales-assembly";
import { resolveCanonicalSalesSource } from "../sales-canonical-source";

// ═════════════════════════════════════════════════════════════════════════════
// Tipos del contrato (re-exportados por store-certified-intelligence-types)
// ═════════════════════════════════════════════════════════════════════════════

export type HistoricalYearKind = "FULL_YEAR" | "FIRST_PARTIAL" | "CURRENT_YTD";

export interface CertifiedHistoricalYear {
  year: number;                       // dinámico — jamás hardcodeado
  kind: HistoricalYearKind;
  /** Rango real cubierto por la fila (primer año parcial arranca en su primer mes con datos). */
  dateFrom: string;                   // ISO date
  dateTo: string;                     // ISO date
  netSales: number;
  invoiceCount: number;
  creditNoteCount: number;
  averageTicket: number;              // grossSales / invoiceCount (0 si no hay facturas)
  /**
   * Crecimiento vs la base comparable. Reglas:
   *   FULL_YEAR    → vs el año inmediatamente anterior SOLO si ese año es
   *                  FULL_YEAR consecutivo; si la base es parcial o hay hueco
   *                  de años, growthPct = null (sin base comparable honesta).
   *   CURRENT_YTD  → vs el MISMO corte del año anterior (same-cut), provisto
   *                  por la capa SQL; null si el año anterior no tiene datos.
   *   FIRST_PARTIAL→ siempre null.
   */
  growthPct: number | null;
  /** Denominador EXPLÍCITO de growthPct: "vs 2024" | "vs ene–23 jul 2025" | null. */
  comparisonLabel: string | null;
  /** Ventas de la base de comparación (verbatim), null si no hay base. */
  comparisonNetSales: number | null;
}

export interface CertifiedYtdComparison {
  currentFrom: string;                // "{año}-01-01"
  currentTo: string;                  // asOfDate
  previousFrom: string;               // "{año-1}-01-01"
  previousTo: string;                 // mismo corte del año anterior (29 feb → 28 feb)
  currentNetSales: number;
  previousNetSales: number;
  growthPct: number | null;
  /** "vs ene–23 jul 2025" — el denominador que la UI muestra, ya resuelto. */
  comparisonLabel: string;
}

export interface CertifiedHistoricalSeries {
  asOfDate: string;
  firstDataDate: string | null;       // primer mes con datos de la tienda (ISO, día 01)
  years: readonly CertifiedHistoricalYear[];   // ascendente
  ytd: CertifiedYtdComparison | null; // null si el año actual no tiene datos o no hay base
}

export interface NetworkBenchmarkStoreRow {
  storeId: string;
  storeName: string;
  netSales: number;
  invoiceCount: number;
  isCurrentStore: boolean;
  position: number;                   // 1..N por netSales DESC
  sharePct: number;                   // netSales / networkTotal * 100
}

export interface CertifiedNetworkBenchmark {
  periodFrom: string;
  periodTo: string;
  /** Todas las tiendas calculadas sobre EXACTAMENTE este período. */
  stores: readonly NetworkBenchmarkStoreRow[];   // orden: netSales DESC
  position: number;
  totalActiveStores: number;          // dinámico — cero número fijo de tiendas
  networkTotal: number;
  networkAverage: number;
  shareOfNetworkPct: number;
  deltaVsNetworkAveragePct: number | null;   // null si promedio = 0
  deltaVsLeaderPct: number | null;           // null si líder = 0 o la tienda ES el líder → 0
  leaderStoreId: string | null;
}

export type CertifiedDataStatus = "READY" | "PARTIAL_DATA" | "NOT_SYNCED" | "NO_DATA";

export interface CertifiedFreshness {
  asOfDate: string;
  /** Primera fecha de venta certificada de ESTA tienda (null = sin datos). */
  dataStartDate: string | null;
  /** MAX(saleDate) certificado de la red — marcador real de sincronización. */
  syncedThroughDate: string | null;
  /** asOfDate − syncedThroughDate en días (null si no hay sync). */
  dataLagDays: number | null;
  dataStatus: CertifiedDataStatus;
}

// ═════════════════════════════════════════════════════════════════════════════
// Helpers de fecha (puros, deterministas)
// ═════════════════════════════════════════════════════════════════════════════

const DAY_MS = 86_400_000;

function parseISODate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.floor((parseISODate(toISO).getTime() - parseISODate(fromISO).getTime()) / DAY_MS);
}

/**
 * Mismo corte del año anterior, a nivel de DÍA.
 * "2026-07-23" → "2025-07-23" · 29 feb (bisiesto) → 28 feb.
 */
export function sameCutPreviousYear(asOfDate: string): string {
  const year = Number(asOfDate.slice(0, 4));
  const mmdd = asOfDate.slice(5, 10);
  const prev = `${year - 1}-${mmdd === "02-29" ? "02-28" : mmdd}`;
  return prev;
}

const MONTH_SHORT: Record<string, string> = {
  "01": "ene", "02": "feb", "03": "mar", "04": "abr", "05": "may", "06": "jun",
  "07": "jul", "08": "ago", "09": "sep", "10": "oct", "11": "nov", "12": "dic",
};

/** "2025-07-23" → "23 jul 2025" */
export function formatCutLabel(iso: string): string {
  const dd = String(Number(iso.slice(8, 10)));
  return `${dd} ${MONTH_SHORT[iso.slice(5, 7)] ?? iso.slice(5, 7)} ${iso.slice(0, 4)}`;
}

function safeGrowthPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  const r = ((current - previous) / Math.abs(previous)) * 100;
  return Number.isFinite(r) ? Math.round(r * 100) / 100 : null;
}

function safeDivide(n: number, d: number): number {
  if (d === 0 || !Number.isFinite(n) || !Number.isFinite(d)) return 0;
  const r = n / d;
  return Number.isFinite(r) ? r : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ═════════════════════════════════════════════════════════════════════════════
// Ley 0 — suma neta certificada de filas crudas (para el same-cut SQL)
// ═════════════════════════════════════════════════════════════════════════════

export interface RawCodeAggRow {
  code: string;
  docCount: number;
  amount: number;
}

export interface NetSalesAgg {
  netSales: number;
  invoiceCount: number;
  creditNoteCount: number;
  hasData: boolean;
}

/**
 * Clasificación por familia documental canónica — la MISMA ley de
 * store-sales-assembly: FACTURA suma, NOTA_CREDITO resta (normalizada),
 * RECAUDO_POS jamás entra al revenue.
 */
export function sumNetByFamily(rows: readonly RawCodeAggRow[], storeId?: string): NetSalesAgg {
  let net = 0, invoices = 0, credits = 0, any = false;
  for (const row of rows) {
    const res = resolveCanonicalSalesSource(row.code);
    if (!res || !res.store) continue;
    if (storeId !== undefined && res.store.storeId !== storeId) continue;
    if (res.documentFamily === "FACTURA") {
      net += row.amount; invoices += row.docCount; any = true;
    } else if (res.documentFamily === "NOTA_CREDITO") {
      net += row.amount > 0 ? -row.amount : row.amount; credits += row.docCount; any = true;
    }
    // RECAUDO_POS / otros: jamás revenue (ley certificada)
  }
  return { netSales: net, invoiceCount: invoices, creditNoteCount: credits, hasData: any };
}

// ═════════════════════════════════════════════════════════════════════════════
// Ley 1 — Serie histórica anual
// ═════════════════════════════════════════════════════════════════════════════

export interface PrevYearSameCutInput {
  netSales: number;
  invoiceCount: number;
  hasData: boolean;
}

export function buildHistoricalSeries(
  monthlyAllYears: readonly StoreSalesMonth[],
  asOfDate: string,
  prevYearSameCut: PrevYearSameCutInput | null,
): CertifiedHistoricalSeries {
  const asOfYear = Number(asOfDate.slice(0, 4));

  // Meses con documentos de revenue, ascendente (la ley de dataMonths certificada)
  const dataMonths = monthlyAllYears
    .filter(m => m.invoices > 0 || m.credits > 0)
    .sort((a, b) => a.month.localeCompare(b.month));

  if (dataMonths.length === 0) {
    return { asOfDate, firstDataDate: null, years: [], ytd: null };
  }

  const firstDataMonth = dataMonths[0].month;                  // "YYYY-MM"
  const firstDataDate = `${firstDataMonth}-01`;
  const firstYear = Number(firstDataMonth.slice(0, 4));

  // Agrupar por año (solo años con datos — huecos quedan sin fila y sin base)
  const byYear = new Map<number, StoreSalesMonth[]>();
  for (const m of dataMonths) {
    const y = Number(m.month.slice(0, 4));
    const list = byYear.get(y) ?? [];
    list.push(m);
    byYear.set(y, list);
  }

  const yearsAsc = [...byYear.keys()].sort((a, b) => a - b);
  const rows: CertifiedHistoricalYear[] = [];

  for (const year of yearsAsc) {
    const months = byYear.get(year)!;
    const netSales = months.reduce((s, m) => s + m.revenue, 0);
    const gross = months.reduce((s, m) => s + m.grossRev, 0);
    const invoiceCount = months.reduce((s, m) => s + m.invoices, 0);
    const creditNoteCount = months.reduce((s, m) => s + m.credits, 0);
    const averageTicket = Math.round(safeDivide(gross, invoiceCount));

    const isCurrent = year === asOfYear;
    const startsAfterJanuary = year === firstYear && firstDataMonth.slice(5, 7) !== "01";
    const kind: HistoricalYearKind = isCurrent
      ? "CURRENT_YTD"
      : startsAfterJanuary ? "FIRST_PARTIAL" : "FULL_YEAR";

    const dateFrom = year === firstYear ? firstDataDate : `${year}-01-01`;
    const dateTo = isCurrent ? asOfDate : `${year}-12-31`;

    // Base de comparación
    let growthPct: number | null = null;
    let comparisonLabel: string | null = null;
    let comparisonNetSales: number | null = null;

    if (kind === "FULL_YEAR") {
      const prev = rows.length > 0 ? rows[rows.length - 1] : null;
      if (prev && prev.year === year - 1 && prev.kind === "FULL_YEAR") {
        growthPct = safeGrowthPct(netSales, prev.netSales);
        comparisonLabel = growthPct === null ? null : `vs ${prev.year}`;
        comparisonNetSales = growthPct === null ? null : prev.netSales;
      }
      // base parcial o hueco de años → sin base comparable honesta (null)
    } else if (kind === "CURRENT_YTD") {
      if (prevYearSameCut && prevYearSameCut.hasData) {
        const prevCutDate = sameCutPreviousYear(asOfDate);
        growthPct = safeGrowthPct(netSales, prevYearSameCut.netSales);
        comparisonLabel = growthPct === null ? null : `vs ene–${formatCutLabel(prevCutDate)}`;
        comparisonNetSales = growthPct === null ? null : prevYearSameCut.netSales;
      }
    }

    rows.push({
      year, kind, dateFrom, dateTo,
      netSales, invoiceCount, creditNoteCount, averageTicket,
      growthPct, comparisonLabel, comparisonNetSales,
    });
  }

  // Bloque YTD explícito (solo si el año actual tiene datos)
  const currentRow = rows.find(r => r.kind === "CURRENT_YTD") ?? null;
  let ytd: CertifiedYtdComparison | null = null;
  if (currentRow) {
    const prevCutDate = sameCutPreviousYear(asOfDate);
    const prevHasBase = prevYearSameCut !== null && prevYearSameCut.hasData;
    ytd = {
      currentFrom: `${asOfYear}-01-01`,
      currentTo: asOfDate,
      previousFrom: `${asOfYear - 1}-01-01`,
      previousTo: prevCutDate,
      currentNetSales: currentRow.netSales,
      previousNetSales: prevHasBase ? prevYearSameCut!.netSales : 0,
      growthPct: prevHasBase ? safeGrowthPct(currentRow.netSales, prevYearSameCut!.netSales) : null,
      comparisonLabel: `vs ene–${formatCutLabel(prevCutDate)}`,
    };
  }

  return { asOfDate, firstDataDate, years: rows, ytd };
}

// ═════════════════════════════════════════════════════════════════════════════
// Ley 2 — Benchmark de red con filas reales
// ═════════════════════════════════════════════════════════════════════════════

export interface BenchmarkStoreInput {
  storeId: string;
  storeName: string;
  netSales: number;
  invoiceCount: number;
}

export function buildNetworkBenchmark(
  currentStoreId: string,
  storeInputs: readonly BenchmarkStoreInput[],
  periodFrom: string,
  periodTo: string,
): CertifiedNetworkBenchmark {
  const sorted = [...storeInputs].sort(
    (a, b) => b.netSales - a.netSales || a.storeId.localeCompare(b.storeId),
  );
  const networkTotal = sorted.reduce((s, r) => s + r.netSales, 0);
  const totalActiveStores = sorted.length;
  const networkAverage = totalActiveStores > 0 ? Math.round(networkTotal / totalActiveStores) : 0;

  const stores: NetworkBenchmarkStoreRow[] = sorted.map((r, i) => ({
    storeId: r.storeId,
    storeName: r.storeName,
    netSales: r.netSales,
    invoiceCount: r.invoiceCount,
    isCurrentStore: r.storeId === currentStoreId,
    position: i + 1,
    sharePct: round2(safeDivide(r.netSales, networkTotal) * 100),
  }));

  const current = stores.find(s => s.isCurrentStore) ?? null;
  const leader = stores.length > 0 ? stores[0] : null;
  const position = current?.position ?? totalActiveStores;
  const storeNet = current?.netSales ?? 0;

  return {
    periodFrom,
    periodTo,
    stores,
    position,
    totalActiveStores,
    networkTotal,
    networkAverage,
    shareOfNetworkPct: current?.sharePct ?? 0,
    deltaVsNetworkAveragePct: networkAverage === 0 ? null : safeGrowthPct(storeNet, networkAverage),
    deltaVsLeaderPct: leader === null || leader.netSales === 0
      ? null
      : (leader.storeId === currentStoreId ? 0 : safeGrowthPct(storeNet, leader.netSales)),
    leaderStoreId: leader?.storeId ?? null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Ley 3 — Freshness certificada
// ═════════════════════════════════════════════════════════════════════════════

/** Umbral operativo de atraso para PARTIAL_DATA (días). */
export const DEFAULT_FRESHNESS_LAG_THRESHOLD_DAYS = 7;

export interface FreshnessInput {
  /** MIN(saleDate) de ESTA tienda en la fuente certificada (null = sin filas). */
  storeFirstSaleDate: string | null;
  /** MAX(saleDate) certificado de la RED (null = organización sin sync). */
  networkLastSaleDate: string | null;
  asOfDate: string;
  lagThresholdDays?: number;
}

export function buildCertifiedFreshness(input: FreshnessInput): CertifiedFreshness {
  const threshold = input.lagThresholdDays ?? DEFAULT_FRESHNESS_LAG_THRESHOLD_DAYS;
  const { storeFirstSaleDate, networkLastSaleDate, asOfDate } = input;

  if (networkLastSaleDate === null) {
    // Organización sin ventas certificadas sincronizadas: JAMÁS "$0 como verdad"
    return { asOfDate, dataStartDate: null, syncedThroughDate: null, dataLagDays: null, dataStatus: "NOT_SYNCED" };
  }

  const lag = Math.max(0, daysBetween(networkLastSaleDate.slice(0, 10), asOfDate));

  if (storeFirstSaleDate === null) {
    // Red sincronizada pero ESTA tienda sin datos
    return {
      asOfDate,
      dataStartDate: null,
      syncedThroughDate: networkLastSaleDate.slice(0, 10),
      dataLagDays: lag,
      dataStatus: "NO_DATA",
    };
  }

  return {
    asOfDate,
    dataStartDate: storeFirstSaleDate.slice(0, 10),
    syncedThroughDate: networkLastSaleDate.slice(0, 10),
    dataLagDays: lag,
    dataStatus: lag > threshold ? "PARTIAL_DATA" : "READY",
  };
}
