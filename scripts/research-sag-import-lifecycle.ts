/**
 * research-sag-import-lifecycle.ts
 *
 * SAG-IMPORT-RESEARCH-01 — Phase 12
 *
 * Deep investigation of SAG document lifecycle for imported references.
 * Queries MOVIMIENTOS + MOVIMIENTOS_ITEMS across ALL document types (not just C1/C2)
 * to discover the real lifecycle: purchases, receipts, transfers, returns, adjustments.
 *
 * RESEARCH ONLY — does NOT modify any product code.
 *
 * Run:
 *   export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
 *   npx tsx scripts/research-sag-import-lifecycle.ts
 *
 * Rate limits: 10 req/min, 340 req/day — script uses controlled pacing.
 */

import { consultaSagJson } from "../lib/connectors/pya/client";
import type { PyaApiConfig, SagRows } from "../lib/connectors/pya/types";
import { prisma } from "../lib/prisma";
import * as fs from "fs";
import * as path from "path";

// ── Config ──────────────────────────────────────────────────────────────────

const config: PyaApiConfig = {
  endpointUrl:
    process.env.PYA_SOAP_ENDPOINT ??
    "https://wssagpya.azurewebsites.net/ServiceSagWeb.svc/soap",
  token: process.env.PYA_SOAP_TOKEN ?? process.env.SAG_TEST_TOKEN ?? "",
  database: process.env.PYA_SAG_BD,
};

const IMPORT_WH = new Set(["24", "42", "43", "44", "45", "46"]);
const DELAY_MS = 7000; // respect rate limit: ~8.5 req/min
const OUTPUT_DIR = path.resolve(__dirname, "..", "docs", "importaciones");

// ── Helpers ─────────────────────────────────────────────────────────────────

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function toStr(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

async function sagQuery(label: string, query: string): Promise<SagRows> {
  console.log(`  [SAG] ${label}...`);
  const t0 = Date.now();
  try {
    const rows = await consultaSagJson(config, query);
    console.log(`         ${rows.length} rows in ${Date.now() - t0}ms`);
    return rows;
  } catch (err) {
    console.log(`         FAILED: ${(err as Error).message}`);
    return [];
  }
}

// ── Phase 1: Select sample references from DB ──────────────────────────────

interface SampleRef {
  externalId: string;
  description: string;
  reason: string;
}

async function selectSampleReferences(): Promise<SampleRef[]> {
  console.log("\n=== PHASE 1: SELECT SAMPLE REFERENCES ===\n");

  const org = await (prisma as any).organization.findFirst({
    where: { slug: "castillitos" },
    select: { id: true },
  });
  if (!org) throw new Error("Castillitos org not found");

  const products = await (prisma as any).productEntity.findMany({
    where: { organizationId: org.id, productLine: "5", status: { not: "archived" } },
    select: { id: true, externalId: true, description: true },
  });
  console.log(`Total import products: ${products.length}`);

  const productIds = products.map((p: any) => p.id);
  const productMap = new Map(products.map((p: any) => [p.id, p]));

  // Inventory by product
  const inv = await (prisma as any).productInventoryLevel.findMany({
    where: { organizationId: org.id, productId: { in: productIds } },
    select: { productId: true, warehouseId: true, quantity: true },
  });

  const invByProduct = new Map<string, { total: number; importQty: number; whCount: number }>();
  const whByProduct = new Map<string, Set<string>>();
  for (const i of inv) {
    const qty = Number(i.quantity ?? 0);
    const e = invByProduct.get(i.productId) ?? { total: 0, importQty: 0, whCount: 0 };
    if (qty > 0) e.total += qty;
    if (IMPORT_WH.has(i.warehouseId) && qty > 0) e.importQty += qty;
    invByProduct.set(i.productId, e);

    const whs = whByProduct.get(i.productId) ?? new Set();
    if (qty > 0) whs.add(i.warehouseId);
    whByProduct.set(i.productId, whs);
  }
  for (const [pid, whs] of whByProduct) {
    const e = invByProduct.get(pid);
    if (e) e.whCount = whs.size;
  }

  // Sales by reference code
  const allCodes = products.map((p: any) => p.externalId).filter(Boolean) as string[];
  const salesAgg = await (prisma as any).customerOrderLine.groupBy({
    by: ["referenceCode"],
    where: {
      organizationId: org.id,
      referenceCode: { in: allCodes },
      order: { status: "FACTURADO" },
    },
    _sum: { quantity: true },
    _count: true,
  });

  const salesByCode = new Map<string, { net: number; lineCount: number }>();
  for (const s of salesAgg) {
    salesByCode.set(s.referenceCode, {
      net: Number(s._sum.quantity ?? 0),
      lineCount: s._count,
    });
  }

  // Returns by reference code (negative quantity lines)
  const returnAgg = await (prisma as any).customerOrderLine.groupBy({
    by: ["referenceCode"],
    where: {
      organizationId: org.id,
      referenceCode: { in: allCodes },
      order: { status: "FACTURADO" },
      quantity: { lt: 0 },
    },
    _sum: { quantity: true },
    _count: true,
  });

  const returnsByCode = new Map<string, { qty: number; lineCount: number }>();
  for (const r of returnAgg) {
    returnsByCode.set(r.referenceCode, {
      qty: Math.abs(Number(r._sum.quantity ?? 0)),
      lineCount: r._count,
    });
  }

  // Score and select diverse references
  type Candidate = {
    externalId: string;
    description: string;
    netSold: number;
    returnQty: number;
    totalStock: number;
    importStock: number;
    whCount: number;
  };

  const candidates: Candidate[] = [];
  for (const p of products) {
    if (!p.externalId) continue;
    const inv2 = invByProduct.get(p.id) ?? { total: 0, importQty: 0, whCount: 0 };
    const sales = salesByCode.get(p.externalId) ?? { net: 0, lineCount: 0 };
    const returns = returnsByCode.get(p.externalId) ?? { qty: 0, lineCount: 0 };
    candidates.push({
      externalId: p.externalId,
      description: p.description ?? "",
      netSold: sales.net,
      returnQty: returns.qty,
      totalStock: inv2.total,
      importStock: inv2.importQty,
      whCount: inv2.whCount,
    });
  }

  // Select diverse set
  const selected: SampleRef[] = [];
  const usedCodes = new Set<string>();

  function pick(c: Candidate, reason: string) {
    if (usedCodes.has(c.externalId)) return;
    usedCodes.add(c.externalId);
    selected.push({ externalId: c.externalId, description: c.description, reason });
  }

  // Top 3 sellers
  const bySales = [...candidates].sort((a, b) => b.netSold - a.netSold);
  for (const c of bySales.slice(0, 3)) pick(c, `TOP_SELLER (net=${c.netSold})`);

  // Top 2 with most returns
  const byReturns = [...candidates].sort((a, b) => b.returnQty - a.returnQty);
  for (const c of byReturns.filter(c => c.returnQty > 0).slice(0, 2))
    pick(c, `HIGH_RETURNS (returns=${c.returnQty})`);

  // Top 2 multi-warehouse
  const byWh = [...candidates].sort((a, b) => b.whCount - a.whCount);
  for (const c of byWh.filter(c => c.whCount >= 3).slice(0, 2))
    pick(c, `MULTI_WAREHOUSE (wh=${c.whCount})`);

  // 2 with zero import stock but sales
  const zeroImport = candidates.filter(c => c.importStock === 0 && c.netSold > 0);
  for (const c of zeroImport.sort((a, b) => b.netSold - a.netSold).slice(0, 2))
    pick(c, `ZERO_IMPORT_STOCK (sold=${c.netSold}, importQty=0)`);

  // 1 with zero sales
  const zeroSales = candidates.filter(c => c.netSold === 0 && !usedCodes.has(c.externalId));
  if (zeroSales.length > 0) pick(zeroSales[0], "ZERO_SALES");

  // Fill to 12 if needed
  for (const c of bySales) {
    if (selected.length >= 12) break;
    pick(c, `FILL (net=${c.netSold})`);
  }

  console.log(`\nSelected ${selected.length} references:`);
  for (const s of selected) {
    console.log(`  ${s.externalId.padEnd(20)} — ${s.reason}`);
  }

  return selected;
}

// ── Phase 2-3: Map ALL SAG appearances for each reference ───────────────────

interface DocumentAppearance {
  documentNumber: string;
  date: string;
  fuenteId: number;
  fuenteCode: string;
  fuenteName: string;
  quantity: number;
  warehouseId: string;
  providerName: string;
  providerNit: string;
  unitValue: number;
  anulado: string;
  size: string;
  color: string;
}

async function mapAllAppearances(codes: string[]): Promise<Map<string, DocumentAppearance[]>> {
  console.log("\n=== PHASE 2-3: MAP ALL SAG APPEARANCES ===\n");

  const result = new Map<string, DocumentAppearance[]>();

  // First, resolve ka_nl_articulo for each product code from v_articulos
  console.log("  Resolving article IDs...");
  const artQuery = "SELECT ka_nl_articulo, k_sc_codigo_articulo FROM v_articulos";
  const artRows = await sagQuery("v_articulos article IDs", artQuery);
  const codeSet = new Set(codes.map(c => c.toUpperCase()));
  const artIdsByCode = new Map<string, number[]>();
  for (const r of artRows) {
    const code = toStr(r.k_sc_codigo_articulo).toUpperCase();
    if (!codeSet.has(code)) continue;
    if (!artIdsByCode.has(code)) artIdsByCode.set(code, []);
    artIdsByCode.get(code)!.push(Number(r.ka_nl_articulo));
  }
  console.log(`  Resolved ${artIdsByCode.size} codes with ${[...artIdsByCode.values()].reduce((s, a) => s + a.length, 0)} article IDs`);

  // Collect all article IDs
  const allArtIds = [...artIdsByCode.values()].flat();
  if (allArtIds.length === 0) {
    console.log("  WARNING: No article IDs found for sample codes");
    return result;
  }

  // Build reverse map: artId → code
  const artIdToCode = new Map<number, string>();
  for (const [code, ids] of artIdsByCode) {
    for (const id of ids) artIdToCode.set(id, code);
  }

  // Query MOVIMIENTOS_ITEMS for these article IDs in batches
  // (no WHERE on fuente — we want ALL document types)
  const BATCH_SIZE = 50;
  const batches: number[][] = [];
  for (let i = 0; i < allArtIds.length; i += BATCH_SIZE) {
    batches.push(allArtIds.slice(i, i + BATCH_SIZE));
  }

  let totalMatched = 0;
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const artIdList = batch.join(",");
    await delay(DELAY_MS);

    const query = [
      "SELECT",
      "  m.n_numero_documento,",
      "  m.d_fecha_documento,",
      "  m.ka_ni_fuente,",
      "  m.sc_anulado,",
      "  m.sc_beneficiario,",
      "  f.k_sc_codigo_fuente,",
      "  f.sc_nombre_fuente,",
      "  mi.n_cantidad,",
      "  mi.n_valor,",
      "  mi.ka_nl_bodega,",
      "  mi.ka_nl_articulo,",
      "  mi.ss_talla,",
      "  mi.ss_color,",
      "  MAX(t.n_nit) AS nit_tercero",
      "FROM MOVIMIENTOS m",
      "INNER JOIN MOVIMIENTOS_ITEMS mi",
      "  ON mi.ka_nl_movimiento = m.ka_nl_movimiento",
      "LEFT JOIN FUENTES f",
      "  ON f.ka_ni_fuente = m.ka_ni_fuente",
      "LEFT JOIN TERCEROS t",
      "  ON t.ka_nl_tercero = m.ka_nl_tercero",
      `WHERE mi.ka_nl_articulo IN (${artIdList})`,
      "GROUP BY",
      "  m.n_numero_documento, m.d_fecha_documento, m.ka_ni_fuente, m.sc_anulado,",
      "  m.sc_beneficiario,",
      "  f.k_sc_codigo_fuente, f.sc_nombre_fuente,",
      "  mi.n_cantidad, mi.n_valor, mi.ka_nl_bodega, mi.ka_nl_articulo, mi.ss_talla, mi.ss_color",
      "ORDER BY m.d_fecha_documento",
    ].join(" ");

    const rows = await sagQuery(`Batch ${bi + 1}/${batches.length} (${batch.length} articles)`, query);

    for (const row of rows) {
      const artId = Number(row.ka_nl_articulo ?? 0);
      const code = artIdToCode.get(artId);
      if (!code) continue;
      totalMatched++;

      const appearance: DocumentAppearance = {
        documentNumber: toStr(row.n_numero_documento),
        date: toStr(row.d_fecha_documento),
        fuenteId: Number(row.ka_ni_fuente ?? 0),
        fuenteCode: toStr(row.k_sc_codigo_fuente),
        fuenteName: toStr(row.sc_nombre_fuente),
        quantity: Number(row.n_cantidad ?? 0),
        warehouseId: toStr(row.ka_nl_bodega),
        providerName: toStr(row.sc_beneficiario),
        providerNit: toStr(row.nit_tercero),
        unitValue: Number(row.n_valor ?? 0),
        anulado: toStr(row.sc_anulado),
        size: toStr(row.ss_talla),
        color: toStr(row.ss_color),
      };

      if (!result.has(code)) result.set(code, []);
      result.get(code)!.push(appearance);
    }
  }

  console.log(`\nMatched ${totalMatched} rows for ${result.size} codes out of ${codes.length} requested`);
  return result;
}

// ── Phase 4-5: Analyze document types ──────────────────────────────────────

interface FuenteAnalysis {
  fuenteId: number;
  fuenteCode: string;
  fuenteName: string;
  totalRows: number;
  totalQtyPositive: number;
  totalQtyNegative: number;
  distinctDocs: number;
  distinctProducts: number;
  warehouses: Set<string>;
  dateRange: [string, string];
  anuladoCount: number;
  hasProvider: number;
  sampleValues: number[];
}

function analyzeFuentes(allAppearances: Map<string, DocumentAppearance[]>): Map<number, FuenteAnalysis> {
  const analysis = new Map<number, FuenteAnalysis>();

  for (const [code, appearances] of allAppearances) {
    for (const a of appearances) {
      let fa = analysis.get(a.fuenteId);
      if (!fa) {
        fa = {
          fuenteId: a.fuenteId,
          fuenteCode: a.fuenteCode,
          fuenteName: a.fuenteName,
          totalRows: 0,
          totalQtyPositive: 0,
          totalQtyNegative: 0,
          distinctDocs: 0,
          distinctProducts: 0,
          warehouses: new Set(),
          dateRange: [a.date, a.date],
          anuladoCount: 0,
          hasProvider: 0,
          sampleValues: [],
        };
        analysis.set(a.fuenteId, fa);
      }

      fa.totalRows++;
      if (a.quantity > 0) fa.totalQtyPositive += a.quantity;
      else fa.totalQtyNegative += Math.abs(a.quantity);
      if (a.warehouseId) fa.warehouses.add(a.warehouseId);
      if (a.date && a.date < fa.dateRange[0]) fa.dateRange[0] = a.date;
      if (a.date && a.date > fa.dateRange[1]) fa.dateRange[1] = a.date;
      if (a.anulado === "S") fa.anuladoCount++;
      if (a.providerName) fa.hasProvider++;
      if (a.unitValue > 0 && fa.sampleValues.length < 10) fa.sampleValues.push(a.unitValue);
    }
  }

  // Count distinct docs and products
  for (const [code, appearances] of allAppearances) {
    for (const a of appearances) {
      const fa = analysis.get(a.fuenteId)!;
      // We'll re-count these properly below
    }
  }

  // Proper distinct count pass
  for (const [fid, fa] of analysis) {
    const docs = new Set<string>();
    const prods = new Set<string>();
    for (const [code, appearances] of allAppearances) {
      for (const a of appearances) {
        if (a.fuenteId === fid) {
          docs.add(a.documentNumber);
          prods.add(code);
        }
      }
    }
    fa.distinctDocs = docs.size;
    fa.distinctProducts = prods.size;
  }

  return analysis;
}

// ── Phase 6-7: Per-reference lifecycle analysis ─────────────────────────────

interface ReferenceLifecycle {
  code: string;
  description: string;
  fuenteSummary: { fuenteId: number; code: string; name: string; rows: number; qtyIn: number; qtyOut: number }[];
  distinctProviders: { name: string; nit: string; docCount: number }[];
  warehouseFlow: { wh: string; qtyIn: number; qtyOut: number }[];
  purchaseDocs: { doc: string; date: string; fuente: string; qty: number; wh: string; provider: string; value: number }[];
  dateTimeline: { date: string; event: string; doc: string; fuente: string; qty: number; wh: string }[];
  firstPurchaseDate: string | null;
  lastPurchaseDate: string | null;
  totalPurchased: number;
  purchaseBatchCount: number;
}

function analyzeLifecycle(
  code: string,
  description: string,
  appearances: DocumentAppearance[],
): ReferenceLifecycle {
  // Fuente summary
  const fMap = new Map<number, { code: string; name: string; rows: number; qtyIn: number; qtyOut: number }>();
  for (const a of appearances) {
    const f = fMap.get(a.fuenteId) ?? { code: a.fuenteCode, name: a.fuenteName, rows: 0, qtyIn: 0, qtyOut: 0 };
    f.rows++;
    if (a.quantity > 0) f.qtyIn += a.quantity;
    else f.qtyOut += Math.abs(a.quantity);
    fMap.set(a.fuenteId, f);
  }

  // Provider analysis
  const provMap = new Map<string, { nit: string; docCount: number }>();
  for (const a of appearances) {
    if (!a.providerName) continue;
    const p = provMap.get(a.providerName) ?? { nit: a.providerNit, docCount: 0 };
    p.docCount++;
    provMap.set(a.providerName, p);
  }

  // Warehouse flow
  const whMap = new Map<string, { qtyIn: number; qtyOut: number }>();
  for (const a of appearances) {
    if (!a.warehouseId) continue;
    const w = whMap.get(a.warehouseId) ?? { qtyIn: 0, qtyOut: 0 };
    if (a.quantity > 0) w.qtyIn += a.quantity;
    else w.qtyOut += Math.abs(a.quantity);
    whMap.set(a.warehouseId, w);
  }

  // Identify purchase documents: COMPRA-family fuentes with positive quantity, not anulado
  // Known COMPRA fuentes: 1 (C1), 95 (C2), 157 (DS), 163 (T3)
  // But we want to DISCOVER — so we also check any fuente with positive qty into import warehouses
  const COMPRA_FUENTES = new Set([1, 95, 157, 163, 134, 159]);
  const purchaseDocs: ReferenceLifecycle["purchaseDocs"] = [];
  for (const a of appearances) {
    const isPurchaseFuente = COMPRA_FUENTES.has(a.fuenteId);
    const isImportWh = IMPORT_WH.has(a.warehouseId);
    // A purchase candidate: COMPRA fuente OR positive qty into import warehouse
    if ((isPurchaseFuente || (isImportWh && a.quantity > 0)) && a.anulado !== "S") {
      purchaseDocs.push({
        doc: a.documentNumber,
        date: a.date,
        fuente: `${a.fuenteCode} (${a.fuenteId})`,
        qty: a.quantity,
        wh: a.warehouseId,
        provider: a.providerName,
        value: a.unitValue,
      });
    }
  }

  const sortedPurchases = [...purchaseDocs].sort((a, b) => a.date.localeCompare(b.date));
  const positiveEntries = sortedPurchases.filter(p => p.qty > 0);
  const distinctPurchaseDocs = new Set(positiveEntries.map(p => p.doc));

  // Full timeline
  const timeline = appearances
    .filter(a => a.anulado !== "S")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(a => ({
      date: a.date,
      event: `${a.fuenteCode}/${a.fuenteName}`,
      doc: a.documentNumber,
      fuente: `${a.fuenteCode} (${a.fuenteId})`,
      qty: a.quantity,
      wh: a.warehouseId,
    }));

  return {
    code,
    description,
    fuenteSummary: [...fMap.entries()].map(([id, f]) => ({ fuenteId: id, ...f })),
    distinctProviders: [...provMap.entries()].map(([name, p]) => ({ name, ...p })),
    warehouseFlow: [...whMap.entries()].map(([wh, w]) => ({ wh, ...w })).sort((a, b) => a.wh.localeCompare(b.wh)),
    purchaseDocs: sortedPurchases,
    dateTimeline: timeline,
    firstPurchaseDate: positiveEntries.length > 0 ? positiveEntries[0].date : null,
    lastPurchaseDate: positiveEntries.length > 0 ? positiveEntries[positiveEntries.length - 1].date : null,
    totalPurchased: positiveEntries.reduce((s, p) => s + p.qty, 0),
    purchaseBatchCount: distinctPurchaseDocs.size,
  };
}

// ── Phase 8: FUENTES discovery (full table scan) ───────────────────────────

interface FuenteRow {
  kaNiFuente: number;
  codigo: string;
  nombre: string;
}

async function discoverFuentes(): Promise<FuenteRow[]> {
  console.log("\n=== PHASE 8: FUENTES TABLE DISCOVERY ===\n");

  const query = "SELECT ka_ni_fuente, k_sc_codigo_fuente, sc_nombre_fuente FROM FUENTES ORDER BY ka_ni_fuente";
  const rows = await sagQuery("FUENTES full table", query);

  const fuentes: FuenteRow[] = rows.map(r => ({
    kaNiFuente: Number(r.ka_ni_fuente ?? 0),
    codigo: toStr(r.k_sc_codigo_fuente),
    nombre: toStr(r.sc_nombre_fuente),
  }));

  console.log(`Found ${fuentes.length} fuentes in SAG`);
  return fuentes;
}

// ── Phase 9: BODEGAS discovery ─────────────────────────────────────────────

async function discoverBodegas(): Promise<SagRows> {
  console.log("\n=== PHASE 9: BODEGAS TABLE DISCOVERY ===\n");

  const query = "SELECT * FROM BODEGAS ORDER BY ka_nl_bodega";
  const rows = await sagQuery("BODEGAS full table", query);
  console.log(`Found ${rows.length} bodegas`);
  return rows;
}

// ── Phase 10: Validate prices for sample ───────────────────────────────────

async function validatePrices(codes: string[]): Promise<Map<string, Record<string, number | null>>> {
  console.log("\n=== PHASE 10: VALIDATE PRICES ===\n");

  // v_articulos actual columns: nd_precio1..nd_precio8, nd_costo_std
  const query = [
    "SELECT",
    "  k_sc_codigo_articulo,",
    "  nd_precio1, nd_precio2, nd_precio3, nd_precio4,",
    "  nd_precio5, nd_precio6, nd_precio7, nd_precio8,",
    "  nd_costo_std",
    "FROM v_articulos",
  ].join(" ");

  const rows = await sagQuery("v_articulos all price fields", query);
  const codeSet = new Set(codes.map(c => c.toUpperCase()));
  const result = new Map<string, Record<string, number | null>>();

  for (const row of rows) {
    const code = toStr(row.k_sc_codigo_articulo).toUpperCase();
    if (!codeSet.has(code)) continue;
    result.set(code, {
      precio1: toNum(row.nd_precio1),
      precio2: toNum(row.nd_precio2),
      precio3: toNum(row.nd_precio3),
      precio4: toNum(row.nd_precio4),
      precio5: toNum(row.nd_precio5),
      precio6: toNum(row.nd_precio6),
      precio7: toNum(row.nd_precio7),
      precio8: toNum(row.nd_precio8),
      costoStd: toNum(row.nd_costo_std),
    });
  }

  console.log(`Prices found for ${result.size} / ${codes.length} codes`);
  return result;
}

// ── Output: write research document ─────────────────────────────────────────

function writeResearchDoc(
  samples: SampleRef[],
  allAppearances: Map<string, DocumentAppearance[]>,
  fuenteAnalysis: Map<number, FuenteAnalysis>,
  lifecycles: ReferenceLifecycle[],
  fuentes: FuenteRow[],
  bodegas: SagRows,
  prices: Map<string, any>,
) {
  const lines: string[] = [];
  const w = (s: string) => lines.push(s);

  w("# SAG Import Research — SAG-IMPORT-RESEARCH-01");
  w("");
  w(`Generated: ${new Date().toISOString()}`);
  w(`Sample size: ${samples.length} references`);
  w("");

  // ── FUENTES TABLE ──
  w("## 1. SAG FUENTES Table (Complete)");
  w("");
  w("| ID | Code | Name |");
  w("|---|---|---|");
  for (const f of fuentes) {
    w(`| ${f.kaNiFuente} | ${f.codigo} | ${f.nombre} |`);
  }
  w("");

  // ── BODEGAS TABLE ──
  w("## 2. SAG BODEGAS Table");
  w("");
  w("| ID | Fields |");
  w("|---|---|");
  for (const b of bodegas) {
    const id = toStr(b.ka_nl_bodega);
    const fields = Object.entries(b)
      .filter(([k]) => k !== "ka_nl_bodega")
      .map(([k, v]) => `${k}=${toStr(v)}`)
      .join(", ");
    w(`| ${id} | ${fields.slice(0, 200)} |`);
  }
  w("");

  // ── DOCUMENT TYPE ANALYSIS ──
  w("## 3. Document Types Found in Sample References");
  w("");
  w("| Fuente ID | Code | Name | Rows | Qty+ | Qty- | Docs | Products | Warehouses | Date Range | Anulados | Has Provider |");
  w("|---|---|---|---|---|---|---|---|---|---|---|---|");
  const sorted = [...fuenteAnalysis.values()].sort((a, b) => b.totalRows - a.totalRows);
  for (const fa of sorted) {
    w(`| ${fa.fuenteId} | ${fa.fuenteCode} | ${fa.fuenteName} | ${fa.totalRows} | ${fa.totalQtyPositive} | ${fa.totalQtyNegative} | ${fa.distinctDocs} | ${fa.distinctProducts} | ${[...fa.warehouses].sort().join(",")} | ${fa.dateRange[0]} — ${fa.dateRange[1]} | ${fa.anuladoCount} | ${fa.hasProvider} |`);
  }
  w("");

  // ── SAMPLE SELECTION ──
  w("## 4. Sample References Selected");
  w("");
  w("| Code | Description | Reason |");
  w("|---|---|---|");
  for (const s of samples) {
    w(`| ${s.externalId} | ${s.description.slice(0, 60)} | ${s.reason} |`);
  }
  w("");

  // ── PER-REFERENCE LIFECYCLE ──
  w("## 5. Per-Reference Lifecycle Analysis");
  w("");

  for (const lc of lifecycles) {
    w(`### ${lc.code}`);
    w(`**${lc.description}**`);
    w("");
    w(`- First purchase date: ${lc.firstPurchaseDate ?? "NONE"}`);
    w(`- Last purchase date: ${lc.lastPurchaseDate ?? "NONE"}`);
    w(`- Total purchased: ${lc.totalPurchased}`);
    w(`- Purchase batches: ${lc.purchaseBatchCount}`);
    w(`- Providers: ${lc.distinctProviders.map(p => `${p.name} (${p.docCount} docs)`).join(", ") || "NONE"}`);
    w("");

    // Fuente summary
    w("**Document types:**");
    w("");
    w("| Fuente | Name | Rows | Qty In | Qty Out |");
    w("|---|---|---|---|---|");
    for (const f of lc.fuenteSummary) {
      w(`| ${f.code} (${f.fuenteId}) | ${f.name} | ${f.rows} | ${f.qtyIn} | ${f.qtyOut} |`);
    }
    w("");

    // Warehouse flow
    w("**Warehouse flow:**");
    w("");
    w("| Warehouse | Qty In | Qty Out | Import WH? |");
    w("|---|---|---|---|");
    for (const wf of lc.warehouseFlow) {
      w(`| ${wf.wh} | ${wf.qtyIn} | ${wf.qtyOut} | ${IMPORT_WH.has(wf.wh) ? "YES" : "no"} |`);
    }
    w("");

    // Purchase documents (potential entries)
    if (lc.purchaseDocs.length > 0) {
      w("**Purchase/entry candidates:**");
      w("");
      w("| Date | Doc | Fuente | Qty | WH | Provider | Value |");
      w("|---|---|---|---|---|---|---|");
      for (const p of lc.purchaseDocs) {
        w(`| ${p.date} | ${p.doc} | ${p.fuente} | ${p.qty} | ${p.wh} | ${p.provider} | ${p.value} |`);
      }
      w("");
    }

    // Full timeline (first 30 events)
    w("**Timeline (first 30 events):**");
    w("");
    w("| Date | Event | Doc | Qty | WH |");
    w("|---|---|---|---|---|");
    for (const t of lc.dateTimeline.slice(0, 30)) {
      w(`| ${t.date} | ${t.event} | ${t.doc} | ${t.qty} | ${t.wh} |`);
    }
    if (lc.dateTimeline.length > 30) {
      w(`| ... | (${lc.dateTimeline.length - 30} more events) | ... | ... | ... |`);
    }
    w("");

    // Prices
    const p = prices.get(lc.code);
    if (p) {
      const pStr = Object.entries(p).map(([k, v]) => `${k}=${v ?? "null"}`).join(", ");
      w(`**Prices:** ${pStr}`);
    } else {
      w("**Prices:** NOT FOUND IN v_articulos");
    }
    w("");
    w("---");
    w("");
  }

  // ── CONCLUSIONS ──
  w("## 6. Research Findings");
  w("");
  w("### 6.1 Document types that carry import entries");
  w("");
  w("Based on the data above, classify each fuente found:");
  w("");

  // Auto-classify based on evidence
  for (const fa of sorted) {
    const importWhs = [...fa.warehouses].filter(w => IMPORT_WH.has(w));
    const hasPositive = fa.totalQtyPositive > 0;
    const isKnownCompra = [1, 95, 157, 163].includes(fa.fuenteId);
    let classification = "UNKNOWN";
    if (isKnownCompra && hasPositive && importWhs.length > 0) {
      classification = "CONFIRMED_IMPORT_RECEIPT";
    } else if (isKnownCompra && hasPositive) {
      classification = "COMPRA_NON_IMPORT_WH";
    } else if (importWhs.length > 0 && hasPositive) {
      classification = "POSSIBLE_IMPORT_RECEIPT";
    } else if (fa.totalQtyNegative > 0 && fa.totalQtyPositive === 0) {
      classification = "RETURN_OR_ADJUSTMENT";
    } else {
      classification = "NOT_IMPORT_RELATED";
    }
    w(`- **${fa.fuenteCode} (${fa.fuenteId}) — ${fa.fuenteName}**: ${classification}`);
    w(`  Rows: ${fa.totalRows}, Qty+: ${fa.totalQtyPositive}, Qty-: ${fa.totalQtyNegative}, Import WHs: ${importWhs.join(",") || "none"}`);
  }

  w("");
  w("### 6.2 Key questions answered");
  w("");

  // Compute answers from data
  const allPurchaseFuentes = new Set<number>();
  const allImportWhs = new Set<string>();
  let totalWithPurchases = 0;
  let totalWithoutPurchases = 0;
  for (const lc of lifecycles) {
    if (lc.purchaseBatchCount > 0) {
      totalWithPurchases++;
      for (const p of lc.purchaseDocs) {
        const fid = Number(p.fuente.match(/\((\d+)\)/)?.[1] ?? 0);
        if (fid) allPurchaseFuentes.add(fid);
      }
    } else {
      totalWithoutPurchases++;
    }
    for (const wf of lc.warehouseFlow) {
      if (IMPORT_WH.has(wf.wh) && wf.qtyIn > 0) allImportWhs.add(wf.wh);
    }
  }

  w(`1. **What fuentes represent real import purchases?** ${[...allPurchaseFuentes].sort().join(", ") || "NONE FOUND"}`);
  w(`2. **How many references have confirmed purchase documents?** ${totalWithPurchases} / ${lifecycles.length}`);
  w(`3. **How many references have NO purchase documents?** ${totalWithoutPurchases}`);
  w(`4. **Which import warehouses receive goods?** ${[...allImportWhs].sort().join(", ") || "NONE"}`);
  w("");
  w("### 6.3 Observations requiring human validation");
  w("");
  w("**DO NOT mark any data as CONFIRMED based on this script alone.**");
  w("Each finding above must be validated by the business owner before being used in production.");
  w("");

  // Write file
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  const filePath = path.join(OUTPUT_DIR, "SAG_IMPORT_RESEARCH_01.md");
  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
  console.log(`\nResearch document written to: ${filePath}`);

  // Also write sample doc
  const sampleLines: string[] = [];
  sampleLines.push("# SAG Import Research — Sample Selection");
  sampleLines.push("");
  sampleLines.push(`Generated: ${new Date().toISOString()}`);
  sampleLines.push("");
  sampleLines.push("| # | Code | Description | Selection Reason |");
  sampleLines.push("|---|---|---|---|");
  samples.forEach((s, i) => {
    sampleLines.push(`| ${i + 1} | ${s.externalId} | ${s.description.slice(0, 80)} | ${s.reason} |`);
  });
  const samplePath = path.join(OUTPUT_DIR, "SAG_IMPORT_RESEARCH_SAMPLE_01.md");
  fs.writeFileSync(samplePath, sampleLines.join("\n"), "utf-8");
  console.log(`Sample document written to: ${samplePath}`);

  // Write document types doc
  const dtLines: string[] = [];
  dtLines.push("# SAG Document Types — Import Lifecycle");
  dtLines.push("");
  dtLines.push(`Generated: ${new Date().toISOString()}`);
  dtLines.push("");
  dtLines.push("## All FUENTES found in SAG");
  dtLines.push("");
  dtLines.push("| ID | Code | Name |");
  dtLines.push("|---|---|---|");
  for (const f of fuentes) {
    dtLines.push(`| ${f.kaNiFuente} | ${f.codigo} | ${f.nombre} |`);
  }
  dtLines.push("");
  dtLines.push("## Document types appearing in import product lifecycle");
  dtLines.push("");
  dtLines.push("| ID | Code | Name | Total Rows | Positive Qty | Negative Qty | Import WHs | Classification |");
  dtLines.push("|---|---|---|---|---|---|---|---|");
  for (const fa of sorted) {
    const importWhs = [...fa.warehouses].filter(w => IMPORT_WH.has(w));
    const isKnownCompra = [1, 95, 157, 163].includes(fa.fuenteId);
    let cls = "UNKNOWN";
    if (isKnownCompra && fa.totalQtyPositive > 0 && importWhs.length > 0) cls = "CONFIRMED_IMPORT";
    else if (isKnownCompra && fa.totalQtyPositive > 0) cls = "COMPRA_NON_IMPORT";
    else if (importWhs.length > 0 && fa.totalQtyPositive > 0) cls = "POSSIBLE_IMPORT";
    else cls = "NOT_IMPORT";
    dtLines.push(`| ${fa.fuenteId} | ${fa.fuenteCode} | ${fa.fuenteName} | ${fa.totalRows} | ${fa.totalQtyPositive} | ${fa.totalQtyNegative} | ${importWhs.join(",") || "-"} | ${cls} |`);
  }
  const dtPath = path.join(OUTPUT_DIR, "SAG_DOCUMENT_TYPES_01.md");
  fs.writeFileSync(dtPath, dtLines.join("\n"), "utf-8");
  console.log(`Document types written to: ${dtPath}`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n========================================");
  console.log("  SAG-IMPORT-RESEARCH-01");
  console.log("  Import Lifecycle Research Script");
  console.log("========================================\n");

  if (!config.token) {
    console.error("ERROR: PYA_SOAP_TOKEN or SAG_TEST_TOKEN not set");
    process.exit(1);
  }

  // Phase 1: Select samples from DB
  const samples = await selectSampleReferences();
  const codes = samples.map(s => s.externalId);

  // Phase 2-3: Map ALL SAG appearances
  await delay(DELAY_MS);
  const allAppearances = await mapAllAppearances(codes);

  // Phase 4-5: Analyze document types across all refs
  const fuenteAnalysis = analyzeFuentes(allAppearances);

  // Phase 6-7: Per-reference lifecycle
  const lifecycles: ReferenceLifecycle[] = [];
  for (const s of samples) {
    const appearances = allAppearances.get(s.externalId.toUpperCase()) ?? [];
    lifecycles.push(analyzeLifecycle(s.externalId.toUpperCase(), s.description, appearances));
  }

  // Phase 8: FUENTES table
  await delay(DELAY_MS);
  const fuentes = await discoverFuentes();

  // Phase 9: BODEGAS table
  await delay(DELAY_MS);
  const bodegas = await discoverBodegas();

  // Phase 10: Prices
  await delay(DELAY_MS);
  const prices = await validatePrices(codes);

  // Phase 11-14: Write research documents
  writeResearchDoc(samples, allAppearances, fuenteAnalysis, lifecycles, fuentes, bodegas, prices);

  await (prisma as any).$disconnect();

  console.log("\n========================================");
  console.log("  Research complete.");
  console.log("  Documents written to docs/importaciones/");
  console.log("========================================\n");
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
