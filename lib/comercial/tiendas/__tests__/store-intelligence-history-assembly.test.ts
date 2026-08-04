/**
 * lib/comercial/tiendas/__tests__/store-intelligence-history-assembly.test.ts
 *
 * AGENTIK-STORES-INTELLIGENCE-HISTORY-BENCHMARK-01 — certificación de la ley
 * pura: serie histórica anual, comparación YTD same-cut, benchmark de red con
 * filas reales, freshness certificada — y guardianes fs (aislamiento por
 * organizationId, cero años hardcodeados, cero número fijo de tiendas,
 * cero N+1, viewport-agnostic).
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-intelligence-history-assembly.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  buildHistoricalSeries,
  buildNetworkBenchmark,
  buildCertifiedFreshness,
  sumNetByFamily,
  sameCutPreviousYear,
  formatCutLabel,
  DEFAULT_FRESHNESS_LAG_THRESHOLD_DAYS,
  type BenchmarkStoreInput,
} from "../store-intelligence-history-assembly";
import { assembleStoreSales, type StoreSalesRawRow } from "../store-sales-assembly";
import type { StoreSalesMonth } from "../store-sales-assembly";

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Mes sintético con la forma certificada de StoreSalesMonth. */
function mo(month: string, gross: number, credit: number, invoices: number, credits: number): StoreSalesMonth {
  return {
    month, label: month.slice(5, 7),
    invoices, credits,
    grossRev: gross, creditRev: -Math.abs(credit),
    revenue: gross - Math.abs(credit),
    posReceiptCount: 0, posReceiptRev: 0,
  };
}

/** Serie Gran-Plaza-like: parcial 2023 (desde marzo) + 2024 + 2025 + 2026 YTD. */
function granPlazaLike(): StoreSalesMonth[] {
  const months: StoreSalesMonth[] = [];
  // 2023: mar–dic (primer año PARCIAL), 10 meses × 6M
  for (let m = 3; m <= 12; m++) months.push(mo(`2023-${String(m).padStart(2, "0")}`, 6_000_000, 0, 60, 0));
  // 2024: completo, 12 × 8M
  for (let m = 1; m <= 12; m++) months.push(mo(`2024-${String(m).padStart(2, "0")}`, 8_000_000, 0, 80, 0));
  // 2025: completo, 12 × 10M
  for (let m = 1; m <= 12; m++) months.push(mo(`2025-${String(m).padStart(2, "0")}`, 10_000_000, 0, 100, 0));
  // 2026: ene–jul (YTD), 7 × 12M
  for (let m = 1; m <= 7; m++) months.push(mo(`2026-${String(m).padStart(2, "0")}`, 12_000_000, 0, 120, 0));
  return months;
}

const AS_OF = "2026-07-23";

// ═════════════════════════════════════════════════════════════════════════════
// Serie histórica
// ═════════════════════════════════════════════════════════════════════════════

describe("serie histórica anual", () => {
  const series = buildHistoricalSeries(granPlazaLike(), AS_OF, { netSales: 65_000_000, invoiceCount: 650, hasData: true });

  it("años dinámicos desde la primera fecha disponible, ascendentes", () => {
    assert.deepEqual(series.years.map(y => y.year), [2023, 2024, 2025, 2026]);
    assert.equal(series.firstDataDate, "2023-03-01");
  });

  it("primer año parcial: kind FIRST_PARTIAL, rango real, growth null", () => {
    const y2023 = series.years[0];
    assert.equal(y2023.kind, "FIRST_PARTIAL");
    assert.equal(y2023.dateFrom, "2023-03-01");
    assert.equal(y2023.dateTo, "2023-12-31");
    assert.equal(y2023.netSales, 60_000_000);
    assert.equal(y2023.growthPct, null);
    assert.equal(y2023.comparisonLabel, null);
  });

  it("año completo tras año PARCIAL: sin base comparable honesta (growth null)", () => {
    const y2024 = series.years[1];
    assert.equal(y2024.kind, "FULL_YEAR");
    assert.equal(y2024.netSales, 96_000_000);
    assert.equal(y2024.growthPct, null);           // 2023 es parcial — jamás comparar
  });

  it("año completo vs año completo: growth con denominador explícito", () => {
    const y2025 = series.years[2];
    assert.equal(y2025.kind, "FULL_YEAR");
    assert.equal(y2025.netSales, 120_000_000);
    assert.equal(y2025.growthPct, 25);             // 120M vs 96M
    assert.equal(y2025.comparisonLabel, "vs 2024");
    assert.equal(y2025.comparisonNetSales, 96_000_000);
  });

  it("YTD: comparación ESTRICTA contra el mismo corte del año anterior", () => {
    const y2026 = series.years[3];
    assert.equal(y2026.kind, "CURRENT_YTD");
    assert.equal(y2026.dateFrom, "2026-01-01");
    assert.equal(y2026.dateTo, AS_OF);
    assert.equal(y2026.netSales, 84_000_000);      // 7 × 12M
    // Base = same-cut SQL (65M), JAMÁS el 2025 completo (120M)
    assert.equal(y2026.comparisonNetSales, 65_000_000);
    assert.equal(y2026.growthPct, 29.23);          // (84-65)/65
    assert.equal(y2026.comparisonLabel, "vs ene–23 jul 2025");
  });

  it("bloque ytd explícito: rangos día a día — React jamás decide denominadores", () => {
    assert.ok(series.ytd);
    assert.equal(series.ytd!.currentFrom, "2026-01-01");
    assert.equal(series.ytd!.currentTo, "2026-07-23");
    assert.equal(series.ytd!.previousFrom, "2025-01-01");
    assert.equal(series.ytd!.previousTo, "2025-07-23");
    assert.equal(series.ytd!.currentNetSales, 84_000_000);
    assert.equal(series.ytd!.previousNetSales, 65_000_000);
    assert.equal(series.ytd!.comparisonLabel, "vs ene–23 jul 2025");
  });

  it("YTD sin base del año anterior: growth null pero fila presente", () => {
    const s = buildHistoricalSeries(granPlazaLike(), AS_OF, { netSales: 0, invoiceCount: 0, hasData: false });
    const y2026 = s.years.find(y => y.kind === "CURRENT_YTD")!;
    assert.equal(y2026.growthPct, null);
    assert.equal(s.ytd!.growthPct, null);
  });

  it("cambio de asOfDate reclasifica: en 2027, 2026 pasa a FULL_YEAR", () => {
    const months = [...granPlazaLike()];
    for (let m = 8; m <= 12; m++) months.push(mo(`2026-${String(m).padStart(2, "0")}`, 12_000_000, 0, 120, 0));
    months.push(mo("2027-01", 13_000_000, 0, 130, 0));
    const s = buildHistoricalSeries(months, "2027-03-15", { netSales: 20_000_000, invoiceCount: 200, hasData: true });
    const y2026 = s.years.find(y => y.year === 2026)!;
    assert.equal(y2026.kind, "FULL_YEAR");
    assert.equal(y2026.growthPct, 20);             // 144M vs 120M (2025 full)
    const y2027 = s.years.find(y => y.year === 2027)!;
    assert.equal(y2027.kind, "CURRENT_YTD");
    assert.equal(y2027.comparisonLabel, "vs ene–15 mar 2026");
  });

  it("tienda con inicio histórico diferente: primer año dinámico (2019)", () => {
    const months: StoreSalesMonth[] = [];
    for (let m = 5; m <= 12; m++) months.push(mo(`2019-${String(m).padStart(2, "0")}`, 1_000_000, 0, 10, 0));
    for (let m = 1; m <= 12; m++) months.push(mo(`2020-${String(m).padStart(2, "0")}`, 2_000_000, 0, 20, 0));
    const s = buildHistoricalSeries(months, "2020-12-31", null);
    assert.equal(s.firstDataDate, "2019-05-01");
    assert.equal(s.years[0].year, 2019);
    assert.equal(s.years[0].kind, "FIRST_PARTIAL");
    assert.equal(s.years[1].kind, "CURRENT_YTD");  // 2020 es el año de asOf
  });

  it("hueco de años: sin base (growth null) aunque ambos sean completos", () => {
    const months: StoreSalesMonth[] = [];
    for (let m = 1; m <= 12; m++) months.push(mo(`2022-${String(m).padStart(2, "0")}`, 5_000_000, 0, 50, 0));
    for (let m = 1; m <= 12; m++) months.push(mo(`2024-${String(m).padStart(2, "0")}`, 7_000_000, 0, 70, 0));
    const s = buildHistoricalSeries(months, "2025-06-30", null);
    const y2024 = s.years.find(y => y.year === 2024)!;
    assert.equal(y2024.growthPct, null);           // 2023 no existe — jamás saltar la base
  });

  it("GUARDIÁN FIXTURE NO-2026: asOf 2031 — contrato, labels y comparaciones correctos", () => {
    const months: StoreSalesMonth[] = [];
    for (let m = 2; m <= 12; m++) months.push(mo(`2029-${String(m).padStart(2, "0")}`, 4_000_000, 0, 40, 0));
    for (let m = 1; m <= 12; m++) months.push(mo(`2030-${String(m).padStart(2, "0")}`, 6_000_000, 0, 60, 0));
    for (let m = 1; m <= 8; m++) months.push(mo(`2031-${String(m).padStart(2, "0")}`, 9_000_000, 0, 90, 0));
    const s = buildHistoricalSeries(months, "2031-08-15", { netSales: 40_000_000, invoiceCount: 400, hasData: true });
    assert.deepEqual(s.years.map(y => [y.year, y.kind]), [
      [2029, "FIRST_PARTIAL"], [2030, "FULL_YEAR"], [2031, "CURRENT_YTD"],
    ]);
    assert.equal(s.ytd!.previousTo, "2030-08-15");
    assert.equal(s.years[2].comparisonLabel, "vs ene–15 ago 2030");
    assert.equal(s.years[2].growthPct, 80);        // 72M vs 40M
  });

  it("sin datos: serie vacía, ytd null, sin filas fabricadas", () => {
    const s = buildHistoricalSeries([], AS_OF, null);
    assert.equal(s.years.length, 0);
    assert.equal(s.ytd, null);
    assert.equal(s.firstDataDate, null);
  });
});

describe("same-cut helpers", () => {
  it("mismo corte día a día, año bisiesto 29 feb → 28 feb", () => {
    assert.equal(sameCutPreviousYear("2026-07-23"), "2025-07-23");
    assert.equal(sameCutPreviousYear("2028-02-29"), "2027-02-28");
    assert.equal(formatCutLabel("2025-07-23"), "23 jul 2025");
    assert.equal(formatCutLabel("2030-08-15"), "15 ago 2030");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// sumNetByFamily — la misma ley documental certificada
// ═════════════════════════════════════════════════════════════════════════════

describe("sumNetByFamily", () => {
  it("FACTURA suma, NOTA_CREDITO resta normalizada, RECAUDO_POS jamás entra", () => {
    const agg = sumNetByFamily([
      { code: "FG", docCount: 10, amount: 50_000_000 },   // factura Gran Plaza
      { code: "NG", docCount: 2, amount: 3_000_000 },     // nota almacenada POSITIVA → normaliza a resta
      { code: "RG", docCount: 30, amount: 90_000_000 },   // recaudo POS — excluido
      { code: "FC", docCount: 5, amount: 20_000_000 },    // factura CENTRO — otra tienda
    ], "gran_plaza");
    assert.equal(agg.netSales, 47_000_000);
    assert.equal(agg.invoiceCount, 10);
    assert.equal(agg.creditNoteCount, 2);
    assert.equal(agg.hasData, true);
  });

  it("sin storeId filtra solo por 'es tienda' (para agregados de red)", () => {
    const agg = sumNetByFamily([
      { code: "FG", docCount: 1, amount: 10 },
      { code: "FC", docCount: 1, amount: 20 },
      { code: "FE", docCount: 1, amount: 999 },           // EMPRESA — jamás
    ]);
    assert.equal(agg.netSales, 30);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Benchmark de red
// ═════════════════════════════════════════════════════════════════════════════

describe("benchmark de red con filas reales", () => {
  const inputs: BenchmarkStoreInput[] = [
    { storeId: "centro", storeName: "Centro", netSales: 190_000_000, invoiceCount: 1900 },
    { storeId: "caldas", storeName: "Caldas", netSales: 152_000_000, invoiceCount: 1500 },
    { storeId: "gran_plaza", storeName: "Gran Plaza", netSales: 128_000_000, invoiceCount: 1240 },
    { storeId: "san_diego", storeName: "San Diego", netSales: 95_000_000, invoiceCount: 900 },
  ];
  const bm = buildNetworkBenchmark("gran_plaza", inputs, "2026-01-01", AS_OF);

  it("stores[] ordenadas DESC con posición, share y current store identificada", () => {
    assert.deepEqual(bm.stores.map(s => s.storeId), ["centro", "caldas", "gran_plaza", "san_diego"]);
    assert.deepEqual(bm.stores.map(s => s.position), [1, 2, 3, 4]);
    assert.equal(bm.stores.filter(s => s.isCurrentStore).length, 1);
    assert.equal(bm.stores[2].isCurrentStore, true);
    assert.equal(bm.position, 3);
  });

  it("promedio, participación y deltas con el mismo período exacto", () => {
    assert.equal(bm.networkTotal, 565_000_000);
    assert.equal(bm.networkAverage, 141_250_000);
    assert.equal(bm.shareOfNetworkPct, 22.65);
    assert.equal(bm.deltaVsNetworkAveragePct, -9.38);     // (128-141.25)/141.25
    assert.equal(bm.deltaVsLeaderPct, -32.63);            // (128-190)/190
    assert.equal(bm.leaderStoreId, "centro");
    assert.equal(bm.periodFrom, "2026-01-01");
    assert.equal(bm.periodTo, AS_OF);
  });

  it("N tiendas dinámicas: 6 entradas → 6 filas, totalActiveStores 6", () => {
    const six = [...inputs,
      { storeId: "envigado", storeName: "Envigado", netSales: 50_000_000, invoiceCount: 500 },
      { storeId: "bello", storeName: "Bello", netSales: 40_000_000, invoiceCount: 400 },
    ];
    const b6 = buildNetworkBenchmark("bello", six, "2026-01-01", AS_OF);
    assert.equal(b6.totalActiveStores, 6);
    assert.equal(b6.stores.length, 6);
    assert.equal(b6.position, 6);
  });

  it("la tienda líder: deltaVsLeader = 0, posición 1", () => {
    const b = buildNetworkBenchmark("centro", inputs, "2026-01-01", AS_OF);
    assert.equal(b.position, 1);
    assert.equal(b.deltaVsLeaderPct, 0);
  });

  it("red vacía o en cero: deltas null, jamás NaN/Infinity", () => {
    const b = buildNetworkBenchmark("x", [], "2026-01-01", AS_OF);
    assert.equal(b.totalActiveStores, 0);
    assert.equal(b.deltaVsNetworkAveragePct, null);
    assert.equal(b.deltaVsLeaderPct, null);
    const bz = buildNetworkBenchmark("a", [{ storeId: "a", storeName: "A", netSales: 0, invoiceCount: 0 }], "2026-01-01", AS_OF);
    assert.equal(bz.deltaVsNetworkAveragePct, null);
    assert.equal(bz.deltaVsLeaderPct, null);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Freshness certificada
// ═════════════════════════════════════════════════════════════════════════════

describe("freshness certificada", () => {
  it("READY: datos de tienda + lag dentro del umbral", () => {
    const f = buildCertifiedFreshness({
      storeFirstSaleDate: "2023-03-04", networkLastSaleDate: "2026-07-21", asOfDate: "2026-07-23",
    });
    assert.equal(f.dataStatus, "READY");
    assert.equal(f.dataStartDate, "2023-03-04");
    assert.equal(f.syncedThroughDate, "2026-07-21");
    assert.equal(f.dataLagDays, 2);
  });

  it("PARTIAL_DATA: lag por encima del umbral", () => {
    const f = buildCertifiedFreshness({
      storeFirstSaleDate: "2023-03-04", networkLastSaleDate: "2026-07-10", asOfDate: "2026-07-23",
    });
    assert.equal(f.dataLagDays, 13);
    assert.ok(13 > DEFAULT_FRESHNESS_LAG_THRESHOLD_DAYS);
    assert.equal(f.dataStatus, "PARTIAL_DATA");
  });

  it("NOT_SYNCED: red sin ventas — jamás $0 fingiendo verdad", () => {
    const f = buildCertifiedFreshness({ storeFirstSaleDate: null, networkLastSaleDate: null, asOfDate: AS_OF });
    assert.equal(f.dataStatus, "NOT_SYNCED");
    assert.equal(f.syncedThroughDate, null);
    assert.equal(f.dataLagDays, null);
  });

  it("NO_DATA: red sincronizada pero la tienda sin filas", () => {
    const f = buildCertifiedFreshness({ storeFirstSaleDate: null, networkLastSaleDate: "2026-07-21", asOfDate: AS_OF });
    assert.equal(f.dataStatus, "NO_DATA");
    assert.equal(f.syncedThroughDate, "2026-07-21");
  });

  it("umbral configurable", () => {
    const f = buildCertifiedFreshness({
      storeFirstSaleDate: "2024-01-01", networkLastSaleDate: "2026-07-20", asOfDate: "2026-07-23",
      lagThresholdDays: 1,
    });
    assert.equal(f.dataStatus, "PARTIAL_DATA");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Integración con la ley documental certificada (assembleStoreSales)
// ═════════════════════════════════════════════════════════════════════════════

describe("integración: filas crudas multi-año → serie (misma ley documental)", () => {
  it("assembleStoreSales sobre filas de varios años alimenta la serie sin re-clasificar", () => {
    const rows: StoreSalesRawRow[] = [
      { month: "2024-05", code: "FG", docCount: 10, amount: 8_000_000 },
      { month: "2024-05", code: "NG", docCount: 1, amount: -500_000 },
      { month: "2024-05", code: "RG", docCount: 20, amount: 9_999_999 },  // POS: fuera del revenue
      { month: "2025-02", code: "FG", docCount: 12, amount: 9_000_000 },
    ];
    const assembled = assembleStoreSales("gran_plaza", 2025, rows)!;
    const s = buildHistoricalSeries(assembled.monthly, "2025-06-30", null);
    assert.equal(s.years.length, 2);
    assert.equal(s.years[0].year, 2024);
    assert.equal(s.years[0].netSales, 7_500_000);
    assert.equal(s.years[1].kind, "CURRENT_YTD");
    assert.equal(s.years[1].netSales, 9_000_000);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Guardianes fs
// ═════════════════════════════════════════════════════════════════════════════

describe("guardianes fs (HISTORY-BENCHMARK-01)", () => {
  const assemblySrc = fs.readFileSync(path.resolve(__dirname, "../store-intelligence-history-assembly.ts"), "utf8");
  const serviceSrc = fs.readFileSync(path.resolve(__dirname, "../store-intelligence-history-service.ts"), "utf8");

  it("aislamiento multi-tenant: TODA query filtra por organizationId", () => {
    const queries = serviceSrc.split("$queryRawUnsafe").slice(1);
    assert.equal(queries.length, 4, "exactamente 4 queries (conteo constante)");
    for (const q of queries) {
      assert.ok(q.includes('"organizationId" = $1'), "query sin filtro de organización");
    }
  });

  it("cero N+1: sin query-por-tienda ni query-por-año", () => {
    assert.ok(!serviceSrc.includes("CANONICAL_SALES_STORES.map(s => load"), "carga por tienda prohibida");
    assert.ok(!/for\s*\([\s\S]*?\$queryRawUnsafe/.test(serviceSrc), "queries en loop prohibidas");
  });

  it("cero años hardcodeados en la ley nueva", () => {
    for (const src of [assemblySrc, serviceSrc]) {
      assert.ok(!/\b20[0-9]{2}\b/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")),
        "literal de año en código (fuera de comentarios)");
    }
  });

  it("cero número fijo de tiendas (sin fallback '|| 4' ni conteos fijos)", () => {
    assert.ok(!assemblySrc.includes("|| 4") && !serviceSrc.includes("|| 4"));
    assert.ok(!assemblySrc.includes("totalActiveStores: 4"));
  });

  it("viewport-agnostic: cero isMobile/breakpoint/viewport en dominio", () => {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    for (const banned of ["isMobile", "breakpoint", "viewport", "window.", "innerWidth"]) {
      assert.ok(!strip(assemblySrc).includes(banned) && !strip(serviceSrc).includes(banned), `patrón prohibido: ${banned}`);
    }
  });

  it("la ley pura no lee el reloj: asOfDate siempre paramétrico en assembly", () => {
    assert.ok(!assemblySrc.includes("new Date()"), "assembly jamás lee el reloj");
    assert.ok(!assemblySrc.includes("Date.now()"), "assembly jamás lee el reloj");
  });
});
