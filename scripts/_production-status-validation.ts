// @ts-nocheck
/**
 * scripts/_production-status-validation.ts
 *
 * PRODUCTION-STATUS-VALIDATION-02
 * Validate OP lifecycle, OP→PT relationship, pending production, agotados cross.
 *
 * READ-ONLY. Zero writes.
 *
 * Usage: npx tsx scripts/_production-status-validation.ts
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
const config = { endpointUrl: env.endpointUrl, token: env.token, database: env.database };

async function q(label: string, sql: string): Promise<any[]> {
  console.log(`\n--- ${label} ---`);
  try {
    const rows = await consultaSagJson(config, sql);
    console.log(`  ${rows.length} rows`);
    return rows;
  } catch (e: any) {
    console.log(`  ERROR: ${e.message?.slice(0, 300)}`);
    return [];
  }
}

function hr(title: string) {
  console.log("\n" + "=".repeat(80));
  console.log(title);
  console.log("=".repeat(80));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — OP HEADER VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

async function phase1() {
  hr("PHASE 1: OP HEADER VALIDATION");

  // 1a. State distribution of ALL OPs
  const states = await q(
    "1a. All OP states (sc_dcto_cerrado + sc_anulado + sc_facturado + sc_remision)",
    `SELECT sc_dcto_cerrado, sc_anulado, sc_facturado, sc_remision, sc_generado, sc_impreso, COUNT(*) AS cnt
     FROM MOVIMIENTOS WHERE ka_ni_fuente = 33
     GROUP BY sc_dcto_cerrado, sc_anulado, sc_facturado, sc_remision, sc_generado, sc_impreso
     ORDER BY cnt DESC`,
  );
  if (states.length > 0) {
    console.log("\n  State matrix:");
    for (const s of states) {
      console.log(`    cerrado=${s.sc_dcto_cerrado} anulado=${s.sc_anulado} facturado=${s.sc_facturado} remision=${s.sc_remision} generado=${s.sc_generado} impreso=${s.sc_impreso} → ${s.cnt} OPs`);
    }
  }

  // 1b. Closed OPs — examine what changed
  const closedOPs = await q(
    "1b. All 24 closed OPs (full detail)",
    `SELECT ka_nl_movimiento, n_numero_documento, d_fecha_documento, sc_dcto_cerrado,
            sc_beneficiario, ss_remision, sv_observaciones, ss_usuario_new, ddt_fecha_new,
            ka_ni_centro_costo
     FROM MOVIMIENTOS WHERE ka_ni_fuente = 33 AND sc_dcto_cerrado = 'S'
     ORDER BY d_fecha_documento DESC`,
  );
  if (closedOPs.length > 0) {
    console.log("\n  Closed OPs:");
    for (const op of closedOPs) {
      console.log(`    OP #${op.n_numero_documento} | fecha: ${op.d_fecha_documento?.slice(0, 10)} | created: ${op.ddt_fecha_new?.slice(0, 10)} | user: ${(op.ss_usuario_new ?? "").slice(0, 30)} | obs: ${(op.sv_observaciones ?? "").slice(0, 60)}`);
    }
  }

  // 1c. Anulled OPs
  const anulled = await q(
    "1c. Anulled OPs count",
    "SELECT COUNT(*) AS cnt FROM MOVIMIENTOS WHERE ka_ni_fuente = 33 AND sc_anulado = 'S'",
  );
  console.log(`\n  Anulled OPs: ${anulled[0]?.cnt ?? 0}`);

  // 1d. Last 30 days OPs
  const recent30 = await q(
    "1d. OPs created in last 30 days",
    `SELECT n_numero_documento, d_fecha_documento, sc_dcto_cerrado, ss_remision, ddt_fecha_new
     FROM MOVIMIENTOS WHERE ka_ni_fuente = 33 AND sc_anulado = 'N'
     AND d_fecha_documento >= '2026-05-25'
     ORDER BY d_fecha_documento DESC`,
  );
  console.log(`\n  OPs in last 30 days: ${recent30.length}`);
  for (const op of recent30.slice(0, 15)) {
    console.log(`    OP #${op.n_numero_documento} | ${op.d_fecha_documento?.slice(0, 10)} | cerrado: ${op.sc_dcto_cerrado} | remision: ${op.ss_remision}`);
  }

  // 1e. OP frequency by month (2025-2026)
  const byMonth = await q(
    "1e. OP creation frequency by month (2025-2026)",
    `SELECT YEAR(d_fecha_documento) AS y, MONTH(d_fecha_documento) AS m, COUNT(*) AS cnt
     FROM MOVIMIENTOS WHERE ka_ni_fuente = 33 AND sc_anulado = 'N'
     AND d_fecha_documento >= '2025-01-01'
     GROUP BY YEAR(d_fecha_documento), MONTH(d_fecha_documento)
     ORDER BY y, m`,
  );
  if (byMonth.length > 0) {
    console.log("\n  OP creation by month:");
    for (const r of byMonth) {
      console.log(`    ${r.y}-${String(r.m).padStart(2, "0")}: ${r.cnt} OPs`);
    }
  }

  // 1f. OP observaciones patterns
  const obsPatterns = await q(
    "1f. OP observaciones (distinct patterns)",
    `SELECT TOP 20 sv_observaciones, COUNT(*) AS cnt
     FROM MOVIMIENTOS WHERE ka_ni_fuente = 33 AND sc_anulado = 'N'
     GROUP BY sv_observaciones ORDER BY cnt DESC`,
  );
  if (obsPatterns.length > 0) {
    console.log("\n  Observation patterns:");
    for (const o of obsPatterns) {
      console.log(`    [${o.cnt}x] "${(o.sv_observaciones ?? "").slice(0, 80)}"`);
    }
  }

  return { closedOPs, recent30 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — OP → PT RELATIONSHIP
// ═══════════════════════════════════════════════════════════════════════════════

async function phase2() {
  hr("PHASE 2: OP → PT (ET, fuente 116) RELATIONSHIP");

  // 2a. ET header columns
  const etSample = await q(
    "2a. Sample ET headers (TOP 10, most recent)",
    `SELECT TOP 10 ka_nl_movimiento, n_numero_documento, d_fecha_documento, sc_dcto_cerrado,
            sc_beneficiario, ss_remision, sv_observaciones, ss_usuario_new, ka_ni_centro_costo,
            ss_pedido, ss_otros
     FROM MOVIMIENTOS WHERE ka_ni_fuente = 116 AND sc_anulado = 'N'
     ORDER BY d_fecha_documento DESC`,
  );
  if (etSample.length > 0) {
    console.log("\n  Recent ET (Entrada PT) headers:");
    for (const et of etSample) {
      console.log(`    ET #${et.n_numero_documento} | ${et.d_fecha_documento?.slice(0, 10)} | remision: ${et.ss_remision} | pedido: ${et.ss_pedido} | obs: ${(et.sv_observaciones ?? "").slice(0, 60)} | otros: ${et.ss_otros}`);
    }
  }

  // 2b. Try to match OP → ET by ss_remision cross-reference
  // Hypothesis: OP.ss_remision might reference an ET number, or ET.ss_remision references an OP
  const opRemisions = await q(
    "2b. OP ss_remision patterns (last 50 OPs)",
    `SELECT TOP 50 n_numero_documento, ss_remision, ss_pedido, ss_otros
     FROM MOVIMIENTOS WHERE ka_ni_fuente = 33 AND sc_anulado = 'N'
     ORDER BY d_fecha_documento DESC`,
  );
  if (opRemisions.length > 0) {
    console.log("\n  OP cross-reference fields:");
    for (const op of opRemisions.slice(0, 20)) {
      console.log(`    OP #${op.n_numero_documento} | remision: "${op.ss_remision}" | pedido: "${op.ss_pedido}" | otros: "${op.ss_otros}"`);
    }
  }

  // 2c. Try matching: does ET.ss_remision or ET.n_numero_documento reference an OP?
  // Take recent OPs and look for ETs with matching numbers
  const recentOPNums = opRemisions.slice(0, 20).map((o) => o.n_numero_documento);

  // Check ET with same n_numero_documento
  if (recentOPNums.length > 0) {
    const numList = recentOPNums.join(",");
    const etByNum = await q(
      "2c. ETs with same n_numero_documento as recent OPs",
      `SELECT ka_nl_movimiento, ka_ni_fuente, n_numero_documento, d_fecha_documento, ss_remision
       FROM MOVIMIENTOS WHERE ka_ni_fuente = 116 AND sc_anulado = 'N'
       AND n_numero_documento IN (${numList})
       ORDER BY n_numero_documento`,
    );
    if (etByNum.length > 0) {
      console.log("\n  ET entries matching OP document numbers:");
      for (const et of etByNum) {
        console.log(`    ET #${et.n_numero_documento} | ${et.d_fecha_documento?.slice(0, 10)} | remision: ${et.ss_remision}`);
      }
    } else {
      console.log("\n  NO ETs found with same n_numero_documento as recent OPs.");
    }
  }

  // 2d. Alternative: match by articulo. Take OP items → find ET items with same articulo
  const opItems = await q(
    "2d. Items from last 5 OPs",
    `SELECT mi.ka_nl_articulo, mi.ss_talla, mi.ss_color, mi.n_cantidad, m.n_numero_documento AS op_num, m.d_fecha_documento AS op_date
     FROM MOVIMIENTOS_ITEMS mi
     INNER JOIN (SELECT TOP 5 ka_nl_movimiento, n_numero_documento, d_fecha_documento
                 FROM MOVIMIENTOS WHERE ka_ni_fuente = 33 AND sc_anulado = 'N'
                 ORDER BY d_fecha_documento DESC) m
     ON mi.ka_nl_movimiento = m.ka_nl_movimiento`,
  );

  if (opItems.length > 0) {
    // Get unique articulos from these OPs
    const artIds = [...new Set(opItems.map((i) => i.ka_nl_articulo))];
    const artList = artIds.join(",");

    // Find ET items with same articulos in the same date range
    const etItems = await q(
      "2d-b. ET items for same articulos (recent 6 months)",
      `SELECT mi.ka_nl_articulo, mi.ss_talla, mi.ss_color, mi.n_cantidad, mi.ka_nl_bodega,
              m.n_numero_documento AS et_num, m.d_fecha_documento AS et_date
       FROM MOVIMIENTOS_ITEMS mi
       INNER JOIN MOVIMIENTOS m ON mi.ka_nl_movimiento = m.ka_nl_movimiento
       WHERE m.ka_ni_fuente = 116 AND m.sc_anulado = 'N'
       AND mi.ka_nl_articulo IN (${artList})
       AND m.d_fecha_documento >= '2026-01-01'
       ORDER BY m.d_fecha_documento DESC`,
    );

    if (etItems.length > 0) {
      console.log("\n  ET items for same articulos as recent OPs:");
      for (const et of etItems.slice(0, 20)) {
        console.log(`    ET #${et.et_num} | ${et.et_date?.slice(0, 10)} | art: ${et.ka_nl_articulo} | talla: ${et.ss_talla} | color: ${et.ss_color} | qty: ${et.n_cantidad} | bodega: ${et.ka_nl_bodega}`);
      }

      // Cross-match: for each OP item, find matching ET items
      console.log("\n  OP → ET cross-match by articulo+talla+color:");
      for (const opItem of opItems.slice(0, 10)) {
        const key = `${opItem.ka_nl_articulo}|${opItem.ss_talla}|${opItem.ss_color}`;
        const matchingETs = etItems.filter(
          (et) => et.ka_nl_articulo === opItem.ka_nl_articulo && et.ss_talla === opItem.ss_talla && et.ss_color === opItem.ss_color,
        );
        const totalET = matchingETs.reduce((s, et) => s + (Number(et.n_cantidad) || 0), 0);
        const opQty = Number(opItem.n_cantidad) || 0;
        const pending = opQty - totalET;
        console.log(`    OP #${opItem.op_num} | ${key} | OP qty: ${opQty} | ET qty: ${totalET} | pending: ${pending} | ${pending > 0 ? "EN PROCESO" : pending === 0 ? "COMPLETADA" : "SOBREPRODUCCION"}`);
      }
    } else {
      console.log("\n  No ET items found for same articulos.");
    }
  }

  // 2e. ET bodega — where does finished product go?
  const etBodegas = await q(
    "2e. ET destination bodegas",
    `SELECT mi.ka_nl_bodega, COUNT(*) AS cnt
     FROM MOVIMIENTOS_ITEMS mi
     INNER JOIN MOVIMIENTOS m ON mi.ka_nl_movimiento = m.ka_nl_movimiento
     WHERE m.ka_ni_fuente = 116 AND m.sc_anulado = 'N'
     GROUP BY mi.ka_nl_bodega ORDER BY cnt DESC`,
  );
  if (etBodegas.length > 0) {
    console.log("\n  ET destination bodegas:");
    for (const b of etBodegas) {
      console.log(`    Bodega ${b.ka_nl_bodega}: ${b.cnt} items`);
    }

    // Resolve bodega names
    const bodIds = etBodegas.map((b) => b.ka_nl_bodega).filter(Boolean).join(",");
    const bodNames = await q("Resolve bodega names", `SELECT ka_nl_bodega, sc_nombre_bodega FROM BODEGAS WHERE ka_nl_bodega IN (${bodIds})`);
    if (bodNames.length > 0) {
      for (const b of bodNames) console.log(`      ${b.ka_nl_bodega} = "${b.sc_nombre_bodega}"`);
    }
  }

  // 2f. ET observaciones — clues about OP linkage
  const etObs = await q(
    "2f. ET observaciones patterns",
    `SELECT TOP 15 sv_observaciones, COUNT(*) AS cnt
     FROM MOVIMIENTOS WHERE ka_ni_fuente = 116 AND sc_anulado = 'N'
     GROUP BY sv_observaciones ORDER BY cnt DESC`,
  );
  if (etObs.length > 0) {
    console.log("\n  ET observation patterns:");
    for (const o of etObs) {
      console.log(`    [${o.cnt}x] "${(o.sv_observaciones ?? "").slice(0, 80)}"`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — PENDING PRODUCTION CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════

async function phase3() {
  hr("PHASE 3: PENDING PRODUCTION CALCULATION");

  // Strategy: For a sample of articulos, sum OP qty vs ET qty
  // Use recent OPs (last 6 months) to limit scope

  // 3a. Get OP quantities by articulo+talla+color (last 6 months)
  const opAgg = await q(
    "3a. OP quantities by articulo (last 6 months)",
    `SELECT mi.ka_nl_articulo, mi.ss_talla, mi.ss_color, SUM(mi.n_cantidad) AS op_qty, COUNT(*) AS op_lines
     FROM MOVIMIENTOS_ITEMS mi
     INNER JOIN MOVIMIENTOS m ON mi.ka_nl_movimiento = m.ka_nl_movimiento
     WHERE m.ka_ni_fuente = 33 AND m.sc_anulado = 'N'
     AND m.d_fecha_documento >= '2026-01-01'
     GROUP BY mi.ka_nl_articulo, mi.ss_talla, mi.ss_color
     ORDER BY op_qty DESC`,
  );

  // 3b. Get ET quantities by articulo+talla+color (last 6 months)
  const etAgg = await q(
    "3b. ET quantities by articulo (last 6 months)",
    `SELECT mi.ka_nl_articulo, mi.ss_talla, mi.ss_color, SUM(mi.n_cantidad) AS et_qty, COUNT(*) AS et_lines
     FROM MOVIMIENTOS_ITEMS mi
     INNER JOIN MOVIMIENTOS m ON mi.ka_nl_movimiento = m.ka_nl_movimiento
     WHERE m.ka_ni_fuente = 116 AND m.sc_anulado = 'N'
     AND m.d_fecha_documento >= '2026-01-01'
     GROUP BY mi.ka_nl_articulo, mi.ss_talla, mi.ss_color
     ORDER BY et_qty DESC`,
  );

  // Build lookup for ET
  const etMap = new Map<string, number>();
  for (const et of etAgg) {
    const key = `${et.ka_nl_articulo}|${et.ss_talla}|${et.ss_color}`;
    etMap.set(key, (etMap.get(key) ?? 0) + Number(et.et_qty));
  }

  // Calculate pending
  console.log("\n  Pending production (OP qty - ET qty) — top 30 by pending:");
  const pending: { key: string; artId: number; talla: string; color: string; opQty: number; etQty: number; pendingQty: number }[] = [];

  for (const op of opAgg) {
    const key = `${op.ka_nl_articulo}|${op.ss_talla}|${op.ss_color}`;
    const opQty = Number(op.op_qty);
    const etQty = etMap.get(key) ?? 0;
    pending.push({ key, artId: op.ka_nl_articulo, talla: op.ss_talla, color: op.ss_color, opQty, etQty, pendingQty: opQty - etQty });
  }

  pending.sort((a, b) => b.pendingQty - a.pendingQty);

  let withPending = 0, completed = 0, overProduced = 0;
  for (const p of pending) {
    if (p.pendingQty > 0) withPending++;
    else if (p.pendingQty === 0) completed++;
    else overProduced++;
  }

  console.log(`\n  Summary (2026 only):`);
  console.log(`    Items with pending production: ${withPending}`);
  console.log(`    Items fully produced:          ${completed}`);
  console.log(`    Items over-produced:           ${overProduced}`);
  console.log(`    Total unique art|talla|color:  ${pending.length}`);

  // Top pending
  console.log("\n  Top 30 items with highest pending production:");

  // Resolve articulo names for top 30
  const topArtIds = [...new Set(pending.slice(0, 30).map((p) => p.artId))];
  const artNames = topArtIds.length > 0
    ? await q("Resolve names", `SELECT ka_nl_articulo, k_sc_codigo_articulo, sc_detalle_articulo FROM v_articulos WHERE ka_nl_articulo IN (${topArtIds.join(",")})`)
    : [];
  const nameMap = new Map<number, string>();
  for (const a of artNames) nameMap.set(a.ka_nl_articulo, a.k_sc_codigo_articulo ?? "?");

  for (const p of pending.slice(0, 30)) {
    const ref = nameMap.get(p.artId) ?? `art#${p.artId}`;
    console.log(`    ${ref.padEnd(15)} | ${p.talla.padEnd(6)} | ${p.color.padEnd(5)} | OP: ${String(p.opQty).padStart(5)} | ET: ${String(p.etQty).padStart(5)} | PEND: ${String(p.pendingQty).padStart(5)}`);
  }

  return pending;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 4 — PRODUCTION VIGENCY RULES
// ═══════════════════════════════════════════════════════════════════════════════

async function phase4() {
  hr("PHASE 4: PRODUCTION VIGENCY RULES");

  // 4a. Check if there's a date-based pattern for "active" OPs
  const opsByYear = await q(
    "4a. Open OPs by year",
    `SELECT YEAR(d_fecha_documento) AS y, COUNT(*) AS cnt
     FROM MOVIMIENTOS WHERE ka_ni_fuente = 33 AND sc_anulado = 'N' AND sc_dcto_cerrado = 'N'
     GROUP BY YEAR(d_fecha_documento) ORDER BY y`,
  );
  if (opsByYear.length > 0) {
    console.log("\n  Open OPs by year (never closed):");
    for (const r of opsByYear) console.log(`    ${r.y}: ${r.cnt} OPs still open`);
  }

  // 4b. Check if closed OPs have a pattern
  const closedByYear = await q(
    "4b. Closed OPs by year of creation",
    `SELECT YEAR(d_fecha_documento) AS y, COUNT(*) AS cnt
     FROM MOVIMIENTOS WHERE ka_ni_fuente = 33 AND sc_dcto_cerrado = 'S'
     GROUP BY YEAR(d_fecha_documento) ORDER BY y`,
  );
  if (closedByYear.length > 0) {
    console.log("\n  Closed OPs by year:");
    for (const r of closedByYear) console.log(`    ${r.y}: ${r.cnt} OPs closed`);
  }

  // 4c. For closed OPs: do they have matching ETs?
  const closedOPs = await q(
    "4c. Closed OP document numbers",
    "SELECT n_numero_documento FROM MOVIMIENTOS WHERE ka_ni_fuente = 33 AND sc_dcto_cerrado = 'S'",
  );

  if (closedOPs.length > 0) {
    // Get items from closed OPs
    const closedMovIds = await q(
      "4c-b. Closed OP movement IDs",
      `SELECT ka_nl_movimiento, n_numero_documento FROM MOVIMIENTOS WHERE ka_ni_fuente = 33 AND sc_dcto_cerrado = 'S'`,
    );
    const movIdList = closedMovIds.map((m) => m.ka_nl_movimiento).join(",");

    const closedItems = await q(
      "4c-c. Items from closed OPs",
      `SELECT mi.ka_nl_articulo, mi.ss_talla, mi.ss_color, SUM(mi.n_cantidad) AS qty
       FROM MOVIMIENTOS_ITEMS mi WHERE mi.ka_nl_movimiento IN (${movIdList})
       GROUP BY mi.ka_nl_articulo, mi.ss_talla, mi.ss_color`,
    );

    if (closedItems.length > 0) {
      // Check ET for these articulos
      const closedArtIds = [...new Set(closedItems.map((i) => i.ka_nl_articulo))].join(",");
      const etForClosed = await q(
        "4c-d. ET for closed OP articulos",
        `SELECT mi.ka_nl_articulo, mi.ss_talla, mi.ss_color, SUM(mi.n_cantidad) AS et_qty
         FROM MOVIMIENTOS_ITEMS mi
         INNER JOIN MOVIMIENTOS m ON mi.ka_nl_movimiento = m.ka_nl_movimiento
         WHERE m.ka_ni_fuente = 116 AND m.sc_anulado = 'N'
         AND mi.ka_nl_articulo IN (${closedArtIds})
         GROUP BY mi.ka_nl_articulo, mi.ss_talla, mi.ss_color`,
      );

      console.log("\n  Closed OP items vs ET production:");
      for (const ci of closedItems.slice(0, 10)) {
        const key = `${ci.ka_nl_articulo}|${ci.ss_talla}|${ci.ss_color}`;
        const etMatch = etForClosed.find(
          (e) => e.ka_nl_articulo === ci.ka_nl_articulo && e.ss_talla === ci.ss_talla && e.ss_color === ci.ss_color,
        );
        const etQty = Number(etMatch?.et_qty ?? 0);
        const opQty = Number(ci.qty);
        console.log(`    ${key.padEnd(25)} | OP: ${opQty} | ET: ${etQty} | ${etQty >= opQty ? "COMPLETED" : "PARTIAL"}`);
      }
    }
  }

  // 4d. Check ss_remision pattern — does it link OP → ET?
  // Hypothesis: OP.ss_remision = "{next_op_num}-1" (we saw this pattern)
  const remPattern = await q(
    "4d. OP ss_remision vs n_numero_documento pattern",
    `SELECT TOP 30 n_numero_documento, ss_remision
     FROM MOVIMIENTOS WHERE ka_ni_fuente = 33 AND sc_anulado = 'N'
     ORDER BY n_numero_documento DESC`,
  );
  if (remPattern.length > 0) {
    console.log("\n  OP number → ss_remision pattern:");
    for (const r of remPattern.slice(0, 15)) {
      console.log(`    OP #${r.n_numero_documento} → remision: "${r.ss_remision}"`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 5 — AGOTADOS WITH PRODUCTION
// ═══════════════════════════════════════════════════════════════════════════════

async function phase5(pending: any[]) {
  hr("PHASE 5: AGOTADOS WITH PRODUCTION CROSS-REFERENCE");

  const org = await prisma.organization.findUnique({
    where: { slug: "castillitos" },
    select: { id: true },
  });
  if (!org) { console.log("  castillitos org not found"); return; }

  // 5a. Get agotados (stock = 0) from ProductInventoryLevel
  const agotados = await prisma.productInventoryLevel.findMany({
    where: { organizationId: org.id, quantity: { lte: 0 } },
    include: {
      variant: { select: { id: true, sku: true } },
      product: { select: { id: true, sku: true, name: true } },
    },
    take: 200,
  });

  console.log(`\n  Agotados in Agentik: ${agotados.length} variants with stock <= 0`);

  // Build set of agotado references (product SKU)
  const agotadoRefs = new Map<string, { productName: string; variants: string[] }>();
  for (const a of agotados) {
    const ref = a.product?.sku ?? "";
    if (!ref) continue;
    const existing = agotadoRefs.get(ref) ?? { productName: a.product?.name ?? "", variants: [] };
    if (a.variant?.sku) existing.variants.push(a.variant.sku);
    agotadoRefs.set(ref, existing);
  }
  console.log(`  Unique agotado references: ${agotadoRefs.size}`);

  // 5b. Resolve SAG articulo IDs for agotado references
  const refList = [...agotadoRefs.keys()].slice(0, 50);
  const refQuoted = refList.map((r) => `'${r.replace(/'/g, "''")}'`).join(",");

  const sagArticulos = refQuoted
    ? await q(
        "5b. SAG articulos for agotado references",
        `SELECT ka_nl_articulo, k_sc_codigo_articulo FROM v_articulos WHERE k_sc_codigo_articulo IN (${refQuoted})`,
      )
    : [];

  const sagArtByRef = new Map<string, number>();
  for (const a of sagArticulos) {
    sagArtByRef.set(a.k_sc_codigo_articulo, a.ka_nl_articulo);
  }

  console.log(`  Agotado refs found in SAG: ${sagArtByRef.size} / ${refList.length}`);

  // 5c. Check OP items for agotado articulos (2026 only)
  if (sagArtByRef.size > 0) {
    const artIdList = [...sagArtByRef.values()].join(",");

    const opForAgotados = await q(
      "5c. OP items for agotado articulos (2026)",
      `SELECT mi.ka_nl_articulo, mi.ss_talla, mi.ss_color, SUM(mi.n_cantidad) AS op_qty
       FROM MOVIMIENTOS_ITEMS mi
       INNER JOIN MOVIMIENTOS m ON mi.ka_nl_movimiento = m.ka_nl_movimiento
       WHERE m.ka_ni_fuente = 33 AND m.sc_anulado = 'N'
       AND m.d_fecha_documento >= '2026-01-01'
       AND mi.ka_nl_articulo IN (${artIdList})
       GROUP BY mi.ka_nl_articulo, mi.ss_talla, mi.ss_color`,
    );

    const etForAgotados = await q(
      "5c-b. ET items for agotado articulos (2026)",
      `SELECT mi.ka_nl_articulo, mi.ss_talla, mi.ss_color, SUM(mi.n_cantidad) AS et_qty
       FROM MOVIMIENTOS_ITEMS mi
       INNER JOIN MOVIMIENTOS m ON mi.ka_nl_movimiento = m.ka_nl_movimiento
       WHERE m.ka_ni_fuente = 116 AND m.sc_anulado = 'N'
       AND m.d_fecha_documento >= '2026-01-01'
       AND mi.ka_nl_articulo IN (${artIdList})
       GROUP BY mi.ka_nl_articulo, mi.ss_talla, mi.ss_color`,
    );

    // Build ET lookup
    const etLookup = new Map<string, number>();
    for (const et of etForAgotados) {
      const key = `${et.ka_nl_articulo}|${et.ss_talla}|${et.ss_color}`;
      etLookup.set(key, Number(et.et_qty));
    }

    // Reverse lookup: artId → ref
    const refByArtId = new Map<number, string>();
    for (const [ref, artId] of sagArtByRef) refByArtId.set(artId, ref);

    let agotadasConProduccion = 0;
    let agotadasSinProduccion = 0;
    let agotadasParciales = 0;
    const results: string[] = [];

    // Group OP items by reference
    const opByRef = new Map<string, { opQty: number; etQty: number; items: { talla: string; color: string; opQty: number; etQty: number; pending: number }[] }>();

    for (const op of opForAgotados) {
      const ref = refByArtId.get(op.ka_nl_articulo) ?? "";
      if (!ref) continue;
      const key = `${op.ka_nl_articulo}|${op.ss_talla}|${op.ss_color}`;
      const opQty = Number(op.op_qty);
      const etQty = etLookup.get(key) ?? 0;
      const pendingQty = opQty - etQty;

      const existing = opByRef.get(ref) ?? { opQty: 0, etQty: 0, items: [] };
      existing.opQty += opQty;
      existing.etQty += etQty;
      existing.items.push({ talla: op.ss_talla, color: op.ss_color, opQty, etQty, pending: pendingQty });
      opByRef.set(ref, existing);
    }

    console.log("\n  AGOTADOS CROSS-REFERENCE RESULTS:");
    console.log("  " + "-".repeat(76));

    for (const [ref, info] of agotadoRefs) {
      const opData = opByRef.get(ref);

      if (!opData) {
        agotadasSinProduccion++;
        results.push(`  ${ref.padEnd(15)} | AGOTADA SIN PRODUCCION | ${info.productName.slice(0, 40)}`);
      } else {
        const totalPending = opData.opQty - opData.etQty;
        if (totalPending > 0) {
          agotadasConProduccion++;
          results.push(`  ${ref.padEnd(15)} | AGOTADA CON PRODUCCION | OP: ${opData.opQty} | ET: ${opData.etQty} | PEND: ${totalPending} | ${info.productName.slice(0, 30)}`);
        } else {
          agotadasParciales++;
          results.push(`  ${ref.padEnd(15)} | AGOTADA (produccion completada) | OP: ${opData.opQty} | ET: ${opData.etQty} | ${info.productName.slice(0, 30)}`);
        }
      }
    }

    // Sort: produccion activa first
    results.sort((a, b) => {
      if (a.includes("CON PRODUCCION") && !b.includes("CON PRODUCCION")) return -1;
      if (!a.includes("CON PRODUCCION") && b.includes("CON PRODUCCION")) return 1;
      return 0;
    });

    for (const r of results.slice(0, 40)) console.log(r);

    console.log("\n  SUMMARY:");
    console.log(`    Agotadas con produccion activa:     ${agotadasConProduccion}`);
    console.log(`    Agotadas sin produccion:            ${agotadasSinProduccion}`);
    console.log(`    Agotadas con produccion completada: ${agotadasParciales}`);
    console.log(`    Total evaluadas:                    ${agotadoRefs.size}`);

    // Show detailed items for first 3 agotadas con produccion
    const conProduccion = [...opByRef.entries()].filter(([_, d]) => d.opQty - d.etQty > 0).slice(0, 3);
    if (conProduccion.length > 0) {
      console.log("\n  DETAIL — Agotadas con produccion activa (first 3):");
      for (const [ref, data] of conProduccion) {
        console.log(`\n    ${ref} (OP total: ${data.opQty}, ET total: ${data.etQty}, Pendiente: ${data.opQty - data.etQty}):`);
        for (const item of data.items.filter((i) => i.pending > 0).slice(0, 10)) {
          console.log(`      talla: ${item.talla.padEnd(6)} | color: ${item.color.padEnd(5)} | OP: ${item.opQty} | ET: ${item.etQty} | Pend: ${item.pending}`);
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  hr("PRODUCTION-STATUS-VALIDATION-02");
  console.log(`Date: ${new Date().toISOString()}`);
  console.log("Mode: READ-ONLY — zero writes");

  await phase1();
  await phase2();
  const pending = await phase3();
  await phase4();
  await phase5(pending);

  await prisma.$disconnect();
  pool.end();

  hr("VALIDATION COMPLETE");
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
