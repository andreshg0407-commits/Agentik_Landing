/**
 * lib/comercial/tiendas/store-intelligence-presentation-assembler.ts
 *
 * AGENTIK-STORES-INTELLIGENCE-UX-IMPLEMENTATION-01 — PresentationAssembler.
 *
 * Transformación ÚNICA:
 *   CertifiedStoreIntelligenceResponse + StoreProductIntelligence
 *     → StoreIntelligencePresentation
 *
 * PURO y client-safe: sin Prisma, sin reloj, sin React, sin queries, sin
 * viewport (los breakpoints viven en el render; aquí solo hints de
 * presentación). React NO formatea negocio: todo COP, %, fechas, labels,
 * copy de estados y lectura ejecutiva salen de aquí.
 *
 * Lectura de Agentik: DETERMINÍSTICA desde señales estructuradas — cero IA.
 *
 * Certificación: __tests__/store-intelligence-presentation-assembler.test.ts
 */

import type {
  CertifiedStoreIntelligenceResponse,
  CertifiedMonthlySales,
  TrendDirection,
} from "./store-certified-intelligence-types";
import { rankProducts } from "./store-product-intelligence-types";
import type {
  StoreProductIntelligence,
  TopProductEntry,
  MomentumEntry,
  NoSalesEntry,
  ProductMomentumStatus,
  SalesRateEntry,
  CategoryPerformanceEntry,
} from "./store-product-intelligence-types";

// ═════════════════════════════════════════════════════════════════════════════
// Tokens de tono (semántica — el render los mapea a colores del sistema)
// ═════════════════════════════════════════════════════════════════════════════

export type IntelTone = "positive" | "warning" | "critical" | "neutral";

// ── Diccionarios 1:1 (jamás derivados de números en React) ───────────────────

const TREND_PRESENTATION: Record<TrendDirection, { key: string; label: string; tone: IntelTone; arrow: string }> = {
  CRECIENDO:   { key: "IMPROVING", label: "Mejorando", tone: "positive", arrow: "▲" },
  ESTABLE:     { key: "STABLE",    label: "Estable",   tone: "neutral",  arrow: "→" },
  DECRECIENDO: { key: "DECLINING", label: "Cayendo",   tone: "warning",  arrow: "▼" },
  SIN_DATOS:   { key: "NO_DATA",   label: "Sin datos", tone: "neutral",  arrow: "—" },
};

/** Momentum humano (§18) — mapa 1:1, jamás los nombres técnicos. */
export const MOMENTUM_LABEL: Record<ProductMomentumStatus, string> = {
  ACCELERATING: "Acelerando",
  DECELERATING: "Perdiendo ritmo",
  STABLE:       "Estables",
  NEW_ACTIVITY: "Nuevos en movimiento",
  NO_ACTIVITY:  "Sin actividad reciente",
};

const MOMENTUM_TONE: Record<ProductMomentumStatus, IntelTone> = {
  ACCELERATING: "positive",
  DECELERATING: "warning",     // jamás "critical": una caída comercial no es una anomalía (§19/§36)
  STABLE:       "neutral",
  NEW_ACTIVITY: "positive",
  NO_ACTIVITY:  "neutral",
};

const MOMENTUM_ARROW: Record<ProductMomentumStatus, string> = {
  ACCELERATING: "↑", DECELERATING: "↓", STABLE: "→", NEW_ACTIVITY: "✦", NO_ACTIVITY: "·",
};

// ═════════════════════════════════════════════════════════════════════════════
// Universo comercial (PRODUCT-DIRECTION-01 §2) — diccionario 1:1 sobre el
// set CANÓNICO CONFIRMADO de líneas SAG (CASTILLITOS_LINEAS, master data
// confirmado 2026-04-08: CASTILLITOS · LATIN KIDS · IMPORTACION · POWER · OTROS).
// CERO heurísticas: sin regex, sin nombres de producto, sin listas de
// referencias. POWER/OTROS/null quedan fuera de ambos mundos (solo "Todos").
// ═════════════════════════════════════════════════════════════════════════════

export type IntelUniverseKey = "ALL" | "TEXTILE" | "IMPORT";
export type IntelRowUniverse = "TEXTILE" | "IMPORT" | "OTHER";

const LINEA_TO_UNIVERSE: Record<string, "TEXTILE" | "IMPORT"> = {
  "CASTILLITOS": "TEXTILE",
  "LATIN KIDS": "TEXTILE",
  "IMPORTACION": "IMPORT",
};

function universeOf(lineaSag: string | null): IntelRowUniverse {
  if (!lineaSag) return "OTHER";
  return LINEA_TO_UNIVERSE[lineaSag.trim().toUpperCase()] ?? "OTHER";
}

const UNIVERSE_LABEL: Record<IntelUniverseKey, string> = {
  ALL: "Todos", TEXTILE: "Textil", IMPORT: "Importación",
};

const WORLD_TAG: Record<IntelRowUniverse, string | null> = {
  TEXTILE: "Textil", IMPORT: "Importación", OTHER: null,
};

const UNIVERSE_KEYS: readonly IntelUniverseKey[] = ["ALL", "TEXTILE", "IMPORT"];

function inUniverse(rowUniverse: IntelRowUniverse, key: IntelUniverseKey): boolean {
  return key === "ALL" || rowUniverse === key;
}

const MONTH_SHORT: Record<string, string> = {
  "01": "ene", "02": "feb", "03": "mar", "04": "abr", "05": "may", "06": "jun",
  "07": "jul", "08": "ago", "09": "sep", "10": "oct", "11": "nov", "12": "dic",
};

const MONTH_FULL: Record<string, string> = {
  "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril", "05": "Mayo", "06": "Junio",
  "07": "Julio", "08": "Agosto", "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre",
};

// ═════════════════════════════════════════════════════════════════════════════
// Formateo (la única "aritmética" del PA: presentación de campos certificados)
// ═════════════════════════════════════════════════════════════════════════════

/** COP compacto: $128,4 M · $980 k · $850 (es-CO). */
export function fmtCop(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    const text = m >= 1_000
      ? Math.round(m).toLocaleString("es-CO")
      : m.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
    return `${sign}$${text} M`;
  }
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000).toLocaleString("es-CO")} k`;
  return `${sign}$${Math.round(abs).toLocaleString("es-CO")}`;
}

export function fmtCopFull(n: number): string {
  return `${n < 0 ? "−" : ""}$${Math.round(Math.abs(n)).toLocaleString("es-CO")}`;
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("es-CO");
}

/** Delta con signo SIEMPRE visible (el signo acompaña al color — jamás solo color). */
function fmtPct(p: number | null): string {
  if (p === null) return "—";
  const rounded = Math.round(p * 10) / 10;
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;
}

function pctTone(p: number | null): IntelTone {
  if (p === null) return "neutral";
  return p > 0 ? "positive" : p < 0 ? "warning" : "neutral";
}

/** "2026-07-06" → "6 jul" · con año: "6 jul 2026". */
function fmtDay(iso: string | null, withYear = false): string {
  if (!iso) return "—";
  const dd = String(Number(iso.slice(8, 10)));
  const base = `${dd} ${MONTH_SHORT[iso.slice(5, 7)] ?? ""}`;
  return withYear ? `${base} ${iso.slice(0, 4)}` : base;
}

// ═════════════════════════════════════════════════════════════════════════════
// DTO — StoreIntelligencePresentation
// ═════════════════════════════════════════════════════════════════════════════

export interface IntelTrendPoint {
  periodKey: string;            // "2026-06"
  label: string;                // "Jun"
  value: number;                // netSales verbatim (para el chart)
  formattedValue: string;       // "$21,4 M"
  invoicesText: string;         // "208 facturas"
  ticketText: string;           // "$103 k"
  deltaPctText: string;         // "+12,3 %" | "—"
  deltaTone: IntelTone;
}

export interface IntelProductRow {
  rank: number;
  /** Mundo comercial de la fila (diccionario canónico de lineaSag). */
  universeKey: IntelRowUniverse;
  referenceCode: string;
  productName: string;
  imageUrl: string | null;
  primaryText: string;          // según modo: "36 uds" | "$4,1 M" | "≈3 uds/sem"
  secondaryText: string;        // la otra métrica
  shareText: string | null;     // "3,2 %" (solo modos units/revenue)
  detail: {
    recentUnitsText: string;    // "11 uds últimos 30 días"
    lastSaleText: string;       // "Última venta: 21 jul" | "Sin ventas registradas"
    rateText: string;           // "≈3 uds/sem (últimos 30 días)"
    momentumLabel: string;
    momentumTone: IntelTone;
    momentumArrow: string;
  };
}

export interface IntelMomentumRow {
  referenceCode: string;
  universeKey: IntelRowUniverse;
  productName: string;
  changeText: string;           // "6 → 14 uds (30d)"
  arrow: string;
  tone: IntelTone;
}

export interface IntelNoSalesRow {
  referenceCode: string;
  universeKey: IntelRowUniverse;
  productName: string;
  unitsText: string;            // "18 uds"
  lastSaleText: string;         // "última venta hace 94 d" | "Sin ventas en el histórico disponible*"
  neverSoldInHistory: boolean;
  currentStock: number;         // para sort en la vista completa (dato, no cálculo)
  daysSinceLastSale: number | null;
}

export interface StoreIntelligencePresentation {
  header: {
    title: string;
    storeName: string;
    freshnessText: string;              // "Datos al 6 jul"
    lagWarningText: string | null;      // "29 días de atraso" (solo si aplica)
    trendKey: string;
    trendLabel: string;
    trendTone: IntelTone;
    trendArrow: string;
    periodOptions: readonly { key: string; label: string }[];   // ventanas del DOMINIO
  };
  dataState: {
    status: "READY" | "PARTIAL_DATA" | "NOT_SYNCED" | "NO_DATA";
    stateTitle: string | null;          // NOT_SYNCED/NO_DATA: título del estado (sin $0)
    stateText: string | null;
    partialBannerText: string | null;   // PARTIAL_DATA: banner sin bloquear
  };
  hero: {
    periodLabel: string;                // "Enero–Agosto 2026" (dinámico)
    salesText: string;
    deltaText: string;                  // "+8,4 %"
    deltaContextText: string;           // "vs mes anterior" — denominador SIEMPRE
    deltaTone: IntelTone;
    invoicesText: string;
    ticketText: string;
    networkPositionText: string;        // "#3 de 4 en la red"
    sparkline: readonly { periodKey: string; value: number }[];
  };
  reading: {
    sentences: readonly string[];       // 2–4, deterministas
    signals: readonly { type: string; priority: number }[];   // trazabilidad
  };
  salesTrend: {
    ranges: readonly { key: "6M" | "12M" | "ALL"; label: string }[];
    points: readonly IntelTrendPoint[]; // serie completa; React corta por rango
  };
  historicalGrowth: {
    rows: readonly {
      yearLabel: string;                // "2023*" | "2026 YTD"
      kindKey: string;
      kindNote: string | null;          // "año parcial (desde mar 2023)" | null
      salesText: string;
      growthText: string;               // "+23,4 %" | "—"
      growthTone: IntelTone;
      comparisonLabel: string | null;   // "vs 2024" | "vs ene–4 ago 2025" — del DOMINIO (UX11)
      barPct: number;                   // 0–100 magnitud relativa
      invoicesText: string;
      ticketText: string;
    }[];
    firstDataNote: string | null;       // "Histórico desde mar 2023"
  };
  networkBenchmark: {
    title: string;                      // "Desempeño frente a otras tiendas"
    periodLabel: string;
    stores: readonly { storeName: string; salesText: string; barPct: number; isCurrent: boolean }[];
    summaryText: string;
  };
  /** Selector de universo comercial (PRODUCT-DIRECTION-01 §2–3). */
  universeSelector: null | {
    options: readonly { key: IntelUniverseKey; label: string }[];
    appliesToText: string;               // qué secciones afecta
  };
  /** null = product intelligence no disponible (degradación parcial — §7 hotfix gate) */
  topProducts: null | {
    title: string;
    modes: readonly { key: "UNITS" | "REVENUE" | "RATE"; label: string }[];
    /** §8: contexto visible del modo Ritmo — la ventana JAMÁS se esconde. */
    rateContextText: string;            // "Ritmo de venta reciente · últimos 30 días"
    visibleCount: { mobile: number; desktop: number };
    /** UNIDADES/VENTAS: ranking REAL por universo (UNIVERSE-RANKING-01) —
     *  aggregatedProducts completo del engine + rankProducts canónico,
     *  rank 1..N propio por mundo. React solo SELECCIONA por key. */
    byUnits: Readonly<Record<IntelUniverseKey, readonly IntelProductRow[]>>;
    byRevenue: Readonly<Record<IntelUniverseKey, readonly IntelProductRow[]>>;
    /** RITMO: listas COMPLETAS por universo (salesRates viene entero del engine). */
    byRate: Readonly<Record<IntelUniverseKey, readonly IntelProductRow[]>>;
    emptyText: string;
  };
  momentum: null | {
    title: string;
    windowText: string;                 // "30d vs 30d previos"
    /** Por universo: resumen ejecutivo + distribución + listas ACC/DEC (top 5). */
    byUniverse: Readonly<Record<IntelUniverseKey, {
      summaryText: string;              // "18 acelerando · 146 perdiendo ritmo"
      distribution: readonly { key: string; label: string; countText: string; arrow: string; tone: IntelTone; emphasized: boolean }[];
      accelerating: readonly IntelMomentumRow[];
      decelerating: readonly IntelMomentumRow[];
    }>>;
    visibleCount: { mobile: number; desktop: number };
  };
  noSales: null | {
    title: string;                      // "Con inventario y sin ventas recientes"
    windowText: string;                 // "últimos 30 días"
    available: boolean;
    unavailableText: string | null;     // INVENTORY_UNAVAILABLE — jamás "0"
    /** Resumen por universo (las filas viajan una vez, etiquetadas). */
    universeSummaries: Readonly<Record<IntelUniverseKey, {
      summaryText: string | null;
      totalCount: number;
      viewAllText: string;
    }>>;
    topRows: readonly IntelNoSalesRow[];
    allRows: readonly IntelNoSalesRow[];
    historyCaveatText: string | null;   // "* histórico disponible desde mar 2023"
    visibleCount: { mobile: number; desktop: number };
    emptyText: string;                  // READY + cero: empty legítimo
  };
  categoryPerformance: null | {
    title: string;                      // "Qué líneas mueven la tienda"
    stacked: readonly { name: string; sharePct: number; shareText: string }[];
    rows: readonly {
      name: string;
      worldTag: string | null;          // "Textil" | "Importación" (diccionario canónico)
      revenueText: string;
      shareText: string;
      growthText: string;
      growthContextText: string;        // "vs 30 días previos"
      growthTone: IntelTone;
      groups: readonly { name: string; revenueText: string; growthText: string; growthTone: IntelTone }[];
    }[];
    unclassifiedNote: string | null;
    emptyText: string;
  };
  accountingDetail: {
    title: string;
    grossText: string;
    creditNotesText: string;
    documentsText: string;
  };
  /** §8 — capability futura, JAMÁS visible como inteligencia real hoy. */
  crossStore: {
    capability: "PRODUCT_CROSS_STORE";
    available: false;
    dependencyNote: string;             // AGENTIK-STORES-PRODUCT-SALES-CROSS-STORE-BACKFILL-01
  };
  /** §9 — contrato futuro de rentabilidad; hoy siempre UNAVAILABLE. */
  profitability: {
    capability: "PRODUCT_PROFITABILITY";
    status: "UNAVAILABLE";
    dependencyNote: string;             // fuente certificada de costo (Producción/Compras)
    futureFields: readonly string[];    // netRevenue/costAmount/grossMarginAmount/grossMarginPct/profitabilityStatus
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Lectura de Agentik — señales estructuradas → frases deterministas
// ═════════════════════════════════════════════════════════════════════════════

interface Signal { type: string; priority: number; sentence: string }

function buildReading(
  ci: CertifiedStoreIntelligenceResponse,
  pi: StoreProductIntelligence | null,
): { sentences: string[]; signals: { type: string; priority: number }[] } {
  const signals: Signal[] = [];
  const growth = ci.salesKpis.monthlyGrowthPct;
  const bm = ci.networkBenchmark;

  // Señal 1 — dirección de ventas CONECTADA con posición en red (jamás cifra suelta)
  if (growth !== null) {
    const dir = growth >= 0 ? "mejora" : "cae";
    const net = bm.deltaVsNetworkAveragePct;
    const netPart = net === null
      ? ""
      : net >= 0
        ? ` y se mantiene ${fmtPct(net)} por encima del promedio de la red`
        : ` y sigue ${fmtPct(Math.abs(net)).replace("+", "")} por debajo del promedio de la red`;
    signals.push({
      type: growth >= 0 ? "STORE_SALES_UP" : "STORE_SALES_DOWN",
      priority: Math.abs(growth),
      sentence: `La tienda ${dir} ${fmtPct(Math.abs(growth)).replace("+", "")} frente al mes anterior${netPart}.`,
    });
  }

  // Señal 2 — línea dominante CONECTADA con su crecimiento
  const lines = pi ? pi.categoryPerformance.filter(c => c.level === "line") : [];
  const dominant = [...lines].sort((a, b) => b.sharePct - a.sharePct)[0];
  if (dominant && dominant.growthPct !== null) {
    const dir = dominant.growthPct >= 0 ? "crece" : "cae";
    signals.push({
      type: dominant.growthPct >= 0 ? "LINE_GROWING" : "LINE_DECLINING",
      priority: Math.abs(dominant.growthPct) * (dominant.sharePct / 100),
      sentence: `${dominant.name} concentra el ${fmtPct(dominant.sharePct).replace("+", "")} de las ventas y ${dir} ${fmtPct(Math.abs(dominant.growthPct)).replace("+", "")} frente a los 30 días previos.`,
    });
  }

  // Conclusión 3 — RIESGO (§11): pierde-ritmo + inventario sin ventas, en UNA
  // frase conectada. Si no hay datos suficientes, se omite (jamás rellenar).
  const dec = pi ? pi.momentum.filter(m => m.status === "DECELERATING").length : 0;
  const noSalesRows = pi && pi.noSales.inventoryAvailability === "READY"
    ? pi.noSales.rows.filter(r => r.classification === "CURRENT_STOCK_NO_RECENT_SALES")
    : [];
  const refWord = (n: number) => (n === 1 ? "referencia" : "referencias");
  if (dec > 0 && noSalesRows.length > 0) {
    signals.push({
      type: "RISK_DECELERATING_AND_STOCK_NO_SALES",
      priority: 1,
      sentence: `${fmtInt(dec)} ${refWord(dec)} ${dec === 1 ? "está" : "están"} perdiendo ritmo y ${fmtInt(noSalesRows.length)} ${noSalesRows.length === 1 ? "mantiene" : "mantienen"} inventario sin ventas recientes.`,
    });
  } else if (dec > 0) {
    signals.push({
      type: "PRODUCTS_DECELERATING",
      priority: 1,
      sentence: `${fmtInt(dec)} ${refWord(dec)} ${dec === 1 ? "está" : "están"} perdiendo ritmo frente al período previo.`,
    });
  } else if (noSalesRows.length > 0) {
    signals.push({
      type: "STOCK_NO_RECENT_SALES",
      priority: 1,
      sentence: `${fmtInt(noSalesRows.length)} ${refWord(noSalesRows.length)} ${noSalesRows.length === 1 ? "mantiene" : "mantienen"} inventario sin ventas recientes.`,
    });
  }

  // Exactamente hasta 3 conclusiones en orden fijo: estado → motor → riesgo.
  const top = signals.slice(0, 3);
  return {
    sentences: top.map(s => s.sentence),
    signals: top.map(s => ({ type: s.type, priority: Math.round(s.priority * 100) / 100 })),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Builders de sección
// ═════════════════════════════════════════════════════════════════════════════

function buildTrendPoints(monthly: readonly CertifiedMonthlySales[]): IntelTrendPoint[] {
  return monthly.map(m => ({
    periodKey: m.month,
    label: (m.monthLabel || m.month.slice(5, 7)),
    value: m.netSales,
    formattedValue: fmtCop(m.netSales),
    invoicesText: `${fmtInt(m.invoiceCount)} facturas`,
    ticketText: fmtCop(m.averageTicket),
    deltaPctText: fmtPct(m.monthOverMonthGrowthPct),
    deltaTone: pctTone(m.monthOverMonthGrowthPct),
  }));
}

function productRow(
  entry: TopProductEntry,
  mode: "UNITS" | "REVENUE",
  rateByRef: Map<string, SalesRateEntry>,
  momentumByRef: Map<string, MomentumEntry>,
): IntelProductRow {
  const rate = rateByRef.get(entry.referenceCode) ?? null;
  const mom = momentumByRef.get(entry.referenceCode) ?? null;
  const momStatus: ProductMomentumStatus = mom?.status ?? "NO_ACTIVITY";
  return {
    rank: entry.rank,
    universeKey: universeOf(entry.lineaSag),
    referenceCode: entry.referenceCode,
    productName: entry.productName,
    imageUrl: entry.heroImageUrl,
    primaryText: mode === "UNITS" ? `${fmtInt(entry.netUnits)} uds` : fmtCop(entry.netRevenue),
    secondaryText: mode === "UNITS" ? fmtCop(entry.netRevenue) : `${fmtInt(entry.netUnits)} uds`,
    shareText: `${(Math.round(entry.shareOfStoreRevenuePct * 10) / 10).toLocaleString("es-CO")} %`,
    detail: {
      recentUnitsText: rate ? `${fmtInt(rate.netUnits30d)} uds últimos 30 días` : "Sin actividad en 30 días",
      lastSaleText: entry.lastSaleDate ? `Última venta: ${fmtDay(entry.lastSaleDate)}` : "Sin ventas registradas",
      rateText: rate ? rateText(rate) : "—",
      momentumLabel: MOMENTUM_LABEL[momStatus],
      momentumTone: MOMENTUM_TONE[momStatus],
      momentumArrow: MOMENTUM_ARROW[momStatus],
    },
  };
}

/** Ritmo de venta (§17): uds/semana, derivado en el PA — jamás en React. */
function rateText(rate: SalesRateEntry): string {
  const perWeek = rate.salesRate30d * 7;
  const shown = perWeek >= 1
    ? `≈${perWeek.toLocaleString("es-CO", { maximumFractionDigits: 1 })} uds/sem`
    : `<1 ud/sem`;
  return `${shown} (últimos 30 días)`;
}

function momentumRow(m: MomentumEntry): IntelMomentumRow {
  return {
    referenceCode: m.referenceCode,
    universeKey: universeOf(m.lineaSag),
    productName: m.productName,
    changeText: `${fmtInt(m.previousNetUnits)} → ${fmtInt(m.recentNetUnits)} uds (${m.windowDays}d)`,
    arrow: MOMENTUM_ARROW[m.status],
    tone: MOMENTUM_TONE[m.status],
  };
}

function noSalesRow(r: NoSalesEntry): IntelNoSalesRow {
  const never = r.lastSaleDate === null;
  return {
    referenceCode: r.referenceCode,
    universeKey: universeOf(r.lineaSag),
    productName: r.productName,
    unitsText: `${fmtInt(r.currentStock)} uds`,
    lastSaleText: never
      ? "Sin ventas en el histórico disponible*"
      : r.daysSinceLastSale !== null
        ? `última venta hace ${fmtInt(r.daysSinceLastSale)} d · ${fmtDay(r.lastSaleDate)}`
        : `última venta ${fmtDay(r.lastSaleDate)}`,
    neverSoldInHistory: never,
    currentStock: r.currentStock,
    daysSinceLastSale: r.daysSinceLastSale,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Builder principal
// ═════════════════════════════════════════════════════════════════════════════

/**
 * pi = null → degradación parcial certificada: hero/lectura/evolución/
 * benchmark/histórico/contable renderizan; las secciones de producto
 * (topProducts/momentum/noSales/categoryPerformance) viajan null y el
 * render muestra estado local con reintento (§7 hotfix gate).
 */
export function buildStoreIntelligencePresentation(
  ci: CertifiedStoreIntelligenceResponse,
  pi: StoreProductIntelligence | null,
): StoreIntelligencePresentation {
  const fresh = ci.freshness;
  const trend = TREND_PRESENTATION[ci.sixMonthTrend.trend] ?? TREND_PRESENTATION.SIN_DATOS;

  // ── Data state (§37–39/41) ──
  const status = fresh.dataStatus;
  const dataState: StoreIntelligencePresentation["dataState"] = {
    status,
    stateTitle: status === "NOT_SYNCED"
      ? "Tienda sin sincronizar"
      : status === "NO_DATA" ? "Sin ventas registradas" : null,
    stateText: status === "NOT_SYNCED"
      ? "Esta tienda aún no tiene ventas certificadas sincronizadas. Ninguna cifra se muestra hasta completar la sincronización."
      : status === "NO_DATA"
        ? "La red está sincronizada pero esta tienda no tiene ventas certificadas registradas."
        : null,
    partialBannerText: status === "PARTIAL_DATA" && fresh.syncedThroughDate !== null && fresh.dataLagDays !== null
      ? `Datos parciales: ventas sincronizadas al ${fmtDay(fresh.syncedThroughDate)} (${fmtInt(fresh.dataLagDays)} días de atraso).`
      : null,
  };

  // ── Header ──
  const header: StoreIntelligencePresentation["header"] = {
    title: "Inteligencia comercial",
    storeName: ci.store.storeName,
    freshnessText: fresh.syncedThroughDate ? `Datos al ${fmtDay(fresh.syncedThroughDate)}` : "Sin sincronización",
    lagWarningText: fresh.dataLagDays !== null && status === "PARTIAL_DATA"
      ? `${fmtInt(fresh.dataLagDays)} días de atraso`
      : null,
    trendKey: trend.key,
    trendLabel: trend.label,
    trendTone: trend.tone,
    trendArrow: trend.arrow,
    // Ventanas del DOMINIO (WindowId) — 12M requiere ventana de dominio nueva (reportado)
    periodOptions: [
      { key: "LAST_30_DAYS", label: "30d" },
      { key: "LAST_90_DAYS", label: "90d" },
      { key: "YTD", label: "YTD" },
    ],
  };

  // ── Hero ──
  const p = ci.period;
  const fromMonth = MONTH_FULL[p.dateFrom.slice(5, 7)] ?? "";
  const toMonth = MONTH_FULL[p.dateTo.slice(5, 7)] ?? "";
  const monthly = ci.monthlySales;
  const hero: StoreIntelligencePresentation["hero"] = {
    periodLabel: `${fromMonth}–${toMonth} ${p.year}`,
    salesText: fmtCop(ci.salesKpis.netSales),
    deltaText: fmtPct(ci.salesKpis.monthlyGrowthPct),
    deltaContextText: "vs mes anterior",
    deltaTone: pctTone(ci.salesKpis.monthlyGrowthPct),
    invoicesText: fmtInt(ci.salesKpis.invoiceCount),
    ticketText: ci.salesKpis.averageTicket > 0 ? fmtCop(ci.salesKpis.averageTicket) : "—",
    networkPositionText: `#${ci.networkBenchmark.position} de ${ci.networkBenchmark.totalActiveStores} en la red`,
    sparkline: monthly.slice(-6).map(m => ({ periodKey: m.month, value: m.netSales })),
  };

  // ── Lectura de Agentik ──
  const reading = buildReading(ci, pi);

  // ── Sales trend ──
  const salesTrend: StoreIntelligencePresentation["salesTrend"] = {
    ranges: [
      { key: "6M", label: "6M" },
      { key: "12M", label: "12M" },
      { key: "ALL", label: "Todo" },
    ],
    points: buildTrendPoints(monthly),
  };

  // ── Histórico ──
  const hs = ci.historicalSeries;
  const maxYearSales = Math.max(1, ...hs.years.map(y => Math.abs(y.netSales)));
  const historicalGrowth: StoreIntelligencePresentation["historicalGrowth"] = {
    rows: hs.years.map(y => ({
      yearLabel: y.kind === "CURRENT_YTD" ? `${y.year} YTD` : y.kind === "FIRST_PARTIAL" ? `${y.year}*` : String(y.year),
      kindKey: y.kind,
      kindNote: y.kind === "FIRST_PARTIAL"
        ? `año parcial (desde ${fmtDay(y.dateFrom).split(" ").slice(1).join(" ")} ${y.year})`
        : null,
      salesText: fmtCop(y.netSales),
      growthText: fmtPct(y.growthPct),
      growthTone: pctTone(y.growthPct),
      comparisonLabel: y.comparisonLabel,           // del DOMINIO — React jamás decide (UX11)
      barPct: Math.max(2, Math.round((Math.abs(y.netSales) / maxYearSales) * 100)),
      invoicesText: fmtInt(y.invoiceCount),
      ticketText: fmtCop(y.averageTicket),
    })),
    firstDataNote: hs.firstDataDate ? `Histórico disponible desde ${fmtDay(hs.firstDataDate, true)}` : null,
  };

  // ── Benchmark de red ──
  const bm = ci.networkBenchmark;
  const maxStoreSales = Math.max(1, ...bm.stores.map(s => Math.abs(s.netSales)));
  const avgDelta = bm.deltaVsNetworkAveragePct;
  const leadDelta = bm.deltaVsLeaderPct;
  const networkBenchmark: StoreIntelligencePresentation["networkBenchmark"] = {
    title: "Desempeño frente a otras tiendas",
    periodLabel: `${fmtDay(bm.periodFrom)}–${fmtDay(bm.periodTo)} ${bm.periodTo.slice(0, 4)}`,
    stores: bm.stores.map(s => ({
      storeName: s.storeName,
      salesText: fmtCop(s.netSales),
      barPct: Math.max(2, Math.round((Math.abs(s.netSales) / maxStoreSales) * 100)),
      isCurrent: s.isCurrentStore,
    })),
    summaryText: [
      `Promedio red ${fmtCop(bm.networkAverage)}`,
      avgDelta !== null ? `${fmtPct(avgDelta)} vs promedio` : null,
      leadDelta !== null && leadDelta !== 0 ? `${fmtPct(leadDelta)} vs líder` : null,
      `#${bm.position} de ${bm.totalActiveStores}`,
      `${(Math.round(bm.shareOfNetworkPct * 10) / 10).toLocaleString("es-CO")} % de la red`,
    ].filter(Boolean).join(" · "),
  };

  // ── Detalle contable (colapsado — capa 5 min) ──
  const accountingDetail: StoreIntelligencePresentation["accountingDetail"] = {
    title: "Detalle contable",
    grossText: `Facturación bruta ${fmtCopFull(ci.salesKpis.grossSales)}`,
    creditNotesText: `${fmtInt(ci.salesKpis.creditNoteCount)} notas crédito (${fmtCopFull(Math.abs(ci.salesKpis.creditNotes))})`,
    documentsText: `${fmtInt(ci.salesKpis.documentCount)} documentos`,
  };

  // ── Secciones de producto (null si product intelligence no está disponible) ──
  const productSections = pi === null ? null : buildProductSections(pi);

  return {
    header, dataState, hero, reading, salesTrend, historicalGrowth,
    networkBenchmark,
    universeSelector: pi === null ? null : {
      options: UNIVERSE_KEYS.map(key => ({ key, label: UNIVERSE_LABEL[key] })),
      appliesToText: "Aplica a productos, cambios e inventario sin ventas",
    },
    topProducts: productSections?.topProducts ?? null,
    momentum: productSections?.momentum ?? null,
    noSales: productSections?.noSales ?? null,
    categoryPerformance: productSections?.categoryPerformance ?? null,
    accountingDetail,
    crossStore: {
      capability: "PRODUCT_CROSS_STORE",
      available: false,
      dependencyNote: "Requiere AGENTIK-STORES-PRODUCT-SALES-CROSS-STORE-BACKFILL-01 (Centro/San Diego/Caldas sin product-level aún)",
    },
    profitability: {
      capability: "PRODUCT_PROFITABILITY",
      status: "UNAVAILABLE",
      dependencyNote: "Requiere fuente certificada de costo/margen (Producción/Compras) — sin proxies ni estimaciones",
      futureFields: ["netRevenue", "costAmount", "grossMarginAmount", "grossMarginPct", "profitabilityStatus"],
    },
  };
}

function buildProductSections(pi: StoreProductIntelligence): {
  topProducts: NonNullable<StoreIntelligencePresentation["topProducts"]>;
  momentum: NonNullable<StoreIntelligencePresentation["momentum"]>;
  noSales: NonNullable<StoreIntelligencePresentation["noSales"]>;
  categoryPerformance: NonNullable<StoreIntelligencePresentation["categoryPerformance"]>;
} {
  // ── Top productos ──
  const rateByRef = new Map(pi.salesRates.map(r => [r.referenceCode, r]));
  const momentumByRef = new Map(pi.momentum.map(m => [m.referenceCode, m]));
  const rateRowsAll: IntelProductRow[] = [...pi.salesRates]
    .sort((a, b) => b.salesRate30d - a.salesRate30d || a.referenceCode.localeCompare(b.referenceCode))
    .map((r, i) => {
      const mom = momentumByRef.get(r.referenceCode) ?? null;
      const momStatus: ProductMomentumStatus = mom?.status ?? "NO_ACTIVITY";
      return {
        rank: i + 1,
        universeKey: universeOf(r.lineaSag),
        referenceCode: r.referenceCode,
        productName: r.productName,
        imageUrl: null,
        primaryText: rateText(r).replace(" (últimos 30 días)", ""),
        secondaryText: `${fmtInt(r.netUnits30d)} uds últimos 30 días`,
        shareText: null,
        detail: {
          recentUnitsText: `${fmtInt(r.netUnits30d)} uds últimos 30 días`,
          lastSaleText: "—",
          rateText: rateText(r),
          momentumLabel: MOMENTUM_LABEL[momStatus],
          momentumTone: MOMENTUM_TONE[momStatus],
          momentumArrow: MOMENTUM_ARROW[momStatus],
        },
      };
    });
  // RITMO por universo: salesRates viene COMPLETO del engine → re-ranking real
  // por mundo (sin el límite Top-N que sí tienen Unidades/Ventas).
  const byRate = Object.fromEntries(UNIVERSE_KEYS.map(key => [
    key,
    rateRowsAll
      .filter(r => inUniverse(r.universeKey, key))
      .slice(0, Math.max(1, pi.topN))
      .map((r, i) => ({ ...r, rank: i + 1 })),
  ])) as Record<IntelUniverseKey, IntelProductRow[]>;

  // UNIDADES/VENTAS por universo: ranking REAL (UNIVERSE-RANKING-01) —
  // el engine entrega aggregatedProducts COMPLETO (pre-slice) y la ley
  // canónica rankProducts vive en el módulo de tipos del dominio: aquí solo
  // se FILTRA por el diccionario canónico y se invoca la ley. Cero
  // reconstrucción de métricas (net/share llegan verbatim del engine).
  const rankByUniverse = (sortBy: "netUnits" | "netRevenue") =>
    Object.fromEntries(UNIVERSE_KEYS.map(key => [
      key,
      rankProducts(
        pi.aggregatedProducts.filter(a => inUniverse(universeOf(a.lineaSag), key)),
        sortBy,
        Math.max(1, pi.topN),
      ).map(e => productRow(e, sortBy === "netUnits" ? "UNITS" : "REVENUE", rateByRef, momentumByRef)),
    ])) as Record<IntelUniverseKey, IntelProductRow[]>;

  const topProducts: NonNullable<StoreIntelligencePresentation["topProducts"]> = {
    title: "Productos que impulsan",
    modes: [
      { key: "UNITS", label: "Unidades" },
      { key: "REVENUE", label: "Ventas" },
      { key: "RATE", label: "Ritmo" },
    ],
    rateContextText: "Ritmo de venta reciente · últimos 30 días",
    visibleCount: { mobile: 5, desktop: Math.max(1, pi.topN) },
    byUnits: rankByUniverse("netUnits"),
    byRevenue: rankByUniverse("netRevenue"),
    byRate,
    emptyText: "Sin ventas de productos en el período seleccionado.",
  };

  // ── Momentum — por universo (§6: prioriza ACELERANDO y PERDIENDO RITMO) ──
  const distOrder: ProductMomentumStatus[] = ["ACCELERATING", "DECELERATING", "STABLE", "NEW_ACTIVITY", "NO_ACTIVITY"];
  const byUniverse = Object.fromEntries(UNIVERSE_KEYS.map(key => {
    const rows = pi.momentum.filter(m => inUniverse(universeOf(m.lineaSag), key));
    const counts = new Map<ProductMomentumStatus, number>();
    for (const m of rows) counts.set(m.status, (counts.get(m.status) ?? 0) + 1);
    const acc = counts.get("ACCELERATING") ?? 0;
    const dec = counts.get("DECELERATING") ?? 0;
    return [key, {
      summaryText: `${fmtInt(acc)} acelerando · ${fmtInt(dec)} perdiendo ritmo`,
      distribution: distOrder
        .filter(k => (counts.get(k) ?? 0) > 0)
        .map(k => ({
          key: k,
          label: MOMENTUM_LABEL[k],
          countText: fmtInt(counts.get(k) ?? 0),
          arrow: MOMENTUM_ARROW[k],
          tone: MOMENTUM_TONE[k],
          emphasized: k === "ACCELERATING" || k === "DECELERATING",
        })),
      accelerating: rows
        .filter(m => m.status === "ACCELERATING" || m.status === "NEW_ACTIVITY")
        .sort((a, b) => b.absoluteDelta - a.absoluteDelta || a.referenceCode.localeCompare(b.referenceCode))
        .slice(0, 5)
        .map(momentumRow),
      decelerating: rows
        .filter(m => m.status === "DECELERATING")
        .sort((a, b) => a.absoluteDelta - b.absoluteDelta || a.referenceCode.localeCompare(b.referenceCode))
        .slice(0, 5)
        .map(momentumRow),
    }];
  })) as unknown as NonNullable<StoreIntelligencePresentation["momentum"]>["byUniverse"];

  const momentum: NonNullable<StoreIntelligencePresentation["momentum"]> = {
    title: "Qué está cambiando",
    windowText: `${pi.momentumConfig.windowDays}d vs ${pi.momentumConfig.windowDays}d previos`,
    byUniverse,
    visibleCount: { mobile: 2, desktop: 5 },
  };

  // ── No-sales ──
  const invAvailable = pi.noSales.inventoryAvailability === "READY";
  const nsRows = invAvailable
    ? pi.noSales.rows
        .filter(r => r.classification === "CURRENT_STOCK_NO_RECENT_SALES")
        .sort((a, b) => b.currentStock - a.currentStock || (b.daysSinceLastSale ?? -1) - (a.daysSinceLastSale ?? -1))
        .map(noSalesRow)
    : [];
  const anyNeverSold = nsRows.some(r => r.neverSoldInHistory);
  const universeSummaries = Object.fromEntries(UNIVERSE_KEYS.map(key => {
    const rows = nsRows.filter(r => inUniverse(r.universeKey, key));
    const units = rows.reduce((sum, r) => sum + r.currentStock, 0);
    return [key, {
      summaryText: invAvailable && rows.length > 0
        ? `${fmtInt(rows.length)} referencias · ${fmtInt(units)} uds en tienda`
        : null,
      totalCount: rows.length,
      viewAllText: `Ver las ${fmtInt(rows.length)}`,
    }];
  })) as NonNullable<StoreIntelligencePresentation["noSales"]>["universeSummaries"];

  const noSales: NonNullable<StoreIntelligencePresentation["noSales"]> = {
    title: "Con inventario y sin ventas recientes",
    // Ventana de la clasificación no-sales: el contrato del engine no expone
    // noSalesWindowDays (gap menor reportado); se usa momentumConfig.windowDays,
    // que comparte el mismo default certificado (30).
    windowText: `últimos ${fmtInt(pi.momentumConfig.windowDays)} días`,
    available: invAvailable,
    unavailableText: invAvailable ? null : "No fue posible evaluar el inventario de la tienda en esta corrida.",
    universeSummaries,
    topRows: nsRows.slice(0, 6),
    allRows: nsRows,
    historyCaveatText: anyNeverSold && pi.coverage.dataStartDate
      ? `* histórico disponible desde ${fmtDay(pi.coverage.dataStartDate, true)}`
      : null,
    visibleCount: { mobile: 3, desktop: 6 },
    emptyText: "Todas las referencias con inventario registraron ventas en la ventana reciente.",
  };

  // ── Líneas ──
  const lineRows = pi.categoryPerformance.filter(c => c.level === "line");
  const groupRows = pi.categoryPerformance.filter(c => c.level === "group");
  const categoryPerformance: NonNullable<StoreIntelligencePresentation["categoryPerformance"]> = {
    title: "Qué líneas mueven la tienda",
    stacked: lineRows.map(l => ({
      name: l.name,
      sharePct: l.sharePct,
      shareText: `${(Math.round(l.sharePct * 10) / 10).toLocaleString("es-CO")} %`,
    })),
    rows: [...lineRows]
      .sort((a, b) => {
        // §10: prioridad de mundo (Textil → Importación → otros), luego share
        const wa = universeOf(a.name) === "TEXTILE" ? 0 : universeOf(a.name) === "IMPORT" ? 1 : 2;
        const wb = universeOf(b.name) === "TEXTILE" ? 0 : universeOf(b.name) === "IMPORT" ? 1 : 2;
        if (wa !== wb) return wa - wb;
        return b.sharePct - a.sharePct;
      })
      .map(l => ({
        name: l.name,
        worldTag: WORLD_TAG[universeOf(l.name)],
        revenueText: fmtCop(l.netRevenue),
        shareText: `${(Math.round(l.sharePct * 10) / 10).toLocaleString("es-CO")} %`,
        growthText: fmtPct(l.growthPct),
        growthContextText: "vs 30 días previos",
        growthTone: pctTone(l.growthPct),
        groups: groupRows
          .filter(g => g.parentName === l.name)
          .sort((a, b) => b.netRevenue - a.netRevenue)
          .map(g => ({
            name: g.name,
            revenueText: fmtCop(g.netRevenue),
            growthText: fmtPct(g.growthPct),
            growthTone: pctTone(g.growthPct),
          })),
      })),
    unclassifiedNote: pi.categoryCoverage.unclassifiedReferences > 0
      ? `${fmtInt(pi.categoryCoverage.unclassifiedReferences)} referencias sin clasificación (${(Math.round(pi.categoryCoverage.unclassifiedRevenuePct * 10) / 10).toLocaleString("es-CO")} % del ingreso)`
      : null,
    emptyText: "Sin ventas clasificadas por línea en el período.",
  };

  return { topProducts, momentum, noSales, categoryPerformance };
}
