/**
 * INVENTORY-VENDOR-WAREHOUSE-TRUTH-SYNC-01
 *
 * Forensic script: Query SAG DIRECTLY for vendor bodegas (ka_nl_bodega 45-50).
 * NO ProductInventoryLevel. NO snapshots. NO CommercialCoverageSnapshot.
 *
 * Phases:
 *   1. SAG direct inventory for bodegas 45-50 (MOVIMIENTOS_ITEMS signed sum)
 *   2. SAG BODEGAS table — validate mapping
 *   3. F34 transfers targeting bodegas 45-50 (last 24 months)
 *   4. Cross-reference: 10 known textile refs in bodegas 45-50
 *   5. PIL audit: what bodegas does the sync pipeline currently cover?
 *
 * Usage:
 *   npx tsx scripts/forensic-vendor-bodegas-sag-direct.ts
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import { loadSagTestEnv } from "@/lib/sag/env";

const VENDOR_BODEGAS = [45, 46, 47, 48, 49, 50];
const VENDOR_NAMES: Record<number, string> = {
  45: "VEND ORLANDO",
  46: "VEND CARLOS LEON",
  47: "VEND LUIS",
  48: "VEND NESTOR",
  49: "VEND CARLOS VILLA",
  50: "VEND FREDY",
};

async function main() {
  console.log("=".repeat(80));
  console.log("INVENTORY-VENDOR-WAREHOUSE-TRUTH-SYNC-01 — SAG Direct Forensics");
  console.log("=".repeat(80));
  console.log();

  const env = loadSagTestEnv();
  const config = {
    endpointUrl: env.endpointUrl,
    token: env.token,
    database: env.database,
  };

  // ─── PHASE 1: Direct SAG inventory for bodegas 45-50 ────────────────────

  console.log("PHASE 1: SAG direct inventory for vendor bodegas (ka_nl_bodega 45-50)");
  console.log("-".repeat(80));

  const inventoryQuery = `
    SELECT
      A.k_sc_codigo_articulo,
      A.sc_detalle_articulo,
      MI.ss_talla,
      MI.ss_color,
      MI.ka_nl_bodega,
      MI.ka_nl_sku,
      SUM(CASE WHEN F.sc_signo_inventario = '+' THEN MI.n_cantidad ELSE -MI.n_cantidad END) AS saldo
    FROM MOVIMIENTOS_ITEMS MI
    INNER JOIN MOVIMIENTOS M ON MI.ka_nl_movimiento = M.ka_nl_movimiento
    INNER JOIN FUENTES F ON M.ka_ni_fuente = F.ka_ni_fuente
    INNER JOIN ARTICULOS A ON MI.ka_nl_articulo = A.ka_nl_articulo
    WHERE F.sc_afecta_inventario = 'S'
      AND M.sc_anulado = 'N'
      AND MI.ka_nl_bodega IN (${VENDOR_BODEGAS.join(",")})
    GROUP BY A.k_sc_codigo_articulo, A.sc_detalle_articulo, MI.ss_talla, MI.ss_color, MI.ka_nl_bodega, MI.ka_nl_sku
    HAVING SUM(CASE WHEN F.sc_signo_inventario = '+' THEN MI.n_cantidad ELSE -MI.n_cantidad END) <> 0
    ORDER BY MI.ka_nl_bodega, A.k_sc_codigo_articulo
  `.trim();

  try {
    const rows = await consultaSagJson(config, inventoryQuery);
    console.log(`SAG returned ${rows.length} rows for bodegas 45-50\n`);

    // Group by bodega
    const byBodega = new Map<number, Array<Record<string, unknown>>>();
    for (const row of rows) {
      const bod = Number(row.ka_nl_bodega);
      if (!byBodega.has(bod)) byBodega.set(bod, []);
      byBodega.get(bod)!.push(row as Record<string, unknown>);
    }

    for (const bod of VENDOR_BODEGAS) {
      const bodRows = byBodega.get(bod) ?? [];
      const positive = bodRows.filter((r) => Number(r.saldo) > 0);
      const negative = bodRows.filter((r) => Number(r.saldo) < 0);
      const posUnits = positive.reduce((s, r) => s + Number(r.saldo), 0);
      const negUnits = negative.reduce((s, r) => s + Number(r.saldo), 0);
      const netUnits = posUnits + negUnits;

      console.log(`  Bodega ${bod} (${VENDOR_NAMES[bod] ?? "??"}):`);
      console.log(`    Total rows:    ${bodRows.length}`);
      console.log(`    Positive:      ${positive.length} rows, ${posUnits} units`);
      console.log(`    Negative:      ${negative.length} rows, ${negUnits} units`);
      console.log(`    Net:           ${netUnits} units`);

      if (positive.length > 0) {
        console.log(`    Top 5 positive:`);
        positive
          .sort((a, b) => Number(b.saldo) - Number(a.saldo))
          .slice(0, 5)
          .forEach((r) => {
            console.log(
              `      ${String(r.k_sc_codigo_articulo).padEnd(15)} ${String(r.sc_detalle_articulo).slice(0, 30).padEnd(32)} T:${String(r.ss_talla).padEnd(6)} C:${String(r.ss_color).padEnd(6)} saldo=${r.saldo}`,
            );
          });
      }
      console.log();
    }
  } catch (e) {
    console.error(`PHASE 1 ERROR: ${(e as Error).message}`);
    console.log();
  }

  // ─── PHASE 2: SAG BODEGAS table — validate mapping ──────────────────────

  console.log("PHASE 2: SAG BODEGAS table — validate ka_nl_bodega vs ss_codigo mapping");
  console.log("-".repeat(80));

  try {
    const bodegasQuery = `SELECT ka_nl_bodega, ss_codigo, ss_nombre FROM bodegas ORDER BY ka_nl_bodega`;
    const bodegaRows = await consultaSagJson(config, bodegasQuery);
    console.log(`SAG BODEGAS table: ${bodegaRows.length} rows\n`);

    // Focus on vendor bodegas
    console.log("  VENDOR BODEGAS:");
    for (const row of bodegaRows) {
      const id = Number(row.ka_nl_bodega);
      if (VENDOR_BODEGAS.includes(id)) {
        console.log(
          `    ka_nl=${id}  ss_codigo="${row.ss_codigo}"  nombre="${row.ss_nombre}"`,
        );
      }
    }

    // Also show bodegas 35-40 (the ones currently queried by Maletas)
    console.log("\n  BODEGAS CURRENTLY QUERIED BY MALETAS (ka_nl 35-40):");
    for (const row of bodegaRows) {
      const id = Number(row.ka_nl_bodega);
      if (id >= 35 && id <= 40) {
        console.log(
          `    ka_nl=${id}  ss_codigo="${row.ss_codigo}"  nombre="${row.ss_nombre}"`,
        );
      }
    }

    // Show bodegas where ss_codigo IN (35,36,37,38,39,40)
    console.log("\n  BODEGAS WHERE ss_codigo IN (35-40):");
    for (const row of bodegaRows) {
      const code = String(row.ss_codigo).trim();
      if (["35", "36", "37", "38", "39", "40"].includes(code)) {
        console.log(
          `    ka_nl=${row.ka_nl_bodega}  ss_codigo="${code}"  nombre="${row.ss_nombre}"`,
        );
      }
    }
    console.log();
  } catch (e) {
    console.error(`PHASE 2 ERROR: ${(e as Error).message}`);
    console.log();
  }

  // ─── PHASE 3: F34 transfers TO vendor bodegas (last 24 months) ──────────

  console.log("PHASE 3: F34/TM transfers TO vendor bodegas (last 24 months)");
  console.log("-".repeat(80));

  try {
    // movimientos_traslados has destination bodega info
    // First get transfer headers targeting vendor bodegas
    const transferHeaderQuery = `
      SELECT m.ka_nl_movimiento, m.n_numero_documento, m.d_fecha_documento,
             m.ka_ni_fuente, m.sc_anulado
      FROM MOVIMIENTOS m
      WHERE m.ka_ni_fuente IN (34, 206)
        AND m.sc_anulado = 'N'
        AND m.d_fecha_documento >= '2024-07-01'
      ORDER BY m.d_fecha_documento DESC
    `.trim();

    const transferHeaders = await consultaSagJson(config, transferHeaderQuery);
    console.log(`Total non-annulled transfers (F34/TM) since 2024-07-01: ${transferHeaders.length}`);

    if (transferHeaders.length > 0) {
      // Get transfer lines for these headers, filtered to vendor bodegas as destination
      const movIds = transferHeaders.map((h) => Number(h.ka_nl_movimiento)).filter((id) => id > 0);

      // Process in batches to avoid huge IN clauses
      const BATCH = 200;
      let vendorTransferLines: Record<string, unknown>[] = [];

      for (let i = 0; i < movIds.length; i += BATCH) {
        const batch = movIds.slice(i, i + BATCH);
        const linesQuery = `
          SELECT mt.ka_nl_movimiento, mt.ka_nl_articulo, mt.ss_talla, mt.ss_color,
                 mt.n_cantidad, mt.ka_nl_bodega_destino, mt.ka_nl_bodega_origen,
                 v.k_sc_codigo_articulo, v.sc_detalle_articulo
          FROM movimientos_traslados mt
          LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
          WHERE mt.ka_nl_movimiento IN (${batch.join(",")})
            AND mt.ka_nl_bodega_destino IN (${VENDOR_BODEGAS.join(",")})
        `.trim();

        try {
          const batchLines = await consultaSagJson(config, linesQuery);
          vendorTransferLines = vendorTransferLines.concat(batchLines);
        } catch (e) {
          console.error(`  Batch ${i}-${i + BATCH} error: ${(e as Error).message.slice(0, 100)}`);
        }
      }

      console.log(`Transfer lines TO vendor bodegas: ${vendorTransferLines.length}\n`);

      // Group by destination bodega
      const byDest = new Map<number, Array<Record<string, unknown>>>();
      for (const line of vendorTransferLines) {
        const dest = Number(line.ka_nl_bodega_destino);
        if (!byDest.has(dest)) byDest.set(dest, []);
        byDest.get(dest)!.push(line);
      }

      for (const bod of VENDOR_BODEGAS) {
        const lines = byDest.get(bod) ?? [];
        const totalQty = lines.reduce((s, r) => s + Number(r.n_cantidad), 0);
        console.log(`  Bodega ${bod} (${VENDOR_NAMES[bod]}): ${lines.length} transfer lines, ${totalQty} total units`);

        if (lines.length > 0) {
          // Show some sample lines
          const sample = lines.slice(0, 3);
          for (const l of sample) {
            console.log(
              `    REF: ${String(l.k_sc_codigo_articulo ?? "?").padEnd(15)} ${String(l.sc_detalle_articulo ?? "").slice(0, 25).padEnd(27)} qty=${l.n_cantidad} from_bod=${l.ka_nl_bodega_origen}`,
            );
          }
          if (lines.length > 3) console.log(`    ... and ${lines.length - 3} more`);
        }
      }

      // Also check: any F34 lines FROM vendor bodegas (outgoing)
      console.log("\n  Checking F34 lines FROM vendor bodegas (outgoing):");
      let vendorOutgoingLines: Record<string, unknown>[] = [];
      for (let i = 0; i < movIds.length; i += BATCH) {
        const batch = movIds.slice(i, i + BATCH);
        const outQuery = `
          SELECT mt.ka_nl_movimiento, mt.ka_nl_articulo, mt.ss_talla, mt.ss_color,
                 mt.n_cantidad, mt.ka_nl_bodega_destino, mt.ka_nl_bodega_origen,
                 v.k_sc_codigo_articulo
          FROM movimientos_traslados mt
          LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
          WHERE mt.ka_nl_movimiento IN (${batch.join(",")})
            AND mt.ka_nl_bodega_origen IN (${VENDOR_BODEGAS.join(",")})
        `.trim();

        try {
          const batchLines = await consultaSagJson(config, outQuery);
          vendorOutgoingLines = vendorOutgoingLines.concat(batchLines);
        } catch {
          // ignore batch errors
        }
      }
      console.log(`  Total outgoing transfer lines FROM vendor bodegas: ${vendorOutgoingLines.length}`);

      if (vendorOutgoingLines.length > 0) {
        const byOrig = new Map<number, number>();
        for (const l of vendorOutgoingLines) {
          const orig = Number(l.ka_nl_bodega_origen);
          byOrig.set(orig, (byOrig.get(orig) ?? 0) + 1);
        }
        for (const [bod, count] of byOrig.entries()) {
          console.log(`    Bodega ${bod} (${VENDOR_NAMES[bod] ?? "??"}): ${count} outgoing lines`);
        }
      }
    }
    console.log();
  } catch (e) {
    console.error(`PHASE 3 ERROR: ${(e as Error).message}`);
    console.log();
  }

  // ─── PHASE 4: ALL MOVIMIENTOS_ITEMS for vendor bodegas (count + types) ──

  console.log("PHASE 4: ALL movements touching vendor bodegas (45-50) — raw count + fuente types");
  console.log("-".repeat(80));

  try {
    const movCountQuery = `
      SELECT MI.ka_nl_bodega, F.ka_ni_fuente,
             COUNT(*) AS total_rows,
             SUM(CASE WHEN F.sc_signo_inventario = '+' THEN MI.n_cantidad ELSE 0 END) AS total_in,
             SUM(CASE WHEN F.sc_signo_inventario = '-' THEN MI.n_cantidad ELSE 0 END) AS total_out
      FROM MOVIMIENTOS_ITEMS MI
      INNER JOIN MOVIMIENTOS M ON MI.ka_nl_movimiento = M.ka_nl_movimiento
      INNER JOIN FUENTES F ON M.ka_ni_fuente = F.ka_ni_fuente
      WHERE MI.ka_nl_bodega IN (${VENDOR_BODEGAS.join(",")})
        AND M.sc_anulado = 'N'
      GROUP BY MI.ka_nl_bodega, F.ka_ni_fuente
      ORDER BY MI.ka_nl_bodega, total_rows DESC
    `.trim();

    const movRows = await consultaSagJson(config, movCountQuery);
    console.log(`SAG returned ${movRows.length} bodega/fuente combinations\n`);

    // Group by bodega
    const byBod = new Map<number, Array<Record<string, unknown>>>();
    for (const row of movRows) {
      const bod = Number(row.ka_nl_bodega);
      if (!byBod.has(bod)) byBod.set(bod, []);
      byBod.get(bod)!.push(row as Record<string, unknown>);
    }

    for (const bod of VENDOR_BODEGAS) {
      const fuenteRows = byBod.get(bod) ?? [];
      console.log(`  Bodega ${bod} (${VENDOR_NAMES[bod]}):`);
      if (fuenteRows.length === 0) {
        console.log("    NO MOVEMENTS AT ALL");
      } else {
        const totalRows = fuenteRows.reduce((s, r) => s + Number(r.total_rows), 0);
        const totalIn = fuenteRows.reduce((s, r) => s + Number(r.total_in), 0);
        const totalOut = fuenteRows.reduce((s, r) => s + Number(r.total_out), 0);
        console.log(`    Total: ${totalRows} movement items, IN=${totalIn}, OUT=${totalOut}`);
        for (const fr of fuenteRows) {
          console.log(
            `      Fuente ${String(fr.ka_ni_fuente).padEnd(4)}: ${String(fr.total_rows).padStart(6)} rows, IN=${String(fr.total_in).padStart(8)}, OUT=${String(fr.total_out).padStart(8)}`,
          );
        }
      }
      console.log();
    }
  } catch (e) {
    console.error(`PHASE 4 ERROR: ${(e as Error).message}`);
    console.log();
  }

  // ─── PHASE 5: PIL audit — which bodegas exist in PIL? ──────────────────

  console.log("PHASE 5: PIL audit — which bodegas does the sync pipeline store?");
  console.log("-".repeat(80));

  try {
    // This uses Prisma, need DATABASE_URL
    const { prisma } = await import("@/lib/prisma");
    const db = prisma as any;

    const pilBodegas = await db.$queryRawUnsafe(`
      SELECT "warehouseId",
             COUNT(*)::int AS total_rows,
             SUM(CASE WHEN quantity > 0 THEN 1 ELSE 0 END)::int AS positive_rows,
             SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END)::int AS positive_units,
             SUM(CASE WHEN quantity < 0 THEN 1 ELSE 0 END)::int AS negative_rows,
             MIN("syncedAt") AS first_sync,
             MAX("syncedAt") AS last_sync
      FROM "ProductInventoryLevel"
      WHERE source = 'sag'
      GROUP BY "warehouseId"
      ORDER BY "warehouseId"::int
    `);

    console.log(`PIL contains ${pilBodegas.length} distinct warehouseId values\n`);
    console.log(`  ${"warehouseId".padEnd(14)} ${"rows".padStart(8)} ${"pos".padStart(8)} ${"posUnits".padStart(10)} ${"neg".padStart(8)} ${"firstSync".padEnd(22)} ${"lastSync".padEnd(22)}`);
    console.log(`  ${"-".repeat(94)}`);
    for (const row of pilBodegas as any[]) {
      const isVendor = VENDOR_BODEGAS.map(String).includes(row.warehouseId);
      const marker = isVendor ? " <-- VENDOR" : "";
      console.log(
        `  ${String(row.warehouseId).padEnd(14)} ${String(row.total_rows).padStart(8)} ${String(row.positive_rows).padStart(8)} ${String(row.positive_units).padStart(10)} ${String(row.negative_rows).padStart(8)} ${String(row.first_sync ?? "—").slice(0, 20).padEnd(22)} ${String(row.last_sync ?? "—").slice(0, 20).padEnd(22)}${marker}`,
      );
    }

    // Check if vendor bodegas (45-50) exist in PIL at all
    console.log("\n  Vendor bodegas in PIL:");
    for (const bod of VENDOR_BODEGAS) {
      const found = (pilBodegas as any[]).find((r: any) => r.warehouseId === String(bod));
      if (found) {
        console.log(`    ${bod} (${VENDOR_NAMES[bod]}): ${found.total_rows} rows, ${found.positive_rows} positive`);
      } else {
        console.log(`    ${bod} (${VENDOR_NAMES[bod]}): NOT IN PIL`);
      }
    }

    await db.$disconnect();
  } catch (e) {
    console.error(`PHASE 5 ERROR: ${(e as Error).message}`);
  }

  console.log();
  console.log("=".repeat(80));
  console.log("FORENSICS COMPLETE");
  console.log("=".repeat(80));
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
