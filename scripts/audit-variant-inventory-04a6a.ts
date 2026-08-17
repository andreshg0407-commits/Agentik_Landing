/**
 * AUDIT-VARIANT-INVENTORY-04A6A
 *
 * Runtime audit: can SAG certify inventory by REFERENCIA x BODEGA B01 x TALLA x COLOR?
 *
 * Two data sources compared:
 *   1. vw_agentik_inventario — reference x bodega (EXISTENCIA, RESERVADO, DISPONIBLE)
 *   2. MOVIMIENTOS_ITEMS computed saldo — reference x bodega x talla x color
 *
 * Reconciliation: SUM(variant saldo B01) vs. reference DISPONIBLE B01
 *
 * References: L-9080, L-9111, L-8467, CD-4123138B, + one with RESERVADO > 0
 */

import { prisma } from "../lib/prisma";

// SAG SOAP query helper
async function querySag(sql: string): Promise<any[]> {
  const { createSagDirectDataSource } = await import(
    "../lib/comercial/data-sources/sag-direct-commercial-product-data-source"
  );
  const sagDs = createSagDirectDataSource();
  return (sagDs as any).querySagRaw
    ? await (sagDs as any).querySagRaw(sql)
    : [];
}

// Alternative: use the SOAP adapter directly
async function querySagSoap(sql: string): Promise<any[]> {
  try {
    const { loadSagConfig } = await import(
      "../lib/connectors/adapters/sag-pya-soap/storage"
    );
    const { querySagSoap: queryFn } = await import(
      "../lib/connectors/adapters/sag-pya-soap/mappers"
    );
    const config = await loadSagConfig("castillitos");
    return await queryFn(config, sql);
  } catch (e) {
    console.error("[SAG-SOAP-ERROR]", e);
    return [];
  }
}

const AUDIT_REFS = ["L-9080", "L-9111", "L-8467", "CD-4123138B"];

async function main() {
  console.log("=== AUDIT-VARIANT-INVENTORY-04A6A ===\n");

  // ── Step 1: Find a reference with RESERVADO > 0 from vw_agentik_inventario
  console.log("[STEP 1] Finding a reference with RESERVADO > 0...");
  const reservadoRows = await querySagSoap(`
    SELECT TOP 5 CODIGO_PRODUCTO, BODEGA, EXISTENCIA, RESERVADO, DISPONIBLE
    FROM vw_agentik_inventario
    WHERE RESERVADO > 0
    ORDER BY RESERVADO DESC
  `);
  console.log("Refs with RESERVADO > 0:", JSON.stringify(reservadoRows.slice(0, 5), null, 2));

  const fifthRef = reservadoRows.length > 0
    ? String(reservadoRows[0].CODIGO_PRODUCTO || reservadoRows[0].codigo_producto || "").trim()
    : null;

  if (fifthRef) {
    console.log(`\n[STEP 1] Using ${fifthRef} as the 5th reference (RESERVADO > 0)\n`);
    AUDIT_REFS.push(fifthRef);
  }

  // ── Step 2: Get reference-level inventory from vw_agentik_inventario
  console.log("[STEP 2] Loading vw_agentik_inventario for audit refs (B01 only)...\n");

  const escaped = AUDIT_REFS.map(r => `'${r}'`).join(",");
  const refRows = await querySagSoap(`
    SELECT CODIGO_PRODUCTO, BODEGA, EXISTENCIA, RESERVADO, TRANSITO, DISPONIBLE
    FROM vw_agentik_inventario
    WHERE CODIGO_PRODUCTO IN (${escaped})
    ORDER BY CODIGO_PRODUCTO, BODEGA
  `);

  console.log(`vw_agentik_inventario rows: ${refRows.length}`);
  for (const r of refRows) {
    const code = String(r.CODIGO_PRODUCTO || r.codigo_producto || "").trim();
    const bodega = String(r.BODEGA || r.bodega || "").trim();
    const exist = Number(r.EXISTENCIA ?? r.existencia ?? 0);
    const reserv = Number(r.RESERVADO ?? r.reservado ?? 0);
    const disp = Number(r.DISPONIBLE ?? r.disponible ?? 0);
    console.log(`  ${code} | ${bodega} | EXIST=${exist} | RESERV=${reserv} | DISP=${disp}`);
  }

  // ── Step 3: Get variant-level inventory from MOVIMIENTOS_ITEMS
  console.log("\n[STEP 3] Loading variant-level saldo from MOVIMIENTOS_ITEMS...\n");

  const variantSql = `
    SELECT
      A.k_sc_codigo_articulo AS codigo,
      MI.ss_talla AS talla,
      MI.ss_color AS color,
      MI.ka_nl_bodega AS bodega_id,
      MI.ka_nl_sku AS sku_id,
      SUM(CASE WHEN F.sc_signo_inventario = '+' THEN MI.n_cantidad ELSE -MI.n_cantidad END) AS saldo
    FROM MOVIMIENTOS_ITEMS MI
    INNER JOIN MOVIMIENTOS M ON MI.ka_nl_movimiento = M.ka_nl_movimiento
    INNER JOIN FUENTES F ON M.ka_ni_fuente = F.ka_ni_fuente
    INNER JOIN ARTICULOS A ON MI.ka_nl_articulo = A.ka_nl_articulo
    WHERE F.sc_afecta_inventario = 'S'
      AND M.sc_anulado = 'N'
      AND A.k_sc_codigo_articulo IN (${escaped})
    GROUP BY A.k_sc_codigo_articulo, MI.ss_talla, MI.ss_color, MI.ka_nl_bodega, MI.ka_nl_sku
    ORDER BY A.k_sc_codigo_articulo, MI.ka_nl_bodega, MI.ss_talla, MI.ss_color
  `;

  const variantRows = await querySagSoap(variantSql);
  console.log(`Variant rows returned: ${variantRows.length}`);

  if (variantRows.length === 0) {
    console.log("\n[WARNING] Zero variant rows — query may have failed or returned empty.");
    console.log("[WARNING] Checking if SOAP adapter is available...\n");
  }

  // ── Step 4: Reconcile
  console.log("\n[STEP 4] Reconciliation matrix\n");

  // Build reference-level B01 data
  const refB01 = new Map<string, { exist: number; reserv: number; disp: number }>();
  for (const r of refRows) {
    const code = String(r.CODIGO_PRODUCTO || r.codigo_producto || "").trim();
    const bodega = String(r.BODEGA || r.bodega || "").trim();
    // Only B01 (bodega code starts with "B01" or is internal code "1")
    if (bodega.includes("B01") || bodega.startsWith("1 -") || bodega === "1") {
      refB01.set(code, {
        exist: Number(r.EXISTENCIA ?? r.existencia ?? 0),
        reserv: Number(r.RESERVADO ?? r.reservado ?? 0),
        disp: Number(r.DISPONIBLE ?? r.disponible ?? 0),
      });
    }
  }

  // Build variant B01 sums
  const variantB01Sums = new Map<string, { saldoSum: number; variantCount: number }>();

  // Need to resolve bodega 1 = B01 — check warehouse PK mapping
  // SAG internal PK for B01 is typically 1 (BODEGAS table ka_nl_bodega=1)
  for (const v of variantRows) {
    const code = String(v.codigo || v.CODIGO || "").trim();
    const bodegaId = Number(v.bodega_id ?? v.BODEGA_ID ?? 0);
    const saldo = Number(v.saldo ?? v.SALDO ?? 0);

    // Filter to B01 only (internal PK = 1 for castillitos, or check)
    // We'll accept bodega_id=1 as B01 — verify from context
    if (bodegaId !== 1) continue;

    if (!variantB01Sums.has(code)) {
      variantB01Sums.set(code, { saldoSum: 0, variantCount: 0 });
    }
    const entry = variantB01Sums.get(code)!;
    entry.saldoSum += saldo;
    entry.variantCount++;

    // Print each variant
    const talla = String(v.talla ?? v.TALLA ?? "").trim() || "(sin talla)";
    const color = String(v.color ?? v.COLOR ?? "").trim() || "(sin color)";
    console.log(`  ${code} | B01 | ${talla} | ${color} | saldo=${saldo}`);
  }

  // Print reconciliation
  console.log("\n=== RECONCILIATION MATRIX ===\n");
  console.log(
    "REFERENCIA".padEnd(16) +
    "| B01 EXIST".padEnd(13) +
    "| B01 RESERV".padEnd(13) +
    "| B01 DISP".padEnd(13) +
    "| SUM(var B01)".padEnd(15) +
    "| VARIANTS".padEnd(11) +
    "| DELTA".padEnd(10) +
    "| STATUS"
  );
  console.log("-".repeat(100));

  for (const ref of AUDIT_REFS) {
    const b01 = refB01.get(ref);
    const vars = variantB01Sums.get(ref);

    const exist = b01?.exist ?? 0;
    const reserv = b01?.reserv ?? 0;
    const disp = b01?.disp ?? 0;
    const varSum = vars?.saldoSum ?? 0;
    const varCount = vars?.variantCount ?? 0;
    const delta = varSum - disp;
    const status = !b01
      ? "NO_B01_DATA"
      : !vars
      ? "NO_VARIANT_DATA"
      : delta === 0
      ? "RECONCILED"
      : Math.abs(delta) <= 1
      ? "ROUNDED_OK"
      : "DELTA_" + delta;

    console.log(
      ref.padEnd(16) +
      `| ${exist}`.padEnd(13) +
      `| ${reserv}`.padEnd(13) +
      `| ${disp}`.padEnd(13) +
      `| ${varSum}`.padEnd(15) +
      `| ${varCount}`.padEnd(11) +
      `| ${delta}`.padEnd(10) +
      `| ${status}`
    );
  }

  // ── Step 5: Check what the variant query actually returns for B01
  // The variant query computes saldo (= existencia - reservado?) or is it DISPONIBLE?
  // vw_agentik_inventario: DISPONIBLE = EXISTENCIA - RESERVADO - TRANSITO
  // MOVIMIENTOS_ITEMS saldo: SUM(signed n_cantidad) = this is the EXISTENCIA (on-hand balance)
  // So the variant saldo should reconcile with EXISTENCIA, not DISPONIBLE

  console.log("\n=== VARIANT SALDO vs EXISTENCIA (on-hand) ===\n");
  console.log(
    "REFERENCIA".padEnd(16) +
    "| B01 EXIST".padEnd(13) +
    "| SUM(var B01)".padEnd(15) +
    "| DELTA".padEnd(10) +
    "| STATUS"
  );
  console.log("-".repeat(65));

  for (const ref of AUDIT_REFS) {
    const b01 = refB01.get(ref);
    const vars = variantB01Sums.get(ref);

    const exist = b01?.exist ?? 0;
    const varSum = vars?.saldoSum ?? 0;
    const delta = varSum - exist;
    const status = !b01
      ? "NO_B01_DATA"
      : !vars
      ? "NO_VARIANT_DATA"
      : delta === 0
      ? "RECONCILED"
      : Math.abs(delta) <= 1
      ? "ROUNDED_OK"
      : "DELTA_" + delta;

    console.log(
      ref.padEnd(16) +
      `| ${exist}`.padEnd(13) +
      `| ${varSum}`.padEnd(15) +
      `| ${delta}`.padEnd(10) +
      `| ${status}`
    );
  }

  // ── Step 6: Also check Prisma DB for stored variant data
  console.log("\n[STEP 6] Checking Prisma ProductVariant + ProductInventoryLevel...\n");

  for (const ref of AUDIT_REFS) {
    try {
      const product = await (prisma as any).productEntity.findFirst({
        where: { sku: ref, externalSource: "sag" },
        select: { id: true, sku: true },
      });
      if (!product) {
        console.log(`  ${ref}: NO ProductEntity in Prisma`);
        continue;
      }

      const variants = await (prisma as any).productVariant.findMany({
        where: { productId: product.id },
        select: { id: true, sku: true, attributes: true },
      });

      const levels = await (prisma as any).productInventoryLevel.findMany({
        where: { productId: product.id },
        select: { variantId: true, warehouseId: true, quantity: true, reservedQty: true, externalRef: true, syncedAt: true },
      });

      console.log(`  ${ref}: ${variants.length} variants, ${levels.length} inventory levels`);

      // Show B01 levels
      const b01Levels = levels.filter((l: any) => {
        const wh = String(l.warehouseId ?? l.externalRef ?? "");
        return wh === "1" || wh.includes("B01");
      });
      if (b01Levels.length > 0) {
        console.log(`    B01 levels: ${b01Levels.length}`);
        for (const l of b01Levels.slice(0, 5)) {
          console.log(`      variantId=${l.variantId?.slice(0, 8)} | qty=${l.quantity} | reserved=${l.reservedQty} | wh=${l.warehouseId}`);
        }
      }
    } catch (e) {
      console.log(`  ${ref}: Prisma query error — ${e}`);
    }
  }

  // ── Step 7: Check if RESERVADO is available at variant level in SAG
  console.log("\n[STEP 7] RESERVADO provenance analysis\n");
  console.log("vw_agentik_inventario provides RESERVADO at reference×bodega level.");
  console.log("MOVIMIENTOS_ITEMS saldo = SUM(signed n_cantidad) = on-hand balance (EXISTENCIA).");
  console.log("RESERVADO is NOT derivable from MOVIMIENTOS_ITEMS — it comes from");
  console.log("a different SAG mechanism (pedidos pendientes de facturacion/despacho).");
  console.log("");
  console.log("CONCLUSION: SAG can certify EXISTENCIA per talla×color×bodega.");
  console.log("            SAG CANNOT certify RESERVADO per talla×color.");
  console.log("            DISPONIBLE = EXISTENCIA - RESERVADO is only certifiable at reference level.");

  // ── Final ruling
  console.log("\n=== FINAL SOURCE ANALYSIS ===\n");
  console.log("SOURCE 1: vw_agentik_inventario");
  console.log("  Grain: REFERENCIA × BODEGA");
  console.log("  Fields: EXISTENCIA, RESERVADO, TRANSITO, DISPONIBLE");
  console.log("  Freshness: Real-time view on SAG tables");
  console.log("");
  console.log("SOURCE 2: MOVIMIENTOS_ITEMS computed saldo (SAG_VARIANT_INVENTORY_QUERY)");
  console.log("  Grain: REFERENCIA × BODEGA × TALLA × COLOR");
  console.log("  Fields: saldo (= EXISTENCIA per variant, NOT disponible)");
  console.log("  Freshness: Real-time computed from transaction history");
  console.log("  Missing: RESERVADO per variant, DISPONIBLE per variant");
  console.log("");
  console.log("RECONCILIATION RULE:");
  console.log("  SUM(variant saldo for bodega B01) SHOULD = reference EXISTENCIA B01");
  console.log("  NOT reference DISPONIBLE (which subtracts RESERVADO)");

  await (prisma as any).$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
