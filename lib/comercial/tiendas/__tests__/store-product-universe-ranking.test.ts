/**
 * lib/comercial/tiendas/__tests__/store-product-universe-ranking.test.ts
 *
 * AGENTIK-STORES-PRODUCT-INTELLIGENCE-UNIVERSE-RANKING-01 — certificación de
 * la ley canónica de ranking (rankProducts) + guardianes fs del contrato:
 * cero queries por universo, cero heurísticas, cero clamps nuevos, ley única.
 *
 * U1–U4 y U6(PA) viven en store-intelligence-presentation-assembler.test.ts
 * (fixture obligatorio: Top global dominado por Importación).
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-product-universe-ranking.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

import { rankProducts } from "../store-product-intelligence-types";
import type { AggregatedProductEntry } from "../store-product-intelligence-types";

function mkAgg(over: Partial<AggregatedProductEntry> & { referenceCode: string }): AggregatedProductEntry {
  return {
    productName: `P ${over.referenceCode}`,
    heroImageUrl: null,
    lineaSag: null,
    grupoSag: null,
    subgrupoSag: null,
    netUnits: 10,
    netRevenue: 100_000,
    invoiceCount: 1,
    lastSaleDate: "2026-07-01",
    shareOfStoreRevenuePct: 1,
    ...over,
  };
}

const engineSrc = fs.readFileSync(path.resolve(__dirname, "../store-product-intelligence-engine.ts"), "utf8");
const typesSrc = fs.readFileSync(path.resolve(__dirname, "../store-product-intelligence-types.ts"), "utf8");
const paSrc = fs.readFileSync(path.resolve(__dirname, "../store-intelligence-presentation-assembler.ts"), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");

describe("ley canónica de ranking (SORTING LAW §5)", () => {
  it("unidades: netUnits DESC → netRevenue DESC → referenceCode ASC", () => {
    const entries = [
      mkAgg({ referenceCode: "B", netUnits: 100, netRevenue: 500_000 }),
      mkAgg({ referenceCode: "A", netUnits: 100, netRevenue: 700_000 }),
      mkAgg({ referenceCode: "C", netUnits: 120, netRevenue: 100_000 }),
    ];
    assert.deepEqual(rankProducts(entries, "netUnits", 10).map(e => e.referenceCode), ["C", "A", "B"]);
  });

  it("ventas: netRevenue DESC → netUnits DESC → referenceCode ASC", () => {
    const entries = [
      mkAgg({ referenceCode: "B", netUnits: 10, netRevenue: 500_000 }),
      mkAgg({ referenceCode: "A", netUnits: 90, netRevenue: 500_000 }),
      mkAgg({ referenceCode: "C", netUnits: 5, netRevenue: 900_000 }),
    ];
    assert.deepEqual(rankProducts(entries, "netRevenue", 10).map(e => e.referenceCode), ["C", "A", "B"]);
  });

  it("U5: empate total determinista — referenceCode ASC, byte a byte reproducible", () => {
    const entries = [
      mkAgg({ referenceCode: "ZZZ", netUnits: 100, netRevenue: 500_000 }),
      mkAgg({ referenceCode: "AAA", netUnits: 100, netRevenue: 500_000 }),
      mkAgg({ referenceCode: "MMM", netUnits: 100, netRevenue: 500_000 }),
    ];
    const run1 = rankProducts(entries, "netUnits", 10).map(e => e.referenceCode);
    const run2 = rankProducts([...entries].reverse(), "netUnits", 10).map(e => e.referenceCode);
    assert.deepEqual(run1, ["AAA", "MMM", "ZZZ"]);
    assert.deepEqual(run2, run1);   // el orden de entrada NO altera el ranking
  });

  it("U6: N configurable — topN exacto, rank 1..N; topN=0 → vacío", () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      mkAgg({ referenceCode: `R-${i}`, netUnits: 100 - i, netRevenue: (100 - i) * 1000 }));
    const top2 = rankProducts(entries, "netUnits", 2);
    assert.equal(top2.length, 2);
    assert.deepEqual(top2.map(e => e.rank), [1, 2]);
    assert.equal(rankProducts(entries, "netUnits", 0).length, 0);
  });

  it("U7: NC sigue reduciendo el net — la ley consume net verbatim y el engine lo computa invoice − NC", () => {
    // rankProducts recibe net post-NC y NO lo recalcula ni lo altera
    const entries = [
      mkAgg({ referenceCode: "SIN-NC", netUnits: 40, netRevenue: 400_000 }),
      mkAgg({ referenceCode: "CON-NC", netUnits: 45, netRevenue: 450_000 }),  // p.ej. 60 fact − 15 NC
    ];
    const top = rankProducts(entries, "netUnits", 10);
    assert.equal(top[0].referenceCode, "CON-NC");
    assert.equal(top[0].netUnits, 45);              // verbatim — sin re-normalización
    // Guardián fs: la normalización NC vive UNA vez, en el agregado SQL del engine
    assert.ok(engineSrc.includes('Number(r.invoiceUnits) - Number(r.creditNoteUnits)'), "netUnits = invoice − NC en el engine");
    assert.ok(engineSrc.includes('Number(r.invoiceTotal) - Number(r.creditNoteTotal)'), "netRevenue = invoice − NC en el engine");
  });

  it("U8: tratamiento zero/negativo INTACTO — excluido solo de la dimensión rankeada, sin clamps nuevos", () => {
    const entries = [
      mkAgg({ referenceCode: "POS", netUnits: 10, netRevenue: 100_000 }),
      mkAgg({ referenceCode: "NEG-REV", netUnits: 8, netRevenue: -50_000 }),   // NC > facturación
      mkAgg({ referenceCode: "NEG-UNITS", netUnits: -3, netRevenue: 30_000 }),
      mkAgg({ referenceCode: "ZERO", netUnits: 0, netRevenue: 0 }),
    ];
    const units = rankProducts(entries, "netUnits", 10).map(e => e.referenceCode);
    const revenue = rankProducts(entries, "netRevenue", 10).map(e => e.referenceCode);
    assert.deepEqual(units, ["POS", "NEG-REV"]);        // negativo en ventas SÍ rankea en unidades
    assert.deepEqual(revenue, ["POS", "NEG-UNITS"]);    // negativo en unidades SÍ rankea en ventas
    // La colección agregada conserva negativos verbatim (sin Math.max/clamp en el builder)
    const builder = engineSrc.slice(engineSrc.indexOf("function buildAggregatedProducts"), engineSrc.indexOf("function buildSalesRates"));
    assert.ok(builder.includes("netUnits: a.netUnits") && builder.includes("netRevenue: a.netRevenue"), "net verbatim en aggregatedProducts");
    assert.ok(!builder.includes("Math.max(0, a.netUnits)") && !builder.includes("Math.max(0, a.netRevenue)"), "clamp nuevo prohibido");
  });

  it("la ley vive UNA sola vez — el engine y el PA la INVOCAN, jamás la duplican", () => {
    assert.equal((typesSrc.match(/export function rankProducts\(/g) ?? []).length, 1);
    assert.ok(engineSrc.includes('rankProducts(aggregatedProducts, "netUnits", topN)'));
    assert.ok(engineSrc.includes('rankProducts(aggregatedProducts, "netRevenue", topN)'));
    assert.ok(paSrc.includes("rankProducts("), "el PA invoca la ley canónica");
    // Ni engine ni PA re-implementan la ley (elegibilidad + desempate secundario)
    assert.ok(!engineSrc.includes("function buildTopProducts"), "buildTopProducts duplicado en el engine");
    for (const src of [strip(engineSrc), strip(paSrc)]) {
      assert.ok(!src.includes("const secondary = sortBy"), "desempate de ranking duplicado fuera de la ley");
      assert.ok(!src.includes("a.netUnits > 0 : a.netRevenue > 0"), "elegibilidad de ranking duplicada fuera de la ley");
    }
  });
});

describe("guardianes del contrato (U9/U10)", () => {
  it("U9: cero heurísticas — el universo NO existe en engine/types (solo taxonomía en el PA)", () => {
    // El concepto visual Textil/Importación NO se filtró al dominio del engine
    for (const banned of ['"TEXTILE"', '"IMPORT"', "Textil", "Importación"]) {
      assert.ok(!strip(engineSrc).includes(banned), `semántica de universo en el engine: ${banned}`);
      assert.ok(!strip(typesSrc).includes(banned), `semántica de universo en types: ${banned}`);
    }
    // La ley de ranking no clasifica: sin regex, sin nombres, sin listas de referencias
    const law = typesSrc.slice(typesSrc.indexOf("export function rankProducts"), typesSrc.indexOf("export interface SalesRateEntry"));
    assert.ok(!/\.(match|test|exec)\(/.test(law), "regex en la ley de ranking");
    assert.ok(!law.includes("productName"), "clasificación por nombre en la ley");
  });

  it("U10: CERO queries adicionales por universo — mismo set de datos, ranking en memoria", () => {
    // Los agregados SQL siguen siendo exactamente los mismos 4 raw + wiring previo
    assert.equal((engineSrc.match(/\$queryRawUnsafe/g) ?? []).length, 3, "número de raw SQL inalterado (aggregates/coverage/stock)");
    assert.equal((engineSrc.match(/loadAggregatesForWindow\(/g) ?? []).length, 7, "1 definición + 6 llamadas — sin ventana nueva");
    assert.equal((engineSrc.match(/trackQuery\(/g) ?? []).length, 9, "9 queries tracked — igual que antes del sprint");
    // aggregatedProducts nace de commercialPrimary (ya en memoria), jamás de una query propia
    assert.ok(engineSrc.includes("buildAggregatedProducts(commercialPrimary, enrichment"));
  });
});
