/**
 * _sag-catalog-commercial-analysis.ts
 *
 * SAG-CATALOG-COMERCIAL-FILTER-02 — Full forensic analysis of ARTICULOS.
 *
 * Phases 1-8: Distribution analysis, ranking, price analysis, commercial
 * identification, variant analysis, rule proposal, and sample validation.
 *
 * READ ONLY — never writes to any table.
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/_sag-catalog-commercial-analysis.ts
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import { QUERY_CATALOG }   from "@/lib/connectors/adapters/sag-pya-soap/query-catalog";
import type { PyaApiConfig } from "@/lib/connectors/pya/types";

// ── Terminal formatting ─────────────────────────────────────────────────────

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;
const C = (s: string) => `\x1b[36m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;

function pct(n: number, total: number): string {
  return total > 0 ? ((n / total) * 100).toFixed(1) + "%" : "—";
}

function bar(n: number, total: number, width = 30): string {
  const filled = total > 0 ? Math.round((n / total) * width) : 0;
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function pad(s: string, n: number): string {
  return s.padEnd(n);
}

function rpad(s: string, n: number): string {
  return s.padStart(n);
}

// ── Types ───────────────────────────────────────────────────────────────────

interface RawArticle {
  [key: string]: unknown;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function bool(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === "S" || v === "s";
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const token = (process.env.PYA_SOAP_TOKEN ?? process.env.SAG_TEST_TOKEN ?? "").trim();
  const database = (process.env.PYA_SAG_BD ?? "").trim() || undefined;
  const endpoint = process.env.PYA_SOAP_ENDPOINT?.trim() ??
    "http://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap";

  if (!token) {
    console.error(R("ERROR: PYA_SOAP_TOKEN or SAG_TEST_TOKEN required."));
    process.exit(1);
  }

  const config: PyaApiConfig = { token, endpointUrl: endpoint, database };

  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log(B("  SAG-CATALOG-COMERCIAL-FILTER-02"));
  console.log(B("  Análisis Forense del Catálogo ARTICULOS — Castillitos"));
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log("");

  // ── Fetch ─────────────────────────────────────────────────────────────────

  console.log(B("  Fetching ARTICULOS from SAG..."));
  const t0 = Date.now();
  const rawRows = await consultaSagJson(config, QUERY_CATALOG.articles.all.query) as RawArticle[];
  console.log(G(`  ✓ ${rawRows.length} rows in ${Date.now() - t0}ms`));
  console.log("");

  // Filter out the 1 row without CODIGO
  const rows = rawRows.filter(r => str(r.k_sc_codigo_articulo) !== "");
  const total = rows.length;

  // ═════════════════════════════════════════════════════════════════════════
  // FASE 1 — DISTRIBUCIÓN COMPLETA DE CAMPOS CLAVE
  // ═════════════════════════════════════════════════════════════════════════

  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log(B("  FASE 1 — DISTRIBUCIÓN DE CAMPOS CLAVE"));
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log("");

  // k_sc_clase_articulo
  const claseMap = new Map<string, number>();
  for (const r of rows) {
    const v = str(r.k_sc_clase_articulo) || "(vacío)";
    claseMap.set(v, (claseMap.get(v) ?? 0) + 1);
  }
  console.log(B("  k_sc_clase_articulo (Clase de artículo):"));
  for (const [k, v] of Array.from(claseMap.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${pad(k, 10)} ${rpad(String(v), 6)} ${rpad(pct(v, total), 7)} ${bar(v, total, 25)}`);
  }
  console.log("");

  // sc_activo
  const activoMap = new Map<string, number>();
  for (const r of rows) {
    const v = str(r.sc_activo) || "(vacío)";
    activoMap.set(v, (activoMap.get(v) ?? 0) + 1);
  }
  console.log(B("  sc_activo:"));
  for (const [k, v] of Array.from(activoMap.entries()).sort((a, b) => b[1] - a[1])) {
    const color = k === "S" ? G : k === "N" ? R : Y;
    console.log(`    ${color(pad(k, 10))} ${rpad(String(v), 6)} ${rpad(pct(v, total), 7)}`);
  }
  console.log("");

  // sc_bloqueado
  const bloqMap = new Map<string, number>();
  for (const r of rows) {
    const v = str(r.sc_bloqueado) || "(vacío)";
    bloqMap.set(v, (bloqMap.get(v) ?? 0) + 1);
  }
  console.log(B("  sc_bloqueado:"));
  for (const [k, v] of Array.from(bloqMap.entries()).sort((a, b) => b[1] - a[1])) {
    const color = k === "N" ? G : R;
    console.log(`    ${color(pad(k, 10))} ${rpad(String(v), 6)} ${rpad(pct(v, total), 7)}`);
  }
  console.log("");

  // sc_maneja_tallas
  const tallasMap = new Map<string, number>();
  for (const r of rows) {
    const v = str(r.sc_maneja_tallas) || "(vacío)";
    tallasMap.set(v, (tallasMap.get(v) ?? 0) + 1);
  }
  console.log(B("  sc_maneja_tallas:"));
  for (const [k, v] of Array.from(tallasMap.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${pad(k, 10)} ${rpad(String(v), 6)} ${rpad(pct(v, total), 7)}`);
  }
  console.log("");

  // sc_maneja_kardex
  const kardexMap = new Map<string, number>();
  for (const r of rows) {
    const v = str(r.sc_maneja_kardex) || "(vacío)";
    kardexMap.set(v, (kardexMap.get(v) ?? 0) + 1);
  }
  console.log(B("  sc_maneja_kardex:"));
  for (const [k, v] of Array.from(kardexMap.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${pad(k, 10)} ${rpad(String(v), 6)} ${rpad(pct(v, total), 7)}`);
  }
  console.log("");

  // n_valor_venta_normal ranges
  const prices = rows.map(r => num(r.n_valor_venta_normal));
  const priceZero = prices.filter(p => p === 0).length;
  const price1_999 = prices.filter(p => p > 0 && p < 1000).length;
  const price1k_10k = prices.filter(p => p >= 1000 && p < 10000).length;
  const price10k_50k = prices.filter(p => p >= 10000 && p < 50000).length;
  const price50k_100k = prices.filter(p => p >= 50000 && p < 100000).length;
  const price100k = prices.filter(p => p >= 100000).length;

  console.log(B("  n_valor_venta_normal (Precio de venta):"));
  console.log(`    ${pad("= 0", 15)} ${rpad(String(priceZero), 6)} ${rpad(pct(priceZero, total), 7)} ${bar(priceZero, total, 25)}`);
  console.log(`    ${pad("1 – 999", 15)} ${rpad(String(price1_999), 6)} ${rpad(pct(price1_999, total), 7)} ${bar(price1_999, total, 25)}`);
  console.log(`    ${pad("1k – 10k", 15)} ${rpad(String(price1k_10k), 6)} ${rpad(pct(price1k_10k, total), 7)} ${bar(price1k_10k, total, 25)}`);
  console.log(`    ${pad("10k – 50k", 15)} ${rpad(String(price10k_50k), 6)} ${rpad(pct(price10k_50k, total), 7)} ${bar(price10k_50k, total, 25)}`);
  console.log(`    ${pad("50k – 100k", 15)} ${rpad(String(price50k_100k), 6)} ${rpad(pct(price50k_100k, total), 7)} ${bar(price50k_100k, total, 25)}`);
  console.log(`    ${pad("> 100k", 15)} ${rpad(String(price100k), 6)} ${rpad(pct(price100k, total), 7)} ${bar(price100k, total, 25)}`);
  console.log("");

  // ═════════════════════════════════════════════════════════════════════════
  // FASE 2 — RANKING DE GRUPOS
  // ═════════════════════════════════════════════════════════════════════════

  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log(B("  FASE 2 — RANKING DE GRUPOS (ka_ni_grupo)"));
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log("");

  const grupoMap = new Map<string, { count: number; withPrice: number; withTalla: number; sampleDescs: string[] }>();
  for (const r of rows) {
    const g = str(r.ka_ni_grupo) || "(vacío)";
    if (!grupoMap.has(g)) grupoMap.set(g, { count: 0, withPrice: 0, withTalla: 0, sampleDescs: [] });
    const entry = grupoMap.get(g)!;
    entry.count++;
    if (num(r.n_valor_venta_normal) > 0) entry.withPrice++;
    if (bool(r.sc_maneja_tallas)) entry.withTalla++;
    if (entry.sampleDescs.length < 3) {
      const desc = str(r.sc_detalle_articulo);
      if (desc) entry.sampleDescs.push(desc.slice(0, 40));
    }
  }

  const grupoRanking = Array.from(grupoMap.entries()).sort((a, b) => b[1].count - a[1].count);

  console.log(`  ${pad("Grupo", 8)} ${rpad("Cant", 7)} ${rpad("%", 7)} ${rpad("c/Precio", 9)} ${rpad("c/Talla", 8)} Ejemplos`);
  console.log(`  ${"─".repeat(90)}`);
  for (const [g, v] of grupoRanking) {
    const samples = v.sampleDescs.join(" | ");
    console.log(`  ${pad(g, 8)} ${rpad(String(v.count), 7)} ${rpad(pct(v.count, total), 7)} ${rpad(String(v.withPrice), 9)} ${rpad(String(v.withTalla), 8)} ${D(samples)}`);
  }
  console.log("");

  // ═════════════════════════════════════════════════════════════════════════
  // FASE 3 — RANKING DE LÍNEAS
  // ═════════════════════════════════════════════════════════════════════════

  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log(B("  FASE 3 — RANKING DE LÍNEAS (ka_nl_linea)"));
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log("");

  const lineaMap = new Map<string, { count: number; withPrice: number; withTalla: number; sampleDescs: string[] }>();
  for (const r of rows) {
    const l = str(r.ka_nl_linea) || "(sin línea)";
    if (!lineaMap.has(l)) lineaMap.set(l, { count: 0, withPrice: 0, withTalla: 0, sampleDescs: [] });
    const entry = lineaMap.get(l)!;
    entry.count++;
    if (num(r.n_valor_venta_normal) > 0) entry.withPrice++;
    if (bool(r.sc_maneja_tallas)) entry.withTalla++;
    if (entry.sampleDescs.length < 3) {
      const desc = str(r.sc_detalle_articulo);
      if (desc) entry.sampleDescs.push(desc.slice(0, 40));
    }
  }

  const lineaRanking = Array.from(lineaMap.entries()).sort((a, b) => b[1].count - a[1].count);

  console.log(`  ${pad("Línea", 12)} ${rpad("Cant", 7)} ${rpad("%", 7)} ${rpad("c/Precio", 9)} ${rpad("c/Talla", 8)} Ejemplos`);
  console.log(`  ${"─".repeat(90)}`);
  for (const [l, v] of lineaRanking) {
    const samples = v.sampleDescs.join(" | ");
    console.log(`  ${pad(l, 12)} ${rpad(String(v.count), 7)} ${rpad(pct(v.count, total), 7)} ${rpad(String(v.withPrice), 9)} ${rpad(String(v.withTalla), 8)} ${D(samples)}`);
  }
  console.log("");

  // ═════════════════════════════════════════════════════════════════════════
  // FASE 4 — ANÁLISIS DE PRECIOS
  // ═════════════════════════════════════════════════════════════════════════

  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log(B("  FASE 4 — ANÁLISIS DE PRECIOS"));
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log("");

  const withPrice = rows.filter(r => num(r.n_valor_venta_normal) > 0);
  const noPrice = rows.filter(r => num(r.n_valor_venta_normal) === 0);

  console.log(`  Precio = 0:   ${R(rpad(String(noPrice.length), 6))} ${rpad(pct(noPrice.length, total), 7)} ${bar(noPrice.length, total, 30)}`);
  console.log(`  Precio > 0:   ${G(rpad(String(withPrice.length), 6))} ${rpad(pct(withPrice.length, total), 7)} ${bar(withPrice.length, total, 30)}`);
  console.log("");

  // Price stats for articles with price > 0
  if (withPrice.length > 0) {
    const pricedValues = withPrice.map(r => num(r.n_valor_venta_normal)).sort((a, b) => a - b);
    const min = pricedValues[0];
    const max = pricedValues[pricedValues.length - 1];
    const median = pricedValues[Math.floor(pricedValues.length / 2)];
    const avg = pricedValues.reduce((a, b) => a + b, 0) / pricedValues.length;

    console.log(`  Artículos con precio > 0:`);
    console.log(`    Mínimo:   $${min.toLocaleString("es-CO")}`);
    console.log(`    Máximo:   $${max.toLocaleString("es-CO")}`);
    console.log(`    Mediana:  $${median.toLocaleString("es-CO")}`);
    console.log(`    Promedio: $${Math.round(avg).toLocaleString("es-CO")}`);
    console.log("");
  }

  // Cross: price vs clase
  console.log(B("  Precio × Clase de artículo:"));
  for (const [clase, count] of Array.from(claseMap.entries()).sort((a, b) => b[1] - a[1])) {
    const claseRows = rows.filter(r => (str(r.k_sc_clase_articulo) || "(vacío)") === clase);
    const cp = claseRows.filter(r => num(r.n_valor_venta_normal) > 0).length;
    console.log(`    ${pad(clase, 10)} total: ${rpad(String(count), 6)} con precio: ${G(rpad(String(cp), 5))} sin precio: ${R(rpad(String(count - cp), 5))}`);
  }
  console.log("");

  // ═════════════════════════════════════════════════════════════════════════
  // FASE 5 — PRODUCTOS VENDIBLES
  // ═════════════════════════════════════════════════════════════════════════

  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log(B("  FASE 5 — IDENTIFICACIÓN DE PRODUCTOS VENDIBLES"));
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log("");

  const vendibles = rows.filter(r =>
    bool(r.sc_activo) &&
    !bool(r.sc_bloqueado) &&
    num(r.n_valor_venta_normal) > 0
  );

  console.log(`  Criterio: activo=S AND bloqueado=N AND precio>0`);
  console.log("");
  console.log(`  Total catálogo:       ${C(String(total))}`);
  console.log(`  Vendibles:            ${G(String(vendibles.length))} (${pct(vendibles.length, total)})`);
  console.log(`  No vendibles:         ${R(String(total - vendibles.length))} (${pct(total - vendibles.length, total)})`);
  console.log("");

  // Breakdown of why non-vendible
  const notActive = rows.filter(r => !bool(r.sc_activo)).length;
  const isBlocked = rows.filter(r => bool(r.sc_bloqueado)).length;
  const activeUnblockedNoPrice = rows.filter(r =>
    bool(r.sc_activo) && !bool(r.sc_bloqueado) && num(r.n_valor_venta_normal) === 0
  ).length;

  console.log(`  Desglose de exclusión:`);
  console.log(`    Inactivos (sc_activo=N):                ${R(String(notActive))}`);
  console.log(`    Bloqueados (sc_bloqueado=S):             ${R(String(isBlocked))}`);
  console.log(`    Activos sin precio (precio=0):           ${Y(String(activeUnblockedNoPrice))}`);
  console.log("");

  // Vendibles by clase
  console.log(B("  Vendibles × Clase:"));
  for (const [clase, _count] of Array.from(claseMap.entries()).sort((a, b) => b[1] - a[1])) {
    const claseVendibles = vendibles.filter(r => (str(r.k_sc_clase_articulo) || "(vacío)") === clase);
    console.log(`    ${pad(clase, 10)} ${G(rpad(String(claseVendibles.length), 6))} vendibles`);
  }
  console.log("");

  // Additional filter: sc_maneja_kardex = S (tracks inventory)
  const vendiblesKardex = vendibles.filter(r => bool(r.sc_maneja_kardex));
  console.log(`  Vendibles + maneja_kardex=S: ${C(String(vendiblesKardex.length))} (${pct(vendiblesKardex.length, vendibles.length)} de vendibles)`);
  console.log("");

  // ═════════════════════════════════════════════════════════════════════════
  // FASE 6 — ANÁLISIS DE VARIANTES
  // ═════════════════════════════════════════════════════════════════════════

  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log(B("  FASE 6 — ANÁLISIS DE VARIANTES (sobre vendibles)"));
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log("");

  const vWithTalla = vendibles.filter(r => bool(r.sc_maneja_tallas));
  const vSimple = vendibles.filter(r => !bool(r.sc_maneja_tallas));

  console.log(`  Vendibles totales:           ${C(String(vendibles.length))}`);
  console.log(`  Con talla/color:             ${Y(String(vWithTalla.length))} (${pct(vWithTalla.length, vendibles.length)})`);
  console.log(`  Simples (sin variantes):     ${G(String(vSimple.length))} (${pct(vSimple.length, vendibles.length)})`);
  console.log("");

  // Talla distribution by grupo
  console.log(B("  Variantes por grupo (vendibles):"));
  const vendibleGrupos = new Map<string, { total: number; talla: number }>();
  for (const r of vendibles) {
    const g = str(r.ka_ni_grupo) || "(vacío)";
    if (!vendibleGrupos.has(g)) vendibleGrupos.set(g, { total: 0, talla: 0 });
    const e = vendibleGrupos.get(g)!;
    e.total++;
    if (bool(r.sc_maneja_tallas)) e.talla++;
  }
  for (const [g, v] of Array.from(vendibleGrupos.entries()).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`    Grupo ${pad(g, 6)} total: ${rpad(String(v.total), 5)} con talla: ${rpad(String(v.talla), 5)} (${pct(v.talla, v.total)})`);
  }
  console.log("");

  // ═════════════════════════════════════════════════════════════════════════
  // FASE 7 — PROPUESTA DE REGLA COMERCIAL
  // ═════════════════════════════════════════════════════════════════════════

  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log(B("  FASE 7 — PROPUESTA DE REGLA COMERCIAL"));
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log("");

  // Test different rule candidates
  const rules: { name: string; description: string; filter: (r: RawArticle) => boolean }[] = [
    {
      name: "R1: activo + !bloqueado + precio>0",
      description: "sc_activo=S AND sc_bloqueado=N AND n_valor_venta_normal>0",
      filter: r => bool(r.sc_activo) && !bool(r.sc_bloqueado) && num(r.n_valor_venta_normal) > 0,
    },
    {
      name: "R2: R1 + maneja_kardex",
      description: "R1 AND sc_maneja_kardex=S",
      filter: r => bool(r.sc_activo) && !bool(r.sc_bloqueado) && num(r.n_valor_venta_normal) > 0 && bool(r.sc_maneja_kardex),
    },
    {
      name: "R3: R1 + clase=O",
      description: "R1 AND k_sc_clase_articulo=O",
      filter: r => bool(r.sc_activo) && !bool(r.sc_bloqueado) && num(r.n_valor_venta_normal) > 0 && str(r.k_sc_clase_articulo) === "O",
    },
    {
      name: "R4: R1 + kardex + clase=O",
      description: "R1 AND sc_maneja_kardex=S AND k_sc_clase_articulo=O",
      filter: r => bool(r.sc_activo) && !bool(r.sc_bloqueado) && num(r.n_valor_venta_normal) > 0 && bool(r.sc_maneja_kardex) && str(r.k_sc_clase_articulo) === "O",
    },
    {
      name: "R5: R1 + tiene línea",
      description: "R1 AND ka_nl_linea IS NOT EMPTY",
      filter: r => bool(r.sc_activo) && !bool(r.sc_bloqueado) && num(r.n_valor_venta_normal) > 0 && str(r.ka_nl_linea) !== "" && str(r.ka_nl_linea) !== "0",
    },
    {
      name: "R6: R1 + kardex + tiene línea",
      description: "R1 AND sc_maneja_kardex=S AND ka_nl_linea IS NOT EMPTY",
      filter: r => bool(r.sc_activo) && !bool(r.sc_bloqueado) && num(r.n_valor_venta_normal) > 0 && bool(r.sc_maneja_kardex) && str(r.ka_nl_linea) !== "" && str(r.ka_nl_linea) !== "0",
    },
  ];

  console.log(`  ${pad("Regla", 38)} ${rpad("Resultado", 10)} ${rpad("% catálogo", 12)}`);
  console.log(`  ${"─".repeat(65)}`);
  for (const rule of rules) {
    const matches = rows.filter(rule.filter);
    const color = matches.length > 3000 ? G : matches.length > 1000 ? Y : C;
    console.log(`  ${pad(rule.name, 38)} ${color(rpad(String(matches.length), 10))} ${rpad(pct(matches.length, total), 12)}`);
    console.log(`  ${D(pad("  " + rule.description, 65))}`);
  }
  console.log("");

  // Determine best rule — R2 seems most precise for commercial inventory products
  // Let's validate with additional analysis
  const r2Articles = rows.filter(r =>
    bool(r.sc_activo) && !bool(r.sc_bloqueado) && num(r.n_valor_venta_normal) > 0 && bool(r.sc_maneja_kardex)
  );

  // What do R1 articles WITHOUT kardex look like?
  const r1NoKardex = rows.filter(r =>
    bool(r.sc_activo) && !bool(r.sc_bloqueado) && num(r.n_valor_venta_normal) > 0 && !bool(r.sc_maneja_kardex)
  );

  console.log(B("  Artículos vendibles SIN kardex (R1 - R2):"));
  console.log(`  Total: ${Y(String(r1NoKardex.length))}`);
  if (r1NoKardex.length > 0) {
    console.log("  Muestra (primeros 15):");
    for (const r of r1NoKardex.slice(0, 15)) {
      console.log(`    ${pad(str(r.k_sc_codigo_articulo), 15)} ${pad(str(r.sc_detalle_articulo).slice(0, 35), 37)} precio: $${num(r.n_valor_venta_normal).toLocaleString("es-CO")}`);
    }
  }
  console.log("");

  // ═════════════════════════════════════════════════════════════════════════
  // FASE 8 — MUESTRA DE 50 ARTÍCULOS COMERCIALES
  // ═════════════════════════════════════════════════════════════════════════

  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log(B("  FASE 8 — MUESTRA DE 50 ARTÍCULOS (regla R2: activo + !bloq + precio>0 + kardex)"));
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log("");

  // Sort by price descending to get representative commercial products
  const sample50 = [...r2Articles]
    .sort((a, b) => num(b.n_valor_venta_normal) - num(a.n_valor_venta_normal))
    .slice(0, 50);

  console.log(`  ${pad("#", 4)} ${pad("Código", 18)} ${pad("Descripción", 40)} ${rpad("Grupo", 6)} ${rpad("Línea", 6)} ${rpad("Precio", 12)} ${pad("Talla", 6)}`);
  console.log(`  ${"─".repeat(100)}`);
  for (let i = 0; i < sample50.length; i++) {
    const r = sample50[i];
    const tallaFlag = bool(r.sc_maneja_tallas) ? Y("S") : "N";
    console.log(`  ${rpad(String(i + 1), 4)} ${pad(str(r.k_sc_codigo_articulo), 18)} ${pad(str(r.sc_detalle_articulo).slice(0, 38), 40)} ${rpad(str(r.ka_ni_grupo), 6)} ${rpad(str(r.ka_nl_linea) || "—", 6)} ${rpad("$" + num(r.n_valor_venta_normal).toLocaleString("es-CO"), 12)} ${tallaFlag}`);
  }
  console.log("");

  // Also show 20 cheapest to verify they're still commercial
  console.log(B("  20 más baratos (para verificar que son comerciales):"));
  const cheapest = [...r2Articles]
    .sort((a, b) => num(a.n_valor_venta_normal) - num(b.n_valor_venta_normal))
    .slice(0, 20);

  for (let i = 0; i < cheapest.length; i++) {
    const r = cheapest[i];
    const tallaFlag = bool(r.sc_maneja_tallas) ? Y("S") : "N";
    console.log(`  ${rpad(String(i + 1), 4)} ${pad(str(r.k_sc_codigo_articulo), 18)} ${pad(str(r.sc_detalle_articulo).slice(0, 38), 40)} ${rpad("$" + num(r.n_valor_venta_normal).toLocaleString("es-CO"), 12)} ${tallaFlag}`);
  }
  console.log("");

  // ═════════════════════════════════════════════════════════════════════════
  // RESUMEN FINAL
  // ═════════════════════════════════════════════════════════════════════════

  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log(B("  RESUMEN FINAL"));
  console.log(B("═══════════════════════════════════════════════════════════════════"));
  console.log("");
  console.log(`  CATÁLOGO TOTAL:             ${B(String(total))}`);
  console.log(`  CATÁLOGO COMERCIAL (R2):    ${G(String(r2Articles.length))}`);
  console.log(`  CATÁLOGO NO COMERCIAL:      ${R(String(total - r2Articles.length))}`);
  console.log(`  REFS CON TALLA/COLOR (R2):  ${Y(String(r2Articles.filter(r => bool(r.sc_maneja_tallas)).length))}`);
  console.log("");
  console.log(`  REGLA PROPUESTA (R2):`);
  console.log(`    sc_activo = 'S'`);
  console.log(`    sc_bloqueado = 'N'`);
  console.log(`    n_valor_venta_normal > 0`);
  console.log(`    sc_maneja_kardex = 'S'`);
  console.log("");
  console.log(B("═══════════════════════════════════════════════════════════════════"));
}

main().catch(e => {
  console.error(R(`FATAL: ${(e as Error).message}`));
  process.exit(1);
});
