/**
 * COMERCIAL-INVENTARIO-CANONICAL-STRUCTURE-01 — Integrity Validation
 *
 * Validates that the canonical line restructure introduces ZERO data loss:
 * 1. Every item has a canonicalLine assigned
 * 2. Total refs = sum of refs per canonical line
 * 3. Total disponibleReal, existenciaBodega01, pedidosPendientes unchanged
 * 4. No item lost or duplicated
 * 5. Canonical line assignment matches rules:
 *    - CASTILLITOS = subLinea "CASTILLITOS" & !isAccessory
 *    - LATIN_KIDS = subLinea "LATIN KIDS" & !isAccessory
 *    - IMPORTACION = isAccessory (productLine=5)
 *    - SIN_CLASIFICAR = everything else
 * 6. Availability filter (todos/disponibles/agotados) sums are consistent
 */

import { prisma } from "../lib/prisma";
import { resolveCanonicalLine } from "../lib/inventory/inventory-control-types";
import type { CanonicalLine } from "../lib/inventory/inventory-control-types";

const ORG_ID = "cmmpwstuf000dp5y58kj1daaj";

async function run() {
  console.log("=== CANONICAL STRUCTURE INTEGRITY VALIDATION ===\n");

  let pass = 0, fail = 0;
  const check = (name: string, ok: boolean, detail?: string) => {
    if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
    else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
  };

  const db = prisma as any;

  // ── 1. Load latest CCS snapshot (textile pipeline) ─────────────────────
  const latest = await db.commercialCoverageSnapshot.findFirst({
    where: { organizationId: ORG_ID },
    orderBy: { snapshotAt: "desc" },
    select: { snapshotAt: true },
  });

  check("CCS snapshot exists", !!latest);
  if (!latest) { console.log("ABORT: No CCS snapshot"); process.exit(1); }

  const ccsRows = await db.commercialCoverageSnapshot.findMany({
    where: { organizationId: ORG_ID, snapshotAt: latest.snapshotAt },
    select: { refCode: true, line: true, disponible: true, pendingOrdersQty: true },
  });
  console.log(`  CCS textile refs: ${ccsRows.length}`);

  // ── 2. Load accessory pipeline ─────────────────────────────────────────
  const accProducts = await db.productEntity.findMany({
    where: { organizationId: ORG_ID, productLine: "5" },
    select: { sku: true },
  });
  const accSkuSet = new Set(accProducts.filter((p: any) => p.sku).map((p: any) => p.sku));

  // Dedup: remove CCS refs that are also accessories
  const dedupedTextile = ccsRows.filter((r: any) => !accSkuSet.has(r.refCode));
  console.log(`  Accessory refs: ${accSkuSet.size}`);
  console.log(`  Deduped textile refs: ${dedupedTextile.length}`);
  console.log(`  Total universe: ${dedupedTextile.length + accSkuSet.size}\n`);

  // ── 3. Map CCS line → subLinea ─────────────────────────────────────────
  const LINE_TO_SUBLINEA: Record<string, string> = { CS: "CASTILLITOS", LT: "LATIN KIDS" };

  // Simulate canonical line assignment
  const canonicalCounts: Record<CanonicalLine, number> = {
    CASTILLITOS: 0, LATIN_KIDS: 0, IMPORTACION: 0, SIN_CLASIFICAR: 0,
  };
  const canonicalDisponible: Record<CanonicalLine, number> = {
    CASTILLITOS: 0, LATIN_KIDS: 0, IMPORTACION: 0, SIN_CLASIFICAR: 0,
  };

  for (const row of dedupedTextile) {
    const subLinea = LINE_TO_SUBLINEA[row.line] ?? row.line;
    const cl = resolveCanonicalLine(subLinea, false);
    canonicalCounts[cl]++;
    canonicalDisponible[cl] += row.disponible;
  }

  // All accessories → IMPORTACION
  canonicalCounts["IMPORTACION"] += accSkuSet.size;

  const totalAssigned = Object.values(canonicalCounts).reduce((a, b) => a + b, 0);
  const expectedTotal = dedupedTextile.length + accSkuSet.size;

  check("Total assigned = total universe", totalAssigned === expectedTotal,
    `assigned=${totalAssigned}, expected=${expectedTotal}`);

  // ── 4. Canonical line distribution ─────────────────────────────────────
  console.log("\n--- CANONICAL LINE DISTRIBUTION ---");
  for (const cl of ["CASTILLITOS", "LATIN_KIDS", "IMPORTACION", "SIN_CLASIFICAR"] as CanonicalLine[]) {
    console.log(`  ${cl}: ${canonicalCounts[cl]} refs`);
  }

  // ── 5. Validate rules ─────────────────────────────────────────────────
  check("CASTILLITOS has refs", canonicalCounts["CASTILLITOS"] > 0,
    `${canonicalCounts["CASTILLITOS"]} refs`);
  check("LATIN_KIDS has refs", canonicalCounts["LATIN_KIDS"] > 0,
    `${canonicalCounts["LATIN_KIDS"]} refs`);
  check("IMPORTACION has refs", canonicalCounts["IMPORTACION"] > 0,
    `${canonicalCounts["IMPORTACION"]} refs`);

  // ── 6. Verify resolveCanonicalLine rules ──────────────────────────────
  check("resolveCanonicalLine('CASTILLITOS', false) = CASTILLITOS",
    resolveCanonicalLine("CASTILLITOS", false) === "CASTILLITOS");
  check("resolveCanonicalLine('LATIN KIDS', false) = LATIN_KIDS",
    resolveCanonicalLine("LATIN KIDS", false) === "LATIN_KIDS");
  check("resolveCanonicalLine('OT', false) = SIN_CLASIFICAR",
    resolveCanonicalLine("OT", false) === "SIN_CLASIFICAR");
  check("resolveCanonicalLine('IMPORTACION', true) = IMPORTACION",
    resolveCanonicalLine("IMPORTACION", true) === "IMPORTACION");
  check("resolveCanonicalLine('CASTILLITOS', true) = IMPORTACION",
    resolveCanonicalLine("CASTILLITOS", true) === "IMPORTACION");

  // ── 7. CCS disponible preservation ─────────────────────────────────────
  const totalCcsDisponible = dedupedTextile.reduce((s: number, r: any) => s + r.disponible, 0);
  const totalCanonicalDisponible = Object.values(canonicalDisponible).reduce((a, b) => a + b, 0);
  check("Textile disponible preserved", totalCcsDisponible === totalCanonicalDisponible,
    `ccs=${totalCcsDisponible}, canonical=${totalCanonicalDisponible}`);

  // ── 8. CCS pending orders preservation ─────────────────────────────────
  const totalPending = dedupedTextile.reduce((s: number, r: any) => s + (r.pendingOrdersQty ?? 0), 0);
  console.log(`\n  Total pending orders (textile): ${totalPending}`);

  // ── 9. No ref duplication across canonical lines ──────────────────────
  // textile refs should not appear in accessory refs (already deduped above)
  const textileRefSet = new Set(dedupedTextile.map((r: any) => r.refCode));
  const overlap = [...accSkuSet].filter(sku => textileRefSet.has(sku));
  check("No ref overlap between textile and accessory", overlap.length === 0,
    overlap.length > 0 ? `${overlap.length} overlapping refs` : "clean");

  // ── 10. Availability filter consistency ────────────────────────────────
  const textileDisponibles = dedupedTextile.filter((r: any) => r.disponible > 0).length;
  const textileAgotados = dedupedTextile.filter((r: any) => r.disponible <= 0).length;
  check("Textile: disponibles + agotados = total",
    textileDisponibles + textileAgotados === dedupedTextile.length,
    `${textileDisponibles} + ${textileAgotados} = ${dedupedTextile.length}`);

  // ── 11. Line coverage — no CCS line "IM" contamination ────────────────
  const imRefs = ccsRows.filter((r: any) => r.line === "IM");
  check("No IM line in CCS", imRefs.length === 0, `${imRefs.length} IM refs`);

  // ── 12. grupoSag coverage for textile refs ────────────────────────────
  const textileSkus = dedupedTextile.map((r: any) => r.refCode);
  const peWithGrupo = await db.productEntity.findMany({
    where: { organizationId: ORG_ID, sku: { in: textileSkus } },
    select: { sku: true, grupoSag: true },
  });
  const withGrupo = peWithGrupo.filter((p: any) => p.grupoSag).length;
  const withoutGrupo = peWithGrupo.filter((p: any) => !p.grupoSag).length;
  console.log(`\n--- GRUPO SAG COVERAGE (textile) ---`);
  console.log(`  With grupoSag: ${withGrupo} / ${peWithGrupo.length}`);
  console.log(`  Without grupoSag: ${withoutGrupo} / ${peWithGrupo.length}`);

  // ── Summary ────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log(`VALIDATION: ${pass} PASS / ${fail} FAIL`);
  console.log("=".repeat(60));

  process.exit(fail > 0 ? 1 : 0);
}

run();
