// @ts-nocheck
/**
 * scripts/_production-forensics-p2.ts
 *
 * PRODUCTION-FORENSICS-OP-01 Phase 2: Deep analysis after initial discovery.
 *
 * READ-ONLY. Zero writes.
 *
 * Usage: npx tsx scripts/_production-forensics-p2.ts
 */

import "dotenv/config";
import { consultaSagJson } from "../lib/connectors/pya/client";
import { loadSagTestEnv } from "../lib/sag/env";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

const env = loadSagTestEnv();
const config = {
  endpointUrl: env.endpointUrl,
  token: env.token,
  database: env.database,
};

async function safeQuery(label: string, sql: string): Promise<any[]> {
  console.log(`\n--- ${label} ---`);
  try {
    const rows = await consultaSagJson(config, sql);
    console.log(`Result: ${rows.length} rows`);
    return rows;
  } catch (e: any) {
    console.log(`ERROR: ${e.message?.slice(0, 200)}`);
    return [];
  }
}

// ── Phase 11: Resolve articulo names via v_articulos ────────────────────────

async function phase11_resolveArticulos() {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 11: RESOLVE ARTICULO NAMES (v_articulos)");
  console.log("=".repeat(80));

  // Top articulos in recent OPs
  const topArt = await safeQuery(
    "Top 30 articulos in recent OPs",
    `SELECT mi.ka_nl_articulo, SUM(mi.n_cantidad) AS total_qty, COUNT(*) AS lines FROM MOVIMIENTOS_ITEMS mi INNER JOIN (SELECT TOP 100 ka_nl_movimiento FROM MOVIMIENTOS WHERE ka_ni_fuente = 33 AND sc_anulado = 'N' ORDER BY d_fecha_documento DESC) m ON mi.ka_nl_movimiento = m.ka_nl_movimiento GROUP BY mi.ka_nl_articulo ORDER BY total_qty DESC`,
  );

  if (topArt.length === 0) return;

  const artIds = topArt.slice(0, 30).map((a) => a.ka_nl_articulo).filter(Boolean);
  const artIdList = artIds.join(",");

  const resolved = await safeQuery(
    "Resolve articulo names from v_articulos",
    `SELECT ka_nl_articulo, k_sc_codigo_articulo, sc_referencia, sc_detalle_articulo, sc_detalle_grupo, sc_detalle_subgrupo FROM v_articulos WHERE ka_nl_articulo IN (${artIdList})`,
  );

  if (resolved.length > 0) {
    console.log("\nResolved articulos in production:");
    for (const a of resolved) {
      const matching = topArt.find((t) => t.ka_nl_articulo === a.ka_nl_articulo);
      console.log(`  ${a.ka_nl_articulo} | REF: ${a.k_sc_codigo_articulo} | ${a.sc_detalle_articulo} | grupo: ${a.sc_detalle_grupo} | sub: ${a.sc_detalle_subgrupo} | qty: ${matching?.total_qty ?? "?"}`);
    }
  }

  return resolved;
}

// ── Phase 12: OP open/closed state ──────────────────────────────────────────

async function phase12_opOpenClosed() {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 12: OP OPEN vs CLOSED STATE");
  console.log("=".repeat(80));

  // sc_dcto_cerrado: 'N' = open, 'S' = closed
  const stats = await safeQuery(
    "OP open vs closed counts",
    "SELECT sc_dcto_cerrado, COUNT(*) AS cnt FROM MOVIMIENTOS WHERE ka_ni_fuente = 33 AND sc_anulado = 'N' GROUP BY sc_dcto_cerrado",
  );

  if (stats.length > 0) {
    console.log("\nOP state distribution:");
    for (const s of stats) {
      const state = s.sc_dcto_cerrado === "S" ? "CERRADA" : s.sc_dcto_cerrado === "N" ? "ABIERTA" : `UNKNOWN (${s.sc_dcto_cerrado})`;
      console.log(`  ${state}: ${s.cnt} OPs`);
    }
  }

  // Recent open OPs
  const openOPs = await safeQuery(
    "Recent open OPs (TOP 20)",
    "SELECT ka_nl_movimiento, n_numero_documento, d_fecha_documento, sc_dcto_cerrado, ss_remision FROM MOVIMIENTOS WHERE ka_ni_fuente = 33 AND sc_anulado = 'N' AND sc_dcto_cerrado = 'N' ORDER BY d_fecha_documento DESC",
  );

  if (openOPs.length > 0) {
    console.log(`\nOpen OPs: ${openOPs.length}`);
    for (const op of openOPs.slice(0, 20)) {
      console.log(`  OP #${op.n_numero_documento} | fecha: ${op.d_fecha_documento} | remision: ${op.ss_remision}`);
    }
  }

  return openOPs;
}

// ── Phase 13: OP items with talla/color (SKU cross-reference) ───────────────

async function phase13_opItemsWithSKU() {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 13: OP ITEMS WITH TALLA/COLOR/SKU");
  console.log("=".repeat(80));

  // Get OP items with talla and color for recent open OPs
  const items = await safeQuery(
    "OP items with talla/color (recent open OPs)",
    `SELECT mi.ka_nl_articulo, mi.ss_talla, mi.ss_color, mi.n_cantidad, mi.ka_nl_bodega, mi.ka_nl_sku, mi.ss_referencia_pdn, mi.nd_cantidad_pt_pdn, m.n_numero_documento, m.d_fecha_documento FROM MOVIMIENTOS_ITEMS mi INNER JOIN MOVIMIENTOS m ON mi.ka_nl_movimiento = m.ka_nl_movimiento WHERE m.ka_ni_fuente = 33 AND m.sc_anulado = 'N' AND m.sc_dcto_cerrado = 'N' ORDER BY m.d_fecha_documento DESC`,
  );

  if (items.length > 0) {
    console.log(`\nTotal items in open OPs: ${items.length}`);

    // Summarize unique articulo/talla/color combinations
    const combos = new Map<string, { qty: number; count: number; artId: number }>();
    for (const item of items) {
      const key = `${item.ka_nl_articulo}|${item.ss_talla}|${item.ss_color}`;
      const existing = combos.get(key) ?? { qty: 0, count: 0, artId: item.ka_nl_articulo };
      existing.qty += Number(item.n_cantidad) || 0;
      existing.count += 1;
      combos.set(key, existing);
    }

    console.log(`\nUnique articulo|talla|color in open OPs: ${combos.size}`);
    const sorted = [...combos.entries()].sort((a, b) => b[1].qty - a[1].qty);
    for (const [key, val] of sorted.slice(0, 30)) {
      console.log(`  ${key.padEnd(30)} qty: ${val.qty.toString().padStart(6)} | lines: ${val.count}`);
    }

    // Show sample items
    console.log("\nSample OP items:");
    for (const item of items.slice(0, 10)) {
      console.log(`  OP #${item.n_numero_documento} | art: ${item.ka_nl_articulo} | talla: ${item.ss_talla} | color: ${item.ss_color} | qty: ${item.n_cantidad} | bodega: ${item.ka_nl_bodega} | sku: ${item.ka_nl_sku} | ref_pdn: ${item.ss_referencia_pdn} | qty_pt: ${item.nd_cantidad_pt_pdn}`);
    }
  }

  return items;
}

// ── Phase 14: Cross-reference with ProductVariant (Prisma) ──────────────────

async function phase14_crossReferenceProductVariant(items: any[]) {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 14: CROSS-REFERENCE OP ITEMS → ProductVariant");
  console.log("=".repeat(80));

  if (items.length === 0) {
    console.log("No OP items to cross-reference.");
    return;
  }

  // Resolve articulo IDs to product references
  const artIds = [...new Set(items.map((i) => i.ka_nl_articulo))];
  const artIdList = artIds.slice(0, 50).join(",");

  const articulos = await safeQuery(
    "Resolve articulo references",
    `SELECT ka_nl_articulo, k_sc_codigo_articulo, sc_referencia FROM v_articulos WHERE ka_nl_articulo IN (${artIdList})`,
  );

  const refByArtId = new Map<number, string>();
  for (const a of articulos) {
    refByArtId.set(a.ka_nl_articulo, a.k_sc_codigo_articulo ?? a.sc_referencia ?? "");
  }

  // Build composite keys and check against ProductVariant
  const org = await prisma.organization.findUnique({
    where: { slug: "castillitos" },
    select: { id: true },
  });
  if (!org) {
    console.log("Org 'castillitos' not found in Prisma.");
    return;
  }

  const compositeKeys: string[] = [];
  const itemMap = new Map<string, { artId: number; talla: string; color: string; qty: number }>();

  for (const item of items) {
    const ref = refByArtId.get(item.ka_nl_articulo) ?? "";
    if (!ref) continue;
    const talla = (item.ss_talla ?? "").trim().toUpperCase();
    const color = (item.ss_color ?? "").trim().toUpperCase();
    const key = `${ref.toUpperCase()}|${talla}|${color}`;
    compositeKeys.push(key);

    const existing = itemMap.get(key) ?? { artId: item.ka_nl_articulo, talla, color, qty: 0 };
    existing.qty += Number(item.n_cantidad) || 0;
    itemMap.set(key, existing);
  }

  const uniqueKeys = [...new Set(compositeKeys)];
  console.log(`\nUnique composite keys to match: ${uniqueKeys.length}`);

  // Batch lookup in ProductVariant
  const matchedVariants = uniqueKeys.length > 0
    ? await prisma.productVariant.findMany({
        where: { organizationId: org.id, sku: { in: uniqueKeys } },
        select: { id: true, sku: true, productId: true },
      })
    : [];

  const matchedSkus = new Set(matchedVariants.map((v) => v.sku?.toUpperCase()));
  let matched = 0;
  let unmatched = 0;

  for (const key of uniqueKeys) {
    if (matchedSkus.has(key)) {
      matched++;
    } else {
      unmatched++;
    }
  }

  console.log(`\nMatch results:`);
  console.log(`  Matched:   ${matched} (${uniqueKeys.length > 0 ? ((matched / uniqueKeys.length) * 100).toFixed(1) : 0}%)`);
  console.log(`  Unmatched: ${unmatched}`);

  // Show unmatched
  if (unmatched > 0) {
    console.log("\nUnmatched OP composite keys (first 20):");
    let count = 0;
    for (const key of uniqueKeys) {
      if (!matchedSkus.has(key)) {
        const info = itemMap.get(key);
        console.log(`  ${key} | artId: ${info?.artId} | qty: ${info?.qty}`);
        if (++count >= 20) break;
      }
    }
  }

  // Check inventory for matched variants
  if (matchedVariants.length > 0) {
    const variantIds = matchedVariants.map((v) => v.id);
    const inventory = await prisma.productInventoryLevel.findMany({
      where: { variantId: { in: variantIds } },
      select: { variantId: true, quantity: true },
    });

    const invByVariant = new Map<string, number>();
    for (const il of inventory) {
      if (!il.variantId) continue;
      invByVariant.set(il.variantId, (invByVariant.get(il.variantId) ?? 0) + Math.max(0, il.quantity));
    }

    let inProductionWithZeroStock = 0;
    let inProductionWithStock = 0;

    console.log("\nOP items cross-referenced with inventory (sample 20):");
    let shown = 0;
    for (const v of matchedVariants) {
      const avail = invByVariant.get(v.id) ?? 0;
      const opInfo = itemMap.get(v.sku?.toUpperCase() ?? "");
      if (avail <= 0) inProductionWithZeroStock++;
      else inProductionWithStock++;

      if (shown < 20) {
        console.log(`  ${v.sku} | op_qty: ${opInfo?.qty ?? "?"} | stock: ${avail} | ${avail <= 0 ? "AGOTADO" : "EN STOCK"}`);
        shown++;
      }
    }

    console.log(`\nSummary:`);
    console.log(`  In production + zero stock: ${inProductionWithZeroStock}`);
    console.log(`  In production + has stock:  ${inProductionWithStock}`);
  }
}

// ── Phase 15: ET (Entrada PT) items — what gets produced ────────────────────

async function phase15_etItems() {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 15: ENTRADA PRODUCTO TERMINADO (ET, fuente 116) — Recent");
  console.log("=".repeat(80));

  const recentET = await safeQuery(
    "Recent ET items (last 20 ET movements)",
    `SELECT mi.ka_nl_articulo, mi.ss_talla, mi.ss_color, mi.n_cantidad, mi.ka_nl_bodega, m.n_numero_documento, m.d_fecha_documento FROM MOVIMIENTOS_ITEMS mi INNER JOIN (SELECT TOP 20 ka_nl_movimiento, n_numero_documento, d_fecha_documento FROM MOVIMIENTOS WHERE ka_ni_fuente = 116 AND sc_anulado = 'N' ORDER BY d_fecha_documento DESC) m ON mi.ka_nl_movimiento = m.ka_nl_movimiento ORDER BY m.d_fecha_documento DESC`,
  );

  if (recentET.length > 0) {
    console.log(`\nRecent ET items: ${recentET.length}`);

    // Resolve articulo names
    const artIds = [...new Set(recentET.map((i) => i.ka_nl_articulo))];
    const resolved = await safeQuery(
      "Resolve ET articulo names",
      `SELECT ka_nl_articulo, k_sc_codigo_articulo, sc_detalle_articulo FROM v_articulos WHERE ka_nl_articulo IN (${artIds.join(",")})`,
    );

    const nameByArt = new Map<number, string>();
    for (const a of resolved) {
      nameByArt.set(a.ka_nl_articulo, `${a.k_sc_codigo_articulo} (${a.sc_detalle_articulo})`);
    }

    console.log("\nRecent finished product entries:");
    for (const item of recentET.slice(0, 30)) {
      const name = nameByArt.get(item.ka_nl_articulo) ?? `art#${item.ka_nl_articulo}`;
      console.log(`  ET #${item.n_numero_documento} | ${item.d_fecha_documento?.slice(0, 10)} | ${name} | talla: ${item.ss_talla} | color: ${item.ss_color} | qty: ${item.n_cantidad} | bodega: ${item.ka_nl_bodega}`);
    }
  }
}

// ── Phase 16: BODEGA (warehouse) for production ─────────────────────────────

async function phase16_bodegas() {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 16: PRODUCTION BODEGAS (warehouses)");
  console.log("=".repeat(80));

  const bodegas = await safeQuery(
    "Bodegas used in production movements",
    `SELECT mi.ka_nl_bodega, COUNT(*) AS cnt FROM MOVIMIENTOS_ITEMS mi INNER JOIN MOVIMIENTOS m ON mi.ka_nl_movimiento = m.ka_nl_movimiento WHERE m.ka_ni_fuente IN (33, 116) AND m.sc_anulado = 'N' GROUP BY mi.ka_nl_bodega ORDER BY cnt DESC`,
  );

  if (bodegas.length > 0) {
    console.log("\nBodegas in OP + ET movements:");
    for (const b of bodegas) {
      console.log(`  Bodega ${b.ka_nl_bodega}: ${b.cnt} items`);
    }

    // Try to resolve bodega names
    const bodIds = bodegas.map((b) => b.ka_nl_bodega).filter(Boolean);
    const bodNames = await safeQuery(
      "Resolve bodega names",
      `SELECT TOP 20 * FROM BODEGAS WHERE ka_nl_bodega IN (${bodIds.join(",")})`,
    );
    if (bodNames.length > 0) {
      console.log("\nBodega details:");
      for (const b of bodNames) {
        console.log(`  ${b.ka_nl_bodega} | ${b.sc_nombre_bodega ?? b.ss_nombre ?? JSON.stringify(b).slice(0, 100)}`);
      }
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(80));
  console.log("PRODUCTION-FORENSICS-OP-01 — Phase 2: Deep Analysis");
  console.log(`Date: ${new Date().toISOString()}`);
  console.log("=".repeat(80));

  const resolved = await phase11_resolveArticulos();
  const openOPs = await phase12_opOpenClosed();
  const opItems = await phase13_opItemsWithSKU();
  await phase14_crossReferenceProductVariant(opItems);
  await phase15_etItems();
  await phase16_bodegas();

  await prisma.$disconnect();
  pool.end();

  console.log("\n" + "=".repeat(80));
  console.log("PHASE 2 FORENSICS COMPLETE");
  console.log("=".repeat(80));
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
