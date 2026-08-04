/**
 * lib/comercial/tiendas/__tests__/store-intelligence-presentation-assembler.test.ts
 *
 * AGENTIK-STORES-INTELLIGENCE-UX-IMPLEMENTATION-01 — certificación del PA
 * de Inteligencia + guardianes UX1–UX16 (fs) sobre el PA y el render.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-intelligence-presentation-assembler.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  buildStoreIntelligencePresentation,
  fmtCop,
  MOMENTUM_LABEL,
} from "../store-intelligence-presentation-assembler";
import type { CertifiedStoreIntelligenceResponse } from "../store-certified-intelligence-types";
import type { StoreProductIntelligence } from "../store-product-intelligence-types";

// ═════════════════════════════════════════════════════════════════════════════
// Fixtures
// ═════════════════════════════════════════════════════════════════════════════

function certifiedFixture(over: Partial<{
  status: "READY" | "PARTIAL_DATA" | "NOT_SYNCED" | "NO_DATA";
  lag: number | null; synced: string | null;
  storeCount: number; currentPos: number;
  historicalStart: number; asOfYear: number;
}> = {}): CertifiedStoreIntelligenceResponse {
  const asOfYear = over.asOfYear ?? 2026;
  const storeCount = over.storeCount ?? 4;
  const pos = over.currentPos ?? 3;
  const histStart = over.historicalStart ?? asOfYear - 3;
  const asOf = `${asOfYear}-08-04`;

  const monthly = Array.from({ length: 8 }, (_, i) => ({
    month: `${asOfYear}-0${i + 1}`,
    monthLabel: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago"][i],
    invoiceCount: 100 + i, creditNoteCount: 2,
    grossSales: 16_000_000 + i * 1_000_000, creditNotes: -500_000,
    netSales: 15_500_000 + i * 1_000_000,
    averageTicket: 103_000,
    monthOverMonthGrowthPct: i === 0 ? null : 8.4,
  }));

  const stores = Array.from({ length: storeCount }, (_, i) => ({
    storeId: `store_${i + 1}`, storeName: `Tienda ${i + 1}`,
    netSales: (storeCount - i) * 50_000_000, invoiceCount: 900,
    isCurrentStore: i + 1 === pos,
    position: i + 1,
    sharePct: Math.round((storeCount - i) * 100 / ((storeCount * (storeCount + 1)) / 2) * 100) / 100,
  }));

  const years = Array.from({ length: asOfYear - histStart + 1 }, (_, i) => {
    const year = histStart + i;
    const isCurrent = year === asOfYear;
    const isFirst = year === histStart;
    return {
      year,
      kind: isCurrent ? "CURRENT_YTD" as const : isFirst ? "FIRST_PARTIAL" as const : "FULL_YEAR" as const,
      dateFrom: isFirst ? `${year}-03-01` : `${year}-01-01`,
      dateTo: isCurrent ? asOf : `${year}-12-31`,
      netSales: 60_000_000 + i * 30_000_000,
      invoiceCount: 600, creditNoteCount: 10, averageTicket: 100_000,
      growthPct: isCurrent ? 14.2 : isFirst || i === 1 ? null : 23.5,
      comparisonLabel: isCurrent ? `vs ene–4 ago ${asOfYear - 1}` : isFirst || i === 1 ? null : `vs ${year - 1}`,
      comparisonNetSales: isCurrent ? 55_000_000 : null,
    };
  });

  const status = over.status ?? "READY";
  return {
    store: { storeId: `store_${pos}`, storeName: `Tienda ${pos}` },
    asOfDate: asOf,
    period: {
      year: asOfYear, dateFrom: `${asOfYear}-01-01`, dateTo: asOf,
      firstDataDate: `${asOfYear}-01-01`, lastDataDate: `${asOfYear}-08-01`,
      dataMonths: 8, isPartialYear: true,
    },
    salesKpis: {
      grossSales: 130_000_000, creditNotes: -1_600_000, netSales: 128_400_000,
      invoiceCount: 1240, creditNoteCount: 16, documentCount: 1256,
      averageTicket: 103_000, currentMonthSales: 22_500_000, previousMonthSales: 20_800_000,
      monthlyGrowthPct: 8.4, yearProgressPct: 66.7,
    },
    monthlySales: monthly,
    sixMonthTrend: {
      months: 6, firstMonthSales: 17_500_000, lastMonthSales: 22_500_000,
      accumulatedGrowthPct: 28.6, averageMonthlySales: 20_000_000, trend: "CRECIENDO",
    },
    storeBenchmark: {
      storeNetSales: 128_400_000, allStoresNetSales: 500_000_000,
      participationPct: 25.7, positionByNetSales: pos, totalActiveStores: storeCount,
    },
    networkBenchmark: {
      periodFrom: `${asOfYear}-01-01`, periodTo: asOf,
      stores, position: pos, totalActiveStores: storeCount,
      networkTotal: stores.reduce((s, r) => s + r.netSales, 0),
      networkAverage: Math.round(stores.reduce((s, r) => s + r.netSales, 0) / storeCount),
      shareOfNetworkPct: 22.7,
      deltaVsNetworkAveragePct: -9.4, deltaVsLeaderPct: pos === 1 ? 0 : -32.6,
      leaderStoreId: "store_1",
    },
    historicalSeries: {
      asOfDate: asOf, firstDataDate: `${histStart}-03-01`, years, ytd: null,
    },
    freshness: {
      asOfDate: asOf,
      dataStartDate: status === "NOT_SYNCED" || status === "NO_DATA" ? null : `${histStart}-03-04`,
      syncedThroughDate: over.synced !== undefined ? over.synced : (status === "NOT_SYNCED" ? null : `${asOfYear}-07-06`),
      dataLagDays: over.lag !== undefined ? over.lag : (status === "NOT_SYNCED" ? null : 29),
      dataStatus: status,
    },
    discountOpportunities: {
      totalReferences: 0, totalUnits: 0, tier10: 0, tier30: 0, tier50: 0, tier70: 0,
      withoutDate: 0, topItems: [],
    },
    executiveInsights: [],
    salesSourceStatus: "CERTIFIED",
    salesSourceNote: "test",
    snapshotAt: `${asOf}T12:00:00.000Z`,
  };
}

function productFixture(over: Partial<{
  topN: number; inventoryUnavailable: boolean; noSalesCount: number;
  dataStartDate: string;
}> = {}): StoreProductIntelligence {
  const topN = over.topN ?? 10;
  const mkTop = (i: number) => ({
    referenceCode: `REF-${i}`, productName: `Producto ${i}`, heroImageUrl: null,
    lineaSag: i % 2 === 0 ? "IMPORTACION" : "CASTILLITOS", grupoSag: null, subgrupoSag: null,
    netUnits: 40 - i, netRevenue: (40 - i) * 120_000, invoiceCount: 20,
    lastSaleDate: "2026-07-01", rank: i, shareOfStoreRevenuePct: 3.2,
  });
  const noSalesCount = over.noSalesCount ?? 4;
  return {
    storeId: "store_3", storeName: "Tienda 3", asOfDate: "2026-08-04",
    coverage: {
      dataStatus: "READY",
      dataStartDate: over.dataStartDate ?? "2023-03-04",
      dataEndDate: "2026-07-06", syncedThroughDate: "2026-07-06",
      dataLagDays: 29, totalLines: 5000, totalReferences: 900,
    },
    commercialUniverse: {
      allSalesRefs: 900, windowActiveRefs: 400, commercialEligibleRefs: 390,
      excludedRefs: 10, excludedRevenue: 1_000_000, excludedUnits: 20,
      exclusionReasons: { OTROS: 10 },
    },
    aggregatedProducts: Array.from({ length: topN }, (_, i) => mkTop(i + 1)),
    topByUnits: Array.from({ length: topN }, (_, i) => mkTop(i + 1)),
    topByRevenue: Array.from({ length: topN }, (_, i) => mkTop(i + 1)),
    salesRates: [
      { referenceCode: "REF-1", productName: "Producto 1", lineaSag: "CASTILLITOS", salesRate30d: 0.4, salesRate60d: 0.3, salesRate90d: 0.25, netUnits30d: 12, netUnits60d: 18, netUnits90d: 22 },
      { referenceCode: "REF-2", productName: "Producto 2", lineaSag: "IMPORTACION", salesRate30d: 0.1, salesRate60d: 0.1, salesRate90d: 0.1, netUnits30d: 3, netUnits60d: 6, netUnits90d: 9 },
    ],
    momentum: [
      { referenceCode: "REF-1", productName: "Producto 1", lineaSag: "CASTILLITOS", recentNetUnits: 14, previousNetUnits: 6, absoluteDelta: 8, growthPct: 133, status: "ACCELERATING", windowDays: 30 },
      { referenceCode: "REF-2", productName: "Producto 2", lineaSag: "IMPORTACION", recentNetUnits: 4, previousNetUnits: 12, absoluteDelta: -8, growthPct: -66.7, status: "DECELERATING", windowDays: 30 },
      { referenceCode: "REF-3", productName: "Producto 3", lineaSag: null, recentNetUnits: 5, previousNetUnits: 5, absoluteDelta: 0, growthPct: 0, status: "STABLE", windowDays: 30 },
    ],
    noSales: over.inventoryUnavailable
      ? { inventoryAvailability: "INVENTORY_UNAVAILABLE", rows: [] }
      : {
          inventoryAvailability: "READY",
          rows: Array.from({ length: noSalesCount }, (_, i) => ({
            referenceCode: `NS-${i + 1}`, productName: `Sin venta ${i + 1}`, lineaSag: "CASTILLITOS",
            currentStock: 20 - i, daysInStore: 200,
            lastSaleDate: i === 0 ? null : "2026-05-01",
            daysSinceLastSale: i === 0 ? null : 90 + i,
            classification: "CURRENT_STOCK_NO_RECENT_SALES" as const,
          })),
        },
    categoryPerformance: [
      { level: "line" as const, name: "IMPORTACION", parentName: null, referenceCount: 120, netUnits: 900, netRevenue: 68_500_000, sharePct: 53.4, netUnitsRecent30d: 100, netUnitsPrevious30d: 145, growthPct: -30.7 },
      { level: "line" as const, name: "CASTILLITOS", parentName: null, referenceCount: 250, netUnits: 1200, netRevenue: 59_100_000, sharePct: 46.0, netUnitsRecent30d: 130, netUnitsPrevious30d: 141, growthPct: -7.8 },
      { level: "group" as const, name: "BAÑOS", parentName: "IMPORTACION", referenceCount: 30, netUnits: 200, netRevenue: 20_000_000, sharePct: 15, netUnitsRecent30d: 20, netUnitsPrevious30d: 30, growthPct: -33 },
    ],
    categoryCoverage: {
      windowActiveReferences: 400, allTimeReferences: 900, classifiedReferences: 390,
      classifiedRevenuePct: 97.5, unclassifiedReferences: 10, unclassifiedRevenuePct: 2.5,
    },
    windowUsed: "LAST_90_DAYS",
    momentumConfig: { windowDays: 30, stabilityThresholdPct: 10 },
    topN,
    performance: { dbQueryCount: 6, dbCumulativeMs: 100, dbWallClockMs: 60, engineComputeMs: 5, totalWallClockMs: 70 },
  };
}

const PRES = buildStoreIntelligencePresentation(certifiedFixture(), productFixture());

// ═════════════════════════════════════════════════════════════════════════════
// Contrato del PA
// ═════════════════════════════════════════════════════════════════════════════

describe("header / freshness / trend", () => {
  it("UX4: freshness SIEMPRE visible; lag alto → warning explícito (PARTIAL_DATA)", () => {
    const p = buildStoreIntelligencePresentation(certifiedFixture({ status: "PARTIAL_DATA" }), productFixture());
    assert.equal(p.header.freshnessText, "Datos al 6 jul");
    assert.equal(p.header.lagWarningText, "29 días de atraso");
    assert.ok(p.dataState.partialBannerText!.includes("29 días"));
  });

  it("READY: freshness discreto sin warning", () => {
    assert.equal(PRES.header.lagWarningText, null);
    assert.equal(PRES.dataState.partialBannerText, null);
  });

  it("trend chip humano con flecha (jamás solo color — UX15)", () => {
    assert.equal(PRES.header.trendLabel, "Mejorando");
    assert.equal(PRES.header.trendArrow, "▲");
    assert.equal(PRES.header.trendTone, "positive");
  });

  it("períodos del DOMINIO (WindowId) — sin 12M inventado", () => {
    assert.deepEqual(PRES.header.periodOptions.map(o => o.key), ["LAST_30_DAYS", "LAST_90_DAYS", "YTD"]);
  });
});

describe("estados de dato (UX5/UX6)", () => {
  it("UX5: NOT_SYNCED → estado explícito, jamás cifras como verdad", () => {
    const p = buildStoreIntelligencePresentation(certifiedFixture({ status: "NOT_SYNCED", synced: null, lag: null }), productFixture());
    assert.equal(p.dataState.status, "NOT_SYNCED");
    assert.equal(p.dataState.stateTitle, "Tienda sin sincronizar");
    assert.ok(p.dataState.stateText!.length > 0);
  });

  it("NO_DATA distinto de NOT_SYNCED", () => {
    const p = buildStoreIntelligencePresentation(certifiedFixture({ status: "NO_DATA" }), productFixture());
    assert.equal(p.dataState.stateTitle, "Sin ventas registradas");
  });

  it("UX6: INVENTORY_UNAVAILABLE → texto de estado, JAMÁS '0 referencias'", () => {
    const p = buildStoreIntelligencePresentation(certifiedFixture(), productFixture({ inventoryUnavailable: true }));
    assert.equal(p.noSales!.available, false);
    assert.ok(p.noSales!.unavailableText!.includes("No fue posible"));
    assert.equal(p.noSales!.universeSummaries.ALL.summaryText, null);
  });

  it("READY + cero no-sales → empty legítimo", () => {
    const p = buildStoreIntelligencePresentation(certifiedFixture(), productFixture({ noSalesCount: 0 }));
    assert.equal(p.noSales!.available, true);
    assert.equal(p.noSales!.universeSummaries.ALL.totalCount, 0);
    assert.ok(p.noSales!.emptyText.length > 0);
  });
});

describe("hero + lectura de Agentik", () => {
  it("hero con delta + denominador y posición dinámica en red", () => {
    assert.equal(PRES.hero.salesText, "$128,4 M");
    assert.equal(PRES.hero.deltaText, "+8,4 %");
    assert.equal(PRES.hero.deltaContextText, "vs mes anterior");
    assert.equal(PRES.hero.networkPositionText, "#3 de 4 en la red");
    assert.equal(PRES.hero.sparkline.length, 6);
  });

  it("§11: EXACTAMENTE hasta 3 conclusiones en orden fijo estado → motor → riesgo", () => {
    assert.equal(PRES.reading.sentences.length, 3);
    assert.deepEqual(PRES.reading.signals.map(s => s.type), [
      "STORE_SALES_UP",
      "LINE_DECLINING",
      "RISK_DECELERATING_AND_STOCK_NO_SALES",
    ]);
    // Estado conectado con la red; motor conecta share+growth de la línea dominante
    assert.ok(PRES.reading.sentences[0].includes("promedio de la red"));
    assert.ok(PRES.reading.sentences[1].includes("IMPORTACION") && PRES.reading.sentences[1].includes("53,4 %") && PRES.reading.sentences[1].includes("30,7 %"));
    // Riesgo: UNA frase que fusiona pierde-ritmo + inventario sin ventas (con plural correcto)
    assert.equal(
      PRES.reading.sentences[2],
      "1 referencia está perdiendo ritmo y 4 mantienen inventario sin ventas recientes.",
    );
    // Determinismo: misma entrada → misma salida byte a byte
    const again = buildStoreIntelligencePresentation(certifiedFixture(), productFixture());
    assert.deepEqual(again.reading.sentences, PRES.reading.sentences);
  });

  it("§11: sin datos suficientes para una conclusión → se omite, jamás relleno", () => {
    // pi = null → solo queda la conclusión de estado (certificada)
    const partial = buildStoreIntelligencePresentation(certifiedFixture(), null);
    assert.deepEqual(partial.reading.signals.map(s => s.type), ["STORE_SALES_UP"]);
    assert.equal(partial.reading.sentences.length, 1);
  });
});

describe("salesTrend (UX10)", () => {
  it("puntos presentables completos para el tooltip", () => {
    const pt = PRES.salesTrend.points[5];
    assert.equal(pt.label, "Jun");
    assert.ok(pt.formattedValue.startsWith("$"));
    assert.ok(pt.invoicesText.includes("facturas"));
    assert.equal(pt.deltaPctText, "+8,4 %");
    assert.equal(typeof pt.value, "number");
  });
});

describe("histórico (UX3/UX11/UX13)", () => {
  it("kinds con copy humano y años dinámicos", () => {
    const labels = PRES.historicalGrowth.rows.map(r => r.yearLabel);
    assert.deepEqual(labels, ["2023*", "2024", "2025", "2026 YTD"]);
    assert.ok(PRES.historicalGrowth.rows[0].kindNote!.includes("año parcial"));
  });

  it("UX11: YTD usa el comparisonLabel del DOMINIO (same-cut), verbatim", () => {
    const ytd = PRES.historicalGrowth.rows.find(r => r.kindKey === "CURRENT_YTD")!;
    assert.equal(ytd.comparisonLabel, "vs ene–4 ago 2025");
    assert.equal(ytd.growthText, "+14,2 %");
  });

  it("UX3: inicio histórico distinto (2019) y año asOf distinto (2031) fluyen dinámicos", () => {
    const p = buildStoreIntelligencePresentation(
      certifiedFixture({ asOfYear: 2031, historicalStart: 2019 }),
      productFixture(),
    );
    assert.equal(p.historicalGrowth.rows[0].yearLabel, "2019*");
    assert.equal(p.historicalGrowth.rows[p.historicalGrowth.rows.length - 1].yearLabel, "2031 YTD");
    assert.ok(p.historicalGrowth.firstDataNote!.includes("2019"));
  });
});

describe("benchmark de red (UX12)", () => {
  it("título aprobado + filas con current destacada", () => {
    assert.equal(PRES.networkBenchmark.title, "Desempeño frente a otras tiendas");
    assert.equal(PRES.networkBenchmark.stores.length, 4);
    assert.equal(PRES.networkBenchmark.stores.filter(s => s.isCurrent).length, 1);
  });

  it("UX12: 6 tiendas → 6 barras; líder y última correctas", () => {
    const p6 = buildStoreIntelligencePresentation(certifiedFixture({ storeCount: 6, currentPos: 6 }), productFixture());
    assert.equal(p6.networkBenchmark.stores.length, 6);
    assert.ok(p6.networkBenchmark.summaryText.includes("#6 de 6"));
    const pLeader = buildStoreIntelligencePresentation(certifiedFixture({ currentPos: 1 }), productFixture());
    assert.ok(pLeader.networkBenchmark.summaryText.includes("#1 de 4"));
    assert.ok(!pLeader.networkBenchmark.summaryText.includes("vs líder"));   // líder: sin delta contra sí misma
  });
});

describe("productos / ritmo / momentum (UX7)", () => {
  it("UX7: topN del dominio gobierna visibleCount.desktop y el largo de listas", () => {
    const p7 = buildStoreIntelligencePresentation(certifiedFixture(), productFixture({ topN: 7 }));
    assert.equal(p7.topProducts!.visibleCount.desktop, 7);
    assert.equal(p7.topProducts!.byUnits.ALL.length, 7);
    assert.equal(p7.topProducts!.visibleCount.mobile, 5);
  });

  it("ritmo de venta en uds/semana derivado en el PA (§17)", () => {
    const row = PRES.topProducts!.byUnits.ALL.find(r => r.referenceCode === "REF-1")!;
    assert.ok(row.detail.rateText.includes("uds/sem"));
    assert.ok(row.detail.rateText.includes("últimos 30 días"));
    assert.ok(row.detail.rateText.includes("2,8"));         // 0.4/día × 7
  });

  it("VISUAL §8: la ventana del modo Ritmo viaja en el DTO — jamás se esconde", () => {
    assert.equal(PRES.topProducts!.rateContextText, "Ritmo de venta reciente · últimos 30 días");
  });

  it("momentum humano 1:1 + distribución sin estados vacíos", () => {
    assert.equal(MOMENTUM_LABEL.DECELERATING, "Perdiendo ritmo");
    const all = PRES.momentum!.byUniverse.ALL;
    const keys = all.distribution.map(d => d.key);
    assert.deepEqual(keys, ["ACCELERATING", "DECELERATING", "STABLE"]);   // NEW/NO_ACTIVITY sin filas → sin chip
    const dec = all.decelerating[0];
    assert.equal(dec.changeText, "12 → 4 uds (30d)");
    assert.equal(dec.tone, "warning");                       // jamás critical (§19/§36)
  });

  it("§6: resumen ejecutivo primero — ACELERANDO y PERDIENDO RITMO mandan (emphasized)", () => {
    const all = PRES.momentum!.byUniverse.ALL;
    assert.equal(all.summaryText, "1 acelerando · 1 perdiendo ritmo");
    for (const d of all.distribution) {
      assert.equal(d.emphasized, d.key === "ACCELERATING" || d.key === "DECELERATING");
    }
  });
});

describe("no-sales (§20–22)", () => {
  it("título y ventana correctos; jamás 'productos que no se venden'", () => {
    assert.equal(PRES.noSales!.title, "Con inventario y sin ventas recientes");
    assert.equal(PRES.noSales!.windowText, "últimos 30 días");
  });

  it("nunca-vendida = 'Sin ventas en el histórico disponible' + caveat de cobertura", () => {
    const never = PRES.noSales!.allRows.find(r => r.neverSoldInHistory)!;
    assert.ok(never.lastSaleText.includes("histórico disponible"));
    assert.ok(!never.lastSaleText.toLowerCase().includes("nunca"));
    assert.ok(PRES.noSales!.historyCaveatText!.includes("2023"));
  });

  it("§7: si EXISTE lastSaleDate, la fecha se muestra — jamás el copy de 'sin histórico'", () => {
    const withDate = PRES.noSales!.allRows.filter(r => r.daysSinceLastSale !== null);
    assert.ok(withDate.length > 0);
    for (const r of withDate) {
      assert.ok(!r.lastSaleText.includes("histórico disponible"), "sustituyó la fecha por el copy de sin-histórico");
      assert.ok(r.lastSaleText.includes("última venta hace"));
      assert.ok(r.lastSaleText.includes("· 1 may"), `fecha real ausente: ${r.lastSaleText}`);
    }
  });

  it("prioridad por stock y días sin venta; summary con cardinalidades", () => {
    assert.equal(PRES.noSales!.allRows[0].currentStock, 20);
    assert.ok(PRES.noSales!.universeSummaries.ALL.summaryText!.includes("4 referencias"));
    assert.equal(PRES.noSales!.universeSummaries.ALL.viewAllText, "Ver las 4");
  });
});

describe("líneas (§24–25 + §10 prioridad de mundo)", () => {
  it("rows con growth contextualizado; grupos anidados por línea", () => {
    const imp = PRES.categoryPerformance!.rows.find(r => r.name === "IMPORTACION")!;
    assert.equal(imp.growthText, "−30,7 %");
    assert.equal(imp.growthContextText, "vs 30 días previos");
    assert.equal(imp.groups[0].name, "BAÑOS");
    assert.ok(PRES.categoryPerformance!.unclassifiedNote!.includes("10 referencias"));
  });

  it("§10: orden Textil → Importación → otros + worldTag del diccionario canónico", () => {
    // CASTILLITOS (Textil) precede a IMPORTACION aunque IMPORTACION tenga más share
    assert.deepEqual(PRES.categoryPerformance!.rows.map(r => r.name), ["CASTILLITOS", "IMPORTACION"]);
    assert.equal(PRES.categoryPerformance!.rows[0].worldTag, "Textil");
    assert.equal(PRES.categoryPerformance!.rows[1].worldTag, "Importación");
  });
});

describe("degradación parcial (HOTFIX GATE §7) — pi = null", () => {
  const partial = buildStoreIntelligencePresentation(certifiedFixture(), null);

  it("certified solo: hero/lectura/evolución/benchmark/histórico presentes", () => {
    assert.equal(partial.hero.salesText, "$128,4 M");
    assert.equal(partial.networkBenchmark.stores.length, 4);
    assert.equal(partial.historicalGrowth.rows.length, 4);
    assert.ok(partial.salesTrend.points.length > 0);
    assert.ok(partial.reading.sentences.length >= 1);   // lectura con señales certificadas
  });

  it("secciones de producto viajan null — jamás fabricadas ni en cero", () => {
    assert.equal(partial.topProducts, null);
    assert.equal(partial.momentum, null);
    assert.equal(partial.noSales, null);
    assert.equal(partial.categoryPerformance, null);
  });

  it("determinismo también en modo parcial", () => {
    const again = buildStoreIntelligencePresentation(certifiedFixture(), null);
    assert.deepEqual(again.reading.sentences, partial.reading.sentences);
  });

  it("guardián del render: degradación local con reintento — sin error global por fuente secundaria", () => {
    const tabSrc = fs.readFileSync(path.resolve(__dirname, "../../../../components/comercial/store-intelligence-tab.tsx"), "utf8");
    assert.ok(tabSrc.includes("productIntel ?? null"), "el DTO debe construirse con certified solo");
    assert.ok(tabSrc.includes("productLocalState"), "estado local de secciones de producto");
    assert.ok(tabSrc.includes("onRetryProduct") && tabSrc.includes("onRetryCertified"), "reintentos cableados");
    assert.ok(!tabSrc.includes("certifiedIntel && productIntel ?"), "prohibido exigir ambas fuentes para renderizar");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Universo comercial — PRODUCT-DIRECTION-01 §2–3 (Todos · Textil · Importación)
// ═════════════════════════════════════════════════════════════════════════════

describe("universo comercial (§2–3)", () => {
  it("selector solo con product intelligence; opciones canónicas; SIN rankingScopeNote (limitación eliminada)", () => {
    assert.deepEqual(PRES.universeSelector!.options.map(o => o.key), ["ALL", "TEXTILE", "IMPORT"]);
    assert.deepEqual(PRES.universeSelector!.options.map(o => o.label), ["Todos", "Textil", "Importación"]);
    assert.ok(PRES.universeSelector!.appliesToText.length > 0);
    // UNIVERSE-RANKING-01 §10: los rankings ya son reales — la nota de límite no debe existir
    assert.ok(!("rankingScopeNote" in PRES.universeSelector!), "rankingScopeNote debe eliminarse del contrato");
    const partial = buildStoreIntelligencePresentation(certifiedFixture(), null);
    assert.equal(partial.universeSelector, null);
  });

  it("diccionario 1:1 sobre lineaSag (set canónico CASTILLITOS_LINEAS) — filas etiquetadas", () => {
    const ref1 = PRES.topProducts!.byUnits.ALL.find(r => r.referenceCode === "REF-1")!;
    const ref2 = PRES.topProducts!.byUnits.ALL.find(r => r.referenceCode === "REF-2")!;
    assert.equal(ref1.universeKey, "TEXTILE");     // CASTILLITOS
    assert.equal(ref2.universeKey, "IMPORT");      // IMPORTACION
  });

  it("POWER / null → OTHER: fuera de ambos mundos, presentes SOLO en Todos", () => {
    const f = productFixture();
    f.salesRates.push(
      { referenceCode: "REF-8", productName: "P8", lineaSag: "POWER", salesRate30d: 0.9, salesRate60d: 0.9, salesRate90d: 0.9, netUnits30d: 27, netUnits60d: 54, netUnits90d: 81 },
      { referenceCode: "REF-9", productName: "P9", lineaSag: null, salesRate30d: 0.05, salesRate60d: 0.05, salesRate90d: 0.05, netUnits30d: 2, netUnits60d: 3, netUnits90d: 5 },
    );
    const p = buildStoreIntelligencePresentation(certifiedFixture(), f);
    const codes = (u: "ALL" | "TEXTILE" | "IMPORT") => p.topProducts!.byRate[u].map(r => r.referenceCode);
    assert.ok(codes("ALL").includes("REF-8") && codes("ALL").includes("REF-9"));
    assert.ok(!codes("TEXTILE").includes("REF-8") && !codes("TEXTILE").includes("REF-9"));
    assert.ok(!codes("IMPORT").includes("REF-8") && !codes("IMPORT").includes("REF-9"));
    // momentum: REF-3 (lineaSag null, STABLE) solo cuenta en Todos
    assert.ok(p.momentum!.byUniverse.ALL.distribution.some(d => d.key === "STABLE"));
    assert.ok(!p.momentum!.byUniverse.TEXTILE.distribution.some(d => d.key === "STABLE"));
    assert.ok(!p.momentum!.byUniverse.IMPORT.distribution.some(d => d.key === "STABLE"));
  });

  it("normalización defensiva del literal (trim/case) — SIN inferencia semántica", () => {
    const f = productFixture();
    f.salesRates.push({ referenceCode: "REF-7", productName: "P7", lineaSag: "  importacion  ", salesRate30d: 0.8, salesRate60d: 0.8, salesRate90d: 0.8, netUnits30d: 24, netUnits60d: 48, netUnits90d: 72 });
    const p = buildStoreIntelligencePresentation(certifiedFixture(), f);
    assert.ok(p.topProducts!.byRate.IMPORT.map(r => r.referenceCode).includes("REF-7"));
  });

  it("RITMO: re-ranking REAL por universo (lista completa del engine → rank 1..n propio)", () => {
    const tex = PRES.topProducts!.byRate.TEXTILE;
    const imp = PRES.topProducts!.byRate.IMPORT;
    assert.equal(tex[0].referenceCode, "REF-1");
    assert.equal(tex[0].rank, 1);
    assert.equal(imp[0].referenceCode, "REF-2");
    assert.equal(imp[0].rank, 1);            // rank global era 2 → re-rank real por mundo
  });

  it("momentum y no-sales por universo con cardinalidades correctas", () => {
    assert.equal(PRES.momentum!.byUniverse.TEXTILE.accelerating.length, 1);
    assert.equal(PRES.momentum!.byUniverse.TEXTILE.decelerating.length, 0);
    assert.equal(PRES.momentum!.byUniverse.IMPORT.decelerating.length, 1);
    assert.equal(PRES.noSales!.universeSummaries.TEXTILE.totalCount, 4);   // fixture: todas CASTILLITOS
    assert.equal(PRES.noSales!.universeSummaries.IMPORT.totalCount, 0);
    assert.equal(PRES.noSales!.universeSummaries.IMPORT.summaryText, null);
  });

  it("guardián CD-: las referencias CD- PARTICIPAN en Inteligencia con normalidad (sin filtro, sin badge)", () => {
    // Behavioral: una CD- textil fluye a rankings/ritmo como cualquier referencia
    const f = productFixture();
    f.aggregatedProducts = [...f.aggregatedProducts, {
      referenceCode: "CD-9001", productName: "Cambio CD", heroImageUrl: null,
      lineaSag: "CASTILLITOS", grupoSag: null, subgrupoSag: null,
      netUnits: 999, netRevenue: 99_000_000, invoiceCount: 9,
      lastSaleDate: "2026-07-01", shareOfStoreRevenuePct: 9,
    }];
    const p = buildStoreIntelligencePresentation(certifiedFixture(), f);
    assert.equal(p.topProducts!.byUnits.ALL[0].referenceCode, "CD-9001");
    assert.equal(p.topProducts!.byUnits.TEXTILE[0].referenceCode, "CD-9001");
    // fs: ni el PA ni el tab filtran ni marcan CD- (esa política es de Descuentos)
    const tabSrc2 = fs.readFileSync(path.resolve(__dirname, "../../../../components/comercial/store-intelligence-tab.tsx"), "utf8");
    const paSrc2 = fs.readFileSync(path.resolve(__dirname, "../store-intelligence-presentation-assembler.ts"), "utf8");
    for (const src of [tabSrc2, paSrc2]) {
      assert.ok(!src.includes('"CD-') && !src.includes("startsWith(\"CD"), "filtro/heurística CD- prohibido en Inteligencia");
    }
  });

  it("guardián: CERO ranking en React — el tab no ordena ni rankea productos", () => {
    const tabSrc2 = fs.readFileSync(path.resolve(__dirname, "../../../../components/comercial/store-intelligence-tab.tsx"), "utf8");
    assert.ok(!tabSrc2.includes("rankProducts"), "la ley de ranking no se importa en React");
    assert.ok(!tabSrc2.includes("visibleProducts.sort") && !tabSrc2.includes(".rank ="), "orden/rank de productos calculado en React");
  });

  it("guardián fs: clasificación SIN heurísticas (ni regex, ni nombres, ni listas de referencias)", () => {
    const paSrc = fs.readFileSync(path.resolve(__dirname, "../store-intelligence-presentation-assembler.ts"), "utf8");
    const universeBlock = paSrc.slice(paSrc.indexOf("LINEA_TO_UNIVERSE"), paSrc.indexOf("const MONTH_SHORT"));
    assert.ok(universeBlock.length > 0, "bloque de universo no encontrado");
    assert.ok(!universeBlock.includes("productName"), "clasificación por nombre de producto");
    assert.ok(!universeBlock.includes("referenceCode"), "lista de referencias hardcodeada");
    assert.ok(!/\.(match|test|exec)\(/.test(universeBlock), "regex en la clasificación");
    // Diccionario EXACTO del set canónico confirmado (CASTILLITOS_LINEAS)
    assert.ok(universeBlock.includes('"CASTILLITOS": "TEXTILE"'));
    assert.ok(universeBlock.includes('"LATIN KIDS": "TEXTILE"'));
    assert.ok(universeBlock.includes('"IMPORTACION": "IMPORT"'));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Ranking REAL por universo — UNIVERSE-RANKING-01 (guard principal §9)
// ═════════════════════════════════════════════════════════════════════════════

describe("ranking real por universo (UNIVERSE-RANKING-01)", () => {
  // FIXTURE OBLIGATORIO: Top global DOMINADO por Importación — Textil debe
  // seguir devolviendo su VERDADERO Top N (no filter(globalTopN)).
  const mkAgg = (ref: string, lineaSag: string | null, units: number, revenue: number) => ({
    referenceCode: ref, productName: `P ${ref}`, heroImageUrl: null,
    lineaSag, grupoSag: null, subgrupoSag: null,
    netUnits: units, netRevenue: revenue, invoiceCount: 1,
    lastSaleDate: "2026-07-01", shareOfStoreRevenuePct: 1,
  });
  const domFixture = () => {
    const f = productFixture({ topN: 10 });
    f.aggregatedProducts = [
      // 12 importadas dominan el Top global por unidades y por ventas
      ...Array.from({ length: 12 }, (_, i) =>
        mkAgg(`IMP-${String(i + 1).padStart(2, "0")}`, "IMPORTACION", 500 - i, (500 - i) * 10_000)),
      // 4 textiles con volúmenes menores — NINGUNA entra al Top-10 global
      ...Array.from({ length: 4 }, (_, i) =>
        mkAgg(`TEX-${i + 1}`, i % 2 === 0 ? "CASTILLITOS" : "LATIN KIDS", 50 - i, (50 - i) * 10_000)),
    ];
    return f;
  };
  const P = buildStoreIntelligencePresentation(certifiedFixture(), domFixture());

  it("U1: el Top global difiere del Top Textil (en unidades y en ventas)", () => {
    const allRefs = P.topProducts!.byUnits.ALL.map(r => r.referenceCode);
    const texRefs = P.topProducts!.byUnits.TEXTILE.map(r => r.referenceCode);
    assert.equal(allRefs.length, 10);
    assert.ok(allRefs.every(r => r.startsWith("IMP-")), "el Top global del fixture debe ser 100% importación");
    assert.ok(texRefs.length > 0 && texRefs.every(r => r.startsWith("TEX-")));
    assert.notDeepEqual(allRefs, texRefs);
    assert.notDeepEqual(P.topProducts!.byRevenue.ALL.map(r => r.referenceCode),
      P.topProducts!.byRevenue.TEXTILE.map(r => r.referenceCode));
  });

  it("U2: textil FUERA del Top-N global entra correctamente como #1..#N de Textil", () => {
    const allRefs = P.topProducts!.byUnits.ALL.map(r => r.referenceCode);
    assert.ok(!allRefs.includes("TEX-1"), "TEX-1 no debe caber en el Top-10 global");
    const tex = P.topProducts!.byUnits.TEXTILE;
    assert.equal(tex[0].referenceCode, "TEX-1");   // 50 uds — el mayor textil
    assert.equal(tex[0].rank, 1);
    assert.deepEqual(tex.map(r => r.referenceCode), ["TEX-1", "TEX-2", "TEX-3", "TEX-4"]);
    assert.deepEqual(tex.map(r => r.rank), [1, 2, 3, 4]);      // NO filter(globalTopN)
  });

  it("U3: el Top Importación es independiente (no lo alteran las textiles)", () => {
    const imp = P.topProducts!.byUnits.IMPORT;
    assert.equal(imp.length, 10);                   // 12 elegibles → Top-10 propio
    assert.deepEqual(imp.map(r => r.referenceCode),
      Array.from({ length: 10 }, (_, i) => `IMP-${String(i + 1).padStart(2, "0")}`));
  });

  it("U4: el rank REINICIA en 1 dentro de cada universo (unidades y ventas)", () => {
    for (const mode of ["byUnits", "byRevenue"] as const) {
      for (const key of ["ALL", "TEXTILE", "IMPORT"] as const) {
        const rows = P.topProducts![mode][key];
        assert.ok(rows.length > 0);
        assert.equal(rows[0].rank, 1, `${mode}.${key} debe empezar en #1`);
        assert.deepEqual(rows.map(r => r.rank), rows.map((_, i) => i + 1), `${mode}.${key} ranks contiguos`);
      }
    }
  });

  it("U6 (PA): topN del dominio gobierna el largo por universo", () => {
    const f = domFixture();
    f.topN = 3;
    const p3 = buildStoreIntelligencePresentation(certifiedFixture(), f);
    assert.equal(p3.topProducts!.byUnits.ALL.length, 3);
    assert.equal(p3.topProducts!.byUnits.IMPORT.length, 3);
    assert.equal(p3.topProducts!.byUnits.TEXTILE.length, 3);   // 4 elegibles → Top-3 propio
  });

  it("consistencia: byUnits.ALL del PA ≡ topByUnits del engine (misma ley, misma entrada)", () => {
    // Con el fixture base (aggregatedProducts = mismas entradas que topByUnits)
    assert.deepEqual(
      PRES.topProducts!.byUnits.ALL.map(r => r.referenceCode),
      productFixture().topByUnits.map(e => e.referenceCode),
    );
  });
});

describe("capacidades preparadas — jamás inventadas (§8–9)", () => {
  it("cross-store: available === false con la dependencia registrada", () => {
    assert.equal(PRES.crossStore.capability, "PRODUCT_CROSS_STORE");
    assert.equal(PRES.crossStore.available, false);
    assert.ok(PRES.crossStore.dependencyNote.includes("CROSS-STORE-BACKFILL"));
  });

  it("rentabilidad: UNAVAILABLE sin proxies; contrato futuro declarado; render jamás la muestra", () => {
    assert.equal(PRES.profitability.status, "UNAVAILABLE");
    assert.ok(PRES.profitability.futureFields.includes("grossMarginPct"));
    assert.ok(PRES.profitability.dependencyNote.includes("sin proxies"));
    const tabSrc = fs.readFileSync(path.resolve(__dirname, "../../../../components/comercial/store-intelligence-tab.tsx"), "utf8");
    assert.ok(!tabSrc.includes("profitability") && !tabSrc.includes("margen"), "rentabilidad visible sin fuente certificada");
  });
});

describe("formatos", () => {
  it("COP compacto es-CO", () => {
    assert.equal(fmtCop(128_400_000), "$128,4 M");
    assert.equal(fmtCop(103_000), "$103 k");
    assert.equal(fmtCop(850), "$850");
    assert.equal(fmtCop(-2_500_000), "−$2,5 M");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Guardianes fs — UX1..UX16 sobre PA + componente
// ═════════════════════════════════════════════════════════════════════════════

describe("guardianes UX (fs)", () => {
  const paSrc = fs.readFileSync(path.resolve(__dirname, "../store-intelligence-presentation-assembler.ts"), "utf8");
  const tabSrc = fs.readFileSync(path.resolve(__dirname, "../../../../components/comercial/store-intelligence-tab.tsx"), "utf8");
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");

  it("UX1: cero bloque de descuentos en el tab de Inteligencia", () => {
    for (const banned of ["descuento", "Descuento", "discount", "Discount", "markdown", "tier"]) {
      assert.ok(!strip(tabSrc).includes(banned), `patrón de descuentos en el tab: ${banned}`);
      assert.ok(!strip(paSrc).includes(banned), `patrón de descuentos en el PA: ${banned}`);
    }
  });

  it("UX2: cero matemática/formateo de negocio en React", () => {
    for (const banned of ["toLocaleString", ".toFixed(", "Math.", "* 100", "formatCurrency", "/ 7", "/ 30"]) {
      assert.ok(!strip(tabSrc).includes(banned), `matemática de negocio en el render: ${banned}`);
    }
  });

  it("UX13/UX3: cero años hardcodeados en PA y render", () => {
    for (const src of [paSrc, tabSrc]) {
      assert.ok(!/\b20[0-9]{2}\b/.test(strip(src)), "literal de año fuera de comentarios");
    }
  });

  it("UX14: cero raw hex en PA y render (solo tokens)", () => {
    for (const src of [paSrc, tabSrc]) {
      assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(strip(src)), "raw hex fuera de comentarios");
    }
  });

  it("UX9: imports del PA solo tipos de inteligencia (sin needs/coverage/inventory/motores)", () => {
    const imports = [...paSrc.matchAll(/from "([^"]+)"/g)].map(m => m[1]);
    // Set: el módulo de tipos aparece 2 veces (rankProducts — ley canónica pura — y los tipos)
    assert.deepEqual([...new Set(imports)], [
      "./store-certified-intelligence-types",
      "./store-product-intelligence-types",
    ]);
    for (const banned of ["store-unit-needs", "store-coverage", "snapshot-pipeline", "derrotero", "prisma", "server-only"]) {
      assert.ok(!paSrc.includes(banned), `import prohibido en el PA: ${banned}`);
    }
  });

  it("UX10: los charts consumen EXCLUSIVAMENTE el DTO del PA", () => {
    assert.ok(tabSrc.includes("pres.salesTrend.points"));
    assert.ok(tabSrc.includes("pres.hero.sparkline"));
    for (const banned of ["monthlySales", "netSales", "grossSales", "salesKpis", "certifiedIntel."]) {
      assert.ok(!strip(tabSrc).replace(/certifiedIntel(?=[,)\s}:])/g, "").includes(banned),
        `el render accede a campos crudos: ${banned}`);
    }
  });

  it("UX7: cero visibleCount hardcodeado en slices del render", () => {
    assert.ok(!/slice\(0,\s*(5|10)\)/.test(strip(tabSrc)), "slice con literal 5/10 en el render");
    assert.ok(tabSrc.includes("visibleCount.mobile") && tabSrc.includes("visibleCount.desktop"));
  });

  it("UX8: sin anchos fijos que desborden 390px ni overflow horizontal declarado", () => {
    assert.ok(!/(?<!max-)width:\s*[4-9][0-9]{2}/.test(strip(tabSrc)), "ancho fijo > 399px");
    assert.ok(!strip(tabSrc).includes("overflowX"), "overflow horizontal declarado");
  });

  it("UX12: cero conteo fijo de tiendas en el render", () => {
    assert.ok(!strip(tabSrc).includes("de 4"), "conteo de tiendas hardcodeado");
  });

  it("UX15: los tonos SIEMPRE viajan con texto/flecha (delta con signo, momentum con arrow)", () => {
    // El PA emite signo en fmtPct y arrow en momentum — verificado behavioralmente:
    assert.ok(PRES.hero.deltaText.startsWith("+") || PRES.hero.deltaText.startsWith("−") || PRES.hero.deltaText === "—");
    for (const d of PRES.momentum!.byUniverse.ALL.distribution) assert.ok(d.arrow.length > 0);
    for (const r of PRES.historicalGrowth.rows) {
      assert.ok(r.growthText === "—" || /^[+−]/.test(r.growthText));
    }
  });

  it("UX16: paridad desktop/mobile — mismas secciones desde el MISMO DTO", () => {
    // Cada card se define UNA vez y ambas composiciones la renderizan
    for (const card of ["heroCard", "readingCard", "trendCard", "benchmarkCard", "universeCard", "productsCard", "momentumCard", "noSalesCard", "linesCard", "historyCard", "accountingCard"]) {
      const uses = (strip(tabSrc).match(new RegExp(`\\b${card}\\b`, "g")) ?? []).length;
      assert.ok(uses >= 3, `${card} debe definirse una vez y usarse en AMBAS composiciones (usos=${uses})`);
    }
    // Un solo builder de DTO — jamás uno por viewport
    assert.equal((tabSrc.match(/buildStoreIntelligencePresentation\(/g) ?? []).length, 1); // un solo useMemo
  });

  it("PA puro: sin reloj, sin React, sin viewport", () => {
    for (const banned of ["new Date()", "Date.now()", "useState", "useEffect", "isMobile", "matchMedia"]) {
      assert.ok(!strip(paSrc).includes(banned), `patrón prohibido en el PA: ${banned}`);
    }
  });
});
