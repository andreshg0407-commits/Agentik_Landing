/**
 * VENDOR-SAMPLE-LEDGER-RECONCILIATION-01
 *
 * Forensic reconciliation: validates the F34-based presence engine
 * against the raw SAG transfer ledger.
 *
 * Phases:
 *   1. Extract full F34 ledger for bodegas 45-50
 *   2. Reconstruct balance per vendor per reference
 *   3. Validate presence (PRESENTE/AUSENTE/ANOMALIA_EXCESO/ANOMALIA_NEGATIVO)
 *   4. Compare engine output vs raw ledger
 *   5. Devoluciones (returns)
 *   6. Replacement patterns
 *   7. Double presences (netBalance > 1)
 *   8. Negatives (netBalance < 0)
 *   9. Antiquity analysis
 *  10. Certified coverage table
 *
 * Usage:
 *   npx tsx scripts/forensic-vendor-ledger-reconciliation.ts
 */

import { consultaSagJson } from "@/lib/connectors/pya/client";
import { loadSagTestEnv } from "@/lib/sag/env";

const VENDOR_BODEGAS = [45, 46, 47, 48, 49, 50] as const;
const VENDOR_NAMES: Record<number, string> = {
  45: "ORLANDO",
  46: "CARLOS LEON",
  47: "LUIS",
  48: "NESTOR",
  49: "CARLOS VILLA",
  50: "FREDY",
};

// Expected ref counts from forensics audit (INVENTORY-VENDOR-WAREHOUSE-TRUTH-SYNC-01)
const EXPECTED_REFS: Record<number, number> = {
  45: 209, 46: 259, 47: 0, 48: 240, 49: 271, 50: 4,
};

// ── Types ────────────────────────────────────────────────────────────────────

interface LedgerLine {
  fecha: string;
  documento: number;
  ref: string;
  descr: string;
  talla: string;
  color: string;
  bodegaOrigen: number;
  bodegaDestino: number;
  cantidad: number;
  direction: "IN" | "OUT"; // relative to vendor bodega
  vendorBodega: number;
}

interface RefBalance {
  ref: string;
  descr: string;
  entradas: number;
  salidas: number;
  netBalance: number;
  primerMovimiento: string;
  ultimoMovimiento: string;
  status: "PRESENTE" | "AUSENTE" | "ANOMALIA_EXCESO" | "ANOMALIA_NEGATIVO";
  variants: number; // distinct talla/color combinations
}

interface VendorLedger {
  bodega: number;
  name: string;
  totalLines: number;
  refs: Map<string, RefBalance>;
  presentes: number;
  ausentes: number;
  anomaliaExceso: number;
  anomaliaNegativo: number;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(90));
  console.log("VENDOR-SAMPLE-LEDGER-RECONCILIATION-01 — Forensic Reconciliation");
  console.log("Date:", new Date().toISOString());
  console.log("=".repeat(90));
  console.log();

  const env = loadSagTestEnv();
  const config = {
    endpointUrl: env.endpointUrl,
    token: env.token,
    database: env.database,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: Extract full F34 ledger for bodegas 45-50
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("PHASE 1: FULL F34 LEDGER — bodegas 45-50");
  console.log("-".repeat(90));

  // Query: ALL transfer lines involving vendor bodegas (as origin OR destination)
  const fullLedgerQuery = `
SELECT
  m.d_fecha_documento AS fecha,
  m.n_numero_documento AS documento,
  v.k_sc_codigo_articulo AS ref,
  v.sc_detalle_articulo AS descr,
  mt.ss_talla,
  mt.ss_color,
  mt.ka_nl_bodega_origen,
  mt.ka_nl_bodega_destino,
  mt.nd_cantidad
FROM movimientos_traslados mt
INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
WHERE m.sc_anulado = 'N'
  AND (mt.ka_nl_bodega_destino IN (45,46,47,48,49,50)
    OR mt.ka_nl_bodega_origen IN (45,46,47,48,49,50))
ORDER BY m.d_fecha_documento DESC
  `.trim();

  let rawLedger: Record<string, unknown>[] = [];
  try {
    rawLedger = await consultaSagJson(config, fullLedgerQuery);
    console.log(`SAG returned ${rawLedger.length} total transfer lines\n`);
  } catch (e) {
    console.error(`PHASE 1 FATAL: ${(e as Error).message}`);
    process.exit(1);
  }

  // Parse into typed ledger lines
  const ledgerLines: LedgerLine[] = [];
  for (const row of rawLedger) {
    const origen = Number(row.ka_nl_bodega_origen);
    const destino = Number(row.ka_nl_bodega_destino);
    const qty = Number(row.nd_cantidad) || 0;
    const ref = String(row.ref ?? "").trim();
    if (!ref) continue;

    // A line can involve a vendor bodega as destination (IN) or origin (OUT)
    for (const bod of VENDOR_BODEGAS) {
      if (destino === bod) {
        ledgerLines.push({
          fecha: String(row.fecha ?? ""),
          documento: Number(row.documento),
          ref,
          descr: String(row.descr ?? ""),
          talla: String(row.ss_talla ?? ""),
          color: String(row.ss_color ?? ""),
          bodegaOrigen: origen,
          bodegaDestino: destino,
          cantidad: qty,
          direction: "IN",
          vendorBodega: bod,
        });
      }
      if (origen === bod) {
        ledgerLines.push({
          fecha: String(row.fecha ?? ""),
          documento: Number(row.documento),
          ref,
          descr: String(row.descr ?? ""),
          talla: String(row.ss_talla ?? ""),
          color: String(row.ss_color ?? ""),
          bodegaOrigen: origen,
          bodegaDestino: destino,
          cantidad: qty,
          direction: "OUT",
          vendorBodega: bod,
        });
      }
    }
  }

  console.log(`Parsed ${ledgerLines.length} directional ledger lines\n`);

  // Stats per bodega
  for (const bod of VENDOR_BODEGAS) {
    const lines = ledgerLines.filter((l) => l.vendorBodega === bod);
    const inLines = lines.filter((l) => l.direction === "IN");
    const outLines = lines.filter((l) => l.direction === "OUT");
    const inQty = inLines.reduce((s, l) => s + l.cantidad, 0);
    const outQty = outLines.reduce((s, l) => s + l.cantidad, 0);
    console.log(
      `  B${bod} ${VENDOR_NAMES[bod].padEnd(14)}: ` +
      `${String(lines.length).padStart(5)} lines | ` +
      `IN: ${String(inLines.length).padStart(4)} lines ${String(inQty).padStart(5)} units | ` +
      `OUT: ${String(outLines.length).padStart(4)} lines ${String(outQty).padStart(5)} units | ` +
      `NET: ${String(inQty - outQty).padStart(5)}`
    );
  }
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: Reconstruct balance per vendor per reference
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("PHASE 2: BALANCE PER VENDOR PER REFERENCE");
  console.log("-".repeat(90));

  const vendorLedgers = new Map<number, VendorLedger>();

  for (const bod of VENDOR_BODEGAS) {
    const lines = ledgerLines.filter((l) => l.vendorBodega === bod);
    const refMap = new Map<string, RefBalance>();

    for (const line of lines) {
      const existing = refMap.get(line.ref);
      if (existing) {
        if (line.direction === "IN") {
          existing.entradas += line.cantidad;
        } else {
          existing.salidas += line.cantidad;
        }
        existing.netBalance = existing.entradas - existing.salidas;
        if (line.fecha < existing.primerMovimiento) existing.primerMovimiento = line.fecha;
        if (line.fecha > existing.ultimoMovimiento) existing.ultimoMovimiento = line.fecha;
        // Track variants
        // (tracked separately below)
      } else {
        refMap.set(line.ref, {
          ref: line.ref,
          descr: line.descr,
          entradas: line.direction === "IN" ? line.cantidad : 0,
          salidas: line.direction === "OUT" ? line.cantidad : 0,
          netBalance: line.direction === "IN" ? line.cantidad : -line.cantidad,
          primerMovimiento: line.fecha,
          ultimoMovimiento: line.fecha,
          status: "PRESENTE", // will be recalculated
          variants: 0,
        });
      }
    }

    // Count distinct talla/color variants per ref
    for (const [ref, balance] of refMap) {
      const refLines = lines.filter((l) => l.ref === ref);
      const variants = new Set(refLines.map((l) => `${l.talla}|${l.color}`));
      balance.variants = variants.size;
    }

    // Classify
    let presentes = 0, ausentes = 0, anomExceso = 0, anomNeg = 0;
    for (const balance of refMap.values()) {
      if (balance.netBalance === 1) {
        balance.status = "PRESENTE";
        presentes++;
      } else if (balance.netBalance === 0) {
        balance.status = "AUSENTE";
        ausentes++;
      } else if (balance.netBalance > 1) {
        balance.status = "ANOMALIA_EXCESO";
        anomExceso++;
      } else {
        balance.status = "ANOMALIA_NEGATIVO";
        anomNeg++;
      }
    }

    vendorLedgers.set(bod, {
      bodega: bod,
      name: VENDOR_NAMES[bod],
      totalLines: lines.length,
      refs: refMap,
      presentes,
      ausentes,
      anomaliaExceso: anomExceso,
      anomaliaNegativo: anomNeg,
    });

    console.log(
      `  B${bod} ${VENDOR_NAMES[bod].padEnd(14)}: ` +
      `${String(refMap.size).padStart(4)} refs total | ` +
      `PRESENTE=${String(presentes).padStart(3)} | ` +
      `AUSENTE=${String(ausentes).padStart(3)} | ` +
      `EXCESO=${String(anomExceso).padStart(3)} | ` +
      `NEGATIVO=${String(anomNeg).padStart(3)}`
    );
  }
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: Validate presence classification
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("PHASE 3: PRESENCE VALIDATION");
  console.log("-".repeat(90));

  for (const bod of VENDOR_BODEGAS) {
    const vl = vendorLedgers.get(bod)!;
    const expected = EXPECTED_REFS[bod];
    const actualPresent = vl.presentes + vl.anomaliaExceso; // netBalance > 0

    console.log(
      `  B${bod} ${vl.name.padEnd(14)}: ` +
      `ledger_present=${String(actualPresent).padStart(3)} | ` +
      `expected=${String(expected).padStart(3)} | ` +
      `delta=${String(actualPresent - expected).padStart(4)} | ` +
      (Math.abs(actualPresent - expected) <= 5 ? "OK" : "INVESTIGATE")
    );
  }
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 4: Compare engine output vs raw ledger
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("PHASE 4: ENGINE vs LEDGER COMPARISON");
  console.log("-".repeat(90));

  // Run the engine's exact query (HAVING > 0, aggregated by ref)
  for (const bod of VENDOR_BODEGAS) {
    const vl = vendorLedgers.get(bod)!;
    if (vl.totalLines === 0) {
      console.log(`  B${bod} ${vl.name.padEnd(14)}: SKIPPED (no transfer lines)`);
      continue;
    }

    // Engine query (same as vendor-sample-presence-engine.ts)
    const engineQuery = `
SELECT
  v.k_sc_codigo_articulo AS ref,
  v.sc_detalle_articulo AS descr,
  mt.ss_talla,
  mt.ss_color,
  SUM(CASE WHEN mt.ka_nl_bodega_destino = ${bod} THEN mt.nd_cantidad ELSE 0 END) -
  SUM(CASE WHEN mt.ka_nl_bodega_origen = ${bod} THEN mt.nd_cantidad ELSE 0 END) AS net_qty
FROM movimientos_traslados mt
INNER JOIN MOVIMIENTOS m ON m.ka_nl_movimiento = mt.ka_nl_movimiento
LEFT JOIN v_articulos v ON v.ka_nl_articulo = mt.ka_nl_articulo
WHERE m.sc_anulado = 'N'
  AND (mt.ka_nl_bodega_destino = ${bod} OR mt.ka_nl_bodega_origen = ${bod})
GROUP BY v.k_sc_codigo_articulo, v.sc_detalle_articulo, mt.ss_talla, mt.ss_color
HAVING SUM(CASE WHEN mt.ka_nl_bodega_destino = ${bod} THEN mt.nd_cantidad ELSE 0 END) -
       SUM(CASE WHEN mt.ka_nl_bodega_origen = ${bod} THEN mt.nd_cantidad ELSE 0 END) > 0
    `.trim();

    try {
      const engineRows = await consultaSagJson(config, engineQuery);

      // Aggregate by ref (same as engine does)
      const engineRefs = new Map<string, number>();
      for (const row of engineRows) {
        const ref = String(row.ref ?? "").trim();
        if (!ref) continue;
        engineRefs.set(ref, (engineRefs.get(ref) ?? 0) + Number(row.net_qty));
      }

      // Ledger refs with netBalance > 0
      const ledgerPresent = new Set<string>();
      for (const [ref, balance] of vl.refs) {
        if (balance.netBalance > 0) ledgerPresent.add(ref);
      }

      const engineSet = new Set(engineRefs.keys());

      // Differences
      const inEngineNotLedger = [...engineSet].filter((r) => !ledgerPresent.has(r));
      const inLedgerNotEngine = [...ledgerPresent].filter((r) => !engineSet.has(r));

      console.log(
        `  B${bod} ${vl.name.padEnd(14)}: ` +
        `engine=${String(engineSet.size).padStart(3)} | ` +
        `ledger=${String(ledgerPresent.size).padStart(3)} | ` +
        `only_engine=${String(inEngineNotLedger.length).padStart(2)} | ` +
        `only_ledger=${String(inLedgerNotEngine.length).padStart(2)} | ` +
        (inEngineNotLedger.length === 0 && inLedgerNotEngine.length === 0 ? "MATCH" : "DIFF")
      );

      if (inEngineNotLedger.length > 0) {
        console.log(`    In engine but NOT in ledger: ${inEngineNotLedger.slice(0, 5).join(", ")}${inEngineNotLedger.length > 5 ? ` (+${inEngineNotLedger.length - 5} more)` : ""}`);
      }
      if (inLedgerNotEngine.length > 0) {
        console.log(`    In ledger but NOT in engine: ${inLedgerNotEngine.slice(0, 5).join(", ")}${inLedgerNotEngine.length > 5 ? ` (+${inLedgerNotEngine.length - 5} more)` : ""}`);
      }
    } catch (e) {
      console.error(`  B${bod} ENGINE QUERY ERROR: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 5: Devoluciones (returns)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("PHASE 5: DEVOLUCIONES (refs con entrada y salida completa)");
  console.log("-".repeat(90));

  for (const bod of VENDOR_BODEGAS) {
    const vl = vendorLedgers.get(bod)!;
    const returned: RefBalance[] = [];
    for (const balance of vl.refs.values()) {
      if (balance.entradas > 0 && balance.salidas > 0 && balance.netBalance === 0) {
        returned.push(balance);
      }
    }
    console.log(`  B${bod} ${vl.name.padEnd(14)}: ${returned.length} refs devueltas (entradas>0, salidas>0, net=0)`);
    if (returned.length > 0 && returned.length <= 10) {
      for (const r of returned.slice(0, 5)) {
        console.log(`    ${r.ref.padEnd(15)} IN=${r.entradas} OUT=${r.salidas} first=${r.primerMovimiento.slice(0, 10)} last=${r.ultimoMovimiento.slice(0, 10)}`);
      }
      if (returned.length > 5) console.log(`    ... +${returned.length - 5} more`);
    }
  }
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 6: Replacement patterns (same date, same vendor, one ref OUT + another IN)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("PHASE 6: REPLACEMENT PATTERNS");
  console.log("-".repeat(90));

  for (const bod of VENDOR_BODEGAS) {
    const lines = ledgerLines.filter((l) => l.vendorBodega === bod);
    if (lines.length === 0) continue;

    // Group by date+documento
    const byDateDoc = new Map<string, LedgerLine[]>();
    for (const line of lines) {
      const key = `${line.fecha.slice(0, 10)}|${line.documento}`;
      if (!byDateDoc.has(key)) byDateDoc.set(key, []);
      byDateDoc.get(key)!.push(line);
    }

    let replacementCount = 0;
    const replacementExamples: string[] = [];

    for (const [key, docLines] of byDateDoc) {
      const inRefs = docLines.filter((l) => l.direction === "IN").map((l) => l.ref);
      const outRefs = docLines.filter((l) => l.direction === "OUT").map((l) => l.ref);

      // Replacement pattern: same document has both IN and OUT for different refs
      if (inRefs.length > 0 && outRefs.length > 0) {
        const pureOuts = outRefs.filter((r) => !inRefs.includes(r));
        const pureIns = inRefs.filter((r) => !outRefs.includes(r));
        if (pureOuts.length > 0 && pureIns.length > 0) {
          replacementCount++;
          if (replacementExamples.length < 3) {
            replacementExamples.push(
              `    ${key}: OUT=[${pureOuts.slice(0, 3).join(",")}] IN=[${pureIns.slice(0, 3).join(",")}]`
            );
          }
        }
      }
    }

    console.log(`  B${bod} ${VENDOR_NAMES[bod].padEnd(14)}: ${replacementCount} documents with replacement pattern`);
    for (const ex of replacementExamples) console.log(ex);
  }
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 7: Double presences (netBalance > 1)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("PHASE 7: DOUBLE PRESENCES (netBalance > 1)");
  console.log("-".repeat(90));

  for (const bod of VENDOR_BODEGAS) {
    const vl = vendorLedgers.get(bod)!;
    const excess: RefBalance[] = [];
    for (const balance of vl.refs.values()) {
      if (balance.netBalance > 1) {
        excess.push(balance);
      }
    }

    if (excess.length === 0) {
      console.log(`  B${bod} ${vl.name.padEnd(14)}: 0 refs with netBalance > 1`);
    } else {
      console.log(`  B${bod} ${vl.name.padEnd(14)}: ${excess.length} refs with netBalance > 1`);
      for (const r of excess.sort((a, b) => b.netBalance - a.netBalance).slice(0, 10)) {
        console.log(
          `    ${r.ref.padEnd(15)} net=${String(r.netBalance).padStart(2)} IN=${r.entradas} OUT=${r.salidas} variants=${r.variants} "${r.descr.slice(0, 35)}"`
        );
      }
      if (excess.length > 10) console.log(`    ... +${excess.length - 10} more`);

      // Analyze: are these multiple talla/color variants?
      const multiVariant = excess.filter((r) => r.variants > 1).length;
      const singleVariant = excess.filter((r) => r.variants === 1).length;
      console.log(`    Analysis: ${multiVariant} multi-variant (multiple tallas/colors), ${singleVariant} single-variant (true duplicates)`);
    }
  }
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 8: Negatives (netBalance < 0)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("PHASE 8: NEGATIVE BALANCES (netBalance < 0)");
  console.log("-".repeat(90));

  for (const bod of VENDOR_BODEGAS) {
    const vl = vendorLedgers.get(bod)!;
    const negatives: RefBalance[] = [];
    for (const balance of vl.refs.values()) {
      if (balance.netBalance < 0) {
        negatives.push(balance);
      }
    }

    if (negatives.length === 0) {
      console.log(`  B${bod} ${vl.name.padEnd(14)}: 0 refs with netBalance < 0`);
    } else {
      console.log(`  B${bod} ${vl.name.padEnd(14)}: ${negatives.length} refs with netBalance < 0`);
      for (const r of negatives.sort((a, b) => a.netBalance - b.netBalance).slice(0, 10)) {
        console.log(
          `    ${r.ref.padEnd(15)} net=${String(r.netBalance).padStart(3)} IN=${r.entradas} OUT=${r.salidas} "${r.descr.slice(0, 35)}"`
        );
      }
      if (negatives.length > 10) console.log(`    ... +${negatives.length - 10} more`);

      // Classify: devolucion sin entrada previa (IN=0) vs salida excess (OUT > IN)
      const noEntry = negatives.filter((r) => r.entradas === 0).length;
      const excessOut = negatives.filter((r) => r.entradas > 0).length;
      console.log(`    Classification: ${noEntry} sin entrada previa, ${excessOut} salida > entrada`);
    }
  }
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 9: Antiquity analysis
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("PHASE 9: ANTIQUITY ANALYSIS");
  console.log("-".repeat(90));

  const now = new Date();

  for (const bod of VENDOR_BODEGAS) {
    const vl = vendorLedgers.get(bod)!;
    const present: RefBalance[] = [];
    for (const balance of vl.refs.values()) {
      if (balance.netBalance > 0) present.push(balance);
    }

    if (present.length === 0) {
      console.log(`  B${bod} ${vl.name.padEnd(14)}: No present refs`);
      continue;
    }

    // Calculate age in days from last inbound movement
    const withAge = present.map((r) => {
      const lastDate = new Date(r.ultimoMovimiento);
      const days = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      return { ...r, ageDays: days };
    });

    const sorted = withAge.sort((a, b) => b.ageDays - a.ageDays);
    const avgAge = Math.round(sorted.reduce((s, r) => s + r.ageDays, 0) / sorted.length);
    const oldest = sorted[0];
    const newest = sorted[sorted.length - 1];

    // Age distribution
    const under30 = sorted.filter((r) => r.ageDays < 30).length;
    const d30to90 = sorted.filter((r) => r.ageDays >= 30 && r.ageDays < 90).length;
    const d90to180 = sorted.filter((r) => r.ageDays >= 90 && r.ageDays < 180).length;
    const d180to365 = sorted.filter((r) => r.ageDays >= 180 && r.ageDays < 365).length;
    const over365 = sorted.filter((r) => r.ageDays >= 365).length;

    console.log(`  B${bod} ${vl.name.padEnd(14)}:`);
    console.log(`    Total present: ${present.length} refs`);
    console.log(`    Avg age: ${avgAge} days`);
    console.log(`    Oldest: ${oldest.ref} (${oldest.ageDays} days, last=${oldest.ultimoMovimiento.slice(0, 10)})`);
    console.log(`    Newest: ${newest.ref} (${newest.ageDays} days, last=${newest.ultimoMovimiento.slice(0, 10)})`);
    console.log(`    <30d: ${under30} | 30-90d: ${d30to90} | 90-180d: ${d90to180} | 180-365d: ${d180to365} | >365d: ${over365}`);
  }
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 10: Certified coverage table
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("PHASE 10: CERTIFIED COVERAGE TABLE");
  console.log("-".repeat(90));
  console.log();

  console.log(
    `  ${"Vendedor".padEnd(16)} ${"Bod".padStart(4)} ${"Present".padStart(8)} ${"Exceso".padStart(8)} ${"Negat".padStart(8)} ${"Devuelt".padStart(8)} ${"Ultimo Mov".padEnd(12)} ${"Confianza".padStart(10)}`
  );
  console.log(`  ${"-".repeat(86)}`);

  for (const bod of VENDOR_BODEGAS) {
    const vl = vendorLedgers.get(bod)!;

    // Returned = refs with entradas > 0, salidas > 0, net = 0
    let returned = 0;
    let lastMov = "";
    for (const balance of vl.refs.values()) {
      if (balance.entradas > 0 && balance.salidas > 0 && balance.netBalance === 0) returned++;
      if (!lastMov || balance.ultimoMovimiento > lastMov) lastMov = balance.ultimoMovimiento;
    }

    // Confidence = how reliable is this data?
    // Deductions: -5% per anomalia exceso, -10% per anomalia negativo, -2% if no recent activity
    const totalWithBalance = vl.presentes + vl.anomaliaExceso;
    let confidence = 100;
    if (totalWithBalance > 0) {
      confidence -= Math.min(vl.anomaliaExceso / totalWithBalance * 100 * 0.5, 25);
      confidence -= Math.min(vl.anomaliaNegativo * 10, 20);
    }

    // Check if last movement is recent (within 60 days)
    if (lastMov) {
      const daysSinceLastMov = Math.floor((now.getTime() - new Date(lastMov).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceLastMov > 180) confidence -= 10;
      else if (daysSinceLastMov > 90) confidence -= 5;
    }

    if (vl.totalLines === 0) confidence = 0; // no data at all

    confidence = Math.max(0, Math.round(confidence));

    console.log(
      `  ${vl.name.padEnd(16)} ${String(bod).padStart(4)} ${String(vl.presentes + vl.anomaliaExceso).padStart(8)} ${String(vl.anomaliaExceso).padStart(8)} ${String(vl.anomaliaNegativo).padStart(8)} ${String(returned).padStart(8)} ${(lastMov ? lastMov.slice(0, 10) : "\u2014").padEnd(12)} ${String(confidence + "%").padStart(10)}`
    );
  }

  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY STATISTICS
  // ═══════════════════════════════════════════════════════════════════════════

  console.log("=".repeat(90));
  console.log("SUMMARY STATISTICS");
  console.log("=".repeat(90));
  console.log();

  let totalPresent = 0, totalExcess = 0, totalNegative = 0, totalReturned = 0;
  for (const vl of vendorLedgers.values()) {
    totalPresent += vl.presentes + vl.anomaliaExceso;
    totalExcess += vl.anomaliaExceso;
    totalNegative += vl.anomaliaNegativo;
    for (const balance of vl.refs.values()) {
      if (balance.entradas > 0 && balance.salidas > 0 && balance.netBalance === 0) totalReturned++;
    }
  }

  console.log(`  Total refs with presence (net > 0): ${totalPresent}`);
  console.log(`  Total anomalia exceso (net > 1):    ${totalExcess}`);
  console.log(`  Total anomalia negativo (net < 0):  ${totalNegative}`);
  console.log(`  Total devueltas (net = 0):          ${totalReturned}`);
  console.log(`  Total ledger lines:                 ${ledgerLines.length}`);
  console.log();

  // Origin analysis — where do transfers come from?
  const originCounts = new Map<number, number>();
  for (const line of ledgerLines.filter((l) => l.direction === "IN")) {
    originCounts.set(line.bodegaOrigen, (originCounts.get(line.bodegaOrigen) ?? 0) + 1);
  }
  console.log("  Transfer origins (inbound to vendor bodegas):");
  for (const [orig, count] of [...originCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`    Bodega ${String(orig).padStart(3)}: ${count} lines`);
  }
  console.log();

  console.log("=".repeat(90));
  console.log("RECONCILIATION COMPLETE");
  console.log("=".repeat(90));
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
